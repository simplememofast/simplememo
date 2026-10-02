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
const { walkHtmlFiles } = require('./lib/site-files');

const ROOT = path.resolve(__dirname, '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site-constants.json'), 'utf8'));

// Free-text rating/price enforcement only runs on pages whose numbers are
// exclusively OURS. Comparison pages (/vs/, listicles) legitimately quote
// competitor ratings/prices in identical formats and cannot be separated
// reliably by context, so they are governed via JSON-LD only.
const OWN_VALUE_PAGES = new Set([
  // /download/ shows the rating and the price table and names no competitor,
  // so every number on it is ours and belongs under enforcement.
  'download/index.html', 'en/download/index.html',
  // Both show our rating in a hero block (visible text + aria-label) and
  // neither quotes a competitor's rating or price, so free-text enforcement
  // is safe here. Until 2026-08-12 they were outside it, and both still read
  // 「21件の評価」 after the count moved to 22 — visibly contradicting their
  // own JSON-LD.
  'ai-tags/index.html', 'en/ai-tags/index.html',
  'captio-alternative/index.html', 'en/captio-alternative/index.html',
  'index.html', 'en/index.html', 'voices/index.html', 'en/voices/index.html',
  'ar/index.html', 'es/index.html', 'id/index.html', 'ko/index.html',
  'pt-BR/index.html', 'tr/index.html', 'zh/index.html', 'zh-Hant/index.html',
]);

// [description, regex, canonicalReplacement, needsBrandContext]
const RULES = [
  // Legacy price patterns support original isolated RULE tests only.
  // Actual JSON-LD pricing requires admitted direct own-app offers and currency.
  ['JSON-LD monthly offer price',
    /("name":\s?"Premium Monthly"[^}]{0,400}?"price":\s?")(\d+)(")/gs,
    (m, a, v, b) => a + C.priceMonthlyJpy + b, 'app-price-monthly'],
  ['JSON-LD yearly offer price',
    /("name":\s?"Premium Yearly"[^}]{0,400}?"price":\s?")(\d+)(")/gs,
    (m, a, v, b) => a + C.priceYearlyJpy.replace(',', '') + b, 'app-price-yearly'],
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
  ['rating pair JA compact summary',
    /(★\s*)(\d\.\d)(\s*[・·]\s*)(\d+)(件)(?=[）)])/g,
    (m, star, value, middle, count, label) => star + C.ratingValue + middle + C.ratingCount + label, 'own'],
  // Localized hero ratings use the same source as JSON-LD. Keep the star
  // and translated count label intact, and retain the own-page boundary.
  ['rating pair localized hero',
    /(★\s*)(\d(?:\.\d+)?)([^<\d]{0,60})(\d+)(\s*(?:تقييمات|valoraciones|ulasan|개|avaliações|değerlendirme|則評分|个评分))/g,
    (m, star, value, middle, count, label) => star + C.ratingValue + middle + C.ratingCount + label, 'own'],
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
    (m, a, v, b) => a + C.appVersion + b, 'app-version'],
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
// Each published fact carries its own verification date. A shared "as of"
// date can predate a newly released version when the price was checked earlier.
function latestDate(note) {
  const dates = [...String(note || '').matchAll(/(\d{4}-\d{2}-\d{2})/g)]
    .map((m) => m[1]).sort();
  return dates.at(-1) || null;
}

const LLMS_RULES = [
  ['llms.txt public version and verification date',
    /(Japan App Store version )([0-9][0-9.]*)( \(verified )(\d{4}-\d{2}-\d{2})(\))/,
    (m, a, v, b, date, c) => a + C.appVersion + b + (latestDate(C.appVersionNote) || date) + c],
  ['llms.txt rating and verification date',
    /(Japan App Store rating )(\d\.\d)( \()(\d+)( ratings; verified )(\d{4}-\d{2}-\d{2})(\))/,
    (m, a, rv, b, rc, c, date, d) => a + C.ratingValue + b + C.ratingCount + c + (latestDate(C.ratingNote) || date) + d],
  ['llms.txt Japan prices and confirmation date',
    /(Premium ¥)(\d+)(\/mo or ¥)([\d,]+)(\/yr \(owner-confirmed )(\d{4}-\d{2}-\d{2})(\))/,
    (m, a, monthly, b, yearly, c, date, d) => a + C.priceMonthlyJpy + b + C.priceYearlyJpy + c + (latestDate(C.priceNote) || date) + d],
];

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const SELFTEST = args.has('--selftest');
if (!WRITE && !args.has('--check') && !SELFTEST) {
  console.error('usage: sync_constants.js --check | --write | --selftest');
  process.exit(2);
}

