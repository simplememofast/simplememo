// Private, descriptive acquisition reporting. No cross-provider user join.
import { parseDelimited } from './csv.mjs';
import { websiteInstallReadiness } from './website-install-readiness.mjs';
import { websiteVisitTotals } from './website-visit-totals.mjs';

const TOKENS = ['web_obsidian_v1', 'web_other_v1'];
// These columns describe other measures in the existing aggregate reader. Their
// absence keeps that report partial, but does not invalidate Installs / Clicks.
const OPTIONAL_PERIOD_METRICS = new Set(['Sessions', 'Loyal Users', 'Total Revenue',
  'Total Cost', 'Impressions', 'af_purchase (Event counter)']);
const validCount = n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const sum = (rows, key) => {
  if (!rows.length || rows.some(r => !validCount(r[key]))) return null;
  const n = rows.reduce((total, r) => total + r[key], 0);
  return validCount(n) ? n : null;
};
const metric = rows => ({ observed_count: sum(rows, 'counts'),
  state: rows.length ? 'observed_rows' : 'not_observed',
  population_complete: false });

export function summarizeAscAcquisition(report) {
  const a = report?.acquisition;
  const base = { report: report?.report ?? null, window: report?.date_range ?? null,
    processing_date: report?.processing_date ?? null, timezone: 'UTC',
    population_complete: false, install_cvr: null,
    limitation: 'Apple report rows may be suppressed. Missing cells are unknown, not zero. Web referrer excludes some browsers. Campaign and own-site rows can overlap; do not add them or divide by GA4 sessions.' };
  if (a?.version !== 2 || a.state !== 'ready' || !Array.isArray(a.groups))
    return { ...base, state: a?.state ?? 'unavailable' };
  const lo = report.date_range?.min, hi = report.date_range?.max;
  const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
    && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
  if (!dateOK(lo) || !dateOK(hi) || lo > hi || a.groups.some(r => !dateOK(r.date)
    || r.date < lo || r.date > hi || !validCount(r.counts) || typeof r.download_type !== 'string'
    || typeof r.source_type !== 'string')) return { ...base, state: 'invalid_rows' };
  const keys = a.groups.map(r => JSON.stringify([r.date,r.download_type,r.source_type,r.referrer_group,r.campaign_group]));
  if (new Set(keys).size !== keys.length) return { ...base, state: 'duplicate_rows' };
  const first = a.groups.filter(r => /^first[- ]time download$/i.test(r.download_type));
  const web = first.filter(r => /^web referrer$/i.test(r.source_type));
  return { ...base, state: 'observed_rows',
    all_first_time_downloads: metric(first),
    web_first_time_downloads: metric(web),
    own_site_first_time_downloads: a.source_info_available === true
      ? metric(web.filter(r => r.referrer_group === '自社サイト'))
      : { observed_count: null, state: 'source_info_unavailable', population_complete: false },
    campaign_first_time_downloads: Object.fromEntries(TOKENS.map(token => [token,
      a.campaign_column_available === true ? metric(first.filter(r => r.campaign_group === token))
        : { observed_count: null, state: 'campaign_column_unavailable', population_complete: false }])) };
}

// Weekly/monthly counts are Apple's own period observations. Select the latest
// correction for each closed period; never add revisions or overlap grains.
export function summarizeAscPeriods(bundle, granularity) {
  const base={granularity,timezone:'UTC',population_complete:false,install_cvr:null,
    observed_at:bundle?.retrieval?.fetched_at??null};
  const retrieval=bundle?.retrieval;
  if(retrieval?.granularity!==granularity || retrieval.report!=='App Downloads Detailed'
    || retrieval.state!=='fetched' || !Array.isArray(bundle.instances))
    return {...base,state:'periods_unavailable'};
  const candidates=new Map();
  for(const r of bundle.instances) {
    if(r.schema!==`asc_product_page_${granularity.toLowerCase()}_instance_v1`
      || r.app_id!=='6758438948' || r.report!=='App Downloads Detailed'
      || r.granularity!==granularity || !Array.isArray(r.periods))return {...base,state:'invalid_periods'};
    // An empty newer instance cannot be assigned to a period safely. Preserve
    // the uncertainty rather than resurfacing a prior count as current.
    if(!r.periods.length)return {...base,state:'empty_period_instance'};
    for(const period of r.periods) {
      const start=new Date(period.from+'T00:00:00Z');
      if(!Number.isFinite(+start) || start.toISOString().slice(0,10)!==period.from)return {...base,state:'invalid_periods'};
      const end=new Date(start);
      if(granularity==='WEEKLY') {
        if(start.getUTCDay()!==1)return {...base,state:'invalid_periods'};
        end.setUTCDate(end.getUTCDate()+6);
      } else {
        if(start.getUTCDate()!==1)return {...base,state:'invalid_periods'};
        end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
      }
      if(end.toISOString().slice(0,10)!==period.to || period.to>=r.processing_date)
        return {...base,state:'invalid_periods'};
      const selected=summarizeAscAcquisition({...r,date_range:{min:period.from,max:period.to},
        acquisition:r.acquisition?{...r.acquisition,groups:r.acquisition.groups?.filter(g=>g.date===period.from)}:undefined});
      const old=candidates.get(period.from);
      if(!old || old.processing_date<r.processing_date)candidates.set(period.from,selected);
      else if(old.processing_date===r.processing_date && JSON.stringify(old)!==JSON.stringify(selected))
        return {...base,state:'conflicting_period_revisions'};
    }
  }
  const periods=[...candidates.values()].sort((a,b)=>a.window.min.localeCompare(b.window.min));
  if(!periods.length)return {...base,state:'no_observed_periods'};
  return {...base,...periods.at(-1),periods,
    scope:'Latest observed closed Apple period. Earlier periods retained separately; never sum with daily or other grains.'};
}

