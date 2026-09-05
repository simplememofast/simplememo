#!/usr/bin/env python3
"""Doorway re-measure: pairwise Jaccard of 8-char shingles on DEFAULT-VISIBLE JA text (hidden data-lang=en blocks, script/style/nav/header/footer removed) for 5 /vs/ + 5 /use-cases/ pages."""
import re, itertools
from pathlib import Path
from html.parser import HTMLParser
S = Path('/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad')
P = S/'crawl/pages'
class Vis(HTMLParser):
    def __init__(s): super().__init__(); s.out=[]; s.skip=0; s.stack=[]
    VOID={'meta','link','img','br','hr','input','source','wbr','area','base','col','embed','param','track'}
    def handle_starttag(s, tag, attrs):
        if tag in s.VOID: return
        a=dict(attrs); hide = tag in ('script','style','nav','header','footer','noscript','template') or a.get('data-lang')=='en' or 'display:none' in (a.get('style') or '').replace(' ','')
        s.stack.append(hide); s.skip += hide
    def handle_endtag(s, tag):
        if tag in s.VOID: return
        if s.stack: s.skip -= s.stack.pop()
    def handle_data(s, d):
        if s.skip<=0: s.out.append(d)
def visible(fn):
    v=Vis(); v.feed((P/fn).read_text(errors='replace')); t=re.sub(r'\s+','',''.join(v.out)); return t
def sh(t,k=8): return {t[i:i+k] for i in range(len(t)-k+1)}
vs = sorted(f.name for f in P.glob('vs_*.html'))
uc = sorted(f.name for f in P.glob('use-cases_*.html'))
def pick(l,n): step=len(l)/n; return [l[int(i*step)] for i in range(n)]
sample = pick(vs,5)+pick(uc,5)
texts = {f: visible(f) for f in sample}
for f,t in texts.items(): print(f"{f}: visible JA chars={len(t)}")
sims=[]
for a,b in itertools.combinations(sample,2):
    A,B=sh(texts[a]),sh(texts[b]); j=len(A&B)/len(A|B); sims.append((j,a,b))
sims.sort(reverse=True)
print(f"\npairs={len(sims)} mean Jaccard={sum(s[0] for s in sims)/len(sims):.3%} max={sims[0][0]:.3%} ({sims[0][1]} vs {sims[0][2]}) min={sims[-1][0]:.3%}")
vsvs=[s for s in sims if s[1].startswith('vs_') and s[2].startswith('vs_')]; ucuc=[s for s in sims if s[1].startswith('use') and s[2].startswith('use')]
print(f"within /vs/: mean={sum(s[0] for s in vsvs)/len(vsvs):.3%} max={max(vsvs)[0]:.3%}; within /use-cases/: mean={sum(s[0] for s in ucuc)/len(ucuc):.3%} max={max(ucuc)[0]:.3%}")
print("top 3:", [(f"{j:.1%}",a,b) for j,a,b in sims[:3]])
print("vs pages total:", len(vs), "use-cases pages total:", len(uc))
