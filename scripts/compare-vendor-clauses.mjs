#!/usr/bin/env node
import { load as loadLedger, check } from './vendor-clause-worksheet.mjs';
import { comparisonReport } from './lib/contract-comparison.mjs';

const doc = loadLedger();
const problems = check(doc);
const report = problems.length ? { problems, comparisons: [] }
  : comparisonReport(doc.obligations.contract_review);
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  for (const p of report.problems) console.error(p);
  for (const row of report.comparisons) {
    console.log(`${row.id} — ${row.agent} / ${row.observed_at}`);
    for (const [clause, finding] of Object.entries(row.findings)) {
      console.log(`\n${clause}\n条件差: ${finding.difference}\nリスク: ${finding.risk}\n対応: ${finding.action}`);
      for (const source of row.sources) {
        const f = source.findings[clause];
        console.log(`  ${source.assessment_id}: ${f.summary}`);
        console.log(`    ${source.source.url} / ${source.source.version} / 根拠節 ${f.evidence.map((e) => e.section).join(', ')}`);
      }
    }
    for (const limit of row.limitations) console.log(`\n限界: ${limit}`);
  }
}
process.exitCode = report.problems.length ? 1 : 0;
