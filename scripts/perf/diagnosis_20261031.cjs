'use strict';
// One fixed diagnosis. This does not change or replace PageSpeed acceptance.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const {performance} = require('node:perf_hooks');

const SOURCE_MAIN = 'dadaae45eae45005200e94bd6a569a6b621f2275';
const RUNTIME_SHA256 = '4e3390bb49a10a2257b9efb42ce70320f74b3d0fcfe7432d3c4de3eb25fd45be';
const CONTROL_SHA256 = 'f22325df3615fd949b5765a12cbf5e6b03422ed77d6ea768b045c5f857ad07b6';
const PRODUCTION = 'https://simplememofast.com/en/';
const CONTROL = 'http://127.0.0.1:8765/cpu-control.html';
const GTAG_ID = 'G-EPZVZKCVQG';
const GTAG = 'https://www.googletagmanager.com/gtag/js';
const MAX_BODIES = 8, MAX_BODY_BYTES = 8 * 1024 * 1024;
const ROOT = path.resolve(__dirname, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400000 ? value : null;
const need = (condition, code) => { if (!condition) throw new Error(code); };
const CODES = new Set(['RUNTIME_CHANGED', 'CONTROL_SOURCE_CHANGED', 'CDP_CONNECTION_FAILED', 'CDP_COMMAND_FAILED',
  'CDP_COMMAND_TIMEOUT', 'CDP_DISCONNECTED', 'CDP_PROTOCOL_INVALID', 'OBSERVER_INCOMPLETE', 'REPORT_METRICS_INVALID', 'TRACE_MAIN_FRAME_UNAVAILABLE',
  'CONTROL_TRACE_INVALID', 'LIGHTHOUSE_CLI_FAILED', 'REPORT_RUNTIME_INVALID', 'REPORT_TARGET_CHANGED',
  'REPORT_CATEGORIES_CHANGED', 'ARTIFACT_SIZE_OR_TYPE', 'CHROME_VERSION_CHANGED', 'CHROME_BINARY_CHANGED',
  'CHROME_FILE_CHANGED', 'CHROME_VERSION_UNAVAILABLE', 'BROWSER_EXECUTABLE_NOT_PINNED', 'BROWSER_EXECUTABLE_CHANGED',
  'BROWSER_CLEANUP_INCOMPLETE', 'REPAIR_RESTORE_READBACK_FAILED', 'REPAIR_RESTORE_UNEXPECTED_CONTENT',
  'REPAIR_INODE_CHANGED', 'FLAGS_ACTUAL_MISMATCH', 'FLAGS_PROFILE_MISMATCH', 'FLAGS_PORT_MISMATCH']);
const errorCode = error => CODES.has(error?.message) ? error.message : 'DIAGNOSTIC_OPERATION_FAILED';
const fatalCode = code => ['RUNTIME_CHANGED', 'CONTROL_SOURCE_CHANGED', 'CHROME_BINARY_CHANGED', 'CHROME_FILE_CHANGED',
  'BROWSER_EXECUTABLE_NOT_PINNED', 'BROWSER_EXECUTABLE_CHANGED', 'BROWSER_CLEANUP_INCOMPLETE',
  'FLAGS_ACTUAL_MISMATCH', 'REPAIR_INODE_CHANGED'].includes(code) || code.startsWith('REPAIR_RESTORE_');
const writeJson = (file, data, exclusive = false) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', {flag: exclusive ? 'wx' : 'w'});

function requireAllocation(env, event) {
  need(env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/Codex/perf-six-capture-diagnosis-20261031'
    && env.GITHUB_RUN_ATTEMPT === '1' && env.DIAG_MAIN_SHA === SOURCE_MAIN && event?.created === true,
  'DIAGNOSTIC_ALLOCATION_NOT_AUTHORIZED');
}

function fixedPlan(slot) {
  need(['runner-a', 'runner-b'].includes(slot), 'INVALID_SLOT');
  return [1, 2, 3].flatMap(pair => ['control', 'production-en'].map(kind => ({
    id: `${slot}-${pair}-${kind}`, pair, kind, url: kind === 'control' ? CONTROL : PRODUCTION,
    status: 'pending', errors: [],
  })));
}

async function runFixedPlan(slot, attempt, persist) {
  const result = {schema: 1, protocol: 'fixed-diagnosis-20261031', slot, sourceMain: SOURCE_MAIN,
    runtimeSha256: RUNTIME_SHA256, controlSha256: CONTROL_SHA256,
    plannedCaptureCount: 6, plannedProductionCaptureCount: 3, retries: 0, trials: fixedPlan(slot),
    observer: {bodyRead: 'at-loadingFinished-before-Lighthouse-closes-its-page',
      bodyHash: 'after-CLI-from-CDP-decoded-response-body', requestHeadersRetained: false,
      responseHeadersRetained: false, bodiesPublished: false,
      limitation: 'Body retrieval and in-memory retention add observer overhead. All captures use the same observer; work depends on response count and size. Controls measure one fixed integer workload, not total host capacity.'},
    diagnosticComplete: false};
  persist(result); // All six planned entries exist before the first browser starts.
  let contamination = null;
  for (const trial of result.trials) {
    if (contamination) {
      Object.assign(trial, {status: 'blocked', attempted: false, errors: ['PRIOR_GUARD_FAILURE'], blockedBy: contamination});
      persist(result);
      continue;
    }
    trial.status = 'running';
    trial.attempted = true;
    trial.startedAt = new Date().toISOString();
    persist(result);
    try {
      Object.assign(trial, await attempt({...trial}));
      trial.status = trial.errors.length ? 'incomplete' : 'complete';
      if (trial.fatalGuardFailure) contamination = {trialId: trial.id, causes: trial.errors};
    } catch (error) {
      trial.status = 'incomplete';
      const code = errorCode(error);
      trial.errors.push(code);
      if (fatalCode(code)) {
        trial.fatalGuardFailure = true;
        contamination = {trialId: trial.id, causes: trial.errors};
      }
    } finally {
      trial.finishedAt = new Date().toISOString();
      persist(result);
    }
  }
  const en = result.trials.filter(trial => trial.kind === 'production-en');
  const tbt = en.map(trial => trial.metrics?.tbtMs);
  const median = en.every(trial => trial.status === 'complete') && tbt.every(value => number(value) !== null)
    ? [...tbt].sort((a, b) => a - b)[1] : null;
  result.budgetObservation = {existingTbtBudgetMs: 200, productionEnMedianTbtMs: median,
    exceedsExistingBudget: median === null ? null : median > 200,
    allThreeProductionCapturesValid: en.every(trial => trial.status === 'complete'),
    scope: 'Observation only; no changed budget, replacement pass or production approval.'};
  result.diagnosticComplete = result.trials.every(trial => trial.status === 'complete');
  result.attemptedTrials = result.trials.filter(trial => trial.attempted).length;
  result.cliCaptureAttempts = result.trials.filter(trial => trial.cliAttempted).length;
  result.validCaptures = result.trials.filter(trial => trial.status === 'complete').length;
  persist(result);
  return result;
}

function isGtag(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js'
      && !url.username && !url.password && !url.hash && url.searchParams.getAll('id').length === 1
      && url.searchParams.get('id') === GTAG_ID && [...url.searchParams.keys()].length === 1;
  } catch { return false; }
}

