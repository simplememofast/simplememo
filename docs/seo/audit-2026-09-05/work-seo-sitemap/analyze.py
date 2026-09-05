#!/usr/bin/env python3
"""Sitemap structure / coverage / hreflang / freshness analysis (read-only)."""
import json, re, sys
from pathlib import Path
from collections import Counter, defaultdict
import xml.etree.ElementTree as ET

S = Path('/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad')
WT = S/'wt'
SITE = 'https://simplememofast.com'
SM = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
XH = '{http://www.w3.org/1999/xhtml}'
MINOR = {"ar","es","id","ko","pt-BR","tr","zh","zh-Hant"}
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

# ---------- 1. structure ----------
print("## 1. STRUCTURE")
idx = ET.parse(WT/'sitemap.xml').getroot()
print("index root tag:", idx.tag)
children = []
for sm in idx.findall(SM+'sitemap'):
    children.append((sm.find(SM+'loc').text.strip(), sm.find(SM+'lastmod').text.strip()))
print("index children:", children)

sitemap_urls = {}   # url -> (child, lastmod, alternates[(hreflang, href)])
child_sets = {}
for child_loc, child_lm in children:
    name = child_loc.rsplit('/',1)[1]
    root = ET.parse(WT/name).getroot()
    assert root.tag == SM+'urlset', root.tag
    ns_ok = 'xmlns:xhtml' in (WT/name).read_text()[:300]
    entries = []
    for u in root.findall(SM+'url'):
        loc = u.find(SM+'loc').text.strip()
        lm = u.find(SM+'lastmod')
        lm = lm.text.strip() if lm is not None else None
        alts = [(l.get('hreflang'), l.get('href')) for l in u.findall(XH+'link')]
        extra = [c.tag for c in u if c.tag not in (SM+'loc', SM+'lastmod', XH+'link')]
        entries.append((loc, lm, alts, extra))
    child_sets[name] = entries
    lms = [e[1] for e in entries]
    print(f"{name}: {len(entries)} urls, xhtml ns declared={ns_ok}, max lastmod={max(lms)}, index says={child_lm}, "
          f"index==max? {child_lm==max(lms)}; extra tags (priority/changefreq)={sum(1 for e in entries if e[3])}")
    for loc, lm, alts, extra in entries:
        if loc in sitemap_urls:
            print("  DUP ACROSS CHILDREN:", loc, "also in", sitemap_urls[loc][0])
        sitemap_urls[loc] = (name, lm, alts)
        # per-URL validity
        probs = []
        if not loc.startswith(SITE+'/'): probs.append('not absolute https apex')
        path = loc[len(SITE):]
        if '.html' in path: probs.append('.html ext')
        if '//' in path: probs.append('double slash')
        if '?' in path or '#' in path: probs.append('query/fragment')
        if not (path.endswith('/') or re.search(r'/[^/]+$', path)): probs.append('odd form')
        if lm is None or not DATE_RE.match(lm): probs.append(f'bad lastmod {lm}')
        if loc != loc.strip(): probs.append('whitespace')
        # locale routing
        rest = path
        want = 'sitemap-en.xml' if rest.startswith('/en/') else ('sitemap-locales.xml' if rest.strip('/') in MINOR else 'sitemap-ja.xml')
        if want != name: probs.append(f'WRONG CHILD (should be {want})')
        if probs: print("  PROB", loc, probs)
    # dup within child
    c = Counter(e[0] for e in entries)
    for k,v in c.items():
        if v>1: print("  DUP WITHIN", name, k, v)
print("total unique sitemap URLs:", len(sitemap_urls))
# trailing slash / extension conventions
conv = Counter()
for loc in sitemap_urls:
    p = loc[len(SITE):]
    conv['dir/' if p.endswith('/') else 'extless-file'] += 1
print("URL form convention:", dict(conv))

# ---------- 2. coverage vs checkout ----------
print("\n## 2. COVERAGE vs CHECKOUT")
NOINDEX_RE = re.compile(r'<meta\s+[^>]*name="robots"[^>]*>', re.I)
def url_for_file(f: Path):
    rel = f.relative_to(WT).as_posix()
    parts = rel.split('/')
    if parts[0] in {"node_modules","admin","drafts","docs","scripts","js","assets","functions","screenshots","tools","tiktok",".git",".github",".claude","build","growth","fixtures","templates","data"}:
        return None
    if rel == '404.html': return None
    if rel == 'index.html': return SITE+'/'
    if rel.endswith('/index.html'): return SITE+'/'+rel[:-len('index.html')]
    if rel.endswith('.html'): return SITE+'/'+rel[:-len('.html')]
    return None
def is_noindex(f: Path):
    head = f.read_text(encoding='utf-8', errors='replace')
    for m in NOINDEX_RE.finditer(head):
        tag = m.group(0)
        cm = re.search(r'content="([^"]*)"', tag, re.I)
        if cm and 'noindex' in cm.group(1).lower(): return True
    return False
all_html = sorted(WT.rglob('*.html'))
all_html = [f for f in all_html if 'node_modules' not in f.parts]
print("html files in checkout (excl node_modules):", len(all_html))
checkout_urls = {}
noindex_files = []
skipped_dirs = Counter()
for f in all_html:
    u = url_for_file(f)
    if u is None:
        skipped_dirs[f.relative_to(WT).parts[0]] += 1
        continue
    if is_noindex(f):
        noindex_files.append(f.relative_to(WT).as_posix()); continue
    checkout_urls[u] = f.relative_to(WT).as_posix()
