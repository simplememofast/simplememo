"""Extract translatable prose while retaining markup, links, names and numbers.

Translation engines receive opaque markers for protected values. Every accepted
translation must preserve those markers and the balanced inline element tree.
Public HTML is generated only from a complete, validated catalog.
"""
from html.parser import HTMLParser
from dataclasses import dataclass, field
from html import unescape, escape
from pathlib import Path
import json, re, hashlib, sys
from site_translation_literals import QUANTITY, DAILY_LIMIT, quantity_value, localized_literal
ROOT=Path(__file__).resolve().parent.parent
VOID=set('area base br col embed hr img input link meta param source track wbr'.split())
SKIP=set('script style svg math pre code kbd samp'.split())
BLOCK=set('p h1 h2 h3 h4 h5 h6 li dt dd summary figcaption button a caption th td label legend option title textarea'.split())
INLINE=set('a abbr b bdi bdo br cite code del em i img kbd mark q ruby rp rt s samp small span strong sub sup time u var wbr'.split())
BRANDS='シンプルメモ開発者|Memo Inbox|Obsidian連携シンプルメモ|シンプルメモ|SimpleMemo Developer|AI ATAKA|株式会社ユリカ|YURIKA, K.K.|Obsidian Sync|Obsidian Publish|Obsidian|SimpleMemo|Simple Memo|Apple Watch|Apple Notes|Apple Intelligence|Apple Ads|Apple Search Ads|Apple Reminders|Apple|iPhone|iPad|iOS|macOS|iCloud|iTunes|App Store|Google Keep|Google Drive|Google Tasks|Google|Gmail|Outlook|Microsoft|OneNote|Notion|Todoist|Evernote|ChatGPT|OpenAI|Gemini|Captioo|Captio|Drafts|Simplenote|Bear|Logseq|Anytype|Heptabase|Roam Research|Capacities|Craft|Goodnotes|Standard Notes|TickTick|UpNote|Dynalist|Tana|Email Me|Mail to Self|LINE Keep|LINE|Dropbox|Proton Mail|Yahoo Mail|Siri|AirPods|Bluetooth|Wi-Fi|Markdown|Free|Pro|Plus|Vault|SMTP|OAuth|AES-GCM|AES-256|HTTPS|HTTP|TLS|SSL|API|URL|JSON-LD|JSON|CSS|HTML|JavaScript|Python|Swift|Cloudflare|GitHub|WebDAV|IFTTT|Zapier|Readwise|Readwise Reader|DEVONthink|Zettelkasten|GTD|PKM'
BRANDS += '|Resend|Google Workspace|Microsoft 365|お名前.com|さくらインターネット|Outbox'
RX=re.compile(r'\{\d+\}|https?://[A-Za-z0-9:/.?&=%_#~+@-]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<![A-Za-z0-9])[0-9a-fA-F]{16,}(?:…)?(?![A-Za-z0-9])|'+DAILY_LIMIT+'|'+QUANTITY+r'|\d+(?:[.,:/-]\d+)*|'+r'(?<![A-Za-z])(?:'+ '|'.join(re.escape(t) for t in sorted(BRANDS.split('|'),key=len,reverse=True))+r')(?![A-Za-z])')
@dataclass
class Node:
 tag:str; start:int; inner:int; end:int=0; stop:int=0; attrs:dict=field(default_factory=dict); children:list=field(default_factory=list)
class Parser(HTMLParser):
 def __init__(self,s):
  super().__init__(convert_charrefs=False);self.s=s;self.offsets=[0]
  for m in re.finditer('\n',s):self.offsets.append(m.end())
  self.root=Node('root',0,0,len(s),len(s));self.stack=[self.root];self.feed(s);self.close()
 def pos(self):line,col=self.getpos();return self.offsets[line-1]+col
 def handle_starttag(self,t,a):
  start=self.pos();end=start+len(self.get_starttag_text());n=Node(t,start,end,end,end,dict(a));self.stack[-1].children.append(n)
  if t not in VOID:self.stack.append(n)
 def handle_startendtag(self,t,a):self.handle_starttag(t,a);self.stack.pop() if t not in VOID else None
 def handle_endtag(self,t):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==t:
    for n in self.stack[i:]:n.end=self.pos();n.stop=self.s.find('>',self.pos())+1
    self.stack=self.stack[:i];break
 def data(self,v):
  p=self.pos();children=self.stack[-1].children
  # HTMLParser emits an entity separately. Rejoin adjacent pieces so an
  # address written with &#64; is protected as one literal email address.
  if children and children[-1].tag=='#text' and children[-1].stop==p:
   children[-1].end=children[-1].stop=p+len(v)
  else:children.append(Node('#text',p,p,p+len(v),p+len(v)))
 def handle_data(self,d):self.data(d)
 def handle_entityref(self,n):self.data('&'+n+';')
 def handle_charref(self,n):self.data('&#'+n+';')
 def handle_comment(self,d):
  p=self.pos();self.stack[-1].children.append(Node('#comment',p,p,p+len(d)+7,p+len(d)+7))