function safeUrl(value) {
  if (value === PRODUCTION || value === CONTROL) return value;
  try {
    const url = new URL(value);
    if (url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js'
      && !url.username && !url.password) return GTAG;
  } catch { /* Unknown strings never become public labels. */ }
  return '<other>';
}

function measuredMain(log, url) {
  const candidates = Array.isArray(log) ? log.filter(event => event.method === 'Network.requestWillBeSent'
    && event.params?.type === 'Document' && event.params?.request?.url === url) : [];
  return candidates.length === 1 ? candidates[0].params : null;
}

// No headers, cookies, POST data, initiators, arbitrary URLs or raw CDP events are stored.
class NetworkObservation {
  constructor(url, send, now = () => performance.now()) {
    this.url = url; this.send = send; this.now = now; this.started = now();
    this.groups = []; this.records = []; this.pending = []; this.errors = new Set(); this.excludedCandidates = 0;
    this.sessionIds = new Set(); this.closed = false;
  }
  event(sessionId, method, data) {
    if (this.closed || !data || typeof data !== 'object') return;
    if (method === 'Network.requestWillBeSent') {
      const url = data.request?.url;
      if (data.type === 'Document' && url === this.url) {
        const existing = this.groups.find(group => group.sessionId === sessionId && group.frameId === data.frameId && group.loaderId === data.loaderId);
        if (existing) { existing.errors.push('MAIN_REQUEST_AMBIGUOUS'); return; }
        if (this.groups.length >= 8) { this.errors.add('NAVIGATION_LIMIT'); return; }
        const group = {sessionId, requestId: data.requestId, frameId: data.frameId, loaderId: data.loaderId, errors: []};
        this.groups.push(group);
        if (![sessionId, data.requestId, data.frameId, data.loaderId].every(value => typeof value === 'string' && value.length > 0)
          || data.request.method !== 'GET') group.errors.push('MAIN_IDENTITY_MISSING');
        if (data.redirectResponse) group.errors.push('MAIN_REDIRECT');
        this.add('main-document', group, data);
      } else if (isGtag(url)) {
        const group = this.groups.find(item => sessionId === item.sessionId && data.frameId === item.frameId && data.loaderId === item.loaderId);
        if (!group || this.url !== PRODUCTION || data.documentURL !== PRODUCTION
          || data.type !== 'Script' || data.request.method !== 'GET') {
          this.excludedCandidates++; return;
        }
        this.add('gtag', group, data);
      }
      return;
    }
    const record = this.records.find(item => item.sessionId === sessionId && item.requestId === data.requestId);
    if (!record) return;
    if (method === 'Network.responseReceived') {
      const response = data.response || {};
      const allowed = record.kind === 'gtag' ? isGtag(response.url) : response.url === this.url;
      if (!allowed || data.loaderId !== record.group.loaderId
        || (data.frameId !== undefined && data.frameId !== record.group.frameId)) {
        record.errors.push('RESPONSE_IDENTITY_MISMATCH'); return;
      }
      record.responseSeen = true;
      record.status = number(response.status);
      record.mimeType = ['text/html', 'application/javascript', 'text/javascript'].includes(response.mimeType) ? response.mimeType : '<other>';
      if (record.kind === 'gtag' ? !['application/javascript', 'text/javascript'].includes(record.mimeType) : record.mimeType !== 'text/html') {
        record.errors.push('RESPONSE_MIME_MISMATCH');
      }
      record.fromDiskCache = response.fromDiskCache === true;
      record.fromServiceWorker = response.fromServiceWorker === true;
    } else if (method === 'Network.loadingFailed') {
      record.errors.push('RESPONSE_LOADING_FAILED');
    } else if (method === 'Network.loadingFinished') {
      if (record.finished) { record.errors.push('RESPONSE_FINISH_DUPLICATE'); return; }
      record.finished = true;
      record.encodedDataLength = number(data.encodedDataLength);
      if (!record.responseSeen || record.errors.length) return;
      record.bodyReadStartMs = this.now() - this.started;
      const task = this.send('Network.getResponseBody', {requestId: record.requestId}, sessionId)
        .then(body => {
          if (typeof body?.body !== 'string' || body.body.length > MAX_BODY_BYTES * 4 / 3 + 4
            || typeof body.base64Encoded !== 'boolean') throw new Error('BODY_INVALID');
          // Keep only in RAM; decoding and hashing happen after the CLI has ended.
          record.body = body.body; record.base64Encoded = body.base64Encoded;
        }).catch(() => record.errors.push('BODY_UNAVAILABLE'))
        .finally(() => { record.bodyReadEndMs = this.now() - this.started; });
      this.pending.push(task);
    }
  }
  add(kind, group, data) {
    const {sessionId} = group;
    if (this.records.length >= MAX_BODIES) { this.errors.add('RESPONSE_LIMIT'); return; }
    if (this.records.some(item => item.sessionId === sessionId && item.requestId === data.requestId)) {
      this.errors.add('REQUEST_ID_AMBIGUOUS'); return;
    }
    this.records.push({kind, group, sessionId, requestId: data.requestId, responseSeen: false, finished: false,
      errors: data.redirectResponse ? ['RESPONSE_REDIRECT'] : []});
  }
  async finish(devtoolsLog) {
    this.closed = true;
    await Promise.all(this.pending);
    const requests = Array.isArray(devtoolsLog) ? devtoolsLog.filter(event => event.method === 'Network.requestWillBeSent') : [];
    const main = measuredMain(devtoolsLog, this.url);
    if (!main) this.errors.add('LIGHTHOUSE_MAIN_CORROBORATION_MISSING');
    const selected = this.groups.filter(group => main && group.requestId === main.requestId
      && group.loaderId === main.loaderId && group.frameId === main.frameId);
    const group = selected.length === 1 ? selected[0] : null;
    if (!group) this.errors.add('MEASURED_MAIN_REQUEST_MISSING_OR_AMBIGUOUS');
    for (const error of group?.errors || []) this.errors.add(error);
    const candidates = this.records.filter(record => record.group === group);
    if (this.url === PRODUCTION && candidates.filter(record => record.kind === 'gtag').length !== 1) this.errors.add('GTAG_REQUEST_COUNT');
    const records = candidates.map(record => {
      const sameRequest = requests.filter(event => event.params?.requestId === record.requestId
        && event.params?.loaderId === group.loaderId && event.params?.frameId === group.frameId
        && (record.kind === 'gtag' ? isGtag(event.params?.request?.url) : event.params?.request?.url === this.url));
      if (sameRequest.length !== 1) record.errors.push('LIGHTHOUSE_REQUEST_CORROBORATION_MISSING');
      let bodySha256 = null, decodedBytes = null;
      try {
        need(record.finished && typeof record.body === 'string', 'BODY_MISSING');
        if (record.base64Encoded) need(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.body), 'BODY_INVALID');
        const bytes = Buffer.from(record.body, record.base64Encoded ? 'base64' : 'utf8');
        need(bytes.length > 0 && bytes.length <= MAX_BODY_BYTES, 'BODY_INVALID');
        bodySha256 = sha256(bytes); decodedBytes = bytes.length;
      } catch { record.errors.push('BODY_MISSING_OR_INVALID'); }
      finally { delete record.body; }
      if (record.status !== 200) record.errors.push('RESPONSE_NOT_OK');
      if (this.url === CONTROL && bodySha256 !== CONTROL_SHA256) record.errors.push('CONTROL_RESPONSE_HASH_MISMATCH');
      const summary = {kind: record.kind, url: record.kind === 'gtag' ? GTAG : this.url,
        expectedGtagId: record.kind === 'gtag' ? GTAG_ID : null,
        status: record.status ?? null, mimeType: record.mimeType ?? null,
        fromDiskCache: record.fromDiskCache === true, fromServiceWorker: record.fromServiceWorker === true,
        encodedDataLength: record.encodedDataLength ?? null, decodedBytes, bodySha256,
        bodyReadStartMs: number(record.bodyReadStartMs), bodyReadEndMs: number(record.bodyReadEndMs),
        requestIdSha256: sha256(String(record.requestId)), errors: [...new Set(record.errors)]};
      for (const error of summary.errors) this.errors.add(error);
      return summary;
    });
    // Lighthouse's later BFCache audit can navigate away and back. These are
    // not the performance navigation; never choose a first/last request by luck.
    for (const record of this.records) delete record.body;
    return {complete: this.errors.size === 0, errors: [...this.errors], records,
      measuredNavigationCorroborated: !!group,
      mainFrameSha256: group ? sha256(group.frameId) : null,
      mainLoaderSha256: group ? sha256(group.loaderId) : null,
      excludedNavigationCount: this.groups.length - (group ? 1 : 0), excludedCandidateCount: this.excludedCandidates,
      bodyHashSemantics: 'SHA256 of UTF8/base64-decoded Network.getResponseBody, not compressed wire bytes'};
  }
}

