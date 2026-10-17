// Synthetic aggregate observations only. No collector, API, key or Apple/iOS tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { summarizeAppsFlyerAcquisition, siteAcquisition, sitewideAcquisitionReport,
  acquisitionMaterial, ownedLinkPeriodRate, sitewideLinkPeriodRate } from './company-acquisition.mjs';

const header = 'Date,Agency/PMD (af_prt),Media Source (pid),Campaign (c),Installs,Clicks\n';
const row = (o = {}) => ({ landing_scope: 'production', landing_path: '/obsidian/',
  session_channel: 'Organic Search', landing_referrer_status: 'external',
  device_category: 'mobile', device_language: 'ja',
  observed_started_sessions: 10, sessions_with_own_app_click_24h: 2,
  sessions_with_onelink_impression: 5, sessions_with_onelink_click_24h: 3,
  onelink_clicked_without_recorded_impression: 1,
  sessions_with_any_app_route_click_24h: 4, ...o });
const expanded = (o = {}) => row({ sessions_with_sitewide_onelink_impression: 7,
  sessions_with_sitewide_onelink_click_24h: 4, sitewide_onelink_clicked_without_recorded_impression: 1,
  sessions_with_legacy_and_sitewide_routes_24h: 2, sessions_with_expanded_app_route_click_24h: 6, ...o });
const ga = rows => ({ ga4: { status: 'CONNECTED', window: { start: '2026-10-16', end: '2026-10-16' },
  reports: [{ file: 'ga4-funnel.sql', result: rows }] } });
const af = csv => ({ status: 'CONNECTED', collection: { status: 'verified' },
  quality: { missing_dates: [], missing_metric_columns: [], row_cap_hit: false },
  site_acquisition: summarizeAppsFlyerAcquisition(header + csv) });

test('sitewide union is deduplicated while legacy direct, pilot and nine-hub scope stay separate', () => {
  const input = ga([expanded(), expanded({ landing_path: '/en/obsidian/' }),
    expanded({ landing_scope: 'nonproduction', observed_started_sessions: 100 })]);
  const before = structuredClone(input);
  const a = siteAcquisition(input, { status: 'quality_blocked' });
  assert.deepEqual(input, before);
  assert.equal(a.ga4.observed_production_sessions, 20);
  assert.equal(a.ga4.sessions_with_store_click, 4);
  assert.equal(a.ga4.sessions_with_any_app_route_click, 8);
  const sw = a.ga4.sitewide_routes;
  assert.equal(sw.onelink_click_sessions, 8);
  assert.equal(sw.onelink_impression_click_session_rate, 6 / 14);
  assert.equal(sw.sessions_with_expanded_app_route_click, 12);
  assert.equal(sw.expanded_app_route_click_session_rate, .6);
  assert.equal(sw.quality_state, 'quality_blocked');
  assert.equal(sw.replaces_official_rate, false);
  const pilot = a.ga4.obsidian_hub_pilot;
  assert.equal(pilot.hub_landing_sessions, 10); // English hub remains outside the original nine.
  assert.equal(pilot.hub_landing_sessions_reaching_store, 6);
  assert.equal(pilot.primary_source_scope, 'expanded_direct_plus_pilot_plus_sitewide');
  assert.equal(pilot.onelink_click_sessions, 6); // Existing pilot-only auxiliary, all landings.
  assert.equal(pilot.onelink_impression_click_session_rate, 4 / 10);
  assert.equal(a.website_install_cvr.value, null);
  assert.equal(a.website_install_cvr.estimated_value, null);
  assert.equal(a.website_install_cvr.period_alignment.matched_cohort, false);
});

test('historical receipts preserve pilot primary counts and mark sitewide unavailable, never zero', () => {
  const a = siteAcquisition(ga([row()]));
  assert.equal(a.ga4.obsidian_hub_pilot.hub_landing_sessions_reaching_store, 4);
  assert.equal(a.ga4.obsidian_hub_pilot.definition_version, 'obsidian-hub-onelink-pilot-v1');
  assert.equal(a.ga4.obsidian_hub_pilot.primary_source_scope, 'legacy_direct_plus_pilot');
  assert.equal(a.ga4.sitewide_routes.state, 'legacy_query_without_sitewide_columns');
  assert.equal(a.ga4.sitewide_routes.onelink_click_sessions, null);
  assert.equal(a.ga4.sitewide_routes.sessions_with_expanded_app_route_click, null);
});

