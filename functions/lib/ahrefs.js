// Ahrefs is enabled by the Pages middleware only for a known, permitted region.
// Templates have no src or resource hints. Only these fixed loaders can be restored.
const scriptUrl = "https://analytics.ahrefs.com/analytics.js";
const siteKey = "6MwVxHQiKMs/Wl2rNBoiwQ";

export function ahrefsLoaderElement(mode) {
  if (mode === "async") return `<script async data-key="${siteKey}" src="${scriptUrl}"></script>`;
  if (mode !== "idle" && mode !== "home-idle") return null;
  const hostCheck = mode === "home-idle"
    ? 'if (location.hostname !== "simplememofast.com" && location.hostname !== "www.simplememofast.com") return;'
    : "";
  return `<script>window.addEventListener("load", function () {
    ${hostCheck}
    const idle = window.requestIdleCallback || function (callback) { setTimeout(callback, 1); };
    idle(function () {
      const script = document.createElement("script");
      script.src = "${scriptUrl}";
      script.async = true;
      script.setAttribute("data-key", "${siteKey}");
      document.head.appendChild(script);
    });
  });</script>`;
}

export const ahrefsInjection = {
  element(element) {
    if (element.getAttribute("type") !== "text/plain") return;
    const loader = ahrefsLoaderElement(element.getAttribute("data-ahrefs"));
    if (loader) element.replace(loader, { html: true });
  },
};
