/**
 * 自己テストの小さな集計器。8本のスクリプト（check-feature-outcomes /
 * check-review-gate-pin / check-rollout-gate-pin / check-stop-drills /
 * growth の revenue-series / search-intent / check-stoploss / build-queues）が
 * 同じ集計と要約行を別々に書いていたものを寄せた（2026-09-25・出力は不変）。
 *
 *   const { t, finish } = selftestTally();
 *   t('名前', 条件);     // `  ok   名前` / `  FAIL 名前`（どちらも stdout）
 *   return finish();     // 失敗が1件でもあれば要約を出して 1、なければ 0
 *
 * **lib/selftest.mjs の run() とは出力の形が違う**（あちらは失敗の理由も出す）。
 * それに selftest.mjs は出荷の門の指紋に含まれているので、ここへ足さずに
 * 別ファイルにしてある（data/release-gate-pin.json / rollout-gate-pin.json）。
 */
export function selftestTally() {
  let total = 0; const failures = [];
  const t = (name, cond) => { total += 1; if (!cond) failures.push(name); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); };
  const finish = () => {
    if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
    console.log(`\nselftest: 全${total}件 通過`);
    return 0;
  };
  return { t, finish };
}
