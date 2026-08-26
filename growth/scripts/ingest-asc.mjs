#!/usr/bin/env node
/**
 * App Store Connect の取得結果を成長計測側へ取り込む。
 *
 *   node growth/scripts/ingest-asc.mjs           # 取り込む
 *   node growth/scripts/ingest-asc.mjs --check   # CI: 受け側の形と、接続状態の整合
 *
 * 【取得は隣のリポジトリでやる】
 * ASC の鍵は simplememo-ios の `appstore` environment にあり、fastlane と
 * nominations が既に使っている。**新しい鍵を配るより、鍵のある場所で取って
 * 集計だけを持ってくるほうが、鍵の置き場所が増えない。**
 * 取得は `../simplememo-ios/scripts/asc_analytics.rb`、ここは読む側。
 *
 * 【行そのものは扱わない】
 * 向こうが書いているのは列名・行数・日付範囲・数値列の合計・
 * **名指しした分類列ごとの内訳**だけ。こちらもそれ以上は持たない。
 * **個人が特定できる列が将来増えたときに、気づかず貯め始めるのを防ぐ。**
 *
 * [2026-08-26] **内訳の値はここへ持ってこないと決めた。**
 * 取得側は内訳を持つようになったが（`Cancellation Reason` は文字列なので
 * 数値列の合計には入らず、⑨解約理由分析が読むべき値が1件も残っていなかった）、
 * **このリポジトリは GitHub 上で公開されている。**契約者が1桁のいま、
 * 解約理由や課金失敗の件数を公開側へ日次で積むのは「広げる」方向の変更になる。
 * 読む側は非公開の ../simplememo-ios/scripts/asc_subscription.rb と asc_funnel.rb。
 * ここが運ぶのは**内訳の列名だけ**で、値は持たない。
 *
 * 【⚠ CI ではこの検査はデータを見ていない】
 * seo-check.yml の checkout は**このリポジトリだけ**なので、CI 上に
 * `../simplememo-ios/data/asc/` は存在しない。つまり CI で走る --check は
 * 常に「未取得」の枝に入り、**取得結果の中身を一度も検査しない。**
 * ここで守れるのは「revenue_connected: true なのにデータが無い」だけ。
 *
 * **取得の健全性は取得側が持つ**（../simplememo-ios の asc-analytics.yml が
 * `asc_analytics.rb --verify-status` で no_match / no_catalog を赤にする）。
 * この分担を忘れて「CIがASCを見張っている」と思い込まないこと。
 *
 * 【接続していないことを、接続しているように見せない】
 * `--check` は data/financial-policy.json の `revenue_connected` と
 * 実際のデータの有無が食い違っていたら落とす。
 * **収入が入っていないのに「入っている」前提の数字を出す**のが、
 * この領域で一番やってはいけないこと。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE_DIR = path.resolve(ROOT, '../simplememo-ios/data/asc');
export const DEST_DIR = path.join(ROOT, 'growth/data/appstore');
const POLICY_PATH = path.join(ROOT, 'data/financial-policy.json');
/** これを超えて新しい取得が無ければ「遅延」。日次なので3日で警告。 */
export const STALE_DAYS = 3;

export function readSource(dir = SOURCE_DIR) {
  const statusPath = path.join(dir, 'status.json');
  if (!fs.existsSync(statusPath)) return { present: false, reason: `${statusPath} が無い` };
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const reports = [];
  for (const r of status.reports || []) {
    const f = path.join(dir, status.date, `${r.slug}.json`);
    if (!fs.existsSync(f)) continue;
    reports.push(JSON.parse(fs.readFileSync(f, 'utf8')));
  }
  return { present: true, status, reports };
}

