"""Rebuild ai/model/* (stem separation) from Deezer's official Spleeter 4-stem checkpoint (MIT, code AND models).

    # 1. the official model (Deezer's GitHub release, ~146 MB) + the matching onnxruntime-web wasm
    curl -L -o 4stems.tar.gz https://github.com/deezer/spleeter/releases/download/v1.4.0/4stems.tar.gz
    mkdir 4stems && tar xzf 4stems.tar.gz -C 4stems          # checkpoint, model.data-00000-of-00001, model.index, model.meta
    npm pack onnxruntime-web@1.23.0 && mkdir ortweb && tar xzf onnxruntime-web-1.23.0.tgz -C ortweb
    # 2. Python 3.10+ venv
    pip install "tensorflow==2.20.*" onnx onnxruntime numpy
    # 3. pack (add --check to compare the ONNX graph with the original TensorFlow graph on real/random input)
    python3 tools/pack_model.py 4stems ortweb/package/dist/ort-wasm-simd-threaded.asyncify.wasm ai/model [--check song.wav]
    # ('-' instead of the wasm path keeps the existing ai/model/rt0.bin)

What it builds: the 4 U-Nets of Spleeter (vocals, drums, bass, other; spleeter/model/functions/unet.py, config 4stems.json:
ELU in the encoder and decoder, BatchNorm eps 1e-3, skip connections from the pre-BN convolutions) re-written 1:1 as one
ONNX graph, NCHW: input `mag` [1, 2, T, F] = |STFT| of the stereo mix (frame 4096, hop 1024, periodic Hann, no
normalisation; channels = L/R, T and F multiples of 64 — T 512 like training, F 1536 = the "-16kHz" configs), output
`est` [4, 2, T, F] = the four estimated magnitude spectrograms (sigmoid mask × input), order vocals, drums, bass, other.
The STFT, the ratio masks (Spleeter's separation_exponent 2) and the inverse STFT run in JS in ai/worker.js.
The variables are read by name from the checkpoint (conv2d_k / conv2d_transpose_k / batch_normalization_k are created in
that order, 7 + 6 + 12 per instrument); nothing of TensorFlow is shipped.

Weights are stored as fp16 (byte-shuffled, gzip) in parts < 25 MB (Cloudflare Pages' per-file limit) — the same packing
the worker already reads: spman.json = {total, segs: [[offset, count, packedOffset]…], files, bytes}.
"""
import gzip, json, os, sys
import numpy as np
import onnx
from onnx import helper, TensorProto, numpy_helper
from onnx.external_data_helper import convert_model_to_external_data

INSTR = ['vocals', 'drums', 'bass', 'other']
FILT = [16, 32, 64, 128, 256, 512]
BN_EPS = 1e-3          # keras BatchNormalization default (spleeter does not override it)
PREFIX = 'sp4-'        # new file names: the old Demucs parts stay cached as immutable under their own names


def load_ckpt(d):
    import tensorflow as tf
    r = tf.train.load_checkpoint(os.path.join(d, 'model'))
    return {k: r.get_tensor(k) for k in r.get_variable_to_shape_map()}


def build(V):
    nodes, inits = [], []
    def init(name, arr):
        inits.append(numpy_helper.from_array(np.ascontiguousarray(arr.astype(np.float32)), name)); return name
    def node(op, ins, outs, **kw):
        nodes.append(helper.make_node(op, ins, outs, **kw)); return outs[0]
    def conv(x, k, name):                                   # Conv2D 5x5 stride 2 'same' (TF pads 1 before, 2 after)
        w = V[f'conv2d{k}/kernel'].transpose(3, 2, 0, 1); b = V[f'conv2d{k}/bias']
        return node('Conv', [x, init(name + '_w', w), init(name + '_b', b)], [name], kernel_shape=[5, 5], strides=[2, 2], pads=[1, 1, 2, 2])
    def deconv(x, k, name):                                 # Conv2DTranspose 5x5 stride 2 'same' → out = 2·in
        w = V[f'conv2d_transpose{k}/kernel'].transpose(3, 2, 0, 1); b = V[f'conv2d_transpose{k}/bias']
        return node('ConvTranspose', [x, init(name + '_w', w), init(name + '_b', b)], [name], kernel_shape=[5, 5], strides=[2, 2], pads=[1, 1, 2, 2])
    def bn(x, k, name):
        p = f'batch_normalization{k}/'
        return node('BatchNormalization', [x, init(name + '_g', V[p + 'gamma']), init(name + '_be', V[p + 'beta']),
                    init(name + '_m', V[p + 'moving_mean']), init(name + '_v', V[p + 'moving_variance'])], [name], epsilon=BN_EPS)
    def elu(x, name): return node('Elu', [x], [name], alpha=1.0)
    sfx = lambda i: '' if i == 0 else f'_{i}'
    outs = []
    for s, ins in enumerate(INSTR):
        ci, ti, bi = 7 * s, 6 * s, 12 * s
        P = ins[0] + '_'
        x, skips = 'mag', []
        for l in range(6):
            c = conv(x, sfx(ci + l), P + f'c{l}'); skips.append(c)
            if l < 5: x = elu(bn(c, sfx(bi + l), P + f'b{l}'), P + f'r{l}')   # batch6/rel6 are unused (up1 reads conv6)
        x = skips[5]
        for l in range(6):
            u = deconv(x, sfx(ti + l), P + f'u{l}')
            u = elu(u, P + f'ue{l}')
            u = bn(u, sfx(bi + 6 + l), P + f'ub{l}')         # dropout = identity at inference
            x = node('Concat', [skips[4 - l], u], [P + f'm{l}'], axis=1) if l < 5 else u
        w = V[f'conv2d{sfx(ci + 6)}/kernel'].transpose(3, 2, 0, 1); b = V[f'conv2d{sfx(ci + 6)}/bias']
        m = node('Conv', [x, init(P + 'mk_w', w), init(P + 'mk_b', b)], [P + 'mk'], kernel_shape=[4, 4], dilations=[2, 2], pads=[3, 3, 3, 3])
        m = node('Sigmoid', [m], [P + 'mask'])
        outs.append(node('Mul', [m, 'mag'], [P + 'est']))
    node('Concat', outs, ['est'], axis=0)
    g = helper.make_graph(nodes, 'spleeter4', [helper.make_tensor_value_info('mag', TensorProto.FLOAT, [1, 2, 'T', 'F'])],
                          [helper.make_tensor_value_info('est', TensorProto.FLOAT, [4, 2, 'T', 'F'])], inits)
    m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 17)], producer_name='chord-room pack_model.py')
    m.ir_version = 8
    onnx.checker.check_model(m)
    return m


