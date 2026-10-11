import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {removeSectionRule} from './section_control.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('control removes only normal deferral and preserves the nested escapes',()=>{
 const css=fs.readFileSync(root+'assets/css/home-hero.css','utf8');
 const without=removeSectionRule(css);
 assert(without.length<css.length);
 assert(without.includes('Progressive enhancement only'));
 assert(!without.includes('content-visibility: auto;'));
 assert(!without.includes('contain-intrinsic-block-size: auto 600px;'));
 const assignment=/html\[lang="ja"\] main > section:not\(\.hero\):not\(\.press-band\) \{\s*content-visibility: auto;\s*contain-intrinsic-block-size: auto 600px;\s*\}/;
 assert.equal(without,css.replace(assignment,''),'All other CSS must remain byte-identical');
 for(const file of ['index.html','en/index.html']){
  const html=fs.readFileSync(root+file,'utf8');
  const control=removeSectionRule(html);
  assert.equal(html.length-control.length,css.length-without.length);
  const scripts=source=>[...source.matchAll(/<script\b[\s\S]*?<\/script>/g)].map(m=>m[0]);
  assert.deepEqual(scripts(control),scripts(html),'Control must retain every script and structured-data block');
  assert.equal(control,html.replace(assignment,''),'All other HTML must remain byte-identical');
  assert(control.includes(without.trim()),'Control must preserve the preceding hero styles');
 }
});
test('missing, duplicate and incomplete control rules fail closed',()=>{
 const css=fs.readFileSync(root+'assets/css/home-hero.css','utf8');
 assert.throws(()=>removeSectionRule('unrelated css'),/exactly one/);
 assert.throws(()=>removeSectionRule(css+css),/exactly one/);
 const start=css.indexOf('/* Progressive enhancement only:');
 const end=css.indexOf('\n}',start);
 assert(start>=0&&end>start,'Expected the actual section-rule boundary');
 assert.throws(()=>removeSectionRule(css.slice(0,end+1)+css.slice(end+2)),/Unbalanced/);
 assert.throws(()=>removeSectionRule(css.replace('html[lang="ja"]','html[lang="en"]')),/Unexpected/);
 assert.throws(()=>removeSectionRule(css.replace('content-visibility: auto;','content-visibility: hidden;')),/Unexpected deferred/);
 assert.throws(()=>removeSectionRule(css.replace('contain-intrinsic-block-size: auto 600px;','contain-intrinsic-block-size: auto 700px;')),/Unexpected deferred/);
});

test('native fragment guard preserves preceding geometry without changing print or no-target policy',()=>{
 const css=fs.readFileSync(root+'assets/css/home-hero.css','utf8');
 const selector='html[lang="ja"]:has(:target) main > section:not(.hero):not(.press-band)';
 assert.equal(css.split(selector).length,2);
 assert(css.includes('@supports selector(:has(:target))'));
 assert(removeSectionRule(css).includes(selector),'Both versions must resolve real geometry for native fragments');
 assert(css.includes('html[lang="ja"] main > section:not(.hero):not(.press-band):focus-within,'));
 assert(css.includes('html[lang="ja"] main > section:not(.hero):not(.press-band):target {'));
 assert(!css.includes('html[lang="ja"] main > section:target {'),'A lower-specificity escape cannot override the deferred selector');
 for(const file of ['index.html','en/index.html'])assert.equal(fs.readFileSync(root+file,'utf8').split(selector).length,2);
});
