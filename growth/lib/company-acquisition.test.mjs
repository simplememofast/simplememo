import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {summarizeAscAcquisition,summarizeAscPeriods,summarizeAppsFlyerAcquisition,siteAcquisition,acquisitionMaterial,acquisitionReport,ownedLinkPeriodRate,automationGroup} from './company-acquisition.mjs';
import {collectAsc,collectAppsFlyer,connectionView,currentSiteAcquisition} from './company-data.mjs';
import {pilotWindowCoverage,websiteInstallReadiness} from './website-install-readiness.mjs';
import {websiteVisitTotals} from './website-visit-totals.mjs';

const date='2026-10-03';
const row=(extra={})=>({date,download_type:'First-time download',source_type:'Web referrer',referrer_group:'自社サイト',campaign_group:'web_obsidian_v1',counts:4,...extra});
const report=(groups=[row()])=>({report:'App Downloads Detailed',processing_date:'2026-10-04',date_range:{min:date,max:date},
  acquisition:{version:2,state:'ready',source_info_available:true,campaign_column_available:true,groups}});
test('Apple first downloads use the joined source and campaign; updates/redownloads are excluded',()=>{
  const s=summarizeAscAcquisition(report([row(),row({download_type:'Auto-update',counts:90}),row({download_type:'Redownload',counts:10}),
    row({source_type:'App referrer',referrer_group:'その他の参照元',campaign_group:'web_other_v1',counts:2})]));
  assert.equal(s.all_first_time_downloads.observed_count,6);
  assert.equal(s.own_site_first_time_downloads.observed_count,4);
  assert.equal(s.campaign_first_time_downloads.web_other_v1.observed_count,2);
  assert.equal(s.install_cvr,null);assert.equal(s.population_complete,false);
});
test('Apple missing/hidden cells remain unknown even when unrelated cells are visible',()=>{
  const s=summarizeAscAcquisition(report([row({referrer_group:'その他の参照元',campaign_group:'(空欄)'})]));
  assert.equal(s.own_site_first_time_downloads.observed_count,null);
  assert.equal(s.campaign_first_time_downloads.web_obsidian_v1.observed_count,null);
  const r=report();r.acquisition.source_info_available=false;r.acquisition.campaign_column_available=false;
  assert.equal(summarizeAscAcquisition(r).own_site_first_time_downloads.state,'source_info_unavailable');
  assert.equal(summarizeAscAcquisition(report([row({counts:0})])).own_site_first_time_downloads.observed_count,0);
});
test('invalid or duplicate Apple rows cannot make a plausible acquisition total',()=>{
  for(const extra of [{counts:null},{counts:-1},{counts:'4'},{date:'2026-02-30'},{date:'2026-10-04'}])
    assert.equal(summarizeAscAcquisition(report([row(extra)])).state,'invalid_rows');
  assert.equal(summarizeAscAcquisition(report([row(),row()])).state,'duplicate_rows');
});
const header='Date,Agency/PMD (af_prt),Media Source (pid),Campaign (c),Installs,Clicks\n';
test('AppsFlyer distinguishes Organic, QA and the exact owned-site pilot; no synthetic CVR',()=>{
  const s=summarizeAppsFlyerAcquisition(header+
    '2026-10-01,None,Organic,None,200,\n2026-10-01,None,seo_aio_qa,qa,2,6\n'+
    '2026-10-01,None,owned_web,obsidian_bridge_pilot_v1,3,10\n2026-10-01,None,Twitter,"campaign, example",1,20\n');
  assert.equal(s.own_site_installs,3);assert.equal(s.by_category.organic_unspecified.installs,200);
  assert.equal(s.by_category.organic_unspecified.clicks,null);assert.equal(s.by_category.qa.installs,2);assert.equal(s.install_cvr,null);
  const missing=summarizeAppsFlyerAcquisition(header+'2026-10-01,None,Organic,None,200,\n');
  assert.equal(missing.own_site_installs,null);assert.equal(missing.own_site_state,'no_attributed_site_rows');
  assert.throws(()=>summarizeAppsFlyerAcquisition(header+'d,None,Organic,None,2,3\nd,None,Organic,None,2,3\n'),/Duplicate/);
});
test('website report weights GA4 counts and retains quality/missing scope without joining downloads',()=>{
  const rows=[{landing_scope:'production',observed_started_sessions:1,sessions_with_own_app_click_24h:1},
    {landing_scope:'production',observed_started_sessions:99,sessions_with_own_app_click_24h:1},
    {landing_scope:'missing_landing_page',observed_started_sessions:10,sessions_with_own_app_click_24h:0}];
  const s=siteAcquisition({ga4:{status:'CONNECTED',window:{start:date,end:date},reports:[{file:'ga4-funnel.sql',result:rows}]}},{status:'quality_blocked'});
  assert.equal(s.ga4.observed_store_click_session_rate,.02);assert.equal(s.ga4.state,'quality_blocked');
  assert.equal(s.ga4.missing_landing_sessions,10);assert.equal(s.website_install_cvr.value,null);
  rows[0].sessions_with_own_app_click_24h=null;
  assert.equal(siteAcquisition({ga4:{status:'CONNECTED',reports:[{file:'ga4-funnel.sql',result:rows}]}}).ga4.observed_store_click_session_rate,null);
});
test('existing ASC collector retains exact report evidence; corrupt/missing input cannot reuse an old total',t=>{
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'site-acquisition-'));t.after(()=>fs.rmSync(stateRoot,{recursive:true,force:true}));
  fs.mkdirSync(path.join(stateRoot,'data/collection-receipts'),{recursive:true,mode:0o700});
  const files={'data/asc/status.json':{date:'2026-10-04',fetched_at:'2026-10-04T15:00:00Z',state:'partial'},
    'data/appstore/asc-metrics.json':{},'data/revenue/periods/latest.json':{},'data/revenue/period-retrieval.json':{},'data/asc-release-health/app-crashes.json':{},
    'data/asc/2026-10-04/app-downloads-detailed.json':report(),
    'data/asc/2026-10-04/app-downloads-standard.json':{...report(),report:'App Downloads Standard'}};
  const id='12345678-1234-1234-1234-123456789abc';
  const prefix='data/aso/product-pages/app-downloads-detailed';
  files[prefix+'/retrieval.json']={...bundle([]).retrieval,instance_ids:[id],instance_count:1};
  files[prefix+'/instances/'+id+'.json']={...periodRecord(),instance_id:id};
  const run=(name,args)=>{if(args[0]==='fetch')return '';if(args[0]==='rev-parse')return 'a'.repeat(40);const f=args[1].split(':')[1];if(!files[f])throw Error('missing');return JSON.stringify(files[f]);};
  collectAsc({stateRoot,run});
  let s=connectionView({stateRoot}).app_store_connect.site_acquisition;
  assert.equal(s.reports['app-downloads-detailed'].own_site_first_time_downloads.observed_count,4);
  assert.equal(s.reports['app-downloads-detailed-weekly'].own_site_first_time_downloads.observed_count,4);
  assert.equal(currentSiteAcquisition({stateRoot}).apple.reports['app-downloads-detailed-weekly'].window.min,'2026-09-21');
  fs.appendFileSync(path.join(stateRoot,'data/asc/acquisition-app-downloads-detailed.json'),' ');
  assert.equal(connectionView({stateRoot}).app_store_connect.site_acquisition.state,'unavailable');
  assert.equal(currentSiteAcquisition({stateRoot}).apple.state,'unavailable');
  delete files['data/asc/2026-10-04/app-downloads-detailed.json'];collectAsc({stateRoot,run});
  s=connectionView({stateRoot}).app_store_connect.site_acquisition;
  assert.equal(s.state,'partial');assert.equal(s.reports['app-downloads-detailed'],undefined);
});
test('fresh read timestamps do not produce a changed business report',()=>{
  const a=siteAcquisition(),b=structuredClone(a);
  b.apple.collected_at='2026-10-06T01:00:00Z';b.apple.commit='new';b.apple.artifacts=[];b.ga4.source='/new/report';
  assert.deepEqual(acquisitionMaterial(a),acquisitionMaterial(b));
  a.apple.reports.weekly={observed_at:'2026-10-01T00:00:00Z',state:'observed_rows'};
  b.apple.reports.weekly={observed_at:'2026-10-02T00:00:00Z',state:'observed_rows'};
  assert.deepEqual(acquisitionMaterial(a),acquisitionMaterial(b));
  b.appsflyer.own_site_installs=3;assert.notDeepEqual(acquisitionMaterial(a),acquisitionMaterial(b));
});

