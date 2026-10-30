import '../tools/server-guard.test.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importArticle, MAX_ARTICLE_BYTES } from './syndication-input.mjs';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const workflow = read('.github/workflows/devlog-syndication-platform.yml');
const jobs = Object.fromEntries([...workflow.matchAll(/^  (\w+):\n([\s\S]*?)(?=^  \w+:\n|(?![\s\S]))/gm)].map((m) => [m[1], m[2]]));
function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syndication-security-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('models and credentialed validators/publishers never share jobs or checkout paths', () => {
  for (const name of ['prepare', 'draft', 'validate', 'fix', 'publish']) assert.ok(jobs[name], name);
  for (const name of ['draft', 'fix']) {
    assert.match(jobs[name], /uses: anthropics\/claude-code-action@[a-f0-9]{40}/);
    assert.doesNotMatch(jobs[name], /secrets\.(?:DEVTO_API_KEY|HATENA_API_KEY|LIVEDOOR_API_KEY|IDENTITY_DENYLIST)/);
    // Only data outputs can leave the model VM; no tree or context export.
    const uploaded = jobs[name].slice(jobs[name].lastIndexOf('- uses: actions/upload-artifact@'));
    assert.match(uploaded, /\.syndication\/article\.json/);
    assert.doesNotMatch(uploaded, /\.syndication\/context|path: \.syndication\/$/m);
  }
  for (const name of ['prepare', 'validate', 'publish']) {
    assert.doesNotMatch(jobs[name], /claude-code-action|id-token: write/);
    assert.match(jobs[name], /ref: \$\{\{ github.sha \}\}/);
    assert.match(jobs[name], /persist-credentials: false/);
  }
  for (const name of ['validate', 'publish']) {
    assert.match(jobs[name], /node scripts\/syndication-input\.mjs/);
    assert.match(jobs[name], /path: \$\{\{ runner.temp \}\}\//);
    assert.match(jobs[name], /IDENTITY_DENYLIST: \$\{\{ secrets.IDENTITY_DENYLIST \}\}/);
  }
  assert.match(jobs.publish, /needs.validate.result == 'success'/);
  assert.match(jobs.publish, /needs.fix.result == 'success'/);
  assert.match(jobs.publish, /node scripts\/devlog-syndication.mjs validate/);
  assert.match(jobs.publish, /ARGS=\(publish/);
  assert.match(jobs.publish, /--dry-run/);
  assert.match(jobs.publish, /--force/);
  assert.doesNotMatch(jobs.publish, /continue-on-error/);
  assert.match(jobs.prepare, /github.ref == 'refs\/heads\/main'/);
  // The name list never reaches the prepare job (it feeds the model); only its presence does, and the gate stops on it.
  assert.doesNotMatch(jobs.prepare, /secrets\.IDENTITY_DENYLIST \}\}/);
  assert.match(jobs.prepare, /HAS_DENYLIST: \$\{\{ secrets.IDENTITY_DENYLIST != '' \}\}/);
  assert.match(jobs.prepare, /if \[ "\$MODE" = "publish" \] && \[ "\$HAS_DENYLIST" != "true" \]; then ARGS\+=\(--identity-missing\); fi/);
  const publishStep = jobs.publish.split('- name: 投稿\n')[1].split('\n      - ')[0];
  assert.match(publishStep, /IDENTITY_DENYLIST: \$\{\{ secrets.IDENTITY_DENYLIST \}\}/);
  assert.match(publishStep, /ARGS=\(publish/);
  const ceiling = ['prepare', 'draft', 'validate', 'fix', 'publish'].reduce((n, name) => n + Number(jobs[name].match(/    timeout-minutes: (\d+)/)[1]), 0);
  assert.ok(ceiling <= 90, 'Preserve the prior per-platform runner-minute ceiling');
});

test('executable artifacts cannot replace trusted code; JSON stays inert', (t) => {
  const dir = scratch(t);
  const incoming = path.join(dir, 'incoming');
  const trusted = path.join(dir, 'trusted');
  fs.mkdirSync(incoming); fs.mkdirSync(trusted);
  const marker = path.join(dir, 'executed');
  fs.writeFileSync(path.join(incoming, 'devlog-syndication.mjs'), `require('fs').writeFileSync(${JSON.stringify(marker)},process.env.DEVTO_API_KEY)`);
  const data = { title: '$(touch ' + marker + ')', body_markdown: '<script>bad()</script>', sources: ['docs/story-seeds.md'] };
  fs.writeFileSync(path.join(incoming, 'article.json'), JSON.stringify(data));
  const output = path.join(trusted, 'article.json');
  assert.deepEqual(importArticle(path.join(incoming, 'article.json'), output), data);
  assert.deepEqual(fs.readdirSync(trusted), ['article.json']);
  assert.equal(fs.existsSync(marker), false);
  assert.throws(() => importArticle(path.join(incoming, 'article.json'), output)); // no overwrite of trusted paths
});

test('actual publisher import shell ignores a poisoned script and changed stop/context files', (t) => {
  const dir = scratch(t);
  const runner = path.join(dir, 'runner');
  const trusted = path.join(dir, 'trusted');
  const marker = path.join(dir, 'executed');
  for (const rel of ['runner/article/scripts', 'runner/context', 'trusted/scripts', 'trusted/data']) fs.mkdirSync(path.join(dir, rel), { recursive: true });
  const poison = path.join(runner, 'article/scripts/devlog-syndication.mjs');
  fs.writeFileSync(poison, `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},process.env.DEVTO_API_KEY);`);
  // Reproduce the old same-workspace shape using a fake key and no network.
  assert.equal(spawnSync(process.execPath, [poison], { env: { DEVTO_API_KEY: 'test-sentinel' } }).status, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'test-sentinel'); fs.unlinkSync(marker);
  fs.writeFileSync(path.join(runner, 'article/article.json'), '{"title":"Untrusted article"}');
  fs.writeFileSync(path.join(runner, 'article/context.json'), '{"poison":true}');
  fs.writeFileSync(path.join(runner, 'context/context.json'), '{"trusted":true}');
  fs.writeFileSync(path.join(trusted, 'data/emergency-stop.json'), '{"stopped":true}');
  fs.writeFileSync(path.join(trusted, 'scripts/syndication-input.mjs'), read('scripts/syndication-input.mjs'));
  fs.writeFileSync(path.join(trusted, 'scripts/devlog-syndication.mjs'), `import fs from 'node:fs';if(!JSON.parse(fs.readFileSync('data/emergency-stop.json')).stopped)throw Error('stop changed');console.log('trusted publisher');`);
  const shell = jobs.publish.match(/- name: Import article data;[^\n]*\n        run: \|\n([\s\S]*?)(?=\n      -)/)[1].replace(/^          /gm, '');
  const result = spawnSync('bash', ['-euc', shell + '\nnode scripts/devlog-syndication.mjs'], {
    cwd: trusted, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: runner, DEVTO_API_KEY: 'test-sentinel' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'trusted publisher');
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(trusted, '.syndication/context.json'))), { trusted: true });
});