def check(ckpt, model, wav=None):
    """Run the ORIGINAL TensorFlow graph (model.meta + checkpoint) and our ONNX graph on the same input spectrogram."""
    import tensorflow as tf, onnxruntime as ort
    tf.compat.v1.disable_eager_execution()
    if wav:
        import wave
        w = wave.open(wav); n = min(w.getnframes(), 44100 * 30)
        a = np.frombuffer(w.readframes(n), dtype='<i2').reshape(-1, w.getnchannels()).astype(np.float32) / 32768
        if a.shape[1] == 1: a = np.repeat(a, 2, 1)
    else:
        rng = np.random.default_rng(1); a = (rng.standard_normal((44100 * 14, 2)) * 0.1).astype(np.float32)
    g = tf.Graph()
    with g.as_default(), tf.compat.v1.Session(graph=g) as sess:
        saver = tf.compat.v1.train.import_meta_graph(os.path.join(ckpt, 'model.meta'), clear_devices=True)
        saver.restore(sess, os.path.join(ckpt, 'model'))
        inp = g.get_operation_by_name('conv2d/Conv2D').inputs[0]
        fetch = [inp] + [g.get_tensor_by_name(f'{i}_spectrogram/mul:0') for i in INSTR]
        r = sess.run(fetch, {'waveform:0': a})
    spec = r[0]                                             # [segments, 512, 1024, 2] (NHWC)
    s = ort.InferenceSession(model.SerializeToString(), providers=['CPUExecutionProvider'])
    worst = 0
    for k in range(spec.shape[0]):
        x = spec[k:k + 1].transpose(0, 3, 1, 2)
        est = s.run(None, {'mag': x})[0]
        for j in range(4):
            ref = r[1 + j][k].transpose(2, 0, 1)
            e = np.sqrt(((est[j] - ref) ** 2).sum() / max(1e-12, (ref ** 2).sum()))
            worst = max(worst, e)
            print(f'segment {k} {INSTR[j]:6s} rel.err {e:.2e}  energy {(ref ** 2).sum():.3g}')
    print('worst relative error vs TensorFlow:', worst)
    return worst


def main():
    a = sys.argv[1:]
    wav = None
    if '--check' in a:
        i = a.index('--check'); wav = a[i + 1] if i + 1 < len(a) and not a[i + 1].startswith('-') else None
        a = a[:i] + a[i + 1 + (1 if wav else 0):]; do_check = True
    else: do_check = False
    ckpt, wasm, out = a[:3]
    V = load_ckpt(ckpt)
    m = build(V)
    if do_check: assert check(ckpt, m, wav) < 1e-3, 'ONNX graph does not match the TensorFlow model'
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, '_tmp'); os.makedirs(tmp, exist_ok=True)
    convert_model_to_external_data(m, all_tensors_to_one_file=True, location='w.data', size_threshold=0)
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
    b = np.frombuffer(bytes(packed), dtype=np.uint8).reshape(-1, 2)
    shuffled = b[:, 1].tobytes() + b[:, 0].tobytes()
    files, size = {}, 0
    def write(key, prefix, data, part=20_000_000):
        nonlocal size
        files[key] = []
        for n, i in enumerate(range(0, len(data), part)):
            fn = f'{prefix}{n}.bin'; open(os.path.join(out, fn), 'wb').write(data[i:i + part]); files[key].append('ai/model/' + fn); size += len(data[i:i + part])
    write('w', PREFIX + 'w', gzip.compress(shuffled, 9))
    write('graph', PREFIX + 'g', gzip.compress(open(os.path.join(tmp, 'graph.onnx'), 'rb').read(), 9))
    if wasm == '-':                                         # keep the existing runtime part (same onnxruntime-web version)
        files['ort'] = ['ai/model/rt0.bin']; size += os.path.getsize(os.path.join(out, 'rt0.bin'))
    else: write('ort', 'rt', gzip.compress(open(wasm, 'rb').read(), 9))
    json.dump({'model': 'spleeter-4stems (Deezer, MIT)', 'stems': INSTR, 'sr': 44100, 'nfft': 4096, 'hop': 1024, 'T': 512, 'F': 1536,
               'total': len(raw), 'segs': segs, 'files': files, 'bytes': size}, open(os.path.join(out, 'spman.json'), 'w'))
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    print('done:', files, size, 'bytes. The app reads the file list and the size from ai/model/spman.json.')


if __name__ == '__main__':
    main()
