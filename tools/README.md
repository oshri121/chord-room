# tools

## Rebuild the AI worker (`ai/worker.js`)
```
cd tools/ai-worker && npm install && npm run build
```
`worker.js` downloads the model parts listed in `ai/model/spman.json`, rebuilds fp32 weights from fp16 and runs Deezer's
**Spleeter 4-stem** U-Nets (MIT, code and models) with ONNX Runtime Web (WebGPU when available, otherwise WASM).
`spleeter.js` is our own code (no third-party DSP): real FFT, STFT (4096 / hop 1024, periodic Hann, exactly as Spleeter),
ratio masks (exponent 2, extended above 16.5 kHz with each stem's top-band mean), inverse STFT, 512-frame segments
with cross-faded overlaps, streamed out block by block. Output order = the app's stems: vocals, drums, bass, other
("other" = mix − the other three, so the stems always sum to the mix). Message API (unchanged for the app):
`{type:'init', man, files, bytes, base, gpu}` → `dl` / `stage` / `ready`; `{type:'run', LR, n, overlap[, F]}` → `p` / `blk` / `done` / `error`.
After a change bump `ai/worker.js?v=` in `assets/app.js` (`aiInit`) and in `tools/tests/slow/test_separation.py`.

## Rebuild the model files (`ai/model/*`)
See the docstring at the top of `pack_model.py` (official checkpoint from github.com/deezer/spleeter releases v1.4.0
→ ONNX graph + fp16 parts < 25 MB + `spman.json`; `--check` compares the graph with the original TensorFlow model).
New model files must get NEW names (the `.bin` parts are cached as immutable); bump `spman.json?v=` in `assets/app.js`.
