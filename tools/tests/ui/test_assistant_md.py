"""Roomy's tiny markdown renderer (ROOMY._render) against hostile input: only P/BR/UL/OL/LI/STRONG/EM/CODE/A/DIV
elements, only href/class/data-rm-view/dir/start attributes, links only to the site's own views (#tool … #privacy,
#), nothing executes, and pathological input (5000 chars, 300 nested brackets) renders fast."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

P = [
 '<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<svg onload=alert(1)>', '"><img src=x onerror=alert(1)>',
 '[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x]( javascript:alert(1))', '[x](#tool" onmouseover="alert(1))', '[x](#tool onclick=alert(1))',
 '[x](data:text/html,<script>alert(1)</script>)', '[x](https://evil.example)', '[x](//evil.example)', '[x](#crate)', '[x](#)', '[x](#toolx)', '[x](#Tool)',
 '[<img src=x onerror=alert(1)>](#crate)', '**<b onclick=alert(1)>bold</b>**', '`<script>`', '*<i>it</i>*', '- <a href="javascript:alert(1)">li</a>',
 '1. [ok](#pricing) and [bad](vbscript:msgbox(1))', '&lt;img src=x onerror=alert(1)&gt;', '<iframe src="javascript:alert(1)">', '![img](https://evil.example/x.png)',
 '# heading <u>x</u>', '> quote <style>body{display:none}</style>', '```\n<script>alert(1)</script>\n```', '[[x](#crate)](javascript:alert(1))',
 '**[x](#dj)** _y_ `z`', '‮evil‬', 'a' * 5000, '[' * 300 + 'x' + ']' * 300 + '(' * 200,
]
WANT_LINKS = {'[x](#crate)': ['#crate'], '[x](#)': ['#'], '1. [ok](#pricing) and [bad](vbscript:msgbox(1))': ['#pricing'], '**[x](#dj)** _y_ `z`': ['#dj']}

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=True, init="window.__alert=0;window.alert=()=>{window.__alert++}")
    pg.goto(srv.url()); lib.wait_booted(pg); lib.poll(pg, "window.ROOMY&&ROOMY._render", 15)
    res = pg.evaluate("""(P)=>{const ALLOW=new Set(['P','BR','UL','OL','LI','STRONG','EM','CODE','A','DIV']),ATTR=new Set(['href','class','data-rm-view','dir','start']),H=new Set(['#tool','#discover','#dj','#crate','#pricing','#terms','#privacy','#']);
      const out=[];for(const s of P){const t0=performance.now();const d=document.createElement('div');d.append(ROOMY._render(s));const ms=performance.now()-t0;const bad=[];
        for(const e of d.querySelectorAll('*')){if(!ALLOW.has(e.tagName))bad.push('tag '+e.tagName);for(const a of e.attributes){if(!ATTR.has(a.name))bad.push('attr '+a.name);if(a.name==='href'&&!H.has(a.value))bad.push('href '+a.value)}}
        out.push({s,bad,links:[...d.querySelectorAll('a')].map(a=>a.getAttribute('href')),text:d.textContent.slice(0,70),ms:Math.round(ms)})}return out}""", P)
    for r in res:
        t.check('safe: ' + json.dumps(r['s'][:44], ensure_ascii=False), not r['bad'], r['bad'] or r['text'][:60])
        if r['s'] in WANT_LINKS: t.eq('  links of ' + r['s'][:30], r['links'], WANT_LINKS[r['s']])
    t.eq('nothing executed (alert count)', pg.evaluate('window.__alert'), 0)
    slow = max(r['ms'] for r in res)
    t.check('pathological input renders fast (< 250 ms)', slow < 250, f'{slow} ms')