/** 取り込んだ形。**数字を作らない** — 向こうの集計をそのまま並べ替えるだけ。 */
export function normalize(src) {
  return {
    $comment: [
      'App Store Connect の取得結果（../simplememo-ios/data/asc から）。',
      '**行そのものは持たない。**列名・行数・日付範囲・数値列の合計だけ。',
      '**分類列ごとの内訳の値は持たない**（このリポジトリは公開。読む側は simplememo-ios）。',
      'ここで新しい数字を作らない。向こうの集計をそのまま並べ替えている。',
    ],
    fetched_at: src.status.fetched_at,
    date: src.status.date,
    available_reports: src.status.available_reports ?? [],
    reports: src.reports.map((r) => ({
      report: r.report,
      processing_date: r.processing_date,
      row_count: r.row_count,
      columns: r.columns,
      date_range: r.date_range ?? null,
      sums: r.sums,
      // **内訳の値はこちらへ持ってこない。**列名だけ運ぶ。
      //
      // [2026-08-26] 一度は内訳をそのまま運んでいた。**置き場所として誤り。**
      // このリポジトリは GitHub 上で公開されており（api.github.com が private: false。
      // data/publication-policy.json の repository_is_public）、契約者が1桁のいま
      // 解約理由や課金失敗の件数を公開側へ日次で積むのは「広げる」方向の変更になる。
      // 読む側は非公開の ../simplememo-ios/scripts/asc_subscription.rb と
      // asc_funnel.rb に移した（あちらは日次で実際に動く）。
      //
      // 列名だけ残すのは、**「内訳が届いていない」と「内訳はあるが読んでいない」を
      // こちら側でも区別できるようにする**ため。値は持たない。
      breakdown_dimensions: r.breakdown ? Object.keys(r.breakdown) : null,
    })),
  };
}

/** 待っても直らない状態。**設定の誤りなので、時間では解けない。** */
export const FAULT_STATES = ['no_match', 'no_catalog'];

/**
 * 取得結果と宣言を突き合わせて、**落とすもの／待つもの／確かめられないもの**に分ける。
 *
 * [2026-08-26] **この判定は `if (isMain)` の中に埋まっていて、一度も試せなかった。**
 * 2026-08-25 に直した「0件を待機と故障に分ける」という一番効く部分がそこにある。
 * それまでは 0件でも note が "取得完了" で、ここも「食い違いなし」と言って
 * **毎日0件を緑で出荷していた**（run 32844534637）。
 * 同じことがもう一度起きても、埋まったままなら誰も気づけない。
 */
