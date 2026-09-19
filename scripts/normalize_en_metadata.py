#!/usr/bin/env python3
"""Keep split EN page title/description inside the site's SEO bounds.

No new claim is invented. Text is selected from the existing EN H1/body and
trimmed at sentence/word boundaries. Matching OG/Twitter metadata is updated
when present.
"""
from __future__ import annotations
from pathlib import Path
from bs4 import BeautifulSoup
import html,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from i18n_config import JA_EN_PAIRS

ROOT=Path(__file__).resolve().parent.parent
MIN_DESC=110
MAX_DESC=160
MAX_TITLE=70

def file_for(url:str)->Path|None:
    rel=url.lstrip('/')
    if url.endswith('/'):
        p=ROOT/(rel+'index.html') if rel else ROOT/'index.html'
        return p if p.exists() else None
    for p in (ROOT/(rel+'.html'),ROOT/rel/'index.html'):
        if p.exists(): return p
    return None

def visible_texts(soup):
    clone=BeautifulSoup(str(soup),'html.parser')
    for n in clone(['script','style','noscript']): n.decompose()
    return [re.sub(r'\s+',' ',x.get_text(' ',strip=True)).strip() for x in clone.find_all(['p','li'])]

def cut(text,limit):
    text=re.sub(r'\s+',' ',text).strip()
    if len(text)<=limit: return text
    head=text[:limit+1]
    # Prefer a complete sentence if it is long enough.
    pts=[m.end() for m in re.finditer(r'[.!?](?:\s|$)',head)]
    pts=[x for x in pts if x>=MIN_DESC]
    if pts: return head[:pts[-1]].strip()
    pos=head.rfind(' ',0,limit-1)
    if pos<MIN_DESC: pos=limit-1
    return head[:pos].rstrip(' ,;:-')+'…'

def fit_encoded(text, limit, quote=True):
    text=re.sub(r'\s+',' ',text).strip()
    while len(html.escape(text,quote=quote)) > limit and len(text) > 20:
        # Cut enough raw characters to cover the encoded overflow, then settle on a word boundary.
        overflow=len(html.escape(text,quote=quote))-limit
        target=max(20,len(text)-max(1,overflow))
        pos=text.rfind(' ',0,target+1)
        if pos<20: pos=target
        text=text[:pos].rstrip(' ,;:-…')+'…'
    return text


def title_for(soup,current):
    if len(html.escape(current,quote=False))<=MAX_TITLE: return current
    h=soup.find('h1')
    htxt=re.sub(r'\s+',' ',h.get_text(' ',strip=True)).strip() if h else ''
    choices=[]
    if htxt: choices.append(htxt)
    for suffix in [' | Simple Memo - for Obsidian',' | Simple Memo',' — Simple Memo - for Obsidian',' — Simple Memo']:
        if current.endswith(suffix): choices.append(current[:-len(suffix)])
    choices.append(current)
    for c in choices:
        if len(html.escape(c,quote=False))<=MAX_TITLE: return c
    c=min(choices,key=lambda x:len(html.escape(x,quote=False)))
    return fit_encoded(c,MAX_TITLE,quote=False)

def desc_for(soup,current):
    current=re.sub(r'\s+',' ',current).strip()
    if len(html.escape(current,quote=True))>MAX_DESC:
        return fit_encoded(cut(current,MAX_DESC),MAX_DESC,quote=True)
    if len(current)>=MIN_DESC: return current
    seen={current}
    parts=[current] if current else []
    for text in visible_texts(soup):
        if not text or text in seen or text.startswith(('Download','Read next','JA EN')):
            continue
        seen.add(text)
        candidate=' '.join(parts+[text]).strip()
        if len(candidate)>=MIN_DESC:
            return fit_encoded(cut(candidate,MAX_DESC),MAX_DESC,quote=True)
        parts.append(text)
    return fit_encoded(cut(' '.join(parts),MAX_DESC),MAX_DESC,quote=True)

def get_meta(s,key,value):
    soup=BeautifulSoup(s,'html.parser')
    tag=soup.find('meta',attrs={key:value})
    return tag.get('content','') if tag else ''

def replace_meta(s,key,value,new):
    tag_pat=re.compile(r'<meta\b[^>]*>',re.I)
    def repl(m):
        tag=m.group(0)
        attr=re.search(rf'\b{re.escape(key)}\s*=\s*(["\']){re.escape(value)}\1',tag,re.I)
        if not attr: return tag
        esc=html.escape(new,quote=True)
        c=re.search(r'\bcontent\s*=\s*(["\'])(.*?)\1',tag,re.I|re.S)
        if c:
            return tag[:c.start(2)]+esc+tag[c.end(2):]
        return tag[:-1]+f' content="{esc}">'
    return tag_pat.sub(repl,s)

changed=0
# Normalize every public English HTML page, including older EN-only pages.
seen=set()
for p in sorted((ROOT/"en").rglob("*.html")):
    if any(part in {"fixtures","drafts"} for part in p.parts):
        continue
    if p in seen:
        continue
    seen.add(p)
    s=p.read_text(encoding='utf-8')
    soup=BeautifulSoup(s,'html.parser')
    tm=re.search(r'<title[^>]*>(.*?)</title>',s,re.I|re.S)
    if not tm: continue
    old_title=html.unescape(re.sub(r'\s+',' ',tm.group(1)).strip())
    old_desc=get_meta(s,'name','description')
    if not old_desc: continue
    new_title=title_for(soup,old_title)
    new_desc=desc_for(soup,html.unescape(old_desc))
    out=s
    if new_title!=old_title:
        out=out[:tm.start(1)]+html.escape(new_title,quote=False)+out[tm.end(1):]
        out=replace_meta(out,'property','og:title',new_title)
        out=replace_meta(out,'name','twitter:title',new_title)
    if new_desc!=html.unescape(old_desc):
        out=replace_meta(out,'name','description',new_desc)
        out=replace_meta(out,'property','og:description',new_desc)
        out=replace_meta(out,'name','twitter:description',new_desc)
    if out!=s:
        p.write_text(out,encoding='utf-8'); changed+=1
print(f'normalized_en_metadata_files={changed}')
