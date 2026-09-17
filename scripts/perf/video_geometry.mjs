import assert from 'node:assert/strict';
// Match geometry only after controlling font selection and document lifetime.
export function assertPrintPreserved(before,after){
  for(const value of [before,after]){
    assert(value&&typeof value==='object','Print snapshot missing');
    assert.equal(value.visibility,'visible','Printed figure must remain visible');
    assert(typeof value.caption==='string'&&value.caption.trim().length>0,'Printed caption missing');
    for(const key of ['width','height'])assert(typeof value[key]==='number'&&Number.isFinite(value[key])&&value[key]>0,'Invalid print '+key);
  }
  assert.equal(after.caption,before.caption,'Print text changed');
  for(const key of ['width','height'])assert(Math.abs(after[key]-before[key])<1,'Print geometry changed: '+key);
}
