// growth: real page paths + link previews.
//  * functions/_middleware.js on /pricing, /terms, /privacy, /accessibility, /licenses, /tool, /about: index.html with the
//    page's own <title>, description, canonical, og:* and twitter:* (crawlers don't run JS); the page keeps the static
//    headers; PAGE_HEADERS (fallback) = the `/*` block of _headers, header by header; non-HTML / errors pass through
//  * _routes.json / _redirects / sitemap.xml list the same paths; no catch-all
//  * WhatsApp / Facebook preview rules on index.html: og:image absolute https PNG 1200×630 ≤ 300 KB with type/size/alt,
//    og:title ≤ 60, og:description ≤ 155 (also per page), og:url = canonical, twitter:card summary_large_image,
//    Hebrew-first description; robots.txt doesn't block crawlers
import { REPO } from './repo.mjs';
import fs from 'node:fs';
const mw = await import(REPO + '/functions/_middleware.js');
let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(66), String(info).slice(0, 140)); };

const html = fs.readFileSync(REPO + '/index.html', 'utf8');
const rules = []; let cur = null;
for (const line of fs.readFileSync(REPO + '/_headers', 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = { pat: line.trim(), h: {} }; rules.push(cur); continue; }
  const i = line.indexOf(':'); cur.h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
}
const root = rules.find(r => r.pat === '/*').h;
const meta = (h, attr, name) => { const m = new RegExp('<meta ' + attr + '="' + name.replace(/[:.]/g, '\\$&') + '" content="([^"]*)"').exec(h); return m ? m[1] : null; };
const canon = h => (/<link rel="canonical" href="([^"]*)"/.exec(h) || [])[1];
const title = h => (/<title>([^<]*)<\/title>/.exec(h) || [])[1];
const unesc = s => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

console.log('== middleware: per-page meta on the page paths');
const run = async (path, res) => {
  let passed = false;
  const r = await mw.onRequest({ request: new Request('https://chord-room.pages.dev' + path, { headers: { 'user-agent': 'facebookexternalhit/1.1' } }), next: async () => { passed = true; return res(); } });
  return { r, passed, body: await r.text() };
};
const page = () => new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', etag: '"abc"', 'content-security-policy': root['content-security-policy'], 'x-frame-options': 'DENY' } });
const CANON = canon(html).replace(/\/$/, '');
for (const p of ['/pricing', '/terms', '/privacy', '/accessibility', '/licenses', '/tool']) {
  const { r, passed, body } = await run(p, page);
  const [t0, d0] = mw.PAGE_META[p];
  check(`${p}: 200, static page served through next()`, r.status === 200 && passed, r.status);
  check(`${p}: <title> + og:title + twitter:title = the page`, unesc(title(body)) === t0 && unesc(meta(body, 'property', 'og:title')) === t0 && unesc(meta(body, 'name', 'twitter:title')) === t0, title(body));
  check(`${p}: description + og/twitter description`, unesc(meta(body, 'name', 'description')) === d0 && unesc(meta(body, 'property', 'og:description')) === d0 && unesc(meta(body, 'name', 'twitter:description')) === d0);
  check(`${p}: canonical = og:url = ${CANON}${p}`, canon(body) === CANON + p && meta(body, 'property', 'og:url') === CANON + p, canon(body));
  check(`${p}: the page CSP kept (not the API's default-src 'none'), no stale etag`, r.headers.get('content-security-policy') === root['content-security-policy'] && !r.headers.get('etag'));
  check(`${p}: og:title ≤ 60 and og:description ≤ 155 characters`, t0.length <= 60 && d0.length <= 155, `${t0.length} / ${d0.length}`);
  check(`${p}: og:image untouched (absolute https)`, meta(body, 'property', 'og:image') === meta(html, 'property', 'og:image'));
}
{
  const { r, body } = await run('/about', page);
  check('/about: index.html as is, canonical + og:url = the home page', r.status === 200 && canon(body) === CANON + '/' && meta(body, 'property', 'og:url') === CANON + '/' && title(body) === title(html));
  const v = await run('/Pricing/', page);
  check('/Pricing/ (case, trailing slash) → the pricing meta', unesc(title(v.body)) === mw.PAGE_META['/pricing'][0]);
  const noCsp = await run('/licenses', () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } }));
  check('a page response without headers gets PAGE_HEADERS', noCsp.r.headers.get('content-security-policy') === root['content-security-policy'] && noCsp.r.headers.get('x-frame-options') === 'DENY' && noCsp.r.headers.get('strict-transport-security') === root['strict-transport-security']);
  const js = await run('/pricing', () => new Response('{"x":1}', { status: 200, headers: { 'content-type': 'application/json' } }));
  check('non-HTML passes through untouched', js.body === '{"x":1}');
  const nf = await run('/pricing', () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }));
  check('an error status passes through untouched', nf.r.status === 404 && nf.body === 'nope');
  const hidden = await run('/supabase/schema.sql', page);
  check('hidden repo files are still 404 (not passed on)', hidden.r.status === 404 && !hidden.passed);
  const api = await run('/api/deezer/chart/0/tracks', () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  check('/api/* still gets the API headers', api.r.headers.get('content-security-policy') === "default-src 'none'; frame-ancestors 'none'");
  const inj = mw.pageHead('<title>x</title>\n<meta name="description" content="y">', '/pricing');
  check('meta values are attribute-escaped', !/content="[^"]*"[^>]*"/.test(inj));
}

