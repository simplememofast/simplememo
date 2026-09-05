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
// 【何を出すか】`--json` で、期限が来ていて**まだ転記されていない**ものだけ。
// 何も無ければ空配列。Routine 側は「空なら何もせず終わる」だけでよい。
//
//   node scripts/pr-evaluation-due.mjs            # 人が読む形
//   node scripts/pr-evaluation-due.mjs --json     # Routine が読む形
//   node scripts/pr-evaluation-due.mjs --selftest
//
// 【拾わないもの】
//   - `status` が running 以外（planned は配信前・evaluated は済み・cancelled は取り下げ）
//   - `evaluation_at` が未来、または読めない日付
//   - 転記先が**既に埋まっている**もの（1つでも値が入っていれば人が触っている）
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

/** 転記先が1つでも埋まっているか。**埋まっていれば人が触っているので拾わない。** */
export function isCaptured(post) {
  if (!post || typeof post !== 'object') return false;
  return POST_KEYS.some((k) => post[k] !== null && post[k] !== undefined);
}

/**
 * **純関数。**今日（JST）の時点で評価期限が来ていて、まだ転記されていない
 * `pr_release` を返す。**台帳を書き換えない** —— 書くのは取得できた側の仕事。
 */
export function due(rows, todayJst) {
  if (!Array.isArray(rows)) return [];
  if (!ISO_DATE.test(String(todayJst))) return [];
  return rows.filter((e) => {
    if (!e || typeof e !== 'object') return false;
    if (e.type !== 'pr_release') return false;
    if (e.status !== 'running') return false;
    const at = e.evaluation_at;
    // **読めない日付は拾わない。**拾うと、書き間違えた1行が毎日 Chrome を起こす。
    if (typeof at !== 'string' || !ISO_DATE.test(at)) return false;
    if (at > todayJst) return false;
    return !isCaptured(e.discover_boarding_post);
  }).map((e) => ({
    id: e.id,
    evaluation_at: e.evaluation_at,
    started_at: e.started_at ?? null,
    days_overdue: daysBetween(e.evaluation_at, todayJst),
    missing: POST_KEYS.filter((k) => (e.discover_boarding_post ?? {})[k] == null),
  }));
}

export function daysBetween(fromIso, toIso) {
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

  t('**1つでも転記済みなら拾わない**（人が触っている）',
    due(one({ discover_boarding_post: { ...base.discover_boarding_post, pv: 1234 } }), '2026-09-17').length === 0);
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
  const settled = pr6?.status !== 'running' || isCaptured(pr6?.discover_boarding_post);
  t(`実データ: 9/17 の門は ${settled ? '0件（転記済み）' : 'PR⑥ 1件（未転記）'}`,
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
    console.log(`    未転記: ${r.missing.join(' / ')}`);
  }
}
