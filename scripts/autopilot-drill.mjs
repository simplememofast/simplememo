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

  // --- 緊急停止（2026-08-22追加） ---------------------------------------
  ['緊急停止: 立っていれば何よりも先に止まる',
    { route: 'actions', emergencyStop: true, emergencyStopReason: 'test' }, CODES.EMERGENCY_STOP,
    '**主系と副系を同時に、確実に止める唯一のスイッチ。**予算ゲートは主系しか止めず、'
    + '秘密鍵の削除は「静かに寝る」ので止めたのか壊れたのか区別がつかない'],

  ['緊急停止: 副系にも効く',
    { route: 'ccr-0730', emergencyStop: true, emergencyStopReason: 'test' }, CODES.EMERGENCY_STOP,
    'これまで副系を確実に止める手段が無かった。リポジトリのファイルなので両経路に効く'],

  ['緊急停止: force で飛び越えられない',
    { route: 'actions', emergencyStop: true, emergencyStopReason: 'test', force: true }, CODES.EMERGENCY_STOP,
    '**force は冪等チェック用であって、停止の解除ではない**'],

  ['緊急停止: 故障や予算超過の陰に隠れない',
    { route: 'actions', emergencyStop: true, emergencyStopReason: 'test',
      credentialRejected: true, budgetOver: true, githubApiReachable: false }, CODES.EMERGENCY_STOP,
    '2番目以降に置くと「予算内で・鍵もあって・当日分も無い」ときだけ止まる停止になる。'
    + '**止めたいときに止まらない**'],

  ['経路ごとの停止: その経路だけが止まる',
    { route: 'ccr-0730', agentStopped: true, agentStopReason: 'test' }, CODES.AGENT_STOPPED,
    '**全体停止だけだと乱暴すぎて使われなくなる。**1つの経路が暴れているときに'
    + '全部止めると、止めること自体をためらう。**ためらわれる停止は、無い停止と同じ**'],

  ['経路ごとの停止: 全体停止のほうが強い',
    { route: 'actions', emergencyStop: true, agentStopped: true,
      emergencyStopReason: 'x', agentStopReason: 'y' }, CODES.EMERGENCY_STOP,
    '両方立っているときに経路側が出ると、全体停止が弱く見える。**最強は常に全体停止**'],

  // --- 認証切れ（2026-08-22追加） ---------------------------------------
  // 「秘密鍵が無い」と「秘密鍵が拒否された」を**別のコードにしてある**。
  // 混ぜると、期限切れが毎日「設計どおりのスキップ」として黙殺される。
  ['認証切れ: 主系の資格情報が拒否された → 静かに寝ない',
    { route: 'actions', credentialRejected: true }, CODES.FAIL_CREDENTIAL,
    '**未設定と失効は別物。**未設定は設計だが、失効は故障。'
    + '同じ skip に落とすと、証明書やトークンが切れた日も緑のまま通り過ぎる'],

  ['認証切れ: 副系の資格情報が拒否された → こちらも止まる',
    { route: 'ccr-0730', credentialRejected: true }, CODES.FAIL_CREDENTIAL,
    '副系は秘密鍵の「有無」には影響されないが、「拒否」には影響される'],

  ['認証切れ: force でも飛ばせない',
    { route: 'actions', credentialRejected: true, force: true }, CODES.FAIL_CREDENTIAL,
    'force は冪等チェックを飛ばすためのもので、失効した資格情報を有効にはしない'],

  // --- モデル障害（2026-08-22追加） -------------------------------------
  ['モデル障害: 全滅なら走らない',
    { route: 'actions', modelsAvailable: [] }, CODES.FAIL_NO_MODEL,
    '**「使えるモデルが無い」を「今日は書くことが無い」と区別する。**'
    + '前者は故障、後者は正常系。日報で同じ行に出ると原因が消える'],

  ['モデル障害: 代替があれば縮退して走る',
    { route: 'actions', preferredModel: 'claude-opus-5', modelsAvailable: ['claude-sonnet-5'] },
    CODES.DEGRADE_MODEL,
    '止めるより出すほうがよい。ただし**縮退したことを日報に出す** — '
    + '黙って別のモデルで書くと、品質が変わったときに原因が追えなくなる'],

  ['モデル障害: 主モデルが使えるなら縮退しない',
    { route: 'actions', preferredModel: 'claude-sonnet-5', modelsAvailable: ['claude-sonnet-5'] },
    CODES.RUN,
    '縮退コードが常時立つと、縮退の意味が消える'],

  // --- API障害（2026-08-22追加） ----------------------------------------
  ['API障害: GitHub APIが読めない日は着手しない',
    { route: 'ccr-0730', githubApiReachable: false }, CODES.FAIL_API,
    '冪等チェック（当日ブランチ・当日PR・主系の実行状態）は全部この API に乗っている。'
    + '**読めないまま走ると、根拠なしに「当日分は無い」と決めることになる** — '
    + '2026-08-21の二重着手と同じ事故を別の原因で起こす'],

  ['API障害: force でも飛ばせない',
    { route: 'ccr-0920', githubApiReachable: false, force: true }, CODES.FAIL_API,
    '二重出荷の防止は force より強い'],

  // --- egress遮断（2026-08-22に実際に起きた） ---------------------------
  ['egress遮断: 止めずに、選べるレーンを減らす',
    { route: 'ccr-0730', egressBlocked: true }, CODES.DEGRADE_EGRESS,
    '**実績。**obsidian.md / notion.com / github.com 本体が403になり、'
    + '一次情報の実測が要る C05〜C10 を見送って C12 に切り替えて出荷した。'
    + '止めるのではなく**できることに絞る**のが正しい振る舞い'],

  ['egress遮断: ただし冪等チェックのほうが先に効く',
    { route: 'ccr-0920', egressBlocked: true, branchClaimed: true }, CODES.SKIP_BRANCH_CLAIMED,
    '縮退より二重防止が優先。順序が入れ替わると、塞がれた日に二重着手しうる'],

  ['故障の優先順: 認証切れは予算超過より先に出る',
    { route: 'actions', credentialRejected: true, budgetOver: true }, CODES.FAIL_CREDENTIAL,
    '**報告すべき故障を、正常な安全装置の陰に隠さない。**'
    + '予算で止まったと報告されると、失効に何日も気づかない'],
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