test('AppsFlyer optional clicks and decimal integer installs retain partial coverage',()=>{
  const parsed=summarizeAppsFlyerAcquisition(header.replace(',Clicks','')+'2026-10-01,None,owned_web,obsidian_bridge_pilot_v1,3.0\n');
  assert.equal(parsed.own_site_installs,3);assert.equal(parsed.by_category.owned_web_pilot.clicks,null);
  const s=siteAcquisition({appsflyer:{status:'PARTIAL',site_acquisition:parsed,population:'observed rows',quality:{missing_dates:['2026-10-05'],missing_metric_columns:['Clicks']}}});
  assert.deepEqual(s.appsflyer.missing_dates,['2026-10-05']);assert.equal(s.appsflyer.completeness,'partial_or_unavailable');
});
const periodRecord=(count=4,processing='2026-10-02')=>({...report([row({date:'2026-09-21',counts:count})]),
  schema:'asc_product_page_weekly_instance_v1',app_id:'6758438948',granularity:'WEEKLY',processing_date:processing,
  periods:[{from:'2026-09-21',to:'2026-09-27'}]});
const bundle=instances=>({retrieval:{report:'App Downloads Detailed',granularity:'WEEKLY',state:'fetched',fetched_at:'2026-10-04T12:00:00Z'},instances});
test('Apple period observations replace corrections without adding grains or revisions',()=>{
  const r=summarizeAscPeriods(bundle([periodRecord(3,'2026-09-30'),periodRecord(4)]),'WEEKLY');
  assert.equal(r.own_site_first_time_downloads.observed_count,4);assert.equal(r.periods.length,1);
  assert.deepEqual(r.window,{min:'2026-09-21',max:'2026-09-27'});
  assert.equal(summarizeAscPeriods(bundle([periodRecord(3),periodRecord(4)]),'WEEKLY').state,'conflicting_period_revisions');
  const legacy=periodRecord();delete legacy.acquisition;
  assert.equal(summarizeAscPeriods(bundle([legacy]),'WEEKLY').state,'unavailable');
  const empty={...periodRecord(),periods:[],acquisition:{version:2,state:'no_rows'}};
  assert.equal(summarizeAscPeriods(bundle([periodRecord(),empty]),'WEEKLY').state,'empty_period_instance');
  const invalid=periodRecord();invalid.periods[0].to='2026-09-28';
  assert.equal(summarizeAscPeriods(bundle([invalid]),'WEEKLY').state,'invalid_periods');
});

test('fresh status without retained sources does not crash or claim acquisition',()=>{
  const s=currentSiteAcquisition({stateRoot:'/nonexistent-company-acquisition-state'});
  assert.equal(s.state,'retained_sources_unavailable_or_invalid');assert.equal(s.ga4.observed_store_click_session_rate,null);
});


