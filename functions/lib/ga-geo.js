// Google Analytics と Ahrefs は、静的 HTML では無効。接続元地域が判明した場合だけ有効にする。
// Ahrefs は EEA・英国・スイスと国不明で停止する。Google の既存の追加対象地域は下記のとおり。
// 2026-11-16 の EU 監査 E34（P0）と、その推奨案 D11 の実装。
// 2026-11-17 に「静的既定オフ」へ作り直した（最初の形は、静的な HTML から GA4 を
// 取り除くものだった。その形の限界は下の【障害のとき】）。
//
// 【形】静的な HTML は、GA4 を持たない。
//   - ローダーがあった位置には、中身の無い目印だけがある（functions/lib/ga-loaders.js）。
//     <script type="text/plain"> なので、ブラウザは実行しない。
//   - _headers の CSP にも、GA のホストは無い。
//   - functions/_middleware.js が、すべての応答の最後に applyAnalyticsPolicy() を通す。
//     許可する地域への HTML だけ、HTMLRewriter で目印を元のローダーへ置き換え、
//     CSP に GA のホストを足す。置き換えた本文は、2026-11-16 までの静的な HTML と同じ。
//
// 【判定】request.cf.country（Cloudflare が接続元 IP から推定した国コード）。
//   - 対象地域（CONSENT_REGIONS）なら、読ませない。静的なファイルを、本文に手を入れずに返す。
//   - 国が分からないとき（cf が無い・XX・T1（Tor）・形の崩れた値）も、読ませない。
//     安全側に倒す。取りこぼすのは計測であって、同意の無い保存ではない。
//   - request.cf.isEUCountry が "1" なら、一覧に無くても読ませない（一覧の漏れの保険）。
//   - 推定なので外れる（VPN など）。ポリシー §13 にもそう書いてある。
//
// 【障害のとき】どの経路でも、GA4 が出ない側に倒れる。
//   - Functions を通らない（本番の Pages は fail_open: true。日次の上限を超えたときは、
//     Functions を通さずに静的ファイルを返す。_routes.json の除外も同じ）:
//     静的な HTML に GA4 は無く、CSP も GA のホストを許していない。許可する地域の計測が
//     抜けるだけ。
//   - HTMLRewriter が無い実行環境・知らない名前の目印・形の崩れた data-src: 置き換えない。
//   - Functions が例外を投げた: Cloudflare のエラーの応答になる（passThroughOnException は
//     使っていない）。静的な HTML へ落ちることは無い。
//
// 【キャッシュ】GA4 を足した版を、エッジや共有キャッシュから対象地域へ返させない。
//   - `Cloudflare-CDN-Cache-Control: no-store`: Cloudflare のゾーンのキャッシュに保存させない
//     （Cloudflare だけが読む見出しで、ブラウザへは渡らない）。GA4 の無い版にも付ける。
//     2026-11-16 の観測では HTML は cf-cache-status: DYNAMIC で、ゾーンは HTML を保存していない。
//   - ETag・Last-Modified を外す。`Cache-Control: public, no-cache` のまま（キャッシュ契約。
//     scripts/cache-contract.test.mjs）だが、検証子が無いので、ブラウザも途中の共有キャッシュも、
//     使う前に必ず取り直す（no-cache は確かめずに使うことを禁じ、確かめる手段が無い）。
//     取り直しは、その時点の接続元の国で判定される。
//   - 許可する地域からの文書の要求は、If-None-Match・If-Modified-Since を外して先へ渡す。
//     対象地域で保存した GA4 の無い版が 304 で使い回され、計測が抜けるのを防ぐため
//     （計測の向き。プライバシーの向きの漏れではない）。
//   - 対象地域への応答は、静的なファイルそのもの（検証子も元のまま）。これは、だれに
//     返っても GA4 を読まない。
//   - 防げないもの: Cache Rules の Edge TTL を「Cache-Control を無視」にした規則は、
//     Cloudflare-CDN-Cache-Control より優先される（Cloudflare Docs「CDN-Cache-Control」）。
//     HTML をエッジに保存する規則があると、GA4 を足した版が対象地域へ返りうる。2026-11-16 は
//     トークンの権限が足りず、Cache Rules を読めていない（未確認）。HTML をエッジに載せたく
//     なったら、先に国をキャッシュキーに入れる手段を決めること。
//   - Vary は付けない。Cloudflare のキャッシュは既定で Vary を見ず、国は利用者の要求の
//     見出しではないので、ブラウザや途中のキャッシュにとっても意味を持たない。

