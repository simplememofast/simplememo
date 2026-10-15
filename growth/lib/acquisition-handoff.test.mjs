// acquisition-daily.yml の契約。鍵の隣で走るコード・権限・出力の形を、ファイルの現物で固定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as H from './acquisition-handoff.mjs';
import * as Seal from '../scripts/seal-acquisition-appsflyer.mjs';
import { decide, gate, ownArtifacts } from '../scripts/acquisition-gate.mjs';
import { padToBucket } from '../scripts/export-analytics.mjs';
import { SCHEDULE_EXPECTATIONS } from '../../scripts/lib/cron-silence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WF = fs.readFileSync(path.join(ROOT, H.ACQUISITION_WORKFLOW), 'utf8');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = rel => sha256(fs.readFileSync(path.join(ROOT, rel)));

// Minimal line parser for this workflow's fixed layout: top-level keys, jobs, steps.
function jobs(text = WF) {
  const lines = text.split('\n'), out = {};
  const start = lines.indexOf('jobs:');
  let job = null;
  for (const line of lines.slice(start + 1)) {
    const j = /^  ([a-z0-9_-]+):\s*$/.exec(line);
    if (j) { job = out[j[1]] = { head: [], steps: [] }; continue; }
    if (!job) continue;
    if (/^      - /.test(line)) { job.steps.push([line]); continue; }
    if (job.steps.length && (/^        /.test(line) || line.trim() === '' || /^      #/.test(line))) {
      if (/^      #/.test(line)) continue;
      job.steps.at(-1).push(line); continue;
    }
    job.head.push(line);
  }
  for (const j of Object.values(out)) j.steps = j.steps.map(s => ({ text: s.join('\n'),
    name: /name: (.+)$/.exec(s.find(l => /^\s+-? ?name: /.test(l)) ?? '')?.[1]?.trim() ?? null }));
  return out;
}
const J = jobs();
const stepIndex = (job, pattern) => J[job].steps.findIndex(s => pattern.test(s.text));

test('triggers: schedule and manual dispatch only; top-level permissions are empty', () => {
  const on = WF.slice(WF.indexOf('\non:'), WF.indexOf('\npermissions:'));
  assert.match(on, /schedule:\n\s+- cron: '23 21 \* \* \*'/);
  assert.match(on, /workflow_dispatch:/);
  for (const forbidden of ['pull_request', 'pull_request_target', 'workflow_run', 'issue_comment', 'push:', 'repository_dispatch'])
    assert(!on.includes(forbidden), forbidden);
  assert.match(WF, /\npermissions: \{\}\n/);
  assert.deepEqual(Object.keys(J), ['gate', 'ga4', 'appsflyer']);
  assert(!/\$\{\{\s*github\.event\./.test(WF), 'no github.event expressions at all');
  assert(!WF.includes('GITHUB_STEP_SUMMARY'), 'nothing is written to the job summary');
});

test('every job is main-only; credentialed jobs run once per run and need the gate', () => {
  for (const [name, job] of Object.entries(J)) {
    const head = job.head.join('\n');
    assert.match(head, /^    if: github\.ref == 'refs\/heads\/main'/m, name);
    if (name !== 'gate') {
      assert.match(head, /needs: gate/); assert.match(head, /github\.run_attempt == '1'/, name);
      assert.match(head, new RegExp(`needs\\.gate\\.outputs\\.${name} == 'true'`), name);
    }
    assert(!/write/.test(head.slice(head.indexOf('permissions:'))), `${name}: no write permission`);
  }
  assert.match(J.gate.head.join('\n'), /permissions:\n      contents: read\n      actions: read\n/);
  assert.match(J.ga4.head.join('\n'), /permissions:\n      contents: read\n    steps:/);
  // actions: read only for the environment-policy readback before the token step.
  assert.match(J.appsflyer.head.join('\n'), /permissions:\n      contents: read\n      actions: read\n    steps:/);
});

test('the AppsFlyer token is an environment secret that only the appsflyer job can receive', () => {
  // Repository secrets are scrubbed only per workflow (GitHub docs); environment secrets reach only
  // jobs that reference the environment. So exactly one job references it, and only it names the token.
  const declared = Object.entries(J).filter(([, j]) => /^    environment:/m.test(j.head.join('\n'))).map(([name]) => name);
  assert.deepEqual(declared, ['appsflyer']);
  assert.match(J.appsflyer.head.join('\n'), new RegExp(`\\n    environment:\\n      name: ${H.APPSFLYER_ENVIRONMENT}\\n      deployment: false\\n`));
  assert.equal((WF.match(/\benvironment:/g) ?? []).length, 1);
  for (const name of ['gate', 'ga4']) {
    const text = [...J[name].head, ...J[name].steps.map(s => s.text)].join('\n');
    assert(!text.includes(H.APPSFLYER_SECRET), `${name} must not reference the AppsFlyer token`);
  }
  const outside = WF.slice(0, WF.indexOf('\n  appsflyer:\n'));
  assert(!outside.includes('secrets.' + H.APPSFLYER_SECRET), 'no reference before the appsflyer job');
});

test('each secret is only in its single step; presence is a boolean env, never in if:', () => {
  for (const line of WF.split('\n')) if (/^\s*(- )?if:/.test(line)) assert(!line.includes('secrets.'), line);
  const gcp = [...WF.matchAll(/secrets\.GCP_SERVICE_ACCOUNT_JSON/g)];
  assert.equal(gcp.length, 1);
  const exportStep = J.ga4.steps[stepIndex('ga4', /id: export/)];
  assert.match(exportStep.text, /GOOGLE_SERVICE_ACCOUNT_JSON: \$\{\{ secrets\.GCP_SERVICE_ACCOUNT_JSON \}\}/);
  const refs = [...WF.matchAll(/secrets\.APPSFLYER_AGGREGATE_API_TOKEN[^}]*\}\}/g)].map(m => m[0]);
  assert.deepEqual(refs, ["secrets.APPSFLYER_AGGREGATE_API_TOKEN != '' }}", 'secrets.APPSFLYER_AGGREGATE_API_TOKEN }}']);
  const key = J.appsflyer.steps[0], materialize = J.appsflyer.steps[stepIndex('appsflyer', /Materialize the token/)];
  assert.match(key.text, /HAS_KEY: \$\{\{ secrets\.APPSFLYER_AGGREGATE_API_TOKEN != '' \}\}/);
  assert.match(materialize.text, /APPSFLYER_AGGREGATE_API_TOKEN: \$\{\{ secrets\.APPSFLYER_AGGREGATE_API_TOKEN \}\}/);
  assert.equal(J.appsflyer.steps.filter(s => s.text.includes('secrets.')).length, 2);
  assert.match(materialize.text, /umask 077/);
  assert.match(materialize.text, /"\$HOME\/\.config\/appsflyer\/simplememo\/aggregate-api\.token"/);
  assert(!/echo[^\n]*APPSFLYER_AGGREGATE_API_TOKEN/.test(materialize.text), 'the value is never echoed');
});

test('pinned hashes are literal, current, and verified before the token exists', () => {
  const pins = /<<'PINS'\n([\s\S]*?)\n\s*PINS\n/.exec(WF)?.[1].split('\n').map(l => l.trim().split(/\s+/));
  assert.deepEqual(pins.map(p => p[1]), H.PINNED_FILES);
  for (const [hash, rel] of pins) assert.equal(hash, fileSha(rel), `${rel}: update the pin in acquisition-daily.yml together with the file`);
  assert.equal(pins[0][0], H.APPSFLYER_READER_SHA256);
  assert.match(WF, new RegExp(`\\n  RECIPIENT_SPKI_SHA256: ${H.RECIPIENT_SPKI_SHA256}\\n`));
  assert.equal(Seal.RECIPIENT_SPKI_SHA256, H.RECIPIENT_SPKI_SHA256);
  const pinsAt = stepIndex('appsflyer', /sha256sum --check --strict - <<'PINS'/);
  const envAt = J.appsflyer.steps.findIndex(s => s.name === H.ENVIRONMENT_STEP);
  const tokenAt = stepIndex('appsflyer', /Materialize the token/), readAt = stepIndex('appsflyer', /id: read/);
  const removeAt = stepIndex('appsflyer', /Remove the token file/), sealAt = stepIndex('appsflyer', /id: seal/);
  assert(pinsAt > 0 && pinsAt < envAt && envAt < tokenAt && tokenAt < readAt && readAt < removeAt && removeAt < sealAt);
  assert.match(J.appsflyer.steps[pinsAt].text, /recipient\.der/);
  // Between the pins and the token removal, the only repository code is the pinned reader, isolated from its directory.
  const between = J.appsflyer.steps.slice(0, removeAt).map(s => s.text).join('\n');
  assert.deepEqual([...between.matchAll(/\b(node|python3)\s+([^\s"]+(?:\s+[^\s"]+)?)/g)].map(m => m[0]), ['python3 -I growth/vendor/appsflyer_aggregate.py']);
  assert.match(J.appsflyer.steps[removeAt].text, /if: always\(\) && steps\.key\.outputs\.has_key == 'true'/);
  assert.match(J.appsflyer.steps[sealAt].text, /if: steps\.key\.outputs\.has_key == 'true'\n/, 'implicit success(): seal only after removal succeeded');
  // The GA4 job checks the same recipient before its credential step.
  assert(stepIndex('ga4', /RECIPIENT_SPKI_SHA256/) < stepIndex('ga4', /id: export/));
});

