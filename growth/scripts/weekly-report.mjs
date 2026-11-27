#!/usr/bin/env node
/**
 * The one file a human reads each week.
 *
 *   node growth/scripts/weekly-report.mjs            # print
 *   node growth/scripts/weekly-report.mjs --write    # also save under growth/reports/
 *   node growth/scripts/weekly-report.mjs --selftest # ledger marks on the opportunity tables
 *
 * Ordered by what it costs to ignore, not by what is easiest to measure:
 * decisions that are already late come first, then paid-relevant work, then
 * pure-SEO wins, then everything else. Section order is the prioritisation —
 * a reader who stops a third of the way down should still have done the
 * highest-value thing available to them that week.
 *
 * Runs with no GSC snapshot present. It degrades to the experiment sections and
 * says plainly what is missing, because "the data is not loaded" must never be
 * the reason a week passes with no decision made.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, latestSnapshot, previousSnapshot, listSnapshots, loadSnapshot,
  expectedCtr, positionOpportunity, businessRelevance, curveFor, segmentOfPath,
} from '../lib/gsc.mjs';
import { loadLedger, summarize, daysOverdue, today, isOpen } from '../lib/ledger.mjs';
import { classifyDueOwnership, canonicalPage } from '../lib/experiment-coexistence.mjs';
import { assessComparison, selectComparison } from '../lib/comparison.mjs';
import { auditOverlaps, experimentScope, nonexclusiveObservation } from '../lib/experiment-overlap.mjs';

if (process.argv.includes('--selftest')) process.exit(selftest());

const write = process.argv.includes('--write');
const asOf = today();
const out = [];
const p = (s = '') => out.push(s);

const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1));

const snap = latestSnapshot();
const previousCandidate = snap ? selectComparison(snap, listSnapshots().filter(label => label !== snap.label).map(loadSnapshot))
  || previousSnapshot(snap.label) : null;
const comparison = assessComparison(snap, previousCandidate);
const prev = comparison.comparable ? previousCandidate : null;
const ledger = loadLedger();
const { due, overdue, byStatus, total } = summarize(ledger, asOf);
const { blocking: blockingDue, observations: observationDue } = classifyDueOwnership(due);
const observationIds = new Set(observationDue.map((e) => e.id));

// A decision in the ledger binds the working lists, not only the content queue
// (SEO_AIO_PLAN_2026-08 P0-2 step 4; data/operating-memory.json lesson
// a-decision-in-one-ledger-must-bind-another). Before this, the report ranked
// /blog/line-keep-alternative first in every week after its 2026-08-11
// `abandoned` decision, and listed frozen pages with no mark.
let i18nRegistry = null;
try { i18nRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/i18n/pages.json'), 'utf8')); } catch { /* direct pages are still marked */ }
const marks = ledgerMarks(ledger, { generatedSource: generatedSources(i18nRegistry) });
const markText = (page) => markLabel(marks.of(page));

p(`# Weekly Growth Report — ${asOf}`);
p();
p(`Snapshot: ${snap ? `\`${snap.label}\`` : '**none ingested**'}` +
  (prev ? ` · compared to \`${prev.label}\`` : ` · comparison withheld: ${comparison.reason}`));
if (snap) p(`Current period: ${snap.meta.period_start ?? '?'}..${snap.meta.period_end ?? '?'}`
  + (prev ? `; previous: ${prev.meta.period_start}..${prev.meta.period_end}` : ''));
p();

/* ── Decisions owed ─────────────────────────────────────────────────────
 * First, always. Keep overdue observations visible without undoing their
 * owner-approved nonexclusive page ownership. */