def translatable(s):return bool(re.search(r'[A-Za-z\u3040-\u30ff\u3400-\u9fff]',s))
def source_language(unit, fallback):
 # Japanese pages also contain English labels. Use their actual language,
 # rather than sending English prose through a Japanese-source model.
 return 'en' if fallback=='ja' and not re.search(r'[\u3040-\u30ff\u3400-\u9fff]',unit['text']) else fallback
def skip(n):return n.tag in SKIP or 'site-languages' in (n.attrs.get('class') or '').split() or n.attrs.get('translate')=='no' or 'lpr-phone-stage' in (n.attrs.get('class') or '').split()
def inlines(n):return all(c.tag.startswith('#') or (c.tag in INLINE and inlines(c)) for c in n.children)
def unit(n,s,verbatim=()):
 tags={};tokens={}
 # The Canvas example label also occurs in an ordinary sentence ending in
 # "can check the text"; only the actual label should remain literal.
 def literal_pattern(value):
  escaped=re.escape(value)
  if re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*',value):
   return r'(?<![A-Za-z0-9_])'+escaped+r'(?![A-Za-z0-9_])'
  return escaped+(r'(?!できます)' if value=='本文を確認' else '')
 pattern=re.compile('|'.join(literal_pattern(x) for x in sorted(verbatim,key=len,reverse=True))+'|'+RX.pattern) if verbatim else RX
 def token(raw,value=None):
  k=f'ZXQ{len(tokens):04d}';tokens[k]={'raw':raw,'value':quantity_value(value if value is not None else raw)}
  localized=localized_literal(raw)
  if localized:tokens[k]['locales']=localized
  return k
 def text(c):
  raw=unescape(s[c.start:c.stop]);raw=re.sub(r'\s+',' ',raw)
  # Keep is a product name in these labels, but an ordinary verb in prose
  # such as "Keep a backup". Preserve the name without blocking the verb.
  names=r'(?<![A-Za-z])Keep(?=[\u3040-\u30ff\u3400-\u9fff]| Chrome| (?:data|privacy|reminders in Tasks)\b|\s*$)'
  contextual=re.compile(names+'|'+pattern.pattern)
  return contextual.sub(lambda m:token(m[0], {'シンプルメモ開発者':'SimpleMemo Developer','シンプルメモ':'SimpleMemo','Obsidian連携シンプルメモ':'SimpleMemo','株式会社ユリカ':'YURIKA, K.K.','お名前.com':'Onamae.com','さくらインターネット':'SAKURA Internet'}.get(m[0],m[0])),raw)
 def encode(c):
  if c.tag=='#text':return text(c)
  if c.tag=='#comment' or skip(c) or c.tag in VOID:return token(s[c.start:c.stop])
  key=f'sm{len(tags)}';tags[key]={'open':s[c.start:c.inner],'close':s[c.end:c.stop]}
  return '<'+key+'>'+''.join(encode(x) for x in c.children)+'</'+key+'>'
 encoded = text(n) if n.tag=='#text' else ''.join(encode(c) for c in n.children)
 lo,hi=(n.start,n.stop) if n.tag=='#text' else (n.inner,n.end)
 direct=not translatable(re.sub('ZXQ[0-9]+|</?sm[0-9]+>', '',encoded))
 if direct and not tokens:return None
 normalized=encoded.strip()
 if not normalized:return None
 return {'id':hashlib.sha256(normalized.encode()).hexdigest()[:20],'text':normalized,'range':[lo,hi],'tags':tags,'tokens':tokens,'tag':n.tag,'direct':direct,
         'prefix':encoded[:len(encoded)-len(encoded.lstrip())],
         'suffix':encoded[len(encoded.rstrip()):]}
def collect(s,verbatim=()):
 p=Parser(s);result=[]
 def walk(n):
  if skip(n):return
  if n.tag=='#text' or (n.tag in BLOCK and inlines(n)):
   u=unit(n,s,verbatim)
   if u:result.append(u)
  else:
   for c in n.children:walk(c)
 walk(p.root);return result

