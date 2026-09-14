import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {atomicJson,privateState,acquireLock} from './company-loop.mjs';
import {companyMentions} from './company-mentions.mjs';
import {ROOT} from './gsc.mjs';
import {verifyMergedChange,verifyIntegrationLedger,verifyPublishedArtifact} from './company-proof.mjs';

const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const identity=r=>hash(JSON.stringify([r.snapshot_sha256,r.query_id,r.url]));
function privateFile(file,root) {
  const resolved=fs.realpathSync(file),stat=fs.statSync(resolved);
  assert(resolved.startsWith(fs.realpathSync(root)+path.sep) && stat.isFile() && stat.uid===process.getuid() && !(stat.mode&0o077),'private evidence file required');
  return resolved;
}
function validateBody(e,{stateRoot,url,notBefore,now,exactRedirect=false}) {
  const at=Date.parse(e?.fetched_at);
  assert(Number.isFinite(at) && at>=Date.parse(notBefore) && at<=now.getTime(),'invalid source verification time');
  assert.equal(e.requested_url,url);assert.equal(e.http_status,200);
  const final=new URL(e.final_url),original=new URL(url);
  assert(['http:','https:'].includes(final.protocol) && !final.username && !final.password && final.hostname===original.hostname,'unexpected source redirect');
  if(exactRedirect)assert.equal(final.href,original.href,'owned-page evidence must verify the actual target');
  const bytes=fs.readFileSync(privateFile(e.html_file,stateRoot));
  assert(bytes.length>0 && bytes.length<=5*1024*1024,'invalid retained source body');
  assert.equal(hash(bytes),e.html_sha256,'retained source body changed');
}
function validateReview(r,{stateRoot,mentions,now}) {
  assert.equal(r.schema_version,1);
  assert.equal(mentions.status,'ready','current admitted mention source required');
  assert.equal(r.snapshot_sha256,mentions.evidence.sha256,'review belongs to another source snapshot');
  const query=mentions.queries.find(q=>q.id===r.query_id);
  assert(query?.rows.some(row=>row.url===r.url),'review URL absent from source query');
  assert(['retain_existing_mention','no_action','review_owned_page'].includes(r.decision),'unknown review decision');
  assert(typeof r.rationale==='string' && r.rationale.trim().length>=20,'decision rationale required');
  assert([true,false,null].includes(r.conclusion?.mentions_us),'explicit claim uncertainty required');
  assert(['sponsored','independent','unknown'].includes(r.conclusion.relationship),'source relationship required');
  validateBody(r.evidence,{stateRoot,url:r.url,notBefore:mentions.evidence.date,now});
  if(r.decision==='retain_existing_mention')assert.equal(r.conclusion.mentions_us,true,'retention needs an observed mention');
  if(r.decision==='review_owned_page')assert(query.own_pages.includes(r.target_page),'owned target absent from observed query');
  return r;
}

function decisionRecord(file,{stateRoot,mentions,now}) {
  const bytes=fs.readFileSync(privateFile(file,stateRoot)),d=JSON.parse(bytes);
  assert.equal(d.schema_version,1);assert.equal(d.id,identity(d.review));assert.equal(path.basename(file),d.id+'.json');
  assert(Number.isFinite(Date.parse(d.recorded_at)) && Date.parse(d.recorded_at)<=now.getTime(),'invalid decision date');
  assert(Date.parse(d.recorded_at)>=Date.parse(d.review.evidence?.fetched_at),'decision predates source evidence');
  if(d.review.snapshot_sha256!==mentions.evidence.sha256)return null;
  validateReview(d.review,{stateRoot,mentions,now});
  return {...d,sha256:hash(bytes)};
}

