import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {snapshotFromExport, companySearch, searchCandidates} from './company-search.mjs';
import {buildMeta, emptyBuckets} from './snapshot.mjs';
import {analyzeSnapshot} from './analysis.mjs';
import {prioritize} from './company-loop.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const now = new Date('2026-09-13T15:00:00Z');
function fixture() {
  const dates = Array.from({length:28}, (_, i) => ({dimension:'date', value:new Date(Date.parse('2026-08-13') + i * 86400000).toISOString().slice(0,10), clicks:4, impressions:100, ctr:.04, position:5}));
  const sql = file => hash(fs.readFileSync(new URL('../sql/analytics/' + file, import.meta.url)));
  const query = (file, rows) => ({file, sql_sha256:sql(file), params:{start_date:'2026-08-13', end_date:'2026-09-09'}, result:{statementType:'SELECT', rows}});
  const page = {dimension:'page', value:'https://simplememofast.com/obsidian/', clicks:50, impressions:3000, ctr:50/3000, position:6};
  const payload = {schema_version:1,status:'complete',report:'gsc',execution:'export',project:'yurika-simplememo',run_id:'123',source_sha:'a'.repeat(40),
    start:'2026-08-13',end:'2026-09-09',observed_at:'2026-09-13T05:00:00Z',total_bytes_billed:100,
    queries:[query('gsc-site.sql',[...dates,{dimension:'query',value:'sample',clicks:20,impressions:1000,ctr:.02,position:8},{dimension:'query',value:null,clicks:92,impressions:1800,ctr:92/1800,position:7}]),query('gsc-pages.sql',[...dates,page])]};
  const receipt = {status:'verified',source:'gsc',run_id:123,source_commit:payload.source_sha,window:{start:payload.start,end:payload.end},cap_bytes:2147483648,sha256:hash(JSON.stringify(payload))};
  return {payload,receipt};
}
function dir(t) {const d=fs.mkdtempSync(path.join(os.tmpdir(),'company-search-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}

test('retained export uses canonical totals and CTR curves; anonymous demand is not dropped from the denominator', () => {
  const {payload,receipt}=fixture(), before=JSON.stringify(payload);
  const s=snapshotFromExport(payload,receipt,{now});
  assert.equal(s.meta.totals.clicks,112);assert.equal(s.meta.totals.impressions,2800);
  assert.equal(s.queries.length,1);assert.equal(s.queries[0].clicks,20);
  assert.equal(s.pages[0].page,'/obsidian/');assert.equal(s.pages[0].position,6);
  assert.deepEqual(s.queryPages,[]);assert.deepEqual(s.pagesAio,[]);assert.equal(s.meta.aio,null);
  const buckets=emptyBuckets();buckets.dates=s.dates;buckets.pages=s.pages;buckets.queries=s.queries;
  const canonical=buildMeta({label:s.label,buckets,period:payload.start+'..'+payload.end,source:'bigquery'});
  for(const key of ['totals','ctr_curve','ctr_curve_segments','ctr_curve_calibration'])assert.deepEqual(s.meta[key],canonical[key]);
  assert.equal(JSON.stringify(payload),before);
  assert.equal(analyzeSnapshot(s).cannibalisation,null);
});

test('malformed, wrong-source, missing-day and immature exports cannot become decision evidence', () => {
  const mutations=[
    p=>p.queries[0].result.rows.shift(),
    p=>p.queries[1].result.rows.shift(),
    p=>p.queries[0].result.rows.push(p.queries[0].result.rows[0]),
    p=>p.queries[0].sql_sha256='b'.repeat(64),
    p=>p.queries[0].params.start_date='2026-08-12',
    p=>p.queries[0].result.rows[0].clicks=null,
    p=>p.queries[0].result.rows[0].position=0,
    p=>p.queries[1].result.rows.at(-1).value='https://example.org/obsidian/',
    p=>p.source_sha='b'.repeat(40),
    p=>p.run_id='456',
    p=>p.project='other',
    p=>p.total_bytes_billed=2147483649,
    p=>p.observed_at='2026-09-14T05:00:00Z',
    p=>p.status='incomplete_date_coverage'
  ];
  for(const mutate of mutations){const {payload,receipt}=fixture();mutate(payload);assert.throws(()=>snapshotFromExport(payload,receipt,{now}));}
  const {payload,receipt}=fixture();
  assert.throws(()=>snapshotFromExport(payload,receipt,{now:new Date('2026-09-10T00:00:00Z')}));
  assert.throws(()=>snapshotFromExport(payload,receipt,{now:new Date('2026-09-20T00:00:00Z')}));
});

test('actual consumer chooses the newer verified export, checks bytes, preserves independent fallback and never writes or queries', t => {
  const root=dir(t),{payload,receipt}=fixture();
  fs.mkdirSync(path.join(root,'data/collection-receipts'),{recursive:true});
  receipt.output=path.join(root,'report.json');fs.writeFileSync(receipt.output,JSON.stringify(payload));
  const file=path.join(root,'data/collection-receipts/gsc-2026-09-09.json');fs.writeFileSync(file,JSON.stringify(receipt));
  const complete=snapshotFromExport(payload,receipt,{now});
  const fallback={...complete,label:'older',meta:{...complete.meta,period_start:'2026-08-10',period_end:'2026-09-05',complete_window:false},queryPages:[{query:'old',page:'/other/'}]};
  const call=()=>companySearch({stateRoot:root,now,fallback,history:[]});
  const original=fs.readFileSync(file,'utf8');
  let r=call();assert.equal(r.evidence.selected,'verified_existing_export');assert.equal(r.evidence.actionable,true);assert.deepEqual(r.snapshot.queryPages,[]);
  assert.equal(r.analysis.period,'2026-08-13..2026-09-09');assert.deepEqual(r.analysis,analyzeSnapshot(r.snapshot));
  assert.deepEqual(call(),r);assert.equal(fs.readFileSync(file,'utf8'),original);
  fs.writeFileSync(path.join(root,'data/collection-receipts/gsc-2026-09-10.json'),'{truncated');
  fs.writeFileSync(path.join(root,'data/collection-receipts/gsc-2026-09-11.json'),JSON.stringify({source:'gsc',status:'verified'}));
  r=call();assert.equal(r.evidence.selected,'verified_existing_export');assert.equal(r.failures.length,2);
  fs.appendFileSync(receipt.output,' ');r=call();assert.equal(r.evidence.selected,'existing_snapshot');assert.equal(r.evidence.actionable,false);assert(r.failures.some(f=>f.reason==='retained_export_not_admitted'));
  assert.equal(r.snapshot.label,'older');
});

test('candidate bridge retains exact detector evidence, blocks active experiments and keeps the original noise floor', () => {
  const defaults={frequency:65,human_time_saved:60,manual_touches:60,reversibility:95,safety:90,ease:65,reliability:70,business_impact:60,growth_impact:55,reuse:100,affordability:90,permission_readiness:90};
  const row={kind:'page',key:'/obsidian/',impressions:200,expected_ctr:.04,ctr:.01,position:5,upside_clicks:6};
  const growth={search_input:{actionable:true},content_gaps:{ctr_gap:[row,{...row,kind:'query'},{...row,key:'/small/',impressions:2}]},experiments:[],followups:{reviews:[]}};
  let rows=searchCandidates(growth,defaults);assert.equal(rows.length,1);assert.equal(rows[0].executable,true);assert.equal(rows[0].evidence[1].upside_clicks,6);
  assert(prioritize(rows)[0].priority>0);
  growth.experiments=[{id:'ongoing',status:'RUNNING',affected_area:'https://simplememofast.com/obsidian/index.html'}];
  rows=searchCandidates(growth,defaults);assert.equal(rows[0].executable,false);assert.equal(prioritize(rows)[0].priority,null);assert.deepEqual(rows[0].blocking_experiments,['ongoing']);
  growth.experiments=null;rows=searchCandidates(growth,defaults);assert.equal(rows[0].executable,false);assert.equal(rows[0].ownership_state,'unavailable');
  growth.experiments=[];growth.followups={reviews:[{id:'future-review',status:'RUNNING',parent:{page:'/obsidian/'}}]};
  rows=searchCandidates(growth,defaults);assert.equal(rows[0].executable,false);assert.deepEqual(rows[0].blocking_followups,['future-review']);
  growth.followups=null;assert.equal(searchCandidates(growth,defaults)[0].executable,false);
  growth.search_input.actionable=false;assert.deepEqual(searchCandidates(growth,defaults),[]);
});

test('overlapping windows cannot turn the shared detectors into a growth win', () => {
  const {payload,receipt}=fixture(),s=snapshotFromExport(payload,receipt,{now});
  const previous={...s,label:'previous',meta:{...s.meta,period_start:'2026-08-12',period_end:'2026-09-08'}};
  const a=analyzeSnapshot(s,{previous});assert.equal(a.comparison.comparable,false);assert.equal(a.decay.incomparable.reason,'overlapping_or_reversed_windows');
});