// Called only after the existing collector verifies the CSV and its receipt.
// Keep a closed classification: no arbitrary campaign or referrer text in views.
export function summarizeAppsFlyerAcquisition(csv) {
  const [header, ...raw] = parseDelimited(csv);
  const required = ['Date', 'Agency/PMD (af_prt)', 'Media Source (pid)', 'Campaign (c)', 'Installs'];
  if (!header || required.some(k => header.filter(h => h === k).length !== 1))
    throw new Error('AppsFlyer acquisition columns unavailable');
  const groups = new Map(), seen = new Set();
  for (const line of raw) {
    if (line.length !== header.length) throw new Error('AppsFlyer acquisition row invalid');
    const r = Object.fromEntries(header.map((h,i) => [h,line[i]]));
    const key = JSON.stringify(required.slice(0,4).map(k => r[k]));
    if (seen.has(key)) throw new Error('Duplicate AppsFlyer acquisition row');
    seen.add(key);
    const source = r['Media Source (pid)'], campaign = r['Campaign (c)'];
    const category = source === 'seo_aio_qa' || campaign === 'obsidian_bridge_qa_20260907' ? 'qa'
      : source === 'owned_web' && campaign === 'obsidian_bridge_pilot_v1' ? 'owned_web_pilot'
      : source === 'owned_web' && campaign === 'website_bridge_v1' ? 'owned_web_sitewide'
      : source === 'Organic' ? 'organic_unspecified'
      : ['', 'None', 'N/A'].includes(source) ? 'unattributed' : 'other_attributed';
    if (!groups.has(category)) groups.set(category, []);
    const count = value => typeof value === 'string' && /^\d+(?:\.0+)?$/.test(value) && validCount(Number(value)) ? Number(value) : null;
    groups.get(category).push({ installs: count(r.Installs), clicks: count(r.Clicks) });
  }
  return { state: 'observed_rows', by_category: Object.fromEntries([...groups].map(([k,rows]) => [k,
    { installs: sum(rows,'installs'), clicks: sum(rows,'clicks'), rows: rows.length }])),
    own_site_installs: groups.has('owned_web_pilot') ? sum(groups.get('owned_web_pilot'),'installs') : null,
    own_site_state: groups.has('owned_web_pilot') ? 'pilot_rows_only' : 'no_attributed_site_rows',
    sitewide_link_installs: groups.has('owned_web_sitewide') ? sum(groups.get('owned_web_sitewide'),'installs') : null,
    sitewide_link_state: groups.has('owned_web_sitewide') ? 'sitewide_campaign_rows_only' : 'no_attributed_sitewide_rows',
    install_cvr: null,
    limitation: 'Organic is not website SEO. QA never counts as production acquisition. The known pilot does not cover the whole site. API receipt proves report retrieval, not current SDK collection or a verified web-to-install journey.' };
}

// A report-period ratio from one provider, never a matched visitor/install CVR.
export function ownedLinkPeriodRate(connection) {
  return campaignPeriodRate(connection, 'owned_web_pilot', 'obsidian_bridge_pilot_v1', 'the reserved pilot');
}

export function sitewideLinkPeriodRate(connection) {
  return campaignPeriodRate(connection, 'owned_web_sitewide', 'website_bridge_v1', 'the separate sitewide link campaign');
}

