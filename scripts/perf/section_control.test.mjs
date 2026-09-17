import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {removeSectionRule} from './section_control.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('control changes only the reviewed nested section rule',()=>{
 const css=fs.readFileSync(root+'assets/css/home-hero.css','utf8');
 const without=removeSectionRule(css);
 assert(without.length<css.length);
 assert(!without.includes('Progressive enhancement only'));
 for(const file of ['index.html','en/index.html']){
  const html=fs.readFileSync(root+file,'utf8');
  const control=removeSectionRule(html);
  assert.equal(html.length-control.length,css.length-without.length);
  const scripts=source=>[...source.matchAll(/<script\b[\s\S]*?<\/script>/g)].map(m=>m[0]);
  assert.deepEqual(scripts(control),scripts(html),'Control must retain every script and structured-data block');
  assert(control.includes(without.trim()),'Control must preserve the preceding hero styles');
 }
});
test('missing, duplicate and incomplete control rules fail closed',()=>{
 const css=fs.readFileSync(root+'assets/css/home-hero.css','utf8');
 assert.throws(()=>removeSectionRule('unrelated css'),/exactly one/);
 assert.throws(()=>removeSectionRule(css+css),/exactly one/);
 assert.throws(()=>removeSectionRule(css.trim().slice(0,-1)),/Unbalanced/);
 assert.throws(()=>removeSectionRule(css.replace('html[lang="ja"]','html[lang="en"]')),/Unexpected/);
});
