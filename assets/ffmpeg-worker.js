/* Chord Room – ffmpeg.wasm driver (classic worker) for the Converter (assets/convert.js).
   Imports the unmodified glue vendor/ffmpeg/ffmpeg-core-0.12.10.js and runs FFmpeg's `exec` in this worker, so the
   page never blocks. The wasm bytes come from the page (already inflated) as `wasmBinary`: nothing is fetched here.
   in : {id, type:'load', coreURL, wasm:ArrayBuffer}
        {id, type:'run', files:[{name, data:Uint8Array}], args:[...], outs:[name,...]}
   out: {id, ok:true}                                   (load)
        {type:'prog', p:0..1, time}                     (progress during a run, from FFmpeg's -progress hooks)
        {id, ok:true, ret, outs:{name:Uint8Array}, log} (run; ret = FFmpeg exit code, log = last stderr lines)
        {id, error}                                     (any failure) */
'use strict';
var core = null, log = [];

function keep(line) { log.push(String(line)); if (log.length > 60) log.shift(); }

function load(d) {
  importScripts(d.coreURL);
  if (typeof self.createFFmpegCore !== 'function') throw new Error('createFFmpegCore missing');
  // the glue reads wasm/worker URLs from the hash of mainScriptUrlOrBlob; with wasmBinary given they are never fetched
  var main = d.coreURL + '#' + btoa(JSON.stringify({ wasmURL: '', workerURL: '' }));
  return self.createFFmpegCore({ wasmBinary: new Uint8Array(d.wasm), mainScriptUrlOrBlob: main }).then(function (c) {
    core = c;
    core.setLogger(function (l) { if (l && l.message) keep(l.message); });
    core.setProgress(function (p) { postMessage({ type: 'prog', p: p && p.progress, time: p && p.time }); });
    return true;
  });
}

function run(d) {
  if (!core) throw new Error('not loaded');
  var i, f, outs = {}, trans = [];
  for (i = 0; i < d.files.length; i++) { f = d.files[i]; core.FS.writeFile(f.name, f.data); }
  log = [];
  core.setTimeout(-1);
  var ret;
  try { ret = core.exec.apply(core, d.args); } finally { core.reset(); }
  for (i = 0; i < d.outs.length; i++) {
    try { var b = core.FS.readFile(d.outs[i]); if (b && b.length) { outs[d.outs[i]] = b; trans.push(b.buffer); } } catch (e) {}
  }
  var names = d.files.map(function (x) { return x.name; }).concat(d.outs);
  for (i = 0; i < names.length; i++) { try { core.FS.unlink(names[i]); } catch (e) {} }
  return { ret: ret, outs: outs, log: log.slice(-12).join('\n'), trans: trans };
}

self.onmessage = function (e) {
  var d = e.data || {};
  Promise.resolve().then(function () {
    if (d.type === 'load') return load(d).then(function () { postMessage({ id: d.id, ok: true }); });
    if (d.type === 'run') { var r = run(d); postMessage({ id: d.id, ok: true, ret: r.ret, outs: r.outs, log: r.log }, r.trans); return; }
    throw new Error('unknown message ' + d.type);
  }).catch(function (err) {
    postMessage({ id: d.id, error: String(err && err.message || err), log: log.slice(-12).join('\n') });
  });
};