function campaignPeriodRate(connection, category, campaign, label) {
  const group = connection?.site_acquisition?.by_category?.[category];
  const installs = group?.installs ?? null, clicks = group?.clicks ?? null;
  const quality = connection?.quality;
  const missing = quality?.missing_metric_columns;
  const missingRequired = Array.isArray(missing) ? missing.filter(k => ['Installs','Clicks'].includes(k)) : null;
  const missingOptional = Array.isArray(missing) ? missing.filter(k => OPTIONAL_PERIOD_METRICS.has(k)) : null;
  const optionalOnly = Array.isArray(missing) && missing.every(k => OPTIONAL_PERIOD_METRICS.has(k));
  const admitted = connection?.collection?.status === 'verified' && !connection?.reason
    && (connection?.status === 'CONNECTED'
      || (connection?.status === 'PARTIAL' && optionalOnly && missing.length > 0));
  const complete = admitted && !quality?.row_cap_hit
    && Array.isArray(quality?.missing_dates) && quality.missing_dates.length === 0
    && optionalOnly;
  const countsValid = validCount(installs) && validCount(clicks);
  return { value: complete && countsValid && clicks > 0 ? installs / clicks : null,
    state: !complete ? 'incomplete_report' : !countsValid ? 'not_observed'
      : clicks === 0 ? 'no_click_denominator' : 'observed_period_ratio',
    installs: connection?.status === 'BLOCKED' ? null : installs,
    clicks: connection?.status === 'BLOCKED' ? null : clicks,
    missing_required_metric_columns: missingRequired,
    missing_optional_metric_columns: missingOptional,
    media_source: 'owned_web', campaign,
    matched_cohort: false,
    scope: `AppsFlyer report-period attributed installs / reported link clicks, limited to ${label}. Attribution delay can produce a ratio above 100%. Not all website visits, not all installations, and not a visitor-cohort CVR.` };
}

// Diagnostic only (owner decision 2026-10-14; measurement_changes 2026-09-16).
// Approximate fingerprints over existing ga4-funnel dimensions, so the SQL, the
// official rate, CTA quality gates and experiment decisions stay unchanged.
// Both groups can contain people: excluded clicks stay visible, never dropped.
const AUTOMATION_GROUPS = {
  // pagespeed-audit: Lighthouse mobile emulation loads production / and /en/.
  ci_lighthouse: r => ['/', '/en/'].includes(r.landing_path) && r.device_category === 'mobile' && r.device_language === 'en-us',
  // No-referrer desktop English Direct; mostly UA-rotating crawlers.
  bot_like: r => r.device_category === 'desktop' && /^en(?:-|$)/.test(r.device_language ?? ''),
};
export const automationGroup = r => r?.session_channel === 'Direct' && r.landing_referrer_status === 'missing'
  ? Object.keys(AUTOMATION_GROUPS).find(k => AUTOMATION_GROUPS[k](r)) ?? null : null;

function automationExcluded(production, valid, quality) {
  // sum() keeps "no rows" unknown; inside a valid report an empty group is 0.
  const total = (rows, key) => rows.length ? sum(rows, key) : 0;
  const kept = production.filter(r => !automationGroup(r));
  const sessions = total(kept,'observed_started_sessions'), clicks = total(kept,'sessions_with_own_app_click_24h');
  const anyClicks = total(kept,'sessions_with_any_app_route_click_24h');
  const ok = valid && validCount(sessions) && validCount(clicks) && clicks <= sessions;
  const anyOk = ok && validCount(anyClicks) && anyClicks <= sessions;
  const by = key => Object.fromEntries(Object.keys(AUTOMATION_GROUPS).map(k =>
    [k, ok ? total(production.filter(r => automationGroup(r) === k), key) : null]));
  return { definition_version: 'ga4-automation-excluded-diagnostic-v1', replaces_official_rate: false, quality_state: quality,
    excluded_sessions: by('observed_started_sessions'), excluded_store_click_sessions: by('sessions_with_own_app_click_24h'),
    remaining_sessions: ok ? sessions : null, sessions_with_store_click: ok ? clicks : null,
    store_click_session_rate: ok && sessions > 0 ? clicks / sessions : null,
    sessions_with_any_app_route_click: anyOk ? anyClicks : null,
    any_app_route_click_session_rate: anyOk && sessions > 0 ? anyClicks / sessions : null,
    scope: 'Diagnostic only. Same production rows as observed_store_click_session_rate minus approximate CI Lighthouse (Direct, no referrer, / or /en/, mobile, en-us) and bot-like (Direct, no referrer, desktop, en-*) fingerprints. Never replaces the official rate, the Organic CTA measurement or an experiment value.' };
}

