#!/usr/bin/env node
/**
 * **クリックの伸びを「インストールに近い面」と「遠い面」に割って読む。**
 *
 *   node growth/scripts/acquisition-mix.mjs            # 最新と比較可能な過去窓
 *   node growth/scripts/acquisition-mix.mjs --json
 *   node growth/scripts/acquisition-mix.mjs --selftest
 *
 * 【なぜ要るか】
 * 「SEOが伸びている」は、そのままでは事業の判断に使えない。表示回数が広がると
 * クリックの総数は増えるが、**増えたぶんがどの面かで意味が正反対になる。**
 * 総クリックだけを見ていると、情報記事だけが伸びている状態と、獲得面が伸びている
 * 状態が同じ数字に見える。この道具は BUSINESS_RELEVANCE で面を3つに割り、
 * **1日あたり**のクリックと表示を並べる。
 *
 * 【同じ収集条件・日数の非重複窓だけを比較する】
 * 1日あたりの値は単期の説明として残すが、日次化だけでは収集方法の違い、欠測、
 * 重複日や窓の長さの違いを解消できない。既存 comparison.mjs の条件を満たさない
 * 比較は伸び率・順位を保留し、理由を示す。条件が揃っても季節性や途中変更は残るため、
 * ここが出すのは**構成の変化**であって、原因ではない。
 *
 * 【この道具のいちばんの仕事は、結論をひっくり返してみせること】
 * 面の分類は BUSINESS_RELEVANCE の手入力で、**規則に当たらないページは既定 0.5 に
 * 落ちる。**2026-08-24 窓ではそれが 100ページ・クリックの30.9%・表示の47.5%あった。
 * つまり「どの面が伸びているか」の答えは、**測っていない既定値が3割を握っている。**
 *
 * だから `sensitivity` は飾りではない。既定へ落ちたぶんを low 側に寄せた場合と
 * high 側に寄せた場合で順位が入れ替わるなら、**その順位は根拠にしてはいけない。**
 * 実際、2026-08-28 に手作業の分析（高意図+18% / 上流+104%）と本ツール
 * （高意図+54.5% / 上流+16.6%）は**逆の順位を出した。**同じ3か月を見ていて、
 * 違うのは分類だけである。**辻褄の合う物語のほうを採らない。**
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSnapshots, loadSnapshot, toPath, businessRelevance, BUSINESS_RELEVANCE,
} from '../lib/gsc.mjs';
import { assessComparison, selectComparison } from '../lib/comparison.mjs';

/** 面の呼び名。閾値は check-content-graph.mjs の RELEVANCE_BUCKET と揃えてある。 */
export const BUCKETS = [
  { key: 'high', label: '獲得面（製品・直接課題）', min: 0.9 },
  { key: 'mid', label: '比較・カテゴリ', min: 0.6 },
  { key: 'low', label: '上流・情報', min: 0 },
];

export const bucketOf = (rel) => BUCKETS.find((b) => rel >= b.min).key;

/** 規則に当たらず既定へ落ちたか。**沈黙の既定値を数えるために要る。** */
export const fellToDefault = (p) => !BUSINESS_RELEVANCE.some(([re]) => re.test(p));

/** 窓の日数。period が無ければ null（**「1日あたり」を勝手に作らない**）。 */
export function windowDays(meta) {
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return NaN;
    const ms = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
  };
  const d = (parse(meta?.period_end) - parse(meta?.period_start)) / 86400000 + 1;
  return Number.isFinite(d) && d > 0 ? d : null;
}

/**
 * 1スナップショットを面ごとに畳む。`reassign` は既定へ落ちたページの行き先を
 * 差し替える（感度検査用）。null なら BUSINESS_RELEVANCE のまま。
 */