test('OneLink and Store sessions use the SQL union and never double count',()=>{
  const report={file:'ga4-funnel.sql',result:[{landing_scope:'production',observed_started_sessions:10,
    sessions_with_own_app_click_24h:4,sessions_with_onelink_click_24h:3,sessions_with_any_app_route_click_24h:5}]};
  const connection={ga4:{status:'CONNECTED',reports:[report]}};
  assert.equal(siteAcquisition(connection).ga4.observed_any_app_route_click_session_rate,.5);
  delete report.result[0].sessions_with_any_app_route_click_24h;
  assert.equal(siteAcquisition(connection).ga4.observed_any_app_route_click_session_rate,null);
});
test('only a complete exact-pilot report produces a labeled within-provider period ratio',()=>{
  const connection={status:'CONNECTED',collection:{status:'verified'},quality:{missing_dates:[],missing_metric_columns:[]},
    site_acquisition:summarizeAppsFlyerAcquisition(header+'2026-10-01,None,owned_web,obsidian_bridge_pilot_v1,3,10\n'+
      '2026-10-01,None,seo_aio_qa,obsidian_bridge_qa_20260907,90,100\n')};
  const r=ownedLinkPeriodRate(connection);
  assert.equal(r.value,.3); assert.equal(r.installs,3);assert.equal(r.matched_cohort,false);
  for(const quality of [undefined,{}, {missing_dates:['2026-10-02'],missing_metric_columns:[]},
    {missing_dates:[],missing_metric_columns:['Clicks']}]) assert.equal(ownedLinkPeriodRate({...connection,quality}).value,null);
  assert.equal(ownedLinkPeriodRate({...connection,status:'PARTIAL'}).value,null);
  assert.equal(ownedLinkPeriodRate({...connection,status:'BLOCKED'}).installs,null);
  connection.site_acquisition.by_category.owned_web_pilot.clicks=0;
  assert.equal(ownedLinkPeriodRate(connection).state,'no_click_denominator');
  connection.site_acquisition.by_category.owned_web_pilot.clicks=1;
  assert.equal(ownedLinkPeriodRate(connection).value,3); // lagged installs are not clamped into a fake CVR
  assert.equal(siteAcquisition({appsflyer:connection}).website_install_cvr.value,null);
});

test('verified pilot counts survive optional metric gaps without upgrading the whole report',t=>{
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'acquisition-columns-'));
  t.after(()=>fs.rmSync(stateRoot,{recursive:true,force:true}));
  const dir=path.join(stateRoot,'data/collection-receipts'),output=path.join(stateRoot,'data/report');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.mkdirSync(output,{recursive:true,mode:0o700});
  const receiptFile=path.join(dir,'appsflyer-2026-10-01.json');
  const receipt={source:'appsflyer',window:{start:'2026-10-01',end:'2026-10-01'},status:'verified',output};
  const csv=header+'2026-10-01,None,owned_web,obsidian_bridge_pilot_v1,3,10\n'+
    '2026-10-01,None,seo_aio_qa,obsidian_bridge_qa_20260907,90,100\n';
  const missing=['Sessions','Loyal Users','Total Revenue','Total Cost','Impressions','af_purchase (Event counter)'];
  const result={ok:true,http_status:200,parameters:{from:receipt.window.start,to:receipt.window.end},
    quality:{sha256:crypto.createHash('sha256').update(csv).digest('hex'),
    row_cap_hit:false,missing_dates:[],missing_metric_columns:missing}};
  receipt.sha256=result.quality.sha256;
  fs.writeFileSync(receiptFile,JSON.stringify(receipt));
  fs.writeFileSync(path.join(output,'report.csv'),csv);
  const writeResult=()=>fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result));writeResult();
  const observe=()=>siteAcquisition(connectionView({stateRoot}));
  const s=observe(),rate=s.appsflyer.owned_link_period_rate;
  assert.equal(s.appsflyer.connection_state,'PARTIAL');
  assert.deepEqual(s.appsflyer.missing_metric_columns,missing);
  assert.equal(rate.value,.3);assert.equal(rate.state,'observed_period_ratio');
  assert.deepEqual(rate.missing_optional_metric_columns,missing);
  assert.deepEqual(rate.missing_required_metric_columns,[]);
  assert.equal(s.website_install_cvr.value,null);
  assert.match(acquisitionReport(s).join('\n'),/30\.00%/);
  assert.match(acquisitionReport(s).join('\n'),/af_purchase \(Event counter\)/);
  result.quality.missing_dates=['2026-10-01'];writeResult();
  assert.equal(observe().appsflyer.owned_link_period_rate.value,null);
  result.quality.missing_dates=[];writeResult();
  fs.writeFileSync(receiptFile,JSON.stringify({...receipt,status:'failed',failure:'permission_or_credential'}));
  const failed=observe().appsflyer;
  assert.equal(failed.connection_state,'BLOCKED');assert.equal(failed.owned_link_period_rate.value,null);
  assert.equal(failed.owned_link_period_rate.installs,null);
  fs.writeFileSync(receiptFile,JSON.stringify(receipt));
  fs.appendFileSync(path.join(output,'report.csv'),'tampered');
  assert.equal(observe().appsflyer.connection_state,'BLOCKED');
});

