#!/usr/bin/env node
/**
 * 公開ページ /autopilot/ の数字が、台帳の現在値と一致することを検査する。
 *
 *   node scripts/check-autopilot-page.mjs           # 表示
 *   node scripts/check-autopilot-page.mjs --check   # CI
 *   node scripts/check-autopilot-page.mjs --selftest
 *
 * 【なぜ要るか】
 * [2026-08-25] 棚卸しに13件足したところ、総合自動化率が 61.3% → 58.6%、
 * タスク数が 176 → 189 に動いた。**公開ページはどちらも古いまま**で、
 * それを落とす検査がどこにも無かった。
 *
 * このリポジトリは他のほぼ全ての数字に「台帳と実装がずれたら落ちる」検査を
 * 持っている（automation-rate --check / code-authorship --check /
 * autonomy-timeline --check …）。**一番人目に触れる公開ページだけが、
 * その網の外にあった。**
 *
 * 記者が最初にやるのは、ページの数字を1つ選んで「これはどう数えましたか」と
 * 聞くこと。**そのとき台帳を開いて違う数字が出てくるのが、いちばん悪い。**
 *
 * 【何を検査するか】
 * ページ本文に現れる「総合自動化率◯%」「AI関与率◯%」「◯タスク」と、
 * **領域別の表の全行**を台帳の現在値と突き合わせる。
 * **丸めの桁数まで含めて一致を求める。**
 *
 * [2026-08-26] 領域別の表を検査に足した。**この検査が見ていたのは見出しの4つだけ**で、
 * 13行の表は網の外にあった。実際に測ったら13行中9行がずれており、
 * ⑤AI予算は 86.7% と出ているのに台帳は 76.5%（10ポイント）。
 * **一番大きくずれていたのが、この検査を入れた当のページの中**だった。
 * 見出しだけ守ると、細かいほうがずれる —— 細かいほうが数が多いので、
 * 記者が1つ選んで聞いてくる確率もそちらのほうが高い。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './automation-rate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE_PATH = path.join(ROOT, 'autopilot/index.html');
/**
 * 同じ網に入れる文書。**配信される本文だけ**を入れる。
 *
 * [2026-08-26] 配信本文が 58.6% のまま止まっていた（台帳は 61.1%）。
 * この検査は公開ページ1枚しか見ておらず、**実際に記者へ渡る本文が網の外**だった。
 * 一番人目に触れるのはページではなく配信本文である。
 *
 * **入れてはいけないもの**:
 *   - `pr-autopilot-2026-09-numbers.md` … 「使わない数字」を**わざと**載せている
 *   - `automation-rate-2026-08.md` … 日付つきの断面。当時の値のまま残すのが正しい
 */
export const EXTRA_PATHS = [path.join(ROOT, 'docs/pr-autopilot-2026-09-body.md')];
export const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');

const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * ページから読み取れた数字と、台帳の現在値を突き合わせる。
 * **ページに出ていない指標は検査しない** — 出す義務までは課さない
 * （出したなら合っていること、だけを課す）。
 */
export function compare(html, live) {
  const problems = [];
  const found = [];

  const checks = [
    // 飾り（`<b>` / `** | **` / 空白）をまたぐ。**数字は挟まないので取り違えない。**
    { label: '総合自動化率', re: /総合自動化率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.overall_automation_rate) },
    { label: 'AI関与率', re: /AI関与率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.ai_involvement_rate) },
    { label: 'AI実行率', re: /AI実行率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.ai_execution_rate) },
    { label: 'カバー率', re: /カバー率[^\d%]{0,12}([\d.]+)%/g, want: pct(live.coverage_rate) },
    { label: 'タスク数', re: /(\d+)\s*タスク・13領域/g, want: String(live.counts_total) },
    // 配信本文の見出し。**記者がいちばん引用する2か所。**
    { label: '自律度の到達点', re: /自律度は[\d.]+%→([\d.]+)%/g, want: pct(live.overall_automation_rate) },
    { label: '見出しの率', re: /「([\d.]+)%」は、いちばん厳しい/g, want: pct(live.overall_automation_rate) },
  ];

  // 領域別の表。**行ごとに突き合わせる。**
  // 「表があること」は求めない（無ければ検査しない）が、**あるなら全行合っていること。**
  for (const m of html.matchAll(
    /<tr><td>([^<]+)<\/td><td class="num">(?:<b>)?([\d.]+)%(?:<\/b>)?<\/td><td class="num">(?:<b>)?([\d.]+)%(?:<\/b>)?<\/td><\/tr>/g
  )) {
    const [, area, overall, involve] = m;
    const t = live.by_area?.[area];
    if (!t) {
      problems.push(`領域別の表に台帳に無い領域 ${area} がある`
        + ' — 領域名を変えたなら台帳とページの両方を直すこと');
      continue;
    }
    for (const [label, got, want] of [
      [`${area} 総合`, `${overall}%`, pct(t.overall_automation_rate)],
      [`${area} 関与`, `${involve}%`, pct(t.ai_involvement_rate)],
    ]) {
      found.push({ label, got, want });
      if (got !== want) {
        problems.push(`${label}: ページは ${got}、台帳の現在値は ${want}`
          + ' — **領域別の表が台帳より古い。**見出しだけ直して表を置き去りにしない');
      }
    }
  }

  for (const c of checks) {
    const hits = [...html.matchAll(c.re)];
    if (!hits.length) continue;
    for (const h of hits) {
      const got = c.label === 'タスク数' ? h[1] : `${h[1]}%`;
      found.push({ label: c.label, got, want: c.want });
      if (got !== c.want) {
        problems.push(`${c.label}: ページは ${got}、台帳の現在値は ${c.want}`
          + ' — **公開ページが台帳より古い。**数字を直すか、台帳を直すか、どちらかを同じコミットに含めること');
      }
    }
  }
  return { problems, found };
}

