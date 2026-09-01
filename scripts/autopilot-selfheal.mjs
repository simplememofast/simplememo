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
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');

const FAILED = new Set(['no_artifact', 'failed', 'cancelled', 'no_run']);

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
 * **消すのではなく、行き先を変える。**owner_routed は毎回そのまま表示され、
 * その日の owner_requests に載る。数えるのをやめるのはレーンFの対象としてだけ。
 *
 * **これが「直さない口実」に使われないための歯止め:**
 * `data/escalation-rules.json` は self_repair.may_modify に**入っていない**。
 * レーンFは規則そのものを書き換えられないので、`who` を owner に書き換えて
 * 修理から逃げる経路が無い。規則が読めなかった回は全件が修理対象に戻る
 * （安全側は「直そうとする」ほう）。
 */
export function analyze(runsDoc, matrix, escalationRules = []) {
  const runs = runsDoc.runs;
  const repaired = new Set(runs.flatMap((r) => r.repair_of || []));
  const failures = runs.filter((r) => FAILED.has(r.outcome));
  const unrepaired = failures.filter((r) => !repaired.has(r.run_id));

  // 同じ failure_class を何回直したかを数える。再発の回数ではなく
  // **修理を試みた回数**を数える（直らない修理を繰り返すのを止めたいので）。
  const repairAttempts = {};
  for (const r of runs) {
    for (const targetId of r.repair_of || []) {
      const target = runs.find((x) => x.run_id === targetId);
      const cls = target?.failure_class || 'unknown';
      repairAttempts[cls] = (repairAttempts[cls] || 0) + 1;
    }
  }

  const sr = matrix.self_repair || {};
  const limit = sr.stop_after_failed_repairs ?? 3;

  const targets = unrepaired.map((r) => {
    const cls = r.failure_class || 'unknown';
    const tried = repairAttempts[cls] || 0;
    const rule = escalationRules.find((x) => x.trigger === cls);
    return {
      run_id: r.run_id, date_jst: r.date_jst, route: r.route,
      outcome: r.outcome, failure_class: cls,
      failure_reason: r.failure_reason,
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
  // 失敗しているのに failure_class が無い行は、再発を数えられない
  for (const r of runsDoc.runs) {
    if (FAILED.has(r.outcome) && !r.failure_class) {
      problems.push(`${r.run_id}: outcome=${r.outcome} なのに failure_class が無い — 「前と同じ故障か」を判定できない`);
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
    console.log('レーンF（自己修復）: 対象なし（ただし人に上げるべき故障がある）');
  } else {
    console.log('レーンF（自己修復）: 未修理の故障なし。通常のレーンA〜Eへ');
  }
  console.log('');
  for (const t of a.targets) {
    const mark = t.escalate ? '⛔ 人に上げる' : t.owner_routed ? '🤝 人へ渡す' : '🔧 修理対象';
    console.log(`  ${mark}  ${t.run_id}  [${t.failure_class}]  ${t.outcome}`);
    if (t.failure_reason) console.log(`      ${t.failure_reason}`);
    if (t.owner_routed && !t.escalate) {
      console.log(`      **セッション側に打つ手が無い種別**（escalation-rules: who=owner /`
        + ` ${t.escalation?.channel} / ${t.escalation?.within_hours}時間以内）。`);
      console.log('      修理対象ではないので repair_of を書かない。**その日の owner_requests に載せる。**');
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
    console.log('  修理したら data/autopilot-runs.json の自分の行に repair_of を書く。');
    console.log('  書かない限り、その故障は翌日も「未修理」として上がってくる。');
  }
  if (problems.length) {
    console.error('\n自己修復の境界に不整合:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n自己修復の境界に問題なし。');
}
