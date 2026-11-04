import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { audit, isPr2139Publication, pr7PublicationException } from './check-pr-release-ledger.mjs';
import { extractCommands } from './preflight.mjs';
import { wiredChecks, gatingChecks } from './check-selftests.mjs';
import { score, UNSCORED_VERDICT } from '../growth/scripts/d-score.mjs';

const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const PR7_ID = 'pr7-dialogue-memo';
const FROZEN_ON = '2026-11-04';
// Frozen at origin/main 671c6a8eb (2026-11-04), before PR⑦ left known_unrecorded.
// Copied value for value; do not edit. The live ledger keeps the same entry under
// resolved_unrecorded, and a test below asserts that the two still agree.
const PARKED_TOP_LEVEL = Object.freeze({
  "cross_check_from": "2026-09-03",
  "last_confirmed_complete": "2026-11-04",
  "max_days_between_confirmations": 21
});
const PARKED_PR7 = Object.freeze({
  "id": "pr7-dialogue-memo",
  "url": "https://prtimes.jp/main/html/rd/p/000000011.000182412.html",
  "published_at": "2026-09-24",
  "subject_hint": "「シンプルメモ」、Apple Intelligence活用の新機能「対話メモ」を提供開始",
  "why_unrecorded": "annotations.json には #1568 で行が入ったが、experiments.json にレコードが無い。そのため (a) --backtest が『1 件は書式が違い拾えなかった』として n=6 のまま数え、(b) pr-evaluation-due.mjs が 2026-10-08 の D+14 を拾わない。配信前採点は行われていない。prtimes.jp はこの環境から到達できない（CONNECT tunnel 403 を 2026-09-24 に実測）ので、本文を読んでの採点は機械にはできない。",
  "resolve_by": "2026-11-11",
  "$comment": "D+14 が 2026-10-08。それまでに experiments.json へ status:running のレコードを作れば、pr-evaluation-due.mjs が当日に拾う。**採点は人の仕事**（台帳の既存の規約と同じ）。",
  "$comment_extension_2026_10_04": "2026-10-04、オーナーの判断で期限を 2026-10-08 から 2026-10-22 へ延ばした。理由：D+14（10/8）の数字は PR TIMES の分析画面からオーナーが取るもので、配信前採点も無く、採点は人の仕事（上の $comment のとおり）。experiments.json の行は、その数字と判断がそろってから作る。延ばしただけで、記録が済んだわけではない。",
  "$comment_extension_2026_10_23": "2026-10-23、オーナーの判断で期限を 2026-10-22 から 2026-11-04 へ延ばした。理由は 10-04 と同じで、D+14 の数字はまだオーナーが PR TIMES の分析画面から取っておらず、採点は人の仕事。期限切れで全 PR の SEO Validation が落ちていた（オーナーへの確認のうえ）。11-04 は全件確認の期限（last_confirmed_complete 2026-10-14 から 21 日）と同じ日にそろえた。延ばしただけで、記録が済んだわけではない。",
  "$comment_extension_2026_11_04": "2026-11-04、オーナーの判断で期限を 2026-11-04 から 2026-11-11 へ延ばした。**閉じる変更を検査つきで入れるまでのつなぎで、記録が済んだわけではない。** オーナーは同じ日に、この配信を延長し続けず、必須4指標がそろわない配信として experiments.json で評価済み（measurement_failed）に閉じる扱いを選んだ。その変更は検査コードとテストの手直しを含むので、レビューを経た別の PR として出し、入れる前にオーナーへ確認する。それが入るまでのあいだ、期限切れで全 PR の SEO Validation が落ちるのを避けるために 7 日だけ延ばす。2026-11-12 JST になっても閉じる変更が入っていなければ、再び全 PR が落ちる。",
  "owner_approved_web_publication_exception": {
    "approved_by": "repository_owner",
    "approved_on": "2026-10-23",
    "pull_request": 2139,
    "scope": "web-publication-only",
    "historical_evaluation": "unverified",
    "reason": "オーナーの明示指示により、この配信の未記録・期限超過だけを Web PR #2139 とその通常 merge 直後の main 検査の出荷阻害にしない。未記録・過去の期限・未検証事項を保全し、評価合格・採点済み・配信当日の承認済みとは扱わない。他の配信、別 PR、以後の main 検査へ適用しない。"
  },
  "experiment_id": "pr7-dialogue-memo",
  "evaluation_at": "2026-10-08",
  "evaluation_record": "docs/pr7-d14-evaluation-2026-10-23.md",
  "$comment_capture_2026_10_23": "2026-10-23: 管理画面ログインに成功し、9/24〜10/8のPV3401・転載28・スマートフォン36.37%を確認。参照元一覧は期間変更後も同じ229/54/3人でありD+14値とは確定できない。詳細はevaluation_record。必須4指標は未完備、配信前採点は未実施。確定台帳への部分転記・実験の評価済み扱いは行わず、11/4の期限と延長・限定例外履歴を維持する。"
});
// The 2026-09-24 annotation the PR #2139 exception pins by SHA-256 (unchanged).
const PR7_ANNOTATION = Object.freeze({
  "date": "2026-09-24",
  "type": "pr",
  "label": "PR⑦ 「シンプルメモ」、Apple Intelligence活用の新機能「対話メモ」を提供開始 — PV・転載・D-SCORE・乗車は D+14（2026-10-08）に追記",
  "note": "木曜 09:12 JST 公開（予約は 08:30。被リンク台帳 docs/seo/directory-registration-2026-09.md §1 に「所有者の作業」として記録） / https://prtimes.jp/main/html/rd/p/000000011.000182412.html 。見出しは転載先2件（ASCII STARTUP・財経新聞、2026-09-24 の検索で確認）の表記で、PR TIMES 本体はこの転記を書いた環境から開けず**原文とは照合していない**。副題（転載先の表記）は「プライバシーを保ちながら音声対話で考えを整理し、Obsidianへ保存」。**見出しに「Apple Intelligence活用」が入っている。**G2（見出しにAI・煽り語を入れない）と VISION §0（AIを前面に出さない）に当たるかは D-SCORE 採点のときに判定する（PR④ は AI を前面にした見出しで非乗車・G2違反と記録されている。ただし n=1 の前例で、今回も同じ結果になるとは言えない）。**label は d-score --backtest の書式になっていない（PV と D-SCORE が無い）ので、backtest はこの行を「拾えなかった」1件として数える。**それは欠測の表示として意図どおり。D+14（2026-10-08）に PR TIMES 分析画面で期間を 09-24〜10-08 に固定して PV・転載・デバイス・参照元を取り、配信した見出しで D-SCORE を採点し（採点は人かセッションが根拠つきで置く）、PR⑥ と同じ書式「n,nnnPV・転載nn・D-SCORE nn・乗車/非乗車」へ直す。検索で見えた転載・記事化の件数を転載数として先に書かない（正は分析画面）。growth/experiments/experiments.json の pr_release 行は未作成（ゲート判定の記録が無いまま running/evaluated で置くと d-score --check が落ちる種類の記録なので、配信判断をしたオーナーの確認を待つ）。事後確認（配信操作の主体、送信者欄と署名が名乗りの規則どおりだったか）はオーナーの確認待ち。"
});

