#!/usr/bin/env python3
"""Technical-SEO analysis over the saved crawl (crawl.jsonl + pages/*.html)."""
import json, re, collections, os, sys
from urllib.parse import urlparse
from bs4 import BeautifulSoup
S="/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad"
recs=[json.loads(l) for l in open(f"{S}/crawl/crawl.jsonl")]
BASE="https://simplememofast.com"
def slug(url):
    p=urlparse(url).path; s=re.sub(r"[^A-Za-z0-9._-]+","_",p.strip("/")) or "root"; return s[:180]
# sitemap set
sm=set()
for f in ("sitemap-ja.xml","sitemap-en.xml","sitemap-locales.xml"):
    sm|=set(re.findall(r"<loc>([^<]+)</loc>",open(f"{S}/wt/{f}").read()))
print("sitemap URLs:",len(sm))
html200=[r for r in recs if r.get("status")==200 and "html" in (r.get("content_type") or "")]
byfinal={r["final_url"]:r for r in html200}
print("html 200 records:",len(html200),"unique final:",len(byfinal))
# ---- parse each body attribute-order-independently ----
P={}
for r in html200:
    fn=f"{S}/crawl/pages/{slug(r['final_url'])}.html"
    if not os.path.exists(fn): print("MISSING BODY",r['final_url'],fn); continue
    s=BeautifulSoup(open(fn,encoding="utf-8").read(),"html.parser")
    d={}
    robots=[m.get("content","") for m in s.find_all("meta") if (m.get("name") or "").lower()=="robots"]
    d["robots"]=robots
    d["canonical"]=[l.get("href") for l in s.find_all("link") if "canonical" in (l.get("rel") or [])]
    d["viewport"]=[m.get("content") for m in s.find_all("meta") if (m.get("name") or "").lower()=="viewport"]
    d["lang"]=(s.find("html") or {}).get("lang")
    d["title"]=[t.get_text(strip=True) for t in s.find_all("title")]
    d["h1"]=[h.get_text(" ",strip=True) for h in s.find_all("h1")]
    d["hreflang"]=[(l.get("hreflang"),l.get("href")) for l in s.find_all("link") if "alternate" in (l.get("rel") or []) and l.get("hreflang")]
    d["preload"]=[(l.get("as"),l.get("href")) for l in s.find_all("link") if "preload" in (l.get("rel") or [])]
    d["css"]=[l.get("href") for l in s.find_all("link") if "stylesheet" in (l.get("rel") or [])]
    d["scripts"]=[x.get("src") for x in s.find_all("script",src=True)]
    d["inline_style_fontface"]=sum(st.get_text().count("@font-face") for st in s.find_all("style"))
    d["datalang"]=len(s.find_all(attrs={"data-lang":True}))
    d["charset"]=bool(s.find("meta",charset=True)) or any("charset" in (m.get("content") or "") for m in s.find_all("meta"))
    d["ld_err"]=0
    for sc in s.find_all("script",type="application/ld+json"):
        try: json.loads(sc.string or "")
        except Exception: d["ld_err"]+=1
    P[r["final_url"]]=d
# ---- canonical ----
print("\n== CANONICAL ==")
mism=[];missing=[];multi=[]
for u,d in P.items():
    if not d["canonical"]: missing.append(u)
    elif len(d["canonical"])>1: multi.append((u,d["canonical"]))
    elif d["canonical"][0]!=u: mism.append((u,d["canonical"][0]))
print("missing:",len(missing),missing); print("multi:",multi); print("mismatch:",len(mism))
for m in mism: print("  ",m)
# ---- robots ----
print("\n== ROBOTS META ==")
c=collections.Counter()
noindex=[]
for u,d in P.items():
    if not d["robots"]: c["<none>"]+=1
    for v in d["robots"]:
        norm=",".join(x.strip().lower() for x in v.split(","))
        c[norm]+=1
        if "noindex" in norm: noindex.append(u)
