#!/usr/bin/env node
/**
 * 実行判定 — 「今この経路は動くべきか」を決める純関数。
 *
 * Runbook §0-2（冪等性・占有・主系の実行中確認）と §5-3（予算ゲート）が
 * 散文で定めている判定を、**テストできる形に落としたもの**。
 *
 * 【なぜ切り出すか】
 * この判定は3つの場所に散らばっていた:
 *   1. obsidian-autopilot.yml の Gate（bash・主系）
 *   2. 同ワークフローのプロンプト（主系のセッションが読む）
 *   3. AUTOPILOT_RUNBOOK.md §0-2（副系・再試行のセッションが読む）
 * 散文の判定は**試せない**。実際、2026-08-21に副系(07:30)と再試行(09:20)が
 * 両方「当日分なし」と判定して二重着手した（PR #521 と #522）。
 * 判定を関数にして初めて、切替のシナリオを机上ではなく実行で確かめられる。
 *
 * 【このモジュールが本番の実行経路ではないこと】
 * 主系の Gate は checkout 前に走るのでこのスクリプトを呼べない（bashのまま）。
 * ここは**参照実装とテスト対象**であり、副系・再試行のセッションが従う規約の
 * 機械可読版。bash とここがずれたら、ずれ自体が Runbook の穴なので直す。
 */

/** 判定コード。文字列を直接比較させない（typoが静かに通るため）。 */
export const CODES = {
  RUN: 'run',
  SKIP_SECRETS: 'skip_secrets',
  SKIP_BUDGET: 'skip_budget',
  SKIP_BRANCH_CLAIMED: 'skip_branch_claimed',
  SKIP_ALREADY_SHIPPED: 'skip_already_shipped',
  SKIP_PR_TODAY: 'skip_pr_today',
  SKIP_PRIMARY_RUNNING: 'skip_primary_running',
  // --- 緊急停止。**どの理由よりも先に効く。** ------------------------------
  EMERGENCY_STOP: 'emergency_stop',
  AGENT_STOPPED: 'agent_stopped',
  // --- 故障。**「静かに寝る」ではなく「報告して止まる」側** -----------------
  FAIL_CREDENTIAL: 'fail_credential',
  FAIL_API: 'fail_api',
  FAIL_NO_MODEL: 'fail_no_model',
  // --- 縮退。走るが、できることが減る -------------------------------------
  DEGRADE_MODEL: 'degrade_model',
  DEGRADE_EGRESS: 'degrade_egress',
};

/**
 * 一次情報の実測が要るレーン。egress が塞がれている日は選べない。
 * 2026-08-22に実際に起きた（obsidian.md / notion.com / github.com 本体が
 * 403 EGRESS_BLOCKED になり、C05〜C10 を見送って C12 へ切り替えた）。
 */
export const LANES_NEEDING_EGRESS = ['A', 'B', 'C-primary-source'];

const isPrimary = (route) => route === 'actions';

/**
 * @param {object} s 状態
 * @param {string} s.route            'actions' | 'ccr-0730' | 'ccr-0920' | 'owner-session'
 * @param {string} s.todayJst         'YYYY-MM-DD'
 * @param {boolean} s.secretsPresent  主系のみ意味を持つ（CLAUDE_CODE_OAUTH_TOKEN か ANTHROPIC_API_KEY）
 * @param {boolean} s.budgetOver      当月の実費が上限に達しているか
 * @param {boolean} s.branchClaimed   origin に当日ブランチが既にあるか
 * @param {string|null} s.prodStatusDate  本番 data/autopilot-status.json の date_jst
 * @param {string|null} s.mainStatusDate  origin/main の同ファイルの date_jst
 * @param {boolean} s.prTodayExists   当日作成のPRがあるか
 * @param {string|null} s.primaryRunStatus 主系の最新runの status（'queued'|'in_progress'|'completed'|null）
 * @param {boolean} s.force           手動の検証実行（冪等チェックを飛ばす）
 */
