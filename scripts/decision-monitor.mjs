#!/usr/bin/env node
// Trusted-main monitor. It never executes code or shell snippets stored in a contract.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadIntents, contractProblems, verifyHistory, settle, staticPath, verifiedSettlement, METRICS, approvedMetric } from './value-contracts.mjs';
import { review, advance, recordSelection } from './decision-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'simplememofast/simplememo';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const save = (f, x) => fs.writeFileSync(path.join(ROOT, f), JSON.stringify(x, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const gh = (...args) => JSON.parse(execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
const api = route => gh('api', `repos/${REPO}/${route}`);
const shaOK = s => /^[a-f0-9]{40}$/.test(s ?? '');
const stop = () => { const s = read('data/emergency-stop.json'); return s.stopped || s.agents?.act?.stopped; };

export function renderReport(html, score, stages) {
  let out = html.replace(/(<span data-score-total>)[\d.]+(<\/span>)/g, `$1${score.total.toFixed(1)}$2`);
  const c = score.components;
  const notes = {
    vdc: `期間内の出荷${c.vdc.n}件のうち、事前宣言と公開後の実測決済を確認できたのは${c.vdc.hit}件。`,
    umr: '人の介入なく本番へ届いた変更の割合を可逆性で重み付け。R0には寄与の上限があります。',
    ra: `故障${c.ra.n}件のうち機械が検知したのは${c.ra.detect.hit}件、無介入の修理は${c.ra.recover.hit}件。本番の自動revert成功は${c.ra.auto_revert_count}回。`,
    ep: `エスカレーションの必要性を判定済みなのは${c.ep.precision.judged}件。未判定は満点として扱いません。`,
    tuc: `検査を維持して週${c.tuc.per_week.toFixed(1)}回出荷。週${c.tuc.target}回が配点上の基準です。`,
  };
  out = out.replace(/<tr data-score="(vdc|umr|ra|ep|tuc)">.*?<\/tr>/g, (row, id) => row.replace(/<td class="num"><b>[\d.]+<\/b><\/td>/, `<td class="num"><b>${c[id].points.toFixed(1)}</b></td>`));
  out = out.replace(/(<tr data-score="(vdc|umr|ra|ep|tuc)">.*?<td class="num">\d+<\/td>)<td>.*?<\/td><\/tr>/g,
    (_, prefix, id) => `${prefix}<td>${notes[id]}</td></tr>`);
  out = out.replace(/(<tr data-stage="(eligibility|execution|cost|absent)">.*?<td class="num"><b>)\d+(<\/b>)/g, (_, prefix, id, suffix) => `${prefix}${stages[id] ?? 0}${suffix}`);
  out = out.replace(/(<span data-decision-date>).*?(<\/span>)/g, `$1${score.generated_jst}$2`);
  return out;
}

export async function publishReport() {
  const { score, loadContext } = await import('./autonomy-score.mjs');
  const file = 'autopilot/index.html';
  const original = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const stages = {};
  for (const r of read('data/autopilot-runs.json').runs) {
    if (r.outcome === 'shipped') continue;
    if (!['eligibility', 'execution', 'cost', 'absent'].includes(r.failure_stage)) throw new Error(`unclassified run: ${r.run_id}`);
    stages[r.failure_stage] = (stages[r.failure_stage] ?? 0) + 1;
  }
  const rendered = renderReport(original, score(loadContext()), stages);
  if (rendered !== original) fs.writeFileSync(path.join(ROOT, file), rendered);
  return rendered !== original;
}

export function recoveryPlan({ intent, mergeSha, headSha, changedSince = [], changedAtMerge = [], checks, probes, previous, now, stopped }) {
  const hold = reason => ({ action: 'hold', reason });
  if (stopped) return hold('emergency_stop');
  if (!shaOK(mergeSha) || !shaOK(headSha)) return hold('invalid_sha');
  if (intent?.eligibility?.reversibility_class !== 'R0') return hold('R1_requires_recovery_evidence_and_owner_boundary');
  if (checks?.conclusion !== 'success') return hold('deployment_not_verified');
  const paths = intent.touches.filter(staticPath);
  const metadata = ['data/autopilot-runs.json', 'data/autopilot-status.json', 'data/distribution-queue.json',
    `data/decision-intents/${intent.id}.json`, 'docs/obsidian/AUTOPILOT_LOG.md', 'autopilot/index.html'];
  if (!paths.length || !changedAtMerge.length) return hold('outside_static_recovery_scope');
  if (changedAtMerge.some(p => !paths.includes(p) && !metadata.includes(p))) return hold('protected_change');
  if (paths.some(p => changedSince.includes(p))) return hold('newer_change_touches_same_path');
  // Unknown transport state is not a negative health measurement.
  const bad = probes.filter(p => p.known && !p.healthy && paths.includes(p.path));
  if (!bad.length) return hold(probes.some(p => !p.known) ? 'unknown_transport' : 'healthy');
  const repeated = previous?.target_sha === mergeSha && Date.parse(now) - Date.parse(previous.detected_at) >= 60000
    && bad.some(p => previous.probes?.some(q => q.path === p.path && q.known && !q.healthy));
  if (!repeated) return { action: 'observe', reason: 'await_independent_second_probe', probes: bad };
  return { action: 'revert', paths, target: mergeSha, expected_head: headSha, reason: 'confirmed_static_health_regression' };
}

