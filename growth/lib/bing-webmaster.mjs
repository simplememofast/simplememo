// Official JSON API only. No browser cookies, API keys in URLs, or write methods.
import crypto from 'node:crypto';

export const BING_SITE = 'https://simplememofast.com/';
export const BING_REPO = 'simplememofast/simplememo';
export const BING_WORKFLOW = '.github/workflows/seo-daily.yml';
export const BING_LIMIT = 8 * 1024 ** 2;
export const BING_METHODS = ['GetRankAndTrafficStats', 'GetQueryStats', 'GetPageStats'];
export const bingHash = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const DAY = 86400000;
const fail = (code, status = null) => Object.assign(new Error(code), {code, status});
export const validDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
export const offsetDay = (d, n) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0,10);
export function apiDay(value) {
  if (validDay(value)) return value;
  // WCF milliseconds represent the instant; the optional suffix is metadata.
  const match = typeof value === 'string' && value.match(/^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/);
  if (!match || !Number.isSafeInteger(Number(match[1]))) throw fail('invalid_provider_date');
  const date = new Date(Number(match[1]));
  if (!Number.isFinite(date.getTime())) throw fail('invalid_provider_date');
  return date.toISOString().slice(0,10);
}
const count = n => { if (!Number.isSafeInteger(n) || n < 0) throw fail('invalid_count'); return n; };
export const bingSourceFresh = (source, now) => source?.status==='collected' && validDay(source.rows?.at(-1)?.date) && now.getTime()-Date.parse(source.rows.at(-1).date)<=8*DAY;
const position = n => { if (n == null) return null; if (!Number.isFinite(n) || n < 0) throw fail('invalid_position'); return n; };

export function normalizeBing(method, response) {
  if (!BING_METHODS.includes(method) || !Array.isArray(response?.d) || response.d.length > 100000) throw fail('invalid_provider_schema');
  const seen = new Set();
  const rows = response.d.map(row => {
    const date = apiDay(row.Date), clicks = count(row.Clicks), impressions = count(row.Impressions);
    // A click can be repeated; do not impose an unsupported clicks <= impressions rule.
    const normalized = {date, clicks, impressions};
    if (method !== BING_METHODS[0]) {
      if (typeof row.Query !== 'string' || !row.Query.trim() || row.Query.length > 8192) throw fail('invalid_dimension');
      const field = method === 'GetPageStats' ? 'page' : 'query';
      if (field === 'page') {
        let u; try {u = new URL(row.Query);} catch {throw fail('invalid_page');}
        if (!['https:', 'http:'].includes(u.protocol) || u.hostname !== 'simplememofast.com' || u.username || u.password) throw fail('wrong_site_page');
      }
      normalized[field] = row.Query;
      // Live Bing responses use -1 even on rows with clicks. It is not a rank;
      // preserve the counts and mark only this unavailable position as null.
      normalized.avg_click_position = row.AvgClickPosition === -1 ? null : position(row.AvgClickPosition);
      normalized.avg_impression_position = position(row.AvgImpressionPosition);
    }
    const identity = JSON.stringify([date, normalized.query ?? normalized.page ?? null]);
    if (seen.has(identity)) throw fail('duplicate_provider_row');
    seen.add(identity); return normalized;
  });
  return rows.sort((a,b) => a.date.localeCompare(b.date));
}

export function summarizeBingDays(rows, {end = rows.at(-1)?.date, days = 7} = {}) {
  if (!validDay(end) || !Number.isInteger(days) || days < 1 || days > 90) return {status:'unavailable',reason:'no_valid_period'};
  const start = offsetDay(end, 1-days), expected = Array.from({length:days},(_,i)=>offsetDay(start,i));
  const selected = rows.filter(r => r.date >= start && r.date <= end);
  const observed = new Set(selected.map(r=>r.date));
  const missing = expected.filter(d=>!observed.has(d));
  if (missing.length || observed.size !== selected.length) return {status:'partial',start,end,days,missing_dates:missing,clicks:null,impressions:null,ctr:null};
  const clicks = selected.reduce((n,r)=>n+count(r.clicks),0), impressions = selected.reduce((n,r)=>n+count(r.impressions),0);
  count(clicks);count(impressions);
  return {status:'complete',start,end,days,clicks,impressions,ctr:impressions ? clicks/impressions : null};
}

