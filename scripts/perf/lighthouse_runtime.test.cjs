'use strict';
// No browser or installed Lighthouse package is loaded by this test suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const runtime = require('./lighthouse_runtime.cjs');
const guards = runtime._guards;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Byte-exact Apache-2.0 upstream test data; license is beside the fixture.
// https://github.com/GoogleChrome/lighthouse/blob/v12.8.2/core/gather/gatherers/console-messages.js
const ORIGINAL = fs.readFileSync(path.join(__dirname, 'fixtures/lighthouse-runtime/console-messages-12.8.2.txt'));
const ORIGINAL_HASH = '512cb67e34e30672ec872a4fc8f846904a5b77006426186c6bf7819993a1191a';
const PATCHED_HASH = 'a11efb225c3fa5e25f3e2d84d321eaa6d5600e2db629eacb699ec13ea8a4c2db';
// Function-source digests from reviewed commit bc374916c9d72eb994d6ef1aebcf3a131082437c.
const GUARD_HASHES = {
  "repairBytes": "5666d35f0981bfb4ee1b259b72bc179592c5c87db5ae828707a7b1b0a6b0ae6b",
  "relativeModulePath": "68ac4667ed1f71a127cea0af185cda1bcbd84e6367eb210e87cc76fd4a173278",
  "checkedModulePath": "0f72694b51269546251b3c9ac957151d78209cd44cfba658442d1afe1107cbe3",
  "readRepairFd": "2b92592f5f77bb1a560d686e92a80ce896b3b4d01b90c5b5ffe08e88e3962560",
  "prepareRepair": "04ebcf92edf41319adb639cd3c5422caa3edcbf4218812e6f4c7e49cfd598437",
  "buildArms": "2a3838e25b293fe264ab8e85a6e57fa0b24823a3169c0224897b4df58dc170b9",
  "attestArguments": "c93860d9134eecc2e1a7fec034a22937cbf99e55d02672e85d4ba1f59a48ce38",
  "commandLine": "a2d465e1bb65f2e3fbed7889a21898d2644ab7348d4ca3e5f90d8b2ec0d50848",
  "stopChrome": "04cf83596cd206038537c3fe94209649da8ebc7d3167c1f1124551d3cecb0d26",
  "runCli": "3885d1261c0ee0287e49427f99eb2a5cf8bf15bf46d0dcd40705b7128ea564ea"
};

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'lighthouse-runtime-test-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const file = path.join(root, 'lighthouse/core/gather/gatherers/console-messages.js');
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, ORIGINAL);
  return {root, file};
}

const defaults = Object.freeze(['--disable-background-networking',
  '--disable-features=Translate,RenderDocument,MediaRouter']);
const versions = Object.freeze({node: 'v24.22.1', lighthouse: '12.8.2',
  chromeLauncher: '1.2.2', chromeVersion: 'Google Chrome 155.0.8059.39'});

test('all extracted guards exactly match the reviewed diagnostic source', () => {
  assert.equal(sha256(ORIGINAL), ORIGINAL_HASH);
  for (const [name, hash] of Object.entries(GUARD_HASHES)) {
    assert.equal(sha256(guards[name].toString()), hash, name);
  }
});

test('the valid collector changes exactly one byte and has the measured patched hash', () => {
  const before = Buffer.from(ORIGINAL);
  const {patched, offset} = guards.repairBytes(ORIGINAL);
  assert.deepEqual(ORIGINAL, before);
  assert.equal(patched.length, ORIGINAL.length);
  assert.equal(sha256(patched), PATCHED_HASH);
  const changes = [...before.keys()].filter(index => before[index] !== patched[index]);
  assert.deepEqual(changes, [offset]);
  assert.equal(before[offset], 49);
  assert.equal(patched[offset], 50);
});

test('a patched, truncated, altered or synthetic source is rejected', () => {
  const changed = Buffer.from(ORIGINAL); changed[0] ^= 1;
  for (const bytes of [guards.repairBytes(ORIGINAL).patched, ORIGINAL.subarray(1), changed,
    Buffer.from("config: [{name: 'discouragedAPIUse', threshold: -1}]")]) {
    assert.throws(() => guards.repairBytes(bytes), /REPAIR_SOURCE_HASH_MISMATCH/);
  }
});

