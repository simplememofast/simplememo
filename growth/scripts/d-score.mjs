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

/**
 * **必要条件（AND）。合計点では買えない2軸の下限。**
 *
 * 合格ライン60は7軸の**足し算**なので、S3〜S7（計55点）でS2の欠落を埋められる。
 * 実際に埋まった —— PR⑥（2026-09-03）は S2 を19と採点して85点で撃ち、非乗車だった
 * （配信見出しに Obsidian もアプリ名も App Store も無い。docs/pr-discover-strategy-2026-09-04.md）。
 *
 * **同じことは追記D-2 が n=5 の時点で散文に書いていた** ——
 * 「4/24はS1満点でも落ちた＝**S2×S3**の『誰の興味グラフに刺さるか』が初出性と同格に効く」。
 * **散文は積（×）と書き、実装は和（+）だった。**ここはその積のほうを機械に持たせる。
 *
 * 下限は D-1 の尺度の言葉で置いてある:
 *   S1 20 = 「能力クラス・プラットフォーム・エンティティ結合の初出」（続報5・3話目0 は落ちる）
 *   S2 10 = 「ニッチ確立級（Obsidian）」（無形・汎用3 は落ちる）
 *
 * n=5（追記D-2の採点表）を 5/5 で分離する。自己テストが固定している。
 */
export const NECESSARY = [
  ['S1_novelty', 20, 'Googleにとっての初出性'],
  ['S2_entity_reach', 10, 'エンティティ関心圏の広さ'],
];

