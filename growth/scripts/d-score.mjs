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
 * 【唯一の例外】配信前採点が無いまま出て、D+14 も測れずに measurement_failed で
 * 閉じた配信（PR⑦）だけは `d_score_pre_absent`（理由・配信見出し・根拠）で記録できる。
 * 点は作らず、running/planned・他の判定・d_score_pre との併用には使えない
 * （preScoreAbsenceProblems() と自己テストが固定している）。
 *
 * 【このスクリプトが決めないこと】
 * 各軸の点数そのもの。採点は人（かセッション）が根拠つきで置く。ここが自動で
 * 点を出し始めると、点を取るための見出しを機械が書くようになり、G2 が防いで
 * いるはずの「煽り語で点を稼ぐ」に自分から突っ込む。**採点は人、算数とゲートは機械。**
 */

import { run as runScenarios } from '../../scripts/lib/selftest.mjs';
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

/**
 * 採点日が配信日より前か。**配信物を採点していない**ことの機械判定。
 *
 * どちらかが欠けていたら false（「読めなかった」を「違反」と混ぜない）。
 * 比較は ISO の日付文字列どうしなので辞書順でよい。
 */
export function scoredBefore(record = {}) {
  const scoredAt = record.d_score_pre?.scored_at;
  const startedAt = record.started_at;
  if (!scoredAt || !startedAt) return false;
  return scoredAt < startedAt;
}

/**
 * **配信前採点が無いまま出た配信を、measurement_failed で閉じるときだけの表現。**（2026-11-04）
 *
 * PR⑦（対話メモ・2026-09-24）は配信前に採点されなかった。D+14 の必須4指標もそろわず、
 * オーナーは 2026-11-04 に「延長し続けず measurement_failed で閉じる」と決めた。
 * score() は evaluated に7軸の数値・判定済みゲート・`d_score_pre.headline` を要求するので、
 * そのままでは閉じる手段が (a) 点やゲートを後から作る か (b) この検査を外す しかなかった。
 * **どちらもしない。**採点の欠落を「欠落」として、理由つきで台帳に残す。
 *
 * `d_score_pre_absent` を受け付けるのは、次の**全部**を満たすときだけ:
 *   - status が evaluated（running/planned には使えない —— 採点なしで撃たせない）
 *   - decision が measurement_failed（keep/iterate 等の効果判定を採点なしで残さない）
 *   - d_score_pre が無い（採点があるならそちらを使う。2つを混ぜない）
 *   - reason・delivered_headline・reference が空でない文字列。reference はリポジトリ内の
 *     相対パス（--check では実在も確かめる）。それ以外のキー（点・total・gates 等）を持たない
 *
 * 受け付けた記録は**点を持たない**（sum は null）。verdict は GO で始まらないので、
 * press-release-next の品質ゲート（problems 0 かつ verdict が GO）にも転用できない。
 * --backtest は annotations.json の label の「D-SCORE nn」しか読まないので、
 * この記録は較正に入らない（入れるために annotation へ点を書き足さないこと）。
 */
export const PRE_SCORE_ABSENT_KEYS = ['reason', 'delivered_headline', 'reference'];
export const UNSCORED_VERDICT = 'UNSCORED（配信前採点なし・measurement_failed で閉鎖。較正にも配信判定にも使わない）';

