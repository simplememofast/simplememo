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
import { activeStreaks, shippingStreaks } from './autopilot-runs.mjs';
import { ep as scoreEp, ra as scoreRa } from './autonomy-score.mjs';
import { automatedDecisionOrigin, runtimeDecisionOrigin, verifyLaunchd, NATIVE_LABEL, NATIVE_SCRIPT } from './lib/decision-origin.mjs';

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
const ledgerFiles = ['data/value-contracts.json', 'data/decision-recovery.json', 'data/decision-review.json', 'autopilot/index.html'];

export function pendingPublication(request = api) {
  const listed = request('pulls?state=open&base=main&per_page=100');
  assert(Array.isArray(listed) && listed.length < 100, 'pending decision PR inventory is incomplete');
  assert(listed.every(p => Number.isSafeInteger(p?.number) && typeof p?.head?.ref === 'string'), 'pending PR inventory has an unknown entry');
  const candidates = listed.filter(p => typeof p?.head?.ref === 'string' && p.head.ref.startsWith('Codex/decision-observe-'));
  const verified = [];
  for (const item of candidates) {
    assert(Number.isSafeInteger(item.number) && item.number > 0, 'pending decision PR identity missing');
    const route = `pulls/${item.number}`, pr = request(route);
    assert(pr?.number === item.number && pr.state === 'open' && pr.base?.ref === 'main'
      && pr.base.repo?.full_name === REPO && pr.head?.repo?.full_name === REPO
      && pr.head.ref === item.head.ref && shaOK(pr.head.sha), 'pending decision PR changed or targets another repository');
    const files = request(`${route}/files?per_page=100`);
    assert(Array.isArray(files) && files.length > 0 && files.length < 100 && files.length === pr.changed_files
      && files.every(f => ledgerFiles.includes(f.filename)), 'pending decision PR has unverified scope');
    const fresh = request(route);
    assert(fresh.state === 'open' && fresh.number === pr.number && fresh.head?.sha === pr.head.sha
      && fresh.head.ref === pr.head.ref && fresh.head.repo?.full_name === REPO
      && fresh.base?.ref === 'main' && fresh.base.repo?.full_name === REPO, 'pending decision PR changed during verification');
    const ref = request(`git/ref/heads/${pr.head.ref}`);
    assert(ref?.object?.sha === pr.head.sha, 'pending decision branch differs from its PR');
    verified.push({ pr: pr.number, head: pr.head.sha, draft: pr.draft === true });
  }
  return verified;
}

export function recoveryAttribution(previous, origin) {
  const current = typeof origin === 'string' ? { trigger: origin } : origin;
  const priorHuman = previous?.detected_at && !(previous.human_interventions === 0 && automatedDecisionOrigin(previous)) ? 1 : 0;
  const source = priorHuman ? { trigger: previous.trigger ?? 'unknown', execution_origin: previous.execution_origin } : current;
  return { trigger: source.trigger, execution_origin: source.execution_origin ?? null,
    human_interventions: Math.max(priorHuman, automatedDecisionOrigin(current) ? 0 : 1) };
}

export function pendingRecovery(previous, { head, probes, now, trigger, execution_origin }) {
  return { ...previous, state: 'revert_pending', mode: 'production', execution_head: head,
    confirmed_at: now, ...recoveryAttribution(previous, { trigger, execution_origin }), before: { failed: true, probes } };
}

export function recoveryCheckpoint(previous, pending) {
  return `<!-- decision-recovery ${JSON.stringify({ version: 1, source_hash: hash(previous), incident: pending })} -->`;
}