test('pilot ratios reject required metric gaps, unknown partial states and failed receipts',()=>{
  const connection={status:'PARTIAL',collection:{status:'verified'},
    quality:{missing_dates:[],missing_metric_columns:['af_purchase (Event counter)']},
    site_acquisition:summarizeAppsFlyerAcquisition(header+'2026-10-01,None,owned_web,obsidian_bridge_pilot_v1,3,10\n')};
  assert.equal(ownedLinkPeriodRate(connection).value,.3);
  for(const status of ['BLOCKED','FAILED','unknown'])
    assert.equal(ownedLinkPeriodRate({...connection,status}).value,null);
  for(const collection of [undefined,{status:'failed'},{status:'reading'}])
    assert.equal(ownedLinkPeriodRate({...connection,collection}).value,null);
  for(const missing_metric_columns of [[],['Installs'],['Clicks'],['Sessions','Clicks'],['unexpected_metric'],[null]])
    assert.equal(ownedLinkPeriodRate({...connection,quality:{missing_dates:[],missing_metric_columns}}).value,null);
  assert.equal(ownedLinkPeriodRate({...connection,quality:{...connection.quality,row_cap_hit:true}}).value,null);
  connection.site_acquisition.by_category.owned_web_pilot.clicks=null;
  assert.equal(ownedLinkPeriodRate(connection).value,null);
  connection.site_acquisition.by_category.owned_web_pilot={installs:0,clicks:10};
  assert.equal(ownedLinkPeriodRate(connection).value,0);
  delete connection.site_acquisition.by_category.owned_web_pilot;
  assert.equal(ownedLinkPeriodRate(connection).value,null);
});

// Synthetic counts only; never copy private report values into this public test.
const ga=(o={})=>({session_channel:'Direct',landing_referrer_status:'missing',landing_scope:'production',landing_path:'/',
  device_category:'mobile',device_language:'en-us',observed_started_sessions:1,sessions_with_own_app_click_24h:0,
  sessions_with_any_app_route_click_24h:0,...o});
const funnel=rows=>({ga4:{status:'CONNECTED',window:{start:date,end:date},reports:[{file:'ga4-funnel.sql',result:rows}]}});
test('automation fingerprints match only the exact existing-column predicates',()=>{
  for(const o of [{},{landing_path:'/en/'}])assert.equal(automationGroup(ga(o)),'ci_lighthouse');
  for(const device_language of ['en-us','en-gb','en-us@posix','en'])
    assert.equal(automationGroup(ga({landing_path:'/en/obsidian/',device_category:'desktop',device_language})),'bot_like');
  assert.equal(automationGroup(ga({device_category:'desktop'})),'bot_like'); // desktop / en-us is not Lighthouse mobile
  for(const o of [{session_channel:'Organic Search'},{session_channel:'Referral'},{landing_referrer_status:'external'},
    {landing_referrer_status:'missing_landing_page',landing_scope:'missing_landing_page',landing_path:null,device_category:null},
    {device_language:'ja'},{device_language:'EN-US'},{device_language:'ens'},{device_language:null},{landing_path:'/en/obsidian/sync/'},
    {device_category:'tablet'},{device_category:'desktop',device_language:'ja'},{device_category:null}])
    assert.equal(automationGroup(ga(o)),null,JSON.stringify(o));
});
test('diagnostic rate excludes CI and bot-like sessions beside an unchanged official rate and quality state',()=>{
  const rows=[ga({observed_started_sessions:30}),ga({landing_path:'/en/',observed_started_sessions:30}),
    ga({landing_path:'/en/x/',device_category:'desktop',observed_started_sessions:40}),
    ga({session_channel:'Organic Search',landing_referrer_status:'external',landing_path:'/obsidian/',device_language:'ja',
      observed_started_sessions:200,sessions_with_own_app_click_24h:4,sessions_with_any_app_route_click_24h:5}),
    ga({device_language:'ja',observed_started_sessions:100,sessions_with_own_app_click_24h:3,sessions_with_any_app_route_click_24h:3}),
    ga({landing_scope:'nonproduction',observed_started_sessions:50}),
    ga({landing_scope:'missing_landing_page',landing_referrer_status:'missing_landing_page',landing_path:null,device_category:null,observed_started_sessions:10})];
  const before=structuredClone(rows), s=siteAcquisition(funnel(rows),{status:'quality_blocked'}), d=s.ga4.automation_excluded_diagnostic;
  assert.deepEqual(rows,before);
  assert.equal(s.ga4.observed_production_sessions,400);assert.equal(s.ga4.sessions_with_store_click,7);
  assert.equal(s.ga4.observed_store_click_session_rate,7/400);assert.equal(s.ga4.state,'quality_blocked');
  assert.equal(s.ga4.missing_landing_sessions,10);assert.equal(s.website_install_cvr.value,null);
  assert.deepEqual(d.excluded_sessions,{ci_lighthouse:60,bot_like:40});
  assert.deepEqual(d.excluded_store_click_sessions,{ci_lighthouse:0,bot_like:0});
  assert.equal(d.sessions_with_store_click,s.ga4.sessions_with_store_click); // no excluded clicks: numerator unchanged
  assert.equal(d.remaining_sessions,300);assert.equal(d.store_click_session_rate,7/300);
  assert.equal(d.any_app_route_click_session_rate,8/300);
  assert.equal(d.replaces_official_rate,false);assert.equal(d.quality_state,'quality_blocked');
  const text=acquisitionReport(s).join('\n');
  assert.match(text,/^GA4 \(2026-10-03\.\.2026-10-03 JST\): 7 Store-click sessions \/ 400 observed production sessions; 1\.75%; quality quality_blocked\.$/m);
  assert.match(text,/^GA4 diagnostic only, not the official rate \(excluding CI Lighthouse 60 and bot-like 40 sessions\): 7 Store-click sessions \/ 300 sessions; 2\.33%;.*Quality quality_blocked still applies\.$/m);
});
test('clicks inside an excluded fingerprint lower the diagnostic numerator visibly, never silently',()=>{
  const s=siteAcquisition(funnel([ga({observed_started_sessions:20,sessions_with_own_app_click_24h:1,sessions_with_any_app_route_click_24h:1}),
    ga({device_language:'ja',observed_started_sessions:100,sessions_with_own_app_click_24h:5,sessions_with_any_app_route_click_24h:5})]));
  const d=s.ga4.automation_excluded_diagnostic;
  assert.equal(s.ga4.sessions_with_store_click,6);assert.equal(d.sessions_with_store_click,5);
  assert.deepEqual(d.excluded_store_click_sessions,{ci_lighthouse:1,bot_like:0});assert.equal(d.quality_state,'quality_unverified');
  assert.match(acquisitionReport(s).join('\n'),/Excluded Store-click sessions: CI 1, bot-like 0\./);
});
test('the diagnostic is unknown whenever the official GA4 rate is unknown',()=>{
  const bad=[ga({sessions_with_own_app_click_24h:null}),ga({device_language:'ja'})];
  for(const c of [funnel(bad),{ga4:{status:'BLOCKED',reports:funnel([ga()]).ga4.reports}},{}]) {
    const s=siteAcquisition(c), d=s.ga4.automation_excluded_diagnostic;
    assert.equal(s.ga4.observed_store_click_session_rate,null);assert.equal(d.store_click_session_rate,null);
    assert.equal(d.remaining_sessions,null);assert.deepEqual(d.excluded_sessions,{ci_lighthouse:null,bot_like:null});
    assert.match(acquisitionReport(s).join('\n'),/GA4 diagnostic only, not the official rate .*: unknown Store-click sessions \/ unknown sessions; unknown;/);
  }
  const all=siteAcquisition(funnel([ga()])).ga4.automation_excluded_diagnostic; // every row excluded
  assert.equal(all.remaining_sessions,0);assert.equal(all.store_click_session_rate,null);
  assert.deepEqual(all.excluded_sessions,{ci_lighthouse:1,bot_like:0});
  const noAny=siteAcquisition(funnel([ga({device_language:'ja',sessions_with_any_app_route_click_24h:undefined})])).ga4;
  assert.equal(noAny.automation_excluded_diagnostic.store_click_session_rate,0); // optional union stays separately unknown
  assert.equal(noAny.automation_excluded_diagnostic.any_app_route_click_session_rate,null);
});

