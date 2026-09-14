import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { companyAio } from './company-aio.mjs';
import { opportunities } from './company-loop.mjs';
import { ROOT, digest, formalMetrics } from './company-metrics.mjs';
import { saveReview } from './company-review.mjs';
import { experimentView } from './company-loop.mjs';

// Reuse the original synthetic Codex events and report builder. Importing the
// unittest module does not run tests or collect live/model observations.
const fixtures = JSON.parse(execFileSync('python3', ['-B', '-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('probe_tests', sys.argv[1])
tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tests)
good = tests.CodexProbeTests().report()
rows = good['observations'][:4] + [dict(question_id='Q5', question=tests.probe.legacy.QUESTIONS[4],
                                     **tests.probe.summarize('', 1))]
partial = tests.probe.build_report(rows, good['run_id'], good['started_at'], 'fixture')
tests.probe.validate_report(partial)
print(json.dumps(dict(good=good, partial=partial)))
`, path.join(ROOT, 'scripts/codex-ai-visibility-probe.test.py')], { encoding: 'utf8', timeout: 10000 }));
const now = new Date(new Date(fixtures.good.observed_at).getTime() + 3600000);
function source(t, report = fixtures.good) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'company-aio-'));
  fs.chmodSync(root, 0o700);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data'));
  const file = path.join(root, 'data/ai-visibility-probe.json');
  fs.writeFileSync(file, JSON.stringify(report));
  return { root, file };
}
function candidates(aio, growth = {}) {
  return opportunities({ growth: { aio, experiments: [{ id: 'independent-review', due: true }], followups:{reviews:[]}, ...growth }, automation: { failures: [] } });
}
function rejected(result) {
  assert.equal(result.status, 'unavailable');
  assert.equal(result.decision_input.actionable, false);
  assert.equal(result.unaided_mention_rate, null);
  assert.equal(result.unaided_own_site_citation_rate, null);
  assert.equal(result.unaided_valid_questions, null);
  assert.deepEqual(result.observations, []);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(candidates(result).map(c => c.id), ['evaluate:independent-review']);
}

test('original validated AIO values and independent candidates survive admission without changing source bytes', t => {
  const { root, file } = source(t), bytes = fs.readFileSync(file, 'utf8');
  let calls = 0;
  const run = (name, args, options) => {
    calls++;
    assert.equal(name, 'python3');
    assert.deepEqual(args.slice(0, 2), ['-B', '-c']);
    assert.equal(args.at(-1), path.join(ROOT, 'scripts/codex-ai-visibility-probe.py'));
    assert.equal(JSON.parse(options.input).report, bytes);
    assert.equal(options.timeout, 10000);
    return execFileSync(name, args, options);
  };
  const result = companyAio({ root, now, run });
  assert.equal(calls, 1);
  assert.equal(result.status, 'ok');
  assert.equal(result.decision_input.actionable, true);
  assert.equal(result.decision_input.sha256, digest(bytes));
  for (const key of ['series', 'observed_at', 'valid_questions', 'unaided_valid_questions', 'unaided_mention_rate', 'unaided_own_site_citation_rate']) {
    assert.equal(result[key], fixtures.good[key]);
  }
  assert.equal(result.observations.length, 5);
  assert.deepEqual(result.observations.map(q => q.transcript_sha256), fixtures.good.observations.map(q => q.transcript_sha256));
  assert.deepEqual(result.observations.map(q => q.cited_urls), fixtures.good.observations.map(q => q.cited_urls));
  assert.deepEqual(new Set(candidates(result).map(c => c.id)), new Set(['content:ai-visibility-gap', 'evaluate:independent-review']));
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

test('real global experiment blocks AIO content at selection while evidence and independent work remain', t => {
  const {root}=source(t),aio=companyAio({root,now});
  const file=path.join(ROOT,'growth/experiments/experiments.json'),bytes=fs.readFileSync(file);
  const original=JSON.parse(bytes).experiments.find(e=>e.id==='brand-2026-08-11-entity-merge');
  const global=experimentView(original,'2026-09-15');
  for(const item of [global,experimentView({...original,status:'frozen'},'2026-09-15')]) {
    const rows=candidates(aio,{experiments:[item,{id:'independent-review',due:true}]}),content=rows.find(c=>c.id==='content:ai-visibility-gap');
    assert.equal(content.executable,false);assert.equal(content.priority,null);
    assert.deepEqual(content.blocking_experiments,[original.id]);
    assert.equal(content.ownership_state,'read');assert.deepEqual(content.evidence,[aio]);
    assert.equal(rows.find(c=>c.priority!==null).id,'evaluate:independent-review');
  }
  assert(fs.readFileSync(file).equals(bytes));
});

test('AIO global follow-up and unreadable ownership cannot select publication; closed scopes release only the early gate', t => {
  const {root}=source(t),aio=companyAio({root,now});
  const content=g=>candidates(aio,g).find(c=>c.id==='content:ai-visibility-gap');
  const followup={id:'global-followup',status:'RUNNING',parent:{page:'(サイト全体)'}};
  const blocked=content({followups:{reviews:[followup]}});
  assert.equal(blocked.executable,false);assert.deepEqual(blocked.blocking_followups,[followup.id]);
  for(const growth of [{experiments:null},{followups:null},{followups:{reviews:[{id:'missing',status:'RUNNING'}]}},
    {experiments:[{id:'missing',status:'RUNNING'}]},
    {experiments:[{id:'malformed',status:'RUNNING',affected_area:'/known/',affected_pages:[null]}]}]) {
    const row=content(growth);assert.equal(row.executable,false);assert.equal(row.ownership_state,'unavailable');assert.equal(row.priority,null);
  }
  const rows=[content({followups:{reviews:[{...followup,status:'EVALUATED'}]}}),
    content({experiments:[{id:'closed',status:'INCONCLUSIVE',affected_area:'(サイト全体)'}]}),
    content({experiments:[{id:'specific',status:'RUNNING',affected_area:'/existing/'},
      {id:'external',status:'RUNNING',affected_area:'(PR配信 — 自律運用/RSI)'}]})];
  for(const row of rows){assert.equal(row.executable,true);assert.equal(row.ownership_scope,'global_only_until_concrete_page_selected');}
  assert.deepEqual(rows[2].unenumerated_experiment_scopes,['external']);
});

test('original health gate rejects a valid partial report even with four unaided answers', t => {
  assert.equal(fixtures.partial.unaided_valid_questions, 4);
  const { root } = source(t, fixtures.partial);
  const result = companyAio({ root, now });
  rejected(result);
  assert.equal(result.failures[0], 'existing_probe_health_validation_failed');
});

test('original eight-day health boundary is inclusive; stale and future evidence cannot select work', t => {
  const { root } = source(t), observed = new Date(fixtures.good.observed_at).getTime();
  assert.equal(companyAio({ root, now: new Date(observed + 8 * 86400000) }).status, 'ok');
  rejected(companyAio({ root, now: new Date(observed + 8 * 86400000 + 1) }));
  rejected(companyAio({ root, now: new Date(observed - 1) }));
});

for (const [name, change] of [
  ['protocol drift', r => { r.protocol.repository_context = true; }],
  ['another model series', r => { r.series = 'claude-sonnet-web-v1'; }],
  ['duplicate question sessions', r => { r.observations[1].thread_id = r.observations[0].thread_id; }],
  ['missing search evidence', r => { r.observations[0].search_events = []; }],
  ['incorrect aggregates', r => { r.unaided_valid_questions = 400; }],
  ['a forged zero mention rate', r => { r.observations[0].answer = 'Use SimpleMemo.'; }],
  ['changed fixed question', r => { r.observations[0].question = 'different'; }],
  ['failed turn claimed successful', r => { r.observations[0].exit_code = 1; }],
  ['missing transcript digest', r => { delete r.observations[0].transcript_sha256; }],
  ['unobserved billed cost', r => { r.total_cost_usd = 0; }],
]) test('AIO admission rejects ' + name, t => {
  const report = structuredClone(fixtures.good); change(report);
  const { root } = source(t, report);
  rejected(companyAio({ root, now }));
});

test('missing or malformed source and unavailable validator are isolated and never retried', t => {
  const { root, file } = source(t);
  let calls = 0;
  const failedRun = () => { calls++; throw Error('fixture interpreter failure'); };
  const failed = companyAio({ root, now, run: failedRun });
  rejected(failed); assert.equal(failed.failures[0], 'probe_validator_unavailable'); assert.equal(calls, 1);
  rejected(companyAio({ root, now, run: () => 'unexpected output' }));
  fs.writeFileSync(file, '{broken');
  rejected(companyAio({ root, now, run: failedRun })); assert.equal(calls, 1);
  fs.writeFileSync(file, 'null'); rejected(companyAio({ root, now }));
  fs.unlinkSync(file);
  rejected(companyAio({ root, now, run: failedRun })); assert.equal(calls, 1);
});

test('legacy unvalidated or explicitly rejected AIO summaries cannot select an action', () => {
  for (const aio of [fixtures.good, { ...fixtures.good, decision_input: { actionable: false } }]) {
    assert.deepEqual(candidates(aio).map(c => c.id), ['evaluate:independent-review']);
  }
});

test('invalid UTF-8 and a BOM cannot be silently rewritten into admissible report bytes', t => {
  const { root, file } = source(t), original = fs.readFileSync(file);
  const broken = Buffer.from(original);
  const offset = broken.indexOf('Use Apple Notes'); assert.notEqual(offset, -1);
  broken[offset] = 0x80;
  for (const raw of [broken, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original])]) {
    fs.writeFileSync(file, raw);
    const result = companyAio({ root, now, run: () => { assert.fail('invalid encoding must not reach validator'); } });
    rejected(result);
    assert.equal(result.decision_input.sha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(result.failures[0], 'probe_read_or_json_failed');
    assert.throws(() => execFileSync('python3', ['-B', '-c',
      'import json, pathlib, sys; json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))', file],
      { stdio: 'pipe' }));
  }
});

test('rechecking the same AIO evidence stays quiet; admission failure remains a material change', t => {
  const { root } = source(t), metrics = formalMetrics({ now });
  fs.writeFileSync(path.join(root, 'metrics-baseline.json'), JSON.stringify(metrics), { mode: 0o600 });
  const observation = aio => ({ growth: { aio, experiments: [] }, formal_metrics: metrics,
    human_touches: { manual_starts: 0 }, failures: [], automation: { failures: [], discovery_gaps: [] } });
  const first = companyAio({ root, now });
  const second = companyAio({ root, now: new Date(now.getTime() + 1000) });
  assert.notEqual(first.decision_input.checked_at, second.decision_input.checked_at);
  assert.equal(saveReview(observation(first), { stateRoot: root, now }).notification, 'material_change');
  assert.equal(saveReview(observation(second), { stateRoot: root, now }).notification, 'quiet');
  const expired = companyAio({ root, now: new Date(now.getTime() + 9 * 86400000) });
  assert.equal(saveReview(observation(expired), { stateRoot: root, now }).notification, 'material_change');
});
