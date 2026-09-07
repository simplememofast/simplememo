#!/usr/bin/env node
// ============================================
// 「いま評価期限が来ている PR 実験」を台帳から導出する
// ============================================
//
// 【なぜ要るか】2026-09-03、PR⑥ の D+14 判定（9/17）のために
// **その日だけ発火する Routine を人が1本置いた。**動きはするが、
// **7本目の配信でまた人が置くことになる。**台帳に行を足したら勝手に拾われる
// 形でなければ自律ではない —— これは日次アクチュエータ（autopilot-act）が
// 既に採っている形で、PR 実験にだけ無かった。
//
// 【なぜスクリプトにするか】判定条件を Routine のプロンプト（散文）に書くと、
//   - 版管理されない（誰がいつ変えたか残らない）
//   - テストできない（「期限が来ていないのに拾う」を落とせない）
//   - 実行系ごとに書き写される（ずれる）
// **台帳が正・導出は1か所**という、このリポジトリの他の判定と同じ扱いにする。
//
// 【何を出すか】`--json` で、期限が来ていて**評価が完了していない**ものだけ。
// 何も無ければ空配列。Routine 側は「空なら何もせず終わる」だけでよい。
//
//   node scripts/pr-evaluation-due.mjs            # 人が読む形
//   node scripts/pr-evaluation-due.mjs --json     # Routine が読む形
//   node scripts/pr-evaluation-due.mjs --selftest
//
// 【拾わないもの】
//   - `status` が running 以外（planned は配信前・evaluated は済み・cancelled は取り下げ）
//   - `evaluation_at` が未来、または読めない日付
// 部分転記や全項目取得済みでも running なら残す。取得と評価完了は別。
// 既存値は確認対象として返すだけで、このスクリプトは上書きしない。
//
// **「読めない日付」は拾わない側に倒す。**拾う側に倒すと、書き間違えた1行が
// 毎日 Chrome を起こして分析画面を開きに行く。逆に落とす側の誤りは
// 「期限の日に鳴らない」で、これは `--json` が空なのを見れば分かる。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'growth/experiments/experiments.json');

