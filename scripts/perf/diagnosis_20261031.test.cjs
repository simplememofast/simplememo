'use strict';
// Synthetic events only. These tests never launch a browser or contact a site.
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const driver = require('./diagnosis_20261031.cjs');
const MAIN = 'https://simplememofast.com/en/';
const TAG = 'https://www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG';
const SECRET = 'PRIVATE_COOKIE_HEADER_QUERY_BODY_SENTINEL';
const hash = text => createHash('sha256').update(text).digest('hex');

function request(id, url, type = 'Script', extra = {}) {
  return {requestId: id, frameId: 'frame', loaderId: 'loader', type, documentURL: MAIN,
    request: {url, method: 'GET', headers: {Cookie: SECRET}, postData: SECRET}, ...extra};
}
function response(id, url, mimeType, extra = {}) {
  return {requestId: id, frameId: 'frame', loaderId: 'loader',
    response: {url, status: 200, mimeType, headers: {'Set-Cookie': SECRET}, ...extra}};
}
function networkFixture(sendOverride) {
  const calls = [], log = [];
  const observation = new driver.NetworkObservation(MAIN, async (method, params, session) => {
    calls.push({method, params, session});
    return sendOverride ? sendOverride(method, params, session) : {body: SECRET + params.requestId, base64Encoded: false};
  });
  function event(method, data, session = 'page') {
    if (method === 'Network.requestWillBeSent') log.push({method, params: data});
    observation.event(session, method, data);
  }
  function loadMain() {
    event('Network.requestWillBeSent', request('main', MAIN, 'Document'));
    event('Network.responseReceived', response('main', MAIN, 'text/html'));
    event('Network.loadingFinished', {requestId: 'main', encodedDataLength: 100});
  }
  function loadTag(extra = {}) {
    event('Network.requestWillBeSent', request('tag', TAG, 'Script', extra));
    event('Network.responseReceived', response('tag', TAG, 'application/javascript'));
    event('Network.loadingFinished', {requestId: 'tag', encodedDataLength: 200});
  }
  return {observation, calls, log, event, loadMain, loadTag};
}

test('only first creation of the exact fixed diagnostic branch is an authorized allocation', () => {
  const env = {GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/Codex/perf-six-capture-diagnosis-20261031',
    GITHUB_RUN_ATTEMPT: '1', DIAG_MAIN_SHA: 'dadaae45eae45005200e94bd6a569a6b621f2275'};
  driver.requireAllocation(env, {created: true});
  for (const key of Object.keys(env)) assert.throws(() => driver.requireAllocation({...env, [key]: 'other'}, {created: true}));
  for (const created of [undefined, false, 'true']) assert.throws(() => driver.requireAllocation(env, {created}));
});

test('each of two exact slots has three control/production pairs with no adaptive scheduling', () => {
  for (const slot of ['runner-a', 'runner-b']) {
    const plan = driver.fixedPlan(slot);
    assert.equal(plan.length, 6);
    assert.deepEqual(plan.map(trial => [trial.pair, trial.kind]),
      [[1, 'control'], [1, 'production-en'], [2, 'control'], [2, 'production-en'], [3, 'control'], [3, 'production-en']]);
    assert.equal(new Set(plan.map(trial => trial.id)).size, 6);
  }
  for (const slot of ['', undefined, 'runner-c', 'runner-a;echo secret']) assert.throws(() => driver.fixedPlan(slot));
});

test('all entries are persisted before capture; failures continue exactly through remaining fixed attempts', async () => {
  const attempted = [], snapshots = [];
  const result = await driver.runFixedPlan('runner-a', async trial => {
    assert.equal(snapshots[0].trials.length, 6);
    assert(snapshots[0].trials.every(item => item.status === 'pending'));
    attempted.push(trial.id);
    if (attempted.length === 1) throw new Error('CDP_COMMAND_FAILED');
    return {errors: attempted.length === 4 ? ['OBSERVER_INCOMPLETE'] : [], metrics: {tbtMs: 0}};
  }, snapshot => snapshots.push(JSON.parse(JSON.stringify(snapshot))));
  assert.equal(attempted.length, 6);
  assert.deepEqual(attempted, driver.fixedPlan('runner-a').map(trial => trial.id));
  assert.equal(result.trials[0].status, 'incomplete');
  assert.deepEqual(result.trials[0].errors, ['CDP_COMMAND_FAILED']);
  assert.equal(result.trials[3].status, 'incomplete');
  assert.equal(result.trials[5].status, 'complete');
  assert.equal(result.diagnosticComplete, false);
  assert.equal(result.budgetObservation.productionEnMedianTbtMs, null);
});

