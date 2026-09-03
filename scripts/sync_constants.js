#!/usr/bin/env node
/**
 * Single source of truth for drift-prone site values (rating, prices,
 * official names, © line) — data/site-constants.json.
 *
 *   node scripts/sync_constants.js --check   # CI: exit 1 on any drift
 *   node scripts/sync_constants.js --write   # rewrite drifted values in place
 *
 * The site is plain static HTML (no build step), so "constant reference"
 * means: detector regexes find every place OUR values are expressed, compare
 * them to the JSON, and --write propagates the JSON value. Comparison pages
 * quote competitor ratings/prices in the same formats, so every detector is
 * scoped to our own product:
 *   - JSON-LD offers are matched inside our own structured data (always ours)
 *   - visible rating pairs run only on pages whose numbers are all ours
 *   - visible prices run only inside pricing sections / plan cards
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-constants.json'), 'utf8'));

// Free-text rating/price enforcement only runs on pages whose numbers are
// exclusively OURS. Comparison pages (/vs/, listicles) legitimately quote
// competitor ratings/prices in identical formats and cannot be separated
// reliably by context, so they are governed via JSON-LD only.
const OWN_VALUE_PAGES = new Set([
  // /download/ shows the rating and the price table and names no competitor,
  // so every number on it is ours and belongs under enforcement.
  'download/index.html',
  // Both show our rating in a hero block (visible text + aria-label) and
  // neither quotes a competitor's rating or price, so free-text enforcement
  // is safe here. Until 2026-08-12 they were outside it, and both still read
  // 「21件の評価」 after the count moved to 22 — visibly contradicting their
  // own JSON-LD.
  'ai-tags/index.html', 'en/ai-tags/index.html',
  'captio-alternative/index.html', 'en/captio-alternative/index.html',
  'index.html', 'en/index.html', 'voices/index.html',
  'ar/index.html', 'es/index.html', 'id/index.html', 'ko/index.html',
  'pt-BR/index.html', 'tr/index.html', 'zh/index.html', 'zh-Hant/index.html',
]);

// [description, regex, canonicalReplacement, needsBrandContext]
const RULES = [
  // JSON-LD: our own offers — always authoritative
  ['JSON-LD monthly offer price',
    /("name":\s?"Premium Monthly"[^}]{0,400}?"price":\s?")(\d+)(")/gs,
    (m, a, v, b) => a + C.priceMonthlyJpy + b, false],
  ['JSON-LD yearly offer price',
    /("name":\s?"Premium Yearly"[^}]{0,400}?"price":\s?")(\d+)(")/gs,
    (m, a, v, b) => a + C.priceYearlyJpy.replace(',', '') + b, false],
  // JSON-LD aggregateRating on our own app node.
  //
  // Anchored on the `#app` @id, not on the shape of the aggregateRating,
  // because /en/send-email-to-yourself/ publishes an ItemList carrying two
  // COMPETITORS' ratings (Boomerang 4.9/206, Note To Self Mail 4.8/360) in
  // byte-identical markup. Those nodes have no @id at all, ours always does,
  // and that is the only thing separating them.
  //
  // Until 2026-08-12 nothing enforced these blocks: the visible-rating rules
  // below only run on OWN_VALUE_PAGES and the offers rules only match prices,
  // so the structured rating — the copy Google actually reads — was the one
  // number on the site free to drift.
  //
  // The `(?!"@type":\s?"SoftwareApplication")` guard is load-bearing, and it
  // was added after this rule nearly corrupted a competitor's data. Our node
  // on /en/send-email-to-yourself/ carries no aggregateRating of its own, so
  // a forward scan from its @id ran straight past it into the NEXT app in the
  // ItemList and offered to rewrite Boomerang's 4.9/206 to our 4.4/22.
  // Refusing to cross another SoftwareApplication boundary makes the rule mean
  // what it says: the rating belonging to the app whose @id we just matched.
  //
  // 4000 is the bound on the gap: the widest real span is 3,036 chars
  // (en/index.html, whose #app node carries a long description plus
  // featureList before the rating). Whitespace is optional throughout —
  // two of the blocks ship minified.
  ['JSON-LD aggregateRating on #app',
    /("@id":\s?"https:\/\/simplememofast\.com\/#app"(?:(?!"@type":\s?"SoftwareApplication")[\s\S]){0,4000}?"aggregateRating"[\s\S]{0,120}?"ratingValue":\s?")(\d\.\d)("[\s\S]{0,200}?"ratingCount":\s?")(\d+)(")/g,
    (m, a, rv, b, rc, c) => a + C.ratingValue + b + C.ratingCount + c, false],
  // Visible rating pairs (value + count in one phrase), ours only
  // mid part may cross inline tags (<strong>4.4</strong> … 10件の評価)
  ['rating pair JA 「4.4…10件の評価」',
    /(\d\.\d)((?:[^{}\d]|<[^>]+>|\d(?!件の評価)){0,90}?)(\d+)(件の評価)/g,
    (m, v, mid, n, tail) => C.ratingValue + mid + C.ratingCount + tail, 'own'],
  ['rating pair EN "4.4 … 10 ratings"',
    /(\d\.\d)((?:[^{}\d]|<[^>]+>|\d(?! ratings)){0,90}?)(\d+)( ratings\b)/g,
    (m, v, mid, n, tail) => C.ratingValue + mid + C.ratingCount + tail, 'own'],
  // Visible prices: enforced ONLY inside pricing sections / plan cards —
  // anywhere else on a page ($X vs competitor) prices may be editorial.
  ['JPY monthly (月額N円 / ¥N/月)',
    /(月額|¥)(\d{3})(円|\/月)/g,
    (m, a, v, b) => a + C.priceMonthlyJpy + b, 'pricing'],
  ['JPY yearly (年額N円 / ¥N/年)',
    /(年額|¥)(\d{1,2},?\d{3})(円|\/年)/g,
    (m, a, v, b) => a + C.priceYearlyJpy + b, 'pricing'],
  ['USD monthly $N/mo',
    /(\$)(\d\.\d{2})(\s*\/\s*(?:mo\b|month))/g,
    (m, a, v, b) => a + C.priceMonthlyUsd + b, 'pricing'],
  ['USD yearly $N/yr',
    /(\$)(\d{2}\.\d{2})(\s*\/\s*(?:yr\b|year))/g,
    (m, a, v, b) => a + C.priceYearlyUsd + b, 'pricing'],
  // JSON-LD softwareVersion — our own SoftwareApplication entity, always ours.
  // Added 2026-08-09: 12 blocks still declared 3.9 while the app had moved on
  // by roughly four releases. Nothing enforced it, so the value could only ever
  // drift further. It is one field in site-constants.json now.
  ['JSON-LD softwareVersion',
    /("softwareVersion":\s?")([^"]+)(")/g,
    (m, a, v, b) => a + C.appVersion + b, false],
  // © line — unified string, unambiguous
  ['© line',
    /((?:©|&copy;)\s?2026[^<\n]{0,200})(?=<\/p>|\n|<\/div>)/g,
    () => C.copyrightLine, false],
];

/**
 * llms.txt is not HTML, so it never passes through the walker below — and it is
 * the single most important place for this value to be right, because it exists
 * specifically to stop AI assistants inventing facts about the app. A stale
 * version there is authoritative-looking misinformation, which is worse than
 * saying nothing. Its own instruction ("Do NOT infer or extrapolate … version
 * numbers beyond these published values") is what gives the wrong number teeth.
 */