export function resumeRecovery(previous, pr, { contractId, targetSha }) {
  assert.notEqual(pr.state, 'CLOSED', 'recovery PR was closed by an operator; do not recreate');
  assert(Number.isInteger(pr.number) && pr.number > 0, 'recovery PR number required');
  const markers = [...(pr.body ?? '').matchAll(/<!-- decision-recovery ([^\n]+) -->/g)];
  assert.equal(markers.length, 1, 'recovery PR checkpoint missing or ambiguous');
  const checkpoint = JSON.parse(markers[0][1]);
  assert.equal(checkpoint.version, 1, 'unsupported recovery checkpoint');
  assert.equal(checkpoint.source_hash, hash(previous), 'recovery checkpoint does not match the recorded observation');
  const record = checkpoint.incident;
  assert.equal(record.contract_id, contractId, 'recovery checkpoint contract mismatch');
  assert.equal(record.target_sha, targetSha, 'recovery checkpoint target mismatch');
  assert.equal(record.state, 'revert_pending', 'recovery checkpoint is not pending');
  assert.equal(record.mode, 'production', 'recovery checkpoint is not production');
  assert(shaOK(record.execution_head), 'recovery execution head required');
  assert.equal(record.detected_at, previous.detected_at, 'first detection changed');
  assert.equal(hash(record.probes), hash(previous.probes), 'first probes changed');
  assert(Date.parse(record.confirmed_at) - Date.parse(record.detected_at) >= 60000, 'independent confirmation required');
  assert(record.before?.failed === true && Array.isArray(record.before.probes), 'confirmed failure required');
  assert(record.before.probes.some(p => p.known && !p.healthy
    && previous.probes?.some(q => q.path === p.path && q.known && !q.healthy)), 'same failure must be observed twice');
  assert([0, 1].includes(record.human_interventions), 'known recovery attribution required');
  assert.deepEqual({ trigger: record.trigger, human_interventions: record.human_interventions, execution_origin: record.execution_origin ?? null },
    recoveryAttribution(previous, { trigger: record.trigger, execution_origin: record.execution_origin }), 'recovery cannot erase prior human involvement');
  return { ...record, revert_pr: pr.number };
}

export function verifyRollback(incident, revertHead, paths, cwd = ROOT) {
  const command = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  assert(shaOK(incident.execution_head) && shaOK(incident.target_sha) && shaOK(revertHead), 'rollback commits required');
  assert.equal(command('rev-parse', `${revertHead}^`), incident.execution_head, 'rollback PR was changed after creation');
  const expected = command('diff', '--binary', '--full-index', '--no-renames', incident.target_sha, `${incident.target_sha}^`, '--', ...paths);
  assert(expected, 'empty declared rollback');
  const actual = command('diff', '--binary', '--full-index', '--no-renames', incident.execution_head, revertHead);
  assert.equal(actual, expected, 'rollback PR differs from the declared reverse patch');
}

export function renderReport(html, score, stages) {
  let out = html.replace(/(<span data-score-total>)[\d.]+(<\/span>)/g, `$1${score.total.toFixed(1)}$2`);
  const c = score.components;
  const notes = {
    vdc: `期間内の出荷${c.vdc.n}件のうち、事前宣言と公開後の実測決済を確認できたのは${c.vdc.hit}件。`,
    umr: '人の介入なく本番へ届いた変更の割合を可逆性で重み付け。R0には寄与の上限があります。',
    ra: `故障${c.ra.n}件のうち機械が検知したのは${c.ra.detect.hit}件、無介入の修理は${c.ra.recover.hit}件。本番の自動revert成功は${c.ra.auto_revert_count}回。`,
    ep: `エスカレーションの必要性を判定済みなのは${c.ep.precision.judged}件。${c.ep.precision.delegated_ai ? `うち${c.ep.precision.delegated_ai}件はオーナー委任によるAI評価で、独立した人間評価ではありません。` : '未判定は満点として扱いません。'}`,
    tuc: `検査を維持して週${c.tuc.per_week.toFixed(1)}回出荷。週${c.tuc.target}回が配点上の基準です。`,
  };
  out = out.replace(/<tr data-score="(vdc|umr|ra|ep|tuc)">.*?<\/tr>/g, (row, id) => row.replace(/<td class="num"><b>[\d.]+<\/b><\/td>/, `<td class="num"><b>${c[id].points.toFixed(1)}</b></td>`));
  out = out.replace(/(<tr data-score="(vdc|umr|ra|ep|tuc)">.*?<td class="num">\d+<\/td>)<td>.*?<\/td><\/tr>/g,
    (_, prefix, id) => `${prefix}<td>${notes[id]}</td></tr>`);
  out = out.replace(/(<tr data-stage="(eligibility|execution|cost|absent)">.*?<td class="num"><b>)\d+(<\/b>)/g, (_, prefix, id, suffix) => `${prefix}${stages[id] ?? 0}${suffix}`);
  out = out.replace(/(<span data-decision-date>).*?(<\/span>)/g, `$1${score.generated_jst}$2`);
  return out;
}

