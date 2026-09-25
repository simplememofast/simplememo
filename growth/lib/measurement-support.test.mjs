import test from 'node:test';
import assert from 'node:assert/strict';
import {changeScope,ownershipConflict} from './experiment-overlap.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {verifySupportingDiff,verifySupportingBaseline,verifySupportingGitDiff,verifyInheritedSitemapMerge} from './measurement-support.mjs';

const page='/blog/fixture',url='https://simplememofast.com'+page,now=new Date('2026-09-20T01:00Z');
const json=v=>JSON.stringify(v,null,2)+'\n';
export function supportFixture() {
  const changes=[{path:'data/distribution-queue.json',kind:'distribution_seed',id:'20260920-fixture'},
    {path:'sitemap-ja.xml',kind:'sitemap_lastmod'},{path:'sitemap.xml',kind:'sitemap_index'},
    {path:'docs/story-seeds.md',kind:'story_seed',id:'S-20260920-fixture'}];
  const e={page,change_paths:['blog/fixture.html',...changes.map(c=>c.path)],supporting_changes:changes};
  const old={id:'20260919-old',url:'https://simplememofast.com/other'},item={id:'20260920-fixture',date_jst:'2026-09-20',url,title:'Fixture',lang:'ja',cluster:'memo',kind:'refresh',answer_1line:'Fixture answer',quotable_facts:[],x_post_ja:'Fixture post',note_angle:'Fixture angle',reddit_queries:[],verified_scope:'Synthetic test only'};
  const before={'data/distribution-queue.json':json({$comment:['public queue'],items:[old]}),
    'sitemap-ja.xml':'<urlset><url><loc>'+url+'</loc><lastmod>2026-09-19</lastmod></url><url><loc>https://simplememofast.com/other</loc><lastmod>2026-09-18</lastmod></url></urlset>\n',
    'sitemap.xml':'<sitemapindex><sitemap><loc>https://simplememofast.com/sitemap-ja.xml</loc><lastmod>2026-09-19</lastmod></sitemap><sitemap><loc>https://simplememofast.com/sitemap-en.xml</loc><lastmod>2026-09-18</lastmod></sitemap></sitemapindex>\n',
    'docs/story-seeds.md':'# Seeds\n\n## S-20260919-old\n\nKeep these exact bytes.\n'};
  const after={...before,'data/distribution-queue.json':json({...JSON.parse(before['data/distribution-queue.json']),items:[item,old]}),
    'sitemap-ja.xml':before['sitemap-ja.xml'].replace('2026-09-19','2026-09-20'),
    'sitemap.xml':before['sitemap.xml'].replace('2026-09-19','2026-09-20'),
    'docs/story-seeds.md':before['docs/story-seeds.md']+'\n---\n\n## S-20260920-fixture\n\n- **対象URL**: '+url+'\n- **一行の主張**: Fixture only.\n'};
  return {e,before,after,item,old,verify:()=>verifySupportingDiff(e,p=>before[p],p=>after[p],{now})};
}
test('complete prospective support has bounded page ownership and verified final edits',()=>{
  const f=supportFixture();verifySupportingBaseline(f.e,p=>f.before[p],{now});f.verify();
  const scope=changeScope(f.e.page,f.e.change_paths,f.e.supporting_changes);
  assert.equal(scope.global,false);
  assert.equal(ownershipConflict({page:'/protected',status:'running'},scope),false);
  assert.equal(ownershipConflict({page, status:'frozen'},scope),true);
  assert.equal(changeScope(page,f.e.change_paths).global,true,'legacy data changes retain global ownership');
  const other={...f.e,page:'/other',change_paths:['other.html',...f.e.supporting_changes.map(c=>c.path)]};
  assert.equal(ownershipConflict({...f.e,status:'running'},changeScope(other.page,other.change_paths,other.supporting_changes)),false,'two bounded support edits do not share the whole file ownership');
  assert.equal(ownershipConflict({...f.e,supporting_changes:undefined,status:'running'},changeScope(other.page,other.change_paths,other.supporting_changes)),true,'an old unbounded owner is not silently migrated');
  assert.equal(changeScope(page,[...f.e.change_paths,'assets/shared.js'],f.e.supporting_changes).global,true);
  for(const support of f.e.supporting_changes) {
    const incomplete=f.e.supporting_changes.filter(c=>c.path!==support.path&&!(support.kind==='sitemap_lastmod'&&c.kind==='sitemap_index'));
    const partialScope=changeScope(page,f.e.change_paths,incomplete);
    assert.equal(partialScope.global,true,'undeclared shared path keeps global ownership: '+support.path);
    assert.equal(ownershipConflict({page:'/protected',status:'running'},partialScope),true);
  }
  for(const extra of ['docs/evidence.md','growth/content/refresh-queue.json','sitemap-custom.xml'])assert.equal(changeScope(page,[...f.e.change_paths,extra],f.e.supporting_changes).global,true,'new support contracts cannot use legacy metadata exceptions');
});
test('malformed, undeclared, arbitrary and misleading support contracts are rejected',()=>{
  const f=supportFixture();
  for(const changes of [[],[{path:'assets/shared.js',kind:'distribution_seed',id:'20260920-fixture'}],[{path:'sitemap.xml',kind:'sitemap_index'}],[{...f.e.supporting_changes[0],unchecked:true}],[f.e.supporting_changes[0],f.e.supporting_changes[0]],[{path:'docs/story-seeds.md',kind:'anything'}]])
    assert.throws(()=>changeScope(page,f.e.change_paths,changes));
  assert.throws(()=>verifySupportingBaseline(f.e,p=>p==='data/distribution-queue.json'?f.after[p]:f.before[p],{now}),/already exists/);
  assert.throws(()=>verifySupportingBaseline(f.e,p=>p==='sitemap-ja.xml'?'<urlset/>':f.before[p],{now}),/locations/);
  const ambiguous=supportFixture();ambiguous.before['sitemap-ja.xml']=ambiguous.before['sitemap-ja.xml'].replace('https://simplememofast.com/other',url+'.html');
  assert.throws(()=>verifySupportingBaseline(ambiguous.e,p=>ambiguous.before[p],{now}),/ambiguous/);
});
test('queue proof rejects unrelated edits, extra seeds, hidden fields, URL tricks and ID reuse',()=>{
  const changes=[
    d=>{d.items[1].url=url;},d=>{d.$comment=['changed'];},d=>{d.items.push({id:'extra'});},d=>{d.items.pop();},
    d=>{d.items.reverse();},d=>{d.items[0].url='https://simplememofast.com/protected';},
    d=>{d.items[0].url=url+'?redirect=/protected';},d=>{d.items[0].url='http://simplememofast.com'+page;},
    d=>{d.items[0].url='https://simplememofast.com.evil.invalid'+page;},
    d=>{d.items[0].id=d.items[1].id;},d=>{d.items[0].date_jst='2026-09-21';},d=>{d.items[0].global_action='changed';},
  ];
  for(const mutate of changes) {const f=supportFixture(),d=JSON.parse(f.after['data/distribution-queue.json']);mutate(d);f.after['data/distribution-queue.json']=json(d);assert.throws(f.verify);}
  const f=supportFixture();f.after['data/distribution-queue.json']=f.after['data/distribution-queue.json'].replace('"items": [','"items": [], "items": [');assert.throws(f.verify,/canonical JSON/);
});
test('exact100-item queue retention removes only the oldest item',()=>{
  const f=supportFixture(),a=JSON.parse(f.before['data/distribution-queue.json']);a.items=Array.from({length:100},(_,i)=>({id:'old-'+i}));
  f.before['data/distribution-queue.json']=json(a);const b={...a,items:[f.item,...a.items].slice(0,100)};f.after['data/distribution-queue.json']=json(b);f.verify();
  b.items[99]=a.items[99];f.after['data/distribution-queue.json']=json(b);assert.throws(f.verify,/retention/);
});
test('sitemap proof preserves all non-target XML and rejects rewrites, additions and backdates',()=>{
  for(const [file,replace] of [
    ['sitemap-ja.xml',s=>s.replace('2026-09-18','2026-09-20')],
    ['sitemap-ja.xml',s=>s.replace(url,url+'.html')],
    ['sitemap-ja.xml',s=>s.replace('2026-09-20','2026-09-17')],
    ['sitemap-ja.xml',s=>s.replace('2026-09-20','2026-09-21')],
    ['sitemap-ja.xml',s=>s.replace('2026-09-20','2026-02-30')],
    ['sitemap-ja.xml',s=>s.replace('</urlset>','<url><loc>'+url+'</loc><lastmod>2026-09-20</lastmod></url></urlset>')],
    ['sitemap-ja.xml',s=>s.replace('</urlset>','<!-- unrelated --> </urlset>')],
    ['sitemap.xml',s=>s.replace('2026-09-18','2026-09-20')],
  ]){const f=supportFixture();f.after[file]=replace(f.after[file]);assert.throws(f.verify);}
});
test('story proof requires one target-bound append and preserves prior bytes',()=>{
  for(const mutate of [s=>s.replace('Keep these exact bytes.','Rewritten'),s=>s+'\n## S-20260920-extra\n',s=>s.replace('**対象URL**','**別URL**'),s=>s.replace(url,url+'/different'),s=>s.replace('S-20260920-fixture','S-20260920-other')]){
    const f=supportFixture();f.after['docs/story-seeds.md']=mutate(f.after['docs/story-seeds.md']);assert.throws(f.verify);
  }
  for(const extra of ['##\tS-20260920-other\n\n- **対象URL**:\thttps://simplememofast.com/protected\n','   ## S-20260920-other\n','S-20260920-other\n---\n','<h2>S-20260920-other</h2>\n','> ## S-20260920-other\n','  - ## S-20260920-other\n','- **対象URL**: https://simplememofast.com/protected\n']){
    const f=supportFixture();f.after['docs/story-seeds.md']+='\n'+extra;assert.throws(f.verify);
  }
  for(const heading of ['##\tS-20260920-fixture\n','   ## S-20260920-fixture ###\n','S-20260920-fixture\n---\n']){
    const f=supportFixture();f.before['docs/story-seeds.md']+=heading;assert.throws(()=>verifySupportingBaseline(f.e,p=>f.before[p],{now}),/story ID exists/);
  }
});
test('Git proof rejects symlinks and executes raw before/after blob checks',()=>{
  const f=supportFixture();const git=(...a)=>a[0]==='ls-tree'?'100644 blob '+ 'a'.repeat(40)+'\t'+a[3]+'\n':(a[1].startsWith('base:')?f.before:f.after)[a[1].split(':')[1]];
  verifySupportingGitDiff(f.e,'base','head',git,{now});
  assert.throws(()=>verifySupportingGitDiff(f.e,'base','head',(...a)=>a[0]==='ls-tree'?git(...a).replace('100644','120000'):git(...a),{now}),/regular/);
});

