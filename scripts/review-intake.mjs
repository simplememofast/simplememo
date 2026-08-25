#!/usr/bin/env node
/**
 * App Store レビューを「受け取ったか」ではなく「**捌いたか**」で数える。
 *
 *   node scripts/review-intake.mjs            # 状況を出す
 *   node scripts/review-intake.mjs --check    # CI: 台帳の不整合と放置で exit 1
 *   node scripts/review-intake.mjs --selftest # 判定ロジックの自己検査
 *
 * 【なぜ要るか】ユーザーの声を受け取る経路は 2026-08-22 に機械化した
 * （../simplememo-ios/scripts/asc_metrics.rb）。**しかし取り込んだだけでは
 * 何も起きない。** growth/README.md の冒頭が記録している失敗と同じ構造で、
 * 「あとで見る」はファイルにならない限り誰も見ない。
 *
 * ここが持つのは1つだけ: **どのレビューを、どう処理したか。**
 * 処理していないレビューが max_unhandled_days を超えたら CI が落ちる。
 *
 * 【judged を必ず分ける】レビュー本体は別リポジトリ
 * （../simplememo-ios/data/appstore/asc-metrics.json）にあり、GitHub Actions の
 * このリポジトリのCIからは見えない。**見えないことを「未処理0件」にしない。**
 * 見えないときは judged=false を返し、台帳そのものの整合だけを検査する。
 *
 * これは check-monitoring / ops-alerts と同じ扱い方で、理由も同じ:
 * 「判定した結果0件」と「判定できなかった」を同じ0にすると、
 * **仕組みが死んでいる状態が正常に見える。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/review-intake.json');
export const BACKLOG_PATH = path.join(ROOT, 'data/feature-backlog.json');
/** レビュー本体。別リポジトリなので**在るとは限らない**。 */
export const METRICS_PATH = path.join(ROOT, '../simplememo-ios/data/appstore/asc-metrics.json');

/**
 * 処理のしかた。**「何もしない」を選べることが要点。**
 *
 * no_action を用意しないと、褒めるだけのレビューや同じ苦情の3件目が
 * 永久に未処理として残り、CIが鳴りっぱなしになる。鳴りっぱなしの警報は
 * 消される。ただし no_action には note を必須にする —
 * **「何もしないと決めた」と「見ていない」は違う。**
 */
export const KINDS = {
  backlog: { needs_ref: 'backlog', note_required: false },
  bug: { needs_ref: 'free', note_required: false },
  shipped: { needs_ref: 'free', note_required: false },
  duplicate: { needs_ref: 'review', note_required: false },
  no_action: { needs_ref: null, note_required: true },
};

const DAY = 86_400_000;

/**
 * 台帳そのものの整合。**レビュー本体が無くても実行できる部分。**
 *
 * @param {object} ledger
 * @param {Set<string>} backlogIds  feature-backlog.json の候補ID
 */
export function validateLedger(ledger, backlogIds) {
  const problems = [];
  if (!ledger || !Array.isArray(ledger.dispositions)) return ['dispositions must be an array'];
  if (!Number.isInteger(ledger.max_unhandled_days) || ledger.max_unhandled_days < 1) {
    problems.push('max_unhandled_days must be a positive integer — 放置の上限を決めていない台帳は放置を検知できない');
  }
  const seen = new Set();
  for (const [i, d] of ledger.dispositions.entries()) {
    const at = `dispositions[${i}]${d.review_id ? ` (${d.review_id})` : ''}`;
    if (!d.review_id) { problems.push(`${at}: review_id is required`); continue; }
    if (seen.has(d.review_id)) problems.push(`${at}: 同じレビューを2回処理している`);
    seen.add(d.review_id);

    const spec = KINDS[d.kind];
    if (!spec) { problems.push(`${at}: kind must be one of ${Object.keys(KINDS).join('|')} (got ${JSON.stringify(d.kind)})`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.decided_at || '')) problems.push(`${at}: decided_at must be YYYY-MM-DD`);
    if (spec.note_required && !d.note) {
      problems.push(`${at}: kind=${d.kind} には note が要る — 「何もしないと決めた」と「見ていない」は違う`);
    }
    if (spec.needs_ref && !d.ref) problems.push(`${at}: kind=${d.kind} には ref が要る`);
    if (spec.needs_ref === 'backlog' && d.ref && !backlogIds.has(d.ref)) {
      problems.push(`${at}: ref "${d.ref}" が feature-backlog.json に無い — 指せない参照は無いのと同じ`);
    }
    if (spec.needs_ref === 'review' && d.ref && !ledger.dispositions.some((o) => o.review_id === d.ref)) {
      problems.push(`${at}: duplicate の ref "${d.ref}" がこの台帳に無い`);
    }
    if (spec.needs_ref === 'review' && d.ref === d.review_id) {
      problems.push(`${at}: duplicate が自分自身を指している`);
    }
  }
  return problems;
}

