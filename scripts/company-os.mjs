#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE, observe, auditObservation, persistRun } from '../growth/lib/company-loop.mjs';
import { compareMetrics } from '../growth/lib/company-metrics.mjs';
import { collectData } from '../growth/lib/company-data.mjs';
import { compactGrowth, saveReview } from '../growth/lib/company-review.mjs';
import { finishIntegration, finishExistingRun, bindExistingRun } from '../growth/lib/company-proof.mjs';
import { followUp } from '../growth/lib/company-followup.mjs';

const args = process.argv.slice(2);
const command = args[0] ?? 'autonomy-status';
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const stateRoot = option('state-root', DEFAULT_STATE);
let result;
if (command === 'follow-up') {
  result=followUp({stateRoot});
} else if (command === 'bind') {
  result = bindExistingRun({stateRoot,id:option('run'),autopilotRunId:option('autopilot-run')});
} else if (command === 'finish') {
  const evidenceFile=option('evidence');
  const kind=JSON.parse(fs.readFileSync(evidenceFile)).kind;
  const finish=kind==='autopilot_run'?finishExistingRun:finishIntegration;
  result = await finish({ stateRoot, id: option('run'), evidenceFile });
} else if (command === 'collect') {
  result = await collectData({ stateRoot, analytics: args.includes('--analytics') });
} else if (['run', 'autonomy-lift', 'growth-autopilot'].includes(command)) {
  result = persistRun({ stateRoot, cadence: option('cadence', 'daily'), origin: option('origin', 'manual') });
} else {
  const o = observe({ stateRoot });
  if (command === 'autonomy-status') {
    const baseline = path.join(stateRoot, 'metrics-baseline.json');
    result = { metrics: o.formal_metrics?.metrics,
      comparison: fs.existsSync(baseline) && o.formal_metrics ? compareMetrics(JSON.parse(fs.readFileSync(baseline)), o.formal_metrics) : null,
      human_touches: o.human_touches, active_failures: o.automation.failures.map(x => ({ id: x.id, health: x.health })),
      source_failures: o.failures };
  } else if (['autonomy-audit', 'growth-audit'].includes(command)) result = auditObservation(o);
  else if (command === 'review') result = saveReview(o, { stateRoot, cadence: option('cadence', 'daily') });
  else if (command === 'growth-status') result = args.includes('--full') ? { ...o.growth, pipeline_health: o.automation, source_failures: o.failures } : compactGrowth(o);
  else if (command === 'content-gap') result = o.growth.content_gaps;
  else if (command === 'aio-audit') result = o.growth.aio;
  else throw new Error('Unknown company command');
}
console.log(JSON.stringify(result, null, 2));
