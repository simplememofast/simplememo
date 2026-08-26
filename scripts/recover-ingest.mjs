#!/usr/bin/env node
/**
 * 取り込み経路の自動復旧 — 落ちたら止まる、をやめる。
 *
 *   node scripts/recover-ingest.mjs --probe            # 健康判定 → 必要なら復旧を実行
 *   node scripts/recover-ingest.mjs --classify "<エラー本文>"
 *   node scripts/recover-ingest.mjs --json
 *   node scripts/recover-ingest.mjs --check            # CI: 台帳の形・分類の網羅・自己検査
 *   node scripts/recover-ingest.mjs --selftest         # 検査そのものの自己検査（台帳を読まない）
 *
 * 【なぜ要るか】
 * `bq-preflight.mjs` は**壊れ方を6通りに分類できる**ところまで作ってある。
 * それでも台帳の ③「OAuth切れ・API障害時の自動復旧」は長らく `nobody` だった。
 * **検知はする。復旧は人**だったからで、実際その日の運転は
 * 「データが無い → 人が気づく → 人が直す」で止まっていた。
 *
 * ここが埋めるのはその一点だけ:
 *   分類はもうできている → **その分類ごとに、機械が取れる手を実際に取る。**
 *
 * 【機械が取れる手／取れない手を混ぜない】
 * いちばん大事なのはここ。**OAuthの再同意は人にしかできない。**
 * ブラウザ同意が要るものを「自動復旧しました」と書けば、それは嘘になる。
 * だからこの script が実行するのは次の4つに限る:
 *
 *   1. 再試行（指数バックオフ）      … 一過性の 5xx・タイムアウト・レート制限
 *   2. 退避（直近の good へ）        … 取り込めない日を「データ無し」にしない
 *   3. 劣化継続（保守回へ落とす）    … 古いデータで新規記事を書かせない
 *   4. 自動起票（アクション台帳へ）  … 人にしかできない手を、人の目に必ず載せる
 *
 * **1〜3は復旧、4は復旧ではない。** 台帳では別の列に入れる。
 * `human_action_required: true` の行が `recovered: true` になっていたら --check が落とす。
 * 人がやったことを機械の復旧率に混ぜないための歯止めで、ここを緩めると
 * 「自動復旧しています」が **人が直した回を数えた数字**になる。
 *
 * 【退避は黙ってやらない】
 * 退避したら `degraded` が立つ。施策の選定側（Runbook §1-2 / レーンF）は
 * これを見て**新規記事を書かない**。古いデータで書いた記事は、間違っていても
 * 出た瞬間には分からず、順位が付いてから分かる。**気づくのが遅い失敗のほうが高い。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/ingest-recovery.json');
const SNAPSHOT_DIR = path.join(ROOT, 'growth/data/gsc');

/** 退避データがこれより古かったら「新規記事を書いてよい鮮度」ではない。 */
export const MAX_FALLBACK_AGE_DAYS = 7;

/**
 * 壊れ方の登録簿。**bq-preflight.mjs が分類している6通りと同じ切り口**にしてある
 * （向こうが分類し、こちらが手を打つ。分類を2か所に持たない）。
 *
 *   machine … 機械が最後まで取れる手があるか
 *   plan    … 取る手（順に試す）
 */
export const FAILURES = {
  transient: {
    label: '一過性（5xx・タイムアウト・レート制限）',
    machine: true,
    plan: ['retry', 'fallback'],
    why: '同じ呼び出しがそのまま通ることがある。まず再試行する',
  },
  auth_expired: {
    label: '資格情報の失効・権限不足',
    machine: false,
    plan: ['fallback', 'degrade', 'file_request'],
    why: '**再同意も鍵の再発行も人にしかできない。**機械は退避して、人に上げるところまで',
  },
  config_missing: {
    label: 'データセット/テーブルが無い（設定誤りの可能性）',
    machine: false,
    plan: ['fallback', 'degrade', 'file_request'],
    why: '再試行しても直らない。設定の判断が要る',
  },
  stale_export: {
    label: 'エクスポートが止まっている（行はあるが古い）',
    machine: true,
    plan: ['fallback', 'degrade'],
    why: 'Google側の停止。こちらから直せないが、**古いことを明示して継続はできる**',
  },
  partial_days: {
    label: '一部の日だけ落ちている（欠測）',
    machine: true,
    plan: ['retry', 'note_gap'],
    why: 'Google の再送で埋まることが多い。埋まらない日は欠測として残す',
  },
  unknown: {
    label: '分類できない',
    machine: false,
    plan: ['fallback', 'degrade', 'file_request'],
    why: '**分からないものを一過性として再試行しない。**人に上げる',
  },
};

