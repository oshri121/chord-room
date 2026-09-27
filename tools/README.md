# tools

## Rebuild the AI worker (`ai/worker.js`)
```
cd tools/ai-worker && npm install && npm run build
```
`worker.js` loads the model parts, rebuilds fp32 weights from fp16 and runs Demucs with ONNX Runtime Web
(WebGPU when available, otherwise WASM). `lib/` is demucs-js (MIT, Kevin Gibbons) with two fixes:
`istft` honours an explicit length (the original read past the buffer and leaked audio between stems/channels),
and a cached-twiddle FFT.

## Rebuild the model files (`ai/model/*`)
See the docstring at the top of `pack_model.py`.
