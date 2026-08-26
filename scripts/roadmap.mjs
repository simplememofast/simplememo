#!/usr/bin/env node
/**
 * **中期（13週）に何が起きるかを、台帳から組み立てる。**
 *
 *   node scripts/roadmap.mjs             # 表示
 *   node scripts/roadmap.mjs --json      # 機械可読
 *   node scripts/roadmap.mjs --check     # CI
 *   node scripts/roadmap.mjs --selftest
 *
 * 【なぜ要るか】
 * data/automation-coverage.json の「週次・月次・四半期ロードマップの自己生成」が
 * `nobody` のまま残っていた。理由もそこに書いてある:
 *
 *   いま存在するのは当日のアクション台帳（data/autopilot-actions.json）と
 *   個別のバックログだけ。**「次の四半期に何をやるか」を機械が組み立てる経路が無い。**
 *   日次の最適化だけが自動化されていると、**短期に効く施策へ寄る**
 *   （このリポジトリの実装が③に集中しているのは、その現れでもある）
 *
 * 【この道具がしないこと】**日付を発明しない。**
 * 台帳に日付があるものだけを暦に置く。順番しか決まらないものは
 * 「順番だけ」の欄に出し、**いつやるとは書かない。**
 * 期日の無い仕事に期日をでっち上げるのは、計画ではなく作文になる。
 *
 * 同じ理由で、**オーナーの手数が要るものを機械の仕事と混ぜない。**
 * 混ぜると「あと15タスクで70%」が「機械だけで届く」に見えてしまう。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run as runScenarios } from './lib/selftest.mjs';
import { readLedger, requireShape } from './lib/read-ledger.mjs';
import { planTo, UNLOCKS } from './autonomy-gap.mjs';
import { EVIDENCE_STRENGTH } from './feature-score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WEEKS = 13;

const COVERAGE = path.join(ROOT, 'data/automation-coverage.json');
const BACKLOG = path.join(ROOT, 'data/feature-backlog.json');
const EXPERIMENTS = path.join(ROOT, 'growth/experiments/experiments.json');

/** 台帳が「機械だけで進む」と言える種別。**owner_* はここに入れない。** */
const MACHINE_KINDS = new Set(['wait', 'implement']);

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * 13週の窓に**日付が入っているもの**だけを置く。
 * running でも評価日が無いものは置かない（**いつ判定するか決まっていない**ので）。
 */
export function dated(experiments, today, weeks = WEEKS) {
  const end = addDays(today, weeks * 7);
  const rows = [];
  const undatedRunning = [];
  for (const e of experiments) {
    if (e.status !== 'running') continue;
    if (!e.evaluation_at) { undatedRunning.push(e.id); continue; }
    if (e.evaluation_at < today) { rows.push({ ...e, overdue: true }); continue; }
    if (e.evaluation_at <= end) rows.push({ ...e, overdue: false });
  }
  rows.sort((a, b) => a.evaluation_at.localeCompare(b.evaluation_at));
  return { rows, end, undatedRunning };
}

/**
 * 順番だけ決まるもの。**バックログは日付を持たないので、順位しか出せない。**
 * 証拠の強さを落とさない —— 推測を実測と同じ列に並べない。
 */
export function ranked(candidates) {
  // [2026-08-26] ここで語彙を**自分で書き直していた**（reported / guess）。
  // 実際の語彙は observed / analogous / hypothesis で、**書いた2つは台帳に存在しない。**
  // 知らない値は 0 に落ちるので、**未知を「いちばん弱い」と同じ扱い**にしていた。
  // feature-score.mjs が正で、そちらは未知を error で返す（0点で通さない）。
  // 語彙は1箇所に持ち、**知らない値はここでも通さない。**
  const strength = EVIDENCE_STRENGTH;
  return [...candidates]
    .map((c) => ({
      id: c.id,
      title: c.title,
      effect: c.expected_effect ?? null,
      days: c.effort_days ?? null,
      evidence: c.evidence_strength ?? null,
      // **知らない語は 0 にしない。**null のまま出して、validate が落とす
      evidence_known: Object.prototype.hasOwnProperty.call(EVIDENCE_STRENGTH, c.evidence_strength),
      // 効果 ÷ 日数。**どちらかが無ければ順位を付けない**（0 で埋めない）
      ratio: (c.expected_effect != null && c.effort_days > 0)
        ? c.expected_effect / c.effort_days : null,
    }))
    .sort((a, b) => {
      if ((a.ratio === null) !== (b.ratio === null)) return a.ratio === null ? 1 : -1;
      const s = (strength[b.evidence] ?? -1) - (strength[a.evidence] ?? -1);
      return s !== 0 ? s : (b.ratio ?? 0) - (a.ratio ?? 0);
    });
}