import { ahrefsInjection } from "./ahrefs.js";
import { GA_MARKER_TYPE, gaLoaderElement } from "./ga-loaders.js";

export const GA_MEASUREMENT_ID = "G-EPZVZKCVQG";

// EU 加盟 27 か国（ISO 3166-1 alpha-2。ギリシャは EL ではなく GR）。
const EU_MEMBER_STATES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
// EEA のうち EU の外（EFTA の 3 か国）。
const EEA_EFTA_STATES = ["IS", "LI", "NO"];
// 英国とスイス。
const UK_AND_SWITZERLAND = ["GB", "CH"];
// EU の領域だが、国コードが本国と別のもの。
//   GF 仏領ギアナ・GP グアドループ・MQ マルティニーク・RE レユニオン・YT マヨット・
//   MF サン・マルタン（仏領）… EU の最外縁地域。AX オーランド（フィンランド）。
//   IC カナリア諸島・EA セウタとメリリャ … ISO の例外的予約コード。Cloudflare が
//   返すかは確かめていない（返さないなら ES になる）。入れても害は無い。
const EU_TERRITORIES_WITH_OWN_CODES = ["GF", "GP", "MQ", "RE", "YT", "MF", "AX", "IC", "EA"];
// 英国の王室属領（GG ガーンジー・JE ジャージー・IM マン島）とジブラルタル（GI）。
// 英国ではないが、それぞれ GDPR に倣ったデータ保護法がある（Cookie の扱いまでは
// 確かめていない）。安全側で対象に含める（オーナーの判断点。外すならこの 1 行と、
// scripts/ga4-consent-region.test.mjs の EXPECTED_EXTRA を同時に直す）。
const UK_CROWN_DEPENDENCIES_AND_GIBRALTAR = ["GG", "JE", "IM", "GI"];
// EU does not identify a country. SJ covers both Svalbard and Jan Mayen; only Svalbard
// was exempted under EEA Protocol 40. The combined code cannot establish an outside visit.
const EUROPE_UNSPECIFIED = ["EU", "SJ"];

const AHREFS_PROTECTED_REGIONS = new Set([
  ...EU_MEMBER_STATES,
  ...EEA_EFTA_STATES,
  ...UK_AND_SWITZERLAND,
  ...EU_TERRITORIES_WITH_OWN_CODES,
  ...EUROPE_UNSPECIFIED,
]);

export const CONSENT_REGIONS = new Set([...AHREFS_PROTECTED_REGIONS, ...UK_CROWN_DEPENDENCIES_AND_GIBRALTAR]);

// ISO 3166-1 plus the separately recognized territory codes. An unassigned code
// must not enable analytics merely because it looks like two letters.
const KNOWN_COUNTRIES = new Set(`AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO
BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ
DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP
GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG
KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML
MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE
PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL
SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM
US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
IC EA XK AC TA DG`.split(/\s+/));

/**
 * この国からの訪問で GA を読ませないか。純粋関数。
 * country は request.cf.country、isEUCountry は request.cf.isEUCountry（"1" のときだけ EU）。
 * 判定できない値はすべて true（読ませない）。
 */
export function isConsentRegion(country, isEUCountry, regions = CONSENT_REGIONS) {
  if (isEUCountry === "1" || isEUCountry === 1 || isEUCountry === true) return true;
  if (typeof country !== "string") return true;
  const code = country.trim().toUpperCase();
  return !KNOWN_COUNTRIES.has(code) || regions.has(code);
}

/** 要求から判定する。request.cf が無い（手元の検査・未知の経路）ときは読ませない。 */
export function skipsGoogleAnalytics(request) {
  const cf = request && request.cf;
  if (!cf || typeof cf !== "object") return true;
  return isConsentRegion(cf.country, cf.isEUCountry);
}

const GA_HOST = /(?:^|\.)(?:googletagmanager\.com|google-analytics\.com|analytics\.google\.com)$/i;

/** GA のホストか（サブドメインを含む。似た名前の別ドメインは含まない）。 */
export function isGoogleAnalyticsHost(host) {
  return typeof host === "string" && GA_HOST.test(host.replace(/\.$/, ""));
}

