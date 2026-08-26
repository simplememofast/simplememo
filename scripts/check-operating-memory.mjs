#!/usr/bin/env node
/**
 * 運転記憶（Operating Memory）を検査する。
 *
 *   node scripts/check-operating-memory.mjs            # 表示
 *   node scripts/check-operating-memory.mjs --check    # CI
 *   node scripts/check-operating-memory.mjs --selftest # 検査自身の自己테스트
 *
 * 【この検査が守る1点】
 * **「学んだ」と書いてあることと、何かが変わったことは違う。**
 * learning.changed に実在の成果物が並んでいないレコードは、
 * 感想であって学習ではない。ここを緩めると、この台帳は
 * 「反省文の置き場」になり、⑦方針改善を名乗る根拠を失う。
 *
 * 【lesson_key の重複を落とす理由】
 * 同じ lesson_key が2回出たということは、1回目の learning が
 * 成果物に効かなかったということ。**再帰的自己改善を名乗るなら、
 * そこで気づけないといけない。**件数が増えること自体は悪ではないが、
 * 「同じことを2回学んだ」を黙って通すと、学習しているように見えて
 * 実際には同じ轍を踏み続けられる。
 *
 * 【落とさないもの】
 * verdict が success / no_change / undecidable のレコードに
 * new_guardrail は求めない。**うまくいった施策に歯止めを足すのは、
 * 多くの場合ただの手続きになる。**求めるのは failure と
 * measurement_failed のときだけ。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/operating-memory.json');

export const VERDICTS = ['success', 'failure', 'no_change', 'undecidable', 'measurement_failed'];
/** ここに入る verdict は、学習と歯止めまで書けていないと通さない。 */
export const NEEDS_GUARDRAIL = ['failure', 'measurement_failed'];
const REQUIRED = ['id', 'area', 'signal', 'hypothesis', 'decision', 'execution',
  'verification', 'outcome', 'verdict', 'learning'];

/**
 * 隣のリポジトリが、この作業ツリーから見えるか。
 *
 * [2026-08-26] **CI はこのリポジトリしか checkout しない。**
 * それなのに既定の exists は `../simplememo-api/...` を素で見に行っていたので、
 * 隣を指す learning.changed を書いた瞬間に CI だけが落ちた
 * （PR #598 の初回 run。手元では隣が見えるので通っていた）。
 *
 * automation-rate.mjs と ingest-asc.mjs は既に同じ規律を持っている ——
 * **確かめられないものを、確かめたことにしない。**ここだけ持っていなかった。
 */
export function siblingVisible(p, root = ROOT) {
  if (!String(p).startsWith('../')) return true;
  return fs.existsSync(path.resolve(root, String(p).split('/').slice(0, 2).join('/')));
}

/** true = 在る / false = 無い / **null = 確かめていない**（隣が見えない）。 */
export function defaultExists(root = ROOT) {
  return (p) => (siblingVisible(p, root) ? fs.existsSync(path.resolve(root, p)) : null);
}

/** この実行から確かめられなかったパス。**0件のとき何も言わないため、呼ぶ側で使う。** */
export function unverifiablePaths(doc, root = ROOT) {
  const out = [];
  for (const r of doc?.records ?? []) {
    for (const f of r.learning?.changed ?? []) {
      if (!siblingVisible(f, root)) out.push(`${r.id}: ${f}`);
    }
  }
  return out;
}

