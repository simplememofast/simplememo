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
//   5. `resolved_unrecorded`（解決済みの履歴）の項目が、experiments.json の
//      配信済み pr_release（running/evaluated・同じ配信日）を指していない
//
// 5 は 2026-11-04 に足した。PR⑦ を measurement_failed の評価済みレコードとして
// experiments.json へ入れ、`known_unrecorded` から `resolved_unrecorded` へ移した
// （延長・限定例外の履歴は消さずに残す）。**「解決済み」へ移すだけで未記録を隠せる**
// 形にしないため、移した先のレコードが実在することを毎回確かめる。
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
import { createHash } from 'node:crypto';
import { todayJst } from './lib/jst.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT, 'data/pr-release-ledger.json');
export const ANNOTATIONS_PATH = path.join(ROOT, 'growth/data/annotations.json');
export const EXPERIMENTS_PATH = path.join(ROOT, 'growth/experiments/experiments.json');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Owner-authorized on 2026-10-23 for Web PR #2139 only. This does not
// evaluate PR⑦, extend its deadline, or assert any historical gate passed.
// Since 2026-11-04 the live entry is in `resolved_unrecorded` (closed as
// measurement_failed in experiments.json), so this never matches the live
// ledger; the publication test keeps exercising it on a frozen fixture.
const PR7 = Object.freeze({
  id: 'pr7-dialogue-memo',
  published_at: '2026-09-24',
  url: 'https://prtimes.jp/main/html/rd/p/000000011.000182412.html',
  resolve_by: '2026-10-22',
});
// Pin the entire existing annotation, including its unresolved-evidence note.
const PR7_ANNOTATION_SHA256 = '371d75022c4cd07972bc8861223509f0f8610c4b579147021a4a93ed2a50484e';
const REPOSITORY = 'simplememofast/simplememo';
const HEAD_BRANCH = 'codex/web-ci-security-local-20261022';

export function isPr2139Publication({ repository, eventName, event, ref, sha, associatedPullRequests = [] } = {}) {
  if (repository !== REPOSITORY || event?.repository?.full_name !== REPOSITORY) return false;
  const matches = pr => pr?.number === 2139 && pr.base?.ref === 'main'
    && pr.base?.repo?.full_name === REPOSITORY && pr.head?.repo?.full_name === REPOSITORY
    && pr.head?.ref === HEAD_BRANCH;
  if (eventName === 'pull_request') {
    return ref === 'refs/pull/2139/merge' && event.number === 2139 && matches(event.pull_request);
  }
  // Only the exact normal merge's main push, not future main commits or PRs.
  // The workflow supplies GitHub's read-only associated-PR response, not a
  // commit-message guess or a user-provided exception flag.
  return eventName === 'push' && ref === 'refs/heads/main' && event.ref === ref
    && event.deleted === false && /^[0-9a-f]{40}$/.test(sha ?? '') && event.after === sha
    && Array.isArray(associatedPullRequests)
    && associatedPullRequests.some(pr => matches(pr) && Number.isFinite(Date.parse(pr.merged_at))
      && pr.merge_commit_sha === sha);
}

function isPr7Annotation(a) {
  return createHash('sha256').update(JSON.stringify(a)).digest('hex') === PR7_ANNOTATION_SHA256;
}

export function pr7PublicationException(config, annotations, today, publication = {}) {
  if (!isPr2139Publication(publication) || today < '2026-10-23') return null;
  const entries = (config.known_unrecorded || []).filter(e => e?.id === PR7.id);
  if (entries.length !== 1) return null;
  const entry = entries[0];
  if (!Object.entries(PR7).every(([k, v]) => entry[k] === v)) return null;
  const approval = entry.owner_approved_web_publication_exception;
  if (approval?.approved_by !== 'repository_owner' || approval.approved_on !== '2026-10-23'
      || approval.pull_request !== 2139 || approval.scope !== 'web-publication-only'
      || approval.historical_evaluation !== 'unverified') return null;
  const matched = (annotations.annotations || []).filter(isPr7Annotation);
  return matched.length === 1 ? entry : null;
}

/** JST の今日（台帳の日付は全部 JST 基準）。 */
export { todayJst };

export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** 形だけでなく暦として成立する日付か（`2026-02-30` を通さない）。 */
function calendarDate(value) {
  if (!ISO_DATE.test(String(value))) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
}

function experimentRows(experiments) {
  const rows = experiments?.experiments ?? experiments ?? [];
  return Array.isArray(rows) ? rows : Object.values(rows);
}