test('Obsidian hub pilot readout uses the nine hub landings and pilot OneLink columns only',()=>{
  const hub=(path,o={})=>ga({session_channel:'Organic Search',landing_referrer_status:'external',landing_path:path,device_language:'ja',
    sessions_with_onelink_impression:0,sessions_with_onelink_click_24h:0,onelink_clicked_without_recorded_impression:0,...o});
  const rows=[hub('/obsidian/',{observed_started_sessions:40,sessions_with_own_app_click_24h:1,sessions_with_any_app_route_click_24h:3,
      sessions_with_onelink_impression:30,sessions_with_onelink_click_24h:2,onelink_clicked_without_recorded_impression:0}),
    hub('/ko/obsidian/',{observed_started_sessions:10,sessions_with_any_app_route_click_24h:1,sessions_with_onelink_impression:8,
      sessions_with_onelink_click_24h:1,onelink_clicked_without_recorded_impression:1}),
    hub('/en/obsidian/',{observed_started_sessions:50,sessions_with_own_app_click_24h:4,sessions_with_any_app_route_click_24h:4}),
    hub('/obsidian/sync/',{observed_started_sessions:20,sessions_with_onelink_impression:2}),
    hub('/obsidian/',{landing_scope:'nonproduction',observed_started_sessions:99,sessions_with_any_app_route_click_24h:9})];
  const s=siteAcquisition(funnel(rows),{status:'quality_blocked'}), h=s.ga4.obsidian_hub_pilot;
  assert.equal(s.ga4.observed_production_sessions,120);assert.equal(s.ga4.sessions_with_store_click,5);
  assert.equal(h.hub_landing_sessions,50);assert.equal(h.hub_landing_sessions_reaching_store,4);
  assert.equal(h.hub_landing_store_session_rate,4/50);
  assert.equal(h.onelink_impression_sessions,40);assert.equal(h.onelink_click_sessions,3);
  assert.equal(h.onelink_clicked_without_recorded_impression,1);assert.equal(h.onelink_impression_click_session_rate,2/40);
  assert.equal(h.replaces_official_rate,false);assert.equal(h.quality_state,'quality_blocked');
  assert.match(acquisitionReport(s).join('\n'),/^GA4 Obsidian hub OneLink pilot, beside the official rate: 4 of 50 sessions landing on the nine hubs recorded a Store-link click .*8\.00%\. OneLink hero: 3 click sessions \(1 without a recorded impression\) \/ 40 impression sessions; 5\.00%\. Quality quality_blocked still applies\.$/m);
});
test('Obsidian hub pilot readout stays unknown instead of zero when its inputs are missing',()=>{
  const old=siteAcquisition(funnel([ga({landing_path:'/obsidian/',device_language:'ja',observed_started_sessions:5})])).ga4.obsidian_hub_pilot;
  assert.equal(old.hub_landing_store_session_rate,0);assert.equal(old.onelink_impression_click_session_rate,null); // pre-OneLink rows lack the columns
  const none=siteAcquisition(funnel([ga({device_language:'ja',sessions_with_onelink_impression:0,sessions_with_onelink_click_24h:0,
    onelink_clicked_without_recorded_impression:0})])).ga4.obsidian_hub_pilot;
  assert.equal(none.hub_landing_sessions,0);assert.equal(none.hub_landing_store_session_rate,null);assert.equal(none.onelink_impression_click_session_rate,null);
  for(const c of [{ga4:{status:'BLOCKED',reports:funnel([ga()]).ga4.reports}},{}]) {
    const h=siteAcquisition(c).ga4.obsidian_hub_pilot;
    assert.equal(h.hub_landing_sessions,null);assert.equal(h.onelink_impression_sessions,null);
  }
  const bad=siteAcquisition(funnel([ga({landing_path:'/obsidian/',sessions_with_any_app_route_click_24h:2,observed_started_sessions:1,
    sessions_with_onelink_impression:1,sessions_with_onelink_click_24h:1,onelink_clicked_without_recorded_impression:2})])).ga4.obsidian_hub_pilot;
  assert.equal(bad.hub_landing_store_session_rate,null);assert.equal(bad.onelink_impression_click_session_rate,null);
});

