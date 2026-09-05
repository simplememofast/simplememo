import re,os,json
from bs4 import BeautifulSoup
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
html=open(S+'/wt/autopilot/index.html',encoding='utf-8').read()
soup=BeautifulSoup(html,'html.parser')
for t in soup(['script','style','noscript','nav','footer','header']): t.decompose()
main=soup.find('main') or soup.body
lines=[]
for el in main.find_all(['p','li','td','th','h1','h2','h3','dt','dd','figcaption','b','strong','span']):
    tx=el.get_text(' ',strip=True)
    if tx: lines.append(tx)
text='\n'.join(dict.fromkeys(lines))
# load all data files linked
data=''
for j in sorted(set(re.findall(r'href="/data/([^"]+)"',html))):
    p=os.path.join(S,'wt','data',j)
    if os.path.exists(p): data+=open(p,encoding='utf-8').read()+'\n'
data_norm=data.replace(',','')
nums=re.findall(r'(?<![\d.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?%|件|実行|日|行|回|本|版|人|時間|分|秒|円|ドル|\$|USD|通|ページ|個)?',text)
seen={}
for n,u in nums:
    key=n
    if key in seen: continue
    raw=n; plain=n.replace(',','')
    found = (plain in data_norm)
    # for percentages check with and without decimals
    if not found and '.' in plain:
        found = plain in data_norm
    seen[key]=(u,found)
untr=[(k,v[0]) for k,v in seen.items() if not v[1] and not re.fullmatch(r'20\d\d|\d{1,2}|1\d{2}',k)]
print('distinct numbers in visible text:',len(seen),' not found verbatim in linked data files (excluding years and 1-3 digit small ints):',len(untr))
print(untr[:60])
# contexts for untraceable
for k,u in untr[:40]:
    m=re.search(r'[^\n]{0,70}'+re.escape(k)+r'[^\n]{0,50}',text)
    print(f'  [{k}{u}] :: {m.group(0) if m else ""}')