async function attachObserver(port, url, {fetchImpl = fetch, Socket = WebSocket} = {}) {
  need(Number.isSafeInteger(port) && port > 0 && port <= 65535, 'CDP_CONNECTION_FAILED');
  const response = await fetchImpl(`http://127.0.0.1:${port}/json/version`, {signal: AbortSignal.timeout(5000)});
  const endpoint = new URL((await response.json()).webSocketDebuggerUrl);
  need(endpoint.protocol === 'ws:' && endpoint.hostname === '127.0.0.1' && endpoint.port === String(port)
    && /^\/devtools\/browser\/[a-f0-9-]+$/.test(endpoint.pathname), 'CDP_CONNECTION_FAILED');
  const socket = new Socket(endpoint.href), pending = new Map();
  let nextId = 0;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('CDP_DISCONNECTED')); }
    pending.clear();
    try { socket.close(); } catch { /* Already closed. */ }
  };
  const send = (method, params, sessionId) => new Promise((resolve, reject) => {
    need(['Target.setAutoAttach', 'Network.enable', 'Network.getResponseBody'].includes(method), 'CDP_PROTOCOL_INVALID');
    const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP_COMMAND_TIMEOUT')); }, 5000);
    pending.set(id, {resolve, reject, timer});
    try { socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})); }
    catch {
      clearTimeout(timer); pending.delete(id); reject(new Error('CDP_DISCONNECTED'));
    }
  });
  const observation = new NetworkObservation(url, send);
  socket.addEventListener('message', event => {
    if (typeof event.data !== 'string' || event.data.length > 16 * 1024 * 1024) { observation.errors.add('CDP_MESSAGE_INVALID'); return; }
    let message;
    try { message = JSON.parse(event.data); } catch { observation.errors.add('CDP_MESSAGE_INVALID'); return; }
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error) request.reject(new Error('CDP_COMMAND_FAILED')); else request.resolve(message.result);
    } else if (message.method === 'Target.attachedToTarget' && message.params?.targetInfo?.type === 'page') {
      const sessionId = message.params.sessionId;
      observation.sessionIds.add(sessionId);
      send('Network.enable', {}, sessionId)
        .catch(() => observation.errors.add('NETWORK_ENABLE_FAILED'));
    } else if (observation.sessionIds.has(message.sessionId)) {
      observation.event(message.sessionId, message.method, message.params);
    }
  });
  socket.addEventListener('close', close);
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP_CONNECTION_FAILED')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true});
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP_CONNECTION_FAILED')); }, {once: true});
      socket.addEventListener('close', () => { clearTimeout(timer); reject(new Error('CDP_DISCONNECTED')); }, {once: true});
    });
    await send('Target.setAutoAttach', {autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
      filter: [{type: 'page', exclude: false}, {exclude: true}]});
    return {finish: log => observation.finish(log), close};
  } catch (error) { close(); throw error; }
}

