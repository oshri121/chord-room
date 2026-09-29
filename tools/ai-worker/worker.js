import * as ort from 'onnxruntime-web/webgpu';
import { applyInference, TensorChunk } from './lib/apply.js';

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

/* Streaming separation: the song stays in the worker once (planar [L…,R…]), the model runs on 7.8 s
   segments, and every finished stride of the 4 stems is posted to the page at once and freed here.
   Peak memory ≈ the song (2n floats) + a few segments, instead of ~10× the song like the original
   applySplits (which kept all stems for the whole song twice). Phones survive 4–6-minute songs this way. */
async function run(msg) {
  const LR = msg.LR, n = msg.n, L = LR.subarray(0, n), R = LR.subarray(n, 2 * n);
  // Demucs normalisation: centre and scale by the mono reference, undone on the way out
  let mean = 0; for (let i = 0; i < n; i++) mean += (L[i] + R[i]) * 0.5; mean /= n;
  let v = 0; for (let i = 0; i < n; i++) { const d = (L[i] + R[i]) * 0.5 - mean; v += d * d; }
  const std = Math.sqrt(v / n) || 1;
  for (let i = 0; i < 2 * n; i++) LR[i] = (LR[i] - mean) / std;
  const mix = { data: LR, shape: [1, 2, n] };
  const overlap = Math.min(0.5, Math.max(0.05, msg.overlap ?? 0.25));
  const segment = Math.floor(model.samplerate * model.segment), stride = Math.floor((1 - overlap) * segment);
  const weight = new Float32Array(segment), half = Math.floor(segment / 2) + 1;
  for (let i = 0; i < half; i++) weight[i] = i + 1;
  for (let i = half; i < segment; i++) weight[i] = segment - i;
  const wmax = Math.max(half, segment - half); for (let i = 0; i < segment; i++) weight[i] /= wmax;
  const S = 4, C = 2, K = S * C, ORDER = [6, 7, 0, 1, 2, 3, 4, 5]; // model order drums,bass,other,vocals → app order vocals,drums,bass,other (L,R each)
  const acc = Array.from({ length: K }, () => new Float32Array(segment)), wsum = new Float32Array(segment);
  const total = Math.ceil(n / stride), t0 = performance.now();
  post({ type: 'p', i: 0, tot: total, el: 0 });
  let offset = 0, k = 0;
  while (offset < n) {
    if (k > 0) { // slide the accumulation window forward by one stride
      for (const a of acc) { a.copyWithin(0, stride); a.fill(0, segment - stride); }
      wsum.copyWithin(0, stride); wsum.fill(0, segment - stride);
    }
    const chunk = new TensorChunk(mix, offset, segment);
    const out = await applyInference(model, chunk), len = out.shape[out.shape.length - 1], od = out.data;
    for (let j = 0; j < K; j++) { const a = acc[j], base = j * len; for (let t = 0; t < len; t++) a[t] += weight[t] * od[base + t]; }
    for (let t = 0; t < len; t++) wsum[t] += weight[t];
    // samples [offset, offset+stride) get no more contributions → normalise, de-normalise and ship them
    const blen = Math.min(stride, n - offset), res = [];
    for (const j of ORDER) { const a = acc[j], o = new Float32Array(blen); for (let t = 0; t < blen; t++) o[t] = (a[t] / (wsum[t] || 1)) * std + mean * 0.25; res.push(o); }
    post({ type: 'blk', off: offset, len: blen, res }, res.map(a => a.buffer));
    offset += stride; k++;
    post({ type: 'p', i: k, tot: total, el: (performance.now() - t0) / 1000 });
  }
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
