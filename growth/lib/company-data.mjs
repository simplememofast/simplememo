// Reuse the reviewed readers. This module owns scheduling receipts, not new APIs.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateOptions } from '../scripts/export-analytics.mjs';
import { unseal } from './analytics-envelope.mjs';
import { ROOT } from './company-metrics.mjs';
import { privateState, atomicJson, boundedRead, acquireLock } from './company-loop.mjs';
import { nativeOrigin } from './company-origin.mjs';
import { appsflyerConsumerEvidence } from './company-native-evidence.mjs';
import { appleAdsConnection } from './company-connection-evidence.mjs';
import { collectDailyGsc } from './company-daily-gsc.mjs';
import { retainedDaily } from './daily-gsc-handoff.mjs';
import { retainCtaMeasurement, companyCtaMeasurement } from './company-cta-measurement.mjs';
import { collectBingHandoff } from './company-bing.mjs';
import { collectNativeResources } from './company-resource-usage.mjs';
import { summarizeAscAcquisition, summarizeAscPeriods, summarizeAppsFlyerAcquisition, siteAcquisition } from './company-acquisition.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const DAY = 86400000;
const command = (name, args, options = {}) => execFileSync(name, args, {
  encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});

export function sourceDay(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
const offset = (day, delta) => new Date(Date.parse(day + 'T00:00:00Z') + delta * DAY).toISOString().slice(0, 10);

export function collectionWindow(source, now = new Date()) {
  const ga = source === 'ga4-funnel', gsc = source === 'gsc';
  if (!ga && !gsc && source !== 'appsflyer') throw new Error('Unsupported fixed source');
  const end = offset(sourceDay(now, gsc ? 'America/Los_Angeles' : 'Asia/Tokyo'), ga ? -5 : gsc ? -3 : -1);
  const start = [offset(end, ga ? -6 : -27), ga ? '2026-09-06' : gsc ? '2026-08-10' : '2020-01-01'].sort().at(-1);
  if (ga || gsc) validateOptions({ report: source, execution: 'export', start, end }, now);
  return { start, end };
}

export function verifyAppsFlyer(directory) {
  const result = read(path.join(directory, 'result.json'));
  const bytes = fs.readFileSync(path.join(directory, 'report.csv'));
  if (!result.ok || result.http_status !== 200 || result.quality?.sha256 !== hash(bytes) || result.quality.row_cap_hit) throw new Error('AppsFlyer output verification failed');
  return result;
}

export async function collectAppsFlyer({ stateRoot, now = new Date(), apiRepo = path.join(os.homedir(), 'simplememo-api'), run = command } = {}) {
  const data = privateState(path.join(stateRoot, 'data'));
  const window = collectionWindow('appsflyer', now);
  const receipts = privateState(path.join(data, 'collection-receipts'));
  const file = path.join(receipts, 'appsflyer-' + window.end + '.json');
  const prior = fs.existsSync(file) ? read(file) : null;
  if (prior?.status === 'verified') {
    verifyAppsFlyer(prior.output);
    return { ...prior, reused: true };
  }
  if (prior && (prior.attempts >= 3 || prior.failure === 'permission_or_credential')) return prior;
  const sha = run('git', ['rev-parse', 'origin/main'], { cwd: apiRepo }).trim();
  const source = run('git', ['show', sha + ':scripts/appsflyer_aggregate.py'], { cwd: apiRepo });
  const cache = privateState(path.join(data, 'reader-cache'));
  const reader = path.join(cache, 'appsflyer-' + hash(source) + '.py');
  if (!fs.existsSync(reader)) fs.writeFileSync(reader, source, { flag: 'wx', mode: 0o600 });
  const outputRoot = privateState(path.join(data, 'appsflyer'));
  let attempts = prior?.attempts ?? 0;
  // The original reader prints only allowlisted metadata on either exit path.
  const result = await boundedRead(async () => {
    attempts++;
    atomicJson(file, { schema_version: 1, source: 'appsflyer', window, attempts,
      status: 'reading', started_at: now.toISOString(), note: 'Reserved attempt before network read; crash cannot reset daily retry budget' });
    let stdout;
    try { stdout = run('python3', [reader, '--from', window.start, '--to', window.end, '--output-root', outputRoot]); }
    catch (e) { stdout = e.stdout?.toString(); if (!stdout) throw e; }
    const meta = JSON.parse(stdout);
    if (!meta.ok) { const e = new Error('Existing aggregate reader failed'); e.status = meta.http_status; throw e; }
    const resolved = fs.realpathSync(meta.output);
    if (!resolved.startsWith(outputRoot + path.sep)) throw new Error('Unexpected reader destination');
    const verified = verifyAppsFlyer(resolved);
    if (verified.parameters.from !== window.start || verified.parameters.to !== window.end) throw new Error('Wrong aggregate window');
    return { output: resolved, sha256: verified.quality.sha256 };
  }, { attempts: 3 - attempts });
  const receipt = { schema_version: 1, source: 'appsflyer', window, reader_commit: sha,
    reader_path: 'simplememo-api/scripts/appsflyer_aggregate.py', reader_sha256: hash(source),
    observed_at: now.toISOString(), attempts, retry_events: result.events,
    status: result.failure ? 'failed' : 'verified', failure: result.failure ?? null, ...result.value,
    human_touches: [], manual_start_removed: 'Date selection, invocation, CSV integrity check and aggregate report handoff',
    cost_usd: null, cost_note: 'Existing subscription/API allowance; no observed per-request charge' };
  atomicJson(file, receipt);
  return receipt;
}

export function collectAsc({ stateRoot, iosRepo = path.join(os.homedir(), 'simplememo-ios'), now = new Date(), run = command } = {}) {
  const dir = privateState(path.join(stateRoot, 'data/asc'));
  try { run('git',['fetch','origin','main'],{cwd:iosRepo}); }
  catch {
    const failure={source:'app_store_connect',collected_at:now.toISOString(),status:'stale',reason:'remote_ref_refresh_failed',previous_outputs_retained:true};
    atomicJson(path.join(dir,'receipt.json'),failure);return failure;
  }
  const sha = run('git', ['rev-parse', 'origin/main'], { cwd: iosRepo }).trim();
  const files = ['data/asc/status.json', 'data/appstore/asc-metrics.json', 'data/revenue/periods/latest.json',
    'data/revenue/period-retrieval.json', 'data/asc-release-health/app-crashes.json'];
  const artifacts = files.map(file => {
    const raw = run('git', ['show', sha + ':' + file], { cwd: iosRepo });
    const value = JSON.parse(raw);
    atomicJson(path.join(dir, path.basename(file)), value);
    return { path: file, sha256: hash(raw), observed_at: value.fetched_at ?? value.generated_at ?? null };
  });
  // Reuse the original Apple producer's actual acquisition rows, not just its
  // success/status flag. Optional reports never prevent revenue/crash ingestion.
  const status = read(path.join(dir, 'status.json'));
  const acquisition = { schema_version: 1, commit: sha, observed_at: status.fetched_at ?? null,
    collected_at: now.toISOString(), state: 'observed_reports', reports: {}, artifacts: [], failures: [] };
  for (const slug of ['app-downloads-standard', 'app-downloads-detailed']) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(status.date ?? '')) {
      acquisition.failures.push({ report: slug, reason: 'invalid_report_date' }); continue;
    }
    const file = `data/asc/${status.date}/${slug}.json`;
    try {
      const raw = run('git', ['show', sha + ':' + file], { cwd: iosRepo });
      const value = JSON.parse(raw);
      const expected = slug === 'app-downloads-standard' ? 'App Downloads Standard' : 'App Downloads Detailed';
      if (value.report !== expected) throw new Error('Wrong acquisition report');
      const destination = `acquisition-${slug}.json`;
      atomicJson(path.join(dir, destination), value);
      const summary = summarizeAscAcquisition(value);
      acquisition.reports[slug] = summary;
      acquisition.artifacts.push({ path: file, local_file: destination,
        sha256: hash(fs.readFileSync(path.join(dir, destination))), source_sha256: hash(raw) });
      if (summary.state !== 'observed_rows') acquisition.failures.push({ report: slug, reason: summary.state });
    } catch { acquisition.failures.push({ report: slug, reason: 'report_unavailable_or_invalid' }); }
  }
  for(const granularity of ['WEEKLY','MONTHLY']) {
    const key=`app-downloads-detailed-${granularity.toLowerCase()}`;
    const prefix='data/aso/product-pages/app-downloads-detailed'+(granularity==='MONTHLY'?'/monthly':'');
    try {
      const retrieval=JSON.parse(run('git',['show',`${sha}:${prefix}/retrieval.json`],{cwd:iosRepo}));
      const ids=retrieval.instance_ids;
      if(!Array.isArray(ids) || ids.length>32 || new Set(ids).size!==ids.length
        || ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))
        || retrieval.instance_count!==ids.length)throw new Error('Period manifest unavailable');
      const instances=ids.map(id=>{
        const value=JSON.parse(run('git',['show',`${sha}:${prefix}/instances/${id}.json`],{cwd:iosRepo}));
        if(value.instance_id!==id)throw new Error('Period instance mismatch');
        return value;
      });
      const destination=`acquisition-${key}.json`;
      const bundle={retrieval,instances};
      atomicJson(path.join(dir,destination),bundle);
      const summary=summarizeAscPeriods(bundle,granularity);
      acquisition.reports[key]=summary;
      acquisition.artifacts.push({path:prefix,local_file:destination,sha256:hash(fs.readFileSync(path.join(dir,destination)))});
      if(summary.state!=='observed_rows')acquisition.failures.push({report:key,reason:summary.state});
    }catch {acquisition.failures.push({report:key,reason:'period_manifest_unavailable_or_invalid'});}
  }
  if (acquisition.failures.length) acquisition.state = 'partial';
  atomicJson(path.join(dir, 'site-acquisition.json'), acquisition);
  artifacts.push({path:'site-acquisition.json',sha256:hash(fs.readFileSync(path.join(dir,'site-acquisition.json'))),observed_at:acquisition.observed_at});
  const receipt = { source: 'app_store_connect', collected_at: now.toISOString(), commit: sha, artifacts,
    status: 'reused_existing_outputs', note: 'Provider absence and report maturity retain their original state; no new ASC fetch.' };
  atomicJson(path.join(dir, 'receipt.json'), receipt);
  return receipt;
}

