#!/usr/bin/env python3
"""Reject stale film assets, measurement claims, or accessible evidence."""
from copy import deepcopy
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts' / 'perf'))
from build_home import is_editorial_home, editorial_contract_errors
FILES = ('index.html', 'data/benchmark.json', 'scripts/build_home_film.py',
         'assets/video/capture-home.json', 'assets/video/capture-home.mp4',
         'assets/video/capture-home-poster.jpg')


def measurement_snapshot(ledger):
    return {'device':ledger['measuredOn']['device'], 'date':ledger['measuredOn']['date'],
            'condition':ledger['launchCondition']['published_as'],
            'apps':{name:{key:data[key] for key in ('ready','n','ready_basis') if key in data}
                    for name,data in ledger['apps'].items()}}


def shown(value):
    return str(Decimal(str(value)).quantize(Decimal('.1'), rounding=ROUND_HALF_UP))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def measurement_errors(ledger):
    errors=[]
    if ledger['measuredOn']['device']!='iPhone 16e (A18)' or ledger['launchCondition']['published_as']!='warm start':
        errors.append('Measurement conditions need review')
    if not all(4<=data['n']<=10 for data in ledger['apps'].values()):
        errors.append('The published 4–10 measurement count needs review')
    drafts=ledger['apps'].get('Drafts',{})
    if drafts.get('n')!=5 or not drafts.get('ready_basis','').startswith('FAST MODE, not the median.'):
        errors.append('The Drafts fastest-of-five explanation needs review')
    if any(data.get('ready_basis') for name,data in ledger['apps'].items() if name!='Drafts'):
        errors.append('The median explanation needs review')
    return errors