console.log('== PAGE_HEADERS = the `/*` block of _headers');
for (const [k, v] of Object.entries(mw.PAGE_HEADERS)) check(`PAGE_HEADERS ${k} matches _headers`, root[k] === v, root[k] === v ? '' : `_headers: ${String(root[k]).slice(0, 60)}…`);
check('every `/*` header is in PAGE_HEADERS', Object.keys(root).every(k => k in mw.PAGE_HEADERS), Object.keys(root).filter(k => !(k in mw.PAGE_HEADERS)).join(' '));

console.log('== _routes.json / _redirects / sitemap.xml');
const routes = JSON.parse(fs.readFileSync(REPO + '/_routes.json', 'utf8'));
const PATHS = Object.keys(mw.PAGE_META);
check('_routes.json routes every page path through the middleware', PATHS.every(p => routes.include.includes(p)), routes.include.join(' '));
check('…without a catch-all, ≤ 100 rules', !routes.include.some(x => x === '/*' || x === '/**') && routes.include.length + routes.exclude.length <= 100);
check('…and never robots.txt / sitemap.xml / og.png', !routes.include.some(x => ['/robots.txt', '/sitemap.xml', '/assets/og.png', '/'].includes(x)));
const red = fs.readFileSync(REPO + '/_redirects', 'utf8').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).map(l => l.trim().split(/\s+/));
check('_redirects: every page path → / with status 200 (rewrite, no redirect chain)', PATHS.every(p => red.some(r => r[0] === p && r[1] === '/' && r[2] === '200')), JSON.stringify(red));
check('_redirects: no 301/302 redirects', red.every(r => r[2] === '200'));
const sm = fs.readFileSync(REPO + '/sitemap.xml', 'utf8'), locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
check('sitemap: home + every public page path, all on the canonical origin, no hash URLs', ['/', '/pricing', '/terms', '/privacy', '/accessibility', '/licenses', '/tool'].every(p => locs.includes(CANON + p)) && locs.every(l => l.startsWith(CANON) && !l.includes('#')), locs.join(' '));

console.log('== link previews (WhatsApp / Facebook / X)');
const ogi = meta(html, 'property', 'og:image');
check('og:image absolute https on the canonical origin', /^https:\/\//.test(ogi) && ogi.startsWith(CANON), ogi);
check('og:image:type image/png, width 1200, height 630, alt', meta(html, 'property', 'og:image:type') === 'image/png' && meta(html, 'property', 'og:image:width') === '1200' && meta(html, 'property', 'og:image:height') === '630' && !!meta(html, 'property', 'og:image:alt'));
const png = fs.readFileSync(REPO + '/assets/og.png');
check('og.png is a 1200×630 PNG ≤ 300 KB', png.slice(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630 && png.length <= 300 * 1024, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)} ${png.length} B`);
check('og:title ≤ 60, og:description ≤ 155', meta(html, 'property', 'og:title').length <= 60 && meta(html, 'property', 'og:description').length <= 155, `${meta(html, 'property', 'og:title').length} / ${meta(html, 'property', 'og:description').length}`);
check('og:description is Hebrew first', /^[֐-׿]/.test(meta(html, 'property', 'og:description')), meta(html, 'property', 'og:description').slice(0, 20));
check('og:url = canonical', meta(html, 'property', 'og:url') === canon(html));
check('twitter:card summary_large_image + twitter:image = og:image', meta(html, 'name', 'twitter:card') === 'summary_large_image' && meta(html, 'name', 'twitter:image') === ogi);
check('og:type website, og:site_name, og:locale he_IL', meta(html, 'property', 'og:type') === 'website' && meta(html, 'property', 'og:site_name') === 'Chord Room' && meta(html, 'property', 'og:locale') === 'he_IL');
const ogRule = rules.find(r => r.pat === '/assets/og.png');
check('og.png may be fetched cross-origin (CORP cross-origin) and cached', ogRule && ogRule.h['cross-origin-resource-policy'] === 'cross-origin' && /max-age=\d+/.test(ogRule.h['cache-control'] || ''));
const robots = fs.readFileSync(REPO + '/robots.txt', 'utf8');
check('robots.txt: User-agent * Allow /, no crawler singled out, / not disallowed', /User-agent: \*/.test(robots) && /Allow: \/\s/.test(robots) && !/facebookexternalhit|WhatsApp|Twitterbot/i.test(robots) && !/^Disallow: \/\s*$/m.test(robots) && !/Disallow: \/assets/.test(robots));

console.log(`\n${ok} ok, ${bad.length} failed`, bad);
process.exit(bad.length ? 1 : 0);