async function jsonRequest(url, options, {fetchImpl, wait, attempts}) {
  for (let attempt=1; attempt<=3; attempt++) {
    let response;
    attempts.push({endpoint:new URL(url).pathname,attempt});
    try { response = await fetchImpl(url, {...options,redirect:'error',signal:AbortSignal.timeout(20000)}); }
    catch {
      attempts.at(-1).failure='transport';
      if (attempt===3) throw fail('transport');
      await wait(attempt*1000); continue;
    }
    attempts.at(-1).status=response.status;
    if (!response.ok) {
      // Never retain provider error bodies: they may echo credentials or queries.
      await response.body?.cancel();
      if ((response.status===429 || response.status>=500) && attempt<3) {await wait(attempt*1000);continue;}
      throw fail(response.status===401 || response.status===403 || (response.status===400 && new URL(url).pathname.endsWith('/oauth/token')) ? 'auth_required' : 'provider_http',response.status);
    }
    if (Number(response.headers.get('content-length')) > BING_LIMIT) {await response.body?.cancel();throw fail('response_too_large');}
    const parts=[];let size=0;
    try {
      for await (const part of response.body) {size+=part.length;if(size>BING_LIMIT)throw fail('response_too_large');parts.push(part);}
    } catch(e) {
      if(e.code==='response_too_large')throw e;
      attempts.at(-1).failure='transport';
      if(attempt===3)throw fail('transport');
      await wait(attempt*1000);continue;
    }
    try {return JSON.parse(Buffer.concat(parts).toString('utf8'));} catch {throw fail('invalid_provider_json');}
  }
}

export async function collectBingApi({credentials, fetchImpl=fetch, wait=ms=>new Promise(r=>setTimeout(r,ms)), now=new Date()}={}) {
  if (!credentials || !['client_id','client_secret','refresh_token'].every(k=>typeof credentials[k]==='string' && credentials[k].trim())) throw fail('not_configured');
  const attempts=[];
  let token;
  try {
    token = await jsonRequest('https://www.bing.com/webmasters/oauth/token', {
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:credentials.client_id,client_secret:credentials.client_secret,refresh_token:credentials.refresh_token,grant_type:'refresh_token'}).toString(),
    },{fetchImpl,wait,attempts});
    if (typeof token.access_token !== 'string' || !token.access_token || !Number.isFinite(token.expires_in) || token.expires_in<=0) throw fail('invalid_token_response');
    // Microsoft's documented refresh response does not rotate the refresh token.
    // If that changes, preserve the old secret and require a secure rotation path.
    if (token.refresh_token && token.refresh_token!==credentials.refresh_token) throw fail('refresh_rotation_required');
    const sources={};
    for (const method of BING_METHODS) {
      try {
        const url = new URL('https://www.bing.com/webmaster/api.svc/json/'+method);url.searchParams.set('siteUrl',BING_SITE);
        const raw=await jsonRequest(url.href,{method:'GET',headers:{Authorization:'Bearer '+token.access_token}},{fetchImpl,wait,attempts});
        const rows=normalizeBing(method,raw);
        if(rows.some(r=>r.date>now.toISOString().slice(0,10)))throw fail('future_provider_date');
        sources[method]={status:rows.length?'collected':'no_data',rows,raw_sha256:bingHash(raw),window:{start:rows[0]?.date??null,end:rows.at(-1)?.date??null},stale:!rows.length||now.getTime()-Date.parse(rows.at(-1).date)>8*DAY};
      } catch(e) {
        sources[method]={status:'unavailable',reason:e.code??'reader_failed',http_status:e.status??null,rows:null};
        if (e.code==='auth_required') break;
      }
    }
    const daily=sources.GetRankAndTrafficStats?.rows ?? [];
    const future=daily.some(r=>r.date>now.toISOString().slice(0,10));
    if (future) throw fail('future_provider_date');
    const end=daily.at(-1)?.date;
    const stale=!end || now.getTime()-Date.parse(end)>8*DAY;
    const complete=BING_METHODS.every(m=>bingSourceFresh(sources[m],now)) && !stale && summarizeBingDays(daily).status==='complete';
    return {schema_version:1,kind:'bing_search_api',site:BING_SITE,series:'bing-webmaster-json-v1',
      observed_at:now.toISOString(),status:complete?'collected':'partial',sources,attempts,
      summary:{latest7:summarizeBingDays(daily),previous7:end?summarizeBingDays(daily,{end:offsetDay(end,-7)}):null,last28:summarizeBingDays(daily,{days:28})},
      limitations:['API statistics keep their provider scope; UI parity is unverified.','Top query/page rows are not a census; provider Date semantics retained.','Bing AvgClickPosition -1 is unavailable (null); its cause is not inferred from click counts.','No AI Performance data in this API series.'],
      stale,scheduled_execution_verified:false};
  } catch(e) {throw Object.assign(fail(e.code??'reader_failed',e.status??null),{attempts});}
  finally {if(token)token.access_token=null;}
}