function controlSummary(trace) {
  const tasks = [['warmup', 1, 148855246], ['warmup', 2, 148855246],
    ['sample', 1, 3576595659], ['sample', 2, 3576595659], ['sample', 3, 3576595659]];
  const names = ['cpu-control-v1:fcp-seen', ...tasks.flatMap(([phase, index, checksum]) =>
    [`cpu-control-v1:${phase}:${index}:start`, `cpu-control-v1:${phase}:${index}:end:${checksum}`]), 'cpu-control-v1:done'];
  const events = (trace.traceEvents || []).filter(event => typeof event.name === 'string'
    && event.name.startsWith('cpu-control-v1:') && typeof event.cat === 'string'
    && event.cat.split(',').includes('blink.user_timing') && ['R', 'I'].includes(event.ph));
  need(events.length === names.length && names.every(name => events.filter(event => event.name === name).length === 1), 'CONTROL_TRACE_INVALID');
  const ordered = names.map(name => events.find(event => event.name === name));
  need(ordered.every((event, index) => Number.isFinite(event.ts) && event.ts >= 0
    && event.pid === ordered[0].pid && event.tid === ordered[0].tid
    && (index === 0 || event.ts >= ordered[index - 1].ts)), 'CONTROL_TRACE_INVALID');
  need((trace.traceEvents || []).some(event => event.name === 'firstContentfulPaint'
    && event.pid === ordered[0].pid && Number.isFinite(event.ts) && event.ts <= ordered[0].ts), 'CONTROL_TRACE_INVALID');
  return {complete: true, fixtureSha256: CONTROL_SHA256, warmupIterations: 1048576, sampleIterations: 16777216,
    tasks: tasks.map(([phase, index, checksum], i) => ({phase, index, checksum,
      durationMs: (ordered[2 + 2 * i].ts - ordered[1 + 2 * i].ts) / 1000,
      precedingGapMs: (ordered[1 + 2 * i].ts - ordered[2 * i].ts) / 1000})),
    capturedSpanMs: (ordered.at(-1).ts - ordered[0].ts) / 1000};
}

