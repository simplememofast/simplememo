#!/usr/bin/env node
/**
 * Wire App Store CTAs to their Custom Product Page (CPP) via ppid=.
 *
 *   node scripts/apply-cpp-ppid.js --check   # CI: exit 1 if hrefs drift from data/cpp-map.json
 *   node scripts/apply-cpp-ppid.js --write   # apply the map to the hrefs
 *
 * The problem this solves: 34 CPPs exist in App Store Connect and none were
 * reachable from the site, so every visitor landed on the default product page
 * (CVR 2.45%). The one CPP that ever got traffic — mail-to-self — converted at
 * 5.42%, and beyond conversion the ppid is what lets ASC answer "which page
 * produced which installs" per product-page variant. The CTAs already carry
 * pt= and ct=<page>__<placement>; this script adds only the missing ppid.
 *
 * Single source of truth is data/cpp-map.json:
 *   - a page matching a map entry with a UUID ppid → every own CTA on it
 *     carries exactly that ppid
 *   - ppid null in the map = owner has not supplied the UUID yet (TODO).
 *     Nothing is written, and --check reports it as a notice, not a failure
 *   - a page outside the map (or mapped with null) must carry no ppid at all —
 *     the default product page is the control group for CPP CVR comparisons,
 *     so unmapped pages must stay unwired
 *
 * What is deliberately NOT touched: pt=, ct= (both value and placement
 * suffix), mt=, data-cta-* attributes, reference links (own-app links without
 * a ct= token), and competitor App Store links. tag-cta-placements.js owns
 * placement; this script owns ppid; they compose because they edit disjoint
 * parts of the same anchors.
 */