/** 転記先の、実際に値が入るキー（`$comment` と導出値 `boarded` を除く）。 */
export const POST_KEYS = [
  'google_referral_ratio', 'mobile_ratio', 'syndication_count', 'pv', 'day1_senders_vs_prev3avg',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const REQUIRED_POST_KEYS = POST_KEYS.filter(k => k !== 'day1_senders_vs_prev3avg');

export function validDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function validMetric(key, value) {
  if (!Number.isFinite(value) || value < 0) return false;
  if (key === 'pv' || key === 'syndication_count') return Number.isInteger(value);
  if (key === 'google_referral_ratio' || key === 'mobile_ratio') return value <= 1;
  return key === 'day1_senders_vs_prev3avg';
}

/** Values are not returned: private evidence, period and concurrent edits must be checked by the executor. */
export function captureState(post) {
  const existing = POST_KEYS.filter(k => post?.[k] != null);
  const invalid = existing.filter(k => !validMetric(k, post[k]));
  const missing = POST_KEYS.filter(k => post?.[k] == null);
  const requiredMissing = REQUIRED_POST_KEYS.filter(k => missing.includes(k));
  return {
    capture_state: invalid.length ? 'invalid' : !existing.length ? 'uncaptured'
      : requiredMissing.length ? 'partial' : 'ready_for_evaluation',
    existing_fields: existing, missing, required_missing: requiredMissing, invalid_fields: invalid,
    next_step: invalid.length ? 'review_existing_evidence' : !existing.length ? 'capture'
      : requiredMissing.length ? 'reconcile_then_capture_missing' : 'verify_evidence_then_evaluate',
  };
}

/** 転記先が1つでも埋まっているか。取得済み・評価済みの証明には使わない。 */
export function isCaptured(post) {
  if (!post || typeof post !== 'object') return false;
  return POST_KEYS.some((k) => post[k] !== null && post[k] !== undefined);
}

/**
 * **純関数。**今日（JST）の時点で評価期限が来ていて、まだ評価が完了していない
 * `pr_release` を返す。**台帳を書き換えない** —— 書くのは取得できた側の仕事。
 */
export function due(rows, todayJst) {
  if (!Array.isArray(rows)) return [];
  if (!validDate(todayJst)) return [];
  return rows.filter((e) => {
    if (!e || typeof e !== 'object') return false;
    if (e.type !== 'pr_release') return false;
    if (e.status !== 'running') return false;
    const at = e.evaluation_at;
    // **読めない日付は拾わない。**拾うと、書き間違えた1行が毎日 Chrome を起こす。
    if (!validDate(at)) return false;
    if (at > todayJst) return false;
    return true;
  }).map((e) => ({
    id: e.id,
    evaluation_at: e.evaluation_at,
    started_at: e.started_at ?? null,
    days_overdue: daysBetween(e.evaluation_at, todayJst),
    ...captureState(e.discover_boarding_post),
  }));
}

export function daysBetween(fromIso, toIso) {
  if (!validDate(fromIso) || !validDate(toIso)) return null;
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.floor((b - a) / 86400000);
}

export function todayJst(now = Date.now()) {
  return new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
}

function readRows() {
  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  return Array.isArray(doc) ? doc : (doc.experiments ?? []);
}

function selftest() {
  let ok = 0; let ng = 0;
  const t = (name, cond) => { if (cond) { ok += 1; console.log(`  ok   ${name}`); } else { ng += 1; console.error(`  NG   ${name}`); } };
  const base = {
    id: 'pr-x', type: 'pr_release', status: 'running', evaluation_at: '2026-09-17',
    discover_boarding_post: { $comment: 'x', pv: null, google_referral_ratio: null, mobile_ratio: null, syndication_count: null, day1_senders_vs_prev3avg: null, boarded: null },
  };
  const one = (over) => [{ ...base, ...over }];

  t('期限当日は拾う', due(one({}), '2026-09-17').length === 1);
  t('期限を過ぎていても拾う（見落としを消さない）', due(one({}), '2026-09-20').length === 1);
  t('**期限前は拾わない**', due(one({}), '2026-09-16').length === 0);
  t('遅れ日数を出す', due(one({}), '2026-09-20')[0].days_overdue === 3);

  t('planned は拾わない（配信前）', due(one({ status: 'planned' }), '2026-09-17').length === 0);
  t('evaluated は拾わない（済み）', due(one({ status: 'evaluated' }), '2026-09-17').length === 0);
  t('cancelled は拾わない', due(one({ status: 'cancelled' }), '2026-09-17').length === 0);
  t('pr_release 以外は拾わない', due(one({ type: 'title_test' }), '2026-09-17').length === 0);

  const partial = one({ discover_boarding_post: { ...base.discover_boarding_post, pv: 1234 } });
  const saved = JSON.stringify(partial);
  const pending = due(partial, '2026-09-17')[0];
  t('部分転記を翌日以降も失わない', pending?.capture_state === 'partial'
    && due(partial, '2026-09-18').length === 1);
  t('既存値を取得対象から外し照合へ回す', pending.next_step === 'reconcile_then_capture_missing'
    && !pending.missing.includes('pv') && pending.existing_fields.join() === 'pv');
  t('入力や既存値を書き換えない', JSON.stringify(partial) === saved);
  const complete = { pv: 0, syndication_count: 0, google_referral_ratio: 0, mobile_ratio: 0 };
  t('全値取得済みでもrunningなら評価を追跡する',
    due(one({ discover_boarding_post: complete }), '2026-09-17')[0]?.capture_state === 'ready_for_evaluation');
  t('送信者比率は任意、0は有効値', captureState(complete).required_missing.length === 0
    && captureState(complete).missing.join() === 'day1_senders_vs_prev3avg');
  t('取得済みの未来の評価を始めない', due(one({ discover_boarding_post: complete }), '2026-09-16').length === 0);
  t('全値取得済みevaluatedは追跡を終了',
    due(one({ status: 'evaluated', discover_boarding_post: complete }), '2026-09-17').length === 0);
  for (const [key, value] of [['pv', '12'], ['pv', -1], ['syndication_count', 1.5],
    ['mobile_ratio', 50], ['google_referral_ratio', Infinity], ['day1_senders_vs_prev3avg', -1]]) {
    const row = due(one({ discover_boarding_post: { ...complete, [key]: value } }), '2026-09-17')[0];
    t(`不正値 ${key}=${value} を成功にも欠測にも変えない`, row.capture_state === 'invalid'
      && row.invalid_fields.includes(key) && !row.missing.includes(key));
  }
  t('結果へ既存の分析値を複製しない', !Object.hasOwn(pending, 'pv'));
  for (const at of ['2026-02-29', '2026-09-31', '2026-00-01', '2026-13-01'])
    t(`実在しない日付 ${at} は拾わない`, due(one({ evaluation_at: at }), '2026-12-31').length === 0);
  t('うるう日は有効', validDate('2028-02-29'));
  t('存在しない今日を拒む', due(one({}), '2026-09-31').length === 0);
  t('JST境界の前後で評価対象が切り替わる',
    due(one({}), todayJst(Date.parse('2026-09-16T14:59:59Z'))).length === 0
    && due(one({}), todayJst(Date.parse('2026-09-16T15:00:00Z'))).length === 1);
  t('boarded だけ埋まっていても転記済みとは読まない（導出値なので）',
    due(one({ discover_boarding_post: { ...base.discover_boarding_post, boarded: true } }), '2026-09-17').length === 1);
  t('$comment だけの器は未転記', isCaptured({ $comment: 'x' }) === false);
  t('転記先そのものが無いものは未転記として拾う',
    due(one({ discover_boarding_post: undefined }), '2026-09-17').length === 1);

  t('**読めない日付は拾わない**（毎日 Chrome を起こさない）',
    due(one({ evaluation_at: '9/17' }), '2026-09-17').length === 0);
  t('日付が無いものも拾わない', due(one({ evaluation_at: null }), '2026-09-17').length === 0);
  t('今日が読めなければ何も拾わない', due(one({}), 'today').length === 0);
  t('台帳が配列でなければ空', due(null, '2026-09-17').length === 0);
  t('欠けているキーを列挙する', due(one({}), '2026-09-17')[0].missing.length === POST_KEYS.length);

  t('実データが読める', Array.isArray(readRows()) && readRows().length > 0);
  // **実データで「いま何も期限が来ていない」ことも固定する。**
  // 9/17 より前にこれが非空になったら、台帳側で日付か status が動いている。
  const PR6 = 'pr-2026-rsi-autopilot';
  const pr6 = readRows().find((e) => e.id === PR6);
  t('実データ: PR⑥ の行がある', Boolean(pr6));
  t('実データ: PR⑥ の評価日は 2026-09-17', pr6?.evaluation_at === '2026-09-17');
  t('実データ: PR⑥ の status は running か evaluated',
    ['running', 'evaluated'].includes(pr6?.status));
  t('実データ: 2026-09-16 時点では0件', due(readRows(), '2026-09-16').length === 0);
  const settled = pr6?.status !== 'running';
  t(`実データ: 9/17 の門は ${settled ? '0件（評価済み）' : 'PR⑥ 1件（評価未完了）'}`,
    settled
      ? due(readRows(), '2026-09-17').length === 0
      : due(readRows(), '2026-09-17').map((x) => x.id).join(',') === PR6);

  console.log(`\nselftest: ${ng ? `${ok + ng}件中 ${ng}件 失敗` : `全${ok}件 通過`}`);
  return ng ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const today = todayJst();
  const rows = due(readRows(), today);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }
  if (!rows.length) {
    console.log(`評価期限の来た PR 実験は無い（${today} JST 時点）。**何もしないのが正しい。**`);
    process.exit(0);
  }
  console.log(`評価期限の来た PR 実験: ${rows.length}件（${today} JST 時点）\n`);
  for (const r of rows) {
    console.log(`  ${r.id}  評価日 ${r.evaluation_at}（${r.days_overdue}日経過）`);
    console.log(`    状態: ${r.capture_state} / 次の処理: ${r.next_step}`);
    console.log(`    未転記: ${r.missing.join(' / ')} / 要照合: ${r.existing_fields.join(' / ')}`);
  }
}
