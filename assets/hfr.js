/*
 * HFR — high-frequency check & restoration for lossy files (window.HFR). Pure DSP, no DOM; used by the Converter.
 *
 * analyze(chs, sr) → { cutoff: Hz | null, full: bool, est: '96'|'128'|'160'|'192'|'256'|null, spec: dB[] (0…nyq, SPEC_N points) }
 *   Average power spectrum of up to 48 loud frames (FFT 4096, Hann). A lossy encoder's lowpass is a brick wall: the level
 *   falls by ≥ 18 dB within ~1 kHz and stays down up to Nyquist. A naturally dark mix rolls off gradually and is NOT
 *   reported as cut. Cutoffs at/above 19.6 kHz count as full range (that is where good encoders put their lowpass).
 *
 * restore(chs, sr, cutoff, {amount, onProgress, signal}) → Promise<chs>
 *   Spectral band replication: the band just below the cutoff is shifted up (single-sideband, integer-bin shift in an STFT,
 *   N = 2048, hop N/4, Hann/Hann, phase advanced per frame so the shift is a true frequency translation) into the empty
 *   band, as many patches as needed, up to min(20 kHz, Nyquist − 500 Hz). Each patch is scaled by the slope of the
 *   source spectrum extrapolated over the shift (clamped −3…−18 dB/oct), a soft ramp at the start and a fade at the top.
 *   Only the ADDED signal is synthesised: output = original + added, so everything below the cutoff stays bit-identical
 *   (until the caller normalises). The source frame's own dynamics carry over, so hi-hats and transients keep their timing.
 *   It cannot recover the original highs; it rebuilds plausible "air" from the harmonics that survived.
 */
