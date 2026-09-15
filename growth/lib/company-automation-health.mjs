// Keep historical failures and formal denominators intact. This classification
// controls repeat diagnosis, not incident success or permission to send notices.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {reviewedAutomationAssessment} from './company-automation-diagnoses.mjs';

// Reporting context only. Keep every retained failure and the existing selector
// and recovery verifiers unchanged; a disabled owner is not a repaired owner.
export function failureReportingContext(job) {
  const execution = job.execution_state;
  const category = execution === 'disabled' ? 'disabled_history'
    : ['PAUSED','ended'].includes(execution) ? 'paused_or_ended_history'
    : execution === 'event_or_manual' ? 'event_or_manual_history'
    : ['scheduled','enabled','ACTIVE','loaded','declared_unobserved'].includes(execution) ? 'registered_owner_needs_verification'
    : execution !== 'observed' ? 'unverified_execution_state'
    : job.current_assessment?.needs_diagnosis === false ? 'active_current_disposition'
    : 'active_diagnosis_required';
  return { category, execution_state: execution ?? null,
    existing_selector_diagnosis_candidate: execution === 'observed' && job.current_assessment?.needs_diagnosis !== false,
    interpretation: {
      disabled_history: 'Retained failure of a disabled owner. Do not reactivate or retry it from this report.',
      paused_or_ended_history: 'Retained failure of a paused or ended owner. Do not resume it or call the failure repaired.',
      event_or_manual_history: 'Retained event/manual failure. Inspect the original owner and permission gate; no automatic redispatch.',
      registered_owner_needs_verification: 'Owner configuration is recorded; inspect its actual execution and original failure. The existing selector does not automatically admit this runtime state. This is not healthy or resolved.',
      unverified_execution_state: 'Current execution is unverified. This is not a healthy or resolved classification.',
      active_current_disposition: 'Existing current-state evidence suppresses repeat diagnosis only; historical failure and limitations remain.',
      active_diagnosis_required: 'The existing selector admits diagnosis. Diagnosis is not permission to retry side effects or claim recovery.',
    }[category] };
}

export function failureReportingSummary(jobs) {
  const counts = {active_diagnosis_required:0,active_current_disposition:0,disabled_history:0,paused_or_ended_history:0,event_or_manual_history:0,registered_owner_needs_verification:0,unverified_execution_state:0};
  for (const job of jobs) counts[failureReportingContext(job).category]++;
  return {version:'company-failure-context-v1',retained_failure_states:jobs.length,counts,
    scope:'All retained failure-state rows, not all automations or a formal autonomy metric. No failure is removed or declared recovered.'};
}

export function reportFailure(job) {
  return {id:job.id,health:job.health,current_assessment:job.current_assessment,
    ...(job.diagnostic_input?{diagnostic_input:job.diagnostic_input}:{}),
    reporting_context:failureReportingContext(job)};
}

// A fresh receipt establishes the current failure identity, not its recovery.
export function currentCronEvidence(job,now,stateRoot) {
  const e=job.current_observation;
  if(e?.schema_version!==1 || e.source!=='discovery/cloudflare-cron-health.json' ||
      !/^[a-f0-9]{64}$/.test(e.raw_sha256??'') || e.latest_results?.length!==1)throw Error('current cron evidence unavailable');
  const files=[path.join(stateRoot,e.source),path.join(stateRoot,'discovery/cloudflare-cron-health-meta.json')];
  const root=fs.realpathSync(stateRoot);
  for(const file of files) {
    const s=fs.lstatSync(file);
    if(!s.isFile() || s.uid!==process.getuid() || (s.mode&0o077) || !fs.realpathSync(file).startsWith(root+path.sep))throw Error('private cron evidence required');
  }
  const bytes=fs.readFileSync(files[0]),raw=JSON.parse(bytes),meta=JSON.parse(fs.readFileSync(files[1]));
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(hash!==e.raw_sha256 || meta.raw_sha256!==hash || meta.current_run_evidence_version!==1 ||
      meta.profile!=='observe' || meta.method!=='fixed aggregate SELECT' || meta.scope_days!==30 ||
      meta.observed_at!==e.observed_at || raw.length!==1 || raw[0].success!==true || !Array.isArray(raw[0].results))throw Error('cron receipt mismatch');
  const rows=raw[0].results.filter(r=>'cloudflare:simplememo-api:'+r.job_name===job.id);
  const latest=rows.map(r=>({cron_expression:r.cron_expression,started_at_ms:r.last_run,finished_at_ms:r.latest_finished,
    errors:r.latest_errors,thrown:r.latest_thrown,eligible:r.latest_eligible,sent:r.latest_sent,reason:r.latest_reason}));
  if(!isDeepStrictEqual(latest,e.latest_results) || rows.length!==1 || rows[0].last_failure!==e.latest_failure_ms ||
      rows[0].last_no_error!==e.latest_no_error_ms || rows[0].failures!==job.health?.failures_30d || rows[0].runs!==job.health?.runs_30d)throw Error('cron projection mismatch');
  const at=Date.parse(e.observed_at),r=e.latest_results[0],n=now.getTime();
  if([at,r.started_at_ms,r.finished_at_ms,e.latest_failure_ms,e.latest_no_error_ms].some(x=>!Number.isSafeInteger(x)||x<0) ||
      at>n || n-at>2*3600000 || n-r.finished_at_ms>2*3600000 || r.started_at_ms>r.finished_at_ms || r.finished_at_ms>at ||
      e.latest_failure_ms>r.finished_at_ms || e.latest_no_error_ms>r.finished_at_ms || Date.parse(job.last_failure?.at)!==e.latest_failure_ms)throw Error('stale or inconsistent cron evidence');
  return e;
}

