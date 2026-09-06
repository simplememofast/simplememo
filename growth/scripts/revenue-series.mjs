#!/usr/bin/env node
/**
 * 日次の App Store Connect 取り込みから、**収入の履歴**を積む。
 *
 *   node growth/scripts/revenue-series.mjs            # 表示
 *   node growth/scripts/revenue-series.mjs --write    # data/revenue-series.json を更新
 *   node growth/scripts/revenue-series.mjs --check    # CI: 系列と方針の整合
 *   node growth/scripts/revenue-series.mjs --selftest
 *
 * 【なぜ要るか】
 * 2026-08-25 に収入が接続された。しかし見えていたのは **1本の instance だけ**で、
 * 資金繰りに使える月次にはならない。日次ファイルは
 * `growth/data/appstore/<date>.json` に溜まるが、**それを足すものが無かった。**
 *
 * 【足すのが危ないのはなぜか】
 * 取り込みが保存しているのは集計だけ（当時は列名・行数・数値列の合計だけ）。**どの日を含むかが
 * 分からないファイルを足すと二重計上になる。**実際、App Downloads Standard は
 * Counts 1,819 を返したが、CLAUDE.md は新規 install を 5〜15/日としている ——
 * 1日ぶんなら桁が合わず、複数日ぶんなら足せない。
 *
 * そこで取得側に `date_range`（min / max / distinct_days）を足した
 * （../simplememo-ios/scripts/asc_analytics.rb）。**この欄が無いファイルは
 * 足さずに飛ばす。**古いファイルを黙って足して月次を作るほうが害が大きい。
 *
 * 【この script が作らないもの】
 * ランウェイ（月数）は作らない。手元資金が機械に入っていないため。
 * ここが出すのは「何日ぶんの収入を、いくら観測したか」まで。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SRC_DIR = path.join(ROOT, 'growth/data/appstore');
export const OUT_PATH = path.join(ROOT, 'data/revenue-series.json');
const POLICY_PATH = path.join(ROOT, 'data/financial-policy.json');
/**
 * **積む場所は隣（非公開）へ移った。**
 *
 * [2026-08-26] この script の入力 `growth/data/appstore/` は
 * `growth/scripts/ingest-asc.mjs` が書くが、その ingest は
 * `../simplememo-ios/data/asc/` を読む —— **あちらの CI にこのリポジトリは無い**
 * （ingest-asc.mjs の冒頭が自分でそう書いている）。つまり取り込みは
 * **両方をローカルに checkout した人が手で走らせたときだけ**動いていた。
 *
 * 実測: growth/data/appstore/ は 2026-08-25.json の1件だけ、
 * data/revenue-series.json は covered_days: 0。08-25 に人が1回走らせ、それきり。
 * **台帳が⑤粗利・⑥LTVを「28日たまる待ち」に分類していたが、待っても貯まらなかった。**
 *
 * 積む処理は取得が毎日走る側（../simplememo-ios/scripts/asc_revenue.rb）へ移した。
 * ここは**写し**を持つ。写しの流儀は data/crossrepo-probes.json と同じで、
 * **隣が無いCIでは判定に使い、隣が在る場所で更新する。**
 */
export const IOS_SERIES = process.env.ASC_REVENUE_SERIES_PATH
  || path.join(ROOT, '..', 'simplememo-ios', 'data/revenue/series.json');

/** 月次を名乗るのに要る日数。GSC の28日窓と揃える。 */
export const DAYS_FOR_MONTHLY = 28;
/** 収入として読む列。**名前で拾う** — Apple 側の表記が変わったら気づけるように。 */
export const PROCEEDS_COL = 'Proceeds in USD';
export const SALES_COL = 'Sales in USD';
export const PURCHASE_COL = 'Purchases';

/**
 * 取り込み1ファイルから、課金レポートの観測を1つ取り出す。
 * **date_range が無ければ null**（足せないものを足さない）。
 */
