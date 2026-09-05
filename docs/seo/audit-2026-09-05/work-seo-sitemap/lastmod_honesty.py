#!/usr/bin/env python3
"""Classify every sitemap lastmod against git (non-sweep / any) and JSON-LD dateModified; stratified 25 sample."""
import json, re, os, subprocess
from pathlib import Path
from collections import Counter, defaultdict
S = Path('/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad')
WT = S/'wt'; SITE='https://simplememofast.com'
THRESH = 40
sm = json.load(open(S/'work-seo-sitemap/sitemap_urls.json'))
def file_for(u):
    p = u[len(SITE):]
    if p == '/': return 'index.html'
    return p[1:]+'index.html' if p.endswith('/') else p[1:]+'.html'
env = {**os.environ, 'TZ':'Asia/Tokyo'}
out = subprocess.run(['git','log','--format=%x01%cd %h %s','--date=format-local:%Y-%m-%d','--name-only'],
                     cwd=WT, capture_output=True, text=True, check=True, env=env).stdout
nonsweep, anyc, added = {}, {}, {}
bydate = defaultdict(list)   # file -> [(date, hash, nhtml, subject)]
for chunk in out.split('\x01'):
    if not chunk.strip(): continue
    lines = chunk.strip().splitlines(); head = lines[0]; files=[l.strip() for l in lines[1:] if l.strip()]
    d, h, subj = head[:10], head[11:19], head[20:]
    html=[f for f in files if f.endswith('.html')]
    sweep = len(html) > THRESH
    for f in files:
        anyc.setdefault(f, d)
        if not sweep: nonsweep.setdefault(f, d)
        bydate[f].append((d, h, len(html), subj, sweep))
        added[f] = d  # last seen in newest-first order = oldest commit = add date
def jsonld_dates(u):
    p = u[len(SITE):]
    fn = 'root.html' if p=='/' else p.strip('/').replace('/','_') + ('.html' if not p.endswith('/') else '.html')
    cands = [S/'crawl/pages'/fn, S/'crawl/pages'/(p.strip('/').replace('/','_')+'.html'), S/'crawl/pages'/(p.replace('/','_').strip('_')+'.html')]
    for c in cands:
        if c.exists():
            t = c.read_text(errors='replace')
            dm = re.findall(r'"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})', t)
            dp = re.findall(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})', t)
            return (max(dm) if dm else None, max(dp) if dp else None, c.name)
    return (None, None, None)
rows = []
for u, info in sm.items():
    f = file_for(u); pub = info['lastmod']
    ns, an = nonsweep.get(f, ''), anyc.get(f, '')
    on_date = [c for c in bydate.get(f, []) if c[0]==pub]
    dm, dp, fn = jsonld_dates(u)
    if pub == ns: cls = 'honest(git non-sweep)'
    elif pub < ns: cls = 'UNDERSTATED(non-sweep edit after lastmod)'
    else:
        if not on_date: cls = 'INFLATED-orphan(no commit on that date)'
        elif all(c[4] for c in on_date): cls = 'INFLATED-sweep-stamp(only >40-file commits on that date)'
        else: cls = 'honest(small commit on date, later sweep-squashed?)'
    rows.append(dict(url=u, file=f, lastmod=pub, git_nonsweep=ns, git_any=an, added=added.get(f,''), on_date=[(c[1],c[2],c[3][:60]) for c in on_date], jsonld_mod=dm, jsonld_pub=dp, cls=cls))
json.dump(rows, open(S/'work-seo-sitemap/lastmod_rows.json','w'), indent=1, ensure_ascii=False)
print("## classification of all 261")
for k,v in Counter(r['cls'] for r in rows).most_common(): print(f"  {v:4d}  {k}")
print("\n## sweep-stamp dates & commits (what stamped them)")
sc = Counter()
for r in rows:
    if 'sweep-stamp' in r['cls']:
        for h,n,s in r['on_date']: sc[(r['lastmod'],h,n,s)] += 1
for k,v in sc.most_common(12): print(f"  {v:4d}  {k}")
print("\n## understated list")
for r in rows:
    if 'UNDERSTATED' in r['cls']: print("  ", r['lastmod'], '< git', r['git_nonsweep'], r['url'])
print("\n## orphan list")
for r in rows:
    if 'orphan' in r['cls']: print("  ", r['lastmod'], 'git_any', r['git_any'], r['url'])
print("\n## JSON-LD dateModified vs lastmod")
have = [r for r in rows if r['jsonld_mod']]
print("pages with dateModified:", len(have), "/ 261; pages w/o:", 261-len(have))
c = Counter('lastmod==dm' if r['lastmod']==r['jsonld_mod'] else ('lastmod>dm' if r['lastmod']>r['jsonld_mod'] else 'lastmod<dm') for r in have)
print(dict(c))
gt = sorted((r['lastmod'], r['jsonld_mod'], r['url']) for r in have if r['lastmod'] < r['jsonld_mod'])
print("lastmod OLDER than JSON-LD dateModified (sitemap understates page's own claim):", len(gt))
for g in gt[:20]: print("   ", g)
# ---------- stratified 25 sample ----------
print("\n## 25-URL STRATIFIED SAMPLE (deterministic: sorted by URL, every k-th)")
def pick(lst, n):
    lst = sorted(lst, key=lambda r: r['url'])
    if len(lst) <= n: return lst
    step = len(lst)/n
    return [lst[int(i*step)] for i in range(n)]
recent = [r for r in rows if '2026-08-25' <= r['lastmod'] <= '2026-09-02']
older = [r for r in rows if r['lastmod'] < '2026-08-25']
new = [r for r in rows if r['added'] >= '2026-07-01']
print(f"strata sizes: recent(08-25..09-02)={len(recent)} older(<08-25)={len(older)} new-since-July={len(new)}")
sample = pick(recent,10) + pick([r for r in older if r not in recent],10) + pick([r for r in new if r not in recent[:0]],5)
seen=set()
print("| # | URL | lastmod | git non-sweep | git any | JSON-LD dateModified | added | class |")
for i,r in enumerate(sample,1):
    print(f"| {i} | {r['url'][len(SITE):]} | {r['lastmod']} | {r['git_nonsweep']} | {r['git_any']} | {r['jsonld_mod']} | {r['added']} | {r['cls']} |")
print("\nsample class counts:", Counter(r['cls'] for r in sample))
