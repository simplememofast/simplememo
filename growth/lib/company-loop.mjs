import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT, digest, formalMetrics, compareMetrics, humanTouchMetrics, autonomyLedger } from './company-metrics.mjs';
import { latestSnapshot } from './gsc.mjs';
import { isDue, validate as validateExperiments } from './ledger.mjs';
import { nativeOrigin } from './company-origin.mjs';

export const DEFAULT_STATE = path.join(os.homedir(), '.config/simplememo/company-os');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const repoRead = f => read(path.join(ROOT, f));
const ratio = (n, d) => d > 0 ? n / d : null;
const jst = date => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export function privateState(directory = DEFAULT_STATE) {
  directory = path.resolve(directory);
  for (let p = directory; ; p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) throw new Error('Company runtime state must stay outside Git checkouts');
    if (p === path.dirname(p)) break;
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (let p = fs.realpathSync(directory); ; p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) throw new Error('Private state resolves into a Git checkout');
    if (p === path.dirname(p)) break;
  }
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error('Private state requires an owned 0700 directory');
  return fs.realpathSync(directory);
}

export function acquireLock(directory, name = 'master-loop.lock') {
  if (!/^[a-z0-9.-]+$/.test(name)) throw new Error('Invalid lock name');
  const file = path.join(privateState(directory), name), token = randomUUID();
  // Kernel flock serializes the short read/recover/create transaction. Keeping
  // a separate guard file avoids renaming another process's newly acquired lock.
  const script = `import os,sys,json,fcntl,errno,uuid,datetime\np,pid,token,mode=sys.argv[1],int(sys.argv[2]),sys.argv[3],sys.argv[4]\ng=os.open(p+'.guard',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)\nfcntl.flock(g,fcntl.LOCK_EX)\nold=None\ntry:\n fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)\n with os.fdopen(fd) as f: old=json.load(f)\nexcept FileNotFoundError: pass\nif mode=='release':\n if old and old.get('pid')==pid and old.get('token')==token: os.unlink(p);print('released')\n else: raise ValueError('Lock ownership changed')\nelse:\n busy=False\n if old:\n  owner=old.get('pid')\n  if type(owner) is not int or owner<=0: raise ValueError('Unverified lock owner')\n  try: os.kill(owner,0);busy=True\n  except ProcessLookupError: os.rename(p,p+'.recovered-'+str(uuid.uuid4()))\n  except PermissionError: busy=True\n if busy: print('busy')\n else:\n  fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)\n  with os.fdopen(fd,'w') as f: json.dump({'pid':pid,'token':token,'at':datetime.datetime.now(datetime.timezone.utc).isoformat()},f)\n  print('owned')`;
  const operation = mode => execFileSync('python3', ['-c', script, file, String(process.pid), token, mode],
    { encoding: 'utf8', timeout: 10000, stdio: ['ignore','pipe','pipe'] }).trim();
  let state;
  try { state=operation('acquire'); } catch { throw new Error('Unverified lock owner or lock transaction failed'); }
  if (state==='busy') return null;
  if (state!=='owned') throw new Error('Unknown lock state');
  let released=false;
  return () => { if(!released) {operation('release');released=true;} };
}

export function atomicJson(file, value) {
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing output symlink');
  const tmp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function classifyFailure(error) {
  const status = error?.status;
  if ([401, 403].includes(status)) return { category: 'permission_or_credential', retryable: false };
  if ([429, 500, 502, 503, 504].includes(status) || ['ETIMEDOUT', 'ECONNRESET'].includes(error?.code)) return { category: 'transient', retryable: true };
  return { category: 'validation_or_unknown', retryable: false };
}

export async function boundedRead(operation, { sleep = ms => new Promise(r => setTimeout(r, ms)), attempts = 3 } = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('Read retry cap is three attempts');
  const events = [];
  for (let n = 1; n <= attempts; n++) {
    try { return { value: await operation(), attempts: n, events }; }
    catch (error) {
      const classification = classifyFailure(error);
      events.push({ attempt: n, ...classification });
      if (!classification.retryable || n === attempts) return { value: null, attempts: n, events, failure: classification.category };
      await sleep(250 * 2 ** (n - 1));
    }
  }
}

export const AUTONOMY_WEIGHTS = Object.freeze({ frequency: .08, human_time_saved: .10, manual_touches: .08,
  reversibility: .07, safety: .09, ease: .08, reliability: .09, business_impact: .12,
  growth_impact: .08, reuse: .08, affordability: .06, permission_readiness: .07 });

export function scoreOpportunity(candidate) {
  const f = candidate.factors;
  for (const name of Object.keys(AUTONOMY_WEIGHTS)) {
    if (!Number.isFinite(f?.[name]) || f[name] < 0 || f[name] > 100) throw new Error('Invalid opportunity factor: ' + name);
  }
  const autonomy = Object.entries(AUTONOMY_WEIGHTS).reduce((n, [k, w]) => n + f[k] * w, 0);
  const growth = f.growth_impact * .4 + f.business_impact * .35 + f.reliability * .25;
  const permitted = candidate.permission === 'AUTO' && candidate.executable === true;
  return { ...candidate, scoring_version: 'company-opportunity-v1',
    factor_basis: 'planning estimates, not measured outcomes or formal autonomy-score components',
    autonomy_opportunity_score: autonomy, growth_opportunity_score: growth,
    priority: permitted ? (growth * .65 + autonomy * .35) * f.safety / 100 * f.reliability / 100 : null };
}

export function prioritize(candidates) {
  return candidates.map(scoreOpportunity).sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || a.id.localeCompare(b.id));
}