const cvrConnections = (installs=3) => ({
  ga4: {status:'CONNECTED',window:{start:'2026-10-16',end:'2026-10-22'},
    reports:[{file:'ga4-funnel.sql',result:[{landing_scope:'production',landing_path:'/obsidian/',
      observed_started_sessions:100,sessions_with_own_app_click_24h:10,
      sessions_with_any_app_route_click_24h:15,sessions_with_onelink_impression:80,
      sessions_with_onelink_click_24h:8,onelink_clicked_without_recorded_impression:0}]}]},
  appsflyer:{status:'CONNECTED',collection:{status:'verified'},window:{start:'2026-09-25',end:'2026-10-22'},
    quality:{missing_dates:[],missing_metric_columns:[],row_cap_hit:false},
    site_acquisition:summarizeAppsFlyerAcquisition(header+`2026-10-16,None,owned_web,obsidian_bridge_pilot_v1,${installs},8\n`)},
});

test('CVR contract distinguishes PV, visitors, sessions and attributed installs',()=>{
  const a=siteAcquisition(cvrConnections(),{status:'observed'}), w=a.website_install_cvr;
  assert.equal(w.denominators.page_views.value,null);
  assert.equal(w.denominators.unique_visitors.value,null);
  assert.equal(w.denominators.sessions.value,100);
  assert.equal(w.numerator.observed_pilot_installs,3);
  assert.equal(w.numerator.whole_site_new_installs,null);
  assert.equal(w.value,null);assert.equal(w.estimated_value,null);
  assert.equal(w.state,'not_measurable');
  assert.equal(a.ga4.observed_any_app_route_click_session_rate,.15);
  assert.equal(a.appsflyer.owned_link_period_rate.value,3/8);
  assert.equal(w.period_alignment.same_calendar_window,false);
  assert.ok(w.blockers.includes('source_windows_differ'));
});

test('equal mature periods still cannot turn two providers into a visitor cohort',()=>{
  const c=cvrConnections();c.appsflyer.window={...c.ga4.window};
  const w=siteAcquisition(c,{status:'observed'}).website_install_cvr;
  assert.equal(w.period_alignment.same_calendar_window,true);
  assert.equal(w.period_alignment.matched_cohort,false);
  assert.equal(w.value,null);assert.equal(w.estimated_value,null);
  assert.ok(w.blockers.includes('no_common_attributable_cohort'));
  assert.equal(w.blockers.includes('source_windows_differ'),false);
  assert.equal(w.pilot_readiness.ga4.state,'complete_post_start_days');
});

test('whole-site evidence gaps do not withhold the three existing pilot observations',()=>{
  const a=siteAcquisition(cvrConnections(),{status:'observed'}),w=a.website_install_cvr;
  assert.equal(w.scope,'supplementary_whole_site_diagnostic');
  assert.equal(w.blockers_scope,'whole_site_visit_to_install_cvr_only');
  assert.equal(w.pilot_completion_gate,false);
  assert.ok(w.blockers.includes('no_common_attributable_cohort'));
  assert.equal(a.ga4.obsidian_hub_pilot.hub_landing_store_session_rate,.15);
  assert.equal(a.appsflyer.own_site_installs,3);
  assert.equal(a.appsflyer.owned_link_period_rate.value,3/8);
  assert.match(a.ga4.obsidian_hub_pilot.scope,/Clicks do not prove Store arrival or installs/);
  assert.match(acquisitionReport(a).join('\n'),/do not add completion gates to the nine-placement, three-metric pilot/);
});

test('missing pilot rows stay unknown; an explicit zero remains a reported zero',()=>{
  const zero=siteAcquisition(cvrConnections(0),{status:'observed'}).website_install_cvr;
  assert.equal(zero.numerator.observed_pilot_installs,0);assert.equal(zero.value,null);
  const c=cvrConnections();c.appsflyer.site_acquisition=summarizeAppsFlyerAcquisition(header+'2026-10-16,None,Organic,None,9,8\n');
  const missing=siteAcquisition(c).website_install_cvr;
  assert.equal(missing.numerator.observed_pilot_installs,null);
  assert.equal(missing.numerator.state,'not_observed');
  assert.ok(missing.blockers.includes('attributed_pilot_installs_unavailable'));
});

test('failed or unavailable source states do not expose retained counts as current',()=>{
  const c=cvrConnections();c.ga4.status='BLOCKED';c.appsflyer.status='BLOCKED';
  const w=siteAcquisition(c).website_install_cvr;
  assert.equal(w.denominators.sessions.value,null);assert.equal(w.numerator.observed_pilot_installs,null);
  const empty=siteAcquisition().website_install_cvr;
  assert.equal(empty.period_alignment.same_calendar_window,null);
  assert.equal(empty.denominators.sessions.value,null);
  assert.equal(empty.numerator.observed_pilot_installs,null);
});

test('source quality remains visible without replacing it with an attractive rate',()=>{
  const c=cvrConnections();c.appsflyer.status='PARTIAL';c.appsflyer.quality.missing_dates=['2026-10-17'];
  const a=siteAcquisition(c,{status:'quality_blocked'}), w=a.website_install_cvr;
  assert.equal(w.denominators.sessions.value,100);
  assert.equal(w.denominators.sessions.quality_state,'quality_blocked');
  assert.deepEqual(w.numerator.missing_dates,['2026-10-17']);
  assert.ok(w.blockers.includes('ga4_quality_not_cleared'));
  assert.ok(w.blockers.includes('appsflyer_report_not_complete'));
  assert.equal(a.appsflyer.owned_link_period_rate.value,null);
});

