"""Shared helpers for the Chord Room UI tests (Playwright, sync API).

A test is a plain script:

    import lib
    @lib.main
    def test(t, srv, b):              # t = checker, srv = local server, b = Chromium browser
        ctx, pg = lib.page(b, srv, mock=True)
        pg.goto(srv.url('#tool'))
        t.check('something true', pg.evaluate('1+1') == 2)

`@lib.main` starts a local stand-in for Cloudflare Pages on a free port (real `_headers` → strict CSP, mock
/api/deezer, fake /api/assistant), launches Chromium, runs the test, and exits non-zero if any check failed,
the test raised, or (unless allowed) the page threw errors.

Environment:
  CR_REPO   the site tree to test (default: this repo)          CR_SHOTS  where screenshots go (default: a temp dir)
  CR_HEADED=1  show the browser                                  CR_SLOWMO=ms  slow Playwright down
"""
import os, re, sys, json, time, socket, tempfile, threading, traceback, mimetypes, urllib.parse, http.server, socketserver

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.environ.get('CR_REPO') or os.path.join(HERE, '..', '..'))
FIX = os.path.join(HERE, 'fixtures')
MOCK_DIR = os.path.join(HERE, 'mock')
TEST_NAME = os.path.splitext(os.path.basename(sys.argv[0]))[0]
SHOTS = os.path.join(os.environ.get('CR_SHOTS') or os.path.join(tempfile.gettempdir(), 'chordroom-shots'), TEST_NAME)

# ------------------------------------------------------------------ _headers (Cloudflare Pages semantics)
def parse_headers(path):
    rules, cur = [], None
    for line in open(path, encoding='utf-8'):
        if not line.strip() or line.lstrip().startswith('#'): continue
        if not line[0].isspace():
            cur = {'pat': line.strip(), 'set': [], 'detach': []}; rules.append(cur); continue
        l = line.strip()
        if l.startswith('!'): cur['detach'].append(l[1:].strip().lower())
        else:
            k, v = l.split(':', 1); cur['set'].append((k.strip(), v.strip()))
    for r in rules:
        rx = re.escape(r['pat']).replace(r'\*', '.*')
        rx = re.sub(r'\\:([A-Za-z]\w*)', r'[^/]+', rx)
        r['rx'] = re.compile('^' + rx + '$')
    return rules

def headers_for(path, rules=None):
    """Headers Cloudflare Pages would send for `path` (matching rules merge, '! Name' detaches)."""
    rules = rules or parse_headers(os.path.join(REPO, '_headers'))
    out, detach = {}, set()
    for r in rules:
        if r['rx'].match(path):
            for k, v in r['set']:
                kl = k.lower()
                out[kl] = (k, out[kl][1] + ', ' + v) if kl in out else (k, v)
            detach.update(r['detach'])
    return [v for k, v in out.items() if k not in detach]

# ------------------------------------------------------------------ fake Deezer data
COVER = 'https://cdn-images.dzcdn.net/images/cover/abc/250x250-000000-80-0-0.jpg'
def dz_tracks(n=6):
    """n chart tracks; previews point at *.dzcdn.net and are served from fixtures/p{i%3}.mp3 by the context routes."""
    return [{'id': 1000 + i, 'title': f'Song {i}', 'title_short': f'Song {i}', 'duration': 30, 'readable': True,
             'link': f'https://www.deezer.com/track/{1000+i}', 'preview': f'https://cdnt-preview.dzcdn.net/api/1/1/p{i%3}.mp3?hdnea=exp=9999999999',
             'artist': {'id': i, 'name': f'Artist {i}'}, 'album': {'id': 50 + i, 'title': 'Album', 'cover_medium': COVER, 'release_date': '2026-09-01'}}
            for i in range(n)]

# ------------------------------------------------------------------ fake /api/assistant (same wire format as functions/api/assistant.js)
ASSISTANT_ANSWER = ("היי! אני **רומי** 🎧\n"
    "הנה כמה צעדים:\n"
    "- פתחו את [ניתוח ספרייה](#crate) כדי לקבל נקודות קיו\n"
    "- קישור רע: [x](javascript:alert(1)) ו־[y](https://evil.example/)\n"
    "- ניסיון HTML: <img src=x onerror=alert(1)> <script>alert(2)</script>\n"
    "1. סולם *Am* עם `124 BPM`\n"
    "2. **מעבר** אחרי 16 תיבות\n\n"
    "בהצלחה! [דף הבית](#) · [מחירים](#pricing)")