export function renderRunStreaks(html, runs) {
  // Keep the definition shared with the public-page checker. A failed day can
  // extend activity while breaking shipping; neither count is hand-maintained.
  const region = /<!-- run-streaks:start -->[\s\S]*?<!-- run-streaks:end -->/g;
  assert.equal([...html.matchAll(region)].length, 1, 'public run-streaks region missing or ambiguous');
  const active = activeStreaks(runs), shipping = shippingStreaks(runs);
  const date = day => day.replace(/^(\d{4})-0?(\d+)-0?(\d+)$/, '$1年$2月$3日');
  const range = (from, to) => from ? `（${date(from)}〜${date(to)}）` : '';
  const content = `<!-- run-streaks:start -->
          この定義での連続稼働は現在<b>${active.current.days}</b>日${range(active.current.from, active.last_day)}で、最長も<b>${active.longest.days}</b>日${range(active.longest.from, active.longest.to)}です。
          ${active.last_day ? `「現在」は台帳の最終記入日（${date(active.last_day)}）時点です。` : '台帳の記録はまだありません。'}
          稼働の定義では、失敗して行が立った日も「記録がある日」なので連続が切れません。
          <b>連続出荷は現在${shipping.current.days}日</b>${range(shipping.current.from, shipping.last_day)}で、<b>連続出荷の最長は${shipping.longest.days}日</b>${range(shipping.longest.from, shipping.longest.to)}です。
          <!-- run-streaks:end -->`;
  return html.replace(region, () => content);
}