export function preScoreAbsenceProblems(record = {}, { fileExists } = {}) {
  const absent = record?.d_score_pre_absent;
  if (absent === undefined) return [];
  const problems = [];
  if (record.status !== 'evaluated') {
    problems.push(`d_score_pre_absent は status=evaluated でだけ使える（いまは ${JSON.stringify(record.status)}）— **これから出す配信を採点なしで通さない**`);
  }
  if (record.decision !== 'measurement_failed') {
    problems.push(`d_score_pre_absent は decision=measurement_failed でだけ使える（いまは ${JSON.stringify(record.decision)}）— 採点なしで効果判定を残さない`);
  }
  if (record.d_score_pre !== undefined && record.d_score_pre !== null) {
    problems.push('d_score_pre と d_score_pre_absent を同時に置けない — 採点があるなら d_score_pre だけを使う');
  }
  if (!absent || typeof absent !== 'object' || Array.isArray(absent)) {
    problems.push('d_score_pre_absent がオブジェクトでない（reason・delivered_headline・reference を書く）');
    return problems;
  }
  for (const key of PRE_SCORE_ABSENT_KEYS) {
    if (typeof absent[key] !== 'string' || !absent[key].trim()) {
      problems.push(`d_score_pre_absent.${key} が空 — 採点が無い理由・配信した見出し・根拠の所在は省けない`);
    }
  }
  const extra = Object.keys(absent).filter((k) => k !== '$comment' && !PRE_SCORE_ABSENT_KEYS.includes(k));
  if (extra.length) {
    problems.push(`d_score_pre_absent に知らないキー（${extra.join(', ')}）— 点・ゲート・合計をここへ置かない`);
  }
  const ref = absent.reference;
  if (typeof ref === 'string' && ref.trim()) {
    if (path.isAbsolute(ref) || ref.split(/[\\/]/).includes('..')) {
      problems.push(`d_score_pre_absent.reference「${ref}」はリポジトリ内の相対パスで書く`);
    } else if (fileExists && !fileExists(ref)) {
      problems.push(`d_score_pre_absent.reference「${ref}」が無い — 根拠の所在が読めない`);
    }
  }
  return problems;
}

