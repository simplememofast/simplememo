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

/**
 * 正規表現のメタ文字を逃がす。
 *
 * [2026-08-26] **これはテンプレートリテラルの中に直接書かれていて、
 * 二重に逃がされ、何も逃がしていなかった。**
 *
 *     /[.*+?^${}()|[\\]\\\\]/g   ← 実際に書かれていたもの
 *
 * `\\]` でクラスが閉じるので、この正規表現は「メタ文字1つ + 円記号2つ + ]」
 * を要求する。そんな並びは来ないので `a.b` は `a.b` のまま出てくる。
 * 今の競合名にメタ文字が無いので**まだ実害が出ていないだけ**で、
 * 「Notion (Web)」のような名前を1つ足せば new RegExp が例外で落ちるし、
 * 「Bear 2.0」なら黙って別のものに当たる。
 *
 * **関数に出したのは、同じ間違いが起きる場所を無くすため。**
 * テンプレートリテラルの中に正規表現リテラルを書かなければ、二重にならない。
 */
export function escapeRe(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 競合名の近く（70文字以内）にある「秒つきの数字」を拾う。 */
export function rivalRe(name) {
  return new RegExp(
    `${escapeRe(name)}[^.。<]{0,70}?`
    + `(\\d+\\.?\\d*)\\s*(?:[-–~〜]\\s*(\\d+\\.?\\d*)\\s*)?(?:seconds?|秒)`,
    'gi',
  );
}

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

/** 自社の実測値。**一致ごとに計算し直していたのを一度に。** */
const OURS_VALUES = measuredValues(B.apps['Simple Memo - for Obsidian']);

/**
 * 本文1つぶんの走査。**純関数にしてある**ので、
 * 当たるべきものに当たり、当たってはいけないものに当たらないことを確かめられる。
 *
 * 返すのは { said, values, ambiguous }。ページの情報は呼び出し側で足す。
 */
export function scanText(text, app, ourValues = OURS_VALUES) {
  const out = [];
  const re = rivalRe(app.name);
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
    const nearOurFigures = values.every((v) => ourValues.some((o) => Math.abs(v - o) < NEAR));
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
        || !measuredValues(app).some((v) => ourValues.some((o) => Math.abs(v - o) < NEAR)));
    // A range that straddles the measured value is loose, not wrong.
    if (values.length === 2
        && measuredValues(app).some((v) => values[0] <= v && v <= values[1])) continue;
    if (!conflicts(app, values)) continue;
    out.push({
      said: m[0].trim().slice(0, 64),
      values,
      // Bucketed rather than dropped. Skipping these hid a real
      // "Bear 〜1秒" against a measured 1.8s, and a consistency checker
      // that silently swallows conflicts is worse than a noisy one.
      ambiguous: looksLikeOurs,
    });
  }
  return out;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
