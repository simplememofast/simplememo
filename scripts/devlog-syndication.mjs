#!/usr/bin/env node
/**
 * 開発記録の外部ブログ配信（dev.to / はてなブログ2つ / ライブドアブログ）— 門・文脈・検証・投稿・公開確認。
 *
 *   node scripts/devlog-syndication.mjs gate     --platform devto|hatena|hatenadiary|livedoor [--force] [--dry-run] [--key-missing] [--github-output FILE]
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
 *   publish  … 公式API（dev.to Forem API / はてなブログ・ライブドアブログの AtomPub）。**APIキーはこのステップだけが持つ**
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
 *   - はてな・ライブドアは本文末尾に固定の開示文を付ける（モデルに書かせない＝消されない）
 *   - 本文の数量は、記事が宣言した出典ファイルか一次ファイルに同じ数字があるときだけ通す
 *
 * 【媒体を2つ足す（2026-10-03）】
 * はてなブログ「メモの設計図」（simplememofast.hatenadiary.jp）とライブドアブログ（captio.livedoor.blog）も、
 * これまで Mac のローカル定期タスクがブラウザ操作で投稿していた。AI の開示が無く、出典の無い数字も載っていた。
 * オーナーが選択式で「新しい仕組みに移す（推奨）」を選んだので、この経路に載せる（CLAUDE.md の
 * 「新しい種類の対外送信は…例外は人が名指しで出す」の名指しの例外）。分け方は次のとおり:
 *   - 媒体名ではなく kind（devto / hatena / livedoor）と lang で分岐する。はてなの2つは同じ kind
 *   - 日本語の3媒体は「使った題材」を共有する（同じ種で日本語の似た記事を3本出さない）
 *   - ライブドアの鍵（LIVEDOOR_API_KEY）はオーナーがこれから登録する。登録されるまでは失敗にせず
 *     「鍵待ち」として休む（門は key_pending・見張りは warn）
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

/**
 * 2026-10-03 に足した2媒体の開示文。既存のはてな（simplememofast.hatenablog.com）の開示文は変えない。
 * 「開発元が運営するブログ」と書くのは、景品表示法のステルスマーケティング規制（広告であることの表示）に
 * 当たらないよう、書き手と製品の関係を本文で明示するため。
 * **「AIエージェントが自動で執筆・公開しています」は見張りがこの経路の記事を見分けるのに使う**（isPipelineFeedEntry）。
 */
const OWNED_BLOG_FOOTER_JA = '\n\n---\n\n*この記事は、シンプルメモの開発元が運営するブログの記事です。開発の公開記録（リポジトリと運用ログ）をもとに、AIエージェントが自動で執筆・公開しています。数値はそれらの記録にあるものだけを使っています。*\n';

/**
 * 媒体の設定。**分岐は媒体名ではなく kind（API と公開面の形）と lang で行う。**
 *   kind … devto（Forem API）/ hatena（はてなブログ AtomPub・Atom 1.0 の公開フィード）/
 *          livedoor（ライブドアブログ AtomPub・Atom 0.3 の公開フィード）
 *   pendingUntilKey … 鍵がまだ登録されていない媒体。鍵が無い間は失敗にせず「鍵待ち」として休む（門・見張り）
 */
export const PLATFORMS = {
  devto: {
    label: 'dev.to',
    lang: 'en',
    kind: 'devto',
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
    kind: 'hatena',
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
  // はてなブログ「メモの設計図」。同じはてなID・同じ HATENA_API_KEY で投稿できる（はてなのAPIキーはアカウント単位）。
  // 読者向けの「メモの仕組みの設計」の文章を置くブログで、開発日誌の体にしない（RUNBOOK §3）。
  hatenadiary: {
    label: 'はてなブログ「メモの設計図」',
    lang: 'ja',
    kind: 'hatena',
    hatenaId: 'simplememofast',
    blogId: 'simplememofast.hatenadiary.jp',
    feedUrl: 'https://simplememofast.hatenadiary.jp/feed',
    atomUrl: 'https://blog.hatena.ne.jp/simplememofast/simplememofast.hatenadiary.jp/atom/entry',
    secretEnv: 'HATENA_API_KEY',
    sitemap: 'sitemap-ja.xml',
    minIntervalHours: 66,
    chars: [2500, 7500],
    siteLinks: [1, 2],
    otherLinksMax: 3,
    tagsMax: 5,
    series: [],
    footer: OWNED_BLOG_FOOTER_JA,
  },
  // ライブドアブログ「captio式シンプルメモ開発日誌」。AtomPub の仕様は公式ヘルプ
  // https://support.livedoor.info/hc/ja/articles/9615538421007 （エンドポイント /atompub/<ブログ名>/article・
  // HTTPS の Basic 認証＝ライブドアID と APIキー（AtomPub用パスワード）・WSSE も可・無いカテゴリは自動で作られる・タグは付けられない）。
  // **カテゴリは「メモ術」に固定**する（モデルの tags を送ると、カテゴリが勝手に増える）。
  livedoor: {
    label: 'ライブドアブログ',
    lang: 'ja',
    kind: 'livedoor',
    livedoorId: 'captio',
    blogName: 'captio',
    publicHost: 'captio.livedoor.blog',
    feedUrl: 'https://captio.livedoor.blog/atom.xml',
    atomUrl: 'https://livedoor.blogcms.jp/atompub/captio/article',
    secretEnv: 'LIVEDOOR_API_KEY',
    pendingUntilKey: true,
    keySetEnv: 'LIVEDOOR_KEY_SET',
    sitemap: 'sitemap-ja.xml',
    minIntervalHours: 66,
    chars: [2500, 7500],
    siteLinks: [1, 2],
    otherLinksMax: 3,
    tagsMax: 5,
    series: [],
    categories: ['メモ術'],
    footer: OWNED_BLOG_FOOTER_JA,
  },
};

/**
 * 媒体の設定の整合。kind ごとに要る欄・鍵の環境変数名・https・開示文・ID と URL の食い違いを見る。
 * 媒体を足すときに欄を書き落とすと、その媒体だけ投稿や見張りが黙って外れるので、自己テストで固定する。
 */
export function platformConfigProblems(platforms = PLATFORMS) {
  const problems = [];
  const need = {
    devto: ['username', 'listUrl', 'articleApi'],
    hatena: ['hatenaId', 'blogId', 'feedUrl', 'atomUrl'],
    livedoor: ['livedoorId', 'blogName', 'publicHost', 'feedUrl', 'atomUrl', 'categories'],
  };
  for (const [p, c] of Object.entries(platforms)) {
    if (!need[c.kind]) { problems.push(`${p}: 知らない kind「${c.kind}」`); continue; }
    for (const k of need[c.kind]) if (c[k] === undefined || c[k] === null || c[k] === '') problems.push(`${p}: ${k} が無い`);
    if (!['en', 'ja'].includes(c.lang)) problems.push(`${p}: lang「${c.lang}」`);
    if (!/^[A-Z][A-Z0-9_]*_API_KEY$/.test(String(c.secretEnv))) problems.push(`${p}: secretEnv「${c.secretEnv}」`);
    for (const k of ['listUrl', 'feedUrl', 'atomUrl']) {
      if (k in c && !String(c[k]).startsWith('https://')) problems.push(`${p}: ${k} が https でない（${c[k]}）`);
    }
    if (c.pendingUntilKey === true && !c.keySetEnv) problems.push(`${p}: 鍵待ちの媒体に keySetEnv が無い（見張りが鍵の登録を知れない）`);
    const disclosure = c.lang === 'en' ? 'by an AI agent' : 'AIエージェントが自動で執筆・公開しています';
    if (!String(c.footer ?? '').includes(disclosure)) problems.push(`${p}: 開示文（${disclosure}）が無い`);
    const range = c.lang === 'en' ? c.words : c.chars;
    if (!Array.isArray(range) || range.length !== 2 || !(range[0] < range[1])) problems.push(`${p}: 長さの範囲が無い`);
    if (!Array.isArray(c.siteLinks) || !(c.siteLinks[0] >= 1) || !(c.siteLinks[1] >= c.siteLinks[0])) problems.push(`${p}: siteLinks（自社リンクの本数）`);
    if (c.kind === 'hatena' && !String(c.atomUrl).endsWith(`/${c.hatenaId}/${c.blogId}/atom/entry`)) problems.push(`${p}: atomUrl がはてなID・ブログIDと食い違う`);
    if (c.kind === 'livedoor' && !String(c.atomUrl).endsWith(`/atompub/${c.blogName}/article`)) problems.push(`${p}: atomUrl がブログ名と食い違う`);
    if (c.kind === 'livedoor' && !(Array.isArray(c.categories) && c.categories.length)) problems.push(`${p}: 固定のカテゴリが無い`);
  }
  return problems;
}

/** 投稿に使うアカウント名（published.json の account 欄）。 */
export function accountOf(cfg) {
  if (cfg.kind === 'devto') return cfg.username;
  if (cfg.kind === 'hatena') return cfg.hatenaId;
  if (cfg.kind === 'livedoor') return cfg.livedoorId;
  throw new Error(`知らない kind: ${cfg.kind}`);
}

/** 同じ言語の他の媒体（姉妹ブログ）。日本語の3媒体は「使った題材」を共有する。 */
export function siblingsOf(platform) {
  const lang = PLATFORMS[platform]?.lang;
  return Object.keys(PLATFORMS).filter((p) => p !== platform && PLATFORMS[p].lang === lang);
}

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
 *
 * 投稿用の鍵が無いとき（keyMissing。ワークフローが真偽だけを渡す。値は渡さない）:
 *   - pendingUntilKey の媒体（鍵をこれから登録する媒体）は key_pending で休む。**失敗にしない**（オーナー作業の待ち）。
 *     公開面が読めなくても、鍵が無ければどのみち出さないので、読めないより先に判定する
 *   - それ以外の媒体は、投稿する番（due）のときに no_key で落とす。旧ワークフローの「投稿用の鍵があるか」と同じく、
 *     **黙って休まずに落とす**（間隔待ち・読めないの判定は今までどおり先に出る）
 *   - 試験実行（dry_run）は鍵を見ない。鍵の登録前でも、書いて検査するところまで経路を試せる
 */
export function decideGate({ stop, latestIso, postsLast24h, now, minIntervalHours, force = false, dryRun = false, readError = null,
  keyMissing = false, pendingUntilKey = false, secretEnv = '投稿用の鍵' }) {
  if (stop?.stopped) return { due: false, code: 'stopped', reason: stop.reason };
  if (keyMissing && !dryRun && pendingUntilKey) {
    return { due: false, code: 'key_pending', reason: `${secretEnv} が未登録。登録されるまで投稿しない（オーナー作業）` };
  }
  if (readError) return { due: false, code: 'unreadable', reason: `公開面の最新投稿を読めない: ${readError}` };
  // 試験実行（dry_run）は投稿しないので、間隔と「24時間に1本」では止めない（いつでも経路全体を試せるように）。
  // 停止と「公開面を読めない」は本番と同じく止める。投稿しないことは publish --dry-run 側で保証する。
  if (dryRun) return { due: true, code: 'dry_run', reason: '試験実行（投稿しない）: 間隔と24時間の上限は見ない' };
  const d = decideInterval({ latestIso, postsLast24h, now, minIntervalHours, force });
  if (keyMissing && d.due === true) {
    return { ...d, due: false, code: 'no_key',
      reason: `${secretEnv} が GitHub Secrets に無い（投稿する番だった: ${d.reason}）。黙って休まずに落とす` };
  }
  return d;
}

/** 間隔と「24時間に1本」だけの判定（decideGate の後半）。 */
function decideInterval({ latestIso, postsLast24h, now, minIntervalHours, force }) {
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

/**
 * XML の要素の中身を文字列にする。CDATA の部分は**そのまま**（実体参照を解かない）、それ以外は実体参照を解く。
 * ライブドアの公開フィードは本文を `<content …><![CDATA[ …HTML… ]]></content>` で持つ（2026-10-03 実測）。
 * CDATA の中の `&amp;` は HTML としての `&amp;` なので、解くと本文の意味が変わる。はてなは CDATA を使わないので、従来と同じ結果になる。
 */
export function xmlText(inner) {
  const s = String(inner ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)) {
    out += decodeEntities(s.slice(last, m.index)) + m[1];
    last = m.index + m[0].length;
  }
  return out + decodeEntities(s.slice(last));
}

/**
 * Atom の公開フィードと AtomPub の一覧を読む（はてな: Atom 1.0・最新30件 / ライブドア: Atom 0.3）。
 * 公開日時は published → issued → updated → modified の順に読む。ライブドアの公開フィードは Atom 0.3 で、
 * entry に published が無く `<issued>2026-09-22T18:55:24+09:00</issued>` と `<modified>…Z</modified>` を持つ
 * （issued が公開時刻。modified は編集で動く）。題名は属性つき（`<title type="text">`）も読む。
 */
export function parseAtomFeed(xml) {
  const entries = [];
  for (const m of String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = xmlText((/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(e) || [])[1] || '').trim();
    const url = entryAlternateUrl(e);
    const published = ((/<published>([^<]+)<\/published>/.exec(e) || /<issued>([^<]+)<\/issued>/.exec(e)
      || /<updated>([^<]+)<\/updated>/.exec(e) || /<modified>([^<]+)<\/modified>/.exec(e) || [])[1] || '').trim() || null;
    const content = xmlText((/<content\b[^>]*>([\s\S]*?)<\/content>/.exec(e) || [])[1] || '');
    const summary = xmlText((/<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(e) || [])[1] || '');
    // AtomPub の一覧だけが持つ欄。公開フィードには無い（= null で「読めない」）。
    const draftTag = /<app:draft>\s*(yes|no)\s*<\/app:draft>/.exec(e);
    const draft = draftTag ? draftTag[1] === 'yes' : null;
    entries.push({ title, url, published_at: published, content, summary, draft });
  }
  return entries;
}

/**
 * はてな・ライブドアの公開フィード（キー不要）。**クエリを毎回変えてキャッシュを通さずに読む。**
 * ライブドアの公開フィードは Age ヘッダを返さず、`?fresh=…` を付けても 200 を返す（2026-10-03 実測）。
 */
async function feedPublicPosts(cfg) {
  const res = await fetchWithRetry(`${cfg.feedUrl}?${freshQuery()}`, { okStatuses: [200] });
  assertFresh(res, `${cfg.label}の公開フィード`);
  const entries = parseAtomFeed(await res.text());
  if (!entries.length) throw new Error(`${cfg.label}のフィードに entry が無い（読み方が壊れている可能性）`);
  return entries;
}

export async function publicPosts(platform) {
  const cfg = PLATFORMS[platform];
  return cfg.kind === 'devto' ? devtoPublicPosts() : feedPublicPosts(cfg);
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
    force: argv.includes('--force'), dryRun: argv.includes('--dry-run'), readError,
    keyMissing: argv.includes('--key-missing'), pendingUntilKey: cfg.pendingUntilKey === true, secretEnv: cfg.secretEnv });
  console.log(`[${cfg.label}] ${d.due ? '投稿する' : '投稿しない'} — ${d.code}: ${d.reason}（最新: ${latest ?? 'なし'}）`);
  writeOutput(argValue(argv, '--github-output'), { due: d.due, code: d.code, latest: latest ?? '', reason: d.reason });
  // 読めない・鍵が無いのに投稿する番・停止は「異常」なので目立たせる。間隔待ちは正常。鍵待ちはオーナー作業の待ちなので注意だけ。
  if (d.code === 'unreadable') process.exitCode = 1;
  if (d.code === 'no_key') {
    console.log(`::error title=Devlog syndication::${platform} の投稿用の鍵（${cfg.secretEnv}）が GitHub Secrets に無い。黙って休まずに落とす。`);
    process.exitCode = 1;
  }
  if (d.code === 'key_pending') console.log(`::warning title=Devlog syndication key pending::${cfg.label}: ${d.reason}`);
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