// OneLink pilot readout (owner decision 2026-10-15; growth/ONELINK_PILOT.md 指標の定義).
// Existing ga4-funnel columns only. The official rates above stay unchanged.
const PILOT_HUBS = new Set(['/obsidian/', ...['ar','es','id','ko','pt-BR','tr','zh','zh-Hant'].map(l => `/${l}/obsidian/`)]);
const LEGACY_PILOT_SCOPE = 'Primary: production sessions landing on the nine pilot hubs with a recorded Store-link click within 24h by any app route (direct Apple + OneLink, deduplicated). Auxiliary: OneLink pilot impression sessions that clicked, all landings, QA excluded. Clicks do not prove Store arrival or installs; not per-language, and never replaces the official rate.';

const SITEWIDE_COUNTS = ['sessions_with_sitewide_onelink_impression', 'sessions_with_sitewide_onelink_click_24h',
  'sitewide_onelink_clicked_without_recorded_impression', 'sessions_with_legacy_and_sitewide_routes_24h',
  'sessions_with_expanded_app_route_click_24h'];

// Never turn an older receipt or partial schema into a zero sitewide count.
// The overlap comes from SQL's same-session union, not a cross-source estimate.
function sitewideColumns(production) {
  const present = production.some(r => SITEWIDE_COUNTS.some(k => Object.hasOwn(r, k)));
  if (!present) return { state: 'legacy_query_without_sitewide_columns', valid: false };
  const valid = production.every(r => {
    const n = r.observed_started_sessions, legacy = r.sessions_with_any_app_route_click_24h;
    const [seen, clicked, unseen, overlap, expanded] = SITEWIDE_COUNTS.map(k => r[k]);
    return [n, legacy, seen, clicked, unseen, overlap, expanded].every(validCount)
      && [legacy, seen, clicked, unseen, overlap, expanded].every(v => v <= n)
      && unseen <= clicked && clicked - unseen <= seen && overlap <= Math.min(legacy, clicked)
      && expanded === legacy + clicked - overlap;
  });
  return { state: valid ? 'observed_diagnostic' : 'invalid_or_mixed_sitewide_columns', valid };
}

function sitewideRoutes(production, valid, quality) {
  const schema = sitewideColumns(production), admitted = valid && schema.valid;
  const total = key => admitted ? sum(production, key) : null;
  const sessions = total('observed_started_sessions'), seen = total(SITEWIDE_COUNTS[0]);
  const clicked = total(SITEWIDE_COUNTS[1]), unseen = total(SITEWIDE_COUNTS[2]), expanded = total(SITEWIDE_COUNTS[4]);
  return { definition_version: 'sitewide-onelink-v1', state: valid ? schema.state : 'unavailable', quality_state: quality,
    observed_production_sessions: sessions,
    onelink_impression_sessions: seen, onelink_click_sessions: clicked,
    onelink_clicked_without_recorded_impression: unseen,
    onelink_impression_click_session_rate: seen > 0 ? (clicked - unseen) / seen : null,
    sessions_with_expanded_app_route_click: expanded,
    expanded_app_route_click_session_rate: sessions > 0 ? expanded / sessions : null,
    media_source: 'owned_web', campaign: 'website_bridge_v1',
    source_column: SITEWIDE_COUNTS[4], replaces_official_rate: false,
    scope: 'Observed production landing sessions, any channel, same session within 24h. Expanded union: direct Apple + reserved pilot + sitewide OneLink, deduplicated. Sitewide impressions/clicks exclude pilot and QA. QR scans on another device and native Smart App Banner taps are not page events. Clicks do not prove Store arrival, installation or first launch.' };
}