test('additive v3 columns leave all pilot observations identical before sitewide events', () => {
  const old = siteAcquisition(ga([row()])).ga4;
  const current = siteAcquisition(ga([expanded({ sessions_with_sitewide_onelink_impression: 0,
    sessions_with_sitewide_onelink_click_24h: 0, sitewide_onelink_clicked_without_recorded_impression: 0,
    sessions_with_legacy_and_sitewide_routes_24h: 0, sessions_with_expanded_app_route_click_24h: 4 })])).ga4;
  for (const k of ['sessions_with_store_click', 'observed_store_click_session_rate',
    'sessions_with_any_app_route_click', 'observed_any_app_route_click_session_rate']) assert.equal(current[k], old[k]);
  for (const k of ['hub_landing_sessions', 'hub_landing_sessions_reaching_store', 'hub_landing_store_session_rate',
    'onelink_impression_sessions', 'onelink_click_sessions', 'onelink_impression_click_session_rate'])
    assert.equal(current.obsidian_hub_pilot[k], old.obsidian_hub_pilot[k]);
  assert.equal(current.sitewide_routes.onelink_click_sessions, 0);
  assert.equal(current.sitewide_routes.onelink_impression_click_session_rate, null);
});

test('mixed, incomplete or impossible sitewide rows fail closed without rewriting the pilot auxiliary', () => {
  for (const rows of [[row(), expanded()], [expanded({ sessions_with_sitewide_onelink_click_24h: undefined })],
    [expanded({ sessions_with_expanded_app_route_click_24h: 7 })],
    [expanded({ sessions_with_legacy_and_sitewide_routes_24h: 5 })],
    [expanded({ sitewide_onelink_clicked_without_recorded_impression: 5 })],
    [expanded({ sessions_with_sitewide_onelink_impression: 0 })],
    [expanded({ sessions_with_sitewide_onelink_click_24h: -1 })],
    [expanded({ sessions_with_expanded_app_route_click_24h: '6' })]]) {
    const a = siteAcquisition(ga(rows));
    assert.equal(a.ga4.sitewide_routes.state, 'invalid_or_mixed_sitewide_columns');
    assert.equal(a.ga4.sitewide_routes.expanded_app_route_click_session_rate, null);
    assert.equal(a.ga4.obsidian_hub_pilot.hub_landing_store_session_rate, null);
    assert.notEqual(a.ga4.obsidian_hub_pilot.onelink_click_sessions, null);
  }
});

test('unavailable connections cannot expose retained sitewide counts', () => {
  for (const status of ['BLOCKED', 'PARTIAL', 'unavailable']) {
    const c = ga([expanded()]); c.ga4.status = status;
    const a = siteAcquisition(c);
    assert.equal(a.ga4.sitewide_routes.state, 'unavailable');
    assert.equal(a.ga4.sitewide_routes.onelink_click_sessions, null);
    assert.equal(a.ga4.obsidian_hub_pilot.hub_landing_store_session_rate, null);
  }
});