/**
 * 「as of」の日付は、**この行が名乗る事実のうち最も古い確認日**にする。
 *
 * 2026-08-22、5.8.1 の反映でこの穴が実際に出た: version だけを書き換える
 * 規則だったので、リリース当日に llms.txt が
 *   「**Current facts (as of 2026-08-09):** version 5.8.1」
 * になった。**リリースの13日前に 5.8.1 が現行だったと名乗る**形で、
 * この文書の冒頭が警告している「権威ありげな誤情報」そのもの。
 *
 * 今日の日付にはしない。この行はバージョンだけでなく評価・価格も名乗るので、
 * **一番古い事実より新しい鮮度を主張できない。**（評価が10日前なら、
 * バージョンを今日更新しても、この行全体としては10日前が正しい）
 */
function stampDate(c = C) {
  const dates = [c.appVersionNote, c.ratingNote, c.priceNote]
    .map((n) => {
      const all = [...String(n || '').matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]).sort();
      return all.length ? all[all.length - 1] : null;
    })
    .filter(Boolean)
    .sort();
  return dates.length ? dates[0] : null;
}

const LLMS_RULES = [
  ['llms.txt Current facts version',
    /(\*\*Current facts \(as of )(\d{4}-\d{2}-\d{2})(\):\*\* version )([0-9][0-9.]*)/,
    (m, a, d, b, v) => a + (stampDate() || d) + b + C.appVersion],
  ['llms.txt rating',
    /(App Store rating )(\d\.\d)( \()(\d+)( ratings\))/,
    (m, a, rv, b, rc, c) => a + C.ratingValue + b + C.ratingCount + c],
];

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const SELFTEST = args.has('--selftest');
if (!WRITE && !args.has('--check') && !SELFTEST) {
  console.error('usage: sync_constants.js --check | --write | --selftest');
  process.exit(2);
}

function* htmlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}

/**
 * Prove the detectors discriminate — and, more importantly, that they refuse
 * to touch a competitor's numbers.
 *
 * data/check-selftests.json: "落ちることを確かめていない検査は、無いのと同じ".
 * Wired into seo-check.yml directly because check-selftests.mjs enumerates
 * `.mjs` only and cannot see this `.js` file — act-ci-selftest-ratchet-js-blind.
 *
 * The aggregateRating case is not hypothetical: without the
 * `(?!"@type":"SoftwareApplication")` guard this rule offered to rewrite
 * Boomerang's 4.9/206 to our own numbers on /en/send-email-to-yourself/,
 * because our node there carries no aggregateRating and a forward scan ran
 * straight into the next app in the ItemList. A detector that edits someone
 * else's structured data is worse than no detector at all.
 */
if (SELFTEST) {
  const failures = [];
  const t = (name, cond) => { if (!cond) failures.push(name); };
  const ruleBy = (name) => RULES.find((r) => r[0] === name);
  /** Apply one rule the way the main body does, and report what changed. */
  const apply = (name, html) => {
    const [, re, build] = ruleBy(name);
    return html.replace(new RegExp(re.source, re.flags), build);
  };

  // --- 他社のデータを書き換えないこと（この検査の一番重い仕事） ---
  const ourNodeNoRating = '{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication","name":"x"}';
  const rivalNode = '{"@type":"SoftwareApplication","name":"Boomerang","aggregateRating":{"ratingValue":"4.9","ratingCount":"206"}}';
  const itemList = `[${ourNodeNoRating},${rivalNode}]`;
  t('自社ノードに評価が無いとき、隣の他社の評価へ回り込まない',
    apply('JSON-LD aggregateRating on #app', itemList) === itemList);
  t('他社の 4.9/206 がそのまま残る', /"4\.9"[\s\S]*"206"/.test(apply('JSON-LD aggregateRating on #app', itemList)));

  // --- 自社ノードの評価は書き換えること（守るだけで直さないと意味が無い） ---
  const ourNodeStale = '{"@id":"https://simplememofast.com/#app","aggregateRating":{"ratingValue":"1.0","ratingCount":"1"}}';
  const fixed = apply('JSON-LD aggregateRating on #app', ourNodeStale);
  t('自社ノードの古い評価は台帳の値へ直す',
    fixed.includes(`"${C.ratingValue}"`) && fixed.includes(`"${C.ratingCount}"`) && !fixed.includes('"1.0"'));

  // --- 価格 ---
  t('自社の月額 offer を直す',
    apply('JSON-LD monthly offer price', '"name": "Premium Monthly","price": "1"').includes(String(C.priceMonthlyJpy)));
  // 検体は3桁にする。規則は `\d{3}` を要求しており、1桁の検体では**規則を殺しても
  // 通ってしまう**（この自己テストを書いたとき実際にそれで落ちた）。
  t('見える月額（月額N円）を直す',
    apply('JPY monthly (月額N円 / ¥N/月)', '月額999円') === `月額${C.priceMonthlyJpy}円`);
  t('月額の検体は台帳の値と別物であること（検査が空振りしない）', String(C.priceMonthlyJpy) !== '999');

  // --- 見える評価の対 ---
  const pair = apply('rating pair JA 「4.4…10件の評価」', '<strong>1.0</strong> · 1件の評価');
  t('見える評価の対（値と件数）を同時に直す',
    pair.includes(String(C.ratingValue)) && pair.includes(`${C.ratingCount}件の評価`));

  // --- 鮮度の日付。**一番古い事実より新しい鮮度を主張しない。** ---
  // 実際に起きた形: 版だけ新しい日付にしたら「リリースの13日前に 5.8.1 が現行」と名乗った。
  t('3つの注記のうち一番古い日付を採る',
    stampDate({ appVersionNote: '2026-09-01', ratingNote: '2026-08-20', priceNote: '2026-08-25' }) === '2026-08-20');
  t('1つの注記に複数の日付があれば、その中では新しい方を使う',
    stampDate({ appVersionNote: '2026-08-01 と 2026-09-01', ratingNote: '2026-09-02', priceNote: '2026-09-03' }) === '2026-09-01');
  t('日付がどこにも無ければ null（今日の日付を捏造しない）',
    stampDate({ appVersionNote: 'なし', ratingNote: '', priceNote: null }) === null);

  // --- 実データが通ること（合成検体だけだと本物が形を変えた日に気づかない） ---
  t('台帳の値が揃っている',
    [C.ratingValue, C.ratingCount, C.priceMonthlyJpy, C.appVersion].every((v) => v !== undefined && v !== null && String(v) !== ''));
  t('実データの stampDate が日付を返す', /^\d{4}-\d{2}-\d{2}$/.test(String(stampDate())));

  // ── ここから下は「規則を単体で当てる」では届かない門 ──────────────
  //
  // 上の検体は RULES の1本を取り出して `apply()` で当てるので、**ループ本体に
  // 掛かる門を1つも通らない。**2026-09-03 に隔離した写しで測ったところ、
  // 自社ページ限定・料金ゾーン限定・og:site_name・llms.txt の門をそれぞれ潰しても
  // **12件中0件失敗**（＝緑のまま）だった。どれも実害が外に出る門である。
  // 判定を scanHtml / scanLlms へ切り出し、ここから面ごと通す。
  const drift = (html, rel = 'fixture/x.html') => scanHtml(html, rel).findings;

  // 何も食い違っていない面が黙ることを先に固定する。これが無いと、
  // 以下の「落ちた」が雑音の上で成立している可能性を排除できない。
  const okPage = `<html lang="ja"><head><meta property="og:site_name" content="${C.appNameJa}">`
    + `</head><body><script type="application/ld+json">`
    + `{"@id":"https://simplememofast.com/#app",`
    + `"aggregateRating":{"ratingValue":"${C.ratingValue}","ratingCount":"${C.ratingCount}"},`
    + `"softwareVersion":"${C.appVersion}"}</script></body></html>`;
  t('正準値だけの面は何も言わない', drift(okPage).length === 0);

  // **見える評価は自社の値だけの面に限る。**外すと、比較ページに載っている
  // 競合の評価（4.9 / 206 など）を自社の値へ書き換えにいく。
  const visibleRating = '<p><strong>1.0</strong> ・ 1件の評価</p>';
  t('見える評価は比較ページでは見ない（競合の数字を書き換えない）',
    drift(visibleRating, 'vs/captio/index.html').length === 0);
  t('見える評価は自社値の面では見る', drift(visibleRating, 'index.html').length === 1);

  // **価格は料金セクションの中だけ。**外すと本文中の編集上の価格まで書き換える。
  t('価格は料金セクションの外では見ない', drift('<p>月額999円</p>').length === 0);
  t('価格は料金セクションの中では見る',
    drift('<section class="pricing"><p>月額999円</p></section>').length === 1);

  // og:site_name は2つの正式名のどちらかでなければならない。
  t('og:site_name が正式名でなければ落ちる',
    drift('<meta property="og:site_name" content="シンプルメモ">').length === 1);
  t('og:site_name が英語の正式名なら通る',
    drift(`<meta property="og:site_name" content="${C.appNameEn}">`).length === 0);

  // llms.txt は HTML の走査を通らないので、ここを見ないと丸ごと無検査になる。
  const llms = `**Current facts (as of ${stampDate()}):** version ${C.appVersion}\n`
    + `App Store rating ${C.ratingValue} (${C.ratingCount} ratings)\n`;
  t('llms.txt が正準値なら何も言わない', scanLlms(llms).findings.length === 0);
  t('llms.txt の version がずれていれば落ちる',
    scanLlms(llms.replace(`version ${C.appVersion}`, 'version 3.9')).findings.length === 1);
  // **当たらない規則は合格ではない。**文面が変われば、この値は誰にも管理されなくなる。
  t('llms.txt の文面が変わって規則が当たらなくなったら、通さずに落ちる',
    scanLlms('この文書には Current facts の行が無い\n').findings.length === LLMS_RULES.length);

  // --write と --check の別。書き換える側だけが本文を変える。
  const drifted = okPage.replace(`"ratingValue":"${C.ratingValue}"`, '"ratingValue":"9.9"');
  t('--write は正準値へ書き換える',
    scanHtml(drifted, 'fixture/x.html', { write: true }).out === okPage);
  t('--check は書き換えない', scanHtml(drifted, 'fixture/x.html').out === drifted);

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト 24 件中 ${failures.length} 件失敗`);
  process.exit(failures.length ? 1 : 0);
}

/**
 * 1面ぶんの検査。**disk を触らない。**
 *
 * ループ本体から切り出したのは、**自己テストがここを通れなかった**から。
 * 規則を1本ずつ単体で当てる検体（下の `apply()`）は RULES の中身しか見ないので、
 * ここに掛かる門 —— 自社ページ限定（`scope === 'own'`）・料金ゾーン限定
 * （`scope === 'pricing'`）・og:site_name —— を**1つも通らない。**
 * 2026-09-03 に隔離した写しで測ったところ、この3つと llms.txt の門を潰しても
 * 自己テストは 12件中0件失敗で緑のままだった。
 * 呼び出し側の挙動は切り出し前と同じ（`--check` / `--write` の出力が
 * バイト単位で一致することを確認してある）。
 */
function scanHtml(src, rel, { write = false } = {}) {
  const findings = [];
  // byte ranges of pricing sections / plan cards on this page
  const priceZones = [];
  for (const zm of src.matchAll(/<(?:section|div)[^>]*class="[^"]*(?:pricing|plan-summary)[^"]*"[^>]*>/g)) {
    priceZones.push([zm.index, Math.min(src.length, zm.index + 4000)]);
  }
  const inPriceZone = (i) => priceZones.some(([a, b]) => i >= a && i < b);
  for (const [desc, re, build, scope] of RULES) {
    if (scope === 'own' && !OWN_VALUE_PAGES.has(rel)) continue;
    src = src.replace(re, (...args2) => {
      const m = args2[0];
      const index = args2[args2.length - 2];
      if (scope === 'pricing' && !inPriceZone(index)) return m;
      const canonical = build(...args2);
      if (m === canonical) return m;
      findings.push(`${write ? 'fix' : 'DRIFT'}: ${rel}: ${desc}: ${JSON.stringify(m.slice(0, 60))} -> ${JSON.stringify(canonical.slice(0, 60))}`);
      return write ? canonical : m;
    });
  }
  // og:site_name must be one of the two official names
  for (const mm of src.matchAll(/og:site_name" content="([^"]+)"/g)) {
    if (mm[1] !== C.appNameJa && mm[1] !== C.appNameEn) {
      findings.push(`${write ? 'fix' : 'DRIFT'}: ${rel}: og:site_name: ${JSON.stringify(mm[1])}`);
      if (write) {
        const lang = /<html[^>]*lang="ja"/.test(src) ? C.appNameJa : C.appNameEn;
        src = src.replace(mm[0], `og:site_name" content="${lang}"`);
      }
    }
  }
  return { out: src, findings };
}