export const ACTIONS = {
  retry:        { recovery: true,  label: '再試行（指数バックオフ）' },
  fallback:     { recovery: true,  label: '退避（直近の good スナップショット）' },
  degrade:      { recovery: true,  label: '劣化継続（新規記事を止めて保守回へ）' },
  note_gap:     { recovery: true,  label: '欠測として記録' },
  file_request: { recovery: false, label: '自動起票（人にしかできない手）' },
};

/**
 * エラー本文を分類する。**分からないものを一過性に丸めない。**
 * ここで甘く分類すると、直らないものを3回叩いて同じ場所で止まる。
 */
export function classify(text) {
  const s = String(text ?? '').toLowerCase();
  if (!s.trim()) return 'unknown';
  if (/invalid_grant|token has been expired|revoked|unauthorized|401|permission denied|403|iam|access denied/.test(s)) return 'auth_expired';
  if (/not found: dataset|not found: table|404|does not exist|no such dataset/.test(s)) return 'config_missing';
  if (/rate limit|quota exceeded|429|timeout|etimedout|econnreset|socket hang up|5\d\d|backend error|internal error|unavailable/.test(s)) return 'transient';
  if (/stale|has not exported|no rows since|export stopped/.test(s)) return 'stale_export';
  if (/missing day|gap|failed to land|orphaned staging/.test(s)) return 'partial_days';
  return 'unknown';
}

/** 分類 → 実行する手の並び。 */
export function plan(cls) {
  const f = FAILURES[cls] ?? FAILURES.unknown;
  return f.plan;
}

/** 退避先を選ぶ。**未来ラベルと空スナップショットは選ばない。** */
export function pickFallback(today, { dir = SNAPSHOT_DIR, readdir = fs.readdirSync, exists = fs.existsSync } = {}) {
  let labels;
  try { labels = readdir(dir); } catch { return null; }
  const good = labels
    .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l))
    .filter((l) => l <= today)
    .filter((l) => exists(path.join(dir, l, 'meta.json')))
    .sort();
  if (!good.length) return null;
  const label = good[good.length - 1];
  const ageDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${label}T00:00:00Z`)) / 86400000);
  return { label, age_days: ageDays, stale: ageDays > MAX_FALLBACK_AGE_DAYS };
}

/**
 * 1件の障害に対して取る手を決める。**実行はしない**（決めることと動かすことを分ける）。
 * 戻り値の `recovered` は「機械の手だけで運転を続けられるか」。
 */
export function decide({ cls, today, fallback }) {
  const steps = plan(cls);
  const f = fallback ?? null;
  const used = [];
  for (const s of steps) {
    if (s === 'fallback' && !f) continue;         // 退避先が無いなら退避したことにしない
    if (s === 'degrade' && f && !f.stale) continue; // 鮮度が足りているなら止めない
    used.push(s);
  }
  const humanRequired = used.includes('file_request');
  // **人に上げただけの回を「復旧した」と書かない。**
  const recovered = !humanRequired && used.some((s) => ACTIONS[s]?.recovery);
  return {
    date_jst: today,
    failure_class: cls,
    actions: used,
    fallback: f,
    degraded: used.includes('degrade'),
    human_action_required: humanRequired,
    recovered,
  };
}

/** 再試行。**待ち時間は呼び出し側から差し替えられる**（テストで実時間を待たない）。 */
export async function retry(fn, { attempts = 3, baseMs = 1000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return { ok: true, value: await fn(i), attempts: i + 1 }; }
    catch (e) { last = e; if (i < attempts - 1) await sleep(baseMs * 2 ** i); }
  }
  return { ok: false, error: String(last), attempts };
}

export function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return { $comment: [], events: [] };
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

export function check(doc) {
  const problems = [];
  const events = doc.events ?? [];
  for (const [i, e] of events.entries()) {
    const at = `events[${i}] (${e.date_jst ?? '日付なし'})`;
    if (!FAILURES[e.failure_class]) problems.push(`${at}: 未登録の failure_class "${e.failure_class}"`);
    if (!Array.isArray(e.actions) || !e.actions.length) problems.push(`${at}: actions が空`);
    for (const a of e.actions ?? []) if (!ACTIONS[a]) problems.push(`${at}: 未登録の action "${a}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date_jst ?? '')) problems.push(`${at}: date_jst の形が違う`);
    // **これがこの検査の本体。**
    if (e.human_action_required && e.recovered) {
      problems.push(`${at}: 人の手が要る回を recovered: true にしている（機械の復旧率に人の仕事を混ぜている）`);
    }
    if (e.degraded && !e.actions?.includes('degrade')) problems.push(`${at}: degraded なのに degrade を取っていない`);
  }
  return problems;
}