export function validate(doc, { exists = defaultExists() } = {}) {
  const problems = [];
  const ids = new Set();
  const lessons = new Map();

  for (const r of doc.records || []) {
    const at = `record ${r.id || '(id無し)'}`;

    for (const f of REQUIRED) {
      if (r[f] === undefined || r[f] === null || r[f] === '') problems.push(`${at}: ${f} が無い`);
    }
    if (r.id) {
      if (ids.has(r.id)) problems.push(`${at}: id が重複`);
      ids.add(r.id);
    }

    if (r.verdict && !VERDICTS.includes(r.verdict)) {
      problems.push(`${at}: verdict "${r.verdict}" は5値のどれでもない`
        + ` — ${VERDICTS.join(' / ')}`);
    }

    // 実行が成果物を指しているか。**「決めた」だけの行を残さない。**
    const ex = r.execution || {};
    if (!ex.commit && !ex.pr) {
      problems.push(`${at}: execution に commit も pr も無い`
        + ' — **どの変更のことか外から辿れない行は、記録ではなく感想**');
    }

    // 学習が成果物を変えたか
    const l = r.learning || {};
    if (!l.text) problems.push(`${at}: learning.text が無い`);
    if (!l.lesson_key) {
      problems.push(`${at}: learning.lesson_key が無い（同じ失敗の2回目を検出できない）`);
    } else if (lessons.has(l.lesson_key)) {
      problems.push(`${at}: lesson_key "${l.lesson_key}" が ${lessons.get(l.lesson_key)} と重複`
        + ' — **同じことを2回学んでいる。**1回目の learning が成果物に効かなかったということなので、'
        + ' 歯止めのほうを見直すこと（2行に分けて放置しない）');
    } else {
      lessons.set(l.lesson_key, r.id);
    }

    const changed = Array.isArray(l.changed) ? l.changed : [];
    if (!changed.length) {
      problems.push(`${at}: learning.changed が空`
        + ' — **何も変わっていない学習は学習ではない**');
    }
    for (const f of changed) {
      // **null は「確かめていない」。**false（無い）とだけ区別して落とす。
      // 隣のリポジトリが見えない実行（CI）で「無い」と断じない。
      if (exists(f) === false) {
        problems.push(`${at}: learning.changed の "${f}" が実在しない`
          + '（隣のリポジトリを指すなら ../ 込みのパスで、この作業ツリーから見えること）');
      }
    }

    if (NEEDS_GUARDRAIL.includes(r.verdict) && !l.new_guardrail) {
      problems.push(`${at}: verdict が ${r.verdict} なのに new_guardrail が無い`
        + ' — **同じことが next で止まる仕組みを書くまで、この行は閉じない**');
    }
  }
  return problems;
}

/** 台帳から出せる数字。**率にしない** — 母数（全判断）を持っていないため。 */
export function summarize(doc) {
  const rs = doc.records || [];
  const byVerdict = {};
  for (const v of VERDICTS) byVerdict[v] = rs.filter((r) => r.verdict === v).length;
  const artifacts = new Set();
  for (const r of rs) for (const f of (r.learning?.changed || [])) artifacts.add(f);
  return {
    records: rs.length,
    seeded: rs.filter((r) => r.seeded).length,
    live: rs.filter((r) => !r.seeded).length,
    byVerdict,
    guardrails: rs.filter((r) => r.learning?.new_guardrail).length,
    artifacts: artifacts.size,
  };
}

