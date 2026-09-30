#!/usr/bin/env node
/**
 * 開発記録の外部ブログ配信（dev.to / はてなブログ）— 門・文脈・検証・投稿・公開確認。
 *
 *   node scripts/devlog-syndication.mjs gate     --platform devto|hatena [--force] [--dry-run] [--github-output FILE]
 *   node scripts/devlog-syndication.mjs context  --platform P --out FILE
 *   node scripts/devlog-syndication.mjs validate --platform P --article FILE --context FILE [--report FILE] [--offline]
 *   node scripts/devlog-syndication.mjs publish  --platform P --article FILE --context FILE --out FILE [--dry-run]
 *   node scripts/devlog-syndication.mjs verify   --platform P --published FILE [--summary FILE]
 *   node scripts/devlog-syndication.mjs watch    [--json FILE] [--warn-hours N] [--alert-hours N] [--since ISO]
 *   node scripts/devlog-syndication.mjs --selftest
 *
 * 【なぜ作るか（2026-09-24）】
 * dev.to（simple_memo）とはてなブログ（simplememofast）は、自社サイトへのリンクが
 * **dofollow のまま載る**数少ない投稿先だった（公開HTMLで実測。docs/seo/directory-registration-2026-09.md §5.27）。
 * ところが両方への投稿は Mac 上のローカル定期タスクに載っていて、dev.to は 9/18 から止まり、
 * はてなも間隔が崩れていた。ローカルの設定とログはクラウドのセッションから読めない保護領域にあり、
 * **止まった理由を外から確かめる手段が無かった。**
 *
 * そこで投稿を GitHub Actions に移す。ここに置くのは、モデルに任せない部分すべて:
 *
 *   gate     … 緊急停止と、**公開面の最新投稿**から見た間隔。状態ファイルを持たない
 *              （旧ローカルタスクが投稿しても、公開面を見るので二重に出ない）
 *   context  … 記事ネタ台帳・一次ファイル・既存記事・リンクしてよいURLを1つのJSONに固める
 *   validate … 数字の出典・禁止表現・名乗り・リンク・重複を機械で落とす
 *   publish  … 公式API（dev.to Forem API / はてなブログ AtomPub）。**APIキーはこのステップだけが持つ**
 *   verify   … 公開ページを取りに行き、自社リンクの rel と meta robots を実測する
 *
 * 【モデルに鍵を渡さない】
 * 執筆（claude-code-action）のステップには投稿用の鍵を環境変数で渡さない。
 * 鍵を持つのは決定的なこのスクリプトだけで、モデルの出力は JSON ファイルとしてしか受け取らない。
 *
 * 【正直さの規則を機械に持たせる】
 * DEV は 2026-08-26 に AI 開示を導入し、「未開示のAI記事」「合成した内容を本人の体験として出すこと」を
 * アカウント停止の対象と明記した。過去の記事には、リポジトリに出典の見当たらない数値
 * （起動187ms・開封率83% など）も見つかっている。だから:
 *   - dev.to は ai_disclosure_level=fully_autonomous を API で必ず付ける
 *   - はてなは本文末尾に固定の開示文を付ける（モデルに書かせない＝消されない）
 *   - 本文の数量は、記事が宣言した出典ファイルか一次ファイルに同じ数字があるときだけ通す
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkText } from './check-pr-facts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STOP_PATH = path.join(ROOT, 'data/emergency-stop.json');
const SEEDS_PATH = path.join(ROOT, 'docs/story-seeds.md');
const CONSTANTS_PATH = path.join(ROOT, 'data/site-constants.json');
export const AGENT = 'syndication';
export const MARKER = 'devlog-syndication';
const UA = 'simplememo-devlog-syndication/1.0 (+https://simplememofast.com/)';

export const PLATFORMS = {
  devto: {
    label: 'dev.to',
    lang: 'en',
    username: 'simple_memo',
    listUrl: 'https://dev.to/api/articles?username=simple_memo&per_page=60',
    articleApi: (id) => `https://dev.to/api/articles/${id}`,
    secretEnv: 'DEVTO_API_KEY',
    sitemap: 'sitemap-en.xml',
    minIntervalHours: 66,
    words: [700, 1900],
    siteLinks: [1, 2],
    otherLinksMax: 3,
    tagsMax: 4,
    series: ['AI-era Workflow', 'Solo Dev Diary', 'Capture Notes', 'iOS Internals'],
    footer: '\n\n---\n\n*This article was written and published autonomously by an AI agent working from the Simple Memo project\'s own public records. Figures come from those records; nothing here is a personal anecdote.*\n',
  },
  hatena: {
    label: 'はてなブログ',
    lang: 'ja',
    hatenaId: 'simplememofast',
    blogId: 'simplememofast.hatenablog.com',
    feedUrl: 'https://simplememofast.hatenablog.com/feed',
    atomUrl: 'https://blog.hatena.ne.jp/simplememofast/simplememofast.hatenablog.com/atom/entry',
    secretEnv: 'HATENA_API_KEY',
    sitemap: 'sitemap-ja.xml',
    minIntervalHours: 66,
    chars: [2500, 7500],
    siteLinks: [1, 3],
    otherLinksMax: 3,
    tagsMax: 5,
    series: [],
    footer: '\n\n---\n\n*この記事は、シンプルメモ開発の公開記録（リポジトリと運用ログ）をもとに、AIエージェントが自動で執筆・公開しています。数値はそれらの記録にあるものだけを使っています。*\n',
  },
};

// ─────────────────────────────────────────────────────────────
// 共通
// ─────────────────────────────────────────────────────────────

function argValue(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} に値が要る`);
  return v;
}

function platformOf(argv) {
  const p = argValue(argv, '--platform');
  if (!PLATFORMS[p]) throw new Error(`--platform は ${Object.keys(PLATFORMS).join(' / ')} のいずれか（受け取った値: ${p}）`);
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 取得は必ず理由つきで失敗させる。**読めなかったを「無かった」にしない。**
 * idempotent=false（記事の作成）は、429 のときだけ待って送り直す。5xx と通信の失敗は**作成済みかもしれない**ので
 * 送り直さずに投げる（送り直すと二重投稿になりうる）。落ちた枠は次の枠が公開面を見て拾い直す。
 */
export async function fetchWithRetry(url, { method = 'GET', headers = {}, body, retries = 2, timeoutMs = 30000,
  okStatuses = null, redirect = 'follow', idempotent = true, wait = sleep } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: { 'user-agent': UA, ...headers }, body, signal: ctrl.signal, redirect });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${method} ${url} → HTTP ${res.status}`);
        if (!idempotent && res.status !== 429) {
          throw Object.assign(new Error(`${method} ${url} → HTTP ${res.status}（作成済みかもしれないので送り直さない）`), { status: res.status });
        }
        const seconds = Number(res.headers.get('retry-after')) || (5 * (attempt + 1));
        if (attempt < retries) { await wait(Math.min(seconds, 60) * 1000); continue; }
        throw lastErr;
      }
      if (okStatuses && !okStatuses.includes(res.status)) {
        const text = await res.text().catch(() => '');
        throw Object.assign(new Error(`${method} ${url} → HTTP ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
      }
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (e.status) throw e; // 4xx は再試行しても変わらない
      if (!idempotent) throw e; // 通信の失敗は、作成されたかどうか分からない
      if (attempt < retries) { await wait(3000 * (attempt + 1)); continue; }
    }
  }
  throw lastErr;
}

async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, { ...opts, okStatuses: opts.okStatuses || [200] });
  return res.json();
}

async function fetchText(url, opts = {}) {
  const res = await fetchWithRetry(url, { ...opts, okStatuses: opts.okStatuses || [200] });
  return res.text();
}