/** 誰が動かすかで分ける。**混ぜない。** */
export function split(steps) {
  const machine = steps.filter((s) => MACHINE_KINDS.has(s.kind) && !UNLOCKS[s.id]?.defer);
  const owner = steps.filter((s) => !MACHINE_KINDS.has(s.kind) && !UNLOCKS[s.id]?.defer);
  const deferred = steps.filter((s) => UNLOCKS[s.id]?.defer);
  return { machine, owner, deferred };
}

export function build(docs, today) {
  const plan = planTo(docs.coverage, 0.70);
  const { rows, end, undatedRunning } = dated(docs.experiments.experiments || [], today);
  return {
    generated_for: today,
    window: { from: today, to: end, weeks: WEEKS },
    now_rate: plan.now / plan.denominator,
    dated: rows,
    undated_running: undatedRunning,
    ...split(plan.steps),
    backlog: ranked(docs.backlog.candidates || []),
  };
}

/**
 * **組み立てたものが台帳に無い、を落とす。**
 * ロードマップは提案ではなく再構成なので、台帳に無い項目が出たら
 * それは発明であって計画ではない。
 */
export function validate(r) {
  const problems = [];
  for (const d of r.dated) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.evaluation_at)) {
      problems.push(`${d.id}: 評価日が日付の形をしていない（${d.evaluation_at}）`);
    }
    if (d.evaluation_at > r.window.to) problems.push(`${d.id}: 窓の外なのに置かれている`);
  }
  for (const s of [...r.machine, ...r.owner, ...r.deferred]) {
    if (!UNLOCKS[s.id]) problems.push(`解除条件「${s.id}」が UNLOCKS に無い — **台帳に無いものを計画に出さない**`);
  }
  // **機械の側にオーナー待ちが混ざっていないこと。**ここが混ざると
  // 「機械だけで届く」の主張が壊れる
  for (const s of r.machine) {
    if (!MACHINE_KINDS.has(s.kind)) problems.push(`${s.id} (${s.kind}) が機械側に入っている`);
  }
  for (const b of r.backlog) {
    if (b.ratio === null && b.effect !== null && b.days !== null) {
      problems.push(`${b.id}: 効果と日数があるのに順位が付いていない`);
    }
    // **知らない evidence_strength を「いちばん弱い」として通さない。**
    // feature-score.mjs が「0点で通さない」と決めているのと同じ扱いにする
    if (!b.evidence_known) {
      problems.push(`${b.id}: evidence_strength「${b.evidence}」は語彙に無い`
        + ` — ${Object.keys(EVIDENCE_STRENGTH).join(' / ')} のいずれか。`
        + '**知らない語を最弱として並べない**（順位が黙って動く）');
    }
  }
  if (!r.dated.length && !r.machine.length) {
    problems.push('日付のあるものも機械の仕事も0件 — **台帳を読めていない疑い**');
  }
  return problems;
}