function obsidianHubPilot(production, valid, quality) {
  const total = (rows, key) => rows.length ? sum(rows, key) : 0;
  const hub = production.filter(r => PILOT_HUBS.has(r.landing_path));
  const schema = sitewideColumns(production);
  const legacy = schema.state === 'legacy_query_without_sitewide_columns';
  const routeColumn = legacy ? 'sessions_with_any_app_route_click_24h' : 'sessions_with_expanded_app_route_click_24h';
  const sessions = total(hub,'observed_started_sessions'), routed = total(hub,routeColumn);
  const landOk = valid && (legacy || schema.valid) && validCount(sessions) && validCount(routed) && routed <= sessions;
  const legacyRouted = total(hub, 'sessions_with_any_app_route_click_24h');
  const legacyOk = valid && validCount(sessions) && validCount(legacyRouted) && legacyRouted <= sessions;
  // Same-session observations: a click without a recorded impression is shown, not counted as exposed.
  const seen = total(production,'sessions_with_onelink_impression'), clicked = total(production,'sessions_with_onelink_click_24h');
  const unseen = total(production,'onelink_clicked_without_recorded_impression');
  const heroOk = valid && [seen, clicked, unseen].every(validCount) && unseen <= clicked && clicked - unseen <= seen;
  return { definition_version: legacy ? 'obsidian-hub-onelink-pilot-v1' : 'obsidian-hub-onelink-pilot-v2',
    primary_source_column: routeColumn, primary_source_scope: legacy ? 'legacy_direct_plus_pilot' : 'expanded_direct_plus_pilot_plus_sitewide',
    primary_schema_state: schema.state, auxiliary_definition_version: 'obsidian-pilot-hero-v1',
    legacy_primary: { hub_landing_sessions: legacyOk ? sessions : null,
      hub_landing_sessions_reaching_store: legacyOk ? legacyRouted : null,
      hub_landing_store_session_rate: legacyOk && sessions > 0 ? legacyRouted / sessions : null },
    replaces_official_rate: false, quality_state: quality,
    hub_landing_sessions: landOk ? sessions : null, hub_landing_sessions_reaching_store: landOk ? routed : null,
    hub_landing_store_session_rate: landOk && sessions > 0 ? routed / sessions : null,
    onelink_impression_sessions: heroOk ? seen : null, onelink_click_sessions: heroOk ? clicked : null,
    onelink_clicked_without_recorded_impression: heroOk ? unseen : null,
    onelink_impression_click_session_rate: heroOk && seen > 0 ? (clicked - unseen) / seen : null,
    scope: legacy ? LEGACY_PILOT_SCOPE : 'Primary: production sessions landing on the same nine pilot hubs with a recorded Store-link click within 24h by any app route, deduplicated. New receipts use the expanded direct + pilot + sitewide union; old receipts retain direct + pilot with explicit source scope. Auxiliary: unchanged OneLink pilot impression sessions that clicked, all landings, QA excluded. Clicks do not prove Store arrival or installs; not per-language, and never replaces the official rate.' };
}

export function siteAcquisition(connections = {}, cta = null) {
  const ga = connections.ga4, asc = connections.app_store_connect, af = connections.appsflyer;
  const rows = ga?.reports?.find(r => r.file === 'ga4-funnel.sql')?.result;
  const production = rows?.filter(r => r.landing_scope === 'production') ?? [];
  const sessions = sum(production,'observed_started_sessions'), clicks = sum(production,'sessions_with_own_app_click_24h');
  const anyClicks = sum(production,'sessions_with_any_app_route_click_24h');
  const anyValid = ga?.status === 'CONNECTED' && validCount(sessions) && validCount(anyClicks) && anyClicks <= sessions;
  const gaValid = ga?.status === 'CONNECTED' && validCount(sessions) && validCount(clicks) && clicks <= sessions;
  const gaState = gaValid ? (cta?.status ?? 'quality_unverified') : 'unavailable';
  const acquisition = { schema_version: 1,
    ga4: { state: gaState,
      window: ga?.window ?? null, timezone: 'Asia/Tokyo',
      observed_production_sessions: gaValid ? sessions : null,
      website_visits: websiteVisitTotals(rows, ga?.status === 'CONNECTED'),
      sessions_with_store_click: gaValid ? clicks : null,
      observed_store_click_session_rate: gaValid && sessions > 0 ? clicks / sessions : null,
      sessions_with_any_app_route_click: anyValid ? anyClicks : null,
      observed_any_app_route_click_session_rate: anyValid && sessions > 0 ? anyClicks / sessions : null,
      automation_excluded_diagnostic: automationExcluded(production, gaValid, gaState),
      obsidian_hub_pilot: obsidianHubPilot(production, ga?.status === 'CONNECTED', gaState),
      sitewide_routes: sitewideRoutes(production, ga?.status === 'CONNECTED', gaState),
      missing_landing_sessions: rows ? (rows.some(r=>r.landing_scope==='missing_landing_page')
        ? sum(rows.filter(r=>r.landing_scope==='missing_landing_page'),'observed_started_sessions') : 0) : null,
      source: ga?.evidence ?? null,
      scope: 'Observed known production landing sessions, all channels. Click within 24h of start. Diagnostic rate, not installs or a quality-cleared experiment baseline.' },
    apple: asc?.site_acquisition ?? { state: 'not_collected', reports: {} },
    appsflyer: { ...(af?.status === 'BLOCKED' ? {state:'unavailable'} : af?.site_acquisition ?? { state: 'not_collected' }), window: af?.window ?? null,
      connection_state: af?.status ?? 'unavailable', population: af?.population ?? null,
      missing_dates: af?.quality?.missing_dates ?? null,
      missing_metric_columns: af?.quality?.missing_metric_columns ?? null,
      completeness: af?.status==='CONNECTED' ? 'reported_rows_only' : 'partial_or_unavailable',
      owned_link_period_rate: ownedLinkPeriodRate(af),
      sitewide_link_period_rate: sitewideLinkPeriodRate(af),
      source: af?.evidence ?? null },
  };
  acquisition.website_install_cvr = websiteInstallReadiness(acquisition);
  return acquisition;
}