export function pageHealth(html, status, expected) {
  if (status >= 500) return { known: true, healthy: false, reason: `http_${status}` };
  if (status !== 200) return { known: true, healthy: false, reason: `http_${status}` };
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)/)?.[1];
  return { known: true, healthy: Boolean(title && canonical && title === expected.title && canonical === expected.canonical), reason: 'title_and_canonical' };
}

async function probe(p) {
  const local = fs.readFileSync(path.join(ROOT, p), 'utf8');
  const expected = { title: local.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim(),
    canonical: local.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)/)?.[1] };
  if (!expected.title || !expected.canonical) return { path: p, known: false, healthy: false, reason: 'local_baseline_invalid' };
  const u = new URL(expected.canonical);
  if (u.origin !== 'https://simplememofast.com') return { path: p, known: false, reason: 'nonproduction_canonical' };
  u.searchParams.set('decision_probe', String(Date.now()));
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'cache-control': 'no-cache' } });
    return { path: p, ...pageHealth(await r.text(), r.status, expected) };
  } catch { return { path: p, known: false, healthy: false, reason: 'transport_or_redirect_unknown' }; }
}

async function deployment(sha) {
  const checks = api(`commits/${sha}/check-runs`).check_runs;
  return checks.filter(c => c.name === 'Cloudflare Pages').sort((a, b) => b.id - a.id)[0] ?? null;
}

async function delivery(c, run) {
  if (!Number.isInteger(run?.pr)) return null;
  const pr = api(`pulls/${run.pr}`);
  if (!pr.merged || pr.base.ref !== 'main' || pr.head.repo?.full_name !== REPO || !shaOK(pr.merge_commit_sha)) return null;
  const validations = api(`commits/${pr.head.sha}/check-runs`).check_runs;
  if (!validations.some(c => c.name === 'seo-check' && c.conclusion === 'success')) return null;
  git('fetch', 'origin', pr.head.sha, pr.merge_commit_sha);
  const base = git('merge-base', `${pr.merge_commit_sha}^`, pr.head.sha);
  const history = verifyHistory(c, base, pr.head.sha);
  const check = await deployment(pr.merge_commit_sha);
  if (check?.conclusion !== 'success' || !check.completed_at) return null;
  // The public contract must also be present in the actual production deployment.
  const r = await fetch(`https://simplememofast.com/data/decision-intents/${c.id}.json`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!r.ok || hash(await r.json()) !== hash(c)) return null;
  return { verified: true, intent_hash: hash(c), merge_sha: pr.merge_commit_sha, declaration_sha: history.declaration_sha,
    deployed_at: check.completed_at, deployment_url: check.details_url, pr: pr.number };
}

export function applyRevert(plan, cwd = ROOT) {
  const command = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  assert.equal(command('rev-parse', 'HEAD'), plan.expected_head, 'HEAD moved before rollback');
  assert.equal(command('status', '--porcelain', '--untracked-files=no'), '', 'rollback requires a clean tracked tree');
  const diff = execFileSync('git', ['diff', `${plan.target}^`, plan.target, '--', ...plan.paths], { cwd });
  if (!diff.length) throw new Error('empty rollback');
  execFileSync('git', ['apply', '--reverse', '--check'], { cwd, input: diff });
  execFileSync('git', ['apply', '--reverse'], { cwd, input: diff });
}

