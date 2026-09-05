import html, re, sys, json, os
from fontTools.ttLib import TTFont
ROOT=sys.argv[1]; F=os.path.join(ROOT,'assets','fonts')
def cps(p):
    f=TTFont(p); s=set()
    for t in f['cmap'].tables:
        if t.isUnicode(): s.update(t.cmap.keys())
    return s
sub={w:cps(os.path.join(F,f'NotoSansJP-{w}-subset.woff2')) for w in ('Regular','Bold')}
dl={w:cps(os.path.join(F,f'NotoSansJP-{w}-delta.woff2')) for w in ('Regular','Bold')}
ext={w:cps(os.path.join(F,f'NotoSansJP-{w}-ext.woff2')) for w in ('Regular','Bold')}
print('cmap sizes', {w:(len(sub[w]),len(dl[w]),len(ext[w])) for w in sub})
def visible(path):
    raw=open(path,encoding='utf-8').read()
    raw=re.sub(r'<!--[\s\S]*?-->','',raw)
    raw=re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>|<noscript[\s\S]*?</noscript>','',raw)
    # drop hidden data-lang="en" blocks (approx: nested-div aware)
    out=[];i=0
    for m in re.finditer(r'<div[^>]*data-lang="en"[^>]*>',raw):
        if m.start()<i: continue
        out.append(raw[i:m.start()]); depth=1; j=m.end()
        for t in re.finditer(r'<(/?)div\b[^>]*>',raw[m.end():]):
            depth+= -1 if t.group(1) else 1
            if depth==0: j=m.end()+t.end(); break
        i=j
    out.append(raw[i:]); txt=''.join(out)
    txt=re.sub(r'<[^>]+>','',txt)
    return set(html.unescape(txt))
def kanji(c): o=ord(c); return 0x4E00<=o<=0x9FFF or 0x3400<=o<=0x4DBF
res={}
for p in sys.argv[2:]:
    ch=visible(os.path.join(ROOT,p)); k={c for c in ch if kanji(c)}
    r={}
    for w in ('Regular','Bold'):
        miss={c for c in k if ord(c) not in sub[w] and ord(c) not in dl[w]}
        inext={c for c in miss if ord(c) in ext[w]}
        r[w]={'kanji':len(k),'missing_from_subset+delta':len(miss),'served_by_ext':len(inext),'phantom':len(miss-inext),'sample':''.join(sorted(inext))[:40]}
    res[p]=r; print(p, json.dumps(r,ensure_ascii=False))
json.dump(res,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'fontgap.json'),'w'),ensure_ascii=False,indent=1)