function reportSummary(report) {
  const value = key => number(report.audits?.[key]?.numericValue);
  const metrics = {benchmarkIndex: number(report.environment?.benchmarkIndex), tbtMs: value('total-blocking-time'),
    fcpMs: value('first-contentful-paint'), lcpMs: value('largest-contentful-paint'), cls: value('cumulative-layout-shift')};
  need(metrics.benchmarkIndex !== null && metrics.tbtMs !== null, 'REPORT_METRICS_INVALID');
  const rows = key => Array.isArray(report.audits?.[key]?.details?.items) ? report.audits[key].details.items : [];
  const longTasks = rows('long-tasks').filter(item => number(item.duration) !== null).map(item => ({
    url: safeUrl(item.url), durationMs: item.duration, startTimeMs: number(item.startTime),
  }));
  const bootup = rows('bootup-time').filter(item => number(item.total) !== null)
    .map(item => ({url: safeUrl(item.url), totalMs: item.total}));
  return {metrics, configSettingsSha256: sha256(JSON.stringify(report.configSettings || null)),
    longTasksSemantics: 'Lighthouse audit timings; simulated when the unchanged default mobile simulation is used',
    longTasks: longTasks.slice(0, 20), omittedLongTasks: Math.max(0, longTasks.length - 20),
    bootup: bootup.slice(0, 20), omittedBootup: Math.max(0, bootup.length - 20)};
}