test('October 16 scheduled artifacts are pre-pilot GA4 and partial-launch AppsFlyer',()=>{
  const c=cvrConnections();
  c.ga4.window={start:'2026-10-05',end:'2026-10-11'};
  c.appsflyer.window={start:'2026-09-18',end:'2026-10-15'};
  const w=siteAcquisition(c).website_install_cvr;
  assert.equal(w.pilot_readiness.ga4.state,'before_pilot');
  assert.equal(w.pilot_readiness.appsflyer.state,'launch_partial_day_only');
  assert.equal(w.pilot_readiness.appsflyer.complete_post_start_days,0);
  assert.ok(w.blockers.includes('no_complete_post_start_ga4_day'));
  assert.ok(w.blockers.includes('no_complete_post_start_appsflyer_day'));
  assert.ok(w.blockers.includes('includes_partial_launch_day'));
  assert.equal(w.value,null);
});

test('readiness dates preserve five calendar days of GA4 maturity and seven full days',()=>{
  const r=siteAcquisition().website_install_cvr.pilot_readiness;
  assert.equal(r.production_started_at,'2026-10-15T11:31:00+09:00');
  assert.equal(r.first_complete_day,'2026-10-16');
  assert.equal(r.first_ga4_window_with_complete_pilot_day_available_on,'2026-10-21');
  assert.equal(r.first_ga4_seven_day_post_start_window_available_on,'2026-10-27');
  assert.equal(r.dates_are_earliest_collection_dates_not_verified_data,true);
  const mixed=pilotWindowCoverage({start:'2026-10-10',end:'2026-10-16'});
  assert.equal(mixed.complete_post_start_days,1);assert.equal(mixed.state,'mixed_pre_and_post_start');
  const complete=pilotWindowCoverage({start:'2026-10-16',end:'2026-10-22'});
  assert.equal(complete.days,7);assert.equal(complete.complete_post_start_days,7);
  assert.equal(complete.includes_launch_day,false);
});

test('invalid or conflicting report periods cannot establish readiness',()=>{
  for(const window of [null,{}, {start:'2026-02-30',end:'2026-10-16'},
    {start:'2026-10-17',end:'2026-10-16'}, {start:'2026-10-16T00:00:00Z',end:'2026-10-22'},
    {start:'2026-10-16',from:'2026-10-15',end:'2026-10-22'},
    {start:'2026-10-16',end:'2026-10-22',to:'2026-10-23'}]) {
    const w=pilotWindowCoverage(window);assert.equal(w.state,'window_unavailable');assert.equal(w.complete_post_start_days,null);
  }
  assert.equal(pilotWindowCoverage({from:'2026-10-16',to:'2026-10-22'}).days,7);
});

test('pilot coverage and account attribution lookback remain separate from report length',()=>{
  const w=siteAcquisition(cvrConnections()).website_install_cvr;
  assert.equal(w.coverage.site_wide,false);assert.equal(w.coverage.pilot_hero_placements,9);
  assert.equal(w.coverage.per_page_installs_available,false);
  for(const route of ['other_direct_apple_links','qr','smart_app_banner'])assert.ok(w.coverage.excluded_from_pilot.includes(route));
  assert.equal(w.period_alignment.appsflyer_collection_window_days,28);
  assert.equal(w.period_alignment.attribution_lookback_days,null);
  assert.equal(w.period_alignment.ga4_maturity_days,5);assert.equal(w.period_alignment.ga4_click_followup_hours,24);
  for(const reason of ['internal_user_exclusion_unverified','reinstall_exclusion_unverified','attribution_lookback_unverified'])
    assert.ok(w.blockers.includes(reason));
});

test('readiness does not import private evidence paths or turn invalid counts into observations',()=>{
  const w=websiteInstallReadiness({ga4:{observed_production_sessions:1.5,source:'/private/example'},
    appsflyer:{connection_state:'CONNECTED',own_site_installs:-1,source:'/private/example'}});
  assert.equal(w.denominators.sessions.value,null);assert.equal(w.numerator.observed_pilot_installs,null);
  assert.equal(JSON.stringify(w).includes('/private/example'),false);
});

test('status report explains denominator units, limits and maturity without claiming CVR',()=>{
  const report=acquisitionReport(siteAcquisition(cvrConnections(),{status:'observed'})).join('\n');
  assert.match(report,/page views unknown; unique visitors unknown; 100 observed sessions/);
  assert.match(report,/whole-site new installs unknown/);
  assert.match(report,/No page-level install breakdown/);
  assert.match(report,/lookback unknown \(not its 28-day report window\)/);
  assert.match(report,/2026-10-21 JST; seven post-start days: 2026-10-27 JST/);
  assert.match(report,/Website visit-to-install CVR: unavailable/);
});

test('site visit totals are read once across grouped rows, never summed',()=>{
  const rows=[{site_window_page_views:'10',site_window_observed_visitors:'2'},
    {site_window_page_views:10,site_window_observed_visitors:2}];
  const v=websiteVisitTotals(rows,true);
  assert.equal(v.page_views,10);assert.equal(v.observed_visitors,2);
  assert.equal(v.state,'observed_diagnostic');
});

test('legacy, empty and failed visit reports remain unknown while explicit zeros survive',()=>{
  for(const [rows,connected] of [[[],true],[[{}],true],[[{site_window_page_views:0,site_window_observed_visitors:0}],false]]) {
    const v=websiteVisitTotals(rows,connected);assert.equal(v.page_views,null);assert.equal(v.observed_visitors,null);
  }
  const zero=websiteVisitTotals([{site_window_page_views:0,site_window_observed_visitors:0}],true);
  assert.equal(zero.page_views,0);assert.equal(zero.observed_visitors,0);
});