export function observationOf(doc) {
  const rep = (doc.reports || []).find((r) => r.report === 'App Store Purchases Standard');
  if (!rep) return null;
  const dr = rep.date_range;
  if (!dr || !dr.min || !dr.max) {
    return { skipped: true, reason: 'date_range が無い（この取り込みは何日ぶんか分からない）', fetched: doc.date };
  }
  return {
    skipped: false,
    fetched: doc.date,
    from: dr.min,
    to: dr.max,
    days: dr.distinct_days ?? null,
    proceeds_usd: rep.sums?.[PROCEEDS_COL] ?? null,
    sales_usd: rep.sums?.[SALES_COL] ?? null,
    purchases: rep.sums?.[PURCHASE_COL] ?? null,
  };
}

/**
 * 観測の集合から系列を作る。**同じ日を2回数えない。**
 *
 * 取り込みは毎日走り、その日の instance を落とす。窓が重なっていれば
 * 同じ日が複数ファイルに現れる。日ごとに**最後に観測した値**を採る
 * （後の取り込みほど Apple 側の確定値に近い）。
 */
export function buildSeries(observations) {
  const byDay = new Map();
  const skipped = [];
  for (const o of observations) {
    if (!o) continue;
    if (o.skipped) { skipped.push(o); continue; }
    // 1ファイルが複数日を含む場合、日ごとの内訳は持っていない。
    // **按分しない** —— 分からないものを推定で埋めない。範囲ごと1つの観測として持つ。
    const key = `${o.from}..${o.to}`;
    byDay.set(key, o); // 同じ範囲の再観測は後勝ち
  }
  const spans = [...byDay.values()].sort((a, b) => a.from.localeCompare(b.from));

  // 覆っている日数 — 範囲の和集合として数える（重なりを二重に数えない）
  const days = new Set();
  for (const s of spans) {
    const d0 = new Date(`${s.from}T00:00:00Z`);
    const d1 = new Date(`${s.to}T00:00:00Z`);
    for (let t = d0.getTime(); t <= d1.getTime(); t += 86400000) {
      days.add(new Date(t).toISOString().slice(0, 10));
    }
  }
  const sum = (k) => spans.reduce((a, s) => a + (typeof s[k] === 'number' ? s[k] : 0), 0);
  return {
    spans,
    skipped,
    covered_days: days.size,
    first_day: spans.length ? spans[0].from : null,
    last_day: spans.length ? spans[spans.length - 1].to : null,
    proceeds_usd: Math.round(sum('proceeds_usd') * 100) / 100,
    sales_usd: Math.round(sum('sales_usd') * 100) / 100,
    purchases: sum('purchases'),
    monthly_ready: days.size >= DAYS_FOR_MONTHLY,
  };
}