test('AppsFlyer exact sitewide campaign is isolated from pilot, Organic, QA and lookalike campaigns', () => {
  const c = af('2026-10-16,None,owned_web,obsidian_bridge_pilot_v1,2,10\n' +
    '2026-10-16,None,owned_web,website_bridge_v1,5,20\n' +
    '2026-10-16,None,Organic,website_bridge_v1,80,4\n' +
    '2026-10-16,None,seo_aio_qa,website_bridge_v1,99,99\n' +
    '2026-10-16,None,owned_web,obsidian_bridge_qa_20260907,98,98\n' +
    '2026-10-16,None,owned_web,website_bridge_v10,90,90\n');
  assert.equal(c.site_acquisition.own_site_installs, 2);
  assert.equal(c.site_acquisition.sitewide_link_installs, 5);
  assert.equal(c.site_acquisition.by_category.qa.installs, 197);
  assert.equal(c.site_acquisition.by_category.organic_unspecified.installs, 80);
  assert.equal(c.site_acquisition.by_category.other_attributed.installs, 90);
  assert.equal(ownedLinkPeriodRate(c).value, .2);
  assert.equal(sitewideLinkPeriodRate(c).value, .25);
  assert.equal(sitewideLinkPeriodRate(c).matched_cohort, false);
  const a = siteAcquisition({ ...ga([expanded()]), appsflyer: c });
  assert.equal(a.website_install_cvr.numerator.observed_pilot_installs, 2);
  assert.equal(a.website_install_cvr.numerator.observed_sitewide_link_installs, 5);
  assert.equal(a.website_install_cvr.numerator.whole_site_new_installs, null);
  assert.equal(a.website_install_cvr.coverage.site_wide, false);
  const text = sitewideAcquisitionReport(a).join('\n');
  assert.match(text, /Organic stays unattributed to the site/);
  assert.match(text, /not verified first installs, API first-launch events/);
  assert.match(text, /Native Smart App Banner taps, cross-device QR scans/);
  assert.match(text, /Do not compare it with pre-sitewide experiment baselines/);
});

test('sitewide period ratio uses the existing verified-receipt and completeness gates', () => {
  const c = af('2026-10-16,None,owned_web,website_bridge_v1,3,10\n');
  assert.equal(sitewideLinkPeriodRate(c).value, .3);
  for (const change of [{ status: 'PARTIAL' }, { status: 'BLOCKED' }, { reason: 'source_failure' },
    { collection: undefined }, { collection: { status: 'failed' } },
    { quality: undefined }, { quality: { missing_dates: ['2026-10-15'], missing_metric_columns: [] } },
    { quality: { missing_dates: [], missing_metric_columns: ['Installs'] } },
    { quality: { missing_dates: [], missing_metric_columns: ['Clicks'] } },
    { quality: { missing_dates: [], missing_metric_columns: [], row_cap_hit: true } }])
    assert.equal(sitewideLinkPeriodRate({ ...c, ...change }).value, null);
  assert.equal(sitewideLinkPeriodRate({ ...c, status: 'BLOCKED' }).installs, null);
  const partial = { ...c, status: 'PARTIAL', quality: { missing_dates: [], missing_metric_columns: ['Sessions'] } };
  assert.equal(sitewideLinkPeriodRate(partial).value, .3);
  assert.equal(partial.status, 'PARTIAL');
});

test('sitewide missing rows, missing metrics and explicit zero remain different', () => {
  const absent = af('2026-10-16,None,Organic,None,80,\n');
  assert.equal(absent.site_acquisition.sitewide_link_installs, null);
  assert.equal(sitewideLinkPeriodRate(absent).state, 'not_observed');
  const zero = af('2026-10-16,None,owned_web,website_bridge_v1,0,10\n');
  assert.equal(sitewideLinkPeriodRate(zero).value, 0);
  const noClicks = af('2026-10-16,None,owned_web,website_bridge_v1,3,0\n');
  assert.equal(sitewideLinkPeriodRate(noClicks).state, 'no_click_denominator');
  assert.equal(sitewideLinkPeriodRate(noClicks).value, null);
  const missing = af('2026-10-16,None,owned_web,website_bridge_v1,3,\n');
  assert.equal(sitewideLinkPeriodRate(missing).value, null);
  const delayed = af('2026-10-16,None,owned_web,website_bridge_v1,3,1\n');
  assert.equal(sitewideLinkPeriodRate(delayed).value, 3); // Report periods are not matched cohorts.
});

