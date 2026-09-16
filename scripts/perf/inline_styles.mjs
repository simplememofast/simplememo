/** Accept inline shared CSS only when its actual layout rules match the source.
 * A marker, prose mention, commented-out style or stale copy is not sufficient.
 * Font delivery may differ; the layout and local fallback metrics must not.
 */
export function hasCurrentInlineSharedCss(html, sharedCss) {
  if (typeof html !== 'string' || typeof sharedCss !== 'string' || !sharedCss.trim()) return false;
  const active = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const matches = [...active.matchAll(/<style data-home-perf="base">\n([\s\S]*?)\n<\/style>/g)];
  if (matches.length !== 1) return false;
  const layout = css => css.replace(/@font-face\s*\{[^{}]*\}/g, face => face.includes("font-family:'Noto Sans JP';") ? '' : face);
  return layout(matches[0][1]) === layout(sharedCss);
}
