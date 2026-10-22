'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { authorizeCacheCheck } = require('./cache_access_gate.cjs');

const MAIN = 'a'.repeat(40), HEAD = 'b'.repeat(40), ACCOUNT = 'c'.repeat(32);
const DEPLOYMENT = '1234abcd-0000-4000-8000-000000000000';
const PREVIEW = 'https://1234abcd.simplememo-596.pages.dev';
const digest = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const reviewedManifest = JSON.stringify({ version: 1, headSha: HEAD, assets: {
    ['assets/home-perf/image-' + 'd'.repeat(12) + '.avif']: { bytes: 1234, sha256: 'd'.repeat(64) },
    ['assets/home-perf/font-' + 'e'.repeat(12) + '.woff2']: { bytes: 5678, sha256: 'e'.repeat(64) },
  } });
  return {
    context: { repository: 'simplememofast/simplememo', eventName: 'workflow_dispatch', ref: 'refs/heads/main',
      workflowRef: 'simplememofast/simplememo/.github/workflows/home-perf-cache-approved.yml@refs/heads/main',
      workflowSha: MAIN, sha: MAIN, checkoutSha: MAIN, runAttempt: '1', actor: 'simplememofast', triggeringActor: 'simplememofast' },
    request: { pullRequestNumber: '2139', approvedHeadSha: HEAD },
    pullRequest: { number: 2139, state: 'open', merged: false, user: { login: 'simplememofast' },
      base: { ref: 'main', repo: { full_name: 'simplememofast/simplememo', fork: false } },
      head: { sha: HEAD, repo: { full_name: 'simplememofast/simplememo', fork: false } } },
    checkRun: { name: 'Cloudflare Pages', status: 'completed', conclusion: 'success', head_sha: HEAD,
      app: { id: 85455, slug: 'cloudflare-workers-and-pages' },
      details_url: `https://dash.cloudflare.com/?to=/${ACCOUNT}/pages/view/simplememo/${DEPLOYMENT}`,
      output: { summary: `Preview: [deployment](${PREVIEW}/)` } },
    policy: { approvedPullRequestNumber: 2139, approvedHeadSha: HEAD, validUntil: '2026-10-22T12:00:00Z',
      cloudflareAppId: 85455, cloudflareAppSlug: 'cloudflare-workers-and-pages', cloudflareAccountId: ACCOUNT,
      cloudflareProjectName: 'simplememo', expectedManifestSha256: digest(reviewedManifest) },
    reviewedManifest, now: Date.parse('2026-10-22T11:00:00Z'),
  };
}
function rejected(change, error) {
  const input = fixture();
  change(input);
  assert.throws(() => authorizeCacheCheck(input), error);
}
function changeManifest(input, change) {
  const manifest = JSON.parse(input.reviewedManifest);
  change(manifest);
  input.reviewedManifest = JSON.stringify(manifest);
  input.policy.expectedManifestSha256 = digest(input.reviewedManifest);
}

test('an independently reviewed main dispatch authorizes only the bound preview and inert manifest', () => {
  const input = fixture(), before = structuredClone(input);
  const result = authorizeCacheCheck(input);
  assert.equal(result.previewOrigin, PREVIEW);
  assert.equal(result.headSha, HEAD);
  assert.equal(result.trustedCheckoutSha, MAIN);
  assert.equal(result.deploymentId, DEPLOYMENT);
  assert.equal(result.pullRequestNumber, 2139);
  assert.deepEqual(input, before);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.manifest) && Object.isFrozen(result.manifest.assets));
  for (const row of Object.values(result.manifest.assets)) assert.ok(Object.isFrozen(row));
  input.policy.approvedHeadSha = MAIN;
  assert.equal(result.headSha, HEAD);
});

test('third-party actors, triggers, repositories, dispatch branches and reruns fail closed', () => {
  for (const [field, values] of Object.entries({ repository: ['other/simplememo', 'simplememofast/simplememo-api'],
    eventName: ['pull_request', 'pull_request_target', 'push', 'repository_dispatch', 'workflow_run'],
    ref: ['refs/pull/2139/merge', 'refs/heads/candidate', 'refs/tags/main'],
    actor: ['contributor', 'SimpleMemoFast'], triggeringActor: ['contributor', 'github-actions[bot]'],
    runAttempt: [2, '2', 0, '01', undefined] })) {
    for (const value of values) rejected(input => { input.context[field] = value; });
  }
});