function writeOutput(file, pairs) {
  if (!file) return;
  fs.appendFileSync(file, Object.entries(pairs).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}`).join('\n') + '\n');
}

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

// ─────────────────────────────────────────────────────────────
// 門 — 緊急停止と、公開面から見た間隔
// ─────────────────────────────────────────────────────────────

/** 緊急停止の台帳を読む。**読めないのは「止まっていない」ではない**ので投げる。 */
export function readStop(file = STOP_PATH) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const agent = doc.agents?.[AGENT];
  if (!agent) throw new Error(`data/emergency-stop.json に経路 "${AGENT}" が無い — 止めたい日に止まらない`);
  if (doc.stopped) return { stopped: true, reason: `全体停止: ${doc.reason}` };
  if (agent.stopped) return { stopped: true, reason: `経路停止（${AGENT}）: ${agent.reason}` };
  return { stopped: false, reason: null };
}

/**
 * 投稿してよいかを決める。**公開面の事実だけ**で決める（状態ファイルを持たない）。
 *   - 停止が立っていれば、force でも走らない
 *   - 公開面が読めなければ走らない（読めないのに「前回から十分空いた」と推測しない）
 *   - 直近24時間に1本でもあれば、force でも走らない（連投の上限）
 *   - 最新投稿から minIntervalHours 未満なら走らない（force で飛ばせるのはここだけ）
 */
export function decideGate({ stop, latestIso, postsLast24h, now, minIntervalHours, force = false, dryRun = false, readError = null }) {
  if (stop?.stopped) return { due: false, code: 'stopped', reason: stop.reason };
  if (readError) return { due: false, code: 'unreadable', reason: `公開面の最新投稿を読めない: ${readError}` };
  // 試験実行（dry_run）は投稿しないので、間隔と「24時間に1本」では止めない（いつでも経路全体を試せるように）。
  // 停止と「公開面を読めない」は本番と同じく止める。投稿しないことは publish --dry-run 側で保証する。
  if (dryRun) return { due: true, code: 'dry_run', reason: '試験実行（投稿しない）: 間隔と24時間の上限は見ない' };
  if (postsLast24h > 0) {
    return { due: false, code: 'daily_cap', reason: `直近24時間に ${postsLast24h} 本ある（1日1本まで。force でも越えない）` };
  }
  if (!latestIso) {
    return { due: true, code: 'first_post', reason: '公開面に既存投稿が無い' };
  }
  const hours = (now.getTime() - new Date(latestIso).getTime()) / 3600000;
  if (!Number.isFinite(hours)) return { due: false, code: 'unreadable', reason: `日時を解釈できない: ${latestIso}` };
  if (hours < minIntervalHours && !force) {
    return { due: false, code: 'too_soon', hours: Math.round(hours * 10) / 10,
      reason: `最新投稿から ${hours.toFixed(1)} 時間（${minIntervalHours} 時間未満）` };
  }
  return { due: true, code: force && hours < minIntervalHours ? 'forced' : 'interval_elapsed', hours: Math.round(hours * 10) / 10,
    reason: `最新投稿から ${hours.toFixed(1)} 時間` };
}

/**
 * 公開面は**キャッシュを通さずに**読み、古い応答は「読めない」にする。**古い一覧で「空いている」と読むと二重に出る。**
 *
 * 2026-09-29 の実測（初回の本番投稿 11:26:13Z の直後）:
 * - dev.to の公開一覧（Fastly）は Accept-Encoding ごとに別のキャッシュを持つ（Vary: Accept-Encoding, Origin, X-Loggedin）。
 *   Node の fetch が受ける gzip 側は **age 92,695 秒（25.7時間）**で、投稿の10分後も新しい記事が無かった。
 *   Accept-Encoding の無い curl は MISS で新しい内容を受けた。**どちらも一度取られると長く残る**（Forem の既定は1日）。
 * - クエリを足しても dev.to ではキャッシュのキーに入らず、古いまま。Cache-Control: no-cache も効かない。
 *   Vary に Origin があるので、**Origin を毎回変えると MISS になる**（age 0 を2回実測）。
 * - はてなの公開フィードは age 6,206 秒の応答を返し、クエリを足すと age 0 になった。
 * 門・文脈・見張りの全部がここを通る。
 */
export const FRESH_MAX_AGE_SECONDS = 600;

export function assertFresh(res, label, maxAge = FRESH_MAX_AGE_SECONDS) {
  const raw = res.headers.get('age');
  const age = raw === null ? null : Number(raw);
  if (age !== null && Number.isFinite(age) && age > maxAge) {
    throw new Error(`${label}の応答が古い（キャッシュの age ${age} 秒 > ${maxAge} 秒）— 古い一覧で間隔を判断しない`);
  }
  return age;
}

const freshOrigin = () => `https://fresh-${crypto.randomBytes(6).toString('hex')}.invalid`;
const freshQuery = () => `fresh=${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

/** dev.to の公開一覧（キー不要）。 */
async function devtoPublicPosts() {
  const res = await fetchWithRetry(PLATFORMS.devto.listUrl, {
    headers: { accept: 'application/vnd.forem.api-v1+json', origin: freshOrigin() }, okStatuses: [200] });
  assertFresh(res, 'dev.to の公開一覧');
  const list = await res.json();
  if (!Array.isArray(list)) throw new Error('dev.to の一覧が配列でない');
  return list.map((a) => ({
    id: a.id, title: a.title, url: a.url, published_at: a.published_timestamp || a.published_at,
    tags: a.tag_list || [], description: a.description || '',
  }));
}

/**
 * entry の公開URL（alternate の link）。**属性の順番と省略に依らない。**
 * rel を省いた link は Atom の既定で alternate（RFC 4287 §4.2.7.2）。type を省いたものは HTML とみなす。
 * 2026-09-26: はてなの公開フィードは `<link href="…/entry/…"/>`（rel も type も無い）だった。
 * `rel="alternate" type="text/html"` の決め打ちでは URL が null になり、見張りが公開ページを取りに行けなかった。
 * AtomPub の応答は `<link rel="alternate" type="text/html" href="…"/>` で、edit・enclosure の link も並ぶ。
 */
export function entryAlternateUrl(xml) {
  for (const m of String(xml ?? '').matchAll(/<link\b([^>]*?)\/?>/g)) {
    const attrs = m[1];
    const rel = (/\brel=["']([^"']*)["']/.exec(attrs) || [])[1] || 'alternate';
    const type = (/\btype=["']([^"']*)["']/.exec(attrs) || [])[1] || 'text/html';
    const href = (/\bhref=["']([^"']*)["']/.exec(attrs) || [])[1];
    if (href && rel === 'alternate' && /html/i.test(type)) return decodeEntities(href);
  }
  return null;
}

/** はてなブログの公開フィード（キー不要・最新30件）。 */
export function parseAtomFeed(xml) {
  const entries = [];
  for (const m of String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = decodeEntities((/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1] || '').trim();
    const url = entryAlternateUrl(e);
    const published = (/<published>([^<]+)<\/published>/.exec(e) || /<updated>([^<]+)<\/updated>/.exec(e) || [])[1] || null;
    const content = decodeEntities((/<content[^>]*>([\s\S]*?)<\/content>/.exec(e) || [])[1] || '');
    const summary = decodeEntities((/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(e) || [])[1] || '');
    // AtomPub の一覧だけが持つ欄。公開フィードには無い（= null で「読めない」）。
    const draftTag = /<app:draft>\s*(yes|no)\s*<\/app:draft>/.exec(e);
    const draft = draftTag ? draftTag[1] === 'yes' : null;
    entries.push({ title, url, published_at: published, content, summary, draft });
  }
  return entries;
}

async function hatenaPublicPosts() {
  const res = await fetchWithRetry(`${PLATFORMS.hatena.feedUrl}?${freshQuery()}`, { okStatuses: [200] });
  assertFresh(res, 'はてなの公開フィード');
  const entries = parseAtomFeed(await res.text());
  if (!entries.length) throw new Error('はてなのフィードに entry が無い（読み方が壊れている可能性）');
  return entries;
}

export async function publicPosts(platform) {
  return platform === 'devto' ? devtoPublicPosts() : hatenaPublicPosts();
}

async function cmdGate(argv) {
  const platform = platformOf(argv);
  const cfg = PLATFORMS[platform];
  const now = new Date(argValue(argv, '--now', new Date().toISOString()));
  const stop = readStop();
  let posts = [], readError = null;
  if (!stop.stopped) {
    try { posts = await publicPosts(platform); } catch (e) { readError = e.message; }
  }
  const times = posts.map((p) => new Date(p.published_at).getTime()).filter(Number.isFinite);
  const latest = times.length ? new Date(Math.max(...times)).toISOString() : null;
  const postsLast24h = times.filter((t) => now.getTime() - t < 24 * 3600000).length;
  const d = decideGate({ stop, latestIso: latest, postsLast24h, now, minIntervalHours: cfg.minIntervalHours,
    force: argv.includes('--force'), dryRun: argv.includes('--dry-run'), readError });
  console.log(`[${cfg.label}] ${d.due ? '投稿する' : '投稿しない'} — ${d.code}: ${d.reason}（最新: ${latest ?? 'なし'}）`);
  writeOutput(argValue(argv, '--github-output'), { due: d.due, code: d.code, latest: latest ?? '', reason: d.reason });
  // 読めない・停止は「異常」なので目立たせる。間隔待ちは正常。
  if (d.code === 'unreadable') process.exitCode = 1;
  if (d.code === 'stopped') console.log(`::warning title=Devlog syndication stopped::${d.reason}`);
}

// ─────────────────────────────────────────────────────────────
// 記事ネタ台帳
// ─────────────────────────────────────────────────────────────

export function parseSeeds(md) {
  const seeds = [];
  const parts = String(md).split(/^## (?=S-\d{8}-)/m).slice(1);
  for (const part of parts) {
    const id = part.split('\n')[0].trim();
    const field = (name) => {
      const m = new RegExp(`^- \\*\\*${name}\\*\\*[:：]\\s*(.*)$`, 'm').exec(part);
      return m ? m[1].trim() : null;
    };
    const numbers = [];
    const numBlock = /^- \*\*引用できる数字\*\*\s*\n((?:\s{2,}- .*\n?)+)/m.exec(part);
    if (numBlock) for (const line of numBlock[1].split('\n')) { const t = line.replace(/^\s*- /, '').trim(); if (t) numbers.push(t); }
    const media = (field('媒体') || '').split('/').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const en = field('英語圏向け');
    seeds.push({
      id, media, category: field('分類'), claim: field('一行の主張'), numbers,
      drafts: { note: field('note向け'), x: field('X向け'), en: en && !/^[（(]この種は/.test(en) ? en : null },
      avoid: field('使わない表現'),
      raw: part.trim(),
    });
  }
  return seeds;
}

/** その媒体で使える種か。dev.to は英語の下書きがある種、はてなは日本語長文（note向け）がある種。 */
export function seedFits(seed, platform) {
  return platform === 'devto' ? Boolean(seed.drafts.en) : Boolean(seed.drafts.note);
}

// ─────────────────────────────────────────────────────────────
// 文脈
// ─────────────────────────────────────────────────────────────

/** sitemap の URL を手元のファイルへ引き当てる。**引き当てられない URL はリンク候補にしない。** */
export function urlToFile(url) {
  const u = new URL(url);
  if (u.hostname !== 'simplememofast.com') return null;
  let p = decodeURIComponent(u.pathname).replace(/^\//, '');
  const candidates = p === '' ? ['index.html']
    : p.endsWith('/') ? [`${p}index.html`] : [`${p}.html`, `${p}/index.html`, p];
  for (const c of candidates) {
    const f = path.join(ROOT, c);
    if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return c;
  }
  return null;
}

export function pageMeta(html) {
  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '').replace(/\s+/g, ' ').trim();
  const desc = decodeEntities((/<meta\s+name="description"\s+content="([^"]*)"/i.exec(html) || [])[1] || '').trim();
  const robots = (/<meta\s+name="robots"\s+content="([^"]*)"/i.exec(html) || [])[1] || '';
  return { title, description: desc, robots };
}

export function allowedLinks(platform) {
  const xml = fs.readFileSync(path.join(ROOT, PLATFORMS[platform].sitemap), 'utf8');
  const out = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = m[1].trim();
    const file = urlToFile(url);
    if (!file) continue;
    const meta = pageMeta(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    if (/noindex/i.test(meta.robots)) continue; // リンク先が検索に出ないページは候補にしない
    out.push({ url, file, title: meta.title, description: meta.description.slice(0, 200) });
  }
  return out;
}

/**
 * はてなの本文末尾に付ける「見える記録」の見出し語。
 * **はてなは本文の HTML コメントを公開面（ページ・フィード）から消す**（2026-09-29 の初回の投稿で実測）。
 * コメントの印だけだと、はてなの「使用済みの題材」が常に空になり、同じ種を使い回す。
 * そこで開示文の後ろに題材の記録（種の ID か page:<ファイル>）を見える形で付ける。読者には出典の手がかりにもなる。
 */
export const VISIBLE_BASIS_LABEL = '題材の記録';
const VISIBLE_BASIS_RE = new RegExp(`${VISIBLE_BASIS_LABEL}[:：]\\s*((?:S-\\d{8}-[A-Za-z0-9_-]+)|(?:page:[A-Za-z0-9._/-]+))`, 'g');

/**
 * 本文に埋めた印を読む。HTML コメントの印（`<!-- devlog-syndication: basis=...; ... -->`）と、
 * はてなの見える記録（`題材の記録: S-…`）の両方。同じ題材が2回出ることがある（呼び出し側は集合で扱う）。
 */
export function readMarkers(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/<!--\s*devlog-syndication:([^>]*?)-->/g)) {
    const fields = Object.fromEntries(m[1].split(';').map((kv) => kv.trim().split('=').map((s) => s.trim())).filter((kv) => kv.length === 2 && kv[0]));
    out.push(fields);
  }
  for (const m of String(text ?? '').matchAll(VISIBLE_BASIS_RE)) out.push({ basis: m[1], visible: 'yes' });
  return out;
}

/**
 * 見える記録を付ける前に出た、この経路のはてなの記事の題材（HTML コメントの印が公開面で消えたもの）。
 * 題材は run 36566063885 の要約と成果物の published.json から引いた。**この表は増やさない**（以後の記事は見える記録を持つ）。
 */
export const LEGACY_HATENA_BASES = {
  'https://simplememofast.hatenablog.com/entry/2026/09/29/211832': 'S-20260907-fixed-but-unconfirmed',
};

/** はてなの公開フィードの entry から、使った題材を読む（印・見える記録・見える記録より前の記事の表）。 */
export function hatenaBases(entry) {
  const out = new Set(readMarkers(entry?.content).map((m) => m.basis).filter(Boolean));
  const legacy = LEGACY_HATENA_BASES[entry?.url];
  if (legacy) out.add(legacy);
  return [...out];
}

async function existingPosts(platform) {
  const posts = await publicPosts(platform);
  posts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const bases = new Set();
  const detailed = [];
  if (platform === 'devto') {
    // 本文は新しい15本だけ取りに行く（印と書き出しを読むため）。一覧だけでは本文が無い。
    for (const p of posts.slice(0, 15)) {
      try {
        const a = await fetchJson(PLATFORMS.devto.articleApi(p.id), { headers: { accept: 'application/vnd.forem.api-v1+json' } });
        for (const mk of readMarkers(a.body_markdown)) if (mk.basis) bases.add(mk.basis);
        detailed.push({ ...p, opening: String(a.body_markdown || '').replace(/^---[\s\S]*?---\s*/, '').slice(0, 400) });
      } catch (e) {
        detailed.push({ ...p, opening: null, read_error: e.message });
      }
    }
  } else {
    for (const p of posts) {
      for (const b of hatenaBases(p)) bases.add(b);
      detailed.push({ title: p.title, url: p.url, published_at: p.published_at,
        opening: String(p.summary || p.content.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 300) });
    }
  }
  const byUrl = new Map(detailed.map((d) => [d.url, d]));
  const all = posts.map((p) => byUrl.get(p.url) || { title: p.title, url: p.url, published_at: p.published_at, tags: p.tags });
  return { posts: all, usedBases: [...bases] };
}

export function productFacts(constants) {
  // **版と評価は外に書かない**（台帳 §「判定ルール」）。ここに入れないことで、書く材料から外す。
  return {
    app_name_en: constants.appNameEn,
    app_name_ja: constants.appNameJa,
    publisher: constants.publisher,
    free_sends_per_day: constants.freeSendsPerDay,
    price_monthly_jpy: constants.priceMonthlyJpy, price_yearly_jpy: constants.priceYearlyJpy,
    price_monthly_usd: constants.priceMonthlyUsd, price_yearly_usd: constants.priceYearlyUsd,
    launch: 'about 0.4 seconds (warm launch, tap to keyboard-ready, median of 5 runs) — see llms.txt and data/benchmark.json',
    encryption: 'NOT end-to-end encrypted. The on-device Outbox and send history are encrypted with AES-GCM-256; memo bodies are delivered over standard SMTP',
    captio: 'Inspired by Captio; not an official successor. Captio\'s cloud service ended on 2024-10-01 per captio.co',
    free_trial: 'There is no free trial. Free is 3 sends per day, permanently (check data/site-constants.json)',
    do_not_write: ['version numbers', 'App Store ratings', 'personal real names'],
  };
}

async function cmdContext(argv) {
  const platform = platformOf(argv);
  const cfg = PLATFORMS[platform];
  const out = argValue(argv, '--out');
  if (!out) throw new Error('--out が要る');
  const seeds = parseSeeds(fs.readFileSync(SEEDS_PATH, 'utf8'));
  if (!seeds.length) throw new Error('docs/story-seeds.md から種を1件も読めない — 読み方が壊れている');
  const { posts, usedBases } = await existingPosts(platform);
  const constants = JSON.parse(fs.readFileSync(CONSTANTS_PATH, 'utf8'));
  const links = allowedLinks(platform);
  const ctx = {
    platform, platform_label: cfg.label, language: cfg.lang,
    generated_at: new Date().toISOString(),
    runbook: 'docs/syndication/RUNBOOK.md',
    limits: {
      words: cfg.words ?? null, chars: cfg.chars ?? null, site_links: cfg.siteLinks,
      other_links_max: cfg.otherLinksMax, tags_max: cfg.tagsMax,
    },
    series_allowed: cfg.series,
    used_bases: usedBases,
    seeds_available: seeds.filter((s) => seedFits(s, platform) && !usedBases.includes(s.id))
      .map(({ raw, ...s }) => s),
    seeds_used_or_unfit: seeds.filter((s) => !seedFits(s, platform) || usedBases.includes(s.id)).map((s) => s.id),
    existing_posts: posts.map((p) => ({ title: p.title, published_at: p.published_at, url: p.url, opening: p.opening ?? undefined })),
    product_facts: productFacts(constants),
    fact_files: ['llms.txt', 'data/site-constants.json', 'data/benchmark.json', 'docs/story-seeds.md'],
    allowed_site_links: links.map(({ url, file, title }) => ({ url, file, title })),
  };
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ctx, null, 2));
  console.log(`[${cfg.label}] 文脈: 既存 ${posts.length} 本 / 使用済みの題材 ${usedBases.length} / 使える種 ${ctx.seeds_available.length} / リンク候補 ${links.length} → ${out}`);
}

// ─────────────────────────────────────────────────────────────
// 検証
// ─────────────────────────────────────────────────────────────

/** 地の文だけを残す。コード・URL・日付は数量の主張ではないので外す。 */
export function prose(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\]\((https?:\/\/[^)\s]+)\)/g, '] ')
    .replace(/https?:\/\/\S+/g, ' ')
    // 日付（2026-09-03 / 2026年9月3日 / 9月3日 / 9/3 / September 3, 2026 / Sep 3）
    .replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, ' ')
    .replace(/\d{4}年\s*\d{1,2}月(\s*\d{1,2}日)?/g, ' ')
    .replace(/\d{1,2}月\s*\d{1,2}日/g, ' ')
    .replace(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ');
}

/** 数字を正規化する（1,890 → 1890 / ５ → 5）。 */
export function normNum(s) {
  return String(s).replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/,/g, '')
    .replace(/^0+(?=\d)/, '');
}

/** 識別子の一部（iOS 26 / AES-GCM-256 / Swift 6 / HTTP 202 / v2 / S-2026…）を数量と数えない。 */
const IDENT_BEFORE = /(?:iOS|iPadOS|macOS|watchOS|visionOS|tvOS|Swift|Xcode|HTTP|UTF|SHA|AES|GCM|MD|ES|API|Python|Node|Day|Part|Chapter|Series|Season|Vol|No|Build|iPhone|Pixel|Galaxy|Android|Windows|Obsidian|Rule|Step|Phase|Version|version|#|§|\bv)\s*-?$/;

/** 本文から「数量の主張」になり得る数字を抜く。 */
export function quantities(text) {
  const t = prose(text);
  const out = [];
  const re = /(?<![A-Za-z0-9_.\-\/])([0-9０-９]+(?:[,，][0-9]{3})*(?:[.．][0-9]+)?)(?![A-Za-z0-9_\-])/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - 14), m.index);
    if (IDENT_BEFORE.test(before)) continue;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 6);
    const value = normNum(m[1]);
    out.push({ raw: m[0], value, context: (before + m[0] + after).replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/** 数量として許す値。出典テキストに現れる数字＋小さな整数＋年。 */
export function allowedNumberSet(texts) {
  const set = new Set();
  for (const t of texts) {
    for (const m of String(t).matchAll(/[0-9０-９]+(?:[,，][0-9]{3})*(?:[.．][0-9]+)?/g)) {
      const v = normNum(m[0]);
      set.add(v);
      if (v.includes('.')) set.add(String(Number(v)));          // 0.40 → 0.4
      if (/^\d+\.\d+$/.test(v) && Number(v) < 10) set.add(String(Math.round(Number(v) * 1000))); // 0.4 秒 ↔ 400 ms
    }
  }
  return set;
}

/**
 * 数字を字で書いた数量（「eighty-three percent」「八十三件」）。**言い換えれば通る穴を塞ぐ。**
 * 12以下（手順の数・章立て）は数字の検査と同じく対象外にする。出典テキストに同じ綴りがあれば通す。
 */
const WORD_NUM_EN = /\b(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?\b/gi;
const WORD_NUM_JA = /[一二三四五六七八九]?[十百千万億][一二三四五六七八九十百千万億]*(?=\s*(?:件|人|通|秒|分|時間|日|週|回|本|個|倍|割|パーセント|%|％|円|ドル|行|語|字))/g;
export function wordQuantities(text, sourceText) {
  const src = String(sourceText).toLowerCase();
  const t = prose(text);
  const out = [];
  for (const re of [WORD_NUM_EN, WORD_NUM_JA]) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      if (!src.includes(m[0].toLowerCase())) out.push(m[0]);
    }
  }
  return [...new Set(out)];
}

export function numberAllowed(value, set) {
  const n = Number(value);
  if (Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 12) return true; // 手順の数・章立て
  if (Number.isInteger(n) && n >= 1990 && n <= 2035) return true;                  // 年
  return set.has(value) || set.has(String(n));
}

/** 否定の文脈（「〜ではない」「not …」）なら禁止語でも通す語。 */
const NEGATED_OK = [
  { id: 'e2ee', re: /E2EE|end-to-end encrypt(?:ed|ion)|エンドツーエンド暗号化|エンドツーエンドで暗号/gi },
  { id: 'successor', re: /successor|後継/gi },
];
const NEGATION_NEAR = /not\b|n't\b|never\b|no longer|isn['’]t|aren['’]t|ではな|じゃな|ません|ない|非公式|unofficial|rather than/i;

const BANNED = [
  { id: 'old-name', re: /Captio式シンプルメモ|Captio-style Simple Memo|Simple Memo - Captio-style/g, why: '旧アプリ名を製品名として使っている' },
  { id: 'free-trial', re: /free trial|無料トライアル|トライアル付き/gi, why: '無料トライアルは存在しない' },
  { id: 'launch-0.3', re: /0\.3\s*(?:秒|s\b|sec|seconds)|300\s*ms/gi, why: '起動は約0.4秒（0.3秒ではない）' },
  { id: 'known-unsourced', re: /187\s*(?:ms|ミリ秒)|開封率\s*83|83\s*%\s*open|280\s*ms/gi, why: '過去記事にあった出典の無い数値' },
  { id: 'hype-ja', re: /爆速|神アプリ|革命的?|圧倒的|最強|世界初|完全自動化|完全無人|無人経営|人間不要|徹底解説|完全ガイド|[0-9０-９]+選|再帰的自己改善/g, why: '誇大・定型表現' },
  { id: 'hype-en', re: /game[- ]changer|revolutionary|world['’]s first|fully automated business|blazing(?:ly)? fast|\bbest\b[^.\n]{0,20}\bapps?\b/gi, why: '誇大表現' },
  { id: 'cta', re: /download (?:it|the app|now)|try it (?:free|now|today)|get it on the app store|sign up (?:now|today)|ダウンロードはこちら|今すぐ(?:ダウンロード|試|使)|ぜひ(?:使|試|ダウンロード)/gi, why: '売り込みの呼びかけ' },
  { id: 'human-claim-en', re: /\bI(?:'m| am) (?:a|the) (?:solo |indie |independent )?(?:iOS )?developer\b|\bas a solo developer\b/gi, why: '人間の開発者本人が書いたと読める名乗り（AIが書いた記事で本人を名乗らない）' },
  { id: 'human-claim-ja', re: /個人開発者の(?:私|僕)|(?:私|僕)は(?:個人)?開発者/g, why: '人間の開発者本人が書いたと読める名乗り' },
  { id: 'rsi', re: /\bRSI\b|recursive self-improvement/g, why: '名乗らない語' },
];

/**
 * 開発者個人の実名・個人アカウント名を検出する。
 * **名前そのものを公開リポジトリに書かない**（CLAUDE.md「対外的な名乗り」）ために、照合は SHA-256 で行う。
 * 英字は単語ごと、漢字は連続する漢字の2字窓ごとに照合する。追加するときも平文をコミットしない。
 */
const IDENTITY_HASHES = new Set([
  '65fc7b149d71ebe0e4e3c6b129e80a3e89ef96a66e8facde749a02ffa20ba0d5',
  '50ac65592e9838ec07948083ae3066ed28b4c4b628921ccd618dca0dd0ed2d47',
  'e4449d8188a43557bf233fd3acea2fcb84846f9c318e7f93d7f2efefa82f728f',
  '590d190f5b5fe92a23d513a3f57ae3bd8876a439f7f33ff892955fef30b82233',
  'f394653a63520ab55dbb371b12d7c06e9eab1e9b418d36ba0f88e1caaa8d01c0',
]);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * 照合用の名前一覧を**リポジトリの外**からも受ける（CLAUDE.md「新しい種類の対外送信は、錠前ができるまで始めない」
 * の錠前の考え方）。GitHub Secrets の IDENTITY_DENYLIST に、カンマ区切りで名前・アカウント名を置けば、
 * ここでハッシュにして上の表に足す。値はログに出さない。無ければ上の表だけで照合する。
 */
export function identityHashes(env = process.env) {
  const set = new Set(IDENTITY_HASHES);
  for (const raw of String(env.IDENTITY_DENYLIST || '').split(/[,\n]/)) {
    const w = raw.trim().toLowerCase();
    if (!w) continue;
    set.add(sha256(w));
    // 漢字の名前は2字窓で照合するので、2字ずつにも分けて足す
    if (/^[\u3400-\u9fff]{3,}$/.test(w)) for (let i = 0; i < w.length - 1; i++) set.add(sha256(w.slice(i, i + 2)));
  }
  return set;
}

export function identityHits(text, hashes = identityHashes()) {
  const hits = [];
  const t = String(text);
  for (const w of t.toLowerCase().match(/[a-z]+/g) || []) if (hashes.has(sha256(w))) hits.push(w.slice(0, 1) + '…');
  for (const run of t.match(/[㐀-鿿]{2,}/g) || []) {
    for (let i = 0; i < run.length - 1; i++) if (hashes.has(sha256(run.slice(i, i + 2)))) hits.push(run.slice(i, i + 1) + '…');
  }
  return hits;
}

export function bannedHits(text) {
  const hits = [];
  const body = prose(text);
  for (const h of identityHits(text)) hits.push({ id: 'real-name', text: h, why: '開発者個人の実名・個人アカウント名（伏せ字で表示）' });
  for (const b of BANNED) {
    b.re.lastIndex = 0;
    for (const m of body.matchAll(b.re)) hits.push({ id: b.id, text: m[0], why: b.why });
  }
  for (const n of NEGATED_OK) {
    n.re.lastIndex = 0;
    for (const m of body.matchAll(n.re)) {
      const around = body.slice(Math.max(0, m.index - 40), m.index + m[0].length + 30);
      if (!NEGATION_NEAR.test(around)) hits.push({ id: n.id, text: m[0], why: '否定の文脈なしで使っている（E2EEではない／公式の後継ではない）' });
    }
  }
  return hits;
}

export function firstPersonCount(text, lang) {
  const body = prose(text).replace(/"[^"\n]*"|“[^”\n]*”|「[^」\n]*」/g, ' '); // 引用は数えない
  if (lang === 'en') return (body.match(/\bI\b|\bI['’](?:m|ve|d|ll)\b|\bmy\b|\bme\b|\bmine\b|\bmyself\b/g) || []).length;
  return (body.match(/私は|私が|私の|僕は|僕が|僕の|わたしは/g) || []).length;
}

export function extractLinks(markdown) {
  const links = [];
  const md = String(markdown).replace(/```[\s\S]*?```/g, ' ');
  for (const m of md.matchAll(/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (m[1] === '!') continue; // 画像
    links.push({ text: m[2].trim(), url: m[3] });
  }
  const stripped = md.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g, ' ');
  for (const m of stripped.matchAll(/https?:\/\/[^\s)>\]]+/g)) links.push({ text: '', url: m[0].replace(/[.,;:]+$/, '') });
  return links;
}

const STOPWORDS_EN = new Set('a an the of to in on for and or but is are was were be it its this that with from by as at i my me we our you your how what why when not no'.split(' '));
export function titleTokens(title, lang) {
  const t = String(title).toLowerCase().replace(/[「」『』【】（）()\[\]"'“”‘’.,:;!?！？、。・\-—–]/g, ' ');
  if (lang === 'en') return new Set(t.split(/\s+/).filter((w) => w && !STOPWORDS_EN.has(w)));
  const s = t.replace(/\s+/g, '');
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  return grams;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function countLength(markdown, lang) {
  const t = prose(markdown).replace(/[#>*_`|\-]/g, ' ');
  if (lang === 'en') return t.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return t.replace(/\s+/g, '').length;
}