export function fold(snapshot, { reassign = null } = {}) {
  const days = windowDays(snapshot.meta);
  const acc = Object.fromEntries(BUCKETS.map((b) => [b.key, { clicks: 0, impressions: 0, pages: 0 }]));
  let defaulted = { clicks: 0, impressions: 0, pages: 0 };
  for (const r of snapshot.pages || []) {
    const p = toPath(r.page);
    const isDefault = fellToDefault(p);
    const key = isDefault && reassign ? reassign : bucketOf(businessRelevance(p));
    acc[key].clicks += r.clicks;
    acc[key].impressions += r.impressions;
    acc[key].pages += 1;
    if (isDefault) {
      defaulted.clicks += r.clicks;
      defaulted.impressions += r.impressions;
      defaulted.pages += 1;
    }
  }
  const total = Object.values(acc).reduce(
    (s, v) => ({ clicks: s.clicks + v.clicks, impressions: s.impressions + v.impressions }),
    { clicks: 0, impressions: 0 },
  );
  return { label: snapshot.label, days, buckets: acc, total, defaulted };
}

const perDay = (v, days) => (days ? v / days : null);
// 基準が 0 のとき伸び率は作れない（0→5 は「+∞%」ではなく「比べられない」）。
// null は ordering() が拾い、validate() が「順位を作らない」と言う。**黙って0にしない。**
const growth = (a, b) => (a > 0 && b != null ? b / a - 1 : null);

/** 面ごとの日次クリック伸び率。分類を差し替えても呼べるように分けてある。 */
function rates(prev, curr, opts, comparable = assessComparison(curr, prev).comparable) {
  const A = fold(prev, opts); const B = fold(curr, opts);
  const out = {};
  for (const b of BUCKETS) {
    const a = perDay(A.buckets[b.key].clicks, A.days);
    const c = perDay(B.buckets[b.key].clicks, B.days);
    out[b.key] = { before: a, after: c, growth: comparable ? growth(a, c) : null };
  }
  return { A, B, out };
}

/** 伸び率の順位（速い順）。比較できない面があれば null。 */
export function ordering(rateMap) {
  const es = Object.entries(rateMap);
  if (es.some(([, v]) => v.growth == null)) return null;
  return es.sort((x, y) => y[1].growth - x[1].growth).map(([k]) => k).join('>');
}

/**
 * 2つのスナップショットを面で割って比べる。
 *
 * **`sensitivity` が `robust: false` を返したら、順位を結論に使ってはいけない。**
 */
export function decompose(prev, curr) {
  const comparison = assessComparison(curr, prev);
  const base = rates(prev, curr, {}, comparison.comparable);
  const asLow = rates(prev, curr, { reassign: 'low' }, comparison.comparable);
  const asHigh = rates(prev, curr, { reassign: 'high' }, comparison.comparable);

  const o = ordering(base.out);
  const oLow = ordering(asLow.out);
  const oHigh = ordering(asHigh.out);
  const robust = o != null && o === oLow && o === oHigh;

  const share = (f, k) => (f.total.clicks ? f.buckets[k].clicks / f.total.clicks : null);

  return {
    comparison,
    before: { label: prev.label, source: prev.meta?.source ?? 'unknown', days: base.A.days, window: [prev.meta?.period_start, prev.meta?.period_end] },
    after: { label: curr.label, source: curr.meta?.source ?? 'unknown', days: base.B.days, window: [curr.meta?.period_start, curr.meta?.period_end] },
    buckets: Object.fromEntries(BUCKETS.map((b) => [b.key, {
      label: b.label,
      clicks_per_day: base.out[b.key],
      impressions_per_day: {
        before: perDay(base.A.buckets[b.key].impressions, base.A.days),
        after: perDay(base.B.buckets[b.key].impressions, base.B.days),
      },
      click_share: { before: share(base.A, b.key), after: share(base.B, b.key) },
    }])),
    total: {
      clicks_per_day: {
        before: perDay(base.A.total.clicks, base.A.days),
        after: perDay(base.B.total.clicks, base.B.days),
        growth: comparison.comparable ? growth(perDay(base.A.total.clicks, base.A.days), perDay(base.B.total.clicks, base.B.days)) : null,
      },
    },
    // 既定へ落ちた量。**これが大きいほど、上の順位は分類ではなく既定値の産物。**
    defaulted: {
      before: base.A.defaulted, after: base.B.defaulted,
      click_share_after: base.B.total.clicks ? base.B.defaulted.clicks / base.B.total.clicks : null,
      impression_share_after: base.B.total.impressions ? base.B.defaulted.impressions / base.B.total.impressions : null,
    },
    sensitivity: { ordering: o, if_default_is_low: oLow, if_default_is_high: oHigh, robust },
  };
}