# ------------------------------------------------------------------ static server
class Server:
    """Serves REPO like Cloudflare Pages would (headers from _headers when csp=True, SPA fallback to index.html).
    index.html gets <script src="/__test/mock.js"> before config.js; that file is empty unless a context routes it
    (lib.page(mock=...)) or srv.mock_js is set. Also: /api/deezer/* (srv.tracks), POST /api/assistant, /__test/last."""
    def __init__(self, csp=True, port=0):
        self.csp, self.tracks, self.mock_js, self.last = csp, dz_tracks(), '', {}
        self.rules = parse_headers(os.path.join(REPO, '_headers'))
        srv = self
        class H(http.server.BaseHTTPRequestHandler):
            protocol_version = 'HTTP/1.0'
            def log_message(self, *a): pass
            def _send(self, code, body, ct, extra=()):
                self.send_response(code); self.send_header('content-type', ct); self.send_header('content-length', str(len(body)))
                for k, v in extra: self.send_header(k, v)
                self.end_headers()
                if self.command != 'HEAD': self.wfile.write(body)
            def j(self, code, obj): self._send(code, json.dumps(obj).encode(), 'application/json; charset=utf-8')
            def do_HEAD(self): self.do_GET()
            def do_POST(self):
                u = urllib.parse.urlparse(self.path)
                if u.path != '/api/assistant': return self.j(404, {'error': 'nf'})
                raw = self.rfile.read(int(self.headers.get('content-length') or 0))
                try: body = json.loads(raw)
                except Exception: return self.j(400, {'error': 'bad_json'})
                srv.last.clear(); srv.last.update({'body': body, 'auth': self.headers.get('authorization'), 'bytes': len(raw), 'ct': self.headers.get('content-type')})
                if not re.match(r'^Bearer tok-', self.headers.get('authorization') or ''): return self.j(401, {'error': 'auth'})
                q = body['messages'][-1]['content']
                if 'QUOTA' in q: return self.j(429, {'error': 'quota', 'left': 0, 'limit': 30})
                if 'SLOW' in q: return self.j(429, {'error': 'slow'})
                if 'CFG' in q: return self.j(503, {'error': 'not_configured'})
                if 'NET' in q: self.close_connection = True; self.connection.shutdown(2); return
                self.send_response(200); self.send_header('content-type', 'application/x-ndjson; charset=utf-8'); self.send_header('cache-control', 'no-store'); self.end_headers()
                def w(o): self.wfile.write((json.dumps(o, ensure_ascii=False) + '\n').encode()); self.wfile.flush()
                try:
                    w({'left': 3, 'limit': 30})
                    if 'LONG' in q:
                        for i in range(80): w({'t': f'מילה {i} '}); time.sleep(0.1)
                        w({'done': True, 'stop': 'end_turn'}); return
                    if 'CUT' in q:
                        w({'t': 'התחלה של תשובה '}); time.sleep(0.2); w({'error': 'upstream'}); return
                    text = ASSISTANT_ANSWER if 'LAST' not in q else 'זו ההודעה האחרונה שלך להיום.'
                    for i in range(0, len(text), 9): w({'t': text[i:i + 9]}); time.sleep(0.02)
                    w({'done': True, 'stop': 'end_turn'})
                except (BrokenPipeError, ConnectionResetError): srv.last['aborted'] = True
            def do_GET(self):
                u = urllib.parse.urlparse(self.path); path = urllib.parse.unquote(u.path)
                if path == '/__test/last': return self.j(200, srv.last)
                if path == '/__test/mock.js': return self._send(200, srv.mock_js.encode(), 'text/javascript')
                if path.startswith('/api/deezer/'):
                    sub = path[len('/api/deezer/'):]
                    if re.match(r'^track/\d+$', sub): body = (srv.tracks or dz_tracks(1))[0]
                    elif re.match(r'^album/\d+$', sub): body = {'id': 1, 'release_date': '2026-09-01', 'title': 'Album', 'cover_medium': COVER}
                    elif sub.startswith('search'): body = {'data': []}
                    else: body = {'data': srv.tracks}
                    return self.j(200, body)
                if path in ('/', ''): path = '/index.html'
                fp = os.path.normpath(os.path.join(REPO, path.lstrip('/')))
                if not fp.startswith(REPO) or not os.path.isfile(fp): fp = os.path.join(REPO, 'index.html')
                data = open(fp, 'rb').read()
                if os.path.relpath(fp, REPO) == 'index.html':
                    data = data.replace(b'<script src="config.js', b'<script src="/__test/mock.js"></script>\n<script src="config.js', 1)
                ct = mimetypes.guess_type(fp)[0] or 'application/octet-stream'
                if fp.endswith(('.js', '.mjs')): ct = 'text/javascript'
                elif fp.endswith('.webmanifest'): ct = 'application/manifest+json'
                elif fp.endswith('.wasm'): ct = 'application/wasm'
                elif fp.endswith('.html'): ct = 'text/html; charset=utf-8'
                extra = headers_for(urllib.parse.unquote(u.path) or '/', srv.rules) if srv.csp else []
                self._send(200, data, ct, extra)
        class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
            daemon_threads = True; allow_reuse_address = True
        self.httpd = TS(('127.0.0.1', port), H)
        self.port = self.httpd.server_address[1]
        self.base = f'http://127.0.0.1:{self.port}/'
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True); self.thread.start()
    def url(self, rest=''): return self.base + rest.lstrip('/')
    def stop(self): self.httpd.shutdown(); self.httpd.server_close()

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

