/*
 * App Store CTA click tracking -> GA4 event "app_store_click".
 *
 * Why this exists: Apple's Smart App Banner (<meta name="apple-itunes-app">) is
 * native Safari UI and its taps are NOT trackable from the page. What IS
 * trackable is the in-page App Store badges/links. This sends one GA4 event per
 * such click so install-intent from the site is measurable in GA4 (alongside
 * the ?ct= campaign tokens that feed App Store Connect).
 *
 * The deferred GA loader defines gtag() inside its own closure (not global), so
 * we push to window.dataLayer via a local shim; queued events are processed once
 * gtag.js initializes. Delegated + capture so it works for every apps.apple.com
 * link site-wide, including links added later.
 */
(function () {
  "use strict";
  function track(a) {
    try {
      var href = a.getAttribute("href") || "";
      var m = href.match(/[?&]ct=([^&#]*)/);
      var ct = m ? decodeURIComponent(m[1]) : "(none)";
      window.dataLayer = window.dataLayer || [];
      // Push the arguments object exactly like gtag() does, so gtag.js
      // processes it as a GA4 event command (a plain array is not equivalent).
      function gtag() { window.dataLayer.push(arguments); }
      gtag("event", "app_store_click", {
        ct: ct,
        page_path: location.pathname,
        link_url: href
      });
    } catch (e) { /* never break navigation */ }
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    var a = (t && t.closest) ? t.closest('a[href*="apps.apple.com"]') : null;
    if (a) track(a);
  }, { capture: true, passive: true });
})();
