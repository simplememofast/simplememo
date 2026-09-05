import json, re, os, unicodedata
from collections import Counter, defaultdict
from bs4 import BeautifulSoup, Comment
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
WT=S+'/wt'; P=S+'/crawl/pages'; W=S+'/work-seo-schema'
D=json.load(open(W+'/census.json')); R=D['results']
sitemap=dict(l.rstrip('\n').split('\t') for l in open(W+'/sitemap_lastmod.tsv'))
def norm(s):
    s=unicodedata.normalize('NFKC',s or '')
    return re.sub(r'[^\w]','',s).lower()   # drop all punctuation/whitespace (tolerant)
def strip_tags(s): return BeautifulSoup(s or '','html.parser').get_text(' ')
def top_nodes(d):
    out=[]
    if isinstance(d,list):
        for x in d: out+=top_nodes(x)
    elif isinstance(d,dict):
        if '@graph' in d: out+=[g for g in d['@graph'] if isinstance(g,dict)]
        if '@type' in d: out.append(d)
        me=d.get('mainEntity')
        if isinstance(me,dict) and '@type' in me and me.get('@type')!='Question': out.append(me)
    return out
def ts(n): t=n.get('@type'); return t if isinstance(t,list) else [t]
art_issues=Counter(); art_ex=defaultdict(list); faq_nm=[]; faq_am=[]; spk=[]; wpn=[]; hl=[]
orgdefs=defaultdict(list); perdefs=defaultdict(list); appdefs=[]; datemod_sm=[]; datemod_vis=[]; ex_dates=[]
newpages=[l.split()[1][2:] for l in open(W+'/new_pages.txt')] if os.path.exists(W+'/new_pages.txt') else []
for f in sorted(os.listdir(P)):
    r=R[f]; wp=r['wt']; html=open(P+'/'+f,encoding='utf-8',errors='replace').read()
    soup=BeautifulSoup(html,'html.parser'); lang=((soup.html.get('lang') if soup.html else None) or ('en' if f.startswith('en') else 'ja')).split('-')[0]
    raw_dom=BeautifulSoup(html,'html.parser')
    vis=BeautifulSoup(html,'html.parser')
    for t in vis.find_all(['script','style','noscript','template']): t.decompose()
    if not f.startswith('tiktok'):
        for el in vis.find_all(attrs={'data-lang':True}):
            if el.get('data-lang','').split('-')[0]!=lang: el.decompose()
    vtxt=(vis.body or vis).get_text(' '); vn=norm(vtxt)
    title=soup.title.get_text(' ',strip=True) if soup.title else ''; h1s=[h.get_text(' ',strip=True) for h in vis.find_all('h1')]
    src=open(WT+'/'+wp,encoding='utf-8').read() if wp else ''
    lines=[src[:m.start()].count('\n')+1 for m in re.finditer(r'<script[^>]*application/ld\+json',src)]
    for i,sc in enumerate(soup.find_all('script',type='application/ld+json')):
        try: d=json.loads(sc.string or sc.get_text())
        except: continue
        loc=f"{wp}:{lines[i] if i<len(lines) else '?'}"
        for n in top_nodes(d):
            T=ts(n)
            if any(t in ('Article','BlogPosting','NewsArticle','TechArticle') for t in T):
                for req in ('headline','author','publisher','datePublished','dateModified','image','mainEntityOfPage'):
                    if req not in n: art_issues[req]+=1; art_ex[req].append(loc)
                pub=n.get('publisher')
                if isinstance(pub,dict) and set(pub)-{'@id','@type'} and 'logo' not in pub: art_issues['publisher.logo']+=1; art_ex['publisher.logo'].append(loc)
                if isinstance(pub,dict) and set(pub)<={'@id','@type'}: art_issues['publisher=@id-ref']+=1
                au=n.get('author'); au=au if isinstance(au,list) else [au]
                for a in au:
                    if isinstance(a,dict) and set(a)<={'@id','@type'}: art_issues['author=@id-ref']+=1
                    elif isinstance(a,dict) and 'name' not in a: art_issues['author.noname']+=1; art_ex['author.noname'].append(loc)
                h=n.get('headline','')
                if h and norm(h) not in norm(title) and not any(norm(h) in norm(x) or norm(x) in norm(h) for x in h1s) and norm(h) not in vn: hl.append((loc,h,title,h1s[:1]))
                dp,dm=n.get('datePublished',''),n.get('dateModified','')
                if dp and dm and dm[:10]<dp[:10]: ex_dates.append((loc,'dm<dp',dp,dm))
                if dm and r['url'] in sitemap and sitemap[r['url']] and dm[:10]>sitemap[r['url']]: datemod_sm.append((loc,dm[:10],sitemap[r['url']]))
                if dm and r['vis_updated'] and dm[:10]<max(r['vis_updated']): datemod_vis.append((loc,dm[:10],max(r['vis_updated'])))
                img=n.get('image')
                if isinstance(img,str) and not img.startswith('https://'): art_issues['image.relative']+=1; art_ex['image.relative'].append(loc)
            if 'FAQPage' in T:
                for q in (n.get('mainEntity') or []):
                    qn=q.get('name',''); at=strip_tags((q.get('acceptedAnswer') or {}).get('text',''))
                    if norm(qn) not in vn: faq_nm.append((f,loc,qn))
                    elif norm(at) not in vn:
                        a=norm(at); k=0
                        while k<len(a) and a[:k+1] in vn: k+=1
                        faq_am.append((f,loc,qn[:40],len(a),k,at[max(0,int(k*len(at)/max(len(a),1))-30):int(k*len(at)/max(len(a),1))+50]))
            if 'WebPage' in T and n.get('name'):
                nm=n['name']
                if norm(nm) not in norm(title) and norm(title) not in norm(nm) and not any(norm(nm) in norm(x) or norm(x) in norm(nm) for x in h1s): wpn.append((loc,nm[:60],title[:60]))
            sp=n.get('speakable')
            if isinstance(sp,dict):
                for sel in (sp.get('cssSelector') or []) if isinstance(sp.get('cssSelector'),list) else [sp.get('cssSelector')]:
                    if not sel: continue
                    try: rawhit=raw_dom.select(sel); vishit=vis.select(sel)
                    except Exception as e: rawhit=vishit=None
                    if not vishit: spk.append((loc,sel,'raw:%s'%(len(rawhit) if rawhit is not None else 'ERR')))
            if n.get('@id','').endswith('#organization') and len(n)>2: orgdefs[json.dumps({k:n[k] for k in n if k in('name','url','sameAs','logo','founder','alternateName')},sort_keys=True,ensure_ascii=False)].append(loc)
            if n.get('@id','').endswith('about/#person') and len(n)>2: perdefs[json.dumps({k:n[k] for k in n if k in('name','sameAs','jobTitle','url','worksFor','alternateName')},sort_keys=True,ensure_ascii=False)].append(loc)
        # nested defs too (author/publisher inline)
        def walk(x):
            if isinstance(x,dict):
                if x.get('@id','').endswith('#organization') and len(x)>2: orgdefs[json.dumps({k:x[k] for k in x if k in('name','url','sameAs','logo','founder','alternateName')},sort_keys=True,ensure_ascii=False)].append(loc)
                if x.get('@id','').endswith('about/#person') and len(x)>2: perdefs[json.dumps({k:x[k] for k in x if k in('name','sameAs','jobTitle','url','worksFor','alternateName')},sort_keys=True,ensure_ascii=False)].append(loc)
                if x.get('@id','').endswith('/#app') and len(x)>2: appdefs.append((loc,x.get('name'),x.get('operatingSystem'),x.get('applicationCategory'),x.get('softwareVersion'),json.dumps(x.get('offers'),ensure_ascii=False)[:60] if x.get('offers') else None,len(x.get('sameAs') or [])))
                for v in x.values(): walk(v)
            elif isinstance(x,list):
                for y in x: walk(y)
        walk(d)
