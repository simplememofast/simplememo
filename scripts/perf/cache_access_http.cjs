'use strict';

// Trusted transport only. This module does not read secrets, run candidate code,
// authorize a deployment, create cookies, follow redirects, or emit receipts.
// The caller must first validate the reviewed SHA/deployment/manifest. Credentials
// and all raw response fields are private to that trusted caller; never log them.
const https = require('node:https');
const { inspect } = require('node:util');
const inspector = require('node:inspector');

const CONTROL_PATHS = new Set(['/', '/en/', '/assets/home-perf/manifest.json',
  '/assets/home-perf/missing-000000000000.avif']);
const ORIGIN = /^https:\/\/[a-f0-9]{8}\.simplememo-596\.pages\.dev$/;
const ASSET = /^\/assets\/home-perf\/[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{12}\.(?:avif|woff2)$/;
const ETAG = /^(?:W\/)?"[\x21\x23-\x7e]{0,1024}"$/;
const MiB = 1024 * 1024;

// A trusted launcher must remove diagnostics/preloads BEFORE starting Node.
// Deleting environment variables here cannot undo an already initialized debug
// logger or previously executed preload. Remember unsafe state observed at load,
// and recheck before each request, so a later env deletion does not clear it.
function unsafeRuntime() {
  return ['NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_OPTIONS'].some(name => Boolean(process.env[name]))
    // --inspect-port / --inspect-publish-uid alone do not enable the inspector;
    // Node's test runner forwards these inert defaults to ordinary test files.
    || process.execArgv.some(arg => /^(?:--(?:inspect(?:-brk|-wait)?|debug(?:-brk)?)(?:=|$)|--(?:require|import|loader|experimental-loader|eval|print|tls-keylog)(?:=|$)|-[rep](?:.|$))/.test(arg))
    || Boolean(inspector.url());
}
let unsafeRuntimeObserved = unsafeRuntime();
function requireSafeRuntime() {
  unsafeRuntimeObserved ||= unsafeRuntime();
  if (unsafeRuntimeObserved) fail('UNSAFE_RUNTIME');
}

class CacheAccessError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CacheAccessError';
    this.code = code;
  }
  toJSON() { return { code: this.code }; }
}

function fail(code) { throw new CacheAccessError(code); }
function exact(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}
function dataRecord(value, allowed, required, code) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(code);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')) fail(code);
  }
  if (required.some(key => !Object.hasOwn(value, key))) fail(code);
}
function limit(value, fallback, maximum) {
  value ??= fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('INVALID_LIMIT');
  return value;
}
function headerValues(rawHeaders, name) {
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === name) values.push(rawHeaders[i + 1]);
  }
  return values;
}
function privateResponse(status, rawHeaders, body) {
  const setCookiePresent = headerValues(rawHeaders, 'set-cookie').length > 0;
  const summary = () => ({ code: 'RESPONSE_RECEIVED', status, bytes: body.length, setCookiePresent });
  const response = { status, setCookiePresent };
  Object.defineProperties(response, {
    // Preserve Node's flat raw header array, including duplicate cache headers.
    // Non-enumerability and safe inspection are accidental-log safeguards, not
    // a substitute for keeping the caller and the server code trusted.
    rawHeaders: { value: Object.freeze(rawHeaders.slice()) },
    body: { value: body },
    toJSON: { value: summary },
    [inspect.custom]: { value: summary },
  });
  return Object.freeze(response);
}

