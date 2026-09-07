#!/usr/bin/env node
// Read-only GitHub Actions audit. Never dispatches or retries a workflow.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function summarize(runs, details, attempts) {
  const workflows = [...new Set(runs.map(r => r.workflowName))].sort().map(name => {
    const rows = runs.filter(r => r.workflowName === name);
    const latest = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { name, observed: rows.length,
      failures: rows.filter(r => r.conclusion === 'failure').length,
      latest: { conclusion: latest.conclusion || 'pending', url: latest.url } };
  });
  const failures = runs.filter(r => r.conclusion === 'failure').map(r => ({
    run: r.databaseId, workflow: r.workflowName, sha: r.headSha, url: r.url,
    steps: (details[r.databaseId]?.jobs ?? []).flatMap(j =>
      (j.steps ?? []).filter(s => s.conclusion === 'failure').map(s => `${j.name}: ${s.name}`)),
    jobs: (details[r.databaseId]?.jobs ?? []).filter(j => j.conclusion === 'failure').map(j => j.name),
  }));
  // Same run, same SHA, a failed attempt followed by success is only a candidate.
  // Mutable dependencies, credentials and PR metadata can change between attempts.
  const rerunCandidates = runs.filter(r => r.conclusion === 'success' && r.attempt > 1)
    .filter(r => (attempts[r.databaseId] ?? []).some(a =>
      a.conclusion === 'failure' && a.head_sha === r.headSha && a.run_attempt < r.attempt))
    .map(r => ({ run: r.databaseId, workflow: r.workflowName, sha: r.headSha, url: r.url }));
  return { observed: runs.length,
    oldest: runs.length ? runs.map(r => r.createdAt).sort()[0] : null,
    newest: runs.length ? runs.map(r => r.createdAt).sort().at(-1) : null,
    workflows, failures, rerunCandidates,
    limitations: [
      'Bounded run sample; different workflows can cover different time windows.',
      'GitHub Actions only; Xcode Cloud test results are not included.',
      'A successful retry is a candidate, not proof of a flaky test.',
      'No test deletion or automation-score credit follows from this report.',
    ] };
}

export function collect(repo, limit = 200, gh = args => JSON.parse(execFileSync('gh', args,
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }))) {
  if (!/^simplememofast\/(simplememo|simplememo-ios|simplememo-api)$/.test(repo)) throw new Error('Unsupported repository');
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Limit must be 1..1000');
  const runs = gh(['run', 'list', '-R', repo, '--limit', String(limit), '--json',
    'databaseId,workflowName,headSha,conclusion,createdAt,event,attempt,url']);
  const details = {}, attempts = {};
  for (const r of runs) {
    if (r.conclusion === 'failure') details[r.databaseId] = gh(['run', 'view',
      String(r.databaseId), '-R', repo, '--json', 'jobs']);
    if (r.attempt > 1) {
      attempts[r.databaseId] = [];
      for (let a = 1; a < r.attempt; a++) attempts[r.databaseId].push(gh(['api',
        `repos/${repo}/actions/runs/${r.databaseId}/attempts/${a}`]));
    }
  }
  // Any failed read throws: an incomplete audit must not silently look healthy.
  return { repository: repo, collectedAt: new Date().toISOString(), limit,
    ...summarize(runs, details, attempts) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) throw new Error('Usage: node scripts/ci-health.mjs simplememofast/REPO [limit=200]');
    console.log(JSON.stringify(collect(process.argv[2], Number(process.argv[3] ?? 200)), null, 2));
  } catch (error) {
    console.error(`CI audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}