export function experimentView(e, asOf) {
  // A legacy 'keep' decision can be administrative or inconclusive; it is not a WIN.
  const status = e.status === 'planned' ? 'PLANNED' : ['running', 'frozen'].includes(e.status) ? 'RUNNING'
    : e.decision === 'revert' ? 'ROLLED_BACK' : 'INCONCLUSIVE';
  return { id: e.id, hypothesis: e.hypothesis ?? null, evidence: e.evidence ?? null,
    action: e.type, date: e.started_at ?? null, affected_area: e.page,
    baseline: e.baseline ?? null, primary_kpi: e.target_metric ?? null, secondary_kpi: e.secondary_metrics ?? [],
    guardrails: e.stop_loss ?? e.stop_conditions ?? null, expected_impact: e.expected_impact ?? null,
    actual_impact: e.actual_impact ?? null, evaluation_date: e.evaluation_at ?? null,
    status, legacy_status: e.status, decision: e.decision ?? null, learnings: e.learnings ?? e.learning ?? [],
    due: isDue(e, asOf), source: 'growth/experiments/experiments.json',
    interpretation: 'compatible view; existing dates, statuses, evidence gates and decision semantics are authoritative' };
}

function attempt(name, callback, failures) {
  try { return callback(); }
  catch { failures.push({ source: name, state: 'unavailable', reason: 'read_or_validation_failed' }); return null; }
}