(function () {
'use strict';
const SPEC_N = 160;

/* ---------- FFT (iterative radix-2, in place, complex) ---------- */
const TABLES = {};
function tables(n) {
  if (TABLES[n]) return TABLES[n];
  const rev = new Uint32Array(n), bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
  const hann = new Float64Array(n);
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);   // periodic: sums cleanly at hop n/4
  return (TABLES[n] = { rev, cos, sin, hann });
}
// inverse when inv = true (no 1/n scaling here)
function fft(re, im, inv) {
  const n = re.length, T = tables(n), rev = T.rev;
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = T.cos[k], wi = inv ? T.sin[k] : -T.sin[k];
        const a = i + j, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

/* ---------- analysis ---------- */
function analyze(chs, sr) {
  const N = 4096, T = tables(N), len = chs[0].length, nyq = sr / 2;
  const bins = N / 2, pw = new Float64Array(bins);
  if (len < N) return { cutoff: null, full: true, est: null, spec: [] };
  // candidate frames: up to 400 evenly spaced; keep the 48 loudest (silence and fades would only lower the average)
  const cand = Math.min(400, Math.floor((len - N) / (N / 2)) + 1), stride = (len - N) / Math.max(1, cand - 1), lv = [];
  for (let c = 0; c < cand; c++) {
    const p = Math.round(c * stride); let e = 0;
    for (const x of chs) for (let i = p; i < p + N; i += 8) e += x[i] * x[i];
    lv.push([e, p]);
  }
  lv.sort((a, b) => b[0] - a[0]);
  const use = lv.slice(0, Math.min(48, lv.length)).filter(v => v[0] > 1e-7);
  if (!use.length) return { cutoff: null, full: true, est: null, spec: [] };
  const re = new Float64Array(N), im = new Float64Array(N);
  for (const [, p] of use) for (const x of chs) {
    for (let i = 0; i < N; i++) { re[i] = x[p + i] * T.hann[i]; im[i] = 0; }
    fft(re, im, false);
    for (let k = 0; k < bins; k++) pw[k] += re[k] * re[k] + im[k] * im[k];
  }
  const db = new Float64Array(bins);
  for (let k = 0; k < bins; k++) db[k] = 10 * Math.log10(pw[k] / (use.length * chs.length) + 1e-20);
  // smooth ±4 bins
  const S = new Float64Array(bins);
  for (let k = 0; k < bins; k++) { let s = 0, c = 0; for (let j = Math.max(0, k - 4); j <= Math.min(bins - 1, k + 4); j++) { s += db[j]; c++; } S[k] = s / c; }
  const hz = bins / nyq, bin = f => Math.max(0, Math.min(bins - 1, Math.round(f * hz)));
  const mean = (a, b) => { let s = 0, c = 0; for (let k = bin(a); k <= bin(b); k++) { s += S[k]; c++; } return c ? s / c : -200; };
  const maxIn = (a, b) => { let m = -1e9; for (let k = bin(a); k <= bin(b); k++) m = Math.max(m, S[k]); return m; };
  let best = 0, bestF = 0;
  for (let f = 10000; f <= nyq - 1000; f += 1 / hz) {
    const A = mean(f - 800, f - 100), B = mean(f + 100, f + 900), d = A - B;
    if (d > best && A - maxIn(f + 100, nyq - 200) > 12) { best = d; bestF = f; }
  }
  let cutoff = null;
  if (best >= 18) {
    // refine: the first bin past the edge that is 10 dB under the level just below it
    const A = mean(bestF - 800, bestF - 100);
    let k = bin(bestF - 500); while (k < bins - 1 && S[k] > A - 10) k++;
    cutoff = Math.round(k / hz / 10) * 10;
  }
  const full = !cutoff || cutoff >= 19600;
  const est = full ? null : cutoff < 15500 ? '96' : cutoff < 17200 ? '128' : cutoff < 18200 ? '160' : cutoff < 19300 ? '192' : '256';
  // display spectrum: SPEC_N points 0…min(nyq, 22 kHz), max-normalised to 0 dB
  const top = Math.min(nyq, 22050), spec = [];
  let mx = -1e9; for (let k = bin(200); k < bins; k++) mx = Math.max(mx, S[k]);
  for (let i = 0; i < SPEC_N; i++) { const f = (i + 0.5) / SPEC_N * top; spec.push(Math.max(-90, Math.round((mean(f - top / SPEC_N / 2, f + top / SPEC_N / 2) - mx) * 10) / 10)); }
  return { cutoff: full ? null : cutoff, full, est, spec, top };
}

/* ---------- restoration ---------- */
const AMT = { 1: 0.5, 2: 0.8, 3: 1.1 };                      // linear gain on the extrapolated envelope (≈ −6 / −2 / +1 dB)
async function restore(chs, sr, cutoff, opt) {
  opt = opt || {};
  const nyq = sr / 2, top = Math.min(20000, nyq - 500);
  if (!cutoff || cutoff >= top - 300) return chs;
  const N = 2048, H = N / 4, T = tables(N), hz = N / sr, bins = N / 2;
  const kc = Math.round(cutoff * hz), kTop = Math.round(top * hz);
  const W = Math.max(Math.round(1500 * hz), Math.min(kc - Math.round(2000 * hz), kTop - kc, Math.round(kc / 2)));   // patch width (bins)
  const ks0 = kc - W;                                         // source band [ks0, kc)
  // spectral slope below the cutoff (dB/oct), from the whole file's average: fit over [cutoff/4, cutoff)
  const slope = slopeOf(chs, sr, cutoff);
  const g = AMT[opt.amount] || AMT[2];
  // patches: shift D = W, 2W, … until the top is covered; per target bin: gain from the slope over log2(ft/fs)
  const patches = [];
  for (let D = W; kc + (patches.length) * W < kTop; D += W) {
    const t0 = kc + patches.length * W, t1 = Math.min(kTop, t0 + W);
    const gain = new Float64Array(t1 - t0);
    for (let kt = t0; kt < t1; kt++) {
      const ks = kt - D, ft = kt / hz, fs = Math.max(1, ks / hz);
      let gdb = slope * Math.log2(ft / fs);
      const ramp = Math.min(1, (kt - kc + 1) / Math.max(1, Math.round(250 * hz)));            // soft start at the cutoff
      const fade = Math.min(1, (kTop - kt) / Math.max(1, Math.round(1200 * hz)));             // fade towards the top
      gain[kt - t0] = g * Math.pow(10, gdb / 20) * ramp * (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, fade)));
    }
    patches.push({ D, t0, t1, gain });
    if (patches.length > 6) break;
  }
  const len = chs[0].length, frames = Math.ceil((len + N) / H), out = [];
  const re = new Float64Array(N), im = new Float64Array(N), yr = new Float64Array(N), yi = new Float64Array(N);
  const norm = 1 / (1.5 * N);                                 // Hann·Hann at hop N/4 sums to 1.5; ifft has no 1/N
  let done = 0; const total = frames * chs.length;
  for (const x of chs) {
    const add = new Float32Array(len);
    for (let m = 0; m < frames; m++) {
      const p = m * H - N;                                    // frames start before 0 so the first samples are covered
      for (let i = 0; i < N; i++) { const q = p + i; re[i] = q >= 0 && q < len ? x[q] * T.hann[i] : 0; im[i] = 0; }
      fft(re, im, false);
      yr.fill(0); yi.fill(0);
      for (const P of patches) {
        // phase advance of a shift by D bins at frame m with hop N/4: e^{iπ/2·D·m}
        const ph = ((P.D * m) % 4 + 4) % 4, cr = [1, 0, -1, 0][ph], ci = [0, 1, 0, -1][ph];
        for (let kt = P.t0; kt < P.t1; kt++) {
          const ks = kt - P.D; if (ks < Math.max(1, ks0 - W * 6)) continue;
          const a = re[ks], b = im[ks], gg = P.gain[kt - P.t0];
          yr[kt] += (a * cr - b * ci) * gg; yi[kt] += (a * ci + b * cr) * gg;
        }
      }
      for (let k = 1; k < bins; k++) { yr[N - k] = yr[k]; yi[N - k] = -yi[k]; }   // real signal: conjugate-symmetric
      yr[0] = yi[0] = yr[bins] = yi[bins] = 0;
      fft(yr, yi, true);
      for (let i = 0; i < N; i++) { const q = p + i; if (q >= 0 && q < len) add[q] += yr[i] * T.hann[i] * norm; }
      if (++done % 300 === 0) {
        if (opt.onProgress) opt.onProgress(done / total);
        await new Promise(r => setTimeout(r, 0));
        if (opt.signal && opt.signal.aborted) { const e = new Error('aborted'); e.aborted = true; throw e; }
      }
    }
    const y = new Float32Array(len);
    for (let i = 0; i < len; i++) y[i] = x[i] + add[i];
    out.push(y);
  }
  // never let the added air push the file over full scale
  let pk = 0; for (const y of out) for (let i = 0; i < y.length; i++) { const a = Math.abs(y[i]); if (a > pk) pk = a; }
  if (pk > 0.999) { const s = 0.999 / pk; for (const y of out) for (let i = 0; i < y.length; i++) y[i] *= s; }
  if (opt.onProgress) opt.onProgress(1);
  return out;
}
// least-squares slope of the average spectrum (dB per octave) over [cutoff/4, cutoff − 300 Hz], clamped −18…−3
function slopeOf(chs, sr, cutoff) {
  const a = analyze(chs, sr); if (!a.spec || !a.spec.length) return -9;
  const top = a.top, n = a.spec.length; let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n * top; if (f < cutoff / 4 || f > cutoff - 300) continue;
    const x = Math.log2(f), y = a.spec[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; c++;
  }
  if (c < 4) return -9;
  const s = (c * sxy - sx * sy) / (c * sxx - sx * sx);
  return Math.max(-18, Math.min(-3, isFinite(s) ? s : -9));
}

window.HFR = { analyze, restore, _fft: fft, _slope: slopeOf, AMT, SPEC_N };
})();
