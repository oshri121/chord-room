/* Chord Room – MP3 encoder worker (classic worker).
   Uses the unmodified LAME port in vendor/ (LGPL, kept as a separate file).
   in : {id, L:Float32Array, R?:Float32Array, sampleRate, kbps=320, tags}
   out: {id, progress:0..1} … then {id, done:true, mp3:Uint8Array} or {id, error} */
'use strict';
importScripts('../vendor/lamejs-1.2.7.min.js');

var RATES = [44100, 48000, 32000];            // MPEG-1 Layer III sample rates
var KBPS = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
var CHUNK = 1152 * 40;                         // samples per encodeBuffer call

/* linear resampler (only used for rates MPEG-1 can't carry) */
function resample(a, from, to) {
  var n = Math.max(1, Math.floor(a.length * to / from)), out = new Float32Array(n);
  var step = from / to, last = a.length - 1;
  for (var i = 0; i < n; i++) {
    var p = i * step, i0 = p | 0, f = p - i0;
    out[i] = i0 >= last ? a[last] : a[i0] + (a[i0 + 1] - a[i0]) * f;
  }
  return out;
}

function toInt16(src, off, len, dst) {
  for (var i = 0; i < len; i++) {
    var s = src[off + i];
    if (!(s === s)) s = 0;                     // NaN → silence
    s = s < -1 ? -1 : s > 1 ? 1 : s;
    dst[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return len === dst.length ? dst : dst.subarray(0, len);
}

/* ---------- ID3v2.3 ---------- */
function isAscii(s) { for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x7e) return false; return true; }
/* encoded string (+ optional terminator): ASCII → ISO-8859-1 (enc 0), otherwise UTF-16LE with BOM (enc 1) */
function encText(s, enc, term) {
  var b = [], i;
  if (enc === 0) { for (i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); if (term) b.push(0); }
  else {
    b.push(0xff, 0xfe);
    for (i = 0; i < s.length; i++) { var c = s.charCodeAt(i); b.push(c & 255, c >> 8); }
    if (term) b.push(0, 0);
  }
  return b;
}
function frame(id, body) {
  var n = body.length, h = [];
  for (var i = 0; i < 4; i++) h.push(id.charCodeAt(i));
  h.push(n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255, 0, 0);   // v2.3: plain 32-bit size
  return h.concat(body);
}
function textFrame(id, v) {
  var s = String(v).replace(/\0/g, '').trim();
  if (!s) return [];
  var enc = isAscii(s) ? 0 : 1;
  return frame(id, [enc].concat(encText(s, enc, false)));
}
function keyTag(k) {                           // ID3 TKEY: "A".."G", "b"/"#", "m" for minor, max 3 chars
  var m = /^\s*([A-Ga-g])\s*([#b♯♭]?)\s*(m|min|minor|maj|major)?\s*$/i.exec(String(k));
  if (!m) return String(k).slice(0, 3);
  var acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2];
  var minor = m[3] && m[3] !== 'M' && /^m(in(or)?)?$/i.test(m[3]);
  return m[1].toUpperCase() + acc + (minor ? 'm' : '');
}
function id3(tags) {
  tags = tags || {};
  var f = [];
  if (tags.title != null) f = f.concat(textFrame('TIT2', tags.title));
  if (tags.artist != null) f = f.concat(textFrame('TPE1', tags.artist));
  if (tags.album != null) f = f.concat(textFrame('TALB', tags.album));
  if (tags.genre != null) f = f.concat(textFrame('TCON', tags.genre));
  if (tags.year != null) f = f.concat(textFrame('TYER', tags.year));
  if (tags.bpm != null && isFinite(+tags.bpm) && +tags.bpm > 0) f = f.concat(textFrame('TBPM', String(Math.round(+tags.bpm))));
  if (tags.key) f = f.concat(textFrame('TKEY', keyTag(tags.key)));
  if (tags.comment) {
    var c = String(tags.comment), enc = isAscii(c) ? 0 : 1;
    f = f.concat(frame('COMM', [enc, 0x65, 0x6e, 0x67].concat(encText('', enc, true), encText(c, enc, false))));
  }
  f = f.concat(textFrame('TSSE', tags.encoder || 'Chord Room'));
  var n = f.length;                            // tag size excludes the 10-byte header, syncsafe
  var out = new Uint8Array(10 + n);
  out.set([0x49, 0x44, 0x33, 3, 0, 0, n >> 21 & 127, n >> 14 & 127, n >> 7 & 127, n & 127]);
  out.set(f, 10);
  return out;
}

/* ---------- encode ---------- */
function encode(d) {
  var L = d.L, R = d.R || d.L, sr = +d.sampleRate || 44100, kbps = +d.kbps || 320;
  if (!(L && L.length >= 0)) throw new Error('no audio');
  if (R.length !== L.length) throw new Error('channel length mismatch');
  if (KBPS.indexOf(kbps) < 0) throw new Error('unsupported bitrate ' + kbps);
  if (RATES.indexOf(sr) < 0) {
    var mono = R === L;
    L = resample(L, sr, 44100); R = mono ? L : resample(R, sr, 44100); sr = 44100;
  }
  var enc = new lamejs.Mp3Encoder(2, sr, kbps);
  var n = L.length, l16 = new Int16Array(CHUNK), r16 = R === L ? l16 : new Int16Array(CHUNK);
  var parts = [], total = 0, nextTick = 0.05, id = d.id;
  function push(b) { if (b && b.length) { parts.push(b); total += b.length; } }
  postMessage({ id: id, progress: 0 });
  for (var i = 0; i < n; i += CHUNK) {
    var len = Math.min(CHUNK, n - i);
    var a = toInt16(L, i, len, l16), b = R === L ? a : toInt16(R, i, len, r16);
    push(enc.encodeBuffer(a, b));
    var p = (i + len) / n;
    if (p >= nextTick && p < 1) { postMessage({ id: id, progress: p }); nextTick = p + 0.05; }
  }
  push(enc.flush());
  var tag = id3(d.tags), out = new Uint8Array(tag.length + total), o = tag.length;
  out.set(tag, 0);
  for (var k = 0; k < parts.length; k++) { out.set(new Uint8Array(parts[k].buffer, parts[k].byteOffset, parts[k].length), o); o += parts[k].length; }
  postMessage({ id: id, progress: 1 });
  return out;
}

self.onmessage = function (e) {
  var d = e.data || {};
  try {
    var mp3 = encode(d);
    postMessage({ id: d.id, done: true, mp3: mp3 }, [mp3.buffer]);
  } catch (err) {
    postMessage({ id: d.id, error: String(err && err.message || err) });
  }
};
