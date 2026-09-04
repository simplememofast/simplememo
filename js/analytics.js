/* Deferred GA4 bootstrap for pages without an inline loader. */
(function () {
  "use strict";
  if (window.__simpleMemoAnalytics) return;
  window.__simpleMemoAnalytics = true;
  // Preview and local validation visits are not production acquisition.
  if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  // Configure before processing events already queued by the deferred tracker.
  var queued = window.dataLayer.splice(0);
  gtag("js", new Date());
  gtag("config", "G-EPZVZKCVQG", {
    page_language: document.documentElement.lang || "ja"
  });
  Array.prototype.push.apply(window.dataLayer, queued);

  function load() {
    var idle = window.requestIdleCallback || function (cb) { setTimeout(cb, 1); };
    idle(function () {
      if (document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) return;
      var script = document.createElement("script");
      script.src = "https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG";
      script.async = true;
      document.head.appendChild(script);
    });
  }
  if (document.readyState === "complete") load();
  else window.addEventListener("load", load, { once: true });
})();