test('partial, invalid and conflicting visit totals fail without manufacturing visitors',()=>{
  const good={site_window_page_views:10,site_window_observed_visitors:2};
  for(const bad of [{}, {...good,site_window_page_views:11}, {...good,site_window_observed_visitors:3},
    {...good,site_window_observed_visitors:11}, {...good,site_window_observed_visitors:0},
    {...good,site_window_page_views:-1}, {...good,site_window_page_views:1.5},
    {...good,site_window_page_views:Number.MAX_SAFE_INTEGER+1}, {...good,site_window_page_views:''},
    {...good,site_window_page_views:null}]) {
    const v=websiteVisitTotals([good,bad],true);assert.equal(v.state,'unavailable');assert.equal(v.page_views,null);
  }
});

test('the existing acquisition report consumes visit totals without inventing install conversion',()=>{
  const c=cvrConnections();c.ga4.reports[0].result[0].site_window_page_views=150;
  c.ga4.reports[0].result[0].site_window_observed_visitors=80;
  const a=siteAcquisition(c,{status:'observed'}),w=a.website_install_cvr;
  assert.equal(w.denominators.page_views.value,150);assert.equal(w.denominators.unique_visitors.value,80);
  assert.equal(w.denominators.sessions.value,100);assert.equal(w.value,null);assert.equal(w.estimated_value,null);
  assert.match(acquisitionReport(a).join('\n'),/page views 150; unique visitors 80/);
  assert.match(w.denominators.unique_visitors.definition,/browser identifiers/);
  c.ga4.status='BLOCKED';assert.equal(siteAcquisition(c).website_install_cvr.denominators.page_views.value,null);
});

// Artificial aggregate rows only. No credentials, provider calls or real reports.
function appsflyerReceiptFixture(t) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'appsflyer-receipt-'));
  t.after(() => fs.rmSync(stateRoot, {recursive: true, force: true}));
  const output = path.join(stateRoot, 'data/report');
  const receipts = path.join(stateRoot, 'data/collection-receipts');
  fs.mkdirSync(output, {recursive: true, mode: 0o700});
  fs.mkdirSync(receipts, {recursive: true, mode: 0o700});
  const csv = 'Date,Agency/PMD (af_prt),Media Source (pid),Campaign (c),Installs,Clicks\n'
    + '2026-10-01,None,owned_web,obsidian_bridge_pilot_v1,3,10\n';
  const sha256 = crypto.createHash('sha256').update(csv).digest('hex');
  const receipt = {source: 'appsflyer', status: 'verified', output, sha256,
    window: {start: '2026-09-04', end: '2026-10-01'}};
  const result = {ok: true, http_status: 200, parameters: {from: receipt.window.start, to: receipt.window.end},
    quality: {sha256, row_cap_hit: false, missing_dates: [], missing_metric_columns: []}};
  fs.writeFileSync(path.join(output, 'report.csv'), csv);
  const save = () => {
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result));
    fs.writeFileSync(path.join(receipts, 'appsflyer-2026-10-01.json'), JSON.stringify(receipt));
  };
  save();
  return {stateRoot, receipt, result, save};
}

test('matching retained report preserves the admitted period ratio and reuses without a provider call', async t => {
  const f = appsflyerReceiptFixture(t);
  const view = connectionView({stateRoot: f.stateRoot});
  assert.equal(view.appsflyer.status, 'CONNECTED');
  assert.equal(siteAcquisition(view).appsflyer.owned_link_period_rate.value, .3);
  const reused = await collectAppsFlyer({stateRoot: f.stateRoot, now: new Date('2026-10-02T00:00:00Z'),
    run: () => assert.fail('Existing receipt must not trigger a provider or git command')});
  assert.equal(reused.reused, true);
});

const invalidReceipts = [
  ['different receipt hash', f => {f.receipt.sha256 = '0'.repeat(64);}],
  ['missing receipt hash', f => {delete f.receipt.sha256;}],
  ['report from a different period', f => {f.result.parameters.from = '2026-09-05';}],
  ['report ends on a different day', f => {f.result.parameters.to = '2026-09-30';}],
  ['missing report parameters', f => {delete f.result.parameters;}],
  ['missing receipt window', f => {delete f.receipt.window;}],
  ['missing receipt start', f => {delete f.receipt.window.start;}],
  ['missing receipt end', f => {delete f.receipt.window.end;}],
  ['matching impossible dates', f => {
    f.receipt.window = {start: '2026-02-30', end: '2026-02-30'};
    f.result.parameters = {from: '2026-02-30', to: '2026-02-30'};
  }],
  ['matching noncanonical dates', f => {
    f.receipt.window.start = '2026-9-04'; f.result.parameters.from = '2026-9-04';
  }],
  ['matching reversed period', f => {
    f.receipt.window.start = '2026-10-02'; f.result.parameters.from = '2026-10-02';
  }],
];
for (const [name, corrupt] of invalidReceipts) {
  test(`retained report fails closed for ${name}`, t => {
    const f = appsflyerReceiptFixture(t); corrupt(f); f.save();
    const view = connectionView({stateRoot: f.stateRoot});
    assert.equal(view.appsflyer.status, 'BLOCKED');
    assert.equal(view.appsflyer.reason, 'retained_aggregate_integrity_failed');
    assert.equal(view.appsflyer.site_acquisition, undefined);
    const rate = siteAcquisition(view).appsflyer.owned_link_period_rate;
    assert.equal(rate.value, null);
    assert.equal(rate.installs, null);
  });
}

test('collector cannot reuse a self-consistent report whose receipt hash no longer matches', async t => {
  const f = appsflyerReceiptFixture(t); f.receipt.sha256 = '0'.repeat(64); f.save();
  await assert.rejects(collectAppsFlyer({stateRoot: f.stateRoot, now: new Date('2026-10-02T00:00:00Z'),
    run: () => assert.fail('Integrity failure must not trigger fallback collection')}), /receipt/);
});