# ------------------------------------------------------------------ mock backend
def read_mock(name): return open(os.path.join(MOCK_DIR, name), encoding='utf-8').read()

def mock_js(extra='', pre='', files=('mockb.js',)):
    """The mock backend script: `pre` (runs first, e.g. knobs), the files, then `extra` (overrides)."""
    return pre + '\n' + '\n'.join(read_mock(f) for f in files) + '\n' + extra

def auth_mock(confirm=True, cfg=None, extra=''):
    """mockb.js + auth_ext.js (codes, resend, recovery). cfg = JS object literal merged into getConfig()."""
    pre = 'window.__confirm=%s;' % ('true' if confirm else 'false')
    if cfg: extra = "(()=>{const B=window.__MOCK_BACKEND;const g=B.getConfig;B.getConfig=async()=>({...(await g()),...%s})})();\n" % cfg + extra
    return mock_js(extra, pre=pre, files=('mockb.js', 'auth_ext.js'))

ACCOUNTS_OFF ='/* test: accounts off (vendor/supabase.js stubbed → Backend.enabled=false, local mode, no sign-in gate) */'
SVG_1PX = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'

def _fixture(name): return open(os.path.join(FIX, name), 'rb').read()

def context(b, srv, *, w=1300, h=900, mock=None, accounts=True, lang=None, theme=None, color_scheme=None, locale=None,
            mobile=False, downloads=True, init=None, allow_hosts=(), dpr=1):
    """New browser context with the test routes:
      * everything that is not 127.0.0.1/localhost is aborted, except *.dzcdn.net (previews → fixtures/p0..2.mp3, covers → tiny svg)
        and Google Fonts (answered with an empty stylesheet so the page doesn't wait on them); `allow_hosts` = extra regexes left alone
      * mock=True → the default mock backend; a string → that script (build it with mock_js())
      * accounts=False → vendor/supabase.js stubbed out = the site in local mode (tools work without an account)
      * lang/theme → saved in localStorage before the page loads ('light'|'dark'); color_scheme → emulated OS setting"""
    kw = dict(viewport={'width': w, 'height': h}, device_scale_factor=dpr, accept_downloads=downloads)
    if color_scheme: kw['color_scheme'] = color_scheme
    if locale: kw['locale'] = locale
    if mobile: kw.update(device_scale_factor=2, is_mobile=True, has_touch=True)
    ctx = b.new_context(**kw)
    allow = '|'.join(['127\\.0\\.0\\.1', 'localhost'] + list(allow_hosts))
    ctx.route(re.compile(r'^(https?|wss?)://(?!(%s)[:/]).*' % allow), lambda r: r.abort())
    def dzcdn(r):
        u = r.request.url
        m = re.search(r'/(p\d)\.mp3', u)
        if 'preview' in u and m: r.fulfill(status=200, content_type='audio/mpeg', body=_fixture(m.group(1) + '.mp3'), headers={'access-control-allow-origin': '*'})
        else: r.fulfill(status=200, content_type='image/svg+xml', body=SVG_1PX, headers={'access-control-allow-origin': '*'})
    ctx.route(re.compile(r'^https://[a-z0-9-]+\.dzcdn\.net/.*'), dzcdn)
    ctx.route(re.compile(r'^https://fonts\.googleapis\.com/.*'), lambda r: r.fulfill(status=200, content_type='text/css', body='/* font stub */'))
    if mock:
        body = mock_js() if mock is True else mock
        ctx.route(re.compile(r'^http://127\.0\.0\.1:\d+/__test/mock\.js'), lambda r: r.fulfill(status=200, content_type='text/javascript', body=body))
    if not accounts:
        ctx.route(re.compile(r'.*/vendor/supabase\.js.*'), lambda r: r.fulfill(status=200, content_type='text/javascript', body=ACCOUNTS_OFF))
    ls = {}
    if lang: ls['chordroom.lang'] = lang
    if theme: ls['chordroom.theme'] = theme
    if ls: ctx.add_init_script('try{' + ''.join('localStorage.setItem(%s,%s);' % (json.dumps(k), json.dumps(v)) for k, v in ls.items()) + '}catch(e){}')
    if init: ctx.add_init_script(init)
    return ctx

