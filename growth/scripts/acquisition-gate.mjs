#!/usr/bin/env node
// acquisition-daily.yml の門。秘密を持たないジョブで走り、出すのは真偽・日付・状態語だけ。
//   - data/emergency-stop.json の全体停止と経路 "acquisition" を見る（経路が無ければ落ちる）
//   - 窓は collectionWindow（ローカルの取り込みが照合に使うのと同じ関数）で決める
//   - 同じ終了日の成果物が既にあれば、その取得をしない（1終了日1回・遠隔の再試行なし）
// モデルを呼ばない経路なので、月次のAIトークン予算の門は通さない（止まる理由を測定に持ち込まない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectionWindow } from '../lib/company-data.mjs';
import { ACQUISITION_REPO, acquisitionStop, ga4ArtifactName, appsflyerArtifactName } from '../lib/acquisition-handoff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STOP_PATH = path.join(ROOT, 'data/emergency-stop.json');

/** An artifact from a main-branch run of this repository counts; forks and other branches do not. */
export function ownArtifacts(listing, name) {
  if (!Number.isSafeInteger(listing?.total_count) || !Array.isArray(listing.artifacts)
    || listing.total_count > 100 || listing.artifacts.length !== listing.total_count) throw new Error('artifact_listing_incomplete');
  return listing.artifacts.filter(a => a?.name === name && a.workflow_run?.head_branch === 'main'
    && Number.isSafeInteger(a.workflow_run?.repository_id) && a.workflow_run.repository_id === a.workflow_run.head_repository_id);
}

export function decide({ stop, mode, event, runId = '0', now = new Date(), ga4Exists = false, appsflyerExists = false }) {
  if (!['dry-run', 'export'].includes(mode) || (event === 'schedule' && mode !== 'export')) throw new Error('invalid_mode');
  const ga4 = collectionWindow('ga4-funnel', now), af = collectionWindow('appsflyer', now);
  const out = { run: false, mode, ga4: false, ga4_execution: mode, ga4_start: ga4.start, ga4_end: ga4.end,
    ga4_artifact: '', appsflyer: false, af_start: af.start, af_end: af.end, af_artifact: appsflyerArtifactName(af.end), notes: [] };
  if (stop.stopped) { out.notes.push(`stopped scope=${stop.scope}`); return out; }
  out.run = true;
  if (mode === 'dry-run') {
    out.ga4 = true; out.ga4_artifact = `acquisition-ga4-dryrun-${runId}`;
    out.notes.push('dry-run: GA4 validates only; AppsFlyer is not called');
    return out;
  }
  out.ga4_artifact = ga4ArtifactName(ga4.end);
  out.ga4 = !ga4Exists; if (ga4Exists) out.notes.push(`ga4 already collected end=${ga4.end}`);
  out.appsflyer = !appsflyerExists; if (appsflyerExists) out.notes.push(`appsflyer already collected end=${af.end}`);
  return out;
}

// Network, HTTP and body failures all report as artifact_listing_unavailable, never as a ledger problem.
async function listArtifacts(name, { fetchImpl = fetch, env = process.env } = {}) {
  const url = `${env.GITHUB_API_URL ?? 'https://api.github.com'}/repos/${ACQUISITION_REPO}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`;
  let listing;
  try {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28' } });
    if (!response.ok) throw new Error('not ok');
    listing = await response.json();
  } catch { throw new Error('artifact_listing_unavailable'); }
  return ownArtifacts(listing, name);
}

export async function gate({ env = process.env, now = new Date(), fetchImpl = fetch, stopDoc } = {}) {
  if (env.GITHUB_REPOSITORY !== ACQUISITION_REPO || env.GITHUB_REF !== 'refs/heads/main') throw new Error('invalid_runtime');
  const stop = acquisitionStop(stopDoc ?? JSON.parse(fs.readFileSync(STOP_PATH, 'utf8')));
  const mode = env.ACQUISITION_MODE, event = env.GITHUB_EVENT_NAME, runId = env.GITHUB_RUN_ID;
  if (!/^[1-9]\d*$/.test(runId ?? '')) throw new Error('invalid_runtime');
  const first = decide({ stop, mode, event, runId, now });
  if (!first.run || mode !== 'export') return first;
  // Read failure is not absence: fail the gate so cron-health sees it, rather than query twice.
  const ga4Exists = (await listArtifacts(first.ga4_artifact, { fetchImpl, env })).length > 0;
  const appsflyerExists = (await listArtifacts(first.af_artifact, { fetchImpl, env })).length > 0;
  return decide({ stop, mode, event, runId, now, ga4Exists, appsflyerExists });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const out = await gate();
    const lines = ['run', 'mode', 'ga4', 'ga4_execution', 'ga4_start', 'ga4_end', 'ga4_artifact',
      'appsflyer', 'af_start', 'af_end', 'af_artifact'].map(k => `${k}=${out[k]}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
    for (const note of out.notes) console.log(`::notice title=Acquisition gate::${note}`);
    console.log(`status=gate run=${out.run} mode=${out.mode} ga4=${out.ga4} appsflyer=${out.appsflyer}`);
  } catch (error) {
    const known = ['invalid_runtime', 'invalid_mode', 'artifact_listing_incomplete', 'artifact_listing_unavailable'];
    const code = error.code === 'stop_route_missing' ? error.code : known.includes(error.message) ? error.message : 'stop_ledger_or_window_unavailable';
    console.error(`::error title=Acquisition gate::${code}`);
    process.exitCode = 1;
  }
}