// A repeat read of identical values is quiet. New counts, periods, missing cells
// or quality states are material; receipt paths and read timestamps are not.
export function acquisitionMaterial(a) {
  const copy=structuredClone(a);
  delete copy.ga4.source; delete copy.appsflyer.source;
  for(const key of ['commit','collected_at','observed_at','artifacts'])delete copy.apple[key];
  for(const report of Object.values(copy.apple.reports??{}))delete report.observed_at;
  // Preserve the existing daily/weekly notification contract. New standalone
  // observations must not create a notification for an unchanged old receipt.
  delete copy.ga4.sitewide_routes;
  const h = copy.ga4.obsidian_hub_pilot;
  if (h) {
    if (h.legacy_primary) Object.assign(h, h.legacy_primary);
    for (const key of ['primary_source_column', 'primary_source_scope', 'primary_schema_state',
      'auxiliary_definition_version', 'legacy_primary']) delete h[key];
    h.definition_version = 'obsidian-hub-onelink-pilot-v1'; h.scope = LEGACY_PILOT_SCOPE;
  }
  for (const key of ['sitewide_link_installs', 'sitewide_link_state', 'sitewide_link_period_rate']) delete copy.appsflyer[key];
  if (copy.appsflyer.by_category) {
    const groups = new Map();
    for (const [category, values] of Object.entries(copy.appsflyer.by_category)) {
      // Before this addition, these exact source rows belonged to other_attributed.
      const key = category === 'owned_web_sitewide' ? 'other_attributed' : category;
      const prior = groups.get(key);
      groups.set(key, prior ? { installs: sum([prior, values], 'installs'),
        clicks: sum([prior, values], 'clicks'), rows: prior.rows + values.rows } : values);
    }
    copy.appsflyer.by_category = Object.fromEntries(groups);
  }
  const readiness = copy.website_install_cvr;
  if (readiness) {
    for (const key of ['observed_sitewide_link_installs', 'sitewide_state', 'sitewide_definition']) delete readiness.numerator[key];
    for (const key of ['sitewide_campaign', 'sitewide_web_observation_state', 'sitewide_campaign_observation_state',
      'outside_sitewide_web_event_coverage', 'route_coverage_complete']) delete readiness.coverage[key];
    delete readiness.sitewide_alternatives;
  }
  return copy;
}

