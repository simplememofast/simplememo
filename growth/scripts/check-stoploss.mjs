#!/usr/bin/env node
/**
 * 進行中のマーケ施策を、**評価日を待たずに**見る。
 *
 *   node growth/scripts/check-stoploss.mjs            # 表示
 *   node growth/scripts/check-stoploss.mjs --check    # CI（revert 相当があれば落とす）
 *   node growth/scripts/check-stoploss.mjs --selftest # 判定の自己検査
 *
 * 【何のために落とすか】
 * experiments.json は評価日を持つが、**評価日までの間に悪化しても誰も止めない。**
 * 2026-07-01/02 の7件は6週間そのままで、しかも基準値未記録で最後まで判定できなかった。
 * **「評価日に判定する」と「悪化したら止める」は別の仕組み**で、後者が無かった。
 *
 * 【CI を落とすのは revert のときだけ】
 * hold（母数不足・基準値なし・スナップショット欠落）では落とさない。
 * **判定できないことは異常ではない。**ただし黙って通さず、必ず件数を出す —
 * hold が増え続けているなら、それは計測側の問題として別に見える必要がある。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLedger, isOpen, measuresPageCtr } from '../lib/ledger.mjs';
import { latestSnapshot } from '../lib/gsc.mjs';
import { evaluate, isAutonomous, DEFAULT_RULES } from '../lib/stoploss.mjs';
import { selftestTally } from '../../scripts/lib/tally.mjs';

/**
 * **「そのページのGSC CTR を測っている実験」だけを対象にする。**
 *
 * 判定は growth/lib/ledger.mjs の measuresPageCtr が持つ —— この検査を
 * 書いたとき、ここで独自に「baseline に clicks と impressions があるか」で
 * 絞って**偽陽性を出した**（aio-2026-08-11-answer-blocks に
 * 「CTR 13.53% → 1.70%、相対87.4%低下、戻せ」。実際のあの baseline は
 * ブランド検索14クエリの合計で、target_metric は brand_search_impressions、
 * 判定日は 2026-11-11。**そもそも別のものを測っていた**）。
 *
 * **台帳の行が同じ形をしていることと、同じものを測っていることは違う。**
 */
export function targetsOf(ledger) {
  return (ledger.experiments || []).filter((e) => isOpen(e) && measuresPageCtr(e));
}

/**
 * Select exactly one usable GSC page row. A duplicate is ambiguous even when
 * counts match; row order must never choose a rollback. Unknown input stays hold.
 * This checks selection only, not snapshot freshness or causal attribution.
 */
export function selectCurrent(pagePath, rows) {
  const hold = (code, reason, matchingRows = null) => ({
    status: 'hold', current: null, reason_code: code, reason, matching_rows: matchingRows,
  });
  if (typeof pagePath !== 'string' || !pagePath.length) {
    return hold('invalid_page_target', '対象pageを確定できないため判定しない');
  }
  if (rows == null) {
    return hold('snapshot_unavailable', '現在値が取れない（スナップショット欠落。変化なしとは数えない）');
  }
  if (!Array.isArray(rows)) {
    return hold('invalid_page_collection', '現在のpagesが配列ではないため判定しない');
  }
  // Inspect every row before accepting a hit: a later malformed row might hide
  // another target row. Unrelated, identifiable pages need no count admission.
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || !Object.hasOwn(row, 'page') || typeof row.page !== 'string' || !row.page.length) {
      return hold('invalid_page_row', '現在のpagesにpageを確定できない行があるため判定しない');
    }
  }
  const matching = rows.filter((row) => row.page === pagePath);
  if (matching.length === 0) {
    return hold('page_row_missing', '対象pageの現在値が無い（観測ゼロとは推定しない）', 0);
  }
  if (matching.length > 1) {
    return hold('duplicate_page_rows', '対象pageの現在値が複数あるため判定しない（行順で選ばない）', matching.length);
  }
  const hit = matching[0];
  if (!Object.hasOwn(hit, 'clicks') || !Object.hasOwn(hit, 'impressions')
      || !Number.isFinite(hit.clicks) || !Number.isFinite(hit.impressions)
      || hit.clicks < 0 || hit.impressions <= 0 || hit.clicks > hit.impressions) {
    return hold('invalid_matching_counts', '対象pageのclicks/impressionsが有効な観測件数ではないため判定しない', 1);
  }
  return {
    status: 'ok', current: { clicks: hit.clicks, impressions: hit.impressions },
    reason_code: null, reason: null, matching_rows: 1,
  };
}