test('all six successful captures finish even when their existing-budget observation is red', async () => {
  let count = 0;
  const result = await driver.runFixedPlan('runner-b', async trial => {
    count++;
    return {errors: [], metrics: {tbtMs: trial.kind === 'control' ? 0 : 200 + trial.pair * 100}};
  }, () => {});
  assert.equal(count, 6);
  assert.equal(result.diagnosticComplete, true);
  assert.equal(result.budgetObservation.productionEnMedianTbtMs, 400);
  assert.equal(result.budgetObservation.exceedsExistingBudget, true);
});

test('known guard contamination preserves remaining allocations as blocked and never starts another browser', async () => {
  let count = 0;
  const result = await driver.runFixedPlan('runner-a', async () => {
    count++;
    return {errors: ['BROWSER_CLEANUP_INCOMPLETE'], fatalGuardFailure: true};
  }, () => {});
  assert.equal(count, 1);
  assert.equal(result.trials.length, 6);
  assert(result.trials.slice(1).every(trial => trial.status === 'blocked' && trial.attempted === false
    && trial.blockedBy.causes.includes('BROWSER_CLEANUP_INCOMPLETE')));
  assert.equal(result.diagnosticComplete, false);
});

test('an unexpected rejection carrying a fatal guard code also blocks all remaining fixed entries', async () => {
  let count = 0;
  const result = await driver.runFixedPlan('runner-b', async () => {
    count++; throw new Error('REPAIR_RESTORE_READBACK_FAILED');
  }, () => {});
  assert.equal(count, 1);
  assert.equal(result.trials.length, 6);
  assert(result.trials.slice(1).every(trial => trial.status === 'blocked'));
  assert.equal(result.attemptedTrials, 1);
  assert.equal(result.cliCaptureAttempts, 0);
});

test('same-document main and gtag body hashes retain no headers, query values or body text', async () => {
  const fixture = networkFixture();
  fixture.loadMain(); fixture.loadTag();
  fixture.event('Network.requestWillBeSentExtraInfo', {requestId: 'tag', headers: {Authorization: SECRET}});
  const summary = await fixture.observation.finish(fixture.log);
  assert.equal(summary.complete, true);
  assert.equal(summary.records.length, 2);
  assert.equal(summary.records.find(item => item.kind === 'gtag').bodySha256, hash(SECRET + 'tag'));
  assert.deepEqual(fixture.calls.map(call => call.method), ['Network.getResponseBody', 'Network.getResponseBody']);
  assert(fixture.calls.every(call => call.session === 'page' && Object.keys(call.params).join() === 'requestId'));
  assert(!JSON.stringify(summary).includes(SECRET));
  assert(!JSON.stringify(summary).includes('?'));
  assert(!fixture.observation.records.some(record => Object.hasOwn(record, 'body')));
});

test('body decoding is explicit and pending reads are drained before hashing, without retry', async () => {
  const resolvers = [], bytes = Buffer.from([0, 255, 42]);
  const fixture = networkFixture(() => new Promise(resolve => resolvers.push(resolve)));
  fixture.loadMain(); fixture.loadTag();
  let finished = false;
  const pending = fixture.observation.finish(fixture.log).then(result => { finished = true; return result; });
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal(fixture.calls.length, 2);
  for (const resolve of resolvers) resolve({body: bytes.toString('base64'), base64Encoded: true});
  const summary = await pending;
  assert(summary.records.every(record => record.bodySha256 === hash(bytes) && record.decodedBytes === 3));
  assert.equal(fixture.calls.length, 2);
});

test('ambiguous requests, redirects and mismatched document/session/frame/loader cannot count as coverage', async () => {
  for (const extra of [{frameId: 'other'}, {loaderId: 'other'}, {documentURL: MAIN + '?private=' + SECRET},
    {type: 'Fetch'}, {redirectResponse: {url: 'https://private.invalid/' + SECRET}}]) {
    const fixture = networkFixture(); fixture.loadMain(); fixture.loadTag(extra);
    const summary = await fixture.observation.finish(fixture.log);
    assert.equal(summary.complete, false);
    assert(!JSON.stringify(summary).includes(SECRET));
  }
  const duplicate = networkFixture(); duplicate.loadMain(); duplicate.loadTag();
  duplicate.event('Network.requestWillBeSent', request('tag', TAG));
  assert.equal((await duplicate.observation.finish(duplicate.log)).complete, false);
  const otherSession = networkFixture(); otherSession.loadMain();
  otherSession.event('Network.requestWillBeSent', request('tag', TAG), 'wrong-page');
  assert.equal((await otherSession.observation.finish(otherSession.log)).complete, false);
});