test('repair applies, reads back and restores the original owned inode', t => {
  const {root, file} = fixture(t), before = fs.statSync(file);
  const repair = guards.prepareRepair(root, file);
  repair.apply();
  assert.equal(sha256(fs.readFileSync(file)), PATCHED_HASH);
  assert.equal(repair.metadata.applied, true);
  repair.restore();
  assert.equal(sha256(fs.readFileSync(file)), ORIGINAL_HASH);
  assert.equal(fs.statSync(file).ino, before.ino);
  assert.deepEqual(repair.metadata.restoration,
    {attempted: true, succeeded: true, sha256: ORIGINAL_HASH});
});

test('relative and escaping module paths are rejected', t => {
  const {root, file} = fixture(t);
  assert.equal(guards.relativeModulePath(root, file), 'lighthouse/core/gather/gatherers/console-messages.js');
  for (const target of [root, root + '-other/file.js', path.join(path.dirname(root), 'outside.js'),
    root + '/../outside.js', 'relative/file.js']) {
    assert.throws(() => guards.relativeModulePath(root, target));
  }
});

test('symlinks in a module or directory and hardlinked source are rejected', t => {
  const {root, file} = fixture(t);
  const linkedFile = path.join(root, 'linked.js');
  fs.symlinkSync(file, linkedFile);
  assert.throws(() => guards.prepareRepair(root, linkedFile), /REPAIR_MODULE_SYMLINK_OR_TYPE/);
  const linkedDirectory = path.join(root, 'linked-directory');
  fs.symlinkSync(path.dirname(file), linkedDirectory);
  assert.throws(() => guards.prepareRepair(root, path.join(linkedDirectory, 'console-messages.js')),
    /REPAIR_MODULE_SYMLINK_OR_TYPE/);
  fs.linkSync(file, path.join(root, 'hardlink.js'));
  assert.throws(() => guards.prepareRepair(root, file), /REPAIR_FD_INVALID/);
});

test('restore refuses an inode replacement and does not overwrite its contents', t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  repair.apply();
  fs.renameSync(file, file + '.original-inode');
  fs.writeFileSync(file, 'unrelated replacement');
  assert.throws(() => repair.restore(), /REPAIR_INODE_CHANGED/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'unrelated replacement');
  assert.equal(repair.metadata.restoration.succeeded, false);
});

test('restore refuses unexpected edits rather than destroying them', t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  repair.apply();
  const unexpected = fs.readFileSync(file); unexpected[0] ^= 1;
  fs.writeFileSync(file, unexpected);
  assert.throws(() => repair.restore(), /REPAIR_RESTORE_UNEXPECTED_CONTENT/);
  assert.deepEqual(fs.readFileSync(file), unexpected);
});

test('source changed before apply is rejected and unmodified preparation can be closed', t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  fs.writeFileSync(file, guards.repairBytes(ORIGINAL).patched);
  assert.throws(() => repair.apply(), /REPAIR_SOURCE_CHANGED/);
  repair.restore();
  assert.equal(sha256(fs.readFileSync(file)), ORIGINAL_HASH);
});

test('operation success still waits for cleanup and original-source restoration', async t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  let cleaned = false;
  const result = await runtime.withRestoration(repair, async () => {
    assert.equal(sha256(fs.readFileSync(file)), PATCHED_HASH); return 42;
  }, async () => {
    assert.equal(sha256(fs.readFileSync(file)), PATCHED_HASH); cleaned = true;
  });
  assert.equal(result, 42);
  assert.equal(cleaned, true);
  assert.equal(sha256(fs.readFileSync(file)), ORIGINAL_HASH);
});

test('operation failure is propagated after cleanup and restoration', async t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  let cleaned = false;
  await assert.rejects(runtime.withRestoration(repair,
    async () => { throw new Error('CLI_OPERATION_FAILED'); },
    async () => { cleaned = true; }), /CLI_OPERATION_FAILED/);
  assert.equal(cleaned, true);
  assert.equal(sha256(fs.readFileSync(file)), ORIGINAL_HASH);
});

