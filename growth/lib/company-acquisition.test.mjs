import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {summarizeAscAcquisition,summarizeAscPeriods,summarizeAppsFlyerAcquisition,siteAcquisition,acquisitionMaterial,acquisitionReport,ownedLinkPeriodRate} from './company-acquisition.mjs';
import {collectAsc,connectionView,currentSiteAcquisition} from './company-data.mjs';

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
  const result={ok:true,http_status:200,quality:{sha256:crypto.createHash('sha256').update(csv).digest('hex'),
    row_cap_hit:false,missing_dates:[],missing_metric_columns:missing}};
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