function publish(files, branch, title, expectedHead) {
  // Never overwrite a newer main or a pre-existing PR branch.
  git('fetch', 'origin', 'main');
  if (git('rev-parse', 'origin/main') !== expectedHead) throw new Error('main advanced; leave state for the next monitor');
  if (git('ls-remote', '--heads', 'origin', branch)) throw new Error('branch already exists; inspect its PR instead of overwriting it');
  git('checkout', '-b', branch);
  git('add', '--', ...files);
  git('commit', '-m', title);
  git('push', '-u', 'origin', branch);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-pr-'));
  try {
    fs.writeFileSync(path.join(tmp, 'body.md'), `${title}\n\nGenerated by the deterministic decision monitor. All existing SEO Validation checks must pass before merge.\n`);
    const url = execFileSync('gh', ['pr', 'create', '--repo', REPO, '--head', branch, '--base', 'main', '--title', title, '--body-file', path.join(tmp, 'body.md')], { cwd: ROOT, encoding: 'utf8' }).trim();
    const number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
    if (!Number.isInteger(number) || !number) throw new Error('could not read the created PR number');
    return { number };
  } finally { fs.rmSync(tmp, { recursive: true }); }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const head = git('rev-parse', 'HEAD');
  if (stop()) throw new Error('emergency_stop: monitoring execution halted');
  const metrics = read('data/value-metrics.json');
  const runs = read('data/autopilot-runs.json').runs;
  const ledger = read('data/value-contracts.json');
  const recovery = read('data/decision-recovery.json');
  let strategy = read('data/decision-review.json');
  const original = hash({ ledger, recovery, strategy });
  const now = new Date();
  const ctx = { metrics, runs, costs: read('data/autopilot-cost.json').runs, now };
  const warnings = [];
  const intents = loadIntents();
  for (const c of intents) {
    const problems = contractProblems(c, metrics);
    if (problems.length) { warnings.push({ id: c.id, reasons: problems }); continue; }
    let row = ledger.contracts.find(x => x.id === c.id);
    const run = runs.find(r => r.run_id === c.run_id && r.outcome === 'shipped');
    if (!run) continue;
    if (!row) { row = { id: c.id, run_id: c.run_id, horizon_days: c.horizon_days, intent: c }; ledger.contracts.push(row); }
    row.delivery ??= await delivery(c, run);
    if (!row.delivery) continue;
    if (c.selection) strategy = recordSelection(strategy, c.id, c.selection);
    if (!verifiedSettlement(row)) row.settlement = settle(c, row.delivery, ctx);
    const merge = row.delivery.merge_sha;
    let incident = recovery.incidents.find(i => i.contract_id === c.id);
    if (incident?.revert_pr && incident.state !== 'recovered') {
      const pr = api(`pulls/${incident.revert_pr}`);
      if (pr.merged && (await deployment(pr.merge_commit_sha))?.conclusion === 'success') {
        const checks = api(`commits/${pr.head.sha}/check-runs`).check_runs;
        const seo = checks.find(x => x.name === 'seo-check' && x.conclusion === 'success');
        const after = await Promise.all(c.touches.filter(p => staticPath(p) && p.endsWith('.html')).map(probe));
        if (seo && after.length && after.every(p => p.known && p.healthy)) Object.assign(incident, {
          state: 'recovered', revert_sha: pr.merge_commit_sha, validation: 'success', deployment_verified: true,
          after: { healthy: true, probes: after }, recovered_at: now.toISOString(),
        });
      }
      continue;
    }
    if (incident?.state === 'recovered' || now - new Date(row.delivery.deployed_at) > 28 * 86400000) continue;
    const changedSince = git('diff', '--name-only', merge, head).split('\n').filter(Boolean);
    const changedAtMerge = git('diff', '--name-only', `${merge}^`, merge).split('\n').filter(Boolean);
    const checks = await deployment(head);
    const probes = await Promise.all(c.touches.filter(p => staticPath(p) && p.endsWith('.html')).map(probe));
    const plan = recoveryPlan({ intent: c, mergeSha: merge, headSha: head, changedSince, changedAtMerge, checks,
      probes, previous: incident, now: now.toISOString(), stopped: stop() });
    if (plan.action === 'observe') {
      if (!incident) { incident = { contract_id: c.id }; recovery.incidents.push(incident); }
      Object.assign(incident, { state: 'observing', detected_at: now.toISOString(), head_sha: head, target_sha: merge, probes });
    }
    if (plan.action === 'revert' && apply) {
      if (stop()) throw new Error('stopped before recovery');
      const branch = `Codex/decision-revert-${merge.slice(0, 12)}`;
      const existing = gh('pr', 'list', '--repo', REPO, '--head', branch, '--state', 'all', '--json', 'number,state')[0];
      if (existing?.state === 'CLOSED') throw new Error('recovery PR was closed by an operator; do not recreate');
      // The incident stays in a separate ledger PR; rollback changes only the declared static files.
      if (!existing) applyRevert(plan);
      const pr = existing ?? publish(plan.paths, branch, `Revert static regression for ${c.id}`, head);
      Object.assign(incident, { state: 'revert_pending', mode: 'production', trigger: process.env.GITHUB_EVENT_NAME ?? 'manual',
        human_interventions: ['schedule', 'workflow_run'].includes(process.env.GITHUB_EVENT_NAME) ? 0 : 1,
        before: { failed: true, probes }, revert_pr: pr.number });
      git('checkout', '--detach', head);
    }
  }
  const result = review(ledger.contracts, strategy);
  strategy = { ...advance(strategy, result), last_review: result };
  console.log(JSON.stringify({ approved_metrics: METRICS.filter(id => approvedMetric(metrics, id)), intents: intents.length,
    settled: ledger.contracts.filter(verifiedSettlement).length, review: result.verdict, warnings }, null, 2));
  if (warnings.length) throw new Error('invalid declarations require attention; monitor did not mutate policy');
  if (apply) {
    if (stop()) throw new Error('stopped before ledger publication');
    save('data/value-contracts.json', ledger); save('data/decision-recovery.json', recovery); save('data/decision-review.json', strategy);
    const reportChanged = await publishReport();
    if (hash({ ledger, recovery, strategy }) === original && !reportChanged) return;
    publish(['data/value-contracts.json', 'data/decision-recovery.json', 'data/decision-review.json', 'autopilot/index.html'],
      `Codex/decision-observe-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`,
      'Record verified decision outcomes and recovery evidence', head);
  }
}

