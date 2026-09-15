// Lifecycle stays in the original ledger. This additive contract changes only
// future ownership; legacy records and frozen/follow-up ownership stay exclusive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const historicalKeys=['id','page','pages','started_at','evaluation_at','baseline','source','hypothesis','target_metric','control','stop_conditions'];
export function historicalContract(e) {
  return Object.fromEntries(historicalKeys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]));
}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export const contractHash=e=>createHash('sha256').update(JSON.stringify(stable(historicalContract(e)))).digest('hex');
export function validateCoexistence(e) {
  if(e.coexistence===undefined)return;
  const c=e.coexistence;
  assert(c&&c.schema_version===1&&c.from==='exclusive_intervention'&&c.to==='nonexclusive_observation','invalid coexistence transition');
  assert(c.experiment_id===e.id&&/サイト全体|全コンテンツページ/.test(e.page),'coexistence requires original global scope');
  assert(c.original_contract_sha256===contractHash(e),'historical experiment contract changed');
  for(const key of ['decided_at','effective_at'])assert(typeof c[key]==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(c[key])&&Number.isFinite(Date.parse(c[key])),'invalid coexistence timestamp');
  assert(Date.parse(c.effective_at)>=Date.parse(c.decided_at),'coexistence cannot predate authorization');
  assert(c.authorized_by==='user'&&c.authorization?.request==='反映させてデプロイ'&&typeof c.authorization.thread_id==='string'&&/^[a-f0-9-]{36}$/.test(c.authorization.thread_id),'explicit owner authorization required');
  assert(c.interpretation==='descriptive_only_no_isolated_causal_claim'&&typeof c.reason==='string'&&c.reason.length>=20,'observation interpretation required');
}
export function nonexclusiveObservation(e,{now=new Date(),followup=false}={}) {
  validateCoexistence(e);
  return !followup&&e.status==='running'&&!!e.coexistence&&+new Date(now)>=Date.parse(e.coexistence.effective_at);
}
export function canonicalPage(p) {
  assert(typeof p==='string'&&p===p.trim()&&/^(\/|https?:\/\/)/.test(p),'invalid page scope');
  const u=new URL(p,'https://simplememofast.com');
  assert(['https:','http:'].includes(u.protocol)&&u.hostname==='simplememofast.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&!/%|\\/.test(p),'invalid local page scope');
  return u.pathname.replace(/\/index\.html$/,'/').replace(/\.html$/,'').replace(/\/$/,'')||'/';
}
export function changeScope(page,paths) {
  assert(Array.isArray(paths)&&paths.length>0&&new Set(paths).size===paths.length,'explicit unique change_paths required');
  assert(paths.every(p=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[?#%\0]/.test(p)),'invalid change path');
  const pages=new Set([canonicalPage(page)]);let global=false;
  for(const p of paths) {
    if(p.endsWith('.html')) pages.add(canonicalPage('/'+p));
    else if(!/^(docs\/|growth\/content\/)/.test(p)&&!/^sitemap[^/]*\.xml$/.test(p))global=true;
  }
  return {pages:[...pages],global,paths};
}
