'use strict';

const { createHash } = require('node:crypto');

// This is only a data gate for a future trusted manual workflow. It neither
// configures nor proves GitHub Environment protection, token scope/expiry, or
// Cloudflare Access policy. The caller must obtain context/PR/check data from
// authenticated GitHub sources and load policy + reviewed manifest separately
// from candidate code and dispatch inputs. No candidate code is loaded here.
// In particular, NEVER learn the expected App ID/slug from the check being
// validated. No production policy or credential defaults are supplied.
// Reviewed Pages Functions may still receive Access headers; the human review
// of that exact candidate and the provider's token scope remain prerequisites.
const REPOSITORY = 'simplememofast/simplememo';
const OWNER = 'simplememofast';
const WORKFLOW_REF = REPOSITORY + '/.github/workflows/home-perf-cache-approved.yml@refs/heads/main';
// Independently matched on prior main success checks 119353254222 and
// 119658829319, not learned from the candidate's check 119662420279.
const CLOUDFLARE_APP_ID = 85455;
const CLOUDFLARE_APP_SLUG = 'cloudflare-workers-and-pages';
// Cloudflare's dashboard project name and assigned pages.dev suffix differ.
const CLOUDFLARE_PROJECT = 'simplememo';
const PREVIEW_SUFFIX = 'simplememo-596.pages.dev';
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_ASSETS = 256;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value, name, keys) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), name + ' must be a JSON object');
  const prototype = Object.getPrototypeOf(value);
  requireThat(prototype === Object.prototype || prototype === null, name + ' must have a plain prototype');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireThat(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), name + ' must contain only JSON data properties');
  }
  if (keys) {
    requireThat(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)), name + ' has unexpected or missing fields');
  }
  return value;
}

function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return NaN;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(time).toISOString() === canonical ? time : NaN;
}

function validatePolicy(policy, now) {
  record(policy, 'trusted policy', ['approvedPullRequestNumber', 'approvedHeadSha', 'validUntil',
    'cloudflareAppId', 'cloudflareAppSlug', 'cloudflareAccountId', 'cloudflareProjectName', 'expectedManifestSha256']);
  requireThat(policy.approvedPullRequestNumber === 2164, 'trusted policy must approve PR 2164');
  requireThat(typeof policy.approvedHeadSha === 'string' && SHA.test(policy.approvedHeadSha), 'trusted policy needs an approved head SHA');
  requireThat(Number.isSafeInteger(now) && now >= 0, 'an explicit current time in milliseconds is required');
  requireThat(Number.isFinite(instant(policy.validUntil)) && now < instant(policy.validUntil), 'trusted policy is missing a valid unexpired deadline');
  // Its deadline must also be no later than the real token expiry, verified by
  // the operator outside this module. The gate has no access to a token.
  requireThat(policy.cloudflareAppId === CLOUDFLARE_APP_ID, 'trusted policy needs the independently verified Cloudflare App ID');
  requireThat(policy.cloudflareAppSlug === CLOUDFLARE_APP_SLUG, 'trusted policy needs the independently verified Cloudflare App slug');
  requireThat(typeof policy.cloudflareAccountId === 'string' && /^[a-f0-9]{32}$/.test(policy.cloudflareAccountId), 'trusted policy needs a Cloudflare account ID');
  requireThat(policy.cloudflareProjectName === CLOUDFLARE_PROJECT, 'trusted policy must name the approved Pages project');
  requireThat(typeof policy.expectedManifestSha256 === 'string' && SHA256.test(policy.expectedManifestSha256), 'trusted policy needs a reviewed manifest SHA256');
}

function validateDispatch(context) {
  record(context, 'dispatch context', ['repository', 'eventName', 'ref', 'workflowRef', 'workflowSha',
    'sha', 'checkoutSha', 'runAttempt', 'actor', 'triggeringActor']);
  requireThat(context.repository === REPOSITORY, 'unexpected dispatch repository');
  requireThat(context.eventName === 'workflow_dispatch', 'only workflow_dispatch is approved');
  requireThat(context.ref === 'refs/heads/main' && context.workflowRef === WORKFLOW_REF, 'dispatch must use the trusted main workflow');
  requireThat(typeof context.sha === 'string' && SHA.test(context.sha) && context.sha === context.workflowSha && context.sha === context.checkoutSha, 'trusted checkout, workflow and dispatch SHAs must match');
  requireThat(context.runAttempt === 1 || context.runAttempt === '1', 'reruns are not approved');
  requireThat(context.actor === OWNER && context.triggeringActor === OWNER, 'only the owner may dispatch this check');
}

