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
import { checkText } from './check-pr-facts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 見る面。**増やすときは「誰が読むか」で選ぶ。** */
export const TARGETS = [
  ['faq.html', 'FAQ（ユーザーが価格と無料枠を確かめに来る面）'],
  ['index.html', 'トップ（日本語）'],
  ['en/index.html', 'トップ（英語）'],
  ['llms.txt', '生成AI向けの引用元。**ここが古いと、古い事実が引用として拡散する**'],
  ['about/index.html', '運営者情報'],
];

/** HTMLのタグを落として本文だけにする。属性値の中の語には反応させない。 */
export function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n');
}

export function scan(file) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) return { file, missing: true, violations: [] };
  const raw = fs.readFileSync(abs, 'utf8');
  const text = file.endsWith('.html') ? toText(raw) : raw;
  // 公開面は「配信原稿かどうか」の宣言を持たない。全規則を適用する側で扱う。
  const { violations } = checkText(`<!-- fact-check: draft -->\n${text}`);
  // 現行名が出てこないこと自体は公開面では問題にしない（英語面・about など）。
  return { file, missing: false, violations };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  console.log('公開面の事実検査（正: data/site-constants.json + data/benchmark.json）\n');
  let total = 0;
  for (const [file, why] of TARGETS) {
    const r = scan(file);
    if (r.missing) { console.log(`  --    ${file}（無い）`); continue; }
    if (!r.violations.length) { console.log(`  OK    ${file}`); continue; }
    total += r.violations.length;
    console.log(`  NG    ${file} — ${why}`);
    for (const v of r.violations.slice(0, 8)) {
      console.log(`          L${v.line} [${v.rule}] ${v.message}`);
      console.log(`                > ${v.text}`);
    }
    if (r.violations.length > 8) console.log(`          … 他 ${r.violations.length - 8} 件`);
  }
  console.log('');
  if (total) {
    console.error(`公開面に古い事実が ${total} 件。**人の目視で消したものは、次の追加を止められない。**`);
    process.exit(1);
  }
  console.log('  公開面に古い事実なし。');
  if (process.argv.includes('--check')) {
    console.log('  （見ているのは散文。構造化された値の同期は sync_constants.js が別に見る）');
  }
}