p('## Decisions owed');
p();
if (!due.length) {
  p('None. No experiment is past its evaluation date.');
} else {
  p(`**${due.length} experiment(s)** past their evaluation date` +
    (overdue.length ? ` — the oldest by ${Math.max(...overdue.map((e) => daysOverdue(e, asOf)))} days` : '') + '.');
  p(`${blockingDue.length} exclusive scope; ${observationDue.length} approved nonexclusive observation(s).`);
  p();
  p('| Days late | Experiment | Page | Type | Ownership |');
  p('|---:|---|---|---|---|');
  for (const e of [...due].sort((a, b) => daysOverdue(b, asOf) - daysOverdue(a, asOf))) {
    p(`| ${daysOverdue(e, asOf)} | \`${e.id}\` | \`${e.page}\` | ${e.type} | ${observationIds.has(e.id) ? 'nonexclusive observation' : 'exclusive'} |`);
  }
  p();
  if (blockingDue.length) p('Exclusive scopes stay frozen until their evidence-based decision is recorded.');
  if (observationDue.length) p('Approved nonexclusive observations remain due for review but do not freeze other page work. Check the registered metric, baseline, minimum sample and confounders; insufficient evidence is not a win or a reason to rewrite the original result.');
  p();
  p('```sh');
  p('node growth/scripts/experiments.mjs due');
  p('```');
  p('Evaluate only with evidence for the registered target metric. Eligible single-page or exact query-page GSC CTR/position/impressions use an explicit comparable `--snapshot`; other scopes, metrics and diagnostics use `--review`. See [evidence requirements](../EXPERIMENT_EVIDENCE.md).');
}
p();

/* ── SEO performance ──────────────────────────────────────────────────── */
const overlap = auditOverlaps(ledger);
p('## 実験の重複と計測変更');
p();
p('同じページの複数変更は交絡要因。指標が違っても独立した因果効果とは断定しない。');
p(`全体に影響する実験: ${overlap.global.join(', ') || 'なし'}。`);
p(`URLで列挙できない範囲: ${overlap.unenumerated.join(', ') || 'なし'}。`);
for (const item of overlap.observations || []) p(`非排他的な全サイト観測: ${item.id}（${item.effective_at}以降）。単独因果は判定しない。`);
for (const item of overlap.overlaps) p(`- \`${item.page}\`: ${item.experiments.join(', ')}`);
for (const change of ledger.measurement_changes || []) p(`- ${change.date}: ${change.note}`);
p();

p('## SEO');
p();
if (!snap) {
  p('No GSC snapshot has been ingested, so nothing here can be computed.');
  p();
  p('Fix (about 5 minutes, once a week): **[growth/GSC_OWNER_ACTION.md](../GSC_OWNER_ACTION.md)**');
} else {
  const t = snap.meta.totals;
  p('| Metric | Now |' + (prev ? ' Previous | Δ |' : ''));
  p('|---|---:|' + (prev ? '---:|---:|' : ''));
  const row = (name, cur, before, fmt = String) => {
    if (!prev) return p(`| ${name} | ${fmt(cur)} |`);
    const d = cur != null && before != null ? cur - before : null;
    const sign = d == null ? '—' : `${d >= 0 ? '+' : ''}${fmt(d)}`;
    p(`| ${name} | ${fmt(cur)} | ${fmt(before)} | ${sign} |`);
  };
  row('Clicks', t.clicks, prev?.meta.totals.clicks, (v) => Math.round(v).toLocaleString());
  row('Impressions', t.impressions, prev?.meta.totals.impressions, (v) => Math.round(v).toLocaleString());
  row('CTR', t.ctr, prev?.meta.totals.ctr, pct);
}
p();

p('## Google生成AI検索（WEBの内数）');
p();
if (!snap?.meta.aio) {
  p('このスナップショットに専用AIレポートは未取得。ゼロではない。BigQuery出力だけでは埋まらない。');
} else {
  const ai = snap.meta.aio;
  p(`表示: ${ai.impressions ?? '不明'}（${ai.aggregation || 'page'}集計）、掲載ページ: ${ai.pages}。`);
  p(`同じ日付・プロパティ集計でのAI表示／WEB表示: ${pct(ai.aggregation === 'property' ? ai.impression_share : null)}。`);
  p('AI固有クリック・CTRは未取得。ページ集計をプロパティ合計に加算しない。');
}
p();

/* ── Opportunities, split by whether they can plausibly produce an install ──
 * The split is the point. A single ranked list buries install-adjacent work
 * under whichever cluster happens to have the most impressions, which is how
 * effort drifts toward traffic that was never going to convert. */
