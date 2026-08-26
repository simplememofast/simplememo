/**
 * 検査スクリプトの自己テストを、同じ形で書くための最小の道具。
 *
 * 【なぜ共有するのか】2026-08-26 時点で CI 配線 56 本のうち 39 本に自己テストが
 * 無く、`data/check-selftests.json` がラチェットで増加だけを止めている。
 * 39本ぶん harness を書き直すと、**harness の書き方が本体になってしまう**ので
 * ここに寄せる。中身（何を壊すと落ちるべきか）は各スクリプトが持つ。
 *
 * 【壊し方は実データから作る】
 * 固定のフィクスチャを手で書くと、**実際の台帳と形がずれても気づけない。**
 * `broken()` は実物を読んで複製し、そこを壊す。だから
 * 「実データが通る」と「壊すと落ちる」が同じ形の上で確かめられる。
 */

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** 深い複製。**元の台帳を壊さない**（テストが台帳を書き換えたら本末転倒）。 */
export function clone(doc) {
  return JSON.parse(JSON.stringify(doc));
}

/**
 * 実データを複製して壊す。`fn` は複製を受け取り、その場で壊す。
 * 戻り値は壊した複製。
 */
export function broken(doc, fn) {
  const copy = clone(doc);
  fn(copy);
  return copy;
}

/**
 * `[名前, 関数]` の配列を走らせる。失敗数を返す。
 * 各スクリプトの `--selftest` から呼ぶ。
 */
export function run(scenarios, { label = '自己テスト' } = {}) {
  let failed = 0;
  for (const [name, fn] of scenarios) {
    try {
      fn();
      console.log(`  ok   ${name}`);
    } catch (e) {
      failed += 1;
      console.log(`  FAIL ${name}\n       ${e.message}`);
    }
  }
  console.log(`\n  ${label} ${scenarios.length} 件中 ${failed} 件失敗`);
  return failed;
}

/**
 * 「実データが通る」と「壊すと落ちる」の対を作る定型。
 *
 * **落ちる側を必ず要求する。**通ることだけ確かめる自己テストは、
 * 検査が何も見ていなくても緑になる —— それが今日5回踏んだ形。
 *
 * @param {() => any} load        実データを読む
 * @param {(doc:any) => string[]} validate 問題の配列を返す
 * @param {Array<[string, (doc:any)=>void]>} breakages 壊し方
 */
export function ledgerScenarios(load, validate, breakages) {
  assert(breakages.length > 0, '壊し方をひとつも書いていない（通ることだけ確かめる自己テストは意味が無い）');
  return [
    ['実データが検査を通る', () => {
      const p = validate(load());
      assert(p.length === 0, `実データで ${p.length} 件: ${p.slice(0, 3).join(' / ')}`);
    }],
    ...breakages.map(([name, mutate]) => [
      name,
      () => {
        const p = validate(broken(load(), mutate));
        assert(p.length > 0, '壊したのに問題が出なかった（**この検査は effectively 何も見ていない**）');
      },
    ]),
  ];
}
