"""One-time exact-base branch preparation; remove before final PR validation."""
from pathlib import Path
import copy, datetime, hashlib, json, os, re, subprocess, urllib.request, urllib.parse
BASE = '2c25e4b5fc4f3395cdc7c16e27a23868510b59e3'
ROOT = Path.cwd()
NEW = 'assets/home-perf/voice-airpods-pro-bright-1536-1200-c83d10d4e8a0.avif'
SHA = 'c83d10d4e8a01683faac5e926391225320c0e223b503583dbbf7c0b63acaee02'
EVIDENCE = 'docs/perf/pagespeed-reconciliation-20260918.json'
def read(name): return (ROOT/name).read_text()
def write(name, text):
    p=ROOT/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(text)
def dump(name, value): write(name,json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def replace(text, old, new):
    assert text.count(old)==1, 'Source precondition: '+old[:80]
    return text.replace(old,new)
def run(*args): subprocess.run(args,cwd=ROOT,check=True)
def api(path):
    assert re.fullmatch(r'(pulls/\d+|actions/runs/\d+(/artifacts)?)',path)
    q=urllib.request.Request('https://api.github.com/repos/simplememofast/simplememo/'+path,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(q,timeout=30) as r:
        assert urllib.parse.urlparse(r.url).hostname=='api.github.com'
        return json.load(r)
pages={p:read(p) for p in ['index.html','en/index.html']}
old=json.loads(read('assets/home-perf/manifest.json'))
write('scripts/perf/build_home.py',replace(read('scripts/perf/build_home.py'),'(600, 750, 900, 1536)','(600, 750, 900, 1200, 1536)'))
run('python','scripts/perf/build_home.py','--write'); run('python','scripts/perf/build_home.py','--check')
m=json.loads(read('assets/home-perf/manifest.json'))
assert len(old['assets'])==32 and len(m['assets'])==33
assert m['pages']==old['pages'] and m['inputs']==old['inputs']
for name,record in old['assets'].items():
    assert m['assets'][name]==record
    assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==record['sha256']
b=(ROOT/NEW).read_bytes(); assert len(b)==51713 and hashlib.sha256(b).hexdigest()==SHA
for name,before in pages.items():
    s=read(name); addition=', /'+NEW+' 1200w'
    assert s.count(addition)==2 and s.replace(addition,'')==before
s=read('scripts/perf/browser_checks.cjs')
s=replace(s,'  { width: 390, dpr: 1, javascript: false },','  { width: 412, dpr: 3 },\n  { width: 390, dpr: 1, javascript: false },')
checks=r'''          const hero = record.images.find(image => /voice-airpods-pro-bright-/.test(image.url));
          assert(hero, 'The displayed hero must be in the checked inventory');
          if ((width === 390 && dpr === 3) || (width === 1440 && dpr === 1)) {
            assert(/-1200-[a-f0-9]{12}\.avif$/.test(hero.url), 'Use the correctly sized 1200px hero');
          }
          if (width === 412 && dpr === 3) {
            assert(/-1536-[a-f0-9]{12}\.avif$/.test(hero.url), 'Wider triple-density displays retain full detail');
          }
          record.heroResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /\/voice-airpods-pro-bright-/.test(entry.name)).map(entry => ({url: entry.name, encodedBodySize: entry.encodedBodySize, transferSize: entry.transferSize, initiatorType: entry.initiatorType})));
          assert.equal(record.heroResources.length, 1, 'Responsive preload and picture must reuse one request');
          assert.equal(record.heroResources[0].url, hero.url, 'Measured request must be the displayed hero');
          const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../assets/home-perf/manifest.json'), 'utf8'));
          const expected = manifest.assets[new URL(hero.url).pathname.slice(1)];
          assert(expected, 'Displayed hero must be in the verified manifest');
          assert.equal(record.heroResources[0].encodedBodySize, expected.bytes, 'Encoded response bytes must match the immutable asset');
'''
s=replace(s,'          await page.evaluate(() => scrollTo(0, 0));',checks+'          await page.evaluate(() => scrollTo(0, 0));')
write('scripts/perf/browser_checks.cjs',s)
s=replace(read('scripts/perf/browser_checks.test.cjs'),'  assert.equal(CASES.length, 9);','  assert(CASES.some(c => c.width === 412 && c.dpr === 3));\n  assert.equal(CASES.length, 10);')
s+=r'''

test('responsive hero hints share five widths and retain original fallback and decoding', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const name of ['index.html', 'en/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');
    const preload = html.match(/<link rel="preload" as="image"[^>]*imagesrcset="([^"]+)"[^>]*imagesizes="([^"]+)"/);
    const picture = html.match(/<picture class="hero__photograph">([\s\S]*?)<\/picture>/);
    assert(preload && picture, 'Both native image hints must remain');
    const source = picture[1].match(/<source data-home-perf="image"[^>]*srcset="([^"]+)"[^>]*sizes="([^"]+)"/);
    assert(source); assert.equal(source[1], preload[1]); assert.equal(source[2], preload[2]);
    assert.deepEqual([...source[1].matchAll(/ (\d+)w/g)].map(m => Number(m[1])), [600, 750, 900, 1200, 1536]);
    assert(picture[1].includes('decoding="async"'), 'Rejected decoding change must not ship');
    assert(picture[1].includes('.webp'), 'Original native fallback must survive');
  }
});
'''
write('scripts/perf/browser_checks.test.cjs',s)
run('node','--test','scripts/perf/browser_checks.test.cjs')
prs=[]
for number,sha in [(1441,'72beac2695f8e654cfdb343ca613b165c3e62964'),(1443,'e4f4061910e9de07cb79ed3a29ac5f29c4047f6a'),(1445,'3298c729a91ffda8b06e439401c07dd87bb05211')]:
    p=api('pulls/'+str(number)); assert p['merged'] is True and p['merge_commit_sha']==sha
    prs.append({k:p[k] for k in ['number','merged','merged_at','merge_commit_sha','html_url']})
expected={35219409503:('72beac2695f8e654cfdb343ca613b165c3e62964','success'),35219409557:('72beac2695f8e654cfdb343ca613b165c3e62964','success'),35231730962:('e4f4061910e9de07cb79ed3a29ac5f29c4047f6a','failure'),35235783346:('3298c729a91ffda8b06e439401c07dd87bb05211','failure')}
runs=[]
for number,(sha,result) in expected.items():
    r=api('actions/runs/'+str(number)); assert r['head_sha']==sha and r['status']=='completed' and r['conclusion']==result
    runs.append({k:r[k] for k in ['id','name','head_sha','status','conclusion','html_url','created_at','updated_at']})
a=next(x for x in api('actions/runs/35219409503/artifacts')['artifacts'] if x['id']==10495894178)
assert not a['expired'] and a['digest']=='sha256:c29ac7698ec4680df49a141f2517780701b4e5feb9b6dbc760ddd3245b2128de'
ledger=json.loads(read('data/autopilot-runs.json')); original=copy.deepcopy(ledger); assert len(ledger['runs'])==69
common={'date_jst':'2026-09-17','route':'owner-session','attempted':True,'lane':'F','action':'repair','artifact':None,'source':'session','evidence':EVIDENCE,'interventions':[{'kind':'request','note':'オーナー依頼のPageSpeed継続作業。自然定期運転・無介入出荷として数えない。'}]}
rows=[dict(common,run_id='ap-20260917-owner-session-pagespeed-navigation',outcome='shipped',pr=1441,failure_reason=None,external_ref='github-pr:1441',note='検証済みのページ内移動修正1441を1サイクルとして回収。不採用動画案1440は出荷に数えない。'),dict(common,run_id='ap-20260917-owner-session-pagespeed-poster',outcome='failed',pr=1443,external_ref='github-pr:1443+1445',failure_reason='Poster1443 and rollback1445 both failed their original post-merge Japanese performance budget. Original content was restored; speed recovery and causality are unproven.',failure_stage='execution',needs_triage=True,note='ポスター試行とロールバックを1つの失敗サイクルとして保持。成功出荷や今回の1200px候補として計上しない。')]
for row in rows:
    assert not any(r.get('run_id')==row['run_id'] or r.get('external_ref')==row['external_ref'] for r in ledger['runs'])
    ledger['runs'].append(row)
assert ledger['runs'][:-2]==original['runs']
for key in original:
    if key!='runs': assert ledger[key]==original[key]
dump('data/autopilot-runs.json',ledger)
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
dump(EVIDENCE,{'base':BASE,'verified_at':now,'prs':prs,'runs':runs,'public_receipt_artifact':{k:a[k] for k in ['id','digest','size_in_bytes']},'scope':'One verified success and one failed poster/rollback cycle, both owner-requested. All69 original rows/retractions and unknown scheduler outcomes preserved. No current density-release success inferred.'})
status=json.loads(read('data/autopilot-status.json'))
status.update(date_jst='2026-09-17',generated_at=now,action='repair',article=None,pr=1445,reason='9月17日のページ内移動修正1441を成功1サイクル、ポスター試行1443とロールバック1445を速度基準未達の失敗1サイクルとして一次証拠から回収。定期運転・無介入出荷・記事公開ではない。',verified='同一SHAのPR1441公開後PageSpeed/SEO成功と本番照合artifact、およびPR1443/1445公開後PageSpeed失敗を確認。証拠: '+EVIDENCE+'。未取得の定期タスク結果は不明。',next='断続的な描画遅延と既存の失敗は未解決。回収対象以外の出荷はこの記録に含めない。未取得定期運転とprevious_scheduled_observationの保留事項を維持。',observation_scope='Two historical September17 owner cycles, including one failure; not scheduled execution or a current density-release verdict.')
assert status['streak']['last_article_date_jst']=='2026-09-14'
status['streak'].update(consecutive_no_article_days=3,last_production_change_date_jst='2026-09-17',days_since_production_change=0)
status['checks'].update(seo_check='Historical PR1441 post-merge SEO35219409557 succeeded; this field describes recovered September17 outcomes, not current release acceptance.',mobile_qa='Historical PR1441 audit35219409503 succeeded; PR1443/1445 audits35231730962/35235783346 failed. Those failures remain unresolved.')
dump('data/autopilot-status.json',status)
run('node','scripts/autopilot-runs.mjs','--write-status')
status=json.loads(read('data/autopilot-status.json'))
assert status['runs']['totals']=={'runs':71,'attempted':49,'shipped':33,'failed':16,'no_run':2}
assert status['runs']['streaks']['current']['days']==31 and status['runs']['shipping_streaks']['current']['days']==2
page=read('autopilot/index.html'); start='<!-- run-streaks:start -->'; end='<!-- run-streaks:end -->'; assert page.count(start)==page.count(end)==1
block='''<!-- run-streaks:start -->
          この定義での連続稼働は現在<b>31</b>日（2026年8月18日〜2026年9月17日）で、最長も<b>31</b>日（2026年8月18日〜2026年9月17日）です。
          「現在」は台帳の最終記入日（2026年9月17日）時点です。
          稼働の定義では、失敗して行が立った日も「記録がある日」なので連続が切れません。
          <b>連続出荷は現在2日</b>（2026年9月16日〜2026年9月17日）で、<b>連続出荷の最長は8日</b>（2026年9月1日〜2026年9月8日）です。
          <!-- run-streaks:end -->'''
page=re.sub(re.escape(start)+r'.*?'+re.escape(end),lambda _:block,page,count=1,flags=re.S)
page=replace(page,'9月16日の記録はオーナー依頼による高速化保守です。定期運転の成功や記事公開を意味せず、同日の未取得タスク結果は不明のままです。','9月16日・17日の回収記録はオーナー依頼の保守で、定期運転・無介入出荷・記事公開ではありません。9月17日はページ内移動修正1件が検証済み、ポスター試行とロールバックは1つの速度基準未達サイクルです。未取得タスク結果は不明、断続的な描画遅延は未解決のままです。')
write('autopilot/index.html',page)
run('node','scripts/autopilot-runs.mjs','--selftest'); run('node','scripts/autopilot-runs.mjs','--check')
run('node','scripts/check-autopilot-page.mjs','--check')
run('python','scripts/generate_sitemap.py'); run('python','scripts/generate_sitemap.py','--check')
run('node','scripts/check-css-version.mjs')
dump('docs/perf/hero-density-20260918.json',{'base':BASE,'asset':NEW,'sha256':SHA,'width':1200,'height':800,'bytes':51713,'former_1536_bytes':75630,'saved_bytes_when_selected':23917,'encoding':'Existing AVIF quality65/speed6/4:4:4; no quality-setting change','original_assets_preserved':32,'protocol':{'primary':'At least25% fewer actual hero bytes at390x3 and1440x1, adequate physical pixels and one preload/picture request','controls':'412x3 retains1536;412x1.75 retains750; all old variants, original WebP/native media, copy, fonts, CSS, tracking and existing budgets stay intact'},'limits':'No default-device Lighthouse increase or repaired intermittent presentation delay is claimed. Final-head and production checks remain required.'})
print('Prepared narrow candidate and historical success/failure reconciliation; not merged or production-verified.')