/** 台帳を読まずに、判断そのものを検査する。 */
export function selftest() {
  const p = [];
  const eq = (got, want, msg) => { if (got !== want) p.push(`${msg}（got ${JSON.stringify(got)} / want ${JSON.stringify(want)}）`); };

  eq(classify('invalid_grant: Token has been expired or revoked.'), 'auth_expired', 'OAuth失効を分類できない');
  eq(classify('403 Permission denied on dataset'), 'auth_expired', '権限不足を分類できない');
  eq(classify('Not found: Dataset yurika:searchconsole'), 'config_missing', 'データセット欠落を分類できない');
  eq(classify('503 Backend Error'), 'transient', '一過性を分類できない');
  eq(classify('ETIMEDOUT'), 'transient', 'タイムアウトを分類できない');
  eq(classify('export stopped: no rows since 2026-08-10'), 'stale_export', '停止を分類できない');
  eq(classify('missing day 2026-08-14 failed to land'), 'partial_days', '欠測を分類できない');
  eq(classify(''), 'unknown', '空文字を unknown にしていない');
  eq(classify('なにかよく分からない失敗'), 'unknown', '未知を一過性に丸めている');

  // 人にしかできない手だけの回は「復旧した」にしない
  const auth = decide({ cls: 'auth_expired', today: '2026-08-26', fallback: { label: '2026-08-24', age_days: 2, stale: false } });
  eq(auth.human_action_required, true, '再同意を人に上げていない');
  eq(auth.recovered, false, '人が要る回を復旧扱いにしている');

  // 退避先が無いのに退避したことにしない
  const noFb = decide({ cls: 'transient', today: '2026-08-26', fallback: null });
  eq(noFb.actions.includes('fallback'), false, '退避先が無いのに退避している');

  // 鮮度が足りていれば止めない／古ければ止める
  const fresh = decide({ cls: 'stale_export', today: '2026-08-26', fallback: { label: '2026-08-24', age_days: 2, stale: false } });
  eq(fresh.degraded, false, '鮮度が足りているのに保守回へ落としている');
  const old = decide({ cls: 'stale_export', today: '2026-08-26', fallback: { label: '2026-08-09', age_days: 17, stale: true } });
  eq(old.degraded, true, '古い退避データで新規記事を書かせている');
  eq(old.recovered, true, '退避＋劣化継続を復旧に数えていない');

  // 退避先の選択: 未来ラベルとメタ無しは選ばない
  const fb = pickFallback('2026-08-26', {
    dir: '/x',
    readdir: () => ['2026-08-09', '2026-08-24', '2026-09-01', 'notes'],
    exists: (p) => !p.includes('2026-09-01'),
  });
  eq(fb?.label, '2026-08-24', '退避先の選択が違う');
  eq(fb?.stale, false, '2日前を古い扱いにしている');

  // check() が人の仕事の混入を落とすこと
  const bad = check({ events: [{ date_jst: '2026-08-26', failure_class: 'auth_expired', actions: ['file_request'], human_action_required: true, recovered: true }] });
  if (!bad.some((x) => x.includes('機械の復旧率に人の仕事を混ぜている'))) p.push('検査が人の仕事の混入を見逃す');

  return p;
}