/**
 * llms.txt — same source of truth, different file type (see LLMS_RULES).
 *
 * **当たらない規則は「合格」ではなく「穴」。**文面が変わって規則がどこにも
 * 当たらなくなったとき黙って通すと、この値は誰にも管理されない状態になる。
 * ここも同じ理由で切り出した —— 自己テストが llms.txt を一度も通っていなかった。
 */
function scanLlms(src, { write = false } = {}) {
  const findings = [];
  for (const [desc, re, build] of LLMS_RULES) {
    if (!re.test(src)) {
      // A rule that matches nothing is a silent hole in the gate, not a pass.
      findings.push(`${write ? 'fix' : 'DRIFT'}: llms.txt: ${desc}: pattern not found — the file's wording changed, so this value is no longer enforced`);
      continue;
    }
    src = src.replace(re, (...a) => {
      const m = a[0];
      const canonical = build(...a);
      if (m === canonical) return m;
      findings.push(`${write ? 'fix' : 'DRIFT'}: llms.txt: ${desc}: ${JSON.stringify(m.slice(0, 60))} -> ${JSON.stringify(canonical.slice(0, 60))}`);
      return write ? canonical : m;
    });
  }
  return { out: src, findings };
}

let driftCount = 0;
let filesChanged = 0;
const report = [];

for (const file of htmlFiles(ROOT)) {
  const orig = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const { out, findings } = scanHtml(orig, rel, { write: WRITE });
  driftCount += findings.length;
  report.push(...findings);
  if (WRITE && out !== orig) {
    fs.writeFileSync(file, out);
    filesChanged++;
  }
}

{
  const llmsPath = path.join(ROOT, 'llms.txt');
  if (fs.existsSync(llmsPath)) {
    const orig = fs.readFileSync(llmsPath, 'utf8');
    const { out, findings } = scanLlms(orig, { write: WRITE });
    driftCount += findings.length;
    report.push(...findings);
    if (WRITE && out !== orig) { fs.writeFileSync(llmsPath, out); filesChanged++; }
  }
}

report.forEach((l) => console.log(l));
if (WRITE) {
  console.log(`done: ${driftCount} value(s) updated in ${filesChanged} file(s)`);
} else if (driftCount) {
  console.error(`FAIL: ${driftCount} value(s) drift from data/site-constants.json`);
  process.exit(1);
} else {
  console.log('OK: rating/price/©/og:site_name all match data/site-constants.json');
}