export function readAll(dir = SRC_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

/**
 * 方針が名乗る日数と、実測の系列がずれていないか。
 *
 * [2026-08-26] **この判定は本体に直接書かれていて、自己テストが一度も通らなかった。**
 * 実測すると、ここの problems.push を潰しても自己テストは緑のままだった ——
 * 覆っているように見えるだけで、何も守っていない。
 *
 * ずれたまま出荷すると、資金繰りの欄が「28日ぶん見た」と名乗りながら
 * 実際は数日しか見ていない、という形になる。**名乗りと実測は同じ数でなければならない。**
 */
/**
 * @param {object|null} policy  方針の台帳。**null は「突き合わせない」**（呼ぶ側が明示する）。
 *   鍵が無い方針オブジェクトは別で、**それは台帳の形をしていない**ので落とす。
 */
/**
 * 隣の実測から**写し**を作る。**金額は運ばない。**
 *
 * このリポジトリは GitHub 上で公開されている（data/publication-policy.json）。
 * `blocked_on` が読むのは `covered_days` だけなので、**判定に要らない実額を
 * 公開側へ日次で積む理由が無い。**金額は非公開の隣が持つ。
 *
 * 隣が読めなければ **null**（0 ではない）。「読めなかった」を「0日」と書かない。
 */
// Validate coverage from the daily provenance, without copying monetary values.
// A rolling window or later correction can legitimately reduce observed days.
export function purchaseCoverage(doc) {
  if (doc?.schema !== 'asc_revenue_v2' || doc.app_id !== '6758438948'
      || doc.report !== 'App Store Purchases Standard' || doc.timezone !== 'UTC'
      || !Number.isInteger(doc.instance_count) || doc.instance_count < 1) return null;
  const epoch = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const number = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(number) && new Date(number).toISOString().slice(0, 10) === value ? number : NaN;
  };
  if (typeof doc.generated_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(doc.generated_at)
      || !Number.isFinite(Date.parse(doc.generated_at)) || Date.parse(doc.generated_at) > Date.now()
      || new Date(doc.generated_at).toISOString().replace('.000Z', 'Z') !== doc.generated_at) return null;
  const current = doc.current;
  const from = epoch(current?.from), to = epoch(current?.to), dayMs = 86400000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to - from !== 27 * dayMs
      || to > epoch(doc.generated_at.slice(0, 10)) - 2 * dayMs
      || !current.daily || Array.isArray(current.daily)) return null;
  const dates = Array.from({ length: 28 }, (_, i) => new Date(from + i * dayMs).toISOString().slice(0, 10));
  if (JSON.stringify(Object.keys(current.daily).sort()) !== JSON.stringify(dates)) return null;
  const missing = [], provisional = [], conflicts = [];
  let complete = 0, observed = 0;
  for (const date of dates) {
    const entry = current.daily[date];
    if (entry === null) { missing.push(date); continue; }
    if (!entry || !['observed', 'conflicting_instances'].includes(entry.state)) return null;
    const processing = epoch(entry.processing_date);
    if (!Number.isFinite(processing) || processing < epoch(date)
        || processing > epoch(doc.generated_at.slice(0, 10))) return null;
    if (entry.state === 'conflicting_instances') { conflicts.push(date); continue; }
    observed += 1;
    if (processing < epoch(date) + 2 * dayMs) provisional.push(date);
    else complete += 1;
  }
  const ready = complete === 28;
  if (doc.covered_days !== complete || current.complete_observed_days !== complete
      || current.observed_days !== observed || doc.days_for_monthly !== 28
      || doc.monthly_ready !== ready || current.state !== (ready ? 'complete' : 'incomplete')) return null;
  for (const [field, values] of [['missing_dates', missing], ['provisional_dates', provisional], ['conflicting_dates', conflicts]]) {
    if (JSON.stringify(current[field]) !== JSON.stringify(values)) return null;
  }
  return { from: current.from, to: current.to, timezone: 'UTC', state: current.state,
    complete_days: complete, observed_days: observed,
    missing_days: missing.length, provisional_days: provisional.length, conflicting_days: conflicts.length };
}