print("=== Article top-level field misses");
for k,v in art_issues.most_common(): print(f"  {v:4d} {k}  e.g. {art_ex[k][:4]}")
print("=== headline miss",len(hl)); [print("  ",x) for x in hl[:12]]
print("=== FAQ name miss",len(faq_nm)); [print("  ",x[0],x[1],x[2][:60]) for x in faq_nm]
print("=== FAQ answer miss",len(faq_am)); [print("  ",x[0],x[1],x[2],'len',x[3],'diverge@',x[4],'| ctx:',x[5].replace('\n',' ')) for x in faq_am]
print("=== speakable miss",len(spk)); c=Counter((x[1],x[2]) for x in spk); [print("  ",v,k) for k,v in c.most_common(15)]
print("=== WebPage.name != title/H1",len(wpn)); [print("  ",x) for x in wpn[:10]]
print("=== dateModified>sitemap",datemod_sm); print("=== dateModified<visible",datemod_vis); print("=== dm<dp",ex_dates)
print("=== #organization distinct defs",len(orgdefs))
for k,v in sorted(orgdefs.items(),key=lambda x:-len(x[1])): print(f"  [{len(v)}] {v[:2]} {k[:400]}")
print("=== #person distinct defs",len(perdefs))
for k,v in sorted(perdefs.items(),key=lambda x:-len(x[1])): print(f"  [{len(v)}] {v[:2]} {k[:400]}")
print("=== #app defs (loc,name,os,cat,ver,offers,sameAs#)"); [print("  ",x) for x in appdefs]
