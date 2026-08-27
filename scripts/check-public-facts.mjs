#!/usr/bin/env node
/**
 * 公開面の事実が、正の台帳とずれていないかを検査する。
 *
 *   node scripts/check-public-facts.mjs           # 表示
 *   node scripts/check-public-facts.mjs --check   # CI: ずれていたら exit 1
 *
 * 【なぜ配信原稿だけでは足りないか】
 * check-pr-facts.mjs は docs/pr-*.md しか見ていない。だが**同じ古い事実は
 * 公開面にも残る。**実際、廃止済みの「7日間無料トライアル」は
 * 景表法・ストア審査上のリスクとして消したもので、消えたことを確かめたのは
 * 人の目視（「出現回数は現在0」）だった。**人の目視は次の追加を止められない。**
 *
 * 見るのは FAQ・トップ（日英）・llms.txt。ここは記者もユーザーも生成AIも読む面で、
 * 古い事実が最も長く残る。
 *
 * 【sync_constants.js との違い】
 * あちらは JSON-LD と llms.txt の**構造化された値**を site-constants から propagate する。
 * こちらは**散文**を見る。「月額500円」という値の同期ではなく、
 * 「7日間無料トライアル」「Captio式シンプルメモ」「起動 約1秒」という
 * **文章の中の古い事実**が対象で、propagate では直らない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkText, launchTimeSuspect } from './check-pr-facts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 見る面。**増やすときは「誰が読むか」で選ぶ。** */
export const TARGETS = [
  ['faq.html', 'FAQ（ユーザーが価格と無料枠を確かめに来る面）'],
  ['index.html', 'トップ（日本語）'],
  ['en/index.html', 'トップ（英語）'],
  ['llms.txt', '生成AI向けの引用元。**ここが古いと、古い事実が引用として拡散する**'],
  ['about/index.html', '運営者情報'],
  ['data/distribution-queue.json', '配信の種（X にそのまま投稿される公開ファイル）'],
];

/** HTMLのタグを落として本文だけにする。属性値の中の語には反応させない。 */
export function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n');
}

/** 中身だけを見る側。**純関数にしてある**ので、古い事実を混ぜて落ちることを確かめられる。 */
export function scanText(file, raw) {
  const text = file.endsWith('.html') ? toText(raw) : raw;
  // 公開面は「配信原稿かどうか」の宣言を持たない。全規則を適用する側で扱う。
  const { violations } = checkText(`<!-- fact-check: draft -->\n${text}`);
  // 現行名が出てこないこと自体は公開面では問題にしない（英語面・about など）。
  return { file, missing: false, violations };
}

export function scan(file) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return { file, missing: true, violations: [] };
  return scanText(file, fs.readFileSync(abs, 'utf8'));
}

/**
 * 全面をまとめて見る。
 *
 * [2026-08-26] **面が消えたときに素通りしていた。**
 * 以前はここで `--（無い）` と表示するだけで exit 0 を返していた。
 * `faq.html` を `faq` に改名すれば——middleware は実際に `.html` を落とす——
 * この検査は「公開面に古い事実なし」と報告する。**見なかった面に古い事実が
 * 無いことは、確かめていない。**「判定できなかった」を「異常なし」と呼ばない。
 */
