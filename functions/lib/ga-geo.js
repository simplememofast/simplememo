// GA4（Google アナリティクス）を、EEA・英国・スイスからの訪問では読み込ませない。
// 2026-11-16 の EU 監査 E34（P0）と、その推奨案 D11 の実装。
//
// functions/_middleware.js が、すべての応答の最後にこのモジュールの
// applyAnalyticsPolicy() を通す。手を入れるのは HTML の応答だけ。
//
// 【判定】request.cf.country（Cloudflare が接続元 IP から推定した国コード）。
//   - 対象地域（CONSENT_REGIONS）なら、GA を読ませない。
//   - 国が分からないとき（cf が無い・XX・T1（Tor）・形の崩れた値）も、読ませない。
//     安全側に倒す。取りこぼすのは計測であって、同意の無い保存ではない。
//   - request.cf.isEUCountry が "1" なら、一覧に無くても読ませない（一覧の漏れの保険）。
//   - 推定なので外れる（VPN など）。ポリシー §13 にもそう書いてある。
//
// 【取り除くもの】（HTMLRewriter。lol-html のストリーミング書き換え）
//   - <script src> が GA のホスト（googletagmanager.com・google-analytics.com・
//     analytics.google.com）か、/js/analytics.js（51 ページの遅延ローダー）。
//   - インラインの <script> で、計測 ID（G-EPZVZKCVQG）か gtag.js の URL を含むもの。
//     中身を溜めてから判定し、当たれば中身を空にする（<script></script> が残る。害は無い）。
//     2026-11-16 時点で 2,419 ページ・5 通りの形があり、どれも純粋な GA ローダーで、
//     ほかの処理と同じ script に混ざっていない。混ざった形が増えたら
//     scripts/ga4-consent-region.test.mjs が落ちる（空にすると別の処理まで消えるため）。
//
// 【CSP も狭める】同じ応答の Content-Security-Policy から GA のホストを外す。
//   HTMLRewriter が取りこぼす形が将来できても、ブラウザは gtag.js を取りに行けない。
//   CSP だけで止める案も比べたが、採らなかった。インラインのローダーが毎回 gtag.js を
//   差し込んでは CSP に拒否され、コンソールに赤が出続ける（計測は止まるが、
//   壊れているように見える）。本文から消すのが主、CSP は二重の止め。
//
// 【キャッシュ】国で中身が変わるので、URL 単位の共有キャッシュに載せない。
//   - GA を読む応答・読まない応答のどちらにも `Cloudflare-CDN-Cache-Control: no-store`。
//     Cloudflare のゾーンのキャッシュだけが読む見出しで、ブラウザへは渡らない
//     （Cache-Control の `public, no-cache` は変えない。scripts/cache-contract.test.mjs の契約）。
//     2026-11-16 の観測では HTML は cf-cache-status: DYNAMIC で、ゾーンは HTML を
//     保存していない。この見出しは、あとで HTML を「キャッシュ対象」にする規則が
//     足されたときの保険。Edge TTL を「Cache-Control を無視する」にした規則には効かない。
//     HTML をエッジに載せたくなったら、先に国をキャッシュキーに入れる手段を決めること。
//   - Vary は付けない。Cloudflare のキャッシュは既定で Vary を見ず、国は利用者の
//     要求の見出しではない（CF-IPCountry は Cloudflare が足す）ので、ブラウザや途中の
//     キャッシュにとっても意味を持たない。
//   - 途中の共有キャッシュ（社内プロキシなど）は、Cloudflare から見ればその出口の
//     IP の国の訪問者。キャッシュが無くても同じ国の版を受け取るので、混ざらない。
//   - ブラウザのキャッシュ: GA を読まない版は本文が元の静的ファイルと違うので、
//     ETag・Last-Modified を外す。対象地域の文書の要求からは If-None-Match・
//     If-Modified-Since を外して先へ渡す。旅行者のブラウザに残った「GA を読む版」が
//     304 で使い回されないようにするため（本番の HTML には、もともと ETag も
//     Last-Modified も無い。_headers の 2026-11-12 の注記）。
//
// 【限界】Functions が動かないと、静的 HTML がそのまま出て GA を読む。
//   - 本番の Pages の設定は fail_open: true（2026-11-16 に読み取りで確認）。Functions の
//     日次の上限を超えたときなどは、Functions を通さずに静的ファイルを返す。
//   - 確実に止めるには、静的 HTML から GA を外し、対象外の地域にだけ足す形が要る。
//     2,470 ファイルの書き換えになるので、この変更には入れていない（オーナーの判断点）。
//   - ポリシー §13 (A) は「EEA・英国・スイスからの閲覧では読み込みません」と言い切っている。
//     この経路が本番で起きうるなら、文言か仕組みのどちらかを合わせること。

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
// 「欧州だが国は不明」の地域コード。地理 DB によっては返す。
const EUROPE_UNSPECIFIED = ["EU"];

export const CONSENT_REGIONS = new Set([
  ...EU_MEMBER_STATES,
  ...EEA_EFTA_STATES,
  ...UK_AND_SWITZERLAND,
  ...EU_TERRITORIES_WITH_OWN_CODES,
  ...UK_CROWN_DEPENDENCIES_AND_GIBRALTAR,
  ...EUROPE_UNSPECIFIED,
]);

// Cloudflare が「国が分からない」に使う値。T1（Tor）は数字を含むので形の検査で落ちる。
const UNKNOWN_COUNTRIES = new Set(["XX", "ZZ"]);