export function assess(src, opts = {}) {
  const {
    declaredConnected = false,
    siblingVisible = fs.existsSync(SOURCE_DIR),
  } = opts;
  const problems = [];
  const notes = [];

  if (!src.present) {
    // **「見えない」と「無い」を分ける。**隣のディレクトリが在るのに
    // status.json が無い場合だけが本物の矛盾。ディレクトリごと無いなら
    // ここからは確かめようがないので、確かめられないことをそう言う。
    if (declaredConnected && siblingVisible) {
      problems.push('financial-policy.json が revenue_connected: true だが、取得結果が無い'
        + ' — **接続していないのに接続している前提の数字を出すことになる**');
    } else if (declaredConnected) {
      notes.push('revenue_connected: true と宣言されているが、'
        + '**この実行環境からは隣のリポジトリが見えない**ので照合できない');
    }
    return { present: false, problems, notes, state: null, waiting: [] };
  }

  const n = normalize(src);
  const state = src.status.state;
  const waiting = src.status.pending_reports || [];

  if (FAULT_STATES.includes(state)) {
    problems.push(`取得側が state: ${state} — ${src.status.note}`
      + ` / 指定: ${(src.status.wanted_patterns || []).join(', ') || '(空)'}`
      + ` / 利用可能 ${(n.available_reports || []).length} 件`
      + ' — **待っても直らない。**取得側の指定を直すまでデータは降りてこない');
  } else if (state === undefined && n.reports.length === 0
             && (n.available_reports || []).length > 0) {
    // 取得側がまだ state を書かない版のとき。**0件を黙って通さない。**
    problems.push('取得側に state が無く、レポートも0件'
      + ` — 利用可能は ${n.available_reports.length} 件ある。取得側の版が古い可能性`);
  }

  if (!declaredConnected) {
    notes.push('取得結果はあるが financial-policy.json は revenue_connected: false のまま');
  }
  return { present: true, problems, notes, state, waiting, normalized: n };
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
if (process.argv.includes('--selftest')) {
  const src = (status, reports = []) => ({ present: true, status, reports });
  const STATUS = (over = {}) => ({
    fetched_at: '2026-08-25T11:52:24Z', date: '2026-08-25',
    wanted_patterns: ['App Store Purchases'],
    available_reports: ['App Store Purchases Standard'],
    pending_reports: [], note: '', ...over,
  });
  const has = (list, needle) => list.some((x) => x.includes(needle));

  const SCENARIOS = [
    ['**設定の誤り（no_match）は落ちる**（待っても直らない）', () => {
      const r = assess(src(STATUS({ state: 'no_match', wanted_patterns: ['Sales'] })));
      if (!has(r.problems, '待っても直らない')) throw new Error(JSON.stringify(r.problems));
    }],
    ['**no_catalog も落ちる**', () => {
      const r = assess(src(STATUS({ state: 'no_catalog' })));
      if (!r.problems.length) throw new Error('通した');
    }],
    ['**生成待ち（pending）は落とさない**（待てば解ける）', () => {
      const r = assess(src(STATUS({ state: 'pending', pending_reports: ['x'] })));
      if (r.problems.length) throw new Error(`落とした: ${r.problems[0]}`);
      if (r.waiting.length !== 1) throw new Error('待ち件数が出ていない');
    }],
    ['partial も落とさない', () => {
      if (assess(src(STATUS({ state: 'partial' }))).problems.length) throw new Error('落とした');
    }],
    ['**state が無くレポート0件・利用可能ありは落ちる**（0件を黙って通さない）', () => {
      const r = assess(src(STATUS()));
      if (!has(r.problems, '取得側に state が無く')) throw new Error(JSON.stringify(r.problems));
    }],
    ['state が無くても利用可能が0件なら落とさない（本当に何も無い日）', () => {
      const r = assess(src(STATUS({ available_reports: [] })));
      if (r.problems.length) throw new Error(`落とした: ${r.problems[0]}`);
    }],
    ['取得できた（fetched）は落とさない', () => {
      const st = STATUS({ state: 'fetched', matched_reports: ['App Store Purchases Standard'] });
      const r = assess(src(st, [{ report: 'x', row_count: 2, columns: ['a'], sums: {} }]));
      if (r.problems.length) throw new Error(`落とした: ${r.problems[0]}`);
    }],
    ['**接続していると宣言しているのにデータが無ければ落ちる**（隣が見えるとき）', () => {
      const r = assess({ present: false, reason: 'no status' },
        { declaredConnected: true, siblingVisible: true });
      if (!has(r.problems, '接続している前提の数字')) throw new Error(JSON.stringify(r.problems));
    }],
    ['**隣が見えないときは落とさず「照合できない」と言う**（CIで隣が正常でも赤くしない）', () => {
      const r = assess({ present: false, reason: 'no status' },
        { declaredConnected: true, siblingVisible: false });
      if (r.problems.length) throw new Error(`落とした: ${r.problems[0]}`);
      if (!has(r.notes, '照合できない')) throw new Error('黙って通した（**確かめられないことをそう言う**）');
    }],
    ['接続していないと宣言していれば、データが無くても落とさない', () => {
      const r = assess({ present: false, reason: 'x' },
        { declaredConnected: false, siblingVisible: true });
      if (r.problems.length) throw new Error(`落とした: ${r.problems[0]}`);
    }],
    ['**内訳の値は運ばない**（公開リポジトリへ解約理由を日次で積まない）', () => {
      const n = normalize(src(STATUS({ state: 'fetched' }), [{
        report: 'x', row_count: 1, columns: ['a'], sums: {},
        breakdown: { 'Cancellation Reason': { '価格': 3 } },
      }]));
      const row = n.reports[0];
      if (JSON.stringify(row).includes('価格')) throw new Error('内訳の値を運んだ');
      if (!row.breakdown_dimensions?.includes('Cancellation Reason')) {
        throw new Error('列名まで落としている（届いていないと読んでいないを区別できない）');
      }
    }],
    ['内訳が無ければ breakdown_dimensions は null（届いていないと区別できる）', () => {
      const n = normalize(src(STATUS(), [{ report: 'x', row_count: 1, columns: [], sums: {} }]));
      if (n.reports[0].breakdown_dimensions !== null) throw new Error('null でない');
    }],
    ['**行そのものを持たない**（個人が特定できる列を気づかず貯め始めない）', () => {
      const n = normalize(src(STATUS(), [{
        report: 'x', row_count: 1, columns: ['a'], sums: { a: 1 },
        rows: [{ a: 1, email: 'x@example.com' }],
      }]));
      if (JSON.stringify(n).includes('example.com')) throw new Error('行を運んだ');
    }],
    ['実データの取得結果があれば、それも通る（隣が見えるときだけ）', () => {
      const real = readSource();
      if (!real.present) return; // CI では隣が無い。そこは上の2件で見ている
      const r = assess(real, { declaredConnected: false, siblingVisible: true });
      if (r.problems.length) throw new Error(r.problems[0]);
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
  const check = process.argv.includes('--check');
  const src = readSource();
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const declaredConnected = Boolean(policy.cash_scenarios?.revenue_connected);

  // **判定は assess() が持つ。**ここは表示と書き出しだけ。
  // 判定を if (isMain) の中に書くと、一度も試せないまま出荷することになる。
  const verdict = assess(src, { declaredConnected });
  const problems = verdict.problems;

  if (!src.present) {
    console.log('App Store Connect: **未取得**');
    console.log(`  ${src.reason}`);
    console.log('  取得は ../simplememo-ios の asc-analytics.yml（毎日 20:30 JST）。');
    console.log('  **ONGOING のレポート要求を作った当日はデータが出ない。**初回の0件は失敗ではない。');
    if (verdict.notes.some((x) => x.includes('照合できない'))) {
      console.log('\n  NOTE: revenue_connected: true と宣言されているが、'
        + '**この実行環境からは隣のリポジトリが見えない**ので照合できない。');
      console.log('  （seo-check.yml の checkout はこのリポジトリだけ。'
        + '取得の健全性は取得側の asc-analytics.yml が --verify-status で持つ）');
    }
  } else {
    const n = verdict.normalized;
    console.log(`App Store Connect: ${n.date} 取得（${n.reports.length} レポート）`);

    if (verdict.state === 'pending' || verdict.state === 'partial') {
      console.log(`  状態: ${verdict.state} — 生成待ち ${verdict.waiting.length} 件`);
      if (verdict.waiting.length) console.log(`    ${verdict.waiting.slice(0, 6).join(' / ')}`);
    }

    for (const r of n.reports) {
      console.log(`  ${r.report}  ${r.row_count} 行  列 ${r.columns.length}`);
      const sums = Object.entries(r.sums || {}).slice(0, 4);
      if (sums.length) console.log(`    ${sums.map(([k, v]) => `${k}=${v}`).join(' / ')}`);
    }
    const age = Math.round((Date.now() - new Date(n.fetched_at)) / 86400000);
    if (age > STALE_DAYS) {
      console.log(`  ⚠ 最終取得から ${age} 日。**「取得できなかった」と「増えていない」を取り違えない**`);
    }
    if (!check) {
      fs.mkdirSync(DEST_DIR, { recursive: true });
      const out = path.join(DEST_DIR, `${n.date}.json`);
      fs.writeFileSync(out, `${JSON.stringify(n, null, 2)}\n`);
      console.log(`\n  → growth/data/appstore/${n.date}.json`);
    }
    if (verdict.notes.some((x) => x.includes('revenue_connected: false'))) {
      console.log('\n  NOTE: 取得結果はあるが financial-policy.json は revenue_connected: false のまま。');
      console.log('  **売上そのものが取れているかは、レポートの中身を見て人が判断する。**');
      console.log('  判断したら revenue_connected を true にする（そのとき資金繰りに収入側が入る）。');
    }
  }

  if (problems.length) {
    console.error('\nASC 取り込み: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (check) console.log('\n受け側の形と接続状態の宣言に食い違いなし。');
}