export function mirrorFrom(iosDoc, syncedAt) {
  if (iosDoc?.schema === 'asc_revenue_v2') {
    const coverage = purchaseCoverage(iosDoc);
    if (!coverage) return null;
    return {
      $comment: ['購入レポートの日別観測範囲の写し。金額・個票・流入元は公開側へ運ばない。',
        'covered_daysは現在の28日窓に確定版がある日数。累計暦日数ではなく、窓の移動や訂正で減る場合がある。',
        'monthly_readyは28日窓の観測完了のみ。確定入金・月額外挿・LTV評価の完了ではない。'],
      schema: 'revenue_observation_mirror_v2', source_schema: iosDoc.schema,
      source: 'simplememo-ios/data/revenue/series.json', source_generated_at: iosDoc.generated_at,
      synced_at: syncedAt, covered_days: coverage.complete_days, days_for_monthly: 28,
      monthly_ready: iosDoc.monthly_ready, first_day: coverage.from, last_day: coverage.to,
      coverage,
    };
  }
  if (iosDoc?.schema) return null; // Do not reinterpret an unknown future schema as legacy.
  if (!iosDoc || typeof iosDoc.covered_days !== 'number') return null;
  return {
    $comment: [
      '収入の観測日数の**写し**。growth/scripts/revenue-series.mjs --write が書く。**手で編集しない。**',
      '**実測は ../simplememo-ios/data/revenue/series.json**（取得が毎日走る側で積んでいる）。',
      '**金額は運ばない。**このリポジトリは公開されており、blocked_on が読むのは covered_days だけ。',
      '写しなので、隣が見える場所で更新する（data/crossrepo-probes.json と同じ流儀）。',
    ],
    source: 'simplememo-ios/data/revenue/series.json',
    synced_at: syncedAt,
    covered_days: iosDoc.covered_days,
    days_for_monthly: iosDoc.days_for_monthly ?? DAYS_FOR_MONTHLY,
    monthly_ready: Boolean(iosDoc.monthly_ready),
    first_day: iosDoc.first_day ?? null,
    last_day: iosDoc.last_day ?? null,
    spans: Array.isArray(iosDoc.spans) ? iosDoc.spans.length : null,
    $spans: '区間の**本数**だけ。範囲と金額は隣が持つ',
  };
}

/**
 * **観測日数を減らす書き込みを拒む。**
 *
 * 隣が見えない場所で `--write` を走らせると、入力が空なので covered_days 0 が
 * 出る。それをそのまま書くと、**写しが 0 で潰れる。**
 * check-domain-expiry が「取得失敗で台帳の値を消さない」としているのと同じ形で、
 * ここでも**読めなかったことを『0日』として上書きしない。**
 *
 * 作り直したいときはファイルを消してから走らせる（意図的な操作を要求する）。
 */
export function refusesToShrink(existing, next) {
  if (next?.schema === 'revenue_observation_mirror_v2' && next.source_schema === 'asc_revenue_v2'
      && next.covered_days === next.coverage?.complete_days) {
    if (existing?.schema === 'revenue_observation_mirror_v2') {
      if (next.source_generated_at < existing.source_generated_at || next.last_day < existing.last_day) {
        return '既存より古い日別集計への巻き戻しを拒む';
      }
      if (next.source_generated_at === existing.source_generated_at && !sameMirror(existing, next)) {
        return '同じ生成時刻で異なる日別集計が届いたため、置換しない';
      }
    }
    return null; // Validated new snapshot, including one-time legacy -> v2 migration.
  }
  if (existing?.schema === 'revenue_observation_mirror_v2') return '日別v2から旧スパンへの巻き戻しを拒む';
  const before = existing?.covered_days;
  const after = next?.covered_days;
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  if (after >= before) return null;
  return `既にある写しは ${before} 日で、書こうとしているのは ${after} 日`
    + ' — **減らす書き込みは拒む。**隣（simplememo-ios）が見えない場所で走らせると 0 になる。'
    + '作り直すならファイルを消してから走らせること';
}

export function policyDrift(policy, series) {
  if (policy === null || policy === undefined) return [];   // 突き合わせない、と呼ぶ側が言った
  const declared = policy?.cash_scenarios?.revenue_history_days;
  // [2026-08-26] ここは `if (declared === undefined) return [];` だった。
  // **宣言の鍵を消すと、この突き合わせが丸ごと消える**（実測: 宣言17 vs 実測0 は
  // 捕まるのに、鍵を消すと exit 0）。しかも同じファイルの --write が
  // その鍵を書く側で、**その --write は ReferenceError で一度も成功していなかった。**
  // 「書けていない」と「ずれていない」が同じ見た目になっていた。
  if (declared === undefined) {
    return ['financial-policy.json に cash_scenarios.revenue_history_days が無い'
      + ` — **実測 ${series.covered_days} 日と突き合わせる相手が消える。**`
      + '`--write` を実行して同じコミットに含めること'];
  }
  if (declared !== series.covered_days) {
    return [`financial-policy.json の revenue_history_days=${declared} が実測 ${series.covered_days} と違う`
      + ' — `--write` を実行して同じコミットに含めること'];
  }
  return [];
}

