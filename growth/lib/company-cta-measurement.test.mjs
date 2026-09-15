import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {ROOT} from './company-metrics.mjs';
import {companyCtaMeasurement, retainCtaMeasurement, compactCtaMeasurement, recordCtaDiagnosis} from './company-cta-measurement.mjs';
const now = new Date('2026-09-14T11:00:00Z');
const hash = b => createHash('sha256').update(b).digest('hex');
const write = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2) + '\n', {mode: 0o600});

function fixture(t) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'company-cta-')); fs.chmodSync(stateRoot, 0o700);
  t.after(() => fs.rmSync(stateRoot, {recursive:true, force:true}));
  fs.mkdirSync(path.join(stateRoot, 'data/collection-receipts'), {recursive:true, mode:0o700});
  const quality = event_name => ({event_date:'20260906', hostname_scope:'production', event_name,
    recorded_events:200, events_without_session_key:0, analytics_storage_denied_events:0,
    missing_session_channel_events:0, cta_version_missing_or_other:0, click_target_invalid_or_missing:0,
    cta_dimensions_incomplete:0, onelink_version_missing_or_other:0, onelink_target_invalid_or_missing:0,
    onelink_dimensions_incomplete:0, onelink_qa_scope_mismatch:0});
  const row = (denominator, numerator, overrides = {}) => ({
    session_channel:'Organic Search',session_source:'google',session_medium:'organic',session_attribution_status:'available',
    landing_referrer_host:'www.google.com',landing_referrer_status:'external',landing_scope:'production',landing_path:'/obsidian/',
    device_category:'mobile',device_language:'ja', observed_started_sessions:denominator,
    sessions_with_own_app_click_24h:numerator,sessions_with_cta_impression:denominator,clicked_without_recorded_impression:0,
    sessions_with_onelink_impression:0,sessions_with_onelink_click_24h:0,onelink_clicked_without_recorded_impression:0,
    sessions_with_onelink_qa_click_24h:0,sessions_with_both_app_routes_24h:0,sessions_with_any_app_route_click_24h:numerator,
    missing_landing_no_timed_page_view_in_scan:0,missing_landing_page_view_before_start_only:0,
    missing_landing_page_view_after_window_only:0,missing_landing_page_view_both_sides:0,
    own_app_click_session_rate_24h:numerator/denominator, ...overrides});
  const report = {schema_version:1,report:'ga4-funnel',execution:'export',status:'complete',project:'yurika-simplememo',
    location:'asia-northeast1',start:'2026-09-06',end:'2026-09-09',run_id:'123',source_sha:'a'.repeat(40),
    observed_at:'2026-09-14T01:00:00Z', coverage:[6,7,8,9,10].map(d=>({day:`2026-09-${String(d).padStart(2,'0')}`,present:true})),
    queries:['ga4-quality.sql','ga4-funnel.sql'].map(file=>({file,
      sql_sha256:hash(fs.readFileSync(path.join(ROOT,'growth/sql/analytics',file))),
      params:{start_date:'2026-09-06',end_date:'2026-09-09',...(file==='ga4-quality.sql'?{scan_end_date:'2026-09-10'}:{}),
        measurement_version:'2026-09-05',bridge_measurement_version:'2026-09-07'},
      result:{jobId:'query-'+file,location:'asia-northeast1',statementType:'SELECT',
        rows:file==='ga4-quality.sql'?['session_start','page_view','app_store_click','seo_cta_impression'].map(quality):
          [row(10,2),row(90,3,{device_language:'en'}),row(20,15,{landing_scope:'nonproduction'}),row(7,1,{session_channel:'Direct'})]}}))};
  const output=path.join(stateRoot,'data/report.json');
  const receipt={schema_version:1,source:'ga4-funnel',status:'verified',window:{start:report.start,end:report.end},
    output,source_commit:report.source_sha,run_id:123,request_tag:'retained-original-request',verified_at:'2026-09-14T01:01:00Z'};
  const flush=()=>{
    write(output,report);receipt.sha256=hash(fs.readFileSync(output));
    write(path.join(stateRoot,'data/collection-receipts/ga4-funnel-2026-09-09.json'),receipt);
    write(path.join(stateRoot,'data/connections.json'),{ga4:{status:'CONNECTED',evidence:output,collection:receipt}});
  };
  flush();return {stateRoot,report,receipt,flush,output,options:{stateRoot,now}};
}

