'use strict';

const { createHash } = require('node:crypto');

// Pure contract verification for the future trusted, approved HTTP transport.
// This module neither authorizes a preview nor reads credentials/environment,
// performs network I/O, executes candidate code, or writes/logs a receipt. The
// caller must first approve the exact SHA/manifest/origin and supply a bounded,
// redirect-free transport. Raw response data is consumed only in this module;
// the returned receipt contains fixed labels, numbers and comparison booleans.
const MiB = 1024 * 1024;
const MAX_BODY = 4 * MiB;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'public, no-cache';
const MANIFEST_PATH = '/assets/home-perf/manifest.json';
const MISSING_PATH = '/assets/home-perf/missing-000000000000.avif';
const ETAG = /^(?:W\/)?"[\x21\x23-\x7e]{0,1024}"$/;
const ASSET_PATH = /^assets\/home-perf\/[a-z0-9]+(?:-[a-z0-9]+)*-([a-f0-9]{12})\.(avif|woff2)$/;

function exact(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

function dataObject(value, keys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const own = Reflect.ownKeys(value);
  if (keys && (own.length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))) return false;
  return own.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
}

function reviewedEntries(manifest) {
  if (!dataObject(manifest, ['version', 'headSha', 'assets']) || manifest.version !== 1
      || !exact(/^[a-f0-9]{40}$/, manifest.headSha) || !dataObject(manifest.assets)) return null;
  const entries = Object.entries(manifest.assets);
  if (entries.length < 2 || entries.length > 256) return null;
  let total = 0, image = false, font = false;
  const copies = [];
  for (const [file, asset] of entries) {
    const match = ASSET_PATH.exec(file);
    if (!match || match[0] !== file || file.length > 255 || !dataObject(asset, ['bytes', 'sha256'])
        || !exact(/^[a-f0-9]{64}$/, asset.sha256) || match[1] !== asset.sha256.slice(0, 12)
        || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > MAX_BODY) return null;
    total += asset.bytes;
    if (total > 32 * MiB) return null;
    image ||= match[2] === 'avif';
    font ||= match[2] === 'woff2';
    // Copy primitive fields before the first await; later input mutations cannot
    // change which canonical URLs or hashes this invocation checks.
    copies.push({ path: '/' + file, bytes: asset.bytes, sha256: asset.sha256, type: match[2] });
  }
  return image && font ? copies : null;
}

function responseData(response) {
  if (response === null || typeof response !== 'object') return null;
  // The trusted transport intentionally makes these data fields non-enumerable.
  const descriptors = ['status', 'rawHeaders', 'body'].map(key => Object.getOwnPropertyDescriptor(response, key));
  if (descriptors.some(d => !d || !Object.hasOwn(d, 'value'))) return null;
  const [status, rawHeaders, body] = descriptors.map(d => d.value);
  if (!Number.isInteger(status) || status < 200 || status > 599 || !Buffer.isBuffer(body)
      || body.length > MAX_BODY || !Array.isArray(rawHeaders) || rawHeaders.length % 2
      || rawHeaders.length > 256) return null;
  const headers = new Map();
  let headerBytes = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = Object.getOwnPropertyDescriptor(rawHeaders, String(i));
    const value = Object.getOwnPropertyDescriptor(rawHeaders, String(i + 1));
    if (!name || !value || !Object.hasOwn(name, 'value') || !Object.hasOwn(value, 'value')
        || !exact(/^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$/, name.value)
        || !exact(/^[\t\x20-\x7e\x80-\xff]*$/, value.value)) return null;
    headerBytes += name.value.length + value.value.length + 4;
    if (headerBytes > 16 * 1024) return null;
    const key = name.value.toLowerCase();
    if (!headers.has(key)) headers.set(key, []);
    headers.get(key).push(value.value);
  }
  // Representation bytes must remain uncompressed, as required by transport.
  const encoding = headers.get('content-encoding') || [];
  if (encoding.length > 1 || (encoding.length === 1 && encoding[0].toLowerCase() !== 'identity')) return null;
  return { status, body, headers };
}

function single(data, name) {
  const values = data.headers.get(name);
  return values?.length === 1 ? values[0] : null;
}

function validEtag(data) {
  const value = single(data, 'etag');
  return exact(ETAG, value) ? value : null;
}

function row(fields, checks) {
  return { ...fields, status: null, bytes: null, set_cookie_present: null,
    checks: Object.fromEntries(['response', ...checks].map(key => [key, false])) };
}

function accepted(row) { return Object.values(row.checks).every(value => value === true); }