function selftest() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name);
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };

  const mk = (date, from, to, days, proceeds) => ({
    date, reports: [{ report: 'App Store Purchases Standard',
      date_range: from ? { min: from, max: to, distinct_days: days } : null,
      sums: { 'Proceeds in USD': proceeds, 'Sales in USD': proceeds * 1.18, Purchases: 1 } }],
  });

  t('date_range が無いファイルは足さない',
    observationOf(mk('2026-08-25', null)).skipped === true);
  t('飛ばした理由を書く',
    observationOf(mk('2026-08-25', null)).reason.includes('分からない'));

  const s1 = buildSeries([observationOf(mk('2026-08-25', '2026-08-24', '2026-08-24', 1, 2.59))]);
  t('1日ぶんは covered_days=1', s1.covered_days === 1);
  t('28日に満たなければ monthly_ready=false', s1.monthly_ready === false);
  t('入金を合計する', s1.proceeds_usd === 2.59);

  // **同じ範囲を2回取り込んでも二重計上しない**
  const dup = buildSeries([
    observationOf(mk('2026-08-25', '2026-08-24', '2026-08-24', 1, 2.59)),
    observationOf(mk('2026-08-26', '2026-08-24', '2026-08-24', 1, 2.59)),
  ]);
  t('同じ範囲の再観測は後勝ちで二重計上しない', dup.proceeds_usd === 2.59 && dup.covered_days === 1);

  // ── 方針と系列の整合（**ここまで一度も通っていなかった**） ──────
  t('**名乗りが実測とずれたら落ちる**（28日と名乗って数日しか見ていない形）',
    policyDrift({ cash_scenarios: { revenue_history_days: 28 } }, { covered_days: 3 }).length === 1);
  t('名乗りが実測と一致すれば何も言わない（常に鳴る検査も何も見ていない）',
    policyDrift({ cash_scenarios: { revenue_history_days: 3 } }, { covered_days: 3 }).length === 0);
  // [2026-08-26] ここは「名乗っていなければ何も言わない（宣言前は照合する相手が
  // いない）」を確かめていた。**その理由づけごと間違っていた。**
  // 鍵を書く側は同じファイルの --write で、その --write は
  // `ReferenceError: policy is not defined` により**一度も成功していなかった。**
  // つまり「まだ宣言していない」と「書き込みが壊れている」が同じ見た目になる。
  // 方針そのものを渡さない（null）＝突き合わせない、鍵が無い＝台帳の形をしていない。
  t('**鍵が無い方針は落ちる**（「まだ宣言していない」と「書けていない」を混ぜない）',
    policyDrift({ cash_scenarios: {} }, { covered_days: 3 }).length === 1);
  t('null は「突き合わせない」（鍵が無いのとは別）',
    policyDrift(null, { covered_days: 3 }).length === 0);
  t('**0 と undefined を混ぜない**（0日と名乗るのは宣言、未宣言とは別）',
    policyDrift({ cash_scenarios: { revenue_history_days: 0 } }, { covered_days: 3 }).length === 1);

  const two = buildSeries([
    observationOf(mk('2026-08-25', '2026-08-24', '2026-08-24', 1, 2.59)),
    observationOf(mk('2026-08-26', '2026-08-25', '2026-08-25', 1, 4.00)),
  ]);
  t('別の日は足す', two.proceeds_usd === 6.59 && two.covered_days === 2);

  // 範囲が重なる観測でも、日数は和集合で数える
  const overlap = buildSeries([
    observationOf(mk('2026-08-25', '2026-08-20', '2026-08-24', 5, 10)),
    observationOf(mk('2026-08-26', '2026-08-23', '2026-08-26', 4, 8)),
  ]);
  t('重なる範囲の日数は和集合（20〜26の7日）', overlap.covered_days === 7);

  const long = buildSeries([observationOf(mk('2026-09-22', '2026-08-26', '2026-09-22', 28, 80))]);
  t('28日そろえば monthly_ready=true', long.monthly_ready === true);

  t('ランウェイは作らない', !('runway_months' in long) && !('runway' in long));

  // --- 写し（積む場所は隣へ移った） ---
  const iosDoc = { covered_days: 3, days_for_monthly: 28, monthly_ready: false,
    first_day: '2026-08-23', last_day: '2026-08-25', spans: [1, 2],
    totals: { purchases: 1, proceeds_usd: 2.59, sales_usd: 3.05 } };
  const mir = mirrorFrom(iosDoc, '2026-08-26');
  t('写しに観測日数が入る', mir.covered_days === 3);
  // **金額を公開側へ運ばない。**判定に要るのは covered_days だけ
  t('**写しに金額を運ばない**', !JSON.stringify(mir).includes('2.59')
    && !JSON.stringify(mir).includes('3.05') && !('totals' in mir));
  t('区間は本数だけ運ぶ', mir.spans === 2);
  // **「読めなかった」を「0日」と書かない**
  t('隣が読めなければ写しを作らない（0日にしない）', mirrorFrom(null, 'x') === null);
  t('形が違うものを写しにしない', mirrorFrom({ covered_days: 'three' }, 'x') === null);

  // **観測日数を減らす書き込みを拒む**（隣が見えない場所で走らせると 0 になる）
  t('**減らす書き込みを拒む**', typeof refusesToShrink({ covered_days: 5 }, { covered_days: 0 }) === 'string');
  t('増える書き込みは通す', refusesToShrink({ covered_days: 1 }, { covered_days: 5 }) === null);
  t('同じ日数は通す', refusesToShrink({ covered_days: 5 }, { covered_days: 5 }) === null);
  t('写しがまだ無ければ拒まない', refusesToShrink(null, { covered_days: 1 }) === null);

  const dailyV2 = (count, generated = '2026-09-06T00:00:00Z') => {
    const dates = Array.from({ length: 28 }, (_, i) => new Date(Date.UTC(2026, 7, 8 + i)).toISOString().slice(0, 10));
    const ready = count === 28;
    return { schema: 'asc_revenue_v2', app_id: '6758438948', report: 'App Store Purchases Standard',
      timezone: 'UTC', generated_at: generated, instance_count: 3,
      covered_days: count, days_for_monthly: 28, monthly_ready: ready,
      current: { from: dates[0], to: dates[27], state: ready ? 'complete' : 'incomplete',
        complete_observed_days: count, observed_days: count, missing_dates: dates.slice(count),
        conflicting_dates: [], provisional_dates: [],
        daily: Object.fromEntries(dates.map((day, i) => [day, i < count
          ? { state: 'observed', processing_date: '2026-09-06', values: { proceeds_usd: '987.654', secret: 'private-source' } }
          : null])) } };
  };
  const v2 = dailyV2(3);
  const v2mirror = mirrorFrom(v2, '2026-09-06');
  t('v2は日別の確定版から写しの日数を照合する', v2mirror?.covered_days === 3 && v2mirror.coverage.missing_days === 25);
  t('v2の写しにも金額・個票を含めない', !JSON.stringify(v2mirror).includes('987.654')
    && !JSON.stringify(v2mirror).includes('private-source') && !JSON.stringify(v2mirror).includes('daily'));
  t('v2の28日窓が揃った時だけready', mirrorFrom(dailyV2(28), '2026-09-06')?.monthly_ready === true);
  t('v2で日数だけ28へ書き換えても受け入れない', mirrorFrom({ ...v2, covered_days: 28 }, 'x') === null);
  t('v2の不完全窓をreadyにできない', mirrorFrom({ ...v2, monthly_ready: true }, 'x') === null);
  t('v2の不正な期間・欠測一覧を拒む', mirrorFrom({ ...v2, current: { ...v2.current, missing_dates: [] } }, 'x') === null
    && mirrorFrom({ ...v2, current: { ...v2.current, from: '2026-02-30' } }, 'x') === null);
  t('未来の生成時刻と未知schemaを拒む', mirrorFrom({ ...v2, generated_at: '2099-01-01T00:00:00Z' }, 'x') === null
    && mirrorFrom({ ...v2, schema: 'asc_revenue_v999' }, 'x') === null);
  const corrected = mirrorFrom(dailyV2(1, '2026-09-06T01:00:00Z'), '2026-09-06');
  t('検証済みの日別v2へ移る際は旧暦日数より減ってよい', refusesToShrink({ covered_days: 6 }, v2mirror) === null);
  t('後日訂正で観測日数が減っても新しいv2を保存する', refusesToShrink(v2mirror, corrected) === null);
  t('v2の古いスナップショットへの巻き戻しは拒む', typeof refusesToShrink(corrected, v2mirror) === 'string');
  t('同じ生成時刻の矛盾を拒む', typeof refusesToShrink(v2mirror, mirrorFrom(dailyV2(1), '2026-09-06')) === 'string');
  t('v2から旧スパンに戻さない', typeof refusesToShrink(v2mirror, mir) === 'string');

  // 写しと方針の突き合わせは、写しの covered_days で行う
  // **時刻だけの差分で書かない。**（今日の教訓がこの生成器自身に当たっていた）
  const m1 = { covered_days: 1, synced_at: '2026-08-26', first_day: 'a' };
  const m2 = { covered_days: 1, synced_at: '2026-08-27', first_day: 'a' };
  t('**同期した日だけ違うものを同じと見る**', sameMirror(m1, m2));
  t('中身が違えば違うと見る', !sameMirror(m1, { ...m2, covered_days: 2 }));
  t('写しがまだ無い場合も落ちない', !sameMirror(null, m2));

  t('写しと方針がずれたら言う',
    policyDrift({ cash_scenarios: { revenue_history_days: 9 } }, { covered_days: 3 }).length === 1);
  t('写しと方針が揃っていれば黙る',
    policyDrift({ cash_scenarios: { revenue_history_days: 3 } }, { covered_days: 3 }).length === 0);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

