'use strict';
// Diagnostic only: no result from this experiment satisfies a PR performance gate.
// Usage in the existing Linux measurement environment:
// NODE_PATH="$RUNNER_TEMP/perf-tools/node_modules" node scripts/perf/diagnose_render_document.cjs --capture
// --capture-negative-repair runs only two loopback controls with a temporary,
// hash-checked one-byte CDP-reporting repair, then restores the installed source.
// --self-test exercises only pure flag validation; it never imports browser tools.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {spawn, spawnSync} = require('node:child_process');

const TARGET = 'https://simplememofast.com/';
const FIXTURE = 'http://127.0.0.1:8766/dbw-minimal-negative.html';
const FIXTURE_DIR = path.join(__dirname, 'fixtures/render-document');
const MARKER = 'SIMPLEMEMO_DIAGNOSTIC_FIXTURE_CALLS_COMPLETED';
const AUDITS = Object.freeze(['geolocation-on-start', 'notification-on-start', 'no-document-write', 'uses-passive-event-listeners']);
const ORDER = Object.freeze([
  ...['default', 'restored', 'restored', 'default', 'default', 'restored'].map(arm => ({kind: 'production', arm, url: TARGET})),
  ...['default', 'restored'].map(arm => ({kind: 'fixture', arm, url: FIXTURE})),
]);
const REPAIR_ORDER = Object.freeze(ORDER.filter(item => item.kind === 'fixture'));
const CONSOLE_ORIGINAL_SHA256 = '512cb67e34e30672ec872a4fc8f846904a5b77006426186c6bf7819993a1191a';
const CONSOLE_ORIGINAL_TEXT = "config: [{name: 'discouragedAPIUse', threshold: -1}]";
const CONSOLE_REPAIRED_TEXT = "config: [{name: 'discouragedAPIUse', threshold: -2}]";
const COMMON = Object.freeze(['--headless', '--no-sandbox', '--disable-dev-shm-usage']);
const CATEGORIES = 'viz,cc,gpu,graphics.pipeline,disabled-by-default-devtools.timeline.frame';
const LIMIT = 64 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
function need(condition, code) { if (!condition) throw new Error(code); }
function jsonFile(file, value, exclusive = false) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: exclusive ? 'wx' : 'w'});
}

function repairBytes(original) {
  need(Buffer.isBuffer(original) && sha256(original) === CONSOLE_ORIGINAL_SHA256, 'REPAIR_SOURCE_HASH_MISMATCH');
  const text = original.toString('utf8');
  need(text.split(CONSOLE_ORIGINAL_TEXT).length === 2, 'REPAIR_TARGET_NOT_EXACT');
  const patched = Buffer.from(text.replace(CONSOLE_ORIGINAL_TEXT, CONSOLE_REPAIRED_TEXT));
  const offsets = [...original.keys()].filter(index => original[index] !== patched[index]);
  need(original.length === patched.length && offsets.length === 1
    && original[offsets[0]] === 49 && patched[offsets[0]] === 50, 'REPAIR_NOT_SINGLE_BYTE');
  return {patched, offset: offsets[0]};
}

function relativeModulePath(root, file) {
  need(path.isAbsolute(root) && path.isAbsolute(file) && root === path.resolve(root) && file === path.resolve(file), 'REPAIR_PATH_NOT_CANONICAL');
  const relative = path.relative(root, file);
  need(relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative), 'REPAIR_PATH_OUTSIDE_TOOLS');
  return relative;
}

function checkedModulePath(root, file) {
  const relative = relativeModulePath(root, file);
  need(fs.realpathSync(root) === root && !fs.lstatSync(root).isSymbolicLink(), 'REPAIR_ROOT_SYMLINK');
  let current = root;
  const parts = relative.split(path.sep);
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    need(!stat.isSymbolicLink() && (index === parts.length - 1 ? stat.isFile() : stat.isDirectory()), 'REPAIR_MODULE_SYMLINK_OR_TYPE');
  }
  need(fs.realpathSync(file) === file, 'REPAIR_MODULE_PATH_CHANGED');
  return relative;
}