// Dispatch is recorded BEFORE the side effect. An uncertain result is looked up
// by the same UUID, never blindly dispatched again. A later tick resumes it.
export function collectAnalytics({ stateRoot, report = 'ga4-funnel', now = new Date(), run = command } = {}) {
  if (!['ga4-funnel', 'gsc'].includes(report)) throw new Error('Only approved fixed reports');
  let window = collectionWindow(report, now);
  const receipts = privateState(path.join(stateRoot, 'data/collection-receipts'));
  const pending=fs.readdirSync(receipts).filter(f=>f.startsWith(report+'-')&&f.endsWith('.json')).map(f=>({file:path.join(receipts,f),value:read(path.join(receipts,f))}))
    .filter(r=>['dispatched','dispatch_uncertain'].includes(r.value.status)).sort((a,b)=>a.value.window.end.localeCompare(b.value.window.end))[0];
  const file = pending?.file ?? path.join(receipts, report + '-' + window.end + '.json');
  if(pending) {window=pending.value.window;validateOptions({report,execution:'export',start:window.start,end:window.end},now);}
  let receipt = fs.existsSync(file) ? read(file) : null;
  if (receipt?.status === 'verified') {
    const bytes = fs.readFileSync(receipt.output);
    if (hash(bytes) !== receipt.sha256) throw new Error('Analytics artifact changed');
    return { ...receipt, reused: true };
  }
  if (receipt?.status === 'failed') return receipt;
  const keys = path.join(os.homedir(), '.local/share/simplememo-analytics/keys');
  const args = ['--repo', 'simplememofast/simplememo'];
  if (!receipt) {
    const publicKey = fs.readFileSync(path.join(keys, 'recipient-public.pem'));
    receipt = { schema_version: 1, source: report, window, request_tag: crypto.randomUUID(),
      requested_at: now.toISOString(), status: 'dispatch_uncertain',
      cap_bytes: 2 * 1024 ** 3, model_cost_usd: null };
    atomicJson(file, receipt);
    const inputs = { report, execution: 'export', start_date: window.start, end_date: window.end,
      recipient_public_key_base64: publicKey.toString('base64'), request_tag: receipt.request_tag };
    run('gh', ['workflow', 'run', 'analytics-read.yml', '--ref', 'main', ...args, '--json'], { input: JSON.stringify(inputs), cwd: ROOT });
    receipt.status = 'dispatched'; atomicJson(file, receipt);
    return receipt;
  }
  const runs = JSON.parse(run('gh', ['run', 'list', '--workflow', 'analytics-read.yml', ...args, '--limit', '100',
    '--json', 'databaseId,displayTitle,status,conclusion,headSha'], { cwd: ROOT }));
  const matches = runs.filter(r => r.displayTitle === 'Analytics API ' + receipt.request_tag);
  if (matches.length !== 1) return { ...receipt, lookup_state: matches.length ? 'duplicate_request_requires_diagnosis' : 'not_visible_yet' };
  const remote = matches[0];
  receipt.run_id = remote.databaseId;
  if (remote.status !== 'completed') { atomicJson(file, receipt); return receipt; }
  const dir = privateState(path.join(stateRoot, 'data/analytics-' + remote.databaseId));
  const envelope = path.join(dir, 'analytics.enc.json');
  try {
    if (!fs.existsSync(envelope)) run('gh', ['run', 'download', String(remote.databaseId), ...args, '--name', 'analytics-' + remote.databaseId, '--dir', dir], { cwd: ROOT });
    const payload = unseal(read(envelope), fs.readFileSync(path.join(keys, 'recipient-private.pem'), 'utf8'));
    if (payload.report !== report || payload.start !== window.start || payload.end !== window.end || String(payload.run_id) !== String(remote.databaseId) || payload.source_sha !== remote.headSha) throw new Error('Analytics provenance mismatch');
    if (payload.status !== 'complete' || !Number.isFinite(payload.total_bytes_billed) || payload.total_bytes_billed > receipt.cap_bytes) {
      receipt.status = 'failed'; receipt.failure = payload.status; receipt.total_bytes_billed = payload.total_bytes_billed ?? null;
    } else {
      const output = path.join(dir, 'report.json'); atomicJson(output, payload);
      receipt = { ...receipt, status: 'verified', output, sha256: hash(fs.readFileSync(output)),
        verified_at: now.toISOString(), source_commit: remote.headSha, total_bytes_billed: payload.total_bytes_billed,
        cost_usd: null, cost_note: 'Actual billed bytes recorded; account pricing/free tier unavailable' };
    }
  } catch {
    // Keep transient downloads resumable. A failed remote job needs diagnosis;
    // never loop the paid query or weaken its validation gate automatically.
    if (remote.conclusion !== 'success') { receipt.status = 'failed'; receipt.failure = 'remote_query_or_preparation_failed'; }
    else receipt.download_state = 'retry_on_next_tick';
  }
  atomicJson(file, receipt);
  return receipt;
}