print("skipped by dir/404:", dict(skipped_dirs))
print("noindex files (excluded):", noindex_files)
print("indexable checkout URLs:", len(checkout_urls))
missing = sorted(set(checkout_urls) - set(sitemap_urls))
extra = sorted(set(sitemap_urls) - set(checkout_urls))
print("MISSING from sitemap (in checkout, indexable):", missing)
print("EXTRA in sitemap (no indexable file):", extra)
# noindex pages that ARE in sitemap
for nf in noindex_files:
    u = url_for_file(WT/nf)
    if u in sitemap_urls: print("  NOINDEX IN SITEMAP:", u)
# tiktok is excluded by generator; check its robots
tk = WT/'tiktok/index.html'
print("tiktok/index.html noindex?", is_noindex(tk), "in sitemap?", (SITE+'/tiktok/') in sitemap_urls)

# ---------- 3. coverage vs live crawl ----------
print("\n## 3. COVERAGE vs LIVE CRAWL")
crawl = {}
for line in open(S/'crawl/crawl.jsonl'):
    r = json.loads(line); crawl[r['url']] = r
print("crawl records:", len(crawl))
not_crawled = [u for u in sitemap_urls if u not in crawl]
print("sitemap URLs not in crawl:", not_crawled)
bad = []
for u in sitemap_urls:
    r = crawl.get(u)
    if not r: continue
    issues = []
    if r['status'] != 200: issues.append(f"status {r['status']}")
    if r.get('hops'): issues.append(f"redirect hops {r['hops']}")
    if r.get('final_url') != u: issues.append(f"final {r.get('final_url')}")
    if r.get('canonical') != u: issues.append(f"canonical {r.get('canonical')}")
    rb = (r.get('robots') or '').lower()
    if 'noindex' in rb: issues.append(f"robots {rb}")
    xr = (r.get('x_robots') or '').lower()
    if 'noindex' in xr: issues.append(f"x-robots {xr}")
    if 'text/html' not in (r.get('content_type') or ''): issues.append(f"ctype {r.get('content_type')}")
    if issues: bad.append((u, issues))
print("sitemap URLs with live problems:", len(bad))
for b in bad: print("  ", b)
# crawled 200 pages not in sitemap
c200 = [u for u,r in crawl.items() if r['status']==200 and u not in sitemap_urls]
print("crawled 200 but NOT in sitemap:", len(c200))
for u in c200:
    r = crawl[u]; print("   ", u, "| robots:", r.get('robots'), "| x_robots:", r.get('x_robots'), "| canonical:", r.get('canonical'))
c404 = [(u, crawl[u]['status']) for u in crawl if crawl[u]['status']!=200]
print("crawled non-200:", c404)

# ---------- 4. hreflang: sitemap vs on-page ----------
print("\n## 4. HREFLANG sitemap vs on-page")
mism = 0; with_alts = 0; onpage_only = 0
for u,(name, lm, alts) in sitemap_urls.items():
    r = crawl.get(u)
    if not r: continue
    sm_set = set((h, href) for h, href in alts)
    pg_set = set((h, href) for h, href in (r.get('hreflang') or []))
    if sm_set: with_alts += 1
    if sm_set != pg_set:
        mism += 1
        if not sm_set and pg_set: onpage_only += 1
        print("  MISMATCH", u, "| sitemap-only:", sorted(sm_set-pg_set), "| page-only:", sorted(pg_set-sm_set))
print(f"URLs with sitemap alternates: {with_alts}; mismatches: {mism} (of which on-page has hreflang but sitemap none: {onpage_only})")
# return-link check within sitemap groups
groups = defaultdict(set)
for u,(name,lm,alts) in sitemap_urls.items():
    for h,href in alts:
        if h!='x-default': groups[u].add(href)
bad_ret = 0
for u, hrefs in groups.items():
    for h in hrefs:
        if h not in sitemap_urls: print("  ALT NOT IN SITEMAP:", u, "->", h); bad_ret+=1
        elif u not in groups.get(h, set()): print("  NO RETURN:", u, "->", h); bad_ret+=1
print("sitemap hreflang groups:", len(groups), "return-link defects:", bad_ret)

# ---------- 5. freshness ----------
print("\n## 5. FRESHNESS")
hist = Counter(lm[:7] for _,(n,lm,_) in sitemap_urls.items())
for k in sorted(hist): print(f"  {k}: {hist[k]}")
old = sorted((lm,u) for u,(n,lm,_) in sitemap_urls.items() if lm < '2026-06-01')
print("lastmod < 2026-06-01:", len(old))
for lm,u in old: print("   ", lm, u)
per_child = {n: Counter(e[1][:7] for e in es) for n,es in child_sets.items()}
for n,c in per_child.items(): print(n, dict(sorted(c.items())))
print("identical-lastmod check: most common date", Counter(lm for _,(n,lm,_) in sitemap_urls.items()).most_common(5))

json.dump({u: {'child':n,'lastmod':lm,'file':checkout_urls.get(u)} for u,(n,lm,_) in sitemap_urls.items()},
          open(S/'work-seo-sitemap/sitemap_urls.json','w'), indent=1, ensure_ascii=False)