export async function publishReport() {
  const { score, loadContext } = await import('./autonomy-score.mjs');
  const file = 'autopilot/index.html';
  const original = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const stages = {};
  const runs = read('data/autopilot-runs.json').runs;
  for (const r of runs) {
    if (r.outcome === 'shipped') continue;
    if (!['eligibility', 'execution', 'cost', 'absent'].includes(r.failure_stage)) throw new Error(`unclassified run: ${r.run_id}`);
    stages[r.failure_stage] = (stages[r.failure_stage] ?? 0) + 1;
  }
  const rendered = renderRunStreaks(renderReport(original, score(loadContext()), stages), runs);
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

export const observationBranch = head => {
  assert(shaOK(head), 'observation branch requires a verified starting commit');
  return `Codex/decision-observe-${head.slice(0, 16)}`;
};

function publish(files, branch, title, expectedHead, checkpoint = '', cwd = ROOT) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
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
    fs.writeFileSync(path.join(tmp, 'body.md'), `${title}\n\nGenerated by the deterministic decision monitor. All existing SEO Validation checks must pass before merge.\n${checkpoint ? `\n${checkpoint}\n` : ''}`);
    const url = execFileSync('gh', ['pr', 'create', '--repo', REPO, '--head', branch, '--base', 'main', '--title', title, '--body-file', path.join(tmp, 'body.md')], { cwd, encoding: 'utf8' }).trim();
    const number = Number(url.match(/\/pull\/(\d+)$/)?.[1]);
    if (!Number.isInteger(number) || !number) throw new Error('could not read the created PR number');
    return { number };
  } finally { fs.rmSync(tmp, { recursive: true }); }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const head = git('rev-parse', 'HEAD');
  if (stop()) throw new Error('emergency_stop: monitoring execution halted');
  const origin = runtimeDecisionOrigin({ head });
  if (apply) {
    const pending = pendingPublication();
    if (pending.length) {
      console.log(JSON.stringify({ state: 'waiting_for_publication', ...origin, pending }));
      return;
    }
  }
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
    const recoveryBranch = `Codex/decision-revert-${merge.slice(0, 12)}`;
    // The PR and its checkpoint are created together. If main advanced before
    // the separate ledger PR could be saved, recover that checkpoint first,
    // even when the rollback has already merged and probes are healthy again.
    if (incident?.state === 'observing' && !incident.revert_pr) {
      const existing = gh('pr', 'list', '--repo', REPO, '--head', recoveryBranch, '--state', 'all', '--json', 'number,state,body')[0];
      if (existing) {
        Object.assign(incident, resumeRecovery(incident, existing, { contractId: c.id, targetSha: merge }));
        Object.assign(incident, recoveryAttribution(incident, origin));
      }
    }
    if (incident?.revert_pr && incident.state !== 'recovered') {
      const pr = api(`pulls/${incident.revert_pr}`);
      if (pr.merged && (await deployment(pr.merge_commit_sha))?.conclusion === 'success') {
        git('fetch', 'origin', pr.head.sha, incident.execution_head);
        verifyRollback(incident, pr.head.sha, c.touches.filter(staticPath));
        const checks = api(`commits/${pr.head.sha}/check-runs`).check_runs;
        const seo = checks.find(x => x.name === 'seo-check' && x.conclusion === 'success');
        const after = await Promise.all(c.touches.filter(p => staticPath(p) && p.endsWith('.html')).map(probe));
        if (seo && after.length && after.every(p => p.known && p.healthy)) Object.assign(incident,
          recoveryAttribution(incident, origin), {
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
      Object.assign(incident, recoveryAttribution(incident, origin),
        { state: 'observing', detected_at: now.toISOString(), head_sha: head, target_sha: merge, probes });
    }
    if (plan.action === 'revert' && apply) {
      if (stop()) throw new Error('stopped before recovery');
      const pending = pendingRecovery(incident, { head, probes, now: now.toISOString(), ...origin });
      const checkpoint = recoveryCheckpoint(incident, pending);
      // The reverse patch and its recovery evidence are published together.
      // The rollback commit still changes only the declared static files.
      applyRevert(plan);
      const pr = publish(plan.paths, recoveryBranch, `Revert static regression for ${c.id}`, head, checkpoint);
      Object.assign(incident, pending, { revert_pr: pr.number });
      git('checkout', '--detach', head);
    }
  }
  const result = review(ledger.contracts, strategy);
  strategy = { ...advance(strategy, result), last_review: result };
  console.log(JSON.stringify({ state: 'observed', ...origin, approved_metrics: METRICS.filter(id => approvedMetric(metrics, id)), intents: intents.length,
    settled: ledger.contracts.filter(verifiedSettlement).length, review: result.verdict, warnings }, null, 2));
  if (warnings.length) throw new Error('invalid declarations require attention; monitor did not mutate policy');
  if (apply) {
    if (stop()) throw new Error('stopped before ledger publication');
    save('data/value-contracts.json', ledger); save('data/decision-recovery.json', recovery); save('data/decision-review.json', strategy);
    const reportChanged = await publishReport();
    if (hash({ ledger, recovery, strategy }) === original && !reportChanged) return;
    publish(ledgerFiles,
      observationBranch(head),
      'Record verified decision outcomes and recovery evidence', head);
  }
}

function selftest() {
  const launcher = `/fixture/.local/libexec/${NATIVE_SCRIPT}`;
  const launchState = `gui/501/${NATIVE_LABEL} = {\n\tstate = running\n\tprogram = /usr/bin/python3\n\targuments = {\n\t\t/usr/bin/python3\n\t\t${launcher}\n\t\t--once\n\t}\n\tpid = 123\n}`;
  const originOptions = { env: { DECISION_MONITOR_NATIVE_TIMER: '1' }, platform: 'darwin', uid: 501,
    parentPid: 123, home: '/fixture', head: 'a'.repeat(40), now: new Date('2026-09-05T12:00:00Z'),
    run: (file, args) => { assert.equal(file, '/bin/launchctl'); assert.equal(args[1], `gui/501/${NATIVE_LABEL}`); return args[0] === 'print' ? launchState : 'interval\n'; },
    read: file => { assert.equal(file, launcher); return 'fixture launcher'; } };
  const native = runtimeDecisionOrigin(originOptions);
  assert.equal(native.trigger, 'launchd');
  assert(automatedDecisionOrigin(native), 'verified interval is an autonomous origin');
  assert.equal(runtimeDecisionOrigin({ env: {} }).trigger, 'manual');
  assert.equal(automatedDecisionOrigin(runtimeDecisionOrigin({ env: { GITHUB_EVENT_NAME: 'launchd' } })), false, 'an environment name is not launchd proof');
  for (const reason of ['speculative', 'non-ipc demand', 'unknown', '']) {
    assert.throws(() => runtimeDecisionOrigin({ ...originOptions, run: (_, args) => args[0] === 'print' ? launchState : reason }), /interval timer/);
  }
  for (const change of [{ platform: 'linux' }, { parentPid: 124 }, { head: 'not-a-sha' }]) assert.throws(() => runtimeDecisionOrigin({ ...originOptions, ...change }));
  for (const state of [launchState.replace('pid = 123', 'pid = 124'), launchState.replace('state = running', 'state = not running'),
    launchState.replace('--once', '--probe'), launchState.replace(launcher, '/different/launcher.py')]) {
    assert.throws(() => verifyLaunchd(state, { parentPid: 123, launcher }));
  }
  assert.equal(automatedDecisionOrigin({ ...native, execution_origin: { ...native.execution_origin, receipt_sha256: '0'.repeat(64) } }), false);
  assert.equal(automatedDecisionOrigin({ ...native, execution_origin: null }), false);
  const publication = { number: 321, state: 'open', draft: false, changed_files: 1,
    head: { ref: 'Codex/decision-observe-abc', sha: 'a'.repeat(40), repo: { full_name: REPO } },
    base: { ref: 'main', repo: { full_name: REPO } } };
  const publicationApi = ({ list = [publication], detail = publication, files = [{ filename: 'data/value-contracts.json' }],
    refreshed = detail, branch = detail.head?.sha } = {}) => {
    let reads = 0;
    return route => {
      if (route.startsWith('pulls?')) return list;
      if (route.includes('/files?')) return files;
      if (route.startsWith('git/ref/')) return { object: { sha: branch } };
      return ++reads === 1 ? detail : refreshed;
    };
  };
  assert.deepEqual(pendingPublication(publicationApi()), [{ pr: 321, head: publication.head.sha, draft: false }]);
  assert.deepEqual(pendingPublication(publicationApi({ list: [] })), []);
  for (const options of [{ list: Array(100).fill(publication) }, { list: [{}] },
    { files: [{ filename: '.github/workflows/decision-monitor.yml' }] }, { files: [] },
    { detail: { ...publication, changed_files: 2 } }, { detail: { ...publication, state: 'closed' } },
    { refreshed: { ...publication, head: { ...publication.head, sha: 'b'.repeat(40) } } }, { branch: 'b'.repeat(40) }]) {
    assert.throws(() => pendingPublication(publicationApi(options)), /pending/);
  }
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
  const observed = { contract_id: 'x', state: 'observing', ...p.previous, trigger: 'schedule', human_interventions: 0 };
  const pending = pendingRecovery(observed, { head: p.headSha, probes: p.probes, now: p.now, trigger: 'workflow_run' });
  const checkpoint = recoveryCheckpoint(observed, pending);
  const recoveryPR = { number: 123, state: 'MERGED', body: checkpoint };
  const binding = { contractId: 'x', targetSha: p.mergeSha };
  // Simulate a successful PR creation followed by a failed ledger publication:
  // the next process has only the old observation and the already merged PR.
  assert.deepEqual(resumeRecovery(structuredClone(observed), recoveryPR, binding), { ...pending, revert_pr: 123 });
  for (const change of [{ state: 'CLOSED' }, { body: '' }, { body: checkpoint + '\n' + checkpoint }, { number: null }]) {
    assert.throws(() => resumeRecovery(observed, { ...recoveryPR, ...change }, binding));
  }
  assert.throws(() => resumeRecovery({ ...observed, detected_at: p.now }, recoveryPR, binding), /recorded observation/);
  assert.throws(() => resumeRecovery({ ...observed, head_sha: 'c'.repeat(40) }, recoveryPR, binding), /recorded observation/);
  for (const change of [{ contract_id: 'other' }, { target_sha: 'c'.repeat(40) }, { execution_head: null },
    { confirmed_at: observed.detected_at }, { before: { failed: true, probes: [{ path: 'other.html', known: true, healthy: false }] } }]) {
    assert.throws(() => resumeRecovery(observed, { ...recoveryPR, body: recoveryCheckpoint(observed, { ...pending, ...change }) }, binding));
  }
  const humanObservation = { ...observed, trigger: 'workflow_dispatch', human_interventions: 1 };
  const humanPending = pendingRecovery(humanObservation, { head: p.headSha, probes: p.probes, now: p.now, trigger: 'schedule' });
  assert.equal(humanPending.human_interventions, 1);
  assert.equal(resumeRecovery(humanObservation, { ...recoveryPR, body: recoveryCheckpoint(humanObservation, humanPending) }, binding).human_interventions, 1);
  assert.throws(() => resumeRecovery(humanObservation, { ...recoveryPR,
    body: recoveryCheckpoint(humanObservation, { ...humanPending, trigger: 'schedule', human_interventions: 0 }) }, binding), /prior human involvement/);
  assert.equal(recoveryAttribution(observed, 'workflow_dispatch').human_interventions, 1);
  assert.equal(recoveryAttribution({ detected_at: observed.detected_at }, 'schedule').human_interventions, 1);
  assert.equal(recoveryAttribution(null, 'schedule').human_interventions, 0);
  assert.equal(recoveryAttribution(null, native).human_interventions, 0);
  assert.equal(recoveryAttribution(humanObservation, native).human_interventions, 1, 'native execution cannot erase earlier human involvement');
  const nativeIncident = { mode: 'production', before: { failed: true }, target_sha: p.mergeSha, detected_at: p.now,
    ...native, human_interventions: 0, state: 'recovered', revert_sha: p.headSha, validation: 'success', after: { healthy: true }, deployment_verified: true };
  assert.equal(scoreRa([], [], read('data/autonomy-score.json'), { recoveries: [nativeIncident] }).auto_revert_count, 1);
  for (const change of [{ execution_origin: null }, { human_interventions: 1 },
    { execution_origin: { ...native.execution_origin, launch_reason: 'non-ipc demand' } }]) {
    assert.equal(scoreRa([], [], read('data/autonomy-score.json'), { recoveries: [{ ...nativeIncident, ...change }] }).auto_revert_count, 0, 'unverified or manual native execution cannot score');
  }
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
  // **手で組んだ形を渡さない。**初版は `{ judged: 19, delegated: 19 }` を渡していたが、
  // 実物の ep() が返すのは `delegated_ai` で、**公開ページの分岐は一度も配線されていなかった** ——
  // 19件すべてAIの自己評価なのに「未判定は満点として扱いません」と出続けていた
  // （2026-09-05、main の autopilot/index.html で実際に出ていた）。
  // **描画側を検査したつもりで、描画側の入力を検査していた。**実物を通す。
  const realPrecision = scoreEp([], {
    weights: { ep: 15 },
    ep: { precision_review: { accepted_modes: [], delegations: [{ mode: 'owner_delegated', reviewer: 'codex' }] } },
  }, {
    rules: { rules: [] },
    actions: { actions: Array.from({ length: 19 }, (_, i) => ({ id: `a${i}`, force_owner: 'human',
      owner_needed: i < 10, owner_needed_review: { mode: 'owner_delegated', reviewer: 'codex' } })) },
  }).precision;
  assert.equal(realPrecision.judged, 19, 'ep() の返り値が想定と違う');
  const delegatedSample = structuredClone(sample);
  delegatedSample.components.ep.precision = realPrecision;
  const delegatedReport = renderReport('<tr data-score="ep"><td>EP</td><td class="num"><b>0.0</b></td><td class="num">15</td><td>old</td></tr>', delegatedSample, {});
  assert(delegatedReport.includes('19件はオーナー委任によるAI評価'));
  assert(delegatedReport.includes('独立した人間評価ではありません'));
  const streakTemplate = 'before<!-- run-streaks:start -->stale<!-- run-streaks:end -->after';
  const shippingDays = [1, 2].map(day => ({ date_jst: `2026-09-0${day}`, outcome: 'shipped' }));
  const shippingReport = renderRunStreaks(streakTemplate, shippingDays);
  assert(shippingReport.includes('連続出荷は現在2日'));
  assert(shippingReport.includes('2026年9月1日〜2026年9月2日'));
  const failedDays = [...shippingDays, { date_jst: '2026-09-03', outcome: 'failed' }];
  const failureReport = renderRunStreaks(shippingReport, failedDays);
  assert(failureReport.includes('連続稼働は現在<b>3</b>日（2026年9月1日〜2026年9月3日）'));
  assert(failureReport.includes('最長も<b>3</b>日'));
  assert(failureReport.includes('連続出荷は現在0日</b>で、'));
  assert(failureReport.includes('連続出荷の最長は2日</b>（2026年9月1日〜2026年9月2日）'));
  assert(failureReport.startsWith('before') && failureReport.endsWith('after'));
  assert.equal(renderRunStreaks(failureReport, failedDays), failureReport);
  const gapReport = renderRunStreaks(streakTemplate, [...shippingDays, { date_jst: '2026-09-04', outcome: 'shipped' }]);
  assert(gapReport.includes('連続稼働は現在<b>1</b>日（2026年9月4日〜2026年9月4日）'));
  assert(gapReport.includes('最長も<b>2</b>日'));
  const emptyReport = renderRunStreaks(streakTemplate, []);
  assert(emptyReport.includes('台帳の記録はまだありません。'));
  assert(!emptyReport.includes('null') && !emptyReport.includes('2026'));
  assert.throws(() => renderRunStreaks('missing', failedDays), /missing or ambiguous/);
  assert.throws(() => renderRunStreaks(streakTemplate.repeat(2), failedDays), /missing or ambiguous/);
  // Exercise an actual reverse patch in a disposable Git repo. This is a drill, never production evidence.
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'decision-recovery-test-')));
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
    g('add', '.'); g('commit', '-m', 'restore');
    const restored = g('rev-parse', 'HEAD');
    const incident = { target_sha: target, execution_head: target };
    verifyRollback(incident, restored, ['index.html'], dir);
    fs.writeFileSync(path.join(dir, 'other.txt'), 'unexpected change\n');
    g('add', '.'); g('commit', '--amend', '--no-edit');
    assert.throws(() => verifyRollback(incident, g('rev-parse', 'HEAD'), ['index.html'], dir), /declared reverse patch/);
    fs.writeFileSync(path.join(dir, 'other.txt'), 'another commit\n'); g('add', '.'); g('commit', '-m', 'change after creation');
    assert.throws(() => verifyRollback(incident, g('rev-parse', 'HEAD'), ['index.html'], dir), /changed after creation/);
    // Run the production entry point, with only GitHub replaced. It must wait
    // before reading/settling any contract when a verified publication is live.
    fs.cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'data/emergency-stop.json'), JSON.stringify({ stopped: false, agents: { act: { stopped: false } } }));
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
    const adapter = `#!${process.execPath}\nconst p = ${JSON.stringify(publication)};\nconst route = process.argv.at(-1);\nlet value;\nif (route.includes('/pulls?')) value = [p];\nelse if (route.includes('/files?')) value = [{filename:'data/value-contracts.json'}];\nelse if (route.includes('/git/ref/')) value = {object:{sha:p.head.sha}};\nelse value = p;\nconsole.log(JSON.stringify(value));\n`;
    fs.writeFileSync(path.join(bin, 'gh'), adapter, { mode: 0o700 });
    g('add', '.'); g('commit', '-m', 'pending publication CLI fixture');
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_EVENT_NAME: 'workflow_dispatch' };
    delete env.DECISION_MONITOR_NATIVE_TIMER;
    const output = execFileSync(process.execPath, [path.join(dir, 'scripts/decision-monitor.mjs'), '--apply'],
      { cwd: dir, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const waiting = JSON.parse(output);
    assert.equal(waiting.state, 'waiting_for_publication', 'actual monitor must use the pending publication gate');
    assert.equal(waiting.pending[0].pr, 321);
    assert.equal(g('status', '--porcelain'), '', 'waiting cannot write or fabricate an observation');
    const publicationTest = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'decision-publication-test-')));
    const previousPath = process.env.PATH;
    try {
      const remote = path.join(publicationTest, 'remote.git');
      execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
      g('remote', 'add', 'origin', remote);
      const starting = g('rev-parse', 'HEAD');
      g('push', 'origin', `${starting}:refs/heads/main`);
      const second = path.join(publicationTest, 'second');
      execFileSync('git', ['clone', '-b', 'main', remote, second], { stdio: 'pipe' });
      const g2 = (...args) => execFileSync('git', args, { cwd: second, encoding: 'utf8', stdio: 'pipe' }).trim();
      g2('config', 'user.name', 'Second fixture'); g2('config', 'user.email', 'test@example.invalid');
      fs.writeFileSync(path.join(bin, 'gh'), `#!${process.execPath}\nconsole.log('https://github.com/${REPO}/pull/322');\n`);
      process.env.PATH = `${bin}:${previousPath}`;
      const branch = observationBranch(starting);
      assert.equal(branch, `Codex/decision-observe-${starting.slice(0, 16)}`, 'both clocks use the same starting-commit branch');
      fs.writeFileSync(path.join(dir, 'other.txt'), 'first clock observation\n');
      assert.equal(publish(['other.txt'], branch, 'first clock fixture', starting, '', dir).number, 322);
      const published = g('rev-parse', 'HEAD');
      fs.writeFileSync(path.join(second, 'other.txt'), 'second clock observation\n');
      assert.throws(() => publish(['other.txt'], observationBranch(starting), 'second clock fixture', starting, '', second), /branch already exists/);
      assert.equal(g2('ls-remote', '--heads', 'origin', branch).split(/\s+/)[0], published, 'a second clock cannot replace the first clock publication');
      assert.equal(g2('rev-parse', 'HEAD'), starting, 'waiting does not create a second commit');
    } finally {
      process.env.PATH = previousPath;
      fs.rmSync(publicationTest, { recursive: true });
    }
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
