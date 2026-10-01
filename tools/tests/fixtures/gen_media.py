"""Media fixtures for the Converter test (tools/tests/ui/test_convert.py).

make(out_dir, seconds=4) writes short files with known content into out_dir and returns {name: path}:
  t.mp3 (ID3v2.3: title/artist/album/year/TBPM/TKEY + APIC cover)   t.wav (16-bit stereo 44.1 k, LIST INFO + id3 chunk)
  t.flac (Vorbis comments + PICTURE)   t.ogg (Opus, Vorbis comments)   t.m4a (AAC, ©nam/©ART/covr)
  t.mp4 (H.264 colour bars + AAC tone, title tag)   t.aiff   cover.png (300×200)
Uses the system ffmpeg when present (plus mutagen for the tags); without ffmpeg only t.wav + cover.png are produced
(numpy/own writer), and the test skips the formats it cannot build. The signal is a 440 Hz tone on the left and
880 Hz on the right with 0.3 s of silence at both ends (so "trim silence" has something to cut), peak −6 dBFS.
"""
import os, shutil, struct, subprocess, zlib

def _wav(path, seconds, sr=44100, lead=0.3):
    import math
    n = int(seconds * sr); lead_n = int(lead * sr)
    frames = bytearray()
    for i in range(n):
        if i < lead_n or i >= n - lead_n: l = r = 0
        else:
            l = int(0.5 * 32767 * math.sin(2 * math.pi * 440 * i / sr))
            r = int(0.5 * 32767 * math.sin(2 * math.pi * 880 * i / sr))
        frames += struct.pack('<hh', l, r)
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(frames)) + b'WAVE' + b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 2, sr, sr * 4, 4, 16) + b'data' + struct.pack('<I', len(frames)) + frames)

def _png(path, w=300, h=200):
    rows = b''
    for y in range(h):
        rows += b'\x00' + b''.join(bytes([x * 255 // w, y * 255 // h, 90]) for x in range(w))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b''))

TAGS = {'title': 'Täst Song', 'artist': 'Chord Röom', 'album': 'Fixtures', 'year': '2026', 'bpm': 128, 'key': 'Am'}

def make(out_dir, seconds=4):
    os.makedirs(out_dir, exist_ok=True)
    out = {}
    wav = os.path.join(out_dir, 't.wav'); _wav(wav, seconds); out['t.wav'] = wav
    png = os.path.join(out_dir, 'cover.png'); _png(png); out['cover.png'] = png
    ff = shutil.which('ffmpeg')
    if not ff: return out
    def run(*a):
        subprocess.run([ff, '-v', 'error', '-y', *a], check=True, cwd=out_dir)
    jpg = os.path.join(out_dir, 'cover.jpg'); run('-i', png, '-q:v', '3', jpg); out['cover.jpg'] = jpg
    meta = ['-metadata', 'title=' + TAGS['title'], '-metadata', 'artist=' + TAGS['artist'], '-metadata', 'album=' + TAGS['album'], '-metadata', 'date=' + TAGS['year']]
    run('-i', wav, '-i', jpg, '-map', '0:a', '-map', '1:v', '-c:a', 'libmp3lame', '-b:a', '192k', '-c:v', 'copy', '-id3v2_version', '3', '-disposition:v', 'attached_pic',
        *meta, '-metadata', 'TBPM=%d' % TAGS['bpm'], '-metadata', 'TKEY=' + TAGS['key'], 't.mp3'); out['t.mp3'] = os.path.join(out_dir, 't.mp3')
    run('-i', wav, '-i', jpg, '-map', '0:a', '-map', '1:v', '-c:a', 'flac', '-c:v', 'copy', '-disposition:v', 'attached_pic', *meta, '-metadata', 'bpm=%d' % TAGS['bpm'], '-metadata', 'initialkey=' + TAGS['key'], 't.flac'); out['t.flac'] = os.path.join(out_dir, 't.flac')
    run('-i', wav, '-c:a', 'libopus', '-b:a', '96k', *meta, 't.ogg'); out['t.ogg'] = os.path.join(out_dir, 't.ogg')
    run('-i', wav, '-i', jpg, '-map', '0:a', '-map', '1:v', '-c:a', 'aac', '-b:a', '128k', '-c:v', 'copy', '-disposition:v:0', 'attached_pic', *meta, 't.m4a'); out['t.m4a'] = os.path.join(out_dir, 't.m4a')
    run('-f', 'lavfi', '-i', 'smptebars=s=160x120:r=10:d=%d' % seconds, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', *meta, 't.mp4'); out['t.mp4'] = os.path.join(out_dir, 't.mp4')
    run('-i', wav, *meta, '-write_id3v2', '1', 't.aiff'); out['t.aiff'] = os.path.join(out_dir, 't.aiff')
    try:
        import mutagen.wave, mutagen.id3
        w = mutagen.wave.WAVE(wav)
        if w.tags is None: w.add_tags()
        w.tags.add(mutagen.id3.TIT2(encoding=3, text=TAGS['title'])); w.tags.add(mutagen.id3.TPE1(encoding=3, text=TAGS['artist']))
        w.tags.add(mutagen.id3.APIC(encoding=0, mime='image/jpeg', type=3, desc='', data=open(jpg, 'rb').read()))
        w.save()
    except Exception as e: print('wav tags skipped:', e)
    return out

if __name__ == '__main__':
    import sys
    print(make(sys.argv[1] if len(sys.argv) > 1 else '/tmp/cr-media'))