test('cleanup failure cannot skip source restoration or become a success', async t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  await assert.rejects(runtime.withRestoration(repair, async () => 0,
    async () => { throw new Error('BROWSER_CLEANUP_INCOMPLETE'); }), /BROWSER_CLEANUP_INCOMPLETE/);
  assert.equal(sha256(fs.readFileSync(file)), ORIGINAL_HASH);
  assert.equal(repair.metadata.restoration.succeeded, true);
});

test('restoration failure makes an otherwise successful operation fail', async t => {
  const {root, file} = fixture(t), repair = guards.prepareRepair(root, file);
  await assert.rejects(runtime.withRestoration(repair, async () => 0,
    async () => { const bytes = fs.readFileSync(file); bytes[0] ^= 1; fs.writeFileSync(file, bytes); }),
  /REPAIR_RESTORE_UNEXPECTED_CONTENT/);
  assert.equal(repair.metadata.restoration.succeeded, false);
});

test('repair application failure still invokes cleanup and restoration', async () => {
  const calls = [];
  await assert.rejects(runtime.withRestoration({
    apply() { calls.push('apply'); throw new Error('REPAIR_WRITE_INCOMPLETE'); },
    restore() { calls.push('restore'); },
  }, async () => { calls.push('operation'); }, async () => { calls.push('cleanup'); }), /REPAIR_WRITE_INCOMPLETE/);
  assert.deepEqual(calls, ['apply', 'cleanup', 'restore']);
});

test('only RenderDocument is removed and input/default flags remain intact', () => {
  const arms = guards.buildArms(defaults);
  assert.deepEqual(defaults, ['--disable-background-networking', '--disable-features=Translate,RenderDocument,MediaRouter']);
  assert.equal(arms.restored[1], '--disable-features=Translate,MediaRouter');
  assert.deepEqual(arms.restored.slice(2), arms.default.slice(2));
  assert(arms.restored.includes('--disable-setuid-sandbox'));
  for (const value of [[], ['--disable-features=Translate'], ['--disable-features=RenderDocument'],
    ['--disable-features=RenderDocument,Other', '--disable-features=Other'],
    ['--disable-features=RenderDocument,RenderDocument,Other'],
    ['--disable-features=RenderDocument,Other', '--user-data-dir=/existing'],
    ['--disable-features=RenderDocument,Other', '--enable-features=RenderDocument']]) {
    assert.throws(() => guards.buildArms(value));
  }
});

test('actual argument attestation rejects flag, profile, port and duplicate drift', () => {
  const flags = guards.buildArms(defaults).restored;
  const argv = ['/chrome', '--remote-debugging-port=1234', '--user-data-dir=/fresh', ...flags, 'about:blank'];
  assert(guards.attestArguments(argv, flags, '/fresh', 1234).includes('--user-data-dir=<FRESH_PROFILE>'));
  for (const bad of [[...argv, '--disable-web-security'], [...argv, '--no-sandbox'],
    argv.filter(x => x !== '--headless'), [...argv, '--user-data-dir=/other']]) {
    assert.throws(() => guards.attestArguments(bad, flags, '/fresh', 1234));
  }
  assert.throws(() => guards.attestArguments(argv, flags, '/other', 1234));
  assert.throws(() => guards.attestArguments(argv, flags, '/fresh', 5678));
  const auto = argv.map(x => x === '--remote-debugging-port=1234' ? '--remote-debugging-port=0' : x);
  assert.throws(() => guards.attestArguments(auto, flags, '/fresh', 1234));
  assert.deepEqual(guards.attestArguments(auto, flags, '/fresh', 1234, true),
    guards.attestArguments(argv, flags, '/fresh', 1234));
});

test('public plan accepts exactly the four ordinary targets and corresponding twelve prefixes', t => {
  const {root} = fixture(t);
  const groups = {'local-ja': 'http://127.0.0.1:8765/', 'local-en': 'http://127.0.0.1:8765/en/',
    'production-ja': 'https://simplememofast.com/', 'production-en': 'https://simplememofast.com/en/'};
  for (const [group, url] of Object.entries(groups)) {
    for (const run of [1, 2, 3]) {
      const prefix = path.join(root, group + '-' + run);
      assert.equal(runtime.ordinaryPlan(url, prefix, root).outputPrefix, prefix);
    }
  }
  for (const [url, name] of [
    ['http://127.0.0.1:8766/positive.html', 'local-ja-1'],
    ['https://simplememofast.com/admin', 'production-ja-1'],
    ['https://simplememofast.com/?test=1', 'production-ja-1'],
    ['https://other.invalid/', 'production-ja-1'],
    [groups['production-en'], 'production-ja-1'], [groups['local-ja'], 'local-ja-4'],
    [groups['local-ja'], 'local-ja-1.report.json'],
  ]) assert.throws(() => runtime.ordinaryPlan(url, path.join(root, name), root));
  assert.throws(() => runtime.ordinaryPlan(groups['local-ja'], path.join(root, 'sub/local-ja-1'), root));
});

