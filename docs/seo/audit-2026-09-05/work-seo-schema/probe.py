import json, re, os, unicodedata
from collections import Counter, defaultdict
from bs4 import BeautifulSoup
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
WT=S+'/wt'; P=S+'/crawl/pages'; W=S+'/work-seo-schema'
R=json.load(open(W+'/census.json'))['results']
def norm(s): return re.sub(r'[^\w]','',unicodedata.normalize('NFKC',s or '')).lower()
def ld(f):
    soup=BeautifulSoup(open(P+'/'+f,encoding='utf-8',errors='replace').read(),'html.parser')
    out=[]
    for sc in soup.find_all('script',type='application/ld+json'):
        try: out.append(json.loads(sc.string or sc.get_text()))
        except: pass
    return soup,out
def walk(n,fn):
    if isinstance(n,dict):
        fn(n); [walk(v,fn) for v in n.values()]
    elif isinstance(n,list): [walk(x,fn) for x in n]
print("=== A. obsidian FAQ visible wording (getting-started, shortcuts-not-working)")
for f,key in (('obsidian_getting-started.html','アカウント登録'),('obsidian_shortcuts-not-working.html','アクションが出てきません'),('obsidian_daily-note.html','何も増えていません')):
    soup,_=ld(f); vis=[el.get_text(' ',strip=True)[:90] for el in soup.find_all(['summary','h3','dt','button']) if key[:4] in el.get_text()]
    raw=open(P+'/'+f,encoding='utf-8').read(); idx=[m.start() for m in re.finditer(re.escape(key),raw)]
    print(f, 'occurrences',len(idx), 'in-elements:',vis[:3])
    for i in idx[:3]: print('    ctx:', raw[max(0,i-120):i+40].replace('\n',' ')[-160:])
soup,_=ld('obsidian_getting-started.html'); print("  visible summaries:", [s.get_text(' ',strip=True)[:60] for s in soup.select('details summary, .faq-summary, .faq-q, .faq-item h3')][:12])
print("=== B. en/faq verification-code answer diff")
soup,blocks=ld('en_faq.html')
def find_q(blocks,key):
    hit=[]
    for b in blocks: walk(b,lambda n: hit.append(n) if n.get('@type')=='Question' and key in n.get('name','') else None)
    return hit
q=find_q(blocks,'verification code')[0]; sa=BeautifulSoup(q['acceptedAnswer']['text'],'html.parser').get_text(' ')
print("  SCHEMA:",sa[:300]);
for el in soup.find_all(string=re.compile("isn't arriving|isn.t arriving")):
    par=el.find_parent(['details','div','li','section']); print("  VISIBLE:",par.get_text(' ',strip=True)[:400] if par else None); break
print("=== C. dead speakable selectors by page")
sel_pages=defaultdict(list)
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for b in blocks:
        def fn(n):
            sp=n.get('speakable')
            if isinstance(sp,dict):
                for s in (sp.get('cssSelector') or []):
                    try:
                        if not soup.select(s): sel_pages[s].append(R[f]['wt'])
                    except Exception: sel_pages['ERR:'+s].append(R[f]['wt'])
        walk(b,fn)
for s,pg in sel_pages.items(): print(f"  {s!r} x{len(pg)}: {sorted(set(pg))[:40]}")
print("=== D. homepage #organization sameAs diff + simplememo-ios locations")
for f in ('root.html','en.html'):
    soup,blocks=ld(f); defs=[]
    for b in blocks: walk(b,lambda n: defs.append(n) if n.get('@id','').endswith('/#organization') and len(n)>2 else None)
    for d in defs: print(f"  {f} name={d.get('name')} sameAs={d.get('sameAs')} alt={d.get('alternateName')}")
ios=Counter()
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for b in blocks: walk(b,lambda n: ios[(R[f]['wt'],n.get('@id') or n.get('@type'))].__iadd__(1) if 'https://github.com/simplememofast/simplememo-ios' in (n.get('sameAs') or []) else None)
print("  simplememo-ios in sameAs:",len(ios),sorted(ios))
print("=== F. Article top-level missing mainEntityOfPage")
miss=[]
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for b in blocks:
        tops=b['@graph'] if isinstance(b,dict) and '@graph' in b else [b]
        for n in tops:
            if isinstance(n,dict) and n.get('@type') in ('Article','BlogPosting','TechArticle') and 'mainEntityOfPage' not in n: miss.append(R[f]['wt'])