/** 隣の実測を読む。**無ければ null**（0 ではない）。 */
/**
 * 同期した日を除いて比べる。**時刻だけの差分で書かないため。**
 *
 * [2026-08-27 00:52 JST] **自分で書いた歯止めに自分が当たった。**
 * 同じ日（2026-08-26）の om-2026-08-26-network-generator-vs-regenerate-check で
 * 「ネット・**時刻**・外部APIが混ざる生成器は再生成して比較に載せられない」と
 * 書いておきながら、この --write は synced_at に todayJst() を入れていた。
 * JST の日付が回った瞬間、中身が同じでも `check-generators --run` が
 * 「生成物が古い」で落ちる —— **毎日 15:00 UTC 以降ずっと赤いまま**になる。
 *
 * しかも **CI では緑になる。**あちらに隣のリポジトリが無いので --write が
 * そもそも書かないため。つまり**3リポジトリの揃ったセッションでだけ赤い**という、
 * いちばん追いにくい形をしていた。
 *
 * asc_revenue.rb では generated_at で同じ穴を潰してある。**同じ手当てをここにも。**
 * synced_at は「最後に**中身が**揃った日」になる（covered_days は毎日増える見込みなので、
 * 実質は最後に確認した日と近い値のまま）。
 */
export function sameMirror(a, b) {
  const strip = (d) => JSON.stringify({ ...(d ?? {}), synced_at: null });
  return strip(a) === strip(b);
}