function selftest() {
  const p = { intent: { id: 'x', touches: ['index.html'], eligibility: { reversibility_class: 'R0' } },
    mergeSha: 'a'.repeat(40), headSha: 'b'.repeat(40), checks: { conclusion: 'success' },
    changedAtMerge: ['index.html'], changedSince: [], now: '2026-09-04T01:05:00Z', stopped: false,
    probes: [{ path: 'index.html', known: true, healthy: false }],
    previous: { target_sha: 'a'.repeat(40), detected_at: '2026-09-04T01:00:00Z', probes: [{ path: 'index.html', known: true, healthy: false }] } };
  assert.equal(recoveryPlan(p).action, 'revert');
  for (const change of [{ stopped: true }, { checks: null }, { changedSince: ['index.html'] }, { changedAtMerge: ['.github/workflows/x.yml'] },
    { probes: [{ path: 'index.html', known: false }] }, { probes: [{ path: 'index.html', known: true, healthy: true }] }]) assert.equal(recoveryPlan({ ...p, ...change }).action, 'hold');
  assert.equal(recoveryPlan({ ...p, previous: null }).action, 'observe');
  assert.equal(recoveryPlan({ ...p, intent: { ...p.intent, eligibility: { reversibility_class: 'R1' } } }).action, 'hold');
  assert.equal(pageHealth('<title>good</title><link rel="canonical" href="https://simplememofast.com/">', 200,
    { title: 'good', canonical: 'https://simplememofast.com/' }).healthy, true);
  assert.equal(pageHealth('<title>bad</title>', 200, { title: 'good' }).healthy, false);
  const sample = { total: 42.5, generated_jst: '2026-09-04', components: {
    vdc: { n: 2, hit: 1, points: 15 }, umr: { points: 10 }, ra: { n: 1, points: 5, detect: { hit: 1 }, recover: { hit: 0 }, auto_revert_count: 0 },
    ep: { points: 5, precision: { judged: 0 } }, tuc: { points: 7.5, per_week: 5.3, target: 7 },
  } };
  const report = renderReport('<span data-score-total>0.0</span><tr data-score="vdc"><td>VDC</td><td class="num"><b>0.0</b></td><td class="num">30</td><td>old</td></tr>', sample, {});
  assert(report.includes('data-score-total>42.5</span>'));
  assert(report.includes('<b>15.0</b>'));
  assert(report.includes('出荷2件'));
  // Exercise an actual reverse patch in a disposable Git repo. This is a drill, never production evidence.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-recovery-test-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    g('init'); g('config', 'user.name', 'Test'); g('config', 'user.email', 'test@example.invalid');
    fs.writeFileSync(path.join(dir, 'index.html'), 'healthy\n'); fs.writeFileSync(path.join(dir, 'other.txt'), 'keep\n');
    g('add', '.'); g('commit', '-m', 'baseline');
    fs.writeFileSync(path.join(dir, 'index.html'), 'broken\n'); g('add', '.'); g('commit', '-m', 'regression');
    const target = g('rev-parse', 'HEAD');
    applyRevert({ target, expected_head: target, paths: ['index.html'] }, dir);
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), 'healthy\n');
    assert.equal(fs.readFileSync(path.join(dir, 'other.txt'), 'utf8'), 'keep\n');
    assert.throws(() => applyRevert({ target, expected_head: '0'.repeat(40), paths: ['index.html'] }, dir));
  } finally { fs.rmSync(dir, { recursive: true }); }
  console.log('decision-monitor: repeated probes, safe scope, stop, stale HEAD, and real Git recovery drill passed');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else if (process.argv.includes('--publish-report')) publishReport().then(() => console.log('Public operating report synchronized.')).catch(e => { console.error(e.message); process.exitCode = 1; });
  else if (process.argv.includes('--check')) {
    const d = read('data/decision-recovery.json');
    assert(Array.isArray(d.incidents));
    console.log('decision recovery ledger OK');
  } else main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