function validatePullRequest(pr, request, policy) {
  record(request, 'manual request', ['pullRequestNumber', 'approvedHeadSha']);
  requireThat(request.pullRequestNumber === 2164 || request.pullRequestNumber === '2164', 'only PR 2164 is approved');
  requireThat(request.approvedHeadSha === policy.approvedHeadSha, 'manual head does not match the trusted review');
  record(pr, 'GitHub PR');
  record(pr.user, 'PR author');
  record(pr.base, 'PR base');
  record(pr.base.repo, 'base repository');
  record(pr.head, 'PR head');
  record(pr.head.repo, 'head repository');
  requireThat(pr.number === policy.approvedPullRequestNumber && pr.state === 'open' && pr.merged === false, 'approved PR must still be open and unmerged');
  requireThat(pr.base.ref === 'main' && pr.base.repo.full_name === REPOSITORY && pr.base.repo.fork === false, 'PR must target this repository main');
  requireThat(pr.head.repo.full_name === REPOSITORY && pr.head.repo.fork === false && pr.user.login === OWNER, 'forks and third-party PR authors are not approved');
  requireThat(pr.head.sha === policy.approvedHeadSha, 'PR head changed after review');
}

function previewOrigin(summary) {
  requireThat(typeof summary === 'string' && Buffer.byteLength(summary) <= 65536, 'deployment summary is missing or too large');
  // The verified Cloudflare format includes a separate mutable branch alias.
  // Validate and remove only that exact labelled row. Its URL is never returned
  // or used as a credential destination. An alias elsewhere still fails below.
  const branchRows = [...summary.matchAll(/<tr><td><strong>Branch Preview URL:<\/strong><\/td><td>\s*<a href='([^']+)'>([^<]+)<\/a>\s*<\/td><\/tr>/g)];
  requireThat(summary.split('Branch Preview URL:').length - 1 === branchRows.length, 'deployment summary has a malformed branch alias row');
  requireThat(branchRows.length <= 1, 'deployment summary has ambiguous branch aliases');
  if (branchRows.length === 1) {
    const [row, href, label] = branchRows[0];
    requireThat(href === label && /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.simplememo-596\.pages\.dev$/.test(href), 'branch alias must be an exact same-project root');
    requireThat(!/^https:\/\/[a-f0-9]{8}\./.test(href), 'branch alias cannot hide another immutable deployment');
    summary = summary.replace(row, '');
  }
  const candidates = [];
  for (const match of summary.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    let value = match[0];
    // Cloudflare emits Markdown links. Remove exactly their paired closing
    // delimiter, never normalize host names, ports, paths, or query strings.
    if (summary[match.index - 1] === '(' && value.endsWith(')')) value = value.slice(0, -1);
    let pagesCandidate = /pages\.dev/i.test(value);
    // Include encoded/IDNA-normalized Pages hosts in the candidate set so a
    // noncanonical second URL cannot disappear from ambiguity validation. The
    // raw URL must still pass the strict, unencoded root check below.
    try { pagesCandidate ||= /pages\.dev/i.test(new URL(value).hostname); } catch { /* not a valid host */ }
    if (pagesCandidate) candidates.push(value);
  }
  requireThat(candidates.length > 0, 'deployment summary must contain an immutable Pages URL');
  const origins = new Set();
  for (const candidate of candidates) {
    requireThat(/^https:\/\/[a-f0-9]{8}\.simplememo-596\.pages\.dev\/?$/.test(candidate), 'deployment URL must be the exact immutable preview root');
    const origin = new URL(candidate);
    requireThat(origin.hostname.endsWith('.' + PREVIEW_SUFFIX), 'deployment must use the assigned preview domain');
    origins.add(origin.origin);
  }
  requireThat(origins.size === 1, 'deployment summary has ambiguous immutable previews');
  return [...origins][0];
}