/** 結論に使えない状態を黙って通さない。 */
export function validate(r) {
  const problems = [];
  if (r.comparison?.comparable === false) {
    problems.push(`比較保留: ${r.comparison.reason} — 単期の値だけを読み、伸び率・順位を結論にしない`);
    return problems;
  }
  if (r.before.days == null || r.after.days == null) {
    problems.push('窓の日数が取れない — 1日あたりに直せないので比較そのものが成立しない');
  }
  if (!r.sensitivity.robust) {
    problems.push(
      `**順位が分類に依存する** — 既定のまま ${r.sensitivity.ordering} / 既定をlowへ寄せると `
      + `${r.sensitivity.if_default_is_low} / highへ寄せると ${r.sensitivity.if_default_is_high}。`
      + 'どの面が伸びているかを、この窓の数字だけで結論にしない',
    );
  }
  return problems;
}

const pct = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`);
const num = (v, d = 2) => (v == null ? '—' : v.toFixed(d));

/** 全角を2桁で数える。**CJKを1桁で数えると表が崩れる。** */
const width = (s) => [...s].reduce((n, ch) => n + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1), 0);
const padTo = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

export function render(r) {
  const L = [];
  L.push('獲得面ミックス — クリックの伸びを面ごとに割る');
  L.push(`  ${r.before.label} (${r.before.window.join('..')}, ${r.before.days}d)`
    + `  →  ${r.after.label} (${r.after.window.join('..')}, ${r.after.days}d)`);
  L.push(r.comparison.comparable
    ? '  同じ収集条件・日数の非重複窓を比較。数値は1日あたりで表示。'
    : `  比較保留: ${r.comparison.reason}。単期の値を表示し、伸び率・順位は保留。`);
  L.push('');
  const W = 26;
  L.push(`  ${padTo('面', W)}   クリック/日        伸び     クリック構成比        表示/日`);
  for (const b of BUCKETS) {
    const e = r.buckets[b.key];
    L.push(`  ${padTo(b.label, W)}`
      + `${num(e.clicks_per_day.before).padStart(6)} → ${num(e.clicks_per_day.after).padStart(6)}`
      + `  ${pct(e.clicks_per_day.growth).padStart(8)}`
      + `   ${pct(e.click_share.before).replace('+', '').padStart(6)} → ${pct(e.click_share.after).replace('+', '').padStart(6)}`
      + `   ${num(e.impressions_per_day.before, 0).padStart(6)} → ${num(e.impressions_per_day.after, 0).padStart(6)}`);
  }
  L.push(`  ${padTo('合計', W)}${num(r.total.clicks_per_day.before).padStart(6)} → `
    + `${num(r.total.clicks_per_day.after).padStart(6)}  ${pct(r.total.clicks_per_day.growth).padStart(8)}`);
  L.push('');
  const d = r.defaulted;
  L.push(`  規則に当たらず既定0.5へ落ちたページ: ${d.after.pages}件 / `
    + `クリック ${pct(d.click_share_after).replace('+', '')} / 表示 ${pct(d.impression_share_after).replace('+', '')}`);
  if (r.comparison.comparable) {
    L.push(`  分類を差し替えたときの順位: 既定のまま ${r.sensitivity.ordering}`
      + ` / low寄せ ${r.sensitivity.if_default_is_low} / high寄せ ${r.sensitivity.if_default_is_high}`);
    L.push(r.sensitivity.robust
      ? '  → 順位は分類の差し替えに耐えた。'
      : '  → **順位は分類次第で入れ替わる。結論に使わないこと。**');
  }
  return L.join('\n');
}

// ── 自己テスト（**落ちることを確かめる**） ────────────────────────
function selftest() {
  const failures = []; let total = 0;
  const t = (name, ok) => { total += 1; if (!ok) failures.push(name); console.log(`${ok ? '  ok ' : '  NG '} ${name}`); };

  const snap = (label, start, end, pages, meta = {}) => ({
    label, meta: { period_start: start, period_end: end, source: 'bigquery',
      complete_window: true, search_type: 'WEB', totals: { source: 'dates' }, ...meta }, pages,
  });
  const P = (page, clicks, impressions) => ({ page, clicks, impressions, position: 5, ctr: impressions ? clicks / impressions : 0 });

  t('窓の日数を端まで数える（両端を含む）',
    windowDays({ period_start: '2026-08-01', period_end: '2026-08-13' }) === 13);
  t('**period が無ければ null**（勝手に1日あたりを作らない）',
    windowDays({}) === null);
  t('**存在しない暦日は null**（JavaScriptの日付繰り上げを認めない）',
    windowDays({ period_start: '2026-02-01', period_end: '2026-02-30' }) === null);

  t('閾値は check-content-graph と同じ', bucketOf(1.0) === 'high' && bucketOf(0.7) === 'mid' && bucketOf(0.3) === 'low');
  t('**0.5 の既定は mid ではなく low 側**（0.6未満）', bucketOf(0.5) === 'low');

  t('規則に当たるページは既定扱いしない', fellToDefault('/obsidian/') === false);
  // **検体に実在スラッグを使わない。**規則を1つ足すと落ちる検査になる
  // （2026-08-28、/blog/free-memo-apps-ranking に規則を置いた時点で実際に落ちた）。
  t('**規則に当たらないページは既定として数える**', fellToDefault('/blog/no-such-rule-here') === true);

  // 同じ収集条件・日数の非重複窓なら日次の伸び率を計算する。
  const a = snap('A', '2026-07-01', '2026-07-28', [P('/obsidian/', 28, 280)]);
  const b = snap('B', '2026-08-01', '2026-08-28', [P('/obsidian/', 28, 280)]);
  const flat = decompose(a, b);
  t('比較可能な非重複窓で日次が同じなら伸び0',
    flat.comparison.comparable && flat.buckets.high.clicks_per_day.growth === 0);

  const up = decompose(a, snap('B', '2026-08-01', '2026-08-28', [P('/obsidian/', 56, 280)]));
  t('日次が倍なら +100%', Math.abs(up.buckets.high.clicks_per_day.growth - 1) < 1e-9);
  t('合計でも日次が倍なら +100%', up.total.clicks_per_day.growth === 1);

  const short = decompose(a, snap('B', '2026-08-01', '2026-08-13', [P('/obsidian/', 13, 130)]));
  t('異なる窓長は日次が同じでも比較保留、単期値は保持',
    short.comparison.reason === 'different_window_lengths'
      && short.total.clicks_per_day.growth === null
      && short.total.clicks_per_day.before === 1 && short.total.clicks_per_day.after === 1);

  const rejected = [
    ['重複窓', snap('B', '2026-07-08', '2026-08-04', b.pages), 'overlapping_or_reversed_windows'],
    ['逆順窓', snap('B', '2026-06-01', '2026-06-28', b.pages), 'overlapping_or_reversed_windows'],
    ['異なる収集source', snap('B', '2026-08-01', '2026-08-28', b.pages, { source: 'csv-export' }), 'different_or_unknown_source'],
    ['未知の収集source', snap('B', '2026-08-01', '2026-08-28', b.pages, { source: undefined }), 'different_or_unknown_source'],
    ['不完全窓', snap('B', '2026-08-01', '2026-08-28', b.pages, { complete_window: false }), 'incomplete_window'],
    ['BQ欠測窓', snap('B', '2026-08-01', '2026-08-28', b.pages,
      { bigquery: { window_days_available: 27, window_days_requested: 28 } }), 'incomplete_window'],
    ['異なる検索type', snap('B', '2026-08-01', '2026-08-28', b.pages, { search_type: 'IMAGE' }), 'different_or_unknown_aggregation'],
    ['異なる集計単位', snap('B', '2026-08-01', '2026-08-28', b.pages, { totals: { source: 'pages' } }), 'different_or_unknown_aggregation'],
    ['未知の集計単位', snap('B', '2026-08-01', '2026-08-28', b.pages, { totals: {} }), 'different_or_unknown_aggregation'],
    ['存在しない日付', snap('B', '2026-08-01', '2026-08-32', b.pages), 'missing_or_invalid_period'],
    ['逆順の日付', snap('B', '2026-08-28', '2026-08-01', b.pages), 'missing_or_invalid_period'],
  ];
  for (const [name, candidate, reason] of rejected) {
    const r = decompose(a, candidate);
    t(`${name}は理由付き保留、全群の伸び率・順位を作らない`,
      r.comparison.comparable === false && r.comparison.reason === reason
        && r.total.clicks_per_day.growth === null
        && BUCKETS.every(bucket => r.buckets[bucket.key].clicks_per_day.growth === null)
        && r.sensitivity.ordering === null && r.sensitivity.if_default_is_low === null
        && r.sensitivity.if_default_is_high === null && !r.sensitivity.robust
        && validate(r).some(p => p.includes(reason)) && render(r).includes(reason));
  }
  const mixed = decompose(a, rejected[2][1]);
  t('比較保留でも単期のクリック・表示・構成比・sourceを保持',
    mixed.total.clicks_per_day.before === 1 && mixed.total.clicks_per_day.after === 1
      && mixed.buckets.high.impressions_per_day.after === 10
      && mixed.buckets.high.click_share.before === 1 && mixed.buckets.high.click_share.after === 1
      && mixed.before.source === 'bigquery' && mixed.after.source === 'csv-export');
  const overlapping = snap('near', '2026-08-08', '2026-09-04', b.pages);
  const latest = snap('latest', '2026-08-15', '2026-09-11', b.pages);
  t('CLIの比較選択は直前の重複窓を飛ばし有効な過去窓を使う',
    selectComparison(latest, [a, b, overlapping]) === a);
  t('有効な過去窓が無ければ比較窓を捏造しない',
    selectComparison(latest, [b, overlapping]) === null);

  // 既定へ落ちるページが順位を握っているとき、robust=false になる。
  const c = snap('A', '2026-07-01', '2026-07-28', [P('/obsidian/', 28, 280), P('/blog/zzz', 28, 280)]);
  const d = snap('B', '2026-08-01', '2026-08-28', [P('/obsidian/', 28, 280), P('/blog/zzz', 112, 1120)]);
  const shaky = decompose(c, d);
  t('**既定へ落ちたページが順位を動かすなら robust=false**', shaky.sensitivity.robust === false);
  t('robust=false は検査で問題として出る', validate(shaky).some((p) => p.includes('順位が分類に依存する')));

  // 空の面は順に並べられない。**「伸び0」と「データ無し」を混ぜない。**
  t('**片方の面にデータが無ければ順位を作らない**', ordering(rates(a, snap('B', '2026-08-01', '2026-08-28', [P('/obsidian/', 56, 560)]), {}).out) === null);

  // 既定へ落ちるページが無ければ、差し替えても何も変わらない。
  const three = (l, s2, e3, m) => snap(l, s2, e3, [
    P('/obsidian/', m[0], m[0] * 10), P('/vs/bear/', m[1], m[1] * 10), P('/glossary/gtd/', m[2], m[2] * 10),
  ]);
  const solid = decompose(three('A', '2026-07-01', '2026-07-28', [28, 28, 28]),
    three('B', '2026-08-01', '2026-08-28', [56, 43, 28]));
  t('**既定へ落ちるページが無ければ順位は動かない**', solid.sensitivity.robust === true);
  t('そのとき検査は何も言わない', validate(solid).length === 0);
  t('速い順に並べる', solid.sensitivity.ordering === 'high>mid>low');

  t('既定へ落ちた量を数えている', shaky.defaulted.after.pages === 1);

  // 実データ
  const labels = listSnapshots();
  if (labels.length >= 2) {
    const r = decompose(loadSnapshot(labels[labels.length - 2]), loadSnapshot(labels[labels.length - 1]));
    t('**実データで割れる**', r.total.clicks_per_day.after > 0);
    t('実データでも窓の日数が取れる', r.before.days != null && r.after.days != null);
  } else {
    t('**スナップショットが2つ未満**（比較そのものが成立しない）', false);
  }

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const labels = listSnapshots();
  if (labels.length < 2) {
    console.error('スナップショットが2つ未満 — **窓をまたいだ比較が成立しない**');
    process.exit(1);
  }
  const current = loadSnapshot(labels[labels.length - 1]);
  const previous = selectComparison(current, labels.slice(0, -1).map(loadSnapshot))
    || loadSnapshot(labels[labels.length - 2]);
  const r = decompose(previous, current);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(render(r));
  const problems = validate(r);
  if (problems.length) {
    console.log('\n読むときの但し書き:');
    for (const p of problems) console.log(`  - ${p}`);
  }
}