const fs = require('fs');
const path = require('path');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tools', 'growth'];
const MAP_FILE = path.join(ROOT_DIR, 'data/cpp-map.json');

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const CHECK = args.has('--check');
const SELFTEST = args.has('--selftest');
if (!WRITE && !CHECK && !SELFTEST) {
  console.error('usage: apply-cpp-ppid.js --check | --write | --selftest');
  process.exit(2);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything that makes the map itself unusable, as a pure function so
 * --selftest can prove each rule actually fires. data/check-selftests.json:
 * "落ちることを確かめていない検査は、無いのと同じ".
 *
 * Note this script is `.js`, and check-selftests.mjs only enumerates `.mjs`
 * checks — so it cannot see this file and the ratchet does not cover it. The
 * self-test below is wired into seo-check.yml directly for that reason.
 */
function mapProblems(m) {
  const out = [];
  for (const cpp of m.cpps) {
    if (cpp.ppid == null) continue;
    if (!UUID_RE.test(cpp.ppid)) {
      out.push(`${cpp.id}: ppid "${cpp.ppid}" is not a UUID — copy it from the CPP URL in App Store Connect`);
      continue;
    }
    // A well-formed UUID is not enough. Apple: "Custom product pages must be
    // approved before they are visible to users", and a page that is not live
    // redirects to the default product page. So a ppid whose CPP has not been
    // approved fails in exactly the same way as a malformed one — every click
    // lands on the default page while this ledger says the page is wired.
    //
    // That is not hypothetical. free-memo-generic was created on 2026-09-02 and
    // sat in PREPARE_FOR_SUBMISSION; the row had to keep pointing at a
    // different, already-approved CPP (plain-notes) because wiring the
    // dedicated one would have measured nothing. Nothing here could tell the
    // difference, so the ledger carries the state it was verified at.
    //
    // asc_state comes from `asc-cpp.yml --action list` in simplememo-ios (the
    // repo that holds the ASC key). It is a recorded observation, not a live
    // read — see the staleness notice below.
    if (cpp.asc_state !== 'APPROVED') {
      out.push(
        `${cpp.id}: ppid ${cpp.ppid} is wired but asc_state is ${JSON.stringify(cpp.asc_state ?? null)} — `
        + 'only APPROVED CPPs are served; anything else silently falls back to the default product page. '
        + 'Verify with asc-cpp.yml --action list in simplememo-ios and record the state here.'
      );
    }
    // Approval alone is insufficient: an approved but hidden CPP also falls
    // back to the default page. Keep the observed boolean with the state.
    if (cpp.asc_visible !== true) {
      out.push(`${cpp.id}: wired CPP visibility is ${JSON.stringify(cpp.asc_visible ?? null)}; verify visible=true in the ASC inventory before wiring it.`);
    }
    // English destinations must have observed English artwork in the approved
    // version. A translated web page alone does not establish a localized CPP.
    if (cpp.match.some((pattern) => pattern.startsWith('^/en/'))) {
      const evidence = cpp.locale_evidence?.['en-US'];
      if (!evidence || !UUID_RE.test(evidence.approved_version_id ?? '')
          || evidence.first_image_reviewed !== true || !Number.isFinite(Date.parse(evidence.checked_at ?? ''))) {
        out.push(`${cpp.id}: English wiring requires dated, reviewed en-US artwork from an identified approved CPP version.`);
      }
    }
  }
  return out;
}

if (SELFTEST) {
  const failures = [];
  const t = (name, cond) => { if (!cond) failures.push(name); };
  const row = (over = {}) => ({
    id: 'x', ppid: '3d126d78-2267-4a6c-a860-c69707ab90a5', asc_state: 'APPROVED', asc_visible: true, match: ['^/x/$'], ...over,
  });

  t('承認済みの行は通る', mapProblems({ cpps: [row()] }).length === 0);
  t('ppid が null の行は何も言わない（オーナー入力待ち）',
    mapProblems({ cpps: [row({ ppid: null, asc_state: undefined })] }).length === 0);
  t('UUID でない ppid は落ちる', mapProblems({ cpps: [row({ ppid: 'not-a-uuid' })] }).length === 1);
  // 本命。**未承認を配線すると Apple は既定商品ページへ倒すのに、台帳は「配線済み」と言う。**
  t('未提出の CPP を配線したら落ちる',
    mapProblems({ cpps: [row({ asc_state: 'PREPARE_FOR_SUBMISSION' })] }).length === 1);
  t('asc_state を書き忘れたら落ちる', mapProblems({ cpps: [row({ asc_state: undefined })] }).length === 1);
  t('落ちる理由に状態が出る',
    /PREPARE_FOR_SUBMISSION/.test(mapProblems({ cpps: [row({ asc_state: 'PREPARE_FOR_SUBMISSION' })] })[0] || ''));
  t('複数行でも件数が合う',
    mapProblems({ cpps: [row(), row({ id: 'y', asc_state: 'REJECTED' }), row({ id: 'z', ppid: 'zzz' })] }).length === 2);
  // **実データが通ることも見る。**合成検体だけだと、本物が形を変えた日に気づかない。
  t('実データ（data/cpp-map.json）が通る',
    mapProblems(JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))).length === 0);

  t('承認済みでも非表示なら落ちる', mapProblems({ cpps: [row({ asc_visible: false })] }).length === 1);
  t('表示状態を観測していなければ落ちる', mapProblems({ cpps: [row({ asc_visible: undefined })] }).length === 1);
  const english = row({match: ['^/en/x/$']});
  t('英語素材未確認の配線は落ちる', mapProblems({cpps:[english]}).length === 1);
  const observedEnglish = {...english, locale_evidence: {'en-US': {
    approved_version_id:'b71eff39-3eec-4095-89f6-47942728473d', first_image_reviewed:true, checked_at:'2026-09-05T14:00:00Z',
  }}};
  t('承認版の英語画像確認済みなら通る', mapProblems({cpps:[observedEnglish]}).length === 0);
  t('英語素材未確認を日付だけで通さない', mapProblems({cpps:[{...observedEnglish, locale_evidence:{'en-US':{...observedEnglish.locale_evidence['en-US'],first_image_reviewed:false}}}]}).length === 1);

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト 13 件中 ${failures.length} 件失敗`);
  process.exit(failures.length ? 1 : 0);
}

/** Same anchor conventions as tag-cta-placements.js — see the comments there. */
const PARAM_CT = /(?:[?&]|&amp;)ct=/;
const PARAM_PPID = /((?:[?&]|&amp;)ppid=)([^"&]*)/;

const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
const malformed = mapProblems(map);
if (malformed.length) {
  // A malformed map must fail even in --check: shipping a token Apple ignores
  // would silently send every click back to the default product page while
  // the ledger says the page is wired.
  malformed.forEach((m) => console.error(`  ${m}`));
  console.error('FAIL: data/cpp-map.json is malformed.');
  process.exit(1);
}

// The states above are a snapshot, and ASC can move underneath it (a CPP can be
// deleted, or an edit can put an approved page back into review). CI here cannot
// re-read ASC — the key lives in simplememo-ios and this repo's checkout is its
// own — so staleness is reported, never failed: failing the build on a question
// this build cannot answer would block unrelated work, the same reasoning the
// competitor-benchmark check already runs on.
const STALE_AFTER_DAYS = 30;
if (map.asc_state_checked_jst) {
  const ageDays = Math.floor(
    (Date.now() - Date.parse(`${map.asc_state_checked_jst}T00:00:00+09:00`)) / 86400000
  );
  if (ageDays > STALE_AFTER_DAYS) {
    console.log(
      `  note: asc_state was last verified ${map.asc_state_checked_jst} (${ageDays} days ago). `
      + 'Re-run asc-cpp.yml --action list in simplememo-ios and update asc_state / asc_state_checked_jst.'
    );
  }
}

/** First matching map entry wins; the current patterns are disjoint anyway. */
function cppFor(urlPath) {
  for (const cpp of map.cpps) {
    if (cpp.match.some((re) => new RegExp(re).test(urlPath))) return cpp;
  }
  return null;
}

/**
 * Set, replace or remove the ppid param on one own-CTA anchor tag.
 * `want` is a UUID string or null (null = the param must be absent).
 */
function applyPpid(tag, want) {
  const has = tag.match(PARAM_PPID);
  if (want == null) {
    if (!has) return tag;
    // Drop the param and its separator; if ppid was first (`?ppid=X&…`), the
    // following separator is promoted to `?` so the query stays well-formed.
    return tag
      .replace(/\?ppid=[^"&]*(?:&amp;|&)/, '?')
      .replace(/\?ppid=[^"&]*(?=")/, '?')
      .replace(/(?:&amp;|&)ppid=[^"&]*/, '')
      .replace(/\?(?=")/, '');
  }
  if (has) return tag.replace(PARAM_PPID, `$1${want}`);
  // Insert as the first query param, matching the shape App Store Connect's
  // own campaign-link generator produces for CPP links.
  return tag.replace(/(apps\.apple\.com\/[^"?]*\?)/, `$1ppid=${want}&amp;`);
}

const problems = [];
let touched = 0;
let filesChanged = 0;
let wiredPages = 0;
const pendingByCpp = new Map(); // cpp id → page count waiting on a UUID

for (const file of collectHtmlFiles(ROOT_DIR, { skipDirs: SKIP_DIRS, skipFiles: ['404.html'] })) {
  let html = fs.readFileSync(file, 'utf8');
  const orig = html;
  const rel = path.relative(ROOT_DIR, file);
  const urlPath = toUrlPath(ROOT_DIR, file);
  const cpp = cppFor(urlPath);
  const want = cpp && cpp.ppid ? cpp.ppid : null;
  if (cpp && !cpp.ppid) pendingByCpp.set(cpp.id, (pendingByCpp.get(cpp.id) || 0) + 1);

  const anchors = [];
  for (const m of html.matchAll(/<a\b[^>]*href="[^"]*apps\.apple\.com[^"]*"[^>]*>/gi)) {
    // Own app + carries a campaign token = a CTA we measure. Everything else
    // (competitor store links, inline reference links) is editorial and must
    // never gain a ppid.
    if (/id6758438948/.test(m[0]) && PARAM_CT.test(m[0])) {
      anchors.push({ tag: m[0], index: m.index });
    }
  }
  if (!anchors.length) continue;

  for (const a of [...anchors].reverse()) {
    const next = applyPpid(a.tag, want);
    if (next === a.tag) continue;
    touched++;
    if (WRITE) {
      html = html.slice(0, a.index) + next + html.slice(a.index + a.tag.length);
    } else {
      const cur = (a.tag.match(PARAM_PPID) || [])[2];
      problems.push(want == null
        ? `${rel}: CTA carries ppid=${cur} but the page is not wired in data/cpp-map.json — run --write to remove it`
        : `${rel}: CTA ppid is ${cur ? `"${cur}"` : 'missing'}, map says ${want} (${cpp.id}) — run --write`);
    }
  }
  if (want != null) wiredPages++;

  if (WRITE && html !== orig) {
    fs.writeFileSync(file, html);
    filesChanged++;
  }
}

if (pendingByCpp.size) {
  const total = [...pendingByCpp.values()].reduce((a, b) => a + b, 0);
  console.log(`  note: ${total} page(s) across ${pendingByCpp.size} CPP(s) are mapped but waiting on a ppid UUID (TODO — owner input):`);
  for (const [id, n] of pendingByCpp) console.log(`    ${id}: ${n} page(s)`);
}

if (WRITE) {
  console.log(`done: ${touched} CTA(s) updated across ${filesChanged} file(s); ${wiredPages} page(s) fully wired`);
  process.exit(0);
}
problems.forEach((p) => console.log(`  ${p}`));
if (problems.length) {
  console.error(`FAIL: ${problems.length} CTA(s) drift from data/cpp-map.json — node scripts/apply-cpp-ppid.js --write`);
  process.exit(1);
}
console.log(`OK: CTAs match data/cpp-map.json (${wiredPages} page(s) wired with a ppid)`);