function selftest() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name);
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };
  const live = {
    overall_automation_rate: 0.5860215053763441,
    ai_involvement_rate: 0.8774193548387097,
    ai_execution_rate: 0.7032258064516129,
    counts_total: 189,
  };
  t('一致すれば通る',
    compare('総合自動化率58.6%、AI関与率87.7%。189タスク・13領域', live).problems.length === 0);
  t('古い率を落とす',
    compare('総合自動化率61.3%', live).problems.some((p) => p.includes('総合自動化率')));
  t('古いタスク数を落とす',
    compare('176タスク・13領域', live).problems.some((p) => p.includes('タスク数')));
  t('<b> をまたいでも読める',
    compare('<b>総合自動化率58.6%、AI関与率87.7%。</b>', live).problems.length === 0);
  t('出ていない指標は検査しない（出す義務までは課さない）',
    compare('自律運営の話だけ書いたページ', live).found.length === 0);
  t('丸めの桁がずれたら落ちる（58.6 と 59 を同じにしない）',
    compare('総合自動化率59.0%', live).problems.length === 1);

  // 領域別の表 — **見出しだけ守ると細かいほうがずれる**
  const withAreas = { ...live, by_area: {
    '⑨ マネタイズ': { overall_automation_rate: 0.2222222, ai_involvement_rate: 0.8333333 },
  } };
  const row = (a, o, i) => `<tr><td>${a}</td><td class="num">${o}</td><td class="num">${i}</td></tr>`;
  t('領域別の行が一致すれば通る',
    compare(row('⑨ マネタイズ', '22.2%', '83.3%'), withAreas).problems.length === 0);
  t('**領域別の行がずれたら落ちる**',
    compare(row('⑨ マネタイズ', '12.5%', '80.0%'), withAreas).problems.length === 2);
  t('領域別の <b> 強調をまたいでも読める',
    compare(row('⑨ マネタイズ', '<b>22.2%</b>', '83.3%'), withAreas).problems.length === 0);
  t('台帳に無い領域名は落とす（領域を消したまま表に残る、を防ぐ）',
    compare(row('⑭ 存在しない領域', '10.0%', '20.0%'), withAreas).problems.length === 1);
  t('表が無ければ検査しない（出す義務までは課さない）',
    compare('表の無いページ', withAreas).found.length === 0);

  // 配信本文の書き方（Markdown の表・見出し）でも読める
  const md = { ...live, coverage_rate: 0.8580645161290322 };
  t('Markdown の表をまたいで読める',
    compare('| **総合自動化率** | **58.6%** | 分母 |', md).problems.length === 0);
  t('Markdown の表のずれを落とす',
    compare('| **総合自動化率** | **59.9%** | 分母 |', md).problems.length === 1);
  t('配信本文の見出しを読む',
    compare('### ■ 「58.6%」は、いちばん厳しい数え方をした結果です', md).problems.length === 0);
  t('**配信本文の到達点を読む**（記者がいちばん引用する行）',
    compare('自律度は1.6%→58.6%へ', md).problems.length === 0
    && compare('自律度は1.6%→60.0%へ', md).problems.length === 1);
  t('カバー率も突き合わせる',
    compare('| カバー率 | 85.8% |', md).problems.length === 0
    && compare('| カバー率 | 87.3% |', md).problems.length === 1);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const summary = summarize(doc);
  const live = { ...summary.overall, by_area: summary.by_area, counts_total: doc.tasks.length };
  const targets = [PAGE_PATH, ...EXTRA_PATHS].filter((f) => fs.existsSync(f));
  const problems = [];
  const found = [];
  for (const f of targets) {
    const label = path.relative(ROOT, f);
    const r = compare(fs.readFileSync(f, 'utf8'), live);
    problems.push(...r.problems.map((x) => `${label}: ${x}`));
    found.push(...r.found);
    // **一覧に入れたのに1つも照合していない、を落とす。**
    // 表記が変わって正規表現に当たらなくなると、検査は黙って通る ——
    // それは「一致した」ではなく「見ていない」。網に入れた文書には
    // 少なくとも1つ照合対象があることを求める（PAGE_PATH も同じ）。
    if (r.found.length === 0) {
      problems.push(`${label}: 突き合わせられる数字が1つも見つからない`
        + ' — **表記が変わって検査が素通りしている可能性。**'
        + '網から外すなら EXTRA_PATHS から消すこと（黙って通さない）');
    }
  }

  console.log(`公開ページ /autopilot/ と配信本文 × 台帳 — 突き合わせた数字 ${found.length} 件`);
  console.log(`  対象: ${targets.map((f) => path.relative(ROOT, f)).join(' / ')}\n`);
  for (const f of found) {
    console.log(`  ${f.got === f.want ? '一致' : '不一致'}  ${f.label}: ページ ${f.got} / 台帳 ${f.want}`);
  }
  if (!found.length) {
    console.log('  ページに台帳由来の数字が1つも見つからなかった。');
    console.log('  **数字を消したなら正しい。**書き方を変えたなら、この検査の正規表現を直すこと。');
  }

  if (problems.length) {
    console.error('\n公開ページ: 台帳と食い違い');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n公開ページの数字は台帳の現在値と一致。');
}