test('wrong origins/IDs and body eviction or a closed target are recorded as incomplete without a refetch', async () => {
  for (const url of [TAG.replace('www.googletagmanager.com', 'www.googletagmanager.com.attacker.invalid'),
    TAG.replace('G-EPZVZKCVQG', SECRET), TAG.replace('/gtag/js', '/private'),
    'https://user:secret@www.googletagmanager.com/gtag/js?id=G-EPZVZKCVQG', TAG + '&private=' + SECRET]) {
    assert.equal(driver.isGtag(url), false);
  }
  for (const result of [null, {body: SECRET, base64Encoded: true}, {body: '', base64Encoded: false}]) {
    const fixture = networkFixture(async () => {
      if (result === null) throw new Error('server error with ' + SECRET);
      return result;
    });
    fixture.loadMain(); fixture.loadTag();
    const summary = await fixture.observation.finish(fixture.log);
    assert.equal(summary.complete, false);
    assert.equal(fixture.calls.length, 2);
    assert(!JSON.stringify(summary).includes(SECRET));
  }
});

test('observer socket setup failure and synchronous send failure close their owned connection', async () => {
  for (const mode of ['connection-error', 'send-error', 'success']) {
    let instance;
    class MockSocket extends EventTarget {
      constructor() {
        super(); instance = this; this.closeCount = 0; this.sent = [];
        queueMicrotask(() => this.dispatchEvent(new Event(mode === 'connection-error' ? 'error' : 'open')));
      }
      send(text) {
        if (mode === 'send-error') throw new Error(SECRET);
        const command = JSON.parse(text); this.sent.push(command);
        queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify({id: command.id, result: {}})})));
      }
      close() { this.closeCount++; if (this.closeCount === 1) this.dispatchEvent(new Event('close')); }
    }
    const options = {Socket: MockSocket, fetchImpl: async () => ({json: async () => ({
      webSocketDebuggerUrl: 'ws://127.0.0.1:1234/devtools/browser/abc-123',
    })})};
    if (mode === 'success') {
      const observer = await driver.attachObserver(1234, MAIN, options);
      assert.deepEqual(instance.sent[0].params, {autoAttach: true, waitForDebuggerOnStart: false, flatten: true,
        filter: [{type: 'page', exclude: false}, {exclude: true}]});
      observer.close(); observer.close();
    } else await assert.rejects(driver.attachObserver(1234, MAIN, options), /CDP_/);
    assert.equal(instance.closeCount, 1);
  }
});

test('missing or late completion and missing Lighthouse corroboration remain visibly incomplete', async () => {
  const fixture = networkFixture(); fixture.loadMain();
  fixture.event('Network.requestWillBeSent', request('tag', TAG));
  const pending = fixture.observation.finish(fixture.log);
  fixture.event('Network.responseReceived', response('tag', TAG, 'application/javascript'));
  fixture.event('Network.loadingFinished', {requestId: 'tag', encodedDataLength: 200});
  const summary = await pending;
  assert.equal(summary.complete, false);
  assert(summary.errors.includes('BODY_MISSING_OR_INVALID'));
  assert.equal(fixture.calls.length, 1);
  const missingLog = networkFixture(); missingLog.loadMain(); missingLog.loadTag();
  assert((await missingLog.observation.finish([])).errors.includes('LIGHTHOUSE_MAIN_CORROBORATION_MISSING'));
});

test('later BFCache navigation is separated and only the measured Lighthouse loader supplies hashes', async () => {
  const fixture = networkFixture(); fixture.loadMain(); fixture.loadTag();
  const measuredLog = [...fixture.log];
  fixture.event('Network.requestWillBeSent', request('main-later', MAIN, 'Document', {loaderId: 'later'}));
  fixture.event('Network.responseReceived', {...response('main-later', MAIN, 'text/html'), loaderId: 'later'});
  fixture.event('Network.loadingFinished', {requestId: 'main-later', encodedDataLength: 100});
  fixture.event('Network.requestWillBeSent', request('tag-later', TAG, 'Script', {loaderId: 'later'}));
  fixture.event('Network.responseReceived', {...response('tag-later', TAG, 'application/javascript'), loaderId: 'later'});
  fixture.event('Network.loadingFinished', {requestId: 'tag-later', encodedDataLength: 200});
  const summary = await fixture.observation.finish(measuredLog);
  assert.equal(summary.complete, true);
  assert.equal(summary.excludedNavigationCount, 1);
  assert.equal(summary.records.length, 2);
  assert.equal(summary.records.find(record => record.kind === 'gtag').bodySha256, hash(SECRET + 'tag'));
  assert(!fixture.observation.records.some(record => Object.hasOwn(record, 'body')));
});

