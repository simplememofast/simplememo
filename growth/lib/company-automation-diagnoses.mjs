import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {privateState,atomicJson,acquireLock} from './company-loop.mjs';
import {currentCronEvidence} from './company-automation-health.mjs';

const JOB='cloudflare:simplememo-api:vfu_regular';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const identity=r=>hash(JSON.stringify([r.job_id,r.failure_finished_at_ms,r.investigation?.sha256]));
function readPrivate(file,root) {
  const resolved=path.resolve(root,file),stat=fs.lstatSync(resolved);
  assert(stat.isFile() && stat.uid===process.getuid() && !(stat.mode&0o077) &&
    fs.realpathSync(resolved).startsWith(fs.realpathSync(root)+path.sep),'private diagnosis evidence required');
  const bytes=fs.readFileSync(resolved);assert(bytes.length>0 && bytes.length<=2*1024*1024,'bounded diagnosis evidence required');
  return {value:JSON.parse(bytes),sha256:hash(bytes)};
}
function text(value) {assert(typeof value==='string' && value.trim().length>=20,'concrete diagnosis and next condition required');}
function registry(root) {
  const d=readPrivate('failure-classifications.json',root).value;
  assert.equal(d.schema_version,1);assert(Array.isArray(d.reviews),'canonical failure reviews required');
  const matches=d.reviews.filter(r=>r.id===JOB);assert.equal(matches.length,1,'one existing canonical job review required');
  assert(typeof matches[0].classification==='string','existing classification required');
  return {document:d,review:matches[0]};
}
function validateReview(r,job,now,root) {
  assert.equal(r.schema_version,1);assert.equal(r.job_id,JOB);assert.equal(job.id,JOB);
  const e=currentCronEvidence(job,now,root),latest=e.latest_results[0];
  assert.equal(r.failure_finished_at_ms,e.latest_failure_ms,'new failure requires diagnosis');
  assert.equal(latest.cron_expression,'0 * * * *','original hourly owner required');
  // Unknown/in-progress/error results cannot be hidden by an earlier review.
  assert.equal(latest.errors,0);assert.equal(latest.thrown,0);
  assert.equal(latest.eligible,0);assert.equal(latest.sent,0);
  assert.equal(latest.reason,'daily_cap_reached');
  assert(e.latest_failure_ms<latest.started_at_ms && e.latest_no_error_ms===latest.finished_at_ms,'completed later owner observation required');
  assert.equal(r.decision,'reviewed_no_safe_action');text(r.rationale);text(r.next_condition);
  const reviewed=Date.parse(r.reviewed_at),until=Date.parse(r.review_after),n=now.getTime();
  assert(Number.isSafeInteger(reviewed) && reviewed>=e.latest_failure_ms && reviewed<=n &&
    Number.isSafeInteger(until) && until>reviewed && until<=reviewed+24*3600000 && n<until,'diagnosis expired or invalid review time');
  const proof=readPrivate(r.investigation?.path,root);
  assert.equal(proof.sha256,r.investigation.sha256,'investigation bytes changed');
  const p=proof.value,checked=Date.parse(p.checked_at);
  assert.equal(p.schema_version,1);assert.equal(p.job_id,JOB);assert.equal(p.failure_finished_at_ms,e.latest_failure_ms);
  assert(Number.isSafeInteger(checked) && checked>=e.latest_failure_ms && checked<=reviewed,'investigation time mismatch');
  assert(Array.isArray(p.findings) && p.findings.length>0 && p.findings.length<=20,'inspected findings required');p.findings.forEach(text);
  assert(Array.isArray(p.sources) && p.sources.length>0 && p.sources.length<=10,'retained investigation sources required');
  for(const source of p.sources)assert.equal(readPrivate(source.path,root).sha256,source.sha256,'investigation source changed');
  assert.equal(p.no_send_or_cron_trigger,true,'diagnosis must not replay the owner');
  assert.equal(p.disposition,'no_safe_action');
  return {e,checked};
}
function validateRecord(d,job,now,root,previous) {
  assert.equal(d.schema_version,1);assert.equal(d.id,identity(d.review));assert.equal(d.review_sha256,hash(JSON.stringify(d.review)));
  const at=Date.parse(d.recorded_at);assert(Number.isSafeInteger(at) && at>=Date.parse(d.review.reviewed_at) && at<=now.getTime(),'invalid diagnosis record time');
  const {e,checked}=validateReview(d.review,job,now,root);
  if(previous)assert(checked>=Date.parse(previous.recorded_at),'new investigation must follow the last recorded diagnosis');
  return e;
}