/** その媒体で使える種か。英語の媒体（dev.to）は英語の下書きがある種、日本語の媒体は日本語長文（note向け）がある種。 */
export function seedFits(seed, platform) {
  return PLATFORMS[platform].lang === 'en' ? Boolean(seed.drafts.en) : Boolean(seed.drafts.note);
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

/**
 * 公開フィード（はてな・ライブドア）の entry から、使った題材を読む（印・見える記録・見える記録より前の記事の表）。
 * 表は URL で引くので、はてな以外の媒体の記事には当たらない。
 */
export function feedBases(entry) {
  const out = new Set(readMarkers(entry?.content).map((m) => m.basis).filter(Boolean));
  const legacy = LEGACY_HATENA_BASES[entry?.url];
  if (legacy) out.add(legacy);
  return [...out];
}
/** 旧名（はてなだけだったころの名前）。 */
export const hatenaBases = feedBases;

async function existingPosts(platform) {
  const posts = await publicPosts(platform);
  posts.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const bases = new Set();
  const detailed = [];
  if (PLATFORMS[platform].kind === 'devto') {
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
      for (const b of feedBases(p)) bases.add(b);
      detailed.push({ title: p.title, url: p.url, published_at: p.published_at,
        opening: String(p.summary || p.content.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 300) });
    }
  }
  const byUrl = new Map(detailed.map((d) => [d.url, d]));
  const all = posts.map((p) => byUrl.get(p.url) || { title: p.title, url: p.url, published_at: p.published_at, tags: p.tags });
  return { posts: all, usedBases: [...bases] };
}

/**
 * 同じ言語の姉妹ブログの題材と記事を、文脈に合流させる（純粋関数）。
 * **日本語の3媒体で同じ種から似た記事を3本出さない**ために、姉妹の公開面で使われた題材も「使用済み」に数える。
 * 姉妹の記事は existing_posts に混ぜず sibling_posts に分けて載せる（題名の近さは両方に対して検査する）。
 * 姉妹が読めないときは sibling_read_errors に残して続ける。**自媒体が読めないのは今まで通り失敗**（呼び出し側が投げる）。
 *   own      … { usedBases }
 *   siblings … [{ platform, posts, usedBases }] か、読めなかった姉妹は [{ platform, error }]
 */
export function mergeSiblingContext(own, siblings) {
  const used = new Set(own?.usedBases || []);
  const ownCount = used.size;
  const sibling_posts = [];
  const sibling_read_errors = [];
  for (const s of siblings || []) {
    if (s.error !== undefined) { sibling_read_errors.push({ platform: s.platform, error: String(s.error) }); continue; }
    for (const b of s.usedBases || []) used.add(b);
    for (const p of s.posts || []) {
      sibling_posts.push({ platform: s.platform, title: p.title, url: p.url, published_at: p.published_at, opening: p.opening ?? null });
    }
  }
  return { used_bases: [...used], sibling_bases_added: used.size - ownCount, sibling_posts, sibling_read_errors };
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
  // 自媒体の公開面が読めないのは失敗（投げる）。姉妹ブログが読めないのは記録して続ける。
  const own = await existingPosts(platform);
  const posts = own.posts;
  const siblings = [];
  for (const s of siblingsOf(platform)) {
    try {
      const r = await existingPosts(s);
      siblings.push({ platform: s, posts: r.posts, usedBases: r.usedBases });
    } catch (e) {
      siblings.push({ platform: s, error: e.message });
      console.log(`::warning title=Devlog syndication sibling::${PLATFORMS[s].label}の公開面を読めない（題材の共有から外して続ける）: ${e.message}`);
    }
  }
  const merged = mergeSiblingContext(own, siblings);
  const usedBases = merged.used_bases;
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
    // カテゴリをスクリプトが固定する媒体（ライブドア）。tags は書いてよいが送られない
    categories_fixed: cfg.categories ?? null,
    used_bases: usedBases,
    sibling_platforms: siblingsOf(platform),
    seeds_available: seeds.filter((s) => seedFits(s, platform) && !usedBases.includes(s.id))
      .map(({ raw, ...s }) => s),
    seeds_used_or_unfit: seeds.filter((s) => !seedFits(s, platform) || usedBases.includes(s.id)).map((s) => s.id),
    existing_posts: posts.map((p) => ({ title: p.title, published_at: p.published_at, url: p.url, opening: p.opening ?? undefined })),
    sibling_posts: merged.sibling_posts,
    sibling_read_errors: merged.sibling_read_errors,
    product_facts: productFacts(constants),
    fact_files: ['llms.txt', 'data/site-constants.json', 'data/benchmark.json', 'docs/story-seeds.md'],
    allowed_site_links: links.map(({ url, file, title }) => ({ url, file, title })),
  };
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(ctx, null, 2));
  console.log(`[${cfg.label}] 文脈: 既存 ${posts.length} 本 / 使用済みの題材 ${usedBases.length}（うち姉妹ブログから ${merged.sibling_bases_added}）`
    + ` / 姉妹ブログの記事 ${merged.sibling_posts.length} 本（読めない姉妹 ${merged.sibling_read_errors.length}）`
    + ` / 使える種 ${ctx.seeds_available.length} / リンク候補 ${links.length} → ${out}`);
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
  // カテゴリをスクリプトが固定する媒体（ライブドア）は tags を送らないので、書かなくてもよい（書くなら同じ形）
  const minTags = cfg.categories ? 0 : 1;
  if (tags.length < minTags || tags.length > cfg.tagsMax) P(`tags は${minTags}〜${cfg.tagsMax}個（${tags.length}個）`);
  if (cfg.kind === 'devto') {
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

  // 題材・出典。日本語の媒体は、姉妹ブログ（日本語の他の2媒体）で使った題材も used_bases に入っている（文脈が合流させる）
  const basis = String(article.basis);
  const seed = (ctx.seeds_available || []).find((s) => s.id === basis);
  const usedWhere = lang === 'ja' ? 'この媒体か日本語の姉妹ブログで使用済み' : 'この媒体で使用済み';
  if (/^S-\d{8}-/.test(basis)) {
    if ((ctx.used_bases || []).includes(basis)) P(`題材 ${basis} は${usedWhere}`);
    else if (!seed) P(`題材 ${basis} は使える種の一覧に無い`);
  } else if (/^page:/.test(basis)) {
    const file = basis.slice(5);
    if ((ctx.used_bases || []).includes(basis)) P(`題材 ${basis} は${usedWhere}`);
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

  // 既存記事との重複（自媒体と、同じ言語の姉妹ブログの両方）
  const tk = titleTokens(title, lang);
  for (const p of ctx.existing_posts || []) {
    const sim = jaccard(tk, titleTokens(p.title, lang));
    if (sim >= 0.55) P(`既存記事と題名が近い（${sim.toFixed(2)}）: 「${p.title}」`);
  }
  for (const p of ctx.sibling_posts || []) {
    const sim = jaccard(tk, titleTokens(p.title, lang));
    if (sim >= 0.55) P(`姉妹ブログ（${PLATFORMS[p.platform]?.label ?? p.platform}）の既存記事と題名が近い（${sim.toFixed(2)}）: 「${p.title}」`);
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
  // はてなは HTML コメントを公開面から消すので、題材の記録を見える形でも付ける（VISIBLE_BASIS_LABEL の説明）。
  // ライブドアがコメントを残すかは投稿するまで分からないので、dev.to 以外はすべて見える記録を付ける。
  const visible = cfg.kind !== 'devto' ? `\n*${VISIBLE_BASIS_LABEL}: ${article.basis}*\n` : '';
  return `${String(article.body_markdown).trim()}${cfg.footer}${visible}\n${marker}\n`;
}

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─────────────────────────────────────────────────────────────
// Markdown → HTML（ライブドアブログ用。**依存なし** — ワークフローは npm install せずにこのスクリプトを動かす）
// ─────────────────────────────────────────────────────────────
//
// ライブドアの AtomPub は本文を HTML で受ける（はてなは Markdown のまま受ける）。執筆ステップには Markdown で書かせ、
// ここで HTML にする。扱うのは記事に要る範囲だけ:
//   見出し（# と ## は h2・### は h3・#### 以下は h4）/ 段落（段落内の単独改行は <br>）/ --- と *** の区切り線 /
//   > 引用 / 箇条書き（- * +）と番号付き（1.）/ ``` のコードブロック / GFM のパイプ表 /
//   インラインのコード・**太字**・*斜体*・[文字](http(s)://…) のリンク
// **それ以外の HTML はすべてエスケープする**（モデルが書いたタグを本文に通さない）。例外は composeBody が付ける
// 印 `<!-- devlog-syndication: … -->` の行だけ。アンダースコアの強調は扱わない（ファイル名の _ を壊さない）。
// リンクは http(s) だけ。**自社リンクに rel を付けない**（dofollow のまま載せるため）。
// リンクになる URL は、検証（extractLinks）が拾って確かめた URL の部分集合になる（同じ形の正規表現・コードの中は除く）。

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MD_MARKER_LINE = /^<!--\s*devlog-syndication:[^<>]*-->$/;
const MD_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const MD_HR = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,})$/;
const MD_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const MD_BULLET = /^( {0,3})([-*+])([ \t]+)(.*)$/;
const MD_ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+)(.*)$/;
const MD_QUOTE = /^ {0,3}>[ ]?(.*)$/;
const MD_TABLE_DELIM_CELL = /^:?-+:?$/;