export function connectionView({ stateRoot, now = new Date(), readThread } = {}) {
  const data = path.join(stateRoot, 'data');
  const values = fs.readdirSync(path.join(data, 'collection-receipts')).filter(n => n.endsWith('.json')).map(n => read(path.join(data, 'collection-receipts', n)));
  const newest = source => values.filter(v => v.source === source).sort((a, b) => b.window.end.localeCompare(a.window.end))[0];
  const connection = source => {
    const r = newest(source);
    return { status: r?.status === 'verified' ? 'CONNECTED' : r?.status === 'failed' ? 'BLOCKED' : 'PARTIAL',
      collection: r ?? null, evidence: r?.output ?? null, window: r?.window ?? null,
      scheduled_consumer_verified: false, note: 'Reader execution and native scheduled origin have separate proofs' };
  };
  const af = connection('appsflyer');
  const integration=path.join(stateRoot,'scheduler-integration.json');
  af.consumer_integrated=fs.existsSync(integration)&&read(integration).integration_present===true;
  af.scheduled_consumer_evidence=appsflyerConsumerEvidence({stateRoot,now,readThread});
  af.scheduled_consumer_verified=af.scheduled_consumer_evidence.state==='verified';
  if (af.evidence) {
    try {
      const result = verifyAppsFlyer(af.evidence); af.quality = result.quality; af.population = result.population;
      af.site_acquisition = summarizeAppsFlyerAcquisition(fs.readFileSync(path.join(af.evidence,'report.csv'),'utf8'));
      if (result.quality.missing_dates.length || result.quality.missing_metric_columns.length) af.status = 'PARTIAL';
    } catch {af.status='BLOCKED';af.reason='retained_aggregate_integrity_failed';}
  }
  const ga = connection('ga4-funnel');
  if (ga.evidence) {try {
    const bytes=fs.readFileSync(ga.evidence);
    if(hash(bytes)!==ga.collection.sha256)throw new Error('GA4 report integrity failed');
    const p=JSON.parse(bytes); ga.reports=p.queries.map(q=>({file:q.file,result:q.result.rows})); ga.interpretation=p.interpretation;
  }catch{ga.status='BLOCKED';ga.reason='retained_report_unavailable_or_invalid';}}
  const optional = file => { try { return read(path.join(data, file)); } catch { return null; } };
  const ascStatus = optional('asc/status.json');
  const ascReceipt = optional('asc/receipt.json');
  let siteAcquisition = { state: 'not_collected', reports: {} };
  try {
    const file=path.join(data,'asc/site-acquisition.json'), bytes=fs.readFileSync(file), value=JSON.parse(bytes);
    const artifact=ascReceipt?.artifacts?.find(a=>a.path==='site-acquisition.json');
    if(ascReceipt.status!=='reused_existing_outputs' || value.commit!==ascReceipt.commit
      || hash(bytes)!==artifact?.sha256)throw new Error('Acquisition receipt mismatch');
    for(const a of value.artifacts) {
      if(!['acquisition-app-downloads-standard.json','acquisition-app-downloads-detailed.json','acquisition-app-downloads-detailed-weekly.json','acquisition-app-downloads-detailed-monthly.json'].includes(a.local_file)
        || hash(fs.readFileSync(path.join(data,'asc',a.local_file)))!==a.sha256)throw new Error('Acquisition source mismatch');
    }
    siteAcquisition=value;
  } catch {if(ascReceipt?.artifacts?.some(a=>a.path==='site-acquisition.json') || ascReceipt?.status==='stale')
    siteAcquisition={state:'unavailable',reason:'acquisition_receipt_unavailable_or_invalid',reports:{}};}
  const revenue = optional('asc/latest.json');
  const preflight = fs.readdirSync(data).filter(n => /^preflight-\d+\.json$/.test(n)).sort().at(-1);
  const bq = preflight ? read(path.join(data, preflight)) : null;
  const gsc = connection('gsc');
  try {
    const daily = retainedDaily({stateRoot, now});
    if (daily && (!gsc.window || daily.receipt.window.end >= gsc.window.end)) {
      gsc.status = 'CONNECTED'; gsc.collection = daily.receipt; gsc.evidence = daily.receipt.output;
      gsc.window = daily.receipt.window;
      gsc.note = 'Verified existing SEO Daily output; native Company scheduled-origin proof remains separate';
    }
  } catch {gsc.daily_handoff = 'unavailable_or_not_admitted';}
  return { schema_version: 1, updated_at: now.toISOString(),
    bigquery: { status: bq?.status === 'complete' ? 'CONNECTED' : 'PARTIAL', evidence: preflight ? path.join(data, preflight) : null,
      project: 'yurika-simplememo', scope: 'Existing aggregate data authority; registry/run state remains in its canonical local/Git stores' },
    search_console: gsc, ga4: ga, appsflyer: af,
    app_store_connect: { status: ascStatus?.state === 'complete' && ascReceipt?.status !== 'stale' ? 'CONNECTED' : 'PARTIAL', observed_at: ascStatus?.fetched_at ?? null,
      collection_state:ascReceipt?.status??'unknown',
      evidence: path.join(data, 'asc/receipt.json'), report_status: ascStatus, revenue,
      site_acquisition: siteAcquisition,
      crash_performance: optional('asc/app-crashes.json'), note: 'Missing ASC reports remain missing; App Store proceeds and AppsFlyer LTV are different series' },
    apple_search_ads: appleAdsConnection(optional('apple-ads-configuration.json'), now) };
}

