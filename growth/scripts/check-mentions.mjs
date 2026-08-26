#!/usr/bin/env node
/**
 * 言及・競合ウォッチ — **やらなかった週に気づく。**
 *
 *   node growth/scripts/check-mentions.mjs          # 一覧
 *   node growth/scripts/check-mentions.mjs --check  # CI
 *
 * 【なぜ作るか】
 * 手順書には「週1回・前回ファイルの日付が7日以上前なら実行する」と書いてある。
 * ところが**その条件を誰も検査していなかった。**2026-08-22 に数えたら、
 * 前回は 08-12 で 10日空いていた。3日の遅れは誰にも見えていない。
 *
 * この種の作業は、やらなくても何も壊れない。壊れないので後回しになり、
 * 後回しが続くと**やらないことが常態になる。**それが分かるのは、
 * 「そういえば最近見ていない」と誰かが思い出したときだけ。
 *
 * 【固定クエリを縮めさせない】
 * README にクエリ群が固定で書いてある。スナップショットがその一部しか
 * 持っていなければ落とす —— 忙しい回に2件だけ検索して「やった」ことにすると、
 * **系列としては連続しているのに中身が変わる**。あとから見ると
 * 「あの週から言及が減った」に見えるが、減ったのは検索のほう。
 *
 * 【この検査が見ないこと】
 * 中身の正しさ。検索結果が妥当かは機械には決められない。
 * 見るのは**やったかどうかと、同じものを見たかどうか**だけ。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'growth/data/mentions');
const README = path.join(DIR, 'README.md');

/** 手順書が言う週1に、遅れの許容を足したもの。 */
export const MAX_GAP_DAYS = 10;

/** README のコードブロックから固定クエリを読む。**script に書き写さない。** */
export function queriesFromReadme(text) {
  const m = /```\n([\s\S]*?)```/.exec(text);
  if (!m) return [];
  return m[1].split('\n')
    .map((l) => /^\s*"([^"]+)"/.exec(l)?.[1])
    .filter(Boolean);
}

/** クエリの照合は緩める（README は素の語、スナップショットは引用符つきのことがある）。 */
const norm = (s) => String(s).replace(/["“”\s]/g, '').toLowerCase();

export function validate(snapshots, wantQueries, today = new Date()) {
  const problems = [];
  if (!snapshots.length) return { problems: ['スナップショットが1件も無い'], rows: [] };

  const rows = snapshots.map((s) => ({
    date: s.date,
    queries: (s.queries || []).length,
    mentions: (s.queries || []).reduce((a, q) => a + (q.new_mentions || []).length, 0),
    listicles: (s.queries || []).reduce((a, q) => a + (q.competitor_listicles || []).length, 0),
    us: (s.queries || []).reduce((a, q) =>
      a + (q.new_mentions || []).filter((m) => m.mentions_us).length, 0),
  }));

  const newest = snapshots[snapshots.length - 1];
  const age = Math.floor((today - new Date(`${newest.date}T00:00:00Z`)) / 86_400_000);
  if (age > MAX_GAP_DAYS) {
    problems.push(`最新のスナップショットが ${newest.date}（${age}日前・上限 ${MAX_GAP_DAYS}日）`
      + ' — **やらなくても何も壊れない作業なので、放っておくとやらないことが常態になる**');
  }

  // 連続する2件の間隔も見る。**最新だけ見ると、途中の空白が隠れる。**
  for (let i = 1; i < snapshots.length; i++) {
    const gap = Math.floor(
      (new Date(`${snapshots[i].date}T00:00:00Z`) - new Date(`${snapshots[i - 1].date}T00:00:00Z`))
      / 86_400_000);
    if (gap > MAX_GAP_DAYS) {
      problems.push(`${snapshots[i - 1].date} → ${snapshots[i].date} が ${gap}日空いている`
        + '（上限 ' + MAX_GAP_DAYS + '日）— 過去の欠測も記録に残す');
    }
  }

  for (const s of snapshots) {
    const qs = (s.queries || []).map((q) => norm(q.q));
    const missing = wantQueries.filter((w) => !qs.some((q) => q.includes(norm(w)) || norm(w).includes(q)));
    if (missing.length) {
      problems.push(`${s.date}: 固定クエリが欠けている（${missing.join(' / ')}）`
        + ' — **一部だけ検索して「やった」ことにすると、系列は連続しているのに中身が変わる。**'
        + 'あとから見ると「あの週から言及が減った」に見えるが、減ったのは検索のほう');
    }
    if (!s.diff_from_last) {
      problems.push(`${s.date}: diff_from_last が無い — 前回と比べていないなら定点観測ではない`);
    }
    for (const q of s.queries || []) {
      for (const m of q.new_mentions || []) {
        if (typeof m.mentions_us !== 'boolean') {
          problems.push(`${s.date} / ${q.q}: mentions_us が真偽値でない（${m.url}）`);
        }
      }
    }
  }
  return { problems, rows };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    : [];
  const snapshots = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  const want = fs.existsSync(README) ? queriesFromReadme(fs.readFileSync(README, 'utf8')) : [];
  const { problems, rows } = validate(snapshots, want);

  console.log('言及・競合ウォッチ — **やらなかった週に気づく**\n');
  console.log(`  スナップショット ${rows.length}件 / 固定クエリ ${want.length}件\n`);
  console.log('    日付          クエリ  言及  うち自社  競合リスト');
  for (const r of rows) {
    console.log(`    ${r.date}   ${String(r.queries).padStart(4)}`
      + `  ${String(r.mentions).padStart(4)}  ${String(r.us).padStart(6)}`
      + `  ${String(r.listicles).padStart(8)}`);
  }
  console.log('');
  console.log('  見るのは**やったかどうかと、同じものを見たかどうか**だけ。');
  console.log('  検索結果が妥当かは機械には決められない。');

  if (problems.length) {
    console.error('\n言及ウォッチ: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n定点観測が続いている。');
}
