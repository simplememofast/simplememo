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
export function policyDrift(policy, series) {
  const declared = policy?.cash_scenarios?.revenue_history_days;
  if (declared === undefined) return [];
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
  t('名乗っていなければ何も言わない（宣言前は照合する相手がいない）',
    policyDrift({ cash_scenarios: {} }, { covered_days: 3 }).length === 0);
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

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

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
  problems.push(...policyDrift(JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')), series));

  if (process.argv.includes('--write')) {
    const out = {
      $comment: [
        '収入の履歴。growth/scripts/revenue-series.mjs が書く。**手で編集しない。**',
        '**日ごとの内訳は持たない。**取り込みが範囲ごとの合計しか持たないため、按分もしない。',
        'ランウェイはここでは作らない（手元資金が機械に入っていないので、月数を出すと嘘になる）。',
      ],
      generated_at: series.spans.length ? series.spans[series.spans.length - 1].fetched : null,
      covered_days: series.covered_days,
      days_for_monthly: DAYS_FOR_MONTHLY,
      monthly_ready: series.monthly_ready,
      first_day: series.first_day,
      last_day: series.last_day,
      totals: { purchases: series.purchases, proceeds_usd: series.proceeds_usd, sales_usd: series.sales_usd },
      spans: series.spans,
      skipped: series.skipped,
    };
    fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`\n  → data/revenue-series.json`);
    // 方針側の日数も同時に合わせる（ずれたままにしない）
    policy.cash_scenarios.revenue_history_days = series.covered_days;
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
