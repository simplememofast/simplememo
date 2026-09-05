import json, re
from collections import Counter, defaultdict
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
D=json.load(open(S+'/work-seo-schema/census.json')); R=D['results']
print("=== (a) AggregateRating / SoftwareApplication locations")
import os
from bs4 import BeautifulSoup
def walk(node,out):
    if isinstance(node,dict):
        if '@type' in node: out.append(node)
        for v in node.values(): walk(v,out)
    elif isinstance(node,list):
        for x in node: walk(x,out)
ar=[]; sa=[]; faqpp=Counter(); faq_nested=0
for f in sorted(os.listdir(S+'/crawl/pages')):
    soup=BeautifulSoup(open(S+'/crawl/pages/'+f,encoding='utf-8',errors='replace').read(),'html.parser')
    for i,sc in enumerate(soup.find_all('script',type='application/ld+json')):
        try: d=json.loads(sc.string or sc.get_text())
        except: continue
        ns=[]; walk(d,ns)
        for n in ns:
            t=n.get('@type'); ts=t if isinstance(t,list) else [t]
            if 'AggregateRating' in ts: ar.append((f,i,n.get('ratingValue'),n.get('ratingCount')))
            if 'SoftwareApplication' in ts or 'MobileApplication' in ts: sa.append((f,i,n.get('@id'),n.get('name'),n.get('softwareVersion'),'aggregateRating' in n, ts[0]))
            if 'FAQPage' in ts: faqpp[f]+=1
        # top-level types
print("AggregateRating", len(ar));
for x in ar: print("  ",x)
print("SoftwareApplication", len(sa))
for x in sa: print("  ",x)
print("=== (h) FAQPage per page: pages", len(faqpp), "multi:", {k:v for k,v in faqpp.items() if v>1})
print("=== (b) issue classes")
cc=Counter(); ex={}
for f,r in R.items():
    for i in r['issues']:
        k=(i['sev'],re.sub(r'\d+','N',i['msg'])); cc[k]+=1; ex.setdefault(k,[]).append((i['loc'],i['ev']))
for k,v in sorted(cc.items()): print(f"{v:4d} {k[0]:8s} {k[1]}  e.g. {ex[k][0]}")
print("=== (c) FAQ parity")
tq=sum(r['faq']['q'] for r in R.values()); nm=[(f,r['faq']['name_miss']) for f,r in R.items() if r['faq']['name_miss']]; am=[(f,r['faq']['ans_miss']) for f,r in R.items() if r['faq']['ans_miss']]
print("total Q",tq,"pages with FAQ",sum(1 for r in R.values() if r['faq']['q']),"name_miss pages",len(nm),"Q",sum(len(x[1]) for x in nm),"ans_miss pages",len(am),"Q",sum(len(x[1]) for x in am))
for f,q in nm: print("  NAME", f, R[f]['wt'], len(q), [x[:50] for x in q[:3]])
for f,q in am: print("  ANS ", f, R[f]['wt'], len(q), [x[:50] for x in q[:3]])
print("=== (d) cross-page @id conflicts (distinct definitions)")
for k,v in D['id_defs_global'].items():
    dist=Counter(x[2] for x in v)
    if len(dist)>1 and (k.endswith('#app') or k.endswith('#organization') or k.endswith('#website') or k.endswith('#person') or k.endswith('#author') or '#' in k and len(v)>2):
        print(f"  {k}: {len(v)} defs, {len(dist)} distinct")
        if len(dist)<=6:
            for j,(s,c) in enumerate(dist.most_common()): print(f"     [{c}x] {s[:300]}")
print("=== (e) sameAs distinct")
for u,c in sorted(D['sameas'].items(), key=lambda x:-x[1]): print(f"  {c:4d} {u}")
print("=== (f) held/regressed evidence")
r=R.get('en_send-email-to-yourself.html'); print("send-email ItemLists:", r and r.get('itemlists'))
for f in ('root.html','en.html'):
    print(f, "types", R[f]['types'], "issues", R[f]['issues'])
print("=== (g) dangling"); dang=Counter()
for f,r in R.items():
    for d in r.get('dangling',[]): dang[d]+=1
print(dang.most_common(20))
print("=== 07-07 item 2/3 pages");
for f in ('blog_meeting-memo-template.html','blog_memo-app-encryption-comparison.html','blog_memo-app-privacy.html','en_blog_best-note-to-self-apps-2026.html','en_blog_ios26-speechanalyzer-live-mic.html','hands-free.html','faq.html','blog_line-keep-alternative.html','en_obsidian.html','en_faq.html','vs_captioo.html','blog_memo-app-hikaku-matome.html','en_apple-watch.html'):
    r=R.get(f); print(f, r and (r['faq']['q'], len(r['faq']['name_miss']), len(r['faq']['ans_miss'])))
print("=== item 21 watch LPs about:");
for f in ('apple-watch-obsidian.html','en_apple-watch-obsidian.html'):
    src=open(S+'/crawl/pages/'+f,encoding='utf-8').read(); print(f, re.findall(r'"about"\s*:\s*\{[^}]{0,120}',src)[:2])
print("=== website/search"); print([(f,r.get('search_target'),r.get('website_no_search')) for f,r in R.items() if 'WebSite' in r['types']])
print("=== #app pages"); print([(f,r['app']['softwareVersion'],r['app']['rating']) for f,r in R.items() if r.get('app')])