export function acquisitionReport(a) {
  const number = n => Number.isFinite(n) ? String(n) : 'unknown';
  const rate = a.ga4?.observed_store_click_session_rate;
  const anyRate = a.ga4?.observed_any_app_route_click_session_rate;
  const linkRate = a.appsflyer?.owned_link_period_rate;
  const d = a.ga4?.automation_excluded_diagnostic, h = a.ga4?.obsidian_hub_pilot, pct = v => Number.isFinite(v) ? (v*100).toFixed(2)+'%' : 'unknown';
  const lines = ['', '## Website acquisition', '',
    `GA4 (${a.ga4?.window?.start ?? '?'}..${a.ga4?.window?.end ?? '?'} JST): ${number(a.ga4?.sessions_with_store_click)} Store-click sessions / ${number(a.ga4?.observed_production_sessions)} observed production sessions; ${Number.isFinite(rate) ? (rate*100).toFixed(2)+'%' : 'unknown'}; quality ${a.ga4?.state}.`,
    `GA4 all app routes (deduplicated): ${number(a.ga4?.sessions_with_any_app_route_click)} click sessions; ${Number.isFinite(anyRate) ? (anyRate*100).toFixed(2)+'%' : 'unknown'}. Direct Store and OneLink sessions are not added together.`,
    `GA4 diagnostic only, not the official rate (excluding CI Lighthouse ${number(d?.excluded_sessions?.ci_lighthouse)} and bot-like ${number(d?.excluded_sessions?.bot_like)} sessions): ${number(d?.sessions_with_store_click)} Store-click sessions / ${number(d?.remaining_sessions)} sessions; ${pct(d?.store_click_session_rate)}; all app routes ${pct(d?.any_app_route_click_session_rate)}. Excluded Store-click sessions: CI ${number(d?.excluded_store_click_sessions?.ci_lighthouse)}, bot-like ${number(d?.excluded_store_click_sessions?.bot_like)}. Quality ${d?.quality_state ?? 'unavailable'} still applies.`,
    `GA4 Obsidian hub OneLink pilot, beside the official rate: ${number(h?.hub_landing_sessions_reaching_store)} of ${number(h?.hub_landing_sessions)} sessions landing on the nine hubs recorded a Store-link click (any route, deduplicated); ${pct(h?.hub_landing_store_session_rate)}. OneLink hero: ${number(h?.onelink_click_sessions)} click sessions (${number(h?.onelink_clicked_without_recorded_impression)} without a recorded impression) / ${number(h?.onelink_impression_sessions)} impression sessions; ${pct(h?.onelink_impression_click_session_rate)}. Quality ${h?.quality_state ?? 'unavailable'} still applies.`,
    `Apple collection: ${a.apple?.state ?? 'not_collected'}.`];
  for (const [key,r] of Object.entries(a.apple?.reports ?? {})) {
    lines.push(`- ${key} (${r.window?.min ?? '?'}..${r.window?.max ?? '?'} UTC): own-site first downloads ${number(r.own_site_first_time_downloads?.observed_count)}; ${r.own_site_first_time_downloads?.state ?? r.state}.`);
    for (const [token,m] of Object.entries(r.campaign_first_time_downloads ?? {})) lines.push(`  ${token}: ${number(m.observed_count)} (${m.state}).`);
  }
  lines.push(`AppsFlyer (${a.appsflyer?.window?.start ?? a.appsflyer?.window?.from ?? "?"}..${a.appsflyer?.window?.end ?? a.appsflyer?.window?.to ?? "?"} JST): ${a.appsflyer?.connection_state}; ${a.appsflyer?.own_site_state ?? a.appsflyer?.state}; observed own-site pilot installs ${number(a.appsflyer?.own_site_installs)}. Missing dates: ${(a.appsflyer?.missing_dates??[]).join(', ') || 'see source quality'}. Missing metric columns: ${(a.appsflyer?.missing_metric_columns??[]).join(', ') || 'see source quality'}. Organic and QA are separate.`,
    `AppsFlyer pilot (${a.appsflyer?.window?.start ?? a.appsflyer?.window?.from ?? "?"}..${a.appsflyer?.window?.end ?? a.appsflyer?.window?.to ?? "?"} JST) report-period installs / link clicks: ${number(linkRate?.installs)} / ${number(linkRate?.clicks)}; ${Number.isFinite(linkRate?.value) ? (linkRate.value*100).toFixed(2)+'%' : 'unknown'} (${linkRate?.state ?? 'unavailable'}). This is not a matched visitor-cohort CVR.`,
    'Website visit-to-install CVR: unavailable. Missing Apple cells are not zero; do not combine report populations or divide Apple/AppsFlyer downloads by GA4 sessions.');
  const w = a.website_install_cvr;
  if (w?.definition_version === 'website-install-readiness-v1') {
    lines.push(`Website denominators: page views ${number(w.denominators.page_views.value)}; unique visitors ${number(w.denominators.unique_visitors.value)}; ${number(w.denominators.sessions.value)} observed sessions (diagnostic, quality ${w.denominators.sessions.quality_state}). Visitors are observed browser identifiers, not verified people. These units are not interchangeable.`,
      `Install coverage: ${number(w.numerator.observed_pilot_installs)} reported pilot installs across nine shared-link hero placements; whole-site new installs unknown. Other Apple links, QR and Smart App Banner are outside this attribution. No page-level install breakdown.`,
      `Optional whole-site CVR evidence gaps: ${w.blockers.join(', ')}. These do not add completion gates to the nine-placement, three-metric pilot. No supported cross-source estimate; internal use and reinstalls remain unverified. Consent/iOS coverage differs.`,
      `Periods: same calendar window ${w.period_alignment.same_calendar_window ?? 'unknown'}; no matched cohort. AppsFlyer click-attribution lookback unknown (not its 28-day report window).`,
      `Pilot source-window coverage: GA4 ${w.pilot_readiness.ga4.state}; AppsFlyer ${w.pilot_readiness.appsflyer.state}. Earliest GA4 window with a complete pilot day: ${w.pilot_readiness.first_ga4_window_with_complete_pilot_day_available_on} JST; seven post-start days: ${w.pilot_readiness.first_ga4_seven_day_post_start_window_available_on} JST. These dates do not prove collection or attribution.`);
  }
  return lines;
}

