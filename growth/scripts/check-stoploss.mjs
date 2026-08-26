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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLedger, isOpen, measuresPageCtr } from '../lib/ledger.mjs';
import { latestSnapshot } from '../lib/gsc.mjs';
import { evaluate, isAutonomous, DEFAULT_RULES } from '../lib/stoploss.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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

export function currentFor(pagePath, rows) {
  const hit = (rows || []).find((r) => r.page === pagePath);
  return hit ? { clicks: hit.clicks, impressions: hit.impressions } : null;
}

function selftest() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name);
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };

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

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
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
    const cur = rows ? currentFor(e.page, rows) : null;
    const r = evaluate({ clicks: e.baseline.clicks, impressions: e.baseline.impressions }, cur);
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