if (snap) {
  // Per-language expectations: English pages on this site click at roughly a
  // third the rate of Japanese ones at the same position, so a single curve
  // ranks them as opportunities purely for being English.
  const curveOf = (r) => curveFor(snap.meta, segmentOfPath(r.page));
  // Impression floor. Without it the ranking surfaces pages with a handful of
  // impressions: a 7-impression page at 0% CTR scores a "+1 click upside" that
  // is really just rounding, and it pushes genuine work off the table. 100 is
  // roughly where a 28-day CTR figure starts meaning anything.
  const MIN_IMPRESSIONS = 100;
  const scored = snap.pages
    .filter((r) => r.page && r.impressions >= MIN_IMPRESSIONS)
    .map((r) => {
      const exp = expectedCtr(curveOf(r), r.position);
      const gap = Math.max(0, (exp ?? 0) - (r.ctr ?? 0));
      const rel = businessRelevance(r.page);
      return { ...r, exp, gap, rel,
               upside: r.impressions * gap,
               score: r.impressions * positionOpportunity(r.position) * gap * rel };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  // `abandoned` pages leave the ranked CTR work lists but stay visible in one
  // line below them: since #1015 the decision can also be an administrative
  // closure, so dropping them silently could hide a page. Open exclusive scopes
  // stay ranked with a frozen mark (the owner reopening a page is exactly that).
  const { paid, lowRel, excluded: excludedByLedger } = workLists(scored, marks);

  const table = (rows) => {
    p('| Page | Imp | CTR → expected | Pos | Upside |');
    p('|---|---:|---|---:|---:|');
    for (const r of rows) {
      p(`| \`${r.page}\`${markText(r.page)} | ${r.impressions.toLocaleString()} | ${pct(r.ctr)} → ${pct(r.exp)} | ${n1(r.position)} | +${Math.round(r.upside)} |`);
    }
  };

  p('## Paid-relevant opportunities');
  p();
  p('_Pages whose readers are plausibly close to installing (business relevance ≥ 0.7). Work these first._');
  p();
  paid.length ? table(paid) : p('None scoring above zero this period.');
  p();

  p('## Low-relevance SEO quick wins');
  p();
  p('_Real click upside, weak install intent. Worth taking cheaply; not worth a large build._');
  p();
  lowRel.length ? table(lowRel) : p('None scoring above zero this period.');
  p();
  if (excludedByLedger.length) {
    const shown = excludedByLedger.slice(0, 10).map((r) => `\`${r.page}\` (abandoned: ${marks.of(r.page).ids.join(', ')}) ${r.impressions.toLocaleString()} imp · CTR ${pct(r.ctr)} · pos ${n1(r.position)}`);
    const more = excludedByLedger.length > shown.length ? `; and ${excludedByLedger.length - shown.length} more` : '';
    p(`_Left out of both tables by a ledger decision (not CTR work items; reopening needs an owner decision): ${shown.join('; ')}${more}_`);
    p();
  }
  if (marks.global.length) {
    p(`_Open exclusive site-wide experiment(s) cover every page above: ${marks.global.join('; ')}._`);
    p();
  }
  if (!i18nRegistry) {
    p('_Generated locale copies carry no ledger mark this week: data/i18n/pages.json could not be read._');
    p();
  }

  if (prev) {
    const before = new Map(prev.pages.map((r) => [r.page, r]));
    const declining = snap.pages
      .map((r) => ({ r, b: before.get(r.page) }))
      .filter(({ r, b }) => b && b.clicks && (r.clicks || 0) - b.clicks <= -3)
      .sort((a, b) => ((a.r.clicks || 0) - a.b.clicks) - ((b.r.clicks || 0) - b.b.clicks))
      .slice(0, 10);
    p('## Declining pages');
    p();
    if (!declining.length) p('No page lost 3+ clicks since the previous snapshot.');
    else {
      p('| Page | Clicks | Δ | Δ position |');
      p('|---|---|---:|---:|');
      for (const { r, b } of declining) {
        p(`| \`${r.page}\`${markText(r.page)} | ${b.clicks} → ${r.clicks || 0} | ${(r.clicks || 0) - b.clicks} | ${n1((r.position ?? 0) - (b.position ?? 0))} |`);
      }
    }
    p();
  }
}

/* ── CPP performance (App Store Connect side) ───────────────────────────
 * The install numbers live in ASC, which has no export API this repo can
 * reach, so the values are transcribed by hand into
 * growth/data/appstore/cpp-weekly.json (see the README there). The table
 * still renders without it — an empty skeleton that names every wired CPP is
 * what reminds the reader the transcription is owed. v4 R1: the point of the
 * ppid wiring is exactly this table. */
p('## CPP別 閲覧数 / DL / CVR（ASC手動転記）');
p();
{
  let cppMap = null;
  let cppData = null;
  try { cppMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cpp-map.json'), 'utf8')); } catch { /* map absent */ }
  try { cppData = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/data/appstore/cpp-weekly.json'), 'utf8')); } catch { /* not transcribed yet */ }
  if (!cppMap) {
    p('data/cpp-map.json が読めない — CPP配線の台帳が無いのでこの表は出せない。');
  } else {
    p(cppData
      ? `_窓: ${cppData.window ?? '未記載'} · 出典: ASC App Analytics（手動転記）_`
      : '_値が未転記。ASC → App Analytics → カスタムプロダクトページ の 閲覧数/DL を growth/data/appstore/cpp-weekly.json に転記すると埋まる（値はGA4からは取れない）。_');
    p();
    p('| CPP | ppid | 対象 | 閲覧数 | DL | CVR |');
    p('|---|---|---|---:|---:|---:|');
    const rowOf = (id) => cppData?.rows?.find((r) => r.id === id);
    const cvr = (r) => (r && r.views > 0 && r.downloads != null ? pct(r.downloads / r.views) : '—');
    // The default product page is the control group every CPP is judged
    // against (baseline CVR 2.45% over the 90d to 2026-08-18).
    const def = rowOf('(default)');
    p(`| （デフォルト商品ページ） | — | 対応表外の全ページ | ${def?.views ?? '—'} | ${def?.downloads ?? '—'} | ${cvr(def)} |`);
    for (const c of cppMap.cpps) {
      const r = rowOf(c.id);
      p(`| ${c.id} | ${c.ppid ? '✅' : 'TODO'} | \`${c.match.join('` `')}\` | ${r?.views ?? '—'} | ${r?.downloads ?? '—'} | ${cvr(r)} |`);
    }
    const todo = cppMap.cpps.filter((c) => !c.ppid).length;
    if (todo) {
      p();
      p(`${todo} CPP(s) はppid未記入（オーナー入力待ち）。記入 → \`node scripts/apply-cpp-ppid.js --write\` で配線される。`);
    }
  }
}
p();

/* ── AI-mediated traffic (GA4 side) ─────────────────────────────────────
 * The densest channel on the site (75.9s average engagement — longest of any
 * channel, v4 §2-5) and the only one nobody was measuring end-to-end: whether
 * AI-referred sessions ever click through to the App Store. GA4 has no export
 * pipeline into this repo, so the numbers are transcribed by hand from a GA4
 * exploration into growth/data/ga4/ai-channel.json (README there). Rows are a
 * fixed roster: the ai-assistant channel plus the five AI referral domains —
 * a referrer that is not on the roster belongs in "other" rather than being
 * silently dropped, so growth in a new AI surface still shows up. */
p('## AI経由（ai-assistantチャネル＋AI参照ドメイン → app_store_click）');
p();
{
  let ai = null;
  try { ai = JSON.parse(fs.readFileSync(path.join(ROOT, 'growth/data/ga4/ai-channel.json'), 'utf8')); } catch { /* not transcribed yet */ }
  const ROSTER = [
    ['ai-assistant', 'AI Assistantチャネル（GA4定義）'],
    ['copilot', 'copilot.com 参照'],
    ['claude.ai', 'claude.ai 参照'],
    ['gemini', 'gemini.google.com 参照'],
    ['chatgpt', 'chatgpt.com 参照'],
    ['openai', 'openai.com 参照'],
    ['other', 'その他AI参照（発見次第rosterへ昇格）'],
  ];
  p(ai
    ? `_窓: ${ai.window ?? '未記載'} · 出典: GA4探索（手動転記）_`
    : '_値が未転記。GA4 → 探索 で「セッションのデフォルトチャネルグループ＝AI Assistant」と「セッションの参照元に copilot / claude.ai / gemini / chatgpt / openai を含む」の2軸を作り、セッション数と app_store_click を growth/data/ga4/ai-channel.json へ転記すると埋まる。_');
  p();
  p('| 経路 | セッション | app_store_click |');
  p('|---|---:|---:|');
  for (const [id, label] of ROSTER) {
    const r = ai?.rows?.find((x) => x.id === id);
    p(`| ${label} | ${r?.sessions ?? '—'} | ${r?.app_store_clicks ?? '—'} |`);
  }
  p();
  p('_参考ベースライン（GA4 30日 2026-07-21..08-20・v4 §2-5）: copilot 13・claude.ai 4・gemini 4・chatgpt 3・openai 6 ≒ 約30セッション/月、平均エンゲージ 75.9秒＝全チャネル最長。app_store_click の計測はこの表が初——「AI経由が何install生むか」はまだ誰も知らない。_');
}
p();

/* ── Ledger health ──────────────────────────────────────────────────── */
p('## Experiment ledger');
p();
p(`${total} experiment(s): ` + (Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'));
p();

p('## Next actions');
p();
const actions = [];
if (blockingDue.length) actions.push(`**P0** — review ${blockingDue.length} overdue exclusive experiment(s) against their registered metrics before changing those scopes.`);
if (observationDue.length) actions.push(`**P1** — review ${observationDue.length} overdue nonexclusive observation(s) against their registered metrics and minimum samples. Other admitted page work may proceed; do not infer an isolated causal effect.`);
if (!snap) {
  actions.push('**P0** — ingest a GSC snapshot (`growth/GSC_OWNER_ACTION.md`). Every SEO section above is blank until this happens. Human time: ~5 min.');
}
if (snap && !snap.queryPages.length) {
  actions.push('**P1** — add a query×page export so cannibalisation detection can run (`GSC_OWNER_ACTION.md` step 3). Human time: ~3 min.');
}
if (!actions.length) actions.push('Nothing is overdue and data is current — pick the top unlabelled paid-relevant opportunity above.');
actions.forEach((a, i) => p(`${i + 1}. ${a}`));
p();
p(`_Generated by \`growth/scripts/weekly-report.mjs\` · snapshots on file: ${listSnapshots().join(', ') || 'none'}_`);

const text = out.join('\n') + '\n';
console.log(text);

if (write) {
  const dir = path.join(ROOT, 'growth/reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${asOf}-weekly.md`);
  fs.writeFileSync(file, text);
  console.error(`written: growth/reports/${path.basename(file)}`);
}

/* ── Ledger marks ───────────────────────────────────────────────────────
 * Function declarations, so --selftest (checked before any report code runs)
 * can call them. They read nothing but their arguments. */

/**
 * Generated locale copy → its source page, from data/i18n/pages.json.
 * A copy follows its source (its text is the source's, translated by the
 * pipeline); a hand-written page (listed under `existing`) is its own page.
 */
function generatedSources(registry) {
  const map = new Map();
  for (const g of registry?.pages || []) {
    if (!g || typeof g.source !== 'string' || !g.pages) continue;
    let source;
    try { source = canonicalPage(`/${g.source}`); } catch { continue; }
    for (const [locale, file] of Object.entries(g.pages)) {
      if (g.existing?.[locale] || typeof file !== 'string') continue;
      try { map.set(canonicalPage(`/${file}`), source); } catch { /* not a local page path */ }
    }
  }
  return map;
}

/**
 * Marks from the experiment ledger, by page.
 *   abandoned … `decision: abandoned` (the same decision build-queues honours)
 *   frozen    … inside an open, exclusive experiment (nonexclusive observations
 *               do not freeze pages); a frozen mark replaces an abandoned one,
 *               so a page the owner reopens returns to the tables, marked
 * Scopes come from the ledger's free-text page lists via experimentScope; one
 * that cannot be read is skipped (these are labels, never data). Site-wide
 * exclusive experiments are returned in `global` rather than on every row.
 */
function ledgerMarks(ledger, { generatedSource = new Map(), now = new Date() } = {}) {
  const byPage = new Map();
  const global = [];
  const scopeOf = (e) => { try { return experimentScope(e); } catch { return { global: false, pages: [] }; } };
  for (const e of ledger?.experiments || []) {
    if (e.decision !== 'abandoned') continue;
    for (const page of scopeOf(e).pages) {
      const prev = byPage.get(page);
      byPage.set(page, { kind: 'abandoned', ids: [...(prev?.ids || []), e.id] });
    }
  }
  for (const e of ledger?.experiments || []) {
    if (!isOpen(e)) continue;
    let observation = false;
    try { observation = nonexclusiveObservation(e, { now }); } catch { /* an invalid coexistence stays exclusive */ }
    if (observation) continue;
    const scope = scopeOf(e);
    const id = `${e.id}, eval ${e.evaluation_at}`;
    if (scope.global) global.push(id);
    for (const page of scope.pages) {
      const prev = byPage.get(page);
      byPage.set(page, { kind: 'frozen', ids: [...(prev?.kind === 'frozen' ? prev.ids : []), id] });
    }
  }
  const of = (page) => {
    let key;
    try { key = canonicalPage(page); } catch { return null; }
    if (byPage.has(key)) return byPage.get(key);
    const source = generatedSource.get(key);
    return (source && byPage.get(source)) || null;
  };
  return { of, global };
}

/**
 * The two CTR work lists the report prints, and the `abandoned` rows left out of
 * both (in score order). Frozen pages stay in the lists, marked. Pure, so
 * --selftest checks the lists the tables are printed from, not only the marks.
 */
function workLists(rows, marks, limit = 10) {
  const ranked = rows.filter((r) => marks.of(r.page)?.kind !== 'abandoned');
  return {
    paid: ranked.filter((r) => r.rel >= 0.7).slice(0, limit),
    lowRel: ranked.filter((r) => r.rel < 0.7).slice(0, limit),
    excluded: rows.filter((r) => marks.of(r.page)?.kind === 'abandoned'),
  };
}

function markLabel(mark) {
  if (!mark) return '';
  return mark.kind === 'frozen' ? ` _(frozen: ${mark.ids.join('; ')})_` : ` _(abandoned: ${mark.ids.join(', ')})_`;
}

function selftest() {
  const failures = [];
  let total = 0;
  const t = (name, cond) => { total++; if (!cond) failures.push(name); };
  const safe = (fn) => { try { return fn(); } catch (e) { return `throw: ${e.message}`; } };

  const ledger = { experiments: [
    { id: 'closed', page: '/blog/x', type: 'title_test', status: 'evaluated', decision: 'abandoned' },
    { id: 'closed-set', page: '(2 pages: /blog/y, /blog/z)', type: 'title_test', status: 'evaluated', decision: 'abandoned' },
    { id: 'clips', page: '(2 pages: /, /apple-watch/)', type: 'video', status: 'running', evaluation_at: '2026-11-14' },
    { id: 'home', page: '/', type: 'title_test', status: 'running', evaluation_at: '2026-11-20' },
    { id: 'kept', page: '/blog/w', type: 'title_test', status: 'evaluated', decision: 'keep' },
    { id: 'planned', page: '/blog/p', type: 'title_test', status: 'planned', evaluation_at: '2026-12-20' },
    // experimentScope throws on this one (a query string is not a page scope).
    { id: 'unreadable', page: '/blog/q?x=1', type: 'title_test', status: 'running', evaluation_at: '2026-12-01' },
  ] };
  const registry = { pages: [
    { source: 'blog/x.html', existing: { ja: 'blog/x.html', en: 'en/blog/x.html' },
      pages: { ja: 'blog/x.html', en: 'en/blog/x.html', es: 'es/blog/x.html', 'zh-Hant': 'zh-Hant/blog/x.html' } },
    { source: 'apple-watch/index.html', existing: { ja: 'apple-watch/index.html' },
      pages: { ja: 'apple-watch/index.html', ko: 'ko/apple-watch/index.html' } },
    { source: 'index.html', existing: { ja: 'index.html', es: 'es/index.html' }, pages: { ja: 'index.html', es: 'es/index.html' } },
  ] };
  // A throw becomes a named failure, not a crash: a failed build yields `throw: …`,
  // and every lookup on it is undefined (never a mark, never null).
  const marksOf = (l, opts) => safe(() => ledgerMarks(l, opts));
  const ofIn = (mk, page) => (typeof mk === 'string' ? undefined : mk.of(page));
  const m = marksOf(ledger, { generatedSource: generatedSources(registry) });
  const of = (page) => ofIn(m, page);

  t('**abandoned のページに印が付く**（CTR の表から外す対象）', of('/blog/x')?.kind === 'abandoned' && of('/blog/x').ids.join() === 'closed');
  t('abandoned のページ集合は1ページずつ', of('/blog/y')?.kind === 'abandoned' && of('/blog/z')?.kind === 'abandoned');
  t('**進行中の排他的な実験の範囲は frozen**', of('/apple-watch/')?.kind === 'frozen'
    && of('/apple-watch/').ids.join() === 'clips, eval 2026-11-14');
  t('同じページの実験は全部並べる', of('/')?.ids?.join('; ') === 'clips, eval 2026-11-14; home, eval 2026-11-20');
  t('判定済み（keep）と planned は印を付けない', of('/blog/w') === null && of('/blog/p') === null);
  t('書き方の違うパスも同じページ', of('/apple-watch')?.kind === 'frozen' && of('/apple-watch/index.html')?.kind === 'frozen');
  t('**生成された各言語の写しは元のページに従う**', of('/es/blog/x')?.kind === 'abandoned'
    && of('/zh-Hant/blog/x')?.kind === 'abandoned' && of('/ko/apple-watch/')?.kind === 'frozen');
  t('手で書いたページ（existing）は元のページに従わない', of('/en/blog/x') === null && of('/es/') === null);
  t('読めない範囲の実験は飛ばす（落ちない）', typeof m !== 'string');
  t('ページとして読めないパスは印なし（落ちない）', of('/blog/x?utm_source=a') === null && of('not-a-path') === null);
  t('台帳の外のページは印なし', of('/blog/other') === null);

  const reopened = marksOf({ experiments: [...ledger.experiments,
    { id: 'retry', page: '/blog/x', type: 'title_test', status: 'running', evaluation_at: '2026-12-21' }] });
  t('**オーナーが開け直したページは frozen として表に戻る**', ofIn(reopened, '/blog/x')?.kind === 'frozen'
    && ofIn(reopened, '/blog/x').ids.join() === 'retry, eval 2026-12-21');
  const sitewide = marksOf({ experiments: [
    { id: 'all', page: 'サイト全体（全ページのフッター）', type: 'layout', status: 'running', evaluation_at: '2026-12-01' }] });
  t('サイト全体の排他的な実験は global に出す', sitewide?.global?.join() === 'all, eval 2026-12-01'
    && ofIn(sitewide, '/blog/x') === null);
  t('台帳が空でも落ちない', safe(() => ledgerMarks({}).of('/')) === null && generatedSources(null).size === 0);

  t('印の文言: frozen', markLabel(of('/apple-watch/')) === ' _(frozen: clips, eval 2026-11-14)_');
  t('印の文言: abandoned', markLabel(of('/blog/x')) === ' _(abandoned: closed)_');
  t('印が無ければ何も足さない', markLabel(null) === '');

  // 表に載る一覧そのもの。印だけ確かめても、表から外す配線が抜ければ abandoned のページが第1位に戻る。
  const scoredRows = [
    { page: '/blog/x', rel: 0.3 }, { page: '/apple-watch/', rel: 0.9 }, { page: '/blog/other', rel: 0.3 },
    { page: '/es/blog/x', rel: 0.3 }, { page: '/blog/w', rel: 0.9 },
  ];
  const lists = safe(() => workLists(scoredRows, m));
  const pagesOf = (list) => (Array.isArray(list) ? list.map((r) => r.page).join() : 'missing');
  t('**abandoned のページ（と生成された写し）は CTR の表に載らず、表の下の1行へ回る**',
    pagesOf(lists?.lowRel) === '/blog/other' && pagesOf(lists?.excluded) === '/blog/x,/es/blog/x');
  t('frozen のページは外さず、印付きで表に残る', pagesOf(lists?.paid) === '/apple-watch/,/blog/w');
  t('表はそれぞれ上位10件まで', safe(() => workLists(Array.from({ length: 12 }, (_, i) => ({ page: `/blog/n${i}`, rel: 0.9 })), m)
    .paid.length) === 10);

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`weekly-report 自己テスト ${total} 件中 ${failures.length} 件失敗`);
  return failures.length ? 1 : 0;
}