test('CTA measurement aggregates the exact observed organic landing cohort, not mean rates or event counts',t=>{
  const f=fixture(t), result=companyCtaMeasurement(f.options);
  assert.equal(result.status,'observed');assert.equal(result.eligible_for_prospective_baseline,true);
  assert.deepEqual(result.total,{numerator:5,denominator:100,value:.05,sessions_with_cta_impression:100,clicked_without_recorded_impression:0});
  assert.equal(result.by_landing_page_and_device.length,1);assert.equal(result.quality.nonproduction_sessions,20);
  assert.equal(result.period.days,4);assert.equal(compactCtaMeasurement(result).landing_device_groups,1);
  assert.match(result.definition,/24 hours/);assert.match(result.limitations.join(' '),/No click-page or placement/);
});

test('CTA impression defects remain visible without changing the session denominator; direct click defects block preparation',t=>{
  const f=fixture(t);f.report.queries[0].result.rows[3].cta_version_missing_or_other=1;f.flush();
  const observed=companyCtaMeasurement(f.options);assert.equal(observed.eligible_for_prospective_baseline,true);
  assert.equal(observed.quality.issues.length,1);assert.equal(observed.total.denominator,100);
  f.report.queries[0].result.rows[2].click_target_invalid_or_missing=1;f.flush();
  const blocked=companyCtaMeasurement(f.options);assert.equal(blocked.status,'quality_blocked');
  assert.equal(blocked.eligible_for_prospective_baseline,false);assert.equal(blocked.total.denominator,100);
});

test('Missing channel and missing session keys block baseline preparation instead of narrowing away unknown sessions',t=>{
  const f=fixture(t);f.report.queries[1].result.rows[0].session_channel='(missing session channel)';f.flush();
  let result=companyCtaMeasurement(f.options);assert.equal(result.status,'quality_blocked');
  assert.equal(result.quality.ambiguous_scope_sessions,10);
  f.report.queries[1].result.rows[0].session_channel='Organic Search';
  f.report.queries[0].result.rows[0].events_without_session_key=1;f.flush();
  result=companyCtaMeasurement(f.options);assert.equal(result.status,'quality_blocked');
});

for (const [label, mutate] of [
  ['wrong report',r=>{r.report='ga4-provisional';}],
  ['wrong property',r=>{r.project='unrelated';}],
  ['wrong run',r=>{r.run_id='456';}],
  ['missing following-day coverage',r=>{r.coverage.pop();}],
  ['duplicate day',r=>{r.coverage[0]=r.coverage[1];}],
  ['wrong query bytes',r=>{r.queries[1].sql_sha256='b'.repeat(64);}],
  ['wrong measurement version',r=>{r.queries[1].params.measurement_version='old';}],
  ['missing quality',r=>{r.queries[0].result.rows=[];}],
  ['missing numerator',r=>{delete r.queries[1].result.rows[0].sessions_with_own_app_click_24h;}],
  ['duplicate row',r=>{r.queries[1].result.rows.push(structuredClone(r.queries[1].result.rows[0]));}],
  ['union mismatch',r=>{r.queries[1].result.rows[0].sessions_with_any_app_route_click_24h=7;}],
  ['wrong rate',r=>{r.queries[1].result.rows[0].own_app_click_session_rate_24h=.8;}],
  ['impossible quality count',r=>{r.queries[0].result.rows[0].events_without_session_key=201;}],
  ['future observation',r=>{r.observed_at='2026-09-15T01:00:00Z';}],
  ['premature collection',r=>{r.observed_at='2026-09-10T01:00:00Z';}],
]) test(`CTA rejects ${label} and returns null measurement`,t=>{
  const f=fixture(t);mutate(f.report);f.flush();const result=companyCtaMeasurement(f.options);
  assert.equal(result.status,'unavailable');assert.equal(result.total,null);assert.equal(result.eligible_for_prospective_baseline,false);
});

test('CTA rejects modified bytes, unverified receipts, stale evidence and public source files',t=>{
  const f=fixture(t);fs.appendFileSync(f.output,' ');
  assert.equal(companyCtaMeasurement(f.options).status,'unavailable');f.flush();
  assert.equal(companyCtaMeasurement({...f.options,now:new Date('2026-09-24T01:00:00Z')}).status,'unavailable');
  fs.chmodSync(f.output,0o644);assert.equal(companyCtaMeasurement(f.options).status,'unavailable');fs.chmodSync(f.output,0o600);
  const p=path.join(f.stateRoot,'data/collection-receipts/ga4-funnel-2026-09-09.json');
  write(p,{...f.receipt,status:'failed'});assert.equal(companyCtaMeasurement(f.options).status,'unavailable');
});

test('A recent download cannot refresh an old observation',t=>{
  const f=fixture(t);f.report.observed_at='2026-09-14T01:00:00Z';
  f.receipt.verified_at='2026-09-24T00:00:00Z';f.flush();
  assert.equal(companyCtaMeasurement({...f.options,now:new Date('2026-09-24T01:00:00Z')}).status,'unavailable');
});

