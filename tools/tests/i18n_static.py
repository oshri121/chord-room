"""Static i18n checks (no browser): every he/en/ar/ru/es table group has the same keys in all five languages, and every
literal t('key') / data-i="key" in assets/*.js + index.html is defined in some table. Used by ui/test_bughunt.py."""
import re, sys, os, glob
LANGS = ('he', 'en', 'ar', 'ru', 'es')

def skip_str(s, i):
    q = s[i]; i += 1
    while i < len(s):
        c = s[i]
        if c == '\\': i += 2; continue
        if q == '`' and c == '$' and s[i+1:i+2] == '{':
            i = match_brace(s, i + 1) + 1; continue
        if c == q: return i + 1
        i += 1
    return i

def match_brace(s, i):
    """s[i] == '{' → index of the matching '}'"""
    d = 0
    while i < len(s):
        c = s[i]
        if c in '\'"`': i = skip_str(s, i); continue
        if c == '/' and s[i+1:i+2] == '/': i = s.find('\n', i); i = len(s) if i < 0 else i; continue
        if c == '/' and s[i+1:i+2] == '*': i = s.find('*/', i) + 2; continue
        if c in '{[(': d += 1
        elif c in '}])':
            d -= 1
            if d == 0: return i
        i += 1
    return i

def top_keys(body):
    """top-level keys of an object literal body (without the outer braces)"""
    keys, i, d, expect = [], 0, 0, True
    while i < len(body):
        c = body[i]
        if expect and d == 0:
            m = re.match(r'\s*(?:([A-Za-z_$][\w$]*)|\'([^\']*)\'|"([^"]*)")\s*:', body[i:])
            if m:
                keys.append(m.group(1) or m.group(2) or m.group(3)); i += m.end(); expect = False; continue
            m = re.match(r'\s*\.\.\.', body[i:])
            if m: i += m.end(); expect = False; continue
        if c in '\'"`': i = skip_str(body, i); continue
        if c in '{[(': d += 1
        elif c in '}])': d -= 1
        elif c == ',' and d == 0: expect = True
        i += 1
    return keys

def tables(src):
    """groups of {lang: keys} for each run of he/en/ar/ru/es object literals"""
    groups, cur, last_end = [], {}, -1
    for m in re.finditer(r'(?<![\w$.])(he|en|ar|ru|es)\s*:\s*\{', src):
        st = m.end() - 1
        if st < last_end: continue           # nested
        en = match_brace(src, st)
        lang = m.group(1)
        gap = src[last_end:m.start()] if last_end >= 0 else ''
        if lang in cur or (last_end >= 0 and not re.fullmatch(r'[\s,]*', gap)):
            if cur: groups.append(cur)
            cur = {}
        cur[lang] = (src.count('\n', 0, m.start()) + 1, top_keys(src[st + 1:en]))
        last_end = en + 1
    if cur: groups.append(cur)
    return groups

def check(repo):
    out = []
    for fn in sorted(glob.glob(os.path.join(repo, 'assets', '*.js'))):
        src = open(fn, encoding='utf-8').read()
        for g in tables(src):
            if len(g) < 2: continue
            allk = set().union(*[set(v[1]) for v in g.values()])
            for l in LANGS:
                if l not in g:
                    out.append((os.path.basename(fn), min(v[0] for v in g.values()), l, 'whole table missing', len(allk))); continue
                miss = sorted(allk - set(g[l][1]))
                if miss: out.append((os.path.basename(fn), g[l][0], l, 'missing', miss))
    return out


def undefined_keys(repo):
    defined = set()
    files = sorted(glob.glob(os.path.join(repo, 'assets', '*.js')))
    for fn in files:
        for g in tables(open(fn, encoding='utf-8').read()):
            for v in g.values(): defined |= set(v[1])
    used = {}
    for fn in files + [os.path.join(repo, 'index.html')]:
        src = open(fn, encoding='utf-8').read()
        # a literal key only: t('key') / t('key',{…}) / data-i="key" (dynamic keys like t('act_'+k) are skipped)
        for m in re.finditer(r'''(?<![\w$.])(?:t|tt|T|CR\.t)\(\s*(['"])([A-Za-z_]\w*)\1\s*[,)]|data-i[pt]?=(\\?["'])([A-Za-z_]\w*)\3''', src):
            k = m.group(2) or m.group(4)
            used.setdefault(k, os.path.basename(fn) + ':' + str(src.count('\n', 0, m.start()) + 1))
    return sorted((k, w) for k, w in used.items() if k not in defined)

if __name__ == '__main__':
    repo = sys.argv[1] if len(sys.argv) > 1 else '.'
    for r in check(repo): print('MISSING', r)
    for r in undefined_keys(repo): print('UNDEF', r)
