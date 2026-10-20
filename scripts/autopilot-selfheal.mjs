#!/usr/bin/env node
/**
 * レーンF（自己修復） — 未修理の故障が残っているかを判定する。
 *
 *   node scripts/autopilot-selfheal.mjs          # 判定と、直すなら何を直すか
 *   node scripts/autopilot-selfheal.mjs --json   # 機械可読
 *   node scripts/autopilot-selfheal.mjs --check  # CI: 台帳と権限表の整合（未修理があっても落とさない）
 *   node scripts/autopilot-selfheal.mjs --contain # 上限に達した故障があれば、その経路を止める
 *
 * 【なぜこれを作るか】
 * 実測（2026-08-11〜08-22）では、人間の介入7件のうち**4件が基盤の修理**だった。
 * ところがその修理を書いたのは**すべてAIセッション**で、人間がやったのは
 * 「壊れていることに気づいて、直せと言うこと」だけ。
 * **足りなかったのは能力ではなく起動条件。** だからこのスクリプトは
 * 「検知したら、人の指示を待たずにその日の最優先を修理にする」ための判定だけを持つ。
 *
 * 【一番危ない失敗モード】
 * 自分のCIを自分で直す仕組みは、放っておくと必ず
 * **「通らないチェックを消して緑にする」**に流れる。だから:
 *   - 触ってよいファイルは権限表の self_repair.may_modify に限定
 *   - やってはいけない変更は must_not に明記（検証の弱体化・権限の拡大）
 *   - required_ci_checks の実在は scripts/check-authority.mjs がCIで検証するので、
 *     修理PRがチェックを1つでも消すと落ちる
 *   - 同じ failure_class を stop_after_failed_repairs 回直しても再発するなら、
 *     **修理をやめて人間に上げる**（直せないものを毎日直そうとするのが
 *     一番たちの悪い無限ループ）
 *
 * 【このスクリプトがやらないこと】
 * 修理そのもの。ここが出すのは「今日レーンFに入るべきか」「対象はどれか」
 * 「何をしてはいけないか」だけで、原因の特定と実装はセッションが行う。
 * 【--contain だけは例外】
 * 「人に上げる」と表示するだけでは、**上げた先が見ていない間、同じ経路が
 * 翌朝また走る。** 上限に達した故障は、その経路を止めるところまでを機械にやらせる。
 * 止めるのは AI が自分でできるが（policy.ai_may_stop）、**解除はできない** —
 * 止めすぎの損は出荷1日、解除しすぎの損は止めたかった事象の素通り。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');

const FAILED = new Set(['no_artifact', 'failed', 'cancelled', 'no_run']);
const preflightFault = r => r.outcome === 'skipped_gate' && r.eligibility_verdict === 'declined_by_fault'
  && r.gate_code === 'preflight_error';
const repairFailure = r => FAILED.has(r.outcome) || preflightFault(r);
const repairClass = r => r?.failure_class || (r && preflightFault(r) ? r.gate_code : 'unknown');

/** A failed execution can be observed before its cause is known. */
export function observedPendingTriage(row) {
  const failed = Date.parse(row.failed_at);
  const detected = Date.parse(row.detected_at);
  const codex = /^codex:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.external_ref ?? '')
    && ['actions', 'ccr-0920'].includes(row.route)
    && /^Codex original turn [0-9a-f-]{36}; transcript SHA256 [0-9a-f]{64}; observed /.test(row.detected_note ?? '');
  const actions = row.route === 'actions' && /^[1-9]\d*$/.test(String(row.external_ref ?? ''));
  return (row.outcome === 'failed' || (codex && row.outcome === 'cancelled'))
    && row.attempted === true && row.needs_triage === true
    && ['act-reconcile', 'act-reconcile-session'].includes(row.source) && (codex || actions)
    && typeof row.failure_reason === 'string' && row.failure_reason.trim().length > 0
    && typeof row.detected_note === 'string' && row.detected_note.trim().length > 0
    && [row.failed_at, row.detected_at].every(value => typeof value === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value))
    && Number.isFinite(failed) && Number.isFinite(detected) && failed <= detected;
}

/**
 * 未修理の故障を求める。
 *
 * 「修理済み」の定義は **repair_of で名指しされていること**。
 * 「あとで同じ経路が成功したから直った」とは扱わない —— 主系は
 * 秘密鍵未設定で毎日 success を返していた前例があり、
 * 「成功した」を回復の証拠にすると壊れたまま緑に見える。
 *
 * 【2026-09-02追加: 修理主体が人しかいない故障を、修理対象に数えない】
 * `data/escalation-rules.json` が `who` で修理主体を宣言している。
 * `self_then_owner` は「まず自分で直す」、**`owner` は「セッション側に打つ手が
 * 1つも無い」**（usage_limit の規則がそう明記している: 待つか、枠を上げるか、
 * 1回あたりの入力量を減らすかで、後ろ2つは人の判断）。
 *
 * それでも `who: owner` の故障を修理対象として数えていたため、**直せないものを
 * 毎日直そうとする**状態になっていた —— まさにこのファイル冒頭が
 * 「一番たちの悪い無限ループ」と呼んでいるもの。しかも usage_limit の規則には
 * 「連続するなら repair_limit ではなくこちらで拾う」と書いてあり、
 * repair_of を書いて数を進めるのは**規則が禁じている経路**だった
 * （3回で --contain が経路を止め、解除は人だけ ＝ 時間で自然に戻る停止を
 * 人待ちの停止に変えてしまう）。
 *
 * **消すのではなく、行き先を変える。**owner_routed は毎回そのまま表示する。
 * 依頼を出すかはアクション台帳の状態と照合する。既に完了・受付済みの依頼を
 * 過去の失敗から作り直さない。未修理の件数と修理の判定は変えない。
 *
 * **これが「直さない口実」に使われないための歯止め:**
 * `data/escalation-rules.json` は self_repair.may_modify に**入っていない**。
 * レーンFは規則そのものを書き換えられないので、`who` を owner に書き換えて
 * 修理から逃げる経路が無い。規則が読めなかった回は全件が修理対象に戻る
 * （安全側は「直そうとする」ほう）。
 */
