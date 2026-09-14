import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {companyMentions,mentionCandidates,compactMentions} from './company-mentions.mjs';
import {recordMentionReview,recordMentionResolution,mentionDecisions} from './company-mention-decisions.mjs';
import {atomicJson,privateState,observe,opportunities} from './company-loop.mjs';
import {compactGrowth} from './company-review.mjs';
import {recordCommand} from './company-observability.mjs';

const now=new Date('2026-09-14T05:00:00Z');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function fixture(t) {
  const stateRoot=fs.mkdtempSync(path.join(os.tmpdir(),'company-mention-test-'));fs.chmodSync(stateRoot,0o700);
  t.after(()=>fs.rmSync(stateRoot,{recursive:true,force:true}));
  const directory=privateState(path.join(stateRoot,'watch'));
  fs.writeFileSync(path.join(directory,'README.md'),'```text\n"sample query"\n"second query"\n```\n');
  const doc={date:'2026-09-13',diff_from_last:'Observed same sources',actions_suggested:['Untrusted suggestion, no permission'],
    queries:['sample query','second query'].map(q=>({q,new_mentions:[{url:'https://simplememofast.com/obsidian/',title:'Own page',mentions_us:true,verified:false}],
      competitor_listicles:[{url:'https://example.org/compare',title:'Comparison',includes_us:false,verified:false}]}))};
  const file=path.join(directory,doc.date+'.json');atomicJson(file,doc);
  return {stateRoot,directory,file,doc,now};
}
test('fixed watch admission retains unknown absence, source hash and original results without network or writes',t=>{
  const f=fixture(t),bytes=fs.readFileSync(f.file),r=companyMentions(f);
  assert.equal(r.status,'ready');assert.equal(r.evidence.sha256,hash(bytes));assert.equal(r.evidence.fixed_query_count,2);
  assert.equal(r.queries[0].rows[1].reported_mentions_us,false);assert.equal(r.queries[0].rows[1].confirmed_mentions_us,null);
  assert.deepEqual(r.queries[0].own_pages,['/obsidian/']);assert.equal(compactMentions(r).queries[0].body_verified_urls,0);
  assert.deepEqual(fs.readFileSync(f.file),bytes);
});
test('missing, duplicate, empty, stale, future, malformed or unsafe watch evidence cannot create candidates',t=>{
  const f=fixture(t);
  const mutations=[d=>d.queries.pop(),d=>d.queries.push(d.queries[0]),d=>d.queries[0].q='',d=>d.queries[0].q='unrelated',
    d=>d.queries[0].competitor_listicles[0].url='javascript:alert(1)',d=>d.queries[0].competitor_listicles[0].url='https://user:pass@example.org/a',
    d=>d.queries[0].competitor_listicles[0].verified='true',d=>d.queries[0].competitor_listicles=null,d=>d.date='2026-09-31'];
  for(const mutate of mutations) {
    const doc=structuredClone(f.doc);mutate(doc);atomicJson(f.file,doc);
    const r=companyMentions(f);assert.notEqual(r.status,'ready');assert.deepEqual(mentionCandidates(r,[],{}).candidates,[]);
  }
  atomicJson(f.file,f.doc);
  for(const date of ['2026-09-12','2026-09-25'])assert.notEqual(companyMentions({...f,now:new Date(date)}).status,'ready');
  atomicJson(path.join(f.directory,'2026-08-30.json'),{...f.doc,date:'2026-08-30'});
  assert.equal(companyMentions(f).status,'not_admitted');
});
test('mention context does not duplicate a measured candidate, boost its score or bypass experiment blocking',t=>{
  const f=fixture(t),mentions=companyMentions(f);
  const search=[{id:'search:existing',target_page:'/obsidian/',executable:false,blocking_experiments:['running'],factors:{reliability:12},action_scope:'Keep original gates'}];
  const before=JSON.stringify(search),r=mentionCandidates(mentions,search,{});
  assert.equal(r.search.length,1);assert.equal(r.candidates.length,0);assert.equal(r.search[0].executable,false);
  assert.deepEqual(r.search[0].blocking_experiments,['running']);assert.deepEqual(r.search[0].factors,{reliability:12});
  assert.equal(JSON.stringify(search),before);assert.equal(r.search[0].mention_context.queries.length,2);
  const standalone=mentionCandidates(mentions,[],{}).candidates;
  assert.equal(standalone.length,2);assert.ok(standalone.every(c=>c.can_change_public_content===false));
});
function reviewFixture(t) {
  const f=fixture(t),mentions=companyMentions(f),html_file=path.join(f.stateRoot,'source.html');
  fs.writeFileSync(html_file,'<html><body>SimpleMemo is a sponsored product.</body></html>',{mode:0o600});
  const review={schema_version:1,snapshot_sha256:mentions.evidence.sha256,query_id:mentions.queries[0].id,url:'https://example.org/compare',
    decision:'retain_existing_mention',conclusion:{mentions_us:true,relationship:'sponsored'},rationale:'The body explicitly mentions the product and discloses sponsorship; no outreach is needed.',
    evidence:{requested_url:'https://example.org/compare',final_url:'https://example.org/compare',http_status:200,fetched_at:'2026-09-14T01:00:00Z',html_file,html_sha256:hash(fs.readFileSync(html_file))}};
  const reviewFile=path.join(f.stateRoot,'review.json');atomicJson(reviewFile,review);
  return {...f,mentions,review,reviewFile};
}
test('source-specific decisions are immutable, evidenced, reused and never rewrite the watch or close other sources',t=>{
  const f=reviewFixture(t),before=fs.readFileSync(f.file);
  const recorded=recordMentionReview(f);assert.equal(recorded.status,'recorded');assert.equal(recordMentionReview(f).status,'already_recorded');
  let decisions=mentionDecisions(f);assert.equal(decisions.reviews.length,1);assert.equal(decisions.failures.length,0);
  const r=mentionCandidates({...f.mentions,decisions:decisions.reviews},[],{});
  assert.equal(r.candidates[0].evidence[1].rows.length,1);assert.equal(r.candidates[1].evidence[1].rows.length,2);
  assert.equal(f.mentions.queries[0].rows[1].confirmed_mentions_us,null);assert.deepEqual(fs.readFileSync(f.file),before);
  assert.equal(compactMentions({...f.mentions,decisions:decisions.reviews}).decisions[0].conclusion.relationship,'sponsored');
  atomicJson(f.reviewFile,{...f.review,rationale:f.review.rationale+' Changed'});assert.throws(()=>recordMentionReview(f),/overwritten/);
  decisions=mentionDecisions({...f,mentions:{...f.mentions,evidence:{...f.mentions.evidence,sha256:'a'.repeat(64)}}});assert.equal(decisions.reviews.length,0);
  fs.appendFileSync(f.review.evidence.html_file,'changed');decisions=mentionDecisions(f);
  assert.equal(decisions.reviews.length,0);assert.equal(decisions.failures.length,1);
});
test('review refuses missing body, wrong identity, backdated/future fetch, redirects and unsupported publication decisions',t=>{
  const f=reviewFixture(t);
  for(const patch of [{url:'https://other.test/'},{snapshot_sha256:'a'.repeat(64)},{decision:'publish'},
    {conclusion:{mentions_us:null,relationship:'unknown'}},
    {evidence:{...f.review.evidence,fetched_at:'2026-09-12T00:00:00Z'}},
    {evidence:{...f.review.evidence,fetched_at:'2026-09-15T00:00:00Z'}},
    {evidence:{...f.review.evidence,final_url:'https://other.test/'}},
    {evidence:{...f.review.evidence,html_sha256:'b'.repeat(64)}}]) {
    atomicJson(f.reviewFile,{...f.review,...patch});assert.throws(()=>recordMentionReview(f));
  }
  atomicJson(f.reviewFile,f.review);fs.chmodSync(f.review.evidence.html_file,0o644);
  assert.throws(()=>recordMentionReview(f),/private/);
});
test('review_owned_page retains the next research action instead of falsely settling publication',t=>{
  const f=reviewFixture(t);f.review.decision='review_owned_page';f.review.target_page='/obsidian/';atomicJson(f.reviewFile,f.review);
  recordMentionReview(f);const decisions=mentionDecisions(f).reviews;
  const candidates=mentionCandidates({...f.mentions,decisions},[],{}).candidates;
  assert.equal(candidates[0].evidence[1].rows.length,2);assert.equal(candidates[0].evidence[1].source_decisions[0].target_page,'/obsidian/');
  assert.equal(candidates[0].can_change_public_content,false);
});
function resolutionFixture(t) {
  const f=reviewFixture(t);f.review.decision='review_owned_page';f.review.target_page='/obsidian/';atomicJson(f.reviewFile,f.review);
  const parent=recordMentionReview(f),html_file=path.join(f.stateRoot,'owned.html'),body='<html>Reviewed own page content</html>';
  fs.writeFileSync(html_file,body,{mode:0o600});
  const resolution={schema_version:1,decision_id:parent.id,outcome:'no_change',rationale:'The owned page already addresses the observed topic; preserve the current content.',
    owned_page_evidence:{requested_url:'https://simplememofast.com/obsidian/',final_url:'https://simplememofast.com/obsidian/',http_status:200,
      fetched_at:'2026-09-14T05:01:00Z',html_file,html_sha256:hash(body)}};
  const resolutionFile=path.join(f.stateRoot,'resolution.json');atomicJson(resolutionFile,resolution);
  return {...f,now:new Date('2026-09-14T05:03:00Z'),parent,resolution,resolutionFile,body};
}
function browserReviewFixture(t) {
  const f=reviewFixture(t),document_file=path.join(f.stateRoot,'browser-visible.json');
  const document={schema_version:1,method:'cua_dom_inner_text',url:f.review.url,title:'Source profile',
    text:'SimpleMemo appears here with a link to the existing product website.',
    observed_at:f.review.evidence.fetched_at,observation:'agent_inspected_visible_body'};
  atomicJson(document_file,document);
  const evidence={kind:'browser_visible_text',requested_url:f.review.url,final_url:f.review.url,http_status:null,
    fetched_at:document.observed_at,document_file,document_sha256:hash(fs.readFileSync(document_file))};
  f.review.evidence=evidence;atomicJson(f.reviewFile,f.review);
  return {...f,document,document_file};
}
test('browser source observation reuses the immutable review without claiming HTTP, publication or changing the watch',t=>{
  const f=browserReviewFixture(t),original=fs.readFileSync(f.file);
  assert.equal(recordMentionReview(f).status,'recorded');assert.equal(recordMentionReview(f).status,'already_recorded');
  const d=mentionDecisions(f);assert.equal(d.failures.length,0);assert.equal(d.reviews.length,1);
  assert.equal(d.reviews[0].evidence.http_status,null);
  const c=mentionCandidates({...f.mentions,decisions:d.reviews},[],{}).candidates;
  assert.equal(c[0].evidence[1].rows.length,1);assert.equal(c[1].evidence[1].rows.length,2);
  assert(c.every(x=>x.can_change_public_content===false));assert.deepEqual(fs.readFileSync(f.file),original);
  fs.appendFileSync(f.document_file,' ');
  const invalid=mentionDecisions(f);assert.equal(invalid.reviews.length,0);assert.equal(invalid.failures.length,1);
});
test('browser review rejects mismatched source, unretained text, fabricated HTTP status, times and missing observation',t=>{
  const f=browserReviewFixture(t),e=f.review.evidence;
  for(const patch of [{http_status:200},{kind:'anything'}, {document_sha256:'a'.repeat(64)},
    {document_file:path.join(f.stateRoot,'missing')},{final_url:'https://example.org/other'},
    {fetched_at:'2026-09-15T00:00:00Z'},{fetched_at:'2026-09-12T00:00:00Z'}]) {
    atomicJson(f.reviewFile,{...f.review,evidence:{...e,...patch}});assert.throws(()=>recordMentionReview(f));
  }
  for(const patch of [{url:'https://example.org/other'}, {title:''}, {text:'Error'},
    {method:'http'}, {observed_at:'2026-09-14T02:00:00Z'}, {observation:undefined}]) {
    atomicJson(f.document_file,{...f.document,...patch});
    atomicJson(f.reviewFile,{...f.review,evidence:{...e,document_sha256:hash(fs.readFileSync(f.document_file))}});
    assert.throws(()=>recordMentionReview(f));
  }
  atomicJson(f.document_file,f.document);atomicJson(f.reviewFile,f.review);fs.chmodSync(f.document_file,0o644);
  assert.throws(()=>recordMentionReview(f),/private/);
});
test('browser research cannot replace the original owned-page delivery proof',async t=>{
  const f=browserReviewFixture(t);f.review.decision='review_owned_page';f.review.target_page='/obsidian/';atomicJson(f.reviewFile,f.review);
  const parent=recordMentionReview(f),resolutionFile=path.join(f.stateRoot,'browser-resolution.json');
  atomicJson(resolutionFile,{schema_version:1,decision_id:parent.id,outcome:'no_change',
    rationale:'Attempt to substitute a visible browser source for the served owned page.',
    owned_page_evidence:{...f.review.evidence,requested_url:'https://simplememofast.com/obsidian/',final_url:'https://simplememofast.com/obsidian/',fetched_at:now.toISOString()}});
  await assert.rejects(recordMentionResolution({...f,resolutionFile}),/browser research cannot verify owned-page resolution/);
  assert.equal(mentionDecisions(f).reviews[0].resolution,null);
});
test('owned-page no-change resolution is append-only, suppresses only its source and reopens on corrupt evidence',async t=>{
  const f=resolutionFixture(t),parentFile=path.join(f.stateRoot,'mention-decisions',f.parent.id+'.json'),before=fs.readFileSync(parentFile);
  assert.equal((await recordMentionResolution(f)).status,'recorded');
  assert.equal((await recordMentionResolution(f)).status,'already_recorded');
  let decisions=mentionDecisions(f);assert.equal(decisions.failures.length,0);
  assert.equal(decisions.reviews[0].resolution.outcome,'no_change');
  const view={...f.mentions,decisions:decisions.reviews},candidates=mentionCandidates(view,[],{}).candidates;
  assert.equal(candidates[0].evidence[1].rows.length,1);assert.equal(candidates[1].evidence[1].rows.length,2);
  assert.equal(compactMentions(view).decisions[0].resolution.outcome,'no_change');
  assert.deepEqual(fs.readFileSync(parentFile),before);
  atomicJson(f.resolutionFile,{...f.resolution,rationale:f.resolution.rationale+' changed'});
  await assert.rejects(recordMentionResolution(f),/overwritten/);
  assert.equal(mentionDecisions({...f,mentions:{...f.mentions,evidence:{...f.mentions.evidence,sha256:'e'.repeat(64)}}}).reviews.length,0);
  fs.appendFileSync(f.resolution.owned_page_evidence.html_file,'changed');decisions=mentionDecisions(f);
  assert.equal(decisions.reviews.length,1);assert.equal(decisions.reviews[0].resolution,null);
  assert.equal(decisions.failures[0].reason,'mention_resolution_evidence_invalid');
  assert.equal(mentionCandidates({...f.mentions,decisions:decisions.reviews},[],{}).candidates[0].evidence[1].rows.length,2);
});
test('resolution rejects old, future, wrong-page, uncompleted, redirected and unsupported evidence',async t=>{
  const f=resolutionFixture(t),e=f.resolution.owned_page_evidence;
  for(const patch of [{decision_id:'a'.repeat(64)},{outcome:'published'},{outcome:'change_verified'},
    {owned_page_evidence:{...e,fetched_at:'2026-09-14T04:59:59Z'}},
    {owned_page_evidence:{...e,fetched_at:'2026-09-14T05:04:00Z'}},
    {owned_page_evidence:{...e,requested_url:'https://simplememofast.com/other/'}},
    {owned_page_evidence:{...e,final_url:'https://simplememofast.com/other/'}},
    {owned_page_evidence:{...e,http_status:404}},{company_run_id:'claimed-run'}]) {
    atomicJson(f.resolutionFile,{...f.resolution,...patch});await assert.rejects(recordMentionResolution(f));
  }
  const retained=JSON.parse(fs.readFileSync(path.join(f.stateRoot,'mention-decisions',f.parent.id+'.json')));
  retained.review.decision='no_action';atomicJson(path.join(f.stateRoot,'mention-decisions',f.parent.id+'.json'),retained);
  atomicJson(f.resolutionFile,f.resolution);await assert.rejects(recordMentionResolution(f),/only a pending/);
});
function completedResolutionFixture(t) {
  const f=resolutionFixture(t),id='11111111-1111-4111-8111-111111111111',runId='ap-mention-example';
  const merge={pr:123,url:'https://github.com/simplememofast/simplememo/pull/123',head_sha:'a'.repeat(40),merge_sha:'b'.repeat(40),merged_at:'2026-09-14T05:00:30Z',validation_run:456};
  // The actual loop starts/selects before source review, then binds execution after review.
  const run={id,status:'verified_existing_autopilot',route:'owner-session',started_at:'2026-09-14T04:59:50Z',bound_at:'2026-09-14T05:00:10Z',finished_at:'2026-09-14T05:00:50Z',
    bound_autopilot_run_id:runId,prior_autopilot_run_ids:[],selected:mentionCandidates(f.mentions,[],{}).candidates[0],
    evidence_of_completion:{merge,canonical_run_id:runId}};
  const runFile=path.join(privateState(path.join(f.stateRoot,'runs')),id+'.json');atomicJson(runFile,run);
  f.resolution={...f.resolution,outcome:'change_verified',company_run_id:id};atomicJson(f.resolutionFile,f.resolution);
  const row={run_id:runId,outcome:'shipped',attempted:true,pr:123,route:'owner-session',artifact:'/obsidian/'};
  const call=(name,args)=>{
    if(name==='gh' && args[0]==='pr')return JSON.stringify({state:'MERGED',baseRefName:'main',headRefOid:merge.head_sha,mergedAt:merge.merged_at,mergeCommit:{oid:merge.merge_sha},url:merge.url});
    if(name==='gh' && args[0]==='run')return JSON.stringify([{headSha:merge.head_sha,event:'pull_request',status:'completed',conclusion:'success',databaseId:456}]);
    if(name==='git' && ['fetch','merge-base'].includes(args[0]))return '';
    if(name==='git' && args[0]==='diff')return 'obsidian/index.html\n';
    if(name==='git' && args[0]==='show') {
      if(args[1]===merge.merge_sha+':data/autopilot-runs.json')return JSON.stringify({runs:[row]});
      if(args[1]===merge.merge_sha+'^:data/autopilot-runs.json')return JSON.stringify({runs:[]});
      if(args[1]===merge.merge_sha+':obsidian/index.html')return f.body;
    }
    throw new Error('Unexpected verifier call');
  };
  const fetchImpl=async()=>({ok:true,url:'https://simplememofast.com/obsidian/',text:async()=>f.body});
  return {...f,run,runFile,merge,call,fetchImpl};
}
test('changed-page resolution requires original run, exact CI, actual target change and served-byte parity',async t=>{
  const f=completedResolutionFixture(t),before=fs.readFileSync(f.runFile);
  for(const patch of [{status:'observed_decision_requires_execution'},{bound_at:'2026-09-14T04:59:55Z'},
    {bound_at:undefined},{started_at:'2026-09-14T05:00:20Z'},{bound_at:'2026-09-14T05:00:40Z'},
    {finished_at:'2026-09-14T05:02:00Z'},{selected:{id:'unrelated'}},{prior_autopilot_run_ids:[f.run.bound_autopilot_run_id]}]) {
    atomicJson(f.runFile,{...f.run,...patch});await assert.rejects(recordMentionResolution(f));
  }
  atomicJson(f.runFile,f.run);
  await assert.rejects(recordMentionResolution({...f,call:(n,a)=>n==='gh'&&a[0]==='run'?'[]':f.call(n,a)}),/Exact final PR SHA/);
  await assert.rejects(recordMentionResolution({...f,call:(n,a)=>n==='git'&&a[0]==='diff'?'other.html':f.call(n,a)}),/did not modify/);
  await assert.rejects(recordMentionResolution({...f,fetchImpl:async()=>({ok:true,url:'https://simplememofast.com/obsidian/',text:async()=>'old page'})}),/differs/);
  assert.equal((await recordMentionResolution(f)).outcome,'change_verified');
  assert.deepEqual(fs.readFileSync(f.runFile),before);
  let decisions=mentionDecisions(f);assert.equal(decisions.failures.length,0);assert.equal(decisions.reviews[0].resolution.company_run_id,f.run.id);
  assert.equal(mentionCandidates({...f.mentions,decisions:decisions.reviews},[],{}).candidates[0].evidence[1].rows.length,1);
  atomicJson(f.runFile,{...f.run,status:'failed'});decisions=mentionDecisions(f);
  assert.equal(decisions.reviews[0].resolution,null);assert.equal(decisions.failures.length,1);
});
test('review command telemetry records a component instead of claiming a Company run',t=>{
  const f=fixture(t);for(const command of ['record-mention-review','resolve-mention-review']) {
  const r=recordCommand({stateRoot:f.stateRoot,command,startedAt:'2026-09-14T04:59:59Z',durationMs:1,
    result:{status:'recorded',id:'source-decision'},origin:{state:'not_a_recorded_automation_run'},now});
  assert.equal(r.result_status,'recorded');assert.equal(r.company_run_id,null);
  assert.equal(r.parent_zero_touch_completion,null);assert.equal(r.stages.execute.state,'not_observed');
  }
});
test('importing the legacy validator is silent and does not execute its CLI selftests',()=>{
  const out=execFileSync(process.execPath,['--input-type=module','-e',"import './growth/scripts/check-mentions.mjs'; console.log('imported');",'--','--selftest'],{encoding:'utf8'});
  assert.equal(out.trim(),'imported');
});
test('real existing observation feeds both status and selector while unknown source claims stay unknown',t=>{
  const f=fixture(t),o=observe({stateRoot:f.stateRoot,now});
  assert.equal(o.growth.mentions.status,'ready');assert.equal(o.growth.mentions.evidence.fixed_query_count,6);
  assert.ok(opportunities(o).some(c=>c.kind==='review_mention_observation' || c.mention_context));
  assert.equal(compactGrowth(o).mentions.evidence.sha256,o.growth.mentions.evidence.sha256);
});
