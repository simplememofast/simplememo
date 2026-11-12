/** Accept inline shared CSS only when its actual layout rules match the source.
 * A marker, prose mention, commented-out style or stale copy is not sufficient.
 * Font delivery may differ; the layout and local fallback metrics must not.
 *
 * The Japanese homepage inlines a purged copy (scripts/perf/build_home.py purge_unused):
 * only the rules whose class and id names occur on the page. It is accepted when it is
 * an ordered selection of the source's own rules, copied verbatim, that still holds every
 * comment, statement and non-grouping at-rule and every selector that requires no class
 * or id, so element-level safety rules such as img{max-width:100%} cannot go missing.
 * verify_home.py recomputes the exact selection from the page and the scripts it loads.
 */
export function hasCurrentInlineSharedCss(html, sharedCss) {
  if (typeof html !== 'string' || typeof sharedCss !== 'string' || !sharedCss.trim()) return false;
  const active = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const matches = [...active.matchAll(/<style data-home-perf="base">\n([\s\S]*?)\n<\/style>/g)];
  if (matches.length !== 1) return false;
  const layout = css => css.replace(/@font-face\s*\{[^{}]*\}/g, face => face.includes("font-family:'Noto Sans JP';") ? '' : face);
  const copy = layout(matches[0][1]);
  const source = layout(sharedCss);
  return copy === source || isPurgedCopy(copy, source);
}

const GROUPING = /^@(?:media|supports|layer|container)\b/;
const NAME_NEUTRAL = /:(?:not|is|where|has|matches|-webkit-any|-moz-any|nth-child|nth-last-child|lang|dir|host|host-context|slotted)\(/;

/** Index of the first character in `stop` at bracket depth 0, outside strings and comments. */
function scan(css, i, stop) {
  let depth = 0;
  let quote = '';
  const n = css.length;
  while (i < n) {
    const c = css[i];
    if (quote) {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) quote = '';
    } else if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0 && stop.includes(c)) return i;
    i += 1;
  }
  return n;
}

/** Top-level [prelude, body] pairs; body is null for statements and comments. */
function blocks(css) {
  const out = [];
  const n = css.length;
  let i = 0;
  while (i < n) {
    if (/\s/.test(css[i])) { i += 1; continue; }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out.push([css.slice(i, stop), null]);
      i = stop;
      continue;
    }
    const j = scan(css, i, '{;');
    if (j >= n) { out.push([css.slice(i), null]); break; }
    if (css[j] === ';') { out.push([css.slice(i, j + 1), null]); i = j + 1; continue; }
    let k = j + 1;
    let level = 1;
    while (k < n && level) {
      k = scan(css, k, '{}');
      if (k < n) { level += css[k] === '{' ? 1 : -1; k += 1; }
    }
    out.push([css.slice(i, j), css.slice(j + 1, k - 1)]);
    i = k;
  }
  return out;
}

function selectors(prelude) {
  const out = [];
  for (let i = 0; ;) {
    const j = scan(prelude, i, ',');
    out.push(prelude.slice(i, j).trim());
    if (j >= prelude.length) return out;
    i = j + 1;
  }
}

function requiresName(selector) {
  let s = selector.replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '').replace(/\[[^\]]*\]/g, '');
  for (let m = NAME_NEUTRAL.exec(s); m; m = NAME_NEUTRAL.exec(s)) {
    let depth = 1;
    let k = m.index + m[0].length;
    while (k < s.length && depth) { depth += s[k] === '(' ? 1 : s[k] === ')' ? -1 : 0; k += 1; }
    s = s.slice(0, m.index) + s.slice(k);
  }
  return /[.#]-?[A-Za-z_][\w-]*/.test(s);
}

/** Style rules as {context, selectors, body}; everything else as {context, text}. */
function leaves(css, context = '') {
  const out = [];
  for (const [prelude, body] of blocks(css)) {
    const head = prelude.trim();
    if (body === null) out.push({ context, text: head });
    else if (GROUPING.test(head)) out.push(...leaves(body, `${context}${head}{`));
    else if (head.startsWith('@')) out.push({ context, text: `${prelude}{${body}}` });
    else out.push({ context, selectors: selectors(prelude), body });
  }
  return out;
}

const orderedSubset = (part, whole) => {
  let i = 0;
  for (const item of whole) if (item === part[i]) i += 1;
  return i === part.length;
};

function isPurgedCopy(copy, source) {
  const kept = leaves(copy);
  let next = 0;
  for (const rule of leaves(source)) {
    const candidate = kept[next];
    const same = candidate && candidate.context === rule.context && (rule.text !== undefined
      ? candidate.text === rule.text
      : candidate.selectors !== undefined && candidate.body === rule.body && orderedSubset(candidate.selectors, rule.selectors));
    if (same) {
      if (rule.selectors && rule.selectors.some(s => !requiresName(s) && !candidate.selectors.includes(s))) return false;
      next += 1;
    } else if (rule.text !== undefined || rule.selectors.some(s => !requiresName(s))) {
      return false;
    }
  }
  return next === kept.length;
}
