// Runtime provenance for the existing decision monitor. Native timer claims are
// checked against launchd's live PID, rather than trusted from an environment flag.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const NATIVE_LABEL = 'com.simplememo.decision-monitor';
export const NATIVE_SCRIPT = 'simplememo-decision-monitor.py';
const hash = x => createHash('sha256').update(x).digest('hex');
const seal = x => hash(JSON.stringify(x));
const sha = (x, n) => typeof x === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(x);

export function verifyLaunchd(state, { parentPid, launcher }) {
  const fields = key => [...state.matchAll(new RegExp(`^\\t${key} = (.+)$`, 'gm'))].map(m => m[1]);
  const pid = fields('pid'), status = fields('state'), program = fields('program');
  if (!Number.isSafeInteger(parentPid) || parentPid <= 1 || pid.length !== 1 || pid[0] !== String(parentPid)
    || status.length !== 1 || status[0] !== 'running' || program.length !== 1 || program[0] !== '/usr/bin/python3') {
    throw new Error('native timer is not the live launchd service');
  }
  const args = [...state.matchAll(/^\targuments = \{\n([\s\S]*?)^\t\}/gm)];
  if (args.length !== 1) throw new Error('native timer arguments unavailable');
  const values = args[0][1].split('\n').filter(Boolean).map(x => x.replace(/^\t\t/, ''));
  if (JSON.stringify(values) !== JSON.stringify(['/usr/bin/python3', launcher, '--once'])) {
    throw new Error('native timer service command changed');
  }
}

export function nativeReceipt({ pid, launcherHash, head, now }) {
  const body = { provider: 'launchd', label: NATIVE_LABEL, launch_reason: 'interval', pid, launcher_sha256: launcherHash,
    execution_sha: head, observed_at: now.toISOString() };
  return { ...body, receipt_sha256: seal(body) };
}

export function verifiedNativeReceipt(receipt) {
  if (!receipt || receipt.provider !== 'launchd' || receipt.label !== NATIVE_LABEL || receipt.launch_reason !== 'interval'
    || !Number.isSafeInteger(receipt.pid) || receipt.pid <= 1 || !sha(receipt.launcher_sha256, 64)
    || !sha(receipt.execution_sha, 40) || !Number.isFinite(Date.parse(receipt.observed_at))) return false;
  const { receipt_sha256, ...body } = receipt;
  return sha(receipt_sha256, 64) && receipt_sha256 === seal(body);
}

export const automatedDecisionOrigin = row => ['schedule', 'workflow_run'].includes(row?.trigger)
  || (row?.trigger === 'launchd' && verifiedNativeReceipt(row.execution_origin));

export function runtimeDecisionOrigin({ env = process.env, platform = process.platform, parentPid = process.ppid,
  uid = process.getuid?.(), home = os.homedir(), now = new Date(), head,
  run = (...args) => execFileSync(...args), read = file => fs.readFileSync(file) } = {}) {
  if (env.DECISION_MONITOR_NATIVE_TIMER !== '1') return { trigger: env.GITHUB_EVENT_NAME ?? 'manual', execution_origin: null };
  if (platform !== 'darwin' || !Number.isSafeInteger(uid)) throw new Error('native timer requires macOS launchd');
  const launcher = path.join(home, '.local/libexec', NATIVE_SCRIPT);
  const state = run('/bin/launchctl', ['print', `gui/${uid}/${NATIVE_LABEL}`], { encoding: 'utf8', timeout: 10000 });
  verifyLaunchd(state, { parentPid, launcher });
  // launchctl documents this as a diagnostic interface, not a stable protocol.
  // Accept only the observed interval reason; a future/unknown format fails
  // closed. Bootstrap (speculative) and kickstart (non-ipc demand) are not timers.
  const reason = run('/bin/launchctl', ['blame', `gui/${uid}/${NATIVE_LABEL}`], { encoding: 'utf8', timeout: 10000 }).trim();
  if (reason !== 'interval') throw new Error('native monitor was not launched by the interval timer');
  const receipt = nativeReceipt({ pid: parentPid, launcherHash: hash(read(launcher)), head, now });
  if (!verifiedNativeReceipt(receipt)) throw new Error('native timer receipt is invalid');
  return { trigger: 'launchd', execution_origin: receipt };
}
