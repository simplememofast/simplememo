#!/usr/bin/env node
/**
 * IndexNow Notification Script for simplememofast.com
 * Sends URL update notifications to Bing/Yandex/Naver/Seznam via IndexNow protocol.
 *
 * Usage:
 *   node scripts/indexnow-notify.js                    # Notify all recently modified pages
 *   node scripts/indexnow-notify.js /blog/new-post     # Notify specific URL
 *   node scripts/indexnow-notify.js --all              # Notify all pages
 *   node scripts/indexnow-notify.js --since 2          # Pages modified in last N days
 *
 * Setup:
 *   1. Generate key: node scripts/indexnow-notify.js --generate-key
 *   2. Deploy the key file to site root
 *   3. Run notify after deploys
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

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

function getOrCreateKey() {
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE, 'utf8').trim();
  }
  const key = generateKey();
  fs.writeFileSync(KEY_FILE, key);

  // Create the key verification file at site root
  const keyVerificationPath = path.join(ROOT_DIR, `${key}.txt`);
  fs.writeFileSync(keyVerificationPath, key);

  console.log(`✓ IndexNow key generated: ${key}`);
  console.log(`✓ Key file created: ${key}.txt (deploy this to site root)`);
  console.log(`✓ Key stored in: .indexnow-key`);
  return key;
}

function getAllHtmlFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.includes(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllHtmlFiles(fullPath));
      } else if (entry.name.endsWith('.html') && entry.name !== '404.html') {
        results.push(fullPath);
      }
    }
  } catch (e) { /* skip */ }
  return results;
}

function filePathToUrl(filePath) {
  let relative = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
  let url = '/' + relative;
  if (url.endsWith('/index.html')) url = url.replace('/index.html', '/');
  else if (url.endsWith('.html')) url = url.replace('.html', '');
  return SITE_URL + url;
}

function getRecentlyModified(days = 1) {
  const files = getAllHtmlFiles(ROOT_DIR);
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);

  return files
    .filter(f => {
      const stat = fs.statSync(f);
      return stat.mtime.getTime() > cutoff;
    })
    .filter(f => {
      const content = fs.readFileSync(f, 'utf8');
      return !/noindex/i.test(content);
    })
    .map(f => filePathToUrl(f));
}

function sendNotification(key, urls) {
  if (urls.length === 0) {
    console.log('No URLs to notify.');
    return Promise.resolve();
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
          resolve();
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

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--generate-key')) {
    getOrCreateKey();
    return;
  }

  const key = getOrCreateKey();
  let urls;

  if (args.includes('--all')) {
    const files = getAllHtmlFiles(ROOT_DIR);
    urls = files
      .filter(f => !/noindex/i.test(fs.readFileSync(f, 'utf8')))
      .map(f => filePathToUrl(f));
  } else if (args.includes('--since')) {
    const daysIdx = args.indexOf('--since');
    const days = parseInt(args[daysIdx + 1]) || 1;
    urls = getRecentlyModified(days);
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    // Specific URL(s)
    urls = args.map(u => u.startsWith('http') ? u : SITE_URL + u);
  } else {
    // Default: last 1 day
    urls = getRecentlyModified(1);
  }

  console.log(`IndexNow: Submitting ${urls.length} URLs...`);
  if (urls.length > 0) {
    // IndexNow accepts max 10,000 URLs per request
    const batchSize = 10000;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      try {
        await sendNotification(key, batch);
      } catch (e) {
        console.error(`Batch ${Math.floor(i/batchSize) + 1} failed`);
      }
    }
  }
}

main().catch(console.error);
