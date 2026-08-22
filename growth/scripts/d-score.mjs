#!/usr/bin/env node
/**
 * D-SCORE — プレスリリースを「撃つ/撃たない」を採点で決める。
 *
 *   node growth/scripts/d-score.mjs                 # pr_release 全件の採点表
 *   node growth/scripts/d-score.mjs --id <id>       # 1件だけ詳細
 *   node growth/scripts/d-score.mjs --backtest      # 過去5回の実績と突き合わせる
 *   node growth/scripts/d-score.mjs --check         # CI: 算数のズレ・ゲート矛盾で exit 1
 *
 * 【なぜスクリプトにするか】
 * D-SCORE と G1〜G4 は 2026-08-20 に台帳のレコード型としては入ったが、採点も
 * ゲート判定も人の頭の中にあった。それは growth/README.md が冒頭で戒めている
 * 「計画は散文の中に住んでいて、散文は手を挙げない」の一形態でしかない。
 * 60未満なら撃たない・ゲートが1つでも落ちたら撃たない、という規律は、
 * 誰かが覚えている限り守られるのではなく、**実行できる形にして初めて守られる。**
 *
 * 【このスクリプトが見つける誤り】
 *   1. 各軸の合計と `total` のズレ（手で足した値が独り歩きする）
 *   2. 満点超過（S2 に 25 を入れる等）
 *   3. 「配信する」状態（running/evaluated）なのにゲートが未判定・不合格
 *   4. 合格ライン未満のまま running になっている
 * どれも「配信してから気づく」と取り返しがつかない種類のもの。
 *
 * 【このスクリプトが決めないこと】
 * 各軸の点数そのもの。採点は人（かセッション）が根拠つきで置く。ここが自動で
 * 点を出し始めると、点を取るための見出しを機械が書くようになり、G2 が防いで
 * いるはずの「煽り語で点を稼ぐ」に自分から突っ込む。**採点は人、算数とゲートは機械。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = path.join(ROOT, 'growth/experiments/experiments.json');
const ANNOTATIONS = path.join(ROOT, 'growth/data/annotations.json');

/** 各軸の満点。合計100。出典: pr_release レコード型（n=5バックテストで較正）。 */
export const AXES = [
  ['S1_novelty', 30, '新規性'],
  ['S2_entity_reach', 20, 'エンティティ到達'],
  ['S3_concrete_nouns', 15, '具体名詞'],
  ['S4_transformation', 15, '変化'],
  ['S5_timing', 10, '時流'],
  ['S6_news_verb', 5, 'ニュース動詞'],
  ['S7_launch_design', 5, 'ローンチ設計'],
];
export const PASS_MARK = 60;
export const GATES = [
  ['G1_thumbnail_1200px', 'サムネイル1200px'],
  ['G2_no_ai_or_clickbait_words', '見出しにAI・煽り語を入れない'],
  ['G3_prtimes_distribution', 'PR TIMES配信'],
  ['G4_weekday_morning', '平日の朝'],
];

/** 配信済み/配信中とみなす status。ここではゲートが埋まっていなければならない。 */
const SHIPPING = new Set(['running', 'evaluated']);

export function score(record) {
  const d = record.d_score_pre || {};
  const problems = [];
  let sum = 0;
  const axes = [];
  for (const [key, max, label] of AXES) {
    const v = d[key];
    if (typeof v !== 'number') {
      problems.push(`${key} が数値でない（採点は人が根拠つきで置く。空欄のまま撃たない）`);
      axes.push({ key, label, value: null, max });
      continue;
    }
    if (v < 0 || v > max) problems.push(`${key} = ${v} が範囲外（0〜${max}）`);
    sum += v;
    axes.push({ key, label, value: v, max });
  }
  // 手で足した total が独り歩きするのを防ぐ。散文の中の数字は検算されない。
  if (typeof d.total === 'number' && d.total !== sum) {
    problems.push(`total = ${d.total} だが各軸の合計は ${sum}（手計算が古い）`);
  }
  const gates = GATES.map(([key, label]) => ({ key, label, value: d.gates?.[key] ?? null }));
  const gateFailed = gates.filter((g) => g.value === false || g.value === 0);
  const gateUnknown = gates.filter((g) => g.value === null || g.value === undefined);

  const shipping = SHIPPING.has(record.status);
  if (shipping) {
    if (gateUnknown.length) {
      problems.push(`status=${record.status} なのに未判定のゲートが ${gateUnknown.length} 件（${gateUnknown.map((g) => g.key).join(', ')}）`);
    }
    if (gateFailed.length) {
      problems.push(`status=${record.status} なのに不合格のゲートが ${gateFailed.length} 件（${gateFailed.map((g) => g.key).join(', ')}）— 1つでも落ちたら配信不可`);
    }
    if (sum < PASS_MARK) problems.push(`status=${record.status} だがスコア ${sum} < 合格 ${PASS_MARK}`);
  }

  const verdict = gateFailed.length ? 'BLOCKED（ゲート不合格）'
    : sum < PASS_MARK ? `NO-GO（${sum} < ${PASS_MARK}）`
    : gateUnknown.length ? `PENDING（${sum}点・ゲート${gateUnknown.length}件未判定）`
    : `GO（${sum}点・ゲート全通過）`;

  return { id: record.id, status: record.status, sum, axes, gates, gateFailed, gateUnknown, verdict, problems };
}