function readRepairFd(fd) {
  const stat = fs.fstatSync(fd);
  need(stat.isFile() && stat.nlink === 1 && stat.size > 0 && stat.size <= 16384, 'REPAIR_FD_INVALID');
  const bytes = Buffer.alloc(stat.size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
    need(count > 0, 'REPAIR_READ_INCOMPLETE');
    offset += count;
  }
  return bytes;
}

function prepareRepair(root, file) {
  const relative = checkedModulePath(root, file);
  need(typeof fs.constants.O_NOFOLLOW === 'number', 'REPAIR_NOFOLLOW_UNAVAILABLE');
  const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
  try {
    const original = readRepairFd(fd), {patched, offset} = repairBytes(original);
    const inode = fs.fstatSync(fd);
    const originalSha256 = sha256(original), patchedSha256 = sha256(patched);
    const metadata = {hypothesisOnly: true, installedModule: relative, originalSha256, patchedSha256,
      replacement: {from: CONSOLE_ORIGINAL_TEXT, to: CONSOLE_REPAIRED_TEXT, occurrences: 1, changedBytes: 1},
      applied: false, restoration: {attempted: false, succeeded: false}};
    const verifyIdentity = () => {
      checkedModulePath(root, file);
      const named = fs.lstatSync(file), opened = fs.fstatSync(fd);
      need(named.dev === inode.dev && named.ino === inode.ino && opened.dev === inode.dev && opened.ino === inode.ino
        && named.nlink === 1 && opened.nlink === 1, 'REPAIR_INODE_CHANGED');
    };
    return {metadata,
      apply() {
        verifyIdentity();
        need(sha256(readRepairFd(fd)) === originalSha256, 'REPAIR_SOURCE_CHANGED');
        need(fs.writeSync(fd, patched.subarray(offset, offset + 1), 0, 1, offset) === 1, 'REPAIR_WRITE_INCOMPLETE');
        fs.fsyncSync(fd);
        need(sha256(readRepairFd(fd)) === patchedSha256, 'REPAIR_READBACK_FAILED');
        metadata.applied = true;
      },
      restore() {
        metadata.restoration.attempted = true;
        try {
          verifyIdentity();
          const current = sha256(readRepairFd(fd));
          need(current === originalSha256 || current === patchedSha256, 'REPAIR_RESTORE_UNEXPECTED_CONTENT');
          if (current === patchedSha256) {
            need(fs.writeSync(fd, original.subarray(offset, offset + 1), 0, 1, offset) === 1, 'REPAIR_RESTORE_WRITE_INCOMPLETE');
            fs.fsyncSync(fd);
          }
          metadata.restoration.sha256 = sha256(readRepairFd(fd));
          need(metadata.restoration.sha256 === originalSha256, 'REPAIR_RESTORE_READBACK_FAILED');
          metadata.restoration.succeeded = true;
        } catch (error) {
          metadata.restoration.error = /^[A-Z_]+$/.test(error.message) ? error.message : 'REPAIR_RESTORE_FAILED';
          throw error;
        } finally { fs.closeSync(fd); }
      }};
  } catch (error) { fs.closeSync(fd); throw error; }
}