/**
 * 未処理のレビューを数える。
 *
 * @returns {{judged: boolean, reason?: string, unhandled: object[], overdue: object[], handled: number}}
 */
export function assess(ledger, metrics, { now = Date.now() } = {}) {
  const base = { unhandled: [], overdue: [], handled: 0 };
  if (!metrics) {
    return { judged: false, reason: 'asc-metrics.json が読めない（別リポジトリなのでCIからは見えないことがある）', ...base };
  }
  const r = metrics.reviews;
  if (!r || r.ok !== true) {
    // 取得に失敗している。**0件と読まない。**
    return { judged: false, reason: `レビューの取得が失敗している（${r?.error ?? 'reviews フィールドが無い'}）`, ...base };
  }
  const decided = new Set(ledger.dispositions.map((d) => d.review_id));
  const rows = r.rows || [];
  const unhandled = rows.filter((x) => !decided.has(x.id));
  const limit = ledger.max_unhandled_days * DAY;
  const overdue = unhandled.filter((x) => {
    const t = Date.parse(x.created);
    // 日付が読めないものを「期限内」に倒さない。読めない＝判定できないので overdue 側に出す。
    return Number.isNaN(t) ? true : now - t > limit;
  });
  return { judged: true, unhandled, overdue, handled: rows.length - unhandled.length, total: rows.length };
}

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function render(ledger, a) {
  const o = ['App Store レビューの処理状況', ''];
  if (!a.judged) {
    o.push(`  判定できていない — ${a.reason}`);
    o.push('  **これは「未処理0件」ではない。**台帳の整合だけを検査した。');
  } else {
    o.push(`  レビュー ${a.total}件 中 ${a.handled}件を処理済み・${a.unhandled.length}件が未処理`);
    if (a.overdue.length) {
      o.push(`  うち ${a.overdue.length}件 が ${ledger.max_unhandled_days}日を超えて放置:`);
      for (const x of a.overdue.slice(0, 10)) {
        o.push(`    ★${x.rating} ${x.created?.slice(0, 10) ?? '(日付不明)'} ${(x.title || '').slice(0, 40)}`);
      }
    } else if (a.unhandled.length) {
      o.push(`  期限内（${ledger.max_unhandled_days}日以内）`);
    }
  }
  const byKind = {};
  for (const d of ledger.dispositions) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  const kinds = Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(' / ');
  o.push('', `  台帳: ${ledger.dispositions.length}件${kinds ? `（${kinds}）` : ''}`);
  return o.join('\n');
}

