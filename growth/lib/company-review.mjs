import fs from 'node:fs';
import {cronDiagnosticMaterial} from './company-cron-diagnostics.mjs';
import {nativeResourceStatus} from './company-resource-usage.mjs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, digest, compareMetrics } from './company-metrics.mjs';
import { privateState, atomicJson, cadenceKey, opportunities } from './company-loop.mjs';
import {compactMentions} from './company-mentions.mjs';
import {compactCtaMeasurement} from './company-cta-measurement.mjs';
import {bingReport} from './company-bing.mjs';
import {reportFailure,failureReportingSummary} from './company-automation-health.mjs';
import {businessStatus,recordBusinessWeek} from './business-automation.mjs';
import {privateWeeklyChart} from '../../scripts/business-automation.mjs';
import {humanBurdenStatus} from './company-observability.mjs';
import {loadBusinessWorkPlan} from './business-work-plan.mjs';
import {outcomeStatus} from '../../scripts/autonomy-outcome-score.mjs';

const percent = v => Number.isFinite(v) ? (100 * v).toFixed(2) + '%' : 'unknown';
const value = (m, v) => m.id === 'autonomy_score' && Number.isFinite(v) ? v.toFixed(3) + '/100' : percent(v);

export function summarizeGa4(reports) {
  if(!Array.isArray(reports)) return null;
  const funnel=reports.find(r=>r.file==='ga4-funnel.sql')?.result;
  const quality=reports.find(r=>r.file==='ga4-quality.sql')?.result;
  const sum=(rows,key)=>{
    if(!rows.length || rows.some(r=>r[key]===null || r[key]===undefined || (typeof r[key]==='string' && !/^\d+$/.test(r[key])) || !['number','string'].includes(typeof r[key]) || !Number.isSafeInteger(Number(r[key])) || Number(r[key])<0)) return null;
    const n=rows.reduce((a,r)=>a+Number(r[key]),0);return Number.isSafeInteger(n)?n:null;
  };
  const grouped=(rows,dimensions,counts)=>{
    if(!Array.isArray(rows))return null;
    const groups=new Map();
    for(const row of rows){const key=JSON.stringify(dimensions.map(k=>row[k]??null));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    return [...groups.values()].map(group=>Object.fromEntries([...dimensions.map(k=>[k,group[0][k]??null]),...counts.map(k=>[k,sum(group,k)])]));
  };
  const counts=['observed_started_sessions','sessions_with_cta_impression','sessions_with_own_app_click_24h','sessions_with_onelink_click_24h','sessions_with_any_app_route_click_24h','sessions_with_onelink_qa_click_24h'];
  const byChannel=grouped(funnel,['landing_scope','session_channel'],counts);
  for(const g of byChannel??[])g.own_app_click_session_rate_24h=g.observed_started_sessions>0 && g.sessions_with_own_app_click_24h!==null?g.sessions_with_own_app_click_24h/g.observed_started_sessions:null;
  const qualityFields=['recorded_events','events_without_session_key','analytics_storage_denied_events','missing_session_channel_events','cta_version_missing_or_other','click_target_invalid_or_missing','cta_dimensions_incomplete','onelink_version_missing_or_other','onelink_target_invalid_or_missing','onelink_dimensions_incomplete','onelink_qa_scope_mismatch'];
  return {funnel_source_rows:Array.isArray(funnel)?funnel.length:null,by_landing_scope_and_session_channel:byChannel,
    quality_source_rows:Array.isArray(quality)?quality.length:null,quality_by_hostname_scope:grouped(quality,['hostname_scope'],qualityFields),
    quality_observed_event_dates:Array.isArray(quality)?[...new Set(quality.map(r=>r.event_date).filter(d=>typeof d==='string' && /^\d{8}$/.test(d)))].sort():null,
    quality_rows_without_valid_date:Array.isArray(quality)?quality.filter(r=>typeof r.event_date!=='string' || !/^\d{8}$/.test(r.event_date)).length:null,
    quality_period_note:'Quality counts describe observed event dates, including the day after the funnel cohort ends. They are not cohort-session counts; absent event dates do not prove zero events.',
    interpretation:'Disjoint session groups from the existing fixed query. Production and missing/nonproduction landings remain separate. Direct and OneLink overlap; use the existing union column. QA clicks are separate. Rates use summed counts, never mean row rates. Not GA4 UI parity or installs/revenue. Missing counts remain null.',
    detail:'Use growth-status --full or private data/connections.json for landing/source/medium rows and source windows.'};
}

export function compactGrowth(o) {
  const connections = o.growth.connections ?? {};
  const asc = connections.app_store_connect;
  return { search: o.growth.search, aio: o.growth.aio, bing:o.growth.bing, decision_trace:o.growth.decision_trace, measurements:o.growth.measurements, mentions:compactMentions(o.growth.mentions),
    connections: Object.fromEntries(Object.entries(connections).filter(([,v]) => v?.status).map(([k,v]) => [k, { status: v.status,
      observed_at: v.observed_at ?? v.collection?.verified_at ?? v.collection?.observed_at ?? null,
      window: v.window ?? null, evidence: v.evidence ?? null, reason: v.reason ?? null }])),
    acquisition: connections.appsflyer ? { population: connections.appsflyer.population,
      metrics: connections.appsflyer.quality?.additive_metrics, caveats: connections.appsflyer.quality?.notes } : null,
    ga4: summarizeGa4(connections.ga4?.reports),
    cta_measurement: compactCtaMeasurement(o.growth.cta_measurement),
    revenue: asc?.revenue ? Object.fromEntries(Object.entries(asc.revenue.granularities).map(([k,v]) => [k,
      { current: v.current ? { from: v.current.from, to: v.current.to, state: v.current.state, totals: v.current.totals } : null,
        previous: v.previous ? { from: v.previous.from, to: v.previous.to, state: v.previous.state, totals: v.previous.totals } : null }])) : null,
    experiments: o.growth.experiments?.filter(e => e.status === 'RUNNING' || e.due).map(e=>({id:e.id,status:e.status,legacy_status:e.legacy_status,decision:e.decision,due:e.due,evaluation_date:e.evaluation_date,primary_kpi:e.primary_kpi,affected_area:e.affected_area})),
    top_opportunities: opportunities(o).slice(0, 5), pipeline_failures: o.failures,
    private_detail: 'data/connections.json and growth-status.json in the private company-os directory' };
}

export function saveReview(o, { stateRoot, cadence = 'daily', now = new Date() }) {
  const dir = privateState(path.join(stateRoot, 'reviews'));
  const key = cadenceKey(cadence, now), file = path.join(dir, cadence + '-' + key + '.json');
  const baseline = JSON.parse(fs.readFileSync(path.join(stateRoot, 'metrics-baseline.json')));
  const comparison = compareMetrics(baseline, o.formal_metrics);
  const payload = { growth: compactGrowth(o), comparison, human_touches: o.human_touches,
    native_resource_usage:nativeResourceStatus({stateRoot,now}),
    failures: o.automation.failures.map(reportFailure), failure_summary:failureReportingSummary(o.automation.failures),
    discovery_gaps: o.automation.discovery_gaps, next: opportunities(o)[0] ?? null };
  payload.business_automation=businessStatus({stateRoot,now});
  payload.human_work=humanBurdenStatus({stateRoot,now});
  payload.business_work_plan=loadBusinessWorkPlan({now});
  payload.outcome_autonomy=outcomeStatus({file:path.join(stateRoot,'data/autonomy-outcome-evaluations.json'),asOf:payload.business_automation.as_of});
  if(cadence==='weekly') {
    try {
      payload.business_weekly=recordBusinessWeek({stateRoot,now});
      const history=JSON.parse(fs.readFileSync(path.join(stateRoot,'business-automation/weekly.json')));
      fs.writeFileSync(path.join(stateRoot,'business-automation/weekly.svg'),privateWeeklyChart(history),{mode:0o600});
    } catch {payload.business_weekly={state:'UNAVAILABLE',sustained_above_target:false};}
  }
  // Timestamps do not make unchanged evidence a new notification.
  const aio = structuredClone(payload.growth.aio);
  if (aio?.decision_input) delete aio.decision_input.checked_at;
  const material = { metrics: comparison.metrics, failure_ids: payload.failures.map(j => [j.id,j.health.state]),
    business_automation:{inventory:payload.business_automation.inventory,actual:payload.business_automation.actual},
    fixed_business_goal:payload.business_automation.current_goal,
    business_target_sustained:payload.business_weekly?.sustained_above_target??false,
    human_work:payload.human_work,
    business_work_plan:payload.business_work_plan,
    outcome_autonomy:payload.outcome_autonomy,
    native_resource_health:payload.native_resource_usage.status,
    diagnosis_dispositions:payload.failures.map(j=>[j.id,j.current_assessment?.state,j.current_assessment?.needs_diagnosis,j.current_assessment?.decision_id]),
    diagnostic_causes:payload.failures.map(j=>[j.id,cronDiagnosticMaterial(j.diagnostic_input)]),
    failure_execution_context:payload.failures.map(j=>[j.id,j.reporting_context.execution_state,j.reporting_context.category]),
    next: payload.next?.id, search: payload.growth.search, aio, bing:payload.growth.bing,
    cta_measurement: payload.growth.cta_measurement,
    decision_trace: payload.growth.decision_trace,
    measurements: payload.growth.measurements,
    mentions:payload.growth.mentions?{status:payload.growth.mentions.status,sha256:payload.growth.mentions.evidence?.sha256,decisions:payload.growth.mentions.decisions}:null,
    experiments: payload.growth.experiments?.map(e => [e.id,e.status,e.decision,e.due]),
    connections: Object.entries(payload.growth.connections).map(([k,v]) => [k,v.status,v.window]) };
  const fingerprint = digest(material);
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
  const changed = previous?.fingerprint !== fingerprint;
  const lines = [`# ${cadence} Growth + Autonomy Review — ${key}`, '',
    'Private operating report. Source periods and populations remain separate.', '',
    '| Metric | Baseline | Current | Delta |', '|---|---:|---:|---:|'];
  for (const m of comparison.metrics) lines.push(`| ${m.id} | ${value(m,m.previous)} | ${value(m,m.current)} | ${m.comparable ? value(m,m.delta) : 'not comparable'} |`);
  const business=payload.business_automation, current=business.inventory.overall, actual=business.actual;
  lines.push('', '## YURIKA + SimpleMemo business automation', '',
    `Registered inventory: AI execution ${percent(current.declared_execution_rate)}; AI utilization ${percent(current.declared_ai_utilization_rate)}. These are classifications, not runtime proof. Inventory measured_at: ${business.inventory.inventory_measured_at}.`,
    `Actual 28-day observations: full automation ${percent(actual.verified_full_automation_rate)}; AI utilization ${percent(actual.verified_ai_utilization_rate)}; observed work saved ${percent(actual.observed_work_saved_rate)}. State: ${actual.state}; unmeasured tasks: ${actual.unknown_tasks}/${actual.defined_tasks}.`,
    `Corporate scope: ${actual.scope_completeness}. Current goal: at least 93% over four consecutive windows on the fixed 192 tasks and same 11 exclusions. Required full tasks: ${business.current_goal.minimum_automated_tasks}; fixed scope matches: ${business.current_goal.scope.matches_target_scope}; goal state: ${business.current_goal.state}; sustained: ${payload.business_weekly?.sustained_above_target===true?'verified from reviewed observations':'unverified'}. Policy: ${business.current_goal.policy_id}; observations before ${business.current_goal.effective_at} or without this policy identity do not earn new-goal credit. Windows overlap; this is persistence, not four independent trials.`,
    `Weekly graph status: ${payload.business_weekly?.state ?? (cadence==='weekly'?'recorded':'not_requested')}.`,
    `Runtime measurement: ${payload.business_weekly?.new_runtime_measurement===true?'new source observation':'no new admitted source observation'}. Prior same-week observation retained: ${payload.business_weekly?.retained_prior_measurement===true}. Current read remains separate from retained history.`,
    `Admitted-row diagnostics: ${actual.diagnostics.observed_tasks} observed tasks; ${actual.diagnostics.failed_tasks} with failures; ${actual.diagnostics.safety_failed_tasks} with safety failure; ${actual.diagnostics.human_intervened_tasks} with human intervention; ${actual.diagnostics.not_due_tasks} not due. Missing stages: ${JSON.stringify(actual.diagnostics.unknown_stage_tasks)}. These counts do not prove exhaustive failure or human-activity coverage.`,
    `Measured human-work subtotal on ${actual.burden.measured_tasks} tasks: baseline ${actual.burden.baseline_minutes_subtotal??'unknown'} minutes; actual ${actual.burden.actual_minutes_subtotal??'unknown'} minutes; actual minus baseline ${actual.burden.observed_minutes_delta??'unknown'} minutes; work increased ${actual.burden.observed_work_increased??'unknown'}. All-task actual minutes: ${actual.burden.actual_minutes_total??'unknown'}.`,
    `Observed exclusive task/window cost subtotal on ${actual.cost.measured_tasks} tasks: USD ${actual.cost.usd_subtotal??'unknown'}; JPY ${actual.cost.jpy_subtotal??'unknown'}. All-task USD ${actual.cost.usd_total??'unknown'}; JPY ${actual.cost.jpy_total??'unknown'}. No estimated price, conversion or shared-invoice duplication.`,
    'Do not raise rates by deleting human work, reclassifying readiness as runtime completion or bypassing approvals. Select the next actual human-work transfer by existing business-value and permission gates. Retain the weekly graph in business-automation/weekly.svg; never publish raw private observations.');
  const work=payload.human_work,plan=payload.business_work_plan,outcome=payload.outcome_autonomy;
  lines.push('',`Positive human-work events: ${work.reported_events} reported; ${work.measured_events} measured; ${work.unmeasured_events} untimed; ${work.invalid_events} invalid; measured positive subtotal ${work.measured_positive_minutes??'unknown'} minutes. Complete company effort remains unknown. Approval/verification effort stays in the by_kind/by_stage private aggregate.`,
    `Supplemental outcome autonomy: ${outcome.total??'unknown'}/100; ${outcome.state}. Goal, solution, verified outcome and observed work saved remain auxiliary; missing review or real time evidence earns no overall score.`,
    `Existing work plan: ${plan.inventory.nonexecution} nonexecution tasks retained, ${plan.scope_reviews.length} corporate scope candidates awaiting overlap and boundary review. Observed value/time comparison: ${plan.comparison.state}; this checklist grants no execution permission.`,
    ...plan.improvement_checklists.map(c=>`- ${c.id}: ${c.aim}. Evidence gaps: ${c.evidence_gaps.join('; ')}. Approval boundary: ${c.approval_gaps.join('; ')}.`));
  lines.push('', 'Human work transferred on the fixed baseline cohort: ' + comparison.existing_human_tasks_transferred.length,
    'Recorded manual starts: ' + o.human_touches.manual_starts + '; unobserved historical handoffs remain unknown.', '',
    '## Growth inputs', '', ...Object.entries(payload.growth.connections).map(([k,v]) => `- ${k}: ${v.status}; ${v.window ? v.window.start + '..' + v.window.end : 'see source period'}; ${v.reason ?? v.evidence ?? 'unknown evidence'}`), '',
    '## Decision and follow-up', '',
    `CTA measurement: ${payload.growth.cta_measurement?.status ?? 'unavailable'}. Retained landing-session observations can prepare a future baseline only after scope/quality review; they cannot repair historical CTA/QR baselines or prove installs.`, '',
    `Mention watch: ${payload.growth.mentions?.status ?? 'unavailable'}; ${payload.growth.mentions?.evidence?.date ?? 'no admitted source'}. Search snippets are not confirmed absence; inspect linked source evidence before selecting an action.`, '',
    payload.next ? `Next candidate: ${payload.next.title}. Growth ${payload.next.growth_opportunity_score.toFixed(1)} / Autonomy opportunity ${payload.next.autonomy_opportunity_score.toFixed(1)}. Native owner must apply existing selection/permission gates and execute the selected safe action in this run.` : 'No currently evidenced executable candidate.',
    'A report is not action completion. Read latest-run.json for EXECUTE / VERIFY and proof.',
    `Decision continuity: ${(payload.growth.decision_trace?.runs??[]).filter(r=>r.state==='verified').length} recorded verified traces; ${(payload.growth.decision_trace?.runs??[]).filter(r=>r.state!=='verified').length} deliveries without valid prospective trace. Original shipments and formal metrics are unchanged.`, '',
    ...((payload.growth.experiments ?? []).filter(e => e.due).map(e => `- Due: ${e.id}; existing evidence and maturity gates apply. Missing evidence remains INCONCLUSIVE.`)), '',
    '## Reliability and cost', '',
    `${payload.failures.length} retained failure states: ${payload.failure_summary.counts.active_diagnosis_required} active diagnosis candidates; ${payload.failure_summary.counts.active_current_disposition} with current dispositions; ${payload.failure_summary.counts.disabled_history} disabled-owner history; ${payload.failure_summary.counts.paused_or_ended_history} paused/ended history; ${payload.failure_summary.counts.event_or_manual_history} event/manual history; ${payload.failure_summary.counts.registered_owner_needs_verification} registered owners needing execution verification; ${payload.failure_summary.counts.unverified_execution_state} with unverified execution state. See audit.json for each original failure and its current evidence.`,
    'These categories do not erase failures, prove recovery or authorize retries, reactivation or publication. Formal metrics retain their original definitions and records.',
    ...payload.failures.filter(j=>j.diagnostic_input).map(j=>`Current diagnostic input — ${j.id}: ${JSON.stringify(cronDiagnosticMaterial(j.diagnostic_input))}. Source receipt and original run identity are retained in the private JSON review.`),
    'API monetary cost and Codex monetary cost remain null unless observed. Analytics receipts retain actual billed bytes and a 2 GiB per-run cap. Model budget, one-action gate and 90-minute limit remain unchanged.', '',
    '## Human blockers', '', ...payload.discovery_gaps.map(b => `- ${b.id}: ${b.reason}`));
  if (cadence === 'monthly') lines.push('', '## 30 / 90 day strategy', '',
    'Compare only periods actually covered by the existing source. Ninety-day GA4/BigQuery history is currently insufficient; no invented historical totals or cross-source install/revenue attribution.',
    'Review channel contribution, activation/retention, data coverage, cost per verified output, repeated failure classes and H3–H5 handoffs. Use evidence in data/connections.json and audit.json to select the next action; pricing, release, consent and irreversible changes retain their own approval gates.');
  if(payload.growth.bing)lines.push(...bingReport(payload.growth.bing));
  let legacy = '';
  if (cadence === 'weekly') legacy = execFileSync(process.execPath, ['growth/scripts/weekly-report.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 }) + '\n\n---\n\n';
  const markdown = path.join(dir, cadence + '-' + key + '.md');
  fs.writeFileSync(markdown, legacy + lines.join('\n') + '\n', { mode: 0o600 });
  const receipt = { schema_version: 1, cadence, cadence_key: key, observed_at: now.toISOString(), fingerprint,
    changed, notification: changed ? 'material_change' : 'quiet', markdown, ...payload };
  atomicJson(file, receipt);
  return { cadence, cadence_key: key, changed, notification: receipt.notification, markdown };
}
