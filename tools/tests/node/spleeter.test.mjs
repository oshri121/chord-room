// AI stem separation DSP (tools/ai-worker/spleeter.js, bundled into ai/worker.js) without the model:
//  * the real FFT matches a naive DFT and inverts exactly
//  * separate() with a fake "model" (est_j = |X|·c_j → masks c_j²/Σc²) gives each stem = mix · c_j²/Σc² sample-exactly:
//    STFT/iSTFT reconstruction, segment cross-fades, the top-band mask extension and the streamed blocks are all lossless,
//    the blocks cover [0, n) exactly once, and "other" = mix − vocals − drums − bass
//  * ai/model/spman.json lists only files that exist, each < 25 MiB (Cloudflare Pages), and no Demucs parts are left
import { REPO } from './repo.mjs';
import fs from 'node:fs';
const { rfft, irfftMasked, separate, N, NB } = await import(REPO + '/tools/ai-worker/spleeter.js');

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(64), String(info).slice(0, 120)); };

const x = new Float64Array(N); for (let i = 0; i < N; i++) x[i] = Math.sin(i * 0.37) + 0.3 * Math.cos(i * 1.91) + (i % 7) / 10;
const Xr = new Float32Array(NB), Xi = new Float32Array(NB); rfft(x, Xr, Xi, 0);
let err = 0, ref = 0;
for (const k of [0, 1, 5, 100, 1023, 2047, 2048]) { let r = 0, im = 0; for (let n = 0; n < N; n++) { r += x[n] * Math.cos(2 * Math.PI * k * n / N); im -= x[n] * Math.sin(2 * Math.PI * k * n / N); } err += (r - Xr[k]) ** 2 + (im - Xi[k]) ** 2; ref += r * r + im * im; }
check('rfft = DFT', Math.sqrt(err / ref) < 1e-6, Math.sqrt(err / ref));
const one = new Float32Array(NB).fill(1), y = new Float64Array(N); irfftMasked(Xr, Xi, 0, one, 0, y);
let e2 = 0; for (let i = 0; i < N; i++) e2 = Math.max(e2, Math.abs(y[i] - x[i]));
check('irfft(rfft(x)) = x', e2 < 1e-5, e2);

for (const [n, F] of [[1000, 1536], [44100 * 3, 1024], [44100 * 26 + 17, 1536]]) {
  const L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = Math.sin(i * 0.01) * 0.5 + ((i * 7919) % 1000) / 1e4; R[i] = Math.cos(i * 0.003) * 0.4; }
  const c = [1, 2, 3, 4], den = c.reduce((s, v) => s + v * v, 0);
  const model = async (mag, T, FF) => { const o = new Float32Array(8 * T * FF); for (let j = 0; j < 4; j++) for (let ch = 0; ch < 2; ch++) for (let i = 0; i < T * FF; i++) o[(j * 2 + ch) * T * FF + i] = mag[ch * T * FF + i] * c[j]; return o; };
  const out = Array.from({ length: 8 }, () => new Float32Array(n)), cov = new Uint8Array(n); let blocks = 0, last = -1, mono = true;
  await separate(L, R, n, model, { F, overlap: 0.25, onProgress: i => { if (i < last) mono = false; last = i; },
    onBlock: (off, len, res) => { blocks++; for (let j = 0; j < 8; j++) out[j].set(res[j], off); for (let i = off; i < off + len; i++) cov[i]++; } });
  let me = 0; for (let j = 0; j < 4; j++) for (let ch = 0; ch < 2; ch++) { const src = ch ? R : L, g = c[j] * c[j] / den; for (let i = 0; i < n; i++) me = Math.max(me, Math.abs(out[j * 2 + ch][i] - src[i] * g)); }
  let gaps = 0; for (let i = 0; i < n; i++) if (cov[i] !== 1) gaps++;
  check(`n=${n} F=${F}: blocks cover every sample once`, gaps === 0, `${blocks} blocks`);
  check(`n=${n} F=${F}: stems = mix · mask (perfect reconstruction)`, me < 1e-5, me);
  check(`n=${n} F=${F}: progress monotonic`, mono);
}

const man = JSON.parse(fs.readFileSync(REPO + '/ai/model/spman.json', 'utf8'));
const files = [...man.files.ort, ...man.files.graph, ...man.files.w];
let size = 0, big = [];
for (const f of files) { const st = fs.statSync(REPO + '/' + f); size += st.size; if (st.size >= 25 * 1024 * 1024) big.push(f); }
check('spman.json files exist, each < 25 MiB', big.length === 0, files.join(' '));
check('spman.json bytes = the files\' total size', size === man.bytes, `${size} vs ${man.bytes}`);
check('stems order = the app\'s (vocals, drums, bass, other)', JSON.stringify(man.stems) === '["vocals","drums","bass","other"]', man.stems);
const left = fs.readdirSync(REPO + '/ai/model').filter(f => !files.includes('ai/model/' + f) && f !== 'spman.json');
check('no other files (old Demucs parts) in ai/model', left.length === 0, left);

console.log(`\n${ok} ok, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
