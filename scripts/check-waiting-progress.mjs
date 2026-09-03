#!/usr/bin/env node
/**
 * **「待ち」が本当に進んでいるかを見る。止まっていたら落とす。**
 *
 *   node scripts/check-waiting-progress.mjs            # 一覧
 *   node scripts/check-waiting-progress.mjs --check    # CI
 *   node scripts/check-waiting-progress.mjs --selftest # 判定の自己検査
 *
 * 【なぜ要るか — 待ったのに動かない、を一度やっている】
 * ⑤粗利と⑥LTVは『収入の観測が28日たまる待ち』に分類され、台帳は
 * **2026-09-19 に揃う**と書いていた。2026-09-01 に実測したらこうだった:
 *
 *     covered_days   2 / 28
 *     last_day       2026-08-26 —— 6日前で止まっている
 *     実測レート     10暦日で2日ぶん → 28日到達は **2027-01-09**
 *
 * **4か月ずれていた。**しかも 2026-08-26 に「待っても永久に貯まらない」と気づいて
 * 配線を直した**あとの**話で、直したのに進んでいなかった。
 *
 * `autonomy-gap.mjs` の `--plan` は待ちを「待つだけ」と並べる。
 * **止まっている待ちも、進んでいる待ちと同じ顔で並ぶ。**そこを見分ける。
 *
 * 【落とすのは「動いていない」ほうだけ】
 * 期日（expected）で落とさない。期日は見込みで、遅れること自体は異常ではない。
 * **遅れで落とすと、遅れているだけの待ちを毎日赤くして、検査が読まれなくなる。**
 * 落とすのは**カウンタが stale_budget_days のあいだ動かなかった**とき。
 *
 * 【目標に届いていたら見ない】
 * 届いた待ちは、そのあと更新が止まっても構わない（もう待っていない）。
 * **届いていないのに止まっている**ときだけが問題。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/waiting-progress.json');

const DAY = 86400000;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** ディレクトリ名のうち日付に見えるものの最大。**日付でない名前は拾わない。** */
export function latestLabel(names) {
  const dates = (names ?? []).filter(isDate).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * **純粋な判定。**`now` と、待ち1件ぶんの観測値から状態を出す。
 * `value`/`target` は数（無ければ null）、`freshness` は YYYY-MM-DD（無ければ null）。
 */
export function assess(wait, { value = null, target = null, freshness = null, now }) {
  const reached = value != null && target != null && value >= target;
  const staleDays = freshness ? Math.floor((now - Date.parse(freshness)) / DAY) : null;
  const budget = wait.stale_budget_days;

  if (reached) return { state: 'reached', value, target, staleDays };
  if (freshness == null) {
    return { state: 'unreadable', value, target, staleDays,
      why: '鮮度を読む欄が無い — **読めないことを「進んでいる」と書かない**' };
  }
  if (staleDays > budget) {
    const ack = wait.acknowledged_stall;
    const expired = ack && (!isDate(ack.review_by) || now > Date.parse(ack.review_by));
    return { state: 'stalled', value, target, staleDays, ack: ack ?? null, expired: Boolean(expired),
      why: `${staleDays} 日動いていない（上限 ${budget} 日）` };
  }
  return { state: 'moving', value, target, staleDays };
}

/** 台帳1件を実ファイルから読む。読めないものは null にして、推測で埋めない。 */
export function observe(wait, { root = ROOT, readDir = (p) => fs.readdirSync(p) } = {}) {
  if (wait.dir) {
    let names = [];
    try { names = readDir(path.join(root, wait.dir)); } catch { names = []; }
    return { value: null, target: null, freshness: latestLabel(names) };
  }
  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(root, wait.file), 'utf8')); }
  catch { return { value: null, target: null, freshness: null }; }
  const num = (k) => (k && typeof doc[k] === 'number' ? doc[k] : null);
  const fresh = wait.freshness_field ? doc[wait.freshness_field] : null;
  return { value: num(wait.progress_field), target: num(wait.target_field),
    freshness: isDate(fresh) ? fresh : null };
}