function selftest() {
  let total = 0; const failures = [];
  const check = (name, cond) => {
    total += 1; if (!cond) failures.push(name);
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`);
  };
  const base = () => ({
    id: 'x', area: 'a', signal: 's', hypothesis: 'h', decision: 'd',
    execution: { commit: 'abc' }, verification: 'v', outcome: 'o',
    verdict: 'success',
    learning: { text: 't', lesson_key: 'k', changed: ['README.md'] },
  });
  const yes = () => true;

  check('正しい行は通る', validate({ records: [base()] }, { exists: yes }).length === 0);

  const noChanged = base(); noChanged.learning.changed = [];
  check('changed が空だと落ちる（感想を学習と呼ばせない）',
    validate({ records: [noChanged] }, { exists: yes }).some((p) => p.includes('changed が空')));

  const ghost = base();
  // [2026-08-26] **CI だけが落ちた。**隣のリポジトリは checkout されていないので、
  // `../simplememo-api/...` を素で見に行くと「実在しない」になる。
  const sibling = base(); sibling.learning.changed = ['../simplememo-api/src/x.ts'];
  check('**隣が見えない実行では落とさない**（確かめられないものを「無い」と言わない）',
    validate({ records: [sibling] }, { exists: () => null }).length === 0);
  check('隣が見えて実在しなければ落とす',
    validate({ records: [sibling] }, { exists: () => false }).some((p) => p.includes('実在しない')));

  check('changed のファイルが無いと落ちる',
    validate({ records: [ghost] }, { exists: () => false }).some((p) => p.includes('実在しない')));

  const a = base(); const b = base(); b.id = 'y';
  check('同じ lesson_key が2回出たら落ちる（**1回目が効いていない**）',
    validate({ records: [a, b] }, { exists: yes }).some((p) => p.includes('重複')));

  const fail = base(); fail.verdict = 'failure'; delete fail.learning.new_guardrail;
  check('failure に new_guardrail が無いと落ちる',
    validate({ records: [fail] }, { exists: yes }).some((p) => p.includes('new_guardrail')));

  const ok = base(); ok.verdict = 'no_change';
  check('no_change には new_guardrail を求めない',
    validate({ records: [ok] }, { exists: yes }).length === 0);

  const badv = base(); badv.verdict = 'inconclusive';
  check('4値語彙（inconclusive）は通さない',
    validate({ records: [badv] }, { exists: yes }).some((p) => p.includes('5値')));

  const noref = base(); noref.execution = {};
  check('commit も pr も無い行は落ちる',
    validate({ records: [noref] }, { exists: yes }).some((p) => p.includes('commit も pr も無い')));

  check('measurement_failed は undecidable と別の値',
    VERDICTS.includes('measurement_failed') && VERDICTS.includes('undecidable')
      && NEEDS_GUARDRAIL.includes('measurement_failed') && !NEEDS_GUARDRAIL.includes('undecidable'));

  if (failures.length) {
    console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`);
    return 1;
  }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const problems = validate(doc);
  // **確かめられなかったことを黙らない。**CI は隣のリポジトリを checkout しない。
  const unchecked = unverifiablePaths(doc);
  const s = summarize(doc);

  const LABEL = {
    success: '効いた', failure: '外した', no_change: '動かなかった',
    undecidable: '判断不能', measurement_failed: '計測失敗',
  };
  console.log(`運転記憶 — ${s.records} 件（後追い ${s.seeded} / 発生時記録 ${s.live}）\n`);
  for (const r of doc.records) {
    console.log(`  [${LABEL[r.verdict] || r.verdict}] ${r.id}  ${r.area}`);
    console.log(`         仮説: ${String(r.hypothesis).slice(0, 58)}…`);
    console.log(`         結果: ${String(r.outcome).replace(/\*/g, '').slice(0, 58)}…`);
    console.log(`         学習: ${String(r.learning.text).replace(/\*/g, '').slice(0, 58)}…`);
    console.log(`         → 変えた成果物 ${r.learning.changed.length} 件`
      + `${r.learning.new_guardrail ? ' / 歯止めあり' : ''}`);
  }
  console.log(`\n  判定の内訳: ${VERDICTS.map((v) => `${LABEL[v]} ${s.byVerdict[v]}`).join(' / ')}`);
  console.log(`  歯止めまで書けた行 ${s.guardrails} / ${s.records}`
    + ` ・ 学習が実際に変えた成果物 ${s.artifacts} 件`);
  console.log('\n  **率にしていない。**この台帳は全判断の母数を持っていないので、'
    + '\n  「判断の◯%を記録」は言えない（証跡を当てられた分だけが入っている）。');
  if (unchecked.length) {
    console.log(`\n  この実行から実在を確かめられなかった成果物 ${unchecked.length} 件（隣のリポジトリ）:`);
    for (const u of unchecked.slice(0, 6)) console.log(`    ${u}`);
    if (unchecked.length > 6) console.log(`    …ほか ${unchecked.length - 6} 件`);
    console.log('  **確かめられなかったことを「在る」と書かない。**CI はこのリポジトリしか checkout しない。');
  }

  if (problems.length) {
    console.error('\n運転記憶: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log('\n必須要素・判定語彙・学習の実体・同一教訓の重複に問題なし。');
  }
}