/**
 * この国からの訪問で GA を読ませないか。純粋関数。
 * country は request.cf.country、isEUCountry は request.cf.isEUCountry（"1" のときだけ EU）。
 * 判定できない値はすべて true（読ませない）。
 */
export function isConsentRegion(country, isEUCountry) {
  if (isEUCountry === "1" || isEUCountry === 1 || isEUCountry === true) return true;
  if (typeof country !== "string") return true;
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return true;
  if (UNKNOWN_COUNTRIES.has(code)) return true;
  return CONSENT_REGIONS.has(code);
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

const SITE_HOSTS = new Set(["simplememofast.com", "www.simplememofast.com"]);

/** <script src> の値が GA の読み込みか。 */
export function isGoogleAnalyticsScriptSrc(src) {
  if (typeof src !== "string" || src.trim() === "") return false;
  let url;
  try {
    url = new URL(src.trim(), "https://simplememofast.com/");
  } catch {
    return false;
  }
  if (isGoogleAnalyticsHost(url.hostname)) return true;
  return SITE_HOSTS.has(url.hostname) && url.pathname === "/js/analytics.js";
}

/** インラインの script の中身が GA のローダーか。 */
export function isGoogleAnalyticsInlineScript(text) {
  return typeof text === "string"
    && (text.includes(GA_MEASUREMENT_ID) || /googletagmanager\.com\/gtag\/js/i.test(text));
}

/**
 * CSP の source 式から、GA のホストを指すものを外す。
 * 'self' などのキーワード、data: などのスキームだけの式、他のホストはそのまま。
 * 外した結果、値が空になったディレクティブは 'none' にする（空のままでも意味は
 * 'none' だが、読み違えを避ける）。ディレクティブの順と他の値は変えない。
 */
export function withoutGoogleAnalyticsSources(csp) {
  if (typeof csp !== "string") return csp;
  return csp
    .split(";")
    .map((directive) => {
      const parts = directive.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return null;
      const [name, ...sources] = parts;
      const kept = sources.filter((source) => !isGoogleAnalyticsSource(source));
      if (kept.length === sources.length) return parts.join(" ");
      return [name, ...(kept.length ? kept : ["'none'"])].join(" ");
    })
    .filter((directive) => directive !== null)
    .join("; ");
}

function isGoogleAnalyticsSource(source) {
  if (source.startsWith("'")) return false;
  const m = source.match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\*\.)?([^/:\s]+)(?::(?:\d+|\*))?(?:\/\S*)?$/i);
  return Boolean(m) && isGoogleAnalyticsHost(m[1]);
}

/**
 * HTMLRewriter の "script" に渡すハンドラ。要素ごとに状態を持つので、
 * 応答 1 つにつき 1 回作ること。
 */
export function gaScriptHandlers() {
  // 溜めているインライン script の中身。null は「溜めていない」。
  let inline = null;
  return {
    element(element) {
      const src = element.getAttribute("src");
      if (src !== null) {
        inline = null;
        if (isGoogleAnalyticsScriptSrc(src)) element.remove();
        return;
      }
      inline = [];
    },
    text(chunk) {
      if (inline === null) return;
      inline.push(chunk.text);
      if (!chunk.lastInTextNode) {
        chunk.remove();
        return;
      }
      const body = inline.join("");
      inline = null;
      if (isGoogleAnalyticsInlineScript(body)) chunk.remove();
      // script の中身は生のテキスト。html: true で、書き換えずにそのまま戻す。
      else chunk.replace(body, { html: true });
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

/** GA を読まない版。本文から GA を消し、CSP を狭め、検証子を外す。 */
export function withoutGoogleAnalytics(response, Rewriter) {
  const headers = new Headers(response.headers);
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.delete("Content-Length");
  const csp = headers.get("Content-Security-Policy");
  if (csp !== null) headers.set("Content-Security-Policy", withoutGoogleAnalyticsSources(csp));
  headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  const shell = new Response(response.body, {
    status: response.status, statusText: response.statusText, headers,
  });
  // 本文が無い（HEAD・204）か、HTMLRewriter が無い実行環境では、見出しだけ変える。
  // そのときも CSP が gtag.js の取得を止める。
  if (response.body === null || typeof Rewriter !== "function") return shell;
  return new Rewriter().on("script", gaScriptHandlers()).transform(shell);
}

/** GA を読む版。本文はそのまま。国で中身が変わることだけをキャッシュに伝える。 */
export function withGeoDependentCaching(response) {
  const out = new Response(response.body, response);
  out.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  return out;
}

/**
 * middleware の最後の context.next() の代わりに呼ぶ。
 * HTML 以外の応答は、受け取ったものをそのまま返す。
 * options.Rewriter は検査で差し替えるため（既定は Workers の HTMLRewriter）。
 */
export async function applyAnalyticsPolicy(context, options = {}) {
  const { request } = context;
  const Rewriter = "Rewriter" in options ? options.Rewriter : globalThis.HTMLRewriter;
  const skip = skipsGoogleAnalytics(request);
  const pathname = new URL(request.url).pathname;
  const stripValidators = skip
    && (request.method === "GET" || request.method === "HEAD")
    && looksLikeDocumentPath(pathname)
    && VALIDATORS.some((name) => request.headers.has(name));
  const response = stripValidators
    ? await context.next(withoutValidators(request))
    : await context.next();
  if (!isHtml(response)) return response;
  return skip ? withoutGoogleAnalytics(response, Rewriter) : withGeoDependentCaching(response);
}
