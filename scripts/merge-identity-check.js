'use strict';

// Keep this allowlist public: it names approved product and automation
// identities, not any private identity that a commit might disclose.
const assert = require('node:assert/strict');

function approvedPrincipal(principal) {
  const name = String(principal?.name || '').trim();
  const email = String(principal?.email || '').trim().toLowerCase();
  if (!name || !email) return false;

  // Pair exact public names with exact addresses. A brand prefix or a company
  // domain alone could conceal an unapproved personal name or mailbox.
  const known = new Map([
    ['SimpleMemo Developer', ['simplememo.com@gmail.com', 'support@simplememofast.com']],
    ['SimpleMemo Routine Observer', ['observer@simplememofast.com']],
    ['SimpleMemo Decision Monitor', ['automation@simplememofast.com']],
    ['Simple Memo - for Obsidian', ['simplememo.com@gmail.com']],
    ['GitHub', ['noreply@github.com']],
    ['Claude', ['noreply@anthropic.com']],
    ['Claude Opus 5', ['noreply@anthropic.com']],
    ['Claude Opus 5.5', ['noreply@anthropic.com']],
    ['Codex', ['noreply@openai.com']],
    // The daily run's commits (claude-code-action): GitHub's public bot identity,
    // bound to the github-actions[bot] account id. Owner-approved 2026-10-14; before
    // this, every unattended artifact PR was refused here after a green validation.
    ['claude[bot]', ['41898282+claude[bot]@users.noreply.github.com']],
  ]);
  if (known.get(name)?.includes(email)) return true;

  // GitHub's noreply address includes a numeric account ID and public login.
  // Both parts are constrained; an arbitrary noreply local part is rejected.
  if (name === 'SimpleMemo Developer' || name === 'simplememofast') {
    return /^\d+\+simplememofast@users\.noreply\.github\.com$/.test(email);
  }
  if (name === 'github-actions' || name === 'github-actions[bot]') {
    return /^\d+\+github-actions(?:\[bot\])?@users\.noreply\.github\.com$/.test(email);
  }
  return false;
}

function approvedMergeOwner(login, profile) {
  return login === 'simplememofast' &&
    profile?.login === login &&
    profile?.name === 'SimpleMemo Developer' &&
    String(profile?.email || '').toLowerCase() === 'simplememo.com@gmail.com';
}

function completeCommitList(reportedCount, commits) {
  return Number.isInteger(reportedCount) &&
    reportedCount > 0 && reportedCount <= 250 &&
    Array.isArray(commits) && commits.length === reportedCount;
}

function findUnapprovedPrincipals(commits) {
  if (!Array.isArray(commits) || commits.length === 0) {
    return [{ sha: 'unknown', field: 'commit-list' }];
  }
  const problems = [];
  for (const entry of commits) {
    const sha = String(entry?.sha || 'unknown').slice(0, 12);
    const commit = entry?.commit;
    if (!commit) {
      problems.push({ sha, field: 'commit' });
      continue;
    }
    for (const field of ['author', 'committer']) {
      if (!approvedPrincipal(commit[field])) problems.push({ sha, field });
    }
    for (const line of String(commit.message || '').split(/\r?\n/)) {
      if (!/^\s*Co-authored-by:/i.test(line)) continue;
      const match = /^\s*Co-authored-by:\s*(.+?)\s*<([^<>]+)>\s*$/i.exec(line);
      if (!match || !approvedPrincipal({ name: match[1], email: match[2] })) {
        problems.push({ sha, field: 'co-author' });
      }
    }
  }
  return problems;
}

function selftest() {
  const good = {
    sha: 'a'.repeat(40),
    commit: {
      author: { name: 'SimpleMemo Developer', email: 'simplememo.com@gmail.com' },
      committer: { name: 'GitHub', email: 'noreply@github.com' },
      message: 'A useful change\n\nCo-authored-by: Claude Opus 5 <noreply@anthropic.com>',
    },
  };
  assert.deepEqual(findUnapprovedPrincipals([good]), []);
  assert.equal(approvedPrincipal({ name: 'SimpleMemo Routine Observer', email: 'observer@simplememofast.com' }), true);
  assert.equal(approvedPrincipal({ name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }), true);
  assert.equal(approvedPrincipal({ name: 'Claude', email: 'noreply@anthropic.com' }), true);
  assert.equal(approvedPrincipal({ name: 'SimpleMemo Developer', email: 'person@example.invalid' }), false);
  assert.equal(approvedPrincipal({ name: 'Private Person', email: 'simplememo.com@gmail.com' }), false);
  assert.equal(approvedPrincipal({ name: 'SimpleMemo Developer (Private Person)', email: 'simplememo.com@gmail.com' }), false);
  assert.equal(approvedPrincipal({ name: 'SimpleMemo Developer', email: 'person@simplememofast.com' }), false);
  assert.equal(approvedPrincipal({ name: 'SimpleMemo Developer', email: 'person@users.noreply.github.com' }), false);
  assert.equal(approvedPrincipal({ name: 'Claude Private Person', email: 'noreply@anthropic.com' }), false);
  // The daily run's exact identity (PR #1993's commits) and nothing near it.
  const dailyRun = { name: 'claude[bot]', email: '41898282+claude[bot]@users.noreply.github.com' };
  assert.equal(approvedPrincipal(dailyRun), true);
  assert.deepEqual(findUnapprovedPrincipals([{ ...good, commit: { ...good.commit, author: dailyRun, committer: dailyRun, message: 'work' } }]), []);
  for (const near of [{ name: 'claude[bot]', email: '1+claude[bot]@users.noreply.github.com' },
    { name: 'claude[bot]', email: '41898282+person@users.noreply.github.com' },
    { name: 'claude[bot]', email: 'person@example.invalid' },
    { name: 'Claude[bot]', email: '41898282+claude[bot]@users.noreply.github.com' },
    { name: 'claude[bot] Private Person', email: '41898282+claude[bot]@users.noreply.github.com' },
    { name: 'Private Person', email: '41898282+claude[bot]@users.noreply.github.com' }]) {
    assert.equal(approvedPrincipal(near), false, JSON.stringify(near));
  }
  assert.equal(approvedMergeOwner('simplememofast', { login: 'simplememofast', name: 'SimpleMemo Developer', email: 'simplememo.com@gmail.com' }), true);
  assert.equal(approvedMergeOwner('simplememofast', { login: 'simplememofast', name: 'SimpleMemo Developer (Private Person)', email: 'simplememo.com@gmail.com' }), false);
  assert.equal(completeCommitList(1, [good]), true);
  assert.equal(completeCommitList(2, [good]), false);
  assert.equal(completeCommitList(251, Array(250).fill(good)), false);
  assert.equal(completeCommitList(251, Array(251).fill(good)), false);
  assert.equal(findUnapprovedPrincipals([{ ...good, commit: { ...good.commit, author: { name: 'SimpleMemo Developer', email: 'person@example.invalid' } } }]).length, 1);
  assert.equal(findUnapprovedPrincipals([{ ...good, commit: { ...good.commit, message: 'Co-authored-by: unparseable' } }]).length, 1);
  assert.equal(findUnapprovedPrincipals([]).length, 1);
}

if (require.main === module) {
  if (process.argv.includes('--selftest')) selftest();
  else throw new Error('Use --selftest or import findUnapprovedPrincipals');
}

module.exports = { approvedPrincipal, approvedMergeOwner, completeCommitList, findUnapprovedPrincipals };