export function render(r) {
  const o = [];
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  o.push(`中期ロードマップ ${r.window.from} → ${r.window.to}（${r.window.weeks}週）`);
  o.push(`  現在の総合自動化率 ${pct(r.now_rate)}\n`);

  o.push('■ 日付が決まっているもの（台帳に評価日がある）');
  if (!r.dated.length) o.push('    この窓に評価日が来る実験は無い');
  const byMonth = new Map();
  for (const d of r.dated) {
    const m = d.evaluation_at.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) || []), d]);
  }
  for (const [m, xs] of byMonth) {
    o.push(`    ${m}  ${xs.length}件`);
    for (const x of xs.slice(0, 4)) {
      o.push(`      ${x.evaluation_at}  ${x.id}${x.overdue ? '  **評価日を過ぎている**' : ''}`);
    }
    if (xs.length > 4) o.push(`      … 他 ${xs.length - 4}件`);
  }
  if (r.undated_running.length) {
    o.push(`    **評価日を持たない running が ${r.undated_running.length}件**`
      + ' — いつ判定するか決まっていないので暦に置けない');
  }

  o.push('\n■ 機械と時間だけで進むもの（順番は決まる。**日付は台帳に無い**）');
  for (const s of r.machine) {
    o.push(`    [${s.kind === 'wait' ? '待つ' : '実装'}] ${UNLOCKS[s.id]?.label ?? s.id}`
      + `  +${s.tasks.length}件 → ${pct(s.rate)}`);
  }

  o.push('\n■ オーナーの手数が要るもの（**機械の側と混ぜない**）');
  for (const s of r.owner) {
    o.push(`    [${s.kind}] ${UNLOCKS[s.id]?.label ?? s.id}  +${s.tasks.length}件`);
  }

  if (r.deferred.length) {
    o.push('\n■ 後置（**件数のために作らない**）');
    for (const s of r.deferred) o.push(`    ${UNLOCKS[s.id]?.label ?? s.id}  +${s.tasks.length}件`);
  }

  o.push('\n■ 機能バックログ（**順位のみ。日付は持っていない**）');
  // [2026-08-26] 1列に並べていたら、**効果比 10.0 が 1.2 の下に出て**
  // 「壊れている」ようにしか読めなかった。並びの第一鍵は証拠の強さで、
  // それが列に見えていなかったのが原因。**並べ替えの根拠を見せる。**
  // 語は feature-score.mjs が正。**ここで増やさない**
  const LABEL = { measured_ours: '自社で実測', measured_external: '外部の実測',
    observed: '観察したが数えていない', analogous: '別の事例からの類推', hypothesis: '思いつき' };
  const seen = new Set();
  for (const b of r.backlog) {
    if (!seen.has(b.evidence)) {
      seen.add(b.evidence);
      o.push(`    ── ${LABEL[b.evidence] ?? b.evidence}`);
    }
    o.push(`      ${b.ratio === null ? '  — ' : b.ratio.toFixed(1).padStart(4)}`
      + `  ${b.title.slice(0, 44)}${b.days != null ? `  （${b.days}日）` : ''}`);
  }
  o.push('    **証拠の強い側が先。**効果比だけで並べると、推測を実測と同じ列に置くことになる');

  o.push('\n  **日付を発明していない。**台帳に日付があるものだけを暦に置いた。');
  o.push('  順番しか決まらないものは順番だけ出している。');
  return o.join('\n');
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const EXP = (id, at, status = 'running') => ({ id, evaluation_at: at, status });
const SCENARIOS = [
  ['窓の中の評価日は置く', () => {
    const { rows } = dated([EXP('a', '2026-09-01')], '2026-08-26');
    assert(rows.length === 1, JSON.stringify(rows));
  }],
  ['**窓の外は置かない**（13週より先を今の計画に混ぜない）', () => {
    const { rows } = dated([EXP('a', '2027-01-01')], '2026-08-26');
    assert(rows.length === 0, JSON.stringify(rows));
  }],
  ['**評価日を過ぎた running は置く**（過ぎたことは消さない）', () => {
    const { rows } = dated([EXP('a', '2026-08-01')], '2026-08-26');
    assert(rows.length === 1 && rows[0].overdue, JSON.stringify(rows));
  }],
  ['**評価日を持たない running は暦に置かず、件数で出す**', () => {
    const { rows, undatedRunning } = dated([EXP('a', null)], '2026-08-26');
    assert(rows.length === 0 && undatedRunning.length === 1,
      '**いつ判定するか決まっていないものに日付を付けない**');
  }],
  ['running でないものは置かない', () => {
    const { rows } = dated([EXP('a', '2026-09-01', 'evaluated')], '2026-08-26');
    assert(rows.length === 0, JSON.stringify(rows));
  }],
  ['**効果か日数が欠けたら順位を付けない**（0 で埋めない）', () => {
    const r = ranked([{ id: 'x', title: 't', expected_effect: 8 }]);
    assert(r[0].ratio === null, '欠測を 0 として順位に混ぜた');
  }],
  ['**証拠の強い側を先に置く**（思いつきを実測と同じ列に並べない）', () => {
    const r = ranked([
      { id: 'h', title: 'g', expected_effect: 9, effort_days: 1, evidence_strength: 'hypothesis' },
      { id: 'ours', title: 'o', expected_effect: 4, effort_days: 1, evidence_strength: 'measured_ours' },
    ]);
    assert(r[0].id === 'ours', `思いつき(${r[0].id})が先に来た`);
  }],
  ['**知らない evidence_strength は落とす**（最弱として黙って並べない）', () => {
    const r = ranked([{ id: 'x', title: 't', expected_effect: 1, effort_days: 1, evidence_strength: 'なんとなく' }]);
    const p = validate({ window: { to: '2099-01-01' }, dated: [], machine: [], owner: [], deferred: [], backlog: r });
    assert(p.some((x) => x.includes('語彙に無い')), JSON.stringify(p));
  }],
  ['**語彙は feature-score.mjs のものを実際に使っている**（書き写していない）', () => {
    // observed(0.5) と analogous(0.3) は**正の語彙にしか無い**。
    // 自前で書き直した表ではどちらも未知になり、順位が効果比へ落ちる。
    // 効果比は analogous 側を高くしてあるので、**書き写すと順序が入れ替わる。**
    const r = ranked([
      { id: 'ana', title: 'a', expected_effect: 9, effort_days: 1, evidence_strength: 'analogous' },
      { id: 'obs', title: 'o', expected_effect: 1, effort_days: 1, evidence_strength: 'observed' },
    ]);
    assert(r[0].id === 'obs',
      '**observed が analogous より先に来ない** — feature-score.mjs の語彙を使っていない疑い');
  }],
  ['**オーナー待ちを機械側に混ぜない**', () => {
    const s = split([{ id: 'reply_gate', kind: 'owner_decision', tasks: [1] },
      { id: 'bq_28d', kind: 'wait', tasks: [1] }]);
    assert(s.machine.length === 1 && s.machine[0].id === 'bq_28d', JSON.stringify(s.machine));
    assert(s.owner.length === 1, JSON.stringify(s.owner));
  }],
  ['**defer は機械側にもオーナー側にも入れない**（件数のために作らない）', () => {
    const s = split([{ id: 'impl_analog', kind: 'implement', tasks: [1, 2] }]);
    assert(s.machine.length === 0 && s.deferred.length === 1, JSON.stringify(s));
  }],
  ['**台帳に無い解除条件は落ちる**（発明を計画に出さない）', () => {
    const p = validate({ window: { to: '2026-12-01' }, dated: [], machine: [{ id: 'そんなものは無い', kind: 'wait' }],
      owner: [], deferred: [], backlog: [] });
    assert(p.some((x) => x.includes('UNLOCKS に無い')), JSON.stringify(p));
  }],
  ['**実データで組み立てが通る**', () => {
    const r = build(load(), today());
    const p = validate(r);
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 2).join(' / ')}`);
    assert(r.dated.length > 0 || r.machine.length > 0, '実データで何も出ていない');
  }],
];

function today() { return new Date().toISOString().slice(0, 10); }

function load() {
  const coverage = requireShape(readLedger(COVERAGE), ['tasks'],
    { what: 'data/automation-coverage.json', why: '解除条件を組み立てられない' });
  const backlog = requireShape(readLedger(BACKLOG), ['candidates'],
    { what: 'data/feature-backlog.json', why: '順位を出す対象が無い' });
  const experiments = requireShape(readLedger(EXPERIMENTS), ['experiments'],
    { what: 'growth/experiments/experiments.json', why: '評価日を暦に置けない' });
  return { coverage, backlog, experiments };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(runScenarios(SCENARIOS) === 0 ? 0 : 1);
  const r = build(load(), today());
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(render(r));
  const problems = validate(r);
  if (problems.length) {
    console.error('\n中期ロードマップ: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n組み立ては台帳の再構成のみ。発明した項目・日付は無い。');
}