function validateResolution(r,parent,{stateRoot,now}) {
  assert.equal(r.schema_version,1);assert.equal(r.decision_id,parent.id);
  assert.equal(parent.review.decision,'review_owned_page','only a pending owned-page review can resolve');
  assert(['no_change','change_verified'].includes(r.outcome),'unknown resolution outcome');
  assert(typeof r.rationale==='string' && r.rationale.trim().length>=20,'resolution rationale required');
  validateBody(r.owned_page_evidence,{stateRoot,url:'https://simplememofast.com'+parent.review.target_page,
    notBefore:parent.recorded_at,now,exactRedirect:true});
  if(r.outcome==='no_change') {
    assert(r.company_run_id===undefined,'no-change review cannot claim an action run');
    return null;
  }
  assert(/^[a-f0-9-]{36}$/.test(r.company_run_id??''),'completed Company run required');
  const bytes=fs.readFileSync(privateFile(path.join(stateRoot,'runs',r.company_run_id+'.json'),stateRoot)),run=JSON.parse(bytes);
  assert.equal(run.id,r.company_run_id);assert.equal(run.status,'verified_existing_autopilot','action must already be verified');
  assert(Date.parse(run.bound_at)>=Date.parse(parent.recorded_at) && Date.parse(run.bound_at)>=Date.parse(run.started_at),'execution binding predates this review or run');
  assert(Date.parse(run.finished_at)>=Date.parse(run.bound_at) && Date.parse(run.finished_at)<=Date.parse(r.owned_page_evidence.fetched_at),'owned page must be inspected after action completion');
  const selected=run.selected,review=parent.review;
  const direct=selected?.id==='mention:review:'+review.query_id && selected.evidence?.[0]?.sha256===review.snapshot_sha256;
  const context=selected?.target_page===review.target_page && selected.mention_context?.source?.sha256===review.snapshot_sha256 && selected.mention_context.queries?.some(q=>q.id===review.query_id);
  assert(direct || context,'completed action is unrelated to this source decision');
  assert.equal(run.evidence_of_completion?.canonical_run_id,run.bound_autopilot_run_id);
  return {run,sha256:hash(bytes)};
}