const LINK_DENY = /(^|\.)(apps\.apple\.com|itunes\.apple\.com|bit\.ly|t\.co|tinyurl\.com|lnkd\.in|goo\.gl|amzn\.to)$/i;
const COMMERCIAL_ANCHOR = /^(?:(?:the )?(?:best|fastest|top)\s+)?(?:memo|note|note-taking|notes)\s+apps?$|^captio\s*(?:alternative|代替)s?$|^(?:おすすめ)?メモアプリ$|^captio\s*代替アプリ$/i;

/**
 * 記事を検査する。network は { linkStatus(url) } を渡す（オフライン検査では省く）。
 * 返り値の problems が空なら投稿してよい。
 */
export async function validateArticle(article, ctx, { readFile = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8'), network = null } = {}) {
  const problems = [];
  const cfg = PLATFORMS[ctx.platform];
  const lang = cfg.lang;
  const P = (s) => problems.push(s);

  // 執筆側が見送った回。**失敗として返す**（次の枠で再試行させ、見送りが続けば監視に上がる）。
  if (article.skip) return { ok: false, problems: [`執筆ステップが見送った: ${article.reason || '理由なし'}`] };

  // 形
  for (const k of ['title', 'body_markdown', 'basis', 'sources']) if (article[k] === undefined || article[k] === null || article[k] === '') P(`${k} が無い`);
  if (problems.length) return { ok: false, problems };
  const title = String(article.title).trim();
  if (lang === 'en' && (title.length < 20 || title.length > 110)) P(`題名の長さ ${title.length}（20〜110字）`);
  if (lang === 'ja' && (title.length < 12 || title.length > 60)) P(`題名の長さ ${title.length}（12〜60字）`);
  const tags = Array.isArray(article.tags) ? article.tags : [];
  if (!tags.length || tags.length > cfg.tagsMax) P(`tags は1〜${cfg.tagsMax}個（${tags.length}個）`);
  if (ctx.platform === 'devto') {
    for (const t of tags) if (!/^[a-z0-9]{2,30}$/.test(t)) P(`dev.to のタグ「${t}」は英小文字と数字だけ（2〜30字）`);
    if (String(article.description ?? '').length > 170) P('description は170字以内');
    // series は任意。**書いたなら**許可された名前のどれか（書かないのは null / 欄なし）
    if (![undefined, null, ...cfg.series].includes(article.series)) P(`series「${article.series}」は ${cfg.series.join(' / ')} のいずれか（または null）`);
  } else {
    for (const t of tags) if (!String(t).trim() || String(t).length > 20 || /[,\n]/.test(t)) P(`カテゴリ「${t}」が不正（1〜20字・カンマ不可）`);
  }
  const body = String(article.body_markdown);
  if (/devlog-syndication:/.test(body)) P('本文に印（devlog-syndication:）が入っている — 印と開示文は投稿時に付ける');
  if (new RegExp(`${VISIBLE_BASIS_LABEL}[:：]`).test(body)) P(`本文に「${VISIBLE_BASIS_LABEL}:」が入っている — 題材の記録は投稿時に付ける`);
  if (/^---\s*\n[\s\S]*?\n---/.test(body)) P('本文の先頭に front matter がある — 題名・タグは JSON の欄に入れる');
  const headings = (body.match(/^##\s+\S/gm) || []).length;
  if (headings < 3) P(`見出し（##）が ${headings} 個 — 3個以上`);

  // 長さ
  const len = countLength(body, lang);
  const [lo, hi] = lang === 'en' ? cfg.words : cfg.chars;
  if (len < lo || len > hi) P(`本文の長さ ${len}${lang === 'en' ? '語' : '字'}（${lo}〜${hi}）`);

  // 題材・出典
  const basis = String(article.basis);
  const seed = (ctx.seeds_available || []).find((s) => s.id === basis);
  if (/^S-\d{8}-/.test(basis)) {
    if ((ctx.used_bases || []).includes(basis)) P(`題材 ${basis} はこの媒体で使用済み`);
    else if (!seed) P(`題材 ${basis} は使える種の一覧に無い`);
  } else if (/^page:/.test(basis)) {
    const file = basis.slice(5);
    if ((ctx.used_bases || []).includes(basis)) P(`題材 ${basis} はこの媒体で使用済み`);
    if (!(ctx.allowed_site_links || []).some((l) => l.file === file)) P(`題材のページ ${file} がリンク候補（sitemap）に無い`);
  } else {
    P('basis は「S-YYYYMMDD-…」（記事ネタ台帳の種）か「page:<ファイル>」（サイトのページ）');
  }
  const sources = Array.isArray(article.sources) ? article.sources : [];
  if (!sources.length || sources.length > 8) P('sources は1〜8件');
  const sourceTexts = [];
  for (const s of sources) {
    if (typeof s !== 'string' || s.includes('..') || path.isAbsolute(s)) { P(`sources の「${s}」はリポジトリ内の相対パスで`); continue; }
    try { sourceTexts.push(readFile(s)); } catch { P(`sources の「${s}」が読めない`); }
  }
  // 一次ファイルは宣言が無くても出典として数える
  for (const f of ['llms.txt', 'data/site-constants.json', 'data/benchmark.json']) { try { sourceTexts.push(readFile(f)); } catch { /* 無い一次ファイルは足さない */ } }
  if (seed) sourceTexts.push([seed.claim, ...(seed.numbers || []), seed.drafts?.note, seed.drafts?.en, seed.drafts?.x].filter(Boolean).join('\n'));

  // 数字の出典
  const allowed = allowedNumberSet(sourceTexts);
  const bad = [];
  for (const q of quantities(`${title}\n${body}`)) if (!numberAllowed(q.value, allowed)) bad.push(q);
  if (bad.length) {
    const uniq = [...new Map(bad.map((q) => [q.value, q])).values()].slice(0, 12);
    P(`出典に無い数字 ${uniq.length}件: ${uniq.map((q) => `「${q.context}」`).join(' / ')} — sources に挙げたファイルに同じ数字があるものだけ書く`);
  }
  const words = wordQuantities(`${title}\n${body}`, sourceTexts.join('\n'));
  if (words.length) P(`字で書いた数量が出典に無い: ${words.slice(0, 8).map((w) => `「${w}」`).join(' / ')} — 数字を言い換えても同じ扱い。出典の値をそのまま使うか削る`);

  // 禁止表現（このリポジトリの配信原稿の規則も同じく当てる）
  for (const h of bannedHits(`${title}\n${body}`)) P(`禁止表現「${h.text}」: ${h.why}`);
  const pr = checkText(`<!-- fact-check: draft -->\n# ${title}\n${body}\n`);
  for (const v of pr.violations) P(`事実検査 ${v.rule}: ${v.message}（「${v.text}」）`);

  // 一人称
  const fp = firstPersonCount(body, lang);
  const fpMax = lang === 'en' ? 2 : 1;
  if (fp > fpMax) P(`一人称単数が ${fp} 回（${fpMax} 回まで）— AIが書く記事なので、記録にある事実を主語にして書く`);

  // 製品名の出現
  const mentions = (prose(body).match(/Simple Memo|シンプルメモ|simplememofast/gi) || []).length;
  if (mentions > 3) P(`製品名が ${mentions} 回（3回まで）`);

  // リンク
  const links = extractLinks(body);
  const siteLinks = links.filter((l) => /^https:\/\/simplememofast\.com(\/|$)/.test(l.url));
  const otherLinks = links.filter((l) => !/^https?:\/\/(www\.)?simplememofast\.com(\/|$)/.test(l.url));
  const allowedSet = new Set((ctx.allowed_site_links || []).map((l) => l.url));
  const [minSite, maxSite] = cfg.siteLinks;
  if (siteLinks.length < minSite || siteLinks.length > maxSite) P(`自社サイトへのリンクが ${siteLinks.length} 本（${minSite}〜${maxSite}本）`);
  for (const l of links.filter((x) => /simplememofast\.com/.test(x.url) && !/^https:\/\/simplememofast\.com(\/|$)/.test(x.url))) P(`自社リンクは https://simplememofast.com/ で始める（${l.url}）`);
  for (const l of siteLinks) {
    if (!allowedSet.has(l.url)) P(`自社リンク ${l.url} はリンク候補（sitemap の正規URL）に無い — 候補の URL をそのまま使う`);
    if (l.text && COMMERCIAL_ANCHOR.test(l.text.trim())) P(`自社リンクの文字列「${l.text}」が検索語そのもの — 何のページかを説明する文字列にする`);
    if (!l.text) P(`自社リンク ${l.url} が裸のURL — [説明](URL) の形にする`);
  }
  if (otherLinks.length > cfg.otherLinksMax) P(`外部リンクが ${otherLinks.length} 本（${cfg.otherLinksMax}本まで）`);
  for (const l of otherLinks) {
    let host = '';
    try { host = new URL(l.url).hostname; } catch { P(`URL を解釈できない: ${l.url}`); continue; }
    if (!l.url.startsWith('https://')) P(`https でないリンク: ${l.url}`);
    if (LINK_DENY.test(host)) P(`使わないリンク先: ${host}（App Store 直リンク・短縮URL）`);
  }
  if (network) {
    for (const l of siteLinks) {
      const st = await network.linkStatus(l.url, { noRedirect: true });
      if (st !== 200) P(`自社リンク ${l.url} が ${st} を返す（200 でリダイレクトなしが要る）`);
    }
    for (const l of otherLinks) {
      const st = await network.linkStatus(l.url, { noRedirect: false });
      if (!(st >= 200 && st < 400)) P(`外部リンク ${l.url} が ${st} を返す — 確かでない URL は書かない`);
    }
  }

  // 既存記事との重複
  const tk = titleTokens(title, lang);
  for (const p of ctx.existing_posts || []) {
    const sim = jaccard(tk, titleTokens(p.title, lang));
    if (sim >= 0.55) P(`既存記事と題名が近い（${sim.toFixed(2)}）: 「${p.title}」`);
  }
  return { ok: problems.length === 0, problems, stats: { length: len, first_person: fp, site_links: siteLinks.length, other_links: otherLinks.length, product_mentions: mentions } };
}

export async function linkStatus(url, { noRedirect }) {
  try {
    let res = await fetchWithRetry(url, { method: 'HEAD', redirect: noRedirect ? 'manual' : 'follow', retries: 1, timeoutMs: 20000 });
    if (res.status === 405 || res.status === 403) {
      res = await fetchWithRetry(url, { method: 'GET', redirect: noRedirect ? 'manual' : 'follow', retries: 1, timeoutMs: 20000 });
    }
    return res.status;
  } catch (e) {
    return `error(${e.message.slice(0, 80)})`;
  }
}

async function cmdValidate(argv) {
  const platform = platformOf(argv);
  const article = JSON.parse(fs.readFileSync(argValue(argv, '--article'), 'utf8'));
  const ctx = JSON.parse(fs.readFileSync(argValue(argv, '--context'), 'utf8'));
  if (ctx.platform !== platform) throw new Error(`文脈の platform（${ctx.platform}）と --platform（${platform}）が違う`);
  if (![undefined, null, platform].includes(article.platform)) throw new Error(`記事の platform（${article.platform}）と --platform（${platform}）が違う`);
  const r = await validateArticle(article, ctx, { network: argv.includes('--offline') ? null : { linkStatus } });
  const lines = r.ok
    ? [`検証: 通過（${JSON.stringify(r.stats)}）`]
    : ['検証: 不合格。次をすべて直すこと（直せない数字は削る）:', ...r.problems.map((p) => `- ${p}`)];
  const report = argValue(argv, '--report');
  if (report) fs.writeFileSync(report, lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  if (!r.ok) process.exitCode = 1;
}

// ─────────────────────────────────────────────────────────────
// 投稿
// ─────────────────────────────────────────────────────────────

export function composeBody(article, platform, { runId = 'local', at = new Date().toISOString() } = {}) {
  const cfg = PLATFORMS[platform];
  const marker = `<!-- ${MARKER}: basis=${article.basis}; route=actions; run=${runId}; at=${at} -->`;
  // はてなは HTML コメントを公開面から消すので、題材の記録を見える形でも付ける（VISIBLE_BASIS_LABEL の説明）
  const visible = platform === 'hatena' ? `\n*${VISIBLE_BASIS_LABEL}: ${article.basis}*\n` : '';
  return `${String(article.body_markdown).trim()}${cfg.footer}${visible}\n${marker}\n`;
}

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function hatenaEntryXml({ title, body, categories, author }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <title>${xmlEscape(title)}</title>
  <author><name>${xmlEscape(author)}</name></author>
  <content type="text/x-markdown">${xmlEscape(body)}</content>
${categories.map((c) => `  <category term="${xmlEscape(c)}" />`).join('\n')}
  <app:control><app:draft>no</app:draft></app:control>
</entry>
`;
}

/**
 * AI 開示が**公開面で**付いていることを確かめる。応答に欄が無いのを「付いている」にしない（fail closed）。
 * 付いていなければ1回だけ付け直し、それでも付かなければ投げる（記事は公開のまま残るので人が確認する）。
 */
/**
 * dev.to の AI 開示（fully_autonomous）を確かめ、付いていなければ付け直す。
 * **作成直後の公開 API は 404 や古い値を返しうる**（公開面の反映が遅れる）。
 * そこで (1) 作成・更新の応答に値があればそれで確かめ、(2) 公開 API を読むときは 404 を「まだ」として待って読み直す。
 * 付け直しても確かめられなければ投げる（記事は公開済みなので、人が確認する）。
 * 戻り値は確かめた経路（'response' / 'read' / 'put' / 'reread'）。
 */
export async function ensureDevtoDisclosure(id, headers, url, { known = undefined, wait = sleep, attempts = 6 } = {}) {
  if (known === 'fully_autonomous') return 'response';
  const read = async () => {
    for (let i = 0; ; i++) {
      try {
        return (await fetchJson(PLATFORMS.devto.articleApi(id), { headers: { accept: headers.accept }, retries: 0 })).ai_disclosure_level;
      } catch (e) {
        if (e.status !== 404 || i >= attempts - 1) throw e;
        await wait(10000);
      }
    }
  };
  let level = await read();
  if (level === 'fully_autonomous') return 'read';
  const res = await fetchWithRetry(`https://dev.to/api/articles/${id}`, { method: 'PUT', headers,
    body: JSON.stringify({ article: { ai_disclosure_level: 'fully_autonomous' } }), okStatuses: [200] });
  const updated = await res.json().catch(() => ({}));
  if (updated?.ai_disclosure_level === 'fully_autonomous') return 'put';
  level = await read();
  if (level !== 'fully_autonomous') {
    throw new Error(`AI 開示を確認できない（ai_disclosure_level=${level}）— 記事は公開されているので人が確認する: ${url}`);
  }
  return 'reread';
}

/**
 * 投稿の直前に、**キャッシュの無い認証済みの一覧**（dev.to は me/all、はてなは AtomPub）で門をもう一度確かめる。
 * 門が読む公開面は CDN のキャッシュを通る（2026-09-29、dev.to の公開一覧が25.7時間前の内容を返していた）。
 * 門が直前の投稿を見落とすと、同じ媒体へ続けて出る。ここでは「直近24時間に1本まで」（force でも越えない）と
 * 「最新から minIntervalHours」（force で越えられる）を見る。同題の採用（応答が失われた前回の投稿）はこれより先に判定する。
 */
export function publishGuard(items, now, { minIntervalHours, force = false }) {
  const times = items.filter((a) => a.published === true).map((a) => new Date(a.published_at).getTime()).filter(Number.isFinite);
  const last24 = times.filter((t) => now.getTime() - t < 24 * 3600000);
  if (last24.length) return { ok: false, reason: `直近24時間に ${last24.length} 本ある（1日1本まで。force でも越えない）` };
  const latest = times.length ? Math.max(...times) : null;
  const hours = latest === null ? null : (now.getTime() - latest) / 3600000;
  if (hours !== null && hours < minIntervalHours && !force) {
    return { ok: false, reason: `最新から ${hours.toFixed(1)} 時間（${minIntervalHours} 時間未満）` };
  }
  return { ok: true, hours };
}

export async function publishDevto(article, key, body, { now = new Date(), wait = sleep, force = false } = {}) {
  const headers = { 'api-key': key, accept: 'application/vnd.forem.api-v1+json', 'content-type': 'application/json' };
  // 冪等: 同じ題名が直近にあれば作らない（応答が失われた前回の投稿を二重に出さない）
  const mine = await fetchJson('https://dev.to/api/articles/me/all?per_page=30', { headers, wait });
  // 空の一覧は「投稿が無い」ではなく「読めていない」と扱う（35本ある口座で空は異常。空を通すと同題の採用も門も素通りする）
  if (!Array.isArray(mine) || !mine.length) throw new Error('dev.to の自分の記事一覧が空か配列でない（二重投稿を避けて止める）');
  const same = mine.find((a) => a.title === article.title);
  if (same) {
    // 公開済みの同題 = 応答が失われた前回の投稿。作り直さずに採用する。
    // **下書きの同題は公開しない。**中身が今回の記事と同じ保証が無い（古い重複下書きが実在する）。
    if (same.published !== true) {
      throw new Error(`同じ題名の下書きが dev.to にある（id ${same.id}）。中身が同じか分からないので公開も新規投稿もしない — 人が確認する`);
    }
    await ensureDevtoDisclosure(same.id, headers, same.url, { known: same.ai_disclosure_level, wait });
    return { id: same.id, url: same.url, reused: true };
  }
  const guard = publishGuard(mine, now, { minIntervalHours: PLATFORMS.devto.minIntervalHours, force });
  if (!guard.ok) throw new Error(`投稿の直前の確認（認証済みの一覧）で止めた: ${guard.reason} — 門が読んだ公開一覧が古かった可能性。続けて出さない`);
  const payload = { article: {
    title: article.title, body_markdown: body, published: true, tags: article.tags,
    description: article.description || undefined, series: article.series || undefined,
    ai_disclosure_level: 'fully_autonomous',
  } };
  const res = await fetchWithRetry('https://dev.to/api/articles', { method: 'POST', headers, body: JSON.stringify(payload),
    okStatuses: [200, 201], retries: 1, idempotent: false, wait });
  const a = await res.json();
  if (!a.url) throw new Error(`dev.to の応答に url が無い: ${JSON.stringify(a).slice(0, 300)}`);
  await ensureDevtoDisclosure(a.id, headers, a.url, { known: a.ai_disclosure_level, wait });
  return { id: a.id, url: a.url, reused: false };
}

/**
 * はてなの認証ヘッダ。公式は Basic（はてなID + APIキー・HTTPS）と WSSE の両方を受ける。
 * Basic で 401 が返ったときだけ WSSE に切り替える（どちらも鍵の値をログに出さない）。
 */
export function hatenaAuthHeaders(id, key, mode = 'basic', { nonce = crypto.randomBytes(16), created = new Date().toISOString() } = {}) {
  if (mode === 'basic') return { authorization: 'Basic ' + Buffer.from(`${id}:${key}`).toString('base64') };
  const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(created + key)])).digest('base64');
  return {
    authorization: 'WSSE profile="UsernameToken"',
    'x-wsse': `UsernameToken Username="${id}", PasswordDigest="${digest}", Nonce="${nonce.toString('base64')}", Created="${created}"`,
  };
}

