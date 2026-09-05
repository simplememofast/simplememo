import re,os,json
S='/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
files=[l.strip() for l in open(S+'/work-seo-content/html_files.txt')]
rx=re.compile(r'~ ?1[- ]second|~1s\b|about 1 second launch|1 second launch|約1秒|1秒で起動|起動約1秒|約1秒起動|about 1\.0s|in about 1\.0s|launched in about 1\.0s|\b1\.0s\b',re.I)
OWN=re.compile(r'Obsidian連携シンプルメモ|シンプルメモ|Simple ?Memo|SimpleMemoFast|our app|this app|the app\b|ranked|Captio-style|memo app',re.I)
NOTOWN=re.compile(r'Apple Notes takes|Email Me|Note To Self Mail|Boomerang|Bear|Drafts|保存も約1秒|competitor',re.I)
out=[]
for rel in files:
    t=open(os.path.join(S,'wt',rel),encoding='utf-8').read()
    for i,line in enumerate(t.split('\n'),1):
        for m in rx.finditer(line):
            seg=line[max(0,m.start()-160):m.end()+160]
            if not OWN.search(seg): continue
            if NOTOWN.search(line[max(0,m.start()-60):m.end()+60]) and not re.search(r'Simple ?Memo|シンプルメモ',line[max(0,m.start()-60):m.end()+60]): continue
            contra=bool(re.search(r'0\.4\s?(秒|s\b|seconds)',line))
            hidden = 'data-lang="en"' in line or ('lang="en"' in line and not rel.startswith('en/'))
            visible_en = rel.startswith('en/')
            out.append({'file':rel,'line':i,'match':m.group(0),'contra_same_line':contra,'visible_en':visible_en,'hidden_en_marker':hidden,'ctx':re.sub(r'<[^>]+>','',seg)[:180]})
json.dump(out,open(S+'/work-seo-content/one_second_hits.json','w'),ensure_ascii=False,indent=0)
files_hit=sorted({o['file'] for o in out})
print('total hits',len(out),'files',len(files_hit))
print('visible EN (en/) files:',len({o['file'] for o in out if o['visible_en']}))
print('JA-root files (dual-DOM EN text):',len({o['file'] for o in out if not o['visible_en']}))
print('same-line 0.4 contradiction lines:',sum(1 for o in out if o['contra_same_line']))
print('in <meta>/JSON-LD lines:',sum(1 for o in out if re.search(r'<meta|application/ld\+json|"description"|"text":',open(os.path.join(S,'wt',o['file']),encoding='utf-8').read().split('\n')[o['line']-1])))
print()
for f in files_hit: print(f, [o['line'] for o in out if o['file']==f][:6])
