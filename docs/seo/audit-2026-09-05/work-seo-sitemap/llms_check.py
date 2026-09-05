import json, re
from pathlib import Path
S = Path('/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad')
txt = (S/'wt/llms.txt').read_text()
crawl = {json.loads(l)['url']: json.loads(l) for l in open(S/'crawl/crawl.jsonl')}
sm = json.load(open(S/'work-seo-sitemap/llms_dummy.json')) if False else None
smurls = set(json.load(open(S/'work-seo-sitemap/sitemap_urls.json')).keys())
# capture markdown link targets and bare URLs
raw = re.findall(r'https://simplememofast\.com[^\s)>\]"\'`]*', txt)
print("raw citations:", len(raw))
clean = []
for u in raw:
    u2 = u.rstrip('.,;:')
    frag = ''
    if '#' in u2: u2, frag = u2.split('#',1)
    clean.append((u, u2))
uniq = sorted(set(c for _,c in clean))
print("unique after strip fragment/punct:", len(uniq))
ok=0; bad=[]
for u in uniq:
    if u == 'https://simplememofast.com':
        print("  bare host (no slash):", u, "-> context:", [l.strip()[:120] for l in txt.splitlines() if 'https://simplememofast.com' in l and 'https://simplememofast.com/' not in l][:2]); continue
    if '<' in u: print("  placeholder:", u, "-> context:", [l.strip()[:120] for l in txt.splitlines() if u in l][:1]); continue
    r = crawl.get(u)
    if r is None: bad.append((u,'NOT IN CRAWL')); continue
    iss=[]
    if r['status']!=200: iss.append(f"status {r['status']}")
    if r.get('canonical')!=u: iss.append(f"canonical {r.get('canonical')}")
    if 'noindex' in (r.get('robots') or ''): iss.append('noindex')
    if u not in smurls: iss.append('not in sitemap')
    if iss: bad.append((u,iss))
    else: ok+=1
print("OK (live 200, self-canonical, in sitemap):", ok)
for b in bad: print("  BAD", b)
