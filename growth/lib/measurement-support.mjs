// Shared support files get page ownership only with a prospective declaration
// and a verifiable bounded edit. Unknown or legacy data paths remain global.
import assert from 'node:assert/strict';
import {canonicalPage,supportingChanges} from './experiment-coexistence.mjs';

const ORIGIN='https://simplememofast.com';
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function targetUrl(value,page) {
  assert(typeof value==='string'&&value.startsWith(ORIGIN+'/')&&new URL(value).origin===ORIGIN,'support URL must use the canonical HTTPS origin');
  assert.equal(canonicalPage(value),canonicalPage(page),'support URL differs from target page');
}
function queue(text) {
  const d=JSON.parse(text);
  assert(d&&Array.isArray(d.items)&&d.items.length<=100,'bounded distribution queue required');
  const ids=d.items.map(x=>x?.id);
  assert(ids.every(x=>typeof x==='string')&&new Set(ids).size===ids.length,'unique existing distribution IDs required');
  return d;
}
function distribution(before,after,contract,page) {
  const a=queue(before),b=queue(after),item=b.items[0];
  assert(!a.items.some(x=>x.id===contract.id),'distribution ID already exists');
  assert(item?.id===contract.id,'declared distribution seed must be prepended');
  targetUrl(item.url,page);
  assert(date(item.date_jst)&&contract.id.startsWith(item.date_jst.replaceAll('-','')+'-'),'distribution date differs from ID');
  assert(['article','evidence','refresh'].includes(item.kind),'invalid distribution kind');
  const strings=['id','date_jst','url','title','lang','cluster','kind','answer_1line','x_post_ja','note_angle','en_answer_1line','verified_scope'];
  const arrays=['quotable_facts','reddit_queries'];
  for(const [k,v] of Object.entries(item))assert(strings.includes(k)?typeof v==='string'&&v.length>0:arrays.includes(k)&&Array.isArray(v)&&v.every(s=>typeof s==='string'),'unknown or malformed distribution field');
  for(const k of [...strings.filter(k=>k!=='en_answer_1line'),...arrays])assert(Object.hasOwn(item,k),'missing distribution field: '+k);
  assert.deepEqual(b,{...a,items:[item,...a.items].slice(0,100)},'only one new seed and the documented100-item retention are allowed');
  assert.equal(after,JSON.stringify(b,null,2)+'\n','distribution output must be canonical JSON without duplicate keys');
}
function sitemapMask(text,kind,locations,at) {
  const tag=kind==='sitemap_index'?'sitemap':'url',seen=new Map(),values=new Map();
  const output=text.replace(new RegExp('<'+tag+'>[\\s\\S]*?</'+tag+'>','g'),block=>{
    const locs=[...block.matchAll(/<loc>([^<>]+)<\/loc>/g)];
    if(locs.length!==1||!locations.includes(locs[0][1]))return block;
    const loc=locs[0][1],mods=[...block.matchAll(/<lastmod>([^<>]+)<\/lastmod>/g)];
    assert(mods.length===1&&date(mods[0][1])&&mods[0][1]<=at,'one valid nonfuture sitemap date required');
    seen.set(loc,(seen.get(loc)??0)+1);values.set(loc,mods[0][1]);
    return block.replace(mods[0][0],'<lastmod>SUPPORT_DATE</lastmod>');
  });
  assert(locations.every(loc=>seen.get(loc)===1),'sitemap support target must exist exactly once');
  return {output,values};
}
function sitemap(before,after,contract,page,changes,at) {
  // Locate the exact existing canonical URL; URL spelling and all other XML
  // bytes must remain unchanged. No parser/entity/network resolution occurs.
  const locations=contract.kind==='sitemap_index'
    ?changes.filter(c=>c.kind==='sitemap_lastmod').map(c=>ORIGIN+'/'+c.path)
    :[...before.matchAll(/<loc>([^<>]+)<\/loc>/g)].map(m=>m[1]).filter(loc=>{
      try {targetUrl(loc,page);return true;}catch{return false;}
    });
  assert(locations.length>0&&new Set(locations).size===locations.length,'unique existing sitemap support locations required');
  if(contract.kind==='sitemap_lastmod')assert.equal(locations.length,1,'ambiguous canonical sitemap target');
  const a=sitemapMask(before,contract.kind,locations,at),b=sitemapMask(after,contract.kind,locations,at);
  assert.equal(b.output,a.output,'sitemap support may change only declared lastmod values');
  for(const loc of locations)assert(b.values.get(loc)>=a.values.get(loc),'sitemap support cannot backdate a page');
}
function storyIds(text) {
  const ids=[...text.matchAll(/^ {0,3}##[ \t]+(S-\d{8}-[a-z0-9-]+)(?:[ \t]+#+)?[ \t]*\r?$/gm),
    ...text.matchAll(/^ {0,3}(S-\d{8}-[a-z0-9-]+)[ \t]*\r?\n {0,3}-+[ \t]*\r?$/gm)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'unique existing story IDs required');return ids;
}
function story(before,after,contract,page) {
  const existing=storyIds(before);
  assert(!existing.includes(contract.id)&&existing.length<100,'story ID exists or append-only story capacity is exhausted');
  assert(after.startsWith(before),'existing story bytes must remain unchanged');
  const appended=after.slice(before.length);
  const header=appended.match(new RegExp('^\\n*(?:---\\n+)?## '+contract.id+'\\n'));
  assert(header,'declared story must be appended');
  // A closed bullet-field format avoids Markdown headings hidden by tabs,
  // indentation, Setext, blockquotes, HTML or code fences.
  assert(!/[\t\r<>]/.test(appended),'ambiguous story markup rejected');
  const fields=new Set(),allowed=new Set(['対象URL','媒体','分類','一行の主張','引用できる数字','note向け','X向け','英語圏向け','使わない表現']);
  for(const line of appended.slice(header[0].length).split('\n')) {
    if(line==='')continue;
    const field=line.match(/^- \*\*([^*]+)\*\*(?::(?: .*)?)?$/);
    if(field){assert(allowed.has(field[1])&&!fields.has(field[1]),'unknown or repeated story field');fields.add(field[1]);continue;}
    assert(/^  - \S/.test(line)&&!/^  - (?:#{1,6}(?:\s|$)|[-=]+(?:\s|$))/.test(line),'story must contain only declared bullet fields and fact bullets');
  }
  const targets=[...appended.matchAll(/^- \*\*対象URL\*\*: (\S+)\s*$/gm)];
  assert.equal(targets.length,1,'one explicit story target URL required');targetUrl(targets[0][1],page);
}
export function verifySupportingBaseline(experiment,read,{now=new Date()}={}) {
  const changes=supportingChanges(experiment.page,experiment.change_paths,experiment.supporting_changes);
  const at=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  for(const c of changes) {
    const text=read(c.path);assert(typeof text==='string','existing readable support file required');
    if(c.kind==='distribution_seed')assert(!queue(text).items.some(x=>x.id===c.id),'distribution ID already exists');
    else if(c.kind==='story_seed') {
      const ids=storyIds(text);
      assert(!ids.includes(c.id)&&ids.length<100,'story ID exists or append-only story capacity is exhausted');
    } else sitemap(text,text,c,experiment.page,changes,at);
  }
}
export function verifySupportingDiff(experiment,before,after,{now=new Date()}={}) {
  const changes=supportingChanges(experiment.page,experiment.change_paths,experiment.supporting_changes);
  const at=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  for(const c of changes) {
    const a=before(c.path),b=after(c.path);
    assert(typeof a==='string'&&typeof b==='string','existing readable support files required');
    if(c.kind==='distribution_seed')distribution(a,b,c,experiment.page);
    else if(c.kind==='story_seed')story(a,b,c,experiment.page);
    else sitemap(a,b,c,experiment.page,changes,at);
  }
}
export function verifySupportingGitDiff(experiment,beforeRef,afterRef,git,options) {
  const read=ref=>file=>{
    assert(/^100644 blob [a-f0-9]+\t/.test(git('ls-tree',ref,'--',file)),'support must be an existing regular nonexecutable file');
    return git('show',ref+':'+file);
  };
  // Callers must return raw blob bytes, not trim(), because story prefixes and
  // canonical JSON are part of the proof.
  verifySupportingDiff(experiment,read(beforeRef),read(afterRef),options);
}

// This is a provenance proof for already declared sitemap support, not a CI
// attestation or a path exclusion. All treatment bytes still match the head.
export function verifyInheritedSitemapMerge(experiment,declaration,head,merge,paths,git,{now=new Date()}={}) {
  const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
  assert([declaration,head,merge].every(sha),'exact Git commit identities required');
  const changes=supportingChanges(experiment.page,experiment.change_paths,experiment.supporting_changes);
  const changed=git('diff','--name-only',head,merge,'--',...paths).trim().split('\n').filter(Boolean);
  assert(changed.length>0,'inherited support proof requires a real difference');
  const contracts=changed.map(file=>{
    const c=changes.find(c=>c.path===file);
    assert(c?.kind==='sitemap_lastmod','only prospectively declared sitemap lastmod inheritance is supported');return c;
  });
  const strict=paths.filter(p=>!changed.includes(p));
  if(strict.length)git('diff','--quiet',head,merge,'--',...strict);
  const parents=git('rev-list','--parents','-n','1',merge).trim().split(/\s+/);
  assert(parents.length===2&&parents[0]===merge&&sha(parents[1]),'one actual squash parent required');
  const parent=parents[1],base=git('merge-base','--all',parent,head).trim();
  assert(sha(base),'one common ancestor required');
  git('merge-base','--is-ancestor',base,declaration);
  git('merge-base','--is-ancestor',declaration,head);
  const reconstructed=git('merge-tree','--write-tree',parent,head).trim();
  assert(sha(reconstructed),'conflict-free full merge reconstruction required');
  const tree=git('rev-parse',merge+'^{tree}').trim();
  assert.equal(reconstructed,tree,'published tree differs from reconstructed merge');
  const read=ref=>file=>{
    assert(new RegExp('^100644 blob [a-f0-9]{40}\\t'+file.replaceAll('.','\\.')+'\\n?$').test(git('ls-tree',ref,'--',file)),
      'inherited sitemap must be a regular nonexecutable file');
    return git('show',ref+':'+file);
  };
  const at=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const snapshot=text=>{
    const entries=new Map();let target;
    const masked=text.replace(/<url>[\s\S]*?<\/url>/g,block=>{
      const loc=[...block.matchAll(/<loc>([^<>]+)<\/loc>/g)],mods=[...block.matchAll(/<lastmod>([^<>]+)<\/lastmod>/g)];
      assert(loc.length===1&&mods.length===1&&date(mods[0][1])&&mods[0][1]<=at,'unambiguous nonfuture sitemap entries required');
      const url=loc[0][1];assert(!entries.has(url),'duplicate sitemap location');
      entries.set(url,mods[0][1]);let own=false;try{targetUrl(url,experiment.page);own=true;}catch{}
      if(own){assert(!target,'ambiguous sitemap target');target={url,block};return block;}
      return block.replace(mods[0][0],'<lastmod>INHERITED_DATE</lastmod>');
    });
    assert(target&&entries.size>0&&entries.size<=10000,'bounded existing sitemap target required');
    assert.equal([...text.matchAll(/<loc>/g)].length,entries.size,'unparsed sitemap locations');
    return{masked,entries,target};
  };
  verifySupportingGitDiff(experiment,declaration,head,git,{now});
  const inherited=contracts.map(c=>{
    const a=snapshot(read(declaration)(c.path)),p=snapshot(read(parent)(c.path));
    const h=snapshot(read(head)(c.path)),m=snapshot(read(merge)(c.path));
    assert.equal(p.masked,a.masked,'parent changed target or non-date sitemap bytes');
    assert.equal(m.target.block,h.target.block,'merged sitemap treatment differs from reviewed head');
    const locations=[];
    for(const [url,value] of a.entries){
      assert(p.entries.get(url)>=value,'inherited sitemap dates cannot move backwards');
      if(p.entries.get(url)!==value)locations.push(url);
    }
    assert(locations.length>0,'sitemap difference lacks inherited date evidence');
    return{path:c.path,locations};
  });
  // The original bounded-edit verifier still checks every support contract.
  // Only proven inherited sitemap dates use the actual pre-merge main as base.
  verifySupportingDiff(experiment,file=>read(changed.includes(file)?parent:declaration)(file),read(merge),{now});
  return{version:'company-merge-scope-v2',head_sha:head,merge_sha:merge,parent_sha:parent,base_sha:base,
    reconstructed_tree:reconstructed,published_tree:tree,inherited_sitemaps:inherited,
    ci_scope:'Existing exact-head CI remains required; merge reconstruction is provenance, not historical merged-tree CI.'};
}