export function validate(ledger, { now = Date.now(), root = ROOT, observer = null } = {}) {
  const problems = [];
  const rows = [];
  const waits = ledger?.waits;
  if (!Array.isArray(waits)) return { problems: ['waits が配列でない'], rows };

  for (const w of waits) {
    if (!Number.isFinite(w.stale_budget_days) || w.stale_budget_days <= 0) {
      problems.push(`「${w.id}」の stale_budget_days が正の数でない — **上限の無い待ちは止まっても気づけない**`);
      continue;
    }
    const obs = observer ? observer(w) : observe(w, { root });
    const r = assess(w, { ...obs, now });
    rows.push({ ...w, ...r });
    if (r.state === 'stalled') {
      const head = `「${w.label}」が止まっている — ${r.why}`
        + (r.value != null && r.target != null ? `。${r.value}/${r.target} のまま` : '');
      if (!r.ack) {
        // **新しく止まった。**誰も知らないので落とす。
        problems.push(`${head}。**台帳の見込みは ${w.expected}** — `
          + '既知なら acknowledged_stall に理由と review_by を書くこと');
      } else if (r.expired) {
        // **承認の期限が切れた。**「知っている」を無期限の免罪符にしない。
        problems.push(`${head}。**${w.acknowledged_stall.review_by} までに直す約束が切れている** — `
          + `${w.acknowledged_stall.why}`);
      }
    }
    if (r.state === 'unreadable') {
      problems.push(`「${w.label}」の進み具合が読めない — ${r.why}`);
    }
  }
  return { problems, rows };
}

const T = (id, extra = {}) => ({ id, label: id, stale_budget_days: 4, expected: '2026-09-19', ...extra });
const NOW = Date.parse('2026-09-01');
/** 止まっている観測（実データを読まずに停止の枝を通す）。 */
const STALLED = () => ({ value: 2, target: 28, freshness: '2026-08-20' });

const SELFTESTS = [
  ['**止まっていれば stalled**（上限を超えた）', () => {
    const r = assess(T('x'), { value: 2, target: 28, freshness: '2026-08-26', now: NOW });
    if (r.state !== 'stalled') throw new Error(`stalled でなく ${r.state}`);
  }],
  ['上限の内側なら moving', () => {
    const r = assess(T('x'), { value: 5, target: 28, freshness: '2026-08-30', now: NOW });
    if (r.state !== 'moving') throw new Error(`moving でなく ${r.state}`);
  }],
  ['**目標に届いていたら、止まっていても見ない**（もう待っていない）', () => {
    const r = assess(T('x'), { value: 28, target: 28, freshness: '2026-01-01', now: NOW });
    if (r.state !== 'reached') throw new Error(`reached でなく ${r.state}`);
  }],
  ['**鮮度が読めないときに「進んでいる」と書かない**', () => {
    const r = assess(T('x'), { value: 2, target: 28, freshness: null, now: NOW });
    if (r.state !== 'unreadable') throw new Error(`unreadable でなく ${r.state}`);
  }],
  ['**期日を過ぎただけでは落ちない**（遅れと停止を混ぜない）', () => {
    const r = assess(T('x', { expected: '2026-01-01' }), { value: 5, target: 28, freshness: '2026-08-30', now: NOW });
    if (r.state !== 'moving') throw new Error(`期日超過で ${r.state} になった`);
  }],
  ['latestLabel は日付でない名前を拾わない', () => {
    if (latestLabel(['README.md', '2026-08-24', 'tmp']) !== '2026-08-24') throw new Error('拾い方が違う');
    if (latestLabel([]) !== null) throw new Error('空で null を返さない');
  }],
  ['**上限が無い待ちは落とす**（止まっても気づけない設定を作らせない）', () => {
    const r = validate({ waits: [{ id: 'x', label: 'x', file: 'nope.json' }] }, { now: NOW });
    if (!r.problems.some((p) => p.includes('stale_budget_days'))) throw new Error('素通りした');
  }],
  ['**止まっていて未承認なら落ちる**（新しい停止は誰も知らない）', () => {
    const r = validate({ waits: [T('x')] }, { now: NOW, observer: STALLED });
    if (!r.problems.some((p) => p.includes('acknowledged_stall'))) throw new Error('未承認の停止が素通りした');
  }],
  ['**承認済みの停止は落とさない**（新しい赤を足さない）', () => {
    const w = T('x', { acknowledged_stall: { since: '2026-09-01', why: 'r', review_by: '2026-09-08' } });
    const r = validate({ waits: [w] }, { now: NOW, observer: STALLED });
    if (r.problems.length) throw new Error(`承認済みで落ちた: ${r.problems.join(' / ')}`);
  }],
  ['**承認の期限が切れたら落とす**（「知っている」を無期限の免罪符にしない）', () => {
    const w = T('x', { acknowledged_stall: { since: '2026-08-01', why: 'r', review_by: '2026-08-20' } });
    const r = validate({ waits: [w] }, { now: NOW, observer: STALLED });
    if (!r.problems.some((p) => p.includes('約束が切れている'))) throw new Error('期限切れが素通りした');
  }],
  ['**review_by の無い承認は期限切れ扱い**（期限の無い免罪符を作らせない）', () => {
    const w = T('x', { acknowledged_stall: { since: '2026-08-01', why: 'r' } });
    const r = validate({ waits: [w] }, { now: NOW, observer: STALLED });
    if (!r.problems.length) throw new Error('期限の無い承認が素通りした');
  }],
  // 【2026-09-03 に書き換えた】旧版は「実データの `revenue_28d` が **stalled** であること」を
  // 直接assertしていた。この検査が空回りしていないことを実データで示すのが目的で、
  // 当時それが実際に止まっていたので、そのまま条件に使えた。
  //
  // **止まっていた原因は、待ちそのものではなく写しだった。**
  // `data/revenue-series.json` は隣（simplememo-ios）からの写しで、2026-08-28 から
  // 更新されていなかった。09-03 に `revenue-series.mjs --write` を走らせたら
  // covered_days 2→4・last_day 08-26→09-01 に動いた。**待ちは進んでいる。**
  //
  // ここで assert を消すと、この検査が空回りしても誰も気づかなくなる。
  // **assert は残し、実データが「止まっている」ことに依存するのをやめた** ——
  // 実データを読んで全件が分類できることと、**その実データの鮮度だけを退かせると
  // 実際に stalled が出ること**（＝判定が生きていること）を見る。
  ['**実データ: 全件を分類できる**（読めない待ちを残さない）', () => {
    const led = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    const r = validate(led, { now: NOW });
    if (!r.rows.length) throw new Error('待ちが1件も無い — **この検査が空回りしている**');
    const bad = r.rows.filter((x) => x.state === 'unreadable');
    if (bad.length) throw new Error(`鮮度を読めない待ち: ${bad.map((x) => x.id).join(', ')}`);
  }],
  ['**実データ: 鮮度を退かせれば stalled が出る**（判定が生きている）', () => {
    const led = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    // 実データの待ちを1件ずつ、**鮮度だけ**上限より古くして観測させる。
    // value/target は実データのまま（目標に届いていれば見ない、の枝も生きたまま）。
    const base = validate(led, { now: NOW });
    const stale = new Date(NOW - 400 * DAY).toISOString().slice(0, 10);
    const r = validate(led, { now: NOW, observer: (w) => {
      const row = base.rows.find((x) => x.id === w.id) ?? {};
      return { value: row.value ?? 0, target: row.target ?? 28, freshness: stale };
    } });
    if (!r.rows.some((x) => x.state === 'stalled')) {
      throw new Error('鮮度を退かせても stalled が出ない — **この検査が空回りしている**');
    }
  }],
];