function controlTrace(duration = 100) {
  const events = [{name: 'firstContentfulPaint', ts: 500, pid: 1, tid: 1}];
  let now = 1000;
  const mark = name => events.push({name: 'cpu-control-v1:' + name, cat: 'blink.user_timing', ph: 'R', ts: now, pid: 1, tid: 1});
  mark('fcp-seen');
  for (const [phase, count, checksum] of [['warmup', 2, 148855246], ['sample', 3, 3576595659]]) {
    for (let index = 1; index <= count; index++) {
      now += 50; mark(`${phase}:${index}:start`);
      now += duration; mark(`${phase}:${index}:end:${checksum}`);
    }
  }
  mark('done');
  return {traceEvents: events};
}

test('fixed control requires every unique checksum marker in one ordered thread after FCP, even at zero duration', () => {
  const summary = driver.controlSummary(controlTrace(0));
  assert.equal(summary.tasks.length, 5);
  assert(summary.tasks.every(task => task.durationMs === 0));
  for (const mutate of [
    trace => trace.traceEvents.pop(),
    trace => trace.traceEvents.push({...trace.traceEvents[2]}),
    trace => { trace.traceEvents[3].name = 'cpu-control-v1:warmup:1:end:1'; },
    trace => { trace.traceEvents[3].tid = 2; },
    trace => { trace.traceEvents[3].ts = 1; },
    trace => { trace.traceEvents[0].ts = 1e9; },
  ]) {
    const trace = controlTrace(); mutate(trace);
    assert.throws(() => driver.controlSummary(trace), /CONTROL_TRACE_INVALID/);
  }
});

test('report and runtime summaries export only fixed labels, safe URLs, numeric data and hashes', () => {
  const report = {environment: {benchmarkIndex: 100, secret: SECRET}, audits: {
    'total-blocking-time': {numericValue: 0}, 'first-contentful-paint': {numericValue: 10},
    'long-tasks': {details: {items: [{url: TAG + '&private=' + SECRET, duration: 60, startTime: 20, stack: SECRET},
      {url: 'https://example.invalid/' + SECRET, duration: 70, startTime: SECRET}]}},
    'bootup-time': {details: {items: [{url: SECRET, total: 100}]}}
  }};
  const result = driver.reportSummary(report);
  assert.equal(result.metrics.tbtMs, 0);
  assert.equal(result.longTasks[0].url, 'https://www.googletagmanager.com/gtag/js');
  assert.equal(result.longTasks[1].url, '<other>');
  assert(!JSON.stringify(result).includes(SECRET));
  const runtime = driver.runtimeSummary({tools: {chromeVersion: SECRET}, flags: [SECRET],
    commandLineBefore: [SECRET], repair: {restoration: {error: SECRET}}});
  assert(!JSON.stringify(runtime).includes(SECRET));
  assert.throws(() => driver.reportSummary({audits: {'total-blocking-time': {numericValue: SECRET}}}), /REPORT_METRICS_INVALID/);
});

test('observed trace tasks bind the measured frame and distinguish raw durations from simulated audit metrics', () => {
  const log = [{method: 'Network.requestWillBeSent', params: request('main', MAIN, 'Document')}];
  const trace = {traceEvents: [
    {name: 'firstContentfulPaint', ts: 100000, pid: 1, tid: 2, args: {frame: 'frame'}},
    {name: 'RunTask', ph: 'X', ts: 90000, dur: 70000, pid: 1, tid: 2},
    {name: 'FunctionCall', ph: 'X', ts: 100000, dur: 50000, pid: 1, tid: 2,
      args: {data: {scriptName: TAG + '&secret=' + SECRET, functionName: SECRET, lineNumber: 2,
        stackTrace: [{url: 'https://secret.invalid/' + SECRET, functionName: SECRET, lineNumber: 3}]}}},
    {name: 'Layout', ph: 'X', ts: 150000, dur: 10000, pid: 1, tid: 2},
    {name: 'RunTask', ph: 'X', ts: 90000, dur: 900000, pid: 99, tid: 100},
  ]};
  const result = driver.traceSummary(trace, log, MAIN);
  assert.equal(result.taskCount, 1);
  assert.equal(result.tasks[0].durationMs, 70);
  assert.equal(result.tasks[0].startRelativeToFcpMs, -10);
  assert.equal(result.tasks[0].attributions[0].url, 'https://www.googletagmanager.com/gtag/js');
  assert(result.tasks[0].attributions.some(item => item.kind === 'Layout'));
  assert(!JSON.stringify(result).includes(SECRET));
  assert.throws(() => driver.traceSummary(trace, [], MAIN), /TRACE_MAIN_FRAME_UNAVAILABLE/);
});