function mdFence(line) {
  const m = MD_FENCE.exec(line);
  if (!m) return null;
  // ``` の後ろに ` があるものはコードブロックではない（インラインのコード）
  if (m[1][0] === '`' && m[2].includes('`')) return null;
  const lang = (/^\s*([A-Za-z0-9_+#.-]+)/.exec(m[2]) || [])[1] || '';
  return { char: m[1][0], len: m[1].length, lang };
}

function mdListItem(line) {
  let m = MD_BULLET.exec(line);
  if (m) return { ordered: false, indent: m[1].length, contentIndent: m[1].length + 1 + Math.min(m[3].length, 4), text: m[4] };
  m = MD_ORDERED.exec(line);
  if (m) return { ordered: true, indent: m[1].length, start: Number(m[2]),
    contentIndent: m[1].length + m[2].length + 1 + Math.min(m[4].length, 4), text: m[5] };
  return null;
}

/** GFM の表の行を区切る（\| は区切りにしない）。 */
function mdSplitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** 見出し行＋区切り行（|---|:---:|）なら表の頭を返す。区切り行の列数が見出しと違えば表にしない（GFM と同じ）。 */
function mdTableHead(line, next) {
  // 最後の行（次の行が無い）は区切り行を持てないので表ではない
  if (typeof line !== 'string' || typeof next !== 'string' || !line.includes('|') || !next.includes('|')) return null;
  const head = mdSplitRow(line);
  const delim = mdSplitRow(next);
  if (head.length !== delim.length || !delim.every((c) => MD_TABLE_DELIM_CELL.test(c))) return null;
  const align = delim.map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
  return { head, align };
}

/** 段落を途中で切る行か（CommonMark と同じく、番号付きは 1 で始まるときだけ段落を切る）。 */
function mdStartsBlock(line, next) {
  return MD_MARKER_LINE.test(line.trim()) || MD_HEADING.test(line) || MD_HR.test(line) || mdFence(line) !== null
    || MD_QUOTE.test(line) || MD_BULLET.test(line) || /^ {0,3}1[.)][ \t]+\S/.test(line) || mdTableHead(line, next) !== null;
}

/** 強調（*斜体*・**太字**・***両方***）。エスケープ済みの文字列に当てる。アンダースコアは扱わない。 */
function mdEmphasis(s) {
  return s
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>');
}

/**
 * インライン（コード・画像・リンク・バックスラッシュのエスケープ・強調）。**それ以外の文字はすべてエスケープする。**
 * リンクは生の文字列の上で、検証の extractLinks と同じ形で拾う（描いた href は必ず検証が確かめた URL になる）。
 */
export function mdInline(text) {
  const slots = [];
  const hold = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  const plain = (t) => mdEmphasis(escapeHtml(String(t).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, (_, c) => hold(escapeHtml(c)))));
  let s = String(text ?? '').replace(/\u0000/g, '');
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => hold(`<code>${escapeHtml(code.replace(/\n/g, ' ').replace(/^ ([\s\S]*) $/, '$1'))}</code>`));
  // 画像は載せない（ホットリンクを作らない。検証も画像の URL を見ていない）。代替テキストだけ残す
  s = s.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt) => hold(escapeHtml(alt)));
  // リンクは http(s) だけ。rel も target も付けない（自社リンクを dofollow のまま載せる）
  s = s.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_, label, url) => hold(`<a href="${escapeHtml(url)}">${plain(label)}</a>`));
  s = plain(s);
  for (let i = 0; i < 8 && s.includes('\u0000'); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[Number(n)]);
  return s;
}

