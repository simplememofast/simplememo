// Temporary Linux CI diagnostic: no environment dumps, user data, or mutations.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { ensureDisplay, terminateOwnedProcess } from './lib/webkit-driver.mjs';
const variant = process.argv[2];
if (!['empty', 'inherited'].includes(variant)) throw new Error('Select empty or inherited');
const env = variant === 'empty' ? {} : { ...process.env, DISPLAY: '' };
const safeRead = name => { try { return fs.readFileSync(name, 'utf8').trim(); } catch { return '(unavailable)'; } };
const inspect = (pid, depth = 0) => {
  const prefix = `/proc/${pid}`;
  const status = safeRead(`${prefix}/status`).split('\n').filter(l => /^(Name|State|Pid|PPid|Threads|SigPnd|ShdPnd):/.test(l)).join('; ');
  console.log(JSON.stringify({ pid, depth, status, wchan: safeRead(`${prefix}/wchan`) }));
  if (depth < 2) for (const child of safeRead(`${prefix}/task/${pid}/children`).split(/\s+/)) {
    if (/^\d+$/.test(child)) inspect(Number(child), depth + 1);
  }
};
console.log(JSON.stringify({ variant, node: process.version, platform: process.platform }));
console.log(execFileSync('dpkg-query', ['-W', 'xvfb', 'xserver-common', 'x11-xkb-utils'], {encoding:'utf8'}));
let failures = 0;
for (let round = 1; round <= 4; round++) {
  let child, ticker, display;
  const started = Date.now();
  try {
    display = await ensureDisplay({ env, spawnFn: (file, args, options) => {
      child = spawn(file, args, options);
      ticker = setInterval(() => { console.log(`round=${round} elapsed=${Date.now() - started}ms`); inspect(child.pid); }, 1000);
      return child;
    } });
    if (!display) throw new Error('Xvfb unavailable');
    console.log(JSON.stringify({ round, readyMs: Date.now() - started, display: display.display }));
    execFileSync('/usr/bin/xdpyinfo', ['-display', display.display], {stdio:'pipe',timeout:2000});
  } catch (error) {
    failures++;
    console.log(JSON.stringify({ round, error: error.message, diagnostics: error.diagnostics }));
  } finally {
    clearInterval(ticker);
    if (child) await terminateOwnedProcess(child);
  }
}
console.log(JSON.stringify({ variant, failures, rounds:4 }));
process.exitCode = failures ? 1 : 0;
