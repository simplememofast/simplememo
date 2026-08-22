#!/usr/bin/env node
/**
 * 切替演習（ドリル） — バックアップ経路が本当に引き継ぐかを、実行で確かめる。
 *
 *   node scripts/autopilot-drill.mjs           # 全シナリオを実行
 *   node scripts/autopilot-drill.mjs --check   # CI: 1つでも期待と違えば exit 1
 *
 * 【なぜ要るか】
 * 2026-08-22時点で、主系は11回のうち一度も出荷しておらず、日々の出荷はすべて
 * 副系が担っていた。つまり切替は「起きた」どころか常態である。
 * ところが **切替が正しく起きることを確かめたことは一度も無かった。**
 * 観測（誰が出荷したか）と検証（正しく引き継ぐか）は別物で、
 * 「結果として動いていた」は「壊れていない」の証明にならない。
 *
 * 実際、2026-08-21には副系(07:30)と再試行(09:20)が**両方**「当日分なし」と
 * 判定して二重着手した（PR #521 と #522）。散文の判定は試せない、が原因。
 *
 * 【何を演習するか】本番を壊さない。`autopilot-gate.mjs` の判定関数に
 * 障害シナリオの状態を入れ、**各経路が取るべき行動**を突き合わせる。
 * 判定が本番の実装（bashのGateとRunbookの手順）とずれたら、そのずれ自体が
 * 直すべき穴なので、ここが落ちることには意味がある。
 *
 * 【このドリルが証明しないこと】
 * 実際のネットワーク・認証・GitHub APIの挙動。ここが通っても
 * 「本番で切替が成功する」証明にはならない。**判定の論理が正しいことだけ**を言う。
 * 本物の切替演習（主系を意図的に落として副系の出荷を確かめる）はまだ無い。
 */

import { decide, baseState, CODES } from './autopilot-gate.mjs';

/** シナリオ: [名前, 状態の差分, 期待コード, なぜそう振る舞うべきか] */
const SCENARIOS = [
  // --- 平常系 -----------------------------------------------------------
  ['平常: 主系が動く',
    { route: 'actions' }, CODES.RUN,
    '秘密鍵あり・予算内・当日分なし。主系が着手する'],

  ['平常: 主系が出荷済みなら副系は止まる',
    { route: 'ccr-0730', mainStatusDate: '2026-08-23' }, CODES.SKIP_ALREADY_SHIPPED,
    'origin/mainに当日分がある＝マージ済み。副系は何もしない'],

  // --- 切替の核心 -------------------------------------------------------
  ['切替: 主系が秘密鍵なしでスキップ → 副系が引き継ぐ',
    { route: 'actions', secretsPresent: false }, CODES.SKIP_SECRETS,
    '主系は静かに寝る（毎日赤い通知を出さないための設計）'],
  ['切替: 同上 → 副系は動く',
    { route: 'ccr-0730', secretsPresent: false }, CODES.RUN,
    '副系は別の資格情報で動くので、主系の秘密鍵の有無に影響されない'],

  ['切替: 主系が成果物ゼロで終了 → 副系が引き継ぐ',
    { route: 'ccr-0730', primaryRunStatus: 'completed' }, CODES.RUN,
    '2026-08-22の実際の状況。主系はconclusion=successだが成果物ゼロ。'
    + '**「成功した」を出荷の証拠にしない**ので副系が着手できる'],

  ['切替: 主系がまだ走っている → 副系は待つ',
    { route: 'ccr-0730', primaryRunStatus: 'in_progress' }, CODES.SKIP_PRIMARY_RUNNING,
    '主系は90分上限で06:00開始なので最悪07:30まで走る。'
    + '「ブランチが無い」は「主系が失敗した」ではなく「まだ書いていない」かもしれない'],

  ['切替: 主系がqueued → 副系は待つ',
    { route: 'ccr-0920', primaryRunStatus: 'queued' }, CODES.SKIP_PRIMARY_RUNNING,
    'queued も作業中として扱う'],

  // --- 二重着手の防止（2026-08-21に実際に起きた事故） --------------------
  ['二重防止: 当日ブランチを他経路が取っている',
    { route: 'ccr-0920', branchClaimed: true }, CODES.SKIP_BRANCH_CLAIMED,
    'PR #521 と #522 の二重着手を受けて入れた占有。'
    + '**弾かれること自体がこの仕組みの出力**であって障害ではない'],

  ['二重防止: 当日作成のPRがある',
    { route: 'ccr-0920', prTodayExists: true }, CODES.SKIP_PR_TODAY,
    'ブランチ占有の前に別経路がPRまで進んでいる場合'],

  ['二重防止: 本番に当日分が出ている',
    { route: 'ccr-0920', prodStatusDate: '2026-08-23' }, CODES.SKIP_ALREADY_SHIPPED,
    'マージ＋Pagesデプロイまで完了している'],

  // --- 予算の非対称性（ここが仕様であることを固定する） ------------------
  ['予算: 上限到達で主系は止まる',
    { route: 'actions', budgetOver: true }, CODES.SKIP_BUDGET,
    '「可視化した」ではなく「実際に止まる」ことが自己制御の条件'],

  ['予算: 上限到達でも副系は止まらない',
    { route: 'ccr-0730', budgetOver: true }, CODES.RUN,
    '**これは欠陥ではなく既知の非対称性。** 副系はスケジュール起動セッションで、'
    + 'ログが外部から読めず観測も停止もできない。'
    + '権限表とスクリプト出力の両方にそう書いてある。ここが RUN になることを固定して、'
    + '「いつのまにか止まるようになった／止まらなくなった」を検知する'],

  // --- 手動の検証実行 ---------------------------------------------------
  ['force: 冪等チェックを飛ばす',
    { route: 'actions', branchClaimed: true, prodStatusDate: '2026-08-23', force: true }, CODES.RUN,
    '手動の検証実行。当日分があっても走る'],

  ['force: ただし秘密鍵の欠如は飛ばせない',
    { route: 'actions', secretsPresent: false, force: true }, CODES.SKIP_SECRETS,
    'forceは冪等チェックのためのもので、動かす資格情報を作り出しはしない'],

  ['force: ただし予算超過も飛ばせない',
    { route: 'actions', budgetOver: true, force: true }, CODES.SKIP_BUDGET,
    '**上限は force より強い。** ここを飛ばせると上限が「お願い」になる'],
];

export function run() {
  const results = SCENARIOS.map(([name, patch, expected, why]) => {
    const state = baseState(patch);
    const got = decide(state);
    return { name, expected, got: got.code, pass: got.code === expected, why, reason: got.reason };
  });
  return { results, passed: results.filter((r) => r.pass).length, total: results.length };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { results, passed, total } = run();
  console.log(`切替演習（ドリル）: ${passed} / ${total} シナリオ`);
  console.log('');
  for (const r of results) {
    console.log(`  ${r.pass ? 'OK  ' : 'FAIL'}  ${r.name}`);
    if (!r.pass) {
      console.log(`        期待 ${r.expected} / 実際 ${r.got}`);
      console.log(`        判定理由: ${r.reason}`);
    }
    console.log(`        ${r.why}`);
  }
  console.log('');
  console.log('  このドリルが証明しないこと: 実際のネットワーク・認証・GitHub APIの挙動。');
  console.log('  ここが通っても「本番で切替が成功する」証明にはならない。判定の論理だけを言う。');
  console.log('  主系を意図的に落として副系の出荷を確かめる本物の演習は、まだ無い。');
  if (passed !== total) process.exit(1);
  if (process.argv.includes('--check')) console.log('\n全シナリオが期待どおり。');
}