// The token job, step by step. Adding, removing or reordering a step, or running any other
// repository file or interpreter in it, fails here; the pins then make the diff visible in the workflow.
const APPSFLYER_STEPS = ['AppsFlyer key present (boolean only)', H.KEY_PENDING_STEP, null, null,
  H.PINS_STEP, H.ENVIRONMENT_STEP, 'Materialize the token (value only in this step)',
  'Read the aggregate with the pinned reader', 'Remove the token file (always, right after the read)',
  'Seal the reader output for the pinned recipient', 'Retain only the encrypted output', 'Remove the token and plaintext', 'Reader outcome'];

test('the token job runs only its fixed steps and no repository code but the pinned files', () => {
  assert.deepEqual(J.appsflyer.steps.map(s => s.name), APPSFLYER_STEPS);
  const runs = J.appsflyer.steps.map(s => s.text.slice(s.text.indexOf('run:') >= 0 ? s.text.indexOf('run:') : s.text.length)).join('\n');
  const repoPaths = [...runs.matchAll(/(?:^|[\s"'=(])((?:\.\/|\.\.\/)?(?:growth|scripts|data|functions|\.github|node_modules)\/[^\s"';)]+)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(repoPaths)].sort(), [...H.PINNED_FILES].sort());
  const interpreters = [...runs.matchAll(/(?:^|[\s;&|(])(node|nodejs|npx|npm|python3?|pip3?|uv|bash|sh|zsh|source|deno|bun|ruby|perl|make)\b(?=\s)/gm)].map(m => m[1]);
  assert.deepEqual(interpreters, ['python3', 'node'], 'only the pinned reader and the seal script run');
  // No action runs while the token file exists.
  const window = J.appsflyer.steps.slice(stepIndex('appsflyer', /Materialize the token/), stepIndex('appsflyer', /Remove the token file/) + 1);
  assert(window.every(s => !/uses:/.test(s.text)));
  const env = J.appsflyer.steps.find(s => s.name === H.ENVIRONMENT_STEP).text;
  assert.match(env, /if: steps\.key\.outputs\.has_key == 'true'\n/);
  assert.match(env, new RegExp(`environments/${H.APPSFLYER_ENVIRONMENT}"`));
  assert.match(env, /\[ "\$policy" != "false true" \] \|\| \[ "\$rules" != "branch:main" \]/);
  assert.match(env, /status=environment_unverified"\n\s+exit 1/);
  assert(!/secrets\./.test(env));
});

test('every action in every job is pinned by commit SHA', () => {
  for (const [name, job] of Object.entries(J)) {
    const uses = job.steps.map(s => /uses: (\S+)/.exec(s.text)?.[1]).filter(Boolean);
    assert(uses.length >= 2, name);
    for (const u of uses) assert.match(u, /^actions\/(checkout|setup-node|upload-artifact)@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  assert.equal((WF.match(/uses: /g) ?? []).length, 8);
});

test('the seal script imports only node built-ins and the pinned envelope module', () => {
  const imports = file => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
  assert.deepEqual(imports(H.APPSFLYER_SEAL_PATH).filter(s => !s.startsWith('node:')), ['../lib/analytics-envelope.mjs']);
  assert.deepEqual(imports('growth/lib/analytics-envelope.mjs'), ['node:crypto']);
  for (const [k, v] of [['HANDOFF_SCHEMA', H.APPSFLYER_HANDOFF_SCHEMA], ['REPOSITORY', H.ACQUISITION_REPO],
    ['WORKFLOW', H.ACQUISITION_WORKFLOW], ['READER_PATH', H.APPSFLYER_READER_PATH], ['CREDENTIAL_ORIGIN', H.APPSFLYER_CREDENTIAL_ORIGIN]])
    assert.equal(Seal[k], v, k);
});

test('artifacts are encrypted envelopes only, named by the gate, retained at most 14 days', () => {
  const uploads = Object.values(J).flatMap(j => j.steps).filter(s => /uses: actions\/upload-artifact@/.test(s.text));
  assert.equal(uploads.length, 2);
  for (const u of uploads) {
    assert(Number(/retention-days: (\d+)/.exec(u.text)[1]) <= H.RETENTION_DAYS);
    assert.match(u.text, /path: \$\{\{ runner\.temp \}\}\/[a-z0-9-]+\/[a-z]+\.enc\.json\n/);
    assert.match(u.text, /name: \$\{\{ needs\.gate\.outputs\.(ga4|af)_artifact \}\}/);
    assert.match(u.text, /if-no-files-found: error/);
  }
  // GA4 plaintext is padded too: artifact sizes are public.
  const exportStep = J.ga4.steps[stepIndex('ga4', /id: export/)].text;
  assert.match(exportStep, new RegExp(`ANALYTICS_PAD_BUCKET: '${H.GA4_PAD_BUCKET}'`));
  const small = padToBucket({ status: 'complete', rows: [1] }, H.GA4_PAD_BUCKET);
  const large = padToBucket({ status: 'complete', rows: Array.from({ length: 5000 }, (_, i) => ({ i, v: 'x'.repeat(20) })) }, H.GA4_PAD_BUCKET);
  for (const x of [small, large]) assert.equal(Buffer.byteLength(JSON.stringify(x), 'utf8') % H.GA4_PAD_BUCKET, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(small)), Buffer.byteLength(JSON.stringify(large)));
  assert.match(small.padding, /^ *$/);
  for (const bad of [0, 1024, NaN, 32 * 1024 ** 2, 1.5]) assert.throws(() => padToBucket({}, bad), /Invalid padding bucket/);
  assert.equal(H.ga4ArtifactName('2026-10-10'), 'acquisition-ga4-funnel-2026-10-10');
  assert.match(H.appsflyerArtifactName('2026-10-14'), H.APPSFLYER_ARTIFACT);
});

test('contract names read by the ingest exist in the workflow; stop route and schedule watch are wired', () => {
  assert.equal(J.appsflyer.steps.filter(s => s.name === H.KEY_PENDING_STEP).length, 1);
  assert.match(J.appsflyer.steps[1].text, /if: steps\.key\.outputs\.has_key != 'true'/);
  assert.match(J.gate.steps.at(-1).text, /run: node growth\/scripts\/acquisition-gate\.mjs/);
  const gateSource = fs.readFileSync(path.join(ROOT, 'growth/scripts/acquisition-gate.mjs'), 'utf8');
  assert.match(gateSource, /data\/emergency-stop\.json/); assert.match(gateSource, /acquisitionStop\(/);
  assert.match(WF, /emergency-stop\.json/); assert.match(WF, /"acquisition"/);
  const stop = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/emergency-stop.json'), 'utf8'));
  assert.equal(typeof stop.agents.acquisition.stopped, 'boolean');
  assert.deepEqual({ ...SCHEDULE_EXPECTATIONS.at(-1) }, { path: H.ACQUISITION_WORKFLOW, max_silence_minutes: 1680 });
  const credentials = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/credential-expiry.json'), 'utf8')).credentials;
  const af = credentials.find(c => c.secret === H.APPSFLYER_SECRET);
  assert.deepEqual(af.agents, ['acquisition']); assert.equal(af.vendor, 'appsflyer'); assert(af.revocation && af.blast_radius);
  assert(credentials.find(c => c.secret === 'GCP_SERVICE_ACCOUNT_JSON').agents.includes('acquisition'));
});

test('the vendored reader is the reviewed byte-identical copy and carries no local identity', () => {
  const bytes = fs.readFileSync(path.join(ROOT, H.APPSFLYER_READER_PATH));
  assert.equal(sha256(bytes), H.APPSFLYER_READER_SHA256);
  const text = bytes.toString('utf8');
  assert(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text), 'ASCII only');
  assert(!/\/Users\/|\/home\/[a-z]/.test(text));
  assert.match(text, /TOKEN_PATH = Path\.home\(\) \/ '\.config\/appsflyer\/simplememo\/aggregate-api\.token'/);
  // Optional local parity with the private API checkout; CI has no sibling checkout.
  const api = path.join(ROOT, '..', 'simplememo-api');
  if (fs.existsSync(path.join(api, '.git'))) {
    let upstream = null;
    try { upstream = execFileSync('git', ['show', 'origin/main:' + H.APPSFLYER_READER_UPSTREAM], { cwd: api }); } catch { /* not available */ }
    if (upstream) assert.equal(sha256(upstream), H.APPSFLYER_READER_SHA256, 'API origin/main reader diverged: review and re-vendor');
  }
});

const ledger = (acquisition = { stopped: false, reason: null }, extra = {}) => ({ stopped: false,
  agents: { actions: { stopped: false }, ...(acquisition ? { acquisition } : {}) }, ...extra });

test('gate: fail closed without the route; global and route stops win; the autopilot route is not coupled', () => {
  assert.throws(() => H.acquisitionStop(ledger(null)), e => e.code === 'stop_route_missing');
  assert.throws(() => H.acquisitionStop({ agents: { acquisition: { stopped: false } } }), e => e.code === 'stop_route_missing');
  assert.deepEqual(H.acquisitionStop(ledger(undefined, { stopped: true })), { stopped: true, scope: 'global' });
  assert.deepEqual(H.acquisitionStop(ledger({ stopped: true, reason: 'x' })), { stopped: true, scope: 'acquisition' });
  const actionsStopped = ledger(); actionsStopped.agents.actions.stopped = true;
  assert.deepEqual(H.acquisitionStop(actionsStopped), { stopped: false, scope: null });
});

test('gate: modes, stops and one collection per end-date', () => {
  const now = new Date('2026-10-14T21:30:00Z'), go = { stopped: false };
  const stopped = decide({ stop: { stopped: true, scope: 'acquisition' }, mode: 'export', event: 'schedule', now });
  assert.equal(stopped.run, false); assert.equal(stopped.ga4, false); assert.equal(stopped.appsflyer, false);
  const dry = decide({ stop: go, mode: 'dry-run', event: 'workflow_dispatch', runId: '77', now });
  assert.deepEqual([dry.ga4, dry.appsflyer, dry.ga4_execution, dry.ga4_artifact], [true, false, 'dry-run', 'acquisition-ga4-dryrun-77']);
  const full = decide({ stop: go, mode: 'export', event: 'schedule', now });
  assert.deepEqual([full.ga4_start, full.ga4_end, full.af_start, full.af_end], ['2026-10-04', '2026-10-10', '2026-09-17', '2026-10-14']);
  assert.deepEqual([full.ga4, full.appsflyer, full.ga4_artifact], [true, true, 'acquisition-ga4-funnel-2026-10-10']);
  const again = decide({ stop: go, mode: 'export', event: 'schedule', now, ga4Exists: true, appsflyerExists: true });
  assert.deepEqual([again.ga4, again.appsflyer], [false, false]);
  assert.throws(() => decide({ stop: go, mode: 'dry-run', event: 'schedule', now }), /invalid_mode/);
  assert.throws(() => decide({ stop: go, mode: 'anything', event: 'workflow_dispatch', now }), /invalid_mode/);
});

test('gate: unreadable artifact listings fail instead of querying twice; forks and branches never count', async () => {
  const env = { GITHUB_REPOSITORY: H.ACQUISITION_REPO, GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ID: '9',
    GITHUB_EVENT_NAME: 'schedule', ACQUISITION_MODE: 'export', GITHUB_TOKEN: 'x' };
  const now = new Date('2026-10-14T21:30:00Z'), stopDoc = ledger();
  const own = { repository_id: 1, head_repository_id: 1, head_branch: 'main' };
  const artifact = (name, run = own) => ({ name, workflow_run: run });
  const fetchWith = rows => async url => ({ ok: true, json: async () => {
    const name = decodeURIComponent(/name=([^&]+)/.exec(url)[1]); const hits = rows.filter(r => r.name === name);
    return { total_count: hits.length, artifacts: hits };
  } });
  const fresh = await gate({ env, now, stopDoc, fetchImpl: fetchWith([]) });
  assert.deepEqual([fresh.ga4, fresh.appsflyer], [true, true]);
  const done = await gate({ env, now, stopDoc, fetchImpl: fetchWith([artifact('acquisition-ga4-funnel-2026-10-10')]) });
  assert.deepEqual([done.ga4, done.appsflyer], [false, true]);
  const foreign = await gate({ env, now, stopDoc, fetchImpl: fetchWith([
    artifact('acquisition-ga4-funnel-2026-10-10', { ...own, head_repository_id: 2 }),
    artifact('acquisition-appsflyer-2026-10-14', { ...own, head_branch: 'feature' })]) });
  assert.deepEqual([foreign.ga4, foreign.appsflyer], [true, true]);
  await assert.rejects(gate({ env, now, stopDoc, fetchImpl: async () => ({ ok: false }) }), /artifact_listing_unavailable/);
  // A network or body failure is a listing problem, not a stop-ledger problem.
  await assert.rejects(gate({ env, now, stopDoc, fetchImpl: async () => { throw new TypeError('fetch failed'); } }), /artifact_listing_unavailable/);
  await assert.rejects(gate({ env, now, stopDoc, fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('x'); } }) }), /artifact_listing_unavailable/);
  assert.throws(() => ownArtifacts({ total_count: 2, artifacts: [] }, 'x'), /artifact_listing_incomplete/);
  await assert.rejects(gate({ env: { ...env, GITHUB_REF: 'refs/heads/feature' }, now, stopDoc }), /invalid_runtime/);
  const halted = await gate({ env, now, stopDoc: ledger({ stopped: true, reason: 'test' }), fetchImpl: () => assert.fail('no read when stopped') });
  assert.equal(halted.run, false);
});

const runtimeEnv = { GITHUB_REPOSITORY: H.ACQUISITION_REPO, GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: H.ACQUISITION_WORKFLOW_REF,
  GITHUB_EVENT_NAME: 'schedule', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'b'.repeat(40) };
function readerOutput(t, { ok = true, csv = 'Date,Installs\n2026-10-14,1\n', mutate = () => {} } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'af-seal-')); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const metaDir = path.join(base, 'meta'), readRoot = path.join(base, 'read'), run = path.join(readRoot, '20261015T000000Z-abcdef12');
  fs.mkdirSync(metaDir); fs.mkdirSync(run, { recursive: true });
  const result = { ok, http_status: ok ? 200 : 401, parameters: { from: '2026-09-17', to: '2026-10-14' },
    started_at: '2026-10-14T21:40:00+00:00', ...(ok ? { quality: { sha256: sha256(csv), row_cap_hit: false } } : { error: 'http_request_failed' }) };
  mutate(result);
  fs.writeFileSync(path.join(run, 'result.json'), JSON.stringify(result));
  if (ok) fs.writeFileSync(path.join(run, 'report.csv'), csv);
  fs.writeFileSync(path.join(metaDir, 'stdout.json'), JSON.stringify({ ok, output: run, http_status: result.http_status,
    error: result.error ?? null, rows: ok ? 1 : null, sha256: result.quality?.sha256 ?? null }));
  return { metaDir, readRoot, start: '2026-09-17', end: '2026-10-14', readerExit: ok ? '0' : '1',
    readerFile: path.join(ROOT, H.APPSFLYER_READER_PATH), env: runtimeEnv, now: new Date('2026-10-14T21:41:00Z') };
}

test('seal: packs the reader output with provenance and the actual credential origin', t => {
  const p = Seal.packAppsFlyerHandoff(readerOutput(t));
  assert.equal(p.schema, H.APPSFLYER_HANDOFF_SCHEMA); assert.equal(p.credential_origin, H.APPSFLYER_CREDENTIAL_ORIGIN);
  assert.deepEqual(p.provenance, { repository: H.ACQUISITION_REPO, workflow: H.ACQUISITION_WORKFLOW, workflow_ref: H.ACQUISITION_WORKFLOW_REF,
    ref: 'refs/heads/main', run_id: '123', run_attempt: 1, head_sha: 'b'.repeat(40), event: 'schedule' });
  assert.equal(p.reader.sha256, H.APPSFLYER_READER_SHA256); assert.equal(p.reader.ok, true);
  assert.equal(Buffer.from(p.csv_base64, 'base64').toString(), 'Date,Installs\n2026-10-14,1\n');
  const sizes = [p, Seal.packAppsFlyerHandoff(readerOutput(t, { csv: 'Date,Installs\n' + '2026-10-14,1\n'.repeat(400) }))]
    .map(x => Buffer.byteLength(JSON.stringify(x), 'utf8'));
  assert.deepEqual(sizes.map(n => n % Seal.PAD_BUCKET), [0, 0], 'envelope size must not track the row count');
  assert.equal(sizes[0], sizes[1]);
  const failed = Seal.packAppsFlyerHandoff(readerOutput(t, { ok: false }));
  assert.equal(failed.reader.ok, false); assert.equal(failed.csv_base64, null); assert.equal(failed.reader.error, 'http_request_failed');
});

test('seal: inconsistent reader output, foreign destinations and non-main runtimes are refused', t => {
  assert.throws(() => Seal.packAppsFlyerHandoff(readerOutput(t, { mutate: r => { r.quality.sha256 = '0'.repeat(64); } })), /reader_output_inconsistent/);
  assert.throws(() => Seal.packAppsFlyerHandoff(readerOutput(t, { mutate: r => { r.parameters.to = '2026-10-13'; } })), /reader_output_inconsistent/);
  const outside = readerOutput(t); const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'af-else-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside.metaDir, 'stdout.json'), JSON.stringify({ ok: true, output: elsewhere }));
  assert.throws(() => Seal.packAppsFlyerHandoff(outside), /unexpected_reader_destination/);
  for (const change of [{ GITHUB_REF: 'refs/heads/feature' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY: 'fork/simplememo' },
    { GITHUB_WORKFLOW_REF: 'simplememofast/simplememo/.github/workflows/other.yml@refs/heads/main' }])
    assert.throws(() => Seal.packAppsFlyerHandoff({ ...readerOutput(t), env: { ...runtimeEnv, ...change } }), /invalid_runtime/);
});

test('seal CLI: a foreign recipient fails closed and prints only a status line', t => {
  const r = readerOutput(t), out = path.join(path.dirname(r.metaDir), 'out', 'appsflyer.enc.json');
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const run = spawnSync(process.execPath, [path.join(ROOT, H.APPSFLYER_SEAL_PATH), r.metaDir, r.readRoot, out], { encoding: 'utf8',
    env: { ...process.env, ...runtimeEnv, AF_START: r.start, AF_END: r.end, READER_EXIT: '0', GITHUB_OUTPUT: '',
      ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64: Buffer.from(publicKey).toString('base64') } });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.equal(run.stderr.trim(), 'status=seal_failed reason=recipient_mismatch');
  assert.equal(fs.existsSync(out), false);
});
