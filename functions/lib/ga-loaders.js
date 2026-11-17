// GA4 のローダーの原本。2026-11-17 から、静的な HTML は GA4 を持たない（静的既定オフ）。
//
// 静的な HTML には、ローダーがあった位置に、中身の無い目印だけを置く:
//
//   <script type="text/plain" data-ga4="lang-path-4"></script>
//   <script type="text/plain" data-ga4="deferred" data-src="/js/analytics.js?v=…"></script>
//
// - type="text/plain" の script はデータの塊で、ブラウザは実行しない（HTML の仕様。
//   src を持たせていないので、取りにも行かない）。Functions が動かなければ、GA4 は出ない。
// - 許可する地域（functions/lib/ga-geo.js）への HTML だけ、root middleware が
//   HTMLRewriter で目印を下の原本に置き換える。置き換えた結果は、2026-11-16 までの
//   静的な HTML と 1 バイトも違わない（scripts/ga4-consent-region.test.mjs）。
//   deferred だけは属性の順を 1 通りにそろえる（10 ページが defer="" src=… の順だった）。
// - 原本は 2026-11-17 に、リポジトリの全 HTML から機械で取り出した 6 通り。字下げの違いも
//   別の形として持つ（1 バイトも変えずに戻すため）。
//
// 形を足すとき: ここに足し、node scripts/ga4-static-default-off.mjs --write で HTML を
// 目印に変える。知らない形のローダーが HTML に入ると、--check と SEO Validation が落ちる。
// 知らない名前の目印は、置き換えずに残す（GA4 は出ない側）。

/** 目印の type。実行されない型であること（text/javascript・module・空は不可）。 */
export const GA_MARKER_TYPE = "text/plain";

/** インラインのローダーの中身（<script> と </script> の間）。名前は data-ga4 の値。 */
export const GA_INLINE_LOADERS = Object.freeze({
  // 2019 件。page_language を URL のパスから決める。字下げ 4。
  "lang-path-4": String.raw`
    (function() {
      if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-EPZVZKCVQG', {page_language: (function(p){return p==='/en'||p.indexOf('/en/')===0?'en':p.indexOf('/zh-Hant/')===0?'zh-Hant':p.indexOf('/zh/')===0?'zh-Hans':p.indexOf('/ko/')===0?'ko':p.indexOf('/es/')===0?'es':p.indexOf('/pt-BR/')===0?'pt-BR':p.indexOf('/id/')===0?'id':p.indexOf('/ar/')===0?'ar':p.indexOf('/tr/')===0?'tr':'ja';})(location.pathname)});
      window.addEventListener('load', function() {
        var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 1); };
        ric(function() {
          var s = document.createElement('script');
          s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
          s.async = true;
          document.head.appendChild(s);
        });
      });
    })();
  `,
  // 174 件。同じ中身で、字下げ 2（/en/ の記事など）。
  "lang-path-2": String.raw`
  (function() {
    if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-EPZVZKCVQG', {page_language: (function(p){return p==='/en'||p.indexOf('/en/')===0?'en':p.indexOf('/zh-Hant/')===0?'zh-Hant':p.indexOf('/zh/')===0?'zh-Hans':p.indexOf('/ko/')===0?'ko':p.indexOf('/es/')===0?'es':p.indexOf('/pt-BR/')===0?'pt-BR':p.indexOf('/id/')===0?'id':p.indexOf('/ar/')===0?'ar':p.indexOf('/tr/')===0?'tr':'ja';})(location.pathname)});
    window.addEventListener('load', function() {
      var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 1); };
      ric(function() {
        var s = document.createElement('script');
        s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
        s.async = true;
        document.head.appendChild(s);
      });
    });
  })();
`,
  // 170 件。page_language: 'ja' に固定。字下げ 2（各言語の /obsidian/ など。ar などのページでも 'ja' を送っている。計測の継続のため、ここでは直さない）。
  "lang-ja-2": String.raw`
  (function() {
    if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-EPZVZKCVQG', {page_language: 'ja'});
    window.addEventListener('load', function() {
      var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 1); };
      ric(function() {
        var s = document.createElement('script');
        s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
        s.async = true;
        document.head.appendChild(s);
      });
    });
  })();
`,
  // 44 件。page_language: 'en' に固定。字下げ 4（各言語の一部の記事。同上）。
  "lang-en-4": String.raw`
    (function() {
      if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-EPZVZKCVQG', {page_language: 'en'});
      window.addEventListener('load', function() {
        var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 1); };
        ric(function() {
          var s = document.createElement('script');
          s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
          s.async = true;
          document.head.appendChild(s);
        });
      });
    })();
  `,
  // 10 件。page_language なし（各言語の /tiktok/）。
  "lang-none-4": String.raw`
    (function() {
      if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-EPZVZKCVQG');
      window.addEventListener('load', function() {
        var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 1); };
        ric(function() {
          var s = document.createElement('script');
          s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
          s.async = true;
          document.head.appendChild(s);
        });
      });
    })();
  `,
  // 2 件。ホームページ 2 枚（/ と /en/）。'page_language' を引用符つきの鍵で、複数行で書く。
  "lang-home-4": String.raw`
    (function() {
      if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-EPZVZKCVQG', {
        'page_language': (function(p){return p==='/en'||p.indexOf('/en/')===0?'en':p.indexOf('/zh-Hant/')===0?'zh-Hant':p.indexOf('/zh/')===0?'zh-Hans':p.indexOf('/ko/')===0?'ko':p.indexOf('/es/')===0?'es':p.indexOf('/pt-BR/')===0?'pt-BR':p.indexOf('/id/')===0?'id':p.indexOf('/ar/')===0?'ar':p.indexOf('/tr/')===0?'tr':'ja';})(location.pathname)
      });
      window.addEventListener('load', function() {
        var ric = window.requestIdleCallback || function(cb) { setTimeout(cb, 1); };
        ric(function() {
          var s = document.createElement('script');
          s.src = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
          s.async = true;
          document.head.appendChild(s);
        });
      });
    })();
  `,
});

/** 遅延ローダー（/js/analytics.js）の目印の名前。版（?v=）は目印の data-src に持つ。 */
export const GA_DEFERRED = "deferred";

// /js/analytics.js?v=<16 進>。目印から作る src は、この形のときだけ。
const DEFERRED_SRC = /^\/js\/analytics\.js\?v=[0-9a-f]{6,64}$/;

/**
 * 目印 1 つを、許可する地域へ返す要素（HTML の文字列）にする。純粋関数。
 * 知らない名前・形の崩れた data-src は null（置き換えない。GA4 は出ない側）。
 */
export function gaLoaderElement(name, dataSrc) {
  if (typeof name !== "string") return null;
  if (name === GA_DEFERRED) {
    return typeof dataSrc === "string" && DEFERRED_SRC.test(dataSrc)
      ? `<script src="${dataSrc}" defer></script>`
      : null;
  }
  return Object.hasOwn(GA_INLINE_LOADERS, name) ? `<script>${GA_INLINE_LOADERS[name]}</script>` : null;
}
