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
 * ページ本文に現れる「総合自動化率◯%」「AI関与率◯%」「◯タスク」を
 * 台帳の現在値と突き合わせる。**丸めの桁数まで含めて一致を求める。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './automation-rate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE_PATH = path.join(ROOT, 'autopilot/index.html');
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
    { label: '総合自動化率', re: /総合自動化率\s*<?\/?b?>?\s*([\d.]+)%/g, want: pct(live.overall_automation_rate) },
    { label: 'AI関与率', re: /AI関与率\s*([\d.]+)%/g, want: pct(live.ai_involvement_rate) },
    { label: 'AI実行率', re: /AI実行率\s*([\d.]+)%/g, want: pct(live.ai_execution_rate) },
    { label: 'タスク数', re: /(\d+)\s*タスク・13領域/g, want: String(live.counts_total) },
  ];

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

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const s = summarize(doc).overall;
  const live = { ...s, counts_total: doc.tasks.length };
  const html = fs.readFileSync(PAGE_PATH, 'utf8');
  const { problems, found } = compare(html, live);

  console.log(`公開ページ /autopilot/ × 台帳 — 突き合わせた数字 ${found.length} 件\n`);
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
