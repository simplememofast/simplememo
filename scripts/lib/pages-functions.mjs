// A model of how Cloudflare Pages routes a request through Functions.
//
// Ported from wrangler 3.114.17 (licensed MIT OR Apache-2.0):
//   src/pages/functions/filepath-routing.ts: generateConfigFromFileTree, compareRoutes,
//     convertCatchallParams, convertSimpleParams (and forEachFile's breadth-first walk)
//   templates/pages-template-worker.ts: executeRequest (middlewares on partial matches in
//     reverse route order, then the first exact module) and the `next()` fallback to ASSETS.
// Matching uses path-to-regexp 6.3.0 (./path-to-regexp.mjs), the version wrangler pins:
// case-insensitive, optional trailing slash, `:x*` matches zero or more segments.
//
// Where Pages' behaviour depends on things this model cannot see (readdir order when two
// files map to the same route; exports of .ts/.tsx/.jsx files that Node cannot import),
// the model reports a problem instead of guessing.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { match } from './path-to-regexp.mjs';

const FUNCTION_EXT = /^\.(mjs|js|ts|tsx|jsx)$/;
const HANDLER_EXPORT = /^onRequest(Get|Post|Put|Patch|Delete|Options|Head)?$/;
const VALID_PARAM = /^[A-Za-z0-9_]+$/;
// The router escapes these before matching; `*` stays a path-to-regexp modifier.
const ESCAPE_REGEX = /[.+?^${}()|[\]\\]/g;

function convertCatchallParams(routePath) {
  return routePath.replace(/\[\[([^\]]+)\]\]/g, (_, param) => {
    if (VALID_PARAM.test(param)) return `:${param}*`;
    throw new Error(`Invalid Pages function route parameter - "[[${param}]]".`);
  });
}

function convertSimpleParams(routePath) {
  return routePath.replace(/\[([^\]]+)\]/g, (_, param) => {
    if (VALID_PARAM.test(param)) return `:${param}`;
    throw new Error(`Invalid Pages function route parameter - "[${param}]".`);
  });
}

export function compareRoutes({ routePath: routePathA, method: methodA }, { routePath: routePathB, method: methodB }) {
  const parse = routePath => routePath.slice(1).split('/').filter(Boolean);
  const segmentsA = parse(routePathA);
  const segmentsB = parse(routePathB);
  if (segmentsA.length !== segmentsB.length) return segmentsB.length - segmentsA.length;
  for (let i = 0; i < segmentsA.length; i++) {
    const isWildcardA = segmentsA[i].includes('*');
    const isWildcardB = segmentsB[i].includes('*');
    const isParamA = segmentsA[i].includes(':');
    const isParamB = segmentsB[i].includes(':');
    if (isWildcardA && !isWildcardB) return 1;
    if (!isWildcardA && isWildcardB) return -1;
    if (isParamA && !isParamB) return 1;
    if (!isParamA && isParamB) return -1;
  }
  if (methodA && !methodB) return -1;
  if (!methodA && methodB) return 1;
  return routePathA.localeCompare(routePathB);
}

// Exports of a file that Node cannot import, read conservatively from the source text.
function declaredExports(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return [...names];
}

/**
 * generateConfigFromFileTree() for `<root>/functions`, with each handler loaded.
 * Returns { routes, problems }. A route is
 * { routePath, mountPath, method, middleware: [handlerRef], module: [handlerRef] },
 * where handlerRef is { file, exportName, handlers: [fn] } (handlers is empty when the
 * file cannot be imported here).
 */
