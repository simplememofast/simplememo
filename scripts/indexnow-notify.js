#!/usr/bin/env node
/**
 * IndexNow Notification Script for simplememofast.com
 * Sends URL update notifications to Bing/Yandex/Naver/Seznam via IndexNow protocol.
 *
 * Usage:
 *   node scripts/indexnow-notify.js                    # HEAD~1..HEAD で変更された .html を通知
 *   node scripts/indexnow-notify.js --since 3          # HEAD~3..HEAD（first-parent）で変更された .html を通知
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
 * Setup:
 *   1. Generate key: node scripts/indexnow-notify.js --generate-key
 *   2. Deploy the key file to site root
 *   3. Run notify after deploys
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { collectHtmlFiles, toUrlPath } = require('./lib/site-files');

const SITE_URL = 'https://simplememofast.com';
const ROOT_DIR = path.resolve(__dirname, '..');
const KEY_FILE = path.join(ROOT_DIR, '.indexnow-key');
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

const SKIP_DIRS = ['node_modules', 'scripts', 'docs', 'screenshots', '.git', 'admin', 'tiktok'];

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
function resolveKey() {
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE, 'utf8').trim();
  }
  const candidates = fs.readdirSync(ROOT_DIR)
    .filter((f) => /^[a-f0-9]{32}\.txt$/.test(f))
    .filter((f) => fs.readFileSync(path.join(ROOT_DIR, f), 'utf8').trim() === f.slice(0, -4));
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
 * 直近 commits 個の first-parent 差分から通知対象を組み立てる。
 * HEAD~N は first parent を辿るので、マージコミットでは首親差分になる。
 */
function getChangedSince(commits = 1) {
  let out;
  try {
    out = execFileSync('git', ['diff', '--name-only', `HEAD~${commits}..HEAD`], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
  } catch (e) {
    throw new Error(
      `git diff HEAD~${commits}..HEAD failed（shallow checkout で親コミットが無い可能性。`
      + `seo-check.yml の checkout は fetch-depth: 2 以上が必要）: ${e.message}`
    );
  }
  const changed = notifiablePaths(out);

  const noindexExcluded = [];
  const urls = [];
  for (const p of changed) {
    const content = fs.readFileSync(path.join(ROOT_DIR, p), 'utf8');
    if (/noindex/i.test(content)) {
      noindexExcluded.push(p);
      continue;
    }
    urls.push(filePathToUrl(path.join(ROOT_DIR, p)));
  }
  return { changed, noindexExcluded, urls };
}

function sendNotification(key, urls) {
  if (urls.length === 0) {
    console.log('No URLs to notify.');
    return Promise.resolve(null);
  }

  const payload = JSON.stringify({
    host: 'simplememofast.com',
    key: key,
    keyLocation: `${SITE_URL}/${key}.txt`,
    urlList: urls,
  });

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
 * Wired into seo-check.yml directly because check-selftests.mjs enumerates
 * `.mjs` only and cannot see this `.js` file — act-ci-selftest-ratchet-js-blind.
 *
 * This script is the one on the list that **acts on the outside world** rather
 * than gating a build: a wrong path here tells search engines that a deleted
 * page, a noindex page, or a fixture under scripts/ is fresh content. There is
 * no CI failure for that — the request succeeds and the damage is at Bing.
 */
function runSelfTest() {
  const failures = [];
  const t = (name, cond) => { if (!cond) failures.push(name); };
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

  failures.forEach((f) => console.error(`  ✗ ${f}`));
  console.log(`自己テスト 13 件中 ${failures.length} 件失敗`);
  return failures.length ? 1 : 0;
}

async function main() {
  const args = process.argv.slice(2);

  // **鍵にも網にも触る前に返す。**自己テストが本番の通知を撃たないため。
  if (args.includes('--selftest')) {
    process.exit(runSelfTest());
  }

  if (args.includes('--generate-key')) {
    createKey();
    return;
  }

  const dryRun = args.includes('--dry-run');
  const key = resolveKey();
  let urls;
  let summaryLines = null;

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
    const { changed, noindexExcluded, urls: changedUrls } = getChangedSince(commits);
    urls = changedUrls;
    summaryLines = [
      `### IndexNow 差分通知（HEAD~${commits}..HEAD, first-parent）`,
      '',
      `- 変更 .html: ${changed.length} 件（うち noindex 除外 ${noindexExcluded.length} 件）`,
      `- 通知URL: ${urls.length} 件${dryRun ? '（dry-run: 送信なし）' : ''}`,
      ...urls.map((u) => `  - ${u}`),
    ];
  }

  console.log(`IndexNow: Submitting ${urls.length} URLs...${dryRun ? ' (dry-run)' : ''}`);
  let sendResult = urls.length === 0 ? '通知対象なし・送信なし' : 'dry-run: 送信なし';
  if (urls.length > 0 && !dryRun) {
    // IndexNow accepts max 10,000 URLs per request
    const batchSize = 10000;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      try {
        const status = await sendNotification(key, batch);
        sendResult = `送信済み（HTTP ${status}）`;
      } catch (e) {
        sendResult = `送信失敗（${e.message}）`;
        console.error(`Batch ${Math.floor(i/batchSize) + 1} failed`);
        process.exitCode = 1;
      }
    }
  }
  if (summaryLines) {
    summaryLines.push('', `結果: ${sendResult}`);
    writeSummary(summaryLines);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