function buildArms(defaults) {
  need(Array.isArray(defaults) && defaults.length > 0 && defaults.every(x => typeof x === 'string'), 'FLAGS_INVALID');
  const indices = defaults.flatMap((flag, i) => flag.startsWith('--disable-features=') ? [i] : []);
  need(indices.length === 1, 'FLAGS_DISABLE_FEATURES_AMBIGUOUS');
  const i = indices[0], features = defaults[i].slice('--disable-features='.length).split(',');
  need(features.length > 1 && features.every(x => /^[A-Za-z0-9_]+$/.test(x))
    && new Set(features).size === features.length && features.filter(x => x === 'RenderDocument').length === 1,
  'FLAGS_RENDER_DOCUMENT_NOT_EXACT');
  need(!defaults.some(x => /^--(?:user-data-dir|remote-debugging-port|remote-debugging-pipe|remote-debugging-address|headless|no-sandbox)(?:=|$)/.test(x)),
    'FLAGS_RESERVED_DEFAULT');
  need(!defaults.some(x => x.startsWith('--enable-features=') && x.slice(18).split(',').some(f => f.split(':')[0] === 'RenderDocument')),
    'FLAGS_RENDER_DOCUMENT_ALREADY_ENABLED');
  const restored = [...defaults];
  restored[i] = '--disable-features=' + features.filter(x => x !== 'RenderDocument').join(',');
  // Normal chrome-launcher on Linux adds this outside Launcher.defaultFlags().
  // Preserve it explicitly because ignoreDefaultFlags is used with the complete copied list.
  const linux = defaults.includes('--disable-setuid-sandbox') ? [] : ['--disable-setuid-sandbox'];
  const arms = {default: [...defaults, ...linux, ...COMMON], restored: [...restored, ...linux, ...COMMON]};
  assert.deepEqual(arms.restored.filter((_, index) => index !== i), arms.default.filter((_, index) => index !== i));
  return arms;
}

function attestArguments(argv, flags, profile, port, autoPortVerified = false) {
  need(Array.isArray(argv) && argv.length > 2 && Number.isSafeInteger(port) && port > 0, 'FLAGS_PROCESS_INVALID');
  const args = argv.slice(1), profiles = args.filter(a => a.startsWith('--user-data-dir='));
  const ports = args.filter(a => a.startsWith('--remote-debugging-port='));
  need(profiles.length === 1 && profiles[0] === '--user-data-dir=' + profile, 'FLAGS_PROFILE_MISMATCH');
  need(ports.length === 1 && (ports[0] === '--remote-debugging-port=' + port
    || (autoPortVerified && ports[0] === '--remote-debugging-port=0')), 'FLAGS_PORT_MISMATCH');
  const logical = args.filter(a => !profiles.includes(a) && !ports.includes(a));
  // Compare multisets, preserving duplicate count; ordering of distinct switches is immaterial.
  need(JSON.stringify([...logical].sort()) === JSON.stringify([...flags, 'about:blank'].sort()), 'FLAGS_ACTUAL_MISMATCH');
  return [path.basename(argv[0]), ...args.map(a => a === profiles[0] ? '--user-data-dir=<FRESH_PROFILE>'
    : a === ports[0] ? '--remote-debugging-port=<EPHEMERAL_PORT>' : a)];
}

function commandLine(chrome, flags, profile) {
  need(Number.isSafeInteger(chrome.pid) && chrome.pid > 0, 'FLAGS_PID_INVALID');
  const raw = fs.readFileSync(`/proc/${chrome.pid}/cmdline`);
  need(raw.length > 0 && raw.length < 65536, 'FLAGS_CMDLINE_SIZE');
  const argv = raw.toString('utf8').split('\0').filter(Boolean);
  let autoPortVerified = false;
  if (argv.includes('--remote-debugging-port=0')) {
    // chrome-launcher 1.2.2 lets Chrome select the port. Validate the fresh
    // profile's ephemeral debugger metadata; never read a personal profile.
    const metadata = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8');
    need(metadata.length < 1024 && metadata.split('\n')[0] === String(chrome.port)
      && /^\/devtools\/browser\/[a-f0-9-]+$/.test(metadata.split('\n')[1]), 'FLAGS_DYNAMIC_PORT_MISMATCH');
    autoPortVerified = true;
  }
  return attestArguments(argv, flags, profile, chrome.port, autoPortVerified);
}