function inheritedFixture(t,{parentEdit=s=>s.replace('2026-09-18','2026-09-19')}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'support-merge-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  const g=(...args)=>git(...args).trim(),write=(p,s)=>fs.writeFileSync(path.join(root,p),s);
  g('init','-q');g('config','user.name','Fixture');g('config','user.email','fixture@example.invalid');
  const xml='<urlset>\n<url>\n<loc>https://simplememofast.com/target</loc>\n<lastmod>2026-09-17</lastmod>\n</url>\n'+'\n'.repeat(12)+'<url>\n<loc>https://simplememofast.com/other</loc>\n<lastmod>2026-09-18</lastmod>\n</url>\n</urlset>\n';
  write('sitemap-ja.xml',xml);write('target.html','before\n');write('experiments.json','sealed\n');g('add','.');g('commit','-qm','base');const base=g('rev-parse','HEAD');
  g('checkout','-qb','treatment');g('commit','--allow-empty','-qm','declaration');const declaration=g('rev-parse','HEAD');
  write('target.html','after\n');write('sitemap-ja.xml',xml.replace('2026-09-17','2026-09-20'));g('add','.');g('commit','-qm','treatment');const head=g('rev-parse','HEAD');
  g('checkout','-qb','parallel',base);write('sitemap-ja.xml',parentEdit(xml));write('other.txt','independent main work\n');g('add','.');g('commit','-qm','other main change');const parent=g('rev-parse','HEAD');
  g('merge','--squash',head);g('commit','-qm','published combination');const merge=g('rev-parse','HEAD');
  const paths=['target.html','sitemap-ja.xml','experiments.json'];
  const e={page:'/target',change_paths:paths,supporting_changes:[{path:'sitemap-ja.xml',kind:'sitemap_lastmod'}]};
  const verify=(over={})=>verifyInheritedSitemapMerge(over.e??e,over.declaration??declaration,head,over.merge??merge,paths,over.git??git,{now});
  return{root,git,g,write,e,declaration,head,parent,merge,verify};
}
test('squash inheritance explains the full published tree without claiming merged-tree CI',t=>{
  const f=inheritedFixture(t),proof=f.verify();
  assert.equal(proof.version,'company-merge-scope-v2');assert.equal(proof.parent_sha,f.parent);
  assert.equal(proof.reconstructed_tree,f.g('rev-parse',f.merge+'^{tree}'));
  assert.deepEqual(proof.inherited_sitemaps,[{path:'sitemap-ja.xml',locations:['https://simplememofast.com/other']}]);
  assert.match(proof.ci_scope,/not historical merged-tree CI/);
  assert.throws(()=>verifySupportingGitDiff(f.e,f.declaration,f.merge,f.git,{now}),/only declared lastmod/,'old failure remains reproducible');
  assert.equal(f.g('status','--porcelain'),'');
});
test('inherited dates require the already sealed sitemap contract and exact ordinary treatment files',t=>{
  const f=inheritedFixture(t);
  for(const e of [{...f.e,supporting_changes:undefined},{...f.e,supporting_changes:[{path:'sitemap-ja.xml',kind:'sitemap_index'}]}])assert.throws(()=>f.verify({e}));
  for(const p of ['target.html','experiments.json','sitemap-ja.xml']){
    f.g('checkout','--detach',f.merge);f.write(p,'unreviewed change\n');f.g('add',p);
    const tree=f.g('write-tree'),forged=f.g('commit-tree',tree,'-p',f.parent,'-m','synthetic bad merge');
    assert.throws(()=>f.verify({merge:forged}));f.g('reset','--hard',f.merge);
  }
  const multi=f.g('commit-tree',f.g('rev-parse',f.merge+'^{tree}'),'-p',f.parent,'-p',f.head,'-m','synthetic merge');
  assert.throws(()=>f.verify({merge:multi}),/one actual squash parent/);
  assert.throws(()=>f.verify({declaration:f.head}),/parent changed target|only declared/);
  assert.throws(()=>f.verify({git:(...a)=>a[0]==='merge-tree'?'0'.repeat(40)+'\n':f.git(...a)}),/reconstructed merge/);
  assert.throws(()=>f.verify({git:(...a)=>a[0]==='merge-tree'?(()=>{throw new Error('conflict');})():f.git(...a)}),/conflict/);
  assert.throws(()=>f.verify({git:(...a)=>a[0]==='ls-tree'?f.git(...a).replace('100644','120000'):f.git(...a)}),/regular/);
});
test('actual main inheritance cannot alter the target or unrelated XML or introduce invalid dates',t=>{
  const bad=[
    s=>s.replace('2026-09-18','2026-09-19').replace('2026-09-17','2026-09-20'),
    s=>s.replace('2026-09-18','2026-09-21'),
    s=>s.replace('2026-09-18','2026-09-16'),
    s=>s.replace('2026-09-18','2026-02-30'),
    s=>s.replace('2026-09-18','2026-09-19').replace('/other</loc>','/renamed</loc>'),
    s=>s.replace('2026-09-18','2026-09-19').replace('</urlset>','<!-- changed metadata -->\n</urlset>'),
    s=>s.replace('2026-09-18','2026-09-19').replace('</urlset>','<url><loc>https://simplememofast.com/other</loc><lastmod>2026-09-19</lastmod></url></urlset>'),
  ];
  for(const parentEdit of bad){const f=inheritedFixture(t,{parentEdit});assert.throws(()=>f.verify());}
});
