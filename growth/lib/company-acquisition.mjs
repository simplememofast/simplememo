// Private, descriptive acquisition reporting. No cross-provider user join.
import { parseDelimited } from './csv.mjs';

const TOKENS = ['web_obsidian_v1', 'web_other_v1'];
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
    install_cvr: null,
    limitation: 'Organic is not website SEO. QA never counts as production acquisition. The known pilot does not cover the whole site. API receipt proves report retrieval, not current SDK collection or a verified web-to-install journey.' };
}

export function siteAcquisition(connections = {}, cta = null) {
  const ga = connections.ga4, asc = connections.app_store_connect, af = connections.appsflyer;
  const rows = ga?.reports?.find(r => r.file === 'ga4-funnel.sql')?.result;
  const production = rows?.filter(r => r.landing_scope === 'production') ?? [];
  const sessions = sum(production,'observed_started_sessions'), clicks = sum(production,'sessions_with_own_app_click_24h');
  const gaValid = ga?.status === 'CONNECTED' && validCount(sessions) && validCount(clicks) && clicks <= sessions;
  return { schema_version: 1,
    ga4: { state: gaValid ? (cta?.status ?? 'quality_unverified') : 'unavailable',
      window: ga?.window ?? null, timezone: 'Asia/Tokyo',
      observed_production_sessions: gaValid ? sessions : null,
      sessions_with_store_click: gaValid ? clicks : null,
      observed_store_click_session_rate: gaValid && sessions > 0 ? clicks / sessions : null,
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
      source: af?.evidence ?? null },
    website_install_cvr: { value: null, state: 'not_measurable',
      reason: 'No verified common web-to-install cohort. GA4 clicks, Apple first downloads and AppsFlyer installs have different coverage and attribution.' } };
}

// A repeat read of identical values is quiet. New counts, periods, missing cells
// or quality states are material; receipt paths and read timestamps are not.
export function acquisitionMaterial(a) {
  const copy=structuredClone(a);
  delete copy.ga4.source; delete copy.appsflyer.source;
  for(const key of ['commit','collected_at','observed_at','artifacts'])delete copy.apple[key];
  for(const report of Object.values(copy.apple.reports??{}))delete report.observed_at;
  return copy;
}

export function acquisitionReport(a) {
  const number = n => Number.isFinite(n) ? String(n) : 'unknown';
  const rate = a.ga4?.observed_store_click_session_rate;
  const lines = ['', '## Website acquisition', '',
    `GA4 (${a.ga4?.window?.start ?? '?'}..${a.ga4?.window?.end ?? '?'} JST): ${number(a.ga4?.sessions_with_store_click)} Store-click sessions / ${number(a.ga4?.observed_production_sessions)} observed production sessions; ${Number.isFinite(rate) ? (rate*100).toFixed(2)+'%' : 'unknown'}; quality ${a.ga4?.state}.`,
    `Apple collection: ${a.apple?.state ?? 'not_collected'}.`];
  for (const [key,r] of Object.entries(a.apple?.reports ?? {})) {
    lines.push(`- ${key} (${r.window?.min ?? '?'}..${r.window?.max ?? '?'} UTC): own-site first downloads ${number(r.own_site_first_time_downloads?.observed_count)}; ${r.own_site_first_time_downloads?.state ?? r.state}.`);
    for (const [token,m] of Object.entries(r.campaign_first_time_downloads ?? {})) lines.push(`  ${token}: ${number(m.observed_count)} (${m.state}).`);
  }
  lines.push(`AppsFlyer: ${a.appsflyer?.connection_state}; ${a.appsflyer?.own_site_state ?? a.appsflyer?.state}; observed own-site pilot installs ${number(a.appsflyer?.own_site_installs)}. Missing dates: ${(a.appsflyer?.missing_dates??[]).join(', ') || 'see source quality'}. Organic and QA are separate.`,
    'Website visit-to-install CVR: unavailable. Missing Apple cells are not zero; do not combine report populations or divide Apple/AppsFlyer downloads by GA4 sessions.');
  return lines;
}