function traceSummary(trace, log, url) {
  const main = measuredMain(log, url), events = Array.isArray(trace.traceEvents) ? trace.traceEvents : [];
  const fcps = events.filter(event => event.name === 'firstContentfulPaint' && Number.isFinite(event.ts)
    && (event.args?.frame || event.args?.data?.frame) === main?.frameId);
  need(main && fcps.length === 1, 'TRACE_MAIN_FRAME_UNAVAILABLE');
  const fcp = fcps[0];
  const onMain = events.filter(event => event.pid === fcp.pid && event.tid === fcp.tid && event.ph === 'X'
    && Number.isFinite(event.ts) && Number.isFinite(event.dur) && event.dur >= 0);
  const tasks = onMain.filter(event => event.name === 'RunTask' && event.dur >= 50000).sort((a, b) => b.dur - a.dur);
  const eventTypes = new Set(['FunctionCall', 'EvaluateScript', 'CompileScript', 'v8.compile', 'TimerFire', 'EventDispatch', 'Layout', 'UpdateLayoutTree']);
  const frame = item => ({url: safeUrl(item?.url || item?.scriptName),
    functionName: ['gtag', 'dataLayer'].includes(item?.functionName) ? item.functionName : '<other>',
    functionNameSha256: typeof item?.functionName === 'string' ? sha256(item.functionName) : null,
    lineNumber: number(item?.lineNumber), columnNumber: number(item?.columnNumber)});
  return {semantics: 'Observed trace RunTask wall durations on the measured FCP thread; distinct from simulated Lighthouse TBT',
    measuredFrameSha256: sha256(main.frameId), taskCount: tasks.length, omittedTasks: Math.max(0, tasks.length - 20),
    tasks: tasks.slice(0, 20).map(task => {
      const attribution = onMain.filter(event => eventTypes.has(event.name) && event.ts >= task.ts
        && event.ts + event.dur <= task.ts + task.dur).sort((a, b) => b.dur - a.dur);
      return {durationMs: task.dur / 1000, startRelativeToFcpMs: (task.ts - fcp.ts) / 1000,
        omittedAttributions: Math.max(0, attribution.length - 5),
        attributions: attribution.slice(0, 5).map(event => {
          const data = event.args?.data || event.args?.beginData || {};
          return {kind: event.name, durationMs: event.dur / 1000, ...frame(data),
            stack: Array.isArray(data.stackTrace) ? data.stackTrace.slice(0, 5).map(frame) : []};
        })};
    })};
}

