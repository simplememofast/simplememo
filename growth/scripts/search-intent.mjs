#!/usr/bin/env node
/**
 * **検索意図が動いた場所を、窓をまたいで見つける。**
 *
 *   node growth/scripts/search-intent.mjs             # 表示
 *   node growth/scripts/search-intent.mjs --json
 *   node growth/scripts/search-intent.mjs --check     # CI
 *   node growth/scripts/search-intent.mjs --selftest
 *
 * 【なぜ要るか】
 * data/automation-coverage.json の「検索意図（Search Intent）の変化検出」が
 * `nobody` で、理由もそこに書いてある —— **材料は analyze.mjs にある（CTR gap）。
 * 無いのは窓をまたいだ比較。**単一スナップショットの分析はあるが、
 * 「前の窓と比べて何が変わったか」を出す経路が無かった。
 *
 * 【いちばん強い信号は「当たるページが入れ替わったこと」】
 * 同じクエリに Google が**別のページを当てるようになった**なら、
 * 検索側が解釈している意図が動いている。実測（2026-08-11 → 2026-08-24）:
 *
 *   google keep 系4件  /blog/line-keep-alternatives → /blog/google-keep-shutdown
 *   memo apps          /blog/best-memo-apps-2026    → /en/blog/best-memo-apps
 *   memos vs obsidian  /obsidian/                   → /en/vs/obsidian/
 *
 * 【この道具が使わない信号】**クエリの出現・消滅は使わない。**
 * スナップショットは 1000 / 900 行の API 上限で切れており、
 * **最小表示回数は両方とも1**。つまり下位は行数上限で落ちているだけで、
 * 「消えた533件」は意図の変化ではない。**実測してからこの信号を捨てた。**
 *
 * 【窓の長さが違う】08-11 は28日、08-24 は13日。
 * **表示回数は比較しない**（長さが違えば当然変わる）。比べるのは
 * 順位・CTR・当たるページという、長さに依存しない量だけ。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSnapshots, loadSnapshot, curveFor, expectedCtr } from '../lib/gsc.mjs';

/** 両窓でこの表示回数を超えないと比べない。**1クリックでCTRが跳ねる母数で判定しない。** */
export const MIN_IMPRESSIONS = 10;
/** 順位がこれだけ動いたら「動いた」と呼ぶ。 */
export const POSITION_SHIFT = 3;

const topPages = (queryPages) => {
  const best = new Map();
  for (const r of queryPages || []) {
    const cur = best.get(r.query);
    if (!cur || r.impressions > cur.impressions) best.set(r.query, r);
  }
  return best;
};

const shortPath = (url) => String(url).replace(/^https?:\/\/[^/]+/, '') || '/';

/**
 * 2つのスナップショットを比べる。**共通クエリで、両窓とも母数が足りるものだけ。**
 *
 * 出現・消滅を返さないのは意図的。行数上限で切れている以上、
 * 「無くなった」と「上限より下に落ちた」を区別できない。
 */
export function compare(prev, curr, { minImpressions = MIN_IMPRESSIONS } = {}) {
  const a = new Map((prev.queries || []).map((q) => [q.query, q]));
  const b = new Map((curr.queries || []).map((q) => [q.query, q]));
  const pa = topPages(prev.queryPages);
  const pb = topPages(curr.queryPages);

  const comparable = [];
  for (const [q, y] of b) {
    const x = a.get(q);
    if (!x) continue;
    if (x.impressions < minImpressions || y.impressions < minImpressions) continue;
    comparable.push({ query: q, before: x, after: y });
  }

  // **曲線が無ければ gap は出さない。**0 で埋めると「順位で説明できる」と
  // 「比べる相手が無い」が同じ値になる。この検査が探している形そのもの
  const safeCurve = (meta) => { try { return curveFor(meta, 'all') ?? null; } catch { return null; } };
  const safeExpected = (curve, pos) => {
    if (!curve) return null;
    try { const v = expectedCtr(curve, pos); return Number.isFinite(v) ? v : null; } catch { return null; }
  };
  const curveA = safeCurve(prev.meta);
  const curveB = safeCurve(curr.meta);
  const rows = comparable.map(({ query, before, after }) => {
    const pageBefore = pa.get(query)?.page;
    const pageAfter = pb.get(query)?.page;
    const expA = safeExpected(curveA, before.position);
    const expB = safeExpected(curveB, after.position);
    return {
      query,
      position_before: before.position,
      position_after: after.position,
      position_delta: after.position - before.position,
      ctr_before: before.ctr,
      ctr_after: after.ctr,
      // **順位で説明できるぶんを引いた残り。**順位が上がればCTRは上がるので、
      // 生のCTR差だけを見ると「意図が変わった」と「順位が動いた」を混ぜる
      gap_before: expA == null ? null : before.ctr - expA,
      gap_after: expB == null ? null : after.ctr - expB,
      page_before: pageBefore ? shortPath(pageBefore) : null,
      page_after: pageAfter ? shortPath(pageAfter) : null,
      page_switched: Boolean(pageBefore && pageAfter && pageBefore !== pageAfter),
    };
  });

  return {
    from: prev.label,
    to: curr.label,
    window_before: [prev.meta?.period_start ?? null, prev.meta?.period_end ?? null],
    window_after: [curr.meta?.period_start ?? null, curr.meta?.period_end ?? null],
    min_impressions: minImpressions,
    comparable: rows.length,
    // **並べる順は「ページが入れ替わった」が先。**いちばん強い信号なので
    switched: rows.filter((r) => r.page_switched),
    moved: rows.filter((r) => !r.page_switched && Math.abs(r.position_delta) >= POSITION_SHIFT)
      .sort((x, y) => Math.abs(y.position_delta) - Math.abs(x.position_delta)),
  };
}

