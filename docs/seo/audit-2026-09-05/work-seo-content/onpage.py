import os,re,json,sys,unicodedata
from bs4 import BeautifulSoup, Comment
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
files=[l.strip() for l in open(S+'/work-seo-content/html_files.txt')]
def fw(s):
    return sum(1 if unicodedata.east_asian_width(c) in 'FWA' else 0.5 for c in s)
def default_lang(rel, html_lang):
    if html_lang: return html_lang.split('-')[0].lower() if html_lang not in ('zh-Hant','zh-Hans') else html_lang
    return 'en' if rel.startswith('en/') else 'ja'
out=[]
os.makedirs(S+'/work-seo-content/text',exist_ok=True)
for rel in files:
    html=open(os.path.join(S,'wt',rel),encoding='utf-8').read()
    soup=BeautifulSoup(html,'html.parser')
    hl=soup.html.get('lang') if soup.html else None
    dl=default_lang(rel,hl)
    dl_short=dl.split('-')[0]
    title=(soup.title.string or '').strip() if soup.title else ''
    def meta(attr,val):
        m=soup.find('meta',attrs={attr:val}); return (m.get('content') or '').strip() if m else None
    desc=meta('name','description'); ogt=meta('property','og:title'); ogd=meta('property','og:description'); twt=meta('name','twitter:title'); twd=meta('name','twitter:description'); robots=meta('name','robots')
    can=soup.find('link',rel='canonical'); can=can.get('href') if can else None
    # JSON-LD
    ld_types=[]; dates={}; persons=[]; faq_names=[]; apps=[]
    for sc in soup.find_all('script',type='application/ld+json'):
        try: d=json.loads(sc.string or '')
        except Exception: continue
        nodes=d if isinstance(d,list) else [d]
        stack=list(nodes)
        while stack:
            n=stack.pop()
            if isinstance(n,dict):
                t=n.get('@type');
                if t: ld_types.append(t if isinstance(t,str) else '/'.join(t))
                for k in ('datePublished','dateModified'):
                    if k in n and isinstance(n[k],str): dates.setdefault(k,set()).add(n[k][:10])
                if n.get('@type')=='Person': persons.append({'name':n.get('name'),'sameAs':n.get('sameAs'),'jobTitle':n.get('jobTitle')})
                if n.get('@type')=='Question': faq_names.append(n.get('name'))
                if n.get('@type')=='SoftwareApplication': apps.append({'id':n.get('@id'),'name':n.get('name'),'desc':(n.get('description') or '')[:120],'ver':n.get('softwareVersion'),'rating':(n.get('aggregateRating') or {}).get('ratingValue'),'count':(n.get('aggregateRating') or {}).get('ratingCount')})
                for v in n.values():
                    if isinstance(v,(dict,list)): stack.append(v)
            elif isinstance(n,list): stack.extend(n)
    # visible DOM: remove script/style/noscript/template/comments, and data-lang != default
    for t in soup(['script','style','noscript','template','svg']): t.decompose()
    for c in soup.find_all(string=lambda x: isinstance(x,Comment)): c.extract()
    hidden_removed=0
    for el in soup.find_all(attrs={'data-lang':True}):
        v=el.get('data-lang')
        if v and v.split('-')[0]!=dl_short and v!=dl:
            el.decompose(); hidden_removed+=1
    h1=[h.get_text(' ',strip=True) for h in soup.find_all('h1')]
    h2=[h.get_text(' ',strip=True) for h in soup.find_all('h2')]
    # visible FAQ: details/summary or .faq-question etc.
    faq_vis=[s.get_text(' ',strip=True) for s in soup.find_all('summary')]
    # visible date strings
    body=soup.find('main') or soup.find('article') or soup.body or soup
    text=body.get_text(' ',strip=True)
    text=re.sub(r'\s+',' ',text)
    open(S+f'/work-seo-content/text/{rel.replace("/","__")}.txt','w').write(text)
    vis_dates=re.findall(r'(?:公開日|更新日|最終更新|Published|Updated|Last updated|Reviewed)[:：]?\s*(?:on\s*)?(20\d\d[-年/.]\d{1,2}[-月/.]\d{1,2}日?)',text)
    byline=re.findall(r'(?:著者|Author|By|執筆)[:：]?\s*([A-Za-z][A-Za-z .]{2,30}|[^\s|]{2,12})',text)[:2]
    # H2 -> first 200 chars after each H2
    h2_lead=[]
    for h in body.find_all('h2'):
        s=''; nxt=h.find_next_sibling()
        # collect following siblings text until next h2
        cur=h.next_sibling; buf=[]
        node=h
        while True:
            node=node.find_next()
            if node is None or node.name=='h2': break
            if node.name in ('p','li','td','dd','summary','div') and node.get_text(strip=True):
                buf.append(node.get_text(' ',strip=True))
                if sum(len(b) for b in buf)>220: break
        h2_lead.append({'h2':h.get_text(' ',strip=True)[:80],'lead':' '.join(buf)[:200]})
    is_ja = dl_short=='ja'
    chars=len(re.sub(r'\s','',text)); words=len(text.split())
    out.append({'file':rel,'lang':dl,'title':title,'title_len':len(title),'title_fw':fw(title),'desc':desc,'desc_len':len(desc) if desc else None,'desc_fw':fw(desc) if desc else None,'og_title':ogt,'tw_title':twt,'og_desc':ogd,'tw_desc':twd,'robots':robots,'canonical':can,'h1':h1,'h2':h2,'h2_lead':h2_lead,'ld_types':sorted(set(ld_types)),'dates':{k:sorted(v) for k,v in dates.items()},'persons':persons,'apps':apps,'faq_ld':len(faq_names),'faq_vis':len(faq_vis),'faq_ld_names':faq_names,'faq_vis_names':faq_vis,'vis_dates':vis_dates[:3],'byline':byline,'chars':chars,'words':words,'hidden_removed':hidden_removed})
json.dump(out,open(S+'/work-seo-content/onpage.json','w'),ensure_ascii=False,indent=0)
print('pages',len(out))
