import json,sys
d=json.load(open('/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad/work-seo-visual/results.json'))
print('reqTotal',d['reqTotal'],'bad',d['bad'][:10])
def delta(a,b):
    if not a or not b: return None
    return [b[i]-a[i] for i in range(4)]
for r in d['results']:
    m=r.get('m')
    if not m: print(r['page'],r['vp'],'ERROR',r.get('error')); continue
    print(f"\n## {r['vp']} {r['page']} status={r['status']} load={r['loadMs']}ms docH={m['docH']} {'NETIDLE-TIMEOUT' if r.get('networkidle') else ''} {r.get('fullShotErr','')}")
    print(f" overflow: scrollW-iw={m['scrollW']-m['iw']} bodyScrollW={m['bodyScrollW']} over={m['overCount']} unclipped={m['overUnclippedCount']} {m['overUnclipped']} clippedEx={[(o['sel'][-50:],o['right'],o['clip']) for o in m['overClipped']]}")
    print(f" nowrapJA: setters={m['nowrapJaCount']} wide={m['nowrapJaWide']}")
    h=m['h1']; print(f" h1: n={m['h1Count']} AF={h and h['aboveFold']} top={h and h['top']} fs={h and h['fs']} '{h and h['text'][:40]}'")
    print(f" ctaAF: {[(c['sel'][-40:],c['top'],c['w'],c['h'],c['text'],'NAV' if c['nav'] else 'BODY') for c in m['ctaAF']]} total={m['ctaTotal']}")
    print(f" hero: {m['hero']} broken={m['brokenImgs']} imgs={m['imgCount']}")
    print(f" lang: {m['lang']} other={m['otherLang']} hamburger={m['hamburger']} navLi={m['navLi']} navRows={m['navRows']}")
    for t in m['tables']: print(f" table: w={t['width']} right={t['right']} container={t['container']} containerOverflowPx={t['containerOverflowPx']} LEAK={t['leaks']} {t['sel'][-60:]}")
    print(f" font: body={m['bodyFs']} minP={m['minFs']} under16={m['under16']}/{m['paraCount']}")
    print(f" tap: n={m['ttCount']} small={m['ttSmallCount']} {[(t['sel'][-30:],t['w'],t['h'],t['text']) for t in m['ttSmall']]}")
    c=m['contrast']; print(f" contrast: "+' | '.join(f"{k}={v['ratio']}{'(grad)' if v['grad'] else ''} fg={v['fg']} bg={v['bg']} fs={v['fs']}" for k,v in c.items() if v))
    print(f" theme: {m['theme']} mojibake={m['mojibake']}")
    print(f" cls={m['cls']} src={m['clsSources']}")
    b5,b3=r.get('box500') or {},r.get('box3000') or {}
    print(f" shift500->3000: h1={delta(b5.get('h1'),b3.get('h1'))} hero={delta(b5.get('hero'),b3.get('hero'))} cta={delta(b5.get('cta'),b3.get('cta'))} docH {b5.get('docH')}->{b3.get('docH')}")
    if r.get('menu'): print(f" menu: {r['menu']}")
    if r.get('langMenu'): print(f" langMenu: {r['langMenu']}")
    if r.get('errs'): print(f" errs: {r['errs']}")
