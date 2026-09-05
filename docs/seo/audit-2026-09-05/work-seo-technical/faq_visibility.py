#!/usr/bin/env python3
"""Site-wide: FAQPage JSON-LD question names vs the DEFAULT-VISIBLE DOM (hidden data-lang=en blocks, scripts, styles removed).
Method: strip whitespace + JP/EN punctuation, then substring match in either direction (tolerates prefixes like 'Q.' and trailing '?')."""
import json,re,glob,os,collections
from bs4 import BeautifulSoup
W="/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad/wt"
os.chdir(W)
files=[f for f in glob.glob("**/*.html",recursive=True) if not f.startswith(("node_modules/","docs/","fixtures/","scripts/","tools/","growth/",".git/","admin/"))]
n=lambda t: re.sub(r"[\s？?！!。、，,．.「」『』（）()：:／/・\-—–…\"'“”‘’]+","",t)
def added(f):
    import subprocess
    return subprocess.run(["git","log","--diff-filter=A","--format=%ad","--date=short","--follow","--",f],capture_output=True,text=True).stdout.strip().split("\n")[-1]
rows=[]; tot_absent=tot_hidden=tot_drift=0
for f in sorted(files):
    html=open(f,encoding="utf-8").read()
    if "FAQPage" not in html: continue
    s=BeautifulSoup(html,"html.parser")
    if any("noindex" in (m.get("content") or "") for m in s.find_all("meta") if (m.get("name") or "").lower()=="robots"): continue
    qs=[]
    for sc in s.find_all("script",type="application/ld+json"):
        try: j=json.loads(sc.string or "")
        except Exception: continue
        for it in (j if isinstance(j,list) else [j]):
            if not isinstance(it,dict): continue
            for node in (it.get("@graph") if isinstance(it.get("@graph"),list) else [it]):
                if isinstance(node,dict) and node.get("@type")=="FAQPage":
                    qs+=[q.get("name","") for q in (node.get("mainEntity") or []) if isinstance(q,dict)]
    if not qs: continue
    s_all=BeautifulSoup(html,"html.parser")
    for el in s_all(["script","style","noscript","template"]): el.decompose()
    full=n(s_all.get_text(" "))
    s_vis=BeautifulSoup(html,"html.parser")
    for el in s_vis.find_all(attrs={"data-lang":"en"}): el.decompose()
    for el in s_vis(["script","style","noscript","template"]): el.decompose()
    vis=n(s_vis.get_text(" "))
    # visible text chunks (for either-direction match): headings, summaries, faq question nodes, strong, dt, button
    chunks=[n(x.get_text(" ",strip=True)) for x in s_vis.find_all(["h2","h3","h4","summary","dt","button","strong","p","li"])]
    chunks=[c for c in chunks if len(c)>=8]
    absent=[];hidden=[];drift=[]
    for q in qs:
        nq=n(q)
        if not nq: continue
        if nq in vis: continue
        if nq in full: hidden.append(q); continue
        if any(nq in c or c in nq for c in chunks): drift.append(q); continue
        absent.append(q)
    if absent or hidden or drift:
        rows.append((f,len(qs),len(absent),len(hidden),len(drift),absent,hidden,drift))
        tot_absent+=len(absent); tot_hidden+=len(hidden); tot_drift+=len(drift)
print(f"pages with FAQPage checked: {sum(1 for f in files if 'FAQPage' in open(f,encoding='utf-8').read())}")
print(f"pages with issues: {len(rows)}  absent-from-page Qs: {tot_absent}  hidden-EN-only Qs: {tot_hidden}  paraphrase-drift Qs: {tot_drift}")
for f,tq,a,h,d,A,H,D in rows:
    print(f"\n{f}  (added {added(f)})  JSON-LD Q={tq} absent={a} hidden={h} drift={d}")
    for q in A: print("   ABSENT :",q[:80])
    for q in H: print("   HIDDEN :",q[:80])
    for q in D: print("   DRIFT  :",q[:80])
