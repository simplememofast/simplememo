import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { modelSummary, receipt, save, checkWiring, summarize, fromSummary, readHandoffSummary, EXIT_CODES, AUDIT_VERDICTS, MAX_EXECUTION_BYTES, endingFacts, TOOL_NAMES } from './autopilot-diagnostics.mjs';
import { pack, MAIN_EXECUTION_COPY, SUMMARY_FILE } from './autopilot-publish.mjs';
import { VERDICTS } from './autopilot-audit.mjs';
import { interpretRun } from './autopilot-act.mjs';
import { appendProgress, readProgress, progressCommand, checkProgressWiring,
  PROGRESS_FILE, MAX_PROGRESS_BYTES, MAX_PROGRESS_EVENTS, TIME_BOX, TIME_BOX_FILE, TIME_STAGES,
  timeBox, writeTimeBox, readTimeBox, timeLeft, isoSecond, checkTimeBoxWiring } from './lib/autopilot-progress.mjs';

export async function selftest() {
  let tests = 0;
  const test = (name, fn) => { try { fn(); tests++; } catch (error) { error.message = name + ': ' + error.message; throw error; } };
  const secret = 'PRIVATE_SENTINEL_DO_NOT_EXPORT';
  const progressTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'));
  const progressTool = fileURLToPath(new URL('./lib/autopilot-progress.mjs', import.meta.url));
  const journal = path.join(progressTemp, PROGRESS_FILE);
  const cleanProgress = () => {
    for (const item of fs.readdirSync(progressTemp)) fs.rmSync(path.join(progressTemp, item), { recursive: true, force: true });
  };
  const beginProgress = () => appendProgress(progressTemp, 'model', 'start', null, { initialize: true });
  const progressCLI = args => spawnSync(process.execPath, [progressTool, ...args], {
    encoding: 'utf8', env: { RUNNER_TEMP: progressTemp, MODEL_OUTCOME: 'failure' }, timeout: 5000,
  });
  try {
    test('each complete marker is fsynced before the writer returns', () => {
      const sync = fs.fsyncSync;
      let filesSynced = 0;
      fs.fsyncSync = fd => {
        if (fs.fstatSync(fd).isFile()) {
          filesSynced++;
          assert.equal(readProgress(progressTemp).events.length, filesSynced);
        }
        return sync(fd);
      };
      try {
        beginProgress();
        assert.equal(filesSynced, 1);
        appendProgress(progressTemp, 'context', 'start');
        assert.equal(filesSynced, 2);
      } finally { fs.fsyncSync = sync; }
    });
    cleanProgress();
    test('durable milestone remains after abrupt process death without any SDK result', () => {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e',
        `import { appendProgress } from ${JSON.stringify(new URL('./lib/autopilot-progress.mjs', import.meta.url).href)};
         appendProgress(process.env.RUNNER_TEMP, 'selection', 'start', null, { initialize: true });
         process.kill(process.pid, 'SIGKILL');`], { env: { RUNNER_TEMP: progressTemp }, timeout: 5000 });
      assert.equal(child.signal, 'SIGKILL');
      assert.equal(readProgress(progressTemp).events[0].phase, 'selection');
      assert.equal(fs.existsSync(path.join(progressTemp, 'claude-execution-output.json')), false);
      const out = progressCLI(['--progress-finish']);
      assert.equal(out.status, 0, out.stderr);
      const receipt = JSON.parse(fs.readFileSync(path.join(progressTemp, 'autopilot-progress/progress.json')));
      assert.equal(receipt.events.length, 2);
      assert.equal(receipt.events[1].exit_code, null);
      assert.equal(receipt.model_outcome, 'failure');
      assert.equal(receipt.production_verified, false);
      assert.equal(receipt.cost_observation, 'not_collected');
      assert(!Object.hasOwn(receipt, 'total_cost_usd'));
    });
    cleanProgress();
    test('only observed integer exits may be reported; validation never becomes verified', () => {
      beginProgress();
      appendProgress(progressTemp, 'validation', 'start');
      appendProgress(progressTemp, 'validation', 'end', 0);
      appendProgress(progressTemp, 'validation', 'end', 1);
      appendProgress(progressTemp, 'validation', 'end');
      const rows = readProgress(progressTemp).events;
      assert.deepEqual(rows.map(r => r.validation), ['unknown', 'unknown', 'reported_passed', 'reported_failed', 'unknown']);
      assert(rows.every(r => r.provenance === 'untrusted_runner'));
      assert(rows.every((r, i) => i === 0 || r.at >= rows[i - 1].at));
      assert.throws(beginProgress, 'initialization must never overwrite earlier evidence');
    });
    for (const args of [
      ['--progress', secret, 'start'], ['--progress', 'context', secret],
      ['--progress', 'validation', 'end', secret], ['--progress', 'validation', 'end', '256'],
      ['--progress', 'validation', 'start', '0'], ['--progress', 'model', 'end'],
      ['--progress', 'validation', 'end', '0', secret],
    ]) test('invalid progress CLI cannot export arbitrary strings or change the journal', () => {
      const before = fs.readFileSync(journal);
      const out = progressCLI(args);
      assert.equal(out.status, 1);
      assert(!`${out.stdout}${out.stderr}`.includes(secret));
      assert.deepEqual(fs.readFileSync(journal), before);
    });
    cleanProgress();
    test('torn last write retains the validated prefix and explicit missingness', () => {
      beginProgress();
      fs.appendFileSync(journal, '{"raw":"' + secret);
      const read = readProgress(progressTemp);
      assert.equal(read.state, 'truncated'); assert.equal(read.events.length, 1);
      const out = progressCLI(['--progress-finish']);
      assert.equal(out.status, 0);
      const text = fs.readFileSync(path.join(progressTemp, 'autopilot-progress/progress.json'), 'utf8');
      assert(!text.includes(secret)); assert.equal(JSON.parse(text).journal_state, 'truncated');
    });
    cleanProgress();
    test('extra keys and arbitrary values stop export at the last valid event', () => {
      const first = beginProgress();
      fs.appendFileSync(journal, JSON.stringify({ ...first, sequence: 2, raw: secret }) + '\n');
      assert.deepEqual(readProgress(progressTemp), { state: 'invalid', events: [first] });
    });
    for (const [key, value] of [['phase', secret], ['at', secret], ['exit_code', secret],
      ['validation', 'verified'], ['provenance', 'trusted'], ['sequence', 100], ['schema_version', 2]]) {
      cleanProgress();
      test('untrusted journal fields are revalidated: ' + key, () => {
        const first = beginProgress();
        fs.writeFileSync(journal, JSON.stringify({ ...first, [key]: value }) + '\n');
        assert.deepEqual(readProgress(progressTemp), { state: 'invalid', events: [] });
      });
    }
    for (const kind of ['symlink', 'hardlink', 'directory', 'fifo', 'oversized', 'missing']) {
      cleanProgress();
      test('unsafe progress source is unavailable without reading secrets: ' + kind, () => {
        const privateFile = path.join(progressTemp, 'private');
        fs.writeFileSync(privateFile, secret);
        if (kind === 'symlink') fs.symlinkSync(privateFile, journal);
        if (kind === 'hardlink') fs.linkSync(privateFile, journal);
        if (kind === 'directory') fs.mkdirSync(journal);
        if (kind === 'fifo') assert.equal(spawnSync('mkfifo', [journal]).status, 0);
        if (kind === 'oversized') fs.writeFileSync(journal, 'x'.repeat(MAX_PROGRESS_BYTES + 1));
        assert.deepEqual(readProgress(progressTemp), { state: kind === 'missing' ? 'missing' : 'unavailable', events: [] });
        const out = progressCLI(['--progress-finish']);
        assert.equal(out.status, 0, out.stderr);
        assert(!fs.readFileSync(path.join(progressTemp, 'autopilot-progress/progress.json'), 'utf8').includes(secret));
      });
    }
    cleanProgress();
    test('bounded journal never evicts its first event; a full journal can still export', () => {
      beginProgress();
      for (let i = 1; i < MAX_PROGRESS_EVENTS; i++) appendProgress(progressTemp, 'context', 'start');
      assert.throws(() => appendProgress(progressTemp, 'context', 'end'));
      assert.equal(readProgress(progressTemp).events.length, MAX_PROGRESS_EVENTS);
      assert.equal(progressCLI(['--progress-finish']).status, 0);
    });
    cleanProgress();
    test('existing upload directory or link is never reused', () => {
      beginProgress();
      fs.mkdirSync(path.join(progressTemp, 'autopilot-progress'));
      assert.equal(progressCLI(['--progress-finish']).status, 1);
      assert.deepEqual(fs.readdirSync(path.join(progressTemp, 'autopilot-progress')), []);
      fs.rmdirSync(path.join(progressTemp, 'autopilot-progress'));
      const target = path.join(progressTemp, 'untrusted'); fs.mkdirSync(target);
      fs.symlinkSync(target, path.join(progressTemp, 'autopilot-progress'));
      assert.equal(progressCLI(['--progress-finish']).status, 1);
      assert.deepEqual(fs.readdirSync(target), []);
    });
    const workflow = fs.readFileSync(new URL('../.github/workflows/obsidian-autopilot.yml', import.meta.url), 'utf8');
    cleanProgress();
    test('real workflow shells export committed tools after a failed model with no execution file', () => {
      const repo = path.join(progressTemp, 'repo'); fs.mkdirSync(repo);
      const fixtureEnv = { PATH: process.env.PATH, HOME: progressTemp, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        RUNNER_TEMP: progressTemp, MODEL_OUTCOME: 'failure', GITHUB_OUTPUT: path.join(progressTemp, 'outputs') };
      const git = (...args) => {
        const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, env: fixtureEnv, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
      };
      git('init', '-q'); git('config', 'user.name', 'Synthetic Test'); git('config', 'user.email', 'test@example.invalid');
      const file = path.join(repo, 'scripts/lib/autopilot-progress.mjs');
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(progressTool, file);
      git('add', '.'); git('commit', '-q', '-m', 'fixture'); fixtureEnv.GITHUB_SHA = git('rev-parse', 'HEAD');
      const body = name => {
        const block = workflow.split(`      - name: ${name}\n`)[1].split('\n      - name:')[0];
        const lines = block.split('\n'); const at = lines.indexOf('        run: |');
        assert(at >= 0);
        const result = [];
        for (const line of lines.slice(at + 1)) {
          if (!line.trim()) continue;
          if (!line.startsWith('          ')) break;
          result.push(line.slice(10));
        }
        return result.join('\n');
      };
      const run = name => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', body(name)], {
        cwd: repo, env: fixtureEnv, encoding: 'utf8', timeout: 5000,
      });
      assert.equal(run('Start bounded progress journal').status, 0);
      // Model-controlled files must not become the post-model exporter.
      for (const target of [file, path.join(progressTemp, 'autopilot-progress-tool.mjs')]) fs.writeFileSync(target, `throw new Error('${secret}');`);
      appendProgress(progressTemp, 'selection', 'start');
      const finished = run('Preserve bounded progress journal');
      assert.equal(finished.status, 0, finished.stderr);
      assert(!`${finished.stdout}${finished.stderr}`.includes(secret));
      assert.equal(fs.readFileSync(fixtureEnv.GITHUB_OUTPUT, 'utf8'), 'saved=true\n');
      const receipt = JSON.parse(fs.readFileSync(path.join(progressTemp, 'autopilot-progress/progress.json')));
      assert.equal(receipt.model_outcome, 'failure'); assert.equal(receipt.events.length, 3);
      assert.deepEqual(fs.readdirSync(path.join(progressTemp, 'autopilot-progress')), ['progress.json']);
      assert.equal(fs.existsSync(path.join(progressTemp, 'claude-execution-output.json')), false);
    });
    test('progress is exported immediately after the main step from trusted code', () => checkProgressWiring(workflow));
    for (const [from, to] of [
      ['--progress-init', '--unwired'], ['--progress-finish', '--unwired'],
      ['steps.progress_finish.outputs.saved', 'steps.progress_start.outputs.saved'],
      ['path: ${{ runner.temp }}/autopilot-progress/progress.json\n', 'path: ${{ runner.temp }}/autopilot-progress\n'],
      ['$GITHUB_SHA:scripts/lib/autopilot-progress.mjs', 'HEAD:scripts/lib/autopilot-progress.mjs'],
      ['continue-on-error: true\n        run: |\n          set -o noclobber', 'continue-on-error: false\n        run: |\n          set -o noclobber'],
    ]) test('broken progress wiring is rejected: ' + from, () => {
      assert(workflow.includes(from));
      assert.throws(() => checkProgressWiring(workflow.replace(from, to)));
    });
    // 2026-10-30 time box (run 40803103665 ran into the 75-minute action limit with no status, LOG or handoff).
    cleanProgress();
    test('time box: stages from the Gate step\'s clock, at each boundary', () => {
      const start = 1793334742;
      const box = timeBox(String(start), start * 1000);
      assert.deepEqual(box, { schema_version: 1, job_started_epoch: start,
        wrap_up_epoch: start + TIME_BOX.wrap_up_minutes * 60, handoff_epoch: start + TIME_BOX.handoff_minutes * 60 });
      const at = minutes => timeLeft(box, (start + minutes * 60) * 1000);
      for (const [minutes, stage] of [[0, 'work'], [59.99, 'work'], [60, 'wrap_up'], [69.99, 'wrap_up'], [70, 'handoff_now'], [90, 'handoff_now']]) {
        assert.equal(at(minutes).stage, stage, `${minutes} minutes`);
      }
      assert.deepEqual(at(65), { stage: 'wrap_up', wrap_up_in_s: -300, handoff_in_s: 300 });
      assert.deepEqual(timeLeft(null), { stage: 'unknown', wrap_up_in_s: null, handoff_in_s: null });
      assert.deepEqual([...TIME_STAGES], ['work', 'wrap_up', 'handoff_now', 'unknown']);
      assert.equal(isoSecond(start), '2026-10-30T04:32:22Z');
    });
    test('time box: only this job\'s clock is accepted', () => {
      const now = 1793334742;
      for (const bad of [undefined, '', '179333474', '17933347420', '1793334742 ', ' 1793334742', '1.7e9', '0793334742', 1793334742, '1793334742\n']) {
        assert.throws(() => timeBox(bad, now * 1000), undefined, JSON.stringify(bad));
      }
      assert.throws(() => timeBox(String(now + 61), now * 1000), undefined, 'a clock from the future');
      assert.throws(() => timeBox(String(now - TIME_BOX.job_minutes * 60 - 1), now * 1000), undefined, 'a clock older than the job');
      assert.doesNotThrow(() => timeBox(String(now - TIME_BOX.job_minutes * 60), now * 1000));
      assert.doesNotThrow(() => timeBox(String(now + 60), now * 1000));
    });
    test('time box: written once; altered, linked, oversized or inconsistent files read as unknown', () => {
      const box = timeBox(String(Math.floor(Date.now() / 1000) - 600));
      writeTimeBox(progressTemp, box);
      assert.deepEqual(readTimeBox(progressTemp), box);
      assert.throws(() => writeTimeBox(progressTemp, box), undefined, 'a second write');
      const file = path.join(progressTemp, TIME_BOX_FILE);
      const rewrite = text => { fs.rmSync(file, { force: true }); fs.writeFileSync(file, text); };
      for (const text of ['', 'not json', '[]', 'null', JSON.stringify({ ...box, extra: 1 }),
        JSON.stringify({ ...box, handoff_epoch: box.handoff_epoch + 1 }), JSON.stringify({ ...box, wrap_up_epoch: box.wrap_up_epoch - 60 }),
        JSON.stringify({ ...box, wrap_up_epoch: String(box.wrap_up_epoch) }), JSON.stringify({ ...box, schema_version: 2 }),
        JSON.stringify(box) + ' '.repeat(600)]) {
        rewrite(text);
        assert.equal(readTimeBox(progressTemp), null, text.slice(0, 60));
      }
      fs.rmSync(file, { force: true });
      const real = path.join(progressTemp, 'elsewhere.json');
      fs.writeFileSync(real, JSON.stringify(box));
      fs.symlinkSync(real, file);
      assert.equal(readTimeBox(progressTemp), null, 'a link');
      fs.rmSync(file, { force: true }); fs.rmSync(real, { force: true });
      assert.equal(readTimeBox(progressTemp), null, 'missing');
      assert.equal(readTimeBox(undefined), null);
      assert.equal(readTimeBox('relative/temp'), null);
    });
    cleanProgress();
    test('CLI: every phase marker and --time-left report the time left, journal or not, as numbers and a fixed word', () => {
      writeTimeBox(progressTemp, timeBox(String(Math.floor(Date.now() / 1000) - 65 * 60)));
      const line = out => out.stdout.split('\n').find(l => l.startsWith('AUTOPILOT_TIME '));
      const parse = out => JSON.parse(line(out).slice('AUTOPILOT_TIME '.length));
      const left = progressCLI(['--time-left']);
      assert.equal(left.status, 0, left.stderr);
      assert.equal(parse(left).stage, 'wrap_up');
      assert.deepEqual(Object.keys(parse(left)), ['stage', 'wrap_up_in_s', 'handoff_in_s']);
      // No journal yet: the marker fails, the time is still reported.
      const failed = progressCLI(['--progress', 'selection', 'start']);
      assert.equal(failed.status, 1);
      assert.equal(parse(failed).stage, 'wrap_up');
      beginProgress();
      const ok = progressCLI(['--progress', 'selection', 'end', '0']);
      assert.equal(ok.status, 0, ok.stderr);
      assert.equal(parse(ok).stage, 'wrap_up');
      const rejected = progressCLI(['--progress', secret, 'start']);
      assert.equal(rejected.status, 1);
      assert(!`${rejected.stdout}${rejected.stderr}`.includes(secret));
      // The trusted steps before and after the model print no time line; a missing box reads as unknown.
      assert(!line(progressCLI(['--progress-finish'])));
      fs.rmSync(path.join(progressTemp, TIME_BOX_FILE));
      assert.equal(parse(progressCLI(['--time-left'])).stage, 'unknown');
      assert.equal(progressCLI(['--time-left']).status, 0);
    });
    cleanProgress();
    test('real workflow shell sets the time box once, from the workflow commit and the Gate step\'s clock', () => {
      const repo = path.join(progressTemp, 'repo-time'); fs.mkdirSync(repo);
      const outputs = path.join(progressTemp, 'time-outputs');
      const started = Math.floor(Date.now() / 1000) - 10 * 60;
      const fixtureEnv = { PATH: process.env.PATH, HOME: progressTemp, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
        RUNNER_TEMP: progressTemp, GITHUB_OUTPUT: outputs, JOB_STARTED_EPOCH: String(started) };
      const git = (...args) => {
        const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, env: fixtureEnv, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout.trim();
      };
      git('init', '-q'); git('config', 'user.name', 'Synthetic Test'); git('config', 'user.email', 'test@example.invalid');
      const file = path.join(repo, 'scripts/lib/autopilot-progress.mjs');
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(progressTool, file);
      git('add', '.'); git('commit', '-q', '-m', 'fixture'); fixtureEnv.GITHUB_SHA = git('rev-parse', 'HEAD');
      // The checkout's copy is not what runs.
      fs.writeFileSync(file, `throw new Error('${secret}');`);
      const block = workflow.split('      - name: Set the model time box\n')[1].split('\n      - name:')[0];
      const lines = block.split('\n');
      const body = lines.slice(lines.indexOf('        run: |') + 1).filter(l => l.startsWith('          ')).map(l => l.slice(10)).join('\n');
      const run = () => spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', body], {
        cwd: repo, env: fixtureEnv, encoding: 'utf8', timeout: 5000,
      });
      const first = run();
      assert.equal(first.status, 0, first.stderr);
      assert(!`${first.stdout}${first.stderr}`.includes(secret));
      assert.equal(fs.readFileSync(outputs, 'utf8'),
        `wrap_up_at=${isoSecond(started + TIME_BOX.wrap_up_minutes * 60)}\nhandoff_at=${isoSecond(started + TIME_BOX.handoff_minutes * 60)}\n`);
      assert.deepEqual(readTimeBox(progressTemp), timeBox(String(started)));
      // Once per job: a second run does not rewrite the box.
      assert.notEqual(run().status, 0);
      assert.deepEqual(readTimeBox(progressTemp), timeBox(String(started)));
      // An unreadable clock sets nothing; the session then falls back to its own clock.
      for (const name of [TIME_BOX_FILE, 'autopilot-time-box-tool.mjs', 'time-outputs']) fs.rmSync(path.join(progressTemp, name));
      fixtureEnv.JOB_STARTED_EPOCH = '';
      assert.notEqual(run().status, 0);
      assert.equal(fs.existsSync(outputs), false);
      assert.equal(readTimeBox(progressTemp), null);
    });
    test('the time box is set before the model from the Gate step\'s clock, and the prompt explains it', () => checkTimeBoxWiring(workflow));
    {
      const at = workflow.indexOf('      - name: Set the model time box\n');
      const end = workflow.indexOf('      - name: Claude Code（Runbook 1イテレーション実行）\n');
      const stepText = workflow.slice(at, end);
      const moved = workflow.slice(0, at) + workflow.slice(end).replace('      - name: Preserve bounded progress journal\n',
        stepText + '      - name: Preserve bounded progress journal\n');
      for (const [label, mutated] of [
        ['the step after the model', moved],
        ...[
          ['--time-box\n', '--unwired\n'],
          ['        id: timebox\n', '        id: time_box\n'],
          ['"$GITHUB_SHA:scripts/lib/autopilot-progress.mjs" > "$RUNNER_TEMP/autopilot-time-box-tool.mjs"',
            '"HEAD:scripts/lib/autopilot-progress.mjs" > "$RUNNER_TEMP/autopilot-time-box-tool.mjs"'],
          ['          JOB_STARTED_EPOCH: ${{ steps.gate.outputs.job_started_epoch }}\n        run: |\n          set -o noclobber',
            '        run: |\n          set -o noclobber'],
          ['        continue-on-error: true\n        env:\n          JOB_STARTED_EPOCH', '        env:\n          JOB_STARTED_EPOCH'],
          ['        env:\n          JOB_STARTED_EPOCH', '        env:\n          TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}\n          JOB_STARTED_EPOCH'],
          ["${{ steps.timebox.outputs.handoff_at || 'unknown' }}", 'unknown'],
          ['Bash の `timeout` は `handoff_in_s` 以内', 'Bash の `timeout` は残りの秒数以内'],
          ['`wrap_up_in_s` が1500未満なら選ばない', '`wrap_up_in_s` を見て選ぶ'],
          ['最初の `date -u` から55・65分', '最初の時刻から'],
          ['UTC の期限と `date -u` を比べる', 'UTC の期限を見る'],
          ['failure_class を time_box に', 'failure_class を書く'],
          ['（4-1 未了なら push_only）', ''],
          ['詳細は Runbook §5-1a。', ''],
          ['ゲートは緩めない。', ''],
          ['【時間の期限】', '【時間】'],
          // 2026-10-31 review: a clause that skips only the time box (the model step keeps running).
          ["        id: timebox\n        timeout-minutes: 1\n        if: >-\n          steps.gate.outputs.run == 'true' && steps.budget.outputs.within == 'true'\n          && steps.route.outputs.run_cap_ok == 'true'\n",
            "        id: timebox\n        timeout-minutes: 1\n        if: >-\n          steps.gate.outputs.run == 'true' && steps.budget.outputs.within == 'true'\n          && steps.route.outputs.run_cap_ok == 'true' && false\n"],
          ["        id: timebox\n        timeout-minutes: 1\n        if: >-\n          steps.gate.outputs.run == 'true' && steps.budget.outputs.within == 'true'\n          && steps.route.outputs.run_cap_ok == 'true'\n",
            "        id: timebox\n        timeout-minutes: 1\n        if: >-\n          steps.gate.outputs.run == 'true' && steps.budget.outputs.within == 'true'\n          && steps.route.outputs.run_cap_ok == 'true'\n          && inputs.force == true\n"],
        ].map(([from, to]) => {
          assert(workflow.includes(from), `time box mutation applies: ${from}`);
          return [from, workflow.replace(from, to)];
        }),
      ]) test('broken time box wiring is rejected: ' + label, () => {
        assert.throws(() => checkTimeBoxWiring(mutated));
        assert.throws(() => checkProgressWiring(mutated));
      });
    }
  } finally { fs.rmSync(progressTemp, { recursive: true, force: true }); }
  const env = { GITHUB_RUN_ID: '37403744008', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40),
    TODAY_DASH: '2026-10-06', MODEL_OUTCOME: 'success', OUTPUT_VERDICT: 'missing',
    OUTPUT_REASON_CODE: 'no_matching_pr', MATCHING_PR_COUNT: '0', CURRENT_RUN_RECORD_COUNT: '',
    CHECKPOINT_OUTCOME: 'success', CHECKPOINT_SAVED: 'false', CHECKPOINT_REASON: 'no_unpublished_page_changes',
    DECLARED_PAGE_CHANGE_COUNT: '0', GH_TOKEN: secret };
  const raw = { type: 'result', subtype: 'success', is_error: false, num_turns: 165, total_cost_usd: 8.6843,
    result: secret, permission_denials_count: 99, permission_denials: [
      { tool_name: 'Bash', tool_use_id: secret, tool_input: { command: secret } },
      { tool_name: secret, tool_input: { url: 'https://example.invalid/?token=' + secret } },
    ] };
  test('raw array wins over stale count; strings and tool input never leave projection', () => {
    const r = receipt(env, [{ type: 'assistant', content: secret }, raw]);
    assert.equal(r.permission_denials_count, 2);
    assert.deepEqual(r.denied_tool_counts, { Bash: 1, unknown: 1 });
    assert.equal(r.output_reason_code, 'no_matching_pr');
    assert.equal(r.matching_pr_count, 0); assert.equal(r.current_run_record_count, null);
    assert(!JSON.stringify(r).includes(secret));
  });
  test('last result is selected without trusting messages that only have cost', () => {
    assert.equal(modelSummary([raw, { type: 'result', subtype: 'error_max_turns', num_turns: 250 },
      { type: 'assistant', total_cost_usd: 0 }]).result_subtype, 'error_max_turns');
  });
  test('legacy count stays available but tool details are unknown', () => {
    const r = modelSummary({ type: 'result', permission_denials_count: 2 });
    assert.equal(r.permission_denials_count, 2); assert.equal(r.denied_tool_counts, null);
  });
  test('empty denial array is observed zero', () => assert.equal(modelSummary({ type: 'result', permission_denials: [] }).permission_denials_count, 0));
  for (const value of [undefined, null, -1, 1.5, true, '2', {}]) test('invalid or absent count is unknown', () => {
    assert.equal(modelSummary({ type: 'result', permission_denials_count: value }).permission_denials_count, null);
  });
  test('unknown result and environment fields cannot carry raw text', () => {
    const poisoned = Object.fromEntries(Object.keys(env).map(key => [key, secret]));
    const r = receipt(poisoned, { ...raw, subtype: secret, is_error: secret, num_turns: secret }, secret, secret);
    assert(!JSON.stringify(r).includes(secret));
    assert.equal(r.github_run_id, null); assert.equal(r.result_subtype, null);
    assert(r.observations_unknown.includes('num_turns'));
  });
  test('verdict and reason must belong together', () => assert.equal(receipt({ ...env, OUTPUT_REASON_CODE: 'unknown_remote_read' }).output_reason_code, null));
  test('post-model audit verdict is a finite enum shared with the audit', () => {
    assert.deepEqual(AUDIT_VERDICTS, VERDICTS);
    for (const v of VERDICTS) assert.equal(receipt({ ...env, AUDIT_VERDICT: v }).post_model_audit, v);
    for (const v of ['', 'CLEAN', 'clean\n', 'problems: index.html']) {
      const r = receipt({ ...env, AUDIT_VERDICT: v });
      assert.equal(r.post_model_audit, null); assert(r.observations_unknown.includes('post_model_audit'));
    }
  });
  test('skipped model verification remains unknown, not missing/zero', () => {
    const r = receipt({ ...env, MODEL_OUTCOME: 'failure', OUTPUT_VERDICT: '', OUTPUT_REASON_CODE: '', MATCHING_PR_COUNT: '' });
    assert.equal(r.output_verdict, null); assert.equal(r.matching_pr_count, null); assert.equal(r.production_verified, false);
  });

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
  test('workflow keeps both failure paths, trusted source, bounded upload and privacy', () => checkWiring(workflow));
  for (const [from, to] of [
    ["needs.autopilot.outputs.model_outcome == 'success' || needs.autopilot.outputs.model_outcome == 'failure'", "needs.autopilot.outputs.model_outcome == 'success'"],
    ['diagnostic-tools" "$GITHUB_SHA"', 'diagnostic-tools" "HEAD"'],
    ['autopilot-diagnostics.mjs" --summarize', 'autopilot-diagnostics.mjs" --save'],
    ['--save "$RUNNER_TEMP/autopilot-diagnostic" --handoff "$RUNNER_TEMP/handoff"', '--save "$RUNNER_TEMP/autopilot-diagnostic"'],
    ['          RESUME_OUTCOME: ${{ steps.resume.outcome }}\n          RESUME_DECISION', '          RESUME_DECISION'],
    ['          MAIN_EXECUTION_SHA256: ${{ steps.handoff_files.outputs.main_execution_sha256 }}\n        run: |\n          git worktree add --detach "$RUNNER_TEMP/diagnostic-tools"',
      '        run: |\n          git worktree add --detach "$RUNNER_TEMP/diagnostic-tools"'],
    ['      audit_verdict: ${{ steps.audit.outputs.verdict }}\n', '      audit_verdict: ${{ steps.audit.outputs.verdict }}\n      exec_summary: ${{ steps.exec_summary.outputs.summary }}\n'],
    ['path: ${{ runner.temp }}/autopilot-diagnostic', 'path: ${{ runner.temp }}'],
    ["steps.diagnostics.outputs.saved == 'true'", 'true'],
    ["steps.diagnostics.outputs.saved == 'true'\n        continue-on-error: true", "steps.diagnostics.outputs.saved == 'true'"],
  ]) test('broken diagnostic wiring is rejected', () => {
    // Mutate inside the diagnostics step when the text is there: other steps (the post-model
    // audit) share the same condition, and a first-match replace would miss this step.
    const step = workflow.split('      - name: Preserve bounded execution diagnostics\n')[1].split('\n      - name:')[0];
    const mutated = step.includes(from) ? workflow.replace(step, step.replace(from, to)) : workflow.replace(from, to);
    assert.notEqual(mutated, workflow, `mutation did not apply: ${from}`);
    assert.throws(() => checkWiring(mutated));
  });

  test('optional diagnostic upload cannot reclassify verified output as no_artifact', () => {
    const steps = [
      { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'success' },
      { name: '成果物の実行IDを照合', conclusion: 'success' },
      { name: '成果物判定: verified', conclusion: 'success' },
      { name: 'Preserve bounded execution diagnostics', conclusion: 'success' },
    ];
    const run = { status: 'completed', conclusion: 'success', steps };
    assert.equal(interpretRun(run).outcome, 'shipped');
    assert.equal(interpretRun({ ...run, conclusion: 'failure', steps: [...steps,
      { name: 'Upload bounded execution diagnostics', conclusion: 'failure' }] }).outcome, 'no_artifact');
    // GitHub applies continue-on-error to the step conclusion and keeps the job successful.
    // checkWiring above requires that policy on the actual upload step.
    assert.equal(interpretRun({ ...run, steps: [...steps,
      { name: 'Upload bounded execution diagnostics', outcome: 'failure', conclusion: 'success' }] }).outcome, 'shipped');
  });

  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-diagnostic-test-')));
  try {
    const output = path.join(temp, 'autopilot-diagnostic');
    const execution = path.join(temp, 'claude-execution-output.json');
    const args = { ...env, RUNNER_TEMP: temp, EXEC_FILE: execution };
    const clean = () => fs.rmSync(output, { recursive: true, force: true });
    test('CLI saves one safe receipt with private permissions', () => {
      fs.writeFileSync(execution, JSON.stringify([raw]));
      const stepOutput = path.join(temp, 'step-output');
      const cli = spawnSync(process.execPath, [path.join(root, 'scripts/autopilot-diagnostics.mjs'), '--save', output],
        { encoding: 'utf8', env: { ...process.env, ...args, GITHUB_OUTPUT: stepOutput } });
      assert.equal(cli.status, 0, cli.stderr);
      assert.equal(fs.readFileSync(stepOutput, 'utf8'), 'saved=true\n');
      assert.deepEqual(fs.readdirSync(output), ['receipt.json']);
      const text = fs.readFileSync(path.join(output, 'receipt.json'), 'utf8');
      assert(!text.includes(secret)); assert(!cli.stdout.includes(secret)); assert(!cli.stderr.includes(secret));
      const r = JSON.parse(text);
      assert.equal(r.permission_denials_count, 2); assert.match(r.execution_file_sha256, /^[a-f0-9]{64}$/);
      assert.equal(fs.statSync(path.join(output, 'receipt.json')).mode & 0o077, 0);
      assert.equal(fs.statSync(output).mode & 0o077, 0);
    });
    test('pre-existing output directory cannot upload unrelated contents', () => {
      fs.writeFileSync(path.join(output, 'private.txt'), secret);
      assert.throws(() => save(output, args));
    });
    clean();
    test('malformed JSON is hashed but its bytes are never returned', () => {
      fs.writeFileSync(execution, secret);
      const r = save(output, args);
      assert.equal(r.permission_denials_count, null);
      assert(r.observations_unknown.includes('execution_file_invalid_json'));
      assert(!JSON.stringify(r).includes(secret));
    });
    clean(); fs.unlinkSync(execution);
    test('missing execution file does not suppress independent checkpoint observations', () => {
      const r = save(output, { ...args, CHECKPOINT_SAVED: 'true', CHECKPOINT_REASON: 'saved', DECLARED_PAGE_CHANGE_COUNT: '2' });
      assert.equal(r.checkpoint_saved, true); assert.equal(r.declared_page_change_count, 2);
      assert.equal(r.permission_denials_count, null); assert(r.observations_unknown.includes('execution_file_missing'));
    });
    clean();
    test('alternate execution path is never read', () => {
      const r = save(output, { ...args, EXEC_FILE: path.join(temp, 'private.txt') });
      assert(r.observations_unknown.includes('execution_file_unexpected_path')); assert.equal(r.execution_file_sha256, null);
    });
    clean();
    test('symlink execution file is never read', () => {
      const privatePath = path.join(temp, 'private.json'); fs.writeFileSync(privatePath, JSON.stringify(raw));
      fs.symlinkSync(privatePath, execution);
      const r = save(output, args); assert.equal(r.execution_file_sha256, null);
      assert(r.observations_unknown.includes('execution_file_unavailable'));
    });
    clean(); fs.unlinkSync(execution);
    test('oversized input remains explicitly unknown', () => {
      fs.writeFileSync(execution, ''); fs.truncateSync(execution, MAX_EXECUTION_BYTES + 1);
      const r = save(output, args); assert(r.observations_unknown.includes('execution_file_oversized'));
    });
    clean();
    const exitFile = path.join(temp, 'autopilot-exit.json');
    test('the model exit code is read as an enum only', () => {
      fs.writeFileSync(exitFile, JSON.stringify({ code: 'abandoned_after_declaration', note: secret }));
      const r = save(output, args);
      assert.equal(r.model_exit_code, 'abandoned_after_declaration'); assert(!JSON.stringify(r).includes(secret));
    });
    clean();
    for (const [content, reason] of [[JSON.stringify({ code: secret }), 'exit_report_invalid'], [secret, 'exit_report_invalid'],
      ['x'.repeat(5000), 'exit_report_oversized']]) {
      test('an unusable exit report stays unknown, never a code', () => {
        fs.writeFileSync(exitFile, content);
        const r = save(output, args);
        assert.equal(r.model_exit_code, null); assert(r.observations_unknown.includes(reason));
        assert(!JSON.stringify(r).includes(secret));
      });
      clean();
    }
    fs.unlinkSync(exitFile);
    test('a missing exit report is explicit', () => {
      const r = save(output, args); assert.equal(r.model_exit_code, null);
      assert(r.observations_unknown.includes('exit_report_missing'));
    });
    clean();
    test('a symlinked exit report is never read', () => {
      const privatePath = path.join(temp, 'private-exit.json'); fs.writeFileSync(privatePath, JSON.stringify({ code: 'shipped_pr' }));
      fs.symlinkSync(privatePath, exitFile);
      const r = save(output, args); assert.equal(r.model_exit_code, null);
      assert(r.observations_unknown.includes('exit_report_unavailable'));
    });
    clean(); fs.unlinkSync(exitFile);
    test('every exit code is offered by the prompt step that requests the structured exit_code', () => {
      const withoutOther = workflow.replace(/\/\s*other。/, '。');
      assert.notEqual(withoutOther, workflow, 'fixture removes the "other" choice');
      assert.throws(() => checkWiring(withoutOther), /exit code other/);
      assert.throws(() => checkWiring(workflow.replace('StructuredOutput の `exit_code`', 'exit_code')), /structured result/);
      assert.throws(() => checkWiring(workflow.replace('          HANDOFF_SOURCE: ${{ steps.handoff_files.outputs.handoff_source }}\n', '')), /HANDOFF_SOURCE/);
    });
    test('how the session ended: counts and enums only, never text', () => {
      const exec = [{ type: 'system', subtype: 'init' },
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: `node x.mjs & # ${secret}` } }] } },
        { type: 'system', subtype: 'task_started', task_id: 'b1', is_backgrounded: true },
        { type: 'system', subtype: 'task_started', task_id: 'sync-agent', is_backgrounded: false },
        { type: 'user', tool_use_result: { backgroundTaskId: 'b2', stdout: '' }, message: { content: [{ type: 'tool_result',
          content: `Command did not complete within its 120s timeout and was moved to the background ${secret}` }] } },
        { type: 'user', message: { content: [{ type: 'tool_result', content: 'Exit code 143\nCommand timed out after 600s' }] } },
        { type: 'system', subtype: 'task_notification', task_id: 'b1', status: 'completed' },
        { type: 'user', isSynthetic: true, message: { content: [{ type: 'text', text: '[structured-output-enforce] You MUST call the StructuredOutput tool' }] } },
        { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__x__y', input: {} }, { type: 'tool_use', name: secret, input: {} }] } },
        { type: 'result', subtype: 'success', stop_reason: 'end_turn', terminal_reason: secret, num_turns: 3, permission_denials: [{ tool_name: 'Monitor' }, { tool_name: 'mcp__a__b' }] }];
      const facts = endingFacts(exec);
      assert.deepEqual(facts, { background_started: 2, background_finished: 1, background_open_at_result: 1, bash_timed_out: 1,
        moved_to_background: 1, detached_commands: 1, structured_reminders: 1, structured_output: 'absent', last_stop_reason: 'end_turn',
        terminal_reason: null, last_tool: 'unknown' });
      assert.deepEqual(modelSummary(exec).denied_tool_counts, { Monitor: 1, mcp: 1 });
      assert(!JSON.stringify(facts).includes(secret));
      for (const value of [null, {}, 'x']) assert(Object.values(endingFacts(value)).every(v => v === null));
    });
    test('a denial of any tool the pinned CLI lists is named, never unknown', () => {
      assert.deepEqual(modelSummary({ type: 'result', permission_denials: ['DesignSync', 'ReportFindings', 'ShareOnboardingGuide']
        .map(tool_name => ({ tool_name })) }).denied_tool_counts, { DesignSync: 1, ReportFindings: 1, ShareOnboardingGuide: 1 });
    });
    test('a structured result nested thousands deep: the summary CLI finishes, says invalid, and keeps every other fact', () => {
      const depth = 10_000;
      fs.writeFileSync(execution, `[{"type":"system","subtype":"task_started","task_id":"b1","is_backgrounded":true},`
        + `{"type":"result","subtype":"success","num_turns":115,"stop_reason":"end_turn","permission_denials":[{"tool_name":"Monitor"}],`
        + `"structured_output":{"exit_code":"shipped_pr","request":{"action":"pr","run":${'['.repeat(depth)}${']'.repeat(depth)}}}}]`);
      const cli = spawnSync(process.execPath, [path.join(root, 'scripts/autopilot-diagnostics.mjs'), '--summarize'],
        { encoding: 'utf8', env: { ...process.env, ...args, HANDOFF_SOURCE: 'files' } });
      assert.equal(cli.status, 0, cli.stderr);
      const summary = JSON.parse(fs.readFileSync(path.join(temp, SUMMARY_FILE), 'utf8'));
      assert.equal(summary.structured_output, 'invalid');
      assert.equal(summary.read_reason, null);
      for (const [key, value] of Object.entries({ num_turns: 115, background_open_at_result: 1, last_stop_reason: 'end_turn', handoff_source: 'files' })) {
        assert.equal(summary[key], value, key);
      }
      assert.deepEqual(summary.denied_tool_counts, { Monitor: 1 });
      assert.equal(fromSummary(JSON.stringify(summary)).ending.structured_output, 'invalid');
      fs.rmSync(path.join(temp, SUMMARY_FILE)); fs.unlinkSync(execution);
    });
    // The publish job reads the summary from the downloaded handoff (summary.json, sha256 in the manifest).
    const handoffDir = path.join(temp, 'handoff');
    const putHandoff = (text, { sha = createHash('sha256').update(text ?? '').digest('hex'), manifest = true } = {}) => {
      fs.rmSync(handoffDir, { recursive: true, force: true }); fs.mkdirSync(handoffDir);
      if (text !== undefined) fs.writeFileSync(path.join(handoffDir, 'summary.json'), text);
      if (manifest) fs.writeFileSync(path.join(handoffDir, 'manifest.json'), JSON.stringify({ files: { 'summary.json': { sha256: sha, size: 1 } } }));
    };
    const viaHandoff = () => { const r = save(output, { ...env, RUNNER_TEMP: temp }, { handoff: handoffDir }); clean(); return r; };
    test('the publish job receipt from the packed summary equals the direct receipt', () => {
      fs.writeFileSync(execution, JSON.stringify([raw]));
      fs.writeFileSync(path.join(temp, 'autopilot-exit.json'), JSON.stringify({ code: 'shipped_pr' }));
      const direct = save(output, args); clean();
      // The real CLI writes the summary file; the real pack puts it in the handoff with its hash.
      const cli = spawnSync(process.execPath, [path.join(root, 'scripts/autopilot-diagnostics.mjs'), '--summarize'],
        { encoding: 'utf8', env: { ...process.env, ...args } });
      assert.equal(cli.status, 0, cli.stderr);
      const text = fs.readFileSync(path.join(temp, SUMMARY_FILE), 'utf8');
      assert(!text.includes(secret) && !cli.stdout.includes(secret));
      const workspace = fs.mkdtempSync(path.join(temp, 'not-a-repository-'));
      const packed = path.join(temp, 'packed');
      pack({ workspace, out: packed, day: '20261006', runnerTemp: temp });
      assert.equal(JSON.parse(fs.readFileSync(path.join(packed, 'manifest.json'), 'utf8')).files['summary.json'].sha256,
        createHash('sha256').update(text).digest('hex'));
      const fromPack = save(output, { ...env, RUNNER_TEMP: temp }, { handoff: packed }); clean();
      assert.deepEqual(fromPack, direct);
      putHandoff(text);
      assert.deepEqual(viaHandoff(), direct);
      for (const leftover of [path.join(temp, 'autopilot-exit.json'), path.join(temp, SUMMARY_FILE), packed, workspace]) fs.rmSync(leftover, { recursive: true });
    });
    test('a forged, altered or broken summary becomes explicit unknowns, never raw text', () => {
      const forged = JSON.stringify({ result_subtype: secret, is_error: secret, num_turns: -1, permission_denials_count: '3',
        denied_tool_counts: { [secret]: 1 }, model_exit_code: secret, execution_file_sha256: secret, read_reason: secret, exit_reason: secret,
        request_after_main: secret, exit_after_main: 'present ', resume_decision: secret, resume_outcome: secret,
        request_after_resume: secret, exit_after_resume: 'not_run\n', resume_result_subtype: secret, resume_num_turns: -1,
        resume_permission_denials_count: 1.5, resume_denied_tool_counts: { [secret]: 1 } });
      putHandoff(forged);
      const r = viaHandoff();
      assert(!JSON.stringify(r).includes(secret));
      assert.equal(r.num_turns, null); assert.equal(r.model_exit_code, null); assert.equal(r.denied_tool_counts, null);
      for (const key of ['request_after_main', 'exit_after_main', 'resume_decision', 'resume_outcome', 'request_after_resume',
        'exit_after_resume', 'resume_result_subtype', 'resume_num_turns', 'resume_permission_denials_count', 'resume_denied_tool_counts']) {
        assert.equal(r[key], null, key); assert(r.observations_unknown.includes(key), key);
      }
      for (const broken of ['', 'not json', '[]', 'x'.repeat(5000)]) {
        putHandoff(broken);
        const b = viaHandoff();
        assert(b.observations_unknown.includes('execution_summary_unavailable'));
        assert.equal(fromSummary(broken).model.num_turns, null);
      }
      // Dropped on the way: no file, no manifest, a hash that is not the manifest's, a link, no handoff at all.
      const good = JSON.stringify({ num_turns: 3 });
      for (const [label, arrange] of [['missing', () => putHandoff(undefined)], ['no manifest', () => putHandoff(good, { manifest: false })],
        ['altered', () => putHandoff(good, { sha: 'f'.repeat(64) })],
        ['symlink', () => { putHandoff(undefined); const target = path.join(temp, 'linked.json'); fs.writeFileSync(target, good);
          fs.symlinkSync(target, path.join(handoffDir, 'summary.json'));
          fs.writeFileSync(path.join(handoffDir, 'manifest.json'), JSON.stringify({ files: { 'summary.json': { sha256: createHash('sha256').update(good).digest('hex') } } })); }],
        ['no handoff', () => fs.rmSync(handoffDir, { recursive: true, force: true })]]) {
        arrange();
        assert.equal(readHandoffSummary(handoffDir), undefined, label);
        const d = viaHandoff();
        assert(d.observations_unknown.includes('execution_summary_unavailable') && d.num_turns === null, label);
      }
      putHandoff(good);
      assert.equal(viaHandoff().num_turns, 3, 'the same summary with its manifest hash is read');
      fs.rmSync(handoffDir, { recursive: true, force: true }); fs.rmSync(path.join(temp, 'linked.json'));
    });
    test('the summary records the handoff files, the one resume and its result, typed and bounded', () => {
      const requestFile = path.join(temp, 'autopilot-pr-request.json');
      const copy = path.join(temp, MAIN_EXECUTION_COPY);
      const mainExec = JSON.stringify([{ type: 'result', subtype: 'success', is_error: false, num_turns: 236, total_cost_usd: 15.41336,
        permission_denials: [{ tool_name: 'Write', tool_input: { file_path: secret } }] }]);
      const mainSha = createHash('sha256').update(mainExec).digest('hex');
      const resumeExec = JSON.stringify([{ type: 'result', subtype: 'success', is_error: false, num_turns: 4, total_cost_usd: 0.5,
        permission_denials: [{ tool_name: 'Bash', tool_input: { command: secret } }] }]);
      const after = { ...args, REQUEST_AFTER_MAIN: 'missing', EXIT_AFTER_MAIN: 'missing', RESUME_DECISION: 'resume', MAIN_EXECUTION_SHA256: mainSha };
      const roundTrip = summary => { const text = JSON.stringify(summary); assert(!text.includes(secret)); putHandoff(text); return viaHandoff(); };

      // Both files written by the main session: no resume; nothing after it is "unknown".
      fs.writeFileSync(execution, mainExec);
      const plain = summarize({ ...after, REQUEST_AFTER_MAIN: 'present', EXIT_AFTER_MAIN: 'present', RESUME_DECISION: 'not_needed', RESUME_OUTCOME: 'skipped' });
      assert.equal(plain.num_turns, 236); assert.equal(plain.request_after_resume, 'not_run'); assert.equal(plain.resume_num_turns, null);
      const plainReceipt = roundTrip(plain);
      assert.equal(plainReceipt.resume_outcome, 'skipped'); assert.equal(plainReceipt.resume_decision, 'not_needed');
      assert(!plainReceipt.observations_unknown.some(key => key.startsWith('resume_')), 'a resume that did not run is not unknown');

      // The resume ran: the main session is read from the copy taken before it, the resume from the rewritten file.
      fs.writeFileSync(copy, mainExec); fs.writeFileSync(execution, resumeExec);
      fs.writeFileSync(requestFile, JSON.stringify({ action: 'none' })); fs.writeFileSync(exitFile, JSON.stringify({ code: 'no_ship_pr' }));
      const resumed = summarize({ ...after, RESUME_OUTCOME: 'success' });
      assert.equal(resumed.num_turns, 236); assert.deepEqual(resumed.denied_tool_counts, { Write: 1 }); assert.equal(resumed.execution_file_sha256, mainSha);
      assert.equal(resumed.resume_num_turns, 4); assert.deepEqual(resumed.resume_denied_tool_counts, { Bash: 1 });
      assert.equal(resumed.resume_permission_denials_count, 1); assert.equal(resumed.resume_result_subtype, 'success');
      assert.equal(resumed.request_after_resume, 'present'); assert.equal(resumed.exit_after_resume, 'present');
      assert.equal(resumed.model_exit_code, 'no_ship_pr'); assert.equal(resumed.request_after_main, 'missing');
      const resumedReceipt = roundTrip(resumed);
      for (const [key, value] of Object.entries({ request_after_main: 'missing', exit_after_main: 'missing', resume_decision: 'resume',
        resume_outcome: 'success', request_after_resume: 'present', exit_after_resume: 'present', resume_num_turns: 4, num_turns: 236 })) {
        assert.deepEqual(resumedReceipt[key], value, key);
      }

      // The resume left nothing usable: still missing after it, its result unknown (it ran).
      fs.unlinkSync(requestFile); fs.writeFileSync(exitFile, '{"code":');
      fs.writeFileSync(execution, mainExec);
      const empty = summarize({ ...after, RESUME_OUTCOME: 'failure' });
      assert.equal(empty.request_after_resume, 'missing'); assert.equal(empty.exit_after_resume, 'invalid_json');
      assert.equal(empty.resume_num_turns, null, 'the main session\'s file is not the resume\'s');
      assert(roundTrip(empty).observations_unknown.includes('resume_num_turns'));

      // The copy no longer matches the hash recorded before the resume: unknown, not the altered numbers.
      fs.writeFileSync(copy, mainExec.replace('236', '1')); fs.writeFileSync(execution, resumeExec);
      const changed = summarize({ ...after, RESUME_OUTCOME: 'success' });
      assert.equal(changed.read_reason, 'execution_file_changed'); assert.equal(changed.num_turns, null); assert.equal(changed.resume_num_turns, 4);
      assert(roundTrip(changed).observations_unknown.includes('execution_file_changed'));
      for (const leftover of [copy, exitFile, execution]) fs.rmSync(leftover, { force: true });

      // The largest summary the fields allow stays within the bound fromSummary accepts.
      const tools = [...TOOL_NAMES, 'unknown', 'mcp'];
      const most = Object.fromEntries(tools.map(tool => [tool, Number.MAX_SAFE_INTEGER]));
      const largest = JSON.stringify({ result_subtype: 'error_max_structured_output_retries', is_error: false, num_turns: Number.MAX_SAFE_INTEGER,
        permission_denials_count: Number.MAX_SAFE_INTEGER, denied_tool_counts: most, model_exit_code: 'abandoned_after_declaration',
        execution_file_sha256: 'a'.repeat(64), read_reason: 'execution_file_unexpected_path', exit_reason: 'exit_report_unavailable',
        request_after_main: 'invalid_json', exit_after_main: 'invalid_json', resume_decision: 'session_id_invalid', resume_outcome: 'cancelled',
        request_after_resume: 'invalid_json', exit_after_resume: 'invalid_json', resume_result_subtype: 'error_max_structured_output_retries',
        resume_num_turns: Number.MAX_SAFE_INTEGER, resume_permission_denials_count: Number.MAX_SAFE_INTEGER, resume_denied_tool_counts: most,
        background_started: 100000, background_finished: 100000, background_open_at_result: 100000, bash_timed_out: 100000,
        moved_to_background: 100000, detached_commands: 100000, structured_reminders: 100000, structured_output: 'unreadable',
        last_stop_reason: 'stop_sequence', terminal_reason: 'structured_output_retry_exhausted', last_tool: 'ShareOnboardingGuide',
        handoff_source: 'structured' });
      assert(Buffer.byteLength(largest) <= 8192, `largest summary is ${Buffer.byteLength(largest)} bytes`);
      assert.equal(fromSummary(largest).ending.terminal_reason, 'structured_output_retry_exhausted');
      assert.deepEqual(fromSummary(largest).handoff.resume_denied_tool_counts, most);
    });
    test('checkpoint capture failure is preserved independently of model success', () => {
      const r = receipt({ ...env, CHECKPOINT_OUTCOME: 'failure', CHECKPOINT_SAVED: 'false', CHECKPOINT_REASON: 'capture_failed', DECLARED_PAGE_CHANGE_COUNT: '' }, raw);
      assert.equal(r.checkpoint_saved, false); assert.equal(r.checkpoint_reason, 'capture_failed');
      assert.equal(r.declared_page_change_count, null); assert.equal(r.output_verdict, 'missing');
    });
    // Test the Python actually embedded in the workflow; no duplicate parser fixture.
    const embedded = workflow.match(/          python3 - "\$@" <<'PY' \| tee -a "\$GITHUB_STEP_SUMMARY"\n([\s\S]*?)\n          PY/);
    assert(embedded, 'cost extraction heredoc required');
    const python = embedded[1].split('\n').map(line => line.slice(10)).join('\n');
    for (const [fields, expected] of [[raw, '2'], [{ permission_denials: [] }, '0'],
      [{ permission_denials_count: 3 }, '3'], [{}, 'None'], [{ permission_denials_count: true }, 'None']]) {
      test('actual cost extractor agrees on denial count and unknown', () => {
        fs.writeFileSync(execution, JSON.stringify([{ type: 'result', total_cost_usd: 0.1, num_turns: 1, ...fields }]));
        const cli = spawnSync('python3', ['-', execution], { input: python, encoding: 'utf8', cwd: root,
          env: { ...process.env, GITHUB_RUN_ID: '123', TASK_KIND: '' } });
        assert.equal(cli.status, 0, cli.stderr); assert(cli.stdout.includes('permission_denials ' + expected));
        assert(!cli.stdout.includes(secret));
      });
    }
    // The whole step as the workflow runs it: after a resume, the cost is the main session's copy
    // (bound to the hash recorded before the resume) plus the resume's file, in the line Act reads.
    const costStep = workflow.split('      - name: 実費の抽出（台帳への追記は翌日のセッションが行う）\n')[1].split('\n      - name:')[0];
    const costShell = path.join(temp, 'cost-step.sh');
    fs.writeFileSync(costShell, costStep.split('        run: |\n')[1].split('\n')
      .filter(line => !line.trim() || line.startsWith('          ')).map(line => line.slice(10)).join('\n'));
    const mainExec = JSON.stringify([{ type: 'result', total_cost_usd: 15.41336, num_turns: 236, permission_denials: [{ tool_name: 'Write' }] }]);
    const mainSha = createHash('sha256').update(mainExec).digest('hex');
    const resumeExec = JSON.stringify([{ type: 'result', total_cost_usd: 0.5, num_turns: 4, permission_denials: [] }]);
    const costRun = (resumeOutcome, sha = mainSha) => {
      const summary = path.join(temp, 'step-summary.md'); fs.rmSync(summary, { force: true });
      const cli = spawnSync('bash', ['-e', costShell], { encoding: 'utf8', cwd: root, env: { ...process.env, RUNNER_TEMP: temp,
        EXEC_FILE: execution, TASK_KIND: 'article', GITHUB_RUN_ID: '123', GITHUB_STEP_SUMMARY: summary,
        RESUME_OUTCOME: resumeOutcome, MAIN_EXECUTION_SHA256: sha } });
      assert.equal(cli.status, 0, cli.stderr);
      assert(!/"total_cost_usd"|"num_turns"/.test(cli.stdout), 'the step prints nothing Act would count twice');
      return cli.stdout;
    };
    const actLine = text => Number(text.match(/AI実費:\s*\*\*\$([0-9.]+)\*\*/)?.[1]);
    test('the cost step sums the main session and the resume after a resume', () => {
      fs.writeFileSync(path.join(temp, MAIN_EXECUTION_COPY), mainExec); fs.writeFileSync(execution, resumeExec);
      const out = costRun('success');
      assert.equal(actLine(out), 15.9134); assert(out.includes('turns 240 / permission_denials 1'), out);
      assert(out.includes('--cost 15.91336 --turns 240'), out);
      assert(out.includes('主セッション $15.4134 / 引き渡しファイルのための再開 $0.5000'), out);
    });
    test('the cost step without a resume reads the one execution file, as before', () => {
      fs.writeFileSync(execution, mainExec);
      for (const outcome of ['skipped', '']) {
        const out = costRun(outcome);
        assert.equal(actLine(out), 15.4134); assert(out.includes('turns 236 / permission_denials 1') && !out.includes('内訳'), out);
      }
    });
    test('an altered copy or a resume without its own execution file is not counted as a total', () => {
      fs.writeFileSync(path.join(temp, MAIN_EXECUTION_COPY), mainExec.replace('15.41336', '0.01')); fs.writeFileSync(execution, resumeExec);
      let out = costRun('success');
      assert(Number.isNaN(actLine(out)) && out.includes('取得できなかった（主セッション分: '), out);
      fs.writeFileSync(path.join(temp, MAIN_EXECUTION_COPY), mainExec); fs.writeFileSync(execution, mainExec);
      out = costRun('failure');
      assert(Number.isNaN(actLine(out)) && out.includes('取得できなかった（再開分: 再開の実行ログが無い）'), out);
      fs.rmSync(path.join(temp, MAIN_EXECUTION_COPY));
      out = costRun('success');
      assert(Number.isNaN(actLine(out)) && out.includes('取得できなかった（主セッション分: '), out);
    });
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  console.log(`diagnostics: ${tests} privacy, missingness, workflow and real CLI/cost checks passed`);
}
