import json, re, os, unicodedata
from collections import Counter, defaultdict
from bs4 import BeautifulSoup
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
WT=S+'/wt'; P=S+'/crawl/pages'; W=S+'/work-seo-schema'
R=json.load(open(W+'/census.json'))['results']
def norm(s): return re.sub(r'[^\w]','',unicodedata.normalize('NFKC',s or '')).lower()
def ld(f):
    soup=BeautifulSoup(open(P+'/'+f,encoding='utf-8',errors='replace').read(),'html.parser'); out=[]
    for sc in soup.find_all('script',type='application/ld+json'):
        try: out.append(json.loads(sc.string or sc.get_text()))
        except: pass
    return soup,out
def nodes(b):
    out=[]
    def w(n):
        if isinstance(n,dict): out.append(n); [w(v) for v in n.values()]
        elif isinstance(n,list): [w(x) for x in n]
    w(b); return out
def visible(soup,lang):
    v=BeautifulSoup(str(soup),'html.parser'); [t.decompose() for t in v.find_all(['script','style','noscript','template'])]
    for el in v.find_all(attrs={'data-lang':True}):
        if el.get('data-lang','').split('-')[0]!=lang: el.decompose()
    return v
print("=== 1. en/faq + faq Q/A pairing: schema answer vs visible answer under the matching summary")
for f,lang in (('en_faq.html','en'),('faq.html','ja')):
    soup,blocks=ld(f); v=visible(soup,lang); vn=norm(v.get_text(' '))
    qs=[n for b in blocks for n in nodes(b) if n.get('@type')=='Question']
    det=[];
    for d in v.select('details'):
        sm=d.find('summary'); det.append((norm(sm.get_text(' ')) if sm else '', norm(d.get_text(' '))))
    bad=0
    for q in qs:
        qn=q['name']; at=BeautifulSoup(q['acceptedAnswer']['text'],'html.parser').get_text(' ')
        m=[d for d in det if norm(qn) in d[0]]
        if not m: print("   NO-SUMMARY:",f,qn[:70]); bad+=1; continue
        if norm(at) not in m[0][1]:
            bad+=1; print("   MISPAIR/DRIFT:",f,repr(qn[:60]),"| schema-answer:",at[:90].replace('\n',' '),"| visible:",v.find('summary',string=lambda s: s and norm(qn) in norm(s)) and m[0][1][:0])
    print(f, "questions",len(qs),"visible details",len(det),"bad",bad)
print("=== 2. live class names replacing dead speakable selectors")
for f,pat in (('vs_evernote.html','reason'),('guides_gmail.html','lead|section__'),('captio-alternative.html','hero'),('faq.html','hero|page-title|lp-'),('about.html','mission'),('devlog_privacy-first-design.html','page-content|article')):
    raw=open(P+'/'+f,encoding='utf-8').read(); cls=Counter(re.findall(r'class="([^"]*(?:%s)[^"]*)"'%pat,raw)); print("  ",f,cls.most_common(6))
    soup,blocks=ld(f); print("     speakable:",[n['speakable'].get('cssSelector') for b in blocks for n in nodes(b) if isinstance(n.get('speakable'),dict)])
print("=== 3. simplememo-ios 404 URL locations")
loc=[]
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for i,b in enumerate(blocks):
        for n in nodes(b):
            if 'https://github.com/simplememofast/simplememo-ios' in (n.get('sameAs') or []): loc.append((R[f]['wt'],n.get('@id') or n.get('@type')))
print("  ",len(loc),loc)
print("=== F. Article top-level missing mainEntityOfPage")
miss=[]
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for b in blocks:
        tops=b['@graph'] if isinstance(b,dict) and '@graph' in b else [b]
        for n in tops:
            if isinstance(n,dict) and n.get('@type') in ('Article','BlogPosting','TechArticle') and 'mainEntityOfPage' not in n: miss.append(R[f]['wt'])
print("  ",len(miss),miss)
print("=== G. #website definitions vs references")
defs=Counter(); refs=Counter()
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for b in blocks:
        for n in nodes(b):
            i=n.get('@id') or ''
            if '#website' in i: (defs if len(n)>2 else refs)[(i if len(n)>2 else i, R[f]['wt'] if len(n)>2 else '')]+=1
print("  defs:",list(defs)); print("  refs:",Counter(k[0] for k in refs.elements()))
print("=== H. visible FAQ heading but no FAQPage")
nofaq=[]
for f,r in R.items():
    if 'FAQPage' in r['types'] or not r['wt']: continue
    soup,_=ld(f); lang=((soup.html.get('lang') if soup.html else None) or 'ja').split('-')[0]; v=visible(soup,lang)
    heads=[h.get_text(' ',strip=True) for h in v.find_all(['h2','h3']) if re.search(r'よくある|FAQ|Frequently',h.get_text())]
    if heads: nofaq.append((r['wt'],heads[0][:30],len(v.select('details'))))