export function analyze(runsDoc, matrix, escalationRules = []) {
  const runs = runsDoc.runs;
  // **Only a shipped repair repairs.** A repair_of on a failed or no_artifact row is
  // an attempt: it counts toward the limit below but cannot clear a failure or the
  // containment. Stricter than autonomy-score RA and value-contracts (shipped only):
  // here the shipped row must also carry its PR number, as autopilot-runs requires.
  // Every repair_of in the ledger up to 2026-10-13 sits on such a row, so nothing moves.
  const repaired = new Set(runs.filter((r) => r.outcome === 'shipped' && Number.isInteger(r.pr) && r.pr > 0)
    .flatMap((r) => r.repair_of || []));
  const failures = runs.filter(repairFailure);
  const unrepaired = failures.filter((r) => !repaired.has(r.run_id));

  // 同じ failure_class を何回直したかを数える。再発の回数ではなく
  // **修理を試みた回数**を数える（直らない修理を繰り返すのを止めたいので）。
  const repairAttempts = {};
  for (const r of runs) {
    for (const targetId of r.repair_of || []) {
      const target = runs.find((x) => x.run_id === targetId);
      const cls = repairClass(target);
      repairAttempts[cls] = (repairAttempts[cls] || 0) + 1;
    }
  }

  const sr = matrix.self_repair || {};
  const limit = sr.stop_after_failed_repairs ?? 3;

  const targets = unrepaired.map((r) => {
    const cls = repairClass(r);
    const tried = repairAttempts[cls] || 0;
    const rule = escalationRules.find((x) => x.trigger === cls);
    return {
      run_id: r.run_id, date_jst: r.date_jst, route: r.route,
      outcome: r.outcome, failure_class: cls,
      // Preserve the original ledger message, but show the verified diagnosis.
      failure_reason: r.triage_note ?? r.failure_reason,
      needs_triage: r.needs_triage === true,
      repair_attempts_for_class: tried,
      // 上限に達した種別は**直さない**。人に上げる。
      escalate: tried >= limit,
      // **修理主体が人しかいない種別は、そもそも修理対象ではない。**
      owner_routed: rule?.who === 'owner',
      escalation: rule ? { who: rule.who, channel: rule.channel, within_hours: rule.within_hours } : null,
    };
  });

  const actionable = targets.filter((t) => !t.escalate && !t.owner_routed);
  return {
    lane_f_required: actionable.length > 0,
    unrepaired_count: unrepaired.length,
    targets,
    escalate: targets.filter((t) => t.escalate),
    // **セッション側に打つ手が無い故障。**修理待ちではなく引き渡し待ち。
    owner_routed: targets.filter((t) => t.owner_routed && !t.escalate),
    limit,
    may_modify: sr.may_modify || [],
    must_not: sr.must_not || [],
  };
}

/** 依頼の状態と故障の修理状態は別。受付済みを修理済みに変換しない。 */
export function ownerRequest(target, actionsDoc) {
  if (!target.owner_routed || target.escalate) return null;
  const id = `act-selfheal-${target.run_id}`;
  if (!Array.isArray(actionsDoc?.actions)) return { id, state: 'unknown', needs_attention: true };
  const matches = actionsDoc.actions.filter(a => a.id === id);
  if (matches.length !== 1) return { id, state: matches.length ? 'unknown' : 'untracked', needs_attention: true };
  const action = matches[0];
  const state = ['open', 'done', 'acknowledged'].includes(action.state) ? action.state : 'unknown';
  return { id, state, needs_attention: !['done', 'acknowledged'].includes(state), evidence: action.evidence ?? null };
}

/**
 * 所有者が承認した、Actions 副系の**1回限りの試運転**（2026-10-13 オーナー判断）。
 *
 * 10-05・10-06 の no_artifact で修理上限に達し、10-07 から封じ込めで止まっている（10-22・10-24・10-25・10-27 の試運転の
 * no_artifact で、対象に 10-22・10-24・10-25・10-27 が加わった）。
 * 10-06 の直接原因は確定できず（#2062）、修理としては記録していない。止めたままでは
 * PR 前の照合（--verify-local）や終了理由の記録が効くかを確かめる手段が無いので、
 * **オーナーが日付を1つ入れた日の定時 run だけ**封じ込めを越えさせる。
 *
 * 承認は repository variable（AUTOPILOT_RECOVERY_ONCE = JST の日付）で受ける。
 * Claude Code のセッションはこの変数を読めも書けもしない（プロキシが 403 を返す。
 * 2026-10-13 実測）。ただし所有者の資格情報を共有する別のエージェントまでは
 * 技術的に排除できない —— 09-30 の主系の許可（NATIVE_RECOVERY_ONE_USE.md）と同じ限界。
 *
 * **越えさせるのは封じ込めだけ。**緊急停止・予算・Gate の当日重複・宣言の検査はそのまま効く。
 * 台帳の故障行・修理回数・上限は書き換えない。試運転の結果は通常の行として残り、
 * 出荷しても 10-05・10-06・10-22・10-24・10-25・10-27 は修理済みにならない（repair_of を書くかは別の判断）。
 * 対象・回数・行の中身が1つでも変わったら（新しい故障を含む）、許可は効かない。
 */