test('workflow identity and all three trusted execution SHAs are independently required', () => {
  for (const workflowRef of ['simplememofast/simplememo/.github/workflows/home-perf-cache.yml@refs/heads/main',
    'simplememofast/simplememo/.github/workflows/home-perf-cache-approved.yml@refs/heads/candidate',
    'other/simplememo/.github/workflows/home-perf-cache-approved.yml@refs/heads/main']) {
    rejected(input => { input.context.workflowRef = workflowRef; });
  }
  for (const field of ['sha', 'workflowSha', 'checkoutSha']) {
    for (const value of [HEAD, 'x'.repeat(40), '', undefined]) rejected(input => { input.context[field] = value; });
  }
  rejected(input => { for (const field of ['sha', 'workflowSha', 'checkoutSha']) input.context[field] = 'x'.repeat(40); });
});

test('owner approval is fixed in trusted policy, not selected by manual input', () => {
  rejected(input => { input.request.pullRequestNumber = '2136'; });
  rejected(input => { input.policy.approvedPullRequestNumber = 2136; input.request.pullRequestNumber = '2136'; input.pullRequest.number = 2136; });
  rejected(input => { input.request.approvedHeadSha = MAIN; input.pullRequest.head.sha = MAIN; input.checkRun.head_sha = MAIN; });
  rejected(input => { input.policy.approvedHeadSha = 'b'.repeat(39); });
  rejected(input => { delete input.policy.approvedHeadSha; });
});

test('review expiry requires an explicit clock and fails at the exact deadline', () => {
  for (const validUntil of [undefined, '', '2026-02-30T12:00:00Z', '2026-10-22', '2026-10-22T12:00:00+00:00']) {
    rejected(input => { input.policy.validUntil = validUntil; });
  }
  for (const now of [undefined, NaN, Infinity, -1, '2026-10-22T11:00:00Z', Date.parse('2026-10-22T12:00:00Z'), Date.parse('2026-10-22T12:00:01Z')]) {
    rejected(input => { input.now = now; });
  }
  const input = fixture(); input.now = Date.parse(input.policy.validUntil) - 1;
  assert.equal(authorizeCacheCheck(input).headSha, HEAD);
});

test('same-repository third-party PRs, forks, wrong bases, closed PRs and stale heads fail', () => {
  for (const change of [input => { input.pullRequest.user.login = 'contributor'; },
    input => { input.pullRequest.head.repo.fork = true; }, input => { input.pullRequest.head.repo.full_name = 'contributor/simplememo'; },
    input => { input.pullRequest.head.repo = null; }, input => { input.pullRequest.base.repo.full_name = 'simplememofast/simplememo-api'; },
    input => { input.pullRequest.base.repo.fork = true; }, input => { input.pullRequest.base.ref = 'candidate'; },
    input => { input.pullRequest.number = 2140; }, input => { input.pullRequest.state = 'closed'; },
    input => { input.pullRequest.merged = true; }, input => { delete input.pullRequest.merged; },
    input => { input.pullRequest.head.sha = MAIN; }]) rejected(change);
});

test('the exact independently configured provider App ID and slug are mandatory', () => {
  for (const value of [undefined, 0, -1, 1.5, '4242', Number.MAX_SAFE_INTEGER + 1]) {
    rejected(input => { input.policy.cloudflareAppId = value; });
  }
  for (const value of [undefined, '', 'cloudflare/pages']) rejected(input => { input.policy.cloudflareAppSlug = value; });
  rejected(input => { input.checkRun.app.id = 9999; });
  rejected(input => { input.checkRun.app.slug = 'other-provider'; });
  rejected(input => { input.policy.cloudflareAppId = input.checkRun.app.id = 4242; });
  rejected(input => { input.policy.cloudflareAppSlug = input.checkRun.app.slug = 'self-approved-provider'; });
  rejected(input => { input.checkRun.app = null; });
  rejected(input => { delete input.policy.cloudflareAppId; });
});

test('a pending, failed, similarly named or old-head deployment cannot establish proof', () => {
  for (const [key, values] of Object.entries({ name: ['Cloudflare', 'Cloudflare Pages '],
    status: ['queued', 'in_progress'], conclusion: ['failure', 'neutral', 'skipped', null], head_sha: [MAIN, undefined] })) {
    for (const value of values) rejected(input => { input.checkRun[key] = value; });
  }
});

test('dashboard links bind provider origin, account, project and immutable deployment', () => {
  const good = fixture().checkRun.details_url;
  for (const details_url of [good.replace('https:', 'http:'), good.replace('dash.cloudflare.com', 'dash.cloudflare.com.evil.test'),
    good.replace('dash.cloudflare.com', 'dash.cloudflare.com:443'), good.replace('https://', 'https://user@'),
    good.replace(ACCOUNT, 'f'.repeat(32)), good.replace('/simplememo/', '/different-project/'),
    good.replace('/simplememo/', '/simplememo-596/'), good.replace('/?to=/', '/'),
    good.replace('/?to=/', '/?to=%2F'), good.replace('/?to=/', '/?other=1&to=/'),
    good + '?view=1', good + '&other=1', good + '#preview', good + '/', good.replace(DEPLOYMENT, 'latest'),
    good.replace(DEPLOYMENT, '8765abcd-0000-4000-8000-000000000000')]) {
    rejected(input => { input.checkRun.details_url = details_url; });
  }
});

