"""Validate and restore protected translation markup; reject incomplete output."""
import re, json, collections, html, sys
from pathlib import Path

MARK=re.compile(r'ZXQ\d+|</?sm\d+>')
def normalize(s):
 s=re.sub(r'&lt;(/?sm\d+)&gt;',lambda m:'<'+m[1].lower()+'>',s,flags=re.I)
 s=re.sub(r'<\s*(/?)\s*sm\s*(\d+)\s*>',lambda m:'<'+m[1]+'sm'+str(int(m[2]))+'>',s,flags=re.I)
 s=re.sub(r'ZXQ\s*(\d+)',lambda m:'ZXQ'+str(int(m[1])).zfill(4),s,flags=re.I)
 return s

def validate(source,target,locale='en'):
 target=normalize(target)
 if not target.strip():return 'empty'
 if re.search(r'<[/!A-Za-z]',MARK.sub('',html.unescape(target))):return 'unknown_markup'
 if collections.Counter(MARK.findall(source))!=collections.Counter(MARK.findall(target)):return 'markers'
 stack=[]
 for mark in MARK.findall(target):
  if mark.startswith('<'):
   if mark.startswith('</'):
    if not stack or stack.pop()!=mark[2:-1]:return 'nesting'
   else:stack.append(mark[1:-1])
 if stack:return 'unclosed'
 # Keeping an empty <a> or heading span while moving its words outside the
 # element passes marker counts but removes the usable label. Protected
 # names/numbers still count as content, and short grammatical spans may move.
 for match in re.finditer(r'<(sm\d+)>([\s\S]*?)</\1>',source):
  if sum(c.isalpha() for c in MARK.sub('',match[2]))<3:continue
  translated=re.search('<'+match[1]+r'>([\s\S]*?)</'+match[1]+'>',target)
  if translated and not re.search(r'\w',re.sub(r'</?sm\d+>','',translated[1])):
   return 'empty_inline'
 # Japanese source prose must not remain in non-Japanese translations.
 if locale!='ja' and re.search(r'[\u3041-\u3096\u30a1-\u30fa]',MARK.sub('',target)):return 'untranslated_japanese'
 if locale not in ('ja','zh-Hans','zh-Hant') and re.search(r'[\u3400-\u4dbf\u4e00-\u9fff]',MARK.sub('',target)):return 'untranslated_cjk'
 source_letters=sum(char.isalpha() for char in MARK.sub('',source))
 target_letters=sum(char.isalpha() for char in MARK.sub('',target))
 if source_letters>=8 and target_letters==0:return 'missing_prose'
 if source_letters>=60 and target_letters<source_letters*.2:return 'unexpectedly_short'
 return None

def korean_brand_particles(unit,target):
 # The translation engine sees opaque markers, so it cannot select a
 # Korean particle from the pronunciation of the protected product name.
 # Only adjust standalone particles after explicitly reviewed names.
 endings={
  'SimpleMemo':'', 'Simple Memo':'', 'Memo Inbox':'', 'Obsidian':'n', 'Obsidian Sync':'',
  'iPhone':'n', 'iPad':'', 'Apple':'l', 'Apple Watch':'', 'Apple Notes':'',
  'Apple Intelligence':'', 'iCloud':'', 'App Store':'', 'Gmail':'l',
  'Outlook':'k', 'Google':'l', 'Google Keep':'p', 'Microsoft':'',
  'OneNote':'', 'Notion':'n', 'Todoist':'', 'Evernote':'', 'Captio':'',
  'Captioo':'', 'Drafts':'', 'Free':'', 'Pro':'', 'Plus':'',
  'Markdown':'n', 'API':'', 'URL':'l', 'GitHub':'', 'YURIKA, K.K.':''}
 pairs={'은':('은','는'),'는':('은','는'),'이':('이','가'),'가':('이','가'),
        '을':('을','를'),'를':('을','를'),'과':('과','와'),'와':('과','와'),
        '으로':('으로','로'),'로':('으로','로')}
 def replace(m):
  value=unit['tokens'][m[1]]['value']
  if value not in endings:return m[0]
  ending=endings[value];particle=m[4]
  consonant=bool(ending) and not (ending=='l' and particle in ('으로','로'))
  return m[1]+m[2]+m[3]+pairs[particle][0 if consonant else 1]
 return re.sub(r'(ZXQ\d+)((?:</sm\d+>)*)(\s*)(으로|은|는|이|가|을|를|과|와|로)(?:\((?:으로|은|는|이|가|을|를|과|와|로)\))?(?=$|[\s.,:;!?…])',replace,target)

def render(unit,target,attribute=False,locale='en'):
 error=validate(unit['text'],target,locale)
 if error:raise ValueError(error)
 target=normalize(target)
 if locale=='ko':target=korean_brand_particles(unit,target)
 out=[];last=0
 for m in MARK.finditer(target):
  out.append(html.escape(html.unescape(target[last:m.start()]),quote=attribute));mark=m[0]
  if mark.startswith('ZXQ'):
   token=unit['tokens'][mark];value=token.get('locales',{}).get(locale,token['value']);raw=token['raw']
   out.append(value if raw.startswith('<') and not attribute else html.escape(value,quote=attribute))
  else:
   out.append(unit['tags'][mark.strip('</>')]['close' if mark.startswith('</') else 'open'])
  last=m.end()
 out.append(html.escape(html.unescape(target[last:]),quote=attribute))
 return unit.get('prefix','')+''.join(out)+unit.get('suffix','')
