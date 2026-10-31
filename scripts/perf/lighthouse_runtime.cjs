'use strict';
// Pinned measurement runtime. Budgets remain in summarize.py.
// Guard functions below are unchanged from diagnostic commit
// bc374916c9d72eb994d6ef1aebcf3a131082437c; no experiment driver is imported.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {spawn, spawnSync} = require('node:child_process');

const GUARD_SOURCE_COMMIT = 'bc374916c9d72eb994d6ef1aebcf3a131082437c';
const CHROME = Object.freeze({
  version: 'Google Chrome for Testing 155.0.8059.39',
  sourceUrl: 'https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip',
  archiveSha256: '55672d1f392fd3e7b7a08621b6e804e6bcb39d40cf155504abb74b3a021ea8ea',
  executableSha256: 'ed05e73a2cdf875326fcfa438b31c71a6a885a353610731dd52090dfc476f778',
});
const CONSOLE_ORIGINAL_SHA256 = '512cb67e34e30672ec872a4fc8f846904a5b77006426186c6bf7819993a1191a';
const CONSOLE_ORIGINAL_TEXT = "config: [{name: 'discouragedAPIUse', threshold: -1}]";
const CONSOLE_REPAIRED_TEXT = "config: [{name: 'discouragedAPIUse', threshold: -2}]";
const COMMON = Object.freeze(['--headless', '--no-sandbox', '--disable-dev-shm-usage']);
const CATEGORIES = Object.freeze(['performance', 'accessibility', 'best-practices', 'seo']);
const URLS = Object.freeze({
  'local-ja': 'http://127.0.0.1:8765/',
  'production-ja': 'https://simplememofast.com/',
  'local-en': 'http://127.0.0.1:8765/en/',
  'production-en': 'https://simplememofast.com/en/',
});
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


function ordinaryPlan(url, outputPrefix, resultsDirectory) {
  need(typeof url === 'string' && typeof outputPrefix === 'string'
    && typeof resultsDirectory === 'string', 'MEASUREMENT_ARGUMENTS_INVALID');
  need(path.isAbsolute(resultsDirectory) && resultsDirectory === path.resolve(resultsDirectory)
    && fs.realpathSync(resultsDirectory) === resultsDirectory
    && fs.statSync(resultsDirectory).isDirectory(), 'RESULTS_DIRECTORY_INVALID');
  need(path.isAbsolute(outputPrefix) && outputPrefix === path.resolve(outputPrefix)
    && path.dirname(outputPrefix) === resultsDirectory, 'OUTPUT_PREFIX_OUTSIDE_RESULTS');
  const name = path.basename(outputPrefix), match = /^(local|production)-(ja|en)-([123])$/.exec(name);
  need(match && URLS[match[1] + '-' + match[2]] === url, 'MEASUREMENT_TARGET_MISMATCH');
  return {url, outputPrefix, name, logDirectory: outputPrefix + '.runtime',
    receiptPath: outputPrefix + '.runtime.json'};
}

function browserPaths(temp, configuredPath) {
  need(typeof temp === 'string' && path.isAbsolute(temp) && temp === path.resolve(temp), 'RUNNER_TEMP_REQUIRED');
  const directory = path.join(temp, 'perf-browser');
  const executable = path.join(directory, 'chrome-linux64/chrome');
  need(configuredPath === executable, 'CHROME_PATH_NOT_PINNED');
  checkedModulePath(temp, executable);
  fs.accessSync(executable, fs.constants.X_OK);
  return {executable, archive: path.join(directory, 'chrome-linux64.zip')};
}

