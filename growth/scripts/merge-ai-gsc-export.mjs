#!/usr/bin/env node
/**
 * Add the Search Console generative-AI UI export to the verified SEO Daily
 * BigQuery snapshot for the exact same window. The raw CSVs stay private.
 *
 *   node growth/scripts/merge-ai-gsc-export.mjs --ai-dir /private/unzipped/export
 *   node growth/scripts/merge-ai-gsc-export.mjs --ai-dir /private/unzipped/export --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_STATE } from '../lib/company-loop.mjs';
import { retainedDaily } from '../lib/daily-gsc-handoff.mjs';
import { GSC_DIR } from '../lib/gsc.mjs';
import { BUCKET_KINDS, buildMeta, writeSnapshot } from '../lib/snapshot.mjs';
import { parseAiGscExport } from '../lib/ai-gsc-export.mjs';
import { omitPrivateQueries } from '../lib/gsc-privacy.mjs';
import { flagReader } from '../lib/cli.mjs';

const args = process.argv.slice(2), flag = flagReader(args);
const aiDir = flag('ai-dir'), dryRun = args.includes('--dry-run');
if (!aiDir) throw new Error('--ai-dir is required');
const source = retainedDaily({ stateRoot: flag('state-root', DEFAULT_STATE) });
if (!source) throw new Error('No verified SEO Daily handoff is available');
const { receipt, snapshot } = source, label = snapshot.label, baseMeta = snapshot.meta;
const payload = JSON.parse(fs.readFileSync(receipt.output, 'utf8'));
const buckets = Object.fromEntries(BUCKET_KINDS.map(kind => [
  kind, payload.files[kind + '.json'] ? JSON.parse(payload.files[kind + '.json'].body) : [],
]));
const publicQueryOmissions = omitPrivateQueries(buckets);
const names = fs.readdirSync(aiDir).filter(name => name.endsWith('.csv')).sort();
if (names.length !== 5) throw new Error('Expected the five CSVs from one complete AI report export');
const files = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(aiDir, name), 'utf8')]));
Object.assign(buckets, parseAiGscExport(files, {
  periodStart: baseMeta.period_start, periodEnd: baseMeta.period_end,
}));
const sha256 = body => crypto.createHash('sha256').update(body).digest('hex');
const meta = buildMeta({ label, buckets, period: `${baseMeta.period_start}..${baseMeta.period_end}`,
  source: 'bigquery', sourceFiles: names.map(name => `gsc-ai-ui/${name}`),
  extra: { bigquery: baseMeta.bigquery, public_query_omissions: publicQueryOmissions, aio_export: {
    source: 'search-console-generative-ai-ui-csv',
    web_handoff_run_id: receipt.run_id,
    web_handoff_sha256: receipt.sha256,
    csv_sha256: Object.fromEntries(names.map(name => [name, sha256(files[name])])),
    property_page_impression_difference:
      buckets['pages-aio'].reduce((n, row) => n + row.impressions, 0) -
      buckets['dates-aio'].reduce((n, row) => n + row.impressions, 0),
  } },
});
if (!meta.complete_window || !meta.aio.same_web_dates || meta.aio.property_impressions == null) {
  throw new Error('WEB/AI window or impression totals did not validate');
}
const out = path.join(GSC_DIR, label);
if (fs.existsSync(out)) throw new Error(`Snapshot ${label} already exists; refusing to overwrite it`);
if (!dryRun) writeSnapshot({ label, buckets, meta });
console.log(JSON.stringify({ status: dryRun ? 'validated_only' : 'written', label,
  period: `${baseMeta.period_start}..${baseMeta.period_end}`,
  web: meta.totals, ai: meta.aio, ai_export: meta.aio_export,
  output: dryRun ? null : path.relative(process.cwd(), out) }, null, 2));
