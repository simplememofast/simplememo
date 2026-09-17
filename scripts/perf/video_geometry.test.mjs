import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPrintPreserved} from './video_geometry.mjs';
const before={width:320,height:260.98,visibility:'visible',caption:'Original visible caption'};
test('same-font same-document comparison accepts only unchanged geometry and text',()=>{
  assert.doesNotThrow(()=>assertPrintPreserved(before,{...before}));
});
test('one-line drift, lost content, missing snapshots and hidden print fail',()=>{
  for(const after of [null,{...before,height:284.78},{...before,width:300},{...before,caption:''},{...before,caption:'changed'},{...before,visibility:'auto'}])assert.throws(()=>assertPrintPreserved(before,after));
});
test('invalid print dimensions cannot be interpreted as zero or success',()=>{
  for(const value of [true,'320',0,-1,NaN,Infinity,null,undefined])for(const key of ['width','height'])assert.throws(()=>assertPrintPreserved(before,{...before,[key]:value}));
});