async function stopChrome(chrome, profile) {
  if (chrome) {
    const pid = chrome.pid || chrome.chromeProcess?.pid;
    chrome.kill();
    const deadline = Date.now() + 5000;
    while (pid && fs.existsSync(`/proc/${pid}`) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    need(!pid || !fs.existsSync(`/proc/${pid}`), 'BROWSER_CLEANUP_INCOMPLETE');
  }
  // Only the fresh directory created by this capture is eligible for cleanup.
  fs.rmSync(profile, {recursive: true, force: true});
}

async function runCli(args, output, timeout) {
  const stdout = fs.openSync(path.join(output, 'cli.stdout.log'), 'wx');
  const stderr = fs.openSync(path.join(output, 'cli.stderr.log'), 'wx');
  try {
    return await new Promise(resolve => {
      const child = spawn(process.execPath, args, {stdio: ['ignore', stdout, stderr], timeout, killSignal: 'SIGKILL'});
      let errorCode = null;
      child.once('error', error => { errorCode = error.code || 'SPAWN_FAILED'; });
      child.once('close', (code, signal) => resolve({code, signal, errorCode}));
    });
  } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
}

function artifacts(output, kind) {
  const names = kind === 'fixture' ? ['page.report.json', 'page.report.html', 'artifacts/artifacts.json']
    : ['page.report.json', 'page.report.html', 'page-0.trace.json', 'page-0.devtoolslog.json'];
  return names.map(name => {
    const file = path.join(output, name), stat = fs.lstatSync(file);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= LIMIT, 'ARTIFACT_SIZE_OR_TYPE');
    return {name, bytes: stat.size, sha256: sha256(fs.readFileSync(file))};
  });
}

function negativeControls(report, messages, expectation) {
    const completed = Array.isArray(messages) && messages.some(entry => entry.source === 'console.warn' && entry.text === MARKER && entry.url === FIXTURE);
    const checks = Object.fromEntries(AUDITS.map(id => {
      const audit = report.audits[id], expected = expectation.audits[id], items = audit?.details?.items;
      const scoresMatch = audit?.score === expected.score && audit?.scoreDisplayMode === expected.scoreDisplayMode;
      const countMatches = Array.isArray(items) && (expected.exactItems === undefined ? items.length >= expected.minimumItems : items.length === expected.exactItems);
      const locationsMatch = Array.isArray(items) && items.every(row => row.source?.url === FIXTURE);
      return [id, {score: audit?.score ?? null, scoreDisplayMode: audit?.scoreDisplayMode ?? null,
        details: audit?.details ?? null, detected: scoresMatch && countMatches && locationsMatch
          && audit?.details?.type === expected.detailsType && !audit.errorMessage}];
    }));
    return {fixtureCallsCompleted: completed, consoleMessageCount: Array.isArray(messages) ? messages.length : null,
      checks, negativeControlsPassed: !report.runtimeError && completed && Object.values(checks).every(check => check.detected)};
}

function validateReport(file, item, expectation) {
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  need(report.lighthouseVersion === '12.8.2' && !report.runtimeError, 'REPORT_RUNTIME_INVALID');
  need(report.requestedUrl === item.url && report.finalDisplayedUrl === item.url, 'REPORT_TARGET_CHANGED');
  need(report.configSettings.formFactor === 'mobile' && report.configSettings.throttlingMethod === 'simulate', 'REPORT_SETTINGS_CHANGED');
  if (item.kind === 'fixture') {
    need(JSON.stringify([...report.configSettings.onlyAudits].sort()) === JSON.stringify([...AUDITS].sort()), 'REPORT_AUDITS_CHANGED');
    const raw = JSON.parse(fs.readFileSync(path.join(path.dirname(file), 'artifacts/artifacts.json'), 'utf8'));
    return {fetchTime: report.fetchTime, lighthouseVersion: report.lighthouseVersion, configSettings: report.configSettings,
      environment: report.environment, ...negativeControls(report, raw.ConsoleMessages, expectation)};
  }
  need(JSON.stringify([...report.configSettings.onlyCategories].sort())
    === JSON.stringify(['accessibility', 'best-practices', 'performance', 'seo']), 'REPORT_CATEGORIES_CHANGED');
  // No score threshold or filtering here: every outcome, including slow samples, is retained.
  return {fetchTime: report.fetchTime, lighthouseVersion: report.lighthouseVersion,
    userAgent: report.userAgent, environment: report.environment, configSettings: report.configSettings,
    scores: Object.fromEntries(Object.entries(report.categories).map(([name, value]) => [name, value.score])),
    lcpMs: report.audits['largest-contentful-paint'].numericValue,
    fcpMs: report.audits['first-contentful-paint'].numericValue,
    tbtMs: report.audits['total-blocking-time'].numericValue};
}