def validate(files):
    errors=[]
    def need(ok, message):
        if not ok:errors.append(message)
    ledger=json.loads(files['data/benchmark.json'])
    errors.extend(measurement_errors(ledger))
    meta=json.loads(files['assets/video/capture-home.json'])
    page=files['index.html'].decode()
    figure=re.search(r'<figure\b[^>]*class="lp-video home-film"[^>]*>(.*?)</figure>',page,re.S)
    ready=shown(ledger['apps']['Simple Memo - for Obsidian']['ready'])
    need(meta['measurement']==measurement_snapshot(ledger),'Film measurement snapshot is stale')
    need(meta['ready_s']==ledger['apps']['Simple Memo - for Obsidian']['ready'],'Film timing is stale')
    need(meta['renderer_sha256']==digest(files['scripts/build_home_film.py']),'Film renderer changed without a new export')
    need(meta['sha256']==digest(files['assets/video/capture-home.mp4']),'Video differs from its export record')
    need(meta['poster_sha256']==digest(files['assets/video/capture-home-poster.jpg']),'Poster differs from its export record')
    need(meta['bytes']==len(files['assets/video/capture-home.mp4']),'Video byte size differs')
    need(meta['duration_s']==18 and meta['fps']==30 and (meta['width'],meta['height'])==(2560,1600),'Film format changed; review visible metadata')
    # The new Japanese layout deliberately contains no film. Its explicit page
    # contract replaces only the visible film contract; the measured/exported
    # video remains a maintained asset and still passes all ledger/hash checks.
    if is_editorial_home(page):
        errors.extend(editorial_contract_errors(page))
        return errors
    if not figure:
        return errors + ['Homepage film is missing']
    film=figure[1]
    need('図解動画 · 18秒 · 音声なし' in film and '18秒の図解動画を再生' in film,'Visible film duration is stale')
    need(f'<strong>{ready}秒</strong>' in film,'Visible timing differs from ledger')
    need('iPhone 16e' in film and 'ウォーム起動' in film and
         ledger['measuredOn']['device']=='iPhone 16e (A18)' and
         ledger['launchCondition']['published_as']=='warm start','Measurement conditions need review')
    need('書く時間・送信時間は含みません' in film and '実機画面の録画ではありません' in film,'Timing scope or illustration disclosure missing')
    need('※Draftsのみ、5回中の最速値です' in film,'Drafts statistical exception missing')
    rows=re.findall(r'<tr><th scope="row">(.*?)</th><td>(.*?)</td></tr>',film)
    expected=[('シンプルメモ' if name=='Simple Memo - for Obsidian' else name,
               shown(data['ready'])+'秒'+(' ※' if data.get('ready_basis') else ''))
              for name,data in sorted(ledger['apps'].items(),key=lambda item:item[1]['ready'])]
    need(rows==expected,'Accessible comparison differs from ledger')
    video_url='/assets/video/capture-home.mp4?v='+digest(files['assets/video/capture-home.mp4'])[:10]
    poster_url='/assets/video/capture-home-poster.jpg?v='+digest(files['assets/video/capture-home-poster.jpg'])[:10]
    need(f'src="{video_url}"' in film and f'poster="{poster_url}"' in film,'Film cache versions are stale')
    schemas=[json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>',page,re.S)]
    video=next((s for s in schemas if isinstance(s,dict) and s.get('@type')=='VideoObject'),None)
    need(bool(video),'VideoObject missing')
    if video:
        need(video.get('contentUrl')=='https://simplememofast.com'+video_url and
             video.get('thumbnailUrl')==['https://simplememofast.com'+poster_url], 'VideoObject asset URLs are stale')
        need(video.get('duration')=='PT18S' and f'入力開始まで{ready}秒' in video.get('description',''), 'VideoObject timing is stale')
        need(not re.search(r'&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);', json.dumps(video, ensure_ascii=False)),
             'VideoObject carries an HTML entity (JSON-LD text is not HTML-decoded)')
    return errors


def legacy_fixture(files):
    """A minimal complete film contract, independent of the selected homepage."""
    ledger=json.loads(files['data/benchmark.json'])
    ready=shown(ledger['apps']['Simple Memo - for Obsidian']['ready'])
    rows=''.join('<tr><th scope="row">'+('シンプルメモ' if name=='Simple Memo - for Obsidian' else name)
                 +'</th><td>'+shown(data['ready'])+'秒'+(' ※' if data.get('ready_basis') else '')+'</td></tr>'
                 for name,data in sorted(ledger['apps'].items(),key=lambda item:item[1]['ready']))
    video_url='/assets/video/capture-home.mp4?v='+digest(files['assets/video/capture-home.mp4'])[:10]
    poster_url='/assets/video/capture-home-poster.jpg?v='+digest(files['assets/video/capture-home-poster.jpg'])[:10]
    schema={'@context':'https://schema.org','@type':'VideoObject','duration':'PT18S',
            'contentUrl':'https://simplememofast.com'+video_url,
            'thumbnailUrl':['https://simplememofast.com'+poster_url],
            'description':f'入力開始まで{ready}秒はiPhone 16e・ウォーム起動の実測で、書く時間・送信時間は含みません'}
    return ('<!doctype html><html lang="ja"><head><script type="application/ld+json">'
            +json.dumps(schema,ensure_ascii=False)+'</script></head><body>'
            +'<figure class="lp-video home-film"><video poster="'+poster_url+'"><source src="'+video_url+'"></video>'
            +'<button aria-label="18秒の図解動画を再生">再生</button><figcaption>'
            +'図解動画 · 18秒 · 音声なし <strong>'+ready+'秒</strong> iPhone 16e ウォーム起動 '
            +'書く時間・送信時間は含みません。実機画面の録画ではありません。※Draftsのみ、5回中の最速値です'
            +'<table>'+rows+'</table></figcaption></figure></body></html>').encode()


def main():
    files={name:(ROOT/name).read_bytes() for name in FILES}
    errors=validate(files)
    if errors:raise SystemExit('\n'.join(errors))
    if '--selftest' in sys.argv:
        # Always exercise the old positive/negative contract, even when the live
        # page uses the editorial layout; a missing legacy film must still fail.
        editorial = files.copy() if is_editorial_home(files['index.html'].decode()) else None
        if editorial:
            files = files.copy()
            files['index.html'] = legacy_fixture(files)
            if validate(files):raise SystemExit('Legacy film regression fixture is invalid')
        assert shown(.35)=='0.4' and shown(1.45)=='1.5'
        mutants=[]
        def change(name, old, new):
            copy=files.copy();assert old in copy[name]
            copy[name]=copy[name].replace(old,new,1);mutants.append(copy)
        change('index.html',b'<strong>0.4',b'<strong>9.4')
        change('index.html','2.8秒'.encode(),'9.8秒'.encode())
        change('index.html',b'PT18S',b'PT20S')
        change('index.html','図解動画 · 18秒'.encode(),'図解動画 · 22秒'.encode())
        change('index.html',b'capture-home.mp4?v=',b'capture-home.mp4?v=stale')
        change('index.html','はiPhone 16e・ウォーム起動の実測で'.encode(),'はiPhone&nbsp;16e・ウォーム起動の実測で'.encode())
        change('assets/video/capture-home.mp4',files['assets/video/capture-home.mp4'][:8],b'BROKEN!!')
        change('scripts/build_home_film.py',b'FPS, DURATION',b'FPS,  DURATION')
        changed=deepcopy(json.loads(files['data/benchmark.json']))
        changed['measuredOn']['device']='Different device'
        copy=files.copy();copy['data/benchmark.json']=json.dumps(changed).encode();mutants.append(copy)
        for key,value in (('n',20),('ready_basis','median of five runs')):
            changed=deepcopy(json.loads(files['data/benchmark.json']))
            changed['apps']['Drafts'][key]=value
            copy=files.copy();copy['data/benchmark.json']=json.dumps(changed).encode()
            metadata=json.loads(copy['assets/video/capture-home.json'])
            metadata['measurement']=measurement_snapshot(changed)
            copy['assets/video/capture-home.json']=json.dumps(metadata).encode()
            mutants.append(copy)
        for i, mutant in enumerate(mutants):
            if not validate(mutant):raise SystemExit(f'Film guard missed mutation {i}')
        print(f'PASS: {len(mutants)} stale film mutations rejected')
        if editorial:
            for old,new in ((b'sm-editorial',b'sm-editorial-missing'),
                            (b'</main>',b'<video></video></main>'),
                            (b'</head>',b'<meta name="robots" content="noindex"></head>')):
                candidate=editorial.copy()
                if old not in candidate['index.html']:raise SystemExit('Editorial selftest marker missing')
                candidate['index.html']=candidate['index.html'].replace(old,new,1)
                if not validate(candidate):raise SystemExit('Editorial film guard missed mutation')
            print('PASS: editorial marker, indexability and absent-video mutations rejected')
    print('PASS: selected homepage contract and benchmark/video asset integrity agree')


if __name__=='__main__':main()