export const ACTIONS_RECOVERY = Object.freeze({
  variable: 'AUTOPILOT_RECOVERY_ONCE',
  workflow_ref: 'simplememofast/simplememo/.github/workflows/obsidian-autopilot.yml@refs/heads/main',
  // PR #2062（PR 前の照合・終了理由の記録）のマージ。これより前のコードでは試さない。
  prevention_sha: 'a35323d7b1723c066a835b0cd024eb1019de99ed',
  limit: 3,
  attempts: 5,
  targets: Object.freeze({
    'ap-20261005-actions-37249907984': '0905a2f74774556ca976dcbb371c315bf53a865f1fddc33a88de391f0d80520f',
    'ap-20261006-actions': 'd97bdfee43b807e2dc3a49736d7f545e4c653f3c42b84a1b2c43cb09a2083bbf',
    // 2026-10-22 のオーナー判断（直してもう一度試す）。10-22 の試運転は依頼ファイルを残さずに終わり、
    // no_artifact の行が1つ増えた。その行を #2140 のマージ時点の指紋で足す。上限と回数は変えていない。
    'ap-20261022-actions': 'cf22dd3f842519d3d0a712bcf2d0cbba4fa4ddc666c8878aa8c8fbb8508c83a8',
    // 2026-10-24 のオーナー判断（F95 の修正 #2156 のマージ後にもう一度試す）。10-24 の試運転も依頼を
    // 残さずに終わり、no_artifact の行が1つ増えた。その行を #2153 のマージ時点の指紋で足す。上限と回数は変えていない。
    'ap-20261024-actions': 'e730ebb7e0ad2c00163eb90968667b2f50418830aadffd1ce3858ffa6f442d4b',
    // 2026-10-25 のオーナー判断（監査 F97 の修正とこの更新をマージし、もう一度試す日は後で決める）。10-25 の試運転は引き渡しまで届いたが、
    // publish がコミットの共同作者の名義を拒否して何も公開されず、no_artifact の行が1つ増えた。その行を #2159 の
    // マージ時点の指紋で足す。上限と回数は変えていない。
    'ap-20261025-actions': '6c25e6e7611c6add70a10ede8ceffb896a2be6f56e13211d71e32a105b895a0e',
    // 2026-10-27 のオーナー判断（訳の検査の再発防止 #2194 の後にもう1回。日付は許可の更新と模擬の後に AI が決める）。10-27 の
    // 試運転は publish が PR を開いたが、訳のあるページを訳なしで変えていて記帳の訳の再生成が止まり、no_artifact の行が
    // 1つ増えた。interventions に bootstrap を記録した #2195 のマージ時点の指紋で足す。上限と回数は変えていない。
    'ap-20261027-actions': '2e8ca34b2580a91f96ea7653e249a11c811f8e99dd7227370d136266d6c43b84',
  }),
});

/** キーを並べ替えた JSON。行の指紋を、キーの順番に依存させない。 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const rowDigest = row => createHash('sha256').update(canonicalJson(row)).digest('hex');

/**
 * 封じ込めを1回だけ越えてよいか。**どれか1つでも満たさなければ越えない。**
 * 理由は型付きのコードだけを返す（変数の値や行の中身をログへ出さない）。
 */
export function actionsRecoveryOnce({ analysis, problems, rows, stop, env, now, preventionMerged }) {
  const refuse = reason => ({ allowed: false, reason });
  const raw = env[ACTIONS_RECOVERY.variable];
  if (typeof raw !== 'string' || raw.trim() === '') return refuse('not_requested');
  const date = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return refuse('invalid_date');
  if (date !== new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)) return refuse('not_today');
  // 定時の1回目だけ。手動起動（AIのセッションも起動できる）と再実行は越えない。
  // 変数は全ワークフローから読めるので、動いているのが日次実行のワークフロー自身であることも見る。
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'schedule' || env.GITHUB_RUN_ATTEMPT !== '1'
    || env.GITHUB_REPOSITORY !== 'simplememofast/simplememo' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_REF !== ACTIONS_RECOVERY.workflow_ref) {
    return refuse('not_scheduled_first_attempt');
  }
  if (stop?.stopped !== false || stop?.agents?.actions?.stopped !== false) return refuse('explicit_stop');
  if (!Array.isArray(problems) || problems.length !== 0 || analysis.limit !== ACTIONS_RECOVERY.limit) {
    return refuse('policy_or_ledger_changed');
  }
  // 未修理のうち人に渡すだけの行（usage_limit など）は残ってよい。修理対象が出たら越えない。
  if (analysis.lane_f_required !== false) return refuse('repair_pending');
  const pinned = Object.keys(ACTIONS_RECOVERY.targets).sort();
  const escalated = analysis.escalate.map(t => t.run_id).sort();
  if (escalated.length !== pinned.length || escalated.some((id, i) => id !== pinned[i])) return refuse('containment_changed');
  for (const t of analysis.escalate) {
    if (t.route !== 'actions' || t.failure_class !== 'no_artifact' || t.repair_attempts_for_class !== ACTIONS_RECOVERY.attempts) {
      return refuse('containment_changed');
    }
  }
  if (!Array.isArray(rows)) return refuse('target_row_changed');
  for (const id of pinned) {
    const matches = rows.filter(r => r?.run_id === id);
    if (matches.length !== 1 || rowDigest(matches[0]) !== ACTIONS_RECOVERY.targets[id]) return refuse('target_row_changed');
  }
  if (preventionMerged !== true) return refuse('prevention_missing');
  return { allowed: true, reason: 'owner_one_actions_run', date, targets: pinned };
}

/** 権限表と台帳の整合。self_repair の境界が壊れていないかを見る。 */
export function validate(runsDoc, matrix) {
  const problems = [];
  const sr = matrix.self_repair;
  if (!sr) return ['authority-matrix.json に self_repair が無い — レーンFの境界が定義されていない'];
  if (!Array.isArray(sr.may_modify) || sr.may_modify.length === 0) {
    problems.push('self_repair.may_modify が空 — 触ってよい範囲が無いなら自己修復は成立しない');
  }
  if (!Array.isArray(sr.must_not) || sr.must_not.length === 0) {
    problems.push('self_repair.must_not が空 — 「検証を弱めない」「権限を広げない」は必ず書く');
  }
  if (typeof sr.stop_after_failed_repairs !== 'number' || sr.stop_after_failed_repairs < 1) {
    problems.push('self_repair.stop_after_failed_repairs は1以上の数値が要る — 停止条件の無い自己修復は無限ループになる');
  }
  // 権限表で human_only の領域を may_modify が含んでいないこと
  const humanOnlyEvidence = new Set(
    (matrix.domains || []).filter((d) => d.requires_approval).flatMap((d) => d.evidence || []));
  for (const f of sr.may_modify || []) {
    if (humanOnlyEvidence.has(f)) {
      problems.push(`self_repair.may_modify に承認制領域の根拠ファイル "${f}" が入っている — 自己修復が承認境界を越える`);
    }
  }
  // 修理対象として名指しされた run_id が実在すること
  const ids = new Set(runsDoc.runs.map((r) => r.run_id));
  for (const r of runsDoc.runs) {
    for (const t of r.repair_of || []) {
      if (!ids.has(t)) problems.push(`${r.run_id}: repair_of "${t}" が台帳に無い`);
      if (t === r.run_id) problems.push(`${r.run_id}: 自分自身を repair_of にしている`);
    }
  }
  // 未記入は拒否する。GitHubの失敗観測と調査待ちを明記した行は、原因を
  // 捏造して埋めずに保持する。未修理件数・既存のunknown修理上限にも残す。
  for (const r of runsDoc.runs) {
    if (FAILED.has(r.outcome) && !r.failure_class && !observedPendingTriage(r)) {
      problems.push(`${r.run_id}: outcome=${r.outcome} なのに failure_class が無い — 原因未確定なら失敗の観測証拠と needs_triage が必要`);
    }
  }
  return problems;
}

