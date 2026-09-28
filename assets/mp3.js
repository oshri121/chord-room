/* Chord Room – MP3 export (LAME in a Web Worker, see assets/mp3-worker.js).
   window.MP3.encode(L, R, sampleRate, {kbps=320, tags, onProgress}) → Promise<Uint8Array>
   tags: {title, artist, album, bpm, key, genre, year, comment} → ID3v2.3 (UTF-16 for non-ASCII). */
(function () {
  'use strict';
  var supported = typeof Worker !== 'undefined' && typeof Float32Array !== 'undefined' && typeof Promise !== 'undefined';
  // worker URL: next to this script (keeps its ?v= cache-busting query), else relative to the page
  var here = document.currentScript && document.currentScript.src;
  var workerURL;
  try {
    workerURL = here ? new URL('mp3-worker.js' + new URL(here).search, here).href
                     : new URL('assets/mp3-worker.js', document.baseURI).href;
  } catch (e) { workerURL = 'assets/mp3-worker.js'; }

  var worker = null, jobs = {}, seq = 0;

  function failAll(msg) {
    var ids = Object.keys(jobs);
    for (var i = 0; i < ids.length; i++) { var j = jobs[ids[i]]; delete jobs[ids[i]]; j.reject(new Error(msg)); }
    if (worker) { try { worker.terminate(); } catch (e) {} }
    worker = null;                                // next encode() starts a fresh worker
  }

  function getWorker() {
    if (worker) return worker;
    worker = new Worker(workerURL);
    worker.onmessage = function (e) {
      var d = e.data || {}, j = jobs[d.id];
      if (!j) return;
      if (d.error) { delete jobs[d.id]; j.reject(new Error('MP3 encode failed: ' + d.error)); }
      else if (d.done) { delete jobs[d.id]; if (j.onProgress) try { j.onProgress(1); } catch (x) {} j.resolve(d.mp3); }
      else if (typeof d.progress === 'number' && j.onProgress) { try { j.onProgress(d.progress); } catch (x) {} }
    };
    worker.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      failAll('MP3 worker error: ' + (e && e.message || 'failed to load ' + workerURL));
    };
    worker.onmessageerror = function () { failAll('MP3 worker message error'); };
    return worker;
  }

  // always copy: the caller's arrays (often AudioBuffer channel data) must never be detached
  function copy(a) {
    if (a instanceof Float32Array) return a.slice();
    return Float32Array.from(a);
  }

  function encode(L, R, sampleRate, opts) {
    opts = opts || {};
    if (!supported) return Promise.reject(new Error('MP3 export needs Web Workers'));
    if (!L || typeof L.length !== 'number') return Promise.reject(new Error('MP3: no audio data'));
    if (R && R.length !== L.length) return Promise.reject(new Error('MP3: channel length mismatch'));
    var sr = +sampleRate;
    if (!(sr > 0)) return Promise.reject(new Error('MP3: bad sample rate'));
    return new Promise(function (resolve, reject) {
      var w;
      try { w = getWorker(); } catch (e) { reject(e); return; }
      var id = ++seq, l = copy(L), r = R && R !== L ? copy(R) : undefined;
      jobs[id] = { resolve: resolve, reject: reject, onProgress: typeof opts.onProgress === 'function' ? opts.onProgress : null };
      var msg = { id: id, L: l, R: r, sampleRate: sr, kbps: opts.kbps || 320, tags: opts.tags || null };
      try { w.postMessage(msg, r ? [l.buffer, r.buffer] : [l.buffer]); }
      catch (e) { delete jobs[id]; reject(e); }
    });
  }

  window.MP3 = { encode: encode, supported: supported };
})();