// 許可する地域への HTML の CSP に足すもの。2026-11-16 まで _headers にあった値そのもの
// （順は変わるが、集合は同じ。scripts/ga4-consent-region.test.mjs が当時の CSP と突き合わせる）。
export const GA_CSP_SOURCES = Object.freeze({
  "img-src": Object.freeze([
    "https://www.googletagmanager.com", "https://www.google-analytics.com",
    "https://*.google-analytics.com", "https://*.googletagmanager.com",
  ]),
  "script-src": Object.freeze([
    "https://www.googletagmanager.com", "https://www.google-analytics.com",
    "https://*.google-analytics.com", "https://*.googletagmanager.com",
  ]),
  "connect-src": Object.freeze([
    "https://www.google-analytics.com", "https://*.google-analytics.com",
    "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://analytics.google.com",
  ]),
});

const AHREFS_CSP_SOURCES = {
  "img-src": ["https://*.ahrefs.com"],
  "script-src": ["https://analytics.ahrefs.com"],
  "connect-src": ["https://*.ahrefs.com"],
};

function directives(csp) {
  return csp.split(";").map((d) => d.trim().split(/\s+/).filter(Boolean)).filter((parts) => parts.length > 0);
}

/**
 * 許可する地域に応じて Ahrefs および GA のホストを CSP に加える。
 * img-src・script-src・connect-src の末尾に、まだ無いものだけを足す。'none' だけの
 * ディレクティブは GA のホストに置き換える。無いディレクティブは足さない（default-src に任せる）。
 */
export function withAnalyticsSources(csp, includeGoogle = true) {
  if (typeof csp !== "string") return csp;
  return directives(csp).map(([name, ...sources]) => {
    const directive = name.toLowerCase();
    const add = [...(includeGoogle ? GA_CSP_SOURCES[directive] ?? [] : []), ...(AHREFS_CSP_SOURCES[directive] ?? [])];
    if (!add.length) return [name, ...sources].join(" ");
    const kept = sources.filter((source) => source !== "'none'");
    return [name, ...kept, ...add.filter((source) => !kept.includes(source))].join(" ");
  }).join("; ");
}

/**
 * CSP から GA と Ahrefs のホストを外す（_headers に両社のホストは無いので、
 * ふだんは何も変わらない。誤って足されたときの保険）。
 * 外した結果、値が空になったディレクティブは 'none' にする。
 */
export function withoutAnalyticsSources(csp) {
  if (typeof csp !== "string") return csp;
  return directives(csp).map(([name, ...sources]) => {
    const kept = sources.filter((source) => !isRegionalAnalyticsSource(source));
    if (kept.length === sources.length) return [name, ...sources].join(" ");
    return [name, ...(kept.length ? kept : ["'none'"])].join(" ");
  }).join("; ");
}

function isRegionalAnalyticsSource(source) {
  if (source.startsWith("'")) return false;
  const m = source.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\*\.)?([^/:\s]+)(?::(?:\d+|\*))?(?:\/\S*)?$/i);
  return Boolean(m) && (isGoogleAnalyticsHost(m[1]) || /(?:^|\.)ahrefs\.com\.?$/i.test(m[1]));
}

/** HTMLRewriter のセレクタ。目印は data-ga4 を持つ script だけ。 */
export const GA_MARKER_SELECTOR = "script[data-ga4]";

/**
 * HTMLRewriter に渡すハンドラ。目印（type="text/plain"）を、ローダーの原本に置き換える。
 * 型の違うもの・知らない名前は、そのまま残す（GA4 は出ない側）。
 */
export function gaInjectionHandlers() {
  return {
    element(element) {
      if (element.getAttribute("type") !== GA_MARKER_TYPE) return;
      const html = gaLoaderElement(element.getAttribute("data-ga4"), element.getAttribute("data-src"));
      if (html !== null) element.replace(html, { html: true });
    },
  };
}

function isHtml(response) {
  return (response.headers.get("content-type") || "").toLowerCase().startsWith("text/html");
}

/** 文書（HTML）を返しうるパスか。拡張子が無い・末尾が / ・.html/.htm。 */
export function looksLikeDocumentPath(pathname) {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  return last === "" || /\.html?$/i.test(last) || !last.includes(".");
}

const VALIDATORS = ["If-None-Match", "If-Modified-Since"];

function withoutValidators(request) {
  const headers = new Headers(request.headers);
  for (const name of VALIDATORS) headers.delete(name);
  return new Request(request, { headers });
}

// GA4 を足す応答の状態。200 と、404（404.html にもローダーがある。2026-11-16 まで読んでいた）。
// それ以外（206・304・5xx など）は足さない（GA4 は出ない側）。
const INJECTABLE_STATUS = new Set([200, 404]);

