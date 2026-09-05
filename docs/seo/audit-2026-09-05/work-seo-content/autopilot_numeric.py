import re,os,json
from bs4 import BeautifulSoup
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
html=open(S+'/wt/autopilot/index.html',encoding='utf-8').read()
soup=BeautifulSoup(html,'html.parser')
for t in soup(['script','style','noscript','nav','footer','header']): t.decompose()
main=soup.find('main') or soup.body
text=main.get_text('\n',strip=True)
linked=sorted(set(re.findall(r'href="/data/([^"]+)"',html)))
vals=set(); per_file={}
for j in linked:
    p=os.path.join(S,'wt','data',j)
    if not os.path.exists(p): continue
    d=open(p,encoding='utf-8').read()
    fv=set(float(x) for x in re.findall(r'(?<![\w.])-?\d+(?:\.\d+)?(?![\w.])',d.replace(',','')))
    per_file[j]=fv; vals|=fv
def trace(x,is_pct):
    cands=[x]
    if is_pct: cands+= [x/100]
    for c in cands:
        for v in vals:
            if abs(v-c)<0.051 or (is_pct and abs(round(v*100,1)-x)<0.051): return True
    return False
found=[];untr=[]
for m in re.finditer(r'(?<![\d.])(\$?)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?%|点|件|実行|行|回|本|版|人|時間|分|秒|円|USD|ドル|通)?',text):
    n=m.group(2).replace(',',''); u=m.group(3) or m.group(1) or ''
    x=float(n); is_pct=('%' in u)
    if re.fullmatch(r'20\d\d',n) or (x<=31 and '.' not in n and u.strip() in ('','日')): continue
    ctx=text[max(0,m.start()-60):m.end()+40].replace('\n',' ')
    (found if trace(x,is_pct) else untr).append((m.group(0),ctx))
print('traceable',len(found),'untraceable',len(untr))
seen=set()
for s,c in untr:
    if s in seen: continue
    seen.add(s); print(f'  [{s}] :: {c}')
