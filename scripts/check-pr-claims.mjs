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
import { readJSON } from './lib/read-json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * **見出し・リード文に書いた数字を、台帳の計算に当てる。**
 *
 * 【なぜ要るか — 実際にずれていた】
 * 2026-09-01 時点で `data/pr-claims.json` は「65.7%」「13領域202タスク」と書いていたが、
 * 台帳の計算は **66.3% / 203タスク**だった。`evaluate()` は claims の参照しか見ておらず、
 * **見出しとリード文の数字は誰も検算していなかった。**
 *
 * 配信物にとってここが一番高くつく —— 記者が最初に引くのは見出しの数字で、
 * **台帳と1桁違うだけで、残り全部の信頼が落ちる。**
 * `code-authorship.json` が「再現できない数字は、記者に聞かれた瞬間にいちばん高くつく」と
 * 書いているのと同じ理由を、率のほうにも効かせる。
 *
 * 【小数点のある % だけを見る】
 * 見出しには「本番15件は100%AI」のように**別の指標**も並ぶ。全部を総合自動化率と
 * 突き合わせると誤検出になるので、**小数第1位まで書かれた率**（65.7% / 91.5% など）だけを
 * 総合自動化率の名乗りとみなす。100% や 95% は素通しする。
 *
 * **この規則は「1つの率しか書くな」ではない。**併記は台帳の規約そのもの
 * （4つの率を必ず並べて出す）なので、**小数付きで書いてよい率を増やしたくなったら
 * ここへ足す** —— 黙って通す形にはしない。
 */