async function hatenaRequest(url, key, opts, okStatuses) {
  const cfg = PLATFORMS.hatena;
  // 記事の作成（POST）は 5xx・通信の失敗で送り直さない（作成済みかもしれない）。401 は作成されていないので WSSE で送り直す
  const idempotent = (opts.method || 'GET') !== 'POST';
  for (const mode of ['basic', 'wsse']) {
    try {
      return await fetchWithRetry(url, { ...opts, headers: { ...(opts.headers || {}), ...hatenaAuthHeaders(cfg.hatenaId, key, mode) }, okStatuses, retries: 1, idempotent });
    } catch (e) {
      if (e.status === 401 && mode === 'basic') continue;
      throw e;
    }
  }
  throw new Error('はてなの認証が Basic でも WSSE でも通らない');
}

export async function publishHatena(article, key, body, { now = new Date(), force = false } = {}) {
  const cfg = PLATFORMS.hatena;
  // 冪等: 直近の一覧（AtomPub・認証済み）に同じ題名があれば作らない
  const listXml = await (await hatenaRequest(cfg.atomUrl, key, { method: 'GET' }, [200])).text();
  const entries = parseAtomFeed(listXml);
  // 空の一覧は「投稿が無い」ではなく「読み方が壊れている」と扱う（空を通すと同題の採用も門も素通りする）
  if (!entries.length) throw new Error('はてなの AtomPub の一覧に entry が無い（読み方が壊れている可能性）— 二重投稿を避けて止める');
  for (const e of entries) {
    if (e.title !== article.title) continue;
    // 公開済みの同題 = 応答が失われた前回の投稿。下書きの同題は中身が同じ保証が無いので止める。
    if (e.draft !== false) throw new Error(`同じ題名の下書き（または状態を読めない記事）がはてなにある: ${e.title} — 人が確認する`);
    if (!e.url) throw new Error(`同じ題名の記事があるが公開URLを読めない（二重投稿を避けて止める）: ${e.title}`);
    return { url: e.url, reused: true };
  }
  const guard = publishGuard(entries.map((e) => ({ ...e, published: e.draft === false })), now,
    { minIntervalHours: PLATFORMS.hatena.minIntervalHours, force });
  if (!guard.ok) throw new Error(`投稿の直前の確認（AtomPub の一覧）で止めた: ${guard.reason} — 門が読んだ公開フィードが古かった可能性。続けて出さない`);
  const xml = hatenaEntryXml({ title: article.title, body, categories: article.tags, author: cfg.hatenaId });
  const res = await hatenaRequest(cfg.atomUrl, key, { method: 'POST', headers: { 'content-type': 'application/atom+xml; charset=utf-8' }, body: xml }, [201]);
  const text = await res.text();
  const url = entryAlternateUrl(text);
  if (!url) throw new Error(`はてなの応答に公開URLが無い: ${text.slice(0, 300)}`);
  return { url, reused: false, member: res.headers.get('location') };
}

async function cmdPublish(argv) {
  const platform = platformOf(argv);
  const cfg = PLATFORMS[platform];
  const article = JSON.parse(fs.readFileSync(argValue(argv, '--article'), 'utf8'));
  const ctx = JSON.parse(fs.readFileSync(argValue(argv, '--context'), 'utf8'));
  const out = argValue(argv, '--out');
  // **検証を通っていない記事は出さない。**ワークフローの順序だけに頼らず、ここでもう一度通す。
  const r = await validateArticle(article, ctx, { network: { linkStatus } });
  if (!r.ok) throw new Error(`検証を通らない記事は投稿しない:\n- ${r.problems.join('\n- ')}`);
  const stop = readStop();
  if (stop.stopped) throw new Error(`停止中のため投稿しない: ${stop.reason}`);
  const body = composeBody(article, platform, { runId: process.env.GITHUB_RUN_ID || 'local' });
  if (argv.includes('--dry-run')) {
    const result = { platform, dry_run: true, title: article.title, body_preview: body.slice(0, 500) };
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(`[${cfg.label}] dry-run: 投稿しない（検証は通過）`);
    return;
  }
  const key = process.env[cfg.secretEnv];
  if (!key) throw new Error(`${cfg.secretEnv} が無い — GitHub の Secrets に登録が要る（鍵の値はこのスクリプトしか読まない）`);
  const force = argv.includes('--force');
  const res = platform === 'devto' ? await publishDevto(article, key, body, { force }) : await publishHatena(article, key, body, { force });
  // 対外送信の記録（時刻・経路・表示名・本文のハッシュ）。本文そのものは成果物の article.json に残る。
  const result = { platform, title: article.title, url: res.url, id: res.id ?? null, reused: res.reused, basis: article.basis,
    published_at: new Date().toISOString(), route: 'actions:devlog-syndication', run_id: process.env.GITHUB_RUN_ID || 'local',
    account: platform === 'devto' ? cfg.username : cfg.hatenaId,
    body_sha256: crypto.createHash('sha256').update(body).digest('hex'), identity_check: 'passed' };
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`[${cfg.label}] ${res.reused ? '既存の同題記事を採用' : '投稿した'}: ${res.url}`);
}

// ─────────────────────────────────────────────────────────────
// 公開確認
// ─────────────────────────────────────────────────────────────