for k,v in c.most_common(): print(f"  {v:4d}  {k}")
print("noindex pages:",len(noindex)); [print("  ",u) for u in sorted(noindex)]
multi_robots=[(u,d["robots"]) for u,d in P.items() if len(d["robots"])>1]; print("multiple robots tags:",multi_robots)
# sitemap vs noindex vs index
print("sitemap URLs with noindex:",[u for u in noindex if u in sm])
print("sitemap URLs not crawled 200:",sorted(sm-set(P)))
idx_not_sm=sorted(u for u in P if u not in sm and u not in noindex)
print("indexable 200 pages NOT in sitemap:",idx_not_sm)
# ---- lang ----
print("\n== HTML LANG vs PATH ==")
loc={"en":"en","es":"es","ko":"ko","zh":"zh","zh-Hant":"zh-Hant","ar":"ar","id":"id","pt-BR":"pt-BR","tr":"tr"}
bad=[]
for u,d in P.items():
    seg=urlparse(u).path.split("/")[1]
    exp=loc.get(seg,"ja")
    l=(d["lang"] or "")
    ok=(l==exp) or (exp=="zh" and l in("zh","zh-CN","zh-Hans")) or (exp=="zh-Hant" and l in("zh-Hant","zh-TW")) or (exp=="pt-BR" and l in("pt-BR","pt"))
    if not ok: bad.append((u,l,exp))
print("lang mismatches:",len(bad)); [print("  ",b) for b in bad]
print("lang values:",collections.Counter(d["lang"] for d in P.values()))
# ---- hreflang ----
print("\n== HREFLANG ==")
VALID={"ja","en","zh-Hans","zh-Hant","ko","es","pt-BR","id","ar","tr","x-default"}
withh=[u for u,d in P.items() if d["hreflang"]]
print("pages with hreflang:",len(withh)," without:",len(P)-len(withh))
probs=[]
for u in withh:
    hl=P[u]["hreflang"]; codes=[c for c,_ in hl]; hrefs=dict(hl)
    if "x-default" not in codes: probs.append((u,"no x-default"))
    for c in codes:
        if c not in VALID: probs.append((u,f"bad code {c}"))
    if u not in [h for _,h in hl]: probs.append((u,"no self-reference"))
    dup=[c for c,n in collections.Counter(codes).items() if n>1]
    if dup: probs.append((u,f"dup codes {dup}"))
    for c,h in hl:
        if h not in P: probs.append((u,f"target {c}={h} not a 200 html page in crawl")); continue
        if P[h]["canonical"] and P[h]["canonical"][0]!=h: probs.append((u,f"target {h} canonical != self"))
        if h in noindex: probs.append((u,f"target {h} is noindex"))
        # return link
        back=[x for x in P[h]["hreflang"] if x[1]==u]
        if not back: probs.append((u,f"no return link from {h}"))
        # cluster consistency: target's set should equal ours
        if set(P[h]["hreflang"])!=set(hl) and c!="x-default": probs.append((u,f"cluster differs from {h}"))
    # x-default target sanity
    xd=hrefs.get("x-default")
    if xd and xd not in [h for c,h in hl if c!="x-default"]: probs.append((u,f"x-default {xd} not one of the alternates"))
seen=set()
for p in probs:
    if p not in seen: seen.add(p); print("  ",p)
print("hreflang problems:",len(seen))
# clusters summary
clusters=collections.Counter(len(P[u]["hreflang"]) for u in withh); print("cluster sizes:",clusters)
# ja/en pairs sanity: for each /en/ page, does JA sister exist in crawl and are they paired?
print("EN pages w/o hreflang:",[u for u in P if urlparse(u).path.startswith("/en/") and not P[u]["hreflang"]])
# ---- title/h1 ----
print("\n== TITLE / H1 ==")
notitle=[u for u,d in P.items() if not d["title"] or not d["title"][0]]; print("no title:",notitle)
multit=[u for u,d in P.items() if len(d["title"])>1]; print("multiple <title>:",multit)
tc=collections.Counter(d["title"][0] for d in P.values() if d["title"])
dupt={t:[u for u,d in P.items() if d["title"] and d["title"][0]==t] for t,n in tc.items() if n>1}
print("duplicate titles:",len(dupt)); [print("  ",t,"->",v) for t,v in dupt.items()]
noh1=[u for u,d in P.items() if not d["h1"]]; print("no h1:",noh1)
multih1=[(u,len(d["h1"])) for u,d in P.items() if len(d["h1"])>1]; print("multiple h1:",multih1)
emptyh1=[u for u,d in P.items() if d["h1"] and not d["h1"][0].strip()]; print("empty h1:",emptyh1)
h1c=collections.Counter(d["h1"][0] for d in P.values() if d["h1"])
duph1={t:[u for u,d in P.items() if d["h1"] and d["h1"][0]==t] for t,n in h1c.items() if n>1}
print("duplicate h1 (indexable only):"); [print("  ",t[:60],"->",[x for x in v]) for t,v in duph1.items() if any(x not in noindex for x in v)]
tl=[(u,len(d["title"][0])) for u,d in P.items() if d["title"]]
print("title >70ch:",[(u,n) for u,n in tl if n>70]); print("title <20ch:",[(u,n) for u,n in tl if n<20])
# ---- headers (from crawl records) ----
print("\n== HEADERS (all 200 html + non-html + 404) ==")
allr=[r for r in recs if not r.get("error")]
for k in ("csp","hsts"):
    print(k,"present:",sum(1 for r in allr if r.get(k)),"/",len(allr),"missing:",[(r['url'],r['status']) for r in allr if not r.get(k)])
