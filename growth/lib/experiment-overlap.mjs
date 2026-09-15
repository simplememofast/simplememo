import { isOpen } from './ledger.mjs';
import assert from 'node:assert/strict';
import {nonexclusiveObservation,canonicalPage,changeScope} from './experiment-coexistence.mjs';
export {nonexclusiveObservation,changeScope};

// Global and external scopes are explicit: do not silently lose them when
// extracting the historical free-text page lists in the ledger.
export function experimentScope(exp) {
  assert(typeof exp.page==='string'&&exp.page.trim(),'missing experiment scope');
  const value = exp.page;
  assert(exp.pages==null||(Array.isArray(exp.pages)&&exp.pages.length>0&&exp.pages.every(p=>typeof p==='string')),'invalid experiment pages');
  let global = /サイト全体|全コンテンツページ/.test(value);
  const pages = exp.pages ? [...exp.pages] : (value.startsWith('/') || /^https?:\/\//.test(value) ? [value]
    : [...value.matchAll(/(?:^|[\s,:：])(\/[\w./-]*)/g)].map(m => m[1]));
  if(exp.change_paths){const s=changeScope(exp.page,exp.change_paths);global ||= s.global;pages.push(...s.pages);}
  return { global, pages: [...new Set(pages.filter(p=>!/^https?:\/\//.test(p)||new URL(p).hostname==='simplememofast.com').map(canonicalPage))],
    unenumerated: !global && pages.length === 0 };
}

export function auditOverlaps(ledger, {now=new Date()}={}) {
  const active = (ledger.experiments || []).filter(isOpen);
  const byPage = new Map(), global = [], unenumerated = [], observations = [];
  for (const exp of active) {
    const scope = experimentScope(exp);
    if(nonexclusiveObservation(exp,{now})){observations.push({id:exp.id,scope,effective_at:exp.coexistence.effective_at});continue;}
    if (scope.global) global.push(exp.id);
    if (scope.unenumerated) unenumerated.push(exp.id);
    for (const page of scope.pages) {
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page).push(exp.id);
    }
  }
  return { global, unenumerated, ...(observations.length?{observations}:{}), overlaps: [...byPage].filter(([, ids]) => ids.length > 1)
    .map(([page, experiments]) => ({ page, experiments })).sort((a, b) => a.page.localeCompare(b.page)) };
}

export function ownershipConflict(exp,target,{now=new Date(),followup=false}={}) {
  const scope=experimentScope(exp);
  if(nonexclusiveObservation(exp,{now,followup}))return false;
  const affected=exp.change_paths?changeScope(exp.page,exp.change_paths):scope;
  return scope.global||affected.global||target.global||scope.pages.some(p=>target.pages.includes(p))
    ||affected.pages.some(p=>target.pages.includes(p))||(exp.change_paths??[]).some(p=>target.paths?.includes(p));
}