/** Preserve the existing counts-or-null API for other callers. */
export function currentFor(pagePath, rows) {
  return selectCurrent(pagePath, rows).current;
}

/** The actual CLI consumer preserves explicit hold reasons before evaluating CTR. */
export function evaluateCurrent(baseline, pagePath, rows, rules = DEFAULT_RULES) {
  const selected = selectCurrent(pagePath, rows);
  if (selected.status !== 'ok') {
    return {
      action: 'hold', reason: selected.reason,
      evidence: { current_selection: { code: selected.reason_code, matching_rows: selected.matching_rows } },
    };
  }
  return evaluate(baseline, selected.current, rules);
}

function selftest() {
  const { t, finish } = selftestTally();

  // 大きく悪化 + 十分な母数 → revert
  const bad = evaluate({ clicks: 100, impressions: 2000 }, { clicks: 20, impressions: 2000 });
  t('大きく悪化したら revert', bad.action === 'revert');
  t('revert は自律実行してよい', isAutonomous('revert'));

  // 改善 → continue
  t('改善していたら continue',
    evaluate({ clicks: 50, impressions: 2000 }, { clicks: 90, impressions: 2000 }).action === 'continue');

  // 母数不足 → hold（**「異常なし」にしない**）
  const small = evaluate({ clicks: 1, impressions: 20 }, { clicks: 0, impressions: 15 });
  t('母数不足は hold（continue にしない）', small.action === 'hold');
  t('母数不足の理由に下限を書く', small.reason.includes('下限'));

  // 基準値なし → hold
  t('基準値が無ければ hold', evaluate(null, { clicks: 5, impressions: 500 }).action === 'hold');
  t('現在値が取れなければ hold（変化なしにしない）',
    evaluate({ clicks: 5, impressions: 500 }, null).action === 'hold');

  // 区間が重なる程度の低下 → hold（点推定だけで戻さない）
  const overlap = evaluate({ clicks: 60, impressions: 2000 }, { clicks: 52, impressions: 2000 });
  t('区間が重なる低下は hold', overlap.action === 'hold');

  // 有意だが小さい低下 → continue（有意と実害は別）
  // **n=100,000 では 1.0% → 0.9% でも区間がまだ重なる**ので hold になる。
  // 「有意だが小さい」を作るには n=1,000,000 が要る —— この検査を書いたとき
  // 100,000 で足りると思い込んで1件落とした。**区間の重なりは直感より広い。**
  const tiny = evaluate({ clicks: 10000, impressions: 1000000 }, { clicks: 9000, impressions: 1000000 });
  t('有意でも相対10%の低下は continue', tiny.action === 'continue');
  t('同じ率でも n=100,000 なら区間が重なって hold',
    evaluate({ clicks: 1000, impressions: 100000 }, { clicks: 900, impressions: 100000 }).action === 'hold');

  // **expand を返さないこと**（権限表の非対称をコードで固定する）
  const actions = new Set();
  for (const [b, c] of [[[100, 2000], [20, 2000]], [[50, 2000], [90, 2000]], [[1, 20], [0, 15]]]) {
    actions.add(evaluate({ clicks: b[0], impressions: b[1] }, { clicks: c[0], impressions: c[1] }).action);
  }
  t('expand / promote は返さない', !actions.has('expand') && !actions.has('promote'));
  t('自律なのは revert だけ', isAutonomous('revert') && !isAutonomous('continue') && !isAutonomous('hold'));

  // **偽陽性の再発防止。**別の指標を測っている実験を対象に取らないこと。
  const heterogeneous = { experiments: [
    { id: 'ctr-ok', status: 'running', page: '/p', target_metric: 'ctr',
      evaluation_at: '2026-12-01', baseline: { clicks: 95, impressions: 702 } },
    { id: 'brand', status: 'running', page: '/p2', target_metric: 'brand_search_impressions',
      evaluation_at: '2026-12-01', baseline: { clicks: 95, impressions: 702 } },
    { id: 'multipage', status: 'running', page: '(3 pages: /a, /b, /c)', target_metric: 'ctr',
      evaluation_at: '2026-12-01', baseline: { clicks: 57, impressions: 8482 } },
    { id: 'ga4', status: 'running', page: '/p3', target_metric: 'app_store_click / session_start',
      evaluation_at: '2026-12-01', baseline: { sessions: 1600, app_store_click: 60 } },
  ] };
  const picked = targetsOf(heterogeneous).map((e) => e.id);
  t('ページCTRの実験だけを対象にする', picked.length === 1 && picked[0] === 'ctr-ok');
  t('brand_search_impressions を CTR として判定しない', !picked.includes('brand'));
  t('複数ページ集合を1ページのGSC行と比べない', !picked.includes('multipage'));
  t('GA4起点の実験を対象に取らない', !picked.includes('ga4'));


  // Source-selection regressions. No live ledger/snapshot, query, or rollback.
  const baseline = { clicks: 100, impressions: 2000 };
  const low = { page: '/selection-fixture', clicks: 20, impressions: 2000 };
  const high = { page: '/selection-fixture', clicks: 200, impressions: 2000 };
  const unrelated = { page: '/other-fixture', clicks: 1, impressions: 100 };
  const selectionHold = (rows, code) => {
    const result = evaluateCurrent(baseline, '/selection-fixture', rows);
    return result.action === 'hold'
      && result.evidence.current_selection?.code === code
      && currentFor('/selection-fixture', rows) === null;
  };
  t('唯一の有効行のcurrentFor counts/null互換を保つ',
    JSON.stringify(currentFor('/selection-fixture', [unrelated, low]))
      === JSON.stringify({ clicks: 20, impressions: 2000 }));
  t('唯一行の実consumerは原revertを保つ',
    evaluateCurrent(baseline, '/selection-fixture', [low]).action === 'revert');
  t('唯一行の実consumerは原continueを保つ',
    evaluateCurrent(baseline, '/selection-fixture', [high]).action === 'continue');
  t('矛盾する重複は低い行が先でも明示hold',
    selectionHold([low, high], 'duplicate_page_rows'));
  t('矛盾する重複は高い行が先でも明示hold',
    selectionHold([high, low], 'duplicate_page_rows'));
  t('同じcountsの重複も一意な観測とは数えずhold',
    selectionHold([low, { ...low }], 'duplicate_page_rows'));
  t('欠測snapshotはゼロやcontinueにせず理由付きhold',
    [null, undefined].every((rows) => selectionHold(rows, 'snapshot_unavailable')));
  t('不正collectionは空配列へ補完せず理由付きhold',
    [{}, 'invalid-fixture', 3].every((rows) => selectionHold(rows, 'invalid_page_collection')));
  t('不正rowが唯一行より前でも後でも理由付きhold',
    [null, 4, [], {}, { page: null }, { page: '' }].every((bad) =>
      selectionHold([bad, low], 'invalid_page_row')
      && selectionHold([low, bad], 'invalid_page_row')));
  t('対象の欠落行や空集合を観測ゼロとは数えない',
    selectionHold([], 'page_row_missing')
      && selectionHold([unrelated], 'page_row_missing'));
  t('対象countsの欠測・型・非有限・負数・分母超過を拒否',
    [{ impressions: 2000 }, { clicks: 20 }, { clicks: '20', impressions: 2000 },
      { clicks: 20, impressions: '2000' }, { clicks: -1, impressions: 2000 },
      { clicks: 20, impressions: -1 }, { clicks: 2001, impressions: 2000 },
      { clicks: NaN, impressions: 2000 }, { clicks: 20, impressions: Infinity }]
      .every((counts) => selectionHold([{ page: '/selection-fixture', ...counts }], 'invalid_matching_counts')));
  t('別pageのcountsへ不要な新制約を広げない',
    evaluateCurrent(baseline, '/selection-fixture', [{ page: '/other-fixture' }, low]).action === 'revert');
  t('分母0を有効なCTRとして採らず理由付きhold',
    selectionHold([{ page: '/selection-fixture', clicks: 0, impressions: 0 }], 'invalid_matching_counts'));
  t('有限の小数countsも元evaluateとcounts/null互換を保つ',
    [{ clicks: 20.5, impressions: 2000 }, { clicks: 20, impressions: 2000.5 },
      { clicks: 20.5, impressions: 2000.5 }, { clicks: 20, impressions: Number.MAX_SAFE_INTEGER + 1 }]
      .every((counts) =>
        JSON.stringify(currentFor('/selection-fixture', [{ page: '/selection-fixture', ...counts }])) === JSON.stringify(counts)
        && JSON.stringify(evaluateCurrent(baseline, '/selection-fixture', [{ page: '/selection-fixture', ...counts }]))
          === JSON.stringify(evaluate(baseline, counts))));
  t('唯一の有効currentと基準値NULLは元理由とevidenceを保つ',
    JSON.stringify(evaluateCurrent(null, '/selection-fixture', [low]))
      === JSON.stringify(evaluate(null, { clicks: low.clicks, impressions: low.impressions })));
  t('不正な対象pageも空集合へ補完せずhold',
    selectCurrent('', [low]).reason_code === 'invalid_page_target'
      && evaluateCurrent(baseline, '', [low]).action === 'hold');
  t('新consumerもexpand/promoteを出さずholdに自律rollback権を与えない',
    [evaluateCurrent(baseline, '/selection-fixture', [low]),
      evaluateCurrent(baseline, '/selection-fixture', [high]),
      evaluateCurrent(baseline, '/selection-fixture', [low, high])]
      .every((result) => ['revert', 'continue', 'hold'].includes(result.action))
      && !isAutonomous('hold'));

  return finish();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const ledger = loadLedger();
  const targets = targetsOf(ledger);
  // latestSnapshot() は**ラベルではなく読み込み済みのスナップショットを返す**。
  const snap = latestSnapshot();
  const label = snap?.label ?? null;
  const rows = snap?.pages ?? null;

  console.log(`マーケ stop-loss — 対象 ${targets.length} 件 / GSC スナップショット ${label ?? '(無し)'}\n`);
  console.log(`  判定条件: 表示 ${DEFAULT_RULES.min_impressions} 以上・95%区間が重ならない・相対 ${DEFAULT_RULES.min_relative_drop * 100}% 以上の低下\n`);

  const byAction = { revert: [], continue: [], hold: [] };
  for (const e of targets) {
    const r = evaluateCurrent({ clicks: e.baseline.clicks, impressions: e.baseline.impressions }, e.page, rows);
    byAction[r.action].push({ e, r });
  }

  const LABEL = { revert: '戻す', continue: '継続', hold: '判定不能' };
  for (const action of ['revert', 'hold', 'continue']) {
    for (const { e, r } of byAction[action]) {
      console.log(`  [${LABEL[action]}] ${e.id}  ${e.page}`);
      console.log(`           ${r.reason}`);
    }
  }

  console.log(`\n  戻す ${byAction.revert.length} / 判定不能 ${byAction.hold.length} / 継続 ${byAction.continue.length}`);
  console.log('  **判定不能を「異常なし」に数えていない。**'
    + '判定不能が増え続けるなら、それは施策ではなく計測側の問題。');
  console.log('  **この検査は expand を出さない。**広げる判断は人が持つ（権限表の非対称）。');

  if (byAction.revert.length && process.argv.includes('--check')) {
    console.error('\nstop-loss: 評価日を待たずに戻すべき施策がある');
    for (const { e, r } of byAction.revert) console.error(`  - ${e.id} (${e.page}): ${r.reason}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n評価日前に戻すべき施策は無し。');
}
