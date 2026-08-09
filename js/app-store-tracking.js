/*
 * App Store CTA tracking -> GA4 events "app_store_click" and "seo_cta_impression".
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
 *
 * Placement dimensions (added 2026-08-09)
 * ---------------------------------------
 * Pages carry up to four App Store links and every one of them used to report
 * the same `ct` and the same `link_url`, so a click told us which *page*
 * converted but never which *CTA*. Two thirds of the CTA inventory was
 * unmeasurable and no placement test could have been read. The
 * `data-cta-placement|cluster|variant` attributes are written by
 * scripts/tag-cta-placements.js and forwarded here.
 *
 * `seo_cta_impression` gives the click a denominator. Without it a CTA's
 * performance can only ever be reported as raw clicks, which cannot distinguish
 * "this CTA converts badly" from "almost nobody scrolls to it" — and those two
 * call for opposite fixes.
 */
(function () {
  "use strict";

  var SELECTOR = 'a[href*="apps.apple.com"]';

  function push() {
    // Push the arguments object exactly like gtag() does, so gtag.js
    // processes it as a GA4 event command (a plain array is not equivalent).
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function dims(a) {
    var href = a.getAttribute("href") || "";
    var m = href.match(/[?&]ct=([^&#]*)/);
    return {
      ct: m ? decodeURIComponent(m[1]) : "(none)",
      placement: a.getAttribute("data-cta-placement") || "(untagged)",
      cluster: a.getAttribute("data-cta-cluster") || "(untagged)",
      variant: a.getAttribute("data-cta-variant") || "(none)",
      page_path: location.pathname
    };
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var a = (t && t.closest) ? t.closest(SELECTOR) : null;
    if (!a) return;
    try {
      var d = dims(a);
      d.link_url = a.getAttribute("href") || "";
      push("event", "app_store_click", d);
      // Same payload under the name the growth reports read, so CTA analysis
      // does not depend on the legacy event's naming.
      push("event", "seo_cta_click", d);
    } catch (err) { /* never break navigation */ }
  }, { capture: true, passive: true });

  // One impression per CTA per pageview, fired when at least half of it has
  // actually been on screen. Anything looser counts CTAs the reader scrolled
  // past too fast to see, which inflates the denominator it exists to provide.
  if (typeof IntersectionObserver === "function") {
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isIntersecting) continue;
        var a = entry.target;
        if (seen) {
          if (seen.has(a)) { observer.unobserve(a); continue; }
          seen.add(a);
        }
        try { push("event", "seo_cta_impression", dims(a)); } catch (err) { /* ignore */ }
        observer.unobserve(a);
      }
    }, { threshold: 0.5 });

    var start = function () {
      var links = document.querySelectorAll(SELECTOR);
      for (var i = 0; i < links.length; i++) observer.observe(links[i]);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})();