async function capture(repairMode = false) {
  const deadline = Date.now() + 390000;
  const order = repairMode ? REPAIR_ORDER : ORDER;
  need(process.platform === 'linux', 'LINUX_PROC_ATTESTATION_REQUIRED');
  need(process.env.PERF_RESULTS && path.isAbsolute(process.env.PERF_RESULTS), 'PERF_RESULTS_REQUIRED');
  need(!process.env.HEADLESS, 'HEADLESS_ENV_OVERRIDE_UNSUPPORTED');
  const base = fs.realpathSync(process.env.PERF_RESULTS), output = path.join(base, repairMode ? 'diagnostic-negative-repair' : 'diagnostic');
  fs.mkdirSync(output); // Refuse to overwrite/reuse any previous experiment.
  const summary = {diagnosticOnly: true, acceptanceGate: false, adoptionApproved: false, url: repairMode ? FIXTURE : TARGET, order,
    startedAt: new Date().toISOString(), driverSha256: sha256(fs.readFileSync(__filename)), captures: [], complete: false};
  const summaryPath = path.join(output, 'experiment.json');
  jsonFile(summaryPath, summary, true);
  let repair;
  try {
    const lhPackagePath = require.resolve('lighthouse/package.json');
    const lh = JSON.parse(fs.readFileSync(lhPackagePath, 'utf8'));
    need(lh.version === '12.8.2', 'LIGHTHOUSE_VERSION_CHANGED');
    const fromLighthouse = createRequire(lhPackagePath);
    const launcherPackagePath = fromLighthouse.resolve('chrome-launcher/package.json');
    const launcherPackage = JSON.parse(fs.readFileSync(launcherPackagePath, 'utf8'));
    const launcherEntry = fromLighthouse.resolve('chrome-launcher');
    if (repairMode) {
      need(process.env.RUNNER_TEMP && path.isAbsolute(process.env.RUNNER_TEMP)
        && process.env.RUNNER_TEMP === path.resolve(process.env.RUNNER_TEMP), 'REPAIR_RUNNER_TEMP_REQUIRED');
      need(launcherPackage.version === '1.2.2', 'REPAIR_LAUNCHER_VERSION_CHANGED');
      const root = path.join(process.env.RUNNER_TEMP, 'perf-tools/node_modules');
      const cliPath = path.resolve(path.dirname(lhPackagePath), lh.bin.lighthouse);
      for (const file of [lhPackagePath, launcherPackagePath, launcherEntry, cliPath]) checkedModulePath(root, file);
      const consolePath = path.join(path.dirname(lhPackagePath), 'core/gather/gatherers/console-messages.js');
      repair = prepareRepair(root, consolePath);
      summary.repair = repair.metadata;
      jsonFile(summaryPath, summary);
      repair.apply();
      jsonFile(summaryPath, summary);
    }
    const launcher = await import(pathToFileURL(launcherEntry).href);
    need(typeof launcher.Launcher?.defaultFlags === 'function'
      && typeof launcher.getChromePath === 'function', 'LAUNCHER_INTERFACE_CHANGED');
    const defaults = launcher.Launcher.defaultFlags(), arms = buildArms(defaults);
    const chromePath = launcher.getChromePath();
    const version = spawnSync(chromePath, ['--version'], {encoding: 'utf8', timeout: 10000, maxBuffer: 65536});
    need(version.status === 0 && /Chrome 155\./.test(version.stdout), 'CHROME_VERSION_CHANGED');
    if (repairMode) need(version.stdout.trim() === 'Google Chrome 155.0.8059.39', 'REPAIR_CHROME_VERSION_CHANGED');
    const cli = path.resolve(path.dirname(lhPackagePath), lh.bin.lighthouse);
    const fixtureBytes = fs.readFileSync(path.join(FIXTURE_DIR, 'dbw-minimal-negative.html'));
    const expectationBytes = fs.readFileSync(path.join(FIXTURE_DIR, 'expected-negative.json'));
    const expectation = JSON.parse(expectationBytes);
    need(expectation.lighthouseVersion === '12.8.2' && AUDITS.every(id => expectation.audits[id]), 'FIXTURE_EXPECTATION_INVALID');
    summary.fixture = {url: FIXTURE, sha256: sha256(fixtureBytes), expectationSha256: sha256(expectationBytes),
      marker: MARKER, upstreamCommit: expectation.upstreamCommit};
    summary.tools = {node: process.version, lighthouse: lh.version, chromeLauncher: launcherPackage.version,
      chromeVersion: version.stdout.trim(), chromeExecutable: path.basename(chromePath),
      lighthousePackageSha256: sha256(fs.readFileSync(lhPackagePath)), launcherPackageSha256: sha256(fs.readFileSync(launcherPackagePath)),
      launcherEntrySha256: sha256(fs.readFileSync(launcherEntry)), lighthouseCliSha256: sha256(fs.readFileSync(cli))};
    summary.flags = arms;
    summary.additionalTraceCategories = CATEGORIES;
    jsonFile(summaryPath, summary);
    let totalBytes = 0, firstExecutable = null;
    const firstSettings = {};
    for (const [index, item] of order.entries()) {
      const {arm, kind, url} = item;
      need(Date.now() + 30000 < deadline, 'EXPERIMENT_TIME_LIMIT');
      const directory = path.join(output, `${index + 1}-${kind}-${arm}`);
      fs.mkdirSync(directory);
      const sample = {index: index + 1, arm, kind, url, startedAt: new Date().toISOString(), complete: false};
      summary.captures.push(sample);
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-render-diagnostic-'));
      let chrome;
      try {
        // Keep the instance before launch so a failed startup is still owned and cleaned up.
        chrome = new launcher.Launcher({chromePath, chromeFlags: arms[arm], ignoreDefaultFlags: true,
          userDataDir: profile, port: 0, startingUrl: 'about:blank', logLevel: 'silent'});
        await chrome.launch();
        sample.commandLineBefore = commandLine(chrome, arms[arm], profile);
        const executable = fs.readlinkSync(`/proc/${chrome.pid}/exe`);
        const executableStat = fs.statSync(executable);
        const identity = JSON.stringify([executable, executableStat.dev, executableStat.ino, executableStat.size, executableStat.mtimeMs]);
        if (firstExecutable === null) firstExecutable = identity;
        need(firstExecutable === identity, 'BROWSER_EXECUTABLE_CHANGED');
        sample.actualExecutable = path.basename(executable);
        const selection = kind === 'fixture' ? [`--only-audits=${AUDITS.join(',')}`,
          `--gather-mode=${path.join(directory, 'artifacts')}`, `--audit-mode=${path.join(directory, 'artifacts')}`]
          : ['--only-categories=performance,accessibility,best-practices,seo'];
        const args = [cli, url, `--port=${chrome.port}`, '--hostname=127.0.0.1',
          ...selection, '--output=json', '--output=html',
          `--output-path=${path.join(directory, 'page')}`, '--save-assets', `--additional-trace-categories=${CATEGORIES}`, '--quiet'];
        const timeout = Math.min(60000, deadline - Date.now() - 5000);
        need(timeout > 1000, 'EXPERIMENT_TIME_LIMIT');
        sample.cli = await runCli(args, directory, timeout);
        sample.commandLineAfter = commandLine(chrome, arms[arm], profile);
        assert.deepEqual(sample.commandLineAfter, sample.commandLineBefore);
        sample.artifacts = artifacts(directory, kind);
        totalBytes += sample.artifacts.reduce((sum, item) => sum + item.bytes, 0);
        need(totalBytes <= 256 * 1024 * 1024, 'EXPERIMENT_SIZE_LIMIT');
        sample.report = validateReport(path.join(directory, 'page.report.json'), item, expectation);
        // Port/output path are runtime connection settings, not measurement settings.
        const settings = {...sample.report.configSettings};
        for (const key of ['port', 'outputPath', 'gatherMode', 'auditMode']) delete settings[key];
        if (!firstSettings[kind]) firstSettings[kind] = settings;
        assert.deepEqual(settings, firstSettings[kind]);
        sample.complete = sample.cli.code === 0 && sample.cli.signal === null && sample.cli.errorCode === null;
      } catch (error) {
        sample.error = /^[A-Z_]+$/.test(error.message) ? error.message : 'CAPTURE_VALIDATION_FAILED';
        // Abort on instrumentation/identity/resource failures; never adapt or repeat a sample.
        throw error;
      } finally {
        try { await stopChrome(chrome, profile); }
        catch (error) { sample.cleanupError = 'BROWSER_CLEANUP_INCOMPLETE'; throw error; }
        finally {
          sample.finishedAt = new Date().toISOString();
          jsonFile(summaryPath, summary);
        }
      }
    }
    summary.complete = summary.captures.length === order.length && summary.captures.every(item => item.complete);
    need(summary.complete, 'EXPERIMENT_INCOMPLETE');
    summary.negativeControlsPassed = summary.captures.filter(item => item.kind === 'fixture')
      .every(item => item.report.negativeControlsPassed);
    need(summary.negativeControlsPassed, 'NEGATIVE_CONTROL_DETECTION_FAILED');
  } catch (error) {
    summary.error = /^[A-Z_]+$/.test(error.message) ? error.message : 'EXPERIMENT_FAILED';
    throw error;
  } finally {
    try { if (repair) repair.restore(); }
    catch (error) { summary.error = 'REPAIR_RESTORATION_FAILED'; throw error; }
    finally {
      summary.finishedAt = new Date().toISOString();
      jsonFile(summaryPath, summary);
    }
  }
  console.log(repairMode ? 'Diagnostic capture complete; two loopback negative controls retained and source restored. This is not a PR gate result.'
    : 'Diagnostic capture complete; six public samples and two negative controls retained. This is not a PR gate result.');
}

