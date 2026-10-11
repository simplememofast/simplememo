import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import siteFiles from '../../scripts/lib/site-files.js';
import groups from '../../scripts/lib/cta-page-groups.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tools', 'growth'];
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];

// Snapshot the reviewed checkout, not historical deployment or warehouse
// capture. Unknown paths/aliases are deliberately not canonicalized by SQL.
export function ctaPageManifest(root = ROOT) {
  const pages = [];
  for (const file of siteFiles.collectHtmlFiles(root, { skipDirs: SKIP_DIRS, tolerateReadErrors: false })) {
    const html = fs.readFileSync(file, 'utf8');
    const links = [...html.matchAll(/<a\b[^>]*>/gi)].map(([tag]) => attr(tag, 'href')).filter(Boolean)
      .map((href) => { try { return new URL(href.replaceAll('&amp;', '&')); } catch { return null; } })
      .filter((url) => url?.protocol === 'https:' && url.hostname === 'apps.apple.com'
        && !url.username && !url.password && /\/id6758438948(?:\/|$)/.test(url.pathname)
        && url.searchParams.has('ct'));
    if (!links.length) continue; // Untagged editorial references are not pilot CTAs.
    const urlPath = siteFiles.toUrlPath(root, file);
    const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag)
      .filter((tag) => attr(tag, 'rel')?.toLowerCase() === 'canonical').map((tag) => attr(tag, 'href'));
    if (canonicals.length !== 1 || canonicals[0] !== `https://simplememofast.com${urlPath}`) {
      throw new Error('CTA-page manifest requires one exact production canonical per page');
    }
    const expected = groups.campaignTokenOf(urlPath);
    if (expected !== null && links.some((url) => url.searchParams.getAll('ct').length !== 1
      || url.searchParams.get('ct') !== expected || !url.searchParams.get('pt'))) {
      throw new Error('CTA-page manifest found a nonmatching v1 campaign/provider token');
    }
    pages.push({ path: urlPath, expected_campaign: expected,
      group: expected === null ? 'excluded' : expected === groups.CAMPAIGN_OBSIDIAN ? 'obsidian' : 'other' });
  }
  pages.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  if (!pages.length || new Set(pages.map((p) => p.path)).size !== pages.length) {
    throw new Error('CTA-page manifest is empty or ambiguous');
  }
  const json = JSON.stringify(pages);
  return { schema_version: 1, assignment_version: 'web_v1', pages,
    sha256: crypto.createHash('sha256').update(json).digest('hex'),
    interpretation: 'Exact canonical paths and expected tokens in the query checkout. Not historical deployment proof, captured-event coverage, SEO intent, or App Store download attribution.' };
}