export function checkNumbers(claimsDoc, coverage) {
  const problems = [];
  const tasks = coverage.tasks ?? [];
  const counted = tasks.filter((t) => t.executor !== 'intentional_no');
  const active = counted.filter((t) => t.executor !== 'nobody');
  const executing = counted.filter((t) => AI_EXECUTES.has(t.executor));
  const involved = counted.filter((t) => AI_INVOLVED.has(t.executor));
  const pct = (n, d) => (d ? (n / d) * 100 : 0).toFixed(1);

  // **台帳が定める4つの率。**規約は「4つを必ず並べて出す」なので、
  // **どれを書いてもよいが、台帳の計算と一致していること。**
  const RATES = {
    総合自動化率: pct(executing.length, counted.length),
    AI実行率: pct(executing.length, active.length),
    AI関与率: pct(involved.length, active.length),
    カバー率: pct(active.length, counted.length),
  };
  const rateStr = RATES.総合自動化率;
  const allowed = new Set(Object.values(RATES));
  const areas = new Set(tasks.map((t) => t.area)).size;

  const text = `${claimsDoc.headline ?? ''}\n${claimsDoc.subhead ?? ''}`;

  // 小数付きの率は、**4つのどれかと一致していなければならない。**
  // 併記は台帳の規約そのものなので、1つに縛らない。
  // ただし**台帳に無い数字は通さない**（91.5% はここで落ちる）。
  for (const m of text.matchAll(/(\d+\.\d)%/g)) {
    if (!allowed.has(m[1])) {
      problems.push(`原稿の「${m[1]}%」が台帳のどの率とも一致しない`
        + ` — ${Object.entries(RATES).map(([k, v]) => `${k} ${v}%`).join(' / ')}。`
        + '**台帳を動かしたら原稿も動かす**');
    }
  }
  // **数字は、名前と一緒でなければ書けない。**
  //
  // 4つの率は分母が違い、**意味も違う。**AI関与率（87.9%）は `ai_proposes` —— 
  // 「提案・下書き・検知まで。適用/実行は人間」——を含むので、
  // **これに「人の承認を待たずに」と付けると嘘になる。**
  // 一方 AI実行率（75.9%）が数えるのは `ai_executes_gated` までで、
  // その定義が「人の個別承認は不要」なので、自律の語を当てられる。
  //
  // **この取り違えは、この原稿で一度起きている** —— 旧サブタイトルが
  // 「機能開発…までをAIが一気通貫で循環」と書き、機能開発は60%が ai_proposes だった。
  // 台帳に「本文は正しく、**サブタイトルだけが強かった**」と記録が残っている。
  //
  // 裸の数字を許すと、**率だけ差し替えて語はそのまま**という直し方ができてしまう。
  // 名前を要求すれば、差し替えた瞬間に名前と分母が食い違って読者に見える。
  const NAMES = {
    総合自動化率: ['総合自動化率', '自動化率'],
    AI実行率: ['AI実行率', '実行率'],
    AI関与率: ['AI関与率', '関与率'],
    カバー率: ['カバー率'],
  };
  for (const [name, value] of Object.entries(RATES)) {
    if (!text.includes(`${value}%`)) continue;
    if (!NAMES[name].some((n) => text.includes(n))) {
      problems.push(`原稿の「${value}%」に名前が付いていない — これは**${name}**`
        + '（分母も意味も率ごとに違う）。**裸の数字は、語だけ残して率を差し替えられる**');
    }
  }

  // **総合自動化率だけは必ず出す。**一番厳しい数え方を落とすと、
  // 残った率だけが独り歩きする（台帳が「一番やってはいけない」と書いている形）。
  if (!text.includes(`${rateStr}%`)) {
    problems.push(`原稿に総合自動化率（${rateStr}%）が出てこない`
      + ' — **一番厳しい数え方を落とすと、残った率だけが独り歩きする**');
  }

  // 分解の規模。「13領域202タスク」の形で書いてある。
  const shape = text.match(/(\d+)\s*領域\s*(\d+)\s*タスク/);
  if (!shape) {
    problems.push('原稿に「N領域Nタスク」の分解が出てこない — 分母を書かない率は読めない');
  } else {
    if (Number(shape[1]) !== areas) {
      problems.push(`原稿の領域数「${shape[1]}」が台帳（${areas}）と違う`);
    }
    if (Number(shape[2]) !== tasks.length) {
      problems.push(`原稿のタスク数「${shape[2]}」が台帳（${tasks.length}）と違う`
        + ' — **分母が古いと、率だけ直しても合わない**');
    }
  }
  return { problems, rateStr, rates: RATES, areas, total: tasks.length };
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
  ['**実データ: 見出しの数字が台帳と一致する**（原稿が独り歩きしない）', () => {
    const r = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), readJSON(ROOT, 'data/automation-coverage.json'));
    if (r.problems.length) throw new Error(r.problems.join(' / '));
  }],
  ['**古い率が残っていたら落ちる**（台帳を動かして原稿を忘れた回）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const { rateStr } = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), cov);
    const stale = { headline: `運営全体では ${(Number(rateStr) - 0.6).toFixed(1)}%`, subhead: '13領域203タスク' };
    const r = checkNumbers(stale, cov);
    if (!r.problems.some((x) => x.includes('総合自動化率'))) throw new Error('古い率が素通りした');
  }],
  ['**率を差し替えて語だけ残すと落ちる**（AI実行率→AI関与率のすり替え）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const { rates, total, areas, rateStr } = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), cov);
    // 「AI実行率」と書いたまま、値だけ AI関与率（提案止まりを含む）へ差し替える。
    const r = checkNumbers({ headline: `AI実行率は${rates.AI関与率}%`,
      subhead: `総合自動化率は${areas}領域${total}タスクで${rateStr}%` }, cov);
    if (!r.problems.some((x) => x.includes('名前が付いていない'))) {
      throw new Error('実行率と関与率のすり替えが素通りした');
    }
  }],
  ['**裸の数字は落ちる**（名前の無い率）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const { rates, total, areas, rateStr } = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), cov);
    const r = checkNumbers({ headline: `運営業務の${rates.AI実行率}%が自律`,
      subhead: `総合自動化率は${areas}領域${total}タスクで${rateStr}%` }, cov);
    if (!r.problems.some((x) => x.includes('名前が付いていない'))) throw new Error('裸の数字が素通りした');
  }],
  ['**4つとも、名前を付ければ書ける**（併記は台帳の規約）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const { rates, total, areas } = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), cov);
    const r = checkNumbers({
      headline: `AI実行率 ${rates.AI実行率}% / AI関与率 ${rates.AI関与率}%`,
      subhead: `総合自動化率 ${rates.総合自動化率}% / カバー率 ${rates.カバー率}%（${areas}領域${total}タスク）`,
    }, cov);
    if (r.problems.length) throw new Error(`併記で落ちた: ${r.problems.join(' / ')}`);
  }],
  ['**盛った率は落ちる**（91.5% のような、台帳に無い数字）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const r = checkNumbers({ headline: '運営全体の自動化率 91.5%', subhead: '13領域203タスク' }, cov);
    if (!r.problems.some((x) => x.includes('91.5'))) throw new Error('盛った率が素通りした');
  }],
  ['**小数の無い率は素通しする**（「本番15件は100%AI」は別の指標）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const { rateStr, total, areas } = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), cov);
    const r = checkNumbers({ headline: `本番15件は100%AI・運営全体の総合自動化率は ${rateStr}%`,
      subhead: `${areas}領域${total}タスク` }, cov);
    if (r.problems.length) throw new Error(`100% で誤検出: ${r.problems.join(' / ')}`);
  }],
  ['**分母が古ければ落ちる**（率だけ直して分母を忘れた回）', () => {
    const cov = readJSON(ROOT, 'data/automation-coverage.json');
    const { rateStr, total, areas } = checkNumbers(readJSON(ROOT, 'data/pr-claims.json'), cov);
    const r = checkNumbers({ headline: `${rateStr}%`, subhead: `${areas}領域${total - 1}タスク` }, cov);
    if (!r.problems.some((x) => x.includes('タスク数'))) throw new Error('古い分母が素通りした');
  }],
  ['実データの参照がすべて解決する', () => {
    const r = evaluate(readJSON(ROOT, 'data/pr-claims.json'), readJSON(ROOT, 'data/automation-coverage.json'));
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
  const claimsDoc = readJSON(ROOT, 'data/pr-claims.json');
  const coverage = readJSON(ROOT, 'data/automation-coverage.json');
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

  const numbers = checkNumbers(claimsDoc, coverage);
  if (numbers.problems.length) {
    console.log('  **原稿の数字が台帳と違う:**');
    for (const p of numbers.problems) console.log(`    - ${p}`);
    console.log('');
  }

  if (argv.includes('--check')) {
    if (numbers.problems.length) {
      console.error(`主張の検証に失敗: 原稿の数字が台帳と違う（${numbers.problems.length} 件）`);
      process.exit(1);
    }
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