test('existing output and dangling symlinks cannot be overwritten', t => {
  const {root} = fixture(t), prefix = path.join(root, 'local-ja-1');
  runtime.requireNewOutput(prefix);
  fs.symlinkSync(path.join(root, 'missing'), prefix + '.report.json');
  assert.throws(() => runtime.requireNewOutput(prefix), /OUTPUT_ALREADY_EXISTS/);
  fs.unlinkSync(prefix + '.report.json');
  fs.mkdirSync(prefix + '.runtime');
  assert.throws(() => runtime.requireNewOutput(prefix), /OUTPUT_ALREADY_EXISTS/);
});

test('all ordinary categories and save-assets remain fixed without browser flag overrides', () => {
  const args = runtime.buildCliArguments('/tools/lighthouse/cli.js', 'https://simplememofast.com/', 1234, '/results/production-ja-1');
  assert(args.includes('--only-categories=performance,accessibility,best-practices,seo'));
  assert(args.includes('--save-assets'));
  assert(args.includes('--hostname=127.0.0.1'));
  assert(args.includes('--port=1234'));
  assert.equal(args.filter(x => x.startsWith('--only-')).length, 1);
  assert(!args.some(x => /chrome-flags|blocked|StorageReset|throttl|additional-trace/.test(x)));
  for (const port of [0, -1, 65536, 1.5]) {
    assert.throws(() => runtime.buildCliArguments('/cli.js', 'url', port, '/prefix'));
  }
});

test('known versions and every non-success CLI outcome fail closed', () => {
  runtime.requireVersions(versions);
  for (const key of Object.keys(versions)) assert.throws(() => runtime.requireVersions({...versions, [key]: 'different'}));
  runtime.requireCliSuccess({code: 0, signal: null, errorCode: null});
  for (const result of [undefined, {}, {code: 1, signal: null, errorCode: null},
    {code: null, signal: 'SIGKILL', errorCode: null}, {code: 0, signal: null, errorCode: 'SPAWN_FAILED'}]) {
    assert.throws(() => runtime.requireCliSuccess(result), /LIGHTHOUSE_CLI_FAILED/);
  }
});

test('runtime, redirect, category and artifact failures cannot become valid measurements', t => {
  const {root} = fixture(t), prefix = path.join(root, 'local-ja-1');
  const plan = runtime.ordinaryPlan('http://127.0.0.1:8765/', prefix, root);
  const report = {lighthouseVersion: '12.8.2', requestedUrl: plan.url, finalDisplayedUrl: plan.url,
    configSettings: {onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']}};
  const write = value => fs.writeFileSync(prefix + '.report.json', JSON.stringify(value));
  write(report);
  for (const suffix of ['.report.html', '-0.trace.json', '-0.devtoolslog.json']) fs.writeFileSync(prefix + suffix, '[]');
  assert.equal(runtime.readMeasurementArtifacts(plan).length, 4);
  write({...report, runtimeError: {code: 'NO_FCP'}});
  assert.throws(() => runtime.readMeasurementArtifacts(plan), /REPORT_RUNTIME_INVALID/);
  write({...report, finalDisplayedUrl: 'https://other.invalid/'});
  assert.throws(() => runtime.readMeasurementArtifacts(plan), /REPORT_TARGET_CHANGED/);
  write({...report, configSettings: {onlyCategories: ['performance']}});
  assert.throws(() => runtime.readMeasurementArtifacts(plan), /REPORT_CATEGORIES_CHANGED/);
  write(report);
  fs.truncateSync(prefix + '-0.trace.json', 64 * 1024 * 1024 + 1);
  assert.throws(() => runtime.readMeasurementArtifacts(plan), /ARTIFACT_SIZE_OR_TYPE/);
});
