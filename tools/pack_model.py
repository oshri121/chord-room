"""Rebuild ai/model/* from the htdemucs.onnx shipped in the npm package `demucs` (1.0.0).

    npm pack demucs@1.0.0 && tar xzf demucs-1.0.0.tgz        # gives package/htdemucs.onnx
    npm pack onnxruntime-web@1.23.0 && tar xzf onnxruntime-web-1.23.0.tgz -C ortweb
    pip install onnx numpy
    python3 tools/pack_model.py package/htdemucs.onnx ortweb/package/dist/ort-wasm-simd-threaded.asyncify.wasm ai/model

Weights are stored as fp16 (numerically transparent for Demucs: >75 dB vs fp32), byte-shuffled,
gzipped and split into 14 MB parts (Cloudflare Pages allows 25 MiB per file).
"""
import gzip, json, os, sys
import numpy as np
import onnx
from onnx.external_data_helper import convert_model_to_external_data

src, wasm, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
tmp = os.path.join(out, '_tmp'); os.makedirs(tmp, exist_ok=True)
m = onnx.load(src)
convert_model_to_external_data(m, all_tensors_to_one_file=True, location='w.data', size_threshold=1024)
onnx.save_model(m, os.path.join(tmp, 'graph.onnx'))
g = onnx.load(os.path.join(tmp, 'graph.onnx'), load_external_data=False).graph
man = []
for t in g.initializer:
    if t.data_location == onnx.TensorProto.EXTERNAL:
        info = {e.key: e.value for e in t.external_data}
        man.append((int(info.get('offset', 0)), int(info['length']), t.data_type))
man.sort()
raw = open(os.path.join(tmp, 'w.data'), 'rb').read()
packed, segs = bytearray(), []
for off, ln, dt in man:
    assert dt == 1, 'expected float32 initializers'
    h = np.frombuffer(raw[off:off + ln], dtype='<f4').astype('<f2')
    segs.append([off, ln // 4, len(packed)]); packed += h.tobytes()
json.dump({'total': len(raw), 'segs': segs}, open(os.path.join(out, 'wman.json'), 'w'))
b = np.frombuffer(bytes(packed), dtype=np.uint8).reshape(-1, 2)
shuffled = b[:, 1].tobytes() + b[:, 0].tobytes()

def write(prefix, data, size=14_000_000):
    for n, i in enumerate(range(0, len(data), size)):
        open(os.path.join(out, f'{prefix}{n}.bin'), 'wb').write(data[i:i + size])

write('w', gzip.compress(shuffled, 6))
write('g', gzip.compress(open(os.path.join(tmp, 'graph.onnx'), 'rb').read(), 9))
write('rt', gzip.compress(open(wasm, 'rb').read(), 9))
print('done; if the number of w*.bin parts changed, update the list in assets/app.js (aiSeparate) and AI_BYTES')
