// 静的な HTML の GA4 を「目印」で持つための、文字列の変換と検査（純粋関数）。
// 2026-11-17、GA4 を静的既定オフにした（functions/lib/ga-geo.js の冒頭）。
//
//   toStaticMarkers(html)  動くローダー（6 通りのインライン・/js/analytics.js）を目印に変える
//   activate(html)         目印を原本に戻す。許可する地域へ middleware が返す本文と同じ
//                          （middleware は HTMLRewriter、これは文字列で同じことをする）
//   staticProblems(html)   静的な HTML に、GA4 を動かしうるものが残っていないか
//
// scripts/ga4-static-default-off.mjs（--write / --check）と、SEO Validation の
// scripts/ga4-consent-region.test.mjs・ga4-tag-order.test.mjs・growth/lib/analytics.test.mjs が使う。
import {
  GA_DEFERRED, GA_INLINE_LOADERS, GA_MARKER_TYPE, gaLoaderElement,
} from '../../functions/lib/ga-loaders.js';

/**
 * 静的な HTML に出てはいけない文字列（目印の外で）。GA の計測 ID、GA のホスト、
 * 遅延ローダーのパス。文中の言及でも落とす（2026-11-17 時点で、ローダーの外に
 * これらを含むページは 0 件。書く必要が出たら、文字参照（googletagmanager&#46;com）にする）。
 * ポリシーの Cookie 名（_ga_EPZVZKCVQG）は「G-」を含まないので当たらない。
 */
export const GA_TRACE = /G-EPZVZKCVQG|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|\/js\/analytics\.js/i;

/** 目印の正確な形（--write が書く形）。属性の順・引用符まで固定する。 */
export const MARKER = /<script type="text\/plain" data-ga4="([a-z0-9-]+)"(?: data-src="([^"<>]*)")?><\/script>/g;

/** 目印 1 つの HTML。 */
export function markerFor(name, dataSrc) {
  return `<script type="${GA_MARKER_TYPE}" data-ga4="${name}"${dataSrc === undefined ? '' : ` data-src="${dataSrc}"`}></script>`;
}

const INLINE_NAME_BY_BODY = new Map(Object.entries(GA_INLINE_LOADERS).map(([name, body]) => [body, name]));

// 2026-11-17 の遅延ローダーの 2 形（41 ページと 10 ページ）。
const DEFERRED_TAG = /<script (?:src="(\/js\/analytics\.js\?v=[0-9a-f]+)" defer|defer="" src="(\/js\/analytics\.js\?v=[0-9a-f]+)")><\/script>/g;

/** 動くローダーを目印に変える。知らない形はそのまま残す（staticProblems が拾う）。 */
export function toStaticMarkers(html) {
  return html
    .replace(/<script>([\s\S]*?)<\/script>/g, (whole, body) => (
      INLINE_NAME_BY_BODY.has(body) ? markerFor(INLINE_NAME_BY_BODY.get(body)) : whole))
    .replace(DEFERRED_TAG, (whole, a, b) => markerFor(GA_DEFERRED, a ?? b));
}

/** 目印の一覧（名前・data-src・原本にできるか）。 */
export function markersIn(html) {
  return [...html.matchAll(MARKER)].map((m) => ({
    marker: m[0], name: m[1], dataSrc: m[2], element: gaLoaderElement(m[1], m[2]),
  }));
}

/** 目印を原本に戻す。知らない目印は残す。 */
export function activate(html) {
  return html.replace(MARKER, (whole, name, dataSrc) => gaLoaderElement(name, dataSrc) ?? whole);
}

/** 静的な HTML の問題（無ければ空の配列）。 */
export function staticProblems(html) {
  const problems = [];
  for (const { marker, element } of markersIn(html)) {
    if (element === null) problems.push(`unknown GA4 marker ${marker} (add the loader to functions/lib/ga-loaders.js first)`);
  }
  const outside = html.replace(MARKER, '');
  const trace = outside.match(GA_TRACE);
  if (trace) {
    const at = outside.indexOf(trace[0]);
    problems.push(`GA4 outside a marker: "${outside.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, ' ')}" (run node scripts/ga4-static-default-off.mjs --write)`);
  }
  // 目印の形が崩れたもの（属性の順が変わった・type が消えた など）。middleware は
  // 属性の順を問わないが、静的な検査が読めない形は認めない。
  const loose = (outside.match(/\bdata-ga4\s*=/g) || []).length;
  if (loose) problems.push(`${loose} data-ga4 attribute(s) not in the exact marker form ${markerFor('<name>')}`);
  return problems;
}
