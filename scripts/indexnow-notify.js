#!/usr/bin/env node
/**
 * IndexNow Notification Script for simplememofast.com
 * Sends URL update notifications to Bing/Yandex/Naver/Seznam via IndexNow protocol.
 *
 * Usage:
 *   node scripts/indexnow-notify.js                    # HEAD~1..HEAD で内容が変わった .html を通知
 *   node scripts/indexnow-notify.js --since 3          # HEAD~3..HEAD（first-parent）で内容が変わった .html を通知
 *   node scripts/indexnow-notify.js /blog/new-post     # Notify specific URL
 *   node scripts/indexnow-notify.js --all              # Notify all pages
 *   node scripts/indexnow-notify.js --dry-run          # 選択結果だけ表示して送信しない（他モードと併用可）
 *
 * --since N は「直近 N コミットの first-parent 差分」。以前は fs.stat().mtime の
 * 日数判定だったが、CI の新規 checkout では全ファイルの mtime が checkout 時刻に
 * なるため、main push のたびに実質全ページを通知していた。git 差分ならば
 * 「そのマージが実際に変えたページ」だけになる（マージコミットは首親差分）。
 * 注意: 複数コミットを一度に push した場合、CI の --since 1 は最後のコミット分のみ。
 * その場合は手動で --since N を実行する。
 *
 * [2026-11-28] **差分のあるファイルではなく、内容が変わったページだけを通知する。**
 * スクリプト・CSS・class だけを全ページで差し替えるマージ（#2381・#2385・#2396）は
 * 1回で 2,106〜2,301 URL を「更新」として送っていたが、内容が変わっていて通知してよい
 * （noindex でない）ページは 11・0・4 だった（noindex を含めると 19・0・20 ファイル）。
 * 内容の定義は sitemap の lastmod と同じ
 * （scripts/sitemap_lastmod.py の content_signature。docs/seo/SITEMAP-LASTMOD.md）で、
 * 比較は scripts/indexnow_content_changes.py が行う。**比較が失敗したら従来どおり
 * 変更 .html の全件を通知する**（精度を失っても、通知は失わない）。
 * 送信の前に、本番がそのマージを配信しているかを最大5分だけ確かめる。確かめられ
 * なくても送る（確認できなかったことはジョブサマリに残る）。
 *
 * Setup:
 *   1. Generate key: node scripts/indexnow-notify.js --generate-key
 *   2. Deploy the key file to site root
 *   3. Run notify after deploys
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');

const SITE_URL = 'https://simplememofast.com';
const ROOT_DIR = path.resolve(__dirname, '..');
const KEY_FILE = path.join(ROOT_DIR, '.indexnow-key');
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const CONTENT_HELPER = path.join(__dirname, 'indexnow_content_changes.py');

const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tiktok'];

const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SIGNATURE = /^[0-9a-f]{64}$/;
const isZeroOid = (oid) => /^0+$/.test(String(oid));

/**
 * 本番がマージを配信しているかの確認。**どの結果でも送信は止めない。**
 * 2026-11-18..27 の40回のマージでは、通知が Cloudflare Pages の配信完了より
 * 0〜31秒早かった。配信の完了はマージの約10〜48秒後なので、5分あれば足りる。
 * Python-urllib の User-Agent は本番で 403 になるため、名乗りを付ける。
 */
const LIVE_CHECK = {
  userAgent: 'SimpleMemo-IndexNow/1.0',
  probes: 3,
  intervalMs: 10_000,
  budgetMs: 5 * 60_000,
  requestTimeoutMs: 15_000,
};

function generateKey() {
  const chars = 'abcdef0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return key;
}

/**
 * 鍵の解決順:
 *   1. .indexnow-key（gitignore 済みのローカル上書き）
 *   2. サイトルートに配備済みの鍵検証ファイル <32hex>.txt（中身 = ファイル名）
 *
 * 以前は「無ければ生成」だったが、.indexnow-key は gitignore されているため
 * CI では毎回ランダムな新鍵が生成され、keyLocation が配備されていない
 * <新鍵>.txt を指す無効な通知を送っていた。鍵検証ファイルは公開情報
 * （プロトコル上 /<key>.txt として配信するもの）なので、コミット済みの
 * 1 ファイルを唯一の正とする。複数あれば #411 型の鍵重複が再発している
 * ということなので、黙って選ばずエラーで知らせる。
 */
function resolveKey({ root = ROOT_DIR, keyFile = KEY_FILE } = {}) {
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').trim();
  }
  const candidates = fs.readdirSync(root)
    .filter((f) => /^[a-f0-9]{32}\.txt$/.test(f))
    .filter((f) => fs.readFileSync(path.join(root, f), 'utf8').trim() === f.slice(0, -4));
  if (candidates.length === 1) return candidates[0].slice(0, -4);
  if (candidates.length === 0) {
    throw new Error('IndexNow key not found: .indexnow-key も <key>.txt も無い。--generate-key で作成し、<key>.txt をコミットして配備すること');
  }
  throw new Error(`IndexNow key ambiguous: ${candidates.join(', ')} — 鍵検証ファイルはサイトルートに 1 つだけ残すこと（docs/indexnow-setup.md 参照）`);
}

function createKey() {
  if (fs.existsSync(KEY_FILE)) {
    console.log(`.indexnow-key already exists: ${fs.readFileSync(KEY_FILE, 'utf8').trim()}`);
    return;
  }
  const key = generateKey();
  fs.writeFileSync(KEY_FILE, key);
  const keyVerificationPath = path.join(ROOT_DIR, `${key}.txt`);
  fs.writeFileSync(keyVerificationPath, key);
  console.log(`✓ IndexNow key generated: ${key}`);
  console.log(`✓ Key file created: ${key}.txt (deploy this to site root)`);
  console.log(`✓ Key stored in: .indexnow-key`);
}