IGNORED_CONSOLE = re.compile(r'Failed to load resource|net::ERR_|favicon')
def watch(pg, errs=None):
    """Collect uncaught page errors and console.error lines (network failures of blocked hosts ignored)."""
    errs = [] if errs is None else errs
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:300]))
    pg.on('console', lambda m: errs.append('console.error: ' + m.text[:300]) if m.type == 'error' and not IGNORED_CONSOLE.search(m.text) else None)
    return errs

def page(b, srv, t=None, **kw):
    """context(...) + a page whose errors are recorded on the checker `t` (see Test.page_errors)."""
    ctx = context(b, srv, **kw); pg = ctx.new_page()
    watch(pg, t.errs if t else None)
    return ctx, pg

# ------------------------------------------------------------------ page helpers
def poll(pg, js, timeout=30, arg=None, every=0.2):
    """Wait until the JS expression is truthy (exceptions count as false). Returns its value; raises TimeoutError."""
    t0 = time.time(); last = None
    while time.time() - t0 < timeout:
        try:
            v = pg.evaluate(js, arg) if arg is not None else pg.evaluate(js)
            if v: return v
        except Exception as e: last = e
        time.sleep(every)
    raise TimeoutError(f'poll timed out after {timeout}s: {js[:120]}' + (f' (last error: {last})' if last else ''))

VIEWS = ['#aboutView', '#toolView', '#discover', '#djView', '#crateView', '#mashupView', '#convertView', '#extendedView', '#pricingView', '#gateView', '#legalView', '#infoView']   # growth: #infoView = licenses / accessibility
def visible_views(pg):
    return pg.evaluate("s=>s.filter(x=>{const e=document.querySelector(x);return e&&!e.hidden})", VIEWS)

def wait_booted(pg, timeout=30):
    """App script ran and the router picked a view."""
    poll(pg, "window.CR&&document.readyState==='complete'&&%s.some(x=>{const e=document.querySelector(x);return e&&!e.hidden})" % json.dumps(VIEWS), timeout)

def wait_idle(pg, timeout=90):
    """Wait until no analysis is running (#busy hidden). Reloading/navigating while the boot-time demo analysis runs
    can stall for 10-30 s in headless Chromium, so tests call this before pg.reload()/pg.goto() of a booted page."""
    poll(pg, "!document.querySelector('#busy')||document.querySelector('#busy').hidden", timeout)

def reload(pg, timeout=90):
    wait_idle(pg, timeout); pg.reload(); wait_booted(pg)

def wait_tool_song(pg, prefix=None, timeout=60):
    """Tool finished analysing a song (optionally whose title starts with prefix)."""
    js = "document.querySelector('#busy').hidden&&document.querySelector('#sBpm').value!=='—'&&!document.querySelector('#tname').textContent.includes('—')"
    if prefix: js += "&&document.querySelector('#tname').textContent.startsWith(%s)" % json.dumps(prefix)
    poll(pg, js, timeout)

def sign_up(pg, username='oshri', email='o@x.com', password='password9', wait=True):
    """Create + sign in an account through the mock backend (username 'oshri' = admin)."""
    pg.evaluate("a=>Backend.signUp(a)", {'username': username, 'email': email, 'password': password})
    if wait: poll(pg, "!!(window.Backend&&Backend.user)&&!document.querySelector('#accBtn').hidden", 10)
    time.sleep(0.3)

def sign_in(pg, email='dana@example.com', password='password1', wait=True):
    pg.evaluate("a=>Backend.signIn(a)", {'email': email, 'password': password})
    if wait: poll(pg, "!!(window.Backend&&Backend.user)&&!document.querySelector('#accBtn').hidden", 10)
    time.sleep(0.3)

