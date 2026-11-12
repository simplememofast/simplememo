// A small model of how Cloudflare Pages applies `_headers` to a static asset.
//
// Ported line for line from Cloudflare workers-sdk as bundled in wrangler 3.114.17
// (licensed MIT OR Apache-2.0):
//   workers-shared/utils/configuration/constants.ts, parseHeaders.ts, validateURL.ts,
//   constructConfiguration.ts (constructHeaders),
//   pages-shared/asset-server/rulesEngine.ts (generateRulesMatcher, replacer) and
//   handler.ts (serveAsset's browser default, attachHeaders, the 404 no-store rewrite).
// Do not "improve" the behaviour here: the point is to agree with Pages, including
// its surprises (a second block with the same path replaces the first one in place;
// an indented `https://` line starts a new rule; `!Header` without a space is invalid;
// a rule with two `*` fails to compile and is dropped). Re-port when Pages changes.

export const HEADER_SEPARATOR = ':';
export const MAX_LINE_LENGTH = 2000;
export const MAX_HEADER_RULES = 100;
export const UNSET_OPERATOR = '! ';
export const CACHE_CONTROL_BROWSER = 'public, max-age=0, must-revalidate';

const LINE_IS_PROBABLY_A_PATH = /^([^\s]+:\/\/|^\/)/;
const URL_REGEX = /^https:\/\/+(?<host>[^/]+)\/?(?<path>.*)/;
const HOST_WITH_PORT_REGEX = /.*:\d+$/;
const PATH_REGEX = /^\//;
const ESCAPE_REGEX_CHARACTERS = /[-/\\^$*+?.()|[\]{}]/g;
const HOST_PLACEHOLDER_REGEX = /(?<=^https:\\\/\\\/[^/]*?):([A-Za-z]\w*)(?=\\)/g;
const PLACEHOLDER_REGEX = /:([A-Za-z]\w*)/g;

function extractPathname(path = '/') {
  if (!path.startsWith('/')) path = `/${path}`;
  const url = new URL(`//${path}`, 'relative://');
  return url.pathname;
}

export function validateUrl(token, onlyRelative = false, disallowPorts = false) {
  const host = URL_REGEX.exec(token);
  if (host && host.groups && host.groups.host) {
    if (onlyRelative) return [undefined, `Only relative URLs are allowed. Skipping absolute URL ${token}.`];
    if (disallowPorts && host.groups.host.match(HOST_WITH_PORT_REGEX)) {
      return [undefined, `Specifying ports is not supported. Skipping absolute URL ${token}.`];
    }
    return [`https://${host.groups.host}${extractPathname(host.groups.path)}`, undefined];
  }
  if (!token.startsWith('/') && onlyRelative) token = `/${token}`;
  if (PATH_REGEX.exec(token)) {
    try {
      return [extractPathname(token), undefined];
    } catch {
      return [undefined, `Error parsing URL segment ${token}. Skipping.`];
    }
  }
  return [undefined, onlyRelative
    ? 'URLs should begin with a forward-slash.'
    : 'URLs should either be relative (e.g. begin with a forward-slash), or use HTTPS (e.g. begin with "https://").'];
}

const isValidRule = rule => Object.keys(rule.headers).length > 0 || rule.unsetHeaders.length > 0;

/** parseHeaders(input) from workers-shared. `lineNumber` is added for messages only. */
export function parseHeaders(input) {
  const lines = input.split('\n');
  const rules = [];
  const invalid = [];
  let rule;
  const finish = () => {
    if (!rule) return;
    if (isValidRule(rule)) rules.push({ path: rule.path, headers: rule.headers, unsetHeaders: rule.unsetHeaders, lineNumber: rule.lineNumber });
    else invalid.push({ line: rule.line, lineNumber: rule.lineNumber, message: 'No headers specified' });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0 || line.startsWith('#')) continue;
    if (line.length > MAX_LINE_LENGTH) {
      invalid.push({ lineNumber: i + 1, message: `Ignoring line ${i + 1} as it exceeds the maximum allowed length of ${MAX_LINE_LENGTH}.` });
      continue;
    }
    if (LINE_IS_PROBABLY_A_PATH.test(line)) {
      if (rules.length >= MAX_HEADER_RULES) {
        // As in Pages, the pending rule is still finished after the loop.
        invalid.push({ lineNumber: i + 1, message: `Maximum number of rules supported is ${MAX_HEADER_RULES}. Skipping remaining ${lines.length - i} lines of file.` });
        break;
      }
      finish();
      const [path, pathError] = validateUrl(line, false, true);
      if (pathError) {
        invalid.push({ line, lineNumber: i + 1, message: pathError });
        rule = undefined;
        continue;
      }
      rule = { path, line, lineNumber: i + 1, headers: {}, unsetHeaders: [] };
      continue;
    }
    if (!line.includes(HEADER_SEPARATOR)) {
      if (!rule) {
        invalid.push({ line, lineNumber: i + 1, message: 'Expected a path beginning with at least one forward-slash' });
      } else if (line.trim().startsWith(UNSET_OPERATOR)) {
        rule.unsetHeaders.push(line.trim().replace(UNSET_OPERATOR, ''));
      } else {
        invalid.push({ line, lineNumber: i + 1, message: 'Expected a colon-separated header pair (e.g. name: value)' });
      }
      continue;
    }
    const [rawName, ...rawValue] = line.split(HEADER_SEPARATOR);
    const name = rawName.trim().toLowerCase();
    if (name.includes(' ')) {
      invalid.push({ line, lineNumber: i + 1, message: 'Header name cannot include spaces' });
      continue;
    }
    const value = rawValue.join(HEADER_SEPARATOR).trim();
    if (name === '') {
      invalid.push({ line, lineNumber: i + 1, message: 'No header name specified' });
      continue;
    }
    if (value === '') {
      invalid.push({ line, lineNumber: i + 1, message: 'No header value specified' });
      continue;
    }
    if (!rule) {
      invalid.push({ line, lineNumber: i + 1, message: `Path should come before header (${name}: ${value})` });
      continue;
    }
    const existing = rule.headers[name];
    rule.headers[name] = existing ? `${existing}, ${value}` : value;
  }
  finish();
  return { rules, invalid };
}