export function reviewedAutomationAssessment(job,now,stateRoot) {
  try {
    const {review}=registry(stateRoot),decisions=review.decisions??[];
    assert(Array.isArray(decisions),'invalid canonical diagnosis history');
    const matches=decisions.filter(d=>d.review?.failure_finished_at_ms===job.current_observation?.latest_failure_ms);
    if(matches.length===0)return {state:'diagnosis_required',needs_diagnosis:true,reason:'no_review_for_current_failure'};
    assert.equal(new Set(matches.map(d=>d.id)).size,matches.length,'duplicate diagnosis identity');
    const d=matches.at(-1),index=decisions.indexOf(d),e=validateRecord(d,job,now,stateRoot,decisions[index-1]);
    return {state:'reviewed_no_safe_action',needs_diagnosis:false,decision_id:d.id,reviewed_at:d.review.reviewed_at,
      review_after:d.review.review_after,failure_finished_at_ms:e.latest_failure_ms,evidence_sha256:d.review.investigation.sha256,
      historical_failures_retained:job.health.failures_30d,reason:d.review.rationale,next_condition:d.review.next_condition,
      limitation:'Agent-reported disposition of this exact inspected failure, not independent cause verification, recovery, successful delivery, formal score credit or permission to send. New failure, changed owner result, expired review or invalid evidence reopens diagnosis.'};
  } catch {return {state:'diagnosis_required',needs_diagnosis:true,reason:'review_missing_expired_or_evidence_invalid'};}
}

export function recordAutomationDiagnosis({stateRoot,evidenceFile,now=new Date()}) {
  const root=privateState(stateRoot),r=readPrivate(evidenceFile,root).value;
  const release=acquireLock(root,'failure-classifications.lock');if(!release)return {status:'busy'};
  try {
    const {document,review}=registry(root),jobs=readPrivate('automation-registry.json',root).value.jobs;
    const matches=jobs.filter(j=>j.id===JOB);assert.equal(matches.length,1,'one current job required');const job=matches[0];
    validateReview(r,job,now,root);const id=identity(r);
    assert(review.decisions===undefined || Array.isArray(review.decisions),'invalid diagnosis history');
    const old=(review.decisions??[]).filter(d=>d.id===id);assert(old.length<=1,'duplicate diagnosis identity');
    if(old.length) {
      assert.deepEqual(old[0].review,r,'existing diagnosis cannot be overwritten or extended');
      const index=review.decisions.indexOf(old[0]);
      validateRecord(old[0],job,now,root,review.decisions[index-1]);return {status:'already_recorded',decision_id:id};
    }
    const previous=(review.decisions??[]).at(-1);
    if(previous)assert(Date.parse(r.reviewed_at)>=Date.parse(previous.recorded_at),'new investigation must follow the last recorded diagnosis');
    const record={schema_version:1,id,recorded_at:now.toISOString(),review_sha256:hash(JSON.stringify(r)),review:r};
    validateRecord(record,job,now,root,previous);
    review.decisions=[...(review.decisions??[]),record];document.updated_at=now.toISOString();
    atomicJson(path.join(root,'failure-classifications.json'),document);
    return {status:'recorded',decision_id:id,assessment:reviewedAutomationAssessment(job,now,root)};
  } finally {release();}
}