print("xfo:",collections.Counter((r.get("xfo")) for r in allr))
print("xfo missing:",[(r['url'],r['status']) for r in allr if not r.get("xfo")])
print("acao on html:",[(r['url'],r['acao']) for r in allr if r.get("acao") and "html" in (r.get("content_type") or "")])
print("acao any:",collections.Counter(r.get("acao") for r in allr))
print("cache-control:");
for k,v in collections.Counter((r.get("cache_control"), 'html' in (r.get('content_type') or '')) for r in allr).most_common(): print("  ",v,k)
print("cache-control anomalies (html 200 not 'public, no-cache'):",[(r['url'],r['cache_control']) for r in allr if r['status']==200 and 'html' in (r.get('content_type') or '') and r.get('cache_control')!='public, no-cache'])
print("x-robots-tag:",collections.Counter(r.get("x_robots") for r in allr))
print("cf-cache:",collections.Counter(r.get("cf_cache") for r in allr))
print("content-type html variants:",collections.Counter(r.get("content_type") for r in allr if 'html' in (r.get('content_type') or '')))
# ---- viewport / charset / ld errors / css ----
print("\n== VIEWPORT / CHARSET / LD / CSS ==")
print("no viewport:",[u for u,d in P.items() if not d["viewport"]])
print("viewport variants:",collections.Counter(tuple(d["viewport"]) for d in P.values()))
print("no charset:",[u for u,d in P.items() if not d["charset"]])
print("ld parse errors:",[(u,d["ld_err"]) for u,d in P.items() if d["ld_err"]])
print("css variants:",collections.Counter(tuple(d["css"]) for d in P.values()).most_common(8))
print("pages w/o style.min.css:",sorted(u for u,d in P.items() if not any("style.min.css" in (c or "") for c in d["css"])))
print("scripts:",collections.Counter(s for d in P.values() for s in d["scripts"]).most_common(12))
print("pages with data-lang blocks:",sum(1 for d in P.values() if d["datalang"]))
print("pages loading lang.js:",sum(1 for d in P.values() if any('lang.js' in (s or '') for s in d["scripts"])))
print("data-lang but no lang.js:",[u for u,d in P.items() if d["datalang"] and not any('lang.js' in (s or '') for s in d["scripts"])])
print("lang.js but no data-lang:",[u for u,d in P.items() if not d["datalang"] and any('lang.js' in (s or '') for s in d["scripts"])])
# ---- preloads ----
print("\n== PRELOADS ==")
pc=collections.Counter(); fontpre_nofont=[]
for u,d in P.items():
    for a,h in d["preload"]: pc[(a,h)]+=1
    fp=[h for a,h in d["preload"] if a=="font"]
    if fp:
        uses_css=any("style" in (c or "") for c in d["css"])
        if not uses_css and d["inline_style_fontface"]==0: fontpre_nofont.append(u)
for k,v in pc.most_common(): print("  ",v,k)
print("font preload on page with no @font-face and no external css:",fontpre_nofont)
json.dump({"P":{u:{k:(v if not isinstance(v,list) else [list(x) if isinstance(x,tuple) else x for x in v]) for k,v in d.items()} for u,d in P.items()},"noindex":noindex,"sitemap":sorted(sm)},open(f"{S}/work-seo-technical/parsed.json","w"),ensure_ascii=False)