/** constructHeaders(): rules keyed by path. A repeated path replaces the earlier block in place. */
export function constructRules(parsed) {
  const rules = {};
  for (const rule of parsed.rules) {
    rules[rule.path] = {};
    if (Object.keys(rule.headers).length) rules[rule.path].set = rule.headers;
    if (rule.unsetHeaders.length) rules[rule.path].unset = rule.unsetHeaders;
  }
  return rules;
}

const escapeRegex = str => str.replace(ESCAPE_REGEX_CHARACTERS, '\\$&');

/** The compile half of generateRulesMatcher(). Rules whose RegExp fails are dropped by Pages. */
export function compileRules(rules) {
  const compiled = [];
  const dropped = [];
  for (const [path, match] of Object.entries(rules)) {
    const crossHost = path.startsWith('https://');
    let rule = path.split('*').map(escapeRegex).join('(?<splat>.*)');
    for (const hostMatch of rule.matchAll(HOST_PLACEHOLDER_REGEX)) rule = rule.split(hostMatch[0]).join(`(?<${hostMatch[1]}>[^/.]+)`);
    for (const pathMatch of rule.matchAll(PLACEHOLDER_REGEX)) rule = rule.split(pathMatch[0]).join(`(?<${pathMatch[1]}>[^/]+)`);
    try {
      compiled.push({ path, crossHost, regExp: new RegExp('^' + rule + '$'), match });
    } catch {
      dropped.push(path);
    }
  }
  return { compiled, dropped };
}

const replacer = (str, replacements) => {
  for (const [replacement, value] of Object.entries(replacements)) str = str.replaceAll(`:${replacement}`, value);
  return str;
};

/** The match half of generateRulesMatcher(), with the headers replacer from handler.ts. */
export function matchRules(compiled, url) {
  const { pathname, hostname } = new URL(url);
  const matches = [];
  for (const { path, crossHost, regExp, match } of compiled) {
    const result = regExp.exec(crossHost ? `https://${hostname}${pathname}` : pathname);
    if (!result) continue;
    const set = {};
    for (const key of Object.keys(match.set || {})) set[key] = replacer(match.set[key], result.groups || {});
    matches.push({ path, set, unset: match.unset || [] });
  }
  return matches;
}

/** attachHeaders() from handler.ts: the first rule that sets a header replaces it, later rules append. */
export function attachHeaders(responseHeaders, matches) {
  const existing = new Headers(responseHeaders);
  const extra = new Headers({
    'access-control-allow-origin': '*',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...(existing.has('content-type') ? { 'x-content-type-options': 'nosniff' } : {}),
  });
  const headers = new Headers({ ...Object.fromEntries(existing.entries()), ...Object.fromEntries(extra.entries()) });
  const setMap = new Set();
  for (const { set = {}, unset = [] } of matches) {
    for (const key of unset) headers.delete(key);
    for (const key of Object.keys(set)) {
      if (setMap.has(key.toLowerCase())) headers.append(key, set[key]);
      else {
        headers.set(key, set[key]);
        setMap.add(key.toLowerCase());
      }
    }
  }
  return headers;
}

/**
 * Headers Pages sends for a GET of a static asset at `url`: serveAsset's browser
 * default, then `_headers`, then the 404 rewrite to `no-store`.
 */
export function staticAssetHeaders(compiled, url, { status = 200, contentType = 'text/html; charset=utf-8' } = {}) {
  const base = new Headers({ 'content-type': contentType });
  base.append('cache-control', CACHE_CONTROL_BROWSER);
  const headers = attachHeaders(base, matchRules(compiled, url));
  if (status === 404) {
    if (headers.has('cache-control')) headers.delete('cache-control');
    headers.append('cache-control', 'no-store');
  }
  return headers;
}