export function readIosSeries(p = IOS_SERIES) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const docs = readAll();
  const series = buildSeries(docs.map(observationOf));
  const problems = [];

  console.log(`収入の履歴 — 取り込み ${docs.length} 件 / 観測 ${series.spans.length} 区間\n`);
  for (const s of series.spans) {
    console.log(`  ${s.from}〜${s.to}（${s.days ?? '?'}日）  課金 ${s.purchases} / 入金 $${s.proceeds_usd}`
      + `  ← ${s.fetched} の取り込み`);
  }
  if (series.skipped.length) {
    console.log(`\n  足さずに飛ばした ${series.skipped.length} 件:`);
    for (const s of series.skipped) console.log(`    ${s.fetched}: ${s.reason}`);
    console.log('  **古い取り込みには date_range が無い。**推定で埋めず、飛ばして数える。');
  }

  console.log(`\n  覆っている日数 ${series.covered_days} / ${DAYS_FOR_MONTHLY}`
    + `  （${series.monthly_ready ? '**月次を出せる**' : '月次にはまだ足りない'}）`);
  console.log(`  累計  課金 ${series.purchases}件 / 入金 $${series.proceeds_usd} / 売上 $${series.sales_usd}`);
  console.log('\n  **これは累計であって月額ではない。**'
    + `${series.monthly_ready ? '' : `${DAYS_FOR_MONTHLY}日に届くまで月額へ換算しない。`}`);
  console.log('  **ランウェイは出さない。**手元資金が機械に入っていないため（別の欄が持つ）。');

  // 方針と系列の整合
  // [2026-08-26] ここで読んだ方針を束縛していなかったため、下の --write が
  // `ReferenceError: policy is not defined` で落ちていた。**一度も成功していない。**
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  // **突き合わせる相手は写し**であって、この場では作れない再構築ではない。
  // [2026-08-26] 入力（growth/data/appstore/）は人が手で走らせたときしか増えない
  // ので、再構築と突き合わせると CI が常に「実測0日」と言う。
  const existing = fs.existsSync(OUT_PATH) ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8')) : null;
  problems.push(...policyDrift(policy, existing ?? series));

  if (process.argv.includes('--write')) {
    // **積むのは隣。ここは写し。**（IOS_SERIES の注記を参照）
    const ios = readIosSeries();
    const out = mirrorFrom(ios, todayJst());
    if (!out) {
      console.log('\n  → **書かない。**隣の実測が読めない'
        + `（${IOS_SERIES.replace(`${ROOT}/`, '')}）`);
      console.log('     3リポジトリの揃った場所で走らせること。'
        + '**読めなかったことを「0日」として書かない。**');
      process.exit(0);
    }
    // **中身が同じなら書かない。**synced_at だけの差分で毎日赤くしない（上の注記）
    if (existing && sameMirror(existing, out)) {
      console.log(`\n  → 中身が同じなので書かない（観測 ${out.covered_days} 日・synced_at だけの差分を作らない）`);
      process.exit(0);
    }
    const shrink = refusesToShrink(existing, out);
    if (shrink) {
      console.error(`\n  → **書かない。**${shrink}`);
      process.exit(1);
    }
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\n  → data/revenue-series.json（写し・観測 ${out.covered_days} 日）`);
    // 方針側の日数も同時に合わせる（ずれたままにしない）
    policy.cash_scenarios.revenue_history_days = out.covered_days;
    fs.writeFileSync(POLICY_PATH, `${JSON.stringify(policy, null, 2)}\n`);
    console.log('  → data/financial-policy.json の revenue_history_days を更新');
    process.exit(0);
  }

  if (problems.length) {
    console.error('\n収入の履歴: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n系列と方針の日数に食い違いなし。');
}