def all_nodes(n):
 yield n
 for c in n.children:yield from all_nodes(c)
def plain_unit(text,kind,extra,verbatim=()):
 u=unit(Node('#text',0,0,len(text),len(text)),text,verbatim)
 if not u:return None
 u.pop('range');u.update({'kind':kind,**extra});return u

def collect_extra(s,verbatim=()):
 result=[];tree=Parser(s)
 for n in all_nodes(tree.root):
  if n.tag.startswith('#') or n.tag in ['style','script']:continue
  names=set(['alt','title','aria-label','placeholder','aria-description','aria-valuetext','data-label'])
  if 'template-copy-btn' in (n.attrs.get('class') or '').split():names.update(['data-copied','data-name'])
  if n.tag=='meta' and (n.attrs.get('name') or n.attrs.get('property') or '').lower() in ['description','keywords','og:title','og:description','twitter:title','twitter:description','og:image:alt','twitter:image:alt']:names.add('content')
  if n.tag=='input' and n.attrs.get('type') in ['button','submit','reset']:names.add('value')
  for name in names:
   if not n.attrs.get(name):continue
   raw=s[n.start:n.inner];m=re.search(r'\b'+re.escape(name)+r'\s*=\s*([\"\'])(.*?)\1',raw,re.S|re.I)
   if not m:raise ValueError(('unquoted attribute',name,raw))
   u=plain_unit(unescape(m[2]),'attribute',{'range':[n.start+m.start(2),n.start+m.end(2)],'quote':m[1],'attr':name},verbatim)
   if u:result.append(u)
 for n in all_nodes(tree.root):
  if n.tag!='script' or n.attrs.get('type')!='application/ld+json':continue
  try:payload=json.loads(s[n.inner:n.end])
  except json.JSONDecodeError:continue
  fields={'name','headline','description','text','articleBody','caption','keywords','featureList','slogan','abstract','disambiguatingDescription'}
  def walk(value,path=(),parent=None):
   if isinstance(value,dict):
    types=value.get('@type',[])
    if 'FAQPage' in ([types] if isinstance(types,str) else types):return
    for k,v in value.items():
     if k=='name' and value.get('@type')=='Offer' and v in ('Free','Premium Monthly','Premium Yearly'):continue
     if k in fields and isinstance(v,str):
      u=plain_unit(v,'json',{'script':[n.inner,n.end],'path':list(path+(k,))},verbatim)
      if u:result.append(u)
     elif isinstance(v,(dict,list)):walk(v,path+(k,),k)
   elif isinstance(value,list):
    for i,v in enumerate(value):
     if parent in fields and isinstance(v,str):
      u=plain_unit(v,'json',{'script':[n.inner,n.end],'path':list(path+(i,))},verbatim)
      if u:result.append(u)
     elif isinstance(v,(dict,list)):walk(v,path+(i,),parent)
  walk(payload)
 return result


SPOKEN_PAGES = ('siri/index.html','siri/iphone/index.html','obsidian/index.html',
 'hands-free/index.html','index.html','blog/obsidian-voice-fastest-route.html',
 'obsidian/airpods/index.html','how-to/index.html','obsidian/daily-note/index.html',
 'obsidian/shortcuts-not-working/index.html')

def examples_for(rel):
 if rel=='obsidian/getting-started/index.html':
  return ('ようこそ.md','買い物リスト.md')
 if rel=='guides/gmail/index.html':
  return ('verification',)
 if rel=='obsidian/properties/index.html':
  return ('FROM "記録"','status = "進行中"','Text / 進行中','未着手→進行中','status = 進行中')
 if rel=='obsidian/canvas/index.html':
  return ('本文を確認',)
 if rel=='obsidian/troubleshooting/sync-conflict/index.html':
  return ('作業メモ.md',)
 if rel in ('obsidian/uri-scheme/index.html','obsidian/uri-scheme/results/index.html','resources/obsidian-uri/index.html'):
  return ('^著者block','open','new','daily','unique','search','choose-vault','hook-get-address','vault','name','file','path','paneType','content','clipboard','silent','prepend','append','overwrite','x-success','x-error','split','window','tab','query','url','.md')
 if rel=='notion/index.html':
  return ('Captured',)
 if rel=='obsidian/troubleshooting/slow-startup/index.html':
  return ('起動確認',)
 if rel=='obsidian/graph-view/index.html':
  return ('tag:#研究','path:"研究/"')
 if rel=='obsidian/templates/index.html':
  return ('01-日次メモ.md','適用01-日次メモ.md','適用01-日次メモ')
 if rel=='obsidian/daily-note-plugins/index.html':
  return ('日誌/','週誌/','テンプレート/日.md','テンプレート/週.md')
 if rel in ('siri/index.html','siri/iphone/index.html','obsidian/index.html'):
  return ('Hey Siri、シンプルメモで残す','シンプルメモで残す','シンプルメモで音声メモ','シンプルメモに送信','シンプルメモにメモ','シンプルメモに声でメモ','声でメモ','〜で残す','で残す')
 if rel in SPOKEN_PAGES:
  return ('Hey Siri、シンプルメモで残す','シンプルメモで残す','シンプルメモで音声メモ','シンプルメモに送信','シンプルメモにメモ','シンプルメモに声でメモ')
 return ()

