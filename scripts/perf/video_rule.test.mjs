import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {VIDEO_RULE, withoutVideoRule} from './video_rule.mjs';
const root=new URL('../../', import.meta.url);
test('control removes only the exact reviewed rule',()=>{
  const before='<script>keepAllScripts()</script><h1>Keep text</h1>';
  const after='<video controls preload="none" poster="same.jpg"></video>';
  assert.equal(withoutVideoRule(before+VIDEO_RULE+after),before+after);
});
test('missing, repeated and malformed controls fail closed',()=>{
  for(const value of [null,'',VIDEO_RULE+VIDEO_RULE,VIDEO_RULE.replace('@media screen','@media print'),VIDEO_RULE+'/* home-video-render:start */',VIDEO_RULE+'/* home-video-render:end */'])assert.throws(()=>withoutVideoRule(value));
});
test('real CSS and both generated inline copies contain the same rule once',()=>{
  for(const file of ['assets/css/home-hero.css','index.html','en/index.html']){
    const text=fs.readFileSync(new URL(file,root),'utf8');
    assert.equal(text.length-withoutVideoRule(text).length,VIDEO_RULE.length);
  }
});
test('native video controls, metadata and geometry reservations survive',()=>{
  const html=fs.readFileSync(new URL('index.html',root),'utf8');
  const tags=html.match(/<video\b[^>]*>/g);assert.equal(tags?.length,1);
  for(const attribute of ['controls','preload="none"','playsinline','muted','width="1280"','height="720"','poster="/assets/video/launch-1s-poster.jpg"'])assert(tags[0].includes(attribute));
  assert(!/loading=|autoplay|data-src=/.test(tags[0]),'Rejected lazy-loading experiment must not ship');
  assert(html.includes('<source src="/assets/video/launch-1s.mp4" type="video/mp4">'));
  assert(html.includes('"@type":"VideoObject"'));
  assert(!fs.readFileSync(new URL('en/index.html',root),'utf8').includes('<video'));
});

test('fragment-safe containment is gated on selector support and has an eager escape',()=>{
  assert(VIDEO_RULE.includes('and selector(:has(:target))'));
  assert(VIDEO_RULE.includes('html[lang="ja"]:has(:target) main > figure.lp-video > video'));
  assert(VIDEO_RULE.includes('contain-intrinsic-size: 1280px 720px'));
  assert(!VIDEO_RULE.includes('contain-intrinsic-block-size: auto 600px'));
  const selectors=VIDEO_RULE.split('\n').filter(line=>line.includes('html[lang="ja"]'));
  assert.equal(selectors.length,3);
  assert(selectors.every(line=>/ > video\s*[,{]$/.test(line.trim())), 'Caption and figure must remain outside containment');
});