// 2026-11-04: PR⑦ was closed as measurement_failed in experiments.json and moved
// from known_unrecorded to resolved_unrecorded. The exception below is history:
// it must keep failing closed exactly as it did while the entry was parked, so
// every fixture is self-contained instead of reading the live (resolved) entry.
const liveConfig = read('../data/pr-release-ledger.json');
const liveAnnotations = read('../growth/data/annotations.json');
const liveExperiments = read('../growth/experiments/experiments.json');
// PR2146 independently updated main's deadline while PR2139 was in CI. The
// expired fixture retains the original October22 boundary so every negative
// exception case still exercises expiry.
const parkedConfig = deadline => structuredClone({ ...PARKED_TOP_LEVEL,
  known_unrecorded: [{ ...structuredClone(PARKED_PR7), resolve_by: deadline }] });
const config = parkedConfig('2026-10-22');
// Rows dated up to the freeze, with the pinned PR⑦ row taken from the frozen copy,
// so later releases or later edits of that row cannot change these cases.
const annotations = { annotations: [
  ...liveAnnotations.annotations.filter(a => a.date <= FROZEN_ON && !(a.type === 'pr' && a.date === PR7_ANNOTATION.date)),
  structuredClone(PR7_ANNOTATION),
] };
// The ledger as it was while PR⑦ was parked: no PR⑦ record.
const experiments = { ...liveExperiments, experiments: liveExperiments.experiments.filter(e => e.id !== PR7_ID) };
const repository = 'simplememofast/simplememo';
const sha = 'a'.repeat(40);
const pr = {
  number: 2139,
  base: { ref: 'main', repo: { full_name: repository } },
  head: { ref: 'codex/web-ci-security-local-20261022', repo: { full_name: repository } },
};
const publication = {
  repository, eventName: 'pull_request', ref: 'refs/pull/2139/merge', sha,
  event: { number: 2139, repository: { full_name: repository }, pull_request: pr },
};
const mainPublication = {
  repository, eventName: 'push', ref: 'refs/heads/main', sha,
  event: { repository: { full_name: repository }, ref: 'refs/heads/main', deleted: false, after: sha },
  associatedPullRequests: [{ ...pr, merged_at: '2026-10-23T01:00:00Z', merge_commit_sha: sha }],
};
const clone = x => structuredClone(x);
const run = (c = config, a = annotations, p = publication, today = '2026-10-23', e = experiments) => audit(c, a, e, today, p);
const expired = result => result.some(x => x.includes('置き去り'));
const dayAfter = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

