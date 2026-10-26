'use strict';

// Keep this allowlist public: it names approved product and automation
// identities, not any private identity that a commit might disclose.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
    // Claude Code adds `Co-Authored-By: <model name> <noreply@anthropic.com>` to the commits
    // it writes. The daily run uses the models in data/model-routing.json, and the selftest
    // fails if a routed model's name is missing here. On 2026-10-25 the trial's publish job
    // refused the run's commits because 'Claude Sonnet 5' was not listed.
    ['Claude Sonnet 5', ['noreply@anthropic.com']],
    ['Claude Haiku 4.5', ['noreply@anthropic.com']],
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
    const message = String(commit.message || '');
    // A line break other than LF/CRLF (a bare CR, VT, FF, NEL, U+2028, U+2029) splits lines differently
    // for git, a renderer and this check, so a co-author line can hide behind one, or an approved
    // trailer can carry another name after one. NUL, ESC and the other C0 controls (TAB, LF and the CR
    // of CRLF aside) and DEL change what a reader sees in the same way. Such messages are refused
    // outright (none on main as of 2026-10-26).
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0085\u2028\u2029]|\r(?!\n)/.test(message)) {
      problems.push({ sha, field: 'message-control' });
    }
    // Co-author lines as git reads trailers: whitespace may come before the colon, and a following
    // line that starts with a space or tab continues the value (git folds it in). Each line is still
    // checked on its own as well, so this only adds checks.
    const lines = message.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*Co-authored-by\s*:/i.test(lines[i])) continue;
      let value = lines[i];
      for (let j = i + 1; j < lines.length && /^[ \t]+\S/.test(lines[j]); j++) value += ` ${lines[j].trim()}`;
      const match = /^\s*Co-authored-by\s*:\s*(.+?)\s*<([^<>]+)>\s*$/i.exec(value);
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
  // The trailer on the 2026-10-25 trial's commits, and nothing near it.
  const trialCommit = { ...good, commit: { author: dailyRun, committer: dailyRun,
    message: 'fix\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>' } };
  assert.deepEqual(findUnapprovedPrincipals([trialCommit]), []);
  // Any other line break is refused: a co-author line hidden behind one, an approved trailer that
  // carries another name after one, and even an approved trailer after one (2026-10-25 audit note).
  const withMessage = message => [{ ...trialCommit, commit: { ...trialCommit.commit, message } }];
  for (const separator of ['\r', '\u2028', '\u2029', '\u0085', '\v', '\f']) {
    const tag = `U+${separator.codePointAt(0).toString(16).padStart(4, '0')}`;
    assert.deepEqual(findUnapprovedPrincipals(withMessage(`fix${separator}Co-authored-by: Private Person <person@example.invalid>`))
      .map(p => p.field), ['message-control'], tag);
    assert.deepEqual(findUnapprovedPrincipals(withMessage(`fix\n\nCo-authored-by: Claude <noreply@anthropic.com>${separator}Private Person <p@example.invalid>`))
      .map(p => p.field), ['message-control', 'co-author'], tag);
    assert.deepEqual(findUnapprovedPrincipals(withMessage(`fix${separator}Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`))
      .map(p => p.field), ['message-control'], tag);
  }
  assert.deepEqual(findUnapprovedPrincipals(withMessage('fix\r\n\r\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\r\n')), [],
    'CRLF line endings are ordinary');
  // NUL, ESC, the separators FS/GS/RS, the other C0 controls and DEL are refused too; TAB is ordinary.
  for (const code of [0x00, 0x01, 0x08, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f]) {
    assert.deepEqual(findUnapprovedPrincipals(withMessage(`fix${String.fromCharCode(code)}\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`))
      .map(p => p.field), ['message-control'], `U+${code.toString(16).padStart(4, '0')}`);
  }
  assert.deepEqual(findUnapprovedPrincipals(withMessage('fix\n\n\tindented body\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>')), [],
    'a TAB is ordinary');
  // git reads these as co-author trailers too (git interpret-trailers): whitespace before the colon, and a
  // continuation line that folds another name into an approved trailer.
  for (const message of ['fix\n\nCo-authored-by : Private Person <person@example.invalid>',
    'fix\n\nCo-authored-by\t: Private Person <person@example.invalid>',
    'fix\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\n Private Person <person@example.invalid>',
    'fix\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\n\tPrivate Person <person@example.invalid>',
    'fix\n\nCo-Authored-By: Claude Sonnet 5\n <noreply@anthropic.com> Private Person <person@example.invalid>']) {
    assert.deepEqual(findUnapprovedPrincipals(withMessage(message)).map(p => p.field), ['co-author'], JSON.stringify(message));
  }
  for (const message of ['fix\n\nCo-Authored-By : Claude Sonnet 5 <noreply@anthropic.com>',
    'fix\n\nCo-Authored-By: Claude Sonnet 5\n <noreply@anthropic.com>',
    'fix\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>\n\n  indented text after a blank line']) {
    assert.deepEqual(findUnapprovedPrincipals(withMessage(message)), [], JSON.stringify(message));
  }
  for (const near of [{ name: 'Claude Sonnet 5', email: 'person@example.invalid' },
    { name: 'Claude Sonnet 5', email: 'someone@anthropic.com' },
    { name: 'Claude Sonnet 5 Private Person', email: 'noreply@anthropic.com' },
    { name: 'Claude Sonnet', email: 'noreply@anthropic.com' },
    { name: 'Claude Haiku 4.5', email: 'noreply@anthropic.com.example' }]) {
    assert.equal(approvedPrincipal(near), false, JSON.stringify(near));
  }
  // Every model the daily run can be routed to has its co-author name approved; otherwise that
  // day's publish job refuses the work. A new model in the routing table fails here first.
  // The names are what Claude Code is expected to write ('Claude ' + the model's display name).
  // Only 'Claude Sonnet 5' has been seen on a daily-run commit (2026-10-25); if Claude Code writes
  // another name, publish refuses the work (fails closed) and this table needs that name.
  const COAUTHOR_NAMES = { 'claude-haiku-4-5-20251001': 'Claude Haiku 4.5', 'claude-sonnet-5': 'Claude Sonnet 5',
    'claude-opus-5': 'Claude Opus 5' };
  const routing = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'model-routing.json'), 'utf8'));
  const routed = Object.keys(routing.models || {});
  assert.ok(routed.length > 0, 'data/model-routing.json lists no models');
  for (const model of routed) {
    const name = COAUTHOR_NAMES[model];
    assert.ok(name, `data/model-routing.json routes to ${model}: add its co-author name to COAUTHOR_NAMES and the allowlist`);
    assert.equal(approvedPrincipal({ name, email: 'noreply@anthropic.com' }), true, `${name} (${model}) is not an approved co-author`);
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