export function currentAutomationAssessment(job,now=new Date(),stateRoot) {
  const required=reason=>({state:'diagnosis_required',needs_diagnosis:true,reason});
  if(job.id==='cloudflare:simplememo-api:vfu_regular')return reviewedAutomationAssessment(job,now,stateRoot);
  if(job.id!=='cloudflare:simplememo-api:service_notice_monitor')return required('no_source_specific_recovery_verifier');
  try {
  const e=job.current_observation;
  if(e?.schema_version!==1 || e.source!=='discovery/cloudflare-cron-health.json' ||
      !/^[a-f0-9]{64}$/.test(e.raw_sha256??'') || e.latest_results?.length!==1)return required('current_monitor_evidence_unavailable');
  const rawFile=path.join(stateRoot,e.source),metaFile=path.join(stateRoot,'discovery/cloudflare-cron-health-meta.json');
  for(const file of [rawFile,metaFile]) {
    const s=fs.lstatSync(file);
    if(!s.isFile() || s.uid!==process.getuid() || (s.mode&0o077))return required('current_monitor_evidence_not_private');
  }
  const bytes=fs.readFileSync(rawFile),raw=JSON.parse(bytes),meta=JSON.parse(fs.readFileSync(metaFile));
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(hash!==e.raw_sha256 || meta.raw_sha256!==hash || meta.current_run_evidence_version!==1 ||
      meta.profile!=='observe' || meta.method!=='fixed aggregate SELECT' || meta.scope_days!==30 ||
      meta.observed_at!==e.observed_at || raw.length!==1 || raw[0].success!==true || !Array.isArray(raw[0].results))return required('current_monitor_receipt_mismatch');
  const rows=raw[0].results.filter(r=>r.job_name==='service_notice_monitor');
  const latest=rows.map(r=>({cron_expression:r.cron_expression,started_at_ms:r.last_run,finished_at_ms:r.latest_finished,
    errors:r.latest_errors,thrown:r.latest_thrown,eligible:r.latest_eligible,sent:r.latest_sent,reason:r.latest_reason}));
  if(!isDeepStrictEqual(latest,e.latest_results) || rows.length!==1 || rows[0].last_failure!==e.latest_failure_ms ||
      rows[0].last_no_error!==e.latest_no_error_ms)return required('current_monitor_projection_mismatch');
  const at=Date.parse(e.observed_at),r=e.latest_results[0],nowMs=now.getTime();
  const instants=[at,r.started_at_ms,r.finished_at_ms,e.latest_failure_ms,e.latest_no_error_ms];
  if(instants.some(x=>!Number.isSafeInteger(x) || x<0) ||
      at>nowMs || nowMs-at>2*3600000 || nowMs-r.finished_at_ms>2*3600000 ||
      r.started_at_ms>r.finished_at_ms || r.finished_at_ms>at ||
      e.latest_failure_ms>=r.started_at_ms || e.latest_no_error_ms!==r.finished_at_ms ||
      Date.parse(job.last_failure?.at)!==e.latest_failure_ms)return required('stale_or_inconsistent_monitor_evidence');
  if(r.cron_expression!=='0 * * * *' || r.errors!==0 || r.thrown!==0 || r.eligible!==0 || r.sent!==0 ||
      r.reason!=='service_notice_inactive')return required('monitor_not_verified_inactive');
  return {state:'verified_inactive_monitor',needs_diagnosis:false,verified_at:new Date(r.finished_at_ms).toISOString(),
    evidence_sha256:e.raw_sha256,historical_failures_retained:job.health?.failures_30d??null,
    reason:'The original monitor completed its public response/configuration checks after the recorded failure and found no active notice.',
    limitation:'No attributed repair, incident response, customer delivery or formal score credit. Active, failed, stale, unknown or other-job results retain diagnosis.'};
  } catch {return required('current_monitor_evidence_invalid');}
}
