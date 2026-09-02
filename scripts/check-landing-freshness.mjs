#!/usr/bin/env node
/**
 * 着地面（トップ日英）が、**出荷済み・公表済みの現実から遅れていないか**を見る。
 *
 *   node scripts/check-landing-freshness.mjs           # 表示（期限が近いバッジも出す）
 *   node scripts/check-landing-freshness.mjs --check   # CI: 遅れていたら exit 1
 *   node scripts/check-landing-freshness.mjs --selftest
 *
 * 【なぜ要るか】
 * [2026-09-03] プレスリリース配信に合わせてトップを見に行ったら、この4つが同時に出た:
 *
 *   - 「**最新バージョン3.9**（2026年7月）」…… 公開中は 5.8.4。**2か月・5版ぶん古い**
 *   - 「**NEW · v3.0**」のバッジが2つ …… v3.0 は5版前
 *   - 配信本文が `/` へリンクしているのに、その `/` から `/autopilot/` へ行けない
 *   - 配信で名乗った率（AI実行率・総合自動化率）がトップに1つも無い
 *
 * **どれも、どの検査にも当たらなかった。**このリポジトリの検査は
 * 「台帳と台帳」か「ページに出ている数字と台帳」を突き合わせる形をしていて、
 * **『ページに出ていないこと』『古い主張がそのまま残っていること』を見る網が無い。**
 * check-autopilot-page は率が**在れば**合っていることを課すが、
 * **無いこと自体は問題にしない**（あちらの規約どおり）。だからここを足す。
 *
 * 【機械が決められることしか見ない】
 * 「この文章は魅力的か」「この訴求は今の戦略に合うか」は人（と当日のセッション）の
 * 判断で、CIの仕事ではない。ここが落とすのは**版番号・期限・リンクの有無**だけ。
 * 判断の要る面は Runbook §6 の保守メニューが持つ。
 *
 * 【落ちると全PRが止まることについて】
 * これは意図。**「気づいた人が直す」を「直すまで出荷できない」に変える**のが目的で、
 * 今日の4件はどれも「気づく人がいなかった」ために残っていた。
 * ただし止まる代わりに、**問題文が「どこを何に直すか」まで書く**こと。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS_PATH = path.join(ROOT, 'data/site-constants.json');
const CLAIMS_PATH = path.join(ROOT, 'data/pr-claims.json');

/**
 * 見る面。**`announced` は「公表した主張の受け皿か」**。
 * 配信は日本語なので、英語面に配信の数字を出す義務までは課さない
 * （/autopilot/ 自身が "Japanese only for now" と書いている）。
 * 版の主張と NEW の期限は言語に関係ないので、両方に当てる。
 */
export const TARGETS = [
  ['index.html', 'トップ（日本語）', { announced: true }],
  ['en/index.html', 'トップ（英語）', { announced: false }],
];

/** 公表した主張を着地面へ求める窓。過ぎたら自然に失効する（永久に縛らない）。 */
export const ANNOUNCE_WINDOW_DAYS = 90;

/** `data/automation-coverage.json` が定める4つの率の名前。値は check-autopilot-page が見る。 */
const RATE_NAMES = ['総合自動化率', 'AI実行率', 'AI関与率', 'カバー率'];

/** タグを落として本文だけにする。属性値・スクリプト・コメントの中の語には反応させない。 */
export function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n');
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 「最新バージョン X」の形をした主張。**歴史の記述（「v3.9で対応した」）は対象外。** */
const VERSION_CLAIM = /(?:最新バージョン|最新版|現行バージョン|latest version)\s*v?([0-9]+(?:\.[0-9]+)+)/gi;
/** `<b data-new-until="2026-12-02">NEW</b>` の形。タグ名は問わない。 */
const NEW_BADGE = /<([a-z][a-z0-9]*)\b([^>]*)>\s*NEW\s*<\/\1>/gi;
const UNTIL_ATTR = /data-new-until="(\d{4}-\d{2}-\d{2})"/;

/**
 * 1面ぶんの判定。**純関数**にしてあるので、古い主張を混ぜて落ちることを確かめられる。
 *
 * @param {string} html   ページの生HTML
 * @param {object} live   { appVersion, published, today }
 * @param {object} ctx    { announced }
 */
