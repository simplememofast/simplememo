#!/usr/bin/env node
// Offline candidate materializer. It never edits its inputs or an existing tree.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileSnapshots, renderReconciliationReport } from './lib/autopilot-act-reconcile.mjs';

export function prepare(inputFile, outputDirectory) {
  const output = path.resolve(outputDirectory);
  if (fs.existsSync(output)) throw new Error('Output must not already exist');
  const payload = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const plan = reconcileSnapshots(payload); // Validate everything before writing anything.
  const parent = path.dirname(output);
  fs.mkdirSync(parent, { recursive: true });
  const staging = fs.mkdtempSync(path.join(parent, '.act-reconcile-'));
  try {
    for (const [relative, contents] of Object.entries(plan.files)) {
      const file = path.join(staging, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(staging, 'reconciliation.json'), JSON.stringify(plan.receipt, null, 2) + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'RECONCILIATION.md'), renderReconciliationReport(plan.receipt), { flag: 'wx' });
    // Reserve the destination exclusively. A concurrent preparer cannot replace
    // a completed candidate or leave a partially written candidate behind.
    fs.mkdirSync(output);
    try { fs.renameSync(staging, output); }
    catch (e) { fs.rmdirSync(output); throw e; }
    return plan.receipt;
  } finally { if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) { console.error('Usage: node scripts/autopilot-act-reconcile.mjs INPUT.json NEW_OUTPUT_DIRECTORY'); process.exitCode = 2; }
  else try { const receipt = prepare(process.argv[2], process.argv[3]); console.log(JSON.stringify({ status: receipt.status, refs: receipt.refs })); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