test('preview extraction rejects alternate suffixes, branches, URL extras and ambiguous links', () => {
  for (const url of ['http://1234abcd.simplememo-596.pages.dev', 'https://1234abcd.other.pages.dev',
    'https://branch.simplememo-596.pages.dev', 'https://1234abcd.simplememo-596.pages.dev.evil.test',
    PREVIEW + ':443', PREVIEW + '?token=synthetic', PREVIEW + '#fragment', PREVIEW + '/path',
    PREVIEW + '/%2e%2e/', PREVIEW.replace('https://', 'https://user@'),
    PREVIEW.replace('https://', 'https://user:synthetic@'), PREVIEW.replace('1234abcd', '1234ABCD'),
    PREVIEW + '\\@evil.test', 'https://evil.test', 'https://1234abcd%2esimplememo-596.pages.dev']) {
    rejected(input => { input.checkRun.output.summary = `Preview: [deployment](${url})`; });
  }
  for (const summary of ['', PREVIEW + ' https://8765abcd.simplememo-596.pages.dev',
    PREVIEW + ' https://1234abcd.other.pages.dev', PREVIEW + ' HTTPS://8765abcd.simplememo-596.pages.dev',
    PREVIEW + ' https://8765abcd.simplememo-596.pages%2edev',
    PREVIEW + ' https://8765abcd.simplememo-596.pages%2edev.',
    PREVIEW + ' https://8765abcd.simplememo-596.pages%2edev.evil.test',
    PREVIEW + ' https://8765abcd.simplememo-596.%70ages.dev',
    PREVIEW + ' https://8765abcd.simplememo-596.pages。dev', 'x'.repeat(65537)]) {
    rejected(input => { input.checkRun.output.summary = summary; });
  }
});

test('the observed Cloudflare summary accepts repeated href/text and isolates its mutable branch row', () => {
  const input = fixture();
  const branch = 'https://codex-web-ci-security-local.simplememo-596.pages.dev';
  input.checkRun.output.summary = `<table><tr><td><strong>Latest commit:</strong> </td><td>
<code>bbbbbbb</code>
</td></tr>
<tr><td><strong>Status:</strong></td><td>&nbsp;✅&nbsp; Deploy successful!</td></tr>
<tr><td><strong>Preview URL:</strong></td><td>
<a href='${PREVIEW}'>${PREVIEW}</a>
</td></tr>
<tr><td><strong>Branch Preview URL:</strong></td><td>
<a href='${branch}'>${branch}</a>
</td></tr>
</table>

[View logs](${input.checkRun.details_url})
`;
  assert.equal(authorizeCacheCheck(input).previewOrigin, PREVIEW);
  for (const summary of [PREVIEW + ' ' + PREVIEW, `<a href='${PREVIEW}'>${PREVIEW}/</a>`]) {
    input.checkRun.output.summary = summary;
    assert.equal(authorizeCacheCheck(input).previewOrigin, PREVIEW);
  }
});

test('branch rows cannot hide another deployment, malformed link, alternate host or URL extras', () => {
  const alias = 'https://codex-web-ci-security-local.simplememo-596.pages.dev';
  const row = (href, label = href) => `<tr><td><strong>Branch Preview URL:</strong></td><td>\n<a href='${href}'>${label}</a>\n</td></tr>`;
  for (const branchRow of [row('https://8765abcd.simplememo-596.pages.dev'), row(alias, PREVIEW),
    row(alias + '?x=1'), row(alias + '#x'), row(alias + ':443'), row(alias + '/path'),
    row(alias.replace('simplememo-596', 'other-project')), row(alias.replace('https://', 'https://user@')),
    row(alias) + row(alias), row(alias).replace('<a ', '<span '), row(alias).replace('</a>', '</span>'),
    row(PREVIEW).replace('href=', 'url=')]) {
    rejected(input => { input.checkRun.output.summary = PREVIEW + '\n' + branchRow; });
  }
  rejected(input => { input.checkRun.output.summary = PREVIEW + '\n' + alias; });
});

test('reviewed manifest bytes and head must be independently fixed', () => {
  rejected(input => { input.reviewedManifest += ' '; });
  rejected(input => { delete input.policy.expectedManifestSha256; });
  rejected(input => { input.policy.expectedManifestSha256 = HEAD; });
  rejected(input => { changeManifest(input, manifest => { manifest.headSha = MAIN; }); });
  rejected(input => { input.reviewedManifest = 'not JSON'; input.policy.expectedManifestSha256 = digest(input.reviewedManifest); });
  rejected(input => { input.reviewedManifest = ' '.repeat(128 * 1024 + 1); input.policy.expectedManifestSha256 = digest(input.reviewedManifest); });
});