export function inspect(html, live, ctx = {}) {
  const problems = [];
  const checked = [];
  const today = live.today;

  // ── L1 「最新版」の主張が、公開中の版と一致しているか ──────────────
  for (const m of html.matchAll(VERSION_CLAIM)) {
    checked.push({ rule: 'version-claim', got: m[1], want: live.appVersion });
    if (m[1] !== live.appVersion) {
      problems.push(`「${m[0].trim()}」が古い — 公開中は ${live.appVersion}`
        + '（data/site-constants.json の appVersion）。**版そのものは事実なので消さず、'
        + '「最新」の主張だけ落とすか、現行の版へ直すこと。**'
        + '例: 「最新バージョン3.9では…」→「2026年7月のv3.9で…」');
    }
  }

  // ── L2 NEWバッジが期限を持ち、その期限が過ぎていないか ─────────────
  let rest = html;
  for (const m of html.matchAll(NEW_BADGE)) {
    rest = rest.replace(m[0], ' ');
    const until = (m[2].match(UNTIL_ATTR) || [])[1];
    checked.push({ rule: 'new-badge', got: until ?? '(期限なし)', want: `> ${today}` });
    if (!until) {
      problems.push('NEWバッジに期限が無い — `data-new-until="YYYY-MM-DD"` を'
        + `同じ要素へ書くこと（例: \`<${m[1]} data-new-until="…">NEW</${m[1]}>\`）。`
        + '**期限の無い「NEW」は、いつ剥がすかを誰も決めていないという意味で、'
        + '必ず古くなる**（v3.0 のバッジが5版ぶん残っていた）');
    } else if (until < today) {
      problems.push(`NEWバッジの期限 ${until} が過ぎている（今日 ${today}）`
        + ' — **バッジを外すか、まだ新しいなら期限を延ばすこと。**'
        + '延ばすなら「なぜまだ新しいのか」が言える状態であること');
    }
  }
  // 期限を持てない書き方（「NEW · v3.0」「NEW・v3.9 …」のような地の文）を拾う。
  const strayText = toText(rest);
  for (const m of strayText.matchAll(/\bNEW\b/g)) {
    const line = strayText.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ').trim();
    problems.push(`期限を持てない形の「NEW」がある: …${line}…`
      + ' — **`<タグ data-new-until="YYYY-MM-DD">NEW</タグ>` の形にするか、消すこと。**'
      + '地の文に混ぜると、剥がす日を機械が知らない状態になる');
  }

  // ── L3 公表した着地面が、この面から辿れるか ─────────────────────
  const pub = live.published;
  if (pub && ctx.announced) {
    for (const url of pub.landing ?? []) {
      if (typeof url !== 'string' || !url.startsWith('/') || url === '/') continue;
      const linked = new RegExp(`href="${esc(url)}(?:[?#][^"]*)?"`).test(html);
      checked.push({ rule: 'announced-landing', got: linked ? 'linked' : 'なし', want: url });
      if (!linked) {
        problems.push(`公表した着地面 ${url} へ、この面からリンクが無い`
          + `（data/pr-claims.json の published.landing）。**配信本文はここへ人を送っている。**`
          + '着地した先で話が切れる形にしない');
      }
    }
  }

  // ── L4 公表で名乗った率の名前が、この面に在るか（配信から90日） ──────
  if (pub && ctx.announced && withinDays(pub.at, today, ANNOUNCE_WINDOW_DAYS)) {
    const text = toText(html);
    for (const name of RATE_NAMES) {
      if (!String(pub.subhead ?? '').includes(name)) continue;
      const present = text.includes(name);
      checked.push({ rule: 'announced-rate', got: present ? 'あり' : 'なし', want: name });
      if (!present) {
        problems.push(`公表したサブタイトルが名乗った「${name}」が、この面に無い`
          + `（配信 ${pub.at} から ${ANNOUNCE_WINDOW_DAYS} 日以内）。`
          + '**値ではなく名前を求めている** —— 値が台帳と一致しているかは'
          + ' check-autopilot-page.mjs が別に見るので、台帳が動いてもここは縛らない');
      }
    }
  }

  return { problems, checked };
}

/** `at`（YYYY-MM-DD または RFC3339）から `days` 日以内か。読めなければ「窓の外」に倒す。 */
export function withinDays(at, today, days) {
  if (typeof at !== 'string') return false;
  const from = Date.parse(at.slice(0, 10));
  const to = Date.parse(today);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  return (to - from) / 86400000 <= days;
}

