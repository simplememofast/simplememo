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

test('syndication is explicitly blocked without model, secrets, network or public artifacts', () => {
  assert.deepEqual(Object.keys(jobs).filter((k) => k !== 'workflow_call'), ['blocked']);
  assert.match(workflow, /permissions: \{\}/);
  assert.doesNotMatch(workflow, /secrets\s*[:.\[]/, 'suspension requires no declared or injected credentials');
  assert.match(jobs.blocked, /PRIVATE_HANDOFF_REQUIRED/);
  assert.match(jobs.blocked, /exit 1/);
  assert.doesNotMatch(jobs.blocked, /uses:|secrets\.|upload-artifact|download-artifact|node |curl|wget/);
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
  if (dry.status !== 0) assert.match(dry.stderr, /DEVLOG_COMMAND_FAILED/, dry.stderr);
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
  const env = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS };
  for (const name of ['IDENTITY_DENYLIST', 'DEVTO_API_KEY', 'HATENA_API_KEY', 'LIVEDOOR_API_KEY']) delete env[name];
  const result = spawnSync(process.execPath, [DEVLOG, '--selftest'], { encoding: 'utf8', env, timeout: 60_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.slice(-2000));
  assert.match(result.stdout, /自己テスト: \d+ 件すべて通過/);
});


// Regression inputs below are deliberately fictional and require no real secret.
import { identityMatcher, identityHits, maskIdentity, validateArticle, publishDevto,
  publishHatena, publishLivedoor, PLATFORMS } from './devlog-syndication.mjs';

test('unsupported denylist serialization fails closed instead of becoming an opaque identifier', () => {
  for (const value of ['["Qqsynthetic"]', 'Qqsynthetic;Rrfictional', '{"names":"Qqsynthetic"}', 'Qqsynthetic, ["Rrfictional"]']) {
    assert.equal(identityMatcher({ IDENTITY_DENYLIST: value }).size, 0);
  }
  for (const value of ['Qqsynthetic,Rrfictional', 'Qqsynthetic\nRrfictional']) {
    const m = identityMatcher({ IDENTITY_DENYLIST: value });
    assert.equal(identityHits('Qqsynthetic Rrfictional', m).length, 2);
  }
});

test('identifier matching covers width, invisibles and nested percent encodings', () => {
  const m = identityMatcher({ IDENTITY_DENYLIST: '@qq_handle77, qq.person@example.test, 鵺鶫' });
  for (const value of ['ＱＱ＿ＨＡＮＤＬＥ７７', 'qq_\u200bhandle77', 'https://example.test/%71%71%5Fhandle77',
    'qq&#95;handle77', 'qq&#x5f;handle77', 'qq_&#104;andle77', 'qq&lowbar;handle77', 'qq&amp;#95;handle77', 'qq&UnknownEntity;handle77', '%2571%2571%255Fhandle77', '％７１％７１％５Ｆhandle77', '%EF%BC%8571%EF%BC%8571%EF%BC%855Fhandle77', '%FF%71%71%5Fhandle77', '%E9%B5%BA%E9%B6%AB', 'ＱＱ．ＰＥＲＳＯＮ＠ＥＸＡＭＰＬＥ．ＴＥＳＴ']) {
    assert.ok(identityHits(value, m).length > 0);
    assert.doesNotMatch(maskIdentity(value, m), /qq|handle77|[鵺鶫]/i);
  }
  assert.equal(identityHits('SimpleMemo https://simplememofast.com/blog/example', m).length, 0);
});

test('encoded hits suppress even mocked validator link checks', async (t) => {
  const files = devlogFixture(scratch(t), { extra: ' [notes](https://example.test/%71%71%5Fhandle77)' });
  let calls = 0;
  const r = await validateArticle(JSON.parse(fs.readFileSync(files.article)), JSON.parse(fs.readFileSync(files.context)), {
    identity: identityMatcher({ IDENTITY_DENYLIST: 'qq_handle77' }),
    network: { linkStatus: async () => { calls++; return 200; } },
  });
  assert.equal(r.ok, false); assert.equal(calls, 0);
});

test('missing identity gate stops before public feed access, including force and dry run', (t) => {
  const files = devlogFixture(scratch(t));
  const r = runDevlog(files, ['gate', '--platform', 'devto', '--identity-missing', '--force', '--dry-run']);
  assert.equal(r.status, 1); assert.deepEqual(fetched(files), []);
});

test('malformed JSON and platform mismatches never echo input on stdout or stderr', (t) => {
  for (const kind of ['json', 'article-platform', 'context-platform']) {
    const files = devlogFixture(scratch(t));
    if (kind === 'json') fs.writeFileSync(files.article, '{"QqprivateSentinel": broken}');
    else {
      const target = kind === 'article-platform' ? files.article : files.context;
      const obj = JSON.parse(fs.readFileSync(target)); obj.platform = 'QqprivateSentinel';
      fs.writeFileSync(target, JSON.stringify(obj));
    }
    const r = runDevlog(files, ['validate', '--platform', 'devto', '--article', files.article, '--context', files.context, '--report', files.report, '--offline']);
    assert.equal(r.status, 1); assert.match(r.stderr, /DEVLOG_COMMAND_FAILED/);
    assert.doesNotMatch(r.stdout + r.stderr, /QqprivateSentinel|broken/);
    assert.equal(fs.existsSync(files.report), false); assert.deepEqual(fetched(files), []);
  }
});

test('dry-run output has metadata only and never checks links on every platform', (t) => {
  for (const platform of ['devto', 'hatena', 'hatenadiary', 'livedoor']) {
    const files = devlogFixture(scratch(t));
    const article = JSON.parse(fs.readFileSync(files.article));
    const ctx = JSON.parse(fs.readFileSync(files.context));
    article.platform = ctx.platform = platform;
    if (platform !== 'devto') {
      const para = 'メモは書いた直後に一つの受信箱へ集まり、あとで見返すときに迷わない形にしておくと続きやすい。';
      article.title = '受信箱を一つにすると、メモは見返される';
      article.body_markdown = `${para.repeat(14)}\n\n## なぜ受信箱を一つにするのか\n\n${para.repeat(16)}\n\n## 向かない場面\n\n${para.repeat(16)}\n\n## 確かめ方\n\n仕組みは[メモを確かめる方法](https://simplememofast.com/blog/benchmark-methodology)にまとめてある。${para.repeat(14)}`;
    }
    fs.writeFileSync(files.article, JSON.stringify(article));
    fs.writeFileSync(files.context, JSON.stringify(ctx));
    const r = runDevlog(files, ['publish', '--platform', platform, '--article', files.article, '--context', files.context, '--out', files.out, '--dry-run']);
    assert.equal(r.status, 0, platform + ': ' + r.stdout + r.stderr);
    assert.deepEqual(fetched(files), []);
    assert.deepEqual(JSON.parse(fs.readFileSync(files.out)), { platform, dry_run: true, identity_checked: false });
  }
});

test('all publisher entry points reject missing, malformed and matching identities before fetch', async () => {
  const saved = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('unexpected fetch'); };
  try {
    for (const value of ['', '["Qqsynthetic"]', 'Qqsynthetic;Rrfictional', 'qq_handle77']) {
      const identity = identityMatcher({ IDENTITY_DENYLIST: value });
      const art = { title: 'ＱＱ＿ＨＡＮＤＬＥ７７', body_markdown: 'synthetic body' };
      for (const send of [() => publishDevto(art, 'fake', 'body', { identity }),
        () => publishHatena(PLATFORMS.hatena, art, 'fake', 'body', { identity }),
        () => publishHatena(PLATFORMS.hatenadiary, art, 'fake', 'body', { identity }),
        () => publishLivedoor(PLATFORMS.livedoor, art, 'fake', 'body', { identity })]) await assert.rejects(send);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = saved; }
});

test('missing-list validation withholds raw article diagnostics from report and log', (t) => {
  const files = devlogFixture(scratch(t));
  fs.writeFileSync(files.article, JSON.stringify({ skip: true, reason: 'QqprivateSentinel' }));
  const r = runDevlog(files, ['validate', '--platform', 'devto', '--article', files.article, '--context', files.context, '--report', files.report, '--offline']);
  assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout + r.stderr + fs.readFileSync(files.report), /QqprivateSentinel/);
  assert.match(fs.readFileSync(files.report, 'utf8'), /IDENTITY_UNCHECKED/);
});


test('parent workflow also suspends its always-run public watcher', () => {
  const parent = read('.github/workflows/devlog-syndication.yml');
  const jobs = parent.slice(parent.indexOf('jobs:'));
  assert.match(parent, /permissions: \{\}/);
  assert.match(jobs, /PRIVATE_HANDOFF_REQUIRED/); assert.match(jobs, /exit 1/);
  assert.doesNotMatch(jobs, /uses:|secrets\.|upload-artifact|download-artifact|node |curl|wget|always\(\)/);
});