function* htmlFiles(dir) {
  yield* walkHtmlFiles(dir, { skipDirs: ['node_modules'], tolerateReadErrors: false });
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

  // --- Date provenance is per field, including owner-confirmed prices. ---
  t('複数の日付を含む注記は最新の確認日を使う',
    latestDate('2026-08-01 と 2026-09-01') === '2026-09-01');
  t('価格の確認日を公開版の確認日へ流用しない',
    latestDate('version checked 2026-09-28') !== latestDate('price confirmed 2026-09-22'));
  t('日付が無ければ null（今日の日付を捏造しない）', latestDate('なし') === null);

  // --- 実データが通ること（合成検体だけだと本物が形を変えた日に気づかない） ---
  t('台帳の値が揃っている',
    [C.ratingValue, C.ratingCount, C.priceMonthlyJpy, C.appVersion].every((v) => v !== undefined && v !== null && String(v) !== ''));
  t('実データの版・評価・価格に個別の確認日がある',
    [C.appVersionNote, C.ratingNote, C.priceNote]
      .every((note) => /^\d{4}-\d{2}-\d{2}$/.test(String(latestDate(note)))));

  // ── ここから下は「規則を単体で当てる」では届かない門 ──────────────
  //
  // 上の検体は RULES の1本を取り出して `apply()` で当てるので、**ループ本体に
  // 掛かる門を1つも通らない。**2026-09-03 に隔離した写しで測ったところ、
  // 自社ページ限定・料金ゾーン限定・og:site_name・llms.txt の門をそれぞれ潰しても
  // **12件中0件失敗**（＝緑のまま）だった。どれも実害が外に出る門である。
  // 判定を scanHtml / scanLlms へ切り出し、ここから面ごと通す。
  const drift = (html, rel = 'fixture/x.html') => scanHtml(html, rel).findings;
  const englishCopyright = `<p>${C.copyrightLineEn}</p>`;
  t('英語ページの著作権表記を日本語へ戻さない', drift(englishCopyright, 'en/fixture.html').length === 0);
  t('英語ページの古い著作権表記も同期する',
    scanHtml('<p>© 2026 Old Name</p>', 'en/fixture.html', { write: true }).out === englishCopyright);

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

  // Review quotations remain historical; only the surrounding aggregate
  // rating pair follows the ledger. Exercise the formerly omitted pages.
  const reviewQuote = '<blockquote>Five stars. Input is smooth.</blockquote>';
  const voiceSummary = '<p>公開レビュー（★1.0・1件）</p>' + reviewQuote;
  const enVoiceSummary = '<meta content="App Store review (★1.0 from 1 ratings)">' + reviewQuote;
  const enDownload = '<p>App Store 1.0 (1 ratings)</p>';
  for (const [rel, html, expected] of [
    ['voices/index.html', voiceSummary, `<p>公開レビュー（★${C.ratingValue}・${C.ratingCount}件）</p>` + reviewQuote],
    ['en/voices/index.html', enVoiceSummary, `<meta content="App Store review (★${C.ratingValue} from ${C.ratingCount} ratings)">` + reviewQuote],
    ['en/download/index.html', enDownload, `<p>App Store ${C.ratingValue} (${C.ratingCount} ratings)</p>`],
  ]) {
    t(`${rel}: omitted aggregate form fails`, drift(html, rel).length === 1);
    t(`${rel}: sync fixes aggregate without rewriting quote`, scanHtml(html, rel, { write: true }).out === expected);
    t(`${rel}: corrected form passes`, drift(expected, rel).length === 0);
    t(`${rel}: same form on competitor page is untouched`, scanHtml(html, 'vs/competitor/index.html', { write: true }).out === html);
  }

  const localizedRatings = [
    ["ar", "★ 1.0 (1 تقييمات في App Store)"],
    ["es", "★ 1.0 · 1 valoraciones en App Store"],
    ["id", "★ 1.0 · 1 ulasan di App Store"],
    ["ko", "★ 1.0 · App Store 평가 1개"],
    ["pt-BR", "★ 1.0 · 1 avaliações na App Store"],
    ["tr", "★ 1.0 · App Store'da 1 değerlendirme"],
    ["zh-Hant", "★ 1.0 · App Store 1 則評分"],
    ["zh", "★ 1.0 · App Store 1 个评分"],
  ];
  for (const [locale, label] of localizedRatings) {
    const html = `<p>${label}</p>`;
    const rel = `${locale}/index.html`;
    t(`${locale}: stale visible rating fails`, drift(html, rel).length === 1);
    const fixed = scanHtml(html, rel, { write: true }).out;
    const expected = html.replace('1.0', C.ratingValue).replace(/(?<![\d.])1(?![\d.])/, C.ratingCount);
    t(`${locale}: write preserves translation and updates both values`, fixed === expected);
    t(`${locale}: synchronized rating passes`, drift(fixed, rel).length === 0);
    t(`${locale}: competitor rating is untouched`,
      scanHtml(html, `${locale}/vs/competitor/index.html`, { write: true }).out === html);
  }

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
  const llms = `Japan App Store version ${C.appVersion} (verified ${latestDate(C.appVersionNote)})\n`
    + `Japan App Store rating ${C.ratingValue} (${C.ratingCount} ratings; verified ${latestDate(C.ratingNote)})\n`
    + `Premium ¥${C.priceMonthlyJpy}/mo or ¥${C.priceYearlyJpy}/yr (owner-confirmed ${latestDate(C.priceNote)})\n`;
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


  let versionSelftestCount = 0;
  const vt = (name, condition) => { versionSelftestCount++; t(name, condition); };

  // Version scope is the direct own entity, never nearby text or an ancestor.
  const versionTag = (body, quote = '"') => '<script type=' + quote + 'application/ld+json' + quote + '>' + body + '</script>';
  const ownVersion = '{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication","softwareVersion":"0.0"}';
  const correctVersion = ownVersion.replace('"0.0"', JSON.stringify(C.appVersion));
  const rivalVersion = '{"@type":"SoftwareApplication","@id":"https://fixture.invalid/rival","name":"Other memo","softwareVersion":"2.3"}';
  const vscan = (html, write = false) => scanHtml(html, 'vs/fixture/index.html', { write });
  vt('version: stale own entity is detected', vscan(versionTag(ownVersion)).findings.length === 1);
  vt('version: writer changes only own token', vscan(versionTag(ownVersion), true).out === versionTag(correctVersion));
  vt('version: check leaves stale bytes intact', vscan(versionTag(ownVersion)).out === versionTag(ownVersion));
  vt('version: canonical own entity is quiet', vscan(versionTag(correctVersion)).findings.length === 0);
  vt('version: competitor entity is quiet', vscan(versionTag(rivalVersion)).findings.length === 0);
  vt('version: competitor writer is byte-identical', vscan(versionTag(rivalVersion), true).out === versionTag(rivalVersion));
  vt('version: mixed own-first keeps rival bytes',
    vscan(versionTag('[' + ownVersion + ',' + rivalVersion + ']'), true).out === versionTag('[' + correctVersion + ',' + rivalVersion + ']'));
  vt('version: mixed rival-first keeps rival bytes',
    vscan(versionTag('[' + rivalVersion + ',' + ownVersion + ']'), true).out === versionTag('[' + rivalVersion + ',' + correctVersion + ']'));
  vt('version: graph nesting retains entity boundary',
    vscan(versionTag('{"@graph":[' + rivalVersion + ',' + ownVersion + ']}'), true).out === versionTag('{"@graph":[' + rivalVersion + ',' + correctVersion + ']}'));
  const reverseVersion = '{"softwareVersion":"0.0","name":"Own","@type":"SoftwareApplication","@id":"https://simplememofast.com/#app"}';
  vt('version: version-before-identity is still own',
    vscan(versionTag(reverseVersion), true).out === versionTag(reverseVersion.replace('"0.0"', JSON.stringify(C.appVersion))));
  const spacedVersion = '{ "@type" : "SoftwareApplication", "@id" : "https://simplememofast.com/#app", "softwareVersion":   "0.0" }';
  vt('version: whitespace stays byte-exact outside value',
    vscan(versionTag(spacedVersion), true).out === versionTag(spacedVersion.replace('"0.0"', JSON.stringify(C.appVersion))));
  const nestedRival = '{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication","item":' + rivalVersion + '}';
  vt('version: own parent does not own nested rival', vscan(versionTag(nestedRival), true).out === versionTag(nestedRival));
  const nonApp = ownVersion.replace('SoftwareApplication', 'WebPage');
  vt('version: same id with non-app type is untouched', vscan(versionTag(nonApp), true).out === versionTag(nonApp));
  const noId = '{"@type":"SoftwareApplication","softwareVersion":"0.0"}';
  vt('version: identity missing is not inferred', vscan(versionTag(noId), true).out === versionTag(noId));
  vt('version: JSON outside JSON-LD is untouched', vscan(ownVersion, true).out === ownVersion);
  const malformed = versionTag(ownVersion.slice(0, -1));
  vt('version: malformed JSON-LD is not rewritten', vscan(malformed, true).out === malformed);
  const duplicateId = '{"@id":"https://simplememofast.com/#app","@id":"https://fixture.invalid/rival","@type":"SoftwareApplication","softwareVersion":"0.0"}';
  vt('version: duplicate id is not admitted', vscan(versionTag(duplicateId), true).out === versionTag(duplicateId));
  const duplicateVersion = ownVersion.slice(0, -1) + ',"softwareVersion":"2.3"}';
  vt('version: duplicate version is not admitted', vscan(versionTag(duplicateVersion), true).out === versionTag(duplicateVersion));
  const quoted = '{"description":"quoted \\"{ sibling }\\" text","@type":"SoftwareApplication","softwareVersion":"0.0","@id":"https://simplememofast.com/#app"}';
  vt('version: quoted braces do not cross object boundaries',
    vscan(versionTag(quoted), true).out === versionTag(quoted.replace('"0.0"', JSON.stringify(C.appVersion))));
  const noVersion = '{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication"}';
  vt('version: absent own version never reaches next rival',
    vscan(versionTag('[' + noVersion + ',' + rivalVersion + ']'), true).out === versionTag('[' + noVersion + ',' + rivalVersion + ']'));
  const ordinaryScript = '<script type="application/json">' + ownVersion + '</script>';
  vt('version: other script type is untouched', vscan(ordinaryScript, true).out === ordinaryScript);
  const arrayType = ownVersion.replace('"SoftwareApplication"', '["SoftwareApplication"]');
  vt('version: unqualified array type stays untouched', vscan(versionTag(arrayType), true).out === versionTag(arrayType));
  const numericVersion = ownVersion.replace('"0.0"', '0');
  vt('version: numeric version stays untouched', vscan(versionTag(numericVersion), true).out === versionTag(numericVersion));
  vt('version: single-quoted script type is admitted',
    vscan(versionTag(ownVersion, "'"), true).out === versionTag(correctVersion, "'"));


  const escapedDuplicateId = '{"@id":"https://simplememofast.com/#app","@\\u0069d":"https://fixture.invalid/rival","@type":"SoftwareApplication","softwareVersion":"0.0"}';
  vt('version: escaped duplicate id is not admitted',
    vscan(versionTag(escapedDuplicateId), true).out === versionTag(escapedDuplicateId));
  const escapedDuplicateVersion = ownVersion.slice(0, -1) + ',"software\\u0056ersion":"2.3"}';
  vt('version: escaped duplicate version is not admitted',
    vscan(versionTag(escapedDuplicateVersion), true).out === versionTag(escapedDuplicateVersion));


  // Independent exact expected strings for the four parser/regex divergence
  // cases. Only the actual scanHtml writer is called; no parser oracle reuse.
  const colonSpacedVersion = ownVersion.replace('"softwareVersion":', '"softwareVersion" : ');
  const colonSpacedExpected = colonSpacedVersion.replace('"0.0"', JSON.stringify(C.appVersion));
  vt('version span: colon-before whitespace is detected',
    vscan(versionTag(colonSpacedVersion)).findings.length === 1);
  vt('version span: colon-before whitespace writer preserves other bytes',
    vscan(versionTag(colonSpacedVersion), true).out === versionTag(colonSpacedExpected));
  const escapedKeyVersion = ownVersion.replace('softwareVersion', 'software\\u0056ersion');
  const escapedKeyExpected = escapedKeyVersion.replace('"0.0"', JSON.stringify(C.appVersion));
  vt('version span: single escaped key is detected',
    vscan(versionTag(escapedKeyVersion)).findings.length === 1);
  vt('version span: single escaped key writer preserves key bytes',
    vscan(versionTag(escapedKeyVersion), true).out === versionTag(escapedKeyExpected));
  const emptyVersion = ownVersion.replace('"0.0"', '""');
  const emptyExpected = ownVersion.replace('"0.0"', JSON.stringify(C.appVersion));
  vt('version span: empty string is detected',
    vscan(versionTag(emptyVersion)).findings.length === 1);
  vt('version span: empty string writer changes only complete token',
    vscan(versionTag(emptyVersion), true).out === versionTag(emptyExpected));
  const quotedVersion = ownVersion.replace('"0.0"', '"0.0\\\"beta"');
  const quotedExpected = ownVersion.replace('"0.0"', JSON.stringify(C.appVersion));
  vt('version span: escaped quote string is detected',
    vscan(versionTag(quotedVersion)).findings.length === 1);
  const quotedWritten = vscan(versionTag(quotedVersion), true).out;
  vt('version span: escaped quote writer preserves valid JSON and other bytes',
    quotedWritten === versionTag(quotedExpected) &&
    JSON.parse(quotedWritten.slice(quotedWritten.indexOf('>') + 1, quotedWritten.indexOf('</script>'))).softwareVersion === C.appVersion);


  // Price ownership cases use explicit inputs and expected source-ledger values,
  // not the parser/ownership implementation as their oracle.
  let priceSelftestCount = 0;
  const pt = (name, condition) => { priceSelftestCount++; t(name, condition); };
  const priceFixtureTag = (body) => '<script type="application/ld+json">' + body + '</script>';
  const priceFixtureApp = (offers) => '{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication","offers":' + offers + '}';
  const priceFixtureRival = (offers) => '{"@id":"https://fixture.invalid/rival","@type":"SoftwareApplication","offers":' + offers + '}';
  const priceFixtureOffer = (name, currency, raw) => '{"@type":"Offer","name":' + JSON.stringify(name) + ',"price":' + raw + ',"priceCurrency":' + JSON.stringify(currency) + '}';
  const pmj = priceFixtureOffer('Premium Monthly', 'JPY', '"1"');
  const pyj = priceFixtureOffer('Premium Yearly', 'JPY', '"1"');
  const pmu = priceFixtureOffer('Premium Monthly', 'USD', '"1.25"');
  const pyu = priceFixtureOffer('Premium Yearly', 'USD', '"1.25"');
  const pmjOk = priceFixtureOffer('Premium Monthly', 'JPY', JSON.stringify(C.priceMonthlyJpy));
  const pyjOk = priceFixtureOffer('Premium Yearly', 'JPY', JSON.stringify(C.priceYearlyJpy.replace(',', '')));
  const pmuOk = priceFixtureOffer('Premium Monthly', 'USD', JSON.stringify(C.priceMonthlyUsd));
  const pyuOk = priceFixtureOffer('Premium Yearly', 'USD', JSON.stringify(C.priceYearlyUsd));

  const priceCases = [
    { name: "price: own JPY monthly check detects", input: priceFixtureTag(priceFixtureApp(pmj)), expected: priceFixtureTag(priceFixtureApp(pmj)), drifts: 1, unknown: false, write: false },
    { name: "price: own JPY monthly writer", input: priceFixtureTag(priceFixtureApp(pmj)), expected: priceFixtureTag(priceFixtureApp(pmjOk)), drifts: 1, unknown: false, write: true },
    { name: "price: own JPY yearly writer", input: priceFixtureTag(priceFixtureApp(pyj)), expected: priceFixtureTag(priceFixtureApp(pyjOk)), drifts: 1, unknown: false, write: true },
    { name: "price: own USD monthly decimal writer", input: priceFixtureTag(priceFixtureApp(pmu)), expected: priceFixtureTag(priceFixtureApp(pmuOk)), drifts: 1, unknown: false, write: true },
    { name: "price: own USD yearly decimal writer", input: priceFixtureTag(priceFixtureApp(pyu)), expected: priceFixtureTag(priceFixtureApp(pyuOk)), drifts: 1, unknown: false, write: true },
    { name: "price: string token kind preserved", input: priceFixtureTag(priceFixtureApp(pmu)), expected: priceFixtureTag(priceFixtureApp(pmuOk)), drifts: 1, unknown: false, write: true },
    { name: "price: numeric JPY token kind preserved", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY','1'))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',C.priceMonthlyJpy))), drifts: 1, unknown: false, write: true },
    { name: "price: numeric USD decimal token kind preserved", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','USD','1.25'))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','USD',C.priceMonthlyUsd))), drifts: 1, unknown: false, write: true },
    { name: "price: direct offers array owns both plans", input: priceFixtureTag(priceFixtureApp('[' + pmj + ',' + pyj + ']')), expected: priceFixtureTag(priceFixtureApp('[' + pmjOk + ',' + pyjOk + ']')), drifts: 2, unknown: false, write: true },
    { name: "price: mixed check reports own only", input: priceFixtureTag('{"@graph":[' + priceFixtureApp(pmj) + ',' + priceFixtureRival(pmj) + ']}'), expected: priceFixtureTag('{"@graph":[' + priceFixtureApp(pmj) + ',' + priceFixtureRival(pmj) + ']}'), drifts: 1, unknown: false, write: false },
    { name: "price: mixed writer preserves rival bytes", input: priceFixtureTag('{"@graph":[' + priceFixtureApp(pmj) + ',' + priceFixtureRival(pmj) + ']}'), expected: priceFixtureTag('{"@graph":[' + priceFixtureApp(pmjOk) + ',' + priceFixtureRival(pmj) + ']}'), drifts: 1, unknown: false, write: true },
    { name: "price: rival same plan untouched", input: priceFixtureTag(priceFixtureRival(pmj)), expected: priceFixtureTag(priceFixtureRival(pmj)), drifts: 0, unknown: false, write: true },
    { name: "price: bare descendant cannot inherit ownership", input: priceFixtureTag('{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication","extra":' + pmj + '}'), expected: priceFixtureTag('{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication","extra":' + pmj + '}'), drifts: 0, unknown: false, write: true },
    { name: "price: sibling Offer cannot inherit ownership", input: priceFixtureTag('{"@graph":[{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication"},' + pmj + ']}'), expected: priceFixtureTag('{"@graph":[{"@id":"https://simplememofast.com/#app","@type":"SoftwareApplication"},' + pmj + ']}'), drifts: 0, unknown: false, write: true },
    { name: "price: nested genuine own app independent", input: priceFixtureTag('{"@id":"https://fixture.invalid/rival","@type":"SoftwareApplication","offers":' + pmj + ',"nested":' + priceFixtureApp(pyu) + '}'), expected: priceFixtureTag('{"@id":"https://fixture.invalid/rival","@type":"SoftwareApplication","offers":' + pmj + ',"nested":' + priceFixtureApp(pyuOk) + '}'), drifts: 1, unknown: false, write: true },
    { name: "price: missing app identity untouched", input: priceFixtureTag('{"@type":"SoftwareApplication","offers":' + pmj + '}'), expected: priceFixtureTag('{"@type":"SoftwareApplication","offers":' + pmj + '}'), drifts: 0, unknown: false, write: true },
    { name: "price: own marker non-app type unknown", input: priceFixtureTag(priceFixtureApp(pmj).replace('"SoftwareApplication"','"WebPage"')), expected: priceFixtureTag(priceFixtureApp(pmj).replace('"SoftwareApplication"','"WebPage"')), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate app id unknown", input: priceFixtureTag(priceFixtureApp(pmj).replace('"@id":"https://simplememofast.com/#app"', '"@id":"https://simplememofast.com/#app","@id":"https://fixture.invalid/rival"')), expected: priceFixtureTag(priceFixtureApp(pmj).replace('"@id":"https://simplememofast.com/#app"', '"@id":"https://simplememofast.com/#app","@id":"https://fixture.invalid/rival"')), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate app type unknown", input: priceFixtureTag(priceFixtureApp(pmj).replace('"@type":"SoftwareApplication"', '"@type":"SoftwareApplication","@type":"SoftwareApplication"')), expected: priceFixtureTag(priceFixtureApp(pmj).replace('"@type":"SoftwareApplication"', '"@type":"SoftwareApplication","@type":"SoftwareApplication"')), drifts: 0, unknown: true, write: true },
    { name: "price: array app type unknown", input: priceFixtureTag(priceFixtureApp(pmj).replace('"SoftwareApplication"','["SoftwareApplication"]')), expected: priceFixtureTag(priceFixtureApp(pmj).replace('"SoftwareApplication"','["SoftwareApplication"]')), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate offers property unknown", input: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1) + ',"offers":' + pyj + '}'), expected: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1) + ',"offers":' + pyj + '}'), drifts: 0, unknown: true, write: true },
    { name: "price: malformed direct collection unknown", input: priceFixtureTag(priceFixtureApp('[' + pmj + ',0]')), expected: priceFixtureTag(priceFixtureApp('[' + pmj + ',0]')), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate plan currency unknown", input: priceFixtureTag(priceFixtureApp('[' + pmj + ',' + pmj + ']')), expected: priceFixtureTag(priceFixtureApp('[' + pmj + ',' + pmj + ']')), drifts: 0, unknown: true, write: true },
    { name: "price: same plan distinct currencies admitted", input: priceFixtureTag(priceFixtureApp('[' + pmj + ',' + pmu + ']')), expected: priceFixtureTag(priceFixtureApp('[' + pmjOk + ',' + pmuOk + ']')), drifts: 2, unknown: false, write: true },
    { name: "price: unsupported currency unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','EUR','"1"'))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','EUR','"1"'))), drifts: 0, unknown: true, write: true },
    { name: "price: missing currency unknown", input: priceFixtureTag(priceFixtureApp(pmj.replace(',"priceCurrency":"JPY"',''))), expected: priceFixtureTag(priceFixtureApp(pmj.replace(',"priceCurrency":"JPY"',''))), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate currency unknown", input: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"priceCurrency":"USD"}')), expected: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"priceCurrency":"USD"}')), drifts: 0, unknown: true, write: true },
    { name: "price: missing price unknown", input: priceFixtureTag(priceFixtureApp(pmj.replace(',"price":"1"',''))), expected: priceFixtureTag(priceFixtureApp(pmj.replace(',"price":"1"',''))), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate price unknown", input: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"price":"2"}')), expected: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"price":"2"}')), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate name unknown", input: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"name":"Premium Monthly"}')), expected: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"name":"Premium Monthly"}')), drifts: 0, unknown: true, write: true },
    { name: "price: duplicate Offer type unknown", input: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"@type":"Offer"}')), expected: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"@type":"Offer"}')), drifts: 0, unknown: true, write: true },
    { name: "price: escaped duplicate price unknown", input: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"pri\\u0063e":"2"}')), expected: priceFixtureTag(priceFixtureApp(pmj.slice(0,-1) + ',"pri\\u0063e":"2"}')), drifts: 0, unknown: true, write: true },
    { name: "price: escaped duplicate app id unknown", input: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1) + ',"@\\u0069d":"https://simplememofast.com/#app"}'), expected: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1) + ',"@\\u0069d":"https://simplememofast.com/#app"}'), drifts: 0, unknown: true, write: true },
    { name: "price: property order independent", input: priceFixtureTag(priceFixtureApp('{"price":"1","priceCurrency":"JPY","name":"Premium Monthly","@type":"Offer"}')), expected: priceFixtureTag(priceFixtureApp('{"price":' + JSON.stringify(C.priceMonthlyJpy) + ',"priceCurrency":"JPY","name":"Premium Monthly","@type":"Offer"}')), drifts: 1, unknown: false, write: true },
    { name: "price: escaped keys and value token retained", input: priceFixtureTag(priceFixtureApp('{"@type":"Offer","na\\u006de":"Premium Monthly","pri\\u0063e":"\\u0031","price\\u0043urrency":"JPY"}')), expected: priceFixtureTag(priceFixtureApp('{"@type":"Offer","na\\u006de":"Premium Monthly","pri\\u0063e":' + JSON.stringify(C.priceMonthlyJpy) + ',"price\\u0043urrency":"JPY"}')), drifts: 1, unknown: false, write: true },
    { name: "price: escaped quote price unknown valid JSON", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY','"1\\\"bad"'))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY','"1\\\"bad"'))), drifts: 0, unknown: true, write: true },
    { name: "price: whitespace outside price token preserved", input: priceFixtureTag(priceFixtureApp('{"@type":"Offer","name":"Premium Monthly","price" :  "1", "priceCurrency":"JPY"}')), expected: priceFixtureTag(priceFixtureApp('{"@type":"Offer","name":"Premium Monthly","price" :  ' + JSON.stringify(C.priceMonthlyJpy) + ', "priceCurrency":"JPY"}')), drifts: 1, unknown: false, write: true },
    { name: "price: canonical own two currencies quiet", input: priceFixtureTag(priceFixtureApp('[' + pmuOk + ',' + pyjOk + ']')), expected: priceFixtureTag(priceFixtureApp('[' + pmuOk + ',' + pyjOk + ']')), drifts: 0, unknown: false, write: true },
    { name: "price: unnamed Free own untouched", input: priceFixtureTag(priceFixtureApp('{"@type":"Offer","price":"0","priceCurrency":"USD"}')), expected: priceFixtureTag(priceFixtureApp('{"@type":"Offer","price":"0","priceCurrency":"USD"}')), drifts: 0, unknown: false, write: true },
    { name: "price: unnamed rival untouched", input: priceFixtureTag(priceFixtureRival('{"@type":"Offer","price":"0","priceCurrency":"USD"}')), expected: priceFixtureTag(priceFixtureRival('{"@type":"Offer","price":"0","priceCurrency":"USD"}')), drifts: 0, unknown: false, write: true },
    { name: "price: outside JSON-LD untouched", input: priceFixtureApp(pmj), expected: priceFixtureApp(pmj), drifts: 0, unknown: false, write: true },
    { name: "price: malformed JSON-LD unadmitted", input: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1)), expected: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1)), drifts: 0, unknown: false, write: true },
    { name: "price: numeric exponent accepts finite value", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY','1e2'))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',C.priceMonthlyJpy))), drifts: 1, unknown: false, write: true },
    { name: "price: braces in description do not change boundary", input: priceFixtureTag(priceFixtureApp(pmj).slice(0,-1) + ',"description":"quoted braces { rival }"}'), expected: priceFixtureTag(priceFixtureApp(pmjOk).slice(0,-1) + ',"description":"quoted braces { rival }"}'), drifts: 1, unknown: false, write: true },
    { name: "price: standalone Offer has no app owner", input: priceFixtureTag(pmj), expected: priceFixtureTag(pmj), drifts: 0, unknown: false, write: true },
    { name: "price: invalid null unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"null"))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"null"))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid boolean unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"true"))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"true"))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid negative number unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"-1"))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"-1"))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid overflow number unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"1e999"))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"1e999"))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid empty string unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"\""))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"\""))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid nonnumeric string unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"not-money\""))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"not-money\""))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid negative string unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"-1\""))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"-1\""))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid grouped string unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"1,000\""))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\"1,000\""))), drifts: 0, unknown: true, write: true },
    { name: "price: invalid padded string unknown", input: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\" 1 \""))), expected: priceFixtureTag(priceFixtureApp(priceFixtureOffer('Premium Monthly','JPY',"\" 1 \""))), drifts: 0, unknown: true, write: true },
  ];
  for (const priceCase of priceCases) {
    const priceActual = scanHtml(priceCase.input, 'vs/price-fixture/index.html', { write: priceCase.write });
    pt(priceCase.name, priceActual.out === priceCase.expected &&
      priceActual.findings.length === priceCase.drifts &&
      (priceActual.priceProblems.length > 0) === priceCase.unknown);
  }

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log('自己テスト ' + (68 + versionSelftestCount + priceSelftestCount) + ' 件中 ' + failures.length + ' 件失敗');
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

