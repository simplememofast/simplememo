// Reporting only: no identifiers, provider requests, consent changes or joins.
// Production start is recorded in growth/ONELINK_PILOT.md and measurement_changes.
const PILOT_START_DAY = '2026-10-15';
const FIRST_COMPLETE_DAY = '2026-10-16';
const DAY = 86400000;
const count = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
const validDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  && Number.isFinite(Date.parse(d + 'T00:00:00Z'))
  && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);

// Inspect the retained report's actual inclusive dates, not today's date.
// Time passing or an artifact's filename cannot establish admitted observations.
export function pilotWindowCoverage(window) {
  const start = window?.start ?? window?.from;
  const end = window?.end ?? window?.to;
  if (!validDay(start) || !validDay(end) || start > end
    || (window?.start && window?.from && window.start !== window.from)
    || (window?.end && window?.to && window.end !== window.to)) {
    return { state: 'window_unavailable', start: null, end: null, days: null,
      complete_post_start_days: null, includes_launch_day: null };
  }
  const days = (Date.parse(end) - Date.parse(start)) / DAY + 1;
  const first = start > FIRST_COMPLETE_DAY ? start : FIRST_COMPLETE_DAY;
  const completeDays = end < first ? 0 : (Date.parse(end) - Date.parse(first)) / DAY + 1;
  return { state: end < PILOT_START_DAY ? 'before_pilot'
    : end < FIRST_COMPLETE_DAY ? 'launch_partial_day_only'
    : start < FIRST_COMPLETE_DAY ? 'mixed_pre_and_post_start'
    : 'complete_post_start_days', start, end, days,
    complete_post_start_days: completeDays,
    includes_launch_day: start <= PILOT_START_DAY && end >= PILOT_START_DAY };
}