export function observe({ stateRoot = DEFAULT_STATE, now = new Date() } = {}) {
  const failures = [];
  const registry = attempt('automation_registry', () => read(path.join(stateRoot, 'automation-registry.json')), failures);
  const metrics = attempt('formal_metrics', () => formalMetrics({ now }), failures);
  const snapshot = attempt('gsc_snapshot', () => latestSnapshot(), failures);
  const experiments = attempt('experiments', () => {
    const d = repoRead('growth/experiments/experiments.json');
    if (validateExperiments(d).length) throw new Error('Experiment validation failed');
    return d.experiments.map(e => experimentView(e, now.toISOString().slice(0, 10)));
  }, failures);
  const probe = attempt('ai_visibility', () => repoRead('data/ai-visibility-probe.json'), failures);
  const actions = attempt('existing_actions', () => repoRead('data/autopilot-actions-report.json'), failures);
  const coverage = attempt('coverage', () => repoRead('data/automation-coverage.json'), failures);
  const touches = attempt('human_touches', () => humanTouchMetrics(repoRead('data/autopilot-runs.json')), failures);
  const gaps = attempt('content_gaps', () => JSON.parse(execFileSync(process.execPath,
    ['growth/scripts/analyze.mjs', '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 })), failures);
  const stop = attempt('emergency_stop', () => repoRead('data/emergency-stop.json'), failures);
  const connectionsPath = path.join(stateRoot, 'data/connections.json');
  const connections = attempt('private_growth_connections', () => read(connectionsPath), failures);
  const running = registry?.jobs.filter(j => ['scheduled', 'ACTIVE', 'enabled', 'loaded', 'observed'].includes(j.execution_state)) ?? [];
  return {
    schema_version: 1, observed_at: now.toISOString(), date_jst: jst(now), failures,
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    formal_metrics: metrics, human_touches: touches,
    automation: { registered: registry?.jobs.length ?? null, active_or_observed: running.length,
      failures: registry?.jobs.filter(j => ['failure', 'FAILED', 'errors_observed'].includes(j.health?.state)) ?? [],
      discovery_gaps: registry?.known_gaps ?? [],
      registry_generated_at: registry?.generated_at ?? null,
      note: 'Registry collection and individual source timestamps differ; historical errors do not establish a current incident.' },
    autonomy_ledger: coverage ? autonomyLedger(coverage, registry ?? undefined) : null,
    growth: {
      search: snapshot ? { snapshot: snapshot.label, period_start: snapshot.meta.period_start,
        period_end: snapshot.meta.period_end, source: snapshot.meta.source,
        observed_days: snapshot.dates?.length ?? null, pages: snapshot.pages.length, queries: snapshot.queries.length,
        clicks: snapshot.dates?.reduce((n, r) => n + r.clicks, 0) ?? null,
        impressions: snapshot.dates?.reduce((n, r) => n + r.impressions, 0) ?? null } : null,
      connections, experiments, content_gaps: gaps,
      aio: probe ? { series: probe.series, observed_at: probe.observed_at, status: probe.status,
        valid_questions: probe.valid_questions, unaided_valid_questions: probe.unaided_valid_questions,
        unaided_mention_rate: probe.unaided_mention_rate, unaided_own_site_citation_rate: probe.unaided_own_site_citation_rate,
        warning: 'Small fixed sample; different model series are not comparable and missing mentions do not identify a cause.' } : null,
    },
      existing_actions: actions,
    execution_boundary: { source: 'data/authority-matrix.json', stopped: stop?.stopped !== false,
      owner_session_stopped: stop?.agents?.['owner-session']?.stopped !== false,
      actions_stopped: stop?.agents?.actions?.stopped !== false,
      scope: 'Existing policy gates apply before each action; observation is not execution permission.' },
  };
}

export function opportunities(observation) {
  const defaults = { frequency: 65, human_time_saved: 60, manual_touches: 60, reversibility: 95,
    safety: 90, ease: 65, reliability: 70, business_impact: 60, growth_impact: 55,
    reuse: 100, affordability: 90, permission_readiness: 90 };
  const candidates = [];
  for (const job of observation.automation.failures.filter(j => j.execution_state === 'observed')) {
    candidates.push({ id: 'diagnose:' + job.id, kind: 'diagnose_automation', title: 'Diagnose ' + job.name,
      permission: 'AUTO', executable: true, owner: job.owner, evidence: [job.id, job.health],
      action_scope: 'Inspect current sanitized error evidence and existing owner; safe code repair only after confirmed cause',
      factors: { ...defaults, frequency: 95, business_impact: 85, growth_impact: 65, reliability: 80 } });
  }
  const af = observation.growth.connections?.appsflyer;
  if (af?.status === 'CONNECTED' && !af.consumer_integrated) candidates.push({
    id: 'integrate:appsflyer-consumer', kind: 'integrate_existing_reader', title: 'Move AppsFlyer report collection from manual start into the existing daily owner',
    permission: 'AUTO', executable: true, owner: 'Codex obsidian master loop', evidence: [af.evidence],
    action_scope: 'Reuse the fixed aggregate reader; no new credential, attribution definition or overlapping collector',
    factors: { ...defaults, frequency: 85, human_time_saved: 80, manual_touches: 95, reliability: 90, growth_impact: 70, ease: 85 } });
  for (const e of observation.growth.experiments ?? []) if (e.due) candidates.push({
    id: 'evaluate:' + e.id, kind: 'evaluate_existing_experiment', title: 'Evaluate ' + e.id,
    permission: 'AUTO', executable: true, owner: 'existing growth experiment ledger', evidence: [e.id, e.evaluation_date],
    action_scope: 'Use the existing metric-specific evidence gate. Keep INCONCLUSIVE or measurement_failed when appropriate; no early window or invented data.',
    factors: { ...defaults, frequency: 45, business_impact: 80, growth_impact: 80, ease: 55 } });
  if (observation.growth.aio?.unaided_valid_questions >= 4 && observation.growth.aio.unaided_mention_rate === 0) candidates.push({
    id: 'content:ai-visibility-gap', kind: 'existing_content_queue', title: 'Choose an evidenced content gap using the existing coverage queue',
    permission: 'AUTO', executable: true, owner: 'existing Obsidian Autopilot selector', evidence: [observation.growth.aio],
    action_scope: 'Cross-check live sources, existing pages, active experiments and approved value contracts before implementing one eligible page change. Do not rerun the paid probe.',
    factors: { ...defaults, manual_touches: 30, reliability: 55, business_impact: 70, growth_impact: 85, ease: 50 } });
  return prioritize(candidates);
}

export function auditObservation(o) {
  return {
    schema_version: 1, observed_at: o.observed_at,
    coverage_gaps: o.autonomy_ledger?.filter(t => t.automation_status === 'nobody').map(t => ({ id: t.id, task: t.task, next: t.next_improvement })) ?? [],
    manual_handoffs: o.autonomy_ledger?.filter(t => ['H3', 'H4', 'H5'].includes(t.human_touch.level)).map(t => ({ id: t.id, task: t.task, human_touch: t.human_touch })) ?? [],
    stage_measurement_gaps: o.autonomy_ledger?.filter(t => t.human_touch.level === null).length ?? null,
    unreliable_automations: o.automation.failures.map(j => ({ id: j.id, state: j.health.state, scope: j.history_scope })),
    missing_followup: o.growth.experiments?.filter(e => e.status === 'RUNNING' && !e.evaluation_date).map(e => e.id) ?? [],
    due_experiments: o.growth.experiments?.filter(e => e.due).map(e => e.id) ?? [],
    report_only_handoffs: ['AppsFlyer manual collector until scheduled consumer is verified', 'Historical mention suggestions require current canonical selector execution'],
    discovery_gaps: o.automation.discovery_gaps,
    source_failures: o.failures,
    opportunities: opportunities(o),
  };
}

export function cadenceKey(cadence, now) {
  const date = jst(now);
  if (cadence === 'monthly') return date.slice(0, 7);
  if (cadence === 'weekly') {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
    return d.toISOString().slice(0, 10);
  }
  if (['daily', 'follow-up'].includes(cadence)) return date;
  throw new Error('Unknown cadence');
}

export function persistRun({ stateRoot = DEFAULT_STATE, cadence = 'daily', origin = 'manual', now = new Date() } = {}) {
  const dir = privateState(stateRoot);
  if (!['manual', 'codex-automation', 'goal'].includes(origin)) throw new Error('Unknown origin');
  const release = acquireLock(dir);
  if (!release) return { status: 'busy', reason: 'existing loop lock; do not start a duplicate' };
  try {
    const observation = observe({ stateRoot: dir, now });
    const ranked = opportunities(observation);
    const key = cadenceKey(cadence, now);
    const receipt = { schema_version: 1, id: randomUUID(), cadence, cadence_key: key,
      origin, origin_proof: nativeOrigin(), started_at: now.toISOString(),
      observed_at: observation.observed_at, source_commit: observation.source_commit,
      observation_fingerprint: digest({ sources: observation.formal_metrics?.sources,
        registry: observation.automation.registry_generated_at, growth: observation.growth }),
      status: 'observed_decision_requires_execution', stages: { detect: 'completed', decide: 'completed',
        execute: 'pending', verify: 'pending', report: 'saved', learn: 'pending' },
      route: origin === 'codex-automation' ? 'actions' : 'owner-session',
      selected: observation.execution_boundary.stopped || (origin === 'codex-automation' ? observation.execution_boundary.actions_stopped : observation.execution_boundary.owner_session_stopped) ? null : ranked.find(c => c.priority !== null) ?? null,
      candidates: ranked, execution_boundary: observation.execution_boundary,
      formal_metrics: observation.formal_metrics?.metrics ?? null, source_failures: observation.failures,
      cost: { model_usd: null, api_usd: null, note: 'This adapter invokes no model or paid analytics query. Parent task cost remains separately observable or unknown.' },
      evidence_of_completion: null };
    receipt.prior_autopilot_run_ids = repoRead('data/autopilot-runs.json').runs.map(r => r.run_id);
    const baselinePath = path.join(dir, 'metrics-baseline.json');
    if (observation.formal_metrics && !fs.existsSync(baselinePath)) atomicJson(baselinePath, observation.formal_metrics);
    if (observation.formal_metrics) {
      atomicJson(path.join(dir, 'metrics-current.json'), observation.formal_metrics);
      atomicJson(path.join(dir, 'metrics-comparison.json'), compareMetrics(read(baselinePath), observation.formal_metrics));
    }
    atomicJson(path.join(dir, 'autonomy-ledger.json'), observation.autonomy_ledger);
    atomicJson(path.join(dir, 'growth-status.json'), observation.growth);
    atomicJson(path.join(dir, 'audit.json'), auditObservation(observation));
    const runsDir = path.join(dir, 'runs');
    fs.mkdirSync(runsDir, { recursive: true, mode: 0o700 });
    atomicJson(path.join(runsDir, receipt.id + '.json'), receipt);
    atomicJson(path.join(dir, 'latest-run.json'), receipt);
    return receipt;
  } finally { release(); }
}
