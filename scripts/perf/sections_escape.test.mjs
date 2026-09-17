import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSectionStates} from './sections_escape.mjs';
test('native target and focus require every computed section visible',()=>{
  assert.doesNotThrow(()=>assertSectionStates([{visibility:'visible'},{visibility:'visible'}],'visible','target'));
  for(const bad of [[],null,[null],[{}],[{visibility:'auto'}],[{visibility:'hidden'}],[{visibility:'visible'},{visibility:'auto'}]])
    assert.throws(()=>assertSectionStates(bad,'visible','target'));
});
test('ordinary non-target navigation preserves deferral and rejects changed policy',()=>{
  assert.doesNotThrow(()=>assertSectionStates([{visibility:'auto'}],'auto','ordinary'));
  assert.throws(()=>assertSectionStates([{visibility:'visible'}],'auto','ordinary'));
  assert.throws(()=>assertSectionStates([{visibility:'auto'}],'anything','ordinary'));
});
