"""SEO & sharing: Hebrew <title>/description, canonical, Open Graph + Twitter tags pointing at a real 1200×630 PNG
(< 200 KB), PNG icons + apple-touch-icon, an installable manifest (valid JSON, PNG 192/512 + maskable), robots.txt and
sitemap.xml served with 200 (not hidden by _headers/_middleware), and the middleware's HIDDEN regex leaves them alone."""
import os, sys, re, json, struct, urllib.request
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

def get(url):
    with urllib.request.urlopen(url) as r: return r.status, r.headers, r.read()

def png_size(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    return struct.unpack('>II', data[16:24])

@lib.main
def test(t, srv, b):
    html = open(os.path.join(lib.REPO, 'index.html'), encoding='utf-8').read()
    head = html.split('</head>')[0]
    meta = lambda attr, name: (re.search(r'<meta\s+%s="%s"\s+content="([^"]*)"' % (attr, re.escape(name)), head) or [None, None])[1]
    title = re.search(r'<title>([^<]*)</title>', head).group(1)
    t.check('title is descriptive and Hebrew', 'Chord Room' in title and re.search(r'[֐-׿]', title) and len(title) > 20, title)
    desc = meta('name', 'description') or ''
    t.check('description in Hebrew, 50–320 chars', re.search(r'[֐-׿]', desc) and 50 < len(desc) < 320, len(desc))
    t.check('canonical link', re.search(r'<link rel="canonical" href="https://[^"]+/"', head))
    for k in ['og:type', 'og:site_name', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:locale']:
        t.check(f'{k} present', meta('property', k), k)
    for k in ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']:
        t.check(f'{k} present', meta('name', k), k)
    t.eq('twitter card = summary_large_image', meta('name', 'twitter:card'), 'summary_large_image')
    og = meta('property', 'og:image')
    t.check('og:image is absolute https', og and og.startswith('https://'), og)
    t.check('apple-touch-icon + png icon links', 'rel="apple-touch-icon"' in head and 'type="image/png"' in head)

    t.section('files served')
    path = og.split('/', 3)[3]
    st, h, data = get(srv.url(path))
    t.eq('og image 200', st, 200)
    w, hh = png_size(data)
    t.eq('og image 1200×630', [w, hh], [1200, 630])
    t.check('og image < 200 KB', len(data) < 200 * 1024, len(data))
    # _headers detaches the site-wide same-site CORP for og.png (lib's _headers model drops the detached header entirely)
    t.check('og image not locked to same-site (CORP) for preview bots', (h.get('Cross-Origin-Resource-Policy') or 'cross-origin').lower() == 'cross-origin', h.get('Cross-Origin-Resource-Policy'))
    st, h, data = get(srv.url('manifest.webmanifest'))
    t.eq('manifest 200', st, 200)
    m = json.loads(data.decode('utf-8'))
    icons = m.get('icons', [])
    t.check('manifest: name, start_url, display standalone', m.get('name') and m.get('start_url') and m.get('display') == 'standalone', m)
    t.check('manifest: png 192 + 512 + maskable', any(i['sizes'] == '192x192' and i['type'] == 'image/png' for i in icons) and any(i['sizes'] == '512x512' and i['type'] == 'image/png' and i.get('purpose') != 'maskable' for i in icons) and any(i.get('purpose') == 'maskable' for i in icons), icons)
    for i in icons:
        st, _, data = get(srv.url(i['src']))
        ok = st == 200 and (i['type'] != 'image/png' or list(png_size(data)) == [int(x) for x in i['sizes'].split('x')])
        t.check(f'icon {i["src"]} served with the declared size', ok, (st, i['sizes']))
    st, _, data = get(srv.url('assets/apple-touch-icon.png'))
    t.check('apple-touch-icon 180×180', st == 200 and list(png_size(data)) == [180, 180])
    st, h, data = get(srv.url('robots.txt'))
    t.check('robots.txt 200, allows /, names the sitemap', st == 200 and b'Allow: /' in data and b'Sitemap: https://' in data and b'<html' not in data.lower(), data[:80])
    st, h, data = get(srv.url('sitemap.xml'))
    t.check('sitemap.xml 200 and well-formed', st == 200 and data.startswith(b'<?xml') and b'<urlset' in data and b'<loc>https://' in data, data[:80])
    import xml.etree.ElementTree as ET
    locs = [u.text for u in ET.fromstring(data).iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    t.check('sitemap lists home, pricing, terms, privacy', len(locs) >= 4 and any(l.endswith('/') for l in locs) and any('#pricing' in l for l in locs), locs)
    # the middleware must not hide these (its HIDDEN regex lives in functions/_middleware.js)
    mw = open(os.path.join(lib.REPO, 'functions', '_middleware.js'), encoding='utf-8').read()
    rx = re.search(r'const HIDDEN = /(.*)/i;', mw).group(1)
    js_rx = re.compile(rx.replace('(?:', '(?:'), re.I)
    for p in ['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/assets/og.png', '/assets/icon-192.png']:
        t.check(f'middleware does not hide {p}', not js_rx.search(p), rx)
    routes = json.load(open(os.path.join(lib.REPO, '_routes.json')))
    t.check('_routes.json does not route robots/sitemap through the Function', not any(re.fullmatch(re.escape(i).replace(r'\*', '.*'), '/robots.txt') or re.fullmatch(re.escape(i).replace(r'\*', '.*'), '/sitemap.xml') for i in routes['include']), routes['include'])

    t.section('in the browser')
    ctx, pg = lib.page(b, srv, t, mock=True, lang='he', init=lib.CSP_INIT)
    pg.goto(srv.url()); lib.wait_booted(pg)
    t.check('document.title on home', pg.title().startswith('Chord Room'), pg.title())
    t.check('manifest link resolves', pg.evaluate("!!document.querySelector('link[rel=manifest]')"))
    t.eq('no CSP violations', lib.csp_violations(pg), [])
    ctx.close()