/**
 * 「今日」は **JST**。NEWバッジの期限は日本時間の日付で書かれており、
 * UTC で読むと日本の午前9時までは前日として判定される
 * （このリポジトリがブランチ名に `TZ=Asia/Tokyo` を使っているのと同じ理由）。
 */
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function readLive({ today = todayJst() } = {}) {
  const constants = JSON.parse(fs.readFileSync(CONSTANTS_PATH, 'utf8'));
  let published = null;
  try {
    published = JSON.parse(fs.readFileSync(CLAIMS_PATH, 'utf8')).published ?? null;
  } catch { published = null; }
  return { appVersion: constants.appVersion, published, today };
}

export function inspectAll(targets = TARGETS, live = readLive()) {
  const results = targets.map(([file, why, ctx]) => {
    const abs = path.join(ROOT, file);
    // **見なかった面を「異常なし」と呼ばない。**面が消えたら落とす
    // （check-public-facts が 2026-08-26 に踏んだ穴と同じ形）。
    if (!fs.existsSync(abs)) {
      return { file, why, missing: true, problems: [`面が無い（${file}）— 改名したなら TARGETS も直すこと`], checked: [] };
    }
    const r = inspect(fs.readFileSync(abs, 'utf8'), live, ctx);
    return { file, why, missing: false, ...r };
  });
  const problems = results.flatMap((r) => r.problems.map((p) => `${r.file}: ${p}`));
  return { results, problems, ok: problems.length === 0 };
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const LIVE = { appVersion: '5.8.4', today: '2026-09-03',
  published: { at: '2026-09-03', subhead: '実施中174タスクのAI実行率は76.4%、総合自動化率は66.8%',
    landing: ['/', '/autopilot/'] } };
const ANN = { announced: true };

const SCENARIOS = [
  ['実データの着地面が通る', () => {
    const { problems } = inspectAll();
    if (problems.length) throw new Error(problems[0]);
  }],
  ['**面が消えたら落ちる**（見なかった面を「異常なし」と呼ばない）', () => {
    const r = inspectAll([['そんなファイルは無い.html', 'test', {}]], LIVE);
    if (r.ok) throw new Error('無い面が通った');
  }],
  ['**古い「最新バージョン」は落ちる**（2026-09-03 に実在した形）', () => {
    const { problems } = inspect('<p>最新バージョン3.9（2026年7月）では…</p>', LIVE, {});
    if (!problems.length) throw new Error('検出しなかった');
  }],
  ['現行の版なら通る', () => {
    const { problems } = inspect('<p>最新バージョン5.8.4です</p>', LIVE, {});
    if (problems.length) throw new Error(problems[0]);
  }],
  ['**歴史の記述は縛らない**（「v3.9で対応した」は事実）', () => {
    const { problems } = inspect('<p>2026年7月のv3.9でApple Watchに対応しました</p>', LIVE, {});
    if (problems.length) throw new Error(`歴史の記述を拾った: ${problems[0]}`);
  }],
  ['**期限の無いNEWバッジは落ちる**', () => {
    const { problems } = inspect('<b>NEW</b>', LIVE, {});
    if (!problems.some((p) => p.includes('期限が無い'))) throw new Error('検出しなかった');
  }],
  ['**期限切れのNEWバッジは落ちる**', () => {
    const { problems } = inspect('<b data-new-until="2026-08-01">NEW</b>', LIVE, {});
    if (!problems.some((p) => p.includes('過ぎている'))) throw new Error('検出しなかった');
  }],
  ['期限が先ならNEWは通る', () => {
    const { problems } = inspect('<b data-new-until="2026-12-02">NEW</b>', LIVE, {});
    if (problems.length) throw new Error(problems[0]);
  }],
  ['**地の文の「NEW · v3.0」は落ちる**（期限を持てない形）', () => {
    const { problems } = inspect('<div>NEW · v3.0 · 目玉機能</div>', LIVE, {});
    if (!problems.some((p) => p.includes('期限を持てない形'))) throw new Error('検出しなかった');
  }],
  ['属性値・コメント・スクリプトの中の NEW には反応しない', () => {
    const html = '<!-- NEW: 音声入力 --><a title="NEW"><span>x</span></a><style>/* NEW) */</style>';
    const { problems } = inspect(html, LIVE, {});
    if (problems.length) throw new Error(`拾った: ${problems[0]}`);
  }],
  ['**公表した着地面へのリンクが無いと落ちる**（2026-09-03 の /autopilot/ がこれ）', () => {
    const { problems } = inspect('<a href="/">top</a>', LIVE, ANN);
    if (!problems.some((p) => p.includes('/autopilot/'))) throw new Error('検出しなかった');
  }],
  ['クエリ付きのリンクでも辿れると数える', () => {
    const { problems } = inspect(
      '<a href="/autopilot/?utm_source=prtimes">x</a><p>AI実行率 総合自動化率</p>', LIVE, ANN);
    if (problems.length) throw new Error(problems[0]);
  }],
  ['**公表で名乗った率の名前が無いと落ちる**', () => {
    const { problems } = inspect('<a href="/autopilot/">x</a>', LIVE, ANN);
    if (!problems.some((p) => p.includes('AI実行率'))) throw new Error('検出しなかった');
  }],
  ['**求めるのは名前であって値ではない**（台帳が動いても縛らない）', () => {
    const { problems } = inspect(
      '<a href="/autopilot/">x</a><p>AI実行率 99.9% / 総合自動化率 88.8%</p>', LIVE, ANN);
    if (problems.length) throw new Error(`値で縛った: ${problems[0]}`);
  }],
  ['**90日を過ぎたら自然に失効する**（永久に縛らない）', () => {
    const old = { ...LIVE, published: { ...LIVE.published, at: '2026-01-01' } };
    const { problems } = inspect('<a href="/autopilot/">x</a>', old, ANN);
    if (problems.some((p) => p.includes('AI実行率'))) throw new Error('窓を過ぎても縛った');
  }],
  ['**配信していない面には課さない**（英語面）', () => {
    const { problems } = inspect('<p>x</p>', LIVE, { announced: false });
    if (problems.length) throw new Error(problems[0]);
  }],
  ['published が無ければ L3/L4 は見ない（出す義務までは課さない）', () => {
    const { problems } = inspect('<p>x</p>', { ...LIVE, published: null }, ANN);
    if (problems.length) throw new Error(problems[0]);
  }],
  ['**「今日」はJST**（UTCで読むと日本の午前中は前日になる）', () => {
    const utcEve = new Date('2026-09-03T15:30:00Z');  // JST では 09-04 00:30
    if (todayJst(utcEve) !== '2026-09-04') throw new Error(`JSTで読めていない: ${todayJst(utcEve)}`);
  }],
  ['**読めない日付は「窓の外」に倒す**（読めないから縛る、をやらない）', () => {
    if (withinDays(undefined, '2026-09-03', 90)) throw new Error('undefined を窓の内と読んだ');
    if (withinDays('きのう', '2026-09-03', 90)) throw new Error('読めない文字列を窓の内と読んだ');
    if (!withinDays('2026-09-03', '2026-09-03', 90)) throw new Error('当日を窓の外と読んだ');
  }],
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(run(SCENARIOS, { label: '着地面の鮮度' }) ? 1 : 0);

  const live = readLive();
  const { results, problems, ok } = inspectAll(TARGETS, live);
  console.log('着地面の鮮度 — 公開中の版・NEWの期限・公表した着地面');
  console.log(`  正: appVersion ${live.appVersion}`
    + `／配信 ${live.published ? `${live.published.at}（${live.published.medium ?? '?'}）` : 'なし'}`
    + `／今日 ${live.today}\n`);
  for (const r of results) {
    console.log(`  ${r.problems.length ? '要修正' : 'OK  '}  ${r.file}（${r.why}）`
      + `  照合 ${r.checked.length} 件`);
    // 期限が近いバッジは、落ちる前に見えるようにしておく（Runbook §6 の保守メニュー用）。
    for (const c of r.checked.filter((x) => x.rule === 'new-badge' && /^\d{4}/.test(x.got))) {
      const left = Math.round((Date.parse(c.got) - Date.parse(live.today)) / 86400000);
      if (left >= 0 && left <= 21) console.log(`        NEWバッジ 残り ${left} 日（${c.got}）`);
    }
  }
  if (problems.length) {
    console.log('\n着地面が現実より古い:');
    for (const p of problems) console.log(`  - ${p}`);
  } else {
    console.log('\n着地面に古い主張なし。');
    console.log('  （見ているのは版番号・期限・リンクの有無だけ。訴求そのものの良し悪しは Runbook §6）');
  }
  if (argv.includes('--check') && !ok) process.exit(1);
}