function browserFileHash(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    need(before.isFile() && before.nlink === 1 && before.size > 0 && before.size < 512 * 1024 * 1024,
      'CHROME_FILE_INVALID');
    const hash = createHash('sha256'), chunk = Buffer.alloc(1024 * 1024);
    let bytes = 0, count;
    while ((count = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      bytes += count;
      need(bytes <= before.size, 'CHROME_FILE_CHANGED');
      hash.update(chunk.subarray(0, count));
    }
    const after = fs.fstatSync(fd), named = fs.lstatSync(file);
    need(bytes === before.size && before.dev === named.dev && before.ino === named.ino
      && before.size === after.size && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs && !named.isSymbolicLink(), 'CHROME_FILE_CHANGED');
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

function recordBrowserVersion(receipt, version, persist) {
  receipt.browser.version = {stdout: typeof version.stdout === 'string' ? version.stdout.trim() : '',
    stderr: typeof version.stderr === 'string' ? version.stderr.trim() : '',
    status: version.status, signal: version.signal, errorCode: version.error?.code || null};
  // Keep the actual output even when a new runner/browser combination fails the guard.
  persist();
  need(version.status === 0 && version.signal === null && !version.error, 'CHROME_VERSION_UNAVAILABLE');
  need(receipt.browser.version.stdout === CHROME.version, 'CHROME_VERSION_CHANGED');
}

function verifyPinnedBrowser(receipt, persist) {
  receipt.browser = {sourceUrl: CHROME.sourceUrl, reviewedArchiveSha256: CHROME.archiveSha256,
    expectedVersion: CHROME.version, expectedExecutableSha256: CHROME.executableSha256};
  persist();
  const {executable} = browserPaths(process.env.RUNNER_TEMP, process.env.CHROME_PATH);
  const identity = fs.statSync(executable);
  receipt.browser.executable = path.relative(process.env.RUNNER_TEMP, executable);
  receipt.browser.executableSha256 = browserFileHash(executable);
  persist();
  need(receipt.browser.executableSha256 === CHROME.executableSha256, 'CHROME_BINARY_CHANGED');
  const version = spawnSync(executable, ['--version'], {encoding: 'utf8', timeout: 10000, maxBuffer: 65536});
  recordBrowserVersion(receipt, version, persist);
  const after = fs.statSync(executable);
  need(identity.dev === after.dev && identity.ino === after.ino && identity.size === after.size
    && identity.mtimeMs === after.mtimeMs && identity.ctimeMs === after.ctimeMs, 'CHROME_FILE_CHANGED');
  return {executable, identity};
}

function verifyBrowserInstallation() {
  const directory = process.env.PERF_RESULTS;
  need(typeof directory === 'string' && path.isAbsolute(directory)
    && fs.realpathSync(directory) === directory, 'RESULTS_DIRECTORY_INVALID');
  const file = path.join(directory, 'browser-install.json');
  const receipt = {schema: 1, startedAt: new Date().toISOString(), complete: false,
    sourceUrl: CHROME.sourceUrl, expectedArchiveSha256: CHROME.archiveSha256};
  jsonFile(file, receipt, true);
  const persist = () => jsonFile(file, receipt);
  try {
    need(process.platform === 'linux' && process.arch === 'x64', 'LINUX_X64_BROWSER_REQUIRED');
    const {archive} = browserPaths(process.env.RUNNER_TEMP, process.env.CHROME_PATH);
    checkedModulePath(process.env.RUNNER_TEMP, archive);
    receipt.archiveSha256 = browserFileHash(archive);
    persist();
    need(receipt.archiveSha256 === CHROME.archiveSha256, 'CHROME_ARCHIVE_CHANGED');
    verifyPinnedBrowser(receipt, persist);
    receipt.complete = true;
    return receipt;
  } catch (error) {
    receipt.error = errorCode(error);
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    persist();
  }
}

function requireVersions(tools) {
  need(tools.node === 'v24.22.1', 'NODE_VERSION_CHANGED');
  need(tools.lighthouse === '12.8.2', 'LIGHTHOUSE_VERSION_CHANGED');
  need(tools.chromeLauncher === '1.2.2', 'LAUNCHER_VERSION_CHANGED');
  need(tools.chromeVersion === CHROME.version, 'CHROME_VERSION_CHANGED');
  need(tools.chromeSha256 === CHROME.executableSha256, 'CHROME_BINARY_CHANGED');
}

function buildCliArguments(cli, url, port, outputPrefix) {
  need(typeof cli === 'string' && path.isAbsolute(cli)
    && Number.isSafeInteger(port) && port > 0 && port <= 65535, 'CLI_CONNECTION_INVALID');
  return [cli, url, '--port=' + port, '--hostname=127.0.0.1',
    '--only-categories=' + CATEGORIES.join(','), '--output=json', '--output=html',
    '--output-path=' + outputPrefix, '--save-assets', '--quiet'];
}

function requireCliSuccess(result) {
  need(result && result.code === 0 && result.signal === null && result.errorCode === null, 'LIGHTHOUSE_CLI_FAILED');
}

// Cleanup cannot prevent restoration. Any failed operation remains a failure.
async function withRestoration(repair, operation, cleanup) {
  try {
    repair.apply();
    return await operation();
  } finally {
    try { await cleanup(); }
    finally { repair.restore(); }
  }
}

// Shared internal boundary for the ordinary entry and reviewed loopback harnesses.
// The callback may select their audits; it cannot alter this browser/collector setup.
async function withPinnedRuntime(receipt, operation, persist = () => {}) {
  need(process.platform === 'linux', 'LINUX_PROC_ATTESTATION_REQUIRED');
  need(!process.env.HEADLESS, 'HEADLESS_ENV_OVERRIDE_UNSUPPORTED');
  const temp = process.env.RUNNER_TEMP;
  need(temp && path.isAbsolute(temp) && temp === path.resolve(temp), 'RUNNER_TEMP_REQUIRED');
  const root = path.join(temp, 'perf-tools/node_modules');
  const lhPackagePath = require.resolve('lighthouse/package.json');
  const lh = JSON.parse(fs.readFileSync(lhPackagePath, 'utf8'));
  const fromLighthouse = createRequire(lhPackagePath);
  const launcherPackagePath = fromLighthouse.resolve('chrome-launcher/package.json');
  const launcherPackage = JSON.parse(fs.readFileSync(launcherPackagePath, 'utf8'));
  const launcherEntry = fromLighthouse.resolve('chrome-launcher');
  const cli = path.resolve(path.dirname(lhPackagePath), lh.bin.lighthouse);
  for (const file of [lhPackagePath, launcherPackagePath, launcherEntry, cli]) checkedModulePath(root, file);
  need(lh.version === '12.8.2' && launcherPackage.version === '1.2.2', 'MEASUREMENT_TOOLS_CHANGED');
  const launcher = await import(pathToFileURL(launcherEntry).href);
  need(typeof launcher.Launcher?.defaultFlags === 'function', 'LAUNCHER_INTERFACE_CHANGED');
  const arms = buildArms(launcher.Launcher.defaultFlags()), flags = arms.restored;
  const {executable: chromePath, identity: checkedExecutable} = verifyPinnedBrowser(receipt, persist);
  const tools = {node: process.version, lighthouse: lh.version, chromeLauncher: launcherPackage.version,
    chromeVersion: receipt.browser.version.stdout, chromeExecutable: path.basename(chromePath),
    chromeSha256: receipt.browser.executableSha256,
    lighthousePackageSha256: sha256(fs.readFileSync(lhPackagePath)),
    launcherPackageSha256: sha256(fs.readFileSync(launcherPackagePath)),
    launcherEntrySha256: sha256(fs.readFileSync(launcherEntry)),
    lighthouseCliSha256: sha256(fs.readFileSync(cli))};
  Object.assign(receipt, {tools, flags, guardSourceCommit: GUARD_SOURCE_COMMIT,
    runtimeSha256: sha256(fs.readFileSync(__filename))});
  persist();
  requireVersions(tools);
  const consolePath = path.join(path.dirname(lhPackagePath), 'core/gather/gatherers/console-messages.js');
  const repair = prepareRepair(root, consolePath);
  receipt.repair = repair.metadata;
  let chrome, profile;
  return withRestoration(repair, async () => {
    profile = fs.mkdtempSync(path.join(os.tmpdir(), 'simplememo-lighthouse-'));
    chrome = new launcher.Launcher({chromePath, chromeFlags: flags, ignoreDefaultFlags: true,
      userDataDir: profile, port: 0, startingUrl: 'about:blank', logLevel: 'silent'});
    await chrome.launch();
    receipt.commandLineBefore = commandLine(chrome, flags, profile);
    const executable = fs.readlinkSync('/proc/' + chrome.pid + '/exe');
    const stat = fs.statSync(executable);
    need(executable === chromePath && stat.dev === checkedExecutable.dev && stat.ino === checkedExecutable.ino
      && stat.size === checkedExecutable.size && stat.mtimeMs === checkedExecutable.mtimeMs
      && stat.ctimeMs === checkedExecutable.ctimeMs,
      'BROWSER_EXECUTABLE_NOT_PINNED');
    const identity = JSON.stringify([executable, stat.dev, stat.ino, stat.size, stat.mtimeMs]);
    receipt.actualExecutable = path.basename(executable);
    const result = await operation({cli, port: chrome.port});
    receipt.commandLineAfter = commandLine(chrome, flags, profile);
    assert.deepEqual(receipt.commandLineAfter, receipt.commandLineBefore);
    const afterPath = fs.readlinkSync('/proc/' + chrome.pid + '/exe');
    const after = fs.statSync(afterPath);
    need(identity === JSON.stringify([afterPath, after.dev, after.ino, after.size, after.mtimeMs]),
      'BROWSER_EXECUTABLE_CHANGED');
    return result;
  }, async () => {
    if (profile) await stopChrome(chrome, profile);
  });
}

function readMeasurementArtifacts(plan) {
  const files = ['.report.json', '.report.html', '-0.trace.json', '-0.devtoolslog.json'].map(suffix => {
    const file = plan.outputPrefix + suffix, stat = fs.lstatSync(file);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= LIMIT, 'ARTIFACT_SIZE_OR_TYPE');
    return {name: path.basename(file), bytes: stat.size, sha256: sha256(fs.readFileSync(file))};
  });
  const report = JSON.parse(fs.readFileSync(plan.outputPrefix + '.report.json', 'utf8'));
  need(report.lighthouseVersion === '12.8.2' && !report.runtimeError, 'REPORT_RUNTIME_INVALID');
  need(report.requestedUrl === plan.url && report.finalDisplayedUrl === plan.url, 'REPORT_TARGET_CHANGED');
  need(JSON.stringify([...(report.configSettings.onlyCategories || [])].sort())
    === JSON.stringify([...CATEGORIES].sort()), 'REPORT_CATEGORIES_CHANGED');
  return files;
}

function errorCode(error) {
  return typeof error?.message === 'string' && /^[A-Z_]+$/.test(error.message)
    ? error.message : 'MEASUREMENT_FAILED';
}

function requireNewOutput(outputPrefix) {
  for (const suffix of ['.report.json', '.report.html', '-0.trace.json', '-0.devtoolslog.json', '.runtime.json', '.runtime']) {
    let absent = false;
    try { fs.lstatSync(outputPrefix + suffix); }
    catch (error) { if (error.code === 'ENOENT') absent = true; else throw error; }
    need(absent, 'OUTPUT_ALREADY_EXISTS');
  }
}

async function measure(url, outputPrefix) {
  const plan = ordinaryPlan(url, outputPrefix, process.env.PERF_RESULTS);
  requireNewOutput(outputPrefix);
  fs.mkdirSync(plan.logDirectory);
  const receipt = {schema: 1, name: plan.name, url: plan.url,
    startedAt: new Date().toISOString(), complete: false};
  jsonFile(plan.receiptPath, receipt, true);
  try {
    receipt.cli = await withPinnedRuntime(receipt, ({cli, port}) =>
      runCli(buildCliArguments(cli, plan.url, port, plan.outputPrefix), plan.logDirectory, 60000),
    () => jsonFile(plan.receiptPath, receipt));
    requireCliSuccess(receipt.cli);
    receipt.artifacts = readMeasurementArtifacts(plan);
    receipt.complete = true;
    return receipt;
  } catch (error) {
    receipt.error = errorCode(error);
    throw error;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    jsonFile(plan.receiptPath, receipt);
  }
}

module.exports = {measure, withPinnedRuntime, ordinaryPlan, buildCliArguments, requireVersions,
  requireCliSuccess, withRestoration, readMeasurementArtifacts, requireNewOutput,
  browserPaths, browserFileHash, recordBrowserVersion, verifyBrowserInstallation, CHROME,
  _guards: {repairBytes, relativeModulePath, checkedModulePath, readRepairFd, prepareRepair,
    buildArms, attestArguments, commandLine, stopChrome, runCli}};
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--verify-browser') {
    try { verifyBrowserInstallation(); }
    catch (error) {
      console.error('Browser installation failed: ' + errorCode(error) + '.');
      process.exitCode = 1;
    }
  } else if (process.argv.length !== 4) {
    console.error('Usage: node scripts/perf/lighthouse_runtime.cjs <ordinary URL> <PERF_RESULTS/prefix>');
    process.exitCode = 2;
  } else {
    measure(process.argv[2], process.argv[3]).catch(error => {
      console.error('Lighthouse measurement failed: ' + errorCode(error) + '. No automatic retry.');
      process.exitCode = 1;
    });
  }
}
