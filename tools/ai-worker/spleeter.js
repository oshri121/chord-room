/* Spleeter 4-stem separation around the ONNX U-Nets (pure JS, no DOM; used by worker.js, testable in Node).

   Signal path, as in Deezer's spleeter (spleeter/model/__init__.py, config 4stems / 4stems-16kHz):
   · STFT: frame 4096, hop 1024, periodic Hann, no normalisation. Frame f covers samples [f·1024 − 3072, f·1024 + 1024),
     so every sample (also the first and the last) sits under exactly 4 frames → window² sum = 1.5 everywhere.
   · The network sees |X| of bins 0…F−1 (F = 1536 ≈ 16.5 kHz, the "-16kHz" configs; 1024 = the 11 kHz default) in
     segments of T = 512 frames (≈ 11.9 s), like training. Spleeter itself cuts the song into back-to-back segments;
     here neighbouring segments overlap by O frames and their contributions are cross-faded per frame (linear, weights
     sum to 1), which removes the seams at the segment edges.
   · Ratio masks (separation_exponent 2): m_j = (y_j² + ε/4) / (Σ y² + ε). Above F Spleeter puts zeros ("zeros"
     extension: no highs in any stem) or the mask's mean over ALL bins ("average", which hands the bass stem a share of
     the cymbals); we extend each stem with the mean of its own mask over the top 128 modelled bins (≈ 15–16.5 kHz).
     The masks sum to 1, so the stems sum back to the mix; "other" is computed as mix − vocals − drums − bass (exact,
     saves two inverse FFTs per frame).
   · iSTFT: Hann synthesis window, overlap-add / 1.5.
   Streaming: the song stays in the caller once; output samples are final as soon as no later frame touches them and are
   handed out block by block (onBlock), so peak memory ≈ the song + one segment (≈ 60 MB at F 1536) + the model. */

export const N = 4096, H = 1024, NB = N / 2 + 1, PADL = N - H, WSUM = 1.5;

/* ---------- real FFT of size N via one complex FFT of size M = N/2 ---------- */
const M = N / 2;
const BITS = Math.log2(M);
const REV = new Uint32Array(M);
for (let i = 0; i < M; i++) { let r = 0; for (let b = 0; b < BITS; b++) r |= ((i >> b) & 1) << (BITS - 1 - b); REV[i] = r; }
const TC = new Float64Array(M / 2), TS = new Float64Array(M / 2);          // e^{-2πik/M}
for (let k = 0; k < M / 2; k++) { TC[k] = Math.cos(2 * Math.PI * k / M); TS[k] = -Math.sin(2 * Math.PI * k / M); }
const RC = new Float64Array(M + 1), RS = new Float64Array(M + 1);          // e^{-2πik/N}
for (let k = 0; k <= M; k++) { RC[k] = Math.cos(2 * Math.PI * k / N); RS[k] = -Math.sin(2 * Math.PI * k / N); }
export const WIN = new Float32Array(N);
for (let i = 0; i < N; i++) WIN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);