test('the frozen fixtures still describe the parked release without a PR7 record', () => {
  assert.equal(PARKED_PR7.id, PR7_ID);
  assert.equal(PARKED_PR7.experiment_id, PR7_ID);
  assert.equal(annotations.annotations.filter(a => a.type === 'pr' && a.date === PARKED_PR7.published_at).length, 1);
  // No other shipped record may cover 2026-09-24, or the negative cases would pass vacuously.
  assert.equal(experiments.experiments.some(e => e.started_at === PARKED_PR7.published_at
    && ['running', 'evaluated'].includes(e.status)), false);
  assert.equal(pr7PublicationException(config, annotations, '2026-10-23', publication)?.id, PR7_ID);
});

test('the bridged 2026-11-11 deadline is preserved in history and would have expired without this closure', () => {
  // 2026-11-04: owner-approved bridge to 11-11 while the measurement_failed
  // closing change went through review as its own PR (not a completed record).
  assert.equal(PARKED_PR7.resolve_by, '2026-11-11');
  assert.ok(PARKED_PR7.$comment_extension_2026_10_23);
  assert.ok(PARKED_PR7.$comment_extension_2026_11_04);
  const bridged = parkedConfig('2026-11-11');
  assert.equal(pr7PublicationException(bridged, annotations, '2026-10-23', publication), null);
  assert.deepEqual(audit(bridged, annotations, experiments, '2026-10-23'), []);
  assert.equal(expired(audit(bridged, annotations, experiments, '2026-11-11', publication)), false);
  assert.equal(expired(audit(bridged, annotations, experiments, '2026-11-12', publication)), true);
});

