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
};

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
  const R = (code, reason) => ({ run: code === CODES.RUN, code, reason });

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

  return R(CODES.RUN, '着手してよい。まず当日ブランチを空コミットで占有すること');
}

/** 既定の状態。シナリオは差分だけを書けるようにする。 */
export function baseState(overrides = {}) {
  return {
    route: 'actions', todayJst: '2026-08-23',
    secretsPresent: true, budgetOver: false, branchClaimed: false,
    prodStatusDate: '2026-08-22', mainStatusDate: '2026-08-22',
    prTodayExists: false, primaryRunStatus: 'completed', force: false,
    ...overrides,
  };
}