test('CTA retains immutable evidence once; a subsequent failure clears current eligibility and keeps history',t=>{
  const f=fixture(t), first=retainCtaMeasurement(f.options), second=retainCtaMeasurement(f.options);
  assert.equal(first.reused,false);assert.equal(second.reused,true);assert.equal(first.sha256,second.sha256);
  assert.equal(fs.statSync(first.artifact).mode&0o777,0o600);
  const bytes=fs.readFileSync(first.artifact);assert.equal(hash(bytes),first.sha256);
  fs.appendFileSync(f.output,' ');
  assert.equal(retainCtaMeasurement(f.options).status,'unavailable');
  const latest=JSON.parse(fs.readFileSync(path.join(f.stateRoot,'measurement/cta/latest.json')));
  assert.equal(latest.eligible_for_prospective_baseline,false);assert.equal(latest.artifact,null);
  assert.deepEqual(fs.readFileSync(first.artifact),bytes);
});

test('CTA does not infer zero clicks when the requested source has no organic landing cohort',t=>{
  const f=fixture(t);f.report.queries[1].result.rows=f.report.queries[1].result.rows.filter(r=>r.session_channel==='Direct');f.flush();
  const result=companyCtaMeasurement(f.options);assert.equal(result.status,'no_matching_cohort');
  assert.equal(result.total,null);assert.equal(result.eligible_for_prospective_baseline,false);
});

const diagnosticFields = ['missing_landing_no_timed_page_view_in_scan',
  'missing_landing_page_view_before_start_only','missing_landing_page_view_after_window_only',
  'missing_landing_page_view_both_sides'];

test('Landing diagnostics retain every missing session and never admit a blocked cohort',t=>{
  const f=fixture(t), row=f.report.queries[1].result.rows[0];
  row.landing_scope='missing_landing_page';row.landing_path=null;
  diagnosticFields.forEach((k,i)=>{row[k]=[4,3,2,1][i];});f.flush();
  const result=companyCtaMeasurement(f.options), d=result.landing_diagnostics;
  assert.equal(result.status,'quality_blocked');assert.equal(result.eligible_for_prospective_baseline,false);
  assert.equal(result.quality.ambiguous_scope_sessions,10);
  assert.equal(result.total.denominator,90);assert.equal(d.missing_landing_sessions,10);
  assert.equal(d.status,'observed');assert.equal(d.scan_end,'2026-09-10');
  assert.deepEqual(d.counts,Object.fromEntries(diagnosticFields.map((k,i)=>[k,[4,3,2,1][i]])));
  assert.deepEqual(compactCtaMeasurement(result).landing_diagnostics,d);
});

for (const [label, mutate] of [
  ['missing field',r=>{delete r[diagnosticFields[0]];}],
  ['negative field',r=>{r[diagnosticFields[0]]=-1;}],
  ['fractional field',r=>{r[diagnosticFields[0]]=0.5;}],
  ['invented missing session',r=>{r[diagnosticFields[0]]=1;}],
  ['unaccounted missing sessions',r=>{r.landing_scope='missing_landing_page';}],
]) test(`Landing diagnosis rejects ${label}`,t=>{
  const f=fixture(t);mutate(f.report.queries[1].result.rows[0]);f.flush();
  const result=companyCtaMeasurement(f.options);
  assert.equal(result.status,'unavailable');assert.equal(result.eligible_for_prospective_baseline,false);
});

test('Exact legacy SQL retains totals and diagnosis identity, with unavailable supplemental counts',t=>{
  const f=fixture(t), q=f.report.queries[1];
  q.sql_sha256=hash(fs.readFileSync(path.join(ROOT,'growth/tests/fixtures/ga4-funnel-v1.sql')));
  assert.equal(q.sql_sha256,'a528c1054d236b9bd4a5fdc2d043ae82e282d9c6323213cbb92eeaff4347b71b');
  for(const row of q.result.rows)for(const field of diagnosticFields)delete row[field];
  q.result.rows[0].landing_scope='missing_landing_page';q.result.rows[0].landing_path=null;f.flush();
  const result=companyCtaMeasurement(f.options);
  assert.equal(result.status,'quality_blocked');assert.equal(result.total.denominator,90);
  assert.equal(result.landing_diagnostics.status,'unavailable');assert.equal(result.landing_diagnostics.counts,null);
  assert.equal(result.landing_diagnostics.missing_landing_sessions,10);
  // Original diagnosis identity excludes supplemental fields. Retained reviews
  // stay valid; changing source bytes still creates a different identity.
  assert.equal(result.diagnosis.measurement_key,hash(JSON.stringify({source:result.source,period:result.period,
    metric:result.metric,definition_version:result.definition_version,quality:result.quality})));
  f.report.queries[0].sql_sha256=q.sql_sha256;f.flush();
  assert.equal(companyCtaMeasurement(f.options).status,'unavailable');
});

