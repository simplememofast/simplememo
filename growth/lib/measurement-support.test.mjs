import test from 'node:test';
import assert from 'node:assert/strict';
import {changeScope,ownershipConflict} from './experiment-overlap.mjs';
import {verifySupportingDiff,verifySupportingBaseline,verifySupportingGitDiff} from './measurement-support.mjs';

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