//
// この検査が守っているのは、2026-08-11 の英語比較ページ ——
// Apple Notes 0.4-0.5s / Drafts 0.6-0.7s / Google Keep 0.7-0.8s と並べた2行下で
// 自社を「the fastest of the bunch」と書いていた —— の再発。
// 効かなくなる形は2つで、どちらも静かである。
//
//   当たらなくなる … 報告0件。**サイトが直ったのと見分けがつかない**
//   当たりすぎる   … 偽陽性だらけで読まれなくなり、本物が埋もれる
//
// なので両方向を固定する。「当たるべきものに当たる」だけでは足りない。
//
// **ここに本番の件数の下限は置かない。**内部リンクの検査とは違って、
// 0件はこの検査の目標状態（全ページが実測に揃った状態）だから。
// 代わりに、合成した入力で matcher が生きていることを見る。
// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
if (process.argv.includes('--selftest')) {
  const APP = (name, focus, ready, first_char) => ({ name, focus, ready, first_char });
  const NOTION = APP('Notion', 2.5, 2.8, 3.3);
  const SLOW_BEAR = APP('Bear', 1.8, 1.8, 1.8); // 2026-08-11 当時の Bear の実測

  const SCENARIOS = [
    ['**測定と食い違う数字は報告される**', () => {
      const out = scanText('Notion takes 9 seconds', NOTION);
      if (out.length !== 1) throw new Error(`${out.length}件（**当たっていない**）`);
      if (out[0].ambiguous) throw new Error('CONFLICT のはずが AMBIGUOUS');
    }],
    ['測定と合っている数字は報告されない（偽陽性を作らない）', () => {
      const out = scanText('Notion takes 2.5 seconds', NOTION);
      if (out.length) throw new Error(`合っているのに報告した: ${out[0].said}`);
    }],
    ['**測定値をまたぐ範囲は報告されない**（loose であって wrong ではない）', () => {
      if (scanText('Notion takes 2-4 seconds', NOTION).length) throw new Error('またぐ範囲を報告した');
    }],
    ['両端とも遠い範囲は報告される', () => {
      if (scanText('Notion takes 8-9 seconds', NOTION).length !== 1) throw new Error('報告しなかった');
    }],
    ['**自社名を含む一致は除く**（その数字はこちらのもの）', () => {
      const out = scanText('Notion → Obsidian連携シンプルメモ 0.4秒', NOTION);
      if (out.length) throw new Error(`自社の数字を競合に付けた: ${out[0].said}`);
    }],
    ['**〜1秒 を黙って飲み込まない**（測定1.8sに対して報告する）', () => {
      const out = scanText('Bear 〜1秒', SLOW_BEAR);
      if (!out.length) throw new Error('飲み込んだ（**静かに矛盾を捨てる検査は、無いより悪い**）');
    }],
    ['**~1秒は AMBIGUOUS へ**（自社の数字が1セル隣にあることが多い）', () => {
      const out = scanText('Notion Inbox, 0.4 Seconds', NOTION);
      if (out.length !== 1) throw new Error(`${out.length}件`);
      if (!out[0].ambiguous) throw new Error('CONFLICT に入れた（偽陽性で読まれなくなる）');
    }],
    ['**2つのバケツが同じになっていない**（片方しか無いなら分けた意味が無い）', () => {
      const conflict = scanText('Notion takes 9 seconds', NOTION)[0];
      const ambiguous = scanText('Notion Inbox, 0.4 Seconds', NOTION)[0];
      if (conflict.ambiguous === ambiguous.ambiguous) throw new Error('振り分けが効いていない');
    }],
    ['70文字より遠い数字は拾わない（窓が効いている）', () => {
      const far = `Notion ${'あ'.repeat(80)} 9 seconds`;
      if (scanText(far, NOTION).length) throw new Error('窓の外を拾った');
    }],
    ['秒の単位が無ければ拾わない', () => {
      if (scanText('Notion 9', NOTION).length) throw new Error('単位無しを拾った');
    }],
    ['**メタ文字を含む競合名で壊れない**（2026-08-26 まで逃がせていなかった）', () => {
      for (const name of ['Notion (Web)', 'Bear 2.0', 'C++']) {
        let re;
        try { re = rivalRe(name); } catch (e) { throw new Error(`${name} で例外: ${e.message}`); }
        if (!re.test(`${name} 9秒`)) throw new Error(`${name} が自分自身に当たらない`);
      }
    }],
    ['**メタ文字が正規表現として効いてしまわない**', () => {
      if (rivalRe('Be.r').test('Bear 9秒')) throw new Error('ドットが任意1文字として効いている');
      if (escapeRe('a.b') !== 'a\\.b') throw new Error(`逃がせていない: ${escapeRe('a.b')}`);
    }],
    ['**strip が本文を落とさない**（全部落とせば報告は常に0件になる）', () => {
      const t = strip('<p>Notion takes 9 seconds</p>');
      if (!t.includes('Notion takes 9 seconds')) throw new Error('本文まで落ちている');
      if (strip('<script>Notion 9 seconds</script>').includes('Notion')) {
        throw new Error('スクリプトの中を残している');
      }
    }],
    ['実データの走査が例外なく終わる（競合名は全件）', () => {
      const text = strip(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
      for (const app of RIVALS) scanText(text, app);
    }],
  ];

  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const findings = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const ownRun = OWN_RUN_PAGES.has(rel);
  if (ownRun && !includeOwnRuns) continue;

  const text = strip(fs.readFileSync(file, 'utf8'));
  for (const app of RIVALS) {
    for (const hit of scanText(text, app)) {
      findings.push({
        page: toUrlPath(ROOT, file), rel, ownRun, app: app.name,
        said: hit.said,
        measured: `focus ${app.focus}s / ready ${app.ready}s / first char ${app.first_char}s`,
        ambiguous: hit.ambiguous,
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
}
