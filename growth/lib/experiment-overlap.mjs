import { isOpen } from './ledger.mjs';

// Global and external scopes are explicit: do not silently lose them when
// extracting the historical free-text page lists in the ledger.
export function experimentScope(exp) {
  const value = exp.page || '';
  const global = /サイト全体|全コンテンツページ/.test(value);
  const pages = exp.pages || (value.startsWith('/') ? [value]
    : [...value.matchAll(/(?:^|[\s,:：])(\/[\w./-]*)/g)].map(m => m[1]));
  return { global, pages: [...new Set(pages.map(p => p.replace(/\.html$/, '').replace(/\/$/, '') || '/'))],
    unenumerated: !global && pages.length === 0 };
}

export function auditOverlaps(ledger) {
  const active = (ledger.experiments || []).filter(isOpen);
  const byPage = new Map(), global = [], unenumerated = [];
  for (const exp of active) {
    const scope = experimentScope(exp);
    if (scope.global) global.push(exp.id);
    if (scope.unenumerated) unenumerated.push(exp.id);
    for (const page of scope.pages) {
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page).push(exp.id);
    }
  }
  return { global, unenumerated, overlaps: [...byPage].filter(([, ids]) => ids.length > 1)
    .map(([page, experiments]) => ({ page, experiments })).sort((a, b) => a.page.localeCompare(b.page)) };
}
