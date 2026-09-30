// Frozen v1 link-page assignment, shared by tagging and read-only diagnostics.
// This is never a search-query, landing-page, download or LTV classification.
const CAMPAIGN_OBSIDIAN = 'web_obsidian_v1';
const CAMPAIGN_OTHER = 'web_other_v1';
const FROZEN_EXPERIMENT_PATHS = new Set([
  '/obsidian/getting-started/', '/note-to-email/',
  '/blog/free-memo-apps-ranking', '/en/blog/free-memo-apps-ranking',
  '/blog/line-keep-alternative', '/en/blog/line-keep-alternative',
]);

function campaignTokenOf(urlPath) {
  if (FROZEN_EXPERIMENT_PATHS.has(urlPath)) return null;
  const pathWithoutLocale = urlPath.replace(/^\/(en|es|ko|zh|zh-Hant|ar|id|pt-BR|tr)\//, '/');
  return /(?:^|[/-])obsidian(?:[/-]|$)/i.test(pathWithoutLocale)
    ? CAMPAIGN_OBSIDIAN : CAMPAIGN_OTHER;
}

module.exports = { CAMPAIGN_OBSIDIAN, CAMPAIGN_OTHER, FROZEN_EXPERIMENT_PATHS, campaignTokenOf };