function getAllHtmlFiles(dir) {
  return collectHtmlFiles(dir, { skipDirs: SKIP_DIRS, skipFiles: ['404.html'] });
}

function filePathToUrl(filePath) {
  return SITE_URL + toUrlPath(ROOT_DIR, filePath);
}

/**
 * git diff の出力から通知してよい .html だけを残す。**純粋**（存在確認は注入する）。
 *
 * 何を通知するかの判断はここに全部ある。**間違えると、消えたページや検査用の
 * 見本を検索エンジンへ「新しい」と申告する**ことになるので、切り出して
 * --selftest から直接叩けるようにしてある。
 */
function notifiablePaths(lines, exists = (p) => fs.existsSync(path.join(ROOT_DIR, p))) {
  return String(lines).split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => p.endsWith('.html'))
    .filter((p) => p !== '404.html')
    .filter((p) => !SKIP_DIRS.some((d) => p === d || p.startsWith(d + '/')))
    // 削除・リネーム元のパスは disk に無い。消えたページは通知しない。
    .filter(exists);
}

/**
 * noindex の面を通知対象から外す。**外した面も返す** —— 黙って減らさない。
 *
 * ここは `notifiablePaths` の外にあったので、**自己テストが一度も通っていなかった。**
 * 2026-09-03 に隔離した写しで確かめたところ、この判定を殺しても自己テストは
 * 13件中0件失敗（緑のまま）だった。noindex の面を「新しい記事」として
 * 検索エンジンへ申告しても、**CI は何も言わない。**
 */
function partitionNoindex(paths, read = (p) => fs.readFileSync(path.join(ROOT_DIR, p), 'utf8')) {
  const noindexExcluded = [];
  const urls = [];
  for (const p of paths) {
    if (/noindex/i.test(read(p))) {
      noindexExcluded.push(p);
      continue;
    }
    urls.push(filePathToUrl(path.join(ROOT_DIR, p)));
  }
  return { noindexExcluded, urls };
}

/**
 * `git diff --raw --no-abbrev -z` の出力を {path, before, after, status} の配列にする。**純粋。**
 * 1件は「:<mode> <mode> <before> <after> <status>\0<path>\0」。R/C（リネーム・コピー）だけは
 * パスが2つ続くので、移動先を取る（呼び出し側は --no-renames なので本来は来ない）。
 */
function parseRawDiff(out) {
  const parts = String(out).split('\0');
  const rows = [];
  let i = 0;
  while (i < parts.length) {
    const meta = parts[i++];
    if (!meta.startsWith(':')) continue;
    const fields = meta.slice(1).split(' ');
    const status = fields[4] || '';
    let file = parts[i++];
    if (/^[RC]/.test(status)) file = parts[i++];
    if (file === undefined || file === '') break;
    rows.push({ path: file, before: fields[2] || '', after: fields[3] || '', status: status.charAt(0) });
  }
  return rows;
}

/** 失敗をジョブサマリへ1行で残す（Python の traceback は最後の行が本文）。 */
function shortError(e) {
  const stderr = e && e.stderr ? String(e.stderr).trim() : '';
  const text = stderr ? stderr.split('\n').pop() : String((e && e.message) || e);
  return text.replace(/\s+/g, ' ').slice(0, 200);
}