test('the live ledger no longer parks PR7 and keeps its entire history as resolved', () => {
  assert.equal((liveConfig.known_unrecorded || []).some(e => e?.id === PR7_ID || e?.experiment_id === PR7_ID), false);
  const resolved = (liveConfig.resolved_unrecorded || []).filter(e => e?.id === PR7_ID);
  assert.equal(resolved.length, 1);
  const { resolved_on, $comment_resolution_2026_11_04, ...history } = resolved[0];
  assert.equal(resolved_on, '2026-11-04');
  assert.ok($comment_resolution_2026_11_04);
  // Every historical field (deadline, three extensions, the PR #2139 exception
  // record and the 10-23 capture note) survives unchanged.
  assert.deepEqual(history, PARKED_PR7);
  assert.equal(history.experiment_id, PR7_ID);
});

test('the live experiment closes PR7 as measurement_failed without inventing a pre-distribution score', () => {
  const rows = liveExperiments.experiments.filter(e => e.id === PR7_ID);
  assert.equal(rows.length, 1);
  const e = rows[0];
  assert.equal(e.type, 'pr_release');
  assert.equal(e.status, 'evaluated');
  assert.equal(e.decision, 'measurement_failed');
  assert.equal(e.started_at, PARKED_PR7.published_at);
  assert.equal(e.evaluation_at, PARKED_PR7.evaluation_at);
  assert.equal(e.evaluated_at, '2026-11-04');
  assert.equal(Object.hasOwn(e, 'd_score_pre'), false);
  assert.equal(Object.hasOwn(e, 'discover_boarding_post'), false);
  assert.equal(e.d_score_pre_absent.delivered_headline, PARKED_PR7.subject_hint);
  assert.equal(e.d_score_pre_absent.reference, PARKED_PR7.evaluation_record);
  assert.equal(e.evidence.kind, 'measurement_diagnostic');
  assert.ok(e.evidence.artifacts.some(a => a.name === 'pr7-d14-evaluation-2026-10-23.md' && /^[a-f0-9]{64}$/.test(a.sha256)));
  const s = score(e, { fileExists: p => fs.existsSync(new URL(`../${p}`, import.meta.url)) });
  assert.deepEqual(s.problems, []);
  assert.equal(s.unscored, true);
  assert.equal(s.sum, null);
  assert.equal(s.verdict, UNSCORED_VERDICT);
});

test('the live audit passes after the bridge deadline and the old exception is inert', () => {
  assert.equal(pr7PublicationException(liveConfig, liveAnnotations, '2026-10-23', publication), null);
  assert.equal(pr7PublicationException(liveConfig, liveAnnotations, '2026-10-23', mainPublication), null);
  // 2026-11-12 JST is the first day the bridged deadline would have failed every PR.
  for (const today of ['2026-11-11', '2026-11-12']) {
    assert.deepEqual(audit(liveConfig, liveAnnotations, liveExperiments, today), [], today);
    assert.deepEqual(audit(liveConfig, liveAnnotations, liveExperiments, today, publication), [], today);
  }
  // Later dates may legitimately fail other gates (for example the 21-day
  // confirmation window), but never because of PR7 again.
  const pr7Related = x => x.includes(PR7_ID) || x.includes(PARKED_PR7.published_at);
  const lastFresh = dayAfter(liveConfig.last_confirmed_complete, liveConfig.max_days_between_confirmations);
  for (const today of ['2026-11-26', lastFresh, dayAfter(lastFresh, 1), '2027-01-01']) {
    const problems = audit(liveConfig, liveAnnotations, liveExperiments, today);
    assert.equal(problems.some(pr7Related), false, `${today}: ${problems.join(' / ')}`);
  }
});

test('removing the live PR7 record cannot leave the resolved history silently passing', () => {
  const without = { ...liveExperiments, experiments: liveExperiments.experiments.filter(e => e.id !== PR7_ID) };
  const problems = audit(liveConfig, liveAnnotations, without, '2026-11-12');
  assert.ok(problems.some(x => x.includes('配信済み pr_release を指していない')));
  assert.ok(problems.some(x => x.includes('D+14 を拾わない')));
});