function mdRenderBlocks(lines, sep) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    // composeBody が付ける印の行だけは、そのまま通す（題材の記録を本文に残す。中に < > を含むものは通さない）
    if (MD_MARKER_LINE.test(line.trim())) { out.push(line.trim()); i++; continue; }
    const fence = mdFence(line);
    if (fence) {
      // 閉じるのは、同じ文字で開きと同じ長さ以上の行（後ろは空白だけ）。閉じなければ最後までコード（CommonMark と同じ）
      const closeRe = new RegExp(`^ {0,3}${fence.char === '~' ? '~' : '\\x60'}{${fence.len},}[ \\t]*$`);
      const code = [];
      i++;
      for (; i < lines.length; i++) {
        if (closeRe.test(lines[i])) { i++; break; }
        code.push(lines[i]);
      }
      const cls = fence.lang ? ` class="language-${escapeHtml(fence.lang)}"` : '';
      out.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = MD_HEADING.exec(line);
    if (heading) {
      const level = Math.min(Math.max(heading[1].length, 2), 4);
      out.push(`<h${level}>${mdInline((heading[2] || '').trim())}</h${level}>`);
      i++;
      continue;
    }
    if (MD_HR.test(line)) { out.push('<hr>'); i++; continue; }
    if (MD_QUOTE.test(line)) {
      const inner = [];
      for (; i < lines.length; i++) {
        const q = MD_QUOTE.exec(lines[i]);
        if (!q) break;
        inner.push(q[1]);
      }
      out.push(`<blockquote>${mdRenderBlocks(inner, '')}</blockquote>`);
      continue;
    }
    const table = mdTableHead(line, lines[i + 1]);
    if (table) {
      // 表は空行か | の無い行で終わる
      const rows = [];
      for (i += 2; i < lines.length; i++) {
        if (lines[i].trim() === '' || !lines[i].includes('|')) break;
        rows.push(mdSplitRow(lines[i]));
      }
      const cell = (tag, text, k) => `<${tag}${table.align[k] ? ` style="text-align:${table.align[k]}"` : ''}>${mdInline(text)}</${tag}>`;
      const head = `<thead><tr>${table.head.map((c, k) => cell('th', c, k)).join('')}</tr></thead>`;
      const body = rows.length ? `<tbody>${rows.map((r) => `<tr>${table.head.map((_, k) => cell('td', r[k] ?? '', k)).join('')}</tr>`).join('')}</tbody>` : '';
      out.push(`<table>${head}${body}</table>`);
      continue;
    }
    const first = mdListItem(line);
    if (first) {
      const items = [];
      let cur = null;
      for (; i < lines.length; i++) {
        const ln = lines[i];
        const it = mdListItem(ln);
        if (it && it.indent <= first.indent + 1) {
          if (it.ordered !== first.ordered) break; // 種類の違うリストが続く
          cur = { lines: [it.text], contentIndent: it.contentIndent };
          items.push(cur);
          continue;
        }
        if (ln.trim() === '') {
          // 空行の後に同じ種類の項目か字下げした続きがあれば、同じリストのまま
          const k = mdNextNonBlank(lines, i + 1);
          const nx = k === -1 ? null : mdListItem(lines[k]);
          const sameKind = nx ? nx.ordered === first.ordered : false;
          const shallow = nx ? nx.indent <= first.indent + 1 : false;
          if (k !== -1 && ((sameKind && shallow) || /^ {2,}\S/.test(lines[k]))) { cur.lines.push(''); continue; }
          break;
        }
        const lead = (/^ */.exec(ln) || [''])[0].length;
        if (lead >= 2) { cur.lines.push(ln.slice(Math.min(lead, cur.contentIndent))); continue; }
        // 字下げの無い続きの行（直前が文字の行で、ほかの塊を始めない行）は、項目の文の続き
        if (cur.lines[cur.lines.length - 1].trim() !== '' && !mdStartsBlock(ln, lines[i + 1])) { cur.lines.push(ln); continue; }
        break;
      }
      const tag = first.ordered ? 'ol' : 'ul';
      const start = first.ordered === true && first.start !== 1 ? ` start="${first.start}"` : '';
      out.push(`<${tag}${start}>${items.map((it) => mdListItemHtml(it.lines)).join('')}</${tag}>`);
      continue;
    }
    // 段落（単独の改行は <br>）。1行目は上のどの塊でもないので必ず取り込む（取り込まないと先へ進まない）
    const para = [lines[i].trim()];
    for (i++; i < lines.length; i++) {
      if (lines[i].trim() === '' || mdStartsBlock(lines[i], lines[i + 1])) break;
      para.push(lines[i].trim());
    }
    out.push(`<p>${mdInline(para.join('\n')).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join(sep);
}

/** from から先で、最初の空でない行の位置（無ければ -1）。 */
function mdNextNonBlank(lines, from) {
  for (let k = from; k < lines.length; k++) if (lines[k].trim() !== '') return k;
  return -1;
}

/** リストの項目。先頭の文（入れ子の塊が始まるまで）はインラインで、残りは塊として描く。 */
function mdListItemHtml(itemLines) {
  const lead = [];
  let k = 0;
  for (; k < itemLines.length; k++) {
    const ln = itemLines[k];
    if (ln.trim() === '' || (k > 0 && mdStartsBlock(ln, itemLines[k + 1]))) break;
    lead.push(ln.trim());
  }
  const rest = itemLines.slice(k);
  const restHtml = rest.some((x) => x.trim() !== '') ? mdRenderBlocks(rest, '') : '';
  return `<li>${mdInline(lead.join('\n')).replace(/\n/g, '<br>')}${restHtml}</li>`;
}

/** Markdown を HTML にする（ライブドア用）。塊は改行で区切る（リスト・表・引用の中は1行にまとめる）。 */
export function markdownToHtml(md) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').split('\n')
    .map((l) => l.replace(/^\t+/, (t) => '    '.repeat(t.length)));
  return mdRenderBlocks(lines, '\n');
}

/**
 * ライブドアの AtomPub に送る entry。本文は HTML を XML としてエスケープして content（type="text/html"）に入れる。
 * **カテゴリは引数で受けた固定のものだけ**（呼び出し側は PLATFORMS.livedoor.categories を渡し、モデルの tags は渡さない）。
 */
export function livedoorEntryXml({ title, html, categories }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<entry xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">
  <title>${xmlEscape(title)}</title>
${categories.map((c) => `  <category term="${xmlEscape(c)}"/>`).join('\n')}
  <content type="text/html">${xmlEscape(html)}</content>
  <app:control><app:draft>no</app:draft></app:control>
</entry>
`;
}

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
 * AtomPub の認証ヘッダ。はてなは Basic（はてなID + APIキー・HTTPS）と WSSE の両方を受ける。
 * ライブドアも同じ2方式（Basic は HTTPS だけ。ユーザー名はライブドアID、パスワードは APIキー＝AtomPub用パスワード。
 * 公式ヘルプ https://support.livedoor.info/hc/ja/articles/9615538421007 ）。
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

/**
 * AtomPub への要求（はてな・ライブドア共通）。ユーザー名は媒体の設定から取る（はてなID / ライブドアID）。
 * 記事の作成（POST）は 5xx・通信の失敗で送り直さない（作成済みかもしれない）。401 は作成されていないので WSSE で送り直す。
 */
async function atompubRequest(cfg, url, key, opts, okStatuses) {
  const user = cfg.kind === 'livedoor' ? cfg.livedoorId : cfg.hatenaId;
  const idempotent = (opts.method || 'GET') !== 'POST';
  for (const mode of ['basic', 'wsse']) {
    try {
      return await fetchWithRetry(url, { ...opts, headers: { ...(opts.headers || {}), ...hatenaAuthHeaders(user, key, mode) }, okStatuses, retries: 1, idempotent });
    } catch (e) {
      if (e.status === 401 && mode === 'basic') continue;
      throw e;
    }
  }
  throw new Error(`${cfg.label}の認証が Basic でも WSSE でも通らない`);
}

/** はてなの AtomPub（はてなブログの2つ。設定 cfg で投稿先を決める）。 */
const hatenaRequest = (cfg, url, key, opts, okStatuses) => atompubRequest(cfg, url, key, opts, okStatuses);

export async function publishHatena(cfg, article, key, body, { now = new Date(), force = false } = {}) {
  // 冪等: 直近の一覧（AtomPub・認証済み）に同じ題名があれば作らない
  const listXml = await (await hatenaRequest(cfg, cfg.atomUrl, key, { method: 'GET' }, [200])).text();
  const entries = parseAtomFeed(listXml);
  // 空の一覧は「投稿が無い」ではなく「読み方が壊れている」と扱う（空を通すと同題の採用も門も素通りする）
  if (!entries.length) throw new Error(`${cfg.label}の AtomPub の一覧に entry が無い（読み方が壊れている可能性）— 二重投稿を避けて止める`);
  for (const e of entries) {
    if (e.title !== article.title) continue;
    // 公開済みの同題 = 応答が失われた前回の投稿。下書きの同題は中身が同じ保証が無いので止める。
    if (e.draft !== false) throw new Error(`同じ題名の下書き（または状態を読めない記事）が${cfg.label}にある: ${e.title} — 人が確認する`);
    if (!e.url) throw new Error(`同じ題名の記事があるが公開URLを読めない（二重投稿を避けて止める）: ${e.title}`);
    return { url: e.url, reused: true };
  }
  const guard = publishGuard(entries.map((e) => ({ ...e, published: e.draft === false })), now,
    { minIntervalHours: cfg.minIntervalHours, force });
  if (!guard.ok) throw new Error(`投稿の直前の確認（AtomPub の一覧）で止めた: ${guard.reason} — 門が読んだ公開フィードが古かった可能性。続けて出さない`);
  const xml = hatenaEntryXml({ title: article.title, body, categories: article.tags, author: cfg.hatenaId });
  const res = await hatenaRequest(cfg, cfg.atomUrl, key, { method: 'POST', headers: { 'content-type': 'application/atom+xml; charset=utf-8' }, body: xml }, [201]);
  const text = await res.text();
  const url = entryAlternateUrl(text);
  if (!url) throw new Error(`${cfg.label}の応答に公開URLが無い: ${text.slice(0, 300)}`);
  return { url, reused: false, member: res.headers.get('location') };
}

/** ライブドアの公開URLを、公開ホストなら https にそろえる（AtomPub の応答の alternate は http:// で返りうる）。 */
export function normalizeLivedoorUrl(url, cfg) {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' && u.hostname === cfg.publicHost) u.protocol = 'https:';
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * ライブドアの AtomPub の応答（作成した entry）から公開URLを読む。
 * `<link rel="alternate" type="text/html" href="http://….livedoor.blog/archives/NNN.html"/>` があればそれ（公開ホストなら https に）。
 * 無ければ `<link rel="edit" href="…/atompub/<ブログ名>/article/NNN"/>` の記事番号から公開ページの URL を組み立てる。
 * どちらも無ければ null（呼び出し側が失敗にする）。
 */
export function livedoorPublicUrl(xml, cfg) {
  const alt = entryAlternateUrl(xml);
  if (alt) {
    const u = normalizeLivedoorUrl(alt, cfg);
    if (u) return u;
  }
  for (const m of String(xml ?? '').matchAll(/<link\b([^>]*?)\/?>/g)) {
    const rel = (/\brel=["']([^"']*)["']/.exec(m[1]) || [])[1];
    const href = (/\bhref=["']([^"']*)["']/.exec(m[1]) || [])[1];
    if (rel !== 'edit' || !href) continue;
    const id = (/\/article\/(\d+)\/?$/.exec(decodeEntities(href)) || [])[1];
    if (id) return `https://${cfg.publicHost}/archives/${id}.html`;
  }
  return null;
}

/**
 * ライブドアへ投稿する（AtomPub）。publishHatena と同じ考え方で、投稿の直前に**認証済みの一覧**を読み、
 * 同じ題名があれば作らずに採用し（下書きの同題なら止める）、24時間に1本・66時間の間隔を確かめ直す。
 *
 * - 認証済みの一覧の形は、鍵が無いと実測できない（2026-10-03 時点で鍵は未登録）。**形が読めない**
 *   （entry 0件・日付を読めない entry がある）ときは、公開フィード（キャッシュなし）で代わりに確かめて ::warning を出す。
 *   公開フィードでも日付を読めなければ止める。401/403 は鍵かライブドアIDの誤りとして失敗にする（投稿しない）。
 * - 一覧で app:draft が無い entry は「公開」とみなす。下書きを公開と数えても、止める側に倒れるだけなので安全。
 * - 本文は Markdown を HTML にして送る。カテゴリは cfg.categories に固定（モデルの tags は送らない）。
 */
export async function publishLivedoor(cfg, article, key, body, { now = new Date(), force = false,
  warn = (msg) => console.log(`::warning title=Devlog syndication::${msg}`) } = {}) {
  const authError = (e) => (e.status === 401 || e.status === 403
    ? new Error(`${cfg.label}の認証が通らない（HTTP ${e.status}）— ${cfg.secretEnv}（AtomPub用パスワード）とライブドアID「${cfg.livedoorId}」を確かめる。投稿しない`)
    : e);
  let listXml;
  try {
    listXml = await (await atompubRequest(cfg, cfg.atomUrl, key, { method: 'GET' }, [200])).text();
  } catch (e) {
    throw authError(e);
  }
  const datedOk = (list) => list.length > 0 && list.every((e) => Number.isFinite(Date.parse(e.published_at)));
  let entries = parseAtomFeed(listXml);
  let source = 'AtomPub の一覧';
  if (!datedOk(entries)) {
    warn(`${cfg.label}の認証済みの一覧の形を読めない（entry ${entries.length} 件・日付を読めない entry ${entries.filter((e) => !Number.isFinite(Date.parse(e.published_at))).length} 件）。公開フィード（キャッシュなし）で代わりに確かめる`);
    entries = await feedPublicPosts(cfg);
    source = '公開フィード';
    if (!datedOk(entries)) throw new Error(`${cfg.label}の公開フィードでも日付を読めない entry がある — 間隔を確かめられないので投稿しない`);
  }
  for (const e of entries) {
    if (e.title !== article.title) continue;
    // 公開済みの同題 = 応答が失われた前回の投稿。下書きの同題は中身が同じ保証が無いので止める。
    if (e.draft === true) throw new Error(`同じ題名の下書きが${cfg.label}にある: ${e.title} — 人が確認する`);
    const url = e.url ? normalizeLivedoorUrl(e.url, cfg) : null;
    if (!url) throw new Error(`同じ題名の記事があるが公開URLを読めない（二重投稿を避けて止める）: ${e.title}`);
    return { url, reused: true };
  }
  const guard = publishGuard(entries.map((e) => ({ ...e, published: e.draft !== true })), now,
    { minIntervalHours: cfg.minIntervalHours, force });
  if (!guard.ok) throw new Error(`投稿の直前の確認（${source}）で止めた: ${guard.reason} — 門が読んだ公開フィードが古かった可能性。続けて出さない`);
  const xml = livedoorEntryXml({ title: article.title, html: markdownToHtml(body), categories: cfg.categories });
  let res;
  try {
    res = await atompubRequest(cfg, cfg.atomUrl, key, { method: 'POST', headers: { 'content-type': 'application/atom+xml;type=entry' }, body: xml }, [201]);
  } catch (e) {
    throw authError(e);
  }
  const text = await res.text();
  const url = livedoorPublicUrl(text, cfg);
  if (!url) throw new Error(`${cfg.label}の応答に公開URLが無い（記事は作成されたかもしれない。人が確認する）: ${text.slice(0, 300)}`);
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
    // ライブドアは HTML にして送るので、送るはずの HTML と entry をそのまま残す（目で確かめるため）
    if (cfg.kind === 'livedoor') {
      result.html = markdownToHtml(body);
      result.entry_xml = livedoorEntryXml({ title: article.title, html: result.html, categories: cfg.categories });
    }
    if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(`[${cfg.label}] dry-run: 投稿しない（検証は通過）`);
    return;
  }
  const key = process.env[cfg.secretEnv];
  if (!key) throw new Error(`${cfg.secretEnv} が無い — GitHub の Secrets に登録が要る（鍵の値はこのスクリプトしか読まない）`);
  const force = argv.includes('--force');
  let res;
  if (cfg.kind === 'devto') res = await publishDevto(article, key, body, { force });
  else if (cfg.kind === 'hatena') res = await publishHatena(cfg, article, key, body, { force });
  else if (cfg.kind === 'livedoor') res = await publishLivedoor(cfg, article, key, body, { force });
  else throw new Error(`知らない kind: ${cfg.kind}`);
  // 対外送信の記録（時刻・経路・表示名・本文のハッシュ）。本文そのものは成果物の article.json に残る。
  // ライブドアは HTML にして送るが、ハッシュは他の媒体と同じく組み立てた Markdown（composeBody の出力）で取る。
  const result = { platform, title: article.title, url: res.url, id: res.id ?? null, reused: res.reused, basis: article.basis,
    published_at: new Date().toISOString(), route: 'actions:devlog-syndication', run_id: process.env.GITHUB_RUN_ID || 'local',
    account: accountOf(cfg),
    body_sha256: crypto.createHash('sha256').update(body).digest('hex'), identity_check: 'passed' };
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`[${cfg.label}] ${res.reused ? '既存の同題記事を採用' : '投稿した'}: ${res.url}`);
}

// ─────────────────────────────────────────────────────────────
// 公開確認
// ─────────────────────────────────────────────────────────────

/**
 * 本文の範囲を切り出す。**範囲が取れないのを「リンクが無い」にしない。**
 * ライブドアは `class="article-body-inner"` から `<!-- /記事本文 -->` まで（2026-10-03 に
 * https://captio.livedoor.blog/archives/17287077.html で実測）。終わりの印が無ければ、サイドバーの
 * リンクを本文と取り違えないよう範囲を取れない（null）とする。
 */
