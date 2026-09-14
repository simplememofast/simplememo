// Scoped visible-UI evidence is configuration evidence, never a data receipt.
const appleAdsObservationURLs = new Set([
  'https://hq1.appsflyer.com/discovery/overview',
  'https://hq1.appsflyer.com/marketplace/integrated-partners/id6758438948/iossearchads_int',
]);
export function appleAdsConnection(receipt, now = new Date()) {
  const unknown = reason => ({status:'BLOCKED', reason, cost:null, data_verified:false});
  if (receipt?.schema_version !== 1 || receipt.method !== 'authenticated_visible_browser_ui' ||
      receipt.account_scope !== 'SimpleMemo' || receipt.identity_verified !== true ||
      receipt.provider !== 'AppsFlyer' || receipt.app_id !== 'id6758438948' ||
      !appleAdsObservationURLs.has(receipt.url)) {
    return unknown('No valid scoped existing Apple Ads configuration observation');
  }
  if (typeof receipt.observed_at !== 'string') return unknown('Apple Ads configuration observation has no valid timestamp');
  const age = now.getTime() - Date.parse(receipt.observed_at);
  if (!Number.isFinite(age) || age < 0 || age > 7 * 86400000) return unknown('Apple Ads configuration observation needs refresh');
  if (!['active','inactive'].includes(receipt.attribution_state) ||
      !['invalid_credentials','no_configured_rows','unknown','connected'].includes(receipt.cost_state)) {
    return unknown('Apple Ads configuration observation has unsupported states');
  }
  return {status:'PARTIAL', provider:'existing AppsFlyer Apple Ads integration',
    observed_at:receipt.observed_at, attribution_state:receipt.attribution_state,
    cost_integration_state:receipt.cost_state, cost:null, data_verified:false,
    cost_last_sync:receipt.cost_last_sync === 'Never' ? 'Never' : null,
    reason:'Existing configuration observed; attributed installs and advertising cost require separate verified data receipts',
    next_action:receipt.cost_state === 'invalid_credentials' ? 'Inspect existing approved credential and plan entitlement; do not retry, create a second integration, purchase access or change campaigns' : 'Use existing approved source readers; configuration alone is not successful data collection'};
}