test('extending the fixture deadline never expands the pinned exception', () => {
  const changed = clone(config);
  changed.known_unrecorded.find(e => e.id === 'pr7-dialogue-memo').resolve_by = '2026-10-24';
  assert.equal(pr7PublicationException(changed, annotations, '2026-10-25', publication), null);
  assert.equal(expired(run(changed, annotations, publication, '2026-10-25')), true);
});

test('owner exception allows only the existing unresolved release during PR2139 publication', () => {
  assert.deepEqual(run(), []);
  const entry = pr7PublicationException(config, annotations, '2026-10-23', publication);
  assert.equal(entry.id, 'pr7-dialogue-memo');
  assert.equal(entry.resolve_by, '2026-10-22');
  assert.equal(entry.owner_approved_web_publication_exception.historical_evaluation, 'unverified');
  assert.equal(Object.values(experiments.experiments).some(e => e.id === 'pr7-dialogue-memo'), false);
});

test('the exact ordinary merge main push is eligible', () => {
  assert.equal(isPr2139Publication(mainPublication), true);
  assert.deepEqual(run(config, annotations, mainPublication), []);
});

for (const [name, mutate] of [
  ['another PR', p => { p.event.number = p.event.pull_request.number = 2144; p.ref = 'refs/pull/2144/merge'; }],
  ['mismatched event number', p => { p.event.number = 2144; }],
  ['mismatched PR object number', p => { p.event.pull_request.number = 2144; }],
  ['another repository', p => { p.repository = 'elsewhere/simplememo'; }],
  ['another event repository', p => { p.event.repository.full_name = 'elsewhere/simplememo'; }],
  ['fork head', p => { p.event.pull_request.head.repo.full_name = 'fork/simplememo'; }],
  ['another head branch', p => { p.event.pull_request.head.ref = 'another-change'; }],
  ['another base', p => { p.event.pull_request.base.ref = 'release'; }],
  ['unrelated ref', p => { p.ref = 'refs/heads/main'; }],
  ['manual workflow', p => { p.eventName = 'workflow_dispatch'; }],
  ['schedule', p => { p.eventName = 'schedule'; }],
]) {
  test(`exception cannot be used by ${name}`, () => {
    const p = clone(publication); mutate(p);
    assert.equal(isPr2139Publication(p), false);
    assert.equal(expired(run(config, annotations, p)), true);
  });
}

for (const [name, mutate] of [
  ['missing associated PR evidence', p => { p.associatedPullRequests = []; }],
  ['later main commit', p => { p.sha = p.event.after = 'b'.repeat(40); }],
  ['unmerged PR', p => { p.associatedPullRequests[0].merged_at = null; }],
  ['another merged PR', p => { p.associatedPullRequests[0].number = 2144; }],
  ['different event SHA', p => { p.event.after = 'b'.repeat(40); }],
  ['deleted branch', p => { p.event.deleted = true; }],
]) {
  test(`main exception rejects ${name}`, () => {
    const p = clone(mainPublication); mutate(p);
    assert.equal(isPr2139Publication(p), false);
    assert.equal(expired(run(config, annotations, p)), true);
  });
}

test('normal local/other-context audit still reports the overdue entry', () => {
  assert.equal(expired(audit(config, annotations, experiments, '2026-10-23')), true);
  assert.equal(pr7PublicationException(config, annotations, '2026-10-22', publication), null);
});

for (const [key, value] of [
  ['id', 'pr8'], ['published_at', '2026-09-25'],
  ['url', 'https://prtimes.jp/main/html/rd/p/000000012.000182412.html'],
  ['resolve_by', '2026-10-21'],
]) {
  test(`exception cannot transfer to a changed ${key}`, () => {
    const c = clone(config); c.known_unrecorded[0][key] = value;
    assert.equal(pr7PublicationException(c, annotations, '2026-10-23', publication), null);
    assert.equal(expired(run(c)), true);
  });
}