def annotate_examples(s,rel):
 if rel not in SPOKEN_PAGES or rel=='obsidian/index.html':return s
 examples=examples_for(rel)
 if not examples:return s
 tree=Parser(s);body=next(n for n in all_nodes(tree.root) if n.tag=='body')
 blocked=[(n.start,n.stop) for n in all_nodes(body) if n.tag in SKIP or n.tag=='#comment' or n.attrs.get('translate')=='no']
 text_ranges=[(n.start,n.stop) for n in all_nodes(body) if n.tag=='#text']
 # The comparison table emphasizes the suffix of both accepted and failed
 # commands. Keep the complete utterance, including that inline emphasis.
 phrases=list(examples)+['シンプルメモ<strong>'+suffix+'</strong>'
                         for suffix in ('で残す','に送信','にメモ')]
 pattern=re.compile('|'.join(re.escape(x) for x in sorted(phrases,key=len,reverse=True)))
 changes=[]
 for m in pattern.finditer(s,body.inner,body.end):
  if not any(lo<=m.start()<hi for lo,hi in text_ranges):continue
  if any(lo<=m.start()<hi for lo,hi in blocked):continue
  changes.append((m.start(),m.end(),'<span lang="ja" translate="no">'+m[0]+'</span>'))
 for lo,hi,value in reversed(changes):s=s[:lo]+value+s[hi:]
 return s

def prepare_source(s,locale,rel=None):
 s=annotate_examples(s,rel)
 if rel=='obsidian/daily-note-plugins/index.html':
  # These are the literal folder names in the downloadable Japanese example.
  for name in ('日誌','週誌','テンプレート'):
   s=s.replace('<strong>'+name+'</strong>','<strong translate="no">'+name+'</strong>')
 if rel in ('compose.html','verify.html'):
  # These legacy utility pages contain a second, unmarked English UI. New
  # localized documents use one UI while retaining the shared code display.
  start=s.index('<div class="lang-divider">');end=s.index('<script>',start)
  s=s[:start]+s[end:]
  route='/'+rel[:-5]
  s=s.replace('var here = window.location.href;',
              "var here = new URL("+json.dumps(route)+" + window.location.search + window.location.hash, window.location.origin).href;")
  s=s.replace("document.getElementById('appLinkEn').setAttribute('href', here);",'')
  s=re.sub(r'(<title>)([^<]+?) / [^<]+(</title>)',r'\1\2\3',s,count=1)
 changes=[];tree=Parser(s)
 def walk(n):
  if skip(n):return
  local=n.attrs.get('data-lang')
  if local and local!=locale:
   changes.append((n.start,n.stop,''));return
  if local:
   raw=s[n.start:n.inner];m=re.search(r'\sdata-lang\s*=\s*([\"\'])(.*?)\1',raw,re.S)
   if m:changes.append((n.start+m.start(),n.start+m.end(),''))
  if n.tag!='html' and n.attrs.get('lang') in ('ja','en'):
   raw=s[n.start:n.inner];m=re.search(r'\slang\s*=\s*([\"\'])(.*?)\1',raw,re.S)
   if m:changes.append((n.start+m.start(),n.start+m.end(),''))
  paired={c.attrs.get('lang') for c in n.children if c.attrs.get('translate')!='no'}
  for c in n.children:
   if {'ja','en'}<=paired and c.attrs.get('lang') in ('ja','en') and c.attrs.get('lang')!=locale and c.attrs.get('translate')!='no':
    changes.append((c.start,c.stop,''))
   else:walk(c)
 walk(tree.root)
 for a,b,value in sorted(changes,reverse=True):s=s[:a]+value+s[b:]
 return s