function runnerSummary() {
  const cpus = os.cpus(), model = cpus[0]?.model;
  let bootIdSha256 = null;
  try {
    const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    if (/^[a-f0-9-]{36}$/.test(bootId)) bootIdSha256 = sha256(bootId);
  } catch { /* Unavailable identity is not a reason to select another runner. */ }
  return {architecture: process.arch === 'x64' ? 'x64' : '<other>', logicalCores: cpus.length,
    cpuModel: typeof model === 'string' && /^(Intel|AMD|ARM)[A-Za-z0-9().@ -]{0,100}$/.test(model) ? model : '<other>',
    bootIdSha256};
}

function runtimeSummary(receipt) {
  return {runtimeSha256: digest(receipt.runtimeSha256), chromeSha256: digest(receipt.tools?.chromeSha256),
    nodeVersion: receipt.tools?.node === 'v24.22.1' ? 'v24.22.1' : null,
    lighthouseVersion: receipt.tools?.lighthouse === '12.8.2' ? '12.8.2' : null,
    launcherVersion: receipt.tools?.chromeLauncher === '1.2.2' ? '1.2.2' : null,
    chromeVersion: receipt.tools?.chromeVersion === 'Google Chrome for Testing 155.0.8059.39' ? 'Google Chrome for Testing 155.0.8059.39' : null,
    lighthousePackageSha256: digest(receipt.tools?.lighthousePackageSha256),
    launcherPackageSha256: digest(receipt.tools?.launcherPackageSha256),
    launcherEntrySha256: digest(receipt.tools?.launcherEntrySha256),
    lighthouseCliSha256: digest(receipt.tools?.lighthouseCliSha256),
    flagsSha256: receipt.flags ? sha256(JSON.stringify(receipt.flags)) : null,
    commandLineBeforeSha256: receipt.commandLineBefore ? sha256(JSON.stringify(receipt.commandLineBefore)) : null,
    commandLineAfterSha256: receipt.commandLineAfter ? sha256(JSON.stringify(receipt.commandLineAfter)) : null,
    originalCollectorSha256: digest(receipt.repair?.originalSha256), patchedCollectorSha256: digest(receipt.repair?.patchedSha256),
    restoredCollectorSha256: digest(receipt.repair?.restoration?.sha256),
    restorationAttempted: receipt.repair?.restoration?.attempted === true,
    restorationSucceeded: receipt.repair?.restoration?.succeeded === true};
}