for (const key of ['approved_by', 'approved_on', 'pull_request', 'scope', 'historical_evaluation']) {
  test(`missing explicit approval field ${key} fails closed`, () => {
    const c = clone(config); delete c.known_unrecorded[0].owner_approved_web_publication_exception[key];
    assert.equal(expired(run(c)), true);
  });
}

test('removing the approval, record, or original annotation cannot silently complete the ledger', () => {
  const c = clone(config); delete c.known_unrecorded[0].owner_approved_web_publication_exception;
  assert.equal(expired(run(c)), true);
  c.known_unrecorded = [];
  assert.ok(run(c).some(x => x.includes('D+14 を拾わない')));
  const a = clone(annotations); a.annotations = a.annotations.filter(x => x.date !== '2026-09-24' || x.type !== 'pr');
  assert.equal(expired(run(config, a)), true);
});

test('changing the pinned unresolved annotation does not manufacture a past pass', () => {
  const a = clone(annotations);
  a.annotations.find(x => x.type === 'pr' && x.date === '2026-09-24').note = 'All gates passed';
  assert.equal(expired(run(config, a)), true);
});

test('another release on the same day is not covered by the exceptional date', () => {
  const a = clone(annotations);
  a.annotations.push({ type: 'pr', date: '2026-09-24', label: '別の配信', note: '別の原文' });
  assert.ok(run(config, a).some(x => x.includes('D+14 を拾わない')));
});

test('duplicate exceptional entry or annotation fails closed', () => {
  const c = clone(config); c.known_unrecorded.push(clone(c.known_unrecorded[0]));
  assert.equal(expired(run(c)), true);
  const a = clone(annotations);
  a.annotations.push(clone(a.annotations.find(x => x.type === 'pr' && x.date === '2026-09-24')));
  assert.equal(expired(run(config, a)), true);
});

test('another expired item and a later missing release still fail', () => {
  const c = clone(config);
  c.known_unrecorded.push({ ...clone(c.known_unrecorded[0]), id: 'pr8', published_at: '2026-10-01', url: 'https://example.com/another-release' });
  assert.equal(expired(run(c)), true);
  const a = clone(annotations); a.annotations.push({ type: 'pr', date: '2026-10-20', label: 'PR⑧' });
  assert.ok(run(config, a).some(x => x.includes('D+14 を拾わない')));
});