/**
 * 公開前に対象地域から閲覧した人のブラウザには、_ga・_ga_EPZVZKCVQG が残る（既定で 2 年）。
 * ドメイン全体の Cookie なので、期限まで、ブラウザは当社サイトへの要求にこれを付けて送る
 * （当社のコードは読まない）。対象地域の HTML の応答で、期限切れの Set-Cookie を返して
 * 消すことができる。**既定で無効。**利用者のブラウザのデータを消す動作で、オーナーの
 * 承認事項（ポリシーの記載も要る）。有効にするには、この値を true にする PR を出す。
 */
export const EXPIRE_EXISTING_GA_COOKIES = false;

export const GA_COOKIE_NAMES = Object.freeze(["_ga", `_ga_${GA_MEASUREMENT_ID.slice(2)}`]);

/**
 * 要求の Cookie に GA の Cookie があれば、それを消す Set-Cookie の値を返す。純粋関数。
 * gtag.js は cookie_domain: auto で、登録可能なドメイン（simplememofast.com）に書く。
 * 消すには、名前・Domain・Path が書いたときと同じである必要がある。
 */
export function gaCookieExpiry(cookieHeader) {
  if (typeof cookieHeader !== "string" || cookieHeader === "") return [];
  const present = new Set(cookieHeader.split(";").map((pair) => pair.split("=")[0].trim()));
  return GA_COOKIE_NAMES.filter((name) => present.has(name)).map((name) =>
    `${name}=; Domain=simplememofast.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; SameSite=Lax`);
}

/** 対象地域・国不明への HTML。静的なファイルの本文と検証子は、そのまま。 */
export function servedWithoutAnalytics(response, request, { expireCookies = EXPIRE_EXISTING_GA_COOKIES } = {}) {
  const out = new Response(response.body, response);
  const csp = out.headers.get("Content-Security-Policy");
  if (csp !== null) out.headers.set("Content-Security-Policy", withoutAnalyticsSources(csp));
  out.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  if (expireCookies && request) {
    for (const value of gaCookieExpiry(request.headers.get("Cookie"))) out.headers.append("Set-Cookie", value);
  }
  return out;
}

/**
 * 許可する地域への HTML。目印をローダーに置き換え、CSP に GA のホストを足し、検証子を外す。
 * 本文が無い（HEAD）ときは、見出しだけ GET と同じにする。
 * HTMLRewriter が無い・状態が 200/404 でないときは、GA4 の無い版を返す。
 */
export function withRegionalAnalytics(response, Rewriter, includeGoogle) {
  if (!INJECTABLE_STATUS.has(response.status) || typeof Rewriter !== "function") {
    return servedWithoutAnalytics(response, null, { expireCookies: false });
  }
  const headers = new Headers(response.headers);
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.delete("Content-Length");
  const csp = headers.get("Content-Security-Policy");
  if (csp !== null) headers.set("Content-Security-Policy", withAnalyticsSources(withoutAnalyticsSources(csp), includeGoogle));
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  const shell = new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  });
  if (response.body === null) return shell;
  const rewriter = new Rewriter().on("script[data-ahrefs]", ahrefsInjection);
  if (includeGoogle) rewriter.on(GA_MARKER_SELECTOR, gaInjectionHandlers());
  return rewriter.transform(shell);
}

/**
 * middleware の最後の context.next() の代わりに呼ぶ。
 * HTML 以外の応答は、受け取ったものをそのまま返す。
 * options.Rewriter は検査で差し替えるため（既定は Workers の HTMLRewriter）。
 * options.expireCookies は検査のため（既定は EXPIRE_EXISTING_GA_COOKIES）。
 */
export async function applyAnalyticsPolicy(context, options = {}) {
  const { request } = context;
  const { country, isEUCountry } = request.cf ?? {};
  if (isConsentRegion(country, isEUCountry, AHREFS_PROTECTED_REGIONS)) {
    const response = await context.next();
    if (!isHtml(response)) return response;
    return servedWithoutAnalytics(response, request, { expireCookies: options.expireCookies ?? EXPIRE_EXISTING_GA_COOKIES });
  }
  const Rewriter = "Rewriter" in options ? options.Rewriter : globalThis.HTMLRewriter;
  const pathname = new URL(request.url).pathname;
  const stripValidators = (request.method === "GET" || request.method === "HEAD")
    && looksLikeDocumentPath(pathname)
    && VALIDATORS.some((name) => request.headers.has(name));
  const response = stripValidators
    ? await context.next(withoutValidators(request))
    : await context.next();
  if (!isHtml(response)) return response;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return servedWithoutAnalytics(response, null, { expireCookies: false });
  }
  return withRegionalAnalytics(response, Rewriter, !skipsGoogleAnalytics(request));
}
