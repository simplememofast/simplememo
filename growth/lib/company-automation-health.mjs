// Keep historical failures and formal denominators intact. This classification
// controls repeat diagnosis, not incident success or permission to send notices.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export function currentAutomationAssessment(job,now=new Date(),stateRoot) {
  const required=reason=>({state:'diagnosis_required',needs_diagnosis:true,reason});
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
