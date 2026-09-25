#!/usr/bin/env node
/**
 * 開発記録の外部ブログ配信（dev.to / はてなブログ）— 門・文脈・検証・投稿・公開確認。
 *
 *   node scripts/devlog-syndication.mjs gate     --platform devto|hatena [--force] [--github-output FILE]
 *   node scripts/devlog-syndication.mjs context  --platform P --out FILE
 *   node scripts/devlog-syndication.mjs validate --platform P --article FILE --context FILE [--report FILE] [--offline]
 *   node scripts/devlog-syndication.mjs publish  --platform P --article FILE --context FILE --out FILE [--dry-run]
 *   node scripts/devlog-syndication.mjs verify   --platform P --published FILE [--summary FILE]
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

/** 取得は必ず理由つきで失敗させる。**読めなかったを「無かった」にしない。** */
export async function fetchWithRetry(url, { method = 'GET', headers = {}, body, retries = 2, timeoutMs = 30000,
  okStatuses = null, redirect = 'follow' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: { 'user-agent': UA, ...headers }, body, signal: ctrl.signal, redirect });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${method} ${url} → HTTP ${res.status}`);
        const wait = Number(res.headers.get('retry-after')) || (5 * (attempt + 1));
        if (attempt < retries) { await sleep(Math.min(wait, 60) * 1000); continue; }
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
      if (attempt < retries) { await sleep(3000 * (attempt + 1)); continue; }
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
export function decideGate({ stop, latestIso, postsLast24h, now, minIntervalHours, force = false, readError = null }) {
  if (stop?.stopped) return { due: false, code: 'stopped', reason: stop.reason };
  if (readError) return { due: false, code: 'unreadable', reason: `公開面の最新投稿を読めない: ${readError}` };
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

/** dev.to の公開一覧（キー不要）。 */
async function devtoPublicPosts() {
  const list = await fetchJson(PLATFORMS.devto.listUrl, { headers: { accept: 'application/vnd.forem.api-v1+json' } });
  if (!Array.isArray(list)) throw new Error('dev.to の一覧が配列でない');
  return list.map((a) => ({
    id: a.id, title: a.title, url: a.url, published_at: a.published_timestamp || a.published_at,
    tags: a.tag_list || [], description: a.description || '',
  }));
}

/** はてなブログの公開フィード（キー不要・最新30件）。 */
export function parseAtomFeed(xml) {
  const entries = [];
  for (const m of String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = decodeEntities((/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1] || '').trim();
    const url = (/<link rel="alternate" type="text\/html" href="([^"]+)"/.exec(e)
      || /<link rel="alternate" href="([^"]+)"/.exec(e) || [])[1] || null;
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
  const xml = await fetchText(PLATFORMS.hatena.feedUrl);
  const entries = parseAtomFeed(xml);
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
    force: argv.includes('--force'), readError });
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

/** 本文に埋めた印（`<!-- devlog-syndication: basis=...; ... -->`）を読む。 */
export function readMarkers(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/<!--\s*devlog-syndication:([^>]*?)-->/g)) {
    const fields = Object.fromEntries(m[1].split(';').map((kv) => kv.trim().split('=').map((s) => s.trim())).filter((kv) => kv.length === 2 && kv[0]));
    out.push(fields);
  }
  return out;
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
      for (const mk of readMarkers(p.content)) if (mk.basis) bases.add(mk.basis);
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
  return `${String(article.body_markdown).trim()}${cfg.footer}\n${marker}\n`;
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
async function ensureDevtoDisclosure(id, headers, url) {
  const read = async () => (await fetchJson(PLATFORMS.devto.articleApi(id), { headers: { accept: headers.accept } })).ai_disclosure_level;
  let level = await read();
  if (level === 'fully_autonomous') return;
  await fetchWithRetry(`https://dev.to/api/articles/${id}`, { method: 'PUT', headers,
    body: JSON.stringify({ article: { ai_disclosure_level: 'fully_autonomous' } }), okStatuses: [200] });
  level = await read();
  if (level !== 'fully_autonomous') {
    throw new Error(`AI 開示を確認できない（ai_disclosure_level=${level}）— 記事は公開されているので人が確認する: ${url}`);
  }
}