/**
 * Complete JSON string value spans in valid JSON-LD objects.
 * Ownership is direct, unique, same-object identity/type/version. The actual
 * writer admits only owned tokens and preserves all other lexical bytes.
 * Invalid JSON or ambiguous/missing identity/type/version is outside admission,
 * not proof of version synchronization.
 */
function jsonLdObjectDocuments(src) {
  const documents = [];
  const tags = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const tag of src.matchAll(tags)) {
    if (!/(?:^|\s)type\s*=\s*(['"])application\/ld\+json\1(?:\s|$)/i.test(tag[1])) continue;
    const text = tag[2];
    const offset = tag.index + tag[0].indexOf('>') + 1;
    try {
      JSON.parse(text);
      let i = 0;
      const objects = [];
      const whitespace = () => { while (i < text.length && /\s/.test(text[i])) i++; };
      const string = () => {
        const start = i++;
        while (i < text.length) {
          if (text[i] === '\\') { i += 2; continue; }
          if (text[i++] === '"') return { kind: 'string', value: JSON.parse(text.slice(start, i)), start, end: i };
        }
        throw new Error('invalid JSON string span');
      };
      const value = () => {
        whitespace();
        if (text[i] === '"') return string();
        if (text[i] === '{') {
          i++;
          const fields = [];
          whitespace();
          if (text[i] !== '}') {
            while (true) {
              whitespace();
              const key = string();
              whitespace();
              if (text[i++] !== ':') throw new Error('invalid JSON object separator');
              fields.push({ key: key.value, keyStart: key.start, node: value() });
              whitespace();
              if (text[i] !== ',') break;
              i++;
            }
          }
          if (text[i++] !== '}') throw new Error('invalid JSON object end');
          const object = { kind: 'object', fields };
          objects.push(object);
          return object;
        }
        if (text[i] === '[') {
          i++;
          const entries = [];
          whitespace();
          if (text[i] !== ']') {
            while (true) {
              entries.push(value());
              whitespace();
              if (text[i] !== ',') break;
              i++;
            }
          }
          if (text[i++] !== ']') throw new Error('invalid JSON array end');
          return { kind: 'array', entries };
        }
        const token = text.slice(i).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/);
        if (!token) throw new Error('invalid JSON scalar');
        const start = i;
        i += token[0].length;
        const scalar = JSON.parse(token[0]);
        return typeof scalar === 'number'
          ? { kind: 'number', value: scalar, start, end: i } : { kind: 'scalar' };
      };
      value();
      whitespace();
      if (i !== text.length) throw new Error('unconsumed JSON payload');
      documents.push({ offset, objects });
    } catch {
      // Unknown/invalid nodes remain untouched, without a synchronization claim.
    }
  }
  return documents;
}

function softwareVersionTokens(src) {
  const tokens = [];
  for (const { offset, objects } of jsonLdObjectDocuments(src)) {
      for (const object of objects) {
        const fields = (key) => object.fields.filter((field) => field.key === key);
        const ids = fields('@id'); const types = fields('@type'); const versions = fields('softwareVersion');
        const owned = ids.length === 1 && types.length === 1 && versions.length === 1 &&
          ids[0].node.kind === 'string' && ids[0].node.value === 'https://simplememofast.com/#app' &&
          types[0].node.kind === 'string' && types[0].node.value === 'SoftwareApplication';
        for (const version of versions) {
          if (version.node.kind !== 'string') continue;
          tokens.push({ owned, value: version.node.value,
            fieldStart: offset + version.keyStart,
            start: offset + version.node.start, end: offset + version.node.end });
        }
      }
  }
  return tokens.sort((a, b) => a.start - b.start);
}

/** Own named offer prices only; never inherit ownership through arbitrary
 * descendants. JPY/USD come from the original owner-confirmed constants.
 * Unknown positively own named offers are refused, not counted synchronized. */
function softwareOfferPriceTokens(src) {
  const docs = jsonLdObjectDocuments(src);
  const fields = (object, key) => object.fields.filter((field) => field.key === key);
  const names = ['Premium Monthly', 'Premium Yearly'];
  const recognized = (object) => fields(object, 'name').some((field) =>
    field.node.kind === 'string' && names.includes(field.node.value));
  const tokens = []; const problems = [];
  const claimed = new Set(); const owned = new Set();
  const problem = (code) => { if (!problems.includes(code)) problems.push(code); };
  for (const { objects } of docs) {
    for (const object of objects) {
      const ids = fields(object, '@id'); const types = fields(object, '@type');
      if (!ids.some((field) => field.node.kind === 'string' &&
        field.node.value === 'https://simplememofast.com/#app')) continue;
      const offerFields = fields(object, 'offers');
      if (offerFields.length === 0) continue;
      const entries = []; let shapeValid = offerFields.length === 1;
      for (const field of offerFields) {
        if (field.node.kind === 'object') entries.push(field.node);
        else if (field.node.kind === 'array') {
          for (const item of field.node.entries) {
            if (item.kind === 'object') entries.push(item);
            else shapeValid = false;
          }
        } else shapeValid = false;
      }
      for (const entry of entries) claimed.add(entry);
      if (!shapeValid) problem('own_offer_collection_unknown');
      const appValid = ids.length === 1 && types.length === 1 &&
        ids[0].node.kind === 'string' && ids[0].node.value === 'https://simplememofast.com/#app' &&
        types[0].node.kind === 'string' && types[0].node.value === 'SoftwareApplication';
      if (!appValid && entries.some(recognized)) problem('own_app_identity_or_type_unknown');
      if (!shapeValid || !appValid) continue;
      const pairs = new Map();
      for (const entry of entries) {
        const ns = fields(entry, 'name'); const cs = fields(entry, 'priceCurrency');
        if (ns.length === 1 && ns[0].node.kind === 'string' && names.includes(ns[0].node.value) &&
            cs.length === 1 && cs[0].node.kind === 'string') {
          const pair = ns[0].node.value + '\n' + cs[0].node.value;
          pairs.set(pair, (pairs.get(pair) || 0) + 1);
        }
      }
      for (const entry of entries) {
        const ns = fields(entry, 'name'); const cs = fields(entry, 'priceCurrency');
        const pair = ns.length === 1 && ns[0].node.kind === 'string' &&
          cs.length === 1 && cs[0].node.kind === 'string'
          ? ns[0].node.value + '\n' + cs[0].node.value : null;
        if (pair !== null && pairs.get(pair) > 1 && recognized(entry)) {
          problem('own_offer_plan_currency_ambiguous');
        } else owned.add(entry);
      }
    }
  }
  for (const { offset, objects } of docs) {
    for (const object of objects) {
      if (!recognized(object)) continue;
      const ns = fields(object, 'name'); const ts = fields(object, '@type');
      const cs = fields(object, 'priceCurrency'); const ps = fields(object, 'price');
      const directClaim = claimed.has(object);
      const nameValid = ns.length === 1 && ns[0].node.kind === 'string' && names.includes(ns[0].node.value);
      const typeValid = ts.length === 1 && ts[0].node.kind === 'string' && ts[0].node.value === 'Offer';
      const currencyValid = cs.length === 1 && cs[0].node.kind === 'string' && ['JPY', 'USD'].includes(cs[0].node.value);
      const priceValid = ps.length === 1 &&
        ((ps[0].node.kind === 'string' && /^\d+(?:\.\d+)?$/.test(ps[0].node.value) &&
          Number.isFinite(Number(ps[0].node.value))) ||
         (ps[0].node.kind === 'number' && Number.isFinite(ps[0].node.value) && ps[0].node.value >= 0));
      if (directClaim) {
        if (!nameValid) problem('own_offer_name_unknown');
        if (!typeValid) problem('own_offer_type_unknown');
        if (!currencyValid) problem('own_offer_currency_unknown');
        if (!priceValid) problem('own_offer_price_unknown');
      }
      if (!nameValid || !typeValid || !currencyValid || !priceValid) continue;
      const currency = cs[0].node.value;
      const monthly = ns[0].node.value === 'Premium Monthly';
      const canonical = currency === 'JPY'
        ? (monthly ? C.priceMonthlyJpy : C.priceYearlyJpy.replace(',', ''))
        : (monthly ? C.priceMonthlyUsd : C.priceYearlyUsd);
      if (typeof canonical !== 'string' || !/^\d+(?:\.\d+)?$/.test(canonical) ||
          !Number.isFinite(Number(canonical))) {
        problem('canonical_offer_price_unknown'); continue;
      }
      const price = ps[0].node;
      tokens.push({ owned: owned.has(object), period: monthly ? 'monthly' : 'yearly',
        value: price.value, kind: price.kind, canonical,
        start: offset + price.start, end: offset + price.end,
        fieldStart: offset + ps[0].keyStart });
    }
  }
  return { tokens: tokens.sort((a, b) => a.start - b.start), problems };
}


function scanHtml(src, rel, { write = false } = {}) {
  const findings = [];
  const priceProblems = [];
  // byte ranges of pricing sections / plan cards on this page
  const priceZones = [];
  for (const zm of src.matchAll(/<(?:section|div)[^>]*class="[^"]*(?:pricing|plan-summary)[^"]*"[^>]*>/g)) {
    priceZones.push([zm.index, Math.min(src.length, zm.index + 4000)]);
  }
  const inPriceZone = (i) => priceZones.some(([a, b]) => i >= a && i < b);
  for (const [desc, re, build, scope] of RULES) {
    if (scope === 'own' && !OWN_VALUE_PAGES.has(rel)) continue;
    // Legacy regex/build remain unchanged for original isolated RULE tests.
    // The real offer writer changes only complete, admitted value tokens.
    if (scope === 'app-price-monthly' || scope === 'app-price-yearly') {
      const packet = softwareOfferPriceTokens(src);
      for (const code of packet.problems) {
        if (!priceProblems.includes(code)) priceProblems.push(code);
      }
      // Refuse all price writes in this HTML when an own offer is ambiguous.
      if (packet.problems.length) continue;
      const period = scope === 'app-price-monthly' ? 'monthly' : 'yearly';
      const edits = [];
      for (const token of packet.tokens) {
        if (token.period !== period) continue;
        if (!token.owned) continue;
        const correct = token.kind === 'string' ? token.value === token.canonical
          : token.value === Number(token.canonical);
        if (correct) continue;
        const replacement = token.kind === 'string' ? JSON.stringify(token.canonical) : token.canonical;
        const m = src.slice(token.fieldStart, token.end);
        const canonical = src.slice(token.fieldStart, token.start) + replacement;
        findings.push(`${write ? 'fix' : 'DRIFT'}: ${rel}: ${desc}: ${JSON.stringify(m.slice(0, 60))} -> ${JSON.stringify(canonical.slice(0, 60))}`);
        if (write) edits.push({ start: token.start, end: token.end, value: replacement });
      }
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        src = src.slice(0, edit.start) + edit.value + src.slice(edit.end);
      }
      continue;
    }
    // Keep the legacy RULE for its original isolated selftests. The real
    // version consumer uses complete JSON string value spans, never that regex.
    if (scope === 'app-version') {
      const edits = [];
      for (const token of softwareVersionTokens(src)) {
        if (!token.owned) continue;
        if (token.value === C.appVersion) continue;
        const m = src.slice(token.fieldStart, token.end);
        const canonical = src.slice(token.fieldStart, token.start) + JSON.stringify(C.appVersion);
        findings.push(`${write ? 'fix' : 'DRIFT'}: ${rel}: ${desc}: ${JSON.stringify(m.slice(0, 60))} -> ${JSON.stringify(canonical.slice(0, 60))}`);
        if (write) edits.push({ start: token.start, end: token.end, value: JSON.stringify(C.appVersion) });
      }
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        src = src.slice(0, edit.start) + edit.value + src.slice(edit.end);
      }
      continue;
    }
    src = src.replace(re, (...args2) => {
      const m = args2[0];
      const index = args2[args2.length - 2];
      if (scope === 'pricing' && !inPriceZone(index)) return m;
      const canonical = desc === '© line' && rel.startsWith('en/')
        ? C.copyrightLineEn : build(...args2);
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
  return { out: src, findings, priceProblems };
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
const priceAdmissionProblems = [];

for (const file of htmlFiles(ROOT)) {
  const orig = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const { out, findings, priceProblems } = scanHtml(orig, rel, { write: WRITE });
  driftCount += findings.length;
  report.push(...findings);
  for (const code of priceProblems) {
    const issue = 'UNKNOWN: ' + rel + ': own named offer price: ' + code;
    report.push(issue); priceAdmissionProblems.push(issue);
  }
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
if (priceAdmissionProblems.length) {
  console.error('FAIL: ' + priceAdmissionProblems.length + ' own named offer price admission issue(s)');
  process.exit(1);
}
if (WRITE) {
  console.log(`done: ${driftCount} value(s) updated in ${filesChanged} file(s)`);
} else if (driftCount) {
  console.error(`FAIL: ${driftCount} value(s) drift from data/site-constants.json`);
  process.exit(1);
} else {
  console.log('OK: admitted rating/price/©/og:site_name rules match data/site-constants.json; unknown or unadmitted price nodes not certified');
}