function validateDeployment(check, policy) {
  record(check, 'GitHub deployment check');
  record(check.app, 'deployment App');
  record(check.output, 'deployment output');
  requireThat(check.name === 'Cloudflare Pages' && check.status === 'completed' && check.conclusion === 'success', 'Cloudflare deployment must be completed and successful');
  requireThat(check.head_sha === policy.approvedHeadSha, 'deployment is for a different head');
  requireThat(check.app.id === policy.cloudflareAppId && check.app.slug === policy.cloudflareAppSlug, 'deployment provider does not match trusted policy');
  // Exact observed Cloudflare dashboard routing syntax only. No general query
  // parser/redirect target is accepted, and extra/encoded query data fails.
  const prefix = 'https://dash.cloudflare.com/?to=/' + policy.cloudflareAccountId + '/pages/view/' + policy.cloudflareProjectName + '/';
  requireThat(typeof check.details_url === 'string' && check.details_url.startsWith(prefix), 'deployment dashboard must match the approved account and project');
  const deploymentId = check.details_url.slice(prefix.length);
  requireThat(new RegExp('^' + UUID + '$').test(deploymentId), 'deployment dashboard must identify one deployment without credentials or URL extras');
  const origin = previewOrigin(check.output.summary);
  requireThat(new URL(origin).hostname.startsWith(deploymentId.slice(0, 8) + '.'), 'preview does not match the dashboard deployment');
  return { origin, deploymentId };
}

function validateManifest(raw, policy) {
  requireThat(typeof raw === 'string' && Buffer.byteLength(raw) <= MAX_MANIFEST_BYTES, 'reviewed manifest must be bounded JSON text');
  requireThat(createHash('sha256').update(raw).digest('hex') === policy.expectedManifestSha256, 'manifest differs from the trusted review');
  let manifest;
  try { manifest = JSON.parse(raw); } catch { throw new Error('reviewed manifest is not JSON'); }
  record(manifest, 'reviewed manifest', ['version', 'headSha', 'assets']);
  requireThat(manifest.version === 1 && manifest.headSha === policy.approvedHeadSha, 'manifest version or reviewed head is incorrect');
  record(manifest.assets, 'manifest assets');
  const entries = Object.entries(manifest.assets);
  requireThat(entries.length > 0 && entries.length <= MAX_ASSETS, 'manifest asset count is outside bounds');
  let total = 0, images = 0, fonts = 0;
  const assets = {};
  for (const [file, asset] of entries) {
    const match = /^assets\/home-perf\/[a-z0-9]+(?:-[a-z0-9]+)*-([a-f0-9]{12})\.(avif|woff2)$/.exec(file);
    requireThat(match !== null && file.length <= 255, 'manifest contains an unapproved asset path');
    record(asset, 'manifest asset', ['bytes', 'sha256']);
    requireThat(typeof asset.sha256 === 'string' && SHA256.test(asset.sha256) && match[1] === asset.sha256.slice(0, 12), 'asset filename must match its complete SHA256');
    requireThat(Number.isSafeInteger(asset.bytes) && asset.bytes > 0 && asset.bytes <= MAX_ASSET_BYTES, 'asset size is outside bounds');
    total += asset.bytes;
    requireThat(total <= MAX_TOTAL_BYTES, 'manifest total size is outside bounds');
    if (match[2] === 'avif') images++; else fonts++;
    assets[file] = Object.freeze({ bytes: asset.bytes, sha256: asset.sha256 });
  }
  requireThat(images > 0 && fonts > 0, 'manifest needs both image and font controls');
  return Object.freeze({ version: 1, headSha: manifest.headSha, assets: Object.freeze(assets) });
}

function authorizeCacheCheck(input) {
  record(input, 'gate input', ['context', 'request', 'pullRequest', 'checkRun', 'policy', 'reviewedManifest', 'now']);
  validatePolicy(input.policy, input.now);
  validateDispatch(input.context);
  validatePullRequest(input.pullRequest, input.request, input.policy);
  const deployment = validateDeployment(input.checkRun, input.policy);
  const manifest = validateManifest(input.reviewedManifest, input.policy);
  return Object.freeze({ repository: REPOSITORY, pullRequestNumber: 2164,
    headSha: input.policy.approvedHeadSha, trustedCheckoutSha: input.context.checkoutSha,
    previewOrigin: deployment.origin, deploymentId: deployment.deploymentId,
    validUntil: input.policy.validUntil, manifest });
}

module.exports = { authorizeCacheCheck };