async function verifyCacheContract(input = {}) {
  const receipt = { version: 1, verified: false, input_valid: false, assets: [], controls: [], conditionals: [] };
  let entries, request;
  try {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return receipt;
    const manifest = Object.getOwnPropertyDescriptor(input, 'manifest');
    const transport = Object.getOwnPropertyDescriptor(input, 'request');
    if (!manifest || !transport || !Object.hasOwn(manifest, 'value') || !Object.hasOwn(transport, 'value')) return receipt;
    entries = reviewedEntries(manifest.value);
    request = transport.value;
  } catch { return receipt; }
  if (!entries || typeof request !== 'function') return receipt;
  receipt.input_valid = true;
  receipt.assets = entries.map((_, index) => row({ index }, ['status', 'hash', 'bytes', 'cache_control', 'cors', 'nosniff', 'etag', 'content_type']));
  receipt.controls = [
    row({ role: 'root' }, ['status', 'cache_control', 'content_type']),
    row({ role: 'en' }, ['status', 'cache_control']),
    row({ role: 'manifest' }, ['status', 'cache_control', 'etag']),
    row({ role: 'missing' }, ['status', 'cache_control']),
  ];
  receipt.conditionals = ['image', 'font', 'manifest'].flatMap(role => ['GET', 'HEAD'].map(method =>
    row({ role, method }, ['baseline_etag', 'status', 'bytes', 'cache_control'])));

  async function read(path, target, options = {}) {
    try {
      const data = responseData(await request({ path, method: 'GET', maxBytes: MAX_BODY, ...options }));
      if (data) {
        target.status = data.status;
        target.bytes = data.body.length;
        target.set_cookie_present = data.headers.has('set-cookie');
        target.checks.response = true;
      }
      return data;
    } catch {
      // Error messages, headers, body bytes, URL and ETag are never reflected.
      return null;
    }
  }

  const root = await read('/', receipt.controls[0]);
  if (root) {
    Object.assign(receipt.controls[0].checks, {
      status: root.status === 200,
      cache_control: single(root, 'cache-control') === REVALIDATE,
      content_type: single(root, 'content-type')?.split(';')[0].trim().toLowerCase() === 'text/html',
    });
  }
  // Keep the original pre-probe homepage guard. The injected transport rejects
  // redirects; a non-HTML/non-200 response cannot trigger further probes here.
  if (!root || !receipt.controls[0].checks.status || !receipt.controls[0].checks.content_type) return receipt;

  const validators = [];
  for (let index = 0; index < entries.length; index++) {
    const expected = entries[index], target = receipt.assets[index];
    const data = await read(expected.path, target, { maxBytes: expected.bytes });
    if (!data) continue;
    const etag = validEtag(data);
    Object.assign(target.checks, {
      status: data.status === 200,
      hash: createHash('sha256').update(data.body).digest('hex') === expected.sha256,
      bytes: data.body.length === expected.bytes,
      cache_control: single(data, 'cache-control') === IMMUTABLE,
      cors: single(data, 'access-control-allow-origin') === '*',
      nosniff: single(data, 'x-content-type-options') === 'nosniff',
      etag: etag !== null,
      content_type: single(data, 'content-type')?.split(';')[0].trim() === (expected.type === 'woff2' ? 'font/woff2' : 'image/avif'),
    });
    // Match the original first image/font samples. Never substitute a later
    // passing asset if the first sample is broken or lacks its validator.
    validators[index] = data.status === 200 ? etag : null;
  }

  const controlPaths = ['/en/', MANIFEST_PATH, MISSING_PATH];
  let manifestEtag = null;
  for (let i = 0; i < controlPaths.length; i++) {
    const target = receipt.controls[i + 1];
    const data = await read(controlPaths[i], target);
    if (!data) continue;
    if (i < 2) {
      target.checks.status = data.status === 200;
      target.checks.cache_control = single(data, 'cache-control') === REVALIDATE;
      if (i === 1) {
        const etag = validEtag(data);
        target.checks.etag = etag !== null;
        if (data.status === 200) manifestEtag = etag;
      }
    } else {
      target.checks.status = data.status === 404;
      const values = data.headers.get('cache-control') || [];
      target.checks.cache_control = values.length <= 1
        && values.every(value => !value.includes('31536000') && !/(?:^|,)\s*immutable\s*(?:,|$)/i.test(value));
    }
  }

  const imageIndex = entries.findIndex(entry => entry.type === 'avif');
  const fontIndex = entries.findIndex(entry => entry.type === 'woff2');
  const samples = [
    [entries[imageIndex].path, validators[imageIndex], IMMUTABLE],
    [entries[fontIndex].path, validators[fontIndex], IMMUTABLE],
    [MANIFEST_PATH, manifestEtag, REVALIDATE],
  ];
  for (let i = 0; i < samples.length; i++) {
    const [path, etag, policy] = samples[i];
    for (let m = 0; m < 2; m++) {
      const target = receipt.conditionals[i * 2 + m];
      if (!etag) continue;
      target.checks.baseline_etag = true;
      const data = await read(path, target, { method: target.method, headers: { 'If-None-Match': etag } });
      if (!data) continue;
      target.checks.status = data.status === 304;
      target.checks.bytes = data.body.length === 0;
      target.checks.cache_control = single(data, 'cache-control') === policy;
    }
  }
  receipt.verified = [...receipt.assets, ...receipt.controls, ...receipt.conditionals].every(accepted);
  return receipt;
}

module.exports = { verifyCacheContract };