export function scanAll(targets = TARGETS) {
  const results = targets.map(([file, why]) => ({ ...scan(file), why }));
  const stale = results.reduce((a, r) => a + r.violations.length, 0);
  const missing = results.filter((r) => r.missing).length;
  return { results, stale, missing, ok: stale === 0 && missing === 0 };
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SCENARIOS = [
  ['実データの公開面が検査を通る', () => {
    const { results, stale, missing } = scanAll();
    if (missing) throw new Error(`面が ${missing} 件無い`);
    if (stale) {
      const r = results.find((x) => x.violations.length);
      throw new Error(`${r.file}: ${r.violations[0].message}`);
    }
  }],
  ['**面が1つでも消えたら落ちる**（見なかった面を「異常なし」と呼ばない）', () => {
    const r = scanAll([['そんなファイルは無い.html', 'test']]);
    if (r.ok) throw new Error('無い面が通った（**これが 2026-08-26 まで実在した穴**）');
    if (r.missing !== 1) throw new Error(`missing=${r.missing}`);
  }],
  ['**廃止済みの無料トライアルは落ちる**（景表法・ストア審査のリスクとして消したもの）', () => {
    const { violations } = scanText('index.html', '<p>7日間無料トライアル付き</p>');
    if (!violations.some((v) => v.rule === 'abolished-trial')) {
      throw new Error(`検出しなかった: ${JSON.stringify(violations)}`);
    }
  }],
  ['旧アプリ名は落ちる', () => {
    const { violations } = scanText('index.html', '<p>Captio式シンプルメモ</p>');
    if (!violations.some((v) => v.rule === 'old-app-name')) throw new Error('検出しなかった');
  }],
  ['**誇大表現は落ちる**（完全無人・人間不要・世界初）', () => {
    for (const bad of ['完全無人', '人間不要', '世界初']) {
      const { violations } = scanText('index.html', `<p>${bad}の経営</p>`);
      if (!violations.some((v) => v.rule === 'overclaim')) throw new Error(`${bad} を検出しなかった`);
    }
  }],
  ['**RSI を名乗ると落ちる**（再帰的自己改善は名乗らない）', () => {
    const { violations } = scanText('index.html', '<p>再帰的自己改善を実現</p>');
    if (!violations.some((v) => v.rule === 'rsi-claim')) throw new Error('検出しなかった');
  }],
  ['llms.txt も見る（**古い事実が引用として拡散する面**）', () => {
    const { violations } = scanText('llms.txt', '7日間無料トライアル');
    if (!violations.length) throw new Error('素のテキスト面を見ていない');
  }],
  ['属性値の中の語には反応しない（.html のみ）', () => {
    const html = scanText('x.html', '<a title="7日間無料トライアル">リンク</a>');
    if (html.violations.length) throw new Error(`属性値を拾った: ${html.violations[0].text}`);
    const txt = scanText('x.txt', '<a title="7日間無料トライアル">リンク</a>');
    if (!txt.violations.length) throw new Error('.txt では素のまま見るはずが、見ていない');
  }],
  ['script / style の中は見ない', () => {
    const r = scanText('x.html', '<script>var s = "7日間無料トライアル";</script>');
    if (r.violations.length) throw new Error('スクリプトの中を拾った');
  }],
  ['**実測が読めないときは「検証できない」**（合っていることにしない）', () => {
    if (!launchTimeSuspect(0.4, undefined)) {
      throw new Error('正が無いのに通した — **実測が読めないまま速度を書ける**');
    }
    if (!launchTimeSuspect(0.4, null)) throw new Error('null も同様に扱うこと');
  }],
  ['実測と一致すれば疑わない（常に鳴る検査も何も見ていない）', () => {
    if (launchTimeSuspect(0.4, 0.4)) throw new Error('一致しているのに疑った');
  }],
  ['**実測と違えば疑う**', () => {
    if (!launchTimeSuspect(9.9, 0.4)) throw new Error('違うのに通した');
  }],
  ['**toText が本文を落とさない**（全部落とせば何も検出できない）', () => {
    const t = toText('<div class="a"><p>本文はここ</p></div>');
    if (!t.includes('本文はここ')) throw new Error('本文まで落ちている（**この検査は何も見ていない**）');
  }],
];

if (process.argv.includes('--selftest')) {
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  console.log('公開面の事実検査（正: data/site-constants.json + data/benchmark.json）\n');
  const { results, stale, missing } = scanAll();
  for (const r of results) {
    if (r.missing) {
      console.log(`  NG    ${r.file}（無い）— ${r.why}`);
      console.log('          **面が消えたことは「古い事実なし」ではない。**改名なら一覧を直す');
      continue;
    }
    if (!r.violations.length) { console.log(`  OK    ${r.file}`); continue; }
    console.log(`  NG    ${r.file} — ${r.why}`);
    for (const v of r.violations.slice(0, 8)) {
      console.log(`          L${v.line} [${v.rule}] ${v.message}`);
      console.log(`                > ${v.text}`);
    }
    if (r.violations.length > 8) console.log(`          … 他 ${r.violations.length - 8} 件`);
  }
  console.log('');
  if (missing) {
    console.error(`見るはずの公開面が ${missing} 件無い。**確かめていない面を「異常なし」と呼ばない。**`);
  }
  if (stale) {
    console.error(`公開面に古い事実が ${stale} 件。**人の目視で消したものは、次の追加を止められない。**`);
  }
  if (stale || missing) process.exit(1);
  console.log(`  公開面 ${results.length} 面すべてに古い事実なし。`);
  if (process.argv.includes('--check')) {
    console.log('  （見ているのは散文。構造化された値の同期は sync_constants.js が別に見る）');
  }
}
