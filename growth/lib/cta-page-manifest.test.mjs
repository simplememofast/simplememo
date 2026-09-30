import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ctaPageManifest } from './cta-page-manifest.mjs';
import groups from '../../scripts/lib/cta-page-groups.js';

const link = (ct = 'web_obsidian_v1', extra = '') => `<a href="https://apps.apple.com/app/id6758438948?pt=1&amp;ct=${ct}${extra}">Store</a>`;
const page = (p, body) => `<link href="https://simplememofast.com${p}" rel="canonical"><main>${body}</main>`;
function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cta-manifest-fixture-'));
  const write = (p, html) => { const f = path.join(root, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
  try { return fn(root, write); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('frozen rule retains exact assignment and does not silently expand excluded v1 pages', () => {
  assert.equal(groups.campaignTokenOf('/en/obsidian/'), 'web_obsidian_v1');
  assert.equal(groups.campaignTokenOf('/vs/notion-vs-obsidian/'), 'web_obsidian_v1');
  assert.equal(groups.campaignTokenOf('/voice-input/'), 'web_other_v1');
  for (const p of groups.FROZEN_EXPERIMENT_PATHS) assert.equal(groups.campaignTokenOf(p), null);
  assert.equal(groups.FROZEN_EXPERIMENT_PATHS.size, 6);
});
test('manifest admits exact canonical CTA pages and retains frozen exclusion', () => fixture((root, write) => {
  write('obsidian/index.html', page('/obsidian/', link() + '<a href="https://apps.apple.com/app/id6758438948">Reference</a>'));
  write('voice-input/index.html', page('/voice-input/', link('web_other_v1')));
  write('obsidian/getting-started/index.html', page('/obsidian/getting-started/', link('legacy')));
  write('docs/private.html', 'unparsed private fixture');
  const m = ctaPageManifest(root);
  assert.deepEqual(m.pages, [
    { path: '/obsidian/', expected_campaign: 'web_obsidian_v1', group: 'obsidian' },
    { path: '/obsidian/getting-started/', expected_campaign: null, group: 'excluded' },
    { path: '/voice-input/', expected_campaign: 'web_other_v1', group: 'other' },
  ]);
  assert.equal(m.sha256, ctaPageManifest(root).sha256);
  assert.match(m.interpretation, /Not historical deployment proof/);
  assert.ok(!JSON.stringify(m).includes(root));
}));
test('aliases, duplicate canonicals and nonmatching campaign/provider tokens fail closed', () => {
  const invalid = [
    page('/obsidian', link()),
    page('/obsidian/', link()) + '<link rel="canonical" href="https://simplememofast.com/obsidian/">',
    page('/obsidian/', link('web_other_v1')),
    page('/obsidian/', link('web_obsidian_v1', '&amp;ct=web_obsidian_v1')),
    page('/obsidian/', link().replace('pt=1&amp;', '')),
    page('/obsidian/', link()).replace(' href=', ' data-href='),
  ];
  for (const html of invalid) fixture((root, write) => {
    write('obsidian/index.html', html); assert.throws(() => ctaPageManifest(root));
  });
});
test('untagged references, competitors and QR assets cannot create CTA-page membership', () => fixture((root, write) => {
  write('obsidian/index.html', page('/obsidian/', '<a href="https://apps.apple.com/app/id6758438948">Reference</a>'
    + '<a href="https://apps.apple.com/app/id99999?ct=web_obsidian_v1">Rival</a>'
    + '<img src="qr.png" data-href="https://apps.apple.com/app/id6758438948?ct=web_obsidian_v1">'));
  assert.throws(() => ctaPageManifest(root), /empty/);
}));
