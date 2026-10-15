#!/usr/bin/env node
// Runs on the token side of acquisition-daily.yml, after the token file is removed.
// Its sha256 (and that of its only local import, analytics-envelope.mjs) is written
// literally in the workflow, so changing either needs a workflow-file change.
// Keep imports to node: built-ins and that one module. Constants are copies of
// growth/lib/acquisition-handoff.mjs on purpose; a test keeps them equal.
// Output: one encrypted envelope. Logs: status words only, never counts or rows.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { recipientKey, seal } from '../lib/analytics-envelope.mjs';

export const HANDOFF_SCHEMA = 'simplememo_acquisition_appsflyer_handoff_v1';
export const RECIPIENT_SPKI_SHA256 = 'c77d213e039ca5fa0d6797e87d59d974756f2462aeca0186dbfbf3773308f992';
export const REPOSITORY = 'simplememofast/simplememo';
export const WORKFLOW = '.github/workflows/acquisition-daily.yml';
export const READER_PATH = 'growth/vendor/appsflyer_aggregate.py';
export const CREDENTIAL_ORIGIN = 'github_actions_secret';
const CSV_LIMIT = 16 * 1024 ** 2;
const META_LIMIT = 1024 ** 2;
// Artifact sizes are public in a public repository. Pad the plaintext to a fixed
// bucket so the envelope size does not track the number of report rows.
export const PAD_BUCKET = 64 * 1024;
const DAY = 86400000;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z'))
  && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

class SealError extends Error {}
const fail = code => { throw new SealError(code); };

function readBounded(file, limit) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) fail('unexpected_reader_file');
  return fs.readFileSync(file);
}

export function runtime(env = process.env) {
  if (env.GITHUB_REPOSITORY !== REPOSITORY || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_WORKFLOW_REF !== `${REPOSITORY}/${WORKFLOW}@refs/heads/main`
    || !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
    || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') || !/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) fail('invalid_runtime');
  return { repository: REPOSITORY, workflow: WORKFLOW, workflow_ref: env.GITHUB_WORKFLOW_REF, ref: env.GITHUB_REF,
    run_id: env.GITHUB_RUN_ID, run_attempt: Number(env.GITHUB_RUN_ATTEMPT), head_sha: env.GITHUB_SHA, event: env.GITHUB_EVENT_NAME };
}

export function checkedRecipient(publicPem) {
  const key = recipientKey(publicPem);
  if (sha256(key.export({ type: 'spki', format: 'der' })) !== RECIPIENT_SPKI_SHA256) fail('recipient_mismatch');
  return publicPem;
}

export function padded(payload) {
  const size = Buffer.byteLength(JSON.stringify({ ...payload, padding: '' }), 'utf8');
  return { ...payload, padding: ' '.repeat((PAD_BUCKET - (size % PAD_BUCKET)) % PAD_BUCKET) };
}

/** Packs the reader's own outputs. Nothing is recomputed or summarized here. */
export function packAppsFlyerHandoff({ metaDir, readRoot, start, end, readerExit, readerFile, env = process.env, now = new Date() }) {
  const provenance = runtime(env);
  if (!day(start) || !day(end) || start > end || Date.parse(end) - Date.parse(start) > 30 * DAY) fail('invalid_window');
  if (!/^\d{1,3}$/.test(String(readerExit ?? ''))) fail('invalid_reader_exit');
  let stdout = null;
  try {
    const value = JSON.parse(readBounded(path.join(metaDir, 'stdout.json'), META_LIMIT).toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) stdout = value;
  } catch { /* An unreadable reader line stays explicit below. */ }
  let stderrBytes = null;
  try { stderrBytes = readBounded(path.join(metaDir, 'stderr.txt'), META_LIMIT).length; } catch { /* absent */ }
  let result = null, csv = null;
  if (typeof stdout?.output === 'string') {
    const rootReal = fs.realpathSync(readRoot), dir = fs.realpathSync(stdout.output);
    if (path.dirname(dir) !== rootReal) fail('unexpected_reader_destination');
    result = JSON.parse(readBounded(path.join(dir, 'result.json'), META_LIMIT).toString('utf8'));
    if (fs.existsSync(path.join(dir, 'report.csv'))) csv = readBounded(path.join(dir, 'report.csv'), CSV_LIMIT);
  }
  const ok = stdout?.ok === true && result?.ok === true && Number(readerExit) === 0;
  if (ok && (!csv || sha256(csv) !== result.quality?.sha256 || stdout.sha256 !== result.quality.sha256
    || result.parameters?.from !== start || result.parameters?.to !== end)) fail('reader_output_inconsistent');
  return padded({
    schema: HANDOFF_SCHEMA, observed_at: now.toISOString(), window: { start, end }, provenance,
    credential_origin: CREDENTIAL_ORIGIN,
    reader: { path: READER_PATH, sha256: sha256(fs.readFileSync(readerFile)), exit_code: Number(readerExit), ok,
      stdout_state: stdout ? 'parsed' : 'unavailable', stderr_bytes: stderrBytes,
      error: typeof stdout?.error === 'string' ? stdout.error : (typeof result?.error === 'string' ? result.error : null),
      http_status: Number.isSafeInteger(stdout?.http_status) ? stdout.http_status : null },
    result, csv_base64: ok ? csv.toString('base64') : null,
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const [metaDir, readRoot, output] = process.argv.slice(2);
    if (!metaDir || !readRoot || !output) fail('configuration');
    const publicPem = checkedRecipient(Buffer.from(process.env.ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64 ?? '', 'base64').toString('utf8'));
    const payload = packAppsFlyerHandoff({ metaDir, readRoot, start: process.env.AF_START, end: process.env.AF_END,
      readerExit: process.env.READER_EXIT, readerFile: fileURLToPath(new URL('../vendor/appsflyer_aggregate.py', import.meta.url)) });
    const envelope = seal(payload, publicPem);
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
    fs.writeFileSync(output, JSON.stringify(envelope) + '\n', { flag: 'wx', mode: 0o600 });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `sealed=true\nreader_ok=${payload.reader.ok}\n`);
    console.log(`status=sealed reader_ok=${payload.reader.ok}`);
  } catch (error) {
    const code = error instanceof SealError ? error.message : 'configuration_or_validation';
    console.error(`status=seal_failed reason=${code}`);
    process.exitCode = 1;
  }
}