export function validateBingPayload(p, {now=new Date(),remote=null}={}) {
  if (p?.schema_version!==1 || p.kind!=='bing_search_api' || p.site!==BING_SITE || p.series!=='bing-webmaster-json-v1') throw fail('wrong_source');
  const observed=Date.parse(p.observed_at);
  if (!Number.isFinite(observed) || observed>now.getTime() || now.getTime()-observed>8*DAY) throw fail('stale_or_future_observation');
  if (!['collected','partial'].includes(p.status) || !p.sources || typeof p.sources!=='object') throw fail('invalid_payload');
  for (const [method,s] of Object.entries(p.sources)) {
    if (!BING_METHODS.includes(method)) throw fail('unexpected_method');
    if (s.status==='unavailable') {if(s.rows!==null)throw fail('invalid_failure_rows');continue;}
    if (!['collected','no_data'].includes(s.status) || !Array.isArray(s.rows)) throw fail('invalid_rows');
    const converted=s.rows.map(r=>({Date:r.date,Clicks:r.clicks,Impressions:r.impressions,Query:r.page??r.query,
      AvgClickPosition:r.avg_click_position,AvgImpressionPosition:r.avg_impression_position}));
    if (JSON.stringify(normalizeBing(method,{d:converted}))!==JSON.stringify(s.rows)) throw fail('noncanonical_rows');
    if((s.status==='collected')!==(s.rows.length>0) || !/^[a-f0-9]{64}$/.test(s.raw_sha256??''))throw fail('invalid_source_status');
    if(JSON.stringify(s.window)!==JSON.stringify({start:s.rows[0]?.date??null,end:s.rows.at(-1)?.date??null}) || s.stale!==!bingSourceFresh(s,new Date(observed)))throw fail('source_window_mismatch');
    if(s.rows.some(r=>r.date>p.observed_at.slice(0,10)))throw fail('future_provider_date');
  }
  const daily=p.sources.GetRankAndTrafficStats?.rows??[],end=daily.at(-1)?.date;
  const summary={latest7:summarizeBingDays(daily),previous7:end?summarizeBingDays(daily,{end:offsetDay(end,-7)}):null,last28:summarizeBingDays(daily,{days:28})};
  if(JSON.stringify(summary)!==JSON.stringify(p.summary))throw fail('summary_mismatch');
  const stale=!end || observed-Date.parse(end)>8*DAY;
  const complete=BING_METHODS.every(m=>bingSourceFresh(p.sources[m],new Date(observed))) && !stale && summary.latest7.status==='complete';
  if(p.stale!==stale || p.status!==(complete?'collected':'partial'))throw fail('inconsistent_payload_status');
  if (!end || now.getTime()-Date.parse(end)>8*DAY) throw fail('stale_provider_data');
  if(remote) {
    if (remote.repository?.full_name!==BING_REPO || remote.path!==BING_WORKFLOW || remote.head_branch!=='main'
      || remote.status!=='completed' || remote.bing_job_conclusion!=='success' || !['schedule','workflow_dispatch'].includes(remote.event)
      || p.provenance?.repository!==BING_REPO || p.provenance?.workflow!==BING_WORKFLOW
      || String(remote.id)!==p.provenance.run_id || remote.run_attempt!==p.provenance.run_attempt
      || remote.head_sha!==p.provenance.source_sha || remote.event!==p.provenance.event
      || !Number.isFinite(Date.parse(remote.run_started_at)) || !Number.isFinite(Date.parse(remote.updated_at))
      || observed<Date.parse(remote.run_started_at) || observed>Date.parse(remote.updated_at)) throw fail('provenance_mismatch');
  }
  return p;
}