async function captureTrial(trial, rawDirectory) {
  const errors = [], receipt = {id: trial.id}, outputPrefix = path.join(rawDirectory, trial.id);
  const receiptFile = outputPrefix + '.runtime.json', logDirectory = outputPrefix + '.runtime';
  fs.mkdirSync(logDirectory);
  const persist = () => writeJson(receiptFile, receipt);
  const result = {errors, artifactHashes: [], checkoutEnSha256: sha256(fs.readFileSync(path.join(ROOT, 'en/index.html')))};
  let runtime, log = [];
  try {
    const runtimeSource = fs.readFileSync(path.join(__dirname, 'lighthouse_runtime.cjs'));
    need(sha256(runtimeSource) === RUNTIME_SHA256, 'RUNTIME_CHANGED');
    // Only error codes present in the exact reviewed source can reach the export.
    for (const match of runtimeSource.toString('utf8').matchAll(/'([A-Z_]{3,80})'/g)) CODES.add(match[1]);
    need(sha256(fs.readFileSync(path.join(__dirname, 'diagnosis_cpu_20261031.html'))) === CONTROL_SHA256, 'CONTROL_SOURCE_CHANGED');
    runtime = require('./lighthouse_runtime.cjs');
    await runtime.withPinnedRuntime(receipt, async ({cli, port}) => {
      let observer;
      try { observer = await attachObserver(port, trial.url); }
      catch (error) { errors.push(errorCode(error)); }
      try {
        receipt.cli = await runtime._guards.runCli(runtime.buildCliArguments(cli, trial.url, port, outputPrefix), logDirectory, 60000);
        if (observer) {
          try { log = JSON.parse(fs.readFileSync(outputPrefix + '-0.devtoolslog.json', 'utf8')); } catch { /* recorded by coverage checks */ }
          result.network = await observer.finish(log);
          if (!result.network.complete) errors.push('OBSERVER_INCOMPLETE');
        }
      } finally { observer?.close(); }
    }, persist);
  } catch (error) { errors.push(errorCode(error)); }
  finally { persist(); result.runtime = runtimeSummary(receipt); }
  if (runtime) {
    if (receipt.cli) {
      try { runtime.requireCliSuccess(receipt.cli); } catch (error) { errors.push(errorCode(error)); }
    }
    try {
      result.artifactHashes = runtime.readMeasurementArtifacts({url: trial.url, outputPrefix});
      Object.assign(result, reportSummary(JSON.parse(fs.readFileSync(outputPrefix + '.report.json', 'utf8'))));
      const trace = JSON.parse(fs.readFileSync(outputPrefix + '-0.trace.json', 'utf8'));
      result.observedLongTasks = traceSummary(trace, log, trial.url);
      if (trial.kind === 'control') result.control = controlSummary(trace);
    } catch (error) { errors.push(errorCode(error)); }
  }
  result.artifactHashes.push({name: path.basename(receiptFile), bytes: fs.statSync(receiptFile).size, sha256: sha256(fs.readFileSync(receiptFile))});
  result.cliAttempted = !!receipt.cli;
  result.cliExitCode = Number.isInteger(receipt.cli?.code) ? receipt.cli.code : null;
  result.errors = [...new Set(errors)];
  result.fatalGuardFailure = result.errors.some(fatalCode)
    || (receipt.repair?.restoration?.attempted === true && receipt.repair.restoration.succeeded !== true);
  return result;
}

async function main() {
  need(process.argv.length === 2, 'UNEXPECTED_ARGUMENTS');
  requireAllocation(process.env, JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  const slot = process.env.DIAG_SLOT, temp = process.env.RUNNER_TEMP, output = process.env.DIAG_RESULTS;
  fixedPlan(slot);
  need(typeof temp === 'string' && path.isAbsolute(temp) && fs.realpathSync(temp) === temp, 'RUNNER_TEMP_REQUIRED');
  need(typeof output === 'string' && path.isAbsolute(output) && fs.realpathSync(output) === output
    && output.startsWith(temp + path.sep), 'RESULTS_DIRECTORY_INVALID');
  const rawParent = path.join(temp, 'perf-diagnosis-private');
  need(output !== rawParent && !output.startsWith(rawParent + path.sep), 'RESULTS_DIRECTORY_INVALID');
  fs.mkdirSync(rawParent, {recursive: true});
  const rawDirectory = path.join(rawParent, slot);
  fs.mkdirSync(rawDirectory);
  const file = path.join(output, slot + '.json');
  let first = true;
  const result = await runFixedPlan(slot, trial => captureTrial(trial, rawDirectory), summary => {
    summary.runner = runnerSummary();
    writeJson(file, summary, first); first = false;
  });
  console.log(`${slot}: six planned entries finalized; ${result.attemptedTrials} attempted, ${result.validCaptures} valid. See sanitized receipt.`);
  if (!result.diagnosticComplete) process.exitCode = 1;
}

module.exports = {requireAllocation, fixedPlan, runFixedPlan, isGtag, safeUrl, NetworkObservation, attachObserver,
  controlSummary, reportSummary, traceSummary, runtimeSummary};
if (require.main === module) main().catch(() => {
  console.error('Fixed diagnosis setup failed. No retries were attempted.'); process.exitCode = 1;
});