/** 本文の範囲を切り出す。**範囲が取れないのを「リンクが無い」にしない。** */
export function articleRegion(html, platform) {
  if (platform === 'devto') {
    const i = html.indexOf('id="article-body"');
    if (i === -1) return null;
    const j = html.indexOf('</article>', i);
    return html.slice(i, j === -1 ? undefined : j);
  }
  const i = html.indexOf('entry-content');
  if (i === -1) return null;
  const j = html.indexOf('entry-footer', i);
  return html.slice(i, j === -1 ? undefined : j);
}

export function inspectPublished(html, platform, { title } = {}) {
  const problems = [];
  const robots = [...html.matchAll(/<meta[^>]*name=["']robots["'][^>]*>/gi)].map((m) => (/content=["']([^"']*)["']/i.exec(m[0]) || [])[1] || '');
  for (const r of robots) if (/noindex|nofollow/i.test(r)) problems.push(`meta robots が「${r}」`);
  const region = articleRegion(html, platform);
  const siteLinks = [];
  if (region === null) problems.push('本文の範囲を特定できない（ページの形が変わった可能性）');
  else {
    for (const m of region.matchAll(/<a\b[^>]*href=["'](https?:\/\/(?:www\.)?simplememofast\.com[^"']*)["'][^>]*>/gi)) {
      const rel = (/\brel=["']([^"']*)["']/i.exec(m[0]) || [])[1] || '';
      siteLinks.push({ href: decodeEntities(m[1]), rel });
    }
    if (!siteLinks.length) problems.push('本文に自社サイトへのリンクが無い');
    for (const l of siteLinks) if (/nofollow|ugc|sponsored/i.test(l.rel)) problems.push(`自社リンクに rel="${l.rel}"（${l.href}）`);
  }
  if (title && !decodeEntities(html).includes(title)) problems.push('題名がページに無い');
  // 本文末尾の印（HTML コメント）が公開面に残るか。はてなは次の回の「使用済みの題材」をこの印から読むので、
  // 消えていると同じ種を再利用しうる。**公開そのものの失敗ではない**ので problems には入れない。
  const markerVisible = String(html).includes(`${MARKER}:`) || readMarkers(html).some((m) => m.basis);
  return { ok: problems.length === 0, problems, robots, siteLinks, markerVisible };
}

async function cmdVerify(argv) {
  const platform = platformOf(argv);
  const pub = JSON.parse(fs.readFileSync(argValue(argv, '--published'), 'utf8'));
  const attempts = Number(argValue(argv, '--attempts', '10'));
  let last = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const html = await fetchText(pub.url, { headers: { accept: 'text/html' }, retries: 0 });
      last = inspectPublished(html, platform, { title: pub.title });
      if (last.ok) break;
    } catch (e) {
      last = { ok: false, problems: [`取得できない: ${e.message}`], robots: [], siteLinks: [] };
    }
    if (i < attempts - 1) await sleep(30000);
  }
  const lines = [
    `### ${PLATFORMS[platform].label}: ${last.ok ? '公開を確認' : '公開の確認に失敗'}`,
    `- URL: ${pub.url}`,
    `- 題名: ${pub.title}`,
    `- meta robots: ${last.robots.length ? last.robots.join(' / ') : '（指定なし）'}`,
    ...last.siteLinks.map((l) => `- 自社リンク: ${l.href}（rel="${l.rel || 'なし'}"）`),
    ...last.problems.map((p) => `- ⚠ ${p}`),
  ];
  if (platform === 'hatena' && last.markerVisible === false) {
    const note = `本文末尾の題材の記録（「${VISIBLE_BASIS_LABEL}」か印）が公開ページに無い — 次の回の「使用済みの題材」に載らず、同じ種を再利用しうる`;
    lines.push(`- 注意: ${note}`);
    console.log(`::warning title=Devlog syndication marker::${note}`);
  }
  const summary = argValue(argv, '--summary');
  if (summary) fs.appendFileSync(summary, lines.join('\n') + '\n\n');
  console.log(lines.join('\n'));
  if (!last.ok) process.exitCode = 1;
}

// ─────────────────────────────────────────────────────────────
// 見張り（毎日の定期タスクが使う。**読むだけで、何も書かない**）
// ─────────────────────────────────────────────────────────────

/**
 * 見張りの閾値。枠は1日2回（日次 cron の遅れで実際は15時台・23時台 JST）、門は66時間。
 * 投稿がうまく回っていれば、朝の見張りが見る「最新投稿からの時間」は最大でも60時間前後。
 * 期限を過ぎた枠を1回落とすと80時間前後、2回以上落とすと96時間を超える。
 */
export const WATCH = { warnHours: 80, alertHours: 96, scan: 6, since: '2026-09-25T00:00:00Z' };

/** はてなの公開フィードの entry が、この経路の記事か（本文末尾の開示文か印で見分ける）。 */
export function isPipelineHatena(entry) {
  const c = String(entry?.content || '');
  return c.includes('AIエージェントが自動で執筆・公開しています') || c.includes(`${MARKER}:`);
}

/** dev.to の記事がこの経路の記事か（本文 Markdown の印で見分ける）。 */
export function isPipelineDevto(article) {
  return String(article?.body_markdown || '').includes(`${MARKER}:`);
}

export function classifyAge(hours, { warnHours = WATCH.warnHours, alertHours = WATCH.alertHours } = {}) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return 'unreadable';
  if (hours > alertHours) return 'alert';
  if (hours > warnHours) return 'warn';
  return 'ok';
}

/** 見張りの公開日時だけを読む。Date の型変換・暦日補正を、公開時刻の証拠にしない。 */
function watchPublishedTime(publishedIso) {
  if (typeof publishedIso !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(publishedIso);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] || hour > 23 || minute > 59 || second > 59) return null;
  const timestamp = Date.parse(publishedIso);
  return Number.isFinite(timestamp) ? timestamp : null;
}

const RANK = { ok: 0, warn: 1, unknown: 1, unreadable: 1, alert: 2 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/**
 * この run で投稿した記事を、公開一覧に合流させる。
 * 2026-09-29 の初回の本番 run（36561085228）で、同じ run の見張りが公開一覧（25.7時間前のキャッシュ）を読み、
 * 投稿に成功した直後に「最新は122時間前」として run を赤くした。一覧はキャッシュを通さずに読むよう直したが、
 * 投稿の結果はこの run 自身が持っている事実なので、一覧の新しさに頼らずに数える。
 * 一覧にまだ無い記事（id か URL で照合）だけを、投稿の結果（published.json）から足す。試験実行の結果は足さない。
 */
export function mergeJustPublished(posts, justPublished, platform) {
  const out = [...posts];
  for (const p of justPublished || []) {
    if (!p || p.platform !== platform || p.dry_run || !p.url || !Number.isFinite(new Date(p.published_at).getTime())) continue;
    if (out.some((q) => (p.id != null && q.id === p.id) || q.url === p.url)) continue;
    out.push({ id: p.id ?? null, title: p.title, url: p.url, published_at: p.published_at, fromRun: true });
  }
  return out;
}

/** この run の成果物にある投稿の結果（published.json）を読む。無い・壊れているものは使わない（見張りは公開一覧だけでも回る）。 */
export function readJustPublished(dir) {
  const found = [];
  if (!dir || !fs.existsSync(dir)) return found;
  const walk = (d, depth) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, ent.name);
      if (ent.isDirectory() && depth < 2) walk(f, depth + 1);
      else if (ent.isFile() && ent.name === 'published.json') {
        try { found.push(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { /* 壊れた成果物は足さない（一覧だけで見る） */ }
      }
    }
  };
  walk(dir, 0);
  return found;
}

/** dev.to の記事を公開 API で読む。作成直後は 404 を返しうるので、attempts 回まで10秒おきに読み直す。 */
async function readDevtoArticle(id, { attempts = 1, wait = sleep } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fetchJson(PLATFORMS.devto.articleApi(id), { headers: { accept: 'application/vnd.forem.api-v1+json' }, wait });
    } catch (e) {
      if (e.status !== 404 || i >= attempts - 1) throw e;
      await wait(10000);
    }
  }
}

export async function watchPlatform(platform, now, opts, stop) {
  const cfg = PLATFORMS[platform];
  const r = { platform, label: cfg.label, status: 'ok', problems: [], notes: [], latest: null, age_hours: null,
    pipeline_latest: null, pipeline_age_hours: null, pipeline_age_status: 'unknown', pipeline_age_reason: null, legacy: [] };
  let posts;
  try { posts = await publicPosts(platform); } catch (e) {
    r.status = 'unreadable'; r.pipeline_age_reason = `公開面を読めない: ${e.message}`;
    r.problems.push(r.pipeline_age_reason); return r;
  }
  posts = mergeJustPublished(posts, opts.justPublished, platform);
  const fromRun = posts.filter((p) => p.fromRun).length;
  if (fromRun) r.notes.push(`公開一覧にまだ出ていない、この run の投稿 ${fromRun} 本を投稿の結果から足して見た`);
  const sorted = posts.filter((p) => watchPublishedTime(p.published_at) !== null)
    .sort((a, b) => watchPublishedTime(b.published_at) - watchPublishedTime(a.published_at));
  const latest = sorted[0] || null;
  if (latest) {
    r.latest = { title: latest.title, url: latest.url, published_at: latest.published_at };
    r.age_hours = Math.round(((now.getTime() - new Date(latest.published_at).getTime()) / 3600000) * 10) / 10;
  }

  // 直近 scan 本のうち、この経路の最新記事と、since 以降のこの経路以外の記事。
  // 印・この run の公開結果は経路の出力証拠だけであり、自然 schedule や人介入ゼロの証明ではない。
  const pipelineUnknownReasons = posts.some((p) => watchPublishedTime(p.published_at) === null)
    ? ['公開一覧に公開日時を読めない記事があるため、この経路の最新を断定できない'] : [];
  let pipeline = null;
  for (const p of sorted.slice(0, opts.scan)) {
    let isPipe = false, disclosure = null;
    if (platform === 'devto') {
      try {
        if (p.id == null) throw new Error('id が無い');
        const a = await readDevtoArticle(p.id, { attempts: p.fromRun ? 6 : 1, wait: opts.wait });
        if (!p.fromRun && (typeof a.body_markdown !== 'string' || !a.body_markdown.trim())) {
          throw new Error('記事本文を読めない（経路を判定できない）');
        }
        isPipe = p.fromRun === true || isPipelineDevto(a);
        disclosure = a.ai_disclosure_level ?? null;
      } catch (e) {
        if (!pipeline) pipelineUnknownReasons.push(`より新しい記事 ${p.id ?? p.url} の経路を確認できない`);
        r.status = worse(r.status, 'unreadable'); r.problems.push(`記事 ${p.id ?? p.url} を読めない: ${e.message}`); continue;
      }
    } else {
      if (!p.fromRun && !String(p.content || '').trim()) {
        if (!pipeline) pipelineUnknownReasons.push(`より新しい記事 ${p.url} の経路を確認できない`);
        r.status = worse(r.status, 'unreadable'); r.problems.push(`記事 ${p.url} の本文を読めない（経路を判定できない）`); continue;
      }
      isPipe = p.fromRun === true || isPipelineHatena(p);
    }
    if (isPipe && !pipeline) pipeline = { ...p, disclosure };
    if (!isPipe && new Date(p.published_at).getTime() >= new Date(opts.since).getTime()) {
      r.legacy.push({ title: p.title, url: p.url, published_at: p.published_at, disclosure });
    }
  }

  if (pipeline && !pipeline.url) {
    pipelineUnknownReasons.push('この経路の記事の公開URLを確認できない');
    r.status = worse(r.status, 'unreadable'); r.problems.push(`この経路の最新記事の公開URLを読めない（${pipeline.title}）— フィードの形が変わった可能性`);
  } else if (pipeline) {
    r.pipeline_latest = { title: pipeline.title, url: pipeline.url, published_at: pipeline.published_at, disclosure: pipeline.disclosure,
      from_run: pipeline.fromRun === true };
    try {
      const html = await fetchText(pipeline.url, { headers: { accept: 'text/html' }, wait: opts.wait });
      const ins = inspectPublished(html, platform, { title: pipeline.title });
      r.pipeline_latest.robots = ins.robots;
      r.pipeline_latest.site_links = ins.siteLinks;
      if (!ins.ok) { r.status = 'alert'; for (const x of ins.problems) r.problems.push(`この経路の最新記事: ${x}`); }
    } catch (e) {
      r.status = worse(r.status, 'unreadable'); r.problems.push(`この経路の最新記事のページを読めない: ${e.message}`);
    }
    if (platform === 'devto' && pipeline.disclosure !== 'fully_autonomous') {
      r.status = 'alert'; r.problems.push(`この経路の最新記事の AI 開示が「${pipeline.disclosure}」（fully_autonomous でない）`);
    }
    // はてなは「使用済みの題材」を公開フィードの本文にある印から読む。印が消えていると題材の重複防止が効かない。
    // この run の投稿はまだフィードに無い（本文を読めない）ので、次の見張りで確かめる。
    if (platform === 'hatena' && pipeline.fromRun) {
      r.notes.push('この run の投稿はまだ公開フィードに出ていないので、印（HTML コメント）の確認は次の見張りで行う');
    } else if (platform === 'hatena' && !hatenaBases(pipeline).length) {
      r.status = worse(r.status, 'warn');
      r.problems.push(`この経路の最新記事の題材（「${VISIBLE_BASIS_LABEL}」か印）がフィードから読めない — 使用済みの題材が文脈に載らず、同じ種を再利用しうる`);
    }
  } else {
    pipelineUnknownReasons.push(`直近 ${opts.scan} 本の走査ではこの経路の公開証拠を確認できない（公開一覧 ${posts.length} 本）— 全履歴の未投稿とは判定しない`);
  }
  if (r.legacy.length) {
    r.notes.push(`${opts.since.slice(0, 10)} 以降に、この経路以外の投稿が ${r.legacy.length} 本（旧ローカルタスクか、手動の投稿）`);
  }

  // アカウントの最新投稿と、この経路の確認済み最新投稿は別々に見る。
  // 他経路の新しい投稿だけで、この経路の長い停滞を「異常なし」にしない。
  if (pipeline && new Date(pipeline.published_at).getTime() > now.getTime()) {
    pipelineUnknownReasons.push('この経路の記事の公開日時が未来のため、経過時間を確認できない');
  }
  if (pipeline && !pipelineUnknownReasons.length) {
    const pipelineHours = (now.getTime() - new Date(pipeline.published_at).getTime()) / 3600000;
    r.pipeline_age_hours = Math.round(pipelineHours * 10) / 10;
    r.pipeline_age_status = stop.stopped ? 'stopped' : classifyAge(pipelineHours, opts);
  } else {
    r.pipeline_age_reason = pipelineUnknownReasons.join(' / ');
    r.notes.push(`この経路の間隔は unknown: ${r.pipeline_age_reason}`);
  }

  // 投稿の間隔（意図的な停止中は問題に数えない）
  const age = latest ? classifyAge(r.age_hours, opts) : 'alert';
  if (stop.stopped) {
    r.notes.push(`停止中のため、間隔は問題に数えない（${stop.reason}）`);
  } else if (age === 'alert') {
    r.status = 'alert'; r.problems.push(`最新投稿から ${r.age_hours ?? '—'} 時間（${opts.alertHours} 時間超）— 投稿が止まっている疑い`);
  } else if (age === 'warn') {
    r.status = worse(r.status, 'warn'); r.problems.push(`最新投稿から ${r.age_hours} 時間（${opts.warnHours} 時間超）— 期限を過ぎた枠が投稿できていない`);
  }
  if (!stop.stopped) {
    r.status = worse(r.status, r.pipeline_age_status);
    if (r.pipeline_age_status === 'alert' || r.pipeline_age_status === 'warn') {
      const limit = r.pipeline_age_status === 'alert' ? opts.alertHours : opts.warnHours;
      r.problems.push(`この経路の最新投稿から ${r.pipeline_age_hours} 時間（${limit} 時間超）— 他経路の投稿とは別に、配信が停滞している疑い`);
    }
  }
  return r;
}

