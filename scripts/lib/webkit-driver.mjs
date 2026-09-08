/**
 * **WebKit で描画して測る。**Chromium（Blink）では出ない壊れ方があるので、
 * もう一方のエンジンを同じ土俵に載せる。
 *
 * 【なぜ要るか】
 * [2026-09-03] 配信当日、トップに追加した帯が**実機（iOS = WebKit）で横スクロール**した。
 * こちらの検査は Blink で 3面 × 14幅・フォント太らせ・iPhoneプリセットのどれでも
 * 一度も再現できず、「異常なし」と報告している。原因は `word-break: keep-all` で、
 * **WebKit はこれを厳密に守り、Blink は守らない。**
 *
 * そのときは「この環境に WebKit は入らない」と結論した（`npx playwright install webkit` が
 * egress で 403）。**その結論は経路を1つしか試していなかった。**
 * `apt-get install webkit2gtk-driver` は通り、**WebKitGTK 2.52 + W3C WebDriver** が手に入る。
 * Safari と同じ WebKit コア（`AppleWebKit/605.1.15`）である。
 *
 * 【実測で確かめたこと】
 * 修理前の `index.html`（実機が `over=41px` を出した版）を両エンジンで測ると:
 *
 *     Blink      … 320/360/390/393/430px すべて **over=0**（＝当時の誤報告を再現）
 *     WebKitGTK  … 390px で **over=31px**（実機の 41px と同じ向き・同じ桁）
 *
 * 差の 10px は**ラテン文字と絵文字のフォールバック**（実機は SF Pro / Apple Color Emoji、
 * ここは DejaVu / Noto Color Emoji）とエンジンの版差。**日本語の字幅は一致する** ——
 * サイトが Noto Sans JP を自前配信していて、実機も同じ woff2 を読むため。
 *
 * 【限界】
 * - **iOS Safari そのものではない。**WebKitGTK は同じコアの別ポート
 * - **ラテン文字のフォールバックは実機と違う。**上の実測では 41 → 31px と**過小に出た**。
 *   つまり「WebKit で 0」は「実機で 0」を意味しない。**向きは合うが、余裕は多めに見ること**
 * - `visualViewport`・スクロールバーの扱い・ソフトキーボードは再現しない
 *
 * 【作り】
 * WebKitWebDriver は**ドライバ1本につきセッション1つ**しか張れず、
 * `window/rect` も効かない（幅を指定しても 447px のまま）。
 * なので**幅ぴったりの iframe を土台ページに立てて測る** ——
 * iframe の中は独立したビューポートになるので、メディアクエリも `100vw` も目的の幅で効く。
 * 並列化はドライバを複数プロセス立てて行う（4コアで3本が頭打ち・378ms/通り）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

/** ドライバの実体。**無いことを「異常なし」と混ぜない**ので、null を返して呼び出し側で落とす。 */
export function findWebKitDriver(candidates = ['/usr/bin/WebKitWebDriver', '/usr/local/bin/WebKitWebDriver']) {
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  try {
    const p = execFileSync('which', ['WebKitWebDriver'], { encoding: 'utf8', stdio: 'pipe' }).trim();
    return p && fs.existsSync(p) ? p : null;
  } catch { return null; }
}

/**
 * 画面が要る（WebKitGTK はヘッドレスで動かない）。
 * `DISPLAY` が無ければ Xvfb を立てる。**立てられなければ null** —— 黙って続けない。
 */
export async function ensureDisplay({ env = process.env, xvfbPath = '/usr/bin/Xvfb',
  spawnFn = spawn, startupMs = 15_000 } = {}) {
  if (env.DISPLAY) return { display: env.DISPLAY, proc: null };
  if (!fs.existsSync(xvfbPath)) return null;
  // Cold CI startup can wait on disk I/O in Xvfb/xkbcomp. Keep a bounded
  // deadline while allowing the cold process to load before judging availability.
  // Let Xserver choose a free display and notify readiness on a private pipe.
  // Never reuse :99 blindly or remove another server's socket/lock files.
  const proc = spawnFn(xvfbPath, ['-displayfd', '3', '-screen', '0', '1280x1024x24', '-nolisten', 'tcp'],
    { env, stdio: ['ignore', 'ignore', 'pipe', 'pipe'], detached: false });
  const disp = { display: null, proc, stderr: '', spawnError: null };
  proc.stderr.on('data', chunk => { disp.stderr = (disp.stderr + chunk.toString()).slice(-2_048); });
  proc.on('error', error => { disp.spawnError = errorDetail(error); });
  try {
    disp.display = await new Promise((resolve, reject) => {
      let data = '';
      const fd = proc.stdio[3];
      const finish = (error, display) => {
        clearTimeout(timer);
        fd.off('data', onData); fd.off('end', onEnd); fd.off('error', onError);
        proc.off('exit', onExit); proc.off('error', onError);
        error ? reject(error) : resolve(display);
      };
      const onError = error => finish(error);
      const onExit = (code, signal) => finish(new Error(`Xvfb exited before ready: code=${code} signal=${signal}`));
      const onEnd = () => finish(new Error('Xvfb closed readiness pipe without a display'));
      const onData = chunk => {
        data += chunk.toString();
        if (data.length > 16) return finish(new Error('Xvfb readiness response too long'));
        if (!data.includes('\n')) return;
        if (!/^\d{1,5}\n$/.test(data) || Number(data.trim()) > 65535) {
          return finish(new Error('Xvfb returned an invalid display number'));
        }
        finish(null, `:${Number(data.trim())}`);
      };
      const timer = setTimeout(() => finish(new Error(`Xvfb readiness timed out after ${startupMs}ms`)), startupMs);
      fd.on('data', onData); fd.once('end', onEnd); fd.once('error', onError);
      proc.once('exit', onExit); proc.once('error', onError);
    });
    return disp;
  } catch (error) {
    // Readiness-pipe EOF can arrive before exit; retain the diagnostic now.
    error.diagnostics = [displayDiagnostic(disp)];
    try { await terminateOwnedProcess(proc); }
    catch (cleanupError) { error.diagnostics.push(errorDetail(cleanupError)); }
    throw error;
  }
}

