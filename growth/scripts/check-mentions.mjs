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
export const GAPS = path.join(DIR, 'gaps.json');

/** 手順書が言う週1に、遅れの許容を足したもの。 */
export const MAX_GAP_DAYS = 10;

/** README のコードブロックから固定クエリを読む。**script に書き写さない。** */
export function queriesFromReadme(text) {
  // 言語タグ（```text など）を許す。**タグを1つ足しただけで固定クエリが0件になり、
  // 下の照合が丸ごと消える**——それが起きても出力は「定点観測が続いている」になる。
  const m = /```[a-z]*\n([\s\S]*?)```/.exec(text);
  if (!m) return [];
  return m[1].split('\n')
    .map((l) => /^\s*"([^"]+)"/.exec(l)?.[1])
    .filter(Boolean);
}

/** クエリの照合は緩める（README は素の語、スナップショットは引用符つきのことがある）。 */
const norm = (s) => String(s).replace(/["“”\s]/g, '').toLowerCase();

export function validate(snapshots, wantQueries, today = new Date(), acknowledged = []) {
  const problems = [];
  if (!snapshots.length) return { problems: ['スナップショットが1件も無い'], rows: [] };

  // **空の一覧は「守っている」ではなく「何も守っていない」。**
  //
  // [2026-08-26] wantQueries が空でも、この検査は黙って通っていた。
  // 固定クエリの照合（下の missing）は空配列に対して常に空を返すので、
  // **この検査が存在する理由——「固定クエリを縮めさせない」——が丸ごと消える。**
  // README のコードブロックに言語タグを1つ足すだけでそうなる。
  if (!wantQueries.length) {
    problems.push('固定クエリを1件も読めていない（README のコードブロック）'
      + ' — **照合する相手が無い状態は、照合したことにならない。**'
      + 'この検査が在る理由がそのまま消えるので、通さない');
  }

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
      // **記録は残す。認めたものだけ黙る。**
      //
      // [2026-09-02] ここは許容の仕組みを持たず、**一度10日を超えたらその履歴は
      // 永久に落ち続ける**形だった。埋め合わせのスナップショットは後から作れない
      // （過去の検索結果は取り直せないし、取り直せてもそれは当時の観測ではない）ので、
      // **直しようのない赤**になる。永久に赤い検査は signal ではなく noise になり、
      // いずれ規則ごと消される —— 同じ経路をこのリポジトリは overdue の誤判定で
      // 一度通っている。
      //
      // **認めるには理由が要る**（下の gaps.json 側の検査）。枠だけ広げる道は無い。
      const ack = acknowledged.find(
        (a) => a && a.from === snapshots[i - 1].date && a.to === snapshots[i].date);
      if (!ack) {
        problems.push(`${snapshots[i - 1].date} → ${snapshots[i].date} が ${gap}日空いている`
          + '（上限 ' + MAX_GAP_DAYS + '日）— 過去の欠測も記録に残す。'
          + '**理由を書いて growth/data/mentions/gaps.json の acknowledged へ**');
      } else if (!String(ack.why ?? '').trim()) {
        problems.push(`${ack.from} → ${ack.to} を why 無しで認めている`
          + ' — **理由の無い許容は、枠を広げただけ**');
      } else if (Number.isFinite(ack.days) && ack.days !== gap) {
        problems.push(`${ack.from} → ${ack.to} の days が ${ack.days} だが実際は ${gap}日`
          + ' — 台帳の数が実態と違う');
      }
    }
  }

  // **逆向きも見る。**実在しない欠測を認めさせない —— 先回りして書いておくと、
  // 次に空けたときに黙ってしまう。台帳に在って gap が無い行は落とす。
  const realGaps = new Set();
  for (let i = 1; i < snapshots.length; i++) {
    const gap = Math.floor(
      (new Date(`${snapshots[i].date}T00:00:00Z`) - new Date(`${snapshots[i - 1].date}T00:00:00Z`))
      / 86_400_000);
    if (gap > MAX_GAP_DAYS) realGaps.add(`${snapshots[i - 1].date}→${snapshots[i].date}`);
  }
  for (const a of acknowledged) {
    if (!a || !realGaps.has(`${a.from}→${a.to}`)) {
      problems.push(`gaps.json の ${a?.from ?? '?'} → ${a?.to ?? '?'} に対応する欠測が無い`
        + ' — **先回りして認めておくと、次に空けたときに黙る**');
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

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
if (process.argv.includes('--selftest')) {
  const WANT = ['シンプルメモ Obsidian', 'simplememofast'];
  const SNAP = (over = {}) => ({
    date: '2026-08-22',
    diff_from_last: '前回比',
    queries: WANT.map((q) => ({ q, new_mentions: [], competitor_listicles: [] })),
    ...over,
  });
  const NOW = new Date('2026-08-26T00:00:00Z');
  const has = (list, needle) => list.some((x) => x.includes(needle));

  const SCENARIOS = [
    ['実データが検査を通る', () => {
      const files = fs.existsSync(DIR)
        ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
      const snaps = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
      const want = queriesFromReadme(fs.readFileSync(README, 'utf8'));
      if (!want.length) throw new Error('README から固定クエリを読めていない');
      // **CLI と同じ引数で回す。**片方だけ acknowledged を渡さないと、
      // 「実データが通る」が検査の実態とずれる。
      const ack = fs.existsSync(GAPS)
        ? (JSON.parse(fs.readFileSync(GAPS, 'utf8')).acknowledged ?? []) : [];
      const { problems } = validate(snaps, want, new Date(), ack);
      if (problems.length) throw new Error(problems[0]);
    }],
    // ── 欠測の許容（2026-09-02 追加）─────────────────────────
    // **記録は残したまま緑に戻せる経路。**枠だけ広げる道は塞いである。
    ['**11日空いたら落ちる**（認めていないうちは黙らない）', () => {
      const a = SNAP({ date: '2026-08-22' }), b = SNAP({ date: '2026-09-02' });
      const { problems } = validate([a, b], WANT, NOW, []);
      if (!has(problems, '11日空いている')) throw new Error(JSON.stringify(problems));
    }],
    ['理由つきで認めれば黙る', () => {
      const a = SNAP({ date: '2026-08-22' }), b = SNAP({ date: '2026-09-02' });
      const { problems } = validate([a, b], WANT, NOW,
        [{ from: '2026-08-22', to: '2026-09-02', days: 11, why: '理由' }]);
      if (problems.length) throw new Error(JSON.stringify(problems));
    }],
    ['**why が空なら認めたことにならない**（枠だけ広げる道を塞ぐ）', () => {
      const a = SNAP({ date: '2026-08-22' }), b = SNAP({ date: '2026-09-02' });
      const { problems } = validate([a, b], WANT, NOW,
        [{ from: '2026-08-22', to: '2026-09-02', days: 11, why: '   ' }]);
      if (!has(problems, 'why 無しで認めている')) throw new Error(JSON.stringify(problems));
    }],
    ['**実在しない欠測は認められない**（先回りして書いておくと次に黙る）', () => {
      const a = SNAP({ date: '2026-08-22' }), b = SNAP({ date: '2026-08-28' });
      const { problems } = validate([a, b], WANT, NOW,
        [{ from: '2026-09-10', to: '2026-09-30', days: 20, why: '先回り' }]);
      if (!has(problems, '対応する欠測が無い')) throw new Error(JSON.stringify(problems));
    }],
    ['days が実際の日数と違えば落ちる（台帳の数が実態と違う）', () => {
      const a = SNAP({ date: '2026-08-22' }), b = SNAP({ date: '2026-09-02' });
      const { problems } = validate([a, b], WANT, NOW,
        [{ from: '2026-08-22', to: '2026-09-02', days: 3, why: '理由' }]);
      if (!has(problems, '実際は 11日')) throw new Error(JSON.stringify(problems));
    }],
    ['**認めても「いま遅れている」は免除しない**（過去の間隔だけが対象）', () => {
      const a = SNAP({ date: '2026-08-01' }), b = SNAP({ date: '2026-08-12' });
      const { problems } = validate([a, b], WANT, NOW,
        [{ from: '2026-08-01', to: '2026-08-12', days: 11, why: '理由' }]);
      if (!has(problems, '最新のスナップショットが')) throw new Error(JSON.stringify(problems));
    }],
    ['**固定クエリが0件なら落ちる**（照合する相手が無い状態は照合ではない）', () => {
      const { problems } = validate([SNAP()], [], NOW);
      if (!has(problems, '照合したことにならない')) throw new Error(JSON.stringify(problems));
    }],
    ['**言語タグつきのコードブロックからも読める**（タグ1つで0件にならない）', () => {
      const withTag = queriesFromReadme('```text\n"あ"\n"い"\n```');
      if (withTag.length !== 2) throw new Error(`${withTag.length}件（2件のはず）`);
      const bare = queriesFromReadme('```\n"あ"\n"い"\n```');
      if (bare.length !== 2) throw new Error('素のフェンスが読めなくなった');
    }],
    ['**固定クエリが欠けたら落ちる**（一部だけ検索して「やった」ことにしない）', () => {
      const short = SNAP({ queries: [{ q: WANT[0], new_mentions: [] }] });
      const { problems } = validate([short], WANT, NOW);
      if (!has(problems, '固定クエリが欠けている')) throw new Error(JSON.stringify(problems));
    }],
    ['**間隔が空きすぎたら落ちる**（やらないことが常態になる）', () => {
      const { problems } = validate([SNAP({ date: '2026-07-01' })], WANT, NOW);
      if (!has(problems, '日前')) throw new Error(JSON.stringify(problems));
    }],
    ['**途中の空白も落ちる**（最新だけ見ると隠れる）', () => {
      const snaps = [SNAP({ date: '2026-07-01' }), SNAP({ date: '2026-08-22' })];
      const { problems } = validate(snaps, WANT, NOW);
      if (!has(problems, '空いている')) throw new Error(JSON.stringify(problems));
    }],
    ['**diff_from_last が無ければ落ちる**（前回と比べていないなら定点観測ではない）', () => {
      const { problems } = validate([SNAP({ diff_from_last: null })], WANT, NOW);
      if (!has(problems, 'diff_from_last')) throw new Error(JSON.stringify(problems));
    }],
    ['mentions_us が真偽値でなければ落ちる', () => {
      const bad = SNAP({ queries: WANT.map((q) => ({
        q, new_mentions: [{ url: 'https://x', mentions_us: 'yes' }] })) });
      const { problems } = validate([bad], WANT, NOW);
      if (!has(problems, 'mentions_us')) throw new Error(JSON.stringify(problems));
    }],
    ['スナップショットが1件も無ければ落ちる', () => {
      const { problems } = validate([], WANT, NOW);
      if (!problems.length) throw new Error('通した');
    }],
    ['揃っていれば何も言わない（常に鳴る検査も何も見ていない）', () => {
      const { problems } = validate([SNAP()], WANT, NOW);
      if (problems.length) throw new Error(problems.join(' / '));
    }],
  ];
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
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
    : [];
  const snapshots = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
  const want = fs.existsSync(README) ? queriesFromReadme(fs.readFileSync(README, 'utf8')) : [];
  const acknowledged = fs.existsSync(GAPS)
    ? (JSON.parse(fs.readFileSync(GAPS, 'utf8')).acknowledged ?? []) : [];
  const { problems, rows } = validate(snapshots, want, new Date(), acknowledged);

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