export function articleRegion(html, platform) {
  const kind = PLATFORMS[platform].kind;
  if (kind === 'devto') {
    const i = html.indexOf('id="article-body"');
    if (i === -1) return null;
    const j = html.indexOf('</article>', i);
    return html.slice(i, j === -1 ? undefined : j);
  }
  if (kind === 'livedoor') {
    const m = /class=["'][^"']*\barticle-body-inner\b[^"']*["']/.exec(html);
    if (!m) return null;
    const j = html.indexOf('<!-- /記事本文 -->', m.index);
    return j === -1 ? null : html.slice(m.index, j);
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
  if (PLATFORMS[platform].kind !== 'devto' && last.markerVisible === false) {
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

/**
 * 公開フィード（はてな・ライブドア）の entry が、この経路の記事か（本文末尾の開示文か印で見分ける）。
 * 開示文は媒体ごとに違うが、どれも「AIエージェントが自動で執筆・公開しています」を含む（OWNED_BLOG_FOOTER_JA の説明）。
 */
export function isPipelineFeedEntry(entry) {
  const c = String(entry?.content || '');
  return c.includes('AIエージェントが自動で執筆・公開しています') || c.includes(`${MARKER}:`);
}
/** 旧名（はてなだけだったころの名前）。 */
export const isPipelineHatena = isPipelineFeedEntry;

/**
 * 鍵待ちの媒体か（見張り用・純粋関数）。pendingUntilKey の媒体で、**この経路の投稿がまだ1本も無く**、
 * 鍵が登録されたことを示す環境変数（keySetEnv。ワークフローが真偽だけを渡す）が 'true' でないとき。
 * クラウドの外の見張りはこの環境変数を持たないので、「未設定」も「未登録」と同じに扱う。
 * この経路の投稿が1本でもあれば、鍵の有無にかかわらず通常の判定に戻す（止まっていれば alert になる）。
 */
export function keyPendingFor(cfg, posts, env = process.env) {
  if (cfg?.pendingUntilKey !== true) return false;
  if (String(env?.[cfg.keySetEnv] ?? '').trim() === 'true') return false;
  return !(posts || []).some((p) => p?.fromRun === true || isPipelineFeedEntry(p));
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

  // 鍵待ちの媒体（この経路の投稿がまだ無く、鍵も未登録）は、間隔の alert を出さずに注意だけにする。
  // 配信が始まっていないのはオーナー作業の待ちで、止まったのではない。
  if (keyPendingFor(cfg, posts, opts.env ?? process.env)) {
    r.key_pending = true;
    r.status = worse(r.status, 'warn');
    r.pipeline_age_reason = `投稿用の鍵（${cfg.secretEnv}）が未登録のため、この媒体の配信はまだ始まっていない（オーナー作業）`;
    r.problems.push(r.pipeline_age_reason);
    return r;
  }

  // 直近 scan 本のうち、この経路の最新記事と、since 以降のこの経路以外の記事。
  // 印・この run の公開結果は経路の出力証拠だけであり、自然 schedule や人介入ゼロの証明ではない。
  const pipelineUnknownReasons = posts.some((p) => watchPublishedTime(p.published_at) === null)
    ? ['公開一覧に公開日時を読めない記事があるため、この経路の最新を断定できない'] : [];
  let pipeline = null;
  for (const p of sorted.slice(0, opts.scan)) {
    let isPipe = false, disclosure = null;
    if (cfg.kind === 'devto') {
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
      isPipe = p.fromRun === true || isPipelineFeedEntry(p);
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
    if (cfg.kind === 'devto' && pipeline.disclosure !== 'fully_autonomous') {
      r.status = 'alert'; r.problems.push(`この経路の最新記事の AI 開示が「${pipeline.disclosure}」（fully_autonomous でない）`);
    }
    // はてな・ライブドアは「使用済みの題材」を公開フィードの本文にある印から読む。印が消えていると題材の重複防止が効かない。
    // この run の投稿はまだフィードに無い（本文を読めない）ので、次の見張りで確かめる。
    if (cfg.kind !== 'devto' && pipeline.fromRun) {
      r.notes.push('この run の投稿はまだ公開フィードに出ていないので、印（題材の記録）の確認は次の見張りで行う');
    } else if (cfg.kind !== 'devto' && !feedBases(pipeline).length) {
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
    lines.push(`- ${r.label}: ${r.status}${r.key_pending ? '（鍵待ち）' : ''} / 最新 ${r.age_hours ?? '—'} 時間前${r.latest ? `「${r.latest.title}」` : ''}`);
    if (r.pipeline_latest) {
      const rels = (r.pipeline_latest.site_links || []).map((l) => `rel="${l.rel || 'なし'}"`).join(', ');
      lines.push(`  - この経路の最新: ${r.pipeline_latest.url}（${r.pipeline_age_hours ?? '—'} 時間前 / 間隔 ${r.pipeline_age_status} / ${rels || '自社リンク未確認'}${PLATFORMS[r.platform].kind === 'devto' ? ` / 開示 ${r.pipeline_latest.disclosure}` : ''}）`);
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
      const hcap = await threw(() => publishHatena(PLATFORMS.hatena, art, 'k', 'b', { now }));
      assert(hcap && hcap.includes('24時間') && hPosts === 0, `**はてなで公開フィードが古いときに連投した**（${hcap} / POST ${hPosts} 回）`);
      hPosts = 0;
      globalThis.fetch = hatena('<feed></feed>', 201);
      const hEmpty = await threw(() => publishHatena(PLATFORMS.hatena, art, 'k', 'b', { now }));
      assert(hEmpty && hPosts === 0, `**はてなの空の一覧を「投稿が無い」と読んで出した**（POST ${hPosts} 回）`);
      hPosts = 0;
      globalThis.fetch = hatena(feed(hoursAgo(3), 'yes'), 500);
      const h5 = await threw(() => publishHatena(PLATFORMS.hatena, art, 'k', 'b', { now }));
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

  // ── 2026-10-03: はてな「メモの設計図」とライブドアを足した分 ──────────────────
  await t('設定: 全媒体の kind・鍵・https の URL がそろい、壊すと落ちる（ワークフローとも一致）', () => {
    const problems = platformConfigProblems();
    assert(problems.length === 0, `本番の設定に穴: ${problems.join(' / ')}`);
    assert(Object.values(PLATFORMS).every((c) => accountOf(c)), 'アカウント名の無い媒体がある');
    for (const k of ['secretEnv', 'hatenaId']) {
      assert(PLATFORMS.hatenadiary[k] === PLATFORMS.hatena[k], `はてなの2つで ${k} が違う（はてなのAPIキーはアカウント単位）`);
    }
    const pending = Object.keys(PLATFORMS).filter((p) => PLATFORMS[p].pendingUntilKey === true);
    assert(pending.join() === 'livedoor', `鍵待ちの媒体の指定が違う（鍵のある媒体を鍵待ちにすると、鍵が消えても黙って休む）: ${pending}`);
    assert(siblingsOf('hatena').sort().join() === 'hatenadiary,livedoor' && siblingsOf('livedoor').sort().join() === 'hatena,hatenadiary'
      && siblingsOf('devto').length === 0, `姉妹ブログ: ${siblingsOf('hatena')}`);
    const breakages = [
      ['http の URL', (c) => { c.livedoor.atomUrl = 'http://livedoor.blogcms.jp/atompub/captio/article'; }, /https でない/],
      ['知らない kind', (c) => { c.hatenadiary.kind = 'hatena-diary'; }, /知らない kind/],
      ['鍵の名前', (c) => { c.livedoor.secretEnv = 'livedoor'; }, /secretEnv/],
      ['開示文が無い', (c) => { c.hatenadiary.footer = '\n'; }, /開示文/],
      ['ブログIDと atomUrl の食い違い', (c) => { c.hatenadiary.blogId = 'simplememofast.hatenablog.com'; }, /食い違う/],
      ['固定カテゴリが無い', (c) => { c.livedoor.categories = []; }, /固定のカテゴリ/],
      ['鍵待ちなのに keySetEnv が無い', (c) => { delete c.livedoor.keySetEnv; }, /keySetEnv/],
      ['kind ごとの欄の書き落とし', (c) => { delete c.livedoor.publicHost; }, /publicHost が無い/],
    ];
    for (const [name, mutate, expect] of breakages) {
      const copy = Object.fromEntries(Object.entries(PLATFORMS).map(([k, v]) => [k, { ...v }]));
      mutate(copy);
      const ps = platformConfigProblems(copy);
      assert(ps.some((p) => expect.test(p)), `「${name}」で落ちない: ${ps.join(' / ')}`);
    }
    // ワークフローが選べる・回す・鍵を渡す媒体と、この表が一致する（片方だけ足すと、その媒体は回らないか鍵が無いまま回る）
    const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/devlog-syndication.yml'), 'utf8');
    for (const [p, c] of Object.entries(PLATFORMS)) {
      assert(new RegExp(`platform: \\[[^\\]]*\\b${p}\\b[^\\]]*\\]`).test(wf), `ワークフローの matrix に ${p} が無い`);
      assert(new RegExp(`options: \\[all,[^\\]]*\\b${p}\\b[^\\]]*\\]`).test(wf), `workflow_dispatch の選択肢に ${p} が無い`);
      assert(new RegExp(`matrix\\.platform == '${p}'[^\\n]*secrets\\.${c.secretEnv}`).test(wf), `ワークフローが ${p} に ${c.secretEnv} を渡していない`);
    }
    assert(wf.includes(`${PLATFORMS.livedoor.keySetEnv}: \${{ secrets.${PLATFORMS.livedoor.secretEnv} != '' }}`), '見張りに鍵の登録の有無（真偽）を渡していない');
  });

  await t('門: 鍵の無い媒体 — 鍵待ちは休み（key_pending）、鍵のある媒体は投稿する番に落とす（no_key）、試験実行は鍵を見ない', () => {
    const base = { stop: go, latestIso: hoursAgo(70), postsLast24h: 0, now, minIntervalHours: 66 };
    const kp = decideGate({ ...base, keyMissing: true, pendingUntilKey: true, secretEnv: 'LIVEDOOR_API_KEY' });
    assert(kp.due === false && kp.code === 'key_pending' && kp.reason.includes('LIVEDOOR_API_KEY') && kp.reason.includes('オーナー作業'), JSON.stringify(kp));
    assert(decideGate({ ...base, keyMissing: true, pendingUntilKey: true, readError: 'HTTP 503' }).code === 'key_pending',
      '鍵待ちの媒体を「読めない」で赤くした（鍵が無ければどのみち出さない）');
    assert(decideGate({ ...base, stop: { stopped: true, reason: 't' }, keyMissing: true, pendingUntilKey: true }).code === 'stopped', '停止より鍵待ちを先にした');
    const nk = decideGate({ ...base, keyMissing: true, secretEnv: 'DEVTO_API_KEY' });
    assert(nk.due === false && nk.code === 'no_key' && nk.reason.includes('DEVTO_API_KEY'), `**鍵の無い投稿の番を通した**: ${JSON.stringify(nk)}`);
    assert(decideGate({ ...base, latestIso: hoursAgo(30), keyMissing: true, force: true }).code === 'no_key', 'force で鍵の無い投稿を通した');
    assert(decideGate({ ...base, latestIso: null, keyMissing: true }).code === 'no_key', '初回の投稿で鍵を見ない');
    // 旧ワークフローは「投稿する番」のときだけ鍵を見ていた。間隔待ち・読めない・停止は今までどおり先に出す
    assert(decideGate({ ...base, latestIso: hoursAgo(30), keyMissing: true }).code === 'too_soon', '間隔待ちを no_key にした');
    assert(decideGate({ ...base, keyMissing: true, readError: 'HTTP 503' }).code === 'unreadable', '読めないを no_key にした');
    assert(decideGate({ ...base, postsLast24h: 1, keyMissing: true }).code === 'daily_cap', '上限を no_key にした');
    for (const pendingUntilKey of [true, false]) {
      const dr = decideGate({ ...base, keyMissing: true, pendingUntilKey, dryRun: true });
      assert(dr.due === true && dr.code === 'dry_run', `試験実行で鍵を見た（pendingUntilKey=${pendingUntilKey}）: ${JSON.stringify(dr)}`);
    }
    assert(decideGate({ ...base, pendingUntilKey: true }).code === 'interval_elapsed', '鍵が登録された後も鍵待ちのまま');
  });

  await t('Markdown→HTML: 見出し・段落・リスト・引用・表・コード・リンク。それ以外の HTML はエスケープし、印の行だけ素通し', () => {
    const md = [
      '# 一つ目', '', '段落の一行目は **太字** と *斜体* と `a<b>_c` を含む。', '二行目 file_name_here と 5 * 3 = 15。', '',
      '## 二つ目', '### 三つ目', '#### 四つ目', '##### 五つ目', '',
      '> 引用の一行目', '> 引用の二行目', '',
      '- 項目A [説明の文字](https://simplememofast.com/obsidian/)', '- 項目B', '  - 入れ子B1', '- 項目C', '',
      '1. 手順一', '2. 手順二', '',
      '| 列A | 列B |', '|:---|---:|', '| 1 \\| 2 | <i>x</i> |', '',
      '```js', 'const a = 1 < 2 && "x";', '```', '',
      '---', '',
      '<script>alert(1)</script> と <a href="https://evil.example/">生のリンク</a> と [危ない](javascript:alert(1)) と ![画像](https://example.com/a.png)',
      '<!-- devlog-syndication: basis=S-20260903-x; route=actions -->',
      '<!-- devlog-syndication: basis=<b>x</b> -->',
    ].join('\n');
    const html = markdownToHtml(md);
    const has = (s, why) => assert(html.includes(s), `${why}: ${s}\n${html}`);
    has('<h2>一つ目</h2>', '# を h2 にしない');
    has('<h2>二つ目</h2>', '## を h2 にしない');
    has('<h3>三つ目</h3>', '### を h3 にしない');
    has('<h4>四つ目</h4>', '#### を h4 にしない');
    has('<h4>五つ目</h4>', '##### を h4 に丸めない');
    has('<p>段落の一行目は <strong>太字</strong> と <em>斜体</em> と <code>a&lt;b&gt;_c</code> を含む。<br>二行目 file_name_here と 5 * 3 = 15。</p>', '段落・改行・強調・コード');
    has('<blockquote><p>引用の一行目<br>引用の二行目</p></blockquote>', '引用');
    has('<ul><li>項目A <a href="https://simplememofast.com/obsidian/">説明の文字</a></li><li>項目B<ul><li>入れ子B1</li></ul></li><li>項目C</li></ul>', '箇条書き・入れ子・リンク');
    has('<ol><li>手順一</li><li>手順二</li></ol>', '番号付き');
    has('<table><thead><tr><th style="text-align:left">列A</th><th style="text-align:right">列B</th></tr></thead><tbody><tr><td style="text-align:left">1 | 2</td><td style="text-align:right">&lt;i&gt;x&lt;/i&gt;</td></tr></tbody></table>', '表');
    has('<pre><code class="language-js">const a = 1 &lt; 2 &amp;&amp; &quot;x&quot;;</code></pre>', 'コードブロック');
    has('<hr>', '区切り線');
    has('&lt;script&gt;alert(1)&lt;/script&gt;', 'script をエスケープしない');
    has('<!-- devlog-syndication: basis=S-20260903-x; route=actions -->', '印の行を素通ししない');
    // 落ちる側: 生の HTML・http(s) 以外のリンク・画像・rel を通さない
    assert(!/<script|<i>|<b>|<a href="https:\/\/evil|href="javascript:|<img/i.test(html), `**生の HTML か危ないリンクを通した**: ${html}`);
    assert(html.includes('[危ない](javascript:alert(1))'), 'javascript: のリンクを文字のまま残していない');
    assert(!/\brel=/.test(html), '自社リンクに rel を付けた（dofollow でなくなる）');
    assert(!html.includes('<!-- devlog-syndication: basis=<b>'), '中に < > を含む印の行を素通しした');
    // 題材の記録は <em> になり、readMarkers で読める（ライブドアの公開フィードの本文から題材を読むため）
    const body = composeBody({ body_markdown: '本文。', basis: 'S-20260907-fixed-but-unconfirmed' }, 'livedoor', { runId: '1', at: 'T' });
    const rendered = markdownToHtml(body);
    assert(rendered.includes(`<p><em>${VISIBLE_BASIS_LABEL}: S-20260907-fixed-but-unconfirmed</em></p>`), `見える記録が <em> にならない: ${rendered}`);
    const noComment = rendered.replace(/<!--[\s\S]*?-->/g, '');
    assert(readMarkers(noComment).some((m) => m.basis === 'S-20260907-fixed-but-unconfirmed' && m.visible === 'yes'), 'コメントが消えても題材を読めない');
    assert(rendered.includes('<hr>') && rendered.includes('<em>この記事は、シンプルメモの開発元が運営するブログの記事です。'), '開示文を HTML にしていない');
    // 描いたリンクは、検証が拾ったリンクの部分集合（検証していない URL をリンクにしない）
    const checked = new Set(extractLinks(md).map((l) => l.url));
    for (const m of html.matchAll(/<a href="([^"]+)"/g)) assert(checked.has(decodeEntities(m[1])), `検証が見ていない URL をリンクにした: ${m[1]}`);
  });

  await t('ライブドアの entry: エスケープ・カテゴリ固定・draft no（読み戻すと元の題名と HTML）', () => {
    const xml = livedoorEntryXml({ title: 'A&B <x> "q"', html: '<p>a &amp; b</p>', categories: PLATFORMS.livedoor.categories });
    assert(xml.includes('<title>A&amp;B &lt;x&gt; &quot;q&quot;</title>'), `題名のエスケープ: ${xml}`);
    assert(xml.includes('<content type="text/html">&lt;p&gt;a &amp;amp; b&lt;/p&gt;</content>'), `本文のエスケープ: ${xml}`);
    assert(!/<p>/.test(xml), '**HTML をエスケープせずに XML へ入れた**');
    assert((xml.match(/<category /g) || []).length === 1 && xml.includes('<category term="メモ術"/>'), `カテゴリが固定でない: ${xml}`);
    assert(xml.includes('<app:control><app:draft>no</app:draft></app:control>') && xml.includes('xmlns:app="http://www.w3.org/2007/app"'), '下書きで出す形になっている');
    const back = parseAtomFeed(`<feed>${xml.replace(/^<\?xml[^>]*>\s*/, '')}</feed>`);
    assert(back.length === 1 && back[0].title === 'A&B <x> "q"' && back[0].content === '<p>a &amp; b</p>' && back[0].draft === false, JSON.stringify(back));
  });

  await t('ライブドアの公開フィード（Atom 0.3・issued・CDATA）を読み、はてなの読み方は変えない', () => {
    // 2026-10-03 に https://captio.livedoor.blog/atom.xml で実測した形（本文は短くした）
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xml:lang="ja">
<title>captio式シンプルメモ開発日誌</title>
<link rel="alternate" type="text/html" href="https://captio.livedoor.blog/" />
<modified>2026-10-03T14:19:04Z</modified>
<entry>
<title>メモの入り口は、増やすより減らすほうがいい</title>
<link rel="alternate" type="text/html" href="https://captio.livedoor.blog/archives/17287077.html" />
<modified>2026-09-22T09:55:24Z</modified>
<issued>2026-09-22T18:55:24+09:00</issued>
<id>tag:blog.livedoor.jp,2026:captio.17287077</id>
<summary type="text/plain">先に結論を書く。</summary>
<dc:subject>メモ術</dc:subject>
<content type="text/html" mode="escaped" xml:lang="ja" xml:base="https://captio.livedoor.blog/archives/17287077.html">
<![CDATA[<p>A &amp; B と <a href="https://simplememofast.com/obsidian/" target="_blank" rel="noopener">説明</a>。</p><p><em>題材の記録: S-20260907-fixed-but-unconfirmed</em></p>]]>
</content>
</entry>
<entry>
<title>声で書いたメモは、どこで文字に変わっているのか</title>
<link rel="alternate" type="text/html" href="https://captio.livedoor.blog/archives/17242627.html" />
<modified>2026-09-19T10:23:12Z</modified>
<issued>2026-09-19T19:05:51+09:00</issued>
<content type="text/html" mode="escaped"><![CDATA[<p>旧ローカルタスクの記事</p>]]></content>
</entry>
</feed>`;
    const e = parseAtomFeed(feed);
    assert(e.length === 2, `entry の数: ${e.length}（feed 直下の modified を entry と読んだ可能性）`);
    assert(e[0].published_at === '2026-09-22T18:55:24+09:00' && e[1].published_at === '2026-09-19T19:05:51+09:00',
      `issued を公開時刻にしていない（編集で動く modified を読んだ）: ${e.map((x) => x.published_at)}`);
    assert(e[0].url === 'https://captio.livedoor.blog/archives/17287077.html' && e[0].title === 'メモの入り口は、増やすより減らすほうがいい', JSON.stringify(e[0]));
    assert(e[0].content.startsWith('\n<p>A &amp; B') && !e[0].content.includes('CDATA'), `CDATA の剥がし方が違う（中の実体参照を解いた・残した）: ${e[0].content.slice(0, 80)}`);
    assert(feedBases(e[0]).join() === 'S-20260907-fixed-but-unconfirmed' && feedBases(e[1]).length === 0, '本文の見える記録から題材を読めない');
    assert(e[0].draft === null && e[0].summary === '先に結論を書く。', '公開フィードに無い下書き欄を読んだ');
    assert(isPipelineFeedEntry(e[0]) === false && isPipelineFeedEntry({ content: OWNED_BLOG_FOOTER_JA }) === true, '開示文で経路を見分けられない');
    const only = parseAtomFeed('<feed><entry><title>t</title><modified>2026-09-01T00:00:00Z</modified></entry></feed>');
    assert(only[0].published_at === '2026-09-01T00:00:00Z', 'modified しか無い entry の日時を読めない');
    assert(parseAtomFeed('<feed><entry><title>t</title></entry></feed>')[0].published_at === null, '日時の無い entry に日時を作った');
    // はてな（Atom 1.0）は published が issued・updated より先。CDATA の無い本文は実体参照を解く（従来どおり）
    const h = parseAtomFeed('<feed><entry><title>題 &amp; 名</title><published>2026-09-22T21:29:55+09:00</published><updated>2026-09-30T00:00:00+09:00</updated><content type="html">&lt;p&gt;A &amp;amp; B&lt;/p&gt;</content></entry></feed>');
    assert(h[0].title === '題 & 名' && h[0].published_at === '2026-09-22T21:29:55+09:00' && h[0].content === '<p>A &amp; B</p>', JSON.stringify(h));
    assert(parseAtomFeed('<feed><entry><title type="text">属性つき</title></entry></feed>')[0].title === '属性つき', '属性つきの題名を読めない（同題の判定が効かない）');
  });

  await t('ライブドアの公開URL: http→https にそろえ、無ければ edit の記事番号から組み立て、どちらも無ければ null', () => {
    const cfg = PLATFORMS.livedoor;
    assert(livedoorPublicUrl('<entry><link rel="alternate" type="text/html" href="http://captio.livedoor.blog/archives/17300000.html"/><link rel="edit" href="https://livedoor.blogcms.jp/atompub/captio/article/17300000"/></entry>', cfg)
      === 'https://captio.livedoor.blog/archives/17300000.html', 'http の公開URLを https にしない');
    assert(livedoorPublicUrl('<entry><link rel="edit" type="application/atom+xml;type=entry" href="https://livedoor.blogcms.jp/atompub/captio/article/17300001"/></entry>', cfg)
      === 'https://captio.livedoor.blog/archives/17300001.html', 'edit の link から組み立てない');
    assert(livedoorPublicUrl('<entry><link rel="edit" href="https://livedoor.blogcms.jp/atompub/captio/article/17300002/"/><link rel="enclosure" href="https://img.example/1.png" type="image/png"/></entry>', cfg)
      === 'https://captio.livedoor.blog/archives/17300002.html', '末尾の / で読めない');
    assert(livedoorPublicUrl('<entry><link rel="edit" href="https://livedoor.blogcms.jp/atompub/captio/category"/><link rel="enclosure" href="https://img.example/1.png" type="image/png"/></entry>', cfg) === null,
      '**記事番号の無い edit・enclosure を公開URLにした**');
    assert(livedoorPublicUrl('<entry></entry>', cfg) === null && livedoorPublicUrl('', cfg) === null, '何も無いのに URL を作った');
    assert(normalizeLivedoorUrl('http://example.com/a', cfg) === 'http://example.com/a', '公開ホストでない URL を書き換えた');
    assert(normalizeLivedoorUrl('https://captio.livedoor.blog/archives/1.html', cfg) === 'https://captio.livedoor.blog/archives/1.html', 'https をそのまま返さない');
  });

  await t('文脈: 姉妹ブログの題材を合流し、記事は sibling_posts に分け、読めない姉妹は記録して続ける', () => {
    const own = { usedBases: ['S-A'] };
    const m = mergeSiblingContext(own, [
      { platform: 'hatenadiary', posts: [{ title: '題1', url: 'https://x/1', published_at: '2026-10-01T09:53:26+09:00', opening: '書き出し' }], usedBases: ['S-B', 'S-A', 'page:obsidian/index.html'] },
      { platform: 'livedoor', error: 'HTTP 503' },
    ]);
    assert(m.used_bases.slice().sort().join() === 'S-A,S-B,page:obsidian/index.html' && m.sibling_bases_added === 2, JSON.stringify(m));
    assert(m.sibling_posts.length === 1 && m.sibling_posts[0].platform === 'hatenadiary' && m.sibling_posts[0].opening === '書き出し', JSON.stringify(m.sibling_posts));
    assert(m.sibling_read_errors.length === 1 && m.sibling_read_errors[0].platform === 'livedoor' && m.sibling_read_errors[0].error === 'HTTP 503', '読めない姉妹を記録しない');
    const alone = mergeSiblingContext(own, []);
    assert(alone.used_bases.join() === 'S-A' && alone.sibling_bases_added === 0 && !alone.sibling_posts.length, '姉妹が無いのに題材が増えた');
    assert(mergeSiblingContext({ usedBases: [] }, [{ platform: 'hatena', error: 'x' }]).used_bases.length === 0, '読めない姉妹から題材を作った');
  });

  await t('記事の検査（日本語）: 姉妹ブログで使った題材・近い題名を落とし、ライブドアは tags が無くても通す', async () => {
    const link = 'https://simplememofast.com/obsidian/';
    const merged = mergeSiblingContext({ usedBases: [] }, [
      { platform: 'hatenadiary', posts: [{ title: '自動でたまるメモは、日付ごとか一枚の受信箱か', url: 'https://x/1' }], usedBases: ['S-20260903-report-said-zero'] },
    ]);
    const ctx = {
      platform: 'livedoor', used_bases: merged.used_bases, sibling_posts: merged.sibling_posts,
      seeds_available: [{ id: 'S-20260903-issue-closed-same-day', claim: '閉じた条件', numbers: [], drafts: { note: '下書き' } }],
      existing_posts: [{ title: 'メモの入り口は、増やすより減らすほうがいい' }],
      allowed_site_links: [{ url: link, file: 'obsidian/index.html' }],
    };
    const para = 'メモは書いた直後に一つの受信箱へ集まり、あとで見返すときに迷わない形にしておくと続きやすい。';
    const good = {
      platform: 'livedoor', title: '受信箱を一つにすると、メモは見返される', basis: 'S-20260903-issue-closed-same-day',
      sources: ['docs/story-seeds.md'],
      body_markdown: `${para.repeat(14)}\n\n## なぜ受信箱を一つにするのか\n\n${para.repeat(16)}\n\n## 向かない場面\n\n${para.repeat(16)}\n\n## 確かめ方\n\n仕組みは[メモをObsidianへ送る仕組みの説明](${link})にまとめてある。${para.repeat(14)}`,
    };
    const readFile = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
    const r = await validateArticle(good, ctx, { readFile });
    assert(r.ok, `通るべき記事が落ちた: ${r.problems.join(' | ')}`);
    const breakages = [
      ['姉妹ブログで使った題材', (a) => { a.basis = 'S-20260903-report-said-zero'; }, /この媒体か日本語の姉妹ブログで使用済み/],
      ['姉妹ブログの記事と同じ題名', (a) => { a.title = '自動でたまるメモは、日付ごとか一枚の受信箱か'; }, /姉妹ブログ（はてなブログ「メモの設計図」）の既存記事と題名が近い/],
      ['自媒体の記事と同じ題名', (a) => { a.title = 'メモの入り口は、増やすより減らすほうがいい'; }, /既存記事と題名が近い/],
      ['tags が多すぎる', (a) => { a.tags = ['a', 'b', 'c', 'd', 'e', 'f']; }, /tags は0〜5個/],
      ['自社リンクが3本（ライブドアは2本まで）', (a) => { a.body_markdown += ` [一](${link}) と [二](${link})`; }, /自社サイトへのリンクが 3 本（1〜2本）/],
    ];
    for (const [name, mutate, expect] of breakages) {
      const copy = JSON.parse(JSON.stringify(good)); mutate(copy);
      const res = await validateArticle(copy, ctx, { readFile });
      assert(res.ok === false && res.problems.some((p) => expect.test(p)), `「${name}」で期待した理由で落ちない: ${res.problems.join(' | ')}`);
    }
    // カテゴリを固定しない媒体（はてな）は、今までどおり tags が1つ以上要る
    const hatena = await validateArticle({ ...good, platform: 'hatena' }, { ...ctx, platform: 'hatena' }, { readFile });
    assert(hatena.ok === false && hatena.problems.some((p) => /tags は1〜5個（0個）/.test(p)), `はてなで tags なしを通した: ${hatena.problems.join(' | ')}`);
  });

  await t('投稿本文: 新しい2媒体は「開発元が運営するブログ」の開示文と見える題材の記録を付け、既存のはてなの開示文は変えない', () => {
    for (const p of ['hatenadiary', 'livedoor']) {
      const b = composeBody({ body_markdown: '本文', basis: 'S-20260903-x' }, p, { runId: '1', at: 'T' });
      assert(b.includes('シンプルメモの開発元が運営するブログの記事です') && b.includes('AIエージェントが自動で執筆・公開しています'), `${p}: 開示文 ${b}`);
      assert(b.includes(`\n*${VISIBLE_BASIS_LABEL}: S-20260903-x*\n`), `${p}: 見える題材の記録が無い`);
      assert(readMarkers(b).filter((m) => m.basis === 'S-20260903-x').length === 2, `${p}: 印と見える記録の両方が無い`);
      assert(isPipelineFeedEntry({ content: p === 'livedoor' ? markdownToHtml(b) : b }), `${p}: 見張りがこの経路の記事と見分けられない`);
    }
    const h = composeBody({ body_markdown: '本文', basis: 'S-X' }, 'hatena', { runId: '1', at: 'T' });
    assert(h.includes('シンプルメモ開発の公開記録（リポジトリと運用ログ）をもとに') && !h.includes('開発元が運営するブログ'), '既存のはてなの開示文を変えた');
  });

  await t('公開確認: ライブドアは article-body-inner〜「/記事本文」を本文とし、サイドバーを数えない。終わりの印が無ければ範囲を取れない', () => {
    const page = (rel, { robots = 'max-image-preview:large', end = '<!-- /記事本文 -->' } = {}) => `<html><head><meta name="robots" content="${robots}" /><title>題名の記事 : captio式シンプルメモ開発日誌</title><style>.article-body-inner{margin:0}</style></head><body><div class="article-body"><div class="article-body-inner"><p><a href="https://simplememofast.com/obsidian/" ${rel}>x</a></p></div></div>${end}<div class="sidebar"><a href="https://simplememofast.com/" rel="nofollow">side</a></div></body></html>`;
    const ok = inspectPublished(page('target="_blank" rel="noopener"'), 'livedoor', { title: '題名の記事' });
    assert(ok.ok === true && ok.siteLinks.length === 1 && ok.siteLinks[0].href === 'https://simplememofast.com/obsidian/', `dofollow を落とした・サイドバーを数えた: ${JSON.stringify(ok)}`);
    assert(!inspectPublished(page('rel="nofollow"'), 'livedoor', { title: '題名の記事' }).ok, 'nofollow を通した');
    assert(!inspectPublished(page('', { robots: 'noindex' }), 'livedoor', { title: '題名の記事' }).ok, 'noindex を通した');
    const noEnd = inspectPublished(page('rel="noopener"', { end: '' }), 'livedoor', { title: '題名の記事' });
    assert(noEnd.ok === false && noEnd.problems.some((p) => p.includes('本文の範囲')), `終わりの印が無いのにサイドバーまで本文にした: ${JSON.stringify(noEnd)}`);
    assert(!inspectPublished(page('rel="noopener"'), 'livedoor', { title: '別の題名' }).ok, '題名の無いページを通した');
  });

  await t('公開面: はてな「メモの設計図」とライブドアも、キャッシュを通さずに自分のフィードを読む（空は読めない）', async () => {
    const orig = globalThis.fetch;
    const seen = [];
    let body = '';
    try {
      globalThis.fetch = async (u) => { seen.push(String(u)); return new Response(body, { status: 200 }); };
      body = '<feed><entry><title>t</title><link href="https://simplememofast.hatenadiary.jp/entry/1"/><published>2026-10-01T09:53:26+09:00</published></entry></feed>';
      const hd = await publicPosts('hatenadiary');
      assert(hd.length === 1 && seen.at(-1).startsWith(`${PLATFORMS.hatenadiary.feedUrl}?fresh=`), `メモの設計図のフィードを読まない: ${seen.at(-1)}`);
      body = '<feed version="0.3" xmlns="http://purl.org/atom/ns#"><entry><title>t</title><link rel="alternate" type="text/html" href="https://captio.livedoor.blog/archives/1.html" /><issued>2026-09-22T18:55:24+09:00</issued></entry></feed>';
      const ld = await publicPosts('livedoor');
      assert(ld.length === 1 && ld[0].published_at === '2026-09-22T18:55:24+09:00' && seen.at(-1).startsWith(`${PLATFORMS.livedoor.feedUrl}?fresh=`), `ライブドアのフィードを読まない: ${seen.at(-1)}`);
      body = '<feed version="0.3"></feed>';
      let msg = null;
      try { await publicPosts('livedoor'); } catch (e) { msg = e.message; }
      assert(msg && msg.includes('entry が無い'), `**空のフィードを「投稿が無い」と読んだ**: ${msg}`);
    } finally {
      globalThis.fetch = orig;
    }
  });

  await t('投稿（はてな「メモの設計図」）: 自分の AtomPub の URL だけを使う（はてなブログ側へ出さない）', async () => {
    const orig = globalThis.fetch;
    const seen = [];
    const art = { title: '今回の記事', tags: ['メモ術'] };
    try {
      globalThis.fetch = async (u, o) => {
        seen.push({ u: String(u), method: o?.method || 'GET', auth: o?.headers?.authorization });
        if (o?.method === 'POST') return new Response('<entry><link rel="alternate" type="text/html" href="https://simplememofast.hatenadiary.jp/entry/2026/10/04/120000"/></entry>', { status: 201 });
        return new Response(`<feed><entry><title>前の記事</title><link rel="alternate" type="text/html" href="https://simplememofast.hatenadiary.jp/entry/1"/><published>${hoursAgo(70)}</published><app:control><app:draft>no</app:draft></app:control></entry></feed>`, { status: 200 });
      };
      const r = await publishHatena(PLATFORMS.hatenadiary, art, 'k', 'b', { now });
      assert(r.url === 'https://simplememofast.hatenadiary.jp/entry/2026/10/04/120000' && r.reused === false, JSON.stringify(r));
      assert(seen.length === 2 && seen.every((s) => s.u === PLATFORMS.hatenadiary.atomUrl), `別のブログの AtomPub へ出した: ${JSON.stringify(seen.map((s) => s.u))}`);
      assert(seen.every((s) => s.auth === 'Basic ' + Buffer.from('simplememofast:k').toString('base64')), 'はてなID で認証していない');
    } finally {
      globalThis.fetch = orig;
    }
  });

  await t('投稿（ライブドア）: 認証済みの一覧で同題・上限を確かめ直し、形が読めなければ公開フィードで確かめ、カテゴリ固定・作成は 5xx で送り直さない', async () => {
    const orig = globalThis.fetch;
    const cfg = PLATFORMS.livedoor;
    const art = { title: '今回の記事', tags: ['iOS', 'PKM'] };
    const body = composeBody({ body_markdown: '## 見出し\n\n本文と[仕組みの説明](https://simplememofast.com/obsidian/)。', basis: 'S-20260903-x' }, 'livedoor', { runId: '1', at: 'T' });
    const list = (entries) => `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:app="http://www.w3.org/2007/app">${entries.map((e) => `<entry><title type="text">${e.title}</title><link rel="alternate" type="text/html" href="${e.url ?? 'http://captio.livedoor.blog/archives/1.html'}"/>${e.published ? `<published>${e.published}</published>` : ''}${e.draft ? `<app:control><app:draft>${e.draft}</app:draft></app:control>` : ''}</entry>`).join('')}</feed>`;
    const publicFeed = (entries) => `<feed version="0.3" xmlns="http://purl.org/atom/ns#">${entries.map((e) => `<entry><title>${e.title}</title><link rel="alternate" type="text/html" href="https://captio.livedoor.blog/archives/9.html" />${e.published ? `<issued>${e.published}</issued>` : ''}<content type="text/html" mode="escaped"><![CDATA[<p>x</p>]]></content></entry>`).join('')}</feed>`;
    const created = '<entry xmlns="http://www.w3.org/2005/Atom"><link rel="alternate" type="text/html" href="http://captio.livedoor.blog/archives/17300000.html"/><link rel="edit" href="https://livedoor.blogcms.jp/atompub/captio/article/17300000"/></entry>';
    let posts = [], gets = [], warnings = [];
    const mock = ({ listXml = '', listStatus = 200, feedXml = null, postStatus = 201, postBody = created }) => async (u, o) => {
      u = String(u);
      if (o?.method === 'POST') { posts.push({ u, headers: o.headers, body: o.body }); return new Response(postBody, { status: postStatus }); }
      gets.push({ u, auth: o?.headers?.authorization });
      if (u === cfg.atomUrl) return new Response(listXml, { status: listStatus });
      if (typeof feedXml === 'string' && u.startsWith(`${cfg.feedUrl}?fresh=`)) return new Response(feedXml, { status: 200 });
      throw new Error(`想定外の取得: ${u}`);
    };
    const reset = (m) => { posts = []; gets = []; warnings = []; globalThis.fetch = mock(m); };
    const run = (opts = {}) => publishLivedoor(cfg, art, 'k', body, { now, warn: (w) => warnings.push(w), ...opts });
    const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
    const old = { title: '前の記事', published: hoursAgo(70), draft: 'no' };
    try {
      reset({ listXml: list([old]) });
      const ok = await run();
      assert(ok.url === 'https://captio.livedoor.blog/archives/17300000.html' && ok.reused === false && posts.length === 1, JSON.stringify(ok));
      const sent = posts[0];
      assert(sent.headers['content-type'] === 'application/atom+xml;type=entry', `送る形: ${sent.headers['content-type']}`);
      assert(sent.u === 'https://livedoor.blogcms.jp/atompub/captio/article', `送り先: ${sent.u}`);
      assert(sent.headers.authorization === 'Basic ' + Buffer.from('captio:k').toString('base64'), 'Basic 認証のユーザー名がライブドアID（captio）でない');
      assert((sent.body.match(/<category /g) || []).length === 1 && sent.body.includes('<category term="メモ術"/>') && !/iOS|PKM/.test(sent.body),
        `**カテゴリを固定していない（tags を送った）**: ${sent.body.slice(0, 300)}`);
      assert(sent.body.includes('&lt;h2&gt;見出し&lt;/h2&gt;') && sent.body.includes('&lt;a href=&quot;https://simplememofast.com/obsidian/&quot;&gt;')
        && sent.body.includes('<app:draft>no</app:draft>'), `本文を HTML にして送っていない: ${sent.body.slice(0, 400)}`);
      assert(!warnings.length, `読める一覧なのに注意を出した: ${warnings}`);

      reset({ listXml: list([{ title: '今回の記事', published: hoursAgo(2), draft: 'no', url: 'http://captio.livedoor.blog/archives/5.html' }]) });
      const same = await run();
      assert(same.reused === true && same.url === 'https://captio.livedoor.blog/archives/5.html' && posts.length === 0, `同題の採用が上限より先に効かない: ${JSON.stringify(same)}`);
      reset({ listXml: list([{ title: '今回の記事', published: hoursAgo(2), draft: 'yes' }]) });
      const draft = await threw(run);
      assert(draft && draft.includes('下書き') && posts.length === 0, `**下書きの同題を採用した・出した**（${draft} / POST ${posts.length} 回）`);

      reset({ listXml: list([{ title: '別の記事', published: hoursAgo(3) }]) });
      const cap = await threw(() => run({ force: true }));
      assert(cap && cap.includes('24時間') && posts.length === 0, `**app:draft の無い記事を数えずに連投した**（${cap} / POST ${posts.length} 回）`);
      reset({ listXml: list([{ title: '別の記事', published: hoursAgo(30), draft: 'no' }]) });
      const gap = await threw(run);
      assert(gap && gap.includes('66 時間未満') && posts.length === 0, `間隔の足りない投稿を出した（${gap}）`);
      assert((await run({ force: true })).reused === false && posts.length === 1, 'force で間隔を越えられない');

      // 一覧の形が読めない → 公開フィードで確かめる（注意つき）。公開フィードに24時間以内があれば止める
      reset({ listXml: '<html>ログイン</html>', feedXml: publicFeed([{ title: '別の記事', published: hoursAgo(3) }]) });
      const viaFeed = await threw(run);
      assert(viaFeed && viaFeed.includes('公開フィード') && viaFeed.includes('24時間') && posts.length === 0 && warnings.length === 1,
        `**読めない一覧を「投稿が無い」と読んだ**（${viaFeed} / POST ${posts.length} 回 / 注意 ${warnings.length}）`);
      reset({ listXml: list([{ title: '日付なし' }]), feedXml: publicFeed([old]) });
      assert((await run()).reused === false && posts.length === 1 && warnings.length === 1 && gets.some((g) => g.u.startsWith(`${cfg.feedUrl}?fresh=`)),
        '日付の読めない一覧で公開フィードに切り替えない');
      reset({ listXml: '<feed></feed>', feedXml: publicFeed([{ title: '日付なし' }]) });
      const undated = await threw(run);
      assert(undated && undated.includes('日付') && posts.length === 0, `公開フィードでも日付を読めないのに出した（${undated}）`);

      // 401: WSSE で1回送り直し、それでも通らなければ鍵の誤りとして止める（投稿しない）
      reset({ listStatus: 401 });
      const auth = await threw(run);
      assert(auth && auth.includes('認証が通らない') && auth.includes('LIVEDOOR_API_KEY') && posts.length === 0
        && gets.length === 2 && gets[0].auth.startsWith('Basic ') && gets[1].auth.startsWith('WSSE '), `401 の扱い: ${auth} / ${JSON.stringify(gets)}`);
      reset({ listStatus: 403 });
      const forbidden = await threw(run);
      assert(forbidden && forbidden.includes('HTTP 403') && posts.length === 0 && gets.length === 1, `403 の扱い: ${forbidden}`);
      // 作成の 5xx は送り直さない（作成済みかもしれない）。応答に公開URLが無ければ失敗
      reset({ listXml: list([old]), postStatus: 502 });
      const e5 = await threw(run);
      assert(e5 && posts.length === 1, `**作成の 5xx を送り直した**（POST ${posts.length} 回 / ${e5}）`);
      reset({ listXml: list([old]), postBody: '<entry></entry>' });
      const noUrl = await threw(run);
      assert(noUrl && noUrl.includes('公開URLが無い') && posts.length === 1, `公開URLの無い応答を成功にした（${noUrl}）`);
    } finally {
      globalThis.fetch = orig;
    }
  });

  await t('見張り: 鍵待ちの判定（この経路の投稿が無く・鍵が未登録のときだけ。投稿が1本でもあれば通常の判定）', () => {
    const ld = PLATFORMS.livedoor;
    const old = [{ title: '旧', content: '<p>旧ローカルタスクの記事</p>' }];
    const mine = [{ title: '新', content: `<p>本文</p>${OWNED_BLOG_FOOTER_JA}` }];
    assert(keyPendingFor(ld, old, {}) === true, '鍵も投稿も無いのに鍵待ちにしない（クラウドの外の見張りは環境変数を持たない）');
    assert(keyPendingFor(ld, old, { LIVEDOOR_KEY_SET: 'false' }) === true, '鍵が未登録なのに鍵待ちにしない');
    assert(keyPendingFor(ld, old, { LIVEDOOR_KEY_SET: 'true' }) === false, '**鍵が登録されたのに鍵待ちのまま（止まっても alert にならない）**');
    assert(keyPendingFor(ld, [...old, ...mine], {}) === false, '**この経路の投稿があるのに鍵待ちにした（止まっても alert にならない）**');
    assert(keyPendingFor(ld, [{ title: 'x', fromRun: true }], {}) === false, 'この run の投稿があるのに鍵待ちにした');
    assert(keyPendingFor(PLATFORMS.hatenadiary, old, {}) === false && keyPendingFor(PLATFORMS.devto, [], {}) === false, '鍵待ちでない媒体を鍵待ちにした');
  });

  await t('見張り: ライブドアは鍵の登録前なら alert でなく warn、登録後・この経路の投稿後は通常の判定（止まれば alert）', async () => {
    const orig = globalThis.fetch;
    let entries = [];
    try {
      globalThis.fetch = async (u, o) => {
        assert(!o?.method || o.method === 'GET', '見張りが外部を書き換えた');
        u = String(u);
        if (u.startsWith(`${PLATFORMS.livedoor.feedUrl}?fresh=`)) {
          return new Response(`<feed version="0.3" xmlns="http://purl.org/atom/ns#">${entries.map((e) => `<entry><title>${e.title}</title><link rel="alternate" type="text/html" href="${e.url}" /><issued>${e.published}</issued><content type="text/html" mode="escaped"><![CDATA[${e.html}]]></content></entry>`).join('')}</feed>`);
        }
        const p = entries.find((e) => e.url === u);
        if (p) return new Response(`<html><head><meta name="robots" content="max-image-preview:large" /><title>${p.title} : 開発日誌</title></head><body><div class="article-body-inner">${p.html}</div><!-- /記事本文 --></body></html>`);
        throw new Error(`想定外の取得: ${u}`);
      };
      const opts = { ...WATCH, wait: async () => {} };
      const old = { title: '旧ローカルタスクの記事', url: 'https://captio.livedoor.blog/archives/1.html', published: hoursAgo(270),
        html: '<p>旧</p><p><a href="https://simplememofast.com/" target="_blank" rel="noopener">x</a></p>' };
      entries = [old];
      const pending = await watchPlatform('livedoor', now, { ...opts, env: {} }, go);
      assert(pending.status === 'warn' && pending.key_pending === true && pending.problems.some((p) => p.includes('LIVEDOOR_API_KEY') && p.includes('オーナー作業')),
        `鍵の登録前を alert にした・理由が無い: ${JSON.stringify(pending)}`);
      const keySet = await watchPlatform('livedoor', now, { ...opts, env: { LIVEDOOR_KEY_SET: 'true' } }, go);
      assert(keySet.status === 'alert' && !keySet.key_pending, `**鍵を登録した後も止まっているのを隠した**: ${JSON.stringify(keySet)}`);
      const md = composeBody({ body_markdown: '本文と[説明](https://simplememofast.com/obsidian/)。', basis: 'S-20260903-x' }, 'livedoor', { runId: '1', at: 'T' });
      const mine = { title: 'この経路の記事', url: 'https://captio.livedoor.blog/archives/2.html', published: hoursAgo(20), html: markdownToHtml(md) };
      entries = [mine, old];
      const running = await watchPlatform('livedoor', now, { ...opts, env: {} }, go);
      assert(running.status === 'ok' && running.pipeline_age_hours === 20 && running.key_pending !== true
        && running.pipeline_latest?.site_links?.[0]?.rel === '', `この経路の投稿があるのに通常の判定にならない: ${JSON.stringify(running)}`);
      entries = [{ ...mine, published: hoursAgo(300) }, old];
      const stale = await watchPlatform('livedoor', now, { ...opts, env: {} }, go);
      assert(stale.status === 'alert' && !stale.key_pending, `**この経路の投稿が止まっているのに鍵待ちで隠した**: ${JSON.stringify(stale)}`);
    } finally {
      globalThis.fetch = orig;
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