function cfft(re, im, inv) {                                                // in place, size M, no scaling
  for (let i = 0; i < M; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  const sg = inv ? -1 : 1;
  for (let size = 2; size <= M; size <<= 1) {
    const half = size >> 1, step = M / size;
    for (let s = 0; s < M; s += size) {
      for (let k = 0, t = 0; k < half; k++, t += step) {
        const wr = TC[t], wi = sg * TS[t], a = s + k, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}
const zr = new Float64Array(M), zi = new Float64Array(M);
/* x: N real samples → Xr/Xi: NB bins (written at offset o) */
export function rfft(x, Xr, Xi, o) {
  for (let m = 0; m < M; m++) { zr[m] = x[2 * m]; zi[m] = x[2 * m + 1]; }
  cfft(zr, zi, false);
  for (let k = 0; k <= M; k++) {
    const k1 = k % M, k2 = (M - k) % M;
    const ar = zr[k1], ai = zi[k1], br = zr[k2], bi = -zi[k2];               // Z[k], conj(Z[M−k])
    const fer = (ar + br) / 2, fei = (ai + bi) / 2;                          // even part
    const for_ = (ai - bi) / 2, foi = -(ar - br) / 2;                        // odd part = (Z − conj Z')/(2i)
    Xr[o + k] = fer + RC[k] * for_ - RS[k] * foi; Xi[o + k] = fei + RC[k] * foi + RS[k] * for_;
  }
}
/* Xr/Xi (NB bins at offset o, multiplied by mask m at offset mo) → x: N real samples (scaled 1/N) */
export function irfftMasked(Xr, Xi, o, m, mo, x) {
  for (let k = 0; k < M; k++) {
    const g1 = m[mo + k], g2 = m[mo + M - k];
    const ar = Xr[o + k] * g1, ai = Xi[o + k] * g1, br = Xr[o + M - k] * g2, bi = -Xi[o + M - k] * g2;   // X[k], conj(X[M−k])
    const fer = (ar + br) / 2, fei = (ai + bi) / 2;
    const dr = (ar - br) / 2, di = (ai - bi) / 2;                            // Fo = d · e^{+2πik/N}
    const for_ = dr * RC[k] + di * RS[k], foi = di * RC[k] - dr * RS[k];
    zr[k] = fer - foi; zi[k] = fei + for_;                                   // Z = Fe + i·Fo
  }
  cfft(zr, zi, true);
  const s = 1 / M;
  for (let m2 = 0; m2 < M; m2++) { x[2 * m2] = zr[m2] * s; x[2 * m2 + 1] = zi[m2] * s; }
}

/* ---------- separation ----------
   L, R: Float32Array(n) at 44.1 kHz. model(mag Float32Array[2·T·F], T, F) → Promise<Float32Array[4·2·T·F]>
   (vocals, drums, bass, other). onBlock(off, len, [vL,vR,dL,dR,bL,bR,oL,oR]); onProgress(i, total). */
export async function separate(L, R, n, model, o = {}) {
  const T = o.T || 512, F = o.F || 1536, ext = Math.min(128, F);
  const O = Math.max(16, Math.min(T >> 2, Math.round(T * (o.overlap ?? 0.25) * 0.5)));
  const step = T - O;
  const nF = Math.floor((n - 1 + PADL) / H) + 1;
  const S = nF <= T ? 1 : Math.ceil((nF - T) / step) + 1;
  const onBlock = o.onBlock || (() => {}), onProgress = o.onProgress || (() => {});
  const Xr = [new Float32Array(T * NB), new Float32Array(T * NB)], Xi = [new Float32Array(T * NB), new Float32Array(T * NB)];
  const mag = new Float32Array(2 * T * F);
  const W = (T - 1) * H + N;                                                 // one segment's reach in samples
  const acc = Array.from({ length: 6 }, () => new Float32Array(W));         // vocals/drums/bass × L/R
  const fr = new Float64Array(N), out = new Float64Array(N), mask = new Float32Array(3 * NB);
  const CH = [L, R];
  let base = 0;                                                             // acc[·][0] = sample `base`
  onProgress(0, S);
  for (let s = 0; s < S; s++) {
    const a = s * step, nv = Math.min(T, nF - a);
    // 1. STFT of frames a … a+nv−1 (the rest of the segment stays silent)
    for (let c = 0; c < 2; c++) {
      const x = CH[c], xr = Xr[c], xi = Xi[c];
      for (let i = 0; i < T; i++) {
        const mo = (c * T + i) * F;
        if (i >= nv) { mag.fill(0, mo, mo + F); xr.fill(0, i * NB, (i + 1) * NB); xi.fill(0, i * NB, (i + 1) * NB); continue; }
        const st = (a + i) * H - PADL;
        for (let t = 0; t < N; t++) { const p = st + t; fr[t] = p >= 0 && p < n ? x[p] * WIN[t] : 0; }
        rfft(fr, xr, xi, i * NB);
        for (let k = 0; k < F; k++) { const re = xr[i * NB + k], im = xi[i * NB + k]; mag[mo + k] = Math.sqrt(re * re + im * im); }
      }
    }
    // 2. the four U-Nets
    const est = await model(mag, T, F);
    // 3. masks → inverse STFT of vocals/drums/bass, cross-faded between segments
    const TF = T * F;
    for (let i = 0; i < nv; i++) {
      let wseg = 1;
      if (s > 0 && i < O) wseg = (i + 0.5) / O;
      else if (s < S - 1 && i >= T - O) wseg = 1 - (i - (T - O) + 0.5) / O;
      const g = wseg / WSUM, st = (a + i) * H - PADL - base;
      for (let c = 0; c < 2; c++) {
        const e0 = (0 * 2 + c) * TF + i * F, e1 = (1 * 2 + c) * TF + i * F, e2 = (2 * 2 + c) * TF + i * F, e3 = (3 * 2 + c) * TF + i * F;
        let t0 = 0, t1 = 0, t2 = 0;
        for (let k = 0; k < F; k++) {
          const y0 = est[e0 + k] * est[e0 + k], y1 = est[e1 + k] * est[e1 + k], y2 = est[e2 + k] * est[e2 + k], y3 = est[e3 + k] * est[e3 + k];
          const d = 1 / (y0 + y1 + y2 + y3 + 1e-10);
          const m0 = (y0 + 2.5e-11) * d, m1 = (y1 + 2.5e-11) * d, m2 = (y2 + 2.5e-11) * d;
          mask[k] = m0; mask[NB + k] = m1; mask[2 * NB + k] = m2;
          if (k >= F - ext) { t0 += m0; t1 += m1; t2 += m2; }
        }
        t0 /= ext; t1 /= ext; t2 /= ext;
        mask.fill(t0, F, NB); mask.fill(t1, NB + F, 2 * NB); mask.fill(t2, 2 * NB + F, 3 * NB);
        for (let j = 0; j < 3; j++) {
          irfftMasked(Xr[c], Xi[c], i * NB, mask, j * NB, out);
          const A = acc[j * 2 + c];
          for (let t = 0; t < N; t++) { const p = st + t; if (p >= 0 && p < W) A[p] += out[t] * WIN[t] * g; }
        }
      }
    }
    // 4. ship the samples no later frame touches
    const B = Math.min(n, s < S - 1 ? (a + step) * H - PADL : n), len = B - base;
    if (len > 0) {
      const res = [];
      for (let j = 0; j < 3; j++) for (let c = 0; c < 2; c++) res.push(acc[j * 2 + c].slice(0, len));
      for (let c = 0; c < 2; c++) {
        const x = CH[c], ot = new Float32Array(len), v = res[c], d = res[2 + c], b = res[4 + c];
        for (let t = 0; t < len; t++) ot[t] = x[base + t] - v[t] - d[t] - b[t];
        res.push(ot);
      }
      onBlock(base, len, res);
      for (const A of acc) { A.copyWithin(0, len); A.fill(0, W - len); }
      base = B;
    }
    onProgress(s + 1, S);
  }
}
