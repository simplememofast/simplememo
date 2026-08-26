#!/usr/bin/env node
/**
 * プレスリリースの見出し・リード文を、実装台帳に当てて検証する。
 *
 *   node scripts/check-pr-claims.mjs           # 一覧
 *   node scripts/check-pr-claims.mjs --check   # CI用（未解決の参照があれば exit 1）
 *   node scripts/check-pr-claims.mjs --json
 *
 * **原稿が実装から離れていくのを止めるための検査。**
 * リード文に書いた工程が台帳で裏付けられているかを、配信前ではなく毎PRで見る。
 *
 * 支持率が閾値を割っても **exit 1 にはしない** — それは「まだ書けない」であって
 * 「壊れている」ではない。落とすのは台帳の参照が解決できないとき（＝原稿と
 * 台帳のどちらかが古い）。**赤い行を黙って消すためのスクリプトにしない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const AI_EXECUTES = new Set(['ai_autonomous', 'ai_executes_gated']);
const HUMAN_HELD = new Set(['human_only', 'ai_executes_gated', 'ai_proposes']);
/**
 * mode: 'ai_proposes' 用。**「AIがやる」と「AIが出す」を書き分けるために足した**
 * （2026-08-25）。
 *
 * それまで mode は ai_executes と human_approves の2つしか無く、
 * 「AIは提案までで、決めるのは人」という中間を表現できなかった。表現できないと
 * どうなるかというと、**中間の工程が「AIが実行する」側に丸められる。**
 * 実際そうなっていて、サブタイトルの「機能開発」は台帳で60%（設計への
 * 落とし込みとPRD作成が ai_proposes）なのに、原稿は実行と読める書き方をしていた。
 * 本文 §3 は「分析と提案はAI」と正しく書いており、**サブタイトルだけが強かった。**
 *
 * nobody / intentional_no は入れない。**提案すら出ていないものを「提案まで」とは
 * 言えない。**
 */
const AI_INVOLVED = new Set(['ai_autonomous', 'ai_executes_gated', 'ai_proposes']);

/**
 * mode 名 → 支持に数える executor の集合。
 *
 * [2026-08-26] **一覧にしたのは、知らない mode を黙って丸めないため。**
 * 以前は三項演算子の末尾が既定になっていて、`human_aproves` のような
 * 打ち間違いは AI_EXECUTES として評価された。厳しい側へ倒れるので
 * 誇大にはならないが、**「なぜ書けないのか」を誰も説明できない状態**になる。
 * 「判定できなかった」を「支持されなかった」と混ぜない。
 */
const MODE_SETS = new Map([
  ['ai_executes', AI_EXECUTES],
  ['human_approves', HUMAN_HELD],
  ['ai_proposes', AI_INVOLVED],
]);