export async function collectData({ stateRoot, now = new Date(), analytics = false, operations, makeConnections=connectionView } = {}) {
  const release = acquireLock(stateRoot, 'data-collection.lock');
  if (!release) return { status: 'busy' };
  try {
    privateState(path.join(stateRoot, 'data/collection-receipts'));
    const receipts = [], failures = [];
    // Source failures never prevent the other independent readers from running.
    for (const [source, operation] of operations ?? [
      ['native_resource_usage', () => collectNativeResources({ stateRoot, now })],
      ['gsc_daily_handoff', () => collectDailyGsc({ stateRoot, now })],
      ['bing_search_api', () => collectBingHandoff({ stateRoot, now })],
      ['appsflyer', () => collectAppsFlyer({ stateRoot, now })],
      ['asc', () => collectAsc({ stateRoot, now })],
      ...(analytics ? [['ga4-funnel', () => collectAnalytics({ stateRoot, now })]] : []),
    ]) {
      try { receipts.push({ source, receipt: await operation() }); }
      catch { failures.push({ source, reason: 'reader_unavailable_or_validation_failed', action: 'inspect private reader receipt; do not broaden credentials' }); }
    }
    let connections;
    try {connections = makeConnections({ stateRoot, now });}
    catch {failures.push({source:'connection_view',reason:'view_unavailable; independent reader receipts retained'});connections={status:'PARTIAL',updated_at:now.toISOString(),view_failure:true};}
    atomicJson(path.join(stateRoot, 'data/connections.json'), connections);
    let ctaMeasurement = null;
    {
      try {
        ctaMeasurement = retainCtaMeasurement({ stateRoot, now, connection: connections.ga4 ?? null });
        if (ctaMeasurement.status === 'unavailable') failures.push({ source: 'cta_measurement', reason: ctaMeasurement.failures[0] });
      } catch { failures.push({ source: 'cta_measurement', reason: 'private_retention_failed' }); }
    }
    const receipt = { schema_version: 1, observed_at: now.toISOString(), native_origin:nativeOrigin(), receipts, failures,
      measurements: { cta: ctaMeasurement },
      status: failures.length || receipts.some(r => ['failed', 'stale', 'unavailable', 'dispatched', 'dispatch_uncertain'].includes(r.receipt.status)) ? 'partial' : 'verified',
      query_policy: 'GSC reuses existing daily/weekly collector. GA4 is opt-in for the single native owner, max one fixed query run per mature end-date, no remote retry.' };
    atomicJson(path.join(stateRoot, 'data/latest-collection.json'), receipt);
    const events=privateState(path.join(stateRoot,'data/collection-events'));
    atomicJson(path.join(events,crypto.randomUUID()+'.json'),receipt);
    return receipt;
  } finally { release(); }
}

// Display uses current retained bytes/receipts, not a cached connections view.
// No provider request, workflow dispatch or observation refresh happens here.
export function currentSiteAcquisition({stateRoot,now=new Date(),readThread}={}) {
  try {
    const connections=connectionView({stateRoot,now,readThread});
    const cta=companyCtaMeasurement({stateRoot,now,connection:connections.ga4});
    return siteAcquisition(connections,cta);
  } catch {
    const unavailable=siteAcquisition();
    unavailable.state='retained_sources_unavailable_or_invalid';
    return unavailable;
  }
}