function selftest() {
  let total = 0; const fails = [];
  const t = (name, cond) => { total += 1; if (!cond) fails.push(name); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };
  const ids = new Set(['voice_vad']);
  const base = { max_unhandled_days: 14, dispositions: [] };

  t('空の台帳は問題なし', validateLedger(base, ids).length === 0);
  t('max_unhandled_days が無いと落ちる',
    validateLedger({ dispositions: [] }, ids).some((p) => p.includes('max_unhandled_days')));
  t('未知の kind は落ちる',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'whatever', decided_at: '2026-08-22' }] }, ids)
      .some((p) => p.includes('kind must be')));
  t('no_action に note が無いと落ちる',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'no_action', decided_at: '2026-08-22' }] }, ids)
      .some((p) => p.includes('note')));
  t('no_action は note があれば通る',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'no_action', decided_at: '2026-08-22', note: '称賛のみ' }] }, ids).length === 0);
  t('backlog の ref が存在しないと落ちる',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'backlog', ref: 'nope', decided_at: '2026-08-22' }] }, ids)
      .some((p) => p.includes('feature-backlog')));
  t('backlog の ref が存在すれば通る',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'backlog', ref: 'voice_vad', decided_at: '2026-08-22' }] }, ids).length === 0);
  t('同じレビューを2回処理すると落ちる',
    validateLedger({ ...base, dispositions: [
      { review_id: 'a', kind: 'no_action', decided_at: '2026-08-22', note: 'x' },
      { review_id: 'a', kind: 'no_action', decided_at: '2026-08-22', note: 'y' },
    ] }, ids).some((p) => p.includes('2回')));
  t('duplicate が自分自身を指すと落ちる',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'duplicate', ref: 'a', decided_at: '2026-08-22' }] }, ids)
      .some((p) => p.includes('自分自身')));
  t('日付の書式が違うと落ちる',
    validateLedger({ ...base, dispositions: [{ review_id: 'a', kind: 'no_action', decided_at: '8/22', note: 'x' }] }, ids)
      .some((p) => p.includes('decided_at')));

  // ここが本題 — 判定できないことを 0件と言わない
  t('metrics が無いと judged=false', assess(base, null).judged === false);
  t('取得失敗（ok:false）も judged=false', assess(base, { reviews: { ok: false, error: 'HTTP 500' } }).judged === false);
  t('judged=false のとき未処理は0と主張しない', assess(base, null).unhandled.length === 0 && assess(base, null).judged === false);

  const now = Date.parse('2026-08-22T00:00:00Z');
  const metrics = { reviews: { ok: true, rows: [
    { id: 'r1', rating: 5, created: '2026-08-21T00:00:00Z', title: '新しい' },
    { id: 'r2', rating: 2, created: '2026-07-01T00:00:00Z', title: '古い' },
  ] } };
  const a1 = assess(base, metrics, { now });
  t('取得できて0件処理なら未処理2件', a1.judged && a1.unhandled.length === 2);
  t('14日を超えた1件だけが overdue', a1.overdue.length === 1 && a1.overdue[0].id === 'r2');
  const a2 = assess({ ...base, dispositions: [{ review_id: 'r2', kind: 'no_action', decided_at: '2026-08-22', note: 'x' }] }, metrics, { now });
  t('処理済みは未処理から外れる', a2.unhandled.length === 1 && a2.overdue.length === 0 && a2.handled === 1);
  const a3 = assess(base, { reviews: { ok: true, rows: [{ id: 'x', created: 'not-a-date' }] } }, { now });
  t('日付が読めないものは期限内に倒さず overdue に出す', a3.overdue.length === 1);
  const a4 = assess(base, { reviews: { ok: true, rows: [] } }, { now });
  t('取得できて本当に0件なら judged=true・未処理0', a4.judged && a4.unhandled.length === 0);

  console.log(fails.length ? `\nselftest: ${total}件中 ${fails.length}件 失敗 — ${fails.join(' / ')}` : `\nselftest: 全${total}件 通過`);
  return fails.length ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const ledger = readJSON(LEDGER_PATH);
  if (!ledger) { console.error(`${LEDGER_PATH} が読めない`); process.exit(1); }
  const backlog = readJSON(BACKLOG_PATH);
  const backlogIds = new Set((backlog?.candidates || []).map((c) => c.id));
  const metrics = readJSON(METRICS_PATH);
  const a = assess(ledger, metrics);
  const problems = validateLedger(ledger, backlogIds);

  console.log(render(ledger, a));
  if (problems.length) {
    console.error('\n台帳の不整合:');
    for (const p of problems) console.error(`  - ${p}`);
  }
  if (process.argv.includes('--check')) {
    if (problems.length) process.exit(1);
    if (a.judged && a.overdue.length) {
      console.error(`\n${a.overdue.length}件のレビューが ${ledger.max_unhandled_days}日を超えて未処理。`);
      console.error('処理するか、no_action として理由を書くこと（**放置は選択肢に入っていない**）。');
      process.exit(1);
    }
    console.log(a.judged ? '\n放置なし。' : '\n台帳の整合に問題なし（未処理件数は判定していない）。');
  }
}