test('The existing collection retains CTA evidence and isolates invalid measurement from independent source success',async t=>{
  const {collectData}=await import('./company-data.mjs');
  const {opportunities}=await import('./company-loop.mjs');
  const f=fixture(t), makeConnections=()=>JSON.parse(fs.readFileSync(path.join(f.stateRoot,'data/connections.json')));
  const operations=[['independent',()=>({status:'verified',output:'existing-output'})]];
  const first=await collectData({...f.options,operations,makeConnections});
  assert.equal(first.status,'verified');assert.equal(first.measurements.cta.reused,false);
  const second=await collectData({...f.options,operations,makeConnections});
  assert.equal(second.measurements.cta.reused,true);
  f.report.queries[1].result.rows[0].landing_scope='missing_landing_page';
  f.report.queries[1].result.rows[0].missing_landing_no_timed_page_view_in_scan=10;
  f.report.queries[1].result.rows[0].landing_path=null;f.flush();
  const diagnosed=companyCtaMeasurement(f.options);
  const candidates=opportunities({growth:{cta_measurement:diagnosed},automation:{failures:[]}});
  assert.equal(candidates.find(c=>c.id==='diagnose:cta-measurement').kind,'diagnose_measurement');
  fs.appendFileSync(f.output,' ');
  const partial=await collectData({...f.options,operations,makeConnections});
  assert.equal(partial.status,'partial');assert.equal(partial.receipts[0].receipt.status,'verified');
  assert.equal(partial.measurements.cta.status,'unavailable');
  assert.equal(partial.failures[0].source,'cta_measurement');
  f.flush();await collectData({...f.options,operations,makeConnections});
  const brokenView=await collectData({...f.options,operations,makeConnections:()=>{throw new Error('view failed');}});
  assert.equal(brokenView.measurements.cta.status,'unavailable');
  const latest=JSON.parse(fs.readFileSync(path.join(f.stateRoot,'measurement/cta/latest.json')));
  assert.equal(latest.eligible_for_prospective_baseline,false);assert.equal(latest.artifact,null);
});

test('A source-specific diagnosis stops repeated selection, retains quality blocks and reopens on changed or corrupt evidence',async t=>{
  const {opportunities}=await import('./company-loop.mjs');
  const f=fixture(t);f.report.queries[0].result.rows[0].events_without_session_key=1;f.flush();
  const current=companyCtaMeasurement(f.options), evidence=path.join(f.stateRoot,'investigation.json');
  write(evidence,{source_sha256:current.source.sha256,checked_at:'2026-09-14T10:00:00Z',finding:'Observed absence; cause not proven.'});
  const manifest=path.join(f.stateRoot,'review.json');
  const record={schema_version:1,measurement_key:current.diagnosis.measurement_key,decision:'source_limit',
    reviewed_at:'2026-09-14T10:01:00Z',rationale:'The retained aggregate cannot identify a demonstrated tracking implementation defect.',
    next_condition:'Re-evaluate the next original daily source hash; preserve missing sessions and defer treatment.',
    evidence:{path:evidence,sha256:hash(fs.readFileSync(evidence))}};
  write(manifest,record);
  const a=recordCtaDiagnosis({...f.options,evidenceFile:manifest}), b=recordCtaDiagnosis({...f.options,evidenceFile:manifest});
  assert.equal(a.sha256,b.sha256);
  const after=companyCtaMeasurement(f.options);assert.equal(after.status,'quality_blocked');
  assert.equal(after.eligible_for_prospective_baseline,false);
  assert.deepEqual(after.total,current.total);
  const selected=m=>opportunities({growth:{cta_measurement:m},automation:{failures:[]}}).some(c=>c.id==='diagnose:cta-measurement');
  assert.equal(selected(after),false);
  write(manifest,{...record,rationale:'A different interpretation cannot overwrite the previous registered diagnosis.'});
  assert.throws(()=>recordCtaDiagnosis({...f.options,evidenceFile:manifest}),/Conflicting/);
  fs.appendFileSync(evidence,' ');assert.equal(selected(companyCtaMeasurement(f.options)),true);
  f.report.queries[0].result.rows[0].events_without_session_key=2;f.flush();
  assert.equal(companyCtaMeasurement(f.options).diagnosis.state,'not_reviewed');
  assert.equal(selected(companyCtaMeasurement(f.options)),true);
  write(manifest,record);assert.throws(()=>recordCtaDiagnosis({...f.options,evidenceFile:manifest}),/must match/);
});
