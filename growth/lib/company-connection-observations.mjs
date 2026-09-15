import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {privateState, atomicJson, acquireLock} from './company-loop.mjs';
import {appleAdsConnection} from './company-connection-evidence.mjs';

const CONFIG='data/apple-ads-configuration.json';
const CACHE='data/connections.json';
const KEYS=['schema_version','method','account_scope','identity_verified','provider','app_id','url',
  'observed_at','attribution_state','cost_state','cost_last_sync','cost_status_observed',
  'cost_entitlement_ui_message','cost_entitlement_verified','mutations_performed','limitations','evidence_path'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function present(file) {
  try {fs.lstatSync(file);return true;} catch(error) {if(error.code==='ENOENT')return false;throw error;}
}
function readPrivate(root,file,max=65536) {
  const full=path.resolve(root,file);
  assert(!fs.lstatSync(full).isSymbolicLink(),'owned private observation file required');
  const fd=fs.openSync(full,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {
    const stat=fs.fstatSync(fd);
    assert(stat.isFile() && stat.uid===process.getuid() && !(stat.mode&0o077) &&
      fs.realpathSync(full).startsWith(fs.realpathSync(root)+path.sep),'owned private observation file required');
    assert(stat.size>0 && stat.size<=max,'observation file exceeds its size limit');
    const bytes=fs.readFileSync(fd);assert(bytes.length>0 && bytes.length<=max,'observation changed beyond its size limit');
    const utf8=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
    return {value:JSON.parse(utf8),bytes,file:full};
  } finally {fs.closeSync(fd);}
}
function normalize(value,now) {
  assert(value && typeof value==='object' && !Array.isArray(value),'observation object required');
  assert(Object.keys(value).every(k=>KEYS.includes(k)),'unsupported observation fields');
  assert.equal(value.mutations_performed,false,'read-only configuration observation required');
  assert(value.cost_entitlement_verified===undefined || value.cost_entitlement_verified===false,
    'partner configuration cannot establish account entitlement');
  for(const k of ['cost_status_observed','cost_entitlement_ui_message','evidence_path']) {
    if(value[k]!==undefined)assert(typeof value[k]==='string' && value[k].length<=4096,'bounded metadata text required');
  }
  if(value.limitations!==undefined)assert(Array.isArray(value.limitations) && value.limitations.length<=12 &&
    value.limitations.every(v=>typeof v==='string' && v.length<=4096),'bounded observation limitations required');
  assert(typeof value.observed_at==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.observed_at),
    'original timestamp with timezone required');
  if(value.cost_status_observed==='No data')assert.equal(value.cost_state,'unknown','No data is not a connected cost source');
  const normalized=Object.fromEntries(KEYS.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
  assert.equal(appleAdsConnection(normalized,now).status,'PARTIAL','valid fresh scoped configuration observation required');
  return normalized;
}

// This is a local handoff from the existing observer, not another browser job,
// provider fetch, data receipt, advertiser enrollment or autonomy-score input.
export function recordAppleAdsObservation({stateRoot,evidenceFile,now=new Date(),writeJson=atomicJson}) {
  const root=privateState(stateRoot),source=readPrivate(root,evidenceFile);
  const observation=normalize(source.value,now),id=hash(JSON.stringify(observation));
  const release=acquireLock(root,'data-collection.lock');if(!release)return {status:'busy'};
  try {
    const data=privateState(path.join(root,'data'));
    assert(fs.realpathSync(data).startsWith(fs.realpathSync(root)+path.sep),'data must remain in the private state root');
    const configFile=path.join(root,CONFIG),cacheFile=path.join(root,CACHE);
    let previous=null;
    if(present(configFile)) {
      previous=readPrivate(root,CONFIG).value;
      // An old observation may now be stale. Preserve its identity and ordering
      // without pretending it was observed again today.
      const old=normalize(previous,new Date(previous.observed_at));
      const order=Date.parse(observation.observed_at)-Date.parse(old.observed_at);
      if(order<0)return {status:'superseded',observed_at:old.observed_at,applied:false};
      if(order===0)assert.deepEqual(observation,old,'same-time configuration cannot be overwritten');
    }
    let cache=null;
    if(present(cacheFile)) {
      cache=readPrivate(root,CACHE,32*1024*1024).value;
      assert(cache && cache.schema_version===1 && !Array.isArray(cache),'valid existing connection view required');
      const seen=Date.parse(cache.apple_search_ads?.observed_at);
      assert(!Number.isFinite(seen) || seen<=Date.parse(observation.observed_at),'newer cached observation cannot be replaced');
    }
    const records=privateState(path.join(data,'connection-observations','apple-search-ads'));
    assert(fs.realpathSync(records).startsWith(fs.realpathSync(root)+path.sep),'observation history must remain private');
    const recordFile=path.join(records,id+'.json');let existing=false;
    if(present(recordFile)) {
      const retained=readPrivate(root,recordFile,512*1024).value;
      assert.equal(retained.schema_version,1);assert.equal(retained.id,id);
      assert.deepEqual(retained.observation,observation,'retained observation is immutable');
      assert.equal(hash(retained.input_utf8),retained.input_sha256,'retained observation bytes changed');
      assert.deepEqual(normalize(JSON.parse(retained.input_utf8),now),observation,'retained source does not match observation');
      existing=true;
    } else {
      // Write the evidence before the two materialized views. A retry after
      // either later write fails repairs those views from the same observation.
      writeJson(recordFile,{schema_version:1,id,recorded_at:now.toISOString(),observation,
        input_file:path.relative(root,source.file),input_sha256:hash(source.bytes),input_utf8:source.bytes.toString('utf8'),
        previous_configuration:previous,formal_credit:0,data_verified:false});
    }
    const connection=appleAdsConnection(observation,now);
    writeJson(configFile,observation);
    if(cache)writeJson(cacheFile,{...cache,apple_search_ads:connection});
    // Keep the collection-wide timestamp and every unrelated source unchanged.
    return {status:existing?'already_recorded':'recorded',id,observed_at:observation.observed_at,
      evidence:path.relative(root,recordFile),cached_view_updated:Boolean(cache),connection,formal_credit:0};
  } finally {release();}
}
