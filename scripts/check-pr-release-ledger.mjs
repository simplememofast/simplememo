#!/usr/bin/env node
// ============================================
// PR配信が**2つの台帳の両方に**載っているかを鳴らす
// ============================================
//
// 【何が起きたか】2026-09-24、PR TIMES の「対話メモ 提供開始」（PR⑦）が公開された。
// 行は `growth/data/annotations.json` に入った（#1568）。**`experiments.json` には入らなかった。**
// 帰結は2つあり、どちらも既存の検査を素通りする:
//
//     d-score.mjs --backtest   … 「n=6, 1 件は書式が違い拾えなかった」と出す。
//                                 **数え落としは言うが、落ちない。**較正は n=6 のまま読まれる
//     pr-evaluation-due.mjs    … experiments.json しか読まない（40行 LEDGER_PATH）。
//                                 **2026-10-08 の D+14 を永久に拾わない**
//
// 後者は実測した —— `due(ledger, '2026-10-08')` が `[]` を返す。
// **配信の14日後に自動で評価するはずの機構が、7本目で沈黙する。**
//
// その `pr-evaluation-due.mjs` 自身が冒頭にこう書いている:
//
//     7本目の配信でまた人が置くことになる。台帳に行を足したら勝手に拾われる
//     形でなければ自律ではない
//
// **その7本目で外れた。**行は足されたが、足された先が違った。
//
// 【この検査が防げないこと（先に書く）】
// **配信前採点の抜けは防げない。**鳴るのは配信より後だからで、そのときにはもう出ている。
// 守れるのは「出た後に両方の台帳へ載ること」だけ。
//
// 【なぜ「出た配信」を機械が数えに行かないのか】
// prtimes.jp は**この環境の egress から到達できない**（2026-09-24 実測・CONNECT tunnel 403）。
// だから「公開されている配信の一覧」を機械は持てない。持てないものを持っているふりをせず、
// (1) 2つの台帳の**食い違い**を機械が見る、(2) どちらにも無い場合に備えて
// 「人が最後に全件そろっていると確かめた日」の鮮度で鳴らす、の2段にしてある。
//
//   node scripts/check-pr-release-ledger.mjs             # 人が読む形
//   node scripts/check-pr-release-ledger.mjs --check     # CI（落ちる）
//   node scripts/check-pr-release-ledger.mjs --selftest
//
// 【落とす条件】
//   1. `cross_check_from` 以降の PR 行が annotations にあるのに experiments に無い
//      （＝ D+14 が拾われない。これが今回の穴）
//   2. 最後の全件確認から `max_days_between_confirmations` 日を超えた
//   3. `known_unrecorded` に `resolve_by` を過ぎた項目がある
//   4. 台帳ファイルか設定ファイルが読めない（**黙って通さない**）
//
// 4 を入れてあるのは、`check-guard-shapes` が言う「地面が無くなると消える見張り」に
// しないため。設定を消せば鳴らなくなる検査は、検査ではない。
//
// **PR①〜⑤ は対象外。**experiments.json で PR 実験を追い始めたのが PR⑥ からなので、
// `cross_check_from` で線を引いてある。遡って埋めろという主張ではない
// （当時の分析画面はもう取れない）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { todayJst } from './lib/jst.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT, 'data/pr-release-ledger.json');
export const ANNOTATIONS_PATH = path.join(ROOT, 'growth/data/annotations.json');
export const EXPERIMENTS_PATH = path.join(ROOT, 'growth/experiments/experiments.json');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** JST の今日（台帳の日付は全部 JST 基準）。 */
export { todayJst };

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** experiments から、実際に配信された（planned でない）PR 実験の配信日を集める。 */
export function shippedExperimentDates(experiments) {
  const rows = experiments?.experiments ?? experiments ?? [];
  const list = Array.isArray(rows) ? rows : Object.values(rows);
  const dates = new Set();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    // planned は「出す予定」であって出たものではない。started_at が入っていても数えない。
    if (r.status !== 'running' && r.status !== 'evaluated') continue;
    if (ISO_DATE.test(String(r.started_at))) dates.add(r.started_at);
  }
  return dates;
}