function main() {
  if (process.argv.includes('--selftest')) {
    let failed = 0;
    for (const [name, fn] of SELFTESTS) {
      try { fn(); console.log(`  ok   ${name}`); }
      catch (e) { failed++; console.error(`  NG   ${name}\n       ${e.message}`); }
    }
    console.log(`\n  waiting-progress 自己テスト ${SELFTESTS.length} 件中 ${failed} 件失敗`);
    process.exit(failed ? 1 : 0);
  }

  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const { problems, rows } = validate(ledger);

  console.log('待ちが進んでいるか\n');
  for (const r of rows) {
    const mark = { reached: '到達    ', moving: '進んでいる', stalled: '**止まっている**', unreadable: '**読めない**' }[r.state];
    const n = r.value != null && r.target != null ? ` ${r.value}/${r.target}` : '';
    console.log(`  ${mark}  ${r.label}${n}`);
    console.log(`            見込み ${r.expected}`
      + (r.staleDays != null ? ` / 最終更新から ${r.staleDays} 日` : ''));
    if (r.why) console.log(`            ${r.why}`);
    if (r.ack) {
      console.log(`            **承認済みの停止**（${r.ack.review_by} まで）: ${r.ack.why}`);
      if (r.expired) console.log('            **期限切れ。落とす。**');
    }
  }
  console.log('\n  **落とすのは「動いていない」ほうだけ。**期日の遅れでは落とさない');
  console.log('  （遅れているだけの待ちを毎日赤くすると、検査が読まれなくなる）。');

  if (problems.length) {
    console.error('\n待ちが進んでいない:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\nすべての待ちが動いている。');
}

// **export しているので、import した瞬間に main() が走らないよう囲う。**
// 囲わないと `process.exit()` がガードの外に出て、**import した側が黙って exit 0 する**
// （scripts/check-module-entry.mjs がこの形を落とす）。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