async function cmdWatch(argv) {
  const now = new Date(argValue(argv, '--now', new Date().toISOString()));
  const opts = {
    ...WATCH,
    warnHours: Number(argValue(argv, '--warn-hours', String(WATCH.warnHours))),
    alertHours: Number(argValue(argv, '--alert-hours', String(WATCH.alertHours))),
    since: argValue(argv, '--since', WATCH.since),
    // 同じ run の投稿の結果（ワークフローの watch ジョブが成果物から渡す）
    justPublished: readJustPublished(argValue(argv, '--published-dir')),
  };
  const stop = readStop();
  const out = { checked_at: now.toISOString(), stopped: stop.stopped, stop_reason: stop.reason, platforms: [] };
  for (const p of Object.keys(PLATFORMS)) out.platforms.push(await watchPlatform(p, now, opts, stop));
  const overall = out.platforms.reduce((a, r) => worse(a, r.status), 'ok');
  out.status = overall;
  const lines = [`見張り ${now.toISOString()}: ${overall === 'ok' ? '異常なし' : overall}${stop.stopped ? `（停止中: ${stop.reason}）` : ''}`];
  for (const r of out.platforms) {
    lines.push(`- ${r.label}: ${r.status} / 最新 ${r.age_hours ?? '—'} 時間前${r.latest ? `「${r.latest.title}」` : ''}`);
    if (r.pipeline_latest) {
      const rels = (r.pipeline_latest.site_links || []).map((l) => `rel="${l.rel || 'なし'}"`).join(', ');
      lines.push(`  - この経路の最新: ${r.pipeline_latest.url}（${r.pipeline_age_hours ?? '—'} 時間前 / 間隔 ${r.pipeline_age_status} / ${rels || '自社リンク未確認'}${r.platform === 'devto' ? ` / 開示 ${r.pipeline_latest.disclosure}` : ''}）`);
    }
    for (const x of r.problems) lines.push(`  - ⚠ ${x}`);
    for (const x of r.notes) lines.push(`  - ${x}`);
  }
  console.log(lines.join('\n'));
  const json = argValue(argv, '--json');
  if (json) fs.writeFileSync(json, JSON.stringify(out, null, 2));
  process.exitCode = RANK[overall] >= 2 ? 2 : RANK[overall];
}

// ─────────────────────────────────────────────────────────────
// 自己テスト（**落ちることを確かめる**）
// ─────────────────────────────────────────────────────────────