/**
 * 実際に起きた障害を1行残す。**副作用があるのはここだけ。**
 * 判断（decide）と記録（append）を分けてあるので、判断は台帳を汚さずに試せる。
 */
export function append(doc, event) {
  const events = doc.events ?? [];
  // 同じ日・同じ壊れ方は1行にまとめる（再試行のたびに行が増えると、
  // 「何回落ちたか」ではなく「何回書いたか」を数えることになる）
  const i = events.findIndex((e) => e.date_jst === event.date_jst && e.failure_class === event.failure_class);
  if (i >= 0) { events[i] = { ...events[i], ...event, occurrences: (events[i].occurrences ?? 1) + 1 }; }
  else { events.push({ ...event, occurrences: 1 }); }
  return { ...doc, events };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST

  if (argv.includes('--selftest')) {
    const p = selftest();
    if (p.length) { console.error('自己検査で問題:'); for (const x of p) console.error(`  - ${x}`); process.exit(1); }
    console.log('recover-ingest: 自己検査に問題なし。');
    process.exit(0);
  }

  const ci = argv.indexOf('--classify');
  if (ci >= 0) {
    const cls = classify(argv[ci + 1]);
    const d = decide({ cls, today, fallback: pickFallback(today) });
    console.log(argv.includes('--json') ? JSON.stringify(d, null, 2)
      : `${cls} — ${FAILURES[cls].label}\n  取る手: ${d.actions.join(' → ') || '（無し）'}\n  復旧: ${d.recovered ? 'できる' : '**人が要る**'}`);
    process.exit(0);
  }

  const doc = loadLedger();

  const ri = argv.indexOf('--record');
  if (ri >= 0) {
    const cls = classify(argv[ri + 1]);
    const d = decide({ cls, today, fallback: pickFallback(today) });
    const ev = { ...d, error_excerpt: String(argv[ri + 1] ?? '').slice(0, 300), recorded_by: 'recover-ingest' };
    const next = append(doc, ev);
    fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(next, null, 2)}\n`);
    // ワークフローが後続ステップで読む。**degraded を無視して記事を書かせない。**
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT,
        `failure_class=${cls}\ndegraded=${d.degraded}\nrecovered=${d.recovered}\nhuman_action_required=${d.human_action_required}\nfallback_label=${d.fallback?.label ?? ''}\n`);
    }
    console.log(`記録: ${cls} — ${d.actions.join(' → ')}`);
    if (d.human_action_required) console.log('::warning::人にしかできない手が要る（再同意・鍵の再発行・設定判断）。アクション台帳へ上げること');
    process.exit(0);
  }

  if (argv.includes('--check')) {
    const p = [...selftest(), ...check(doc)];
    if (p.length) { console.error('取り込み復旧台帳に問題:'); for (const x of p) console.error(`  - ${x}`); process.exit(1); }
    console.log(`取り込み復旧: 記録 ${(doc.events ?? []).length} 件に問題なし。`);
    process.exit(0);
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ today, fallback: pickFallback(today), events: doc.events ?? [] }, null, 2));
    process.exit(0);
  }

  const fb = pickFallback(today);
  console.log(`取り込み経路の復旧（${today} JST）\n`);
  console.log(`  退避先: ${fb ? `${fb.label}（${fb.age_days}日前${fb.stale ? '・**古い**' : ''}）` : '**無し**'}`);
  console.log('');
  console.log('  壊れ方ごとに取る手:\n');
  for (const [k, v] of Object.entries(FAILURES)) {
    const d = decide({ cls: k, today, fallback: fb });
    console.log(`    ${k.padEnd(16)} ${d.recovered ? '機械で継続' : '**人が要る**'}  ${d.actions.join(' → ') || '（無し）'}`);
    console.log(`    ${''.padEnd(16)} ${v.why}`);
  }
  const ev = doc.events ?? [];
  console.log(`\n  記録 ${ev.length} 件`);
  for (const e of ev.slice(-5)) {
    console.log(`    ${e.date_jst}  ${e.failure_class.padEnd(14)} ${e.recovered ? '継続' : '人へ'}  ${e.actions.join(' → ')}`);
  }
  if (!ev.length) console.log('    **まだ1件も無い。**この経路が実際に発火した回はまだ記録されていない。');
}