test('standalone additions preserve the exact existing daily/weekly material fingerprint', () => {
  const fixture = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/sitewide-material-v2.json', import.meta.url)));
  assert.equal(fixture.baseline_commit, '0ef15885743153a1d902d34b951e0b537634dd51');
  for (const entry of fixture.cases) {
    const connections = structuredClone(entry.connections);
    connections.appsflyer.site_acquisition = summarizeAppsFlyerAcquisition(entry.appsflyer_csv);
    const a = siteAcquisition(connections, entry.cta), before = structuredClone(a);
    const material = acquisitionMaterial(a);
    assert.equal(createHash('sha256').update(JSON.stringify(material)).digest('hex'), entry.expected_material_sha256, entry.name);
    assert.deepEqual(a, before);
    // Genuine changes in a pre-existing metric still count as material.
    a.ga4.sessions_with_store_click += 1;
    assert.notDeepEqual(acquisitionMaterial(a), material);
  }
});

test('standalone impression rates display their actual numerator and keep total clicks separate', () => {
  const a = siteAcquisition(ga([expanded()])), before = structuredClone(a);
  const text = sitewideAcquisitionReport(a).join('\n');
  assert.match(text, /Sitewide OneLink: 3 click sessions with a recorded impression \/ 7 impression sessions; 42\.86%\. Total click sessions 4; without a recorded impression 1\./);
  assert.match(text, /Unchanged pilot-only hero auxiliary: 2 click sessions with a recorded impression \/ 5 impression sessions; 40\.00%\. Total click sessions 3; without a recorded impression 1\./);
  assert.deepEqual(a, before);
});

test('standalone renderer keeps missing or inconsistent impression evidence unknown for both scopes', () => {
  for (const scope of ['sitewide_routes', 'obsidian_hub_pilot']) {
    for (const change of [{ onelink_clicked_without_recorded_impression: null },
      { onelink_clicked_without_recorded_impression: -1 }, { onelink_clicked_without_recorded_impression: 8 },
      { onelink_click_sessions: null }, { onelink_impression_sessions: 0 },
      { onelink_click_sessions: '4' }]) {
      const a = siteAcquisition(ga([expanded()]));
      Object.assign(a.ga4[scope], change);
      const line = sitewideAcquisitionReport(a).find(s => s.startsWith(scope === 'sitewide_routes' ? 'Sitewide OneLink:' : 'Nine-hub primary:'));
      const readout = scope === 'sitewide_routes' ? line.split(' Expanded direct')[0] : line.split('Unchanged pilot-only hero auxiliary: ')[1];
      assert.match(readout, /unknown click sessions with a recorded impression \/ (?:\d+|unknown) impression sessions; unknown\./);
    }
    for (const rate of [null, NaN, .9]) {
      const a = siteAcquisition(ga([expanded()]));
      a.ga4[scope].onelink_impression_click_session_rate = rate;
      const line = sitewideAcquisitionReport(a).find(s => s.startsWith(scope === 'sitewide_routes' ? 'Sitewide OneLink:' : 'Nine-hub primary:'));
      const readout = scope === 'sitewide_routes' ? line.split(' Expanded direct')[0] : line.split('Unchanged pilot-only hero auxiliary: ')[1];
      assert.match(readout, /impression sessions; unknown\./);
    }
  }
});

test('standalone renderer preserves an observed zero and leaves a zero denominator rate unknown', () => {
  const a = siteAcquisition(ga([expanded()]));
  for (const scope of ['sitewide_routes', 'obsidian_hub_pilot']) Object.assign(a.ga4[scope], {
    onelink_click_sessions: 0, onelink_impression_sessions: 5,
    onelink_clicked_without_recorded_impression: 0, onelink_impression_click_session_rate: 0,
  });
  assert.equal(sitewideAcquisitionReport(a).join('\n').match(/0 click sessions with a recorded impression \/ 5 impression sessions; 0\.00%/g).length, 2);
  for (const scope of ['sitewide_routes', 'obsidian_hub_pilot']) Object.assign(a.ga4[scope], {
    onelink_impression_sessions: 0, onelink_impression_click_session_rate: null,
  });
  assert.equal(sitewideAcquisitionReport(a).join('\n').match(/0 click sessions with a recorded impression \/ 0 impression sessions; unknown/g).length, 2);
});