function selfTest() {
  const defaults = ['--disable-background-networking', '--disable-features=Translate,RenderDocument,MediaRouter'];
  const arms = buildArms(defaults);
  assert.deepEqual(defaults, ['--disable-background-networking', '--disable-features=Translate,RenderDocument,MediaRouter']);
  assert.equal(arms.restored[1], '--disable-features=Translate,MediaRouter');
  assert(arms.default.includes('--disable-setuid-sandbox'));
  for (const invalid of [[], ['--disable-features=Translate'], ['--disable-features=RenderDocument'],
    ['--disable-features=RenderDocument,Other', '--disable-features=Other'],
    ['--disable-features=RenderDocument,RenderDocument,Other'],
    ['--disable-features=RenderDocument,Other', '--user-data-dir=/existing'],
    ['--disable-features=RenderDocument,Other', '--enable-features=RenderDocument']]) {
    assert.throws(() => buildArms(invalid));
  }
  const argv = ['/usr/bin/google-chrome', '--remote-debugging-port=1234', '--user-data-dir=/fresh', ...arms.default, 'about:blank'];
  const normalized = attestArguments(argv, arms.default, '/fresh', 1234);
  assert(normalized.includes('--user-data-dir=<FRESH_PROFILE>'));
  assert.throws(() => attestArguments([...argv, '--disable-web-security'], arms.default, '/fresh', 1234));
  assert.throws(() => attestArguments(argv, arms.restored, '/fresh', 1234));
  assert.throws(() => attestArguments(argv, arms.default, '/other', 1234));
  assert.throws(() => attestArguments(argv, arms.default, '/fresh', 4567));
  const auto = argv.map(value => value === '--remote-debugging-port=1234' ? '--remote-debugging-port=0' : value);
  assert.throws(() => attestArguments(auto, arms.default, '/fresh', 1234));
  assert.deepEqual(attestArguments(auto, arms.default, '/fresh', 1234, true), normalized);
  const expectation = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'expected-negative.json'), 'utf8'));
  const report = {audits: Object.fromEntries(AUDITS.map(id => {
    const expected = expectation.audits[id];
    return [id, {score: expected.score, scoreDisplayMode: expected.scoreDisplayMode,
      details: {type: expected.detailsType, items: Array.from({length: expected.exactItems ?? expected.minimumItems}, () => ({source: {url: FIXTURE}}))}}];
  }))};
  const messages = [{source: 'console.warn', text: MARKER, url: FIXTURE}];
  assert.equal(negativeControls(report, messages, expectation).negativeControlsPassed, true);
  assert.equal(negativeControls(report, [], expectation).negativeControlsPassed, false);
  assert.equal(negativeControls(report, undefined, expectation).negativeControlsPassed, false);
  const falsePass = structuredClone(report); falsePass.audits['no-document-write'].score = 1;
  assert.equal(negativeControls(falsePass, messages, expectation).negativeControlsPassed, false);
  const wrongSource = structuredClone(report); wrongSource.audits['geolocation-on-start'].details.items[0].source.url = 'http://other.invalid/';
  assert.equal(negativeControls(wrongSource, messages, expectation).negativeControlsPassed, false);
  assert.throws(() => repairBytes(Buffer.from(CONSOLE_ORIGINAL_TEXT)), /REPAIR_SOURCE_HASH_MISMATCH/);
  assert.throws(() => repairBytes(Buffer.from(CONSOLE_REPAIRED_TEXT)), /REPAIR_SOURCE_HASH_MISMATCH/);
  const root = '/runner/_temp/perf-tools/node_modules';
  assert.equal(relativeModulePath(root, root + '/lighthouse/core/gather/gatherers/console-messages.js'),
    'lighthouse/core/gather/gatherers/console-messages.js');
  for (const invalid of [root, root + '-other/lighthouse/console-messages.js', '/other/console-messages.js', root + '/../outside.js']) {
    assert.throws(() => relativeModulePath(root, invalid));
  }
  assert.equal(REPAIR_ORDER.length, 2);
  assert(REPAIR_ORDER.every(item => item.url === FIXTURE && item.kind === 'fixture'));
  assert.equal(ORDER.length, 8);
  console.log('PASS: flags, process attestation, negative controls and repair input/path rejection; no browser executed.');
}

module.exports = {buildArms, attestArguments, negativeControls, repairBytes, relativeModulePath};
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') selfTest();
  else if (process.argv.length === 3 && ['--capture', '--capture-negative-repair'].includes(process.argv[2])) capture(process.argv[2] === '--capture-negative-repair').catch(() => {
    console.error('Diagnostic failed; retained experiment.json contains the bounded status. No automatic retry.');
    process.exitCode = 1;
  });
  else { console.error('Choose --self-test (no browser), --capture, or --capture-negative-repair (Linux diagnostic only).'); process.exitCode = 2; }
}