function runContentHelper(rows, { root = ROOT_DIR, env = process.env } = {}) {
  return execFileSync('python3', [CONTENT_HELPER, '--root', root], {
    cwd: root, env, input: JSON.stringify(rows), encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * 内容が変わった行だけを残す。**比較できなければ全件を返す**（従来の動き）。
 *
 * 返す行は {path, before, after}。before / after は内容の署名で、本番の配信と比べる
 * ときに使う（新しいファイルは before が null）。比較に失敗した回は署名が全部 null で、
 * error に理由が入る。**黙って減らさない** —— 比較の出力が入力と食い違う
 * （入力に無いパスを返す、新しいファイルを落とす、署名の形が違う）ときも失敗として扱う。
 * 新しいファイルを落とす比較は、新しい記事を1件も申告しなくなる形の誤りだから。
 */
function contentChanges(rows, run = runContentHelper) {
  if (rows.length === 0) return { rows: [], error: null };
  const openAll = (why) => ({ rows: rows.map((r) => ({ path: r.path, before: null, after: null })), error: why });
  try {
    const bad = rows.find((r) => !OBJECT_ID.test(r.before) || !OBJECT_ID.test(r.after));
    if (bad) return openAll(`git diff --raw の行を読めない: ${bad.path}`);
    const got = JSON.parse(run(rows.map((r) => ({ path: r.path, before: r.before, after: r.after }))));
    if (!Array.isArray(got)) return openAll('比較の出力が配列でない');
    const input = new Map(rows.map((r) => [r.path, r]));
    const out = new Map();
    for (const g of got) {
      const src = g && input.get(g.path);
      const fresh = src && isZeroOid(src.before);
      if (!src || out.has(g.path) || !SIGNATURE.test(g.after)
        || (fresh ? g.before !== null : !SIGNATURE.test(g.before))) {
        return openAll(`比較の出力が入力と合わない: ${g && g.path}`);
      }
      out.set(g.path, { path: g.path, before: g.before, after: g.after });
    }
    const lost = rows.filter((r) => isZeroOid(r.before) && !out.has(r.path)).length;
    if (lost) return openAll(`新しいファイル ${lost} 件が比較の結果に無い`);
    return { rows: rows.filter((r) => out.has(r.path)).map((r) => out.get(r.path)), error: null };
  } catch (e) {
    return openAll(shortError(e));
  }
}

/**
 * 直近 commits 個の first-parent 差分から通知対象を組み立てる。
 * HEAD~N は first parent を辿るので、マージコミットでは首親差分になる。
 *
 * changed は従来どおりの「通知してよい変更 .html」（SKIP_DIRS・404・存在確認）。
 * そのうち内容の変わらないものを unchanged に、noindex を noindexExcluded に分け、
 * 残りを urls にする。probes は urls と同じ順で、本番の配信を確かめるための署名を持つ。
 */
function getChangedSince(commits = 1, {
  root = ROOT_DIR,
  env = process.env,
  git = (args) => execFileSync('git', args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }),
  helper = (rows) => runContentHelper(rows, { root, env }),
  exists = (p) => fs.existsSync(path.join(root, p)),
  read = (p) => fs.readFileSync(path.join(root, p), 'utf8'),
} = {}) {
  let out;
  try {
    out = git(['diff', '--raw', '--no-renames', '--no-abbrev', '-z', `HEAD~${commits}`, 'HEAD', '--', '*.html']);
  } catch (e) {
    throw new Error(
      `git diff HEAD~${commits}..HEAD failed（shallow checkout で親コミットが無い可能性。`
      + `seo-check.yml の checkout は fetch-depth: 2 以上が必要）: ${e.message}`
    );
  }
  // 削除（after が 0）は通知しない。存在確認（notifiablePaths）でも落ちるが、先に外す。
  const rows = parseRawDiff(out).filter((r) => !isZeroOid(r.after));
  const kept = new Set(notifiablePaths(rows.map((r) => r.path).join('\n'), exists));
  const candidates = rows.filter((r) => kept.has(r.path));
  const changed = candidates.map((r) => r.path);
  const { rows: contentRows, error: contentError } = contentChanges(candidates, helper);
  const byPath = new Map(contentRows.map((r) => [r.path, r]));
  const unchanged = changed.filter((p) => !byPath.has(p));
  const { noindexExcluded, urls } = partitionNoindex(changed.filter((p) => byPath.has(p)), read);
  const excluded = new Set(noindexExcluded);
  const probes = changed.filter((p) => byPath.has(p) && !excluded.has(p)).map((p) => ({
    url: filePathToUrl(path.join(ROOT_DIR, p)), before: byPath.get(p).before, after: byPath.get(p).after,
  }));
  return { changed, unchanged, noindexExcluded, urls, contentError, probes };
}

function servedSignature(html, { root = ROOT_DIR } = {}) {
  return execFileSync('python3', [CONTENT_HELPER, '--signature'], {
    cwd: root, input: html, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/** 確かめる URL。更新したページを先に（「前の内容と違う」でも判定でき、後のデプロイに追い越されても止まらない）。 */
function pickProbes(probes, n = LIVE_CHECK.probes) {
  const known = probes.filter((x) => x && x.url && x.after);
  return [...known.filter((x) => x.before), ...known.filter((x) => !x.before)].slice(0, n);
}

async function probeOnce(target, { fetchImpl, signatureOf, requestTimeoutMs }) {
  let res;
  try {
    res = await fetchImpl(target.url, {
      redirect: 'manual',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(requestTimeoutMs) : undefined,
      headers: { 'User-Agent': LIVE_CHECK.userAgent, 'Cache-Control': 'no-cache' },
    });
  } catch (e) {
    return { live: false, detail: `取得に失敗（${shortError(e)}）` };
  }
  if (res.status !== 200) {
    try { await res.body?.cancel?.(); } catch { /* 読まない本文を閉じるだけ */ }
  }
  // 拒否は待っても変わらない。待たずに送る（従来の動き）。Cloudflare の確認画面は cf-mitigated が付く。
  const mitigated = typeof res.headers?.get === 'function' ? res.headers.get('cf-mitigated') : null;
  if (res.status === 403 || res.status === 429 || mitigated) {
    return { live: false, refused: true, detail: `HTTP ${res.status}${mitigated ? `（cf-mitigated: ${mitigated}）` : ''}` };
  }
  if (res.status !== 200) return { live: false, detail: `HTTP ${res.status}` };
  let served;
  try {
    served = signatureOf(await res.text());
  } catch (e) {
    return { live: false, detail: `署名を計算できない（${shortError(e)}）` };
  }
  if (served === target.after) return { live: true };
  if (target.before && served !== target.before) return { live: true };
  return { live: false, detail: 'まだ前の内容' };
}

/**
 * 本番がこのマージを配信し始めるまで待つ。**送信の可否は決めない。**
 *
 * 公開とみなすのは、どれか1つの URL が 200 で、署名がマージ後と一致したとき、
 * または（更新したページなら）マージ前と違うとき。後者は、さらに新しいデプロイに
 * 追い越された場合でも止まらないため。404・リダイレクト・取得失敗は「まだ」。
 * 403 / 429 は待っても変わらないので、その回で打ち切る。
 * 回数は budgetMs / intervalMs + 1 回までで、時計が進まなくても終わる。
 */
async function waitUntilLive(probes, {
  fetchImpl = globalThis.fetch,
  signatureOf = (html) => servedSignature(html),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  intervalMs = LIVE_CHECK.intervalMs,
  budgetMs = LIVE_CHECK.budgetMs,
  requestTimeoutMs = LIVE_CHECK.requestTimeoutMs,
} = {}) {
  const targets = pickProbes(probes);
  if (!targets.length) return { state: 'skipped', detail: '確かめる署名が無い', waitedMs: 0, attempts: 0 };
  if (typeof fetchImpl !== 'function') return { state: 'skipped', detail: 'fetch が使えない', waitedMs: 0, attempts: 0 };
  const start = now();
  const maxAttempts = Math.floor(budgetMs / intervalMs) + 1;
  let attempts = 0;
  let detail = '';
  while (attempts < maxAttempts) {
    attempts++;
    let refused = 0;
    for (const target of targets) {
      const seen = await probeOnce(target, { fetchImpl, signatureOf, requestTimeoutMs });
      if (seen.live) return { state: 'live', waitedMs: now() - start, attempts };
      if (seen.refused) refused++;
      detail = seen.detail;
    }
    if (refused === targets.length) return { state: 'refused', detail, waitedMs: now() - start, attempts };
    if (attempts >= maxAttempts || now() - start + intervalMs > budgetMs) break;
    await sleep(intervalMs);
  }
  return { state: 'timeout', detail, waitedMs: now() - start, attempts };
}

/** 待ちの結果をサマリの1行にする。**例外を外へ出さない**（ここで落ちても送信は続ける）。 */
async function deployGate(probes, deps = {}) {
  const minutes = (deps.budgetMs ?? LIVE_CHECK.budgetMs) / 60_000;
  try {
    const r = await waitUntilLive(probes, deps);
    const line = r.state === 'live' ? `- 本番の公開: 確認済み（${Math.round(r.waitedMs / 1000)} 秒待機）`
      : r.state === 'timeout' ? `- 本番の公開を${minutes}分以内に確認できず、そのまま送信（最後の観測: ${r.detail || '不明'}）`
        : r.state === 'refused' ? `- 本番の公開を確認できず（${r.detail}）、そのまま送信`
          : `- 本番の公開: 確認せず（${r.detail}）`;
    return { ...r, line };
  } catch (e) {
    return { state: 'error', line: `- 本番の公開を確かめる途中で失敗（${shortError(e)}）、そのまま送信` };
  }
}

/**
 * 待ってから送る。**送るかどうかは待ちの結果で変えない** —— 送信ステップは
 * continue-on-error なので、ここで exit 1 にしても誰にも見えず、通知だけが消える。
 * dry-run と、比較に失敗した回（確かめる署名が無い）は待たない。
 */
async function announce(urls, { dryRun = false, probes = [], contentError = null, gate = deployGate, send }) {
  const lines = [];
  if (!dryRun && urls.length && !contentError && probes.length) {
    const g = await gate(probes);
    if (g && g.line) lines.push(g.line);
  }
  let result = urls.length === 0 ? '通知対象なし・送信なし' : 'dry-run: 送信なし';
  if (urls.length && !dryRun) result = await send(urls);
  return { lines, result };
}

/** 差分通知のジョブサマリ（送信前の部分）。 */
function summaryOf(commits, sel, dryRun) {
  return [
    `### IndexNow 差分通知（HEAD~${commits}..HEAD, first-parent）`,
    '',
    `- 変更 .html: ${sel.changed.length} 件（うち内容の変更なし ${sel.unchanged.length} 件・noindex 除外 ${sel.noindexExcluded.length} 件）`,
    ...(sel.contentError ? [`- 内容の比較に失敗（${sel.contentError}）: 従来どおり変更 .html の全件を通知`] : []),
    `- 通知URL: ${sel.urls.length} 件${dryRun ? '（dry-run: 送信なし）' : ''}`,
    ...sel.urls.map((u) => `  - ${u}`),
  ];
}

/**
 * IndexNow の送信本文。**keyLocation は必ず `<鍵>.txt` を指す。**
 *
 * ここがずれると、通知は HTTP 200 を返しながら1件も反映されない ——
 * `.indexnow-key` が gitignore されていたころ、CI は毎回ランダムな鍵を作り、
 * **サイトに配備されていない検証ファイル**を指す通知を送り続けていた。
 * 送信の直前で組み立てていたので自己テストからは見えず、
 * 2026-09-03 に測ったらここを壊しても 13件中0件失敗（緑）だった。
 */
function buildPayload(key, urls) {
  return {
    host: 'simplememofast.com',
    key: key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: urls,
  };
}

function sendNotification(key, urls) {
  if (urls.length === 0) {
    console.log('No URLs to notify.');
    return Promise.resolve(null);
  }

  const payload = JSON.stringify(buildPayload(key, urls));

  return new Promise((resolve, reject) => {
    const url = new URL(INDEXNOW_ENDPOINT);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✓ IndexNow: ${urls.length} URLs submitted (HTTP ${res.statusCode})`);
          resolve(res.statusCode);
        } else {
          console.error(`✗ IndexNow failed: HTTP ${res.statusCode} - ${body}`);
          // Log failed URLs for retry
          const logPath = path.join(ROOT_DIR, 'scripts', 'indexnow-failed.log');
          const logEntry = `${new Date().toISOString()} | HTTP ${res.statusCode} | ${urls.length} URLs\n`;
          fs.appendFileSync(logPath, logEntry);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`✗ IndexNow request failed: ${err.message}`);
      const logPath = path.join(ROOT_DIR, 'scripts', 'indexnow-failed.log');
      fs.appendFileSync(logPath, `${new Date().toISOString()} | ERROR | ${err.message}\n`);
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/** GitHub Actions のジョブサマリに通知内訳を残す（ローカル実行では stdout のみ）。 */
function writeSummary(lines) {
  const text = lines.join('\n') + '\n';
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  }
}

/**
 * Prove the notify-or-not decision actually discriminates.
 *
 * data/check-selftests.json: "落ちることを確かめていない検査は、無いのと同じ".
 * Wired into seo-check.yml as its own unconditional step ("IndexNow selection
 * rules fire"); check-selftests.mjs lists `.js` checks since 2026-09-03 and its
 * gatingChecks() confirms that step can fail the job. The step runs on every PR,
 * so the content-comparison helper's own self-test runs there too (below).
 *
 * This script is the one on the list that **acts on the outside world** rather
 * than gating a build: a wrong path here tells search engines that a deleted
 * page, a noindex page, or a fixture under scripts/ is fresh content — or, since
 * the content filter, stays silent about a page that did change. There is no CI
 * failure for either — the request succeeds and the damage is at Bing.
 */
async function runSelfTest() {
  const failures = [];
  let total = 0;
  const t = (name, cond) => { total++; if (!cond) failures.push(name); };
  const all = () => true;
  const keep = (lines) => notifiablePaths(lines, all);

  t('通常のページは通知対象', keep('obsidian/index.html').length === 1);
  t('.html 以外は落とす', keep('data/cpp-map.json\nassets/css/main.css').length === 0);
  t('404.html は通知しない', keep('404.html').length === 0);
  // SKIP_DIRS。**検査用の見本や管理画面を「新しい記事」として申告しない。**
  t('scripts/ 配下は通知しない', keep('scripts/fixture.html').length === 0);
  t('admin/ 配下は通知しない', keep('admin/index.html').length === 0);
  t('docs/ 配下は通知しない', keep('docs/x.html').length === 0);
  t('前方一致で別ディレクトリを巻き込まない', keep('adminsomething/index.html').length === 1);
  // **消えたページを通知しない。**削除・リネーム元は disk に無い。
  t('disk に無いパスは落とす', notifiablePaths('gone/index.html', () => false).length === 0);
  t('空行と空白を落とす', keep('\n  \nobsidian/index.html\n\n').length === 1);

  t('URL はサイトのオリジンで組む',
    filePathToUrl(path.join(ROOT_DIR, 'obsidian/index.html')) === `${SITE_URL}/obsidian/`);
  t('ルートの index.html は / になる',
    filePathToUrl(path.join(ROOT_DIR, 'index.html')) === `${SITE_URL}/`);

  t('生成する鍵は 32 桁の16進', /^[a-f0-9]{32}$/.test(generateKey()));
  t('生成する鍵は毎回違う', generateKey() !== generateKey());

  // ── ここから下は「パスの選び方」の外にある門 ──────────────────
  //
  // 上の検体は notifiablePaths（パスの絞り込み）しか通らない。2026-09-03 に
  // 隔離した写しで測ったところ、**noindex の除外・鍵の重複・keyLocation** を
  // それぞれ潰しても 13件中0件失敗（緑のまま）だった。この道具はこの5本で
  // 唯一**外向きに作用する**ので、どれも CI の失敗ではなく Bing 側の被害になる。
  t('下位の index.html は末尾スラッシュ',
    filePathToUrl(path.join(ROOT_DIR, 'en/index.html')) === `${SITE_URL}/en/`);
  t('index 以外の .html は拡張子を落とす',
    filePathToUrl(path.join(ROOT_DIR, 'faq.html')) === `${SITE_URL}/faq`);

  // **noindex の面を「新しい記事」として申告しない。**
  const pages = {
    'a/index.html': '<html><head></head></html>',
    'b/index.html': '<meta name="robots" content="noindex">',
  };
  const part = partitionNoindex(Object.keys(pages), (p) => pages[p]);
  t('noindex の面は通知しない', part.noindexExcluded.join() === 'b/index.html');
  t('noindex で外した面は黙らずに残す', part.urls.length === 1 && part.urls[0].endsWith('/a/'));

  // ── 鍵の解決（#411 の重複と、CI が毎回新鍵を作っていた穴） ──────
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-selftest-'));
  const key = (n) => String(n).repeat(32).slice(0, 32);
  const put = (name, body) => fs.writeFileSync(path.join(dir, name), body);
  const resolveIn = (keyFile = path.join(dir, '.no-such-file')) => resolveKey({ root: dir, keyFile });
  // 落ちるべきでない場所で落ちたら、それも「✗」として報告する。例外を素通しに
  // すると crash で終わり、**どの判定が壊れたのかが出力から消える。**
  const safe = (fn) => { try { return fn(); } catch (e) { return `throw: ${e.message}`; } };
  const threw = (fn, needle) => {
    try { fn(); return false; } catch (e) { return String(e.message).includes(needle); }
  };

  const k1 = key('a');
  put(`${k1}.txt`, k1);
  t('配備済みの <鍵>.txt が1つならそれを使う', safe(resolveIn) === k1);
  put('.local-key', 'ffffffffffffffffffffffffffffffff');
  t('.indexnow-key があればそれが優先',
    safe(() => resolveIn(path.join(dir, '.local-key'))) === 'ffffffffffffffffffffffffffffffff');
  // 中身がファイル名と一致しない検証ファイルは、プロトコル上そもそも無効。
  put(`${key('b')}.txt`, 'ちがう中身');
  t('中身がファイル名と一致しない <鍵>.txt は候補にしない', safe(resolveIn) === k1);
  // 重複は #411 の再発。**黙ってどちらかを選ばない。**
  const k3 = key('c');
  put(`${k3}.txt`, k3);
  t('<鍵>.txt が2つあれば黙って選ばずに落ちる', threw(resolveIn, 'ambiguous'));
  fs.rmSync(path.join(dir, `${k1}.txt`));
  fs.rmSync(path.join(dir, `${k3}.txt`));
  // **無ければ生成する、をやめた理由。**.indexnow-key は gitignore なので CI では
  // 毎回ランダムな鍵が生まれ、配備されていない検証ファイルを指す通知を送り続けた。
  t('鍵がどこにも無ければ、生成せずに落ちる', threw(resolveIn, 'not found'));
  fs.rmSync(dir, { recursive: true, force: true });

  // ── 送信本文 ────────────────────────────────────────
  const payload = buildPayload(k1, [`${SITE_URL}/`]);
  t('keyLocation は鍵と同じ名前の .txt を指す', payload.keyLocation === `${SITE_URL}/${k1}.txt`);
  t('host はサイトのホスト名', payload.host === 'simplememofast.com');
  t('urlList はそのまま載る', payload.urlList.join() === `${SITE_URL}/`);

  // ── 内容が変わったページだけを通知する（2026-11-28） ─────────────
  // **ここが外向きの判断の本体になった。**誤ると、変わったページを申告しない。
  const Z = '0'.repeat(40);
  const oid = (c) => c.repeat(40);
  const sig = (c) => c.repeat(64);
  const raw = [
    `:100644 100644 ${oid('a')} ${oid('b')} M`, 'obsidian/index.html',
    `:000000 100644 ${Z} ${oid('c')} A`, 'new/index.html',
    `:100644 000000 ${oid('d')} ${Z} D`, 'gone/index.html',
    `:100644 100644 ${oid('e')} ${oid('f')} R087`, 'old/index.html', 'moved/index.html',
  ].join('\0') + '\0';
  const parsed = parseRawDiff(raw);
  t('--raw -z の行を読む', parsed.length === 4 && parsed[0].path === 'obsidian/index.html'
    && parsed[0].before === oid('a') && parsed[0].after === oid('b') && parsed[1].before === Z);
  t('消えた行は after が 0 として読める', parsed[2].path === 'gone/index.html' && isZeroOid(parsed[2].after));
  t('リネームは移動先のパスで読む', parsed[3].path === 'moved/index.html');

  const rowsIn = [
    { path: 'script/index.html', before: oid('1'), after: oid('2') },
    { path: 'text/index.html', before: oid('3'), after: oid('4') },
    { path: 'new/index.html', before: Z, after: oid('5') },
  ];
  const fake = (rows) => () => JSON.stringify(rows);
  const textAndNew = [{ path: 'text/index.html', before: sig('a'), after: sig('b') },
    { path: 'new/index.html', before: null, after: sig('c') }];
  const cc = contentChanges(rowsIn, fake(textAndNew));
  t('内容の変わらない行は通知の候補から外す',
    cc.error === null && cc.rows.map((r) => r.path).join() === 'text/index.html,new/index.html');
  const failed = contentChanges(rowsIn, () => { throw new Error('spawnSync python3 ENOENT'); });
  t('**比較に失敗したら全件を通知の候補に戻す**（従来どおり。黙って減らさない）',
    failed.rows.length === 3 && /python3/.test(failed.error || ''));
  t('比較に失敗した回は署名を持たない（公開の確認をしない）', failed.rows.every((r) => r.after === null));
  const dropsNew = contentChanges(rowsIn, fake(textAndNew.slice(0, 1)));
  t('**新しいファイルを落とす比較は信用しない**', dropsNew.rows.length === 3 && !!dropsNew.error);
  // 形が正しくてもパスが入力と食い違う出力（例: ./ 付きで返す）を受けると、更新したページが黙って消える。
  const invents = contentChanges(rowsIn, fake([...textAndNew, { path: 'x/index.html', before: sig('d'), after: sig('e') }]));
  t('入力に無いパスを返す比較は信用しない', invents.rows.length === 3 && !!invents.error);
  const prefixed = contentChanges(rowsIn, fake(textAndNew.map((r) => ({ ...r, path: `./${r.path}` }))));
  t('パスの書き方が違う比較は信用しない（更新したページを黙って落とさない）', prefixed.rows.length === 3 && !!prefixed.error);
  t('署名の形が違う比較は信用しない',
    contentChanges(rowsIn, fake([{ path: 'text/index.html', before: sig('a'), after: 'x' }])).rows.length === 3);
  t('読めない oid は比較に渡さず全件に戻す',
    contentChanges([{ path: 'a/index.html', before: 'zz', after: oid('1') }], () => '[]').rows.length === 1);
  t('空の差分では比較を呼ばない', contentChanges([], () => { throw new Error('called'); }).error === null);

  // 実物の git と比較器で、差分の取り方から通知の URL までを通す（リポジトリの履歴は使わない）。
  // GIT_DIR などが残っていると一時リポジトリの代わりに本物を操作するので、GIT_* を外す。
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-content-'));
  try {
    const git = (...a) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=indexnow-selftest', '-c', 'user.email=indexnow-selftest@localhost', ...a],
    { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const write = (p, s) => {
      fs.mkdirSync(path.dirname(path.join(repo, p)), { recursive: true });
      fs.writeFileSync(path.join(repo, p), s);
    };
    const page = (body, js = 'v1', cls = 'a') => '<html><head><title>T</title>'
      + `<script src="/js/app.js?${js}"></script></head><body class="${cls}"><h1>H</h1><p>${body}</p></body></html>`;
    git('-c', 'init.defaultBranch=main', 'init', '-q');
    write('script/index.html', page('a'));
    write('text/index.html', page('b'));
    write('gone/index.html', page('c'));
    write('hidden/index.html', page('d'));
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'before');
    write('script/index.html', page('a', 'v2', 'a wide'));
    write('text/index.html', page('b, then sent'));
    write('new/index.html', page('e'));
    fs.rmSync(path.join(repo, 'gone/index.html'));
    write('hidden/index.html', page('d2').replace('<title>', '<meta name="robots" content="noindex"><title>'));
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'after');
    const sel = getChangedSince(1, { root: repo, env });
    t('実物の git: 比較は失敗していない', sel.contentError === null);
    t('実物の git: script・class だけの変更は通知しない', sel.unchanged.join() === 'script/index.html');
    t('実物の git: 本文の変更と新しいページは通知する', sel.urls.join() === `${SITE_URL}/new/,${SITE_URL}/text/`);
    t('実物の git: 消えたページは通知しない', !sel.changed.includes('gone/index.html'));
    t('実物の git: 内容が変わっても noindex は通知しない', sel.noindexExcluded.join() === 'hidden/index.html');
    t('実物の git: 公開の確認に使う署名が通知と同じ順でそろう',
      sel.probes.map((p) => p.url).join() === sel.urls.join()
      && sel.probes.every((p) => SIGNATURE.test(p.after))
      && sel.probes[0].before === null && SIGNATURE.test(sel.probes[1].before));
    const broken = getChangedSince(1, { root: repo, env, helper: () => { throw new Error('helper crashed'); } });
    t('実物の git: 比較が落ちたら変更 .html の全件（noindex 以外）を通知する',
      broken.urls.length === 3 && broken.unchanged.length === 0 && /helper crashed/.test(broken.contentError || ''));
    const summary = summaryOf(1, broken, true).join('\n');
    t('比較の失敗はジョブサマリに残る', summary.includes('内容の比較に失敗') && summary.includes('全件を通知'));
    t('内容の変わらない件数をジョブサマリに出す', summaryOf(1, sel, true).join('\n').includes('うち内容の変更なし 1 件'));
  } catch (e) {
    t(`実物の git の検体が組めた（${shortError(e)}）`, false);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
  // 内容を変えずに移したページは、新しい URL として通知する。--no-renames を外すと git が rename として
  // 移動前の blob と比べ、内容が同じなので黙って通知から消える。上の検体でもこの誤りは落ちるが、それは
  // gone/ と new/ の本文が似ていて git が組にしたという偶然による（2026-11-28 に確かめた）。
  const moveRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-move-'));
  try {
    const git = (...a) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=indexnow-selftest', '-c', 'user.email=indexnow-selftest@localhost', ...a],
    { cwd: moveRepo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('-c', 'init.defaultBranch=main', 'init', '-q');
    fs.mkdirSync(path.join(moveRepo, 'old'));
    fs.writeFileSync(path.join(moveRepo, 'old/index.html'), '<html><head><title>M</title></head><body><h1>M</h1><p>m</p></body></html>');
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'before');
    fs.mkdirSync(path.join(moveRepo, 'moved'));
    fs.renameSync(path.join(moveRepo, 'old/index.html'), path.join(moveRepo, 'moved/index.html'));
    git('add', '-A');
    git('commit', '-q', '--no-verify', '-m', 'after');
    const moved = getChangedSince(1, { root: moveRepo, env });
    t('**内容を変えずに移したページは新しい URL として通知する**（rename として比べない）',
      moved.contentError === null && moved.urls.join() === `${SITE_URL}/moved/`);
  } catch (e) {
    t(`移動の検体が組めた（${shortError(e)}）`, false);
  } finally {
    fs.rmSync(moveRepo, { recursive: true, force: true });
  }
  try {
    execFileSync('python3', [CONTENT_HELPER, '--selftest'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    t('比較器（indexnow_content_changes.py）の自己テストが通る', true);
  } catch (e) {
    console.error(String(e.stdout || ''), String(e.stderr || ''));
    t('比較器（indexnow_content_changes.py）の自己テストが通る', false);
  }

  // ── 本番の公開を待つ（どの結果でも送信は止めない） ──────────────
  const clock = () => {
    let ms = 0;
    const c = { sleeps: 0, now: () => ms, sleep: async (d) => { ms += d; c.sleeps++; } };
    return c;
  };
  // 返す本文 = 署名（signatureOf は恒等）。数値は HTTP ステータス、Error は取得失敗。
  const serving = (seq) => {
    let i = 0;
    const s = { calls: 0 };
    s.fetchImpl = async () => {
      s.calls++;
      const v = seq[Math.min(i++, seq.length - 1)];
      if (v instanceof Error) throw v;
      return typeof v === 'number' ? { status: v, text: async () => '' } : { status: 200, text: async () => v };
    };
    s.signatureOf = (body) => body;
    return s;
  };
  const target = { url: `${SITE_URL}/x/`, before: sig('1'), after: sig('2') };
  const wait = (probes, srv, c) => waitUntilLive(probes, { fetchImpl: srv.fetchImpl, signatureOf: srv.signatureOf,
    now: c.now, sleep: c.sleep });
  const maxAttempts = Math.floor(LIVE_CHECK.budgetMs / LIVE_CHECK.intervalMs) + 1;
  {
    const c = clock();
    const r = await wait([target], serving([sig('1')]), c);
    t('**前の内容のままなら公開とみなさない**', r.state === 'timeout');
    t('待ちは決めた回数と時間で終わる', r.attempts === maxAttempts && c.now() <= LIVE_CHECK.budgetMs);
  }
  {
    const c = clock();
    const r = await wait([target], serving([sig('1'), sig('2')]), c);
    t('マージ後の内容が出たら公開（1回待って2回目）', r.state === 'live' && r.attempts === 2 && c.sleeps === 1);
  }
  {
    const c = clock();
    const r = await wait([target], serving([sig('9')]), c);
    t('更新したページが前の内容と違えば公開（後のデプロイに追い越されても止まらない）',
      r.state === 'live' && c.sleeps === 0);
  }
  t('404 は公開とみなさない', (await wait([target], serving([404]), clock())).state === 'timeout');
  t('リダイレクトは公開とみなさない', (await wait([target], serving([301]), clock())).state === 'timeout');
  t('取得の失敗は公開とみなさない（例外で止まらない）',
    (await wait([target], serving([new Error('ECONNRESET')]), clock())).state === 'timeout');
  {
    const fresh = { url: `${SITE_URL}/new/`, before: null, after: sig('3') };
    t('新しいページはマージ後の内容が出たら公開', (await wait([fresh], serving([sig('3')]), clock())).state === 'live');
    t('新しいページで別の内容は公開とみなさない', (await wait([fresh], serving([sig('4')]), clock())).state === 'timeout');
  }
  {
    const c = clock();
    const r = await wait([target], serving([403]), c);
    t('403 は待たずに打ち切る（待っても変わらない）', r.state === 'refused' && c.sleeps === 0);
    const challenge = { fetchImpl: async () => ({ status: 503, headers: { get: (h) => (h === 'cf-mitigated' ? 'challenge' : null) },
      text: async () => '' }), signatureOf: (b) => b };
    const c2 = clock();
    const r2 = await wait([target], challenge, c2);
    t('Cloudflare の確認画面（cf-mitigated）も待たずに打ち切る', r2.state === 'refused' && c2.sleeps === 0);
  }
  t('確かめる署名が無ければ待たない', (await wait([{ url: `${SITE_URL}/x/`, before: null, after: null }],
    serving([sig('1')]), clock())).state === 'skipped');
  t('確かめるのは更新したページから最大3件',
    pickProbes([{ url: 'n', before: null, after: sig('1') }, ...[1, 2, 3, 4].map((n) => ({ url: `m${n}`, before: sig('1'), after: sig('2') }))])
      .map((p) => p.url).join() === 'm1,m2,m3');

  // 送信の判断は待ちの結果で変えない。例外で落ちたら、その判定の名前で ✗ にする（crash で名前を消さない）。
  const sender = () => { const s = { calls: [] }; s.send = async (u) => { s.calls.push(u); return '送信済み（HTTP 200）'; }; return s; };
  const attempt = async (name, fn) => { try { await fn(); } catch (e) { t(`${name}（例外: ${shortError(e)}）`, false); } };
  await attempt('**公開を確認できなくても送る**', async () => {
    const s = sender();
    const c = clock();
    const gate = (probes) => deployGate(probes, { fetchImpl: serving([sig('1')]).fetchImpl, signatureOf: (b) => b,
      now: c.now, sleep: c.sleep });
    const r = await announce([target.url], { probes: [target], gate, send: s.send });
    t('**公開を確認できなくても送る**', s.calls.length === 1 && r.result.startsWith('送信済み'));
    t('確認できなかったことをジョブサマリに残す', r.lines.some((l) => l.includes('確認できず')));
  });
  await attempt('待ちの途中で落ちても送る', async () => {
    const s = sender();
    const gate = (probes) => deployGate(probes, { now: () => { throw new Error('clock broke'); } });
    const r = await announce([target.url], { probes: [target], gate, send: s.send });
    t('待ちの途中で落ちても送る', s.calls.length === 1 && r.lines.some((l) => l.includes('途中で失敗')));
  });
  {
    const s = sender();
    let gated = 0;
    const r = await announce([target.url], { dryRun: true, probes: [target], gate: async () => { gated++; return {}; }, send: s.send });
    t('dry-run は待たず、送らない', gated === 0 && s.calls.length === 0 && r.result.startsWith('dry-run'));
  }
  {
    const s = sender();
    let gated = 0;
    await announce([target.url], { probes: [target], contentError: 'x', gate: async () => { gated++; return {}; }, send: s.send });
    t('比較に失敗した回は待たずに送る', gated === 0 && s.calls.length === 1);
  }

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト ${total} 件中 ${failures.length} 件失敗`);
  return failures.length ? 1 : 0;
}

async function main() {
  const args = process.argv.slice(2);

  // **鍵にも網にも触る前に返す。**自己テストが本番の通知を撃たないため。
  if (args.includes('--selftest')) {
    process.exit(await runSelfTest());
  }

  if (args.includes('--generate-key')) {
    createKey();
    return;
  }

  const dryRun = args.includes('--dry-run');
  const key = resolveKey();
  let urls;
  let summaryLines = null;
  let probes = [];
  let contentError = null;

  if (args.includes('--all')) {
    const files = getAllHtmlFiles(ROOT_DIR);
    urls = files
      .filter(f => !/noindex/i.test(fs.readFileSync(f, 'utf8')))
      .map(f => filePathToUrl(f));
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    // Specific URL(s)
    urls = args.filter(a => !a.startsWith('--')).map(u => u.startsWith('http') ? u : SITE_URL + u);
  } else {
    // Default / --since N: 直近 N コミットの first-parent 差分（既定 1）
    const sinceIdx = args.indexOf('--since');
    const commits = sinceIdx >= 0 ? (parseInt(args[sinceIdx + 1]) || 1) : 1;
    const sel = getChangedSince(commits);
    urls = sel.urls;
    probes = sel.probes;
    contentError = sel.contentError;
    summaryLines = summaryOf(commits, sel, dryRun);
  }

  console.log(`IndexNow: Submitting ${urls.length} URLs...${dryRun ? ' (dry-run)' : ''}`);
  const sendAll = async (list) => {
    let result = '';
    // IndexNow accepts max 10,000 URLs per request
    const batchSize = 10000;
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      try {
        const status = await sendNotification(key, batch);
        result = `送信済み（HTTP ${status}）`;
      } catch (e) {
        result = `送信失敗（${e.message}）`;
        console.error(`Batch ${Math.floor(i/batchSize) + 1} failed`);
        process.exitCode = 1;
      }
    }
    return result;
  };
  if (!dryRun && urls.length && !contentError && probes.length) {
    console.log(`本番の公開を待つ（最大${LIVE_CHECK.budgetMs / 60_000}分。確認できなくても送る）`);
  }
  const { lines, result } = await announce(urls, { dryRun, probes, contentError, send: sendAll });
  if (summaryLines) {
    summaryLines.push(...lines, '', `結果: ${result}`);
    writeSummary(summaryLines);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