/**
 * 過去のPR実績（growth/data/annotations.json）から較正データを拾う。
 * ラベルは自由文だが「D-SCORE nn」「n,nnnPV」「転載nn」「乗車/非乗車」の
 * 4つは全5件で同じ書式で入っている。書式が変わって拾えなくなったら黙って
 * 減らさず、拾えなかった件数を出す（欠測を成功として数えないため）。
 */
export function backtest(annotations) {
  const rows = [];
  let unparsed = 0;
  for (const a of annotations.annotations || []) {
    if (a.type !== 'pr') continue;
    const ds = /D-SCORE\s*(\d+)/.exec(a.label);
    const pv = /([\d,]+)PV/.exec(a.label);
    const syn = /転載(\d+)/.exec(a.label);
    const board = /(?:^|[^非])乗車/.test(a.label) ? true : /非乗車/.test(a.label) ? false : null;
    if (!ds || !pv) { unparsed++; continue; }
    rows.push({
      date: a.date,
      d_score: Number(ds[1]),
      pv: Number(pv[1].replace(/,/g, '')),
      syndication: syn ? Number(syn[1]) : null,
      boarded: board,
      label: a.label.split('—')[0].trim(),
    });
  }
  rows.sort((a, b) => a.d_score - b.d_score);
  const boarded = rows.filter((r) => r.boarded === true);
  const notBoarded = rows.filter((r) => r.boarded === false);
  return {
    rows, unparsed,
    boarded_min_score: boarded.length ? Math.min(...boarded.map((r) => r.d_score)) : null,
    not_boarded_max_score: notBoarded.length ? Math.max(...notBoarded.map((r) => r.d_score)) : null,
  };
}

// --- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const has = (n) => argv.includes(`--${n}`);
  const val = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

  const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  let records = ledger.experiments.filter((e) => e.type === 'pr_release');
  const only = val('id');
  if (only) records = records.filter((e) => e.id === only);

  if (has('backtest')) {
    const bt = backtest(JSON.parse(fs.readFileSync(ANNOTATIONS, 'utf8')));
    console.log(`D-SCORE backtest (n=${bt.rows.length}${bt.unparsed ? `, ${bt.unparsed} 件は書式が違い拾えなかった` : ''})`);
    console.log('  score  PV        転載   Discover  件名');
    for (const r of bt.rows) {
      const b = r.boarded === true ? '乗車  ' : r.boarded === false ? '非乗車' : '不明  ';
      console.log(`  ${String(r.d_score).padStart(3)}    ${String(r.pv).padStart(7)}   ${String(r.syndication ?? '-').padStart(3)}   ${b}    ${r.label}`);
    }
    if (bt.boarded_min_score !== null && bt.not_boarded_max_score !== null) {
      console.log('');
      console.log(`  乗車した最低スコア: ${bt.boarded_min_score} / 非乗車の最高スコア: ${bt.not_boarded_max_score}`);
      console.log(`  合格ライン ${PASS_MARK} はこの間に置かれている（${bt.not_boarded_max_score} < ${PASS_MARK} <= ${bt.boarded_min_score}）。`);
      console.log('  n=5 の較正であり、外挿の根拠にはならない。');
    }
    process.exit(0);
  }

  if (!records.length) {
    console.log(only ? `pr_release レコード "${only}" は無い` : 'pr_release レコードが無い');
    process.exit(only ? 1 : 0);
  }

  let bad = 0;
  for (const r of records) {
    const s = score(r);
    console.log(`\n${s.id}  [${s.status}]  → ${s.verdict}`);
    for (const a of s.axes) {
      const v = a.value === null ? ' --' : String(a.value).padStart(3);
      console.log(`   ${a.key.padEnd(20)} ${v} / ${String(a.max).padEnd(3)} ${a.label}`);
    }
    console.log(`   ${'合計'.padEnd(18)} ${String(s.sum).padStart(3)} / 100   （合格 ${PASS_MARK}）`);
    for (const g of s.gates) {
      const mark = g.value === true || g.value === 1 ? '○' : g.value === false || g.value === 0 ? '×' : '?';
      console.log(`   ${mark} ${g.key.padEnd(30)} ${g.label}`);
    }
    if (s.problems.length) {
      bad++;
      console.log('   問題:');
      for (const p of s.problems) console.log(`     - ${p}`);
    }
  }
  console.log('');

  if (has('check')) {
    if (bad) {
      console.error(`\n${bad} 件の pr_release レコードに問題がある。配信前に直すこと。`);
      console.error('（採点そのものは人が置く。ここが落とすのは算数のズレとゲートの矛盾だけ）');
      process.exit(1);
    }
    console.log('pr_release レコードの算数とゲートに矛盾なし。');
  }
}