export async function buildRoutes(root) {
  const baseDir = path.join(root, 'functions');
  const problems = [];
  if (!fs.existsSync(baseDir)) return { routes: [], problems };
  const entries = [];
  const rel = file => path.relative(root, file).split(path.sep).join('/');
  const queue = [baseDir];
  while (queue.length) {
    const cwd = queue.shift();
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      const file = path.join(cwd, entry.name);
      if (entry.isDirectory()) { queue.push(file); continue; }
      if (!entry.isFile()) { problems.push(`${rel(file)}: only regular files are modelled under functions/`); continue; }
      const ext = path.extname(file);
      if (!FUNCTION_EXT.test(ext)) continue;
      let names;
      let mod = null;
      if (/^\.m?js$/.test(ext)) {
        mod = await import(pathToFileURL(file).href);
        names = Object.keys(mod);
      } else {
        names = declaredExports(fs.readFileSync(file, 'utf8'));
      }
      for (const exportName of names) {
        const [matched, method = ''] = exportName.match(HANDLER_EXPORT) ?? [];
        if (!matched) continue;
        const base = path.basename(file).slice(0, -ext.length);
        const isIndex = base === 'index';
        const isMiddleware = base === '_middleware' || base === '_middleware_';
        let routePath = path.relative(baseDir, file).slice(0, -ext.length);
        let mountPath = path.dirname(routePath);
        if (isIndex || isMiddleware) routePath = path.dirname(routePath);
        if (routePath === '.') routePath = '';
        if (mountPath === '.') mountPath = '';
        let converted;
        try {
          converted = {
            routePath: convertSimpleParams(convertCatchallParams(`/${routePath}`)).split(path.sep).join('/'),
            mountPath: convertSimpleParams(convertCatchallParams(`/${mountPath}`)).split(path.sep).join('/'),
          };
        } catch (e) {
          problems.push(`${rel(file)}: ${e.message}`);
          continue;
        }
        const handlers = mod ? [mod[exportName]].flat() : [];
        if (mod && (!handlers.length || handlers.some(h => typeof h !== 'function'))) problems.push(`${rel(file)}: ${exportName} is not a function or array of functions`);
        entries.push({ ...converted, method: method.toUpperCase(), kind: isMiddleware ? 'middleware' : 'module',
          ref: { file: rel(file), exportName, handlers: mod ? handlers : [], runnable: Boolean(mod) } });
      }
    }
  }
  // Same routePath and method merge with Object.assign in Pages, so a second file of the
  // same kind silently replaces the first, depending on readdir order. Refuse that.
  const routes = [];
  for (const { routePath, mountPath, method, kind, ref } of entries) {
    let route = routes.find(r => r.routePath === routePath && r.method === method);
    if (!route) routes.push(route = { routePath, mountPath, method, middleware: [], module: [] });
    if (route[kind].length) problems.push(`${ref.file} and ${route[kind][0].file} both provide the ${kind} for ${routePath}${method ? ' ' + method : ''}; Pages keeps only one of them, depending on file order`);
    route.mountPath = mountPath;
    route[kind] = [ref];
  }
  routes.sort(compareRoutes);
  return { routes, problems };
}

// Same compilation as the template worker, cached because the check runs thousands of requests.
const compiledMatchers = new Map();
const matcher = (pattern, end) => {
  const key = `${end}\u0000${pattern}`;
  if (!compiledMatchers.has(key)) compiledMatchers.set(key, match(pattern.replace(ESCAPE_REGEX, '\\$&'), { end }));
  return compiledMatchers.get(key);
};

/** executeRequest(): the handlers Pages runs for a request, in order. */
export function handlerChain(routes, method, requestPath) {
  const chain = [];
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== method) continue;
    const routeMatch = matcher(route.routePath, false)(requestPath);
    const mountMatch = matcher(route.mountPath, false)(requestPath);
    if (routeMatch && mountMatch) {
      for (const ref of route.middleware) chain.push({ ref, kind: 'middleware', params: routeMatch.params, path: mountMatch.path });
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== method) continue;
    const routeMatch = matcher(route.routePath, true)(requestPath);
    const mountMatch = matcher(route.mountPath, false)(requestPath);
    if (routeMatch && mountMatch && route.module.length) {
      for (const ref of route.module) chain.push({ ref, kind: 'module', params: routeMatch.params, path: routeMatch.path });
      break;
    }
  }
  return chain;
}

/**
 * Run a request through the chain like the template worker's `next()`, ending at
 * `assets(request)`. `env` is passed to every handler. Throws if a handler in the chain
 * could not be imported (its behaviour is unknown).
 */
export async function runChain(chain, request, { assets, env }) {
  const handlers = chain.flatMap(step => {
    if (!step.ref.runnable) throw new Error(`${step.ref.file} (${step.ref.exportName}) runs for ${new URL(request.url).pathname} but cannot be executed by this check`);
    return step.ref.handlers.map(handler => ({ ...step, handler }));
  });
  let index = 0;
  let current = request;
  let data = {};
  const next = async (input, init) => {
    if (input !== undefined) {
      const url = typeof input === 'string' ? new URL(input, current.url).toString() : input;
      current = new Request(url, init);
    }
    if (index < handlers.length) {
      const { handler, params, path: functionPath } = handlers[index++];
      return handler({
        request: new Request(current.clone()), functionPath, next, params, env,
        get data() { return data; }, set data(value) { data = value; },
        waitUntil() {}, passThroughOnException() {},
      });
    }
    return assets(current);
  };
  return next();
}