/** 必要条件の判定。値が未記入なら null（「満たさない」と混ぜない）。 */
export function necessary(d = {}) {
  return NECESSARY.map(([key, floor, label]) => {
    const v = d[key];
    return { key, floor, label, value: typeof v === 'number' ? v : null,
             ok: typeof v === 'number' ? v >= floor : null };
  });
}
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

  const need = necessary(d);
  const needFailed = need.filter((n) => n.ok === false);

  const shipping = SHIPPING.has(record.status);
  if (shipping) {
    // **合計点が足りていても、ここが落ちていたら撃たない。**
    // 60点は足し算なので S3〜S7 で S2 の欠落を埋められてしまう（PR⑥がそうなった）。
    for (const n of needFailed) {
      problems.push(`${n.key} = ${n.value} < 必要条件 ${n.floor}（${n.label}）— 合計点では代替できない。乗車2本は両方を満たし、非乗車3本はどちらかが下回る`);
    }
    if (gateUnknown.length) {
      problems.push(`status=${record.status} なのに未判定のゲートが ${gateUnknown.length} 件（${gateUnknown.map((g) => g.key).join(', ')}）`);
    }
    if (gateFailed.length) {
      problems.push(`status=${record.status} なのに不合格のゲートが ${gateFailed.length} 件（${gateFailed.map((g) => g.key).join(', ')}）— 1つでも落ちたら配信不可`);
    }
    if (sum < PASS_MARK) problems.push(`status=${record.status} だがスコア ${sum} < 合格 ${PASS_MARK}`);
  }

  const verdict = gateFailed.length ? 'BLOCKED（ゲート不合格）'
    : needFailed.length ? `NO-GO（必要条件 ${needFailed.map((n) => n.key).join(', ')} が下限未満・${sum}点でも撃たない）`
    : sum < PASS_MARK ? `NO-GO（${sum} < ${PASS_MARK}）`
    : gateUnknown.length ? `PENDING（${sum}点・ゲート${gateUnknown.length}件未判定）`
    : `GO（${sum}点・ゲート全通過）`;

  return { id: record.id, status: record.status, sum, axes, gates, gateFailed, gateUnknown, need, needFailed, verdict, problems };
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

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// この採点が守っているのは「空欄のまま撃たない」と「手で足した total が
// 独り歩きしない」こと。**その2つが効かなくなったときに検出できること**を固定する。
const SCENARIOS = [
  ['**空欄のまま撃たない**（軸が数値でなければ problem）', () => {
    const r = score({ d_score_pre: {} });
    if (!r.problems.length) throw new Error('空欄が通った');
    if (!r.problems.some((p) => p.includes('空欄のまま撃たない'))) {
      throw new Error(`理由が違う: ${r.problems[0]}`);
    }
  }],
  ['範囲外の点は落ちる', () => {
    const [k, max] = AXES[0];
    const r = score({ d_score_pre: { [k]: max + 1 } });
    if (!r.problems.some((p) => p.includes('範囲外'))) throw new Error('範囲外が通った');
  }],
  ['負の点も落ちる', () => {
    const [k] = AXES[0];
    const r = score({ d_score_pre: { [k]: -1 } });
    if (!r.problems.some((p) => p.includes('範囲外'))) throw new Error('負が通った');
  }],
  ['**手で足した total が合計と違えば落ちる**（散文の中の数字は検算されない）', () => {
    const pre = {};
    for (const [k] of AXES) pre[k] = 1;
    pre.total = 999;
    const r = score({ d_score_pre: pre });
    if (!r.problems.some((p) => p.includes('手計算が古い'))) throw new Error('total のずれが通った');
  }],
  // ── 必要条件（AND）──────────────────────────────
  // **合計点が合格でも、S1/S2 が下限未満なら撃たない**ことを固定する。
  // PR⑥（85点・非乗車）が通ってしまった穴がここ。
  ['**合計点では S2 の欠落を買えない**（85点でも必要条件で止まる）', () => {
    const r = score({
      status: 'running',
      d_score_pre: {
        S1_novelty: 25, S2_entity_reach: 4, S3_concrete_nouns: 15, S4_transformation: 14,
        S5_timing: 3, S6_news_verb: 4, S7_launch_design: 5,
        gates: { G1_thumbnail_1200px: true, G2_no_ai_or_clickbait_words: true,
                 G3_prtimes_distribution: true, G4_weekday_morning: true },
      },
    });
    if (r.sum < PASS_MARK) throw new Error(`前提が崩れた: ${r.sum} は合格線を超えているはず`);
    if (!r.problems.some((p) => p.includes('S2_entity_reach') && p.includes('必要条件'))) {
      throw new Error(`必要条件が効いていない: ${r.problems.join(' / ') || '(problem 無し)'}`);
    }
  }],
  ['未記入の軸を「必要条件を満たさない」と混ぜない', () => {
    const n = necessary({});
    if (n.some((x) => x.ok === false)) throw new Error('空欄が「不合格」に倒れている');
    if (!n.every((x) => x.ok === null)) throw new Error('空欄は null であるべき');
  }],
  ['**n=5 を 5/5 で分離する**（追記D-2 の採点表・乗車2/非乗車3）', () => {
    // 出典: docs/GROWTH_ROI_PLAN_2026-08-20.md 追記D-2。S1/S2 のみ引く。
    const CALIBRATION = [
      ['6/1 Obsidian連携 提供開始', 30, 10, true],
      ['7/6 Watch初対応', 20, 15, true],
      ['4/24 初回リリース', 30, 3, false],
      ['8/18 AirPods/Siri', 0, 15, false],
      ['8/3 AIタグ', 5, 3, false],
    ];
    for (const [name, s1, s2, boarded] of CALIBRATION) {
      const passes = necessary({ S1_novelty: s1, S2_entity_reach: s2 }).every((n) => n.ok === true);
      if (passes !== boarded) {
        throw new Error(`${name}: 必要条件=${passes} だが実績は${boarded ? '乗車' : '非乗車'}`);
      }
    }
  }],
  ['全軸が埋まって total が合っていれば problem 無し', () => {
    // status を付けない＝配信しないレコード。必要条件もゲートも問われない
    // （必要条件が問われるのは running / evaluated のときだけ）。
    const pre = {};
    let sum = 0;
    for (const [k] of AXES) { pre[k] = 1; sum += 1; }
    pre.total = sum;
    const r = score({ d_score_pre: pre });
    if (r.problems.length) throw new Error(r.problems.join(' / '));
  }],
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) {
    let failed = 0;
    for (const [name, fn] of SCENARIOS) {
      try { fn(); console.log(`  ok   ${name}`); }
      catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
    }
    console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
    process.exit(failed === 0 ? 0 : 1);
  }
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
      // **合計点が分離しなくなったら、そう言う。**
      // [2026-09-04] ここは分離を前提に `${max} < ${PASS_MARK} <= ${min}` を無条件で
      // 出していた。PR⑥（85点・非乗車）が台帳へ入った瞬間、**「85 < 60」という
      // 偽の不等式を印字した。**検査が壊れたのではなく、較正が破れたのに
      // 出力が破れていないふりをしていた。**破れたことは、出力に出さなければ誰も気づけない。**
      if (bt.not_boarded_max_score < PASS_MARK && PASS_MARK <= bt.boarded_min_score) {
        console.log(`  合格ライン ${PASS_MARK} はこの間に置かれている（${bt.not_boarded_max_score} < ${PASS_MARK} <= ${bt.boarded_min_score}）。`);
      } else {
        console.log(`  ⚠ **合計点の合格ライン ${PASS_MARK} は、もう分離していない。**`);
        console.log(`     非乗車に ${PASS_MARK} 以上が出ている（最高 ${bt.not_boarded_max_score}）ので、`);
        console.log('     「60点以上なら撃つ」は単独では成り立たない。');
        console.log('     分離しているのは必要条件のほう —— S1_novelty >= 20 かつ S2_entity_reach >= 10');
        console.log('     （docs/pr-discover-strategy-2026-09-04.md §4）。');
      }
      console.log(`  n=${bt.rows.length} の較正であり、外挿の根拠にはならない。`);
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
    for (const n of s.need) {
      const mark = n.ok === true ? '○' : n.ok === false ? '×' : '?';
      console.log(`   ${mark} 必要条件 ${n.key} >= ${String(n.floor).padEnd(3)} ${n.label}`);
    }
    for (const g of s.gates) {
      const mark = g.value === true || g.value === 1 ? '○' : g.value === false || g.value === 0 ? '×' : '?';
      console.log(`   ${mark} ${g.key.padEnd(30)} ${g.label}`);
    }
    // **採点が配信物に当たっているか。**PR⑥ は 08-25 の採点のまま 09-03 に
    // 別の見出しで配信され、台帳の85点はどこにも存在しない見出しの点になった。
    // 追記D-4 と レコードの $comment は「見出し確定稿でもう一度回す」と書いていたが、
    // 散文なので誰も落とせなかった。**ここは報告だけする**（落とすと、いま
    // 未再採点のまま running の PR⑥ で CI が赤になり、9/17 の評価まで開けられない）。
    // 9/17 に PR⑥ を配信見出しで再採点したら、これを problems へ移すこと。
    const scoredAt = r.d_score_pre?.scored_at;
    if (SHIPPING.has(r.status) && scoredAt && r.started_at && scoredAt < r.started_at) {
      console.log(`   ⚠ 採点日 ${scoredAt} が配信日 ${r.started_at} より前。**配信見出しで再採点していない可能性がある**（追記D-4）`);
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
