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
// Owner decision 2026-09-24: these whole-site generated files are owned by
// page rows, not per file. The exemption applies only to a change that
// declares the file as bounded support; the diff proof then returns every
// other page row it alters for the same ownership check. Exact paths only:
// never widen this closed list with a pattern. Anything else keeps file rules.
export const SHARED_GENERATED_ARTIFACTS=Object.freeze(['sitemap.xml','sitemap-ja.xml','sitemap-en.xml','sitemap-locales.xml','data/distribution-queue.json']);
export const sharedGeneratedArtifact=p=>SHARED_GENERATED_ARTIFACTS.includes(p);
// Optional prospective support contracts never reinterpret legacy changes.
export function supportingChanges(page,paths,changes) {
  if(changes===undefined)return [];
  assert(Array.isArray(changes)&&changes.length>0&&changes.length<=6,'invalid supporting_changes');
  canonicalPage(page);
  const seen=new Set();
  for(const c of changes) {
    assert(c&&typeof c==='object'&&!Array.isArray(c),'invalid supporting change');
    assert(paths.includes(c.path)&&!seen.has(c.path),'supporting path must be unique and declared');seen.add(c.path);
    const seed=['distribution_seed','story_seed'].includes(c.kind);
    assert.deepEqual(Object.keys(c).sort(),(seed?['path','kind','id']:['path','kind']).sort(),'unexpected supporting contract fields');
    if(c.kind==='distribution_seed')assert(c.path==='data/distribution-queue.json'&&/^\d{8}-[a-z0-9][a-z0-9-]*$/.test(c.id),'invalid distribution support');
    else if(c.kind==='story_seed')assert(c.path==='docs/story-seeds.md'&&/^S-\d{8}-[a-z0-9][a-z0-9-]*$/.test(c.id),'invalid story support');
    else if(c.kind==='sitemap_lastmod')assert(/^sitemap-(ja|en|locales)\.xml$/.test(c.path),'invalid sitemap support');
    else if(c.kind==='sitemap_index')assert(c.path==='sitemap.xml'&&changes.some(x=>x.kind==='sitemap_lastmod'),'sitemap index requires declared child support');
    else assert.fail('unknown supporting change kind');
  }
  return changes;
}
export function changeScope(page,paths,changes) {
  assert(Array.isArray(paths)&&paths.length>0&&new Set(paths).size===paths.length,'explicit unique change_paths required');
  assert(paths.every(p=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[?#%\0]/.test(p)),'invalid change path');
  const support=supportingChanges(page,paths,changes),supporting_paths=support.map(c=>c.path);
  const pages=new Set([canonicalPage(page)]);let global=false;
  for(const p of paths) {
    if(supporting_paths.includes(p))continue;
    if(p.endsWith('.html')) pages.add(canonicalPage('/'+p));
    else if(changes!==undefined||(!/^(docs\/|growth\/content\/)/.test(p)&&!/^sitemap[^/]*\.xml$/.test(p)))global=true;
  }
  return {pages:[...pages],global,paths,...(support.length?{supporting_paths}:{} )};
}