def sign_out(pg):
    pg.evaluate("Backend.signOut()"); poll(pg, "!(window.Backend&&Backend.user)", 10); time.sleep(0.3)

def close_dialogs(pg):
    pg.evaluate("document.querySelectorAll('.dlgwrap').forEach(d=>d.hidden=true)")

def rect(pg, sel):
    return pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}}", sel)

def overlap(a, c): return not (a['r'] <= c['l'] or c['r'] <= a['l'] or a['b'] <= c['t'] or c['b'] <= a['t'])

def page_luma(pg, sel='body'):
    """Relative luminance 0..255 of the first non-transparent background from `sel` up to <html>."""
    return pg.evaluate("""s=>{let e=document.querySelector(s);while(e){const c=getComputedStyle(e).backgroundColor,m=c.match(/[\\d.]+/g).map(Number);
      if(m.length<4||m[3]>0)return Math.round(0.2126*m[0]+0.7152*m[1]+0.0722*m[2]);e=e.parentElement}return 255}""", sel)

def scroll_width(pg): return pg.evaluate("document.documentElement.scrollWidth")

# add as context(init=CSP_INIT): records CSP violations of every document in window.__viol
CSP_INIT = r"""window.__viol=[];document.addEventListener('securitypolicyviolation',e=>window.__viol.push(e.effectiveDirective+' '+String(e.blockedURI).slice(0,80)+' '+(e.sample||'').slice(0,40)),true);"""
def csp_violations(pg): return pg.evaluate("window.__viol||[]")

def fixture(name): return os.path.join(FIX, name)

# ------------------------------------------------------------------ checker
class Test:
    def __init__(self, name):
        self.name, self.ok, self.bad, self.errs, self.allow_errors = name, 0, [], [], []
        self.t0 = time.time()
    def check(self, label, cond, info=''):
        cond = bool(cond)
        if cond: self.ok += 1
        else: self.bad.append(label)
        print(('  ok  ' if cond else '  FAIL'), f'{label:<64}', str(info).replace('\n', ' ⏎ ')[:180], flush=True)
        return cond
    def known(self, label, cond, info=''):
        """A known app issue: reported, never fails the test. Prints FIXED? once it starts passing."""
        self.known_n = getattr(self, 'known_n', 0) + (0 if cond else 1)
        print(('  FIXED?' if cond else '  KNOWN'), f'{label:<64}', str(info).replace('\n', ' ⏎ ')[:180], flush=True)
    def eq(self, label, got, want):
        return self.check(label, got == want, f'got {got!r}' + ('' if got == want else f', want {want!r}'))
    def section(self, s): print(f'== {s}  [{time.time() - self.t0:.0f}s]', flush=True)
    def shot(self, pg, name, **kw):
        os.makedirs(SHOTS, exist_ok=True)
        try: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), **kw)
        except Exception as e: print('  (screenshot failed:', e, ')')
    def page_errors(self, label='no page errors / console errors'):
        errs = [e for e in self.errs if not any(re.search(a, e) for a in self.allow_errors)]
        self.check(label, not errs, errs[:6])
        self.errs.clear()
    def finish(self):
        dt = time.time() - self.t0
        kn = getattr(self, 'known_n', 0)
        print(f'\n{self.name}: {self.ok} ok, {len(self.bad)} failed' + (f', {kn} known issue(s)' if kn else '') + f' ({dt:.1f}s)' + (f' → {self.bad}' if self.bad else ''), flush=True)
        if os.path.isdir(SHOTS): print('screenshots:', SHOTS)
        return 1 if self.bad else 0

def main(fn=None, *, csp=True, check_errors=True):
    """Decorator: run fn(t, srv, browser) with a fresh server + Chromium, then sys.exit(0|1)."""
    def run(fn):
        from playwright.sync_api import sync_playwright
        t = Test(TEST_NAME); srv = Server(csp=csp); code = 1
        try:
            with sync_playwright() as p:
                b = p.chromium.launch(headless=os.environ.get('CR_HEADED') != '1', slow_mo=int(os.environ.get('CR_SLOWMO') or 0),
                                      args=['--autoplay-policy=no-user-gesture-required'])
                try:
                    fn(t, srv, b)
                    if check_errors: t.page_errors()
                except Exception as e:
                    t.check(f'test raised {type(e).__name__}', False, str(e)[:300])
                    traceback.print_exc()
                finally:
                    try: b.close()
                    except Exception: pass
            code = t.finish()
        finally:
            srv.stop()
        sys.exit(code)
    return run(fn) if fn else run