export async function selftest() {
  const results = [];
  const t = async (name, fn) => {
    try { await fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); }
  };
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const now = new Date('2026-09-24T12:00:00Z');
  const hoursAgo = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  const go = { stopped: false };

  await t('門: 間隔が空いていれば投稿する', () => {
    const d = decideGate({ stop: go, latestIso: hoursAgo(70), postsLast24h: 0, now, minIntervalHours: 66 });
    assert(d.due === true, JSON.stringify(d));
    assert(d.code === 'interval_elapsed', JSON.stringify(d));
  });
  await t('門: 間隔が足りなければ投稿しない（force で越えられる）', () => {
    const d = decideGate({ stop: go, latestIso: hoursAgo(30), postsLast24h: 0, now, minIntervalHours: 66 });
    assert(d.due === false, JSON.stringify(d));
    assert(d.code === 'too_soon', JSON.stringify(d));
    const f = decideGate({ stop: go, latestIso: hoursAgo(30), postsLast24h: 0, now, minIntervalHours: 66, force: true });
    assert(f.due === true, JSON.stringify(f));
    assert(f.code === 'forced', JSON.stringify(f));
  });
  await t('門: **停止は force でも越えない**', () => {
    const d = decideGate({ stop: { stopped: true, reason: 'test' }, latestIso: hoursAgo(99), postsLast24h: 0, now, minIntervalHours: 66, force: true });
    assert(d.due === false, JSON.stringify(d));
    assert(d.code === 'stopped', JSON.stringify(d));
  });
  await t('門: **24時間以内の投稿があれば force でも越えない**', () => {
    const d = decideGate({ stop: go, latestIso: hoursAgo(2), postsLast24h: 1, now, minIntervalHours: 66, force: true });
    assert(d.due === false, JSON.stringify(d));
    assert(d.code === 'daily_cap', JSON.stringify(d));
  });
  await t('門: **公開面が読めないのを「空いている」にしない**', () => {
    const d = decideGate({ stop: go, latestIso: null, postsLast24h: 0, now, minIntervalHours: 66, readError: 'HTTP 503' });
    assert(d.due === false, JSON.stringify(d));
    assert(d.code === 'unreadable', JSON.stringify(d));
  });
  await t('門: 試験実行（dry_run）は間隔と24時間の上限を見ない', () => {
    const d = decideGate({ stop: go, latestIso: hoursAgo(2), postsLast24h: 1, now, minIntervalHours: 66, dryRun: true });
    assert(d.due === true, JSON.stringify(d));
    assert(d.code === 'dry_run', JSON.stringify(d));
  });
  await t('門: **試験実行でも停止と「読めない」は越えない**', () => {
    const s = decideGate({ stop: { stopped: true, reason: 'test' }, latestIso: hoursAgo(99), postsLast24h: 0, now, minIntervalHours: 66, dryRun: true });
    assert(s.due === false, JSON.stringify(s));
    assert(s.code === 'stopped', JSON.stringify(s));
    const u = decideGate({ stop: go, latestIso: null, postsLast24h: 0, now, minIntervalHours: 66, dryRun: true, readError: 'HTTP 503' });
    assert(u.due === false, JSON.stringify(u));
    assert(u.code === 'unreadable', JSON.stringify(u));
  });
  await t('見張り: 経過時間の区分（80時間で注意・96時間で異常・読めないは別）', () => {
    assert(classifyAge(57) === 'ok', 'ok');
    assert(classifyAge(81) === 'warn', 'warn');
    assert(classifyAge(97) === 'alert', 'alert');
    assert(classifyAge(null) === 'unreadable', 'null');
    assert(classifyAge(Number.NaN) === 'unreadable', 'nan');
  });
  await t('見張り: この経路の記事を開示文・印で見分ける（それ以外は見分けない）', () => {
    const body = composeBody({ body_markdown: '本文', basis: 'S-20260903-x' }, 'hatena', { runId: '1', at: '2026-09-25T00:00:00Z' });
    assert(isPipelineHatena({ content: body }) === true, 'hatena footer');
    assert(isPipelineHatena({ content: '<p>普通の記事</p>' }) === false, 'hatena plain');
    const en = composeBody({ body_markdown: 'Body', basis: 'S-20260903-x' }, 'devto', { runId: '1', at: '2026-09-25T00:00:00Z' });
    assert(isPipelineDevto({ body_markdown: en }) === true, 'devto marker');
    assert(isPipelineDevto({ body_markdown: 'Body only' }) === false, 'devto plain');
    assert(isPipelineDevto(null) === false, 'devto null');
  });
  await t('停止台帳にこの経路がある', () => { readStop(); });

  await t('記事ネタ台帳を読める（実データ）', () => {
    const seeds = parseSeeds(fs.readFileSync(SEEDS_PATH, 'utf8'));
    assert(seeds.length >= 5, `種が ${seeds.length} 件`);
    assert(seeds.filter((s) => !s.id || !s.claim).length === 0, '一行の主張の無い種がある');
    assert(seeds.some((s) => seedFits(s, 'devto')) && seeds.some((s) => seedFits(s, 'hatena')), '媒体に合う種が無い');
    const ja = seeds.find((s) => /英語圏へはそのまま出さない/.test(s.raw));
    if (ja) assert(!seedFits(ja, 'devto'), '英語圏に出さない種を dev.to に使える扱いにした');
  });

  await t('数字: 出典に無い数量を見つけ、識別子・日付・年は数えない', () => {
    const q = quantities('The open rate was 83% and launch took 187 ms on iOS 26 with AES-GCM-256 on 2026-09-03, in 2026. It had 3 steps.').map((x) => x.value);
    assert(q.includes('83') && q.includes('187'), `拾えていない: ${q}`);
    assert(!q.includes('26') && !q.includes('256'), `識別子を数えた: ${q}`);
    const set = allowedNumberSet(['launch about 0.4 seconds']);
    assert(numberAllowed('0.4', set) && numberAllowed('400', set), '0.4秒と400msを同じ値として扱えない');
    assert(!numberAllowed('83', set) && numberAllowed('3', set) && numberAllowed('2026', set), '許可の境界が違う');
    const ja = quantities('開封率は83%、214件のうち51件。9月3日に出した。').map((x) => x.value);
    assert(ja.includes('83') && ja.includes('214') && !ja.includes('3'), `日本語の数量: ${ja}`);
    const w = wordQuantities('Opens rose to eighty-three percent over two hundred sends; 八十三件 と 三つ。', 'three steps');
    assert(w.includes('eighty-three') && w.some((x) => /hundred/.test(x)) && w.includes('八十三'), `字の数量を拾えない: ${w}`);
    assert(wordQuantities('three steps and 三つの型', '').length === 0, '12以下の字の数を数えた');
    assert(wordQuantities('Twenty runs', 'twenty runs were recorded').length === 0, '出典にある字の数を落とした');
  });

  await t('禁止表現: 否定の文脈は通し、肯定は落とす', () => {
    assert(bannedHits('It is not end-to-end encrypted.').length === 0, '否定文を落とした');
    assert(bannedHits('Memos are end-to-end encrypted.').some((h) => h.id === 'e2ee'), 'E2EE の肯定を通した');
    assert(bannedHits('公式の後継ではない').length === 0, '否定文（日本語）を落とした');
    assert(bannedHits('Captioの後継アプリです').some((h) => h.id === 'successor'), '後継の肯定を通した');
    assert(bannedHits("I'm a solo iOS developer building this.").some((h) => h.id === 'human-claim-en'), '本人の名乗りを通した');
    assert(bannedHits('起動0.3秒').some((h) => h.id === 'launch-0.3'), '0.3秒を通した');
  });

  await t('名乗り: 伏せた名前（ハッシュ）に当たる語を落とし、無関係な語は通す', () => {
    // 実名を書かずに検出器を試すため、架空の語のハッシュで同じ経路を通す。
    const fake = new Set([sha256('zqxname'), sha256('架空')]);
    assert(identityHits('Posted by Zqxname today', fake).length === 1, '英字の語を検出しない');
    assert(identityHits('これは架空の人名', fake).length === 1, '漢字2字窓を検出しない');
    assert(identityHits('Simple Memo developer notes', fake).length === 0, '無関係な語を検出した');
    assert(IDENTITY_HASHES.size >= 1 && [...IDENTITY_HASHES].every((h) => /^[0-9a-f]{64}$/.test(h)), '本番のハッシュ表が壊れている');
    const extra = identityHashes({ IDENTITY_DENYLIST: 'Qwxname, 架空人名' });
    assert(identityHits('by qwxname', extra).length === 1, 'Secrets から足した英字の名前を検出しない');
    assert(identityHits('これは架空人名です', extra).length >= 1 && identityHits('空人', extra).length === 1, 'Secrets から足した漢字の名前を2字窓で検出しない');
    assert(identityHashes({}).size === IDENTITY_HASHES.size, 'Secrets が無いときに表が変わった');
  });

  await t('リンク: 抽出・商用アンカー・短縮URL', () => {
    const ls = extractLinks('See [the benchmark method](https://simplememofast.com/blog/benchmark-methodology) and https://bit.ly/x.');
    assert(ls.length === 2 && ls[0].text === 'the benchmark method', JSON.stringify(ls));
    assert(COMMERCIAL_ANCHOR.test('best memo app') && !COMMERCIAL_ANCHOR.test('the benchmark methodology'), '商用アンカーの判定');
    assert(LINK_DENY.test('bit.ly') && LINK_DENY.test('apps.apple.com') && !LINK_DENY.test('developer.apple.com'), '拒否ホストの判定');
  });

  await t('題名の近さ: 同じ題を落とし、別の題は通す', () => {
    const a = titleTokens('I treated publishing as a queue. The queue lied.', 'en');
    assert(jaccard(a, titleTokens('Publishing as a queue: the queue lied', 'en')) >= 0.55, '近い題を見逃した');
    assert(jaccard(a, titleTokens('Why SpeechAnalyzer needs a warm-up pass', 'en')) < 0.55, '別の題を近いとした');
    assert(jaccard(titleTokens('【Day20】個人開発で広告を載せない理由', 'ja'), titleTokens('【開発日誌 Day20】広告を載せない個人開発の経済', 'ja')) >= 0.4, '日本語の近い題');
  });

  await t('記事の検査: 通る記事は通り、壊すと落ちる', async () => {
    const ctx = {
      platform: 'devto', used_bases: ['S-20260903-report-said-zero'],
      seeds_available: [{ id: 'S-TEST', claim: 'two hours later', numbers: ['8 days'], drafts: { en: 'The monitor closed it eleven hours later; the ledger held it 8 days.' } }],
      existing_posts: [{ title: 'I treated publishing as a queue. The queue lied.' }],
      allowed_site_links: [{ url: 'https://simplememofast.com/blog/benchmark-methodology', file: 'blog/benchmark-methodology.html' }],
    };
    ctx.seeds_available[0].id = 'S-20260903-issue-closed-same-day';
    const para = 'A close condition that nobody feeds returns cannot determine every day, and that answer never turns red. ';
    const good = {
      platform: 'devto', title: 'A close condition nobody feeds never closes', tags: ['devops', 'automation'],
      description: 'Why a safe default can hide a stuck ledger.', series: null, basis: 'S-20260903-issue-closed-same-day',
      sources: ['docs/story-seeds.md'],
      body_markdown: `${para.repeat(20)}\n\n## What happened\n\n${para.repeat(15)}\n\n## Why it stayed quiet\n\nThe ledger held it 8 days. ${para.repeat(15)}\n\n## What changed\n\nThe method is described in [the benchmark methodology](https://simplememofast.com/blog/benchmark-methodology). ${para.repeat(12)}`,
    };
    const readFile = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    const r = await validateArticle(good, ctx, { readFile });
    assert(r.ok, `通るべき記事が落ちた: ${r.problems.join(' | ')}`);
    const breakages = [
      ['出典に無い数字', (a) => { a.body_markdown += '\n\nThe open rate rose to 83%.'; }, /出典に無い数字/],
      ['使用済みの題材', (a) => { a.basis = 'S-20260903-report-said-zero'; }, /使用済み/],
      ['候補に無い自社リンク', (a) => { a.body_markdown += ' See [this](https://simplememofast.com/nope/).'; }, /リンク候補/],
      ['自社リンクなし', (a) => { a.body_markdown = a.body_markdown.replace(/\[the benchmark methodology\]\([^)]+\)/, 'the benchmark methodology'); }, /自社サイトへのリンクが 0 本/],
      ['本人の名乗り', (a) => { a.body_markdown += "\n\nI'm a solo developer and I built my app."; }, /禁止表現|一人称/],
      ['既存と同じ題', (a) => { a.title = 'I treated publishing as a queue. The queue lied.'; }, /題名が近い/],
      ['旧アプリ名', (a) => { a.body_markdown += '\n\nCaptio式シンプルメモ is the app.'; }, /旧アプリ名|事実検査/],
      ['見出し不足', (a) => { a.body_markdown = a.body_markdown.replace(/^## .*$/gm, ''); }, /見出し/],
      ['App Store 直リンク', (a) => { a.body_markdown += ' [app](https://apps.apple.com/app/id6758438948)'; }, /使わないリンク先/],
      ['題材の記録を本文に書いた', (a) => { a.body_markdown += '\n\n題材の記録: S-20260903-report-said-zero'; }, /題材の記録は投稿時に付ける/],
    ];
    for (const [name, mutate, expect] of breakages) {
      const copy = JSON.parse(JSON.stringify(good)); mutate(copy);
      const res = await validateArticle(copy, ctx, { readFile });
      assert(res.ok === false, `「${name}」で落ちない（ok のまま）`);
      assert(res.problems.some((p) => expect.test(p)), `「${name}」で期待した理由で落ちない: ${res.problems.join(' | ')}`);
    }
  });

  await t('公開確認: dofollow は通し、nofollow・noindex・本文なしは落とす', () => {
    const page = (rel, robots = 'max-snippet:-1') => `<html><head><meta name="robots" content="${robots}"><title>T</title></head><body><h1>Hello title</h1><div id="article-body"><p><a href="https://simplememofast.com/obsidian/" ${rel}>x</a></p></div></article></body></html>`;
    assert(inspectPublished(page('rel="noopener noreferrer"'), 'devto', { title: 'Hello title' }).ok, 'dofollow を落とした');
    assert(!inspectPublished(page('rel="noopener nofollow"'), 'devto', { title: 'Hello title' }).ok, 'nofollow を通した');
    assert(!inspectPublished(page('', 'noindex'), 'devto', { title: 'Hello title' }).ok, 'noindex を通した');
    assert(!inspectPublished('<html><body>no body</body></html>', 'devto', {}).ok, '本文が取れないのに通した');
    const hatena = `<div class="entry-content hatenablog-entry"><p><a href="https://simplememofast.com/">a</a></p></div><div class="entry-footer">`;
    assert(inspectPublished(hatena, 'hatena', {}).ok, 'はてなの dofollow を落とした');
  });

  await t('投稿本文: 開示文と印を必ず付ける', () => {
    const b = composeBody({ body_markdown: 'Body', basis: 'S-X' }, 'devto', { runId: '1', at: 'T' });
    assert(b.includes('autonomously by an AI agent') && readMarkers(b)[0]?.basis === 'S-X', b);
    const h = composeBody({ body_markdown: '本文', basis: 'page:x.html' }, 'hatena', { runId: '1', at: 'T' });
    assert(h.includes('AIエージェントが自動で執筆') && readMarkers(h)[0]?.basis === 'page:x.html', h);
    const xml = hatenaEntryXml({ title: 'A&B <x>', body: h, categories: ['iOS'], author: 'a' });
    assert(xml.includes('A&amp;B &lt;x&gt;') && xml.includes('<app:draft>no</app:draft>') && xml.includes('text/x-markdown'), xml);
  });

  await t('はてなの認証ヘッダ（Basic と WSSE）', () => {
    const b = hatenaAuthHeaders('user', 'k', 'basic');
    assert(b.authorization === 'Basic ' + Buffer.from('user:k').toString('base64'), 'Basic の形');
    const w = hatenaAuthHeaders('user', 'k', 'wsse', { nonce: Buffer.from('0123456789abcdef'), created: '2026-09-24T00:00:00Z' });
    const expect = crypto.createHash('sha1').update(Buffer.concat([Buffer.from('0123456789abcdef'), Buffer.from('2026-09-24T00:00:00Zk')])).digest('base64');
    assert(w['x-wsse'].includes(`PasswordDigest="${expect}"`) && w['x-wsse'].includes('Username="user"'), w['x-wsse']);
  });

  await t('はてなのフィードを読める形', () => {
    const e = parseAtomFeed('<feed><entry><title>題 &amp; 名</title><link rel="alternate" type="text/html" href="https://x/entry/1"/><published>2026-09-22T21:29:55+09:00</published><content type="html">&lt;p&gt;本文&lt;/p&gt;&lt;!-- devlog-syndication: basis=S-A; route=actions --&gt;</content></entry></feed>');
    assert(e.length === 1 && e[0].title === '題 & 名' && e[0].url === 'https://x/entry/1', JSON.stringify(e));
    assert(readMarkers(e[0].content)[0]?.basis === 'S-A', '印を読めない');
    assert(e[0].draft === null, '公開フィードに無い下書き欄を「公開済み」と読んだ');
    const ap = parseAtomFeed('<feed><entry xmlns:app="x"><title>T</title><link rel="alternate" type="text/html" href="https://x/1"/><app:control><app:draft>yes</app:draft></app:control></entry></feed>');
    assert(ap.length === 1 && ap[0].draft === true, `AtomPub の下書きを読めない: ${JSON.stringify(ap)}`);
  });
  await t('dev.to の AI 開示: 応答の値を使い、作成直後の 404 は待って読み直し、PUT の応答でも確かめる', async () => {
    const orig = globalThis.fetch;
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const noWait = async () => {};
    try {
      globalThis.fetch = async () => { throw new Error('応答に値があるのに読みに行った'); };
      assert(await ensureDevtoDisclosure(1, { accept: 'a' }, 'u', { known: 'fully_autonomous', wait: noWait }) === 'response', '応答の値を使わない');
      let n = 0;
      globalThis.fetch = async () => (++n === 1 ? new Response('not found', { status: 404 }) : json({ ai_disclosure_level: 'fully_autonomous' }));
      assert(await ensureDevtoDisclosure(2, { accept: 'a' }, 'u', { wait: noWait }) === 'read', '作成直後の 404 を待てない');
      globalThis.fetch = async (u, o) => (o?.method === 'PUT' ? json({ ai_disclosure_level: 'fully_autonomous' }) : json({ ai_disclosure_level: 'not_disclosed' }));
      assert(await ensureDevtoDisclosure(3, { accept: 'a' }, 'u', { wait: noWait }) === 'put', 'PUT の応答で確かめない');
      globalThis.fetch = async () => json({ ai_disclosure_level: 'not_disclosed' });
      let threw = false;
      try { await ensureDevtoDisclosure(4, { accept: 'a' }, 'u', { wait: noWait }); } catch { threw = true; }
      assert(threw, '**付け直しても未開示のまま通した**');
      globalThis.fetch = async () => new Response('not found', { status: 404 });
      threw = false;
      try { await ensureDevtoDisclosure(5, { accept: 'a' }, 'u', { wait: noWait, attempts: 3 }); } catch { threw = true; }
      assert(threw, '404 が続くのに通した');
    } finally {
      globalThis.fetch = orig;
    }
  });
  await t('公開確認: 本文末尾の印が公開面に残っているかを返す（失敗にはしない）', () => {
    const body = (inner) => `<html><head></head><body><div class="entry-content"><p>本文 <a href="https://simplememofast.com/">ページ</a></p>${inner}</div><div class="entry-footer"></div></body></html>`;
    const withMarker = inspectPublished(body('<!-- devlog-syndication: basis=S-A; route=actions -->'), 'hatena');
    assert(withMarker.markerVisible === true && withMarker.ok === true, JSON.stringify(withMarker));
    const without = inspectPublished(body(''), 'hatena');
    assert(without.markerVisible === false && without.ok === true, `印が無いだけで公開の失敗にした: ${JSON.stringify(without)}`);
  });
  await t('はてなの公開フィードの実際の形（rel の無い link）から URL を読む', () => {
    // 2026-09-26 に公開フィードで実測した形。rel も type も無く、画像の enclosure が後ろに並ぶ
    const pub = parseAtomFeed('<feed><entry><title>Day21</title><link href="https://simplememofast.hatenablog.com/entry/2026/09/25/213405"/><link rel="enclosure" href="https://ogimage.example/1" type="image/png" length="0" /><published>2026-09-25T21:34:05+09:00</published></entry></feed>');
    assert(pub[0].url === 'https://simplememofast.hatenablog.com/entry/2026/09/25/213405', `公開フィードの URL を読めない: ${JSON.stringify(pub)}`);
    // AtomPub の応答：edit の link が先に来ても alternate を選ぶ
    assert(entryAlternateUrl('<entry><link rel="edit" href="https://blog.hatena.ne.jp/x/atom/entry/1"/><link rel="alternate" type="text/html" href="https://b.example/entry/2"/></entry>') === 'https://b.example/entry/2', 'edit を選んだ');
    // 属性の順番が違っても読む
    assert(entryAlternateUrl('<link href="https://c.example/entry/3" type="text/html" rel="alternate" />') === 'https://c.example/entry/3', '属性の順番で読めない');
    // alternate が無ければ null（**enclosure や edit を公開URLにしない**）
    assert(entryAlternateUrl('<entry><link rel="edit" href="https://e/1"/><link rel="enclosure" href="https://img/1" type="image/png"/></entry>') === null, 'alternate でない link を選んだ');
  });

  await t('見張り: この run の投稿を公開一覧に合流させる（試験実行・他媒体・重複は足さない）', () => {
    const list = [{ id: 1, title: '旧', url: 'https://dev.to/simple_memo/old-1', published_at: hoursAgo(122) }];
    const just = [
      { platform: 'devto', id: 9, title: '新', url: 'https://dev.to/simple_memo/new-9', published_at: hoursAgo(0.02) },
      { platform: 'devto', dry_run: true, title: '試験' },
      { platform: 'hatena', title: 'は', url: 'https://h/1', published_at: hoursAgo(0.02) },
      { platform: 'devto', id: 1, title: '旧', url: 'https://dev.to/simple_memo/old-1', published_at: hoursAgo(0.01) },
    ];
    const m = mergeJustPublished(list, just, 'devto');
    assert(m.length === 2 && m[1].id === 9 && m[1].fromRun === true, `合流の形: ${JSON.stringify(m)}`);
    assert(m[0].published_at === list[0].published_at, '一覧にある記事を投稿の結果で上書きした');
    assert(mergeJustPublished(list, null, 'devto').length === 1, '結果が無いときに一覧を変えた');
  });
  await t('見張り: **投稿の直後（公開一覧が古い）でも、この run の投稿で数えて赤くしない**', async () => {
    const orig = globalThis.fetch;
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const page = '<html><head><meta name="robots" content="max-snippet:-1"></head><body><h1>新しい記事</h1><div id="article-body"><p><a href="https://simplememofast.com/en/" rel="noopener noreferrer">x</a></p></div></article></body></html>';
    let articleReads = 0;
    const just = [{ platform: 'devto', id: 9, title: '新しい記事', url: 'https://dev.to/simple_memo/new-9', published_at: hoursAgo(0.02) }];
    const opts = { ...WATCH, wait: async () => {} };
    try {
      globalThis.fetch = async (u) => {
        u = String(u);
        if (u.includes('/api/articles?username=')) return json([{ id: 1, title: '旧', url: 'https://dev.to/simple_memo/old-1', published_at: hoursAgo(122) }]);
        if (u.endsWith('/api/articles/9')) return ++articleReads === 1 ? new Response('not found', { status: 404 }) : json({ body_markdown: `x <!-- ${MARKER}: basis=S-A -->`, ai_disclosure_level: 'fully_autonomous' });
        if (u.endsWith('/api/articles/1')) return json({ body_markdown: '旧', ai_disclosure_level: 'not_disclosed' });
        if (u === 'https://dev.to/simple_memo/new-9') return new Response(page, { status: 200 });
        throw new Error(`想定外の取得: ${u}`);
      };
      const before = await watchPlatform('devto', now, { ...opts }, go);
      assert(before.status === 'alert', `この run の投稿を渡さないと古い一覧で異常になる、という前提が崩れた: ${before.status}`);
      articleReads = 0;
      const after = await watchPlatform('devto', now, { ...opts, justPublished: just }, go);
      assert(after.status === 'ok', `この run の投稿を渡しても赤い: ${after.status} ${JSON.stringify(after.problems)}`);
      assert(after.age_hours < 1 && after.pipeline_latest?.url === just[0].url && after.pipeline_latest.from_run === true, JSON.stringify(after));
      assert(articleReads === 2, `作成直後の 404 を待って読み直していない（読んだ回数 ${articleReads}）`);
    } finally {
      globalThis.fetch = orig;
    }
  });
  await t('見張り: dev.to の他経路の新しい投稿で、自経路の停滞・欠測を隠さない（停止・80/96h境界も保持）', async () => {
    const orig = globalThis.fetch;
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json', age: '0' } });
    const post = (id, hours, own = false) => ({ id, title: `記事 ${id}`, url: `https://dev.to/simple_memo/post-${id}`,
      published_at: hoursAgo(hours), own });
    let lookedUp = [];
    const observe = async (posts, { stopped = false, scan = WATCH.scan, unreadableIds = [], missingBodyIds = [] } = {}) => {
      lookedUp = [];
      globalThis.fetch = async (u, o) => {
        assert(!o?.method || o.method === 'GET', '見張りが外部を書き換えた');
        u = String(u);
        if (u.includes('/api/articles?username=')) return json(posts);
        const item = posts.find((p) => u.endsWith(`/api/articles/${p.id}`));
        if (item) {
          lookedUp.push(item.id);
          if (unreadableIds.includes(item.id)) return new Response('not found', { status: 404 });
          if (missingBodyIds.includes(item.id)) return json({ ai_disclosure_level: 'fully_autonomous' });
          return json({ body_markdown: item.own ? `<!-- ${MARKER}: basis=S-A; route=actions; run=manual-fixture -->` : '別経路',
            ai_disclosure_level: 'fully_autonomous' });
        }
        const page = posts.find((p) => p.url === u);
        if (page) return new Response(`<html><head></head><body><h1>${page.title}</h1><div id="article-body"><a href="https://simplememofast.com/">x</a></div></article></body></html>`);
        throw new Error(`想定外の取得: ${u}`);
      };
      return watchPlatform('devto', now, { ...WATCH, scan, wait: async () => {} }, { stopped, reason: stopped ? 'test stop' : null });
    };
    try {
      const stale = await observe([post(1, 20), post(2, 14 * 24, true)]);
      assert(stale.status === 'alert' && stale.age_hours === 20 && stale.pipeline_age_hours === 336 && stale.pipeline_age_status === 'alert', JSON.stringify(stale));
      assert(stale.problems.some((p) => p.includes('この経路の最新投稿から')), '自経路の停滞の理由が無い');
      // 印は公開出力の証拠だけ。手動 run の印でも、自然 schedule / 人介入ゼロを推定しない。
      assert(!('event' in stale.pipeline_latest) && !('human_interventions' in stale.pipeline_latest), '公開の印から実行方式を推定した');
      for (const [hours, expected] of [[70, 'ok'], [80, 'ok'], [80.1, 'warn'], [96, 'warn'], [96.1, 'alert']]) {
        const r = await observe([post(1, 20), post(2, hours, true)]);
        assert(r.status === expected && r.pipeline_age_status === expected && r.pipeline_age_hours === hours, `境界 ${hours}: ${JSON.stringify(r)}`);
      }
      const stopped = await observe([post(1, 20), post(2, 336, true)], { stopped: true });
      assert(stopped.status === 'ok' && stopped.pipeline_age_hours === 336 && stopped.pipeline_age_status === 'stopped' && !stopped.problems.length, JSON.stringify(stopped));
      const bounded = await observe([post(1, 20), post(2, 30), post(3, 336, true)], { scan: 2 });
      assert(bounded.status === 'unknown' && bounded.pipeline_age_hours === null && bounded.pipeline_age_reason.includes('全履歴の未投稿とは判定しない'), JSON.stringify(bounded));
      assert(!lookedUp.includes(3), '走査上限外の履歴を確認済みにした');
      const newerUnknown = await observe([post(1, 20), post(2, 336, true)], { unreadableIds: [1] });
      assert(newerUnknown.status === 'unreadable' && newerUnknown.pipeline_age_status === 'unknown' && newerUnknown.pipeline_age_hours === null && newerUnknown.pipeline_age_reason.includes('より新しい記事'), JSON.stringify(newerUnknown));
      assert(!newerUnknown.problems.some((p) => p.includes('配信が停滞')), 'より新しい経路が不明なのに、古い確認済み記事で停滞を断定した');
      const missingBody = await observe([post(1, 20), post(2, 336, true)], { missingBodyIds: [1] });
      assert(missingBody.pipeline_age_status === 'unknown' && missingBody.pipeline_age_hours === null && missingBody.problems.some((p) => p.includes('記事本文を読めない')), '本文の欠測を別経路の記事として数えた');
      const olderUnknown = await observe([post(1, 20, true), post(2, 336)], { unreadableIds: [2] });
      assert(olderUnknown.pipeline_age_status === 'ok' && olderUnknown.pipeline_age_hours === 20, '古い記事の欠測で確認済みの自経路最新を失った');
      const undated = await observe([post(1, 20), { ...post(2, 336, true), published_at: null }]);
      assert(undated.pipeline_age_status === 'unknown' && undated.pipeline_age_hours === null && undated.pipeline_age_reason.includes('公開日時'), JSON.stringify(undated));
      for (const published_at of [true, 123, '2026-02-31T00:00:00Z', '', '2026-09-23T16:00:00', '2026-09-23T16:00:00+24:00']) {
        const invalid = await observe([post(1, 20), { ...post(2, 336, true), published_at }]);
        assert(invalid.status === 'unknown' && invalid.age_hours === 20 && invalid.pipeline_latest === null && invalid.pipeline_age_hours === null && invalid.pipeline_age_reason.includes('公開日時'), `無効日時 ${String(published_at)}: ${JSON.stringify(invalid)}`);
        assert(!lookedUp.includes(2), '無効な日時の記事を並べて、自経路の最新として確認した');
      }
      const offset = await observe([{ ...post(1, 24, true), published_at: '2026-09-23T21:00:00+09:00' }]);
      assert(offset.status === 'ok' && offset.age_hours === 24 && offset.pipeline_age_hours === 24, 'timezone付きの実在する日時を落とした');
      const future = await observe([post(1, -1, true)]);
      assert(future.status === 'unknown' && future.pipeline_age_hours === null && future.pipeline_age_reason.includes('未来'), JSON.stringify(future));
    } finally {
      globalThis.fetch = orig;
    }
  });
  await t('見張り: はてなもアカウントと自経路を分け、確認範囲に無い経路は unknown（停止免除）', async () => {
    const orig = globalThis.fetch;
    let current = [];
    const post = (id, hours, own = false) => ({ id, title: `記事 ${id}`, url: `https://simplememofast.hatenablog.com/entry/${id}`,
      published_at: hoursAgo(hours), own });
    try {
      globalThis.fetch = async (u, o) => {
        assert(!o?.method || o.method === 'GET', '見張りが外部を書き換えた');
        if (String(u).includes('/feed?')) return new Response(`<feed>${current.map((p) => `<entry><title>${p.title}</title><link href="${p.url}"/><published>${p.published_at}</published><content type="html">${p.missingBody ? '' : p.own ? '&lt;!-- devlog-syndication: basis=S-A; route=actions --&gt;' : '別経路'}</content></entry>`).join('')}</feed>`, { headers: { age: '0' } });
        const p = current.find((p) => p.url === String(u));
        if (p) return new Response(`<html><body><h1>${p.title}</h1><div class="entry-content"><a href="https://simplememofast.com/">x</a></div><div class="entry-footer"></div></body></html>`);
        throw new Error(`想定外の取得: ${u}`);
      };
      const opts = { ...WATCH, wait: async () => {} };
      current = [post(1, 20), post(2, 336, true)];
      const stale = await watchPlatform('hatena', now, opts, go);
      assert(stale.status === 'alert' && stale.age_hours === 20 && stale.pipeline_age_hours === 336, JSON.stringify(stale));
      const stopped = await watchPlatform('hatena', now, opts, { stopped: true, reason: 'test stop' });
      assert(stopped.status === 'ok' && stopped.pipeline_age_status === 'stopped', JSON.stringify(stopped));
      current = [post(1, 20, true)];
      assert((await watchPlatform('hatena', now, opts, go)).status === 'ok', '新しい自経路を異常にした');
      current = [post(1, 20)];
      const missing = await watchPlatform('hatena', now, opts, go);
      assert(missing.status === 'unknown' && missing.pipeline_age_hours === null && missing.pipeline_age_reason.includes('公開証拠を確認できない'), JSON.stringify(missing));
      current = [{ ...post(1, 20), missingBody: true }, post(2, 336, true)];
      const missingBody = await watchPlatform('hatena', now, opts, go);
      assert(missingBody.status === 'unreadable' && missingBody.pipeline_age_status === 'unknown' && missingBody.pipeline_age_hours === null, 'はてな本文の欠測を別経路の記事として数えた');
    } finally {
      globalThis.fetch = orig;
    }
  });
  await t('投稿: **直前に認証済みの一覧で門を確かめ直し（24時間の上限・間隔）、作成は 5xx で送り直さない**', async () => {
    const orig = globalThis.fetch;
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const noWait = async () => {};
    const art = { title: '今回の記事', tags: ['a'] };
    let posts = 0;
    const devto = (mine, postReplies) => async (u, o) => {
      if (String(u).includes('/api/articles/me/all')) return json(mine);
      if (o?.method === 'POST') { const r = postReplies[posts++]; return typeof r === 'number' ? new Response('x', { status: r }) : json(r, 201); }
      throw new Error(`想定外の取得: ${u}`);
    };
    const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
    try {
      posts = 0;
      globalThis.fetch = devto([{ title: '別の記事', published: true, published_at: hoursAgo(2), url: 'https://dev.to/x' }], []);
      const cap = await threw(() => publishDevto(art, 'k', 'b', { now, wait: noWait }));
      assert(cap && cap.includes('24時間') && posts === 0, `**公開一覧が古いときに連投した**（${cap} / POST ${posts} 回）`);
      posts = 0;
      globalThis.fetch = devto([{ id: 5, title: '今回の記事', published: true, published_at: hoursAgo(2), url: 'https://dev.to/same', ai_disclosure_level: 'fully_autonomous' }], []);
      const same = await publishDevto(art, 'k', 'b', { now, wait: noWait });
      assert(same.reused === true && posts === 0, `同題の採用が上限より先に効かない: ${JSON.stringify(same)}`);
      posts = 0;
      posts = 0;
      globalThis.fetch = devto([{ title: '30時間前', published: true, published_at: hoursAgo(30), url: 'https://dev.to/y' }], [{ id: 8, url: 'https://dev.to/new-8', ai_disclosure_level: 'fully_autonomous' }]);
      const gap = await threw(() => publishDevto(art, 'k', 'b', { now, wait: noWait }));
      assert(gap && gap.includes('66 時間未満') && posts === 0, `**間隔の足りない投稿を出した**（${gap} / POST ${posts} 回）`);
      const forced = await publishDevto(art, 'k', 'b', { now, wait: noWait, force: true });
      assert(forced.id === 8 && posts === 1, `force で間隔を越えられない: ${JSON.stringify(forced)}`);
      posts = 0;
      globalThis.fetch = devto([{ title: '古い記事', published: true, published_at: hoursAgo(70) }, { title: '下書き', published: false, published_at: null }], [502]);
      const e5 = await threw(() => publishDevto(art, 'k', 'b', { now, wait: noWait }));
      assert(e5 && posts === 1, `**作成の 5xx を送り直した**（POST ${posts} 回 / ${e5}）`);
      posts = 0;
      globalThis.fetch = devto([{ title: '古い記事', published: true, published_at: hoursAgo(70) }], [429, { id: 7, url: 'https://dev.to/new-7', ai_disclosure_level: 'fully_autonomous' }]);
      const ok = await publishDevto(art, 'k', 'b', { now, wait: noWait });
      assert(ok.id === 7 && ok.reused === false && posts === 2, `429 は待って送り直す: ${JSON.stringify(ok)} / POST ${posts} 回`);
      posts = 0;
      globalThis.fetch = devto([], [{ id: 9, url: 'https://dev.to/new-9', ai_disclosure_level: 'fully_autonomous' }]);
      const empty = await threw(() => publishDevto(art, 'k', 'b', { now, wait: noWait }));
      assert(empty && posts === 0, `**空の一覧を「投稿が無い」と読んで出した**（POST ${posts} 回）`);

      const feed = (published, draft = 'no') => `<feed><entry><title>前の記事</title><link rel="alternate" type="text/html" href="https://simplememofast.hatenablog.com/entry/1"/><published>${published}</published><app:control><app:draft>${draft}</app:draft></app:control></entry></feed>`;
      let hPosts = 0;
      const hatena = (xml, postStatus) => async (u, o) => {
        if (o?.method === 'POST') { hPosts++; return new Response('x', { status: postStatus }); }
        return new Response(xml, { status: 200 });
      };
      globalThis.fetch = hatena(feed(hoursAgo(3)), 201);
      const hcap = await threw(() => publishHatena(art, 'k', 'b', { now }));
      assert(hcap && hcap.includes('24時間') && hPosts === 0, `**はてなで公開フィードが古いときに連投した**（${hcap} / POST ${hPosts} 回）`);
      hPosts = 0;
      globalThis.fetch = hatena('<feed></feed>', 201);
      const hEmpty = await threw(() => publishHatena(art, 'k', 'b', { now }));
      assert(hEmpty && hPosts === 0, `**はてなの空の一覧を「投稿が無い」と読んで出した**（POST ${hPosts} 回）`);
      hPosts = 0;
      globalThis.fetch = hatena(feed(hoursAgo(3), 'yes'), 500);
      const h5 = await threw(() => publishHatena(art, 'k', 'b', { now }));
      assert(h5 && hPosts === 1, `下書きを上限に数えた、または作成の 5xx を送り直した（${h5} / POST ${hPosts} 回）`);
    } finally {
      globalThis.fetch = orig;
    }
  });

  await t('公開面: **キャッシュを通さずに読み、古い応答（age が上限超）は読めないにする**', async () => {
    const orig = globalThis.fetch;
    const seen = [];
    const reply = (age, body) => { const h = { 'content-type': 'application/json' }; if (age !== null) h.age = String(age); return new Response(body, { status: 200, headers: h }); };
    const devList = JSON.stringify([{ id: 1, title: 't', url: 'https://dev.to/u/1', published_at: '2026-09-29T11:26:13Z' }]);
    const feed = '<feed><entry><title>t</title><link href="https://simplememofast.hatenablog.com/entry/1"/><published>2026-09-29T20:00:00+09:00</published></entry></feed>';
    let age = 0;
    try {
      globalThis.fetch = async (u, o) => { seen.push({ u: String(u), origin: o?.headers?.origin }); return reply(age, String(u).includes('dev.to') ? devList : feed); };
      await publicPosts('devto'); await publicPosts('devto');
      const [a, b] = seen.slice(-2);
      assert(a.origin && b.origin && a.origin !== b.origin && /^https:\/\/fresh-[0-9a-f]{12}\.invalid$/.test(a.origin), `dev.to の読み取りが毎回別の Origin でない: ${JSON.stringify([a, b])}`);
      await publicPosts('hatena'); await publicPosts('hatena');
      const [c, d] = seen.slice(-2);
      assert(c.u.startsWith(`${PLATFORMS.hatena.feedUrl}?fresh=`) && c.u !== d.u, `はてなの読み取りが毎回別のクエリでない: ${JSON.stringify([c, d])}`);
      age = 92695;
      let msg = null;
      try { await publicPosts('devto'); } catch (e) { msg = e.message; }
      assert(msg && msg.includes('古い'), `**25.7時間前のキャッシュを受け入れた**: ${msg}`);
      age = 6206; msg = null;
      try { await publicPosts('hatena'); } catch (e) { msg = e.message; }
      assert(msg && msg.includes('古い'), `はてなの古いキャッシュを受け入れた: ${msg}`);
      age = null;
      assert((await publicPosts('devto')).length === 1, 'age の無い応答を読めない');
    } finally {
      globalThis.fetch = orig;
    }
  });

  await t('はてな: **HTML コメントが消えても、見える記録から題材を読む**（2026-09-29 の実測の形）', () => {
    const body = composeBody({ body_markdown: '本文', basis: 'S-20260907-fixed-but-unconfirmed' }, 'hatena', { runId: '1', at: 'T' });
    assert(body.includes(`*${VISIBLE_BASIS_LABEL}: S-20260907-fixed-but-unconfirmed*`), `見える記録が付かない: ${body}`);
    // はてなの描画を模す: HTML コメントを消し、*…* を <em> にする（実際の公開フィードの末尾は <p><em>…</em></p>）
    const rendered = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\*([^*\n]+)\*/g, '<p><em>$1</em></p>');
    assert(!rendered.includes(`${MARKER}:`), '模した描画に印が残っている（検査の前提が崩れた）');
    assert(hatenaBases({ url: 'https://x/entry/new', content: rendered }).join() === 'S-20260907-fixed-but-unconfirmed', `コメントが消えた本文から題材を読めない: ${rendered}`);
    const page = `<html><head></head><body><div class="entry-content">${rendered}<a href="https://simplememofast.com/">x</a></div><div class="entry-footer"></div></body></html>`;
    assert(inspectPublished(page, 'hatena').markerVisible === true, '見える記録を「印が無い」と読んだ');
    assert(hatenaBases({ url: 'https://simplememofast.hatenablog.com/entry/2026/09/29/211832', content: '<p>印の無い本文</p>' }).join() === 'S-20260907-fixed-but-unconfirmed', '見える記録より前の記事の題材を引き当てられない');
    assert(hatenaBases({ url: 'https://x/entry/other', content: '<p>印の無い本文</p>' }).length === 0, '印の無い記事に題材を作った');
    assert(hatenaBases({ url: 'https://x/entry/p', content: `<p><em>${VISIBLE_BASIS_LABEL}: page:en/autopilot/index.html</em></p>` }).join() === 'page:en/autopilot/index.html', 'page: の題材を読めない');
    const en = composeBody({ body_markdown: 'Body', basis: 'S-X' }, 'devto', { runId: '1', at: 'T' });
    assert(!en.includes(VISIBLE_BASIS_LABEL), 'dev.to に見える記録を付けた（dev.to は API の本文で印を読める）');
  });

  await t('リンク候補: sitemap の URL を手元のファイルに引き当てられる（実データ）', () => {
    for (const p of Object.keys(PLATFORMS)) {
      const ls = allowedLinks(p);
      assert(ls.length >= 50, `${p}: 候補が ${ls.length} 件`);
      assert(ls.every((l) => l.url.startsWith('https://simplememofast.com/') && l.file), `${p}: 引き当てられない URL`);
    }
  });

  let failed = 0;
  for (const [name, ok, msg] of results) {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${msg}`}`);
    if (!ok) failed++;
  }
  console.log(failed ? `\n自己テスト: ${failed} 件失敗` : `\n自己テスト: ${results.length} 件すべて通過`);
  return failed;
}

// ─────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const commands = { gate: cmdGate, context: cmdContext, validate: cmdValidate, publish: cmdPublish, verify: cmdVerify, watch: cmdWatch };
  (async () => {
    if (cmd === '--selftest') { process.exitCode = (await selftest()) ? 1 : 0; return; }
    if (!commands[cmd]) {
      console.error('使い方: gate | context | validate | publish | verify | watch | --selftest（詳細は冒頭のコメント）');
      process.exitCode = 2;
      return;
    }
    await commands[cmd](argv.slice(1));
  })().catch((e) => { console.error(`エラー: ${e.message}`); process.exitCode = 1; });
}