test('manifest schema cannot supply executable instructions, traversal, alternate origins or mismatched hashes', () => {
  rejected(input => { changeManifest(input, manifest => { manifest.script = 'candidate.js'; }); });
  rejected(input => { changeManifest(input, manifest => { manifest.version = 2; }); });
  for (const file of ['../candidate.js', '/assets/home-perf/image-' + 'd'.repeat(12) + '.avif',
    'https://evil.test/asset.avif', 'assets/home-perf/../image-' + 'd'.repeat(12) + '.avif',
    'assets/home-perf/image-' + 'd'.repeat(12) + '.js', 'assets/home-perf/image-' + 'd'.repeat(12) + '.avif?x=1',
    'assets/home-perf/image-' + 'f'.repeat(12) + '.avif']) {
    rejected(input => { changeManifest(input, manifest => {
      const old = Object.keys(manifest.assets)[0], asset = manifest.assets[old]; delete manifest.assets[old]; manifest.assets[file] = asset;
    }); });
  }
  for (const change of [asset => { asset.sha256 = 'd'.repeat(63); }, asset => { asset.exec = 'candidate.js'; },
    asset => { asset.bytes = -1; }, asset => { asset.bytes = 0; }, asset => { asset.bytes = 1.5; },
    asset => { asset.bytes = '1234'; }, asset => { asset.bytes = 4 * 1024 * 1024 + 1; }]) {
    rejected(input => { changeManifest(input, manifest => { change(Object.values(manifest.assets)[0]); }); });
  }
});

test('manifest requires both controls and bounded counts and aggregate bytes', () => {
  rejected(input => { changeManifest(input, manifest => { manifest.assets = {}; }); });
  rejected(input => { changeManifest(input, manifest => { delete manifest.assets[Object.keys(manifest.assets)[1]]; }); });
  rejected(input => { changeManifest(input, manifest => {
    for (let i = 0; i < 255; i++) manifest.assets[`assets/home-perf/image-${i}-${'d'.repeat(12)}.avif`] = { bytes: 1, sha256: 'd'.repeat(64) };
  }); });
  rejected(input => { changeManifest(input, manifest => {
    for (let i = 0; i < 9; i++) manifest.assets[`assets/home-perf/image-${i}-${'d'.repeat(12)}.avif`] = { bytes: 4 * 1024 * 1024, sha256: 'd'.repeat(64) };
  }); });
});

test('manifest path length agrees with the transport and contract bounds', () => {
  const prefix = 'assets/home-perf/', suffix = '-' + 'd'.repeat(12) + '.avif';
  const assetPath = length => prefix + 'a'.repeat(length - prefix.length - suffix.length) + suffix;
  const renameImage = (manifest, length) => {
    const previous = Object.keys(manifest.assets)[0];
    const asset = manifest.assets[previous];
    delete manifest.assets[previous];
    manifest.assets[assetPath(length)] = asset;
  };
  const input = fixture();
  changeManifest(input, manifest => renameImage(manifest, 255));
  assert.ok(authorizeCacheCheck(input).manifest.assets[assetPath(255)]);
  rejected(input => { changeManifest(input, manifest => renameImage(manifest, 256)); });
});

test('non-data property accessors and inherited policy fields are not executed or accepted', () => {
  let called = false;
  rejected(input => { Object.defineProperty(input.policy, 'cloudflareAppId', { enumerable: true, get() { called = true; return 4242; } }); });
  assert.equal(called, false);
  rejected(input => { input.policy = Object.create(input.policy); });
  rejected(input => { input.request = null; });
  rejected(input => { input.checkRun.output = []; });
});

test('terminal line separators cannot extend identities, provider URLs or manifest hashes', () => {
  for (const ending of ['\n', '\r', '\u2028', '\u2029']) {
    rejected(input => { for (const key of ['sha', 'workflowSha', 'checkoutSha']) input.context[key] += ending; });
    rejected(input => { input.checkRun.details_url += ending; });
    rejected(input => { input.policy.cloudflareAppSlug += ending; input.checkRun.app.slug += ending; });
    rejected(input => { input.policy.cloudflareAccountId += ending; });
    rejected(input => { changeManifest(input, manifest => { Object.values(manifest.assets)[0].sha256 += ending; }); });
    rejected(input => { changeManifest(input, manifest => {
      const key = Object.keys(manifest.assets)[0]; manifest.assets[key + ending] = manifest.assets[key]; delete manifest.assets[key];
    }); });
  }
});