print("  ",len(nofaq),nofaq)
print("=== I. Dataset fields"); soup,blocks=ld('data_voice-shift.html')
for b in blocks:
    for n in nodes(b):
        if n.get('@type')=='Dataset': print("  ",sorted(n.keys()), '| distribution:',n.get('distribution') and str(n['distribution'])[:120], '| license:',n.get('license'))
print("=== J. visible rating 3-point sync on 21 #app pages; stale ★ patterns site-wide; llms.txt")
for f,r in sorted(R.items()):
    if r.get('app') and r['app']['softwareVersion']:
        soup,_=ld(f); lang=((soup.html.get('lang') if soup.html else None) or 'ja').split('-')[0]; v=visible(soup,lang); t=v.get_text(' ')
        m=re.findall(r'(?:★|☆|⭐|Rating|評価)\D{0,12}?([0-9]\.[0-9])\D{0,14}?(\d{1,4})',t)
        print(f"  {r['wt']:40s} visible={sorted(set(m))[:4]}")
stale=Counter()
for f in sorted(os.listdir(P)):
    t=BeautifulSoup(open(P+'/'+f,encoding='utf-8',errors='replace').read(),'html.parser'); [x.decompose() for x in t.find_all(['script','style'])]
    for m in re.findall(r'(?:★|⭐)\s*(4\.[0-9])\s*[（(·・]?\s*(\d{1,4})',t.get_text(' ')):
        if m!=('4.2','25'): stale[(R[f]['wt'],m)]+=1
print("  stale ★ patterns:",dict(stale))
llms=open(WT+'/llms.txt',encoding='utf-8').read(); print("  llms.txt:",[x.strip() for x in re.findall(r'[^\n]*(?:4\.\d|5\.8\.\d)[^\n]*',llms)][:4])
print("=== L. best-note-to-self ItemList"); soup,blocks=ld('en_blog_best-note-to-self-apps-2026.html')
for b in blocks:
    for n in nodes(b):
        if n.get('@type')=='ItemList': print("  items:",[(it.get('name') or (it.get('item') or {}).get('name')) for it in n.get('itemListElement',[])])
v=visible(soup,'en'); print("  visible Captio mentions:",sorted(set(re.findall(r'Captio[^.\n]{0,45}',v.get_text(' '))))[:6])
print("=== M. autopilot + roadmap + download blocks (keys)")
for f in ('autopilot.html','roadmap.html','download.html','en_roadmap.html'):
    soup,blocks=ld(f); print("  ",f,[ (n.get('@type'), sorted(k for k in n if k not in('@context','@type')))[:2] for b in blocks for n in (b['@graph'] if '@graph' in b else [b])])
print("=== N. hidden-EN FAQ class site-wide")
for f,r in R.items():
    if r['faq']['name_miss'] and not f.startswith('en'):
        raw=open(P+'/'+f,encoding='utf-8').read(); soup=BeautifulSoup(raw,'html.parser'); n_en=0
        for el in soup.find_all(attrs={'data-lang':'en'}):
            if any(norm(q) in norm(el.get_text(' ')) for q in r['faq']['name_miss']): n_en+=1
        print(f"  {r['wt']}: name_miss={len(r['faq']['name_miss'])} found-in-data-lang-en-blocks={n_en}")
print("=== 4. /obsidian/* schema Q vs visible summaries")
for f in ('obsidian_apple-watch-not-working.html','obsidian_compare.html','obsidian_compare_logseq.html','obsidian_daily-note.html','obsidian_getting-started.html','obsidian_plugins.html','obsidian_plugins_dataview.html','obsidian_pricing.html','obsidian_shortcuts-not-working.html','obsidian_sync_icloud.html','obsidian_what-is-vault.html'):
    soup,blocks=ld(f); v=visible(soup,'ja'); vn=norm(v.get_text(' '))
    qs=[n for b in blocks for n in nodes(b) if n.get('@type')=='Question']
    sums=[s.get_text(' ',strip=True) for s in v.select('details summary')]
    nm=[q['name'] for q in qs if norm(q['name']) not in vn]; am=[q['name'] for q in qs if norm(q['name']) in vn and norm(BeautifulSoup(q['acceptedAnswer']['text'],'html.parser').get_text(' ')) not in vn]
    print(f"  {R[f]['wt']:44s} schemaQ={len(qs)} visibleSummaries={len(sums)} nameMiss={len(nm)} ansMiss={len(am)}")
    if nm: print("     e.g. schema:",nm[0][:45],"| visible:",[s[:45] for s in sums if norm(s)[:6]==norm(nm[0])[:6] or norm(nm[0])[-8:] in norm(s)][:1])