/** Optional whole-site evidence gaps; never a synthetic CVR or a pilot completion gate. */
export function websiteInstallReadiness(acquisition = {}) {
  const ga = acquisition.ga4 ?? {}, af = acquisition.appsflyer ?? {};
  const visits = ga.website_visits;
  const visitValue = field => visits?.state === 'observed_diagnostic' ? count(visits[field]) : null;
  const gaWindow = pilotWindowCoverage(ga.window), afWindow = pilotWindowCoverage(af.window);
  const knownWindows = gaWindow.start !== null && afWindow.start !== null;
  const sameWindow = knownWindows ? gaWindow.start === afWindow.start && gaWindow.end === afWindow.end : null;
  const sessions = ga.state === 'unavailable' ? null : count(ga.observed_production_sessions);
  const installs = ['CONNECTED', 'PARTIAL'].includes(af.connection_state)
    ? count(af.own_site_installs) : null;
  const sitewideInstalls = ['CONNECTED', 'PARTIAL'].includes(af.connection_state)
    ? count(af.sitewide_link_installs) : null;
  const blockers = ['no_common_attributable_cohort', 'partial_site_route_coverage',
    'attribution_lookback_unverified', 'internal_user_exclusion_unverified', 'reinstall_exclusion_unverified'];
  if (sessions === null) blockers.push('session_denominator_unavailable');
  if (installs === null) blockers.push('attributed_pilot_installs_unavailable');
  if (ga.state !== 'observed') blockers.push('ga4_quality_not_cleared');
  if (!['observed_period_ratio', 'no_click_denominator'].includes(af.owned_link_period_rate?.state))
    blockers.push('appsflyer_report_not_complete');
  if (!knownWindows) blockers.push('source_windows_unavailable');
  else if (!sameWindow) blockers.push('source_windows_differ');
  if (gaWindow.start && gaWindow.complete_post_start_days === 0) blockers.push('no_complete_post_start_ga4_day');
  if (afWindow.start && afWindow.complete_post_start_days === 0) blockers.push('no_complete_post_start_appsflyer_day');
  if (gaWindow.includes_launch_day || afWindow.includes_launch_day) blockers.push('includes_partial_launch_day');

  return { value: null, state: 'not_measurable', definition_version: 'website-install-readiness-v1',
    scope: 'supplementary_whole_site_diagnostic',
    blockers_scope: 'whole_site_visit_to_install_cvr_only',
    pilot_completion_gate: false,
    reason: 'No verified common web-to-install cohort. GA4 clicks, Apple first downloads and AppsFlyer installs have different coverage and attribution.',
    estimated_value: null,
    estimate_state: 'no_supported_estimate_from_current_aggregates',
    blockers,
    denominators: {
      page_views: { value: visitValue('page_views'), state: visits?.state ?? 'unavailable',
        definition: 'Identified production page-view events dated in the JST window; repeats count. Not the 24h session cohort.',
        window: gaWindow, timezone: 'Asia/Tokyo', quality_state: ga.state ?? 'unavailable', source_scope: visits?.scope ?? null, reason: visits?.reason ?? null },
      unique_visitors: { value: visitValue('observed_visitors'), state: visits?.state ?? 'unavailable',
        definition: 'Distinct observed browser identifiers across the site window, not verified people. Never sum per-page users or sessions.',
        window: gaWindow, timezone: 'Asia/Tokyo', quality_state: ga.state ?? 'unavailable', source_scope: visits?.scope ?? null, reason: visits?.reason ?? null },
      sessions: { value: sessions, state: sessions === null ? 'unavailable' : 'observed_diagnostic',
        definition: 'Observed production landing sessions; one person may start several sessions.',
        window: gaWindow, timezone: 'Asia/Tokyo', quality_state: ga.state ?? 'unavailable' },
    },
    numerator: { whole_site_new_installs: null, observed_pilot_installs: installs,
      observed_sitewide_link_installs: sitewideInstalls,
      sitewide_state: sitewideInstalls === null ? 'not_observed' : 'reported_sitewide_campaign_rows',
      sitewide_definition: 'Separate AppsFlyer aggregate Installs for owned_web / website_bridge_v1. Not complete website installs, verified first installs or API first launches. Never add Organic or QA.',
      state: installs === null ? 'not_observed' : 'reported_pilot_rows',
      definition: 'AppsFlyer aggregate Installs for owned_web / obsidian_bridge_pilot_v1. Not Apple first downloads, D1 first-launch observations, verified new people, or purchases.',
      window: afWindow, timezone: 'Asia/Tokyo', connection_state: af.connection_state ?? 'unavailable',
      missing_dates: af.missing_dates ?? null, missing_metric_columns: af.missing_metric_columns ?? null },
    coverage: { site_wide: false, pilot_hero_placements: 9, per_page_installs_available: false,
      sitewide_campaign: 'website_bridge_v1',
      sitewide_web_observation_state: ga.sitewide_routes?.state ?? 'unavailable',
      sitewide_campaign_observation_state: sitewideInstalls === null ? 'not_observed' : 'reported_rows_only',
      outside_sitewide_web_event_coverage: ['cross_device_qr_scans', 'native_smart_app_banner_taps', 'javascript_disabled_routes'],
      route_coverage_complete: false,
      excluded_from_pilot: ['other_direct_apple_links', 'qr', 'smart_app_banner', 'english_obsidian_hero'],
      qa: 'separate_campaign_not_production', organic: 'not_identifiable_as_website',
      internal_users: 'not_verified_excluded', reinstalls: 'not_verified_excluded',
      consent_and_ios: 'GA4 and AppsFlyer observe different consent-eligible populations; denied/restricted tracking and prior in-app refusal limit app collection.' },
    period_alignment: { same_calendar_window: sameWindow, matched_cohort: false,
      attribution_lookback_days: null, attribution_lookback_state: 'account_setting_unverified',
      ga4_maturity_days: 5, ga4_click_followup_hours: 24, appsflyer_collection_window_days: 28,
      note: 'The 28-day report requirement is not the click-attribution lookback. Even equal JST dates do not identify a common cohort; delayed attribution can cross the period boundary.' },
    pilot_readiness: { production_started_at: '2026-10-15T11:31:00+09:00',
      scope: 'Source-window coverage only. Pilot completion follows the nine-placement, three-metric contract in growth/ONELINK_PILOT.md; whole-site CVR blockers do not change it.',
      first_complete_day: FIRST_COMPLETE_DAY,
      first_ga4_window_with_complete_pilot_day_available_on: shift(FIRST_COMPLETE_DAY, 5),
      first_ga4_seven_day_post_start_window_available_on: shift(FIRST_COMPLETE_DAY, 6 + 5),
      dates_are_earliest_collection_dates_not_verified_data: true,
      ga4: gaWindow, appsflyer: afWindow },
    alternatives: ['ga4.observed_any_app_route_click_session_rate', 'ga4.obsidian_hub_pilot',
      'appsflyer.own_site_installs', 'appsflyer.owned_link_period_rate'],
    sitewide_alternatives: ['ga4.sitewide_routes', 'appsflyer.sitewide_link_period_rate'],
    next_steps: ['Read the three agreed nine-placement pilot metrics with their original source, observation window and quality evidence.',
      'Use PV and observed browser visitors as supplementary web observations; they do not change the pilot completion criteria.',
      'For a separately approved whole-site cohort metric, agree route coverage, attribution lookback, new-install semantics and exclusions before implementation.',
      'Do not add identifiers, data access or consent changes to satisfy this diagnostic.'],
  };
}