// --- CLI ---------------------------------------------------------------

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**修理したと書いてあるのに対象が無い**のは落ちる', (d) => { d.runs[0] = { ...d.runs[0], repair_of: 'そんな故障は無い' }; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8')),
  (d) => validate(d, JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'))),
  SELFTEST_BREAKAGES,
);

// ── 修理主体の振り分け（2026-09-02追加） ──────────────────────
// **「直せないものを毎日直そうとする」を止める仕組みが、
//   「直せるものを直さない口実」に化けないこと**をここで固定する。
{
  const MATRIX = { self_repair: { may_modify: ['x'], must_not: ['y'], stop_after_failed_repairs: 3 } };
  const RULES = [
    { trigger: 'usage_limit', who: 'owner', channel: 'daily_report', within_hours: 24 },
    { trigger: 'claim_without_completion', who: 'self_then_owner', channel: 'gh_issue', within_hours: 24 },
  ];
  const doc = (cls) => ({ runs: [{
    run_id: 'ap-x', date_jst: '2026-09-01', route: 'actions', attempted: true,
    outcome: 'failed', failure_class: cls, source: 'test',
  }] });

  SCENARIOS.push(
    ['**出荷していない行の repair_of は修理にならない**（試行には数える）', () => {
      const failure = { ...doc('no_artifact').runs[0], outcome: 'no_artifact' };
      const attempt = { run_id: 'ap-y', date_jst: '2026-09-02', route: 'actions', attempted: true,
        outcome: 'no_artifact', failure_class: 'no_artifact', source: 'test', repair_of: ['ap-x'] };
      const notRepaired = analyze({ runs: [failure, attempt] }, MATRIX, RULES);
      assert(notRepaired.targets.some(t => t.run_id === 'ap-x'), '失敗した行の repair_of で故障が消えた');
      assert(notRepaired.targets.find(t => t.run_id === 'ap-x').repair_attempts_for_class === 1, '失敗した修理を試行に数えていない');
      const shipped = { ...attempt, run_id: 'ap-z', outcome: 'shipped', failure_class: null, pr: 42 };
      assert(!analyze({ runs: [failure, shipped] }, MATRIX, RULES).targets.some(t => t.run_id === 'ap-x'),
        '出荷した修理で故障が消えない');
      assert(analyze({ runs: [failure, { ...shipped, pr: null }] }, MATRIX, RULES).targets.some(t => t.run_id === 'ap-x'),
        'PR の無い出荷行で故障が消えた');
    }],
    ['原因未確定の実行失敗を証拠付きの調査待ちとして保持する', () => {
      const row = { ...doc(null).runs[0], source: 'act-reconcile-session', external_ref: '90001',
        needs_triage: true, failure_reason: '単独診断は判定不能', detected_note: 'GitHub step completed_at',
        failed_at: '2026-09-05T00:00:20Z', detected_at: '2026-09-05T00:01:00Z' };
      assert(validate({ runs: [row] }, MATRIX).length === 0, '観測済みの故障が同期を止めた');
      const pending = analyze({ runs: [row] }, MATRIX, RULES);
      assert(pending.unrepaired_count === 1 && pending.lane_f_required
        && pending.targets[0].needs_triage && !pending.targets[0].owner_routed,
      '原因未確定の故障を隠した、または認証交換の人待ちにした');
      for (const field of ['needs_triage', 'external_ref', 'source', 'failure_reason',
        'failed_at', 'detected_at', 'detected_note']) {
        const bad = { ...row }; delete bad[field];
        assert(validate({ runs: [bad] }, MATRIX).length > 0, `${field}が無い空欄を通した`);
      }
      for (const change of [{ outcome: 'no_run' }, { attempted: false }, { route: 'ccr' },
        { needs_triage: 'true' }, { detected_at: '2026-09-04T00:00:00Z' },
        { failed_at: 'invalid' }, { failed_at: 1 }, { failed_at: '2026-09-05' },
        { external_ref: 'not-a-run' }, { failure_reason: '  ' }]) {
        assert(validate({ runs: [{ ...row, ...change }] }, MATRIX).length > 0,
          '失敗観測の条件を満たさない行を通した');
      }
      const prior = [1, 2, 3].flatMap(i => [
        { ...row, run_id: `unknown-${i}` },
        { run_id: `repair-${i}`, outcome: 'shipped', pr: 900 + i, repair_of: [`unknown-${i}`] },
      ]);
      const limited = analyze({ runs: [...prior, row] }, MATRIX, RULES);
      assert(limited.targets[0].escalate && limited.targets[0].repair_attempts_for_class === 3
        && !limited.lane_f_required, '既存のunknown修理上限を無効にした');
    }],
    ['who=owner の故障はレーンFを起動しない（打つ手が無いものを毎日直そうとしない）', () => {
      const a = analyze(doc('usage_limit'), MATRIX, RULES);
      assert(a.lane_f_required === false, 'usage_limit でレーンFが起動した');
      assert(a.owner_routed.length === 1, '人へ渡す欄に出ていない');
    }],
    ['who=owner でも**表示と件数からは消えない**（消えると誰も渡さない）', () => {
      const a = analyze(doc('usage_limit'), MATRIX, RULES);
      assert(a.unrepaired_count === 1, '未修理の件数から消えた');
      assert(a.targets.length === 1, '一覧から消えた');
    }],
    ['who=self_then_owner の故障は今までどおり修理対象', () => {
      const a = analyze(doc('claim_without_completion'), MATRIX, RULES);
      assert(a.lane_f_required === true, '修理対象がレーンFを起動しなかった');
      assert(a.owner_routed.length === 0, '修理できる故障が人へ渡された');
    }],
    ['規則が読めなかった回は全件が修理対象に戻る（安全側は「直そうとする」）', () => {
      const a = analyze(doc('usage_limit'), MATRIX, []);
      assert(a.lane_f_required === true, '規則が無いのにレーンFが起動しなかった');
    }],
    ['**規則そのものは自己修復で書き換えられない**（who を owner にして逃げられない）', () => {
      const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
      const may = matrix.self_repair?.may_modify || [];
      assert(!may.includes('data/escalation-rules.json'),
        'escalation-rules.json が may_modify に入っている — 修理から逃げる経路ができる');
    }],
    ['完了・受付済みの依頼は繰り返さず、故障と未修理件数は保持する', () => {
      const a = analyze(doc('usage_limit'), MATRIX, RULES);
      for (const state of ['done', 'acknowledged']) {
        const request = ownerRequest(a.targets[0], { actions: [{ id: 'act-selfheal-ap-x', state, evidence: '確認済み' }] });
        assert(request.state === state && !request.needs_attention, '同じ依頼を再作成する');
        assert(a.unrepaired_count === 1 && a.targets.length === 1 && !a.lane_f_required,
          '依頼の状態が修理の判定を書き換えた');
      }
    }],
    ['別の故障・未登録・重複・読取不能の依頼を完了扱いしない', () => {
      const target = analyze(doc('usage_limit'), MATRIX, RULES).targets[0];
      for (const actions of [null, {}, { actions: [] }, { actions: [{ id: 'act-selfheal-other', state: 'done' }] },
        { actions: [{ id: 'act-selfheal-ap-x', state: 'done' }, { id: 'act-selfheal-ap-x', state: 'open' }] },
        { actions: [{ id: 'act-selfheal-ap-x', state: 'open' }] },
        { actions: [{ id: 'act-selfheal-ap-x', state: 'unexpected' }] }]) {
        assert(ownerRequest(target, actions).needs_attention, '未解決・判定不能なのに依頼を抑制した');
      }
      assert(ownerRequest({ ...target, escalate: true }, { actions: [{ id: 'act-selfheal-ap-x', state: 'done' }] }) === null,
        '修理上限による新しいエスカレーションを過去の依頼で抑制した');
    }],
  );
}