function createCacheAccessTransport(config, requestFactory = https.request) {
  requireSafeRuntime();
  dataRecord(config, ['origin', 'paths', 'credentials', 'timeoutMs', 'maxBytes', 'maxTotalBytes', 'maxRequests'],
    ['origin', 'paths', 'credentials'], 'INVALID_CONFIG');
  if (!exact(ORIGIN, config.origin)) fail('INVALID_ORIGIN');
  if (typeof requestFactory !== 'function') fail('INVALID_REQUEST_FACTORY');
  const origin = new URL(config.origin);
  if (!Array.isArray(config.paths) || config.paths.length < 1 || config.paths.length > 260) fail('INVALID_PATHS');
  const paths = new Set();
  for (let i = 0; i < config.paths.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(config.paths, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('INVALID_PATHS');
    const path = descriptor.value;
    if (typeof path !== 'string' || path.length > 256 || (!CONTROL_PATHS.has(path) && !exact(ASSET, path))
        || paths.has(path)) fail('INVALID_PATHS');
    paths.add(path);
  }
  dataRecord(config.credentials, ['clientId', 'clientSecret'], ['clientId', 'clientSecret'], 'INVALID_CREDENTIALS');
  const { clientId, clientSecret } = config.credentials;
  if (![clientId, clientSecret].every(value => typeof value === 'string' && value.length <= 4096
      && exact(/^[\x21-\x7e]+$/, value))) fail('INVALID_CREDENTIALS');
  const timeoutMs = limit(config.timeoutMs, 20000, 30000);
  const maxBytes = limit(config.maxBytes, 4 * MiB, 4 * MiB);
  const maxTotalBytes = limit(config.maxTotalBytes, 40 * MiB, 64 * MiB);
  const maxRequests = limit(config.maxRequests, 300, 1024);
  const etags = new Map();
  let requests = 0, totalBytes = 0;

  async function request(input) {
    requireSafeRuntime();
    dataRecord(input, ['path', 'method', 'headers', 'maxBytes'], ['path'], 'INVALID_REQUEST');
    const method = input.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') fail('METHOD_NOT_ALLOWED');
    if (typeof input.path !== 'string' || !paths.has(input.path)) fail('PATH_NOT_ALLOWED');
    const path = input.path;
    const responseLimit = limit(input.maxBytes, maxBytes, maxBytes);
    let conditional = false, validator;
    if (input.headers !== undefined) {
      dataRecord(input.headers, ['If-None-Match'], ['If-None-Match'], 'HEADERS_NOT_ALLOWED');
      validator = input.headers['If-None-Match'];
      if (!exact(ETAG, validator) || etags.get(path) !== validator) fail('VALIDATOR_NOT_APPROVED');
      conditional = true;
    }
    if (++requests > maxRequests || totalBytes >= maxTotalBytes) fail('REQUEST_BUDGET_EXCEEDED');
    const headers = {
      'CF-Access-Client-Id': clientId,
      'CF-Access-Client-Secret': clientSecret,
      // Return the original uncompressed representation for existing byte/hash
      // checks. There is deliberately no browser, cookie jar, or Referer.
      'Accept-Encoding': 'identity',
      'Cache-Control': 'no-cache',
    };
    if (conditional) headers['If-None-Match'] = validator;

    return new Promise((resolve, reject) => {
      let req, response, done = false, bytes = 0;
      const chunks = [];
      const finishError = code => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chunks.length = 0;
        // No Error cause, native error text, URL, headers or body escapes.
        response?.destroy();
        req?.destroy();
        reject(new CacheAccessError(code));
      };
      // A wall-clock deadline covers DNS/TLS/headers and a slow trickle body;
      // socket inactivity timeouts alone would not bound the whole operation.
      const timer = setTimeout(() => finishError('REQUEST_TIMEOUT'), timeoutMs);
      try {
        req = requestFactory({
          protocol: 'https:', hostname: origin.hostname, port: 443, path, method,
          headers, rejectUnauthorized: true, agent: false, maxHeaderSize: 16 * 1024,
        }, incoming => {
          response = incoming;
          response.on('error', () => finishError('RESPONSE_ERROR'));
          response.on('aborted', () => finishError('RESPONSE_ABORTED'));
          if (done) { response.destroy(); return; }
          const status = response.statusCode;
          if (!Number.isInteger(status) || status < 200 || status > 599) { finishError('INVALID_STATUS'); return; }
          if (status >= 300 && status <= 399 && status !== 304) { finishError('REDIRECT_NOT_ALLOWED'); return; }
          if (status === 304 && !conditional) { finishError('UNEXPECTED_NOT_MODIFIED'); return; }
          if (status === 401 || status === 403) { finishError('ACCESS_DENIED'); return; }
          const rawHeaders = response.rawHeaders.slice();
          const encoding = headerValues(rawHeaders, 'content-encoding');
          if (encoding.length > 1 || (encoding.length === 1 && encoding[0].toLowerCase() !== 'identity')) {
            finishError('UNEXPECTED_CONTENT_ENCODING'); return;
          }
          const lengths = headerValues(rawHeaders, 'content-length');
          // HEAD and 304 may legitimately declare the full representation size.
          if (method !== 'HEAD' && status !== 304 && lengths.length === 1 && /^\d+$/.test(lengths[0])
              && (Number(lengths[0]) > responseLimit || Number(lengths[0]) > maxTotalBytes - totalBytes)) {
            finishError('RESPONSE_TOO_LARGE'); return;
          }
          response.on('data', chunk => {
            if (done) return;
            if ((method === 'HEAD' || status === 304) && chunk.length) { finishError('UNEXPECTED_RESPONSE_BODY'); return; }
            // Stop before adding an over-limit chunk to the retained buffer.
            if (chunk.length > responseLimit - bytes || chunk.length > maxTotalBytes - totalBytes) {
              finishError('RESPONSE_TOO_LARGE'); return;
            }
            bytes += chunk.length;
            totalBytes += chunk.length;
            chunks.push(chunk);
          });
          response.on('end', () => {
            if (done) return;
            if (!response.complete) { finishError('RESPONSE_INCOMPLETE'); return; }
            done = true;
            clearTimeout(timer);
            if (status === 200 && !conditional) {
              const values = headerValues(rawHeaders, 'etag');
              if (values.length === 1 && exact(ETAG, values[0])) etags.set(path, values[0]);
              else etags.delete(path);
            }
            // Non-strict Access may issue CF_Authorization. Retain raw headers
            // for the trusted validator, report presence, and never store or
            // replay any Cookie. Presence alone is not an authentication error.
            resolve(privateResponse(status, rawHeaders, Buffer.concat(chunks, bytes)));
          });
        });
        // Node otherwise silently truncates rawHeaders at its default count,
        // potentially hiding trailing duplicate cache policy or Set-Cookie.
        // Keep the strict parser byte cap; the validator sees every header.
        req.maxHeadersCount = 0;
        req.on('error', () => finishError('REQUEST_ERROR'));
        req.on('upgrade', (_response, socket) => { socket.destroy(); finishError('UPGRADE_NOT_ALLOWED'); });
        req.end();
      } catch {
        finishError('REQUEST_ERROR');
      }
    });
  }
  return Object.freeze({ request });
}

module.exports = { createCacheAccessTransport, CacheAccessError };
