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

  if (!/^(www\.)?simplememofast\.com$/.test(location.hostname)) return;
  if (window.__simpleMemoStoreTracking) return;
  window.__simpleMemoStoreTracking = true;

  var SELECTOR = 'a[href*="apps.apple.com"],a[data-app-route="onelink"]';

  function push() {
    // Push the arguments object exactly like gtag() does, so gtag.js
    // processes it as a GA4 event command (a plain array is not equivalent).
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function ownStoreUrl(a) {
    try {
      var url = new URL(a.getAttribute("href") || "", location.href);
      return url.protocol === "https:" && url.hostname === "apps.apple.com"
        && /\/id6758438948(?:\/|$)/.test(url.pathname) ? url : null;
    } catch (err) { return null; }
  }

  function dims(a) {
    var url = ownStoreUrl(a);
    return {
      ct: url ? url.searchParams.get("ct") || "(none)" : "(none)",
      placement: a.getAttribute("data-cta-placement") || "(untagged)",
      cluster: a.getAttribute("data-cta-cluster") || "(untagged)",
      variant: a.getAttribute("data-cta-variant") || "(none)",
      page_path: location.pathname,
      measurement_version: "2026-09-05"
    };
  }

  // Explicit opt-in only. Keep OneLink intent separate from a direct Store tap.
  // No URL generation, redirect, identifier forwarding or navigation changes.
  function bridgeDims(a) {
    if (a.getAttribute("data-app-route") !== "onelink") return null;
    var scope = a.getAttribute("data-app-traffic");
    if (scope !== "qa" && scope !== "pilot") return null;
    try {
      var url = new URL(a.getAttribute("href") || "", location.href);
      if (url.origin !== "https://simplememofast.onelink.me" || url.username || url.password
          || !/^\/it5q\/[A-Za-z0-9]{8}$/.test(url.pathname)) return null;
      var d = dims(a);
      delete d.ct;
      d.measurement_version = "2026-09-07";
      d.link_route = "onelink";
      // This known QA link can never be promoted by an accidental pilot label.
      d.bridge_scope = url.pathname === "/it5q/4x0jfkpw" ? "qa" : scope;
      // Keep the clicked host/path; omit arbitrary query/fragment values.
      d.link_url = url.origin + url.pathname;
      return d;
    } catch (err) { return null; }
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var a = (t && t.closest) ? t.closest(SELECTOR) : null;
    if (!a) return;
    try {
      var bridge = bridgeDims(a);
      if (bridge) { push("event", "web_to_app_click", bridge); return; }
      if (!ownStoreUrl(a)) return;
      var d = dims(a);
      d.link_url = a.getAttribute("href") || "";
      push("event", "app_store_click", d);
      // Same payload under the name the growth reports read, so CTA analysis
      // does not depend on the legacy event's naming.
      push("event", "seo_cta_click", d);
    } catch (err) { /* never break navigation */ }
  }, { capture: true, passive: true });

  /*
   * "Next step" card -> next_step_click / next_step_impression.
   *
   * The site serves 1.21 pages per session across 240 pages. The cause is not
   * too few internal links — a single article carries 52 to 98 of them — it is
   * that none of them is presented as *the* next one, and a reader given
   * eighty equal choices makes none. Each page therefore names one destination
   * and this pair of events measures whether naming it changes anything.
   *
   * The click event is what the experiment reads, and it is deliberately a
   * count rather than a ratio: at ~1,600 sessions per 28 days a change in
   * pages/session cannot be told apart from noise, but "the card was clicked
   * N times" needs no statistical power at all — see
   * growth/reports/2026-08-10-desktop-dead-end.md for the same reasoning.
   */
  var NEXT_SELECTOR = "a[data-next-step]";

  function nextDims(a) {
    return {
      to: a.getAttribute("href") || "",
      stage: a.getAttribute("data-next-step") || "(unset)",
      page_path: location.pathname,
      measurement_version: "2026-09-05"
    };
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    var a = (t && t.closest) ? t.closest(NEXT_SELECTOR) : null;
    if (!a) return;
    try { push("event", "next_step_click", nextDims(a)); } catch (err) { /* never break navigation */ }
  }, { capture: true, passive: true });

  // One impression per CTA per pageview, fired when at least half of it has
  // actually been on screen. Anything looser counts CTAs the reader scrolled
  // past too fast to see, which inflates the denominator it exists to provide.
  if (typeof IntersectionObserver === "function") {
    var seen = typeof WeakSet === "function" ? new WeakSet() : null;
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;
        var a = entry.target;
        // Recheck at visibility time: href may have changed since observe().
        var isNext = a.hasAttribute("data-next-step");
        var bridge = isNext ? null : bridgeDims(a);
        if (!isNext && !bridge && !ownStoreUrl(a)) { observer.unobserve(a); continue; }
        if (seen) {
          if (seen.has(a)) { observer.unobserve(a); continue; }
          seen.add(a);
        }
        try {
          push("event", isNext ? "next_step_impression" : bridge ? "web_to_app_impression" : "seo_cta_impression",
               isNext ? nextDims(a) : bridge || dims(a));
        } catch (err) { /* ignore */ }
        observer.unobserve(a);
      }
    }, { threshold: 0.5 });

    var start = function () {
      var links = document.querySelectorAll(SELECTOR + "," + NEXT_SELECTOR);
      for (var i = 0; i < links.length; i++) {
        if (links[i].hasAttribute("data-next-step") || ownStoreUrl(links[i]) || bridgeDims(links[i])) observer.observe(links[i]);
      }
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})();