/**
 * 試運転の許可がワークフローで実際に配線されていること。変数を渡すのは封じ込めの段だけ。
 * 配線が外れると許可は黙って効かなくなり、逆に他の段へ渡ると意図しない所で読まれる。
 */
export function checkRecoveryWiring(source) {
  // コメント行は数えない（段の説明に変数名を書くのは配線ではない）。
  const active = source.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
  // モデルを動かさない collect ジョブ（Search Console の取得・2026-10-20）は、鍵を使う前に同じ dry-run を
  // 読むだけで行う。試運転の日に取得だけが止まらないよう同じ値を渡すが、印（id: contain）は出さない。
  const collectMatch = active.match(/\n {2}collect:\n[\s\S]*?(?=\n {2}[A-Za-z0-9_-]+:\n|$)/);
  const collectJob = collectMatch ? collectMatch[0] : '';
  const wired = s => s.includes(`${ACTIONS_RECOVERY.variable}: \${{ vars.${ACTIONS_RECOVERY.variable} }}`);
  for (const s of collectJob.split(/\n(?=      - name: )/).slice(1)) {
    const checks = s.includes('node scripts/autopilot-selfheal.mjs --contain --dry-run');
    assert(checks === s.includes(ACTIONS_RECOVERY.variable) && (!checks || (wired(s) && !/\n        id: contain\n/.test(s))),
      `collect ジョブで ${ACTIONS_RECOVERY.variable} を読むのは封じ込めの確認だけ（値を渡し、id: contain は使わない）`);
  }
  const steps = active.replace(collectJob, '').split(/\n(?=      - name: )/);
  const contain = steps.filter(s => s.includes('node scripts/autopilot-selfheal.mjs --contain --dry-run'));
  assert(contain.length === 1, '封じ込めの段が1つではない');
  assert(/\n        id: contain\n/.test(contain[0]), '封じ込めの段に id: contain が無い（試運転の印が読めない）');
  assert(contain[0].includes(`${ACTIONS_RECOVERY.variable}: \${{ vars.${ACTIONS_RECOVERY.variable} }}`),
    `封じ込めの段に ${ACTIONS_RECOVERY.variable} が渡っていない`);
  const mentions = steps.filter(s => s.includes(ACTIONS_RECOVERY.variable));
  assert(mentions.length === 1, `${ACTIONS_RECOVERY.variable} が封じ込め以外の段にも渡っている`);
  // 越えた回だとモデルに伝わらないと、Runbook どおり --contain を走らせて自分を止める。
  const model = steps.filter(s => s.includes('\n        id: claude\n'));
  assert(model.length === 1 && model[0].includes("TRIAL_RUN=${{ steps.contain.outputs.recovery || 'none' }}"),
    'モデルの段に試運転の印（TRIAL_RUN）が渡っていない');
  const marker = steps.filter(s => s.includes("steps.contain.outputs.recovery == 'actions_once'"));
  assert(marker.length === 1 && !/封じ込め|Gate|Claude Code|判定コード|緊急停止|予算ゲート|振り分け/.test(marker[0].split('\n')[0]),
    '試運転の印の段が無い、または Act が別の段と取り違える名前になっている');
}