/**
 * **窓が同じ長さかどうかを言う。**違うなら、表示回数を比べてはいけないと明示する。
 * 黙って比べると「増えた/減った」が窓の長さの話になる。
 */
export function windowNote(r) {
  const days = ([s, e]) => (s && e
    ? Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86400000) + 1
    : null);
  const d0 = days(r.window_before); const d1 = days(r.window_after);
  if (d0 == null || d1 == null) return '**窓の長さが分からない**（meta に period が無い）';
  if (d0 === d1) return `窓は同じ長さ（${d0}日）`;
  return `**窓の長さが違う（${d0}日 → ${d1}日）。**表示回数は比べていない`
    + ' — 比べているのは順位・CTR・当たるページだけ';
}

export function validate(r) {
  const problems = [];
  if (r.comparable === 0) {
    problems.push('比べられるクエリが0件 — **両窓に共通で母数の足りるクエリが無い。**'
      + 'スナップショットが揃っているか確認すること');
  }
  for (const s of r.switched) {
    if (!s.page_before || !s.page_after) {
      problems.push(`${s.query}: 片側のページが無いのに入れ替わり扱いになっている`);
    }
  }
  for (const m of r.moved) {
    if (m.page_switched) problems.push(`${m.query}: 入れ替わりが順位変化の側に混ざっている`);
    if (Math.abs(m.position_delta) < POSITION_SHIFT) {
      problems.push(`${m.query}: しきい値 ${POSITION_SHIFT} 未満なのに並んでいる`);
    }
  }
  return problems;
}