print("  ",len(miss),miss)
print("=== G. #website definitions/references")
defs=Counter(); refs=Counter()
for f in sorted(os.listdir(P)):
    soup,blocks=ld(f)
    for b in blocks: walk(b,lambda n: (defs if len(n)>2 else refs).__setitem__((n.get('@id'),R[f]['wt'] if len(n)>2 else 'ref'),1) if '#website' in (n.get('@id') or '') else None)
print("  defs:",list(defs)); print("  refs:",Counter(k[0] for k in refs))
print("=== H. visible FAQ heading but no FAQPage")
nofaq=[]
for f,r in R.items():
    if 'FAQPage' in r['types'] or not r['wt']: continue
    soup,_=ld(f); [t.decompose() for t in soup.find_all(['script','style'])]
    lang=(soup.html.get('lang') or 'ja').split('-')[0]
    for el in soup.find_all(attrs={'data-lang':True}):
        if el.get('data-lang','').split('-')[0]!=lang: el.decompose()
    heads=[h.get_text(' ',strip=True) for h in soup.find_all(['h2','h3']) if re.search(r'よくある|FAQ|Frequently',h.get_text())]
    if heads: nofaq.append((r['wt'],heads[0][:30]))
print("  ",len(nofaq),nofaq)
print("=== I. Dataset fields"); soup,blocks=ld('data_voice-shift.html')
for b in blocks: walk(b,lambda n: print("  ",sorted(n.keys())) if n.get('@type')=='Dataset' else None)
print("=== J. visible rating sync on #app pages + stale patterns site-wide")
for f,r in R.items():
    if r.get('app') and r['app']['softwareVersion']:
        soup,_=ld(f); [t.decompose() for t in soup.find_all(['script','style'])]
        lang=(soup.html.get('lang') or 'ja').split('-')[0]
        for el in soup.find_all(attrs={'data-lang':True}):
            if el.get('data-lang','').split('-')[0]!=lang: el.decompose()
        t=soup.get_text(' '); m=re.findall(r'(?:★|☆|⭐)\s*([0-9]\.[0-9])[^0-9]{0,12}(\d+)',t)
        print(f"  {r['wt']:40s} visible★={m[:3]}")
stale=Counter()
for f in sorted(os.listdir(P)):
    t=open(P+'/'+f,encoding='utf-8',errors='replace').read()
    for m in re.findall(r'(?:★|☆|⭐)\s*(4\.[0-9])[^0-9]{0,12}(\d+)',t):
        if m!=('4.2','25'): stale[(R[f]['wt'],m)]+=1
print("  stale ★ patterns:",stale)
llms=open(WT+'/llms.txt',encoding='utf-8').read(); print("  llms.txt:",re.findall(r'4\.\d[^\n]{0,30}|5\.8\.\d',llms)[:6])
print("=== L. best-note-to-self ItemList"); soup,blocks=ld('en_blog_best-note-to-self-apps-2026.html')
for b in blocks: walk(b,lambda n: print("  items:",[ (it.get('name') or (it.get('item') or {}).get('name')) for it in n.get('itemListElement',[])]) if n.get('@type')=='ItemList' else None)
raw=open(P+'/en_blog_best-note-to-self-apps-2026.html',encoding='utf-8').read(); print("  visible Captio mentions:",re.findall(r'Captio[^<]{0,40}',re.sub(r'<script.*?</script>','',raw,flags=re.S))[:4])
print("=== M. autopilot block"); soup,blocks=ld('autopilot.html'); print("  ",json.dumps(blocks,ensure_ascii=False)[:700])
print("=== N. hidden-EN FAQ class site-wide: JA pages whose FAQPage Q names sit only in data-lang=en")
for f,r in R.items():
    if r['faq']['name_miss'] and not f.startswith('en'):
        raw=open(P+'/'+f,encoding='utf-8').read(); soup=BeautifulSoup(raw,'html.parser'); n_en=0
        for el in soup.find_all(attrs={'data-lang':'en'}):
            if any(norm(q) in norm(el.get_text(' ')) for q in r['faq']['name_miss']): n_en+=1
        print(f"  {r['wt']}: name_miss={len(r['faq']['name_miss'])} found-in-data-lang-en-blocks={n_en}")
