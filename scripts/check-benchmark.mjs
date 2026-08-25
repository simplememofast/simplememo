#!/usr/bin/env node
/**
 * Keep competitor speed figures in step with the measurement they came from.
 *
 *   node scripts/check-benchmark.mjs [--all]
 *
 * The site published four different competitor speed tables. On 2026-08-11 an
 * English comparison page listed Apple Notes at 0.4-0.5s, Drafts at 0.6-0.7s
 * and Google Keep at 0.7-0.8s — every rival faster than our own app — and then
 * called our app "the fastest of the bunch" two lines below. That page has been
 * fixed, but it was a symptom: nothing on this site connected a number in prose
 * to the run it supposedly came from, so any page could drift on its own and
 * no check would notice.
 *
 * `data/benchmark.json` is now that connection. This script finds competitor
 * speed claims in prose and compares them to it.
 *
 * **It does not enforce, and it must not.** Three other pages publish their own
 * measured tables, and this environment has no iPhone — deciding which run is
 * correct by editing files would be manufacturing agreement, which is the
 * failure being fixed, not the fix. So conflicts are reported, the pages
 * carrying their own runs are listed as known exceptions, and a real
 * measurement session resolves them. `--all` includes those pages.
 *
 * Two buckets, because precision and recall pull against each other here:
 *   CONFLICTS  — a rival's name and a figure that matches no measured value
 *   AMBIGUOUS  — a ~1s figure beside a rival's name. Almost always our own
 *                number one table cell away, but not always: this bucket is
 *                where "Bear 〜1秒" against a measured 1.8s turned up, so it
 *                is printed rather than filtered.
 *
 * Excluded outright: a match containing our own product name (the figure is
 * ours), and a range that CONTAINS the measured value ("Notion takes 3-5
 * seconds" holds 3.8) — loose, but not wrong.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/benchmark.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-constants.json'), 'utf8'));
const includeOwnRuns = process.argv.includes('--all');

/** Pages that publish their own measurement run; their numbers are theirs. */
const OWN_RUN_PAGES = new Set(
  B.otherPublishedRuns.map((r) => r.page.replace(/^\//, '') + (r.page.endsWith('/') ? 'index.html' : '.html'))
    .concat([B.canonicalPage.replace(/^\//, '') + '.html'])
);

const RIVALS = Object.entries(B.apps)
  .filter(([name]) => !name.startsWith('Simple Memo'))
  .map(([name, v]) => ({ name, ...v }));

const { collectHtmlFiles, toUrlPath } = createRequire(import.meta.url)('./lib/site-files.js');
const files = collectHtmlFiles(ROOT, {
  skipDirs: ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'growth'],
});

const strip = (html) => html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ');

/** Our own product, under every name it is written by. */
const OURS = /Obsidian連携シンプルメモ|Captio式シンプルメモ|シンプルメモ|Simple ?Memo|SimpleMemoFast/i;

/** A claim is only a conflict if no stated value is near a measured one. */
const NEAR = 0.35;

/** Every measured instant a page could legitimately be quoting for this app. */
function measuredValues(app) {
  return [app.focus, app.ready, app.first_char].filter((v) => typeof v === 'number');
}

function conflicts(app, values) {
  const measured = measuredValues(app);
  return !values.some((v) => measured.some((m) => Math.abs(v - m) < NEAR));
}

const findings = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const ownRun = OWN_RUN_PAGES.has(rel);
  if (ownRun && !includeOwnRuns) continue;

  const text = strip(fs.readFileSync(file, 'utf8'));
  for (const app of RIVALS) {
    // Rival name, then within a short span a figure with a seconds unit.
    const re = new RegExp(
      `${app.name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[^.。<]{0,70}?` +
      `(\\d+\\.?\\d*)\\s*(?:[-–~〜]\\s*(\\d+\\.?\\d*)\\s*)?(?:seconds?|秒)`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      // Our own figure sitting near a rival's name is ours, not theirs. In a
      // comparison table "Notion … → Obsidian連携シンプルメモ（約1秒" the 1s
      // belongs to us; without this the report is mostly false positives and
      // stops being read.
      if (OURS.test(m[0])) continue;
      const values = [Number(m[1])].concat(m[2] ? [Number(m[2])] : []);
      // "about 1 second" / 「約1秒」 is our own published figure and no rival
      // measures anywhere near it, so a lone ~1s beside a rival's name is ours
      // with our name just outside the window — a table cell away, or the far
      // side of "faster than Notion and Evernote". Attributing it to the rival
      // produced most of what was left after the name check.
      // Our own published figures, so a number near one of them beside a rival's
      // name is probably ours a table cell away.
      const OURS_VALUES = measuredValues(B.apps['Simple Memo - for Obsidian']);
      const nearOurFigures = values.every((v) => OURS_VALUES.some((o) => Math.abs(v - o) < NEAR));
      // The value test alone is not enough once a rival measures close to one
      // of our columns. Drafts' focus (0.9s) sits within NEAR of our first_char
      // (0.6s), which was enough to push "Drafts | 入力開始まで | 0.4秒" — a
      // header cell, our own row — into CONFLICTS. So also look just behind the
      // match: a comparison table puts our name a cell or two before the
      // rival's, and prose puts it at the head of the sentence. 60 characters
      // is deliberately tight; it is short enough that a page-wide brand
      // mention in the nav cannot reach a figure in the body.
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      const looksLikeOurs = nearOurFigures
        && (OURS.test(before)
          || !measuredValues(app).some((m) => OURS_VALUES.some((o) => Math.abs(m - o) < NEAR)));
      // A range that straddles the measured value is loose, not wrong.
      if (values.length === 2
          && measuredValues(app).some((m) => values[0] <= m && m <= values[1])) continue;
      if (!conflicts(app, values)) continue;
      findings.push({
        page: toUrlPath(ROOT, file), rel, ownRun, app: app.name,
        said: m[0].trim().slice(0, 64),
        measured: `focus ${app.focus}s / ready ${app.ready}s / first char ${app.first_char}s`,
        // Bucketed rather than dropped. Skipping these hid a real
        // "Bear 〜1秒" against a measured 1.8s, and a consistency checker
        // that silently swallows conflicts is worse than a noisy one.
        ambiguous: looksLikeOurs,
      });
    }
  }
}

if (!findings.length) {
  console.log(`OK: no competitor speed figure conflicts with data/benchmark.json`
    + (includeOwnRuns ? '' : ` (${OWN_RUN_PAGES.size} page(s) with their own runs excluded; --all to include)`));
  process.exit(0);
}

function report(list, heading) {
  if (!list.length) return;
  const byPage = new Map();
  for (const f of list) {
    if (!byPage.has(f.rel)) byPage.set(f.rel, []);
    byPage.get(f.rel).push(f);
  }
  console.log(`${heading} — ${list.length} figure(s) across ${byPage.size} page(s):\n`);
  for (const [rel, items] of [...byPage].sort()) {
    console.log(`  ${rel}${items[0].ownRun ? '   [publishes its own run]' : ''}`);
    for (const f of items) console.log(`      "${f.said}"  —  ${f.app} measured ${f.measured}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 測定そのものの鮮度。**figure ではなく、figure の後ろ盾を見る。**
//
// この script は「ページの数字が測定と食い違っていないか」だけを見ていて、
// **測定自体がいつ・どのバージョンで取られたかは見ていなかった。**
// ところが benchmark.json の _comment 自身がこう書いている:
//   「March 2026 の数字は5メジャーバージョン前に測られており、
//     このサイトの他の3つの表と食い違っていた」
// つまり**これで一度焼かれている。**同じことが静かに再発する経路が空いていた。
//
// 2026-08-22 に v5.8.1 を出したとき、公開中の「起動0.4秒」の後ろ盾は
// 5.7.3・2026-08-11 の測定のままだった。
//
// 落とすのは2つだけ:
//   - 測定の刻印が読めない … 読めない刻印はこの検査を永久に無効化する
//   - **メジャーバージョンが進んだのに ack が無い** … 起動経路が変わりうる規模。
//     再測定できないなら「まだ有効」と一行書けば通る（判断の記録は残す）
// マイナー・パッチのずれと日数は**報告のみ**。この環境にiPhoneは無く、
// 再測定でしか解けない問いで無関係な出荷を止めない（この script の元からの方針）。
// ---------------------------------------------------------------------------
{
  const m = B.measuredOn || {};
  const parts = (v) => String(v || '').split('.').map(Number);
  const problems = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date || '')) {
    problems.push('benchmark.json の measuredOn.date が読めない — **読めない刻印は、この検査を永久に無効化する**');
  }
  if (!/^\d+\.\d+/.test(m.ourAppVersion || '')) {
    problems.push('benchmark.json の measuredOn.ourAppVersion が読めない — 同上');
  }
  if (!problems.length) {
    const [pubMaj, pubMin] = parts(C.appVersion);
    const [runMaj, runMin] = parts(m.ourAppVersion);
    const days = Math.floor((Date.now() - Date.parse(`${m.date}T00:00:00Z`)) / 86400000);
    const behind = pubMaj !== runMaj ? 'major' : pubMin !== runMin ? 'minor' : null;

    console.log('測定の鮮度 — **数字ではなく、数字の後ろ盾を見る**\n');
    console.log(`  公開中のアプリ  v${C.appVersion}`);
    console.log(`  測定したのは    v${m.ourAppVersion} / ${m.date}（${days}日前・${m.device} / ${m.os}）`);
    if (!behind) {
      console.log('  → 同じマイナーバージョンで測っている。');
    } else if (behind === 'minor') {
      console.log(`  → **マイナーが進んでいる**（${runMaj}.${runMin} → ${pubMaj}.${pubMin}）。`);
      console.log('     報告のみ。起動経路が変わっていなければ数字は生きているが、');
      console.log('     **変わっていないことを確かめたわけではない。**');
    } else {
      console.log(`  → **メジャーが進んでいる**（${runMaj} → ${pubMaj}）。起動経路が変わりうる規模。`);
    }
    if (behind === 'major' && m.staleness_ack !== C.appVersion) {
      problems.push(
        `測定が v${m.ourAppVersion} のままでメジャーが進んだ（公開中 v${C.appVersion}）`
        + ' — 再測定するか、まだ有効なら benchmark.json の'
        + ` measuredOn.staleness_ack を "${C.appVersion}" にして理由を _comment に書く。`
        + '**この表は一度、5メジャー前の数字を公開していた。**');
    }
    console.log();
  }
  if (problems.length) {
    console.error('測定の鮮度: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

report(findings.filter((f) => !f.ambiguous), 'CONFLICTS');
report(findings.filter((f) => f.ambiguous),
  'AMBIGUOUS (a ~1s figure beside a rival name — usually our own number one cell away, but check)');
console.log(`\nThis is a report, not a gate. Resolving it needs a measurement run, not an edit:`);
console.log(`  ${B.methodologyPage} documents the protocol. Update data/benchmark.json from the run, then these pages.`);
// Report-only on purpose: see the header. Exit 0 so CI surfaces this without
// blocking unrelated work on a question only a device can answer.
process.exit(0);