/** experiments から、実際に配信された（planned でない）PR 実験の配信日を集める。 */
export function shippedExperimentDates(experiments) {
  const list = experimentRows(experiments);
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
export function audit(config, annotations, experiments, today = todayJst(), publication = {}) {
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

  const exception = pr7PublicationException(config, annotations, today, publication);
  // ① 2つの台帳の食い違い —— これが 2026-09-24 に実際に起きた穴
  const from = config.cross_check_from;
  if (ISO_DATE.test(String(from))) {
    const shipped = shippedExperimentDates(experiments);
    const parked = new Set(
      (config.known_unrecorded || []).filter(e => e !== exception).map((e) => e?.published_at).filter(Boolean),
    );
    for (const a of annotations.annotations || []) {
      if (a.type !== 'pr' || !ISO_DATE.test(String(a.date)) || a.date < from) continue;
      if (shipped.has(a.date)) continue;
      if (exception && isPr7Annotation(a)) continue;
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
    if (by < today && entry !== exception) {
      problems.push(
        `known_unrecorded「${entry.id}」（${entry.published_at} 配信）が期限 ${by} を過ぎている — ` +
        `**未記録のまま置き去りになっている。**台帳へ転記するか、期限を延ばす理由を書く。`,
      );
    }
  }

  problems.push(...resolvedProblems(config, experiments));
  return problems;
}

/**
 * ⑤ 解決済みの履歴（`resolved_unrecorded`）が、本当に experiments.json に載っているか。
 *
 * **移しただけで黙る形にしない。**実験行を消す・別の配信日を指す・planned のままにする、
 * のどれでも落とす。履歴そのもの（延長の経緯・限定例外の記録）はここでは書き換えない。
 */
export function resolvedProblems(config, experiments) {
  const resolved = config.resolved_unrecorded;
  if (resolved === undefined) return [];
  if (!Array.isArray(resolved)) return ['resolved_unrecorded が配列ではない — 解決済みの履歴を読めない状態で通さない'];
  const problems = [];
  const rows = experimentRows(experiments);
  const parked = new Set((config.known_unrecorded || []).map((e) => e?.id));
  const seen = new Set();
  for (const entry of resolved) {
    const id = entry?.id;
    if (typeof id !== 'string' || !id.trim()) {
      problems.push('resolved_unrecorded に id の無い項目がある');
      continue;
    }
    if (seen.has(id)) problems.push(`resolved_unrecorded「${id}」が重複している`);
    seen.add(id);
    if (parked.has(id)) {
      problems.push(`「${id}」が known_unrecorded と resolved_unrecorded の両方にある — 未記録か解決済みか、どちらか一方にする`);
    }
    if (!calendarDate(entry.resolved_on)) {
      problems.push(`resolved_unrecorded「${id}」の resolved_on が日付ではない（${JSON.stringify(entry.resolved_on)}）`);
    }
    const target = rows.filter((r) => r && r.id === entry.experiment_id);
    const exp = target.length === 1 ? target[0] : null;
    if (!exp || exp.type !== 'pr_release' || !['running', 'evaluated'].includes(exp.status)
        || !ISO_DATE.test(String(entry.published_at)) || exp.started_at !== entry.published_at) {
      problems.push(
        `resolved_unrecorded「${id}」が experiments.json の配信済み pr_release を指していない ` +
        `（experiment_id ${JSON.stringify(entry.experiment_id)}・配信日 ${JSON.stringify(entry.published_at)}）— ` +
        `**解決済みへ移しただけでは、D+14 を拾う台帳に載ったことにならない。**`,
      );
    }
  }
  return problems;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// ⑤ の合成データ。期限 2026-11-11 を過ぎた日でも、解決済みなら鳴らないことを見る。
const resolvedConfig = (over = {}) => ({
  cross_check_from: '2026-09-03', last_confirmed_complete: '2026-11-04', max_days_between_confirmations: 21,
  known_unrecorded: [],
  resolved_unrecorded: [{ id: 'pr7', experiment_id: 'pr7-exp', published_at: '2026-09-24',
    resolve_by: '2026-11-11', resolved_on: '2026-11-04' }],
  ...over,
});
const pr7Row = () => ({ annotations: [{ type: 'pr', date: '2026-09-24', label: 'PR⑦' }] });
const shippedPr7 = (over = {}) => ({ experiments: [{ id: 'pr7-exp', type: 'pr_release', status: 'evaluated',
  decision: 'measurement_failed', started_at: '2026-09-24', ...over }] });

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
  // ── ⑤ 解決済みの履歴（2026-11-04・PR⑦ を measurement_failed で閉じたときに追加）──
  ['**解決済みへ移した配信は、実験行があれば通る**（期限・延長の履歴は残したまま）', () => {
    const p = audit(resolvedConfig(), pr7Row(), shippedPr7(), '2026-11-26');
    if (p.some((x) => !x.includes('全件確認'))) throw new Error(`通らなかった: ${p.join(' / ')}`);
    if (audit(resolvedConfig({ last_confirmed_complete: '2026-11-20' }), pr7Row(), shippedPr7(), '2026-11-26').length) {
      throw new Error('解決済みの古い resolve_by で鳴った');
    }
  }],
  ['**解決済みへ移しても、実験行が無ければ落ちる**（移すだけで未記録を隠せない）', () => {
    const p = audit(resolvedConfig(), pr7Row(), { experiments: [] }, '2026-11-12');
    if (!p.some((x) => x.includes('配信済み pr_release を指していない'))) throw new Error(`黙った: ${JSON.stringify(p)}`);
    if (!p.some((x) => x.includes('D+14 を拾わない'))) throw new Error('突き合わせ①も鳴るべき');
  }],
  ...[
    ['planned のまま', { status: 'planned' }],
    ['配信日が違う', { started_at: '2026-09-25' }],
    ['pr_release でない', { type: 'title_test' }],
    ['id が違う', { id: 'other-experiment' }],
  ].map(([name, over]) => [`解決済みの指す実験が${name}なら落ちる`, () => {
    const p = audit(resolvedConfig(), pr7Row(), shippedPr7(over), '2026-11-12');
    if (!p.some((x) => x.includes('配信済み pr_release を指していない'))) throw new Error(`黙った: ${JSON.stringify(p)}`);
  }]),
  ['同じ実験IDが2行あれば落ちる（どちらを指すか決められない）', () => {
    const e = shippedPr7();
    e.experiments.push({ ...e.experiments[0] });
    const p = audit(resolvedConfig(), pr7Row(), e, '2026-11-12');
    if (!p.some((x) => x.includes('配信済み pr_release を指していない'))) throw new Error(`黙った: ${JSON.stringify(p)}`);
  }],
  ...['2026-02-30', '2026-13-01', 'あとで', undefined].map((resolvedOn) => [
    `resolved_on が暦の日付でなければ落ちる（${resolvedOn}）`, () => {
      const c = resolvedConfig();
      c.resolved_unrecorded[0].resolved_on = resolvedOn;
      const p = audit(c, pr7Row(), shippedPr7(), '2026-11-12');
      if (!p.some((x) => x.includes('resolved_on'))) throw new Error(`黙った: ${JSON.stringify(p)}`);
    }]),
  ['**未記録と解決済みの両方にあれば落ちる**（どちらの状態か曖昧にしない）', () => {
    const c = resolvedConfig();
    c.known_unrecorded = [{ ...c.resolved_unrecorded[0] }];
    const p = audit(c, pr7Row(), shippedPr7(), '2026-11-05');
    if (!p.some((x) => x.includes('両方にある'))) throw new Error(`黙った: ${JSON.stringify(p)}`);
  }],
  ['解決済みの重複・id 欠落・配列でない形を落とす', () => {
    const dup = resolvedConfig();
    dup.resolved_unrecorded.push({ ...dup.resolved_unrecorded[0] });
    if (!audit(dup, pr7Row(), shippedPr7(), '2026-11-12').some((x) => x.includes('重複'))) throw new Error('重複が通った');
    const noId = resolvedConfig();
    delete noId.resolved_unrecorded[0].id;
    if (!audit(noId, pr7Row(), shippedPr7(), '2026-11-12').some((x) => x.includes('id の無い'))) throw new Error('id 欠落が通った');
    if (!audit(resolvedConfig({ resolved_unrecorded: {} }), pr7Row(), shippedPr7(), '2026-11-12')
      .some((x) => x.includes('配列ではない'))) throw new Error('配列でない形が通った');
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

export function runSelftest() {
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

export function checkPublication(publication = {}) {
  const config = readJson(CONFIG_PATH);
  const annotations = readJson(ANNOTATIONS_PATH);
  const experiments = readJson(EXPERIMENTS_PATH);
  const today = todayJst();
  const problems = audit(config, annotations, experiments, today, publication);
  const exception = config && annotations && pr7PublicationException(config, annotations, today, publication);
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
  const resolved = Array.isArray(config?.resolved_unrecorded) ? config.resolved_unrecorded : [];
  if (resolved.length) {
    console.log(`解決済みの履歴: ${resolved.length} 件（延長・限定例外の記録は残してある）`);
    for (const e of resolved) {
      console.log(`  - ${e.id}  ${e.published_at}  → ${e.resolved_on} に experiments.json「${e.experiment_id}」へ`);
    }
  }

  if (problems.length) {
    console.error('\nPR配信台帳: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  if (exception) {
    console.log('\nオーナー承認の Web PR #2139 限定例外: pr7-dialogue-memo の未記録・期限超過を出荷阻害にしない。');
    console.log('未記録と期限超過は存続。歴史的評価・D-SCORE・ゲート合否は未確認のまま。その他の台帳検査は適用済み。');
  } else {
    console.log('\n台帳の確認は期限内。把握済みの未記録も期限内。');
  }
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(runSelftest() === 0 ? 0 : 1);
  const result = checkPublication();
  process.exit(argv.includes('--check') ? result : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
