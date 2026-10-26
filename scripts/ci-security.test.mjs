import '../tools/server-guard.test.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