async function publishDevto(article, key, body) {
  const headers = { 'api-key': key, accept: 'application/vnd.forem.api-v1+json', 'content-type': 'application/json' };
  // 冪等: 同じ題名が直近にあれば作らない（応答が失われた前回の投稿を二重に出さない）
  const mine = await fetchJson('https://dev.to/api/articles/me/all?per_page=30', { headers });
  const same = mine.find((a) => a.title === article.title);
  if (same) {
    // 公開済みの同題 = 応答が失われた前回の投稿。作り直さずに採用する。
    // **下書きの同題は公開しない。**中身が今回の記事と同じ保証が無い（古い重複下書きが実在する）。
    if (same.published !== true) {
      throw new Error(`同じ題名の下書きが dev.to にある（id ${same.id}）。中身が同じか分からないので公開も新規投稿もしない — 人が確認する`);
    }
    await ensureDevtoDisclosure(same.id, headers, same.url);
    return { id: same.id, url: same.url, reused: true };
  }
  const payload = { article: {
    title: article.title, body_markdown: body, published: true, tags: article.tags,
    description: article.description || undefined, series: article.series || undefined,
    ai_disclosure_level: 'fully_autonomous',
  } };
  const res = await fetchWithRetry('https://dev.to/api/articles', { method: 'POST', headers, body: JSON.stringify(payload), okStatuses: [200, 201], retries: 1 });
  const a = await res.json();
  if (!a.url) throw new Error(`dev.to の応答に url が無い: ${JSON.stringify(a).slice(0, 300)}`);
  await ensureDevtoDisclosure(a.id, headers, a.url);
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
  for (const mode of ['basic', 'wsse']) {
    try {
      return await fetchWithRetry(url, { ...opts, headers: { ...(opts.headers || {}), ...hatenaAuthHeaders(cfg.hatenaId, key, mode) }, okStatuses, retries: 1 });
    } catch (e) {
      if (e.status === 401 && mode === 'basic') continue;
      throw e;
    }
  }
  throw new Error('はてなの認証が Basic でも WSSE でも通らない');
}

async function publishHatena(article, key, body) {
  const cfg = PLATFORMS.hatena;
  // 冪等: 直近7件に同じ題名があれば作らない
  const listXml = await (await hatenaRequest(cfg.atomUrl, key, { method: 'GET' }, [200])).text();
  for (const e of parseAtomFeed(listXml)) {
    if (e.title !== article.title) continue;
    // 公開済みの同題 = 応答が失われた前回の投稿。下書きの同題は中身が同じ保証が無いので止める。
    if (e.draft !== false) throw new Error(`同じ題名の下書き（または状態を読めない記事）がはてなにある: ${e.title} — 人が確認する`);
    if (!e.url) throw new Error(`同じ題名の記事があるが公開URLを読めない（二重投稿を避けて止める）: ${e.title}`);
    return { url: e.url, reused: true };
  }
  const xml = hatenaEntryXml({ title: article.title, body, categories: article.tags, author: cfg.hatenaId });
  const res = await hatenaRequest(cfg.atomUrl, key, { method: 'POST', headers: { 'content-type': 'application/atom+xml; charset=utf-8' }, body: xml }, [201]);
  const text = await res.text();
  const url = (/<link rel="alternate" type="text\/html" href="([^"]+)"/.exec(text) || [])[1];
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
  const res = platform === 'devto' ? await publishDevto(article, key, body) : await publishHatena(article, key, body);
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
  return { ok: problems.length === 0, problems, robots, siteLinks };
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
  const summary = argValue(argv, '--summary');
  if (summary) fs.appendFileSync(summary, lines.join('\n') + '\n\n');
  console.log(lines.join('\n'));
  if (!last.ok) process.exitCode = 1;
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
  const commands = { gate: cmdGate, context: cmdContext, validate: cmdValidate, publish: cmdPublish, verify: cmdVerify };
  (async () => {
    if (cmd === '--selftest') { process.exitCode = (await selftest()) ? 1 : 0; return; }
    if (!commands[cmd]) {
      console.error('使い方: gate | context | validate | publish | verify | --selftest（詳細は冒頭のコメント）');
      process.exitCode = 2;
      return;
    }
    await commands[cmd](argv.slice(1));
  })().catch((e) => { console.error(`エラー: ${e.message}`); process.exitCode = 1; });
}
