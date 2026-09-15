import {currentCronEvidence} from './company-automation-health.mjs';

const JOB='cloudflare:simplememo-api:vfu_regular';
const DISPATCH=new Set(['token_lost','kv_unavailable','not_configured','suppressed','resend_failed','exception','unknown']);
// Existing API331 diagnostic vocabulary; never pass provider body/error text.
const PROVIDER=new Set(['recipient_invalid','authentication','access_restricted','sender_invalid','request_invalid',
  'quota_exceeded','rate_limited','provider_error','security_restricted','unclassified']);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const requireValue=value=>{if(!value)throw Error('Invalid diagnostic evidence');};
const sum=counts=>Object.values(counts).reduce((a,b)=>a+b,0);

function counts(text,allowed) {
  const entries=text.split(','),result=new Map();
  requireValue(entries.length>0&&entries.length<=allowed.size);
  for(const entry of entries) {
    const parts=entry.split('=');
    requireValue(parts.length===2&&allowed.has(parts[0])&&!result.has(parts[0])&&/^[1-9]\d{0,15}$/.test(parts[1]));
    const value=Number(parts[1]);requireValue(integer(value));result.set(parts[0],value);
  }
  const out=Object.fromEntries([...result.keys()].sort().map(key=>[key,result.get(key)]));
  requireValue(integer(sum(out)));return out;
}

export function currentCronDiagnosticInput(job,now=new Date(),stateRoot) {
  if(job.id!==JOB)return null;
  try {
    const e=currentCronEvidence(job,now,stateRoot),r=e.latest_results[0];
    requireValue(r.cron_expression==='0 * * * *'&&r.thrown===0&&
      [r.errors,r.eligible,r.sent].every(integer)&&integer(r.errors+r.sent)&&r.errors+r.sent<=r.eligible);
    const source={path:e.source,sha256:e.raw_sha256,observed_at:e.observed_at,
      started_at_ms:r.started_at_ms,finished_at_ms:r.finished_at_ms,errors:r.errors,eligible:r.eligible,sent:r.sent};
    if(r.errors===0) {
      requireValue(e.latest_no_error_ms===r.finished_at_ms);
      return {schema_version:1,state:'no_current_dispatch_failure',source};
    }
    requireValue(e.latest_failure_ms===r.finished_at_ms&&e.latest_no_error_ms<r.started_at_ms&&
      typeof r.reason==='string'&&r.reason.length<=2048);
    const pieces=r.reason.split(';');
    requireValue(pieces.length<=2&&pieces[0].startsWith('dispatch_errors:'));
    const dispatch_counts=counts(pieces[0].slice('dispatch_errors:'.length),DISPATCH);
    requireValue(sum(dispatch_counts)===r.errors);
    let provider_counts=null;
    if(pieces.length===2) {
      requireValue(pieces[1].startsWith('provider_failures:')&&(dispatch_counts.resend_failed??0)>0);
      provider_counts=counts(pieces[1].slice('provider_failures:'.length),PROVIDER);
      requireValue(sum(provider_counts)===dispatch_counts.resend_failed);
    } else if(!dispatch_counts.resend_failed)provider_counts={};
    return {schema_version:1,state:'verified_failure_causes',source,dispatch_counts,provider_counts,
      provider_coverage:provider_counts===null?'not_reported':dispatch_counts.resend_failed?'reported_classification':'not_applicable',
      interpretation:'Original owner diagnostic counts, not recovery, delivery success or permission to retry. Preserve recipient, suppression and original unsubscribe-token identity. Inspect the current cause before selecting any safe repair.'};
  } catch {
    return {schema_version:1,state:'unavailable',reason:'current_vfu_diagnostic_evidence_unavailable'};
  }
}

// A new original run/hash/timestamp is not itself a new diagnosis or notice.
export function cronDiagnosticMaterial(input) {
  return input?{state:input.state,dispatch_counts:input.dispatch_counts??null,
    provider_counts:input.provider_counts??null,provider_coverage:input.provider_coverage??null}:null;
}
