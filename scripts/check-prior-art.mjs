#!/usr/bin/env node
/**
 * **先行例の台帳（data/prior-art.json）が、配信前に古くなっていないか。**
 *
 *   node scripts/check-prior-art.mjs            # 表示
 *   node scripts/check-prior-art.mjs --check    # CI
 *   node scripts/check-prior-art.mjs --selftest
 *
 * 【なぜ要るか — 2026-09-02 に踏んだ】
 * 配信前日に持ち込まれた「2026年の先行例」14件を一次ソースに当てたら、5件が食い違った
 * （Warp「週300PR超」は根拠なし、GrowthLoop「15%」は出典なし、Fluent／Autensa／APDL は
 * 個人・小規模OSS）。既存の competitors-…-2026-08.md は「配信2営業日前に引き直す」と散文で
 * 書いていたが、**いつ確かめたかを機械が読めず、期限も誰も見ていなかった。**
 *
 * 【見ること】
 *   1. 値域（verdict / grade）と必須欄。一次URLの無い行、確認日の無い行は落ちる
 *   2. **鮮度**: policy.covers_clusters の配信（data/distribution-queue.json）が
 *      今日から policy.business_days_before_release 営業日以内にあるとき、
 *      全行の checked_at が policy.max_age_days 日以内であること
 *   3. prior_art_search が「無い」と書いていないこと（not_found は「見つからない」まで）
 *
 * 【見ないこと】各社の主張が今も正しいかは、この検査では分からない（ネットを読まない）。
 * 落とすのは「確かめた日付が古い」だけで、確かめ直すのは人か毎朝のセッション。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { readLedger } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/prior-art.json');
export const QUEUE_PATH = path.join(ROOT, 'data/distribution-queue.json');
export const VERDICTS = new Set(['verified', 'partial', 'not_found', 'contradicted']);
export const GRADES = new Set(['A', 'B', 'C', 'D']);

/** 営業日（月〜金）で n 日先。祝日は見ない（保守的に平日だけを数えるので、祝日を挟むぶん早めに落ちる）。 */
export function addBusinessDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.floor((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** 配信の予定日のうち、今日から n 営業日以内のもの。 */
export function upcomingReleases(queueDoc, { today, clusters, businessDays }) {
  const items = Array.isArray(queueDoc) ? queueDoc : (queueDoc?.queue ?? queueDoc?.items ?? []);
  const horizon = addBusinessDays(today, businessDays);
  return items.filter((q) => q && clusters.includes(q.cluster) && typeof q.date_jst === 'string'
    && q.date_jst >= today && q.date_jst <= horizon);
}

export function validate(doc, { today = new Date().toISOString().slice(0, 10), queueDoc = null } = {}) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['台帳が object でない'];
  const p = doc.policy;
  if (!p || typeof p.max_age_days !== 'number' || typeof p.business_days_before_release !== 'number' || !Array.isArray(p.covers_clusters)) {
    problems.push('policy（max_age_days / business_days_before_release / covers_clusters）が無い — 期限の無い台帳は誰も見ない');
  }
  const entries = doc.entries;
  if (!Array.isArray(entries) || entries.length === 0) { problems.push('entries が空'); return problems; }
  const ids = new Set();
  entries.forEach((e, i) => {
    const at = `entries[${i}] ${e?.id ?? '(id無し)'}`;
    if (!e || typeof e !== 'object') { problems.push(`${at}: object でない`); return; }
    if (!e.id) problems.push(`${at}: id が無い`);
    if (ids.has(e.id)) problems.push(`${at}: id が重複`);
    ids.add(e.id);
    for (const k of ['name', 'claimed', 'they_say', 'scope']) if (!e[k]) problems.push(`${at}: ${k} が無い`);
    if (!VERDICTS.has(e.verdict)) problems.push(`${at}: verdict "${e.verdict}" は ${[...VERDICTS].join('|')} のどれでもない`);
    if (!GRADES.has(e.grade)) problems.push(`${at}: grade "${e.grade}" は A|B|C|D のどれでもない`);
    if (typeof e.primary_url !== 'string' || !/^https?:\/\//.test(e.primary_url)) problems.push(`${at}: primary_url が無い — 一次ソースの無い先行例は原稿に使えない`);
    if (typeof e.checked_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.checked_at)) problems.push(`${at}: checked_at が YYYY-MM-DD でない`);
    if ((e.verdict === 'partial' || e.verdict === 'contradicted' || e.verdict === 'not_found') && !e.discrepancy) {
      problems.push(`${at}: verdict=${e.verdict} なのに discrepancy が無い — 何が違ったかを書かない判定は次の人が再現できない`);
    }
    if (e.grade === 'A' && !e.fetched_html_sha) problems.push(`${at}: grade A（一次HTMLを取得）なら fetched_html_sha が要る`);
  });
  const s = doc.prior_art_search;
  if (!s || !s.searched_at || !s.result) problems.push('prior_art_search（探索の記録）が無い');
  else if (/無い|存在しない|世界初|唯一/.test(String(s.result))) {
    problems.push('prior_art_search.result が「無い」側の断定になっている — 見つからないことは無いことの証明ではない');
  }
  // 鮮度: 配信が近いなら全行が新しいこと
  if (p && queueDoc) {
    const up = upcomingReleases(queueDoc, { today, clusters: p.covers_clusters, businessDays: p.business_days_before_release });
    if (up.length) {
      for (const e of entries) {
        if (!e?.checked_at) continue;
        const age = daysBetween(e.checked_at, today);
        if (age > p.max_age_days) {
          problems.push(`${e.id}: checked_at ${e.checked_at} が ${age} 日前 — 配信 ${up.map((q) => `${q.id}(${q.date_jst})`).join(', ')} が`
            + ` ${p.business_days_before_release} 営業日以内にあるので、全件を ${p.max_age_days} 日以内に確かめ直す`);
        }
      }
    }
  }
  return problems;
}

export function render(doc, { today, queueDoc } = {}) {
  const o = [];
  const p = doc.policy ?? {};
  const up = queueDoc && p.covers_clusters ? upcomingReleases(queueDoc, { today, clusters: p.covers_clusters, businessDays: p.business_days_before_release ?? 2 }) : [];
  o.push(`先行例の台帳 — ${doc.entries?.length ?? 0} 件（今日 ${today}・${p.business_days_before_release ?? '?'} 営業日以内の配信: ${up.length ? up.map((q) => q.date_jst).join(', ') : '無し'}）\n`);
  const by = {};
  for (const e of doc.entries ?? []) (by[e.verdict] ??= []).push(e);
  for (const v of ['verified', 'partial', 'not_found', 'contradicted']) {
    if (!by[v]) continue;
    o.push(`  ${v.padEnd(12)} ${by[v].length}`);
    for (const e of by[v]) o.push(`    - ${e.name}  (${e.grade} / ${e.checked_at})${e.discrepancy ? `  ← ${e.discrepancy.slice(0, 60)}` : ''}`);
  }
  const s = doc.prior_art_search;
  if (s) o.push(`\n  探索: ${s.result}（${s.searched_at}）— 「無い」の証明ではない。最も近い: ${(s.closest ?? []).join(', ')}`);
  o.push('\n  規則: 他社の数値は書かない（等級Aが無い限り）。「世界初」「唯一」は書かない。');
  return o.join('\n');
}

// ── 自己テスト ──────────────────────────────────────────────
const QUEUE_NEAR = { queue: [{ id: 'q1', date_jst: '2026-09-03', cluster: 'autopilot', kind: 'evidence' }] };
const BREAKAGES = [
  ['verdict が値域外なら落ちる', (d) => { d.entries[0].verdict = 'たぶん'; }],
  ['一次URLが無ければ落ちる', (d) => { delete d.entries[0].primary_url; }],
  ['partial なのに何が違うかが無ければ落ちる', (d) => { const e = d.entries.find((x) => x.verdict === 'partial'); assert(e, '検体に partial が無い'); delete e.discrepancy; }],
  ['探索の記録が「無い」の断定になっていれば落ちる', (d) => { d.prior_art_search.result = '先行例は無い（世界初）'; }],
  ['policy を消せば落ちる', (d) => { delete d.policy; }],
  ['**配信が2営業日以内なのに確認日が古ければ落ちる**（2026-09-02 の穴そのもの）', (d) => { d.entries[0].checked_at = '2026-08-01'; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')),
  (d) => validate(d, { today: '2026-09-02', queueDoc: QUEUE_NEAR }),
  BREAKAGES,
);
SCENARIOS.push(['配信が遠ければ古い確認日でも落ちない（期限は配信に結びつける）', () => {
  const d = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  d.entries[0].checked_at = '2026-08-01';
  const far = { queue: [{ id: 'q1', date_jst: '2026-10-20', cluster: 'autopilot' }] };
  assert(validate(d, { today: '2026-09-02', queueDoc: far }).length === 0, '遠い配信で落ちた');
}]);
SCENARIOS.push(['営業日は土日を跨いで数える', () => {
  assert(addBusinessDays('2026-09-04', 2) === '2026-09-08', '金曜 +2営業日 = 火曜');
  assert(addBusinessDays('2026-09-02', 2) === '2026-09-04', '水曜 +2営業日 = 金曜');
}]);
SCENARIOS.push(['対象クラスタ以外の配信は数えない', () => {
  const q = { queue: [{ id: 'x', date_jst: '2026-09-03', cluster: 'obsidian' }] };
  assert(upcomingReleases(q, { today: '2026-09-02', clusters: ['autopilot'], businessDays: 2 }).length === 0, '別クラスタを数えた');
}]);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const today = (() => { const i = argv.indexOf('--today'); return i >= 0 && argv[i + 1] ? argv[i + 1] : new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); })();
  const doc = readLedger(LEDGER_PATH, { onMissing: null, why: '先行例の台帳' });
  if (!doc) { console.error('data/prior-art.json が無い'); process.exit(1); }
  const queueDoc = readLedger(QUEUE_PATH, { onMissing: null, why: '配信予定が読めないと鮮度の期限が決まらない' });
  const problems = validate(doc, { today, queueDoc });
  console.log(render(doc, { today, queueDoc }));
  if (problems.length) {
    console.error('\n先行例の台帳: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes('--check')) console.log('\n先行例の台帳に問題なし（値域・一次URL・確認日・配信前の鮮度）。');
}