const callDefault=(name,args)=>execFileSync(name,args,{cwd:ROOT,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']});
export async function recordMentionResolution({stateRoot,resolutionFile,now=new Date(),mentions=companyMentions({now}),call=callDefault,fetchImpl=fetch}) {
  const root=privateState(stateRoot),r=read(privateFile(resolutionFile,root));
  assert(/^[a-f0-9]{64}$/.test(r.decision_id??''),'source decision identity required');
  assert.equal(mentions.status,'ready','current admitted mention source required');
  const parent=decisionRecord(path.join(root,'mention-decisions',r.decision_id+'.json'),{stateRoot:root,mentions,now});
  assert(parent,'resolution belongs to a different watch');
  const completed=validateResolution(r,parent,{stateRoot:root,now});
  const dir=privateState(path.join(root,'mention-resolutions')),file=path.join(dir,parent.id+'.json');
  const release=acquireLock(root,'mention-decisions.lock');if(!release)return{status:'busy'};
  try {
    if(fs.existsSync(file)) {
      const old=read(privateFile(file,root));assert.deepEqual(old.resolution,r,'existing resolution cannot be overwritten');
      readResolution(file,parent,{stateRoot:root,now});return{status:'already_recorded',id:parent.id};
    }
    let action=null;
    if(completed) {
      const run=completed.run,merge=verifyMergedChange(run.evidence_of_completion.merge.pr,call,{requireIntegration:false});
      assert.deepEqual(merge,run.evidence_of_completion.merge,'completed merge evidence changed');
      assert(Date.parse(merge.merged_at)>=Date.parse(run.bound_at),'merge predates execution binding');
      assert(Date.parse(merge.merged_at)<=Date.parse(run.finished_at),'completion predates actual merge');
      const canonical=verifyIntegrationLedger(run,merge,call);
      const delivery=await verifyPublishedArtifact(parent.review.target_page,merge.merge_sha,call,fetchImpl);
      const changed=call('git',['diff','--name-only',merge.merge_sha+'^',merge.merge_sha]).trim().split('\n');
      assert(changed.includes(delivery.artifact_source),'completed change did not modify the reviewed page');
      assert.equal(delivery.served_sha256,r.owned_page_evidence.html_sha256,'retained owned page differs from verified delivery');
      action={company_run_sha256:completed.sha256,merge,canonical,delivery};
    }
    atomicJson(file,{schema_version:1,id:parent.id,recorded_at:now.toISOString(),resolution:r,
      parent_sha256:parent.sha256,action,
      interpretation:'Append-only closure of this source review; no-change is an agent judgment. Verified change reuses original run/CI/merge/served-page evidence. No new native day, run, autonomy credit or Growth win.'});
    return{status:'recorded',id:parent.id,outcome:r.outcome,formal_gain_claimed:false};
  } finally {release();}
}

function readResolution(file,parent,{stateRoot,now}) {
  const d=read(privateFile(file,stateRoot));
  assert.equal(d.schema_version,1);assert.equal(d.id,parent.id);assert.equal(path.basename(file),d.id+'.json');
  assert.equal(d.parent_sha256,parent.sha256,'original source decision changed');
  assert(Date.parse(d.recorded_at)>=Date.parse(d.resolution?.owned_page_evidence?.fetched_at) && Date.parse(d.recorded_at)<=now.getTime(),'invalid resolution date');
  const completed=validateResolution(d.resolution,parent,{stateRoot,now});
  if(completed) {
    assert.equal(d.action?.company_run_sha256,completed.sha256,'completed run evidence changed');
    assert.deepEqual(d.action.merge,completed.run.evidence_of_completion.merge);
    assert.equal(d.action.canonical?.canonical_run_id,completed.run.bound_autopilot_run_id);
    assert.equal(d.action.delivery?.served_sha256,d.resolution.owned_page_evidence.html_sha256);
    assert(typeof d.action.delivery.artifact_source==='string' && d.action.delivery.artifact_source.length>0);
  } else assert.equal(d.action,null);
  return {outcome:d.resolution.outcome,rationale:d.resolution.rationale,recorded_at:d.recorded_at,
    company_run_id:d.resolution.company_run_id??null};
}

export function recordMentionReview({stateRoot,reviewFile,now=new Date(),mentions=companyMentions({now})}) {
  const root=privateState(stateRoot),r=validateReview(read(privateFile(reviewFile,root)),{stateRoot:root,mentions,now});
  const id=identity(r),dir=privateState(path.join(root,'mention-decisions')),file=path.join(dir,id+'.json');
  const release=acquireLock(root,'mention-decisions.lock');if(!release)return{status:'busy'};
  try {
    if(fs.existsSync(file)) {
      const old=read(file);assert.deepEqual(old.review,r,'existing source decision cannot be overwritten');
      return{status:'already_recorded',id};
    }
    atomicJson(file,{schema_version:1,id,recorded_at:now.toISOString(),review:r,
      interpretation:'Source-specific agent review, backed by retained body bytes. Semantic conclusions are recorded judgments, not automatic truth checks. No outreach, publication, revenue or native-run credit.'});
    return{status:'recorded',id,decision:r.decision,formal_gain_claimed:false};
  } finally {release();}
}

export function mentionDecisions({stateRoot,mentions,now=new Date()}) {
  const dir=path.join(stateRoot,'mention-decisions'),reviews=[],failures=[];
  if(!fs.existsSync(dir) || mentions.status!=='ready')return{reviews,failures};
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))) {
    try {
      const d=decisionRecord(path.join(dir,file),{stateRoot,mentions,now});
      if(!d)continue; // Historical evidence is retained, not applied to a new watch.
      let resolution=null;
      const resolved=path.join(stateRoot,'mention-resolutions',d.id+'.json');
      if(fs.existsSync(resolved)) {
        try {resolution=readResolution(resolved,d,{stateRoot,now});}
        catch {failures.push({file:d.id+'.json',reason:'mention_resolution_evidence_invalid'});}
      }
      reviews.push({id:d.id,...d.review,resolution});
    } catch {failures.push({file,reason:'mention_decision_evidence_invalid'});}
  }
  return{reviews,failures};
}