export function evaluate(claimsDoc, coverage) {
  const index = new Map(coverage.tasks.map((t) => [`${t.area}::${t.task}`, t]));
  const unresolved = [];
  const invalidModes = [];

  const claims = claimsDoc.claims.map((c) => {
    const rows = c.requires.map((ref) => {
      const task = index.get(ref);
      if (!task) unresolved.push({ claim: c.id, ref });
      return { ref, task: task ?? null };
    });

    const found = rows.filter((r) => r.task);
    if (!MODE_SETS.has(c.mode)) {
      invalidModes.push({ claim: c.id, mode: c.mode });
    }
    const modeSet = MODE_SETS.get(c.mode) ?? AI_EXECUTES;
    const satisfied = found.filter((r) => modeSet.has(r.task.executor));
    const support = found.length ? satisfied.length / found.length : 0;

    return {
      ...c,
      rows,
      support,
      supported: support >= claimsDoc.pass_threshold,
      weak: found.filter((r) => !satisfied.includes(r)),
    };
  });

  return { claims, unresolved, invalidModes };
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// この検査が守っているのは「原稿が実装から離れていくこと」。
// **その検出が効かなくなったときに落ちること**を、ここで固定する。
const COV = (executor) => ({ tasks: [{ area: 'A', task: 'T', executor }] });
const DOC = (mode, requires = ['A::T'], pass_threshold = 0.7) => ({
  pass_threshold, headline: 'x',
  claims: [{ id: 'c', phrase: 'p', mode, requires }],
});
const evalOne = (mode, executor, requires) => evaluate(DOC(mode, requires), COV(executor));

const SCENARIOS = [
  ['実データの参照がすべて解決する', () => {
    const r = evaluate(readJSON('data/pr-claims.json'), readJSON('data/automation-coverage.json'));
    if (r.unresolved.length) throw new Error(`未解決 ${r.unresolved.length} 件`);
    if (r.invalidModes.length) throw new Error(`知らない mode: ${JSON.stringify(r.invalidModes)}`);
  }],
  ['**台帳に無い参照は未解決になる**（原稿か台帳のどちらかが古い）', () => {
    const r = evalOne('ai_executes', 'ai_autonomous', ['A::存在しないタスク']);
    if (r.unresolved.length !== 1) throw new Error('未解決にならなかった');
  }],
  ['**executor が下がれば支持率も下がる**（台帳が正、原稿は従）', () => {
    const up = evalOne('ai_executes', 'ai_autonomous').claims[0];
    const down = evalOne('ai_executes', 'nobody').claims[0];
    if (up.support !== 1) throw new Error(`自律で ${up.support}`);
    if (down.support !== 0) throw new Error(`未実装で ${down.support}`);
    if (down.supported) throw new Error('未実装なのに「書ける」');
  }],
  ['**既定の mode は「提案まで」を支持に数えない**（2026-08-25 の訂正の核）', () => {
    const c = evalOne('ai_executes', 'ai_proposes').claims[0];
    if (c.supported) throw new Error('提案止まりを「AIが実行する」として書けてしまう');
  }],
  ['mode: ai_proposes なら「提案まで」を数える（AIがやる／AIが出すの書き分け）', () => {
    const c = evalOne('ai_proposes', 'ai_proposes').claims[0];
    if (!c.supported) throw new Error('提案の主張が提案で支持されない');
  }],
  ['mode: human_approves は「人間のみ」も数える', () => {
    const c = evalOne('human_approves', 'human_only').claims[0];
    if (!c.supported) throw new Error('人の承認の主張が human_only で支持されない');
  }],
  ['**未実装・やらない は、どの mode でも支持に数えない**', () => {
    for (const mode of ['ai_executes', 'ai_proposes', 'human_approves']) {
      for (const executor of ['nobody', 'intentional_no']) {
        if (evalOne(mode, executor).claims[0].supported) {
          throw new Error(`${mode} × ${executor} が「書ける」になった`);
        }
      }
    }
  }],
  ['**知らない mode は検出する**（黙って既定へ丸めない）', () => {
    const r = evalOne('human_aproves', 'human_only');
    if (!r.invalidModes.length) {
      throw new Error('打ち間違いが既定として評価され、誰も気づかない');
    }
  }],
  ['支持の下限で「書ける／書けない」が切り替わる', () => {
    const cov = { tasks: [
      { area: 'A', task: 'T1', executor: 'ai_autonomous' },
      { area: 'A', task: 'T2', executor: 'nobody' },
    ] };
    const doc = (t) => ({ pass_threshold: t, headline: 'x',
      claims: [{ id: 'c', phrase: 'p', mode: 'ai_executes', requires: ['A::T1', 'A::T2'] }] });
    if (!evaluate(doc(0.5), cov).claims[0].supported) throw new Error('50%で書けない');
    if (evaluate(doc(0.7), cov).claims[0].supported) throw new Error('70%で書けてしまう');
  }],
  ['**支持されない主張は weak にその理由を残す**（赤い行を黙って消させない）', () => {
    const c = evalOne('ai_executes', 'nobody').claims[0];
    if (c.weak.length !== 1) throw new Error(`weak=${c.weak.length}`);
    if (c.weak[0].task.executor !== 'nobody') throw new Error('理由が残っていない');
  }],
];

if (process.argv.includes('--selftest')) {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const LABEL = {
  ai_autonomous: '自律', ai_executes_gated: 'ゲート', ai_proposes: '提案',
  human_only: '人間', nobody: '未実装', intentional_no: 'やらない',
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const claimsDoc = readJSON('data/pr-claims.json');
  const coverage = readJSON('data/automation-coverage.json');
  const { claims, unresolved, invalidModes } = evaluate(claimsDoc, coverage);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      claims: claims.map((c) => ({ id: c.id, phrase: c.phrase, support: c.support, supported: c.supported })),
      unresolved,
    }, null, 2));
    process.exit(0);
  }

  console.log('プレスリリースの主張 × 実装台帳');
  console.log(`  見出し: ${claimsDoc.headline}`);
  console.log(`  支持の下限: ${(claimsDoc.pass_threshold * 100).toFixed(0)}%\n`);

  const sorted = [...claims].sort((a, b) => a.support - b.support);
  for (const c of sorted) {
    const pct = (c.support * 100).toFixed(0).padStart(3);
    const mark = c.supported ? '書ける' : '**書けない**';
    console.log(`  ${pct}%  ${mark}  「${c.phrase}」${c.mode === 'human_approves' ? '（人の承認）' : c.mode === 'ai_proposes' ? '（提案まで）' : ''}`);
    if (c.note) console.log(`         ${c.note}`);
    for (const r of c.weak) {
      console.log(`         ✗ [${LABEL[r.task.executor]}] ${r.ref.split('::')[1]}`);
    }
    console.log('');
  }

  const blocked = claims.filter((c) => !c.supported);
  if (blocked.length) {
    console.log(`  この見出しで撃つには ${blocked.length} 件が足りない:`);
    for (const c of blocked) {
      const need = c.weak.filter((r) => r.task.executor === 'nobody');
      console.log(`    「${c.phrase}」— 未実装 ${need.length}件 / 提案止まり ${c.weak.length - need.length}件`);
    }
    console.log('');
    console.log('  **支持率が低いことでは落とさない。**それは「まだ書けない」であって');
    console.log('  「壊れている」ではない。落とすのは台帳の参照が解決できないときだけ。');
    console.log('');
  }

  if (unresolved.length) {
    console.log('  台帳に見つからない参照（原稿か台帳のどちらかが古い）:');
    for (const u of unresolved) console.log(`    ${u.claim}: ${u.ref}`);
    console.log('');
  }

  if (invalidModes.length) {
    console.log('  知らない mode（既定へ丸めず、ここで止める）:');
    for (const m of invalidModes) console.log(`    ${m.claim}: ${JSON.stringify(m.mode)}`);
    console.log('');
  }

  if (argv.includes('--check')) {
    if (unresolved.length || invalidModes.length) {
      if (unresolved.length) {
        console.error(`主張の検証に失敗: 解決できない参照が ${unresolved.length} 件`);
      }
      if (invalidModes.length) {
        console.error(`主張の検証に失敗: 知らない mode が ${invalidModes.length} 件`
          + '（**「判定できなかった」を「支持されなかった」と混ぜない**）');
      }
      process.exit(1);
    }
    console.log('参照はすべて解決した（支持率は上の一覧を見ること）。');
  }
}