// Standalone private renderer. Existing daily/weekly report formatting and
// scheduling do not call this function; adoption needs its own reviewed scope.
export function sitewideAcquisitionReport(a) {
  const number = n => Number.isFinite(n) ? String(n) : 'unknown';
  const pct = n => Number.isFinite(n) ? (n * 100).toFixed(2) + '%' : 'unknown';
  const impressionReadout = source => {
    const count = key => validCount(source?.[key]) ? source[key] : null;
    const clicks = count('onelink_click_sessions'), seen = count('onelink_impression_sessions');
    const unseen = count('onelink_clicked_without_recorded_impression');
    const valid = [clicks, seen, unseen].every(validCount) && unseen <= clicks && clicks - unseen <= seen;
    const exposed = valid ? clicks - unseen : null, reportedRate = source?.onelink_impression_click_session_rate;
    const rate = valid && seen > 0 && Number.isFinite(reportedRate)
      && Math.abs(reportedRate - exposed / seen) < 1e-12 ? reportedRate : null;
    return `${number(exposed)} click sessions with a recorded impression / ${number(seen)} impression sessions; ${pct(rate)}. Total click sessions ${number(clicks)}; without a recorded impression ${number(unseen)}.`;
  };
  const ga = a.ga4 ?? {}, sw = ga.sitewide_routes, h = ga.obsidian_hub_pilot;
  const af = a.appsflyer ?? {}, pilot = af.owned_link_period_rate, sitewide = af.sitewide_link_period_rate;
  const w = a.website_install_cvr;
  return [
    '# Sitewide link observations (private, separate from the daily report)', '',
    `GA4 window: ${ga.window?.start ?? '?'}..${ga.window?.end ?? '?'} JST; quality ${ga.state ?? 'unavailable'}.`,
    `Web units: ${number(ga.website_visits?.page_views)} page views, ${number(ga.website_visits?.observed_visitors)} distinct observed browsers and ${number(ga.observed_production_sessions)} observed production landing sessions. These are different populations and units; browsers are not verified people.`,
    `Sitewide OneLink: ${impressionReadout(sw)} Expanded direct + pilot + sitewide union: ${number(sw?.sessions_with_expanded_app_route_click)} / ${number(sw?.observed_production_sessions)} sessions; ${pct(sw?.expanded_app_route_click_session_rate)} (${sw?.state ?? 'unavailable'}). Clicks are within 24h of session start, not Store arrivals.`,
    `Nine-hub primary: ${number(h?.hub_landing_sessions_reaching_store)} / ${number(h?.hub_landing_sessions)} sessions; ${pct(h?.hub_landing_store_session_rate)}. Source scope ${h?.primary_source_scope ?? 'unavailable'} (${h?.definition_version ?? 'unavailable'}). Unchanged pilot-only hero auxiliary: ${impressionReadout(h)}`,
    `Legacy direct-only and direct + pilot union definitions remain available. Redirecting direct links to sitewide OneLink can mechanically reduce the direct-only metric. Do not compare it with pre-sitewide experiment baselines or substitute the expanded diagnostic as a baseline.`,
    `AppsFlyer window: ${af.window?.start ?? af.window?.from ?? '?'}..${af.window?.end ?? af.window?.to ?? '?'} JST; ${af.connection_state ?? 'unavailable'}. Reserved pilot: ${number(pilot?.installs)} reported installs / ${number(pilot?.clicks)} clicks; ${pct(pilot?.value)} (${pilot?.state ?? 'unavailable'}). Separate owned_web / website_bridge_v1 campaign: ${number(sitewide?.installs)} reported installs / ${number(sitewide?.clicks)} clicks; ${pct(sitewide?.value)} (${sitewide?.state ?? 'unavailable'}). Each is a same-provider report-period ratio, not a matched visitor cohort.`,
    'Coverage: JavaScript-mediated eligible links use the sitewide campaign; original nine pilot hero links retain their pilot campaign. Native Smart App Banner taps, cross-device QR scans and JavaScript-disabled direct fallbacks are outside page-event coverage. A routed QR can yield a campaign attribution without a source-page session match. Source-declared route counts do not prove live delivery or traffic coverage.',
    'Organic stays unattributed to the site. Missing campaign rows or missing metrics stay unknown; explicit zero remains zero. AppsFlyer Installs are not verified first installs, API first-launch events, Apple first downloads or purchases. Internal-user/reinstall exclusions and attribution lookback remain unverified; consent coverage and observation windows differ.',
    `Whole-site visit-to-install CVR: unavailable; estimate unavailable; matched cohort false. Evidence gaps: ${(w?.blockers ?? ['no_common_attributable_cohort']).join(', ')}. Sitewide rollout does not resolve these gaps.`,
  ];
}