export function score(record, options = {}) {
  const absenceProblems = preScoreAbsenceProblems(record, options);
  if (record?.d_score_pre_absent !== undefined && !absenceProblems.length) {
    // **点を作らない。**軸もゲートも「未判定」のまま返し、sum は null にする。
    const gates = GATES.map(([key, label]) => ({ key, label, value: null }));
    return {
      id: record.id, status: record.status, sum: null,
      axes: AXES.map(([key, max, label]) => ({ key, label, value: null, max })),
      gates, gateFailed: [], gateUnknown: gates, need: necessary({}), needFailed: [],
      verdict: UNSCORED_VERDICT, problems: [], unscored: true,
    };
  }
  const d = record.d_score_pre || {};
  const problems = [...absenceProblems];
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
  // **判定済みなのは true/1・false/0 だけ。**未知の値を「全通過」にしない。
  const gateUnknown = gates.filter((g) => ![true, 1, false, 0].includes(g.value));
  for (const g of gateUnknown) {
    if (![null, undefined].includes(g.value)) {
      problems.push(
        `${g.key} が未対応のゲート値（true/1・false/0・null/未記入のみ）— 未判定として配信しない`,
      );
    }
  }

  const need = necessary(d);
  const needFailed = need.filter((n) => n.ok === false);

  const shipping = SHIPPING.has(record.status);
  // **「これから出る」と「もう出た」を分ける。**
  //
  // ヘッダの一覧は最初から「4. 合格ライン未満のまま **running** になっている」と
  // 書いていたが、実装は SHIPPING（running / evaluated）に当てていた。**実装のほうがずれていた。**
  //
  // 2026-09-24、PR⑥ を配信物で採り直して 85 → 45 にしたら、その差が実害になった ——
  // `evaluated` の過去レコードが「45 < 60」で永久に赤を出し、**CI が二度と緑に戻らない。**
  // だが 45 は誤りではなく**測り終えた事実**（D+14 で boarded:false）であって、直しようが無い。
  // 履歴が模型より低いことは `--backtest` が読む仕事で、`--check` が止める仕事ではない。
  //
  // **止める力は落としていない。**必要条件も合格ラインも `running` には当たり続けるので、
  // 「85点だから撃てた」は再発しない。ゲート（ヘッダの3）は文書どおり両方に当てる。
  const aboutToShip = record.status === 'running';
  if (aboutToShip) {
    // **合計点が足りていても、ここが落ちていたら撃たない。**
    // 60点は足し算なので S3〜S7 で S2 の欠落を埋められてしまう（PR⑥がそうなった）。
    for (const n of needFailed) {
      problems.push(`${n.key} = ${n.value} < 必要条件 ${n.floor}（${n.label}）— 合計点では代替できない。乗車2本は両方を満たし、非乗車3本はどちらかが下回る`);
    }
    if (sum < PASS_MARK) problems.push(`status=${record.status} だがスコア ${sum} < 合格 ${PASS_MARK}`);
  }
  if (shipping) {
    if (gateUnknown.length) {
      problems.push(`status=${record.status} なのに未判定のゲートが ${gateUnknown.length} 件（${gateUnknown.map((g) => g.key).join(', ')}）`);
    }
    if (gateFailed.length) {
      problems.push(`status=${record.status} なのに不合格のゲートが ${gateFailed.length} 件（${gateFailed.map((g) => g.key).join(', ')}）— 1つでも落ちたら配信不可`);
    }
    // **採点日が配信日より前なら、配信物を採点していない。**
    // 2026-09-04 に報告だけの警告として入れ、「9/17 に PR⑥ を再採点したら problems へ移す」
    // と書いた。**2026-09-24 に移した** —— PR⑥ の再採点（85→45）が済み、
    // D+14（09-19）で boarded:false も確定したので、赤にしても開けなくなる弾は無い。
    //
    // これが PR⑥ が落ちた穴そのものである: 見出しは最後に決まり、決まったあとで
    // 採点し直されなかった。**85点は配信されなかった見出しの点だった。**
    // 散文（追記D-4・レコードの $comment）は「見出し確定稿でもう一度回す」と
    // 書いていたが、**散文は手を挙げない。**
    // **何を採点したかが書かれていない。**PR⑥ の穴は「いつ」だけでなく「何を」でもあった。
    // scored_at を直しても、採点対象が分からなければ次のセッションは検算できない。
    if (!record.d_score_pre?.headline) {
      problems.push(
        'd_score_pre.headline が無い — **何を採点したのかが台帳から読めない。**'
        + '配信される見出しそのものを書くこと（PR⑥ は採点した見出しと配信した見出しが別物だった）',
      );
    }
    if (scoredBefore(record)) {
      problems.push(
        `採点日 ${record.d_score_pre.scored_at} が配信日 ${record.started_at} より前 — `
        + `**配信見出しで採点し直していない。**配信物を採り直してから status を進めること（追記D-4）`,
      );
    }
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
  const excluded = [];
  let unparsed = 0;
  for (const a of annotations.annotations || []) {
    if (a.type !== 'pr') continue;
    const ds = /D-SCORE\s*(\d+)/.exec(a.label);
    const pv = /([\d,]+)PV/.exec(a.label);
    const syn = /転載(\d+)/.exec(a.label);
    const board = /(?:^|[^非])乗車/.test(a.label) ? true : /非乗車/.test(a.label) ? false : null;
    if (!ds || !pv) {
      unparsed++;
      excluded.push({
        date: a.date,
        label: a.label.split('—')[0].trim(),
        d_score: ds ? Number(ds[1]) : null,
        pv: pv ? Number(pv[1].replace(/,/g, '')) : null,
        syndication: syn ? Number(syn[1]) : null,
        // A word such as 「乗車はD+14に追記」 is not an observed outcome.
        boarded: null,
        missing: [!ds && 'D-SCORE', !pv && 'PV'].filter(Boolean),
      });
      continue;
    }
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
    rows, unparsed, excluded, total_releases: rows.length + excluded.length,
    boarded_min_score: boarded.length ? Math.min(...boarded.map((r) => r.d_score)) : null,
    not_boarded_max_score: notBoarded.length ? Math.max(...notBoarded.map((r) => r.d_score)) : null,
  };
}

// --- CLI ---------------------------------------------------------------

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// この採点が守っているのは「空欄のまま撃たない」と「手で足した total が
// 独り歩きしない」こと。**その2つが効かなくなったときに検出できること**を固定する。
const SCENARIOS = [
  ['欠測した配信を一覧に残し、比較母数や乗車実績を捏造しない', () => {
    const bt = backtest({ annotations: [
      { type: 'pr', date: '2026-06-01', label: 'PR② — 6,000PV・転載50・D-SCORE 80・乗車' },
      { type: 'pr', date: '2026-09-24', label: 'PR⑦ — PV・D-SCORE・乗車はD+14に追記' },
      { type: 'feature', date: '2026-09-24', label: '別の機能更新' },
    ] });
    if (bt.total_releases !== 2 || bt.rows.length !== 1 || bt.excluded.length !== 1
        || bt.unparsed !== 1 || bt.excluded[0].date !== '2026-09-24'
        || bt.excluded[0].d_score !== null || bt.excluded[0].pv !== null
        || bt.excluded[0].boarded !== null || bt.excluded[0].missing.length !== 2
        || bt.boarded_min_score !== 80 || bt.not_boarded_max_score !== null) {
      throw new Error('欠測した配信が消えた、または較正データに混ざった');
    }
  }],
  ['PVだけ判明しても未採点の配信を較正対象にしない', () => {
    const bt = backtest({ annotations: [
      { type: 'pr', date: '2026-09-24', label: 'PR⑦ — 1,234PV・転載42・配信前採点なし' },
    ] });
    if (bt.rows.length || bt.excluded[0]?.pv !== 1234
        || bt.excluded[0]?.syndication !== 42 || bt.excluded[0]?.d_score !== null
        || bt.boarded_min_score !== null || bt.not_boarded_max_score !== null) {
      throw new Error('未採点の実測を消した、または点数を補完した');
    }
  }],
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
  // ---- 採点日 < 配信日（PR⑥ が落ちた穴。2026-09-24 に報告だけから problems へ格上げ）----
  ['**配信日より前の採点は落とす**（配信物を採点していない）', () => {
    const pre = {};
    for (const [k, max] of AXES) pre[k] = max;
    pre.total = AXES.reduce((a, [, max]) => a + max, 0);
    pre.scored_at = '2026-08-25';
    pre.gates = Object.fromEntries(GATES.map(([k]) => [k, true]));
    const r = score({ status: 'running', started_at: '2026-09-03', d_score_pre: pre });
    // **満点・ゲート全通過でも落ちる。**これが PR⑥ の形（85点・ゲート全通過・未再採点）。
    if (!r.problems.some((p) => p.includes('配信見出しで採点し直していない'))) {
      throw new Error(`満点でも落ちるべき: ${r.problems.join(' / ') || '(problem 無し)'}`);
    }
  }],
  ['採点日が配信日以降なら通す', () => {
    const pre = {};
    for (const [k, max] of AXES) pre[k] = max;
    pre.total = AXES.reduce((a, [, max]) => a + max, 0);
    pre.scored_at = '2026-09-03';
    pre.headline = '採点対象の見出し';
    pre.gates = Object.fromEntries(GATES.map(([k]) => [k, true]));
    const r = score({ status: 'running', started_at: '2026-09-03', d_score_pre: pre });
    if (r.problems.length) throw new Error(r.problems.join(' / '));
  }],
  ['**配信日が無ければ落とさない**（「読めなかった」を「違反」と混ぜない）', () => {
    const pre = {};
    for (const [k, max] of AXES) pre[k] = max;
    pre.total = AXES.reduce((a, [, max]) => a + max, 0);
    pre.scored_at = '2026-08-25';
    pre.headline = '採点対象の見出し';
    pre.gates = Object.fromEntries(GATES.map(([k]) => [k, true]));
    if (score({ status: 'running', started_at: null, d_score_pre: pre }).problems.length) {
      throw new Error('started_at が null なら判定しない');
    }
    delete pre.scored_at;
    if (score({ status: 'running', started_at: '2026-09-03', d_score_pre: pre }).problems.length) {
      throw new Error('scored_at が無ければ判定しない');
    }
  }],
  // ---- running と evaluated の分岐（2026-09-24）。**止める力が落ちていないこと**を固定する ----
  ['**running なら合格ライン未満で落とす**（PR⑥ の再発を止める側）', () => {
    const pre = { S1_novelty: 25, S2_entity_reach: 3, S3_concrete_nouns: 0,
      S4_transformation: 5, S5_timing: 3, S6_news_verb: 4, S7_launch_design: 5, total: 45,
      scored_at: '2026-09-03', gates: Object.fromEntries(GATES.map(([k]) => [k, true])) };
    const r = score({ status: 'running', started_at: '2026-09-03', d_score_pre: pre });
    if (!r.problems.some((p) => p.includes('合格'))) throw new Error('合格ライン未満を落とすべき');
    if (!r.problems.some((p) => p.includes('必要条件'))) throw new Error('必要条件も落とすべき');
  }],
  ['**evaluated は合格ライン未満でも落とさない**（測り終えた事実は直せない）', () => {
    // PR⑥ の形そのもの。45点・S2=3・boarded:false。**これで赤になると CI が二度と緑に戻らない。**
    const pre = { S1_novelty: 25, S2_entity_reach: 3, S3_concrete_nouns: 0,
      S4_transformation: 5, S5_timing: 3, S6_news_verb: 4, S7_launch_design: 5, total: 45,
      scored_at: '2026-09-24', headline: '採点対象の見出し',
      gates: Object.fromEntries(GATES.map(([k]) => [k, true])) };
    const r = score({ status: 'evaluated', started_at: '2026-09-03', d_score_pre: pre });
    if (r.problems.length) throw new Error(r.problems.join(' / '));
  }],
  ['**ゲートの矛盾は evaluated にも当てる**（ヘッダの3。履歴のデータ欠損は直せる）', () => {
    const pre = { S1_novelty: 25, S2_entity_reach: 15, S3_concrete_nouns: 10,
      S4_transformation: 12, S5_timing: 5, S6_news_verb: 5, S7_launch_design: 5, total: 77,
      scored_at: '2026-09-24', gates: Object.fromEntries(GATES.map(([k]) => [k, null])) };
    const r = score({ status: 'evaluated', started_at: '2026-09-03', d_score_pre: pre });
    if (!r.problems.some((p) => p.includes('未判定のゲート'))) throw new Error('ゲート未判定は evaluated でも落とす');
  }],
  ['**採点対象の見出しが無ければ落とす**（PR⑥ の穴は「いつ」だけでなく「何を」でもあった）', () => {
    const pre = {};
    for (const [k, max] of AXES) pre[k] = max;
    pre.total = AXES.reduce((a, [, max]) => a + max, 0);
    pre.scored_at = '2026-09-03';
    pre.gates = Object.fromEntries(GATES.map(([k]) => [k, true]));
    const r = score({ status: 'running', started_at: '2026-09-03', d_score_pre: pre });
    if (!r.problems.some((p) => p.includes('何を採点したのか'))) {
      throw new Error(`見出しが無ければ落とすべき: ${r.problems.join(' / ') || '(problem 無し)'}`);
    }
  }],
  ['配信していないレコードには当てない（planned は見出しがまだ無い）', () => {
    const pre = {};
    for (const [k, max] of AXES) pre[k] = max;
    pre.total = AXES.reduce((a, [, max]) => a + max, 0);
    pre.scored_at = '2026-08-25';
    const r = score({ status: 'planned', started_at: '2026-09-03', d_score_pre: pre });
    if (r.problems.length) throw new Error(r.problems.join(' / '));
  }],
];

// ---- 配信前採点なし・measurement_failed で閉じる記録（2026-11-04・PR⑦）----
// **受け付けるのは1通りだけ**であることと、それが点・較正・配信許可へ漏れないことを固定する。
const ABSENT = () => ({
  reason: '配信前に採点されなかった（合成の固定値）',
  delivered_headline: '合成の配信見出し',
  reference: 'docs/synthetic.md',
});
const closedUnscored = (over = {}) => ({
  id: 'synthetic-closed-unscored', type: 'pr_release', status: 'evaluated',
  decision: 'measurement_failed', started_at: '2026-09-24', d_score_pre_absent: ABSENT(), ...over,
});
const fullPre = () => ({
  ...Object.fromEntries(AXES.map(([k, max]) => [k, max])),
  total: AXES.reduce((a, [, max]) => a + max, 0),
  scored_at: '2026-09-24', headline: '採点対象の見出し',
  gates: Object.fromEntries(GATES.map(([k]) => [k, true])),
});
const rejectsAbsence = (record, needle, options) => {
  const r = score(record, options);
  if (r.unscored) throw new Error('採点なしの例外として受け付けた');
  if (!r.problems.some((p) => p.includes(needle))) {
    throw new Error(`「${needle}」で落ちていない: ${r.problems.join(' / ') || '(problem 無し)'}`);
  }
};
SCENARIOS.push(
  ['**配信前採点なし・evaluated・measurement_failed・理由つきだけを受け付ける**（点を作らない）', () => {
    const r = score(closedUnscored());
    if (r.problems.length) throw new Error(r.problems.join(' / '));
    if (!r.unscored || r.sum !== null || r.axes.some((a) => a.value !== null)) throw new Error('点が入った');
    if (r.gateFailed.length || r.gateUnknown.length !== GATES.length) throw new Error('ゲートを判定済みにした');
    if (score(closedUnscored({ d_score_pre: null })).problems.length) throw new Error('d_score_pre: null を「採点あり」と読んだ');
  }],
  ['**採点なしの閉鎖は配信許可に転用できない**（verdict が GO で始まらない）', () => {
    const r = score(closedUnscored());
    // scripts/press-release-next.mjs の品質ゲートと同じ条件
    const clears = !r.problems.length && r.verdict.startsWith('GO');
    if (clears || r.verdict !== UNSCORED_VERDICT) throw new Error(`品質ゲートを通る: ${r.verdict}`);
  }],
  ['**例外が無ければ、measurement_failed でも採点なしの evaluated は従来どおり落ちる**', () => {
    const r = score(closedUnscored({ d_score_pre_absent: undefined }));
    if (r.unscored || !r.problems.some((p) => p.includes('空欄のまま撃たない'))) throw new Error('採点なしが黙って通った');
    if (!r.problems.some((p) => p.includes('何を採点したのか'))) throw new Error('見出しの欠落が落ちない');
  }],
  ...['running', 'planned', 'frozen', 'cancelled', undefined].map((status) => [
    `採点なしの例外は status=${status} に使えない（**これから出す配信を採点なしで通さない**）`, () => {
      rejectsAbsence(closedUnscored({ status }), 'status=evaluated でだけ');
    }]),
  ...['keep', 'revert', 'iterate', 'inconclusive', 'abandoned', null].map((decision) => [
    `採点なしの例外は decision=${decision} に使えない（採点なしで効果判定を残さない）`, () => {
      rejectsAbsence(closedUnscored({ decision }), 'decision=measurement_failed でだけ');
    }]),
  ['**d_score_pre と同時には置けない**（満点・ゲート全通過の採点でも混ぜない）', () => {
    rejectsAbsence(closedUnscored({ d_score_pre: fullPre() }), '同時に置けない');
    rejectsAbsence(closedUnscored({ d_score_pre: {} }), '同時に置けない');
  }],
  ...PRE_SCORE_ABSENT_KEYS.flatMap((key) => [
    ['空文字', (a) => { a[key] = ''; }], ['空白だけ', (a) => { a[key] = '   '; }],
    ['欠落', (a) => { delete a[key]; }], ['文字列でない', (a) => { a[key] = 42; }],
  ].map(([kind, mutate]) => [`採点なしの例外は ${key} が${kind}なら落ちる`, () => {
    const absent = ABSENT();
    mutate(absent);
    rejectsAbsence(closedUnscored({ d_score_pre_absent: absent }), `d_score_pre_absent.${key} が空`);
  }])),
  ...[['null', null], ['文字列', '理由'], ['配列', []]].map(([kind, value]) => [
    `採点なしの例外が${kind}なら落ちる`, () => {
      rejectsAbsence(closedUnscored({ d_score_pre_absent: value }), 'オブジェクトでない');
    }]),
  ...['total', 'S1_novelty', 'gates', 'headline'].map((key) => [
    `採点なしの例外に ${key} を持ち込めない（点・ゲートを裏口で置かない）`, () => {
      rejectsAbsence(closedUnscored({ d_score_pre_absent: { ...ABSENT(), [key]: key === 'gates' ? {} : 1 } }), '知らないキー');
    }]),
  ...['/etc/passwd', '../outside.md', 'docs/../../outside.md'].map((ref) => [
    `採点なしの例外の reference はリポジトリ内の相対パスだけ（${ref}）`, () => {
      rejectsAbsence(closedUnscored({ d_score_pre_absent: { ...ABSENT(), reference: ref } }), '相対パスで書く');
    }]),
  ['採点なしの例外の reference が実在しなければ --check で落ちる', () => {
    rejectsAbsence(closedUnscored(), 'が無い', { fileExists: () => false });
    if (score(closedUnscored(), { fileExists: (p) => p === 'docs/synthetic.md' }).problems.length) {
      throw new Error('実在する reference で落ちた');
    }
  }],
);

// 4つのゲートすべてで同じ型契約を確認する。採点・満点・必要条件は変更しない。
// 値の本文をエラーへ転記せず、判定不能な項目の key だけを知らせる。
const INVALID_GATE_VALUES = [
  ['string-true', 'true'], ['string-false', 'false'], ['empty-string', ''],
  ['number-two', 2], ['negative-number', -1], ['fractional-number', 0.5],
  ['NaN', NaN], ['Infinity', Infinity], ['negative-Infinity', -Infinity],
  ['array', []], ['object', {}], ['boxed-boolean', new Boolean(true)],
];
const GATE_VALUE_CONTROLS = [
  ['true', true, 'passed'], ['one', 1, 'passed'],
  ['false', false, 'failed'], ['zero', 0, 'failed'],
  ['null', null, 'unknown'], ['undefined', undefined, 'unknown'],
];
function gateAdmissionFixture(key, value) {
  return {
    id: 'synthetic-gate-admission', type: 'pr_release', status: 'running',
    started_at: '2026-10-01',
    d_score_pre: {
      ...Object.fromEntries(AXES.map(([name, max]) => [name, max])),
      total: AXES.reduce((sum, [, max]) => sum + max, 0),
      scored_at: '2026-10-01', headline: 'synthetic gate admission fixture',
      gates: { ...Object.fromEntries(GATES.map(([name]) => [name, true])), [key]: value },
    },
  };
}
for (const [key] of GATES) {
  for (const [kind, value] of INVALID_GATE_VALUES) {
    SCENARIOS.push([`gate ${key} rejects ${kind}`, () => {
      const r = score(gateAdmissionFixture(key, value));
      if (r.gateUnknown.length !== 1 || r.gateUnknown[0].key !== key || r.gateFailed.length) {
        throw new Error('未知値が未判定の1項目として残っていない');
      }
      if (!r.problems.some((p) => p.includes(key) && p.includes('未対応のゲート値'))) {
        throw new Error('未知値の具体的な問題が無い');
      }
      if (!r.verdict.startsWith('PENDING')) throw new Error('未知値が配信可能になった');
    }]);
  }
  for (const [kind, value, state] of GATE_VALUE_CONTROLS) {
    SCENARIOS.push([`gate ${key} preserves ${kind}`, () => {
      const r = score(gateAdmissionFixture(key, value));
      if (r.problems.some((p) => p.includes('未対応のゲート値'))) {
        throw new Error('原契約の値が不正扱いになった');
      }
      if (state === 'passed') {
        if (r.gateUnknown.length || r.gateFailed.length || r.problems.length
          || !r.verdict.startsWith('GO')) throw new Error('原通過値の意味が変わった');
      } else if (state === 'failed') {
        if (r.gateUnknown.length || r.gateFailed.length !== 1
          || r.gateFailed[0].key !== key || !r.verdict.startsWith('BLOCKED')
          || !r.problems.some((p) => p.includes('不合格のゲート'))) {
          throw new Error('原不合格値の意味が変わった');
        }
      } else if (r.gateUnknown.length !== 1 || r.gateUnknown[0].key !== key
        || r.gateFailed.length || !r.verdict.startsWith('PENDING')
        || !r.problems.some((p) => p.includes('未判定のゲート'))) {
        throw new Error('原未記入値の意味が変わった');
      }
    }]);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) {
    process.exit(runScenarios(SCENARIOS) === 0 ? 0 : 1);
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
    console.log(`D-SCORE backtest (配信一覧=${bt.total_releases}, 比較対象 n=${bt.rows.length}, 欠測等による除外=${bt.excluded.length})`);
    console.log('  score  PV        転載   Discover  件名');
    for (const r of bt.rows) {
      const b = r.boarded === true ? '乗車  ' : r.boarded === false ? '非乗車' : '不明  ';
      console.log(`  ${String(r.d_score).padStart(3)}    ${String(r.pv).padStart(7)}   ${String(r.syndication ?? '-').padStart(3)}   ${b}    ${r.label}`);
    }
    for (const r of bt.excluded) {
      console.log(`  未評価  ${String(r.pv ?? '未取得').padStart(7)}   ${String(r.syndication ?? '未取得').padStart(3)}   不明      ${r.date} ${r.label}（比較対象外: ${r.missing.join('・')}なし）`);
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
  const fileExists = (p) => fs.existsSync(path.join(ROOT, p));
  for (const r of records) {
    const s = score(r, { fileExists });
    console.log(`\n${s.id}  [${s.status}]  → ${s.verdict}`);
    if (s.unscored) {
      // 点は無い。**無いことと、その理由・配信した見出し・根拠の所在**だけを出す。
      console.log(`   配信前採点: なし — ${r.d_score_pre_absent.reason}`);
      console.log(`   配信した見出し: ${r.d_score_pre_absent.delivered_headline}`);
      console.log(`   根拠: ${r.d_score_pre_absent.reference}`);
      continue;
    }
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
    // 採点日 < 配信日 と headline の欠落は score() が problems に出す（2026-09-24）。
    if (r.d_score_pre?.headline) {
      console.log(`   採点対象: ${r.d_score_pre.headline}`);
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