/**
 * 幅ぴったりの iframe を立てて測る本体。**土台ページと同一オリジン**なので中を読める。
 * `arguments` の最後は WebDriver の `execute/async` が渡すコールバック。
 */
export const IFRAME_PROBE = `
  const [path, width] = arguments;
  const done = arguments[arguments.length - 1];
  const prev = document.getElementById('__probe'); if (prev) prev.remove();
  const f = document.createElement('iframe');
  f.id = '__probe';
  f.style.cssText = 'position:absolute;left:0;top:0;border:0;width:' + width + 'px;height:900px';
  f.src = path;
  f.onload = () => setTimeout(() => {
    try {
      const d = f.contentDocument, de = d.documentElement;
      const vw = de.clientWidth, doc = de.scrollWidth;
      const culprits = [];
      if (doc > vw) {
        for (const e of d.querySelectorAll('*')) {
          const r = e.getBoundingClientRect();
          if (!r.width || Math.round(r.right) < doc - 1) continue;
          // 横スクロールできる祖先を持つものは漏れではない（料金カルーセル等）
          let scroller = null, n = e.parentElement;
          while (n && n !== de) {
            const ox = f.contentWindow.getComputedStyle(n).overflowX;
            if (ox === 'auto' || ox === 'scroll') { scroller = n.className || n.tagName.toLowerCase(); break; }
            n = n.parentElement;
          }
          if (scroller) continue;
          culprits.push({ tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().slice(0, 30),
            width: Math.round(r.width), right: Math.round(r.right),
            text: (e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40) });
        }
      }
      done(JSON.stringify({ vw, doc, over: doc - vw, culprits: culprits.slice(-3) }));
    } catch (err) { done(JSON.stringify({ error: String(err && err.message || err).slice(0, 140) })); }
  }, 320);
  document.body.appendChild(f);`;

// The async script's own deadline is 60 seconds. Allow its error response to
// arrive, but do not inherit fetch's much longer default transport deadline.
export const REQUEST_TIMEOUT_MS = 75_000;
const oneLine = value => String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 600);
export function errorDetail(error) {
  const causes = [error?.cause, ...(error?.cause?.errors ?? [])].filter(Boolean);
  return oneLine([error?.name, error?.message ?? error,
    ...causes.map(e => [e.code, e.message].filter(Boolean).join(': '))].filter(Boolean).join(' | '));
}

export const webDriverCall = (port, { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) =>
  async (method, url, body, { deadlineMs = timeoutMs } = {}) => {
    const started = Date.now();
    try {
      const res = await fetchImpl(`http://127.0.0.1:${port}${url}`, {
        method, headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(deadlineMs),
      });
      // Invalid/truncated JSON is a failed command, never an empty success.
      const json = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      return json.value;
    } catch (error) {
      throw new Error(`WebDriver ${port} ${method} ${url}: ${errorDetail(error)} `
        + `(elapsed=${Date.now() - started}ms, deadline=${deadlineMs}ms)`, { cause: error });
    }
  };

export function driverDiagnostic(d) {
  return oneLine(`port=${d.port} pid=${d.proc.pid ?? 'unavailable'} `
    + `exit=${d.proc.exitCode ?? 'none'} signal=${d.proc.signalCode ?? 'none'} `
    + `spawn_error=${d.spawnError ?? 'none'} stderr=${d.stderr?.slice(-400) || '(empty)'}`);
}

export function displayDiagnostic(disp) {
  return oneLine(`Xvfb display=${disp.display ?? 'unassigned'} pid=${disp.proc?.pid ?? 'unavailable'} `
    + `exit=${disp.proc?.exitCode ?? 'none'} signal=${disp.proc?.signalCode ?? 'none'} `
    + `spawn_error=${disp.spawnError ?? 'none'} stderr=${disp.stderr?.slice(-400) || '(empty)'}`);
}

// Wait for each owned direct child, with bounded escalation. This does not
// claim that arbitrary descendants are reaped or touch externally owned X11.
export async function terminateOwnedProcess(proc, { graceMs = 2_000, killMs = 1_000 } = {}) {
  const exited = () => !proc.pid || proc.exitCode !== null || proc.signalCode !== null;
  if (exited()) return;
  const signalAndWait = (signal, waitMs) => new Promise(resolve => {
    const finish = value => { clearTimeout(timer); proc.off('exit', onExit); resolve(value); };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(exited()), waitMs);
    proc.once('exit', onExit);
    try { proc.kill(signal); } catch { finish(exited()); }
  });
  if (await signalAndWait('SIGTERM', graceMs)) return;
  if (await signalAndWait('SIGKILL', killMs)) return;
  throw new Error(`Owned process ${proc.pid} did not exit after SIGKILL`);
}

