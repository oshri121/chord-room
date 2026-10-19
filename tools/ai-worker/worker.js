import * as ort from 'onnxruntime-web/webgpu';
import { separate } from './spleeter.js';

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';
let session = null, ep = '';
const post = (o, t) => self.postMessage(o, t || []);

const B64 = (() => { const t = new Uint8Array(256); const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (let i = 0; i < 64; i++) t[a.charCodeAt(i)] = i; return t; })();
function b64decode(src) {
  let n = src.length; while (n && (src[n - 1] === 61 || src[n - 1] < 43)) n--;
  const out = new Uint8Array(Math.floor(n * 3 / 4)); let o = 0, i = 0;
  for (; i + 4 <= n; i += 4) { const v = (B64[src[i]] << 18) | (B64[src[i + 1]] << 12) | (B64[src[i + 2]] << 6) | B64[src[i + 3]]; out[o++] = v >> 16; out[o++] = (v >> 8) & 255; out[o++] = v & 255; }
  const r = n - i;
  if (r === 2) { const v = (B64[src[i]] << 18) | (B64[src[i + 1]] << 12); out[o++] = v >> 16; }
  else if (r === 3) { const v = (B64[src[i]] << 18) | (B64[src[i + 1]] << 12) | (B64[src[i + 2]] << 6); out[o++] = v >> 16; out[o++] = (v >> 8) & 255; }
  return out.subarray(0, o);
}
async function fetchAll(urls, onBytes) {
  let cache = null;
  try { caches.delete('chordroom-ai-v1').catch(() => {}); cache = await caches.open('chordroom-ai-v2'); } catch (e) {}   // v1 = the old Demucs parts (~79 MB): freed
  const parts = []; let total = 0;
  for (const u of urls) {
    let res = null;
    if (cache) { try { res = await cache.match(u); } catch (e) {} }
    if (!res) {
      res = await fetch(u);
      if (!res.ok) throw new Error('download ' + res.status);
      if (cache) { try { await cache.put(u, res.clone()); } catch (e) {} }
    }
    const rd = res.body.getReader(), bufs = []; let len = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; bufs.push(value); len += value.length; onBytes(value.length); }
    const txt = new Uint8Array(len); let o = 0; for (const b of bufs) { txt.set(b, o); o += b.length; }
    const bin = /\.txt(\?|$)/.test(u) ? b64decode(txt) : txt; parts.push(bin); total += bin.length;
  }
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function gunzip(u8) {
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function f16lut() {
  const lut = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, m = h & 1023;
    lut[h] = e === 0 ? s * m * Math.pow(2, -24) : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * Math.pow(2, e - 15);
  }
  return lut;
}

async function init(msg) {
  const { files, man, bytes } = msg;
  let got = 0;
  const onBytes = n => { got += n; post({ type: 'dl', p: Math.min(1, got / bytes) }); };
  const wasm = await gunzip(await fetchAll(files.ort, onBytes));
  ort.env.wasm.wasmBinary = wasm.buffer;
  self.__ortBase = msg.base;
  const graph = await gunzip(await fetchAll(files.graph, onBytes));
  const packed = await gunzip(await fetchAll(files.w, onBytes));
  post({ type: 'stage', s: 'prep' });
  const half = packed.length >> 1, hi = packed.subarray(0, half), lo = packed.subarray(half);
  const lut = f16lut(), data = new Float32Array(man.total / 4);
  for (const [off, n, po] of man.segs) {
    const d = off / 4, k0 = po / 2;
    for (let i = 0; i < n; i++) { const k = k0 + i; data[d + i] = lut[(hi[k] << 8) | lo[k]]; }
  }
  const externalData = [{ path: 'w.data', data: new Uint8Array(data.buffer) }];
  const tries = [];
  if (msg.gpu !== false && self.navigator && navigator.gpu) tries.push('webgpu');
  tries.push('wasm');
  let lastErr = null;
  for (const t of tries) {
    try {
      post({ type: 'stage', s: 'session', ep: t });
      session = await ort.InferenceSession.create(graph, { executionProviders: [t], externalData, graphOptimizationLevel: 'all' });
      ep = t; break;
    } catch (e) { lastErr = e; session = null; post({ type: 'stage', s: 'fail', ep: t, msg: String(e && e.message || e) }); }
  }
  if (!session) throw lastErr || new Error('no backend');
  post({ type: 'ready', ep });
}

/* Spleeter (Deezer, MIT): the STFT / masks / iSTFT and the segment streaming live in spleeter.js; ONNX Runtime only runs
   the four U-Nets on one segment's magnitude spectrogram at a time. Output order = the app's STEMS order:
   vocals, drums, bass, other (L, R each). */
async function forward(mag, T, F) {
  const feeds = {}; feeds[session.inputNames[0]] = new ort.Tensor('float32', mag, [1, 2, T, F]);
  const r = await session.run(feeds), t = r[session.outputNames[0]];
  return t.data;
}
async function run(msg) {
  const LR = msg.LR, n = msg.n, L = LR.subarray(0, n), R = LR.subarray(n, 2 * n), t0 = performance.now();
  await separate(L, R, n, forward, {
    T: 512, F: msg.F || 1536, overlap: msg.overlap ?? 0.25,
    onBlock: (off, len, res) => post({ type: 'blk', off, len, res }, res.map(a => a.buffer)),
    onProgress: (i, tot) => post({ type: 'p', i, tot, el: (performance.now() - t0) / 1000 })
  });
  post({ type: 'done' });
}

self.onmessage = async e => {
  try {
    if (e.data.type === 'init') await init(e.data);
    else if (e.data.type === 'run') await run(e.data);
  } catch (err) {
    post({ type: 'error', message: String(err && err.message || err) });
  }
};