/** annotations から PR 行だけを取り、件数と最後の配信日を返す。 */
export function ledgerState(annotations) {
  const rows = (annotations.annotations || []).filter((a) => a.type === 'pr');
  const dates = rows.map((r) => r.date).filter((d) => ISO_DATE.test(d)).sort();
  return { n: rows.length, last_release: dates.length ? dates[dates.length - 1] : null };
}

/**
 * 落とす理由を配列で返す。空なら通る。
 * **読めない入力は「通す」側に倒さない** —— 設定を消して黙らせられる検査にしない。
 */
export function audit(config, annotations, experiments, today = todayJst()) {
  const problems = [];

  if (!config || typeof config !== 'object') {
    return ['data/pr-release-ledger.json が読めない — **確認の記録が無い状態では通さない。**'];
  }
  if (!annotations || typeof annotations !== 'object') {
    return ['growth/data/annotations.json が読めない — 件数を数えられないので通さない。'];
  }
  if (!experiments || typeof experiments !== 'object') {
    return ['growth/experiments/experiments.json が読めない — 突き合わせられないので通さない。'];
  }

  // ① 2つの台帳の食い違い —— これが 2026-09-24 に実際に起きた穴
  const from = config.cross_check_from;
  if (ISO_DATE.test(String(from))) {
    const shipped = shippedExperimentDates(experiments);
    const parked = new Set(
      (config.known_unrecorded || []).map((e) => e?.published_at).filter(Boolean),
    );
    for (const a of annotations.annotations || []) {
      if (a.type !== 'pr' || !ISO_DATE.test(String(a.date)) || a.date < from) continue;
      if (shipped.has(a.date)) continue;
      if (parked.has(a.date)) continue;  // 期限つきで把握済みのものは ③ が見る
      problems.push(
        `${a.date} の配信が annotations にあるのに experiments に無い — ` +
        `**pr-evaluation-due.mjs が D+14 を拾わない**（あの機構は experiments しか読まない）。` +
        `status:running のレコードを作ること。`,
      );
    }
  } else {
    problems.push(`cross_check_from が日付ではない（${JSON.stringify(from)}）`);
  }

  const confirmed = config.last_confirmed_complete;
  const limit = config.max_days_between_confirmations;

  if (!ISO_DATE.test(String(confirmed))) {
    problems.push(`last_confirmed_complete が日付ではない（${JSON.stringify(confirmed)}）`);
  } else if (!Number.isInteger(limit) || limit <= 0) {
    problems.push(`max_days_between_confirmations が正の整数ではない（${JSON.stringify(limit)}）`);
  } else {
    const age = daysBetween(confirmed, today);
    if (age === null) {
      // `ISO_DATE` は形しか見ないので `2026-13-01` を通す（Date.parse は NaN）。
      // ここを素通りさせると、**壊れた1行で鮮度ゲートが黙る。**通さない側に倒す。
      problems.push(
        `last_confirmed_complete「${confirmed}」が日付として成立しない（形は合っているが存在しない日）— ` +
        `**素通りさせると鮮度ゲートが黙る。**`,
      );
    } else if (age > limit) {
      problems.push(
        `台帳の全件確認が ${age} 日前（上限 ${limit} 日）— **この間に配信が1本出ていても気付けない。** ` +
        `確かめたら last_confirmed_complete を ${today} にする。`,
      );
    }
  }

  for (const entry of config.known_unrecorded || []) {
    const by = entry?.resolve_by;
    if (!ISO_DATE.test(String(by))) {
      problems.push(`known_unrecorded「${entry?.id ?? '?'}」の resolve_by が日付ではない`);
      continue;
    }
    if (by < today) {
      problems.push(
        `known_unrecorded「${entry.id}」（${entry.published_at} 配信）が期限 ${by} を過ぎている — ` +
        `**未記録のまま置き去りになっている。**台帳へ転記するか、期限を延ばす理由を書く。`,
      );
    }
  }

  return problems;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SCENARIOS = [
  ['期限内・未記録なしなら通る', () => {
    const p = audit({ cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-20', max_days_between_confirmations: 21 },
      { annotations: [] }, { experiments: [] }, '2026-09-24');
    if (p.length) throw new Error(`通らなかった: ${p[0]}`);
  }],
  ['**確認が古いと落ちる**（気付けない窓に入る）', () => {
    const p = audit({ cross_check_from: '2026-09-03', last_confirmed_complete: '2026-08-01', max_days_between_confirmations: 21 },
      { annotations: [] }, { experiments: [] }, '2026-09-24');
    if (!p.some((x) => x.includes('全件確認'))) throw new Error('古い確認が通った');
  }],
  ['ちょうど上限の日は通る（境界を曖昧にしない）', () => {
    const p = audit({ cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-03', max_days_between_confirmations: 21 },
      { annotations: [] }, { experiments: [] }, '2026-09-24');
    if (p.length) throw new Error(`境界で落ちた: ${p[0]}`);
  }],
  ['上限の翌日は落ちる', () => {
    const p = audit({ cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-03', max_days_between_confirmations: 21 },
      { annotations: [] }, { experiments: [] }, '2026-09-25');
    if (!p.length) throw new Error('上限超過が通った');
  }],
  ['**期限を過ぎた未記録は落ちる**', () => {
    const p = audit({
      cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21,
      known_unrecorded: [{ id: 'x', published_at: '2026-09-24', resolve_by: '2026-10-08' }],
    }, { annotations: [] }, { experiments: [] }, '2026-10-09');
    if (!p.some((x) => x.includes('置き去り'))) throw new Error('期限切れの未記録が通った');
  }],
  ['期限前の未記録は落とさない（park してよい）', () => {
    const p = audit({
      cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21,
      known_unrecorded: [{ id: 'x', published_at: '2026-09-24', resolve_by: '2026-10-08' }],
    }, { annotations: [] }, { experiments: [] }, '2026-09-30');
    if (p.length) throw new Error(`期限前で落ちた: ${p[0]}`);
  }],
  ['**設定が消えたら落ちる**（黙る検査にしない）', () => {
    if (!audit(null, { annotations: [] }, { experiments: [] }, '2026-09-24').length) throw new Error('設定なしで通った');
  }],
  ['**annotations が消えたら落ちる**', () => {
    const p = audit({ cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21 },
      null, { experiments: [] }, '2026-09-24');
    if (!p.length) throw new Error('annotations なしで通った');
  }],
  ['resolve_by が日付でなければ落ちる（書き間違いを通さない）', () => {
    const p = audit({
      cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21,
      known_unrecorded: [{ id: 'x', resolve_by: 'あとで' }],
    }, { annotations: [] }, { experiments: [] }, '2026-09-24');
    if (!p.some((x) => x.includes('resolve_by'))) throw new Error('壊れた期限が通った');
  }],
  ['**形は合っているが存在しない日を落とす**（2026-13-01 で鮮度ゲートが黙らないか）', () => {
    const p = audit(
      { cross_check_from: '2026-09-03', last_confirmed_complete: '2026-13-01', max_days_between_confirmations: 21 },
      { annotations: [] }, { experiments: [] }, '2026-09-24');
    if (!p.some((x) => x.includes('成立しない'))) throw new Error(`黙った: ${JSON.stringify(p)}`);
  }],
  ['**2026-09-24 に実際に起きた穴を落とす**（annotations にあり experiments に無い）', () => {
    const p = audit(
      { cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21 },
      { annotations: [{ type: 'pr', date: '2026-09-24', label: 'PR⑦ 対話メモ' }] },
      { experiments: [{ id: 'pr-2026-rsi-autopilot', status: 'evaluated', started_at: '2026-09-03' }] },
      '2026-09-24');
    if (!p.some((x) => x.includes('D+14 を拾わない'))) throw new Error(`落ちなかった: ${JSON.stringify(p)}`);
  }],
  ['両方にあれば通る', () => {
    const p = audit(
      { cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21 },
      { annotations: [{ type: 'pr', date: '2026-09-24', label: 'PR⑦' }] },
      { experiments: [{ id: 'pr-7', status: 'running', started_at: '2026-09-24' }] },
      '2026-09-24');
    if (p.length) throw new Error(`通らなかった: ${p[0]}`);
  }],
  ['**planned は「出た」と数えない**（予定日が入っていても配信ではない）', () => {
    const p = audit(
      { cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21 },
      { annotations: [{ type: 'pr', date: '2026-09-24', label: 'PR⑦' }] },
      { experiments: [{ id: 'pr-7', status: 'planned', started_at: '2026-09-24' }] },
      '2026-09-24');
    if (!p.some((x) => x.includes('D+14 を拾わない'))) throw new Error('planned が配信として通った');
  }],
  ['cross_check_from より前は対象外（PR①〜⑤ を遡って要求しない）', () => {
    const p = audit(
      { cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21 },
      { annotations: [{ type: 'pr', date: '2026-04-24', label: 'PR①' }] },
      { experiments: [] }, '2026-09-24');
    if (p.length) throw new Error(`古い配信で落ちた: ${p[0]}`);
  }],
  ['**park 済みは二重に鳴らさない**（期限は ③ が見る）', () => {
    const p = audit({
      cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21,
      known_unrecorded: [{ id: 'pr7', published_at: '2026-09-24', resolve_by: '2026-10-08' }],
    },
      { annotations: [{ type: 'pr', date: '2026-09-24', label: 'PR⑦' }] },
      { experiments: [] }, '2026-09-24');
    if (p.length) throw new Error(`park 済みで鳴った: ${p[0]}`);
  }],
  ['**park しても期限を過ぎれば鳴る**（無期限の棚上げにしない）', () => {
    const p = audit({
      cross_check_from: '2026-09-03', last_confirmed_complete: '2026-10-09', max_days_between_confirmations: 21,
      known_unrecorded: [{ id: 'pr7', published_at: '2026-09-24', resolve_by: '2026-10-08' }],
    },
      { annotations: [{ type: 'pr', date: '2026-09-24', label: 'PR⑦' }] },
      { experiments: [] }, '2026-10-09');
    if (!p.some((x) => x.includes('置き去り'))) throw new Error('期限切れの park が通った');
  }],
  ['**experiments が消えたら落ちる**', () => {
    const p = audit(
      { cross_check_from: '2026-09-03', last_confirmed_complete: '2026-09-24', max_days_between_confirmations: 21 },
      { annotations: [] }, null, '2026-09-24');
    if (!p.length) throw new Error('experiments なしで通った');
  }],
  ['件数と最終配信日を台帳から読む', () => {
    const s = ledgerState({ annotations: [
      { type: 'pr', date: '2026-04-24', label: 'PR①' },
      { type: 'pr', date: '2026-09-03', label: 'PR⑥' },
      { type: 'deploy', date: '2026-09-19', label: '無関係' },
    ] });
    if (s.n !== 2) throw new Error(`件数が違う: ${s.n}`);
    if (s.last_release !== '2026-09-03') throw new Error(`最終配信日が違う: ${s.last_release}`);
  }],
];

function runSelftest() {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed++; console.error(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  return failed;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(runSelftest() === 0 ? 0 : 1);

  const config = readJson(CONFIG_PATH);
  const annotations = readJson(ANNOTATIONS_PATH);
  const experiments = readJson(EXPERIMENTS_PATH);
  const today = todayJst();
  const problems = audit(config, annotations, experiments, today);
  const state = annotations ? ledgerState(annotations) : { n: null, last_release: null };

  // **件数は毎回出す。**--backtest の n をそのまま全件数と読ませないため。
  console.log(`台帳の PR 行: ${state.n ?? '読めない'} 件   最終配信 ${state.last_release ?? '不明'}`);
  console.log(`全件そろっていると人が最後に確かめた日: ${config?.last_confirmed_complete ?? '不明'}`);
  const pending = (config?.known_unrecorded || []).length;
  if (pending) {
    console.log(`**未記録として把握しているもの: ${pending} 件**（下記）`);
    for (const e of config.known_unrecorded) {
      console.log(`  - ${e.id}  ${e.published_at}  ${e.subject_hint ?? ''}  → 期限 ${e.resolve_by}`);
    }
    console.log('  **したがって --backtest の n は、出荷された全件ではない。**');
  }

  if (problems.length) {
    console.error('\nPR配信台帳: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(argv.includes('--check') ? 1 : 0);
  }
  console.log('\n台帳の確認は期限内。把握済みの未記録も期限内。');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