test('import rejects symlinks, oversized files, invalid JSON and executable-shaped fields', (t) => {
  const dir = scratch(t); const src = path.join(dir, 'article.json');
  for (const value of ['{broken', 'null', '[]', '{"__proto__":{"x":1}}', '{"sources":[{}]}', '{"body_markdown":{}}', '{"skip":"true"}', 'x'.repeat(MAX_ARTICLE_BYTES + 1)]) {
    fs.writeFileSync(src, value);
    assert.throws(() => importArticle(src, path.join(dir, 'out.json')));
    assert.equal(fs.existsSync(path.join(dir, 'out.json')), false);
  }
  fs.writeFileSync(src, '{}'); fs.symlinkSync(src, path.join(dir, 'link.json'));
  assert.throws(() => importArticle(path.join(dir, 'link.json'), path.join(dir, 'out.json')));
  assert.throws(() => importArticle(dir, path.join(dir, 'out.json')));
  fs.writeFileSync(src, '{"skip":true,"reason":"No verified source"}');
  assert.equal(importArticle(src, path.join(dir, 'out.json')).skip, true);
});

test('SEO manual days are shell data: valid values work; substitutions and range escapes fail', (t) => {
  const dir = scratch(t); const marker = path.join(dir, 'executed');
  const seo = read('.github/workflows/seo-daily.yml');
  const shell = seo.match(/- name: Validate manual input as data\n        run: \|\n([\s\S]*?)(?=\n      \S)/)[1].replace(/^          /gm, '');
  assert.doesNotMatch(seo, /--days "\$\{\{|--manual "\$\{\{/);
  for (const value of ['1', '28', '90', '91', '365', '0', '-1', '28\n', '$(touch ' + marker + ')', '"; touch ' + marker + '; #']) {
    const result = spawnSync('bash', ['-euc', shell], { env: { ...process.env, INPUT_DAYS: value, INPUT_SNAPSHOT: 'false' } });
    assert.equal(result.status === 0, ['1', '28', '90', '91', '365'].includes(value), value);
    assert.equal(fs.existsSync(marker), false);
  }
});

test('security-sensitive actions use immutable revisions and supported Node; audit is blocking', () => {
  for (const name of ['seo-check.yml', 'seo-daily.yml', 'devlog-syndication.yml', 'devlog-syndication-platform.yml', 'auto-merge.yml']) {
    const src = read('.github/workflows/' + name);
    for (const m of src.matchAll(/uses: ([^\s#]+)/g)) {
      if (m[1].startsWith('./')) continue;
      assert.match(m[1], /@[a-f0-9]{40}$/, name + ': ' + m[1]);
    }
    assert.doesNotMatch(src, /node-version: ['"]?(?:20|22)['"]?\s*$/m);
  }
  const check = read('.github/workflows/seo-check.yml');
  assert.match(check, /permissions:\n  contents: read/);
  assert.match(check, /npm ci --ignore-scripts --no-audit\n          npm audit --omit=dev --audit-level=moderate/);
});

// Devlog Syndication: the real-name check uses only the IDENTITY_DENYLIST secret. Without it nothing is sent,
// and a hit is reported as a fixed marker. Fictional words only; the real secret is never needed here.
const DEVLOG = fileURLToPath(new URL('../scripts/devlog-syndication.mjs', import.meta.url));
function devlogFixture(dir, { description = 'Why a safe default can hide a stuck ledger.', extra = '' } = {}) {
  const para = 'A close condition that nobody feeds returns cannot determine every day, and that answer never turns red. ';
  const article = {
    platform: 'devto', title: 'A close condition nobody feeds never closes', tags: ['devops', 'automation'], description, series: null,
    basis: 'S-20260903-issue-closed-same-day', sources: ['docs/story-seeds.md'],
    body_markdown: `${para.repeat(20)}\n\n## What happened\n\n${para.repeat(15)}${extra}\n\n## Why it stayed quiet\n\n${para.repeat(15)}\n\n`
      + `## What changed\n\nThe method is described in [the benchmark methodology](https://simplememofast.com/blog/benchmark-methodology). ${para.repeat(12)}`,
  };
  const context = {
    platform: 'devto', used_bases: [], existing_posts: [], sibling_posts: [],
    seeds_available: [{ id: 'S-20260903-issue-closed-same-day', claim: 'x' }],
    allowed_site_links: [{ url: 'https://simplememofast.com/blog/benchmark-methodology', file: 'blog/benchmark-methodology.html' }],
  };
  const files = { article: path.join(dir, 'article.json'), context: path.join(dir, 'context.json'), out: path.join(dir, 'published.json'),
    report: path.join(dir, 'validation.txt'), log: path.join(dir, 'fetch.log'), preload: path.join(dir, 'no-network.mjs') };
  fs.writeFileSync(files.article, JSON.stringify(article));
  fs.writeFileSync(files.context, JSON.stringify(context));
  // Every request is recorded and answered locally; nothing leaves the machine.
  fs.writeFileSync(files.preload, `import fs from 'node:fs';
globalThis.fetch = async (url, opts = {}) => { fs.appendFileSync(process.env.FETCH_LOG, (opts.method || 'GET') + ' ' + url + '\\n'); return new Response('', { status: 200 }); };\n`);
  return files;
}
function runDevlog(files, args, extraEnv = {}) {
  // A minimal environment: the parent's IDENTITY_DENYLIST, API keys or NODE_OPTIONS are never inherited.
  const env = { PATH: process.env.PATH, FETCH_LOG: files.log, DEVTO_API_KEY: 'test-sentinel', ...extraEnv };
  return spawnSync(process.execPath, ['--import', pathToFileURL(files.preload).href, DEVLOG, ...args], { encoding: 'utf8', env });
}
const fetched = (files) => (fs.existsSync(files.log) ? fs.readFileSync(files.log, 'utf8').trim().split('\n') : []);

test('devlog publish refuses to send anything without a usable IDENTITY_DENYLIST', (t) => {
  for (const [label, extraEnv] of [['unset', {}], ['empty', { IDENTITY_DENYLIST: '' }], ['separators only', { IDENTITY_DENYLIST: ' ,\n' }],
    ['single characters only', { IDENTITY_DENYLIST: 'q, 鴇' }]]) {
    const files = devlogFixture(scratch(t));
    const r = runDevlog(files, ['publish', '--platform', 'devto', '--article', files.article, '--context', files.context, '--out', files.out], extraEnv);
    assert.equal(r.status, 1, label);
    assert.match(r.stderr, /IDENTITY_DENYLIST/, label);
    assert.doesNotMatch(r.stderr + r.stdout, /鴇/, label);
    assert.deepEqual(fetched(files), [], `${label}: no request (not even link checks) before the lock`);
    assert.equal(fs.existsSync(files.out), false, label);
  }
});

test('devlog check modes keep working without the secret and only warn', (t) => {
  const files = devlogFixture(scratch(t));
  const dry = runDevlog(files, ['publish', '--platform', 'devto', '--article', files.article, '--context', files.context, '--out', files.out, '--dry-run']);
  assert.match(dry.stdout, /::warning title=Devlog syndication identity::.*IDENTITY_DENYLIST/);
  assert.doesNotMatch(dry.stderr, /IDENTITY_DENYLIST/, 'the dry run is not stopped by the lock');
  assert.ok(fetched(files).every((line) => /^(HEAD|GET) /.test(line)), 'dry run only checks links');
  // The route's own emergency stop (data/emergency-stop.json) also stops a dry run; that is not this test's subject.
  if (dry.status !== 0) assert.match(dry.stderr, /停止中のため投稿しない/, dry.stderr);
  else assert.equal(JSON.parse(fs.readFileSync(files.out, 'utf8')).dry_run, true);
  const validate = runDevlog(files, ['validate', '--platform', 'devto', '--article', files.article, '--context', files.context, '--offline']);
  assert.equal(validate.status, 0, validate.stdout + validate.stderr);
  assert.match(validate.stdout, /検証: 通過/);
});

test('devlog validation reports a real-name hit as a fixed marker without any character of it', (t) => {
  const files = devlogFixture(scratch(t), { description: 'Notes by Zzexample.',
    extra: ' The open rate Zzexample said 83 percent, and 鵺鶫 agreed. See [notes](http://notes.test/zzexample).' });
  const r = runDevlog(files, ['validate', '--platform', 'devto', '--article', files.article, '--context', files.context,
    '--report', files.report, '--offline'], { IDENTITY_DENYLIST: 'Zzexample, 鵺鶫' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const report = fs.readFileSync(files.report, 'utf8');
  for (const out of [report, r.stdout + r.stderr]) {
    assert.match(out, /「実名（伏せ字）」が 4 件/);
    // Quotes are cut 14 characters before a number; quoting the unmasked body would start mid-word ("zexample said 83").
    assert.match(out, /said 83/, 'the number problem quotes the body');
    assert.match(out, /http:\/\/notes\.test\/実名（伏せ字）/, 'the link problem quotes the URL with the hit masked');
    // No character of a hit: not the word, not a fragment cut by a quote, not the former "first character + …" form.
    assert.doesNotMatch(out, /zz|xampl|[鵺鶫]|[zZ鵺]…/i);
  }
});

test('devlog-syndication commits neither names nor hashes of them', () => {
  const src = read('scripts/devlog-syndication.mjs');
  assert.doesNotMatch(src, /\b[0-9a-f]{64}\b/, 'a 64-hex constant is back in the public repository');
  assert.doesNotMatch(src, /IDENTITY_HASHES/);
});

// The per-platform send locks and the gate's no_identity_denylist are covered only by the script's own self-test,
// which otherwise runs just before a real post. Run it on every PR too (it uses fictional words and a fake fetch).
test('devlog-syndication self-test passes', () => {
  const env = { ...process.env };
  for (const name of ['IDENTITY_DENYLIST', 'DEVTO_API_KEY', 'HATENA_API_KEY', 'LIVEDOOR_API_KEY']) delete env[name];
  const result = spawnSync(process.execPath, [DEVLOG, '--selftest'], { encoding: 'utf8', env, timeout: 60_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.slice(-2000));
  assert.match(result.stdout, /自己テスト: \d+ 件すべて通過/);
});