export function decide(s) {
  const RUNNABLE = new Set([CODES.RUN, CODES.DEGRADE_MODEL, CODES.DEGRADE_EGRESS]);
  const R = (code, reason, extra = {}) => ({ run: RUNNABLE.has(code), code, reason, ...extra });

  // -1. **緊急停止。**他のどの判定よりも先に見る。
  //     ここが2番目以降にあると、「予算内で・鍵もあって・当日分も無い」ときだけ
  //     止まる停止になり、**止めたいときに止まらない。**
  //     force でも飛び越えられない（force は冪等チェック用であって、停止の解除ではない）。
  if (s.emergencyStop) {
    return R(CODES.EMERGENCY_STOP,
      `緊急停止が立っている: ${s.emergencyStopReason ?? '理由未記入'}`
      + '。**AIの経路を介さずに止められることが、この仕組みの最後の歯止め**');
  }

  // -0.5. **経路ごとの停止。**全体停止の次に強い。
  //      全体停止だけだと乱暴すぎて使われなくなる — 1つの経路が暴れている
  //      だけのときに全部止めると、止めること自体をためらう。
  //      **ためらわれる停止は、無い停止と同じ。**
  if (s.agentStopped) {
    return R(CODES.AGENT_STOPPED,
      `この経路（${s.route}）が停止されている: ${s.agentStopReason ?? '理由未記入'}`
      + '。他の経路は動く');
  }

  // 0. **資格情報が「拒否された」は、「無い」とは別物。**
  //    無い＝設計どおり静かに寝る。拒否された＝故障なので報告して止まる。
  //    ここを混ぜると、期限切れが毎日「設計どおりのスキップ」として黙殺される。
  //    主系は11回連続で success を返しながら成果物ゼロだった前例があり、
  //    **緑のまま壊れている状態をもう一度作らないためにコードを分ける。**
  if (s.credentialRejected) {
    return R(CODES.FAIL_CREDENTIAL,
      '資格情報が拒否された（期限切れ・失効・権限剥奪）。'
      + '**これは静かに寝てよい状態ではない。**報告して止まり、他経路へ引き継ぐ');
  }

  // 1. 秘密鍵。主系だけが持つ条件で、**意図的に静かに寝る**（毎日赤い通知を出さない）。
  //    副系は別の資格情報で動くのでこの条件を持たない。
  if (isPrimary(s.route) && !s.secretsPresent) {
    return R(CODES.SKIP_SECRETS, '秘密鍵が未設定。設計どおり静かにスキップ（副系だけが動く）');
  }

  // 2. 予算。**主系だけを止める。** 副系CCRは別経路で、このゲートからは
  //    観測も停止もできない（Runbook §0-2 / §5-3）。この非対称性は隠さない。
  if (s.budgetOver) {
    if (isPrimary(s.route)) {
      return R(CODES.SKIP_BUDGET, '当月の実費が上限に到達。主系を停止（副系は別経路のため止まらない）');
    }
    // 副系はここを通過する。**通過することが仕様**なので理由を残す。
  }

  // 2b. **モデルが1つも使えない日は走らない。** 代替があるなら縮退して走る。
  //     「使えるモデルが無い」を「今日は書くことが無い」と区別する
  //     （前者は故障、後者は正常系。日報で同じ行に出ると原因が消える）。
  if (Array.isArray(s.modelsAvailable)) {
    if (s.modelsAvailable.length === 0) {
      return R(CODES.FAIL_NO_MODEL, '使えるモデルが1つも無い。故障として報告し、その日は走らない');
    }
    if (s.preferredModel && !s.modelsAvailable.includes(s.preferredModel)) {
      return R(CODES.DEGRADE_MODEL,
        `主モデル ${s.preferredModel} が使えない。${s.modelsAvailable[0]} へ落として走る`
        + '（**縮退したことを日報に出す。**黙って別のモデルで書くと品質の変化が原因不明になる）',
        { modelUsed: s.modelsAvailable[0], degraded: true });
    }
  }

  // 2c. **GitHub API が読めない日は着手しない。**
  //     冪等チェック（当日ブランチ・当日PR・主系の実行状態）は全部この API に乗っている。
  //     読めないまま走ると、根拠なしに「当日分は無い」と決めることになる
  //     — 2026-08-21の二重着手（PR #521 / #522）と同じ事故を、別の原因で起こす。
  if (s.githubApiReachable === false) {
    return R(CODES.FAIL_API,
      'GitHub API に到達できない。冪等チェックの根拠が無いまま着手すると二重出荷になる。'
      + '報告して止まる');
  }

  // 3. 手動の検証実行は以降の冪等チェックを飛ばす。
  if (s.force) return R(CODES.RUN, 'force指定（手動の検証実行）。冪等チェックを省略');

  // 4. 当日ブランチの占有。**弾かれること自体がこの仕組みの出力**であって障害ではない。
  if (s.branchClaimed) {
    return R(CODES.SKIP_BRANCH_CLAIMED, '当日ブランチを他経路が先に取っている。何もせず終了');
  }

  // 5. 本番に当日分が出ている＝マージ＋デプロイまで終わっている。
  if (s.prodStatusDate === s.todayJst) {
    return R(CODES.SKIP_ALREADY_SHIPPED, '本番のstatus JSONが当日分。別経路が出荷済み');
  }

  // 6. origin/main に当日分がある＝マージ済みでデプロイ待ち。
  if (s.mainStatusDate === s.todayJst) {
    return R(CODES.SKIP_ALREADY_SHIPPED, 'origin/mainのstatus JSONが当日分。マージ済み（デプロイ待ち）');
  }

  // 7. 当日作成のPRがある＝進行中。
  if (s.prTodayExists) {
    return R(CODES.SKIP_PR_TODAY, '当日作成のPRがある。別経路が進行中');
  }

  // 8. 主系がまだ走っている可能性。**副系・再試行だけが見る。**
  //    主系は timeout-minutes: 90 で06:00に始まるので、最悪07:30ちょうどまで走る。
  //    「ブランチが無い」は「主系が失敗した」ではなく「主系がまだ書いていない」かもしれない。
  if (!isPrimary(s.route)
      && (s.primaryRunStatus === 'queued' || s.primaryRunStatus === 'in_progress')) {
    return R(CODES.SKIP_PRIMARY_RUNNING, `主系が作業中（status=${s.primaryRunStatus}）。副系は終了`);
  }

  // 9. **外部到達が塞がれていても走る。**ただし選べるレーンが減る。
  //    2026-08-22の実績: obsidian.md / notion.com / github.com 本体が 403 になり、
  //    一次情報の実測が要る C05〜C10 を見送って C12 に切り替えて出荷した。
  //    **止めるのではなく、できることに絞るのが正しい振る舞い**なので run のまま返す。
  if (s.egressBlocked) {
    return R(CODES.DEGRADE_EGRESS,
      '外部到達が塞がれている。着手はするが、一次情報の実測が要るレーンは選べない',
      { forbiddenLanes: LANES_NEEDING_EGRESS, degraded: true });
  }

  return R(CODES.RUN, '着手してよい。まず当日ブランチを空コミットで占有すること');
}

/** 既定の状態。シナリオは差分だけを書けるようにする。 */
export function baseState(overrides = {}) {
  return {
    route: 'actions', todayJst: '2026-08-23',
    secretsPresent: true, budgetOver: false, branchClaimed: false,
    prodStatusDate: '2026-08-22', mainStatusDate: '2026-08-22',
    prTodayExists: false, primaryRunStatus: 'completed', force: false,
    // --- 故障・縮退の軸。既定は「すべて健全」 ---
    emergencyStop: false, emergencyStopReason: null,
    agentStopped: false, agentStopReason: null,
    credentialRejected: false, githubApiReachable: true,
    modelsAvailable: null, preferredModel: null, egressBlocked: false,
    ...overrides,
  };
}
