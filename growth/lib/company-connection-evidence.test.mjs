import test from 'node:test';
import assert from 'node:assert/strict';
import {appleAdsConnection} from './company-connection-evidence.mjs';
const now=new Date('2026-09-13T12:25:00Z');
const receipt={schema_version:1,method:'authenticated_visible_browser_ui',account_scope:'SimpleMemo',identity_verified:true,
  provider:'AppsFlyer',app_id:'id6758438948',url:'https://hq1.appsflyer.com/discovery/overview',observed_at:'2026-09-13T12:24:00Z',
  attribution_state:'active',cost_state:'invalid_credentials',cost_last_sync:'Never'};
test('an active attribution integration with invalid cost credentials stays partial with unknown cost',()=>{
  const r=appleAdsConnection(receipt,now);
  assert.equal(r.status,'PARTIAL'); assert.equal(r.cost_integration_state,'invalid_credentials');
  assert.equal(r.cost,null); assert.equal(r.data_verified,false); assert.equal(r.cost_last_sync,'Never');
  assert.equal(appleAdsConnection({...receipt,cost_state:'connected'},now).data_verified,false);
});
test('other identities, future/stale observations and malformed states cannot establish a connection',()=>{
  for (const patch of [{app_id:'other'},{account_scope:'other'},{identity_verified:false},{url:'https://example.com'},
    {observed_at:'2026-09-14T00:00:00Z'},{observed_at:'2026-09-01T00:00:00Z'},{observed_at:null},{observed_at:{toString:null,valueOf:null}},
    {attribution_state:'invented'},{cost_state:'success'}]) assert.equal(appleAdsConnection({...receipt,...patch},now).status,'BLOCKED');
  for(const r of [null,[],{}])assert.equal(appleAdsConnection(r,now).status,'BLOCKED');
});