{
  // 許可の対象を最後に決めた時点の台帳（#2195 のマージ。10-27 の行が入り、その interventions を記録した）。後から本物の故障が増えても、
  // この固定入力は変わらない。
  const PINNED_LEDGER = '73316776590ec9bd96cc48ea372f8e616a37ecc9';
  // 検体の「新しい故障」。固定した台帳に無い id にする（実在の行と重なると新しい故障の検査にならない。
  // 前に使っていた ap-20261024-actions は、10-24 の試運転で本物の行になった。直前の ap-20261026-actions-selftest
  // から、検体の日付に合わせて変えた）。
  const NEW_FAILURE = 'ap-20261029-actions-selftest';
  const NOW = new Date('2026-10-28T22:45:00Z'); // JST 10-29 07:45（定時 07:30 の配信遅れ）
  const ENV = { AUTOPILOT_RECOVERY_ONCE: '2026-10-29', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'schedule',
    GITHUB_RUN_ATTEMPT: '1', GITHUB_REPOSITORY: 'simplememofast/simplememo', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'simplememofast/simplememo/.github/workflows/obsidian-autopilot.yml@refs/heads/main' };
  const STOP = { stopped: false, agents: { actions: { stopped: false } } };
  const fixture = () => {
    const shown = spawnSync('git', ['show', `${PINNED_LEDGER}:data/autopilot-runs.json`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    assert(!shown.error && shown.status === 0, `固定した台帳 ${PINNED_LEDGER.slice(0, 9)} を読めない（履歴が浅い）`);
    const rows = JSON.parse(shown.stdout).runs;
    const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
    const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/escalation-rules.json'), 'utf8')).rules;
    return { analysis: analyze({ runs: rows }, matrix, rules), problems: [], rows, stop: STOP, env: ENV, now: NOW,
      preventionMerged: true };
  };
  const refused = (input, reason) => {
    const r = actionsRecoveryOnce(input);
    assert(!r.allowed && r.reason === reason, `${reason} で止めるべき所を ${r.allowed ? '通した' : r.reason} で返した`);
  };
  SCENARIOS.push(
    ['試運転の許可: 固定した台帳・定時の1回目・当日の日付なら封じ込めを1回だけ越える', () => {
      const r = actionsRecoveryOnce(fixture());
      assert(r.allowed && r.date === '2026-10-29' && r.targets.length === 6, `正しい条件で越えない: ${r.reason}`);
      // 越えるのは JST の当日だけ。UTC の日付で判定すると 09:00 JST 前に1日ずれる。
      refused({ ...fixture(), now: new Date('2026-10-28T14:59:00Z') }, 'not_today');
      assert(actionsRecoveryOnce({ ...fixture(), now: new Date('2026-10-28T15:00:00Z') }).allowed, 'JST 0時ちょうどを当日と読まない');
      refused({ ...fixture(), now: new Date('2026-10-29T15:00:00Z') }, 'not_today');
    }],
    ['試運転の許可: 日付が無い・形が違う値では越えない', () => {
      for (const value of [undefined, '', '  ']) refused({ ...fixture(), env: { ...ENV, AUTOPILOT_RECOVERY_ONCE: value } }, 'not_requested');
      for (const value of ['2026/10/15', '20261015', '2026-10-15T07:30', 'true', '2026-10-15,2026-10-16']) {
        refused({ ...fixture(), env: { ...ENV, AUTOPILOT_RECOVERY_ONCE: value } }, 'invalid_date');
      }
    }],
    ['試運転の許可: 手動起動・再実行・別の参照では越えない（AI も手動起動できる）', () => {
      for (const change of [{ GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_EVENT_NAME: 'repository_dispatch' },
        { GITHUB_RUN_ATTEMPT: '2' }, { GITHUB_ACTIONS: undefined }, { GITHUB_REPOSITORY: 'someone/simplememo' },
        { GITHUB_REF: 'refs/heads/claude/x' }, { GITHUB_WORKFLOW_REF: undefined },
        { GITHUB_WORKFLOW_REF: 'simplememofast/simplememo/.github/workflows/other.yml@refs/heads/main' },
        { GITHUB_WORKFLOW_REF: 'simplememofast/simplememo/.github/workflows/obsidian-autopilot.yml@refs/heads/claude/x' }]) {
        refused({ ...fixture(), env: { ...ENV, ...change } }, 'not_scheduled_first_attempt');
      }
    }],
    ['試運転の許可: 明示の停止・台帳の不整合・上限の変更・修理待ちがあれば越えない', () => {
      for (const stop of [{ stopped: true, agents: { actions: { stopped: false } } },
        { stopped: false, agents: { actions: { stopped: true } } }, { stopped: false, agents: {} }, null]) {
        refused({ ...fixture(), stop }, 'explicit_stop');
      }
      refused({ ...fixture(), problems: ['x'] }, 'policy_or_ledger_changed');
      refused({ ...fixture(), problems: undefined }, 'policy_or_ledger_changed');
      const f = fixture();
      refused({ ...f, analysis: { ...f.analysis, limit: 4 } }, 'policy_or_ledger_changed');
      refused({ ...f, analysis: { ...f.analysis, lane_f_required: true } }, 'repair_pending');
    }],
    ['試運転の許可: 対象・回数・種別・行の中身が1つでも変われば越えない（新しい故障を含む）', () => {
      const f = fixture();
      // 検体の新しい故障が本物の行や許可の対象と重なると、下の検査は「新しい故障」を試さなくなる。
      assert(!f.rows.some(r => r.run_id === NEW_FAILURE), `検体の新しい故障 ${NEW_FAILURE} が固定した台帳に実在する`);
      assert(!Object.hasOwn(ACTIONS_RECOVERY.targets, NEW_FAILURE), `検体の新しい故障 ${NEW_FAILURE} が許可の対象に入っている`);
      // 対象の数に依存させない（数が合わないだけで拒否されると、行ごとの検査が試されないまま緑になる）。
      const all = f.analysis.escalate;
      const pinned = Object.keys(ACTIONS_RECOVERY.targets);
      assert(all.length === pinned.length, `固定した台帳の封じ込めの対象が ${all.length} 件で、許可の対象 ${pinned.length} 件と合わない`);
      const last = all.length - 1;
      const swap = (change, at) => all.map((t, i) => (i === at ? { ...t, ...change } : t));
      refused({ ...f, analysis: { ...f.analysis, escalate: all.slice(0, last) } }, 'containment_changed');
      refused({ ...f, analysis: { ...f.analysis, escalate: [...all, { ...all[last], run_id: NEW_FAILURE }] } }, 'containment_changed');
      // 数を保ったまま、対象のどの1行を変えても越えない（後から足した行も含めて全部試す）。
      for (let at = 0; at < all.length; at++) {
        refused({ ...f, analysis: { ...f.analysis, escalate: swap({ run_id: NEW_FAILURE }, at) } }, 'containment_changed');
        for (const change of [{ repair_attempts_for_class: 6 }, { failure_class: 'unknown' }, { route: 'ccr-0920' }]) {
          refused({ ...f, analysis: { ...f.analysis, escalate: swap(change, at) } }, 'containment_changed');
        }
      }
      for (const id of pinned) {
        const edited = f.rows.map(r => r.run_id === id ? { ...r, failure_reason: '書き換え' } : r);
        refused({ ...f, rows: edited }, 'target_row_changed');
        const doubled = [...f.rows, f.rows.find(r => r.run_id === id)];
        refused({ ...f, rows: doubled }, 'target_row_changed');
      }
      refused({ ...f, rows: null }, 'target_row_changed');
      refused({ ...f, preventionMerged: false }, 'prevention_missing');
      // 新しい no_artifact が1件増えると、封じ込めの対象が7件になって越えない。
      const later = { run_id: NEW_FAILURE, date_jst: '2026-10-29', route: 'actions', attempted: true,
        outcome: 'no_artifact', failure_class: 'no_artifact', source: 'test' };
      const grown = analyze({ runs: [...f.rows, later] }, JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')),
        JSON.parse(fs.readFileSync(path.join(ROOT, 'data/escalation-rules.json'), 'utf8')).rules);
      refused({ ...f, analysis: grown, rows: [...f.rows, later] }, 'containment_changed');
    }],
    ['試運転の許可: 行の指紋はキーの順番に依存しない', () => {
      const row = fixture().rows.find(r => r.run_id === 'ap-20261006-actions');
      const reversed = Object.fromEntries(Object.entries(row).reverse());
      assert(rowDigest(reversed) === ACTIONS_RECOVERY.targets['ap-20261006-actions'], 'キーの順番で指紋が変わった');
    }],
    ['試運転の許可: ワークフローの配線（変数は封じ込めの段だけ・印の段は Act と取り違えない名前）', () => {
      const source = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
      checkRecoveryWiring(source);
      const throws = (mutated, label) => {
        let threw = false;
        try { checkRecoveryWiring(mutated); } catch { threw = true; }
        assert(threw, `${label} を通した`);
      };
      throws(source.replace(`${ACTIONS_RECOVERY.variable}: \${{ vars.${ACTIONS_RECOVERY.variable} }}`, ''), '変数の外れた封じ込め');
      const modelAt = source.indexOf('\n  autopilot:\n');
      throws(source.slice(0, modelAt) + source.slice(modelAt).replace(`${ACTIONS_RECOVERY.variable}: \${{ vars.${ACTIONS_RECOVERY.variable} }}`, ''),
        'モデルのジョブで変数の外れた封じ込め');
      throws(source.replace('        id: collect_contain\n', '        id: contain\n'), 'collect ジョブの確認に id: contain');
      throws(source.replace('        id: collect_budget\n', `        id: collect_budget\n        env:\n          ${ACTIONS_RECOVERY.variable}: \${{ vars.${ACTIONS_RECOVERY.variable} }}\n`),
        'collect ジョブの封じ込め以外の段への変数');
      throws(source.replace('        id: contain\n', ''), 'id の無い封じ込め');
      throws(source.replace('        id: claude\n', `        id: claude\n        env:\n          X: \${{ vars.${ACTIONS_RECOVERY.variable} }}\n`), 'モデルの段への変数');
      throws(source.replace("steps.contain.outputs.recovery == 'actions_once'", "steps.contain.outputs.recovery == 'x'"), '印の段の無い配線');
      throws(source.replace("TRIAL_RUN=${{ steps.contain.outputs.recovery || 'none' }}", 'TRIAL_RUN=none'), 'モデルへ試運転の印が渡らない配線');
    }],
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const runsDoc = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8'));
  const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  const problems = validate(runsDoc, matrix);
  // **読めなかった回は規則が無いものとして扱う** = 全件が修理対象に戻る。
  // 安全側は「直そうとする」ほうで、「読めなかったから直さない」ではない。
  let escalationRules = [];
  try {
    escalationRules = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'data/escalation-rules.json'), 'utf8')).rules || [];
  } catch { escalationRules = []; }
  const a = analyze(runsDoc, matrix, escalationRules);
  let actionsDoc = null;
  try { actionsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/autopilot-actions.json'), 'utf8')); }
  catch { /* 読み取れないときは依頼済みとは判定しない。 */ }
  for (const target of a.targets) target.owner_request = ownerRequest(target, actionsDoc);

  if (process.argv.includes('--contain')) {
    // 上限に達した故障の経路を止める。**表示ではなく状態を変える唯一の経路。**
    //
    // --dry-run では書かずに exit 1 だけを返す。ワークフローはこちらを使う。
    // 判定は台帳（autopilot-runs.json）から**毎回導出される**ので、
    // ランナーの書き込みを push しなくても翌朝また同じ結論になる。
    // 逆に push で残そうとすると、自動運転レーンに main への書き込み権限が
    // 要る — self_repair.must_not の「自分の権限を広げない」に正面から反する。
    const dry = process.argv.includes('--dry-run');
    const { applyTrip, STOP_PATH } = await import('./check-emergency-stop.mjs');
    const stopDoc = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
    const rules = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/escalation-rules.json'), 'utf8')).rules || [];
    if (!a.escalate.length) { console.log('上限に達した故障は無い — 止めない。'); process.exit(0); }
    // The owner explicitly authorized one future Mac primary original turn.
    // Only the verified private permit can defer this derived containment;
    // explicit stops and every other escalated target still take precedence.
    if (!problems.length && a.escalate.length === 1 && a.escalate[0].route === 'actions') {
      const checked = spawnSync('python3', [path.join(ROOT, 'scripts/codex-recovery-permit.py')],
        { encoding: 'utf8', timeout: 60000 });
      let recovery = null;
      try { if (checked.status === 0 && !checked.error) recovery = JSON.parse(checked.stdout); } catch { /* fail closed */ }
      if (recovery?.allowed === true) {
        console.log(`所有者承認の主系1回限り: ${recovery.thread_id} (permit ${recovery.permit_sha256})`);
        console.log('元の故障・修理回数・明示停止は保持。予算・共有claim・通常preflightの確認が必要。');
        process.exit(0);
      }
    }
    // 所有者が日付を入れた日の定時 run だけ（ACTIONS_RECOVERY）。ワークフローの dry-run にだけ効き、
    // セッションの --contain（停止を書き込む側）は今までどおり。
    if (dry) {
      const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', ACTIONS_RECOVERY.prevention_sha, 'HEAD'],
        { cwd: ROOT, timeout: 15000 });
      const recovery = actionsRecoveryOnce({ analysis: a, problems, rows: runsDoc.runs, stop: stopDoc,
        env: process.env, now: new Date(), preventionMerged: !ancestor.error && ancestor.status === 0 });
      if (recovery.allowed) {
        console.log(`所有者承認の試運転（1回限り）: ${recovery.date} の定時 run。対象 ${recovery.targets.join(', ')}`);
        console.log('封じ込めだけを越える。故障行・修理回数・上限・緊急停止・予算・宣言の検査はそのまま。');
        console.log('結果は通常の行として残る。出荷しても 10-05・10-06・10-22・10-24・10-25・10-27 は修理済みにならない。');
        if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'recovery=actions_once\n');
        process.exit(0);
      }
      if (recovery.reason !== 'not_requested') {
        // 値そのものは出さない。理由は型付きのコードだけ。
        console.log(`::warning title=試運転の許可は効かなかった::${ACTIONS_RECOVERY.variable} は設定されているが、`
          + `条件を満たさない（${recovery.reason}）。封じ込めを続ける。`);
      }
    }
    if (dry) {
      for (const t of a.escalate) {
        const route = t.route && stopDoc.agents?.[t.route] ? t.route : 'all';
        console.error(`止めるべき: ${route} — ${t.failure_class} を ${t.repair_attempts_for_class} 回直して再発（上限 ${a.limit}）`);
      }
      console.error('**この判定は台帳から毎回導出される。**書き込みは行わない。');
      process.exit(1);
    }
    let doc = stopDoc; let stoppedAny = false;
    for (const t of a.escalate) {
      const route = t.route && stopDoc.agents?.[t.route] ? t.route : 'all';
      const r = applyTrip(doc, { agent: route, reason: 'repair_limit', by: 'ai', rules });
      if (r.error) { console.error(`止められない: ${r.error}`); process.exit(2); }
      if (r.already) { console.log(`${route} はすでに停止中（${t.failure_class}）`); continue; }
      doc = r.doc; stoppedAny = true;
      console.log(`止めた: ${route} — ${t.failure_class} を ${t.repair_attempts_for_class} 回直して再発（上限 ${a.limit}）`);
    }
    if (stoppedAny) fs.writeFileSync(STOP_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log('**解除は人が data/emergency-stop.json を戻すことでしか行えない。**');
    process.exit(stoppedAny ? 1 : 0);
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...a, problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
  }

  if (a.lane_f_required) {
    console.log('レーンF（自己修復）: **今日の最優先アクションはこれ**');
  } else if (a.escalate.length || a.owner_routed.length) {
    console.log('レーンF（自己修復）: 対象なし。過去の故障と人への依頼状況は以下を確認。');
  } else {
    console.log('レーンF（自己修復）: 未修理の故障なし。通常のレーンA〜Eへ');
  }
  console.log('');
  for (const t of a.targets) {
    const request = t.owner_request;
    const mark = t.escalate ? '⛔ 人に上げる' : request?.state === 'done' ? '✓ 依頼は完了'
      : request?.state === 'acknowledged' ? '✓ 依頼は受付済み' : t.owner_routed ? '🤝 人へ渡す' : '🔧 修理対象';
    console.log(`  ${mark}  ${t.run_id}  [${t.failure_class}]  ${t.outcome}`);
    if (t.failure_reason) console.log(`      ${t.failure_reason}`);
    if (t.owner_routed && !t.escalate) {
      console.log(`      **セッション側に打つ手が無い種別**（escalation-rules: who=owner /`
        + ` ${t.escalation?.channel} / ${t.escalation?.within_hours}時間以内）。`);
      console.log('      修理対象ではないので repair_of を書かない。');
      if (request && !request.needs_attention) {
        console.log(`      ${request.id} は ${request.state}。同じ依頼を owner_requests に再作成しない。`);
        if (request.evidence) console.log(`      依頼台帳の根拠: ${request.evidence}`);
      } else {
        console.log(`      依頼 ${request?.id} の状態: ${request?.state}。アクション台帳と照合し、未対応の依頼をその日の owner_requests に載せる。`);
      }
    }
    if (t.escalate) {
      console.log(`      同種の故障を ${t.repair_attempts_for_class} 回修理して再発している（上限 ${a.limit}）。`);
      console.log('      **これ以上直さない。** 直せないものを毎日直そうとするのが一番たちの悪いループ。');
    }
  }
  if (a.lane_f_required) {
    console.log('');
    console.log('  触ってよいファイル:');
    for (const f of a.may_modify) console.log(`    - ${f}`);
    console.log('');
    console.log('  やってはいけない変更:');
    for (const f of a.must_not) console.log(`    ✗ ${f}`);
    console.log('');
    console.log('  修理したら data/autopilot-runs.json の自分の行に repair_of を書く（Actions 経路の当日ブランチでは、依頼の run.repair_of に書く。Runbook §5-4）。');
    console.log('  書かない限り、その故障は翌日も「未修理」として上がってくる。');
  }
  if (problems.length) {
    console.error('\n自己修復の境界に不整合:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    // CI が走らせるのは --check だけ。試運転の許可を拒否する検体（と既存の境界の検体）をここでも回す。
    // 回さないと、許可の条件を1つ外す変更が SEO Validation を緑のまま通る（レビューで再現）。
    if (run(SCENARIOS) !== 0) process.exit(1);
    checkRecoveryWiring(fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8'));
    const tests = spawnSync('python3', [path.join(ROOT, 'scripts/codex-recovery-permit.py'), '--selftest'],
      { stdio: 'inherit', timeout: 90000 });
    if (tests.error || tests.status !== 0) process.exit(1);
    console.log('\n自己修復の境界に問題なし。');
  }
}