export async function stopDrivers(drivers, disp, { deadlineMs = 2_000 } = {}) {
  const results = await Promise.allSettled(drivers.map(async d => {
      try {
        if (d.session) await d.call('DELETE', `/session/${d.session}`, undefined, { deadlineMs });
      } catch { /* A broken driver must still be terminated below. */ }
      finally { await terminateOwnedProcess(d.proc); }
    }));
  if (disp.proc) {
    try { await terminateOwnedProcess(disp.proc); }
    catch (reason) { results.push({ status: 'rejected', reason }); }
  }
  const errors = results.filter(r => r.status === 'rejected').map(r => r.reason);
  if (errors.length) throw new AggregateError(errors, 'Owned WebKit process cleanup failed');
}

/**
 * `pages × widths` を WebKit で測る。戻りの形は Chromium 側の `measure()` に揃えてある。
 *
 * **測れなかった組み合わせは `failures` に積む。**握りつぶすと通り数が減るだけで、
 * 報告は「漏れなし」になる（Chromium 側で 2026-09-03 に同じ穴を塞いだ）。
 */
export async function measureWebKit({ pages, widths, port, concurrency = 3, basePort = 4700 } = {}) {
  const driver = findWebKitDriver();
  if (!driver) {
    return { measurable: false, engine: 'webkit',
      why: 'WebKitWebDriver が無い（`apt-get install -y --no-install-recommends webkit2gtk-driver xvfb`）' };
  }
  const disp = await ensureDisplay();
  if (!disp) {
    return { measurable: false, engine: 'webkit',
      why: 'DISPLAY が無く Xvfb も入っていない（WebKitGTK はヘッドレスで動かない）' };
  }
  const jobs = [];
  for (const page of pages) for (const width of widths) jobs.push({ page, width });
  const n = Math.max(1, Math.min(concurrency, jobs.length));
  const drivers = [];
  const results = []; const failures = [];
  let measurementError;
  try {
    for (let i = 0; i < n; i++) {
      const p = basePort + i;
      const proc = spawn(driver, [`--port=${p}`, '--host=127.0.0.1'],
        { env: { ...process.env, DISPLAY: disp.display }, stdio: ['ignore', 'ignore', 'pipe'] });
      const d = { port: p, proc, call: webDriverCall(p), session: null, stderr: '', spawnError: null };
      proc.stderr.on('data', chunk => { d.stderr = (d.stderr + chunk.toString()).slice(-2_048); });
      proc.on('error', error => { d.spawnError = errorDetail(error); });
      drivers.push(d);
    }
    await new Promise((r) => setTimeout(r, 2000));
    for (const d of drivers) {
      const s = await d.call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'MiniBrowser' } } });
      d.session = s.sessionId;
      await d.call('POST', `/session/${d.session}/timeouts`, { script: 60000 });
      // 土台は同一オリジンの軽いファイル（iframe の中身とオリジンを揃えるため）
      await d.call('POST', `/session/${d.session}/url`, { url: `http://127.0.0.1:${port}/robots.txt` });
    }
    let next = 0;
    await Promise.all(drivers.map(async (d) => {
      for (let i = next++; i < jobs.length; i = next++) {
        const { page, width } = jobs[i];
        try {
          const raw = await d.call('POST', `/session/${d.session}/execute/async`,
            { script: IFRAME_PROBE, args: [page, width] });
          const r = JSON.parse(raw);
          if (r.error) failures.push({ page, width, why: r.error });
          else results.push({ page, width, ...r });
        } catch (e) {
          failures.push({ page, width, why: String(e.message || e).split('\n')[0].slice(0, 140) });
        }
      }
    }));
  } catch (error) {
    measurementError = error;
    // Capture state before cleanup sends its own termination signals.
    error.diagnostics = drivers.map(driverDiagnostic);
    if (disp.proc) error.diagnostics.push(displayDiagnostic(disp));
    throw error;
  } finally {
    try { await stopDrivers(drivers, disp); }
    catch (error) {
      if (!measurementError) throw error;
      measurementError.diagnostics.push(errorDetail(error));
    }
  }
  return { measurable: true, engine: 'webkit', results, failures,
    problems: results.filter((r) => r.over > 0) };
}

/** どこから読み込まれても壊れないよう、パスの組み立てだけ切り出しておく。 */
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
