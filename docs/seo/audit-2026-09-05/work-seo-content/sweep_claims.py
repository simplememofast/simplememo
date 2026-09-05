import re, os, sys, json
ROOT = sys.argv[1]; OUT = sys.argv[2]
files = [l.strip() for l in open(os.path.join(OUT,'html_files.txt'))] + ['llms.txt']
OWN = r'(Obsidian連携シンプルメモ|Captio式シンプルメモ|シンプルメモ|Simple ?Memo|SimpleMemoFast|自社|当アプリ|本アプリ|このアプリ|our app|this app|we )'
GROUPS = {
 'own_speed_nonstd': re.compile(r'(?<![\d.])(0\.[0-9]|1\.[0-9]|[1-9])\s?(?:秒|s\b|sec(?:ond)?s?\b)'),
 'stale_1sec': re.compile(r'約1秒|1秒で起動|起動約1秒|約1秒起動|1秒起動|about 1 second|about a second|~1 ?s\b|1 second launch|launches in (?:about )?1 second|in about one second', re.I),
 'banned_03': re.compile(r'0\.3\s?秒|0\.3\s?s(?:ec)?\b(?! latency)|0\.3-0\.5', re.I),
 'banned_10x': re.compile(r'10倍|10x\s?faster|10×|ten times faster', re.I),
 'banned_captio_faster': re.compile(r'faster than Captio|Captio(?:より|よりも|を超え|以上に)速|Captio.{0,20}より速', re.I),
 'banned_gmail_api': re.compile(r'Gmail ?API', re.I),
 'e2ee': re.compile(r'end-to-end|E2EE|エンドツーエンド|エンド・ツー・エンド', re.I),
 'captio_year': re.compile(r'Captio[^。.<]{0,80}?(20(?:09|10|12|13|14|15|16|17|18|19|20|21|22|23))年?|(20(?:09|10|12|13|14|15|16|17|18|19|20|21|22|23))年?[^。.<]{0,60}?Captio'),
 'captio_shutdown': re.compile(r'Captio[^。.<]{0,80}?(20(?:23|24|25)年\s?(?:[1-9]|1[0-2])月|(?:January|February|March|April|May|June|July|August|September|November|December)\s+20(?:23|24|25))'),
 'captio_reason': re.compile(r'Captio[^。.<]{0,60}?(終了(?:の)?(?:理由|原因)は|because|due to|理由は)'),
 'affiliation': re.compile(r'公式(?:の)?後継|official successor|正式(?:な)?後継|公認|endorsed by|承認を得', re.I),
 'superlative': re.compile(r'唯一|最速|No\.\s?1|ナンバーワン|日本一|世界一|業界(?:最|初|唯一)|国内(?:最|初|唯一)|the only\b|only app|fastest|#1\b|number one|best-in-class|世界初|日本初', re.I),
 'stale_rating': re.compile(r'4\.4\s?(?:/\s?5|★|・|\()|★\s?4\.4|4\.24|(?<!\d)(?:22|21|10|8)\s?(?:件の評価|件のレビュー|ratings\b|reviews\b)|\(\s?(?:22|21|10|8)\s?(?:件|ratings)\)'),
 'stale_version': re.compile(r'(?<![\d.])v?(?:3\.[0-9]|4\.[0-9]|5\.[0-7])\.[0-9](?![\d.])|v?5\.8\.[0-3](?![\d.])|v?5\.8\.5|Ver(?:sion)?\.?\s?[345]\.\d'),
 'stale_quota': re.compile(r'1日\s?(?:1|2|5|10)通|(?:1|2|5|10) sends? (?:a|per) day|(?:1|2|5|10)通まで無料'),
 'stale_price': re.compile(r'¥\s?(?:600|400|480|980|4,?800|6,?000|3,?000)(?!\d)|(?:600|400|480|980|4,?800|6,?000|3,?000)円(?!台)|\$(?:1\.99|3\.99|4\.99|19\.99|24\.99|39\.99)'),
}
res = []
for rel in files:
    p = os.path.join(ROOT, rel)
    try: txt = open(p, encoding='utf-8').read()
    except Exception as e: continue
    lines = txt.split('\n')
    for i, line in enumerate(lines, 1):
        for g, rx in GROUPS.items():
            for m in rx.finditer(line):
                a = max(0, m.start()-70); b = min(len(line), m.end()+70)
                ctx = line[a:b].replace('\t',' ')
                near_own = bool(re.search(OWN, line[max(0,m.start()-120):m.end()+120]))
                if g == 'own_speed_nonstd':
                    v = float(m.group(1))
                    if not near_own: continue
                    if abs(v-0.4)<0.05 or abs(v-0.167)<0.05 or abs(v-0.6)<0.05: continue
                res.append({'file':rel,'line':i,'group':g,'match':m.group(0),'near_own':near_own,'ctx':ctx})
json.dump(res, open(os.path.join(OUT,'claims_hits.json'),'w'), ensure_ascii=False, indent=0)
from collections import Counter
c = Counter(r['group'] for r in res)
print('hits by group:', dict(c))
fc = Counter((r['group'], r['file']) for r in res)
for g in GROUPS:
    fs = sorted({r['file'] for r in res if r['group']==g})
    print(f'{g}: {len(fs)} files')