export function render(r) {
  const o = [];
  const p = (x) => (x == null ? '  —  ' : `${(x * 100).toFixed(1)}%`.padStart(6));
  o.push(`検索意図の変化 ${r.from} → ${r.to}`);
  o.push(`  ${windowNote(r)}`);
  o.push(`  比べたクエリ ${r.comparable} 件（両窓とも表示 ${r.min_impressions} 回以上）\n`);

  o.push(`■ 当たるページが入れ替わった（**いちばん強い信号**） ${r.switched.length} 件`);
  if (!r.switched.length) o.push('    無し');
  for (const s of r.switched) {
    o.push(`    ${s.query.slice(0, 32).padEnd(32)} ${s.page_before} → ${s.page_after}`);
    o.push(`    ${' '.repeat(32)} 順位 ${s.position_before.toFixed(1)} → ${s.position_after.toFixed(1)}`
      + ` / CTR ${p(s.ctr_before)} → ${p(s.ctr_after)}`);
  }

  o.push(`\n■ 順位が ${POSITION_SHIFT} 位以上動いた（ページは同じ） ${r.moved.length} 件`);
  if (!r.moved.length) o.push('    無し');
  for (const m of r.moved.slice(0, 8)) {
    o.push(`    ${m.position_delta > 0 ? '↓' : '↑'}${Math.abs(m.position_delta).toFixed(1).padStart(5)}`
      + `  ${m.position_before.toFixed(1)} → ${m.position_after.toFixed(1)}  ${m.query.slice(0, 40)}`);
  }
  if (r.moved.length > 8) o.push(`    … 他 ${r.moved.length - 8}件`);

  o.push('\n  **クエリの出現・消滅は出していない。**スナップショットは行数上限で');
  o.push('  切れており（最小表示回数は両窓とも1）、「消えた」と「上限より下に落ちた」を');
  o.push('  区別できない。**区別できない差を意図の変化と呼ばない。**');
  return o.join('\n');
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const snap = (label, queries, queryPages, meta = {}) =>
  ({ label, meta: { period_start: '2026-08-01', period_end: '2026-08-14', ...meta }, queries, queryPages });
const Q = (query, position, ctr, impressions = 100) => ({ query, position, ctr, impressions, clicks: 1 });
const QP = (query, page, impressions = 100) => ({ query, page, impressions, clicks: 1, position: 1, ctr: 0.1 });

function selftest() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name);
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };

  const base = (qs, qps) => snap('x', qs, qps);

  // **母数が足りないものは比べない**
  const thin = compare(base([Q('a', 5, 0.1, 3)], []), base([Q('a', 9, 0.1, 3)], []));
  t('**母数が足りなければ比べない**（1クリックでCTRが跳ねる）', thin.comparable === 0);

  // 片方の窓にしか無いクエリは扱わない
  const only = compare(base([Q('a', 5, 0.1)], []), base([Q('b', 5, 0.1)], []));
  t('**片方にしか無いクエリは出さない**（行数上限と区別できない）', only.comparable === 0);

  // ページの入れ替わり
  const sw = compare(base([Q('a', 5, 0.1)], [QP('a', 'https://x/old/')]),
    base([Q('a', 5, 0.1)], [QP('a', 'https://x/new/')]));
  t('当たるページが変わったら拾う', sw.switched.length === 1);
  t('パスだけにして出す', sw.switched[0].page_before === '/old/' && sw.switched[0].page_after === '/new/');

  // 同じページなら入れ替わりではない
  const same = compare(base([Q('a', 5, 0.1)], [QP('a', 'https://x/p/')]),
    base([Q('a', 5, 0.1)], [QP('a', 'https://x/p/')]));
  t('同じページなら入れ替わりにしない', same.switched.length === 0);

  // 順位の変化
  const mv = compare(base([Q('a', 12, 0.1)], []), base([Q('a', 5, 0.1)], []));
  t(`順位が ${POSITION_SHIFT} 位以上動いたら拾う`, mv.moved.length === 1);
  const small = compare(base([Q('a', 6, 0.1)], []), base([Q('a', 5, 0.1)], []));
  t('**小さな揺れは拾わない**', small.moved.length === 0);

  // 入れ替わりと順位変化を二重に数えない
  const both = compare(base([Q('a', 12, 0.1)], [QP('a', 'https://x/old/')]),
    base([Q('a', 5, 0.1)], [QP('a', 'https://x/new/')]));
  t('**入れ替わりを順位変化の側に混ぜない**（二重に数えない）',
    both.switched.length === 1 && both.moved.length === 0);

  // 窓の長さ
  t('**窓の長さが違えば、そう言う**',
    windowNote({ window_before: ['2026-07-01', '2026-07-28'], window_after: ['2026-08-01', '2026-08-13'] })
      .includes('窓の長さが違う'));
  t('同じ長さならそう言う',
    windowNote({ window_before: ['2026-08-01', '2026-08-14'], window_after: ['2026-08-15', '2026-08-28'] })
      .includes('同じ長さ'));
  t('**period が無ければ「分からない」と言う**（同じ長さと決めない）',
    windowNote({ window_before: [null, null], window_after: [null, null] }).includes('分からない'));

  // 比べられない状態を「変化なし」と読まない
  t('**比べられるクエリが0件なら落ちる**（0件と「変化なし」を混ぜない）',
    validate({ comparable: 0, switched: [], moved: [] }).length === 1);

  // 実データ
  const labels = listSnapshots();
  if (labels.length >= 2) {
    const r = compare(loadSnapshot(labels[labels.length - 2]), loadSnapshot(labels[labels.length - 1]));
    t('**実データで比べられる**', r.comparable > 0);
    t('実データの検査が通る', validate(r).length === 0);
  } else {
    t('**スナップショットが2つ未満**（比較そのものが成立しない）', false);
  }

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const labels = listSnapshots();
  if (labels.length < 2) {
    console.error('スナップショットが2つ未満 — **窓をまたいだ比較が成立しない**');
    process.exit(1);
  }
  const r = compare(loadSnapshot(labels[labels.length - 2]), loadSnapshot(labels[labels.length - 1]));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
  console.log(render(r));
  const problems = validate(r);
  if (problems.length) {
    console.error('\n検索意図の変化: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n比較は共通クエリのみ。出現・消滅は使っていない。');
}
