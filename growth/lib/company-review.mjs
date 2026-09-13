import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, digest, compareMetrics } from './company-metrics.mjs';
import { privateState, atomicJson, cadenceKey, opportunities } from './company-loop.mjs';

const percent = v => Number.isFinite(v) ? (100 * v).toFixed(2) + '%' : 'unknown';
const value = (m, v) => m.id === 'autonomy_score' && Number.isFinite(v) ? v.toFixed(3) + '/100' : percent(v);

export function compactGrowth(o) {
  const connections = o.growth.connections ?? {};
  const asc = connections.app_store_connect;
  return { search: o.growth.search, aio: o.growth.aio,
    connections: Object.fromEntries(Object.entries(connections).filter(([,v]) => v?.status).map(([k,v]) => [k, { status: v.status,
      observed_at: v.observed_at ?? v.collection?.verified_at ?? v.collection?.observed_at ?? null,
      window: v.window ?? null, evidence: v.evidence ?? null, reason: v.reason ?? null }])),
    acquisition: connections.appsflyer ? { population: connections.appsflyer.population,
      metrics: connections.appsflyer.quality?.additive_metrics, caveats: connections.appsflyer.quality?.notes } : null,
    ga4: connections.ga4?.reports ?? null,
    revenue: asc?.revenue ? Object.fromEntries(Object.entries(asc.revenue.granularities).map(([k,v]) => [k,
      { current: v.current ? { from: v.current.from, to: v.current.to, state: v.current.state, totals: v.current.totals } : null,
        previous: v.previous ? { from: v.previous.from, to: v.previous.to, state: v.previous.state, totals: v.previous.totals } : null }])) : null,
    experiments: o.growth.experiments?.filter(e => e.status === 'RUNNING' || e.due),
    top_opportunities: opportunities(o).slice(0, 5), pipeline_failures: o.failures,
    private_detail: 'data/connections.json and growth-status.json in the private company-os directory' };
}

export function saveReview(o, { stateRoot, cadence = 'daily', now = new Date() }) {
  const dir = privateState(path.join(stateRoot, 'reviews'));
  const key = cadenceKey(cadence, now), file = path.join(dir, cadence + '-' + key + '.json');
  const baseline = JSON.parse(fs.readFileSync(path.join(stateRoot, 'metrics-baseline.json')));
  const comparison = compareMetrics(baseline, o.formal_metrics);
  const payload = { growth: compactGrowth(o), comparison, human_touches: o.human_touches,
    failures: o.automation.failures.map(j => ({ id: j.id, health: j.health })),
    discovery_gaps: o.automation.discovery_gaps, next: opportunities(o)[0] ?? null };
  // Timestamps do not make unchanged evidence a new notification.
  const material = { metrics: comparison.metrics, failure_ids: payload.failures.map(j => [j.id,j.health.state]),
    next: payload.next?.id, search: payload.growth.search, aio: payload.growth.aio,
    experiments: payload.growth.experiments?.map(e => [e.id,e.status,e.decision,e.due]),
    connections: Object.entries(payload.growth.connections).map(([k,v]) => [k,v.status,v.window]) };
  const fingerprint = digest(material);
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
  const changed = previous?.fingerprint !== fingerprint;
  const lines = [`# ${cadence} Growth + Autonomy Review — ${key}`, '',
    'Private operating report. Source periods and populations remain separate.', '',
    '| Metric | Baseline | Current | Delta |', '|---|---:|---:|---:|'];
  for (const m of comparison.metrics) lines.push(`| ${m.id} | ${value(m,m.previous)} | ${value(m,m.current)} | ${m.comparable ? value(m,m.delta) : 'not comparable'} |`);
  lines.push('', 'Human work transferred on the fixed baseline cohort: ' + comparison.existing_human_tasks_transferred.length,
    'Recorded manual starts: ' + o.human_touches.manual_starts + '; unobserved historical handoffs remain unknown.', '',
    '## Growth inputs', '', ...Object.entries(payload.growth.connections).map(([k,v]) => `- ${k}: ${v.status}; ${v.window ? v.window.start + '..' + v.window.end : 'see source period'}; ${v.reason ?? v.evidence ?? 'unknown evidence'}`), '',
    '## Decision and follow-up', '',
    payload.next ? `Next candidate: ${payload.next.title}. Growth ${payload.next.growth_opportunity_score.toFixed(1)} / Autonomy opportunity ${payload.next.autonomy_opportunity_score.toFixed(1)}. Native owner must apply existing selection/permission gates and execute the selected safe action in this run.` : 'No currently evidenced executable candidate.',
    'A report is not action completion. Read latest-run.json for EXECUTE / VERIFY and proof.', '',
    ...((payload.growth.experiments ?? []).filter(e => e.due).map(e => `- Due: ${e.id}; existing evidence and maturity gates apply. Missing evidence remains INCONCLUSIVE.`)), '',
    '## Reliability and cost', '',
    `${payload.failures.length} observed failure states; historical errors need current diagnosis. See audit.json.`,
    'API monetary cost and Codex monetary cost remain null unless observed. Analytics receipts retain actual billed bytes and a 2 GiB per-run cap. Model budget, one-action gate and 90-minute limit remain unchanged.', '',
    '## Human blockers', '', ...payload.discovery_gaps.map(b => `- ${b.id}: ${b.reason}`));
  if (cadence === 'monthly') lines.push('', '## 30 / 90 day strategy', '',
    'Compare only periods actually covered by the existing source. Ninety-day GA4/BigQuery history is currently insufficient; no invented historical totals or cross-source install/revenue attribution.',
    'Review channel contribution, activation/retention, data coverage, cost per verified output, repeated failure classes and H3–H5 handoffs. Use evidence in data/connections.json and audit.json to select the next action; pricing, release, consent and irreversible changes retain their own approval gates.');
  let legacy = '';
  if (cadence === 'weekly') legacy = execFileSync(process.execPath, ['growth/scripts/weekly-report.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 }) + '\n\n---\n\n';
  const markdown = path.join(dir, cadence + '-' + key + '.md');
  fs.writeFileSync(markdown, legacy + lines.join('\n') + '\n', { mode: 0o600 });
  const receipt = { schema_version: 1, cadence, cadence_key: key, observed_at: now.toISOString(), fingerprint,
    changed, notification: changed ? 'material_change' : 'quiet', markdown, ...payload };
  atomicJson(file, receipt);
  return { cadence, cadence_key: key, changed, notification: receipt.notification, markdown };
}