test('freshness and missing-file checks remain active even with the owner exception', () => {
  // Derive the first stale day from the live confirmation so the next
  // confirmation update does not silently turn this into a passing no-op.
  const stale = new Date(Date.parse(`${config.last_confirmed_complete}T00:00:00Z`)
    + (config.max_days_between_confirmations + 1) * 86400000).toISOString().slice(0, 10);
  assert.ok(run(config, annotations, publication, stale).some(x => x.includes('全件確認')));
  const lastFresh = new Date(Date.parse(`${stale}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  assert.equal(run(config, annotations, publication, lastFresh).some(x => x.includes('全件確認')), false);
  for (const result of [run(null), run(config, null), run(config, annotations, publication, '2026-10-23', null)]) {
    assert.ok(result.length > 0);
  }
});

test('audit preserves all input evidence and approval fields', () => {
  const before = JSON.stringify([config, annotations, experiments]);
  run(); run(config, annotations, mainPublication);
  assert.equal(JSON.stringify([config, annotations, experiments]), before);
});

test('workflow preserves read-only permissions and bounds its public merge lookup without auth fallback', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/seo-check.yml', import.meta.url), 'utf8');
  assert.match(workflow, /permissions:\n  contents: read\n/);
  const step = workflow.split('      - name: PR release ledger completeness\n')[1].split('\n      - name:')[0];
  assert.match(step, /context\.eventName === 'push' && context\.ref === 'refs\/heads\/main'/);
  assert.match(step, /https:\/\/api\.github\.com\/repos\/simplememofast\/simplememo\/commits\//);
  assert.match(step, /AbortSignal\.timeout\(10000\), redirect: 'error'/);
  assert.match(step, /response\.status !== 200\) throw/);
  assert.doesNotMatch(step, /Authorization|secrets\.|github\.rest|pull-requests: write|continue-on-error/);
});

test('ordinary run wiring exposes both regressions to preflight and preserves the selftest ratchet', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/seo-check.yml', import.meta.url), 'utf8');
  const commands = extractCommands(workflow);
  assert.ok(commands.some(c => c.runner === 'node' && c.script === 'scripts/check-pr-release-ledger.mjs' && c.args.includes('--selftest')));
  assert.ok(commands.some(c => c.runner === 'node' && c.script === '--test' && c.args.includes('scripts/pr-release-publication-exception.test.mjs')));
  assert.ok(wiredChecks().includes('scripts/check-pr-release-ledger.mjs'));
  assert.ok(gatingChecks().includes('scripts/check-pr-release-ledger.mjs'));
});

// Execute the actual workflow JavaScript with only its module import and network
// dependencies injected. No token, network request, CI run or public write occurs.
const yaml = fs.readFileSync(new URL('../.github/workflows/seo-check.yml', import.meta.url), 'utf8');
const block = yaml.split('      - name: PR release ledger completeness\n')[1].split('\n      - name:')[0];
const script = block.split('          script: |\n')[1].split('\n')
  .filter(line => line.startsWith('            ')).map(line => line.slice(12)).join('\n');
const importLine = "const { checkPublication } = await import(`${process.env.GITHUB_WORKSPACE}/scripts/check-pr-release-ledger.mjs`);";
assert.ok(script.includes(importLine), 'workflow import must remain explicitly injectable');
const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
  'context', 'core', 'fetch', 'AbortSignal', 'hooks', script.replace(importLine, 'const { checkPublication } = hooks;'));

for (const scenario of ['valid-main', 'valid-pr', 'other-pr', 'other-merge', '403', '500', 'invalid-json', 'not-array', 'redirect', 'timeout']) {
  test(`real workflow wiring: ${scenario}`, async () => {
    const source = clone(scenario.endsWith('-pr') ? publication : mainPublication);
    if (scenario === 'other-pr') source.event.number = source.event.pull_request.number = 2144;
    let calls = 0, checks = 0;
    const failures = [];
    const context = { repo: { owner: 'simplememofast', repo: 'simplememo' },
      eventName: source.eventName, payload: source.event, ref: source.ref, sha: source.sha };
    const fetch = async (url, options) => {
      calls++;
      assert.equal(url, `https://api.github.com/repos/${repository}/commits/${sha}/pulls?per_page=100`);
      assert.deepEqual(options.headers, { Accept: 'application/vnd.github+json' });
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      if (scenario === 'redirect' || scenario === 'timeout') throw new Error(scenario);
      return { status: scenario === '403' || scenario === '500' ? Number(scenario) : 200,
        json: async () => {
          if (scenario === 'invalid-json') throw new SyntaxError('invalid JSON');
          if (scenario === 'not-array') return {};
          const rows = clone(mainPublication.associatedPullRequests);
          if (scenario === 'other-merge') rows[0].number = 2144;
          return rows;
        } };
    };
    const hooks = { checkPublication: p => { checks++; return run(config, annotations, p).length ? 1 : 0; } };
    const operation = execute(context, { setFailed: message => failures.push(message) }, fetch, AbortSignal, hooks);
    if (['403', '500', 'invalid-json', 'not-array', 'redirect', 'timeout'].includes(scenario)) {
      await assert.rejects(operation);
      assert.equal(checks, 0);
    } else {
      await operation;
      assert.equal(checks, 1);
      assert.equal(failures.length, scenario.startsWith('other-') ? 1 : 0);
    }
    assert.equal(calls, scenario.endsWith('-pr') ? 0 : 1, 'never retry or fall back to another identity');
  });
}
