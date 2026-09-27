import * as ort from 'onnxruntime-web/webgpu';
import { separateTracks } from './lib/apply.js';

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
  try { cache = await caches.open('chordroom-ai-v1'); } catch (e) {}
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

const model = {
  sources: ['drums', 'bass', 'other', 'vocals'],
  samplerate: 44100, segment: 7.8,
  validLength(len) { const t = Math.floor(this.segment * this.samplerate); if (t < len) throw new Error('segment too long'); return t; },
  async forward(mix, magspec) {
    const feeds = {};
    feeds[session.inputNames[0]] = new ort.Tensor('float32', mix.data, mix.shape);
    feeds[session.inputNames[1]] = new ort.Tensor('float32', magspec.data, magspec.shape);
    const r = await session.run(feeds);
    const a = r[session.outputNames[0]], b = r[session.outputNames[1]];
    const out = { outX: { data: a.data, shape: a.dims }, outXt: { data: b.data, shape: b.dims } };
    return out;
  }
};

async function run(msg) {
  const L = msg.L, R = msg.R, n = L.length;
  // Demucs normalisation: centre and scale by the mono reference, undone afterwards
  let mean = 0; for (let i = 0; i < n; i++) mean += (L[i] + R[i]) * 0.5; mean /= n;
  let v = 0; for (let i = 0; i < n; i++) { const d = (L[i] + R[i]) * 0.5 - mean; v += d * d; }
  const std = Math.sqrt(v / n) || 1;
  for (let i = 0; i < n; i++) { L[i] = (L[i] - mean) / std; R[i] = (R[i] - mean) / std; }
  const t0 = performance.now();
  const tracks = await separateTracks(model, { channelData: [L, R], sampleRate: 44100 }, (i, tot) => {
    post({ type: 'p', i, tot, el: (performance.now() - t0) / 1000 });
  }, msg.overlap ?? 0.25);
  const res = [];
  for (const s of ['vocals', 'drums', 'bass', 'other']) {
    for (const ch of tracks[s].channelData) {
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) o[i] = ch[i] * std + mean * 0.25;
      res.push(o);
    }
  }
  post({ type: 'done', res }, res.map(a => a.buffer));
}

self.onmessage = async e => {
  try {
    if (e.data.type === 'init') await init(e.data);
    else if (e.data.type === 'run') await run(e.data);
  } catch (err) {
    post({ type: 'error', message: String(err && err.message || err) });
  }
};
