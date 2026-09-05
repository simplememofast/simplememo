#!/usr/bin/env node
/**
 * 日次アクチュエータ — その日の結果から「やるべきこと」を導出し、
 * **自分でやってよいものは実際にやる。**
 *
 *   node scripts/autopilot-act.mjs             # 今日の判定（読むだけ・何も変えない）
 *   node scripts/autopilot-act.mjs --json      # 機械可読（status JSON の actions ブロック用）
 *   node scripts/autopilot-act.mjs --apply     # 自動実行してよいものを実行し、台帳を更新する
 *   node scripts/autopilot-act.mjs --check     # CI: 台帳の形・権限・閉じ条件の整合
 *   node scripts/autopilot-act.mjs --selftest  # 判定ロジックの自己検査（台帳を読まない）
 *
 * ============================================================
 * 【なぜこれを作るか】
 * ============================================================
 * この運用は観測が非常に強く、作動がほぼ無かった。日報は毎朝
 * 完走率・変更失敗率・介入率・実費・未修理の故障まで出しているのに、
 * **そこから何かが起動することは無かった。** 実際に起きたこと:
 *
 *   - 2026-08-24 06:17 に主系が認証系で即死。台帳に載ったのは翌日 08:48。
 *     time_to_detect = 50.7時間。台帳の注記が理由を正確に書いている——
 *     「**成果物ゼロで落ちた回は台帳を書く主体がいない構造的な穴**」。
 *     落ちた回ほど記録されない。壊れているときほど見えなくなる。
 *   - その対応は「show_full_output を足して明日を待つ」。診断ループが
 *     1日1回転しかないので、認証切れの確定に3日かかる。
 *   - owner_requests は `string[]`。id も state も閉じ条件も無いので、
 *     **解決しても消えない。** 2026-08-25 時点で12件中6件が【解消済み】
 *     のまま毎朝再送されていた。生きている1件がその中に埋まる。
 *
 * どれも「気づけなかった」のではなく「気づいた先に起動するものが無かった」。
 * このスクリプトはその起動側だけを持つ。
 *
 * ============================================================
 * 【設計の3原則】
 * ============================================================
 * 1. **閉じ条件は機械が判定する。** 依頼が消えるのは、書いた人が消したから
 *    ではなく、閉じ条件が実際に通ったとき。CLOSE_CHECKS がその登録簿で、
 *    台帳には「どの検査をどの引数で」しか書けない。**台帳に任意のコマンドを
 *    書けるようにはしない**（data/injection-surface.json が扱っている問題と
 *    同じ穴を、自分の台帳で開けることになる）。
 *
 * 2. **誰がやるかは権限表から導く。** owner を手で書かせない。散文の
 *    Runbook §7 で分類していた間に、実際に分類ミスが起きている——
 *    「これは当初オーナー依頼として積まれたが、Runbook §7の分類ミス。
 *    同じファイルは自分で2回書き換えて通しており、自分で直せる案件だった」
 *    （PR #526 の記述）。data/authority-matrix.json が唯一の正。
 *
 * 3. **実行は自己修復の境界を越えない。** HANDLERS が触るのは
 *    self_repair.may_modify に載っているファイルだけ。越える提案は
 *    owner=human で積むだけで、実行しない。--apply でも越えない。
 *
 * ============================================================
 * 【このスクリプトがやらないこと】
 * ============================================================
 * 記事を書くこと、故障の原因特定、実装。それはセッション（レーンA〜F）の仕事。
 * ここがやるのは「台帳の同期」「閉じ条件の判定」「上限に達した経路の封じ込め」
 * という、判断を要さないぶん**毎日確実に漏れる**種類の作業だけ。
 */

import { FAULT_GATE_CODES } from './autopilot-runs.mjs';
import { completionOrigin, primaryJob, primarySteps } from './autopilot-completion.mjs';
import { deriveRoutineActions, routineResolved, routineSnapshotDigest, routineIntakeNeeded, routineIntakeDecision } from './lib/routine-actions.mjs';
import { reconcileObservation } from './routine-observer.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireShape } from './lib/read-ledger.mjs';
// **どのラベルを監視Issueと見なすかは health-intake.mjs が正。**
// 台帳へ運ぶ側と、閉じたかを見る側で対象がずれると、
// 「運ばれたが一生閉じない行」か「運んでいないのに閉じる行」のどちらかが出る。
import { HEALTH_LABELS, fetchOpenIssues, toAction as healthAction } from './health-intake.mjs';
import { judge, loadContext as loadEligibility, mergeJudgements, LOG_PATH as ELIGIBILITY_LOG } from './autonomy-eligibility.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ACTIONS_PATH = path.join(ROOT, 'data/autopilot-actions.json');
const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');
const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');
const STATUS_PATH = path.join(ROOT, 'data/autopilot-status.json');
const ROUTINE_PATH = path.join(ROOT, 'data/routine-runs.json');

export const STATES = ['open', 'done', 'acknowledged'];
export const OWNERS = ['ai', 'human'];

/** 台帳が失敗として扱う outcome（autopilot-selfheal.mjs と同じ集合）。 */
const FAILED_OUTCOMES = new Set(['no_artifact', 'failed', 'cancelled', 'no_run']);

export function jstToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function daysBetween(a, b) {
  const x = Date.parse(`${a}T12:00:00Z`), y = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return Math.round((y - x) / 86400000);
}

// ============================================================
// 閉じ条件の登録簿
// ============================================================
// 台帳に書けるのは「どの検査を、どの引数で」だけ。任意のコマンド文字列を
// 書けるようにすると、台帳が実行経路になる。**依頼リストは入力であって
// コードではない。**
//
// 各検査は (params, ctx) -> { closed: boolean, evidence: string } を返す。
// **判定できない場合は closed:false を返し、evidence にその旨を書く。**
// 「確認できなかった」を「閉じた」に倒すと、この台帳は嘘をつき始める
// （bq_checked:false を 0件 と書かないのと同じ規律）。

/**
 * EP 委任判定の月次追認（D8）の閉じ条件。**追認が全部済んだか、窓を過ぎたか**のどちらかで閉じる。
 * 窓を過ぎて閉じた行は evidence に「未追認 N 件は翌月へ持ち越す」と書く —— 閉じたことを追認と読ませない。
 */
function epRatifiedOrWindow(params, ctx) {
  const acts = ctx.ledgerDoc?.actions;
  if (!Array.isArray(acts)) return { closed: false, evidence: 'アクション台帳を読めず判定不能' };
  const accepted = new Set(ctx.scorePolicy?.ep?.precision_review?.accepted_modes ?? ['human']);
  const ids = Array.isArray(params.ids) ? params.ids : [];
  const still = [];
  for (const id of ids) {
    const a = acts.find((x) => x.id === id);
    if (!a) continue;                                   // 行が消えたら追認の対象も消える
    const mode = a.owner_needed_review?.mode;
    if (typeof mode !== 'string') continue;             // 判定者の記録が無い行は数えられていない
    if (!accepted.has(mode)) still.push(id);
  }
  if (still.length === 0) return { closed: true, evidence: `${ids.length} 件すべて人の判定に置き換わった（${params.month}）` };
  const window = Number.isFinite(params.window_days) ? params.window_days : 14;
  const days = daysBetween(params.opened_jst, ctx.today);
  if (Number.isFinite(days) && days >= window) {
    return { closed: true,
      evidence: `追認されずに ${days} 日の窓を過ぎた。**未追認 ${still.length} 件（${still.join(' / ')}）は翌月の起票に持ち越す**` };
  }
  return { closed: false, evidence: `未追認 ${still.length} 件（${still.join(' / ')}）。窓は ${params.opened_jst} から ${window} 日` };
}

export const CLOSE_CHECKS = {
  routine_resolved: routineResolved,
  ep_ratified_or_window: epRatifiedOrWindow,
  /** 対象の run が selfheal の未修理リストから消えたら閉じる。 */
  run_repaired({ run_id }, ctx) {
    // **判定できないときは閉じない。** selfheal の出力が取れていないのに
    // 「未修理リストに無い」を「直った」と読むと、判定不能が回復に化ける。
    // これはこの運用が繰り返し戒めている bq_checked:false を 0件 と書く誤りと
    // 同じもので、しかもこちらは**故障を消す方向**に効く。
    if (!ctx.selfheal || !Array.isArray(ctx.selfheal.targets)) {
      return { closed: false, evidence: 'selfheal の判定を取得できず判定不能（直ったという意味ではない）' };
    }
    if (!run_id) return { closed: false, evidence: 'run_id が指定されていない' };
    const unrepaired = new Set(ctx.selfheal.targets.map((t) => t.run_id));
    return unrepaired.has(run_id)
      ? { closed: false, evidence: `${run_id} は未修理のまま（repair_of で名指しされていない）` }
      : { closed: true, evidence: `${run_id} は selfheal の未修理リストから消えた` };
  },

  /** 指定経路が、指定日以降に同じ failure_class で落ちていなければ閉じる。 */
  no_failure_since({ route, failure_class, since }, ctx) {
    // `since` は起票の根拠になった最後の失敗日。**その日自身は含めない** —
    // 含めると起票の原因が毎回ヒットして、この条件は永久に閉じない。
    const runs = (ctx.runsDoc?.runs ?? []).filter((r) =>
      r.route === route && r.date_jst > since && FAILED_OUTCOMES.has(r.outcome));
    const same = runs.filter((r) => (r.failure_class ?? 'unknown') === failure_class);
    if (same.length > 0) {
      const last = same[same.length - 1];
      return { closed: false, evidence: `${since} 以降も ${failure_class} で失敗（最新 ${last.run_id}）` };
    }
    // 落ちていないだけでは足りない。**走ってすらいない可能性を潰す。**
    // 「失敗が無い」は「動いた」ではない——秘密鍵未設定で毎日 success を
    // 返していた前例（Runbook §0-2）がここに効く。
    const attempted = (ctx.runsDoc?.runs ?? []).filter((r) =>
      r.route === route && r.date_jst > since && r.attempted);
    if (attempted.length === 0) {
      return { closed: false, evidence: `${since} 以降 ${route} は一度も着手していない（失敗が無いことは回復の証拠にならない）` };
    }
    return { closed: true, evidence: `${since} 以降 ${route} は ${attempted.length}回着手し ${failure_class} の再発なし` };
  },

  /**
   * 指定経路が `since` より後に出荷していれば閉じる。
   *
   * **「失敗していない」では閉じない。**この行が起票されるのは経路が
   * *黙って*出荷していない場合で、失敗が無いことは最初から前提にある。
   * 閉じる条件は「もう一度出せた」——それだけが冗長化の証拠になる。
   */
  route_shipped_since({ route, since }, ctx) {
    const rows = ctx.runsDoc?.runs;
    if (!Array.isArray(rows)) {
      return { closed: false, evidence: '運転台帳を読めず判定不能（出荷したという意味ではない）' };
    }
    const shipped = rows.filter((r) => r.route === route && r.date_jst > since && r.outcome === 'shipped');
    return shipped.length
      ? { closed: true, evidence: `${since} より後に ${route} が出荷した（${shipped.map((r) => r.date_jst).join(', ')}）` }
      : { closed: false, evidence: `${since} 以降 ${route} の出荷は台帳に無い` };
  },

  /** どれか1経路でも `since` より後に出荷していれば閉じる（全停止からの復帰）。 */
  shipping_resumed({ since }, ctx) {
    const rows = ctx.runsDoc?.runs;
    if (!Array.isArray(rows)) {
      return { closed: false, evidence: '運転台帳を読めず判定不能（復帰したという意味ではない）' };
    }
    const shipped = rows.filter((r) => r.date_jst > since && r.outcome === 'shipped');
    return shipped.length
      ? { closed: true, evidence: `${since} より後に出荷が戻った（${[...new Set(shipped.map((r) => r.date_jst))].join(', ')}）` }
      : { closed: false, evidence: `${since} 以降どの経路も出荷していない` };
  },

  /** 既知の Actions run がすべて運転台帳に載っていれば閉じる。 */
  ledger_covers_runs(_params, ctx) {
    if (!ctx.workflowRuns) {
      return { closed: false, evidence: 'GitHub Actions の実行履歴を取得できず判定不能（未同期という意味ではない）' };
    }
    const known = new Set((ctx.runsDoc?.runs ?? []).map((r) => String(r.external_ref ?? '')));
    // **台帳に載せない決まりの run を「未同期」に数えない。**
    // 数えると、記録対象外のものが1件あるだけでこの依頼が永久に開く
    // ——閉じない依頼は、消えない依頼と同じ害を持つ（Runbook §7-1-1）。
    // 除外したことは evidence に必ず出す（黙って消さない）。
    const skipped = [];
    const missing = [];
    for (const r of ctx.workflowRuns) {
      if (known.has(String(r.id))) continue;
      const v = interpretRun(r);
      if (v === null) continue;            // まだ走っている
      if (v.skip) { skipped.push(r.id); continue; }
      missing.push(r);
    }
    const note = skipped.length ? `（記録対象外 ${skipped.length}件を除外: ${skipped.join(', ')}）` : '';
    return missing.length === 0
      ? { closed: true, evidence: `Actions run ${ctx.workflowRuns.length}件すべてが台帳にある${note}` }
      : { closed: false, evidence: `台帳に無い run が ${missing.length}件: ${missing.map((r) => r.id).join(', ')}${note}` };
  },

  /**
   * 着手した run がすべて実費台帳に載っていれば閉じる。
   *
   * **autopilot-budget.mjs --check で代用しない。**あれは「上限を超えたか」を
   * 見る検査で、台帳が空でも通る。閉じ条件は、閉じたい当のものを検査する。
   */
  cost_covers_runs({ exclude = [], pending_runs }, ctx) {
    if (!ctx.costDoc) return { closed: false, evidence: '実費台帳を読めず判定不能' };
    const costed = new Map((ctx.costDoc.runs ?? []).map((e) => [String(e.run_id ?? ''), e]));
    // **実費が原理的に存在しない run がある。** Claude Code ステップに到達せず
    // 落ちた回（apt詰まり・actor拒否など）は実行ログ自体が無いので、待っても
    // 永久に埋まらない。ここを除外しないと、この依頼は**閉じない依頼**になる
    // ——この台帳が潰したかった「堆積」そのものに戻る。
    // 除外は handler が実測（取得を試みて失敗）してから積む。最初から諦めない。
    const skip = new Set(exclude);
    const attempted = (ctx.runsDoc?.runs ?? []).filter((r) => r.attempted && r.external_ref);
    // **測る手段がある run だけを数える。**副系CCRの external_ref は
    // セッションid（cse_…）で、Actions のジョブログは存在しない ——
    // 台帳自身が「CCR経路の実費は観測手段が無い（cost は null で、0ではない）」と
    // 書いているとおり。**ここを除外一覧に積むと「実費が存在しない」と書かれる**
    // ので、構造的に測れないものは数の外に置き、件数だけを根拠に出す。
    const unobservable = attempted.filter((r) => !isActionsRunRef(r.external_ref));
    const missing = costCandidates(ctx, pending_runs).filter((r) => costSyncNeeded(r, costed.get(String(r.external_ref)))
      && (costed.has(String(r.external_ref)) || !costExcluded(r, skip)));
    const note = skip.size > 0 ? `（実費が残っていない ${skip.size}件を除外: ${[...skip].join(', ')}）` : '';
    const un = unobservable.length > 0
      ? `（うち ${unobservable.length}件は副系CCRで**観測手段が無い** —— ゼロではない: ${unobservable.map((r) => r.run_id).join(', ')}）`
      : '';
    return missing.length === 0
      ? { closed: true, evidence: `運転台帳と取得済みの着手証跡にあるActions runの実費・既知の結果を同期済み${note}${un}` }
      : { closed: false, evidence: `実費または既知の結果が未同期の run が ${missing.length}件: ${missing.map((r) => r.run_id).join(', ')}${note}${un}` };
  },

  /**
   * 1回あたりの実費上限の超過が、人にレビューされたら閉じる。
   *
   * **manual にしない。**リポジトリの中（data/autopilot-cost.json の
   * cap_review）で機械的に確かめられるものを manual にすると、承認が
   * 入っても行が残り続ける——この台帳が潰したかった堆積そのものになる。
   *
   * 「超過として検出されなくなった」も閉じる理由にする。上限そのものを
   * 見直した場合（model-routing.json 側が正）や、実費の行を訂正した場合で、
   * どちらも「もう止めていない」という同じ状態に落ちる。
   */
  budget_overrun_reviewed({ run_id = null, date_jst = null, task_kind = null }, ctx) {
    if (!ctx.budget) return { closed: false, evidence: '実費ゲートの判定を取得できず判定不能' };
    // null は「判定していない」。**「上限内」と混ぜない** ——
    // model-routing.json を消すだけで上限が消える、を防ぐ側の分岐。
    if (!ctx.budget.run_caps) {
      return { closed: false, evidence: '1回上限を判定していない（model-routing.json を読めなかった）。判定していない ≠ 上限内' };
    }
    // 実費台帳は run_id を必須にしていない（validate が要求していない）。
    // **run_id 無しを String(null) で突き合わせると誰にも一致せず「超過が消えた」
    // と読んで即座に閉じる**——止まっているのに閉じる、いちばん悪い倒れ方。
    // 指定が run_id で来ていないときは日付＋種別で照合する。
    const rows = ctx.budget.run_caps.overruns ?? [];
    const label = run_id != null ? `run ${run_id}` : `${date_jst} の ${task_kind}`;
    const o = run_id != null
      ? rows.find((x) => x.run_id != null && String(x.run_id) === String(run_id))
      : rows.find((x) => x.run_id == null && x.date_jst === date_jst && x.task_kind === task_kind);
    if (!o) return { closed: true, evidence: `${label} は1回上限の超過として検出されなくなった（上限の見直しか実費行の訂正）` };
    if (o.reviewed) return { closed: true, evidence: `${label} の超過はレビュー済: ${o.why ?? '（理由未記入）'}` };
    const detail = `${o.task_kind} $${Number(o.cost).toFixed(4)} / 上限 $${Number(o.cap).toFixed(2)}`;
    return o.run_id == null
      // 解除コマンドが対象を指定できない状態。**閉じられない依頼**なので、
      // 先にやることを証拠に書く（実費台帳はレーンFが直してよいファイル）。
      ? { closed: false, evidence: `${label}（${detail}）は実費台帳に run_id が無く --ack-overrun で解除できない。先に run_id を入れる` }
      : { closed: false, evidence: `${label}（${detail}）が未レビュー。主系はこの種別を選ぶと止まる` };
  },

  /** 許可済みスクリプトが exit 0 を返せば閉じる。 */
  script_ok({ script, args = [] }, _ctx) {
    // 台帳から任意のパスを実行させない。scripts/ 配下の .mjs / .js のみ、
    // シェルを介さず execFileSync で起動する（引数がシェル解釈されない）。
    if (!/^scripts\/[A-Za-z0-9._-]+\.(mjs|js)$/.test(script)) {
      return { closed: false, evidence: `不正なスクリプト指定: ${script}` };
    }
    const abs = path.join(ROOT, script);
    if (!fs.existsSync(abs)) return { closed: false, evidence: `${script} が存在しない` };
    if (args.some((a) => typeof a !== 'string' || /[^A-Za-z0-9._=/-]/.test(a))) {
      return { closed: false, evidence: `不正な引数: ${JSON.stringify(args)}` };
    }
    try {
      execFileSync(process.execPath, [abs, ...args], { cwd: ROOT, stdio: 'pipe' });
      return { closed: true, evidence: `${script} ${args.join(' ')} が exit 0` };
    } catch (e) {
      return { closed: false, evidence: `${script} ${args.join(' ')} が exit ${e.status ?? '?'}` };
    }
  },

  /** ファイルに目印が入っていれば閉じる（「実装したか」の機械的な証拠）。 */
  file_contains({ file, needle }, _ctx) {
    if (typeof file !== 'string' || file.includes('..')) {
      return { closed: false, evidence: `不正なファイル指定: ${file}` };
    }
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) return { closed: false, evidence: `${file} が存在しない` };
    const hit = fs.readFileSync(abs, 'utf8').includes(needle);
    return hit
      ? { closed: true, evidence: `${file} に「${needle}」がある` }
      : { closed: false, evidence: `${file} に「${needle}」がまだ無い` };
  },

  /**
   * 節約策が実際に効いたら閉じる。**「変えた」では閉じない。**
   *
   * 実費を下げる変更は、入れた時点では**仮説**でしかない。効果が出たかは
   * 次に同じ種別が走ったときの実測でしか言えないので、閉じ条件をそこに置く。
   * 実測が出るまで開いたままにしておけば、「直したつもり」が消えずに残る。
   */
  cost_reduced({ task_kind, since, target }, ctx) {
    if (!ctx.costDoc) return { closed: false, evidence: '実費台帳を読めず判定不能' };
    const after = (ctx.costDoc.runs ?? [])
      .filter((r) => r.task_kind === task_kind && r.date_jst > since);
    // **走っていないことを「効果が出た」と読まない。**
    if (after.length === 0) {
      return { closed: false, evidence: `${since} 以降 ${task_kind} はまだ走っていない（実測が無い＝効果は不明）` };
    }
    const best = Math.min(...after.map((r) => r.total_cost_usd));
    const fmt = (n) => `$${Number(n).toFixed(4)}`;
    return best <= target
      ? { closed: true, evidence: `${since} 以降の ${task_kind} は最安 ${fmt(best)}（目標 ${fmt(target)} 以下）・${after.length}件の実測` }
      : { closed: false, evidence: `${since} 以降の ${task_kind} は最安でも ${fmt(best)} で、目標 ${fmt(target)} に届いていない（${after.length}件の実測）` };
  },

  /**
   * 自動では絶対に閉じない。
   *
   * リポジトリの外（App Store Connect・オーナーのローカル環境・課金コンソール）
   * が対象のもの。**見えないものを「たぶん終わった」で閉じない。**
   * 代わりに age_days を必ず出すので、放置は放置として見える。
   */
  /**
   * 監視ワークフローが立てた Issue が閉じたら閉じる。
   *
   * `autopilot-health.yml` と `cron-health.yml` は、故障を検知すると
   * `ops/autopilot-stale` / `ops/cron-failure` の Issue を立て、**回復したら自分で閉じる。**
   * つまり Issue の open/closed が、そのまま故障の有無を表している。
   *
   * **判定できないときは閉じない。**Issue の状態を取得できていないのに
   * 「閉じている」と読むと、故障が消える方向に効く（run_repaired と同じ理由）。
   */
  issue_closed({ issue }, ctx) {
    if (!Number.isInteger(issue)) return { closed: false, evidence: 'issue 番号が指定されていない' };
    if (!ctx.issues || !(ctx.issues instanceof Map)) {
      return { closed: false, evidence: 'Issue の状態を取得できず判定不能（閉じたという意味ではない）' };
    }
    const observed = ctx.issues.get(issue);
    if (observed?.number !== issue || observed.pull_request || !['open', 'closed'].includes(observed.state)) {
      return { closed: false, evidence: `#${issue} の状態が判定不能（一覧から消えただけでは閉じない）` };
    }
    if (observed.state === 'closed') return { closed: true,
      evidence: `https://github.com/${ctx.repo || 'simplememofast/simplememo'}/issues/${issue} の state=closed をGitHub APIで確認` };
    return { closed: false, evidence: `#${issue} がまだ open` };
  },

  /**
   * 取り残しが解消したら閉じる。**判定できないときは閉じない。**
   * 走査が取れなかった回（null）を「取り残しは無い」と読むと、故障が消える方向に効く。
   */
  branch_caught_up({ pr, branch }, ctx) {
    const byBranch = typeof branch === 'string' && branch.length > 0;
    if (!byBranch && !Number.isInteger(pr)) {
      return { closed: false, evidence: 'ブランチ名もPR番号も指定されていない' };
    }
    if (!Array.isArray(ctx.orphans)) {
      return { closed: false, evidence: '取り残しの走査結果を取得できず判定不能（解消したという意味ではない）' };
    }
    // **PR番号でも引けるようにしておく。**ブランチ単位へ畳む前（〜2026-08-28）に
    // 立った行は params が {pr} のまま台帳に残る。走査がブランチ単位を返すように
    // なった後、pr だけで探すと**必ず見つからず「解消」と読まれて未解決のまま閉じる。**
    // 閉じる方向へ倒れる誤りなので、ここは互換を残す側にする。
    const still = byBranch
      ? ctx.orphans.find((o) => o.branch === branch)
      : ctx.orphans.find((o) => o.pr === pr || (o.prs ?? []).includes(pr));
    const label = byBranch ? branch : `#${pr}`;
    if (pendingPrCoversOrphan(still)) return { closed: false, pending_pr: still.pending_pr,
      evidence: `${label} は PR #${still.pending_pr.number} でhead ${still.head_sha} を追跡中（main反映・出荷は未確認）` };
    return still
      ? { closed: false, pending_pr: null, evidence: `${label} はまだ ${still.ahead_by} 件先にある` }
      : { closed: true, pending_pr: null, evidence: `${label} の取り残しは解消（走査に出てこない）` };
  },

  manual({ observed } = {}, _ctx) {
    // **手で観測したことを書く口を1つ開けてある。**閉じ条件は機械で判定
    // できないが、「いま外はどうなっているか」は人が見れば書ける
    // （例: GitHub の secrets 画面の Last updated）。
    //
    // これが無いと、台帳の `evidence` に手で書いた観測は**次の実行で生成値に
    // 上書きされて消える** —— 2026-08-26 に実際にやった。書けて、通って、
    // 消える。いちばん質の悪い形なので口を開ける。
    //
    // **observed を書いても閉じない。**閉じるのは人の操作だけで、ここは
    // 状態の報告であって判定ではない。
    return {
      closed: false,
      evidence: observed
        ? `${observed}（リポジトリからは検査できない。閉じるのは人）`
        : 'リポジトリから検査できない（人が閉じる）',
    };
  },
};

// ============================================================
// 権限の導出 — owner を手で書かせない
// ============================================================
// Runbook §7 は3行の散文で、判定手続きを持っていなかった。その結果
// 「自分で直せたものをオーナー依頼として積む」誤りが実際に起きている。
// ここは data/authority-matrix.json だけを見る。
//
// 判定は2段:
//   1. 触る対象が self_repair.may_modify に収まるか（＝レーンFの範囲）
//   2. 対象領域が requires_approval を要求していないか
// どちらも満たすときだけ ai。**判定できないときは human に倒す**
// （権限の判定を迷ったら狭いほうへ、は不可逆な領域を持つ運用の基本）。

/**
 * **may_modify を通っても push できないファイルを返す。**
 *
 * may_modify は権限（直してよいか）、こちらは能力（直せるか）。主系の GH_PAT に
 * `workflow` scope が無いため `.github/workflows/*` を含む push は GitHub 側で
 * remote reject される。2026-08-25、レーンFはこれに適用の直前でぶつかり、
 * 原因特定まで済んだ修理を捨てている。**scope は意図的に足していない**ので
 * （権限表 self_repair.$comment_unattended_cannot_push）、食い違いは残る。
 * 残すなら、ぶつかってから気づくのではなく判定で分ける。
 */
export function unattendedCannotPush(touches, matrix) {
  const blocked = new Set(matrix.self_repair?.unattended_cannot_push?.paths ?? []);
  return (touches ?? []).filter((f) => blocked.has(f));
}

export function classify(action, matrix) {
  const sr = matrix.self_repair ?? {};
  const mayModify = new Set(sr.may_modify ?? []);
  const touches = action.touches ?? [];

  // 1. 領域として人間に固定されているもの（値の判断・不可逆な操作）
  if (action.force_owner === 'human') {
    return { owner: 'human', why: action.force_owner_why ?? '領域として人間の判断が要る' };
  }
  // 2. リポジトリの外が対象（App Store Connect・オーナーのローカル・課金コンソール）。
  //    **検査できないものは実行もできない。**
  if (action.outside_repo) {
    return { owner: 'human', why: 'リポジトリの外が対象（ここからは実行も検査もできない）' };
  }
  // 3. **このスクリプトが自動実行する**ものは、自己修復の範囲に収まっていること。
  //    ここが may_modify を見る唯一の場所。無人で走る経路なので最も狭くする。
  if (action.auto) {
    const outside = touches.filter((f) => !mayModify.has(f));
    if (touches.length === 0) return { owner: 'human', why: '自動実行の対象ファイルが特定できない' };
    if (outside.length > 0) return { owner: 'human', why: `self_repair.may_modify の外: ${outside.join(', ')}` };
    // 3-1. **範囲の内側でも、無人では push できないものがある。**
    //      owner は 'ai' のまま——これは人の仕事ではなく、押せるレーンが違うだけ。
    //      unattended_blocked を見て --apply が飛ばす（human に倒すと、
    //      AIが普通にできることをオーナー依頼へ積み上げる元の誤りに戻る）。
    const blocked = unattendedCannotPush(touches, matrix);
    if (blocked.length > 0) {
      const who = sr.unattended_cannot_push?.who_applies ?? '副系CCRセッション';
      return {
        owner: 'ai',
        unattended_blocked: true,
        why: `may_modify の内側だが無人では push できない（${blocked.join(', ')}）— ${who}が適用する`,
      };
    }
    return { owner: 'ai', why: 'self_repair.may_modify の内側（無人実行の範囲）' };
  }
  // 4. セッションが実装するもの。判定は権限表の領域で行う——may_modify は
  //    レーンF（無人の自己修復）の境界であって、セッション全体の境界ではない。
  //    ここを取り違えると「AIが普通にできること」まで人の依頼として積み上がる。
  if (action.domain) {
    const d = (matrix.domains ?? []).find((x) => x.domain === action.domain);
    if (!d) return { owner: 'human', why: `権限表に領域「${action.domain}」が無い` };
    if (d.requires_approval) return { owner: 'human', why: `領域「${action.domain}」は承認が要る` };
    return { owner: 'ai', why: `領域「${action.domain}」は承認不要（ai_may: ${(d.ai_may ?? []).join('/') || 'なし'}）` };
  }
  if (touches.length === 0) {
    return { owner: 'human', why: '触る対象も領域も特定できない（不明なものは自動実行しない）' };
  }
  return { owner: 'ai', why: 'リポジトリ内の変更・承認を要する領域に該当しない' };
}

// ============================================================
// 導出 — その日の結果から「やるべきこと」を作る
// ============================================================
// 純関数。ctx を受け取り、アクションの配列を返す。id は内容から決まる
// （日付を含めない）ので、**同じ故障が翌日も残っていれば同じ id になり、
// 台帳の同じ行が育つ。**日付入りにすると毎日新しい行が生えて、
// 「12件のうち6件が解消済み」と同じ状態に戻る。

export function derive(ctx) {
  const out = [];
  const runs = ctx.runsDoc?.runs ?? [];

  // 主系モデルが動けない日も、独立したActが実際の監視Issueを台帳に運ぶ。
  if (ctx.issues instanceof Map) {
    for (const issue of ctx.issues.values()) {
      const action = healthAction(issue, ctx.today);
      if (action) out.push(action);
    }
  }

  // --- D1/D2: 未修理の故障（レーンF） ---
  for (const t of ctx.selfheal?.targets ?? []) {
    if (t.escalate) {
      // 上限に達した種別。**直すのをやめて人に上げる**（self_repair.stop_note）。
      out.push({
        id: `act-selfheal-escalated-${t.failure_class}`,
        title: `${t.failure_class} を上限回数（${t.repair_attempts_for_class}回）直しても再発している`,
        detail: `対象 ${t.run_id}（${t.date_jst} / ${t.route}）。self_repair.stop_after_failed_repairs に達したため、`
          + `修理をやめて人間に上げる。同時に該当経路の封じ込め（--contain）を実行する。`,
        source: 'selfheal',
        touches: ['data/emergency-stop.json'],
        force_owner: 'human',
        force_owner_why: '修理の上限に達した故障は人が原因を見るまで自動で触らない（policy.ai_may_resume:false）',
        auto: 'contain',
        close_check: { kind: 'run_repaired', params: { run_id: t.run_id } },
      });
    } else if (t.owner_routed) {
      // **セッション側に打つ手が1つも無い種別**（escalation-rules の who: owner）。
      //
      // 2026-09-02 に selfheal 側だけを直した。**表示は 🤝 に変わったが、
      // 台帳の行き先は変わっていなかった** —— derive が見ていたのは escalate だけで、
      // owner_routed はこの else に落ちて **AI 行として起票され続けた。**
      // 日報は3日ぶん「AIがやること: 未修理の故障（usage_limit）」を出し、
      // 規則が「人へ渡す」と決めた当の依頼は**一度もオーナーに届いていない。**
      // 判定を2箇所に持ったまま片方だけ直した形で、このログが繰り返し戒めているもの。
      //
      // 閉じ条件も `run_repaired` ではない。あれは selfheal の未修理リストから
      // 消えたら閉じる条件で、消えるのは `repair_of` を書いたときだけ ——
      // そして **Runbook はこの種別に repair_of を書くことを禁じている**
      // （書くと repair_limit が進み、3回目で --contain が経路を止める）。
      // つまり **規則が満たすことを禁じている閉じ条件**で、構造的に永久に開く。
      //
      // 代わりに「その経路で、その種別が再発しなくなったか」で見る（D5 と同じ形）。
      // `since` は**同じ経路・同じ種別の最後の失敗日**にする。行は run 単位だが、
      // 上限は経路単位で解けるので、同じ上限に当たった回は同時に閉じる。
      // `no_failure_since` は「失敗が無い」だけでは閉じない（走ってすらいない
      // 可能性を潰す）ので、沈黙している経路の行は開いたまま残る。
      const sameClass = runs.filter((r) => r.route === t.route
        && (r.failure_class ?? 'unknown') === t.failure_class
        && FAILED_OUTCOMES.has(r.outcome));
      const latest = sameClass.reduce((a, r) => (a && a > r.date_jst ? a : r.date_jst), t.date_jst);
      const esc = t.escalation ?? {};
      out.push({
        id: `act-selfheal-${t.run_id}`,
        title: `未修理の故障: ${t.run_id}（${t.failure_class}）— セッション側に打つ手が無い種別`,
        detail: `${t.date_jst} / ${t.route} / outcome=${t.outcome}。${t.failure_reason ?? '理由未記入'}\n\n`
          + `**この種別は data/escalation-rules.json が who: owner と宣言している。**`
          + `レーンFは修理対象にせず、repair_of も書かない（書くと repair_limit が進み、`
          + `3回目で経路が止まる — 時間で自然に戻る停止が人待ちの停止に化ける）。\n`
          + `渡し先 ${esc.channel ?? '不明'} / ${esc.within_hours ?? '?'}時間以内。\n\n`
          + `**閉じ条件は経路と種別で見る** — ${latest} 以降に ${t.route} が実際に着手し、`
          + `${t.failure_class} が再発しなければ閉じる。着手が1回も無い間は閉じない`
          + `（失敗が無いことは回復の証拠にならない）。`,
        source: 'selfheal',
        domain: null,
        // **人の判断が要るのは「待つ」以外の2つ** —— 枠を上げる / 1回あたりの入力量を減らす。
        force_owner: 'human',
        force_owner_why: `data/escalation-rules.json が ${t.failure_class} を who: owner と宣言している`
          + `（打つ手は「待つ・枠を上げる・入力量を減らす」で、後ろ2つは人の判断）。`
          + `**規則そのものは self_repair.may_modify の外**なので、レーンFがこの行き先を書き換えて逃げる経路は無い`,
        touches: [],
        auto: null,
        close_check: {
          kind: 'no_failure_since',
          params: { route: t.route, failure_class: t.failure_class, since: latest },
        },
      });
    } else {
      out.push({
        id: `act-selfheal-${t.run_id}`,
        title: `未修理の故障: ${t.run_id}（${t.failure_class}）`,
        detail: `${t.date_jst} / ${t.route} / outcome=${t.outcome}。${t.failure_reason ?? '理由未記入'}`,
        source: 'selfheal',
        domain: null,
        touches: ['data/autopilot-runs.json', '.github/workflows/obsidian-autopilot.yml'],
        auto: null, // 原因特定と実装はセッションの仕事。ここは起票と可視化だけ
        close_check: { kind: 'run_repaired', params: { run_id: t.run_id } },
      });
    }
  }

  // --- D3: 運転台帳の取りこぼし ---
  //
  // **この運用でいちばん効く1件。** 落ちた回は台帳を書く主体がいないので、
  // 壊れているときほど記録が消える。2026-08-24 の即死が台帳に載るまで
  // 50.7時間かかったのはこれが理由で、しかも載せたのは偶然走った副系だった。
  // Actions API は誰が落ちても読めるので、ここだけは機械で埋められる。
  if (ctx.workflowRuns) {
    const known = new Set(runs.map((r) => String(r.external_ref ?? '')));
    // 記録対象外（人が止めた手動起動など）と走行中は数えない。閉じ条件と同じ基準。
    const missing = ctx.workflowRuns.filter((r) => {
      if (known.has(String(r.id))) return false;
      const v = interpretRun(r);
      return v !== null && !v.skip;
    });
    if (missing.length > 0) {
      out.push({
        id: 'act-ledger-sync',
        title: `運転台帳に載っていない Actions run が ${missing.length}件`,
        detail: missing.map((r) => `${r.id}（${r.jst_date} / ${r.conclusion}）`).join(', ')
          + '。成果物ゼロで落ちた回は台帳を書く主体がいないため、Actions API から補う。',
        source: 'ledger',
        touches: ['data/autopilot-runs.json'],
        auto: 'reconcile-runs',
        close_check: { kind: 'ledger_covers_runs', params: {} },
      });
    }
  }

  // --- D3b: マージ後に取り残されたコミット ---
  //
  // **中身を見ずに cherry-pick はしない。**取り残しの中身は台帳のこともあれば
  // 書きかけのこともあり、機械が丸ごと当てると「訂正が生き残っているかの確認」を飛ばす。
  //
  // **行はブランチ単位。**PR単位で立てると、使い回されたブランチが
  // PRの数だけ行になる（fetchOrphanedCommits の【なぜブランチ単位か】）。
  //
  // 【2026-08-28 決定: auto を付ける前に1周見る】
  // この日 `paths` / `ledger_only` を足し、オーナーが
  // `data/autopilot-status.json` を self_repair.may_modify へ入れた（明示の委譲）。
  // **権限と材料は揃ったが、auto はまだ付けない。**
  // 「作った」と「動いた」を分ける —— まず日次runが実際に内訳を出すのを見る。
  //
  // 【2026-09-02 決定: 保留を解いた】**保留の条件は満たされた。**
  // 08-28 以降に立った取り残し7行のうち **7行で paths が出ており**、うち3行が
  // `ledger_only: true`（残り4行は台帳の外を触っているので、そちらは今までどおり人が読む）。
  // 「まず内訳が出るのを見る」は5日ぶん見た。
  //
  // **auto を付けるのは ledger_only の行だけで、手順は書いた順に守る:**
  //   1. 対象は `ledger_only === true` の行だけ（false と null は人が読む）
  //   2. **追記型と状態型を分ける。**runs.json / cost.json は --append（run_id で冪等）、
  //      **status.json は載せ直さず再生成**（現在値を持つ台帳なので古い写しを当てると巻き戻る）、
  //      **actions.json はこのエンジン自身の出力なので触らない**（当てると閉じた行が開き直る）
  //   3. **まず「本当に欠けているか」を見る。**取り残しの判定はSHAで行うので、
  //      内容が別コミットで着地済みでも行は立つ（08-28 の実測で4件中3件がそれ）。
  //      欠けていなければ1行も書かない —— **走査が消えないことを、書く理由にしない**
  //   4. PRを出して SEO Validation → auto-merge に乗せる。直接 main を触らない
  //      （ハンドラは作業ツリーに書くだけで、PRは autopilot-act.yml が作る）
  //
  // **AUTOPILOT_LOG.md は追記型だが、auto の対象に入れていない。**散文の差分は
  // run_id のような冪等な鍵を持たないので、「欠けているか」を機械が判定できない。
  // OPERATING_LEDGERS には残る（＝読む前に見当はつく）が、書くのは人。
  const orphanIds = new Set();
  for (const o of ctx.orphans ?? []) {
    const id = `act-orphaned-branch-${orphanSlug(o.branch)}`;
    // ブランチ名を均した結果が衝突したら**畳まずに分ける。**黙って1行に
    // まとめると、別々の取り残しが片方の閉じ条件で消える。
    const uniq = orphanIds.has(id) ? `${id}-${o.pr}` : id;
    orphanIds.add(uniq);
    const all = (o.prs ?? [o.pr]).filter((n) => Number.isInteger(n));
    if (pendingPrCoversOrphan(o)) {
      out.push({ id: uniq, source: 'orphan', auto: null, touches: [], prs: all,
        title: `PR #${o.pending_pr.number} の反映待ち: ${o.branch}`,
        detail: '開いているPRがブランチの現在のheadを扱っている。検証・マージの結果を追跡し、同じ変更を再投入しない。',
        close_check: { kind: 'branch_caught_up', params: { branch: o.branch } } });
      continue;
    }
    out.push({
      id: uniq,
      title: `ブランチ ${o.branch} に ${o.ahead_by} コミットが取り残されている`
        + `（PR #${o.pr}${all.length > 1 ? ` ほか${all.length - 1}件` : ''} のマージ後）`,
      detail: `ブランチ ${o.branch} が、最後のマージ（PR #${o.pr} / head ${o.merged_sha.slice(0, 7)}）より`
        + `${o.ahead_by} 件先にあり、**それらは main にも無い**: ${o.commits.join(', ')}。`
        + (o.landed_elsewhere ? `（別の${o.landed_elsewhere}件は main 側のコミットなので除外した）` : '')
        + (all.length > 1
          ? `\n\nこのブランチは ${all.map((n) => `#${n}`).join(' ')} で使い回されている。`
            + '**取り残しはブランチ1本ぶんで、PRの数だけあるわけではない。**'
          : '')
        + '\n\n'
        + '**auto-merge は検証済みSHAだけをマージする設計なので、これは事故ではなく帰結。**'
        + 'PRが既に閉じているため、次の検証が拾う先が無い。\n\n'
        + '**中身を見てから適用すること。**台帳の更新なら再投入、書きかけなら捨てる。'
        + '機械が中身を見ずに cherry-pick しない（この行に auto を付けない理由）。\n\n'
        // [2026-08-28] **内訳をここに出す。**無いと拾う側が毎回ブランチを取り直して
        // git show --stat を叩く。**判断に要る材料が起票に載っていないと、判断は起きない。**
        + (o.paths === null || o.paths === undefined
          ? '**触ったパスは取れなかった。**中身は自分で見ること（内訳が無いことを「台帳だけ」と読まない）。'
          : `触ったパス: ${o.paths.join(' / ')}\n\n`
            + (o.ledger_only
              ? '**運転台帳だけを触っている。**「台帳の更新なら再投入」に当たる見込みだが、'
                + '**再投入してよいかは別問題** —— 状態を持つ台帳'
                + '（data/autopilot-status.json）は古い写しを載せ直すと現在値を巻き戻す。'
                + '追記型（data/autopilot-runs.json / AUTOPILOT_LOG.md）と分けて扱うこと。\n\n'
                + '**そして、まず「本当に欠けているか」を見る。**同じ内容が別コミットで'
                + '着地していることがある —— 取り残しの判定はSHAで行うので、'
                + '**内容が着地済みでも行は立つ。**'
              : '**運転台帳の外を触っている。**書きかけかもしれないので、中身を読んでから決めること。')),
      source: 'orphan',
      // **touches は auto を付ける行にだけ書く。**classify() は
      // 「自動実行するのに対象が特定できない」を human に倒すので、
      // ledger_only でない行は今までどおり touches:[] のまま人へ行く。
      touches: o.ledger_only === true
        ? ['data/autopilot-runs.json', 'data/autopilot-cost.json', 'data/autopilot-status.json']
        : [],
      auto: o.ledger_only === true ? 'apply-orphan-ledger' : null,
      // 台帳には載せない（旧IDの行を引き当てるためだけの手掛かり）
      prs: all,
      // 同じく手掛かり。**受容した行が「いま何を抱えているか」を merge が見るのに要る。**
      commits: o.commits ?? [],
      close_check: { kind: 'branch_caught_up', params: { branch: o.branch } },
    });
  }

  // --- D4: 実費台帳の取りこぼし ---
  //
  // Runbook §5-3 は「翌日のセッションが台帳へ入れる」と書いている。
  // 人手（セッション手動）の手順は、忙しい日から順に落ちる。--append は
  // run_id で冪等なので、機械が毎日やって害が無い。
  if (ctx.costDoc) {
    // Result attribution can be pending while the model has already spent money.
    // Use observed model steps as well as the run ledger; cost still comes from logs.
    const costed = new Map((ctx.costDoc.runs ?? []).map((e) => [String(e.run_id ?? ''), e]));
    // **題と根拠で違う数を出さない。**閉じ条件（cost_covers_runs）は
    // ①Actions の run だけを数え ②実測して駄目だったものを除外する、の2つを掛けている。
    // 題だけ素の件数にすると「4件」と「1件」が並んで出る（2026-09-03 に実際に出た）。
    // **除外は handler が積んだ状態**なので、いまの台帳の行から読む。
    const excluded = new Set(((ctx.ledgerDoc?.actions ?? [])
      .find((a) => a.id === 'act-cost-sync')?.close_check?.params?.exclude) ?? []);
    const unobservable = runs.filter((r) => r.attempted && r.external_ref && !isActionsRunRef(r.external_ref));
    const candidates = costCandidates(ctx);
    const missing = candidates.filter((r) => costSyncNeeded(r, costed.get(String(r.external_ref)))
      && (costed.has(String(r.external_ref)) || !costExcluded(r, excluded)));
    if (missing.length > 0) {
      out.push({
        id: 'act-cost-sync',
        title: `実費記録の同期が必要な run が ${missing.length}件`,
        detail: missing.map((r) => `${r.run_id}（run ${r.external_ref}）`).join(', ')
          + '。Runbook §5-3 は「翌日のセッションが入れる」としているが、手順は忙しい日から落ちる。'
          + (excluded.size > 0 ? `\n実測して取れなかったものを ${excluded.size}件 除外している: ${[...excluded].join(', ')}。` : '')
          + (unobservable.length > 0
            ? `\n副系CCRの ${unobservable.length}件（${unobservable.map((r) => r.run_id).join(', ')}）は`
              + '**そもそも数えない** —— external_ref がセッションid で、Actions のジョブログが存在しない。**ゼロではない。**'
            : ''),
        source: 'cost',
        touches: ['data/autopilot-cost.json'],
        auto: 'append-cost',
        close_check: { kind: 'cost_covers_runs', params: { pending_runs: candidates
          .filter(r => r.cost_observation && !costed.has(String(r.external_ref))).map(r => r.cost_observation) } },
      });
    }
  }

  // --- D5: 作業に入る前の連続失敗 ＝ 主系が2日以上止まっている ---
  //
  // 単発の flake と**決定論的な故障**は形が違う。後者は「作業に入る前に、
  // 毎回同じ時間で、同じ形で」落ちる。ここを2日目で拾えば3日目を待たない。
  //
  // **2026-08-25 訂正: 拾ったものに原因を名乗らせない。**
  // 旧版はこれを「認証系」と断定し、復旧手順を `claude setup-token` の再実行
  // だけにしていた。08-24・08-25 の2件で実際に起きたのはそれではなく、
  // claude-code-action@v1 が引いた上流の壊れた版（SHA c81e3bc6 / CLI 2.1.241）
  // だった。**同一シグネチャが示すのは決定論であって、認証ではない。**
  // 誤った断定は、オーナーに要らない作業（鍵の再発行）を求めるだけでなく、
  // **本当の原因を探す動きを止める**ぶん、無記入より害が大きい。
  //
  // なので detail は「原因の候補」と「どの順で切り分けるか」を持つ。
  // 順序は費用で決める——ログの版の照合はゼロ円、鍵の再発行はオーナーの時間。
  const byRoute = {};
  for (const r of runs) (byRoute[r.route] ??= []).push(r);
  for (const [route, rs] of Object.entries(byRoute)) {
    const sorted = [...rs].sort((a, b) => (a.date_jst < b.date_jst ? -1 : 1));
    let streak = [];
    for (const r of sorted) {
      // `auth_or_credential` も拾うのは、旧版が書いた行と人が手で書いた行が
      // 台帳に残るため。新しく機械が書く種別は `immediate_failure` だけ。
      if (FAILED_OUTCOMES.has(r.outcome)
        && (r.failure_class === 'immediate_failure' || r.failure_class === 'auth_or_credential')) streak.push(r);
      else if (r.attempted) streak = [];
    }
    if (streak.length >= 2) {
      const first = streak[0], last = streak[streak.length - 1];
      out.push({
        id: `act-credential-${route}`,
        title: `${route} が ${streak.length}日連続で、作業に入る前に即時失敗（${first.date_jst}〜${last.date_jst}・原因未特定）`,
        detail: `run ${streak.map((r) => r.external_ref).join(' / ')}。毎回同じ形で落ちており単発の flake ではないが、`
          + `**決定論的であることは原因を特定しない。**\n\n`
          + `**まずジョブの「即死が資格情報かを切り分ける」ステップを見る。**失敗した回に自動で走っており、`
          + `同じトークンで1ターンだけ実行した結果が出ている（--model も MCP も渡さないので、残る変数はトークンだけ）:\n`
          + `- そのステップが **failure** → **資格情報が通っていない。**オーナーが \`claude setup-token\` で再取得 → `
          + `repo secret CLAUDE_CODE_OAUTH_TOKEN を更新（data/credential-expiry.json の renewal）。**セッション側の調査は不要**\n`
          + `- そのステップが **success** → 資格情報は無事。--model の指定（data/model-routing.json の解決結果が実在するモデルか）・`
          + `MCP・プロンプト・上流の版を見る\n`
          + `- そのステップが **無い/skipped** → 判定不能（CLIが入る前に落ちた回か、この装置より前の run）。下の手順へ\n\n`
          + `【装置が無い回の手順】\n`
          + `1. **--model 等の指定**（費用ゼロ）— data/model-routing.json の解決結果が実在するモデルか\n`
          + `2. **上流の版** — いまは SHA で pin してあるので、直近の成功runと同じSHAなら版は機械的に外れる。`
          + `**SHAが違うこと自体は版が原因である証拠にならない**（@v1 のようなフローティングタグでは日をまたげばほぼ必ず違う。`
          + `2026-08-25 はこの対照を決め手として読んで1日を失った）\n`
          + `3. **資格情報**（オーナー作業）— \`curl -fsSL https://claude.ai/install.sh | bash -s -- <版>\` の後に `
          + `\`claude -p '...' --max-turns 1 --output-format json\` を CLAUDE_CODE_OAUTH_TOKEN 付きで走らせれば $0.04 で再現できる\n\n`
          + `**この経路が復活するまで、出荷は副系だけが担っている。**`,
        source: 'credential',
        // 1と2はセッションが自分で直せる。**ここを human に固定しない** ——
        // 固定していたことが「自分で直せる案件をオーナー依頼に積む」誤り
        // （Runbook §7-2・PR #526）を、この台帳の中で再現していた。
        force_owner: null,
        force_owner_why: null,
        touches: ['.github/workflows/obsidian-autopilot.yml'],
        // 【2026-08-25】ここには当初 probe-secret（secretの存在確認）を付けていたが、
        // 初回の実走で **GitHub API が HTTP 403** を返した——secret 一覧の読み取りは
        // admin 権限が要り、GITHUB_TOKEN にも GH_PAT にも無い。
        // **毎日「実行できず」を出すだけの handler は、この台帳が潰したかった
        // ノイズそのもの**なので外した。存在確認をしたければ権限のあるPATが要る。
        auto: null,
        close_check: {
          // 機械が新しく書く種別は `immediate_failure` だけなので、再発判定も
          // それで見る（`auth_or_credential` は since より前の行にしか無い）。
          kind: 'no_failure_since',
          params: { route, failure_class: 'immediate_failure', since: last.date_jst },
        },
      });
    }
  }

  // --- D5b: 経路が黙って出荷していない / どの経路も出荷していない ---
  //
  // **失敗は拾えていた。拾えていなかったのは「緑のまま何もしない」ほう。**
  //
  // 2026-08-27・28・29 の主系は3日続けて `skipped_gate` で、これは *success* で
  // 終わる。cron-health は failure しか見ず、autopilot-health は
  // status JSON の日付しか見ない —— **副系が出荷していれば当日分は更新される**ので、
  // 主系が何日スキップし続けても、どちらの監視も鳴らない。実際この3日が台帳に
  // 載ったのは 08-31 23:27 で、**セッションが手で起こすまで4日目まで誰も気づいていない。**
  //
  // 【なぜ「出荷」で数えるか】着手やスキップでは数えられない。当日ロックの設計上、
  // 副系が先に取った日に主系が譲るのは正常系で、譲った回も行は立つ。数えるべきは
  // **その経路が最後に何かを出せた日**で、そこから離れるほど「動くはずの予備」が
  // 未検証になる。08-29 に効いたのはこれ —— 副系が claim だけ取って死んだとき、
  // 10日間出荷していなかった主系はもう譲る相手を確かめられなかった。
  //
  // 【閾値3日の理由】2日だと「副系が2日続けて先に取った」だけで鳴り、それは
  // この設計では正常系にある。3日目からは「譲り続けている」ではなく
  // 「出せていない」と読む。**08-27〜29 は3日なので、この規則なら拾える。**
  const shipDays = new Set(runs.filter((r) => r.outcome === 'shipped').map((r) => r.date_jst));
  const ledgerDays = [...new Set(runs.map((r) => r.date_jst))].sort();
  const lastDay = ledgerDays.at(-1) ?? null;

  const byRouteAll = {};
  for (const r of runs) (byRouteAll[r.route] ??= []).push(r);
  for (const [route, rs] of Object.entries(byRouteAll)) {
    // 単発の経路（代走・オーナー実行）は「予備」ではないので数えない。
    // **定期に起動するものだけが、黙っていることを問題にできる。**
    const routeDays = [...new Set(rs.map((r) => r.date_jst))].sort();
    if (routeDays.length < 3) continue;
    const lastShip = rs.filter((r) => r.outcome === 'shipped').map((r) => r.date_jst).sort().at(-1) ?? null;
    // 起点は「最後に出荷した日」。一度も出していない経路は台帳の初日から数える。
    const since = lastShip ?? routeDays[0];
    // その経路の行がある日のうち、起点より後で出荷していない日を数える
    // （行の無い日は数えない —— 起動しなかったことを黙殺と混ぜない）。
    const silent = routeDays.filter((d) => d > since);
    if (silent.length < 3) continue;
    out.push({
      id: `act-route-silent-${route}`,
      title: `${route} が ${silent.length}日ぶん出荷していない（${silent[0]}〜${silent.at(-1)}・最後の出荷 ${lastShip ?? 'なし'}）`,
      detail: `この経路の行は立っているが、${since} より後に出荷が1件も無い`
        + `（${silent.join(' / ')}）。\n\n`
        + `**失敗ではないので、失敗を見る監視には出ない。** cron-health は `
        + `event=schedule かつ conclusion=failure だけを集計し、autopilot-health は `
        + `status JSON の日付だけを見る。**別の経路が出荷していれば当日分は更新される**ため、`
        + `ここが黙っていること自体はどちらにも現れない。\n\n`
        + `**冗長化の主張がここで未検証になる。**「主系が落ちても副系が出す」は、`
        + `両方が最近出せていることでしか裏が取れない。片方が出していない日数は、`
        + `そのまま「切替が試されていない日数」になる（2026-08-29、副系が claim だけ取って`
        + `死んだ日に主系が10日ぶり以上の沈黙のままだったのが実例）。\n\n`
        + `**まず Gate のスキップ理由を読む。**当日ロック（claude/obsidian-auto-<日付>）を`
        + `別経路が取ったのか、本番 status JSON が当日分だったのか、秘密鍵が無いのかで`
        + `打ち手が変わる。「毎日スキップしている」だけでは原因は決まらない。`,
      source: 'route',
      touches: ['data/autopilot-runs.json'],
      // 原因は Gate のスキップ理由を読まないと決まらない。**起票と可視化まで。**
      auto: null,
      close_check: { kind: 'route_shipped_since', params: { route, since } },
    });
  }

  // どの経路も出荷しなかった日が続いているとき。**経路別より上位の信号。**
  // 08-29〜08-31 がこれで、個別の run には selfheal 行が立ったが
  // 「3日出ていない」という形では台帳のどこにも現れていなかった。
  if (lastDay && !shipDays.has(lastDay)) {
    const outage = [];
    for (let i = ledgerDays.length - 1; i >= 0; i -= 1) {
      if (shipDays.has(ledgerDays[i])) break;
      outage.unshift(ledgerDays[i]);
    }
    if (outage.length >= 2) {
      const before = ledgerDays[ledgerDays.length - outage.length - 1] ?? null;
      out.push({
        id: 'act-shipping-outage',
        title: `どの経路も ${outage.length}日連続で出荷していない（${outage[0]}〜${outage.at(-1)}）`,
        detail: `台帳に行はあるが、出荷が1件も無い日が続いている（${outage.join(' / ')}）。\n\n`
          + `**連続稼働は伸び続ける。**稼働の定義（no_run の行がある日だけ停止）では、`
          + `失敗した日も「記録がある日」なので連続が切れない。`
          + `\`node scripts/autopilot-runs.mjs\` の **連続出荷** と **無介入出荷** が`
          + `切れているほうを見ること。\n\n`
          + `**個別の故障行だけを見ていると、この形が見えない。**`
          + `1日1件ずつ selfheal 行が立つので、台帳の上では「未修理が3件」に見え、`
          + `「3日出ていない」にはならない。`,
        source: 'route',
        touches: ['data/autopilot-runs.json'],
        auto: null,
        close_check: { kind: 'shipping_resumed', params: { since: before ?? outage[0] } },
      });
    }
  }

  // --- D6: status JSON の鮮度 ---
  //
  // 2026-08-23 の主系初出荷が §5-2 必須の status JSON 更新を含んでおらず、
  // 本番の日報データが3日間止まった。日報は「当日分が無い＝上流停止」と
  // 読む設計なので、**出荷した日ほど誤報する**壊れ方だった。
  if (ctx.statusDoc?.date_jst && ctx.today) {
    const behind = daysBetween(ctx.statusDoc.date_jst, ctx.today);
    if (behind != null && behind >= 2) {
      out.push({
        id: 'act-status-stale',
        title: `data/autopilot-status.json が ${behind}日前（${ctx.statusDoc.date_jst}）のまま`,
        detail: '日報の唯一のデータ源。当日分でないと「上流が止まった」と報告される（Runbook §5-2）。',
        source: 'status',
        touches: ['data/autopilot-status.json'],
        auto: null,
        close_check: { kind: 'script_ok', params: { script: 'scripts/autopilot-act.mjs', args: ['--status-fresh'] } },
      });
    }
  }

  // 実行の異常・未確定をセッションの調査キューへ運ぶ。制御操作はしない。
  out.push(...deriveRoutineActions(ctx.routineDoc, { now: ctx.now }));

  // --- D6b: 副系の写しの鮮度 ---
  //
  // **CIが赤くなる前に、task として出す。**
  //
  // 2026-09-01、この写しが期限切れ（3日）を越えて `check-routine-runs --check` が落ち、
  // SEO Validation が **step 40 で止まって後続49検査が skipped** になった。
  // auto-merge は検証成功でしか動かないので、**PRが1本もマージできない状態**が
  // 最初の信号だった。それまで、写しが古くなりつつあることはどこにも出ていない。
  //
  // **写しを取り直せるのはセッションだけ**（list_triggers は MCP 側で、CIからは叩けない）。
  // だから機械にできるのは「期限が来る前に、やることとして積む」ところまで。
  // 積む先があるので、ここが D6（status JSON の鮮度）と同じ形になる。
  //
  // **閾値は上限より1日早い。**上限に達してから積むと、積んだ日には既にCIが赤い。
  if (ctx.routineDoc?.observed_at) {
    const max = ctx.routineDoc.max_snapshot_age_days;
    const observed = Date.parse(ctx.routineDoc.observed_at);
    if (typeof max === 'number' && max > 0 && Number.isFinite(observed)) {
      const days = (Date.parse(`${ctx.today}T00:00:00+09:00`) - observed) / 86400000;
      if (days >= max - 1) {
        out.push({
          id: 'act-routine-snapshot-stale',
          title: `副系の写しが ${days.toFixed(1)}日前（上限 ${max}日）— 期限まであと ${(max - days).toFixed(1)}日`,
          detail: `data/routine-runs.json の observed_at が ${ctx.routineDoc.observed_at}。`
            + `**上限（${max}日）を越えると check-routine-runs --check が落ち、`
            + 'SEO Validation が止まって auto-merge が動かなくなる**（2026-09-01 に実際に起きた）。\n\n'
            + '取り直すのはセッションだけができる（CIからは list_triggers を叩けない）:\n'
            + '  1. MCP の list_triggers を呼び、応答の生JSONをファイルへ落とす\n'
            + '  2. node scripts/check-routine-runs.mjs --sync <そのファイル>\n'
            + '  3. node scripts/check-routine-runs.mjs --check — '
            + '**増えた異常はここで落ちる。**理由を書いて open_findings へ（open_budget も同じ差分で動かす）\n\n'
            + '**上限を緩めて閉じない。**古い写しを緑にすると「読めているつもり」で止まる。',
          source: 'routine',
          touches: ['data/routine-runs.json'],
          auto: null,
          close_check: {
            kind: 'script_ok',
            params: { script: 'scripts/check-routine-runs.mjs', args: ['--snapshot-fresh'] },
          },
        });
      }
    }
  }

  // --- D7: 1回上限の未レビュー超過（主系のその種別を止めている） ---
  //
  // 2026-08-25 に実際に起きた形: レーンFの修理 run が repair の1回上限 $3.00 に
  // 対し $11.93（4倍）で終わり、`--check-run-cap --task repair` が非ゼロを返す
  // 状態になった。**月次上限は通るので `--check` は exit 0** ——つまり
  // 「予算は大丈夫」に見えるのに、主系が repair を選んだ瞬間だけ止まる。
  // この状態は台帳のどこにも出ておらず、日報にも載らなかった。
  //
  // **止まっているのが repair である点が要。**主系は失敗すると次の日に
  // レーンF（自己修復）を選ぶので、**いちばん走ってほしい種別が止まっている。**
  // 解除は人間だけができる（下記）ので、気づかなければ黙って止まり続ける。
  for (const o of ctx.budget?.run_caps?.unreviewed ?? []) {
    // 実費台帳は run_id を必須にしていない。無い行は `--ack-overrun <run_id>` の
    // 対象にできない＝**解除手段の無いゲート**なので、idを日付＋種別で作って
    // 衝突を避け、先に run_id を入れることを本文の先頭に置く。
    const noId = o.run_id == null;
    const key = noId ? `${o.date_jst}-${o.task_kind}` : o.run_id;
    out.push({
      id: `act-budget-overrun-${key}`,
      title: `1回上限の超過が未レビュー: ${o.date_jst} ${o.task_kind} $${Number(o.cost).toFixed(4)}`
        + `（上限 $${Number(o.cap).toFixed(2)} の${o.times}倍）— 主系が ${o.task_kind} を選ぶと止まる`,
      detail: (noId
        ? `**この超過は実費台帳に run_id が無く、\`--ack-overrun <run_id>\` が対象を指定できない。**`
          + `先に data/autopilot-cost.json の該当行へ run_id を入れること（実費台帳はレーンFが直してよい）。\n`
        : `解除: \`node scripts/autopilot-budget.mjs --ack-overrun ${o.run_id} --why "…"\`\n`)
        + `**承認そのものが目的ではなく、上限を見直すか支出を認めるかの判断**を求めている。`
        + `上限は data/model-routing.json の rules.${o.task_kind}.max_usd_per_run が正で、`
        + `実測が貯まったなら上限側を直すのが筋（超過の判定は保存されず毎回導出し直されるので、`
        + `上限を直せば過去の判定も一緒に変わる）。\n`
        + `**月次上限は通っている**ため \`--check\` は exit 0 で、"予算は大丈夫" に見える。`
        + `止まるのは \`--check-run-cap --task ${o.task_kind}\` の側だけ。\n`
        + `なお data/authority-matrix.json の「AI実費」は human_only に \`monthly_usd_cap の決定\` しか`
        + `挙げておらず、**この1回上限の承認が人間のみであることは表に書かれていない**`
        + `（権限表の変更は self_repair.must_not なのでAIからは直せない）。`,
      source: 'budget',
      touches: ['data/autopilot-cost.json'],
      force_owner: 'human',
      force_owner_why: 'scripts/autopilot-budget.mjs が --ack-overrun を人間のみと定めている'
        + '（AIが自分の超過を自分で通せると、上限が「お願い」になる）',
      auto: null,
      close_check: {
        kind: 'budget_overrun_reviewed',
        params: noId ? { date_jst: o.date_jst, task_kind: o.task_kind } : { run_id: o.run_id },
      },
    });
  }


  // --- D8: EP 委任判定の月次追認（2026-09-05・オーナー判断） ---
  //
  // EP 精度の判定（owner_needed）はオーナーが AI へ全面委任した（#906）。点は入るが、
  // 「必要だった」と判定するほど点が上がる向きの利害が判定者（AI）の側に残る。
  // オーナーはその上に **月1で人が追認する** を選んだ（data/autonomy-score.json の
  // ep.precision_review.ratification）。**点は動かない**（委任で既に数えている）。
  // 動くのは公開面の「人の判定 0 件」で、反転した件数が AI の自己採点の甘さの実測になる。
  //
  // 【起票の形】月に1行。id を月で固定し、台帳にその月の行が（どの状態でも）在れば立てない。
  // 立てた行は 14 日の窓で閉じ、未追認は翌月の起票に持ち越す（閉じ条件 ep_ratified_or_window）。
  // **derive は台帳を読むだけで書かない。**追認そのものは人が scripts/ep-ratify.mjs で行う。
  const ratification = ctx.scorePolicy?.ep?.precision_review?.ratification;
  if (ratification?.cadence === 'monthly' && Array.isArray(ctx.ledgerDoc?.actions) && typeof ctx.today === 'string') {
    const month = ctx.today.slice(0, 7);
    const accepted = new Set(ctx.scorePolicy.ep.precision_review.accepted_modes ?? ['human']);
    const pending = [];
    for (const a of ctx.ledgerDoc.actions) {
      if (typeof a.owner_needed !== 'boolean') continue;
      const mode = a.owner_needed_review?.mode;
      if (typeof mode !== 'string') continue;
      if (!accepted.has(mode)) pending.push(a);
    }
    const id = `act-ep-ratification-${month}`;
    const exists = ctx.ledgerDoc.actions.some((a) => a.id === id);
    if (pending.length > 0 && !exists) {
      out.push({
        id,
        title: `EP 委任判定の月次追認（${month}）: 未追認 ${pending.length} 件を人が読む`,
        detail: `オーナー判断（2026-09-05・data/autonomy-score.json ep.precision_review.ratification）: `
          + `委任で数えている判定を月1回、人が読んで納得した行を人の判定に上書きする。\n\n`
          + `対象:\n${pending.map((p) => `- ${p.id} … owner_needed=${p.owner_needed}`
            + `（${p.owner_needed_review.mode}${p.owner_needed_review.reviewer ? '/' + p.owner_needed_review.reviewer : ''}）`).join('\n')}\n\n`
          + '手順: `node scripts/ep-ratify.mjs --list` で読み、納得した行は `--ratify <id> --evidence "オーナーの言葉"`、'
          + '納得しない行は `--overturn <id> --evidence "…"`。台帳をコミットして push する。\n\n'
          + '**点は変わらない**（委任で既に数えている）。変わるのは公開面の「人の判定 0 件」で、'
          + '反転した件数が AI の自己採点の甘さの実測になる。追認せずに 14 日の窓を過ぎたら閉じ、未追認は翌月の起票に持ち越す。',
        source: 'ep-ratification',
        touches: ['data/autopilot-actions.json'],
        force_owner: 'human',
        force_owner_why: '判定者を人に置き換える操作そのもの。AI が代筆すると #901 の穴（自己採点）に戻る',
        auto: null,
        close_check: { kind: 'ep_ratified_or_window',
          params: { month, ids: pending.map((p) => p.id), opened_jst: ctx.today, window_days: 14 } },
      });
    }
  }

  return out;
}

/**
 * 導出結果を台帳へ取り込む。**既存の行は上書きしない**（人が書いた detail や
 * 承認メモを消さないため）。新規だけ足し、消えた導出は「閉じ条件が通れば閉じる」
 * 通常経路に任せる。導出から消えたこと自体は閉じる理由にしない
 * ——導出の入力（Actions API 等）が取れなかっただけかもしれない。
 */
export function merge(ledger, derived, today) {
  const byId = new Map(ledger.actions.map((a) => [a.id, a]));
  // **行IDの付け替え（取り残し: PR単位 → ブランチ単位・2026-08-28）を、行を増やさずに渡す。**
  // 旧IDの行は閉じ条件 {pr} のまま生きている（互換は branch_caught_up 側にある）ので、
  // 同じ取り残しに新IDで行を立てると**2行並ぶ** —— 畳むための変更で1行増える。
  // 既存の行があればそこへ流し、閉じるのは今までどおり閉じ条件に任せる。
  //
  // **[2026-09-03] 受容した行も畳み先にする。**旧IDが `open` のときしか
  // 引き当てていなかったので、**照合して受容した行だけが引き当てから漏れていた。**
  //
  // 実害: 09-03 の PR #807 が claude/obsidian-auto-20260827 の 813b335 を照合し、
  // 「内容は別コミットで着地済み」と確かめて `act-orphaned-pr-660` を
  // `acknowledged` + `reviewed_orphans: ["813b335"]` にした。その**同じ日のうちに**、
  // 新IDの行が引き当てに失敗して立ち上がり、**照合済みの取り残しがAIの未処理として
  // 戻ってきた。**受容は「もう見た」という記録なので、引き当てから漏れると
  // **何度でも見直させる。**
  //
  // 畳んだあとの再点火は今までどおり `reviewed_orphans` が持つ ——
  // 同じブランチに別のコミットが積まれれば、受容は自動で開き直る（下記）。
  const legacyByPr = new Map();
  for (const a of ledger.actions) {
    if (!['open', 'acknowledged'].includes(a.state)) continue;
    if (a.close_check?.kind !== 'branch_caught_up') continue;
    const n = a.close_check?.params?.pr;
    if (Number.isInteger(n)) legacyByPr.set(n, a);
  }
  const added = [];
  for (const d of derived) {
    const legacy = d.source === 'orphan' && !byId.has(d.id)
      ? (d.prs ?? []).map((n) => legacyByPr.get(n)).find(Boolean)
      : null;
    const cur = byId.get(d.id) ?? legacy;
    if (cur) {
      cur.last_seen_jst = today;
      // **再発したら開け直す。**derive は「いまその条件が立っている」ときにしか
      // 行を出さないので、導出に出てきた done は**同じ故障がまた起きている**という意味。
      //
      // これが無いと、**IDが固定の行は一度閉じたら二度と立たない。**
      // 実害（2026-09-01 に測った）: act-ledger-sync は 2026-08-26 に閉じ、以後
      // 08-29〜08-31 の主系 run が台帳に入らなくなっても再点火しなかった。結果
      // `autopilot-runs --check` が赤になり、**その検査は autopilot-act.yml 自身の
      // 「台帳の検査」段にも居るので、日次アクチュエータが自分で自分を止めた。**
      // 台帳を埋める handler（reconcile-runs）を持っている当人が、埋めれば直る検査で
      // 落ちていた。**PR #738 はその台帳を手で埋めたが、開け直せない構造は残っている** ——
      // 手で埋めたぶん、次に同じことが起きるまで defect が見えなくなった。
      //
      // **acknowledged は開け直さない。**あれは「知っていて受け入れている」で、
      // 条件が立ち続けるのが前提の状態（開け直すと既知の制約が毎日鳴る）。
      // **受容（acknowledged）は「このSHAなら承知」であって、ブランチへの白紙委任ではない。**
      //
      // 取り残しの受容は「中身を照合したら main に欠けているものが無かった」という
      // 判断で、根拠は**照合したコミットそのもの。**同じブランチに別のコミットが
      // 積まれたら、それは誰も見ていない。ここを見ないと、一度受容したブランチは
      // 以後どんな取り残しを積まれても二度と鳴らない —— **受容が消音になる。**
      //
      // reviewed_orphans が無い受容も開け直す（何を承知したのか台帳に書いていない
      // ので、承知した範囲を言えない）。**受容するときは照合したSHAを必ず書くこと。**
      if (cur.state === 'acknowledged' && d.source === 'orphan') {
        const reviewed = [...(cur.reviewed_orphans ?? [])].map(String).sort().join(',');
        const present = [...(d.commits ?? [])].map(String).sort().join(',');
        if (reviewed !== present) {
          cur.state = 'open';
          cur.closed_jst = null;
          cur.reopened_jst = today;
          cur.created_jst = today;
          cur.evidence = null;
        }
      }
      if (cur.state === 'acknowledged' && d.source === 'routine-run'
        && cur.close_check?.params?.episode !== d.close_check?.params?.episode) {
        cur.state = 'done'; // below: reopen only a different observed execution/state
      }
      if (cur.state === 'done') {
        cur.state = 'open';
        cur.closed_jst = null;
        // 再発は新しい発生。**古い created_jst を引き継ぐと、経過日数が実態より古く出る。**
        cur.reopened_jst = today;
        cur.created_jst = today;
        cur.evidence = null;
      }
      // 件数など、事実として動くものだけ追従させる。
      //
      // **[2026-09-02] auto と touches も追従させる。**どちらも導出の結果であって
      // 行に固有の値ではない。追従させないと、**先に立った行が古い判定のまま残る** ——
      // 取り残しの内訳（paths）が最初の走査で取れず `ledger_only: null` で立った行は、
      // 翌日に内訳が取れて `true` になっても `auto: null` のままになり、
      // 「台帳だけの取り残しは自動で再投入する」が**その行にだけ効かない。**
      //
      // 人が固定したい場合の口は `force_owner` で、classify はそちらを先に見る。
      // merge は force_owner に触らないので、上書きされるのは導出値だけ。
      if (cur.state === 'open') {
        cur.title = d.title;
        cur.detail = d.detail;
        cur.auto = d.auto ?? null;
        cur.touches = d.touches ?? [];
        // **[2026-09-03] 閉じ条件も追従させる。**同じ理由で、これも導出の結果。
        //
        // 追従させないと、**先に立った行だけが古い閉じ条件のまま取り残される。**
        // 実害: usage_limit の3行は `run_repaired`（= repair_of が書かれたら閉じる）で
        // 立っていて、その後 derive が「この種別に repair_of を書いてはいけない」と
        // 判定するようになっても、**行の側は満たしてはいけない条件を持ち続けた。**
        // 導出を直しても、直した判定が既存の行に一生届かない。
        //
        // **ただし handler が積んだ params は消さない。**閉じ条件の params は
        // 導出値だけではない —— `cost_covers_runs` の `exclude` は
        // append-cost が「実測して駄目だった」ものを積んでいく**状態**で、
        // 導出は空の params を出す。素直に上書きすると、**この修正自身が
        // 除外の履歴を毎朝消して、閉じた依頼を開け直す**（実際に一度やった）。
        //
        // 種別（kind）が変われば params は前の種別のものなので捨てる。
        // 同じ種別なら、導出が出さなかったキーは残す。
        if (d.close_check) {
          const keep = cur.close_check?.kind === d.close_check.kind ? (cur.close_check.params ?? {}) : {};
          cur.close_check = { ...d.close_check, params: { ...keep, ...(d.close_check.params ?? {}) } };
        }
        // **force_owner は付ける方向にだけ追従させる。**
        //
        // 導出が「人へ」と言ったら人へ移すが、導出が null になっても**人の固定は外さない。**
        // 非対称なのは、外す側の誤りだけが**人の依頼を黙ってAIの仕事に変える**から。
        // （この台帳の他の非対称 —— 自律実行は止める方向のみ・AIは止められるが解除できない
        // —— と同じ向き。）人が外したいときは行を直接書き換える。
        if (d.force_owner) {
          cur.force_owner = d.force_owner;
          cur.force_owner_why = d.force_owner_why ?? null;
        }
      }
      continue;
    }
    const a = {
      id: d.id, title: d.title, detail: d.detail, source: d.source,
      domain: d.domain ?? null, touches: d.touches ?? [],
      force_owner: d.force_owner ?? null, force_owner_why: d.force_owner_why ?? null,
      auto: d.auto ?? null, close_check: d.close_check,
      state: 'open', created_jst: today, last_seen_jst: today,
      closed_jst: null, evidence: null,
    };
    ledger.actions.push(a);
    byId.set(a.id, a);
    added.push(a);
  }
  return added;
}

// ============================================================
// 突き合わせ — 閉じ条件を実際に走らせる
// ============================================================
// **ここが「解消済みが毎日メールに載る」を構造的に潰す場所。**
// 依頼が消えるのは誰かが行を消したときではなく、閉じ条件が通ったとき。

export function reconcile(ledger, ctx) {
  const closed = [];
  for (const a of ledger.actions) {
    if (a.state !== 'open') continue;
    const check = CLOSE_CHECKS[a.close_check?.kind];
    if (!check) { a.evidence = `未知の閉じ条件: ${a.close_check?.kind}`; continue; }
    let res;
    try {
      res = check(a.close_check.params ?? {}, ctx);
    } catch (e) {
      // 検査が壊れたときは**開いたまま**にする。閉じるほうへ倒さない。
      a.evidence = `閉じ条件の実行に失敗: ${e.message}`;
      continue;
    }
    if (res.pending_pr) {
      // Keep the first verified head while this PR is pending. Recording every
      // subsequent head would make the ledger's own commits change this receipt.
      if (a.pending_pr?.number !== res.pending_pr.number || a.pending_pr.branch !== res.pending_pr.branch) a.pending_pr = res.pending_pr;
      a.evidence = `PR #${a.pending_pr.number} へ引き継いだhead ${a.pending_pr.head_sha} を照合済み。PR待ちとして追跡中（main反映・出荷は未確認）`;
      continue;
    }
    if (res.pending_pr === null || res.closed) delete a.pending_pr;
    a.evidence = res.evidence;
    if (res.closed) {
      a.state = 'done';
      a.closed_jst = ctx.today;
      closed.push(a);
    }
  }
  return closed;
}

/** 表示・メール用の集計。age は「開いてから何日」。 */
export function summarize(ledger, matrix, today) {
  const pending_pr = ledger.actions.filter((a) => a.state === 'open' && a.pending_pr);
  const open = ledger.actions.filter((a) => a.state === 'open' && !a.pending_pr);
  const rows = open.map((a) => {
    const c = classify(a, matrix);
    return { ...a, owner: c.owner, owner_why: c.why, age_days: daysBetween(a.created_jst, today) ?? 0 };
  });
  rows.sort((a, b) => (b.age_days - a.age_days) || a.id.localeCompare(b.id));
  return {
    open_total: rows.length,
    pending_pr,
    human: rows.filter((r) => r.owner === 'human'),
    ai: rows.filter((r) => r.owner === 'ai'),
    acknowledged: ledger.actions.filter((a) => a.state === 'acknowledged').length,
    closed_today: ledger.actions.filter((a) => a.state === 'done' && a.closed_jst === today),
    oldest_open_days: rows.length ? rows[0].age_days : 0,
  };
}

// ============================================================
// GitHub Actions の実行履歴
// ============================================================
// 台帳を埋めるための唯一の外部入力。**取れなかったときは null を返す**
// （空配列を返すと「1件も無い」＝台帳は完全、という逆の結論になる）。


// ============================================================
// マージ後に取り残されたコミット（orphaned-post-merge）
// ============================================================
// ※ 括弧内はこの機能の識別子。台帳 act-detect-orphaned-post-merge-commits の
//   閉じ条件（file_contains）がこの文字列を探す。**実装が入っても文字列が
//   無いと「まだ無い」と報告し続ける** —— 実際 08-26 の実装から2日、
//   「scripts/autopilot-act.mjs に「orphaned-post-merge」がまだ無い」を
//   出し続けていた。消さないこと。
// **auto-merge は「検証済みSHAだけ」をマージする設計の帰結。**セッションが記事のPRを
// 出した後に台帳を書くと、その push はマージ済みPRに届かず、拾う先が無くなる。
// CLAUDE.md は「そのpushが起こす次の検証が拾う」と書いているが、
// **PRが既に閉じていると次の検証が無い。**
//
// 2026-08-23 / 08-26 と2回起きており、08-26 は日報が出荷した日を
// 「公開記事: 0」と誤報した（#591 の原因）。
//
// **「ブランチが main より進んでいるか」では駄目。**このリポジトリは squash マージなので、
// マージ済みブランチの head は main の祖先にならず、`compare/main...branch` の
// ahead_by は**全ての merged ブランチで > 0 になる**（実測: #547 のマージ済み head は
// main の祖先ではない）。**マージ時点の head と、ブランチの現在地を比べる。**
//
// **さらに、マージ時 head との比較「だけ」でも足りない。**
// 2026-08-26 に3件目で崩れた: PR #593 のブランチは merge 時 head より6件先にあるが、
// **うち5件は後続PRで既に main へ着地している**（ブランチが複数PRで使い回された）。
// マージ時 head との差だけを見ると、着地済みのコミットまで取り残し扱いになる。
//
// **正しいのは2つの積:**
//   ① compare/{マージ時head}...{branch}  → マージ後に push されたもの（候補）
//   ② compare/{base}...{branch}          → **main に無いもの**
//   取り残し = ① ∩ ②
//
// 実測（2026-08-26・3件で誤検知ゼロ・見逃しゼロ）:
//   PR #586  候補1 ∩ main無し3 = **1件**（ee4e37c）  ← 本物
//   PR #547  候補0 ∩ main無し2 = 0件                  ← きれい
//   PR #593  候補6 ∩ main無し1 = **1件**（2b0a702）   ← ①だけなら6件と誤検知していた
//
// ============================================================
// 【なぜブランチ単位か】2026-08-28 に3件目の崩れ方が出た
// ============================================================
// 上の②は「コミットの重複」を潰したが、**行の重複は潰していなかった。**
// 走査はマージ済みPRごとに回るので、**1本のブランチが複数PRで使い回されると、
// 同じ取り残しがPRの数だけ行になる。** 08-28 の日報がその形で出た:
//
//   claude/simplememo-self-improving-pr-ki8vgo  fb12596  → #642 #643 #644 #647 #648（5行）
//   claude/obsidian-sync-implementation-5g9fs1  4d56858  → #668 #669 #670（3行）
//   claude/obsidian-auto-20260827               813b335  → #660（1行）
//
// **人間キューは9件と表示されたが、人が下す判断は3つしかない。**
// ブランチ使い回しは②を足したときの根拠そのもの（「PR #593 のブランチが
// 複数PRで使い回された」）で、**同じ事実を知っていながら片側だけ直していた。**
//
// 実態の3倍で出るキューは「多すぎて読まれない」方向に壊れる。取り残しは
// **ブランチ1本＝人の判断1回**なので、行もブランチ単位で立てる。
// PR番号は消さずに `prs` に全部載せる（どのマージから来たかは追える）。
//
// **畳むとき、和を取ってはいけない。**最初にそう書いて実データで外した。
// 理屈のうえでは「②はブランチ側の性質でPRに依らないから、古いPRの積は
// 新しいPRの積の上位集合。和＝いちばん古いPRの積」に見える。**②の意味を
// 取り違えている。**このリポジトリは squash マージなので、
// **ブランチのコミットは main に着地しても sha としては main に残らない。**
// ②「main に無い」は「まだ着地していない」ではなく「sha が一致しない」しか
// 言っておらず、squash 済みのコミットも②に残り続ける。
//
// 実測（2026-08-28・claude/obsidian-memo-automation-tqsd8z・PR #688〜#717 の25本）:
//
//   ②（main に無い）                  … 21件   ← squash 済みのぶんが全部残る
//   ①（最新 #717 のマージ head 以降）  … 2件（1c6163e, a3949d1）
//   ① ∩ ②                             … **1件**（a3949d1）
//   和を取ると                          … 21件と報告する（20件が嘘）
//
// **最後のマージより前のコミットは、どれかのPRで着地している**
// （マージ時 head はその時点のブランチ先端なので、それ以前は全部その中に入る）。
// したがって候補は**最後のマージ以降だけ**で、ブランチ単位の答えは
// **最新マージPRの積そのもの。**古いPRの結果は使わない。
//
// ============================================================
// 【1ページでは覆えない】同じ日に測って出た2つ目の穴
// ============================================================
// 走査は closed PR を `per_page=30` の**1ページだけ**読んでいた。
// ブランチ使い回しは「1行が何行にもなる」だけでなく、**PR一覧を溢れさせる。**
//
// 実測（2026-08-28）: 当日 #688〜#717 の25本が1本のブランチからマージされ、
// 30件のページを埋めた。結果、前日まで取り残しが載っていた
//
//   claude/obsidian-auto-20260827               813b335  ← **今も取り残しあり**
//   claude/obsidian-sync-implementation-5g9fs1  2e9d8c8  ← **今も取り残しあり**
//
// の2本が**一覧から溢れて走査に出てこなくなった。**閉じ条件は
// 「走査に出てこない＝解消」なので、**未解決のまま2件が閉じる。**
// 溢れさせたのは、同じブランチを25回マージしたこと自体である。
//
// 対処は2つ:
//   - 窓（7日）を覆うまでページを辿る。**覆えなければ null**（途中までの
//     一覧は「載らなかったブランチ＝解消」に化けるので、返してはいけない）
//   - compare は**ブランチ1本につき1回**。答えは最新マージPRの積なので、
//     PRごとに叩く必要が最初から無い（25本の日に50回叩いて24回捨てていた）

/** 何日ぶんのマージ済みPRを見るか。**古い取り残しは拾っても直せない。** */
export const ORPHAN_LOOKBACK_DAYS = 7;

/**
 * closed PR を何ページまで辿るか（1ページ100件）。**上限に当たったら null を返す**
 * ——途中までの一覧は「載らなかったブランチ＝解消」に化ける。
 */
export const ORPHAN_MAX_PAGES = 10;

/**
 * 走査の窓を **まだ片付いていない取り残しの行が全部入るところまで** 広げる。
 * 返すのは `YYYY-MM-DD`、対象が無ければ null（既定の7日窓のまま）。
 *
 * **open だけでなく acknowledged も見る。**受容した行は「このSHAなら承知」であって
 * 「このブランチは今後何を積まれても承知」ではない。別のコミットが積まれたことを
 * 言うには、受容した後も走査にそのブランチが載り続けている必要がある。
 *
 * created_jst から1日ぶん余裕を取るのは、行が立つのは JST の日付で、
 * PRのマージはその前日の UTC でありうるため。
 */
export function orphanWatchSince(ledger, slackDays = 1) {
  const dates = (ledger?.actions ?? [])
    .filter((a) => (a.state === 'open' || a.state === 'acknowledged')
      && a.close_check?.kind === 'branch_caught_up'
      && /^\d{4}-\d{2}-\d{2}$/.test(a.created_jst ?? ''))
    .map((a) => a.created_jst)
    .sort();
  if (dates.length === 0) return null;
  const t = Date.parse(`${dates[0]}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return new Date(t - slackDays * 86400000).toISOString().slice(0, 10);
}

/**
 * **運転そのものが毎日書き換える台帳。**ここだけを触る取り残しは「再投入の候補」で、
 * それ以外を含むものは書きかけかもしれないので中身を読むしかない。
 *
 * [2026-08-28] この一覧を足したのは、**拾う側が毎回同じ手作業をしていた**から。
 * 起票には「N コミット取り残し」としか書いておらず、
 * 台帳の更新なのか書きかけなのかを知るには、ブランチを取り直して
 * `git show --stat` を叩くしかない。実際この日、5ブランチぶん手で叩いた。
 * **判断に要る材料が起票に載っていないと、判断は起きない。**
 *
 * **この一覧は「自動で適用してよい」の意味ではない。**適用の可否は別問題で、
 * 現に `data/autopilot-status.json` は self_repair.may_modify に入っていない
 * （＝無人ハンドラは触れない）。ここが答えるのは「読む前に見当がつくか」だけ。
 */
export const OPERATING_LEDGERS = [
  'data/autopilot-runs.json',
  'data/autopilot-status.json',
  'data/autopilot-cost.json',
  'data/autopilot-actions.json',
  'docs/obsidian/AUTOPILOT_LOG.md',
  'growth/content/coverage-queue.json',
];

/**
 * **追記型の台帳だけ、再投入してよい。**（D3b の手順 2）
 *
 * `data/autopilot-runs.json` と `data/autopilot-cost.json` は run_id で冪等な追記型で、
 * 載せ直しても足されるだけ。`data/autopilot-status.json` は**現在値を持つ状態型**で、
 * 古い写しを当てると巻き戻る —— 再生成はするが、写しは当てない。
 * `data/autopilot-actions.json` はこのエンジン自身の出力なので、古い写しを当てると
 * **閉じた行が開き直る。**触らない。
 */
export const ORPHAN_APPENDABLE = {
  'data/autopilot-runs.json': 'runs',
  'data/autopilot-cost.json': 'cost',
};

/**
 * ブランチ側の台帳にあって main 側に無い行を返す。**SHAではなく run_id で見る。**
 *
 * 取り残しの検知は SHA で行うので、**内容が別コミットで着地済みでも行は立つ**
 * （2026-08-28 の実測で4件中3件がそれ）。だから再投入の前に、ここで
 * 「本当に欠けているか」を必ず通す。欠けていなければ空配列が返り、
 * ハンドラは1行も書かない。
 */
export function missingLedgerRows(branchDoc, mainDoc) {
  const rows = Array.isArray(branchDoc?.runs) ? branchDoc.runs : null;
  if (!rows) return null; // 読めなかった。**「欠けていない」と混ぜない**
  const known = new Set((mainDoc?.runs ?? []).map((r) => String(r.run_id ?? '')));
  return rows.filter((r) => r?.run_id && !known.has(String(r.run_id)));
}

/** 内訳を読むために叩くコミット数の上限。**超えたら断定しない**（下記）。 */
export const ORPHAN_MAX_COMMIT_READS = 20;

/**
 * 台帳だけを触っているか。**paths が取れていなければ `null`。**
 *
 * `false`（＝中身を読む必要がある）と混ぜないこと。取れなかったことを
 * 「読む必要がある」に倒すのは安全側だが、**理由が消える** ——
 * 「読んだら書きかけだった」と「そもそも読めなかった」は次の一手が違う。
 */
export function classifyOrphanPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  return paths.every((p) => OPERATING_LEDGERS.includes(p));
}

export const ORPHAN_STATUS_FILE = 'data/autopilot-status.json';
export const ORPHAN_LOG_FILE = 'docs/obsidian/AUTOPILOT_LOG.md';

/**
 * **1ファイルぶんの「main に欠けが無い」を、示せるときだけ示す。**
 *
 * これが要る理由: 取り残しの判定はSHAで行うので、**内容が別コミットで着地済みでも
 * 行は立つ。**apply-orphan-ledger は「1行も欠けていない」をそこまで計算しておきながら、
 * **その結論を捨てて**行を open のままオーナーへ回していた。2026-09-03 の
 * owner_direct が上げた「オーナー待ち 6日」は、まさにその形で開いていた
 * （#660 / 813b335 —— 人が手で照合して、取るものは無かった）。
 *
 * **示せないものは示せないと返す。**返り値は3値ではなく2値だが、
 * `why` に「判定不能」と「欠けている」を書き分ける。どちらも landed:false ——
 * **判定不能を「着地済み」に倒さない**（この運用が繰り返し戒めている形）。
 */
export function proveLandedFile(file, branchText, mainText) {
  if (typeof branchText !== 'string') {
    return { landed: false, why: 'ブランチ側を読めず判定不能（欠けていないという意味ではない）' };
  }
  if (typeof mainText !== 'string') {
    return { landed: false, why: 'main 側を読めず判定不能' };
  }

  // ① 追記型のJSON —— 行キーの包含。**SHAではなく run_id で見る。**
  if (ORPHAN_APPENDABLE[file]) {
    let b; let m;
    try { b = JSON.parse(branchText); m = JSON.parse(mainText); }
    catch { return { landed: false, why: 'JSON として読めず判定不能' }; }
    const missing = missingLedgerRows(b, m);
    if (missing === null) return { landed: false, why: 'ブランチ側に runs が無く判定不能' };
    return missing.length === 0
      ? { landed: true, why: `行キーの包含（ブランチ側 ${(b.runs ?? []).length}行すべてが main にある）` }
      : { landed: false, why: `欠けている行 ${missing.length}件: ${missing.map((r) => r.run_id).join(', ')}` };
  }

  // ② 状態型 —— main 側が新しければ**上書き済み**。
  //
  // 「ブランチが古い」のであって「main に無い仕事がある」ではない。
  // 当てると巻き戻るので再投入はしないが、**失われるものは無い。**
  if (file === ORPHAN_STATUS_FILE) {
    let b; let m;
    try { b = JSON.parse(branchText); m = JSON.parse(mainText); }
    catch { return { landed: false, why: 'JSON として読めず判定不能' }; }
    const bd = b?.date_jst; const md = m?.date_jst;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bd ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(md ?? '')) {
      return { landed: false, why: 'date_jst を読めず判定不能' };
    }
    return md >= bd
      ? { landed: true, why: `状態型で main 側が新しい（ブランチ ${bd} / main ${md}）— 上書き済み` }
      : { landed: false, why: `main 側のほうが古い（ブランチ ${bd} / main ${md}）— 巻き戻っている疑い` };
  }

  // ③ 追記型の散文 —— **前方一致。**
  //
  // 散文には run_id のような冪等な鍵が無いので、行ごとの照合はできない。
  // だが**追記しかしないファイル**なら、「ブランチ側の全文が main 側の先頭と
  // 一致する」ことが包含の十分条件になる（main はその後ろに足しただけ）。
  // 一致しなければ、追記以外が起きている＝人が読む。
  if (file === ORPHAN_LOG_FILE) {
    return mainText.startsWith(branchText)
      ? { landed: true, why: `前方一致（ブランチ側 ${branchText.length} 文字が main 側 ${mainText.length} 文字の先頭と一致）` }
      : { landed: false, why: 'main 側の先頭と一致しない（追記以外が起きている）— 中身を人が読む' };
  }

  // ④ それ以外。**data/autopilot-actions.json をここに落としているのは意図的。**
  // あれはこのエンジン自身の出力で、「何が欠けているか」を記録するファイル。
  // その file について「欠けが無い」を自分で判定するのは循環なので、示さない。
  return { landed: false, why: '包含を機械で示す方法が無い — 人が読む' };
}

/**
 * 取り残しが触った**全パス**について ③ を通す。**1つでも示せなければ proven:false。**
 * `texts` は `{ [file]: { branch, main } }`。
 */
export function proveOrphanLanded(paths, texts) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { proven: false, why: ['触ったパスが取れていない（内訳が無いことを「台帳だけ」と読まない）'] };
  }
  const why = [];
  let proven = true;
  for (const file of paths) {
    const t = texts?.[file] ?? {};
    const r = proveLandedFile(file, t.branch, t.main);
    if (!r.landed) proven = false;
    why.push(`${file}: ${r.why}`);
  }
  return { proven, why };
}

/**
 * 取り残しコミットが触ったパスを集める。**1つでも取れなければ null。**
 * 部分的な一覧は「台帳だけ」と読まれうるので、途中経過を返さない。
 */
async function fetchOrphanPaths(get, repo, commits) {
  if (commits.length > ORPHAN_MAX_COMMIT_READS) return null;
  const out = new Set();
  for (const c of commits) {
    let detail;
    try {
      detail = await get(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(c.sha)}`);
    } catch { return null; }
    if (!Array.isArray(detail?.files)) return null;
    for (const f of detail.files) if (f?.filename) out.add(f.filename);
  }
  return [...out].sort();
}

/**
 * 行ID用にブランチ名を均す。**衝突しないことだけが要件**で、可逆である必要はない。
 * 万一衝突したら derive 側が PR 番号を足して分ける（黙って畳まない）。
 */
export function orphanSlug(branch) {
  return String(branch).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function pendingPrCoversOrphan(row) {
  const proof = row?.pending_pr;
  return Number.isInteger(proof?.number) && proof.number > 0
    && typeof row.branch === 'string' && row.branch.length > 0
    && /^[a-f0-9]{40}$/.test(row.head_sha ?? '')
    && proof.head_sha === row.head_sha && proof.branch === row.branch;
}

/**
 * マージ後に push された取り残しを探す。**取れなかったら null**
 * （空配列だと「取り残しは無い」＝逆の結論になる）。
 */
export async function fetchOrphanedCommits(repo, token, today, { fetchImpl = fetch, watchSince = null } = {}) {
  if (!token) return null;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'simplememo-autopilot-act',
  };
  const get = async (url) => {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { const error = new Error(`${res.status}`); error.status = res.status; throw error; }
    return res.json();
  };
  try {
    // **窓は「拾う範囲」であって「閉じてよい範囲」ではない。**
    //
    // 既定は7日。だが窓から外れたブランチは走査に載らず、branch_caught_up は
    // **載っていないことを「解消」と読んで閉じる。**取り残しが残ったままでも閉じる。
    //
    // 2026-09-03 に実測した実害: act-orphaned-pr-660（ブランチ
    // claude/obsidian-auto-20260827）は merged_at 2026-08-27T00:32:47Z で、
    // 09-03 の since（08-27T00:00Z）には入るが **09-04 の since（08-28T00:00Z）で
    // 外れる。**ブランチには 813b335e が残ったままなのに、翌日の走査で消えて
    // 「取り残しは解消（走査に出てこない）」という **嘘の evidence で閉じる。**
    // 7日以内に片付かなかった取り残しは、例外なく全部この閉じ方をしていた。
    //
    // なので **開いている行がある間は窓を狭めない。**判定に要るのはその行の
    // ブランチだけなので、覆えなければ null を返す既存の規律もそのまま効く。
    const windowMs = Date.parse(`${today}T00:00:00Z`) - ORPHAN_LOOKBACK_DAYS * 86400000;
    const watchMs = watchSince ? Date.parse(`${watchSince}T00:00:00Z`) : NaN;
    const since = new Date(Number.isFinite(watchMs) ? Math.min(windowMs, watchMs) : windowMs);
    // **窓の中のマージ済みPRを全部拾う。**1ページ固定だと覆えない（下の
    // 【1ページでは覆えない】）。updated desc なので、ページ末尾が窓より古く
    // なった時点で以降も全部古い（merged_at <= updated_at なので取りこぼさない）。
    const merged = [];
    let covered = false;
    for (let page = 1; page <= ORPHAN_MAX_PAGES; page++) {
      const batch = await get(`https://api.github.com/repos/${repo}/pulls`
        + `?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);
      if (!Array.isArray(batch) || batch.length === 0) { covered = true; break; }
      for (const pr of batch) {
        if (pr.merged_at && Date.parse(pr.merged_at) >= since.getTime()) merged.push(pr);
      }
      // 覆えたと言えるのは**positive に判定できたときだけ。**
      if (batch.length < 100) { covered = true; break; } // 一覧の終端
      const last = batch[batch.length - 1];
      if (last?.updated_at && Date.parse(last.updated_at) < since.getTime()) { covered = true; break; }
    }
    // **覆いきれなかったら null。**途中までの結果を返すと、載らなかった
    // ブランチが「走査に出てこない＝解消」と読まれて**未解決のまま閉じる。**
    if (!covered) {
      console.error('ORPHAN_SCAN_INCOMPLETE',
        { pages: ORPHAN_MAX_PAGES, note: '7日窓を覆えなかった（解消と読ませない）' });
      return null;
    }
    // A reused branch can have a new open PR. Calling its live work "orphaned"
    // makes Act report its own growing commits on every observation and restart
    // the pending PR's CI. Read all open PRs; failure is unknown, not an empty set.
    const openPrs = [];
    let openCovered = false;
    for (let page = 1; page <= ORPHAN_MAX_PAGES; page++) {
      const batch = await get(`https://api.github.com/repos/${repo}/pulls`
        + `?state=open&sort=created&direction=desc&per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Incomplete open PR inventory');
      openPrs.push(...batch);
      if (batch.length < 100) { openCovered = true; break; }
    }
    if (!openCovered) throw new Error('Open PR inventory page limit reached');
    // **ブランチごとに、最後のマージだけ見る。**答えは最新マージPRの積なので、
    // compare はブランチ1本につき1回でよい。PRごとに回すと、1日25本の日に
    // 50回叩いたうえで同じ答えを24回捨てることになる。
    const latest = new Map();
    const prsOf = new Map();
    for (const pr of merged) {
      const br = pr.head?.ref;
      if (!br) continue;
      if (!prsOf.has(br)) prsOf.set(br, []);
      prsOf.get(br).push(pr.number);
      const cur = latest.get(br);
      if (!cur || Date.parse(pr.merged_at) > Date.parse(cur.merged_at)) latest.set(br, pr);
    }
    const out = [];
    for (const [branch, pr] of latest) {
      // ① 最後のマージ後に push されたもの ② main に無いもの —— **その積だけが取り残し。**
      let after;
      let notOnBase;
      try {
        [after, notOnBase] = await Promise.all([
          get(`https://api.github.com/repos/${repo}/compare/`
            + `${encodeURIComponent(pr.head.sha)}...${encodeURIComponent(branch)}`),
          get(`https://api.github.com/repos/${repo}/compare/`
            + `${encodeURIComponent(pr.base.ref)}...${encodeURIComponent(branch)}`),
        ]);
      } catch (error) {
        // A comparison failure is not evidence that the branch disappeared.
        // Only an independent 404 for the branch ref permits removing its watch.
        if (error.status !== 404) throw error;
        try {
          await get(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
        } catch (refError) {
          if (refError.status === 404) continue;
          throw refError;
        }
        throw new Error('Comparison unavailable for an existing branch');
      }
      if (!Array.isArray(after?.commits) || !Array.isArray(notOnBase?.commits)) throw new Error('Incomplete branch comparison');
      const missing = new Set((notOnBase.commits ?? []).map((c) => c.sha));
      const orphaned = (after.commits ?? []).filter((c) => missing.has(c.sha));
      if (orphaned.length === 0) continue;
      const candidates = openPrs.filter(p => p.state === 'open' && p.head?.ref === branch
        && p.head.repo?.full_name === repo && p.base?.repo?.full_name === repo && p.base.ref === 'main'
        && Number.isInteger(p.number) && p.number > 0 && /^[a-f0-9]{40}$/.test(p.head.sha ?? ''));
      let pending_pr = null, head_sha = null;
      if (candidates.length) {
        const [ref, fresh] = await Promise.all([
          get(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`),
          get(`https://api.github.com/repos/${repo}/pulls/${candidates[0].number}`),
        ]);
        if (ref?.ref !== `refs/heads/${branch}` || ref.object?.type !== 'commit'
          || !/^[a-f0-9]{40}$/.test(ref.object.sha ?? '')) throw new Error('Unverified current branch head');
        head_sha = ref.object.sha;
        const pending = fresh?.number === candidates[0].number && fresh.state === 'open'
          && fresh.head?.ref === branch && fresh.head.repo?.full_name === repo
          && fresh.base?.ref === 'main' && fresh.base.repo?.full_name === repo
          && fresh.head.sha === head_sha ? fresh : null;
        if (pending) pending_pr = { number: pending.number, branch, head_sha };
      }
      // ③ **中身の内訳。**「台帳の更新なら再投入、書きかけなら捨てる」を決めるのに
      // 要るのはこの一覧で、無いと拾う側がブランチを取り直して git show を叩く。
      const paths = pending_pr ? null : await fetchOrphanPaths(get, repo, orphaned);
      // **1ブランチ = 1件。**PRごとに返すと、使い回されたブランチが
      // PRの数だけ行になる（derive 側の【なぜブランチ単位か】を見ること）。
      out.push({
        pr: pr.number,
        prs: prsOf.get(branch).slice().sort((a, b) => a - b),
        branch,
        merged_sha: pr.head.sha,
        ahead_by: orphaned.length,
        landed_elsewhere: (after.commits ?? []).length - orphaned.length,
        commits: orphaned.map((c) => c.sha.slice(0, 7)),
        paths,
        ledger_only: classifyOrphanPaths(paths),
        ...(pending_pr ? { pending_pr, head_sha } : {}),
      });
    }
    return out;
  } catch (e) {
    console.error('ORPHAN_SCAN_FAILED', { error: String(e).slice(0, 120) });
    return null;
  }
}

const WORKFLOW_FILE = 'obsidian-autopilot.yml';

async function fetchWorkflowRuns(repo, token, limit = 30) {
  if (!token) return null;
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${limit}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'simplememo-autopilot-act',
  };
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    console.error(`# Actions API に到達できず: ${e.message}（台帳が完全という意味ではない）`);
    return null;
  }
  if (!res.ok) {
    console.error(`# Actions API が HTTP ${res.status}（台帳が完全という意味ではない）`);
    return null;
  }
  const body = await res.json();
  const out = [];
  for (const r of body.workflow_runs ?? []) {
    // Gateでスキップした回（＝そもそも着手していない）と、着手して落ちた回を
    // 区別するにはジョブの step まで見る必要がある。ここで一緒に取る。
    let steps = null;
    try {
      const jr = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${r.id}/jobs`,
        { headers, signal: AbortSignal.timeout(20_000) });
      if (jr.ok) steps = primarySteps((await jr.json()).jobs ?? []);
    } catch { /* step が読めなくても run 自体は記録する */ }
    out.push({
      id: r.id,
      conclusion: r.conclusion,
      status: r.status,
      event: r.event,
      created_at: r.created_at,
      jst_date: jstToday(new Date(r.created_at)),
      steps,
      cost_usd: null, // 実費は step summary にしか出ない。ここでは取らない（0を書かない）
    });
  }
  return out;
}

/**
 * run の形から outcome / failure_class を決める。
 *
 * **推測を書かない。**判定できない部分は null にして needs_triage を立てる。
 * 台帳の失敗行に嘘の failure_class が入ると、selfheal の
 * 「同じ種別を3回直したら人へ」という歯止めが別の種別で数えられて効かなくなる。
 */
/**
 * ワークフローがステップ名に出した判定コードを読む。**純関数。**
 *
 * `.github/workflows/obsidian-autopilot.yml` の「判定コード: <code>」という
 * 何もしないステップが、`steps.gate.outputs.code` を名前に埋めて出している。
 * **名前に "Gate" を入れない。**`step('Gate')` は includes で先頭一致を拾うので、
 * 同じ語を持つステップを増やすと、いつか順序の入れ替えで別のステップを掴む。
 *
 * 【なぜステップ名なのか】判定コードは `$GITHUB_OUTPUT` にも `::notice` にも出ているが、
 * **Actions API の run 一覧から読めるのはステップの name と conclusion だけ。**
 * 注釈は checks:read が要り、ジョブログは追加の取得経路が要る。
 * ステップ名なら、いま既に取っている情報の中に入っている。
 *
 * 【無くても壊れない】この写しが無い run（2026-09-04 より前の全部）では null を返し、
 * 運転台帳側が declined_unrecorded として自己申告する。
 * **後から足した観測手段が、過去を「記録があった」ことにしない。**
 */
/**
 * 判定コードから、適格性の「判定の結果」を選ぶ。**純関数。**
 *
 * 故障（鍵の失効・API 到達不能・判定器の例外）は outcome が skipped_gate になるが、
 * **静かに寝たのではなく壊れている。**混ぜると、鍵が切れた日が
 * 「設計どおり静かに寝た日」として台帳に残る。
 *
 * 逆向き（正常な棄却を故障として書く）も autopilot-runs.mjs の stageProblems が落とす。
 * **片方だけ閉めても閉めたことにならない。**
 */
export function verdictFor(gateCode) {
  return FAULT_GATE_CODES.includes(gateCode) ? 'declined_by_fault' : 'declined_by_design';
}

export function declaredGateCode(run) {
  const declared = (run.steps ?? []).find((x) => /^判定コード:/.test(x.name ?? ''));
  if (!declared) return null;
  const code = String(declared.name).replace(/^判定コード:\s*/, '').trim();
  // 空（式が展開されなかった）を「コードが読めた」と読まない。
  return code && code !== '-' ? code : null;
}

export function interpretRun(run) {
  const step = (name) => (run.steps ?? []).find((s) => s.name?.includes(name));
  const claude = step('Claude Code');
  const gate = step('Gate');

  if (run.status !== 'completed') return null; // まだ走っている
  if (run.conclusion === 'cancelled') {
    // **人が止めた実行は運用の失敗ではない。**
    //
    // 2026-08-25、`workflow_dispatch` で起動して36秒で中止した run が1件出た
    // （32817335365）。これを cancelled として台帳へ書くと FAILED 集合に入り、
    // 変更失敗率に計上され、selfheal が「未修理の故障」として翌日の最優先を
    // 修理に切り替える。**セッションが自分のテストを止めただけで、翌日の記事が
    // 消える。** しかも failure_class `cancelled` には移管規則が無いのでCIも赤になる。
    //
    // schedule 起動の cancelled は別物で、**そちらは1日ぶんの出荷が消えている**
    // （ジョブ上限・concurrency・runner喪失など）ので従来どおり失敗として扱う。
    if (run.event === 'workflow_dispatch') {
      return { skip: true,
        skip_reason: `手動起動(workflow_dispatch)を人が中止した。運用の失敗ではないので台帳に失敗として書かない（run ${run.id}）` };
    }
    return { outcome: 'cancelled', attempted: true, failure_class: 'cancelled',
      failure_reason: 'schedule 起動の run が cancelled で終了（1日ぶんの出荷が消えている）' };
  }
  // Claude Code に到達していない ＝ 手前のどれかで止まった。
  //
  // **「いずれか」で書かない。**ここは長らく「秘密鍵未設定・当日重複・予算・
  // 緊急停止のいずれか」という4択を毎回そのまま台帳へ書いていた。止まった日の
  // 記録が推測のままなので、**どれで止まったのかを台帳から復元できない。**
  // しかも 2026-08-25 に足した5つ目の理由（1回あたりの実費上限）が
  // この文言に入っておらず、**新しい停止経路が古い4択に化けて記録される**
  // 状態だった。理由はステップの実行結果から一意に決まるので、決めて書く。
  //
  // ワークフローの if: が作る形（.github/workflows/obsidian-autopilot.yml）:
  //   Gate falseで止まった   … 緊急停止・予算・振り分け すべて skipped
  //   緊急停止               … 緊急停止が failure（exit 1）で以降 skipped
  //   月次上限               … 予算は成功、振り分けが skipped
  //   1回あたりの上限        … 振り分けまで成功し、Claude だけ skipped
  // 振り分けと Claude の間には run_cap_ok しか条件が無いので、最後の行は
  // 消去法ではなく**一意**に決まる。
  if (!claude || claude.conclusion === 'skipped') {
    const estop = step('緊急停止');
    const budget = step('予算ゲート');
    const route = step('振り分け');
    const ran = (st) => st != null && st.conclusion !== 'skipped';
    // **[2026-09-04] 判定コードも一緒に返す。**
    // 運転台帳の failure_stage が `eligibility` の行は「なぜ寝たか」を要求する
    // （scripts/autopilot-runs.mjs の GATE_CODE_REQUIRED_FROM）。ここで決めないと、
    // **すべての Gate スキップが declined_unrecorded になり、ラチェットが一度も噛まない。**
    //
    // 下の4分岐のうち3つはステップの実行結果から**一意に決まる**ので、
    // 決まるものは名前を付けて返す。決まらない1つ（秘密鍵未設定 / 当日重複）は
    // ワークフローが出す判定コードの写し（下の gateCode）から読む。
    const gateCode = declaredGateCode(run);
    let note, code = gateCode;
    if (estop?.conclusion === 'failure') {
      note = '緊急停止が立っていたため着手しなかった（data/emergency-stop.json）';
      code ??= 'emergency_stop';
    } else if (ran(route)) {
      // **ここが 2026-08-25 まで名前を持っていなかった停止。**解除は人間のみ
      // なので、気づかれないと毎日この形で静かに止まり続ける。
      note = '1回あたりの実費上限が未レビューのため着手しなかった'
        + '（node scripts/autopilot-budget.mjs --check-run-cap）。解除は人間のみ';
      code ??= 'skip_run_cap';
    } else if (ran(budget)) {
      note = '当月の実費が月次上限に達していたため着手しなかった（data/autopilot-cost.json）';
      code ??= 'skip_budget';
    } else if (ran(estop) || gate != null) {
      // **ここだけはステップの実行結果から決まらない。**秘密鍵未設定も当日重複も
      // 「Gate が run=false を出して以降が skipped」という同じ形になる。
      // ワークフローが判定コードをステップ名に出していれば gateCode が埋まる。
      note = gateCode
        ? `Gate で止まった（${gateCode}）`
        : 'Gate で止まった（秘密鍵未設定・当日重複のいずれか。'
          + `Gate=${gate?.conclusion ?? '不明'}）。**判定コードの写しが無い run**`;
    } else {
      // ステップ情報が無い run（API の取得漏れなど）。**決まらないなら決めない。**
      note = `Claude Code ステップ未実行。手前のどこで止まったかはステップ情報が無く判定できない（Gate=${gate?.conclusion ?? '不明'}）`;
    }
    return { outcome: 'skipped_gate', attempted: false, failure_class: null,
      failure_reason: null, note,
      // **決まったときだけ書く。**決まらない回は運転台帳側が
      // declined_unrecorded として自己申告する（沈黙を正常に見せない）。
      gate_code: code ?? null };
  }
  if (claude.conclusion === 'failure') {
    // **所要時間が言えるのは「作業に入る前に落ちた」までで、原因ではない。**
    //
    // 経緯: ここは元々、即死を所要時間だけで `auth_or_credential` と断定していた。
    // 08-25 にその断定を外して「上流の版」へ倒したが、**08-26 の対照実験で
    // それも誤りと分かった**（2.1.241 は有効なトークンで正常に完走する。
    // run 32919495397）。**当初の「認証系」が結論としては正しく、根拠が無かった。**
    //
    // 2度とも同じ形の誤り —— **他の変数が同時に動いているのに断定した。**
    // だから所要時間からも、SHAの差からも原因を書かない。**書いてよいのは
    // 実験が答えを出したときだけ**で、それをワークフロー側に置いた
    // （「即死が資格情報かを切り分ける」ステップ）。下でその結論を読む。
    //
    // 即死する原因は少なくとも3つあり、所要時間では区別できない:
    //   - 資格情報の失効（401が即返る）
    //   - **上流の action / CLI の版が壊れている**（初回のモデル呼び出しで死ぬ）
    //   - --model や入力ファイルの指定ミス（起動時に弾かれる）
    // どれも 500ms 前後・num_turns=1・cost=$0 になる。
    //
    // **決定論的であることは、認証の証拠ではない。**「2日とも1バイトも
    // 違わないから flake ではない＝認証系」という推論が実際に外れた回が
    // これで、同一シグネチャが本当に示していたのは「同じ壊れた版を2回引いた」
    // だった。種別を決められないときに決めない——これは autopilot-runs.mjs が
    // `--failure-class` を渡されたときだけ書く理由と同じ規則で、ここだけが
    // 破っていた。推測を種別に書くと selfheal の「同一 failure_class を3回
    // 直したら人へ」が別種別として数えられ、歯止めが効かなくなる。
    const ms = claude.started_at && claude.completed_at
      ? new Date(claude.completed_at) - new Date(claude.started_at) : null;
    const immediate = ms != null && ms <= 5000;

    // **実験が答えを出しているなら、推測しない。**
    // ワークフローが失敗した回だけ、同じトークンで1ターンだけ走らせている
    // （--model も MCP も渡さないので、残る変数はトークンが通るかどうかだけ）。
    // failure_class は観測された形（immediate_failure）のまま据え置く——
    // 種別を変えると D5 の連続判定と close_check の再発判定が別種別として
    // 数え直され、歯止めが効かなくなる。結論は failure_reason と
    // needs_triage で伝える。
    const probe = step('資格情報かを切り分ける');

    // 【2026-09-01】**「単独実行も落ちた」と「鍵が悪い」は別。**
    //
    // 上のコメントは「推測をやめて実験に聞く」ことで08-24〜08-25の誤りを閉じた、
    // と書いている。閉じ切れていなかった —— **その実験が2値しか返さないので、
    // 3つ目の原因は必ず2択のどちらかに化ける。**
    //
    // 08-30・08-31 の即死がそれで、中身は使用量上限（HTTP 429）だった。
    // 台帳には「資格情報が通っていない。setup-token を再実行せよ」と
    // needs_triage: false で入るので、**無事な鍵を捨てる指示が、
    // 誰も見直さない形で残る。**答えは応答の中にあった:
    //
    //   {"api_error_status":429,"result":"You've hit your weekly limit · resets Aug 31, 11pm (UTC)"}
    //
    // ワークフロー側でこれを別ステップに割った（読めるのはステップ名と
    // conclusion だけで、ログ本文は読めないため）。このステップが無い
    // 過去の run は undefined になり、従来どおりの判定に落ちる。
    const usageLimit = step('使用量上限');
    if (usageLimit?.conclusion === 'failure') {
      return {
        outcome: 'failed', attempted: true,
        // **ここだけ「形」ではなく「原因」を種別に書く。**
        // 上の切り分け（資格情報かどうか）は種別を immediate_failure のまま
        // 据え置く —— あちらは原因を1つに絞れておらず、絞れないものを種別に
        // 書くと再発の数え方が壊れるから。**429 は絞れている。**
        // かつ形では書けない: Claude Code の導入だけで10秒使うので、429で
        // 弾かれても5秒規則には引っかからず `null` になる。**failed なのに
        // failure_class が無い行は autopilot-selfheal が落とす**（再発を
        // 数えられないため）ので、形に寄せる選択肢がそもそも無い。
        // 種別を足すと data/escalation-rules.json に移管規則が要る
        // （check-escalation.mjs が実績のある種別を全部要求する）。
        failure_class: 'usage_limit',
        // 上限は時間で戻る。**セッションが調べ直すことは何も無く、
        // オーナーが replace すべきものも無い。**
        needs_triage: false,
        failure_reason: `Claude Code ステップが ${ms ?? '不明'}ms で失敗し、`
          + `同じトークンでの単独実行が **HTTP 429（使用量上限）** を返した`
          + `（ワークフローの切り分けステップ）。**資格情報は失効していない —— `
          + `トークンを入れ替えても直らないし、入れ替えれば無事な鍵を捨てることになる。**`
          + `上限がリセットされれば自動で戻る。副系CCRも同じアカウントを使うので`
          + `**同じ時間帯に同じ形で落ちる**（代走は当てにできない）。`
          + `恒久的に減らすなら上限を上げるか、1回あたりの入力量を下げること（自動判定）`,
      };
    }

    if (step('資格情報の診断は判定不能')?.conclusion === 'failure') {
      return {
        outcome: 'failed', attempted: true,
        failure_class: immediate ? 'immediate_failure' : null,
        needs_triage: true,
        failure_reason: `Claude Code ステップが ${ms ?? '不明'}ms で失敗。`
          + '単独実行から資格情報の可否を判定できなかった。通信・サービス・CLIを含めて原因を確認する。'
          + '資格情報の交換が必要とは断定できない（診断は判定不能）。',
      };
    }

    if (probe?.conclusion === 'failure') {
      return {
        outcome: 'failed', attempted: true,
        failure_class: immediate ? 'immediate_failure' : null,
        // **セッションが調べ直す必要が無い。**答えは出ていて、残りはオーナー作業。
        needs_triage: false,
        failure_reason: `Claude Code ステップが ${ms ?? '不明'}ms で失敗し、`
          + `**同じトークンでの単独実行（1ターン）も落ちた**（ワークフローの切り分けステップ）。`
          + `--model も MCP も渡さない実行で落ちているので、**資格情報が通っていない。**`
          + `オーナーがローカルで \`claude setup-token\` を再実行し repo secret `
          + `CLAUDE_CODE_OAUTH_TOKEN を更新する必要がある（自動判定・実験済み）`,
      };
    }
    if (probe?.conclusion === 'success') {
      return {
        outcome: 'failed', attempted: true,
        failure_class: immediate ? 'immediate_failure' : null,
        needs_triage: true,
        failure_reason: `Claude Code ステップが ${ms ?? '不明'}ms で失敗した一方、`
          + `**同じトークンでの単独実行（1ターン）は完走している**（ワークフローの切り分けステップ）。`
          + `**資格情報は通っているので、そこを疑わない。**残る候補は --model の指定`
          + `（data/model-routing.json の解決結果が実在するモデルか）・MCP・プロンプト・上流の版（自動判定）`,
      };
    }
    // 切り分けステップが無い / skipped ＝ **判定不能。**CLIが入る前に落ちた回
    // （08-21 の actor 拒否のような形）や、この装置より前の run がここに来る。
    // **判定不能は「資格情報は無事」ではない**ので、従来どおりセッションへ回す。
    return {
      outcome: 'failed', attempted: true,
      // 即死は「実作業に入る前に落ちた」という**観測された形**までを書く。
      // 原因はここでは名指ししない（needs_triage でセッションへ回す）。
      failure_class: immediate ? 'immediate_failure' : null,
      needs_triage: true,
      failure_reason: immediate
        ? `Claude Code ステップが ${ms}ms で失敗。実作業に入る前（初回のモデル呼び出し相当）で落ちている。`
          + `**原因は所要時間からは決まらない**（資格情報の失効／上流 action・CLI の版の破損／--model等の指定ミスは、どれも同じ形になる）。`
          + `【2026-08-26 実測】08-24〜08-25 の同型の失敗は **資格情報が原因だった**。`
          + `疑われた版（Claude Code 2.1.241）を有効なトークンで直接走らせたところ is_error=false / result=PROBE_OK で通っている（run 32919495397・実費 $0.04）。`
          + `**SHAが違うことは版が原因である証拠にならない** —— @v1 のようなフローティングタグでは日をまたげばほぼ必ず違う値になるので、この対照は当たり前に「違い」を見つけてしまう。`
          + `いまは版がSHAでpinしてあるので、**直近の成功runとSHAが同じなら版は機械的に外れる**。そのときは資格情報を先に疑ってよい。`
          + `切り分けが要るなら費用$0.04で再現できる: ubuntu ランナーで \`curl -fsSL https://claude.ai/install.sh | bash -s -- <版>\` の後 `
          + `\`claude -p '...' --max-turns 1 --output-format json\` を CLAUDE_CODE_OAUTH_TOKEN 付きで走らせ、is_error を見る（自動判定）`
        : `Claude Code ステップが失敗（所要 ${ms ?? '不明'}ms）。原因未特定・要トリアージ（自動判定）`,
    };
  }
  const outputCheck = step('成果物の実行IDを照合');
  if (outputCheck && outputCheck.conclusion !== 'skipped') {
    const verdict = (run.steps ?? []).find(s => /^成果物判定:/.test(s.name ?? ''));
    if (verdict?.conclusion === 'success' && verdict.name === '成果物判定: missing') {
      return { outcome: 'no_artifact', attempted: true, failure_class: 'no_artifact',
        failure_reason: '今回の実行IDに結びつく新しい結果記録を持つPRがないことをリモート照合で確認した' };
    }
    if (outputCheck.conclusion !== 'success' || verdict?.conclusion !== 'success' || verdict.name !== '成果物判定: verified') {
      return { outcome: 'failed', attempted: true, failure_class: null, needs_triage: true,
        failure_reason: 'Claude Code は完了したが、今回の成果物をリモート照合できなかった。取得・記録・並行更新を確認する。成果物ゼロとは断定しない。' };
    }
  }
  if (run.conclusion === 'failure') {
    // Claude Code は通ったが後段（成果物ゼロ検査など）で落ちた
    return { outcome: 'no_artifact', attempted: true, failure_class: 'no_artifact',
      failure_reason: 'Claude Code は完了したが後続ステップが失敗（成果物ゼロ検査など）' };
  }
  return { outcome: 'shipped', attempted: true, failure_class: null, failure_reason: null,
    needs_pr: true };
}

// ============================================================
// 実行 — 自動でやってよいものを実際にやる
// ============================================================
// **--apply のときだけ動く。**それ以外は計画を出すだけ。
//
// ここに置いてよいのは「判断を要さないぶん、毎日確実に漏れる」種類の作業だけ。
// 原因の特定・記事・実装は入れない。入れた瞬間に、このスクリプトは
// レーンA〜Fを置き換えようとして必ず失敗する。
//
// 各 handler は { ok, changed, log } を返す。**失敗しても throw しない** —
// 1つの handler の失敗で日次の同期が丸ごと止まると、止まったこと自体が
// 見えなくなる（このファイル冒頭に書いた「壊れているときほど記録が消える」の再来）。

/** GitHub の失敗ステップの完了時刻だけを使う。run の作成時刻は故障時刻ではない。 */
export function detectionEvidence(run, eventName, now = new Date(), completion = null) {
  const detectedAt = now.toISOString();
  const completedFailure = run.status === 'completed' && ['failure', 'cancelled'].includes(run.conclusion);
  const failures = completedFailure ? (run.steps ?? []).filter(step =>
    ['failure', 'cancelled'].includes(step.conclusion)
    && typeof step.completed_at === 'string' && Number.isFinite(Date.parse(step.completed_at))
    && Date.parse(step.completed_at) <= now.getTime()
    && Number.isFinite(Date.parse(run.created_at))
    && Date.parse(step.completed_at) >= Date.parse(run.created_at)) : [];
  failures.sort((a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at));
  const failure = failures[0];
  return {
    source: (completion ? completion.automatic === true
      : ['schedule', 'workflow_run'].includes(eventName)) ? 'act-reconcile' : 'act-reconcile-session',
    detected_at: detectedAt,
    failed_at: failure?.completed_at ?? null,
    detected_note: `Actions run ${run.id} を ${eventName || 'local-session'} で照合。`
      + (completion ? `監視起動元run ${completion.upstream_run_id}、自動起動のAPI検証=${completion.automatic}。` : '')
      + (failure ? `失敗時刻は GitHub step #${failure.number}「${failure.name}」の completed_at。`
        : '失敗ステップの確定時刻は未取得。run の作成時刻で代用しない。'),
  };
}

export const HANDLERS = {
  /**
   * 運転台帳の同期。Actions API の run を台帳へ落とす。
   * autopilot-runs.mjs --append を呼ぶ（検証を通す唯一の書き込み経路）。
   */
  async 'reconcile-runs'(ctx, _action, { append = (args) => execFileSync(process.execPath,
    [path.join(ROOT, 'scripts/autopilot-runs.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' }) } = {}) {
    if (!ctx.workflowRuns) return { ok: false, changed: 0, log: 'Actions API を読めず同期できない' };
    const known = new Set((ctx.runsDoc?.runs ?? []).map((r) => String(r.external_ref ?? '')));
    const taken = new Set((ctx.runsDoc?.runs ?? []).map((r) => r.run_id));
    const log = [];
    let changed = 0;
    // The API lists newest first. A later manual skip must not take the day's id
    // before the failed scheduled run (or collide with another append in this batch).
    const chronological = [...ctx.workflowRuns].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const run of chronological) {
      if (known.has(String(run.id))) continue;
      const v = interpretRun(run);
      if (!v) { log.push(`${run.id}: まだ完了していない`); continue; }
      if (v.skip) { log.push(`${run.id}: ${v.skip_reason}`); continue; }
      // 同日に複数の run が走ると `ap-YYYYMMDD-actions` は一意にならない
      // （2026-08-25 は schedule / force / 手動中止の3本が走った）。
      // **以前はここで諦めて「手で確認が要る」と記録し続けていた**が、
      // それだと ledger_covers_runs が永久に閉じない。run id を足して一意にする
      // ——external_ref と重複するが、**run_id は人が読む識別子**なので
      // 日付と経路が先頭に残る形を保つ。
      let runId = `ap-${run.jst_date.replace(/-/g, '')}-actions`;
      if (taken.has(runId)) runId = `${runId}-${run.id}`;
      if (taken.has(runId)) { log.push(`${run.id}: ${runId} が既にある`); continue; }
      // shipped は PR 番号が要る（validate が落とす）。PRの特定は機械には荷が重いので
      // **成功した回は書かない**。書かないことで指標が甘くなることは無い
      //（shipped を落とすと完走率は下がる側に倒れる）。
      if (v.outcome === 'shipped') { log.push(`${run.id}: 成功回はPR特定が要るため自動追記しない`); continue; }
      const observation = detectionEvidence(run, ctx.eventName, new Date(), ctx.completion);
      const args = ['--append', '--run-id', runId, '--date', run.jst_date, '--route', 'actions',
        '--outcome', v.outcome, '--attempted', String(v.attempted),
        '--external-ref', String(run.id), '--source', observation.source];
      if (v.failure_reason) args.push('--failure-reason', v.failure_reason);
      if (v.failure_class) args.push('--failure-class', v.failure_class);
      // **なぜ寝たかが決まった回だけ渡す。**渡さない回は autopilot-runs.mjs 側が
      // declined_unrecorded として自己申告する —— 決まらなかったことを、
      // 決まったことにしない（GATE_CODE_REQUIRED_FROM のラチェットはそれを許している）。
      if (v.gate_code) {
        // **故障で止まった回を「設計どおり」と書かない。**鍵の失効・API 到達不能・
        // 判定器の例外は、どれも outcome が skipped_gate になるが、
        // **静かに寝たのではなく壊れている。**（autopilot-runs.mjs の FAULT_GATE_CODES が
        // 逆向きも含めて検査する。）
        args.push('--gate-code', v.gate_code, '--eligibility-verdict', verdictFor(v.gate_code));
      }
      if (v.note) args.push('--stage-note', v.note);
      if (v.needs_triage) args.push('--needs-triage', 'true');
      args.push('--detected-at', observation.detected_at, '--detected-note', observation.detected_note);
      if (observation.failed_at) args.push('--failed-at', observation.failed_at);
      try {
        const out = append(args);
        taken.add(runId);
        known.add(String(run.id));
        log.push(`${run.id} -> ${runId}: ${out.trim()}`);
        changed += 1;
      } catch (e) {
        log.push(`${run.id}: 追記に失敗 ${e.stderr?.toString().trim() ?? e.message}`);
      }
    }
    return { ok: true, changed, log: log.join('\n') };
  },

  /**
   * 実費台帳の同期。ジョブログから total_cost_usd を読んで --append する。
   * **取得できなかった回は書かない**（0を書くと「無料で動いた」になる）。
   */
  async 'append-cost'(ctx, action, { readCost = fetchRunCost, append = (args) => execFileSync(process.execPath,
    [path.join(ROOT, 'scripts/autopilot-budget.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' }) } = {}) {
    if (!ctx.token || !ctx.repo) return { ok: false, changed: 0, log: '認証情報が無く実費を取得できない' };
    const costed = new Set((ctx.costDoc?.runs ?? []).map((e) => String(e.run_id ?? '')));
    const existing = new Map((ctx.costDoc?.runs ?? []).map((e) => [String(e.run_id ?? ''), e]));
    const candidates = costCandidates(ctx, action?.close_check?.params?.pending_runs);
    const excluded = new Set(action?.close_check?.params?.exclude ?? []);
    const targets = candidates.filter((r) => costSyncNeeded(r, existing.get(String(r.external_ref)))
      && (existing.has(String(r.external_ref)) || !costExcluded(r, excluded)))
      .slice(-10); // 一度に遡る上限。歴史全部を毎日取りに行かない
    const log = [];
    let changed = 0;
    const unmeasurable = [];
    for (const r of targets) {
      const recorded = existing.get(String(r.external_ref));
      const cost = recorded ? { state: 'measured', usd: recorded.total_cost_usd, turns: recorded.num_turns }
        : await readCost(ctx.repo, ctx.token, r.external_ref);
      // **[2026-09-03] 「読めなかった」を「発生していない」と書かない。**
      //
      // 旧版は fetchRunCost の null を1つの意味として扱い、取得に失敗した回まで
      // 「そもそも発生していない」として**永久除外**に積んでいた。除外は台帳に残り、
      // 二度と取りに行かない。実際、除外6件のうち3件はあとから実費が取れていて
      // （ap-20260826-actions は **success で出荷した回**）、
      // **台帳が「実費は存在しない」と言い続けている run に実費が載っている**状態だった。
      if (cost.state === 'unreadable') {
        // 一時的な失敗。**除外しない。**翌日また試す。
        log.push(`${r.run_id}: ジョブログを読めなかった（${cost.why}）— 実費が無いという意味ではないので除外しない`);
        continue;
      }
      if (cost.state === 'absent') {
        // ログは読めた。実費行が無い ＝ Claude Code ステップに到達せず落ちた回。
        // **0 を書かない**（「無料で動いた」になる）。待っても埋まらないので除外に積む。
        log.push(`${r.run_id}: ログは読めたが実費行が無い（0ではなく、そもそも発生していない）→ 除外に積む`);
        unmeasurable.push(r.run_id);
        continue;
      }
      if (cost.state === 'gone') {
        // **実費はあった。もう取れないだけ。**同じ除外でも理由が違うので、混ぜて書かない。
        log.push(`${r.run_id}: 実費は取得できない（${cost.why}）— **発生していないのではなく、記録が残っていない** → 除外に積む`);
        unmeasurable.push(r.run_id);
        continue;
      }
      const args = ['--append', '--date', r.date_jst, '--route', r.route,
        '--run-id', String(r.external_ref), '--cost', String(cost.usd),
        '--note', '日次アクチュエータが自動追記（ジョブログの result 行。結果は運転台帳で判明した場合のみ）'];
      if (r.outcome) args.push('--outcome', r.outcome);
      if (recorded) args.push('--enrich-missing-metadata');
      if (cost.turns != null) args.push('--turns', String(cost.turns));
      // 種別は**分かるときだけ**書く。推測を入れると種別ごとの枠が静かに嘘になる。
      const kind = costTaskKind(r);
      if (kind) args.push('--task-kind', kind);
      try {
        const out = append(args);
        log.push(`${r.run_id}: ${out.trim()}`);
        if (!out.startsWith('skip')) { changed += 1; costed.add(String(r.external_ref)); }
      } catch (e) {
        log.push(`${r.run_id}: 追記に失敗 ${e.stderr?.toString().trim() ?? e.message}`);
      }
    }
    if (action?.close_check?.params) {
      const cur = new Set(action.close_check.params.exclude ?? []);
      for (const id of unmeasurable) cur.add(id);
      // **除外は取り消せる形にしておく。**あとから実費が載った run が
      // 「実費は存在しない」の一覧に残り続けると、根拠の文が嘘を言い続ける
      // （2026-09-03 の実測で6件中3件がこれだった）。
      const refById = new Map((ctx.runsDoc?.runs ?? []).map((r) => [r.run_id, String(r.external_ref ?? '')]));
      for (const r of candidates) {
        refById.set(r.run_id, String(r.external_ref));
        refById.set(`actions-run-${r.external_ref}`, String(r.external_ref));
      }
      const dropped = [...cur].filter((id) => costed.has(refById.get(id) ?? ''));
      for (const id of dropped) cur.delete(id);
      if (dropped.length > 0) log.push(`除外から外した（実費が台帳にある）: ${dropped.join(', ')}`);
      // **観測手段が無い経路は、除外一覧ではなく件数で出す。**両方に出すと、
      // 同じ run について「実費が残っていない」と「観測手段が無い」を二重に言う。
      const notActions = [...cur].filter((id) => refById.has(id) && !isActionsRunRef(refById.get(id)));
      for (const id of notActions) cur.delete(id);
      if (notActions.length > 0) {
        log.push(`除外から外した（Actions の run ではないので、そもそも数えない）: ${notActions.join(', ')}`);
      }
      action.close_check.params.exclude = [...cur].sort();
    }
    return { ok: true, changed, log: log.join('\n') || '対象なし' };
  },

  /**
   * 封じ込め。上限に達した故障の経路を止める。
   * **止めるのはAIがやってよい（policy.ai_may_stop）。解除はしない。**
   */
  /**
   * 取り残しのうち**台帳だけを触っている追記型**を再投入する。（D3b の手順どおり）
   *
   * 2026-08-28 に手順を4段で書いて「auto はまだ付けない」と決めた。保留の条件は
   * 「まず日次runが実際に内訳を出すのを見る」で、**08-28〜09-02 の7行のうち7行で
   * paths が出ている**（うち3行が ledger_only:true）。前提は満たされたので付ける。
   *
   * 手順は飛ばさない:
   *   1. `ledger_only === true` の行だけ。false と null は人が読む
   *   2. **追記型と状態型を分ける。** runs / cost は run_id で冪等な --append。
   *      status は写しを当てず**台帳から再生成**。actions はこのエンジン自身の
   *      出力なので触らない（古い写しを当てると閉じた行が開き直る）
   *   3. **まず「本当に欠けているか」を見る。**内容が別コミットで着地済みでも
   *      SHAベースの走査は行を立てる（08-28 の実測で4件中3件）
   *   4. 直接 main を触らない。ワークフローが差分をPRにして SEO Validation →
   *      auto-merge に乗せる（このハンドラは作業ツリーに書くだけ）
   *
   * **1行も欠けていなかったとき、このハンドラは何も書かない。**その場合に残って
   * いるのはブランチのSHAだけで、走査（SHAで見る）はそれを取り残しと呼び続ける。
   * 消す手段は `delete-branch.yml`（内容が main と同一のときだけ消す）だが、
   * **この経路には actions:write が無い**ので回せない。log にそう書いて渡す。
   */
  async 'apply-orphan-ledger'(ctx, action) {
    if (!ctx.token || !ctx.repo) return { ok: false, changed: 0, log: '認証情報が無くブランチ側の台帳を読めない' };
    const orphans = ctx.orphans;
    if (!Array.isArray(orphans)) {
      return { ok: false, changed: 0, log: '取り残しの走査が未取得（解消と読ませない）' };
    }
    const branch = action?.close_check?.params?.branch ?? null;
    const o = orphans.find((x) => x.branch === branch);
    if (!o) return { ok: true, changed: 0, log: `${branch ?? '(不明)'} は走査に出てこない（既に解消）` };
    if (o.ledger_only !== true) {
      return { ok: false, changed: 0, log: `${branch} は台帳だけを触っていない（ledger_only=${o.ledger_only}）— 中身を人が読む` };
    }
    const log = [];
    let changed = 0;
    const headers = { authorization: `Bearer ${ctx.token}`, accept: 'application/vnd.github.raw',
      'user-agent': 'simplememo-autopilot-act' };
    const readBranch = async (file) => {
      const url = `https://api.github.com/repos/${ctx.repo}/contents/${file}`
        + `?ref=${encodeURIComponent(branch)}`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return null;
      try { return JSON.parse(await r.text()); } catch { return null; }
    };
    // 包含の証明には**生のテキスト**が要る（散文の前方一致は JSON.parse を通せない）。
    const readBranchText = async (file) => {
      const url = `https://api.github.com/repos/${ctx.repo}/contents/${file}`
        + `?ref=${encodeURIComponent(branch)}`;
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) return null;
        return await r.text();
      } catch { return null; }
    };
    const readMainText = (file) => {
      // アクチュエータは main のチェックアウトで走る。**この作業ツリーが main 側。**
      // 同じ run で先に足された行（reconcile-runs など）も入るが、それらは
      // この行と同じPRで一緒に着地するので、判定が食い違うことはない。
      try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { return null; }
    };

    for (const file of o.paths ?? []) {
      const kind = ORPHAN_APPENDABLE[file];
      if (!kind) {
        // **写さない理由はパスごとに違う。**まとめて「対象外」と書くと、
        // 次に読む人が「なぜ写さないか」を毎回調べ直すことになる。
        const why = file === 'data/autopilot-status.json'
          ? '状態型（現在値を持つ台帳）。古い写しを当てると巻き戻るので、台帳から再生成する'
          : file === 'data/autopilot-actions.json'
            ? 'このエンジン自身の出力。古い写しを当てると閉じた行が開き直る'
            : file === 'docs/obsidian/AUTOPILOT_LOG.md'
              ? '追記型だが散文で、run_id のような冪等な鍵が無い。「欠けているか」を機械が判定できないので人が書く'
              : '追記対象に入れていない台帳';
        log.push(`${file}: 写しを当てない（${why}）`);
        continue;
      }
      const branchDoc = await readBranch(file);
      if (!branchDoc) { log.push(`${file}: ブランチ側を読めず判定不能（欠けていないという意味ではない）`); continue; }
      const mainDoc = kind === 'runs' ? ctx.runsDoc : ctx.costDoc;
      const missing = missingLedgerRows(branchDoc, mainDoc);
      if (missing === null) { log.push(`${file}: ブランチ側に runs が無く判定不能`); continue; }
      if (missing.length === 0) { log.push(`${file}: 欠けている行は無い（内容は着地済み）`); continue; }
      for (const r of missing) {
        const script = kind === 'runs' ? 'scripts/autopilot-runs.mjs' : 'scripts/autopilot-budget.mjs';
        const args = kind === 'runs'
          ? ['--append', '--run-id', String(r.run_id), '--date', String(r.date_jst), '--route', String(r.route),
             '--outcome', String(r.outcome), '--attempted', String(r.attempted ?? true), '--source', 'act-orphan',
             ...(r.external_ref ? ['--external-ref', String(r.external_ref)] : []),
             ...(r.failure_reason ? ['--failure-reason', String(r.failure_reason)] : []),
             ...(r.failure_class ? ['--failure-class', String(r.failure_class)] : []),
             ...(r.pr ? ['--pr', String(r.pr)] : []),
             ...(r.artifact ? ['--artifact', String(r.artifact)] : []),
             ...(r.lane ? ['--lane', String(r.lane)] : []),
             ...(r.action ? ['--action', String(r.action)] : [])]
          : ['--append', '--date', String(r.date_jst), '--route', String(r.route),
             '--run-id', String(r.run_id), '--cost', String(r.total_cost_usd),
             ...(r.num_turns != null ? ['--turns', String(r.num_turns)] : []),
             ...(r.task_kind ? ['--task-kind', String(r.task_kind)] : []),
             ...(r.outcome ? ['--outcome', String(r.outcome)] : []),
             '--note', '取り残しから再投入（autopilot-act の apply-orphan-ledger）'];
        try {
          const out = execFileSync(process.execPath, [path.join(ROOT, script), ...args],
            { cwd: ROOT, encoding: 'utf8' });
          log.push(`${file}: ${r.run_id} を再投入 — ${out.trim()}`);
          changed += 1;
        } catch (e) {
          log.push(`${file}: ${r.run_id} の再投入に失敗 ${e.stderr?.toString().trim() ?? e.message}`);
        }
      }
    }

    // 追記した回だけ status を**台帳から作り直す**（写しは当てない）。
    if (changed > 0) {
      try {
        const out = execFileSync(process.execPath,
          [path.join(ROOT, 'scripts/autopilot-runs.mjs'), '--write-status'], { cwd: ROOT, encoding: 'utf8' });
        log.push(`status を台帳から再生成 — ${out.trim()}`);
      } catch (e) {
        log.push(`status の再生成に失敗 ${e.stderr?.toString().trim() ?? e.message}`);
      }
    } else {
      // **計算した答えを使う。**
      //
      // ここまでで「追記型に欠けている行は無い」ことは分かっている。だが以前は
      // そこで止めて行を open のまま残しており、**その結論を捨てて**オーナーの
      // 待ち行列に積んでいた。2026-09-03 の owner_direct が上げた「6日」は
      // これで開いていた（#660 / 813b335。人が手で照合して、取るものは無かった）。
      //
      // 触った**全パス**について包含を積極的に示せたときだけ受容する。
      // 1つでも示せなければ、今までどおり人へ。**判定不能は示せていない側。**
      const texts = {};
      for (const file of o.paths ?? []) {
        texts[file] = { branch: await readBranchText(file), main: readMainText(file) };
      }
      const proof = proveOrphanLanded(o.paths ?? [], texts);
      for (const line of proof.why) log.push(`照合 ${line}`);
      if (proof.proven) {
        // **受容したSHAを必ず書く。**書かないと merge が開け直す（何を承知したのか
        // 台帳から言えないため）。別のコミットが積まれた日は、ここが食い違って開く。
        action.state = 'acknowledged';
        action.reviewed_orphans = [...(o.commits ?? [])];
        action.closed_jst = null;
        action.evidence = `${ctx.today} に走査が中身を照合した。**再投入するものは無い。**`
          + `取り残し ${(o.commits ?? []).join(', ')} が触った ${(o.paths ?? []).length} ファイルは`
          + `すべて main に着地済み（${proof.why.join(' / ')}）。`
          + `残るのはブランチ ${branch} のSHAだけで、走査はSHAで見るため取り残しと呼び続ける。`
          + 'ブランチの削除は人の領域（authority-matrix の「運転台帳の取り残しの始末」）。';
        log.push(`**1行も欠けていない。**${branch} を acknowledged にした`
          + `（reviewed_orphans: ${(o.commits ?? []).join(', ')}）。`);
      } else {
        log.push(`**1行も欠けていないが、全パスの包含は示せていない。**人へ残す —— `
          + `残っているのはブランチ ${branch} のSHAだけかもしれないが、`
          + '示せていないものを「着地済み」に倒さない。');
      }
    }
    return { ok: true, changed, log: log.join('\n') };
  },

  async contain(_ctx) {
    try {
      const out = execFileSync(process.execPath,
        [path.join(ROOT, 'scripts/autopilot-selfheal.mjs'), '--contain'], { cwd: ROOT, encoding: 'utf8' });
      return { ok: true, changed: 1, log: out.trim() };
    } catch (e) {
      // --contain は「止めた」ときに非ゼロで終わる設計でありうるので、出力は残す
      return { ok: true, changed: 1, log: (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '') };
    }
  },

};

/** Actions の run id かどうか。**CCRのセッションid（cse_…）をここへ投げない。** */
export function isActionsRunRef(ref) {
  return /^\d+$/.test(String(ref ?? ''));
}

const costTaskKind = r => r.lane === 'F' ? 'repair'
  : ['new', 'refresh', 'wiring'].includes(r.action) ? 'article' : null;
const costExcluded = (r, excluded) => excluded.has(r.run_id) || excluded.has(`actions-run-${r.external_ref}`);
const costSyncNeeded = (r, recorded) => !recorded
  || (r.outcome != null && recorded.outcome == null)
  || (costTaskKind(r) != null && recorded.task_kind == null);

/** The workflow reader is scoped to obsidian-autopilot.yml. A completed model
 * step proves a cost candidate, not a shipment or any other result. */
const validCostObservation = observed => /^[1-9]\d*$/.test(String(observed?.id ?? ''))
  && Number.isFinite(Date.parse(observed.created_at))
  && observed.jst_date === jstToday(new Date(observed.created_at))
  && ['success', 'failure', 'cancelled', 'timed_out'].includes(observed.model_conclusion);

export function costCandidates(ctx, pendingRuns = ctx.ledgerDoc?.actions?.find(a => a.id === 'act-cost-sync')
  ?.close_check?.params?.pending_runs ?? []) {
  const byRef = new Map();
  for (const r of ctx.runsDoc?.runs ?? []) {
    if (r.attempted && isActionsRunRef(r.external_ref)) byRef.set(String(r.external_ref), { ...r });
  }
  const observations = [...(Array.isArray(pendingRuns) ? pendingRuns : []), ...(ctx.workflowRuns ?? [])
    .filter(r => r.status === 'completed').map(r => ({ id: r.id, created_at: r.created_at, jst_date: r.jst_date,
      model_conclusion: (r.steps ?? []).find(s => s.name?.includes('Claude Code'))?.conclusion }))];
  for (const observed of observations) {
    if (!validCostObservation(observed)) continue;
    const ref = String(observed.id);
    if (!byRef.has(ref)) byRef.set(ref, {
      run_id: `actions-run-${ref}`, external_ref: ref, date_jst: observed.jst_date,
      route: 'actions', attempted: true, cost_observation: observed,
    });
  }
  return [...byRef.values()].sort((a, b) => String(a.date_jst).localeCompare(String(b.date_jst))
    || String(a.external_ref).localeCompare(String(b.external_ref), 'en', { numeric: true }));
}

/**
 * ジョブログから result 行の total_cost_usd / num_turns を拾う。
 *
 * **返り値で「読めなかった」と「読めたが実費が無い」を分ける。**
 * 旧版はどちらも `null` を返していて、呼び出し側（append-cost）が
 * **両方を「そもそも発生していない」と書いて永久除外に積んでいた。**
 *
 * 実害（2026-09-03 に台帳で確認）: 除外6件のうち **3件は実費が台帳にある** ——
 * `ap-20260826-actions`（run 32900786201・**success で出荷した回**）・
 * `ap-20260830-actions`・`ap-20260831-actions`。一度「実費は存在しない」と
 * 書かれ、あとから同じ run の実費が実際に取れている。**取得の失敗を、
 * 事実の不在として記録していた。**
 * さらに `ap-20260831-ccr0920` の `external_ref` は `cse_…`（CCRのセッションid）で、
 * Actions API は当然 404 を返す。**観測手段が無いだけの回**が「発生していない」に化けていた。
 *
 * - `{ state: 'measured', usd, turns }` … 実費行を読めた
 * - `{ state: 'absent' }`   … ログは読めたが実費行が無い（Claude Code 前に落ちた回）
 * - `{ state: 'gone', why }`     … ログが消えている（410 / run が無い 404）。実費はあったが、もう取れない
 * - `{ state: 'unreadable', why }` … 一時的に読めない。**除外しない**（翌日また試す）
 */
export async function fetchRunCost(repo, token, runId, { fetchImpl = fetch } = {}) {
  if (!isActionsRunRef(runId)) {
    return { state: 'gone', why: `Actions の run id ではない（${runId}）— この経路のログは Actions API から読めない` };
  }
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
    'user-agent': 'simplememo-autopilot-act' };
  let jr;
  try {
    jr = await fetchImpl(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`,
      { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) { return { state: 'unreadable', why: `jobs の取得に失敗: ${String(e).slice(0, 80)}` }; }
  // 404/410 は「もう無い」。それ以外の非200は**一時的**として扱い、除外に積まない。
  if (jr.status === 404 || jr.status === 410) return { state: 'gone', why: `jobs が HTTP ${jr.status}（run ごと消えている）` };
  if (!jr.ok) return { state: 'unreadable', why: `jobs が HTTP ${jr.status}` };
  let job, jobId;
  try { job = primaryJob((await jr.json()).jobs ?? []); jobId = job?.id; }
  catch (e) { return { state: 'unreadable', why: `jobs の応答を読めない: ${String(e).slice(0, 80)}` }; }
  if (!jobId) return { state: 'unreadable', why: '主系のジョブを特定できず実費を読めない' };
  let lr;
  try {
    lr = await fetchImpl(`https://api.github.com/repos/${repo}/actions/jobs/${jobId}/logs`,
      { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  } catch (e) { return { state: 'unreadable', why: `ログの取得に失敗: ${String(e).slice(0, 80)}` }; }
  // **410 Gone = 保持期間を過ぎて消えた。**実費が無かったのではなく、もう読めない。
  if (lr.status === 410 || lr.status === 404) return { state: 'gone', why: `ログが HTTP ${lr.status}（保持期間切れ）` };
  if (!lr.ok) return { state: 'unreadable', why: `ログが HTTP ${lr.status}` };
  let text;
  try { text = await lr.text(); }
  catch (e) { return { state: 'unreadable', why: `ログ本文を読めない: ${String(e).slice(0, 80)}` }; }
  const cost = text.match(/"total_cost_usd"\s*:\s*([0-9.]+)/)
    ?? text.match(/AI実費:\s*\*\*\$([0-9.]+)\*\*/);
  if (!cost) {
    const model = (job.steps ?? []).find(s => s.name?.includes('Claude Code'));
    // Cancellation or a lost result line can follow real model consumption.
    // Only a confirmed skipped model step proves that this run did not reach it.
    return model?.conclusion === 'skipped' ? { state: 'absent' }
      : { state: 'unreadable', why: '実費行が無いがモデル未着手は確認できない。0円・不存在として除外しない' };
  }
  if (!Number.isFinite(Number(cost[1]))) return { state: 'unreadable', why: '実費行の金額が不正' };
  const turns = text.match(/"num_turns"\s*:\s*(\d+)/);
  return { state: 'measured', usd: Number(cost[1]), turns: turns ? Number(turns[1]) : null };
}

// ============================================================
// 台帳の検査（CI）
// ============================================================
export function validateLedger(ledger, matrix) {
  const p = [];
  if (!ledger || !Array.isArray(ledger.actions)) return ['actions must be an array'];
  const seen = new Set();
  const mayModify = new Set(matrix.self_repair?.may_modify ?? []);
  ledger.actions.forEach((a, i) => {
    const at = `actions[${i}]${a.id ? ` (${a.id})` : ''}`;
    if (!a.id) p.push(`${at}: id is required`);
    else if (seen.has(a.id)) p.push(`${at}: duplicate id`);
    else seen.add(a.id);
    if (!STATES.includes(a.state)) p.push(`${at}: state must be one of ${STATES.join('|')}`);
    if (a.pending_pr && (a.state !== 'open' || a.source !== 'orphan'
      || a.close_check?.kind !== 'branch_caught_up'
      || !pendingPrCoversOrphan({ pending_pr: a.pending_pr, head_sha: a.pending_pr.head_sha,
        branch: a.close_check?.params?.branch }))) p.push(`${at}: invalid pending PR receipt`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.created_jst || '')) p.push(`${at}: created_jst must be YYYY-MM-DD`);
    // **書き間違えた期日は、その行を黙って永久に鳴らなくする。**形だけは機械が見る。
    if (a.not_before_jst != null && !/^\d{4}-\d{2}-\d{2}$/.test(a.not_before_jst)) {
      p.push(`${at}: not_before_jst must be YYYY-MM-DD（着手できる日。期日待ちを滞留と数えないための欄）`);
    }
    if (!a.title) p.push(`${at}: title is required`);
    if (!a.close_check?.kind) p.push(`${at}: close_check.kind is required — 閉じ条件の無い依頼は永久に残る`);
    else if (!CLOSE_CHECKS[a.close_check.kind]) p.push(`${at}: 未知の close_check: ${a.close_check.kind}`);
    if (a.close_check?.kind === 'cost_covers_runs' && a.close_check.params?.pending_runs !== undefined
      && (!Array.isArray(a.close_check.params.pending_runs) || !a.close_check.params.pending_runs.every(validCostObservation))) {
      p.push(`${at}: pending cost runs must contain valid observed model execution`);
    }
    if (a.state === 'done' && !a.closed_jst) p.push(`${at}: done なのに closed_jst が無い`);
    if (a.state === 'done' && !a.evidence) p.push(`${at}: done なのに evidence が無い — 「閉じた」は根拠とセットでしか書けない`);
    if (a.auto && !HANDLERS[a.auto]) p.push(`${at}: 未知の handler: ${a.auto}`);
    // **自動実行するなら、触る対象が自己修復の範囲に収まっていること。**
    // ここを検査しないと、権限の拡大が台帳の1行で起きる。
    if (a.auto && a.state === 'open') {
      const outside = (a.touches ?? []).filter((f) => !mayModify.has(f));
      if (outside.length > 0 && !a.force_owner) {
        p.push(`${at}: auto=${a.auto} だが self_repair.may_modify の外を触る: ${outside.join(', ')}`);
      }
      // **無人で push できない対象に handler を付けない。**付いていると
      // 「自動で直る」と読めるのに、実際は毎回 push で落ちて何も進まない。
      // 気づくのが適用の直前になるのが最悪で、2026-08-25 はそれで1日を使った。
      const blocked = unattendedCannotPush(a.touches, matrix);
      if (blocked.length > 0 && !a.force_owner) {
        p.push(`${at}: auto=${a.auto} だが無人では push できない対象を触る: ${blocked.join(', ')} — auto を外し、副系セッションが適用する形にする（self_repair.unattended_cannot_push）`);
      }
    }
  });
  return p;
}

// ============================================================
// 表示
// ============================================================
function render(sum, applied, today) {
  const L = [];
  L.push(`日次アクチュエータ — ${today} (JST)`);
  L.push('');
  L.push(`未処理 ${sum.open_total}件（人 ${sum.human.length} / AI ${sum.ai.length}）`
    + ` · 本日クローズ ${sum.closed_today.length}件 · 既知の制約 ${sum.acknowledged}件`);
  if (sum.oldest_open_days >= 7) L.push(`  ⚠ 最古の未処理が ${sum.oldest_open_days}日前から開いている`);
  if (sum.human.length > 0) {
    L.push('', '■ 人がやること（AIの権限外）');
    for (const a of sum.human) {
      L.push(`  [${a.age_days}日] ${a.title}`);
      L.push(`        なぜ人か: ${a.owner_why}`);
      if (a.evidence) L.push(`        現状: ${a.evidence}`);
    }
  }
  if (sum.ai.length > 0) {
    L.push('', '■ AIがやること');
    for (const a of sum.ai) {
      L.push(`  [${a.age_days}日] ${a.title}${a.auto ? `  (自動: ${a.auto})` : '  (セッションが実装)'}`);
      if (a.evidence) L.push(`        現状: ${a.evidence}`);
    }
  }
  if (sum.pending_pr?.length) {
    L.push('', '■ PR待ち（再投入せず検証・マージを追跡）');
    for (const a of sum.pending_pr) L.push(`  ${a.title}\n        ${a.evidence}`);
  }
  if (applied?.length) {
    L.push('', '■ 今回このスクリプトが実行したこと');
    for (const r of applied) {
      L.push(`  ${r.handler} — ${r.ok ? `変更 ${r.changed}件` : '実行できず'}`);
      for (const line of String(r.log).split('\n').filter(Boolean)) L.push(`        ${line}`);
    }
  }
  if (sum.closed_today.length > 0) {
    L.push('', '■ 本日クローズ（閉じ条件が通ったもの）');
    for (const a of sum.closed_today) L.push(`  ${a.title}\n        根拠: ${a.evidence}`);
  }
  if (sum.open_total === 0 && !sum.pending_pr?.length) L.push('', '未処理なし。');
  return L.join('\n');
}

// ============================================================
// 自己検査 — 判定ロジックそのものを台帳無しで検証する
// ============================================================
async function selftest() {
  const fails = [];
  // 件数は数える。**リテラルで書かない** —— 検査を足しても数字が動かないと、
  // 「32項目通った」が事実でなくなる（実際 54 項目あるのに 32 と出ていた）。
  let count = 0;
  const t = (name, cond) => { count += 1; if (!cond) fails.push(name); };
  // Existing fixtures model closed PR history. Add an explicit empty open-PR
  // response; dedicated cases below exercise pending PRs through the real reader.
  const fetchOrphansWithoutOpen = (repo, token, today, options = {}) => fetchOrphanedCommits(repo, token, today, {
    ...options, fetchImpl: async (url, init) => url.includes('/pulls?state=open&')
      ? { ok: true, json: async () => [] } : (options.fetchImpl ?? fetch)(url, init),
  });
  {
    const sha = 'c'.repeat(40), old = 'a'.repeat(40), branch = 'claude/reused';
    const pending = { number: 924, state: 'open', draft: false,
      head: { ref: branch, sha, repo: { full_name: 'o/r' } }, base: { ref: 'main', repo: { full_name: 'o/r' } } };
    const fixture = ({ prs = [pending], freshPr, refSha = sha, openError = false, refError = false,
      compareStatus = null, refStatus = null,
      pageTwo = false, endless = false } = {}) => async url => {
      const data = value => ({ ok: true, json: async () => value });
      if (url.includes('/pulls?state=closed')) return data([{ number: 895, merged_at: '2026-09-05T02:00:00Z',
        head: { ref: branch, sha: old }, base: { ref: 'main' } }]);
      if (url.includes('/pulls?state=open')) {
        if (openError) throw new Error('HTTP 503');
        if (endless || (pageTwo && url.endsWith('page=1'))) return data(Array.from({ length: 100 }, () => ({ state: 'open', head: { ref: 'other' } })));
        return data(prs);
      }
      if (url.includes('/git/ref/heads/')) {
        if (refError) throw new Error('HTTP 403');
        if (refStatus) return { ok: false, status: refStatus };
        return data({ ref: `refs/heads/${branch}`, object: { type: 'commit', sha: refSha } });
      }
      if (url.endsWith('/pulls/924')) return data(freshPr ?? prs[0]);
      if (url.includes('/compare/')) return compareStatus ? { ok: false, status: compareStatus } : data({ commits: [{ sha }] });
      if (url.includes('/commits/')) return data({ files: [{ filename: 'data/autopilot-runs.json' }] });
      throw new Error('Unexpected fixture request');
    };
    const scan = options => fetchOrphanedCommits('o/r', 'tok', '2026-09-05', { fetchImpl: fixture(options) });
    const covered = await scan();
    t('open PR must cover the actual current branch head', pendingPrCoversOrphan(covered[0]));
    t('live PR work is derived as stable waiting work without a handler', derive({ orphans: covered })[0].title.includes('反映待ち')
      && derive({ orphans: covered })[0].auto === null);
    const closure = CLOSE_CHECKS.branch_caught_up({ branch }, { orphans: covered });
    t('pending PR is not closed as delivered', closure.closed === false && closure.pending_pr.number === 924 && closure.evidence.includes('main反映・出荷は未確認'));
    t('legacy orphan PR identity also finds the pending successor', CLOSE_CHECKS.branch_caught_up({ pr: 895 }, { orphans: covered }).pending_pr.number === 924);
    t('an open PR on a subsequent page is still found', pendingPrCoversOrphan((await scan({ pageTwo: true }))[0]));
    t('draft PR work remains intentionally pending rather than orphaned', pendingPrCoversOrphan((await scan({ prs: [{ ...pending, draft: true }] }))[0]));
    t('refreshing an old list entry observes the updated PR head', pendingPrCoversOrphan((await scan({ prs: [{ ...pending, head: { ...pending.head, sha: old } }], freshPr: pending }))[0]));
    for (const options of [{ prs: [] }, { refSha: 'd'.repeat(40) },
      { prs: [{ ...pending, state: 'closed' }] }, { prs: [{ ...pending, head: { ...pending.head, ref: 'other' } }] },
      { prs: [{ ...pending, head: { ...pending.head, repo: { full_name: 'someone/fork' } } }] },
      { prs: [{ ...pending, base: { ...pending.base, ref: 'development' } }] },
      { prs: [{ ...pending, base: { ...pending.base, repo: { full_name: 'someone/fork' } } }] }]) {
      const result = await scan(options);
      t('an unrelated, closed or outdated PR does not suppress the orphan', !derive({ orphans: result })[0].title.includes('反映待ち'));
      t('absence of exact pending coverage cannot close an orphan', !CLOSE_CHECKS.branch_caught_up({ branch }, { orphans: result }).closed);
    }
    t('a PR closed after listing does not suppress the orphan', !pendingPrCoversOrphan((await scan({ freshPr: { ...pending, state: 'closed' } }))[0]));
    for (const options of [{ openError: true }, { refError: true }, { endless: true }]) {
      const result = await scan(options);
      t('incomplete open PR evidence remains unknown, not resolved', result === null
        && !CLOSE_CHECKS.branch_caught_up({ branch }, { orphans: result }).closed);
    }
    for (const options of [{ compareStatus: 503 }, { compareStatus: 404 }, { compareStatus: 404, refStatus: 503 }]) {
      const result = await scan(options);
      t('a failed comparison is not proof of a deleted branch', result === null && !CLOSE_CHECKS.branch_caught_up({ branch }, { orphans: result }).closed);
    }
    t('independently confirmed branch deletion releases the orphan', (await scan({ compareStatus: 404, refStatus: 404 })).length === 0);
    const ledger = { actions: [] };
    merge(ledger, derive({ orphans: covered }), '2026-09-05');
    reconcile(ledger, { orphans: covered, today: '2026-09-05' });
    const before = JSON.stringify(ledger);
    const advanced = structuredClone(covered);
    advanced[0].head_sha = 'd'.repeat(40); advanced[0].pending_pr.head_sha = 'd'.repeat(40);
    merge(ledger, derive({ orphans: advanced }), '2026-09-05');
    reconcile(ledger, { orphans: advanced, today: '2026-09-05' });
    t('repeated pending observations do not rewrite a self-referential orphan', JSON.stringify(ledger) === before);
    const sum = summarize(ledger, {}, '2026-09-05');
    t('pending PR is visible separately and does not ask for duplicate work', sum.pending_pr.length === 1 && sum.open_total === 0 && sum.human.length === 0 && sum.ai.length === 0);
    t('pending work keeps its observation window open beyond seven days', orphanWatchSince(ledger) === '2026-09-04');
    t('a typed pending receipt passes ledger validation', validateLedger(ledger, { self_repair: { may_modify: [] } }).length === 0);
    const invalid = structuredClone(ledger); invalid.actions[0].pending_pr.head_sha = 'unknown';
    t('an invalid waiting receipt cannot silently suppress work', validateLedger(invalid, { self_repair: { may_modify: [] } }).some(p => p.includes('invalid pending PR receipt')));
    let replayed = 0;
    const staleHandler = structuredClone(ledger); staleHandler.actions[0].auto = 'apply-orphan-ledger';
    staleHandler.actions[0].touches = ['data/autopilot-runs.json'];
    await applyLedgerCycle(staleHandler, { today: '2026-09-05', orphans: covered }, {
      today: '2026-09-05', matrix: { self_repair: { may_modify: ['data/autopilot-runs.json'] } }, eligibility: {}, judgements: { judgements: [] },
      refresh: () => {}, recordJudgements: () => {},
      judgeCandidate: a => ({ candidate_id: a.id, judged_jst: '2026-09-05', halted: false, reasons: [] }),
      handlers: { 'apply-orphan-ledger': () => { replayed++; return { ok: true, changed: 0 }; } },
    });
    t('a pending PR never executes a stale replay handler', replayed === 0);
    const unknown = structuredClone(ledger);
    reconcile(unknown, { orphans: null, today: '2026-09-05' });
    t('unknown evidence preserves the pending watch without claiming delivery', unknown.actions[0].state === 'open'
      && unknown.actions[0].pending_pr.head_sha === sha && orphanWatchSince(unknown) === '2026-09-04');
    const delivered = structuredClone(ledger);
    reconcile(delivered, { orphans: [], today: '2026-09-06' });
    t('actual landing closes the pending work and releases its watch window', delivered.actions[0].state === 'done' && !delivered.actions[0].pending_pr && orphanWatchSince(delivered) === null);
    const reopened = derive({ orphans: await scan({ prs: [] }) });
    merge(ledger, reopened, '2026-09-05');
    reconcile(ledger, { orphans: await scan({ prs: [] }), today: '2026-09-05' });
    t('closing a PR without merging restores the remaining orphan', ledger.actions[0].state === 'open' && !ledger.actions[0].pending_pr);
  }
  {
    const make = (verdict, output = 'failure') => ({ status: 'completed', conclusion: output === 'success' ? 'success' : 'failure',
      steps: [{ name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'success' },
        { name: '成果物の実行IDを照合', conclusion: output },
        ...(verdict === null ? [] : [{ name: `成果物判定: ${verdict}`, conclusion: 'success' }])] });
    for (const verdict of ['unknown', null, '']) {
      const result = interpretRun(make(verdict));
      t('unverified output remains a triageable failure, not zero output', result.outcome === 'failed'
        && result.failure_class === null && result.needs_triage === true && result.failure_reason.includes('ゼロとは断定しない'));
    }
    t('confirmed missing current-run output is no_artifact', interpretRun(make('missing')).outcome === 'no_artifact');
    t('PR receipt alone cannot bypass the existing shipping ledger', interpretRun(make('verified', 'success')).needs_pr === true);
    t('a failed verifier cannot claim a verified output', interpretRun(make('verified')).needs_triage === true);
  }

  {
    const observed_at = '2026-09-05T08:00:00Z', now = Date.parse(observed_at);
    const row = { id: 'trig_test', name: 'Example', enabled: true, cron_expression: '0 7 * * *',
      last_fired_at: '2026-09-05T07:00:00Z', last_run_fired_at: '2026-09-05T07:00:00Z',
      last_run_finished_at: '2026-09-05T07:01:00Z', last_run_session_id: 'cse_failed',
      last_run_status: 'FAILED', next_run_at: '2026-09-06T07:00:00Z' };
    const doc = { observed_at, max_snapshot_age_days: 3, routines: [row], intentional_stops: [],
      open_budget: 1, open_findings: [{ id: row.id, what: 'failed', found_at: '2026-09-05', why: 'Observed failure' }],
      observation: { method: 'GET', endpoint: '/v1/code/triggers', include_last_run: true, has_more: false, pages: 1 } };
    const get = d => derive({ routineDoc: d, now, today: '2026-09-05' }).filter(a => a.source === 'routine-run');
    const action = get(doc)[0];
    const consumed = { routine_snapshot_sha256: routineSnapshotDigest(doc) };
    t('first observation needs intake when no receipt exists', routineIntakeNeeded(doc, {}));
    t('same observation does not restart intake after its publication', !routineIntakeNeeded(structuredClone(doc), consumed));
    t('a new observation wakes intake', routineIntakeNeeded({ ...doc, observed_at: '2026-09-05T08:01:00Z' }, consumed));
    t('changed facts at the same timestamp also wake intake', routineIntakeNeeded({ ...doc, open_budget: 2 }, consumed));
    {
      const branch = 'claude/autopilot-act-20260905', head = 'c'.repeat(40);
      const pr = { number: 924, state: 'open', head: { ref: branch, sha: head, repo: { full_name: 'o/r' } },
        base: { ref: 'main', repo: { full_name: 'o/r' } } };
      const fixture = ({ prs = [pr], first = pr, fresh = pr, input = doc, receipt = consumed,
        refSha = head, broken = '', partial = false } = {}) => {
        let reads = 0;
        return async endpoint => {
          if (broken && endpoint.includes(broken)) throw Error('read failure');
          if (endpoint.startsWith('/pulls?')) return partial ? Array(100).fill(pr) : prs;
          if (endpoint === '/pulls/924') return ++reads === 1 ? first : fresh;
          if (endpoint.startsWith('/git/ref/')) return { ref: `refs/heads/${branch}`, object: { type: 'commit', sha: refSha } };
          if (endpoint.startsWith('/contents/')) return { type: 'file', encoding: 'base64',
            content: Buffer.from(JSON.stringify(endpoint.includes('/data/routine-runs.json') ? input : receipt)).toString('base64') };
          throw Error('unexpected fixture endpoint');
        };
      };
      const decide = options => routineIntakeDecision(doc, {}, { repo: 'o/r', day: '2026-09-05', get: fixture(options) });
      const waiting = await decide();
      t('matching pending input and receipt let CI finish without another Act run', waiting.needed === false
        && waiting.reason === 'waiting_for_pr' && waiting.pr === 924 && waiting.production_verified === false);
      t('main receipt requires no PR read', (await routineIntakeDecision(doc, consumed, { get: () => { throw Error('must not read'); } })).reason === 'consumed_on_main');
      t('an updated PR list head is refreshed before reading its receipt', (await decide({ prs: [{ ...pr, head: { ...pr.head, sha: 'a'.repeat(40) } }] })).needed === false);
      for (const options of [{ prs: [] }, { receipt: {} }, { input: { ...doc, open_budget: 2 } },
        { receipt: { routine_snapshot_sha256: routineSnapshotDigest({ ...doc, open_budget: 2 }) } },
        { first: { ...pr, number: 925 } }, { fresh: { ...pr, number: 925 } },
        { first: { ...pr, state: 'closed' } }, { fresh: { ...pr, state: 'closed' } },
        { first: { ...pr, base: { ...pr.base, ref: 'other' } } },
        { first: { ...pr, head: { ...pr.head, repo: { full_name: 'fork/r' } } } }])
        t('missing, different or closed pending work does not suppress new intake', (await decide(options)).needed === true);
      for (const options of [{ broken: '/pulls?' }, { broken: '/contents/' }, { broken: '/git/ref/' },
        { partial: true }, { prs: [pr, pr] }, { refSha: 'a'.repeat(40) },
        { fresh: { ...pr, head: { ...pr.head, sha: 'a'.repeat(40) } } }]) {
        const result = await decide(options);
        t('unknown pending receipt cannot declare an observation consumed', result.needed === true && result.reason === 'pending_receipt_unverified');
      }
    }

    t('routine finding is actually wired into derive', get(doc).length === 1);
    t('routine intake has no control handler or owner notification', action.auto === null
      && classify(action, { self_repair: { may_modify: [] } }).owner === 'ai');
    const ledger = { actions: [] };
    merge(ledger, get(doc), '2026-09-05');
    merge(ledger, get(doc), '2026-09-05');
    t('repeated observations do not duplicate routine tasks', ledger.actions.length === 1);
    reconcile(ledger, { routineDoc: doc, now, today: '2026-09-05' });
    t('an open finding cannot close from fresh observation alone', ledger.actions[0].state === 'open');
    ledger.actions[0].state = 'acknowledged';
    merge(ledger, get(doc), '2026-09-05');
    t('acknowledged execution stays acknowledged', ledger.actions[0].state === 'acknowledged');
    const nextFault = structuredClone(doc);
    nextFault.routines[0].last_run_fired_at = '2026-09-05T07:30:00Z';
    nextFault.routines[0].last_run_session_id = 'cse_different';
    merge(ledger, get(nextFault), '2026-09-05');
    t('another execution reopens the existing investigation', ledger.actions[0].state === 'open' && ledger.actions.length === 1);
    const unfired = structuredClone(doc);
    Object.assign(unfired.routines[0], { last_fired_at: null, last_run_status: null,
      last_run_fired_at: null, last_run_finished_at: null, last_run_session_id: null });
    Object.assign(unfired.open_findings[0], { what: 'never_ran', tracked_due_at: '2026-09-05T10:00:00Z' });
    t('first opportunity in the future is not an incident', get(unfired).length === 0);
    unfired.open_findings[0].tracked_due_at = '2026-09-05T02:00:00Z';
    t('existing six hour grace includes its boundary', get(unfired).length === 0);
    unfired.open_findings[0].tracked_due_at = '2026-09-05T01:59:59Z';
    t('advanced next_run cannot hide a missed tracked deadline', get(unfired).length === 1);
    delete unfired.open_findings[0].tracked_due_at;
    t('unknown first deadline requests investigation instead of assuming healthy', get(unfired).length === 1);
    const pending = structuredClone(doc);
    Object.assign(pending.routines[0], { last_run_status: 'PENDING', last_run_finished_at: null });
    pending.open_findings[0].what = 'pending';
    const pendingAction = get(pending)[0];
    t('pending is routed as unknown, not failure', pendingAction.title.includes('実行結果を確認') && pendingAction.close_check.params.what === 'pending');
    const badSnapshots = [null, { ...doc, observed_at: '2026-09-06T00:00:00Z' },
      { ...doc, observed_at: '2026-09-01T00:00:00Z' }, { ...doc, routines: [] },
      { ...doc, observation: { ...doc.observation, has_more: true } },
      { ...doc, observation: { ...doc.observation, pages: 0 } },
      { ...doc, observation: { ...doc.observation, endpoint: '/other' } }];
    for (const bad of badSnapshots) {
      t('invalid/stale/incomplete snapshots cannot close a routine task',
        !routineResolved(action.close_check.params, { routineDoc: bad, now }).closed);
    }
    const complete = reconcileObservation(pending, { observed_at, pages: 1, complete: true,
      records: [{ ...row, last_run_status: 'SUCCEEDED', last_run_finished_at: '2026-09-05T07:59:00Z' }] });
    const resolved = d => CLOSE_CHECKS.routine_resolved(pendingAction.close_check.params, { routineDoc: d, now }).closed;
    t('same pending session can close using real observer completion', resolved(complete));
    t('completion of a different session cannot close the pending target',
      !routineResolved({ ...pendingAction.close_check.params, session_id: 'cse_other_pending' }, { routineDoc: complete, now }).closed);
    t('failed execution cannot be rewritten successful with the same fire',
      !routineResolved(action.close_check.params, { routineDoc: complete, now }).closed);
    for (const edit of [d => { d.closed_findings = []; }, d => { d.routines = []; },
      d => { d.closed_findings[0].closed_at = '2026-09-05T07:59:00Z'; },
      d => { d.closed_findings[0].evidence.last_run_session_id = 'cse_wrong'; },
      d => { d.closed_findings[0].evidence.last_run_finished_at = null; },
      d => { d.closed_findings[0].evidence.last_run_finished_at = '2026-09-05T08:01:00Z'; },
      d => { d.closed_findings[0].evidence.last_run_finished_at = '2026-09-05T06:59:00Z'; }]) {
      const bad = structuredClone(complete); edit(bad);
      t('missing, stale, mismatched or invalid closure evidence stays open', !resolved(bad));
    }
    const recovery = reconcileObservation(doc, { observed_at, pages: 1, complete: true,
      records: [{ ...row, last_run_status: 'SUCCEEDED', last_run_fired_at: '2026-09-05T07:30:00Z',
        last_run_finished_at: '2026-09-05T07:59:00Z', last_run_session_id: 'cse_new' }] });
    t('a later successful execution closes the prior failure investigation',
      routineResolved(action.close_check.params, { routineDoc: recovery, now }).closed);
    const stopped = structuredClone(doc);
    stopped.routines[0].enabled = false; stopped.open_findings = []; stopped.open_budget = 0;
    stopped.intentional_stops = [{ id: row.id, why: 'Replaced by another approved routine' }];
    const retired = routineResolved(action.close_check.params, { routineDoc: stopped, now });
    t('verified intentional stop closes without claiming recovery', retired.closed && retired.evidence.includes('復旧成功ではない'));
    t('intentional stops are not routed for reactivation', get(stopped).length === 0);
    const oneShot = structuredClone(pending);
    Object.assign(oneShot.routines[0], { enabled: false, ended_reason: 'run_once_fired', run_once_at: row.last_fired_at, cron_expression: '' });
    const onceAction = get(oneShot)[0];
    const onceDone = reconcileObservation(oneShot, { observed_at, pages: 1, complete: true,
      records: [{ ...oneShot.routines[0], last_run_status: 'SUCCEEDED', last_run_finished_at: '2026-09-05T07:59:00Z' }] });
    onceDone.observation.ended_since_previous = [];
    t('archived single-shot completion remains verifiable after the next snapshot',
      routineResolved(onceAction.close_check.params, { routineDoc: onceDone, now }).closed);
    const tracked = reconcileObservation(unfired, { observed_at, pages: 1, complete: true, records: unfired.routines });
    const anchor = tracked.open_findings[0].tracked_due_at;
    const shifted = reconcileObservation(tracked, { observed_at, pages: 1, complete: true,
      records: [{ ...unfired.routines[0], next_run_at: '2026-09-07T07:00:00Z' }] });
    t('observer preserves the original tracked deadline across next_run shifts', shifted.open_findings[0].tracked_due_at === anchor);
    const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/autopilot-act.yml'), 'utf8');
    t('routine snapshot push wakes Act on main', /push:\s*\n\s*branches: \[main\]\s*\n\s*paths: \['data\/routine-runs.json'\]/.test(workflow));
    for (const prefix of ['日次アクチュエータの同期（', 'chore(autopilot): 日次アクチュエータの同期（'])
      t('Act excludes its own snapshot publication from push wakeups', workflow.includes(`!startsWith(github.event.head_commit.message, '${prefix}')`));
    t('auto-merge completion is wired despite suppressed push events', workflow.includes('"Cron Health", "Auto-merge Claude PRs"'));
    t('Act requires the successful intake gate and handles skipped regular events',
      workflow.includes('needs: routine-intake') && workflow.includes('always() && !cancelled() &&')
      && workflow.includes("(needs.routine-intake.result == 'skipped' || needs.routine-intake.outputs.needed == 'true')"));
    t('emitted report records the snapshot actually consumed', fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
      .includes('routine_snapshot_sha256: routineSnapshotDigest(ctx.routineDoc)'));
    const { tmpdir } = await import('node:os');
    const scratch = fs.mkdtempSync(path.join(tmpdir(), 'routine-intake-'));
    try {
      fs.mkdirSync(path.join(scratch, 'data'));
      fs.symlinkSync(path.join(ROOT, 'scripts'), path.join(scratch, 'scripts'), 'dir');
      const step = workflow.split('      - name: Check whether routine observation reached intake\n')[1]?.split('\n  act:\n')[0];
      const shell = step?.split('        run: |\n')[1]?.split('\n').map(line => line.replace(/^          /, '')).join('\n');
      t('actual read-only workflow intake step exists', typeof shell === 'string');
      const output = path.join(scratch, 'output');
      fs.writeFileSync(path.join(scratch, 'data/routine-runs.json'), JSON.stringify(doc));
      for (const [conclusion, report, expected] of [['success', {}, true], ['success', consumed, false], ['failure', {}, false]]) {
        fs.writeFileSync(output, '');
        fs.writeFileSync(path.join(scratch, 'data/autopilot-actions-report.json'), JSON.stringify(report));
        execFileSync('bash', ['-e', '-c', shell], { cwd: scratch,
          env: { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '', GITHUB_REPOSITORY: '', GITHUB_OUTPUT: output, UPSTREAM_CONCLUSION: conclusion }, stdio: 'pipe' });
        t('actual workflow emits the correct intake decision', fs.readFileSync(output, 'utf8') === `needed=${expected}\n`);
      }
      const preload = path.join(scratch, 'pending-fixture.mjs');
      fs.writeFileSync(preload, `
        const doc = ${JSON.stringify(doc)}, receipt = ${JSON.stringify(consumed)};
        const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0,10).replaceAll('-','');
        const branch = 'claude/autopilot-act-' + day, head = 'c'.repeat(40);
        const pr = {number:924,state:'open',head:{ref:branch,sha:head,repo:{full_name:'o/r'}},base:{ref:'main',repo:{full_name:'o/r'}}};
        globalThis.fetch = async url => {
          if (process.env.SIMPLEMEMO_TEST_INTAKE === 'broken') return {ok:false,status:503};
          let data;
          if (url.includes('/pulls?')) data = [pr];
          else if (url.endsWith('/pulls/924')) data = pr;
          else if (url.includes('/git/ref/')) data = {ref:'refs/heads/'+branch,object:{type:'commit',sha:head}};
          else if (url.includes('/contents/')) data = {type:'file',encoding:'base64',content:Buffer.from(JSON.stringify(
            url.includes('/data/routine-runs.json') ? doc : process.env.SIMPLEMEMO_TEST_INTAKE === 'stale' ? {} : receipt)).toString('base64')};
          else throw Error('Unexpected fixture URL');
          return {ok:true,json:async()=>data};
        };`);
      for (const [mode, expected] of [['pending', false], ['stale', true], ['broken', true]]) {
        fs.writeFileSync(output, '');
        fs.writeFileSync(path.join(scratch, 'data/autopilot-actions-report.json'), '{}');
        execFileSync('bash', ['-e', '-c', shell], { cwd: scratch, stdio: 'pipe', env: { ...process.env,
          NODE_OPTIONS: '--import=' + preload, GH_TOKEN: 'fixture', GITHUB_REPOSITORY: 'o/r',
          GITHUB_OUTPUT: output, UPSTREAM_CONCLUSION: 'success', SIMPLEMEMO_TEST_INTAKE: mode } });
        t('actual workflow consults the pending receipt and preserves unknown work', fs.readFileSync(output, 'utf8') === `needed=${expected}\n`);
      }
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  }
  const observedRun = { id: 123, status: 'completed', conclusion: 'failure', event: 'schedule',
    created_at: '2026-09-04T00:00:00Z', jst_date: '2026-09-04',
    steps: [{ number: 3, name: 'Claude Code', conclusion: 'failure', started_at: '2026-09-04T00:01:00Z', completed_at: '2026-09-04T00:02:00Z' },
      { number: 9, name: 'Final check', conclusion: 'failure', completed_at: '2026-09-04T00:04:00Z' }] };
  const detectedNow = new Date('2026-09-04T00:05:00Z');
  const detection = detectionEvidence(observedRun, 'workflow_run', detectedNow);
  t('最初の失敗ステップの確定時刻を保存する', detection.failed_at === '2026-09-04T00:02:00Z');
  t('検知と故障の時刻は別に記録する', detection.detected_at === detectedNow.toISOString());
  for (const event of ['schedule', 'workflow_run', 'workflow_dispatch', undefined]) {
    t(`検知の起動元を区別する: ${event}`, detectionEvidence(observedRun, event, detectedNow).source
      === (['schedule', 'workflow_run'].includes(event) ? 'act-reconcile' : 'act-reconcile-session'));
  }
  for (const change of [{ steps: null }, { status: 'in_progress' }, { conclusion: 'success' },
    { created_at: 'invalid' }, { steps: [{ conclusion: 'failure', completed_at: 'invalid' }] },
    { steps: [{ conclusion: 'failure', completed_at: '2026-09-04T00:06:00Z' }] },
    { steps: [{ conclusion: 'failure', completed_at: '2026-09-03T00:06:00Z' }] }]) {
    t('未知・未来・実行前の時刻を故障時刻にしない', detectionEvidence({ ...observedRun, ...change }, 'schedule', detectedNow).failed_at === null);
  }
  for (const eventName of ['schedule', 'workflow_dispatch']) {
    let appended;
    await HANDLERS['reconcile-runs']({ workflowRuns: [observedRun], runsDoc: { runs: [] }, eventName }, null,
      { append: (args) => { appended = args; return 'recorded'; } });
    const value = flag => appended?.[appended.indexOf(flag) + 1];
    t(`同期ハンドラから故障時刻をappendへ渡す: ${eventName}`, value('--failed-at') === '2026-09-04T00:02:00Z');
    t(`同期ハンドラから検知の起動元をappendへ渡す: ${eventName}`, value('--source')
      === (eventName === 'schedule' ? 'act-reconcile' : 'act-reconcile-session'));
  }
  for (const eventName of ['repository_dispatch', 'workflow_run', 'schedule']) for (const automatic of [true, false]) {
    let appended;
    const completion = { upstream_run_id: '123', automatic };
    await HANDLERS['reconcile-runs']({ workflowRuns: [observedRun], runsDoc: { runs: [] },
      eventName, completion }, null,
    { append: args => { appended = args; return 'recorded'; } });
    t(`完了通知の検証結果を実際のappendへ渡す: ${automatic}`, appended[appended.indexOf('--source') + 1]
      === (automatic ? 'act-reconcile' : 'act-reconcile-session'));
    t('通知元の監査証跡を残す', appended[appended.indexOf('--detected-note') + 1].includes('監視起動元run 123'));
  }
  {
    const appended = [];
    const later = { ...observedRun, id: 124, created_at: '2026-09-04T00:10:00Z' };
    await HANDLERS['reconcile-runs']({ workflowRuns: [later, observedRun, later], runsDoc: { runs: [] },
      eventName: 'workflow_dispatch' }, null, { append: args => { appended.push(args); return 'recorded'; } });
    const values = flag => appended.map(args => args[args.indexOf(flag) + 1]);
    t('同日の最初の実行へ基本run_idを割り当てる', JSON.stringify(values('--external-ref')) === JSON.stringify(['123', '124']));
    t('1バッチ内の追記でも同日IDを衝突させない', JSON.stringify(values('--run-id')) === JSON.stringify(['ap-20260904-actions', 'ap-20260904-actions-124']));
  }
  const matrix = {
    self_repair: {
      // 実ファイル（data/authority-matrix.json）の may_modify から、ここで要る分だけ写した検体。
      // **実ファイルとの一致は --check（validateLedger）が実データで見る。**
      // 自己テストは台帳を読まない決まりなので、ここは形の検体にとどめる。
      may_modify: ['data/autopilot-runs.json', 'data/autopilot-cost.json',
        'data/autopilot-status.json', '.github/workflows/obsidian-autopilot.yml'],
      unattended_cannot_push: {
        paths: ['.github/workflows/obsidian-autopilot.yml'],
        who_applies: '副系CCRセッション',
      },
      stop_after_failed_repairs: 3,
    },
    domains: [{ domain: '承認が要る領域', requires_approval: true }],
  };

  // A real failure needed two manual Act invocations on 2026-09-05: the first
  // recorded the run, but append-cost was only derived after execution ended.
  for (const scenario of ['new', 'existing-cost-action', 'unreadable', 'halted']) {
    const store = { runs: [], costs: [] };
    if (scenario === 'existing-cost-action') store.runs.push({ run_id: 'old', external_ref: '99',
      attempted: true, route: 'actions', date_jst: '2026-09-03', outcome: 'failed' });
    const ledger = { actions: [] };
    const ctx = { today: '2026-09-04', workflowRuns: [observedRun], eventName: 'workflow_dispatch',
      completion: { automatic: false }, selfheal: { targets: [] }, budget: null,
      runsDoc: { runs: structuredClone(store.runs) }, costDoc: { runs: [] }, ledgerDoc: ledger };
    merge(ledger, derive(ctx), ctx.today);
    const order = [], recorded = [], judgements = { judgements: [] };
    const result = await applyLedgerCycle(ledger, ctx, { today: ctx.today, matrix, eligibility: {}, judgements,
      judgeCandidate: a => ({ candidate_id: a.id, judged_jst: ctx.today,
        halted: scenario === 'halted' && a.auto === 'append-cost', reasons: ['fixture'] }),
      recordJudgements: d => recorded.push(...d.judgements.map(j => j.candidate_id)),
      refresh: current => {
        current.runsDoc = { runs: structuredClone(store.runs) };
        current.costDoc = { runs: structuredClone(store.costs) };
      },
      handlers: {
        'reconcile-runs': (current, action) => HANDLERS['reconcile-runs'](current, action, { append: args => {
          t(`runの記録前に適格性を残す: ${scenario}`, recorded.includes(action.id));
          const val = flag => args[args.indexOf(flag) + 1];
          store.runs.push({ run_id: val('--run-id'), external_ref: val('--external-ref'),
            date_jst: val('--date'), route: val('--route'), attempted: val('--attempted') === 'true', outcome: val('--outcome') });
          order.push('run'); return 'written';
        } }),
        'append-cost': async (current, action) => {
          t(`実費の記録前に適格性を残す: ${scenario}`, recorded.includes(action.id));
          t(`同じ監視で新規runを実費処理へ渡す: ${scenario}`, current.runsDoc.runs.some(r => r.external_ref === '123'));
          order.push('cost');
          if (scenario === 'unreadable') return { ok: false, changed: 0, log: 'unreadable' };
          store.costs = current.runsDoc.runs.map(r => ({ run_id: r.external_ref, usd: 4.8768404, outcome: r.outcome }));
          return { ok: true, changed: store.costs.length, log: 'measured fixture' };
        },
      },
    });
    const blocked = ['unreadable', 'halted'].includes(scenario);
    t(`run処理を再実行しない: ${scenario}`, order.filter(x => x === 'run').length === 1);
    t(`実費処理は最後に1回だけ: ${scenario}`, order.join(',') === (scenario === 'halted' ? 'run' : 'run,cost'));
    t(`不明・停止を0円や完了にしない: ${scenario}`,
      ledger.actions.find(a => a.id === 'act-cost-sync')?.state === (blocked ? 'open' : 'done')
      && (blocked ? store.costs.length === 0 : store.costs.some(r => r.run_id === '123' && r.usd > 0)));
    t(`実行結果を一度だけ報告する: ${scenario}`, result.length === 2);
  }

  // 権限の導出
  t('自動実行は may_modify 内なら ai',
    classify({ auto: 'reconcile-runs', touches: ['data/autopilot-runs.json'] }, matrix).owner === 'ai');
  t('自動実行が may_modify 外なら human',
    classify({ auto: 'reconcile-runs', touches: ['fastlane/Fastfile'] }, matrix).owner === 'human');
  t('自動実行の対象不明は human', classify({ auto: 'reconcile-runs', touches: [] }, matrix).owner === 'human');
  t('force_owner は最優先',
    classify({ auto: 'reconcile-runs', touches: ['data/autopilot-runs.json'], force_owner: 'human' }, matrix).owner === 'human');
  t('承認が要る領域は human', classify({ touches: ['x'], domain: '承認が要る領域' }, matrix).owner === 'human');
  t('リポジトリ外は human', classify({ touches: ['x'], outside_repo: true }, matrix).owner === 'human');
  // **may_modify はレーンFの境界であって、セッションの境界ではない。**
  // ここを取り違えたことが「自分で直せたものをオーナー依頼に積む」誤りの原因。
  t('セッション実装は may_modify 外でも ai',
    classify({ touches: ['.github/workflows/seo-check.yml'] }, matrix).owner === 'ai');

  // **『直してよい』と『直せる』のずれ。**may_modify を通っても主系は
  // .github/workflows/* を push できない（GH_PAT に workflow scope が無い）。
  // 2026-08-25、レーンFは修理を書き上げてから適用の直前でこれにぶつかった。
  {
    const wf = { auto: 'reconcile-runs', touches: ['.github/workflows/obsidian-autopilot.yml'] };
    const c = classify(wf, matrix);
    t('push できない対象は無人実行に回らない', c.unattended_blocked === true);
    t('push できなくても owner は ai のまま（人の仕事ではない）', c.owner === 'ai');
    t('誰が適用するかが why に出る', /副系CCRセッション/.test(c.why));
    t('push できる対象は従来どおり無人実行',
      classify({ auto: 'reconcile-runs', touches: ['data/autopilot-runs.json'] }, matrix).unattended_blocked !== true);
    t('unattendedCannotPush は該当パスだけ返す',
      unattendedCannotPush(['data/autopilot-runs.json', '.github/workflows/obsidian-autopilot.yml'], matrix).length === 1);
    const probs = validateLedger({ actions: [{
      id: 'x', state: 'open', created_jst: '2026-08-26', title: 't',
      close_check: { kind: 'manual' }, auto: 'reconcile-runs',
      touches: ['.github/workflows/obsidian-autopilot.yml'],
    }] }, matrix);
    t('台帳検査が auto+push不可を落とす', probs.some((m) => /無人では push できない対象/.test(m)));

    // **期日待ちを滞留と数えないための欄。**書き間違えるとその行が黙って
    // 永久に鳴らなくなるので、形だけは機械が見る。
    const nb = (value) => validateLedger({ actions: [{
      id: 'x', state: 'open', created_jst: '2026-09-03', title: 't',
      close_check: { kind: 'manual' }, not_before_jst: value,
    }] }, matrix).filter((m) => /not_before_jst/.test(m));
    t('着手できる日は YYYY-MM-DD だけ受ける', nb('2026-09-17').length === 0);
    t('**書き間違えた期日は落とす**（黙って永久に鳴らなくなるのを防ぐ）',
      nb('9/17').length === 1 && nb('いつか').length === 1);
    t('欄が無い行はこれまでどおり通る', nb(undefined).length === 0 && nb(null).length === 0);
  }

  // 閉じ条件: 失敗が無いだけでは閉じない（走っていない可能性を潰す）
  const noRun = CLOSE_CHECKS.no_failure_since(
    { route: 'actions', failure_class: 'auth_or_credential', since: '2026-08-25' },
    { runsDoc: { runs: [] } });
  t('Issue の状態が取れなければ閉じない',
    CLOSE_CHECKS.issue_closed({ issue: 7 }, {}).closed === false);
  t('**判定不能を回復と読まない**',
    /判定不能/.test(CLOSE_CHECKS.issue_closed({ issue: 7 }, {}).evidence));
  t('open な Issue では閉じない',
    CLOSE_CHECKS.issue_closed({ issue: 7 }, { issues: new Map([[7, { number: 7, state: 'open' }]]) }).closed === false);
  t('open 一覧から消えただけでは閉じない',
    CLOSE_CHECKS.issue_closed({ issue: 7 }, { issues: new Map([[9, {}]]) }).closed === false);
  t('issue 番号が無ければ閉じない',
    CLOSE_CHECKS.issue_closed({}, { issues: new Map() }).closed === false);
  // --- 取り残しコミットの検知（走査そのもの） ---
  //
  // **2026-08-26 に3件目の実データで崩れた形を、そのまま検査にしてある。**
  // マージ時 head との差だけを見ると、後続PRで着地済みのコミットまで取り残しになる。
  {
    const mk = (shas) => ({ commits: shas.map((sha) => ({ sha })) });
    const routes = {
      // PR #593 の実形: マージ後6件先 / うち main に無いのは 1件だけ
      'compare/AAA...br': mk(['c1', 'c2', 'c3', 'c4', 'c5', 'orphan1']),
      'compare/main...br': mk(['orphan1']),
    };
    const fakeFetch = async (url) => {
      const key = Object.keys(routes).find((k) => url.includes(k.replace('compare/', 'compare/')));
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => ([{
          number: 593, merged_at: '2026-08-26T04:15:00Z',
          head: { sha: 'AAA', ref: 'br' }, base: { ref: 'main' },
        }]) };
      }
      return { ok: true, json: async () => routes[key] };
    };
    const found = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch });
    t('**後続PRで着地済みのコミットを取り残しに数えない**',
      found.length === 1 && found[0].ahead_by === 1 && found[0].commits[0] === 'orphan1');
    t('着地済みの件数を別に持つ（なぜ除いたかが読める）', found[0].landed_elsewhere === 5);
    t('**内訳が取れなければ paths は null**（false と混ぜない）',
      found[0].paths === null && found[0].ledger_only === null);
  }
  // [2026-08-28] **触ったパスの内訳。**無いと拾う側が毎回 git show --stat を叩く。
  {
    const mkOrphanFetch = (filesBySha) => async (url) => {
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => ([{
          number: 700, merged_at: '2026-08-28T04:00:00Z',
          head: { sha: 'AAA', ref: 'br' }, base: { ref: 'main' },
        }]) };
      }
      const m = url.match(/\/commits\/([^/?]+)$/);
      if (m) {
        const files = filesBySha[m[1]];
        if (files === undefined) throw new Error('404');
        return { ok: true, json: async () => ({ files: files.map((filename) => ({ filename })) }) };
      }
      if (url.includes('compare/AAA...br')) {
        return { ok: true, json: async () => ({ commits: [{ sha: 'o1' }, { sha: 'o2' }] }) };
      }
      return { ok: true, json: async () => ({ commits: [{ sha: 'o1' }, { sha: 'o2' }] }) };
    };
    const ledger = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-28', {
      fetchImpl: mkOrphanFetch({
        o1: ['data/autopilot-runs.json', 'docs/obsidian/AUTOPILOT_LOG.md'],
        o2: ['data/autopilot-status.json'],
      }),
    });
    t('**触ったパスを重複なく並べて持つ**',
      ledger[0].paths.join(',')
        === 'data/autopilot-runs.json,data/autopilot-status.json,docs/obsidian/AUTOPILOT_LOG.md');
    t('**運転台帳だけなら ledger_only: true**', ledger[0].ledger_only === true);

    const mixed = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-28', {
      fetchImpl: mkOrphanFetch({
        o1: ['data/autopilot-runs.json'],
        o2: ['blog/new-article.html'],
      }),
    });
    t('**台帳の外を1つでも触っていれば false**（書きかけを台帳扱いしない）',
      mixed[0].ledger_only === false);

    const partial = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-28', {
      fetchImpl: mkOrphanFetch({ o1: ['data/autopilot-runs.json'] }), // o2 は 404
    });
    t('**1コミットでも読めなければ全体を null**（部分的な一覧を「台帳だけ」と読ませない）',
      partial[0].paths === null && partial[0].ledger_only === null);

    t('空の一覧は判定しない（true にしない）', classifyOrphanPaths([]) === null);
    t('配列でなければ判定しない', classifyOrphanPaths(undefined) === null);
    t('**上限を超えたら断定しない**',
      classifyOrphanPaths(null) === null
      && ORPHAN_MAX_COMMIT_READS > 0);
  }
  {
    // 全部 main に着地している＝取り残しゼロ。**行を立てない。**
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => ([{
          number: 547, merged_at: '2026-08-26T04:15:00Z',
          head: { sha: 'AAA', ref: 'br' }, base: { ref: 'main' },
        }]) };
      }
      const after = url.includes('AAA...');
      return { ok: true, json: async () => ({ commits: after ? [] : [{ sha: 'pre1' }] }) };
    };
    const found = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch });
    t('マージ後に push が無ければ取り残しゼロ', found.length === 0);
  }
  {
    // **2026-08-28 の実データの形。**1本のブランチを5つのPRで使い回しており、
    // PR単位で行を立てると同じ取り残し（fb12596）が5行になる。
    const mk = (shas) => ({ commits: shas.map((sha) => ({ sha })) });
    const routes = {
      // 古いマージ #642 から見ると9件先（見ないほうの窓）
      'compare/A642...ki8vgo': mk(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'fb12596']),
      // 最後のマージ #648 から見ると3件先
      'compare/A648...ki8vgo': mk(['c7', 'c8', 'fb12596']),
      'compare/main...ki8vgo': mk(['fb12596']),
    };
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => ([
          { number: 648, merged_at: '2026-08-26T01:00:00Z', head: { sha: 'A648', ref: 'ki8vgo' }, base: { ref: 'main' } },
          { number: 642, merged_at: '2026-08-25T01:00:00Z', head: { sha: 'A642', ref: 'ki8vgo' }, base: { ref: 'main' } },
        ]) };
      }
      return { ok: true, json: async () => routes[Object.keys(routes).find((k) => url.includes(k))] };
    };
    const found = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch });
    t('**同じブランチの複数PRを1件に畳む**（08-28 は9行＝3判断で出た）', found.length === 1);
    t('畳んでも取り残しの中身は変わらない',
      found[0].ahead_by === 1 && found[0].commits.join() === 'fb12596');
    t('どのPRから来たかを全部残す', found[0].prs.join() === '642,648');
    t('代表は**最後にマージされたPR**（マージ時 head もそこから）',
      found[0].pr === 648 && found[0].merged_sha === 'A648');
    t('着地済みは最新マージの①から数える', found[0].landed_elsewhere === 2);
  }
  {
    // **畳むときに和を取ってはいけない。**2026-08-28 の実データの形をそのまま置く
    // （claude/obsidian-memo-automation-tqsd8z・PR #688〜#717）。squash マージでは
    // 着地済みのコミットも②に残るので、和を取ると 1件が 21件に化ける。
    const mk = (shas) => ({ commits: shas.map((sha) => ({ sha })) });
    const routes = {
      // 古いマージ以降＝squash 済みが大量に見える
      'compare/B700...br2': mk(['landed1', 'landed2', 'landed3', 'orphanB']),
      // 最新マージ以降＝main の squash コミットと、まだ着地していない1件
      'compare/B701...br2': mk(['onmain1', 'orphanB']),
      // ②は「sha が main に無い」しか言わない（着地済みの3件もここに残る）
      'compare/main...br2': mk(['landed1', 'landed2', 'landed3', 'orphanB']),
    };
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => ([
          { number: 701, merged_at: '2026-08-26T01:00:00Z', head: { sha: 'B701', ref: 'br2' }, base: { ref: 'main' } },
          { number: 700, merged_at: '2026-08-24T01:00:00Z', head: { sha: 'B700', ref: 'br2' }, base: { ref: 'main' } },
        ]) };
      }
      return { ok: true, json: async () => routes[Object.keys(routes).find((k) => url.includes(k))] };
    };
    const found = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch });
    t('**squash 済みを取り残しに数えない**（和なら4件と誤報していた）',
      found.length === 1 && found[0].ahead_by === 1 && found[0].commits.join() === 'orphanB');
    t('答えは**最新マージPRの積**（古いPRの結果は使わない）',
      found[0].pr === 701 && found[0].merged_sha === 'B701');
    t('着地済みの件数も最新マージから数える', found[0].landed_elsewhere === 1);
  }
  {
    // **最新マージで解消していればゼロ件。**古いPRの結果が居座らないこと。
    const mk = (shas) => ({ commits: shas.map((sha) => ({ sha })) });
    const routes = {
      'compare/C1...br3': mk(['gone1']),
      'compare/C2...br3': mk([]),
      'compare/main...br3': mk(['gone1']),
    };
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => ([
          { number: 811, merged_at: '2026-08-26T01:00:00Z', head: { sha: 'C2', ref: 'br3' }, base: { ref: 'main' } },
          { number: 810, merged_at: '2026-08-24T01:00:00Z', head: { sha: 'C1', ref: 'br3' }, base: { ref: 'main' } },
        ]) };
      }
      return { ok: true, json: async () => routes[Object.keys(routes).find((k) => url.includes(k))] };
    };
    t('**後のマージが拾っていれば行を立てない**（古いPRの結果を残さない）',
      (await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch })).length === 0);
  }
  {
    // **一覧は7日窓を覆うまで辿る。**2026-08-28、1本のブランチから25本が
    // マージされて1ページ（30件）を埋め、**取り残しが残っている別の2本が
    // 一覧から溢れた。**溢れた行は「走査に出てこない＝解消」で閉じる。
    const mk = (shas) => ({ commits: shas.map((sha) => ({ sha })) });
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      number: 1000 + i, merged_at: '2026-08-26T01:00:00Z', updated_at: '2026-08-26T01:00:00Z',
      head: { sha: 'NOISY', ref: 'noisy' }, base: { ref: 'main' },
    }));
    const page2 = [{
      number: 660, merged_at: '2026-08-25T01:00:00Z', updated_at: '2026-08-25T01:00:00Z',
      head: { sha: 'QUIET', ref: 'quiet' }, base: { ref: 'main' },
    }];
    const routes = {
      'compare/NOISY...noisy': mk([]),
      'compare/main...noisy': mk([]),
      'compare/QUIET...quiet': mk(['813b335']),
      'compare/main...quiet': mk(['813b335']),
    };
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) {
        const p2 = url.includes('page=2');
        return { ok: true, json: async () => (p2 ? page2 : page1) };
      }
      return { ok: true, json: async () => routes[Object.keys(routes).find((k) => url.includes(k))] };
    };
    const found = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-28', { fetchImpl: fakeFetch });
    t('**1ページ目に収まらないブランチを取りこぼさない**',
      found.length === 1 && found[0].branch === 'quiet' && found[0].commits.join() === '813b335');
  }
  {
    // **窓を覆えなかったら null。**途中までの一覧を返すと、載らなかった
    // ブランチが解消と読まれて閉じる（空配列を返さないのと同じ理由）。
    const full = Array.from({ length: 100 }, (_, i) => ({
      number: 2000 + i, merged_at: '2026-08-28T01:00:00Z', updated_at: '2026-08-28T01:00:00Z',
      head: { sha: 'X', ref: 'x' }, base: { ref: 'main' },
    }));
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) return { ok: true, json: async () => full };
      return { ok: true, json: async () => ({ commits: [] }) };
    };
    t('**窓を覆えなかったら null（途中までを返さない）**',
      await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-28', { fetchImpl: fakeFetch }) === null);
  }
  {
    // **取得に失敗したら null。**空配列だと「取り残しは無い」になる
    const boom = async () => { throw new Error('network'); };
    t('**走査に失敗したら null（空配列にしない）**',
      await fetchOrphansWithoutOpen('o/r', 'tok', '2026-08-26', { fetchImpl: boom }) === null);
    t('トークンが無ければ null', await fetchOrphansWithoutOpen('o/r', null, '2026-08-26') === null);
  }
  {
    // **窓から落ちた取り残しを「解消」にしない。**
    // 実測（2026-09-03）: PR #660 は merged_at 2026-08-27T00:32:47Z。既定の7日窓だと
    // 09-04 の since は 08-28T00:00Z なので落ちる。落ちれば走査に載らず、
    // branch_caught_up は「走査に出てこない＝解消」で **嘘の evidence を書いて閉じる。**
    const pr660 = [{
      number: 660, merged_at: '2026-08-27T00:32:47Z', updated_at: '2026-08-27T00:32:47Z',
      head: { sha: 'c51306e', ref: 'claude/obsidian-auto-20260827' }, base: { ref: 'main' },
    }];
    const mk = (shas) => ({ commits: shas.map((sha) => ({ sha })) });
    const fakeFetch = async (url) => {
      if (url.includes('/pulls?')) {
        return { ok: true, json: async () => (url.includes('page=1') ? pr660 : []) };
      }
      if (url.includes('/commits/')) return { ok: true, json: async () => ({ files: [] }) };
      return { ok: true, json: async () => mk(['813b335']) };
    };
    const dropped = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-09-04', { fetchImpl: fakeFetch });
    t('既定の窓では 09-04 に落ちる（これが嘘の閉じ方の原因だった）', dropped.length === 0);
    const watched = await fetchOrphansWithoutOpen('o/r', 'tok', '2026-09-04',
      { fetchImpl: fakeFetch, watchSince: '2026-08-26' });
    t('**開いている行がある間は窓を広げて拾い続ける**',
      watched.length === 1 && watched[0].branch === 'claude/obsidian-auto-20260827');

    // 窓を広げても「載っていない＝解消」の読み方自体は変えない
    t('広げた窓で拾えた行は閉じない',
      CLOSE_CHECKS.branch_caught_up({ pr: 660 }, { orphans: watched }).closed === false);

    const led = { actions: [
      { id: 'a', state: 'open', created_jst: '2026-08-27',
        close_check: { kind: 'branch_caught_up', params: { branch: 'b1' } } },
      { id: 'b', state: 'acknowledged', created_jst: '2026-08-20',
        close_check: { kind: 'branch_caught_up', params: { branch: 'b2' } } },
      { id: 'c', state: 'done', created_jst: '2026-01-01',
        close_check: { kind: 'branch_caught_up', params: { branch: 'b3' } } },
    ] };
    t('窓は最古の未解決行まで広がる（1日の余裕つき）', orphanWatchSince(led) === '2026-08-19');
    t('**受容した行も窓に入れる**（積み増しに気づくには載り続ける必要がある）',
      orphanWatchSince({ actions: [led.actions[1]] }) === '2026-08-19');
    t('閉じた行では窓を広げない', orphanWatchSince({ actions: [led.actions[2]] }) === null);
    t('対象が無ければ null（既定の7日窓のまま）', orphanWatchSince({ actions: [] }) === null);
  }

  // --- 取り残しコミットの検知 ---
  t('走査が取れなければ閉じない',
    CLOSE_CHECKS.branch_caught_up({ pr: 586 }, {}).closed === false);
  t('**走査の取得失敗を解消と読まない**',
    /判定不能/.test(CLOSE_CHECKS.branch_caught_up({ pr: 586 }, {}).evidence));
  t('まだ先にあれば閉じない',
    CLOSE_CHECKS.branch_caught_up({ pr: 586 }, { orphans: [{ pr: 586, ahead_by: 1 }] }).closed === false);
  t('走査に出てこなければ閉じる',
    CLOSE_CHECKS.branch_caught_up({ pr: 586 }, { orphans: [] }).closed === true);
  t('**空配列と未取得を区別する**（[] は「取り残し無し」）',
    CLOSE_CHECKS.branch_caught_up({ pr: 586 }, { orphans: [] }).closed === true
    && CLOSE_CHECKS.branch_caught_up({ pr: 586 }, { orphans: null }).closed === false);
  // ブランチ単位で引く（新しい行）
  t('ブランチ名で引ける',
    CLOSE_CHECKS.branch_caught_up({ branch: 'claude/x' }, { orphans: [{ branch: 'claude/x', ahead_by: 2 }] }).closed === false);
  t('ブランチが走査に出てこなければ閉じる',
    CLOSE_CHECKS.branch_caught_up({ branch: 'claude/x' }, { orphans: [{ branch: 'claude/y', ahead_by: 1 }] }).closed === true);
  t('ブランチ名もPR番号も無ければ閉じない',
    CLOSE_CHECKS.branch_caught_up({}, { orphans: [] }).closed === false);
  // **畳む前に立った行（params が {pr}）を、畳んだ後の走査でも引けること。**
  // ここが抜けると、未解決のまま「解消」と書いて閉じる —— 閉じる方向の誤り。
  t('**旧い {pr} の行を、畳んだ後の走査でも解消と読まない**',
    CLOSE_CHECKS.branch_caught_up({ pr: 642 },
      { orphans: [{ pr: 648, prs: [642, 643, 648], branch: 'claude/x', ahead_by: 1 }] }).closed === false);
  t('旧い {pr} の行も、本当に解消すれば閉じる',
    CLOSE_CHECKS.branch_caught_up({ pr: 642 }, { orphans: [] }).closed === true);
  {
    const o = derive({ orphans: [{ pr: 586, prs: [586], branch: 'claude/x', merged_sha: 'abcdef1234', ahead_by: 1, commits: ['ee4e37c'] }] })
      .filter((a) => a.source === 'orphan');
    t('取り残しから行が立つ', o.length === 1 && o[0].id === 'act-orphaned-branch-claude-x');
    t('**取り残しに auto を付けない**（中身を見ずに cherry-pick しない）', o[0].auto === null);
    t('取り残しの行に閉じ条件がある', o[0].close_check?.kind === 'branch_caught_up');
    t('閉じ条件はブランチで引く', o[0].close_check?.params?.branch === 'claude/x');
    t('走査が未取得なら行を立てない', derive({ orphans: null }).filter((a) => a.source === 'orphan').length === 0);
  }
  {
    // **行IDはブランチ由来なので、PRが何本あっても1行。**
    const o = derive({ orphans: [{
      pr: 648, prs: [642, 643, 644, 647, 648], branch: 'claude/simplememo-self-improving-pr-ki8vgo',
      merged_sha: '26c0014aa', ahead_by: 1, landed_elsewhere: 8, commits: ['fb12596'],
    }] }).filter((a) => a.source === 'orphan');
    t('使い回されたブランチでも行は1本', o.length === 1);
    t('題は「PR #N のマージ後」ではなくブランチを主語にする', /^ブランチ claude\//.test(o[0].title));
    t('**PRの一覧を detail に残す**（どのマージから来たかを追える）',
      /#642 #643 #644 #647 #648/.test(o[0].detail));
    t('畳んだことを明示する', /PRの数だけあるわけではない/.test(o[0].detail));
  }
  {
    // --- 副系の写しの鮮度（D6b）---
    // **CIが赤くなる前に積む。**上限に達してから積むと、積んだ日には既に赤い。
    const doc = (observed) => ({ routineDoc: { observed_at: observed, max_snapshot_age_days: 3 }, today: '2026-09-04' });
    const rows = (observed) => derive(doc(observed)).filter((a) => a.id === 'act-routine-snapshot-stale');
    t('上限の1日前で積む（2日経過・上限3日）', rows('2026-09-02T00:00:00+09:00').length === 1);
    t('**まだ余裕があるうちは積まない**（1日経過）', rows('2026-09-03T00:00:00+09:00').length === 0);
    t('上限を越えていればもちろん積む（4日経過）', rows('2026-08-31T00:00:00+09:00').length === 1);
    // **t は真偽値を取る。**ここに () => {...} を渡すと関数は常に truthy で、
    // **この検査は決して落ちない。**一度そう書いた（2026-09-01）。
    const closeCheck = rows('2026-09-02T00:00:00+09:00')[0].close_check;
    t('**鮮度で閉じる**（--check ではない。取り直しても別の理由で赤いことがある）',
      closeCheck.kind === 'script_ok' && closeCheck.params.args.includes('--snapshot-fresh'));
    t('取り直す手順が detail に入っている（CIからは叩けないので人手に渡す）',
      /list_triggers/.test(rows('2026-09-02T00:00:00+09:00')[0].detail)
      && /--sync/.test(rows('2026-09-02T00:00:00+09:00')[0].detail));
    t('**上限を緩めて閉じるなと書いてある**',
      /上限を緩めて閉じない/.test(rows('2026-09-02T00:00:00+09:00')[0].detail));
    t('写しが読めなければ積まない（観測が無いことを故障にしない）',
      derive({ routineDoc: null, today: '2026-09-04' }).filter((a) => a.id === 'act-routine-snapshot-stale').length === 0);
    t('**上限が数でなければ積まない**（正が無いときこの規則を発火させない）',
      derive({ routineDoc: { observed_at: '2026-08-01T00:00:00Z', max_snapshot_age_days: 'たくさん' }, today: '2026-09-04' })
        .filter((a) => a.id === 'act-routine-snapshot-stale').length === 0);
  }
  {
    // **再発したら開け直す。**IDが固定の行（act-ledger-sync 等）は、これが無いと
    // 一度閉じたきり二度と立たない —— 2026-08-26 に閉じた act-ledger-sync が
    // 08-29〜08-31 の取りこぼしで再点火せず、日次アクチュエータが自分を止めた。
    const led = { actions: [{
      id: 'act-ledger-sync', title: '旧', detail: '旧', source: 'ledger', state: 'done',
      created_jst: '2026-08-20', last_seen_jst: '2026-08-26', closed_jst: '2026-08-26',
      evidence: '解消した', close_check: { kind: 'ledger_covers_runs', params: {} },
    }] };
    const again = [{ id: 'act-ledger-sync', title: '新', detail: '新', source: 'ledger',
      close_check: { kind: 'ledger_covers_runs', params: {} } }];
    const added = merge(led, again, '2026-09-01');
    const row = led.actions[0];
    t('**閉じた行は、再発したら開け直す**', row.state === 'open' && row.closed_jst === null);
    t('行を増やさずに開け直す', led.actions.length === 1 && added.length === 0);
    t('**経過日数は再発から数える**（古い created_jst を引き継がない）',
      row.created_jst === '2026-09-01' && row.reopened_jst === '2026-09-01');
    t('開け直したら前回の根拠を残さない（次の突き合わせで書き直る）', row.evidence === null);
    t('開け直した行は中身も追従する', row.title === '新');
    // **acknowledged は開け直さない**（既知の制約は条件が立ち続けるのが前提）
    const ack = { actions: [{
      id: 'act-x', title: '旧', detail: '旧', source: 'ledger', state: 'acknowledged',
      created_jst: '2026-08-20', last_seen_jst: '2026-08-26', closed_jst: null,
      close_check: { kind: 'manual', params: {} },
    }] };
    merge(ack, [{ id: 'act-x', title: '新', detail: '新', source: 'ledger',
      close_check: { kind: 'manual', params: {} } }], '2026-09-01');
    t('**既知の制約（acknowledged）は開け直さない**', ack.actions[0].state === 'acknowledged');

    // **取り残しの受容だけは、受容したSHAに紐づく。**
    // ブランチへの白紙委任にすると、一度受容したブランチは以後どんな取り残しを
    // 積まれても鳴らない（受容が消音になる）。
    const mkAck = (reviewed) => ({ actions: [{
      id: 'act-orphaned-branch-claude-x', title: '旧', detail: '旧', source: 'orphan',
      state: 'acknowledged', created_jst: '2026-08-27', last_seen_jst: '2026-08-27',
      closed_jst: null, reviewed_orphans: reviewed,
      close_check: { kind: 'branch_caught_up', params: { branch: 'claude/x' } },
    }] });
    const derived = (commits) => derive({ orphans: [{
      pr: 660, prs: [660], branch: 'claude/x', merged_sha: 'abcdef1234',
      ahead_by: commits.length, commits, paths: ['data/autopilot-runs.json'], ledger_only: true,
    }] }).filter((a) => a.source === 'orphan');

    const same = mkAck(['813b335']);
    merge(same, derived(['813b335']), '2026-09-10');
    t('照合済みのSHAだけなら受容のまま', same.actions[0].state === 'acknowledged');

    const grew = mkAck(['813b335']);
    merge(grew, derived(['813b335', 'cafe123']), '2026-09-10');
    t('**受容したブランチに別のコミットが積まれたら開け直す**',
      grew.actions[0].state === 'open' && grew.actions[0].created_jst === '2026-09-10');

    const blank = mkAck(undefined);
    merge(blank, derived(['813b335']), '2026-09-10');
    t('照合したSHAを書いていない受容は開け直す（承知した範囲を言えない）',
      blank.actions[0].state === 'open');
  }
  {
    // **旧ID（PR単位）の行があれば、そこへ流して行を増やさない。**
    // 増やすと「畳むための変更で1行増える」ことになる。
    const ledger = { actions: [{
      id: 'act-orphaned-pr-660', title: '旧', detail: '旧', source: 'orphan', state: 'open',
      created_jst: '2026-08-27', last_seen_jst: '2026-08-27', closed_jst: null,
      close_check: { kind: 'branch_caught_up', params: { pr: 660 } },
    }] };
    const d = derive({ orphans: [{
      pr: 660, prs: [660], branch: 'claude/obsidian-auto-20260827',
      merged_sha: 'c51306ea', ahead_by: 1, commits: ['813b335'],
    }] }).filter((a) => a.source === 'orphan');
    const added = merge(ledger, d, '2026-08-28');
    t('**旧IDの行があれば新IDで増やさない**', ledger.actions.length === 1 && added.length === 0);
    t('旧IDの行の中身は新しい書き方に追従する', /^ブランチ claude\//.test(ledger.actions[0].title));
    t('旧IDの行を閉じない（閉じるのは閉じ条件だけ）', ledger.actions[0].state === 'open');
    // 旧IDが**無い**ブランチはふつうに新IDで立つ
    const fresh = { actions: [] };
    merge(fresh, d, '2026-08-28');
    t('旧IDが無ければブランチ単位のIDで立つ',
      fresh.actions.length === 1 && fresh.actions[0].id === 'act-orphaned-branch-claude-obsidian-auto-20260827');
  }
  {
    // ブランチ名を均した結果が衝突したら**分ける。**黙って1行に畳むと、
    // 別々の取り残しが片方の閉じ条件で消える。
    const o = derive({ orphans: [
      { pr: 1, prs: [1], branch: 'claude/a-b', merged_sha: 'aaaaaaa', ahead_by: 1, commits: ['x1'] },
      { pr: 2, prs: [2], branch: 'claude/a/b', merged_sha: 'bbbbbbb', ahead_by: 1, commits: ['x2'] },
    ] }).filter((a) => a.source === 'orphan');
    t('**slug が衝突しても行を潰さない**', o.length === 2 && o[0].id !== o[1].id);
  }
  t('着手ゼロでは閉じない', noRun.closed === false);
  const recovered = CLOSE_CHECKS.no_failure_since(
    { route: 'actions', failure_class: 'auth_or_credential', since: '2026-08-25' },
    { runsDoc: { runs: [{ route: 'actions', date_jst: '2026-08-26', attempted: true, outcome: 'shipped' }] } });
  t('着手して再発が無ければ閉じる', recovered.closed === true);

  // 閉じ条件: 起票の根拠になった失敗日そのものは再発に数えない（数えると永久に閉じない）
  const sameDay = CLOSE_CHECKS.no_failure_since(
    { route: 'actions', failure_class: 'auth_or_credential', since: '2026-08-25' },
    { runsDoc: { runs: [
      { route: 'actions', date_jst: '2026-08-25', attempted: true, outcome: 'failed', failure_class: 'auth_or_credential' },
      { route: 'actions', date_jst: '2026-08-26', attempted: true, outcome: 'shipped' }] } });
  t('起票日の失敗は再発に数えない', sameDay.closed === true);

  // 閉じ条件: 実費は「上限内か」ではなく「載っているか」で判定する
  t('実費未記録なら閉じない', CLOSE_CHECKS.cost_covers_runs({}, {
    costDoc: { runs: [] },
    runsDoc: { runs: [{ run_id: 'a', attempted: true, external_ref: '1' }] } }).closed === false);
  t('実費が揃えば閉じる', CLOSE_CHECKS.cost_covers_runs({}, {
    costDoc: { runs: [{ run_id: '1' }] },
    runsDoc: { runs: [{ run_id: 'a', attempted: true, external_ref: '1' }] } }).closed === true);
  t('実費台帳が無ければ判定不能', CLOSE_CHECKS.cost_covers_runs({}, { runsDoc: { runs: [] } }).closed === false);

  // 閉じ条件: 節約策は「変えた」ではなく「安くなった実測」で閉じる
  const red = (runs) => CLOSE_CHECKS.cost_reduced(
    { task_kind: 'article', since: '2026-08-25', target: 4 }, { costDoc: { runs } });
  t('走っていなければ閉じない',
    red([{ task_kind: 'article', date_jst: '2026-08-25', total_cost_usd: 0.1 }]).closed === false);
  t('走っていないことを効果と読まない',
    red([]).evidence.includes('まだ走っていない'));
  t('目標を下回れば閉じる',
    red([{ task_kind: 'article', date_jst: '2026-08-26', total_cost_usd: 3.5 }]).closed === true);
  t('下回らなければ閉じない',
    red([{ task_kind: 'article', date_jst: '2026-08-26', total_cost_usd: 6.0 }]).closed === false);
  t('届いていない額を隠さない',
    red([{ task_kind: 'article', date_jst: '2026-08-26', total_cost_usd: 6.0 }]).evidence.includes('$6.0000'));
  t('他の種別は数えない',
    red([{ task_kind: 'repair', date_jst: '2026-08-26', total_cost_usd: 1.0 }]).closed === false);
  t('実費台帳が無ければ判定不能（節約）',
    CLOSE_CHECKS.cost_reduced({ task_kind: 'article', since: '2026-08-25', target: 4 }, {}).closed === false);

  // 閉じ条件: 1回上限の超過は「人が見たか」で閉じる（manual にしない）
  const ovCtx = (rows) => ({ budget: { run_caps: { overruns: rows, unreviewed: rows.filter((r) => !r.reviewed) } } });
  t('実費ゲートを読めなければ判定不能',
    CLOSE_CHECKS.budget_overrun_reviewed({ run_id: '1' }, {}).closed === false);
  t('判定していないを上限内と混ぜない',
    CLOSE_CHECKS.budget_overrun_reviewed({ run_id: '1' }, { budget: { run_caps: null } }).closed === false);
  t('未レビューなら閉じない', CLOSE_CHECKS.budget_overrun_reviewed({ run_id: '1' },
    ovCtx([{ run_id: '1', task_kind: 'repair', cost: 11.93, cap: 3, reviewed: false }])).closed === false);
  t('レビュー済なら閉じる', CLOSE_CHECKS.budget_overrun_reviewed({ run_id: '1' },
    ovCtx([{ run_id: '1', task_kind: 'repair', cost: 11.93, cap: 3, reviewed: true, why: 'ok' }])).closed === true);
  t('超過でなくなれば閉じる',
    CLOSE_CHECKS.budget_overrun_reviewed({ run_id: '1' }, ovCtx([])).closed === true);
  t('run_id は文字列と数値を区別しない', CLOSE_CHECKS.budget_overrun_reviewed({ run_id: 1 },
    ovCtx([{ run_id: '1', task_kind: 'repair', cost: 11.93, cap: 3, reviewed: true }])).closed === true);
  // run_id 無しの超過。**String(null) で照合すると「消えた」と読んで閉じる**——
  // 止まっているのに閉じる倒れ方なので、日付＋種別で照合する。
  const noIdRow = { run_id: null, date_jst: '2026-08-25', task_kind: 'repair', cost: 11.93, cap: 3, reviewed: false };
  t('run_id 無しを消えたと読まない',
    CLOSE_CHECKS.budget_overrun_reviewed({ date_jst: '2026-08-25', task_kind: 'repair' },
      ovCtx([noIdRow])).closed === false);
  t('run_id 無しは解除できないと書く',
    CLOSE_CHECKS.budget_overrun_reviewed({ date_jst: '2026-08-25', task_kind: 'repair' },
      ovCtx([noIdRow])).evidence.includes('run_id が無く'));
  t('run_id 無しでも消えれば閉じる',
    CLOSE_CHECKS.budget_overrun_reviewed({ date_jst: '2026-08-25', task_kind: 'repair' },
      ovCtx([])).closed === true);
  t('run_id 指定は run_id 無しの行に一致しない',
    CLOSE_CHECKS.budget_overrun_reviewed({ run_id: 'null' }, ovCtx([noIdRow])).closed === true);

  // merge: 導出値（auto / touches）は open な行に追従する
  {
    const led = { actions: [{
      id: 'act-x', title: '旧', detail: '旧', source: 'orphan', state: 'open',
      created_jst: '2026-09-01', last_seen_jst: '2026-09-01', closed_jst: null, evidence: null,
      auto: null, touches: [], force_owner: null, close_check: { kind: 'manual', params: {} },
    }] };
    merge(led, [{ id: 'act-x', title: '新', detail: '新', source: 'orphan',
      auto: 'apply-orphan-ledger', touches: ['data/autopilot-runs.json'],
      close_check: { kind: 'manual', params: {} } }], '2026-09-02');
    t('**内訳が後から取れた行にも auto が付く**（先に立った行が古い判定で残らない）',
      led.actions[0].auto === 'apply-orphan-ledger');
    t('対象ファイルも追従する', led.actions[0].touches.length === 1);
    const led2 = { actions: [{ ...led.actions[0], force_owner: 'human', force_owner_why: 'ここは人' }] };
    merge(led2, [{ id: 'act-x', title: '新', detail: '新', source: 'orphan',
      auto: 'apply-orphan-ledger', touches: ['data/autopilot-runs.json'],
      close_check: { kind: 'manual', params: {} } }], '2026-09-02');
    t('**人が固定した force_owner は上書きしない**', led2.actions[0].force_owner === 'human'
      && classify(led2.actions[0], matrix).owner === 'human');

    // **[2026-09-03] 閉じ条件も導出の結果。**追従しないと、先に立った行だけが
    // 古い閉じ条件のまま取り残される（usage_limit の3行が `run_repaired` で
    // 立ったまま、derive が「repair_of を書いてはいけない」と判定するように
    // なっても、行の側は満たしてはいけない条件を持ち続けた）。
    const cc = { actions: [{
      id: 'act-y', title: '旧', detail: '旧', source: 'selfheal', state: 'open',
      created_jst: '2026-09-01', last_seen_jst: '2026-09-01', closed_jst: null, evidence: null,
      auto: null, touches: [], force_owner: null,
      close_check: { kind: 'run_repaired', params: { run_id: 'r' } },
    }] };
    merge(cc, [{ id: 'act-y', title: '新', detail: '新', source: 'selfheal',
      force_owner: 'human', force_owner_why: '規則が人へ渡すと決めている',
      close_check: { kind: 'no_failure_since', params: { route: 'actions', failure_class: 'usage_limit', since: '2026-08-31' } } }],
      '2026-09-03');
    t('**open な行は導出の閉じ条件に追従する**', cc.actions[0].close_check?.kind === 'no_failure_since');
    t('種別が変われば前の種別の params は捨てる',
      cc.actions[0].close_check?.params?.run_id === undefined);

    // **handler が積んだ状態を追従で消さない。**cost_covers_runs の exclude は
    // append-cost が実測して積む状態で、導出は空の params を出す。
    // 素直に上書きすると、**閉じ条件の追従が毎朝この履歴を消す。**
    const acc = { actions: [{
      id: 'act-cost-sync', title: '旧', detail: '旧', source: 'cost', state: 'open',
      created_jst: '2026-09-01', last_seen_jst: '2026-09-01', closed_jst: null, evidence: null,
      auto: 'append-cost', touches: [], force_owner: null,
      close_check: { kind: 'cost_covers_runs', params: { exclude: ['ap-x'] } },
    }] };
    merge(acc, [{ id: 'act-cost-sync', title: '新', detail: '新', source: 'cost',
      auto: 'append-cost', close_check: { kind: 'cost_covers_runs', params: {} } }], '2026-09-03');
    t('**handler が積んだ params を追従で消さない**',
      acc.actions[0].close_check?.params?.exclude?.[0] === 'ap-x');
    // 導出が同じキーを出したときは導出が勝つ（そちらが新しい事実）
    merge(acc, [{ id: 'act-cost-sync', title: '新', detail: '新', source: 'cost',
      auto: 'append-cost', close_check: { kind: 'cost_covers_runs', params: { exclude: ['ap-y'] } } }], '2026-09-03');
    t('導出が同じキーを出せば導出が勝つ', acc.actions[0].close_check?.params?.exclude?.[0] === 'ap-y');
    t('導出が人へ回したら、行も人へ回る', cc.actions[0].force_owner === 'human'
      && classify(cc.actions[0], matrix).owner === 'human');
    t('回した理由も一緒に載る', (cc.actions[0].force_owner_why ?? '').includes('規則'));

    // **付ける方向にだけ追従する。**導出が null になっても人の固定は外さない ——
    // 外す側の誤りだけが、人の依頼を黙ってAIの仕事に変える。
    const pin = { actions: [{ ...cc.actions[0], force_owner: 'human', force_owner_why: '人が固定' }] };
    merge(pin, [{ id: 'act-y', title: '新', detail: '新', source: 'selfheal', force_owner: null,
      close_check: { kind: 'run_repaired', params: { run_id: 'r' } } }], '2026-09-03');
    t('**導出が null でも人の固定は外れない**（非対称）', pin.actions[0].force_owner === 'human');

    // 閉じた行・受容した行には触らない（既存の規律）
    const doneRow = { actions: [{ ...cc.actions[0], state: 'acknowledged',
      close_check: { kind: 'manual', params: {} }, force_owner: null }] };
    merge(doneRow, [{ id: 'act-y', title: '新', detail: '新', source: 'selfheal', force_owner: 'human',
      close_check: { kind: 'no_failure_since', params: {} } }], '2026-09-03');
    t('**既知の制約（acknowledged）の閉じ条件は書き換えない**',
      doneRow.actions[0].close_check?.kind === 'manual' && doneRow.actions[0].force_owner === null);
  }

  // --- D3b: ledger_only の取り残しに auto を付けた（2026-09-02） ---
  const orphanRow = (ledgerOnly) => derive({ orphans: [{
    pr: 774, prs: [774], branch: 'claude/obsidian-auto-20260902', merged_sha: 'abcdef1234',
    ahead_by: 1, commits: ['ee4e37c'], paths: ['data/autopilot-runs.json'], ledger_only: ledgerOnly,
  }] }).find((a) => a.source === 'orphan');
  t('**台帳だけの取り残しは自動で再投入する**', orphanRow(true)?.auto === 'apply-orphan-ledger');
  t('台帳の外を触る取り残しは今までどおり人が読む', orphanRow(false)?.auto === null);
  t('**内訳が取れていない取り残しも人が読む**（取れなかったを「台帳だけ」と読まない）',
    orphanRow(null)?.auto === null);
  t('自動の行は対象ファイルを名乗る（classify が「対象不明」で human に倒すため）',
    (orphanRow(true)?.touches ?? []).length === 3);
  t('自動でない行は touches を持たない', (orphanRow(false)?.touches ?? []).length === 0);
  t('自動の対象は self_repair.may_modify の内側',
    classify(orphanRow(true), matrix).owner === 'ai');
  t('自動でない取り残しは human のまま', classify(orphanRow(false), matrix).owner === 'human');
  t('handler が実在する', typeof HANDLERS['apply-orphan-ledger'] === 'function');

  // 「本当に欠けているか」— **SHAで立った行を、内容の欠落と混ぜない**
  const mainRuns = { runs: [{ run_id: 'ap-20260902-actions' }] };
  t('欠けていなければ空（内容が着地済みでも走査は行を立てる）',
    missingLedgerRows({ runs: [{ run_id: 'ap-20260902-actions' }] }, mainRuns).length === 0);
  t('欠けていれば返す',
    missingLedgerRows({ runs: [{ run_id: 'ap-20260903-ccr' }] }, mainRuns)[0].run_id === 'ap-20260903-ccr');
  t('**読めなかったは「欠けていない」ではない**', missingLedgerRows({}, mainRuns) === null);
  t('run_id の無い行は再投入しない',
    missingLedgerRows({ runs: [{ date_jst: '2026-09-03' }] }, mainRuns).length === 0);
  t('main 側が読めなくても、ブランチ側が読めれば全件が欠けている扱い',
    missingLedgerRows({ runs: [{ run_id: 'x' }] }, null).length === 1);
  t('**状態型と自己出力は追記対象に入れない**',
    ORPHAN_APPENDABLE['data/autopilot-status.json'] === undefined
    && ORPHAN_APPENDABLE['data/autopilot-actions.json'] === undefined
    && ORPHAN_APPENDABLE['docs/obsidian/AUTOPILOT_LOG.md'] === undefined);
  t('追記型は runs と cost の2つだけ', Object.keys(ORPHAN_APPENDABLE).length === 2);

  // --- 「main に欠けが無い」を示せるときだけ示す（自動受容の根拠） ---
  {
    const runs = (ids) => JSON.stringify({ runs: ids.map((id) => ({ run_id: id })) });
    const RUNS = 'data/autopilot-runs.json';

    t('追記型: 行キーが全部あれば着地済み',
      proveLandedFile(RUNS, runs(['a', 'b']), runs(['a', 'b', 'c'])).landed === true);
    t('追記型: 1行でも欠けていれば示さない',
      proveLandedFile(RUNS, runs(['a', 'z']), runs(['a', 'b'])).landed === false);
    t('**読めなかったら示さない**（欠けていないという意味ではない）',
      proveLandedFile(RUNS, null, runs(['a'])).landed === false
      && proveLandedFile(RUNS, runs(['a']), null).landed === false);
    t('JSON として壊れていたら示さない',
      proveLandedFile(RUNS, '{{{', runs(['a'])).landed === false);

    const statusDoc = (d) => JSON.stringify({ date_jst: d });
    t('状態型: main 側が新しければ上書き済み',
      proveLandedFile(ORPHAN_STATUS_FILE, statusDoc('2026-08-27'), statusDoc('2026-09-02')).landed === true);
    t('状態型: 同じ日でも上書き済み',
      proveLandedFile(ORPHAN_STATUS_FILE, statusDoc('2026-09-02'), statusDoc('2026-09-02')).landed === true);
    t('**状態型: main 側が古いなら示さない**（巻き戻りの疑い）',
      proveLandedFile(ORPHAN_STATUS_FILE, statusDoc('2026-09-02'), statusDoc('2026-08-27')).landed === false);
    t('状態型: date_jst が読めなければ示さない',
      proveLandedFile(ORPHAN_STATUS_FILE, statusDoc('いつか'), statusDoc('2026-09-02')).landed === false);

    t('散文: 前方一致なら着地済み（main はその後ろに足しただけ）',
      proveLandedFile(ORPHAN_LOG_FILE, '## 8/27\n本文\n', '## 8/27\n本文\n\n## 8/28\n続き\n').landed === true);
    t('**散文: 先頭が違えば示さない**（追記以外が起きている）',
      proveLandedFile(ORPHAN_LOG_FILE, '## 8/27\n直した本文\n', '## 8/27\n本文\n\n## 8/28\n').landed === false);
    t('散文: main のほうが短ければ示さない',
      proveLandedFile(ORPHAN_LOG_FILE, '## 8/27\n本文\n続き\n', '## 8/27\n本文\n').landed === false);

    // **このエンジン自身の出力について「欠けが無い」を自分で判定するのは循環。**
    t('**自分の出力（actions台帳）では示さない**',
      proveLandedFile('data/autopilot-actions.json', '{}', '{}').landed === false);
    t('知らない台帳では示さない',
      proveLandedFile('growth/content/coverage-queue.json', '[]', '[]').landed === false);

    const texts = {
      [RUNS]: { branch: runs(['a']), main: runs(['a', 'b']) },
      [ORPHAN_STATUS_FILE]: { branch: statusDoc('2026-08-27'), main: statusDoc('2026-09-02') },
      [ORPHAN_LOG_FILE]: { branch: 'x\n', main: 'x\ny\n' },
    };
    t('**全パスで示せたときだけ proven**',
      proveOrphanLanded([RUNS, ORPHAN_STATUS_FILE, ORPHAN_LOG_FILE], texts).proven === true);
    t('1つでも示せなければ proven でない',
      proveOrphanLanded([RUNS, 'data/autopilot-actions.json'], texts).proven === false);
    t('**内訳が取れていなければ proven でない**（「台帳だけ」と読まない）',
      proveOrphanLanded([], {}).proven === false
      && proveOrphanLanded(null, {}).proven === false);
    t('示せなかった理由がパスごとに残る',
      proveOrphanLanded([RUNS, 'data/autopilot-actions.json'], texts).why.length === 2);
  }

  // --- D5b: 経路の沈黙と全停止 ---
  //
  // **実物の3日で当てる。**08-27〜29 の主系（skipped_gate ×3・その間 副系は出荷）と、
  // 08-29〜31 の全停止。どちらも当時どの監視も鳴らなかった形。
  const routeRuns = (rows) => ({ today: '2026-09-01', runsDoc: { runs: rows }, selfheal: { targets: [] } });
  const day = (d, route, outcome) => ({ run_id: `${d}-${route}`, date_jst: d, route, outcome, attempted: true });
  const silent3 = [
    day('2026-08-26', 'actions', 'shipped'),
    day('2026-08-27', 'actions', 'skipped_gate'), day('2026-08-27', 'ccr-0920', 'shipped'),
    day('2026-08-28', 'actions', 'skipped_gate'), day('2026-08-28', 'ccr-0920', 'shipped'),
    day('2026-08-29', 'actions', 'skipped_gate'), day('2026-08-29', 'ccr-0920', 'shipped'),
  ];
  const s3 = derive(routeRuns(silent3)).filter((a) => a.id === 'act-route-silent-actions');
  t('**主系が3日スキップし続けたら起票する**（当時どの監視も鳴らなかった形）', s3.length === 1);
  t('沈黙の日数を題に出す', (s3[0]?.title ?? '').includes('3日ぶん出荷していない'));
  t('最後の出荷日を題に出す', (s3[0]?.title ?? '').includes('最後の出荷 2026-08-26'));
  t('沈黙は原因を名乗らない（Gateの理由を読ませる）', (s3[0]?.detail ?? '').includes('スキップ理由を読む'));
  t('沈黙は自動実行しない', s3[0]?.auto === null);
  const silent2 = silent3.filter((r) => r.date_jst <= '2026-08-28');
  t('**2日では鳴らさない**（副系が先に取る日は正常系にある）',
    derive(routeRuns(silent2)).filter((a) => a.id === 'act-route-silent-actions').length === 0);
  t('出荷している副系は起票しない',
    derive(routeRuns(silent3)).filter((a) => a.id === 'act-route-silent-ccr-0920').length === 0);
  const oneOff = [
    day('2026-08-26', 'actions', 'shipped'),
    day('2026-08-27', 'owner-session', 'shipped'),
    day('2026-08-28', 'actions', 'skipped_gate'), day('2026-08-29', 'actions', 'skipped_gate'),
    day('2026-08-30', 'actions', 'skipped_gate'),
  ];
  t('**行が3日ぶんに満たない経路は数えない**（代走・オーナー実行は「予備」ではない）',
    derive(routeRuns(oneOff)).filter((a) => a.id === 'act-route-silent-owner-session').length === 0);
  // 閉じ条件は「もう一度出せたか」だけ。失敗が無いことでは閉じない。
  t('出荷が無ければ閉じない',
    CLOSE_CHECKS.route_shipped_since({ route: 'actions', since: '2026-08-26' },
      routeRuns(silent3)).closed === false);
  t('出荷が戻れば閉じる',
    CLOSE_CHECKS.route_shipped_since({ route: 'actions', since: '2026-08-26' },
      routeRuns([...silent3, day('2026-08-30', 'actions', 'shipped')])).closed === true);
  t('**台帳が読めなければ閉じない**（出荷したという意味ではない）',
    CLOSE_CHECKS.route_shipped_since({ route: 'actions', since: '2026-08-26' }, {}).closed === false);

  const outage = [
    day('2026-08-28', 'actions', 'skipped_gate'), day('2026-08-28', 'ccr-0920', 'shipped'),
    day('2026-08-29', 'actions', 'skipped_gate'), day('2026-08-29', 'ccr-0920', 'no_artifact'),
    day('2026-08-30', 'actions', 'failed'),
    day('2026-08-31', 'actions', 'failed'), day('2026-08-31', 'ccr-0920', 'failed'),
  ];
  const og = derive(routeRuns(outage)).filter((a) => a.id === 'act-shipping-outage');
  t('**どの経路も出さない日が続いたら起票する**（08-29〜31 の実物）', og.length === 1);
  t('全停止の日数を題に出す', (og[0]?.title ?? '').includes('3日連続で出荷していない'));
  t('全停止の行は1本だけ（故障の数だけ生やさない）',
    derive(routeRuns(outage)).filter((a) => a.source === 'route' && a.id === 'act-shipping-outage').length === 1);
  t('最終日に出荷があれば全停止は起票しない',
    derive(routeRuns([...outage, day('2026-09-01', 'actions', 'shipped')]))
      .filter((a) => a.id === 'act-shipping-outage').length === 0);
  t('1日だけでは全停止に数えない',
    derive(routeRuns([day('2026-08-30', 'actions', 'shipped'), day('2026-08-31', 'actions', 'failed')]))
      .filter((a) => a.id === 'act-shipping-outage').length === 0);
  t('全停止は出荷が戻れば閉じる',
    CLOSE_CHECKS.shipping_resumed({ since: '2026-08-28' },
      routeRuns([...outage, day('2026-09-01', 'actions', 'shipped')])).closed === true);
  t('全停止は出荷が戻るまで閉じない',
    CLOSE_CHECKS.shipping_resumed({ since: '2026-08-28' }, routeRuns(outage)).closed === false);
  t('**全停止も台帳が読めなければ閉じない**',
    CLOSE_CHECKS.shipping_resumed({ since: '2026-08-28' }, {}).closed === false);

  // API → 導出 → 台帳 → 閉じ条件。単一ラベルの故障と明示的な閉鎖を再現する。
  {
    const res = (body, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => body });
    const issue = (number, label, extra = {}) => ({ number, state: 'open', title: `故障${number}`, labels: [label], ...extra });
    const stale = issue(591, 'ops/autopilot-stale');
    const cron = issue(592, 'ops/cron-failure');
    const both = issue(593, 'ops/cron-failure', { labels: Object.keys(HEALTH_LABELS) });
    const fixtures = [stale, cron, both, issue(594, 'ops/cron-failure', { pull_request: {} })];
    const requested = [];
    const github = async url => {
      requested.push(url);
      const q = new URL(url).searchParams;
      const labels = q.get('labels').split(',');
      const selected = fixtures.filter(i => labels.every(l => i.labels.includes(l)));
      const size = Number(q.get('per_page')); const offset = (Number(q.get('page')) - 1) * size;
      return res(selected.slice(offset, offset + size));
    };
    const map = await fetchOpenHealthIssues('o/r', 'tok', { fetchImpl: github, perPage: 2 });
    t('片方の監視ラベルだけでも取得し、両方のラベルは重複させない',
      map instanceof Map && JSON.stringify([...map.keys()]) === '[591,592,593]');
    t('監視Issueの2ページ目まで実際に取得する', requested.some(u => u.includes('page=2')));
    t('PRは障害に含めない', !map.has(594));
    const ctx = { today: '2026-09-04', issues: map };
    const ledger = { actions: [] };
    merge(ledger, derive(ctx), ctx.today);
    t('独立Actから実際の監視Issueが台帳へ届く', ledger.actions.filter(a => a.source === 'health').length === 3);
    reconcile(ledger, ctx);
    t('openの故障を閉じない', ledger.actions.every(a => a.state === 'open'));
    ledger.actions[0].state = 'done'; ledger.actions[0].closed_jst = '2026-09-03';
    merge(ledger, derive(ctx), ctx.today);
    t('実際はopenの故障をdoneに埋めない', ledger.actions[0].state === 'open' && ledger.actions[0].closed_jst === null);
    for (const fetchImpl of [async () => res([], false), async () => res({}),
      async () => { throw new Error('network'); },
      async url => new URL(url).searchParams.get('labels') === 'ops/cron-failure' ? res([], false) : res([stale])]) {
      const unknown = await fetchOpenHealthIssues('o/r', 'tok', { fetchImpl, watched: [591] });
      t('取得失敗・片方だけ読めた回を空一覧にせず閉じない', unknown === null
        && !CLOSE_CHECKS.issue_closed({ issue: 591 }, { issues: unknown }).closed);
    }
    t('トークン無しは判定不能', await fetchOpenHealthIssues('o/r', '', { fetchImpl: github }) === null);
    t('ページ上限で未完の一覧は判定不能',
      await fetchOpenHealthIssues('o/r', 'tok', { fetchImpl: github, perPage: 1, maxPages: 1 }) === null);
    const empty = await fetchOpenHealthIssues('o/r', 'tok', { fetchImpl: async () => res([]) });
    t('正常な空一覧と取得失敗を区別する', empty instanceof Map && empty.size === 0);
    t('空一覧から閉鎖を推定しない', !CLOSE_CHECKS.issue_closed({ issue: 591 }, { issues: empty }).closed);
    const watch = async (response) => fetchOpenHealthIssues('o/r', 'tok', { watched: [591, 591],
      fetchImpl: async url => url.endsWith('/issues/591') ? response() : res([]) });
    const removed = await watch(() => res({ ...stale, labels: [] }));
    t('監視ラベルを外しただけのopen Issueは閉じない',
      !CLOSE_CHECKS.issue_closed({ issue: 591 }, { issues: removed }).closed && removed.get(591)?.state === 'open');
    const closed = await watch(() => res({ ...stale, state: 'closed' }));
    const done = reconcile(ledger, { ...ctx, issues: closed });
    t('個別APIでclosedを確認したIssueだけを閉じる', done.length === 1 && done[0].id === 'act-health-591'
      && done[0].evidence.includes('state=closed'));
    t('個別確認のclosed Issueを新たな障害として導出しない', derive({ ...ctx, issues: closed }).length === 0);
    for (const response of [() => res(null, false), () => res({}), () => res({ ...stale, number: 999, state: 'closed' }),
      () => res({ ...stale, state: 'closed', pull_request: {} }), () => { throw new Error('network'); }]) {
      const unknown = await watch(response);
      t('個別取得失敗・404・異なる番号・PR・不正形式では閉じない',
        !CLOSE_CHECKS.issue_closed({ issue: 591 }, { issues: unknown }).closed);
    }
  }

  // 導出D1/D2: 修理主体が人しかいない故障は、AI行として起票しない
  //
  // **2026-09-02 に selfheal だけを直したときの穴を、ここで固定する。**
  // 表示は 🤝 に変わったのに derive は escalate しか見ておらず、
  // usage_limit の3件は3日ぶん「AIがやること」に出続け、規則が人へ渡すと
  // 決めた依頼は一度もオーナーに届いていなかった。
  const shRuns = [
    { run_id: 'r-0830', date_jst: '2026-08-30', route: 'actions', outcome: 'failed',
      failure_class: 'usage_limit', attempted: true },
    { run_id: 'r-0831', date_jst: '2026-08-31', route: 'actions', outcome: 'failed',
      failure_class: 'usage_limit', attempted: true },
    { run_id: 'r-0901', date_jst: '2026-09-01', route: 'actions', outcome: 'shipped', attempted: true },
  ];
  const shTarget = (over) => ({
    run_id: 'r-0830', date_jst: '2026-08-30', route: 'actions', outcome: 'failed',
    failure_class: 'usage_limit', failure_reason: '週次の使用量上限',
    repair_attempts_for_class: 0, escalate: false, owner_routed: true,
    escalation: { who: 'owner', channel: 'daily_report', within_hours: 24 }, ...over,
  });
  const shDerive = (target, runs = shRuns) => derive({
    today: '2026-09-03', runsDoc: { runs }, statusDoc: null, costDoc: null,
    selfheal: { targets: [target] },
  }).filter((d) => d.source === 'selfheal');

  const ownerRow = shDerive(shTarget())[0];
  t('who=owner の故障は人へ固定する', ownerRow?.force_owner === 'human');
  t('人へ固定した理由に規則の名前を出す',
    (ownerRow?.force_owner_why ?? '').includes('escalation-rules'));
  t('**規則が満たすことを禁じている閉じ条件で立てない**（repair_of を書けないので run_repaired は永久に開く）',
    ownerRow?.close_check?.kind === 'no_failure_since');
  t('閉じ条件は経路と種別で見る',
    ownerRow?.close_check?.params?.route === 'actions'
    && ownerRow?.close_check?.params?.failure_class === 'usage_limit');
  t('**since は同じ経路・同じ種別の最後の失敗日**（古い回の行が先に閉じない）',
    ownerRow?.close_check?.params?.since === '2026-08-31');
  t('自動実行は付けない（人の行に handler を付けない）', ownerRow?.auto == null);
  t('行IDは今までどおり run 単位（既存の行へ流れて増えない）',
    ownerRow?.id === 'act-selfheal-r-0830');
  t('題に「打つ手が無い種別」と出す', (ownerRow?.title ?? '').includes('打つ手が無い'));

  // **自分だけ見て since を決めない**（他の回が無ければ自分の日付）
  t('同じ種別の失敗が自分しか無ければ since は自分の日付',
    shDerive(shTarget(), [shRuns[0]])[0]?.close_check?.params?.since === '2026-08-30');
  // **別経路の失敗を混ぜない**
  t('別経路の同じ種別は since に混ざらない',
    shDerive(shTarget(), [shRuns[0],
      { run_id: 'x', date_jst: '2026-09-02', route: 'ccr-0920', outcome: 'failed',
        failure_class: 'usage_limit', attempted: true }])[0]?.close_check?.params?.since === '2026-08-30');

  // **who=self_then_owner は今までどおりAIの仕事**（逃げ道を作っていないこと）
  const selfRow = shDerive(shTarget({
    failure_class: 'claim_without_completion', owner_routed: false,
    escalation: { who: 'self_then_owner', channel: 'gh_issue', within_hours: 24 },
  }))[0];
  t('who=self_then_owner の故障は人へ固定しない', selfRow?.force_owner == null);
  t('直せる故障の閉じ条件は run_repaired のまま', selfRow?.close_check?.kind === 'run_repaired');

  // **上限に達した故障（escalate）は今までどおり contain**
  const escRow = shDerive(shTarget({ escalate: true, repair_attempts_for_class: 3 }))[0];
  t('上限に達した故障は今までどおり封じ込める', escRow?.auto === 'contain');
  t('上限に達した故障は owner_routed より優先される',
    escRow?.id === 'act-selfheal-escalated-usage_limit');

  // 導出D7: 主系を止めている未レビュー超過を起票する
  const ovDerive = derive({
    today: '2026-08-25', runsDoc: { runs: [] }, selfheal: { targets: [] },
    statusDoc: null, costDoc: null,
    budget: { run_caps: { overruns: [], unreviewed: [
      { run_id: '32816234185', date_jst: '2026-08-25', task_kind: 'repair', cost: 11.9329, cap: 3, times: 4, reviewed: false }] } },
  }).filter((d) => d.source === 'budget');
  t('未レビュー超過を起票する', ovDerive.length === 1);
  t('超過の承認は人に固定する', ovDerive[0]?.force_owner === 'human');
  t('起票のidに日付を含めない', !/\d{8}-/.test(ovDerive[0]?.id ?? '') && ovDerive[0]?.id === 'act-budget-overrun-32816234185');
  t('止まる種別を題に出す', (ovDerive[0]?.title ?? '').includes('repair を選ぶと止まる'));
  t('解除コマンドを本文に出す', (ovDerive[0]?.detail ?? '').includes('--ack-overrun 32816234185'));
  t('自動実行を付けない', ovDerive[0]?.auto == null);
  t('実費ゲートが無い日は起票しない',
    derive({ today: '2026-08-25', runsDoc: { runs: [] }, selfheal: { targets: [] },
             statusDoc: null, costDoc: null }).filter((d) => d.source === 'budget').length === 0);
  const noIdDerive = derive({
    today: '2026-08-25', runsDoc: { runs: [] }, selfheal: { targets: [] }, statusDoc: null, costDoc: null,
    budget: { run_caps: { overruns: [], unreviewed: [
      { run_id: null, date_jst: '2026-08-25', task_kind: 'repair', cost: 11.93, cap: 3, times: 4, reviewed: false },
      { run_id: null, date_jst: '2026-08-25', task_kind: 'article', cost: 9, cap: 2, times: 4.5, reviewed: false }] } },
  }).filter((d) => d.source === 'budget');
  t('run_id 無しでもidが衝突しない', new Set(noIdDerive.map((d) => d.id)).size === 2);
  t('run_id 無しのidに null を出さない', noIdDerive.every((d) => !d.id.includes('null')));

  // --- D8: EP 委任判定の月次追認（2026-09-05） ---
  {
    const policy = { ep: { precision_review: { accepted_modes: ['human'],
      delegations: [{ mode: 'owner_delegated', reviewer: 'codex' }], ratification: { cadence: 'monthly' } } } };
    const delegated = (id) => ({ id, title: id, state: 'done', force_owner: 'human', owner_needed: true,
      owner_needed_review: { mode: 'owner_delegated', reviewer: 'codex' } });
    const human = (id) => ({ id, title: id, state: 'done', force_owner: 'human', owner_needed: true,
      owner_needed_review: { mode: 'human', reviewer: 'owner', reviewed_jst: '2026-10-01', evidence: 'オーナーが「私の判断が要る件だった」と述べた' } });
    const ctxOf = (actions, today = '2026-10-01', scorePolicy = policy) => ({
      today, runsDoc: { runs: [] }, selfheal: { targets: [] }, statusDoc: null, costDoc: null,
      ledgerDoc: { actions }, scorePolicy });
    const d8 = derive(ctxOf([delegated('act-a'), delegated('act-b'), human('act-c')])).filter((d) => d.source === 'ep-ratification');
    t('未追認の委任判定があれば月次の行を1つ立てる', d8.length === 1 && d8[0].id === 'act-ep-ratification-2026-10');
    t('追認は人に固定する', d8[0]?.force_owner === 'human' && d8[0]?.auto === null);
    t('対象は委任判定だけ（人の判定は数えない）', JSON.stringify(d8[0]?.close_check?.params?.ids) === '["act-a","act-b"]');
    t('件数を題に出す', (d8[0]?.title ?? '').includes('未追認 2 件'));
    t('道具の使い方を本文に出す', (d8[0]?.detail ?? '').includes('ep-ratify.mjs --list'));
    t('**点が動かないことを本文に書く**', (d8[0]?.detail ?? '').includes('点は変わらない'));
    t('未追認が無ければ立てない',
      derive(ctxOf([human('act-c')])).filter((d) => d.source === 'ep-ratification').length === 0);
    t('**その月の行が既に在れば立てない**（done でも再点火しない）',
      derive(ctxOf([delegated('act-a'), { id: 'act-ep-ratification-2026-10', state: 'done', title: 'x' }]))
        .filter((d) => d.source === 'ep-ratification').length === 0);
    t('cadence が monthly でなければ立てない（L4 が決めるまで動かない）',
      derive(ctxOf([delegated('act-a')], '2026-10-01', { ep: { precision_review: { accepted_modes: ['human'] } } }))
        .filter((d) => d.source === 'ep-ratification').length === 0);
    t('採点の方針が読めなければ立てない',
      derive(ctxOf([delegated('act-a')], '2026-10-01', null)).filter((d) => d.source === 'ep-ratification').length === 0);
    const params = { month: '2026-10', ids: ['act-a', 'act-b'], opened_jst: '2026-10-01', window_days: 14 };
    t('未追認が残っていれば閉じない',
      CLOSE_CHECKS.ep_ratified_or_window(params, ctxOf([delegated('act-a'), delegated('act-b')], '2026-10-05')).closed === false);
    t('全部人の判定に置き換わったら閉じる',
      CLOSE_CHECKS.ep_ratified_or_window(params, ctxOf([human('act-a'), human('act-b')], '2026-10-05')).closed === true);
    const passed = CLOSE_CHECKS.ep_ratified_or_window(params, ctxOf([delegated('act-a'), human('act-b')], '2026-10-15'));
    t('**窓を過ぎたら閉じるが、未追認を持ち越すと書く**', passed.closed === true && passed.evidence.includes('act-a') && passed.evidence.includes('持ち越す'));
    t('窓の内側では未追認の id を根拠に出す',
      CLOSE_CHECKS.ep_ratified_or_window(params, ctxOf([delegated('act-a'), human('act-b')], '2026-10-05')).evidence.includes('act-a'));
    t('台帳が読めなければ閉じない',
      CLOSE_CHECKS.ep_ratified_or_window(params, { today: '2026-10-20', ledgerDoc: null, scorePolicy: policy }).closed === false);
  }
  t('run_id 無しは先に run_id を入れろと書く', (noIdDerive[0]?.detail ?? '').includes('run_id を入れる'));
  t('run_id 無しの閉じ条件は日付と種別で照合する',
    noIdDerive[0]?.close_check?.params?.date_jst === '2026-08-25'
    && noIdDerive[0]?.close_check?.params?.task_kind === 'repair');

  // Actual handler + budget CLI: successful model execution can still have no
  // result ledger row. Charge only the measured cost, then enrich once resolved.
  {
    const observed = { id: 33959414641, status: 'completed', conclusion: 'success', event: 'workflow_dispatch',
      created_at: '2026-09-05T09:58:55Z', jst_date: '2026-09-05',
      steps: [{ name: 'Claude Code', conclusion: 'success' }] };
    const ctx = { today: '2026-09-05', token: 'fixture', repo: 'o/r', workflowRuns: [observed],
      runsDoc: { runs: [] }, costDoc: { budget: { monthly_usd_cap: 40, on_exceed: 'skip_run' }, runs: [] },
      selfheal: { targets: [] } };
    const candidate = costCandidates(ctx)[0];
    t('結果のない成功runも実費の候補にする', candidate?.external_ref === '33959414641');
    if (!candidate) throw Error('confirmed model execution is missing from cost candidates');
    t('モデル成功を出荷結果へ変換しない', candidate?.outcome === undefined && candidate?.lane === undefined);
    const contradicted = costCandidates({ ...ctx, runsDoc: { runs: [{ run_id: 'wrong-skip', external_ref: '33959414641',
      attempted: false, outcome: 'skipped_gate' }] } });
    t('未着手と誤記された行でも実モデル着手の実費を消さない', contradicted.length === 1
      && contradicted[0].outcome === undefined && contradicted[0].external_ref === '33959414641');
    t('未記帳runの実費を導出する', derive(ctx).some(a => a.id === 'act-cost-sync'));
    t('未記帳runの実費を未回収のまま閉じない', !CLOSE_CHECKS.cost_covers_runs({}, ctx).closed);
    for (const change of [{ status: 'in_progress' }, { id: 'cse_1' }, { id: 0 }, { created_at: 'bad' },
      { jst_date: '2026-09-04' }, { steps: null }, { steps: [{ name: 'Claude Code', conclusion: 'skipped' }] }]) {
      t('未着手・未完了・不正な観測は費用を推定しない', costCandidates({ ...ctx, workflowRuns: [{ ...observed, ...change }] }).length === 0);
    }
    t('手動中止でもモデル着手済みなら実費を回収する', costCandidates({ ...ctx,
      workflowRuns: [{ ...observed, conclusion: 'cancelled', steps: [{ name: 'Claude Code', conclusion: 'cancelled' }] }] }).length === 1);
    const { tmpdir } = await import('node:os');
    const scratch = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'simplememo-cost-cycle-')));
    try {
      fs.cpSync(path.join(ROOT, 'scripts'), path.join(scratch, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(scratch, 'data'));
      const file = path.join(scratch, 'data/autopilot-cost.json');
      fs.writeFileSync(file, JSON.stringify(ctx.costDoc));
      const append = args => execFileSync(process.execPath, [path.join(scratch, 'scripts/autopilot-budget.mjs'), ...args],
        { cwd: scratch, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const reload = () => { ctx.costDoc = JSON.parse(fs.readFileSync(file, 'utf8')); };
      let reads = 0;
      const readCost = async (_repo, _token, id) => {
        t('外部run IDで費用ログを読む', id === '33959414641'); reads++;
        return { state: 'measured', usd: 0.8407852, turns: 20 };
      };
      const action = derive(ctx).find(a => a.id === 'act-cost-sync');
      ctx.ledgerDoc = { actions: [action] };
      ctx.workflowRuns = [];
      t('APIの直近一覧から外れても未回収の実行を保持する', costCandidates(ctx).length === 1
        && derive(ctx).some(a => a.id === 'act-cost-sync') && !CLOSE_CHECKS.cost_covers_runs(action.close_check.params, ctx).closed);
      t('不正な費用観測の保存を台帳検査で拒否', validateLedger({ actions: [{ ...action,
        close_check: { kind: 'cost_covers_runs', params: { pending_runs: [{ id: 'cse_1' }] } } }] }, matrix)
        .some(p => p.includes('pending cost runs')));
      const first = await HANDLERS['append-cost'](ctx, action, { readCost, append }); reload();
      if (first.changed !== 1 || ctx.costDoc.runs.length !== 1) throw Error(`実費CLI検査: ${first.log}; ${JSON.stringify(ctx.costDoc)}`);
      t('実CLIで未記帳runの実費を正確に一度だけ保存', first.changed === 1 && ctx.costDoc.runs.length === 1
        && ctx.costDoc.runs[0].total_cost_usd === 0.8407852 && ctx.costDoc.runs[0].num_turns === 20);
      t('実CLIでも結果・種別・レビューは推測しない', ctx.costDoc.runs[0].outcome === undefined
        && ctx.costDoc.runs[0].task_kind === undefined && ctx.costDoc.runs[0].cap_review === undefined && ctx.runsDoc.runs.length === 0);
      t('回収後は費用の依頼を閉じられる', CLOSE_CHECKS.cost_covers_runs({}, ctx).closed);
      const second = await HANDLERS['append-cost'](ctx, action, { readCost, append });
      t('再観測はログ再取得も二重請求も起こさない', second.changed === 0 && reads === 1);
      ctx.runsDoc.runs.push({ ...candidate, run_id: 'ap-20260905-actions-33959414641', outcome: 'no_artifact', action: 'new' });
      t('運転台帳が後から入っても外部IDで候補を重複させない', costCandidates(ctx).length === 1);
      t('後から確定した結果を費用台帳へ同期する依頼を導出', derive(ctx).some(a => a.id === 'act-cost-sync')
        && !CLOSE_CHECKS.cost_covers_runs({}, ctx).closed);
      const third = await HANDLERS['append-cost'](ctx, action, { readCost, append }); reload();
      t('実CLIで同じ費用行へ結果だけ補完する', third.changed === 1 && reads === 1 && ctx.costDoc.runs.length === 1
        && ctx.costDoc.runs[0].outcome === 'no_artifact' && ctx.costDoc.runs[0].task_kind === 'article'
        && ctx.costDoc.runs[0].total_cost_usd === 0.8407852 && CLOSE_CHECKS.cost_covers_runs({}, ctx).closed);
      t('補完済みの観測は再起票しない', !derive(ctx).some(a => a.id === 'act-cost-sync'));
      ctx.costDoc.runs = [];
      for (const state of ['unreadable', 'absent', 'gone']) {
        const a = { close_check: { params: {} } }; let writes = 0;
        await HANDLERS['append-cost'](ctx, a, { readCost: async () => ({ state, why: 'fixture' }), append: () => { writes++; } });
        t('測れていない金額を0円で追記しない', writes === 0);
        t('一時的な欠測は除外へ積まず再確認する', (a.close_check.params.exclude.length === 0) === (state === 'unreadable'));
      }
      const alias = { close_check: { params: { exclude: ['actions-run-33959414641'] } } };
      let excludedReads = 0;
      await HANDLERS['append-cost'](ctx, alias, { readCost: async () => { excludedReads++; throw Error('excluded'); }, append });
      t('後から運転IDが付いても外部ID由来の除外を保持', excludedReads === 0
        && CLOSE_CHECKS.cost_covers_runs(alias.close_check.params, ctx).closed);
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  }

  // 閉じ条件: 実費が原理的に存在しない run は除外できる（除外しないと永久に閉じない）
  const costCtx = { costDoc: { runs: [] }, runsDoc: { runs: [
    { run_id: 'never', attempted: true, external_ref: '1' }] } };
  t('除外前は閉じない', CLOSE_CHECKS.cost_covers_runs({}, costCtx).closed === false);
  const excluded = CLOSE_CHECKS.cost_covers_runs({ exclude: ['never'] }, costCtx);
  t('除外すれば閉じる', excluded.closed === true);
  // **[2026-09-03] 文言を「存在しない」から「残っていない」へ。**
  // 除外に積まれる理由は2つ（ログに実費行が無い／ログが消えた）で、
  // **後者は実費が存在した回**。「存在しない」と書くと、片方について嘘になる。
  t('除外したことを隠さない', excluded.evidence.includes('実費が残っていない 1件'));

  // **観測手段が無い経路を「未記録」に数えない／除外一覧にも積まない。**
  // 副系CCRの external_ref はセッションid（cse_…）で、Actions のジョブログは無い。
  // 旧版はこれを Actions API に投げて 404 を受け、「そもそも発生していない」と
  // 書いて永久除外へ積んでいた（実データ: ap-20260831-ccr0920）。
  const ccrCtx = { costDoc: { runs: [] }, runsDoc: { runs: [
    { run_id: 'ap-x-ccr0920', attempted: true, external_ref: 'cse_01VZpZ4' }] } };
  const ccrRes = CLOSE_CHECKS.cost_covers_runs({}, ccrCtx);
  t('**観測手段が無い run は未記録に数えない**（除外を積まなくても閉じる）', ccrRes.closed === true);
  t('**数えないことを隠さない**（件数と「ゼロではない」を根拠に出す）',
    ccrRes.evidence.includes('観測手段が無い') && ccrRes.evidence.includes('ゼロではない'));
  // 題と根拠で違う件数を出さない（2026-09-03 に「4件」と「1件」が並んで出た）
  {
    const ctx0 = {
      today: '2026-09-03', statusDoc: null, selfheal: { targets: [] },
      runsDoc: { runs: [
        { run_id: 'a', attempted: true, external_ref: '1', route: 'actions', date_jst: '2026-09-01' },
        { run_id: 'b', attempted: true, external_ref: '2', route: 'actions', date_jst: '2026-09-02' },
        { run_id: 'c', attempted: true, external_ref: 'cse_x', route: 'ccr-0920', date_jst: '2026-09-02' }] },
      costDoc: { runs: [] },
    };
    const bare = derive(ctx0).find((d) => d.id === 'act-cost-sync');
    t('**観測手段が無い run は題の件数に入れない**', /2件/.test(bare?.title ?? ''));
    t('数えないことは detail に出す（ゼロではないと書く）',
      (bare?.detail ?? '').includes('ゼロではない'));
    const withExcl = derive({ ...ctx0, ledgerDoc: { actions: [{ id: 'act-cost-sync',
      close_check: { kind: 'cost_covers_runs', params: { exclude: ['a'] } } }] } })
      .find((d) => d.id === 'act-cost-sync');
    t('**除外済みは題の件数に入れない**（閉じ条件と同じ数を出す）', /1件/.test(withExcl?.title ?? ''));
    t('除外したことは detail に出す', (withExcl?.detail ?? '').includes('除外している'));
    const allGone = derive({ ...ctx0, ledgerDoc: { actions: [{ id: 'act-cost-sync',
      close_check: { kind: 'cost_covers_runs', params: { exclude: ['a', 'b'] } } }] } })
      .find((d) => d.id === 'act-cost-sync');
    t('全部片付いたら起票しない', allGone === undefined);
  }

  t('Actions の run は今までどおり数える',
    CLOSE_CHECKS.cost_covers_runs({}, { costDoc: { runs: [] }, runsDoc: { runs: [
      { run_id: 'a', attempted: true, external_ref: '99' },
      { run_id: 'b', attempted: true, external_ref: 'cse_1' }] } }).closed === false);
  t('run id の見分けは数字かどうか',
    isActionsRunRef('33692832179') && !isActionsRunRef('cse_01VZ') && !isActionsRunRef(null));

  // fetchRunCost: **読めなかった / 読めたが無い / もう無い** を分ける
  {
    // **/logs を先に見る。**ログのURLは /actions/jobs/<id>/logs で、'/jobs' も含む。
    const mk = (jobsRes, logRes) => (url) => url.endsWith('/logs')
      ? Promise.resolve(logRes) : Promise.resolve(jobsRes);
    const okJobs = { ok: true, status: 200, json: async () => ({ jobs: [
      { id: 99, name: 'Notify Autopilot Act' }, { id: 1, name: 'autopilot', steps: [{ name: 'Claude Code', conclusion: 'skipped' }] }] }) };
    const withLog = (body) => ({ ok: true, status: 200, text: async () => body });

    const measured = await fetchRunCost('o/r', 'tok', '1',
      { fetchImpl: mk(okJobs, withLog('{"total_cost_usd":1.25,"num_turns":9}')) });
    t('実費行を読めたら measured', measured.state === 'measured' && measured.usd === 1.25 && measured.turns === 9);
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = mk(okJobs, withLog('{"total_cost_usd":1.25,"num_turns":9}'));
      let args;
      const result = await HANDLERS['append-cost']({ repo: 'o/r', token: 'fixture', costDoc: { runs: [] },
        runsDoc: { runs: [] }, workflowRuns: [{ id: 1, created_at: '2026-09-05T00:00:00Z', jst_date: '2026-09-05',
          status: 'completed', conclusion: 'success', steps: [{ name: 'Claude Code', conclusion: 'success' }] }] },
      { close_check: { params: {} } }, { append: values => { args = values; return 'appended'; } });
      t('handlerの既定経路が実費readerへ接続されている', result.changed === 1 && args?.[args.indexOf('--cost') + 1] === '1.25');
    } finally { globalThis.fetch = originalFetch; }
    let requestedLog;
    await fetchRunCost('o/r', 'tok', '1', { fetchImpl: async url => {
      if (url.endsWith('/logs')) { requestedLog = url; return withLog('{"total_cost_usd":1.25}'); }
      return okJobs;
    } });
    t('通知ジョブが先頭でも主系の実費ログを読む', requestedLog === 'https://api.github.com/repos/o/r/actions/jobs/1/logs');
    t('主系ジョブ不明は実費ゼロや消失にしない', (await fetchRunCost('o/r', 'tok', '1', {
      fetchImpl: async () => ({ ok: true, json: async () => ({ jobs: [{ name: 'Notify Autopilot Act', id: 99 }] }) }),
    })).state === 'unreadable');
    t('モデル未着手を確認できて実費行が無ければ absent',
      (await fetchRunCost('o/r', 'tok', '1', { fetchImpl: mk(okJobs, withLog('ログ本文')) })).state === 'absent');
    for (const conclusion of ['success', 'failure', 'cancelled', undefined]) {
      const jobs = { ok: true, json: async () => ({ jobs: [{ id: 1, name: 'autopilot',
        steps: [{ name: 'Claude Code', conclusion }] }] }) };
      t('実費行の欠測をモデル消費ゼロにしない',
        (await fetchRunCost('o/r', 'tok', '1', { fetchImpl: mk(jobs, withLog('no result')) })).state === 'unreadable');
    }
    t('**ログが 410 なら gone**（保持期間切れ。実費が無かったのではない）',
      (await fetchRunCost('o/r', 'tok', '1',
        { fetchImpl: mk(okJobs, { ok: false, status: 410 }) })).state === 'gone');
    t('**一時的な失敗は unreadable**（除外に積ませない）',
      (await fetchRunCost('o/r', 'tok', '1',
        { fetchImpl: mk(okJobs, { ok: false, status: 500 }) })).state === 'unreadable');
    t('403 も unreadable（権限は復旧しうる）',
      (await fetchRunCost('o/r', 'tok', '1',
        { fetchImpl: mk(okJobs, { ok: false, status: 403 }) })).state === 'unreadable');
    t('例外も unreadable',
      (await fetchRunCost('o/r', 'tok', '1',
        { fetchImpl: () => { throw new Error('network'); } })).state === 'unreadable');
    t('run ごと 404 なら gone',
      (await fetchRunCost('o/r', 'tok', '1',
        { fetchImpl: mk({ ok: false, status: 404 }, null) })).state === 'gone');
    t('jobs が 5xx なら unreadable',
      (await fetchRunCost('o/r', 'tok', '1',
        { fetchImpl: mk({ ok: false, status: 502 }, null) })).state === 'unreadable');
    t('**CCRのセッションidは Actions へ投げない**',
      (await fetchRunCost('o/r', 'tok', 'cse_01VZ',
        { fetchImpl: () => { throw new Error('投げてはいけない'); } })).state === 'gone');
  }

  // 閉じ条件: 入力が取れないときは閉じない
  const noApi = CLOSE_CHECKS.ledger_covers_runs({}, { workflowRuns: null, runsDoc: { runs: [] } });
  t('API未取得では閉じない', noApi.closed === false);
  t('manual は閉じない', CLOSE_CHECKS.manual({}, {}).closed === false);
  // **手で書いた観測が次の実行で消える**のを防ぐ口。2026-08-26 に
  // evidence へ直接書いて消えたのが動機。
  t('manual は observed を人向け出力へ通す',
    CLOSE_CHECKS.manual({ observed: 'GH_PAT の Last updated は last week' }, {})
      .evidence.includes('Last updated は last week'));
  t('manual は observed があっても閉じない',
    CLOSE_CHECKS.manual({ observed: '回した' }, {}).closed === false);
  t('manual は observed 未指定なら従来の文面',
    CLOSE_CHECKS.manual({}, {}).evidence === 'リポジトリから検査できない（人が閉じる）');

  // 閉じ条件: script_ok の入力検証
  t('script_ok はパスを検証する', CLOSE_CHECKS.script_ok({ script: '../etc/passwd' }, {}).closed === false);
  t('script_ok は引数を検証する',
    CLOSE_CHECKS.script_ok({ script: 'scripts/autopilot-act.mjs', args: ['; rm -rf /'] }, {}).closed === false);

  // 導出: 連続する即時失敗を1件にまとめる
  const d = derive({
    today: '2026-08-25', selfheal: { targets: [] }, statusDoc: null, costDoc: null,
    runsDoc: { runs: [
      { run_id: 'a', route: 'actions', date_jst: '2026-08-24', attempted: true, outcome: 'failed', failure_class: 'immediate_failure', external_ref: '1' },
      { run_id: 'b', route: 'actions', date_jst: '2026-08-25', attempted: true, outcome: 'failed', failure_class: 'immediate_failure', external_ref: '2' },
    ] },
  });
  const cred = d.filter((x) => x.source === 'credential');
  t('連続即時失敗は1件に集約', cred.length === 1);
  // **原因を名乗らせない。**旧版はここで force_owner:'human' を立て、
  // 復旧手順を鍵の再発行だけにしていた。即死の原因には セッションが直せるもの
  // （--model の指定・上流の版）も含まれるので、人へ固定すると発見が遅れる。
  // 2026-08-26 の実測では実際の原因は資格情報だったが、**それは実験が
  // 答えを出したからそう言えるのであって、固定してよい理由にはならない。**
  t('即時失敗を人へ固定しない', cred[0]?.force_owner == null);
  // 旧: 「上流の版」が「資格情報」より先に来ること（費用の安い順）。
  // **08-26 に順序ごと入れ替えた。**いちばん安くて決定的なのは、失敗した回に
  // 自動で走る切り分けステップの結論を読むことで、それが資格情報を直接答える。
  t('切り分けは自動判定ステップから始まる',
    cred[0]?.detail.indexOf('即死が資格情報かを切り分ける') >= 0
    && cred[0]?.detail.indexOf('即死が資格情報かを切り分ける') < cred[0]?.detail.indexOf('装置が無い回の手順'));
  t('切り分けに3つの分岐（failure/success/判定不能）がある',
    cred[0]?.detail.includes('判定不能'));
  t('SHA差を版の証拠として読ませない',
    cred[0]?.detail.includes('SHAが違うこと自体は版が原因である証拠にならない'));
  t('再発判定は immediate_failure で見る',
    cred[0]?.close_check?.params?.failure_class === 'immediate_failure');

  // 旧種別で書かれた行も拾う（台帳に残っている過去の行が消えないように）
  const legacy = derive({
    today: '2026-08-25', selfheal: { targets: [] }, statusDoc: null, costDoc: null,
    runsDoc: { runs: [
      { run_id: 'a', route: 'actions', date_jst: '2026-08-24', attempted: true, outcome: 'failed', failure_class: 'auth_or_credential', external_ref: '1' },
      { run_id: 'b', route: 'actions', date_jst: '2026-08-25', attempted: true, outcome: 'failed', failure_class: 'auth_or_credential', external_ref: '2' },
    ] },
  }).filter((x) => x.source === 'credential');
  t('旧 auth_or_credential も拾う', legacy.length === 1);

  // 導出: id に日付を入れない（同じ故障が翌日も同じ id になる）
  t('id は日付を含まない', !/\d{8}/.test(cred[0]?.id ?? ''));

  // run の解釈: 即死も遅い失敗も、原因は決めつけない
  // --- 人が止めた手動起動を失敗に数えない（2026-08-25 追加）---
  // workflow_dispatch を中止しただけで翌日の記事が消える、という経路を塞ぐ。
  const cancelledManual = interpretRun({ status: 'completed', conclusion: 'cancelled',
    event: 'workflow_dispatch', id: 1, steps: [] });
  t('手動起動の中止は記録対象外', cancelledManual.skip === true);
  const cancelledSchedule = interpretRun({ status: 'completed', conclusion: 'cancelled',
    event: 'schedule', id: 2, steps: [] });
  t('schedule の中止は失敗として残す',
    cancelledSchedule.skip === undefined && cancelledSchedule.outcome === 'cancelled');

  // 記録対象外の run が1件あるだけで台帳同期の依頼が永久に開かないこと
  const covers = CLOSE_CHECKS.ledger_covers_runs({}, {
    runsDoc: { runs: [] },
    workflowRuns: [{ id: 1, status: 'completed', conclusion: 'cancelled',
      event: 'workflow_dispatch', steps: [] }] });
  t('記録対象外だけなら閉じる', covers.closed === true);
  t('除外を隠さない', covers.evidence.includes('記録対象外 1件'));
  // 走行中の run も未同期に数えない（まだ結果が無いだけ）
  t('走行中は未同期に数えない', CLOSE_CHECKS.ledger_covers_runs({}, {
    runsDoc: { runs: [] },
    workflowRuns: [{ id: 9, status: 'in_progress', steps: [] }] }).closed === true);

  const fast = interpretRun({ status: 'completed', conclusion: 'failure', steps: [
    { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'failure',
      started_at: '2026-08-25T06:24:00Z', completed_at: '2026-08-25T06:24:00.486Z' }] });
  // 486ms は 2026-08-24/25 の実測値。当時これを auth_or_credential と書いたが、
  // 実際は上流 action の版の破損だった。**形は書く、原因は書かない。**
  t('即死は形だけ書く', fast.failure_class === 'immediate_failure');
  t('即死も要トリアージ', fast.needs_triage === true);
  t('即死の理由に原因を断定させない', !fast.failure_reason.includes('認証系の疑いが強い'));
  // 旧: `Download action repository` のSHA比較を最初の切り分けとして書かせていた。
  // **2026-08-26 の実測でこれは外した。**@v1 のようなフローティングタグでは
  // 日をまたげばSHAはほぼ必ず違うので、この対照は当たり前に「違い」を見つける。
  // 実際それで版を原因と読み、資格情報という真の原因を1日見落とした。
  t('即死の理由に、SHA差は版の証拠にならないと書く',
    fast.failure_reason.includes('SHAが違うことは版が原因である証拠にならない'));
  t('即死の理由に、実測で資格情報だったと書く',
    fast.failure_reason.includes('資格情報が原因だった'));
  t('即死の理由に、費用付きの再現手順を書く',
    fast.failure_reason.includes('claude -p') && fast.failure_reason.includes('$0.04'));
  t('切り分けステップが無い回は要トリアージのまま', fast.needs_triage === true);

  // **ワークフローの切り分けステップが答えを出しているときは推測しない。**
  // 2026-08-26 に手で1回やった実験を、失敗した回に自動で走らせている。
  const withProbe = (probeConclusion) => interpretRun({
    status: 'completed', conclusion: 'failure',
    steps: [
      { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'failure',
        started_at: '2026-08-25T06:24:00Z', completed_at: '2026-08-25T06:24:00.486Z' },
      { name: '即死が資格情報かを切り分ける', conclusion: probeConclusion },
    ],
  });
  const credBad = withProbe('failure');
  t('単独実行も落ちたら資格情報と書く', credBad.failure_reason.includes('資格情報が通っていない'));
  t('資格情報と分かったらトリアージへ回さない', credBad.needs_triage === false);
  t('資格情報と分かってもオーナー作業を名指しする',
    credBad.failure_reason.includes('claude setup-token'));
  const credOk = withProbe('success');
  t('単独実行が通ったら資格情報を疑わせない', credOk.failure_reason.includes('資格情報は通っている'));
  t('資格情報以外は要トリアージ', credOk.needs_triage === true);
  t('資格情報が無事なら次の候補を名指しする', credOk.failure_reason.includes('model-routing.json'));
  // **判定不能を「無事」と混ぜない。**CLIが入る前に落ちた回はここに来る。
  t('切り分けが skipped なら従来どおり要トリアージ', withProbe('skipped').needs_triage === true);
  for (const probeConclusion of ['success', 'failure']) {
    const result = interpretRun({ ...observedRun, steps: [
      ...observedRun.steps,
      { name: '即死が資格情報かを切り分ける', conclusion: probeConclusion },
      { name: '資格情報の診断は判定不能', conclusion: 'failure' },
    ] });
    t(`診断が判定不能なら成功・失敗の印から認証を断定しない: ${probeConclusion}`,
      result.needs_triage === true && result.failure_reason.includes('診断は判定不能')
      && !result.failure_reason.includes('資格情報は通っている')
      && !result.failure_reason.includes('更新する必要がある'));
  }
  {
    const { validate: validateRepair, analyze: analyzeRepair } = await import('./autopilot-selfheal.mjs');
    const matrix = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/authority-matrix.json'), 'utf8'));
    const observation = { id: 90001, created_at: '2026-09-05T00:00:00Z', status: 'completed',
      conclusion: 'failure', event: 'schedule', steps: [
        { name: 'Claude Code', conclusion: 'failure', started_at: '2026-09-05T00:00:00Z',
          completed_at: '2026-09-05T00:00:20Z' },
        { name: '資格情報の診断は判定不能', conclusion: 'failure' },
      ] };
    const row = { run_id: 'fixture-unknown', route: 'actions', external_ref: String(observation.id),
      ...interpretRun(observation),
      ...detectionEvidence(observation, 'workflow_dispatch', new Date('2026-09-05T00:01:00Z')) };
    t('実際の診断導出と検知証拠が自己修復検査を通る（原因は未確定）',
      row.failure_class === null && validateRepair({ runs: [row] }, matrix).length === 0);
    const pending = analyzeRepair({ runs: [row] }, matrix, []);
    t('診断未確定を未修理件数と調査対象に残す',
      pending.unrepaired_count === 1 && pending.targets[0].needs_triage && pending.lane_f_required);
  }
  t('切り分けが skipped なら資格情報を無事と書かない',
    !withProbe('skipped').failure_reason.includes('資格情報は通っている'));
  // 形（failure_class）は据え置き。種別を動かすと D5 の連続判定と
  // close_check の再発判定が別種別として数え直される。
  t('切り分けの結果で failure_class は動かさない',
    credBad.failure_class === 'immediate_failure' && credOk.failure_class === 'immediate_failure');

  // 【2026-09-01】使用量上限（429）を資格情報の失効と混ぜない。
  // **実際の形は probe=success + 使用量上限=failure。**429 のとき切り分け
  // ステップは exit 0 で抜ける（鍵は無事なので資格情報の判定としては正しい）ので、
  // 上限のステップを先に読まないと「資格情報は通っている → model-routing を見ろ」
  // に化ける。08-30・08-31 に実際に化けたのは2値しか無かった頃の逆側で、
  // 「資格情報が通っていない → setup-token を再実行せよ」だった。
  const withLimit = interpretRun({
    status: 'completed', conclusion: 'failure',
    steps: [
      { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'failure',
        started_at: '2026-08-30T23:07:49Z', completed_at: '2026-08-30T23:08:01.4Z' },
      { name: '即死が資格情報かを切り分ける', conclusion: 'success' },
      { name: '使用量上限で止まっている', conclusion: 'failure' },
    ],
  });
  t('使用量上限は使用量上限と書く', withLimit.failure_reason.includes('HTTP 429'));
  t('使用量上限で資格情報を疑わせない',
    !withLimit.failure_reason.includes('資格情報が通っていない'));
  t('使用量上限で鍵の入れ替えを指示しない',
    !withLimit.failure_reason.includes('claude setup-token'));
  t('使用量上限で「資格情報は通っている→model-routing」に化けない',
    !withLimit.failure_reason.includes('model-routing.json'));
  t('使用量上限は入れ替えが無駄だと明示する',
    withLimit.failure_reason.includes('入れ替えても直らない'));
  t('使用量上限は副系も同時に落ちると書く', withLimit.failure_reason.includes('副系CCR'));
  t('使用量上限は時間で戻るのでトリアージへ回さない', withLimit.needs_triage === false);
  // **上限だけは形ではなく原因で種別を付ける。**実測12.4秒は5秒規則に
  // 引っかからず、形に寄せると `null` になる —— failed なのに種別が無い行は
  // autopilot-selfheal が落とす。原因が1つに絞れているので、絞れたものを書く。
  t('使用量上限は原因を種別に書く', withLimit.failure_class === 'usage_limit');
  const withLimitFast = interpretRun({
    status: 'completed', conclusion: 'failure',
    steps: [
      { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'failure',
        started_at: '2026-08-30T23:07:49Z', completed_at: '2026-08-30T23:07:49.5Z' },
      { name: '即死が資格情報かを切り分ける', conclusion: 'success' },
      { name: '使用量上限で止まっている', conclusion: 'failure' },
    ],
  });
  t('上限は速くても遅くても同じ種別（形で揺れない）', withLimitFast.failure_class === 'usage_limit');
  // このステップを持たない過去の run は、従来どおりの判定に落ちる
  t('上限ステップが無い回は従来どおり', credBad.failure_reason.includes('資格情報が通っていない'));
  // step() は名前の部分一致なので、**別のステップに巻き込まれないこと**を見る。
  // 「予算ゲート（当月の実費が上限を超えていたら走らない）」は「上限」を含む。
  const notLimit = interpretRun({
    status: 'completed', conclusion: 'failure',
    steps: [
      { name: '予算ゲート（当月の実費が上限を超えていたら走らない）', conclusion: 'failure' },
      { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'failure',
        started_at: '2026-08-30T23:07:49Z', completed_at: '2026-08-30T23:08:01.4Z' },
      { name: '即死が資格情報かを切り分ける', conclusion: 'failure' },
    ],
  });
  t('「上限」を含む別ステップを使用量上限と読まない',
    notLimit.failure_class !== 'usage_limit'
      && notLimit.failure_reason.includes('資格情報が通っていない'));
  const slow = interpretRun({ status: 'completed', conclusion: 'failure', steps: [
    { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'failure',
      started_at: '2026-08-25T06:24:00Z', completed_at: '2026-08-25T06:44:00Z' }] });
  t('遅い失敗は種別を決めつけない', slow.failure_class === null && slow.needs_triage === true);
  const gated = interpretRun({ status: 'completed', conclusion: 'success', steps: [
    { name: 'Gate（秘密鍵・当日重複の事前チェック）', conclusion: 'success' },
    { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'skipped' }] });
  t('Gateスキップは着手にしない', gated.outcome === 'skipped_gate' && gated.attempted === false);
  // 止まった理由を「いずれか」で書かない。4通りはステップの実行結果で一意に決まる
  const skipped = (steps) => interpretRun({ status: 'completed', conclusion: 'success',
    steps: [...steps, { name: 'Claude Code（Runbook 1イテレーション実行）', conclusion: 'skipped' }] });
  const GATE = { name: 'Gate（秘密鍵・当日重複の事前チェック）', conclusion: 'success' };
  const ESTOP = (c) => ({ name: '緊急停止の確認', conclusion: c });
  const BUDGET = (c) => ({ name: '予算ゲート（当月の実費が上限を超えていたら走らない）', conclusion: c });
  const ROUTE = (c) => ({ name: 'タスク種別とモデルの振り分け', conclusion: c });
  t('Gateで止まった日はGateと書く',
    skipped([GATE, ESTOP('skipped'), BUDGET('skipped'), ROUTE('skipped')]).note.includes('Gate で止まった'));
  t('緊急停止の日は緊急停止と書く',
    skipped([GATE, ESTOP('failure')]).note.includes('緊急停止が立っていた'));
  t('月次上限の日は月次上限と書く',
    skipped([GATE, ESTOP('success'), BUDGET('success'), ROUTE('skipped')]).note.includes('月次上限'));
  t('1回上限の日は1回上限と書く',
    skipped([GATE, ESTOP('success'), BUDGET('success'), ROUTE('success')]).note.includes('1回あたりの実費上限'));
  t('1回上限の日に解除が人間のみと書く',
    skipped([GATE, ESTOP('success'), BUDGET('success'), ROUTE('success')]).note.includes('人間のみ'));
  t('1回上限の日も着手にしない',
    skipped([GATE, ESTOP('success'), BUDGET('success'), ROUTE('success')]).attempted === false);
  t('ステップ情報が無ければ理由を断定しない',
    interpretRun({ status: 'completed', conclusion: 'success', steps: [] }).note.includes('判定できない'));
  t('走行中は判定しない', interpretRun({ status: 'in_progress', steps: [] }) === null);

  // merge: 同じ id は二重に生えない
  const ledger = { actions: [] };
  merge(ledger, d, '2026-08-25');
  merge(ledger, d, '2026-08-26');
  t('同じ導出は二重に生えない', ledger.actions.length === d.length);
  t('last_seen が更新される', ledger.actions[0].last_seen_jst === '2026-08-26');

  // reconcile: 検査が例外を投げても開いたまま
  const broken = { actions: [{ id: 'x', state: 'open', created_jst: '2026-08-01',
    close_check: { kind: 'run_repaired', params: {} } }] };
  reconcile(broken, {});
  t('検査が壊れても閉じない', broken.actions[0].state === 'open');

  // --- 判定コードの写し（2026-09-04）-------------------------------------
  {
    const stepsOf = (...names) => names.map(([name, conclusion]) => ({ name, conclusion }));
    const mk = (steps) => ({ id: 1, status: 'completed', conclusion: 'success', event: 'schedule',
      jst_date: '2026-09-05', steps });
    t('判定コードの写しが無ければ null（過去の run を「記録があった」ことにしない）',
      declaredGateCode(mk(stepsOf(['Gate（秘密鍵）', 'success']))) === null);
    t('**ステップ名から判定コードを読む**',
      declaredGateCode(mk(stepsOf(['判定コード: skip_already_shipped', 'success']))) === 'skip_already_shipped');
    t('**式が展開されず空になった名前を「読めた」と読まない**',
      declaredGateCode(mk(stepsOf(['判定コード: ', 'success']))) === null);
    t('前方一致で他のステップを拾わない',
      declaredGateCode(mk(stepsOf(['まとめ 判定コード: x', 'success']))) === null);

    // 一意に決まる3分岐。**写しが無くても名前が付く。**
    const skipped = (extra) => mk([...extra, { name: 'Claude Code', conclusion: 'skipped' }]);
    t('緊急停止は写し無しでも emergency_stop',
      interpretRun(skipped(stepsOf(['Gate', 'success'], ['緊急停止の確認', 'failure']))).gate_code === 'emergency_stop');
    t('1回あたりの上限は写し無しでも skip_run_cap',
      interpretRun(skipped(stepsOf(['Gate', 'success'], ['緊急停止の確認', 'success'],
        ['予算ゲート', 'success'], ['振り分け', 'success']))).gate_code === 'skip_run_cap');
    t('月次上限は写し無しでも skip_budget',
      interpretRun(skipped(stepsOf(['Gate', 'success'], ['緊急停止の確認', 'success'],
        ['予算ゲート', 'success'], ['振り分け', 'skipped']))).gate_code === 'skip_budget');
    t('**秘密鍵未設定と当日重複は、写しが無ければ決まらない**（推測しない）',
      interpretRun(skipped(stepsOf(['Gate', 'success'], ['緊急停止の確認', 'skipped'],
        ['予算ゲート', 'skipped'], ['振り分け', 'skipped']))).gate_code === null);
    t('**写しがあれば、その1つも決まる**',
      interpretRun(skipped(stepsOf(['Gate', 'success'], ['判定コード: skip_secrets', 'success'],
        ['緊急停止の確認', 'skipped'], ['予算ゲート', 'skipped'], ['振り分け', 'skipped']))).gate_code === 'skip_secrets');
    t('**鍵の失効は「設計どおり」ではない**', verdictFor('fail_credential') === 'declined_by_fault');
    t('API に届かないのも故障側', verdictFor('fail_api') === 'declined_by_fault');
    t('判定器が落ちたのも故障側', verdictFor('preflight_error') === 'declined_by_fault');
    t('秘密鍵未設定は設計どおりの棄却', verdictFor('skip_secrets') === 'declined_by_design');
    t('当日重複も設計どおりの棄却', verdictFor('skip_already_shipped') === 'declined_by_design');
    t('出荷した回に判定コードは付かない',
      interpretRun(mk([{ name: 'Claude Code', conclusion: 'success' }])).gate_code === undefined);
  }

  if (fails.length) {
    console.error('自己検査に失敗:');
    for (const f of fails) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`自己検査 OK（${count} 項目）`);
}

// ============================================================
// CLI
// ============================================================
/**
 * 台帳を読む。**「無い」と「読めない」を混ぜない。**
 *
 * [2026-08-26] これまでは `try { JSON.parse(...) } catch { return fallback }` で、
 * **構文が壊れたファイルを既定値に落としていた。**実測すると
 * `data/authority-matrix.json` を壊しても `--check` は exit 0 を返した ——
 * 権限表が空になると classify は全部 human を返す（安全側ではある）が、
 * **壊れていることを誰も知らないまま縮退で走り続ける。**
 *
 * 無い（初回など）は既定でよい。読めないのは止める。
 */
function readJson(p, fallback = null) {
  if (!fs.existsSync(p)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`${p} を読めない（${e.message}）`
      + ' — **壊れた台帳を既定値に落とさない。**「無い」と「読めない」は違う');
  }
}

/**
 * 監視ラベルごとのopen一覧を統合し、台帳で追跡中のIssueは個別にも照会する。
 * 一覧に無い理由にはラベル削除や取得範囲外もある。閉鎖はGET /issues/{番号}で
 * state=closedを確認した場合だけ。取得失敗はnullまたは個別状態不明として保つ。
 */
export async function fetchOpenHealthIssues(repo, token, { fetchImpl = fetch, perPage = 100,
  maxPages = 5, watched = [] } = {}) {
  const result = await fetchOpenIssues({ repo, token, fetchImpl, perPage, maxPages });
  if (result.issues === null) return null;
  const out = new Map(result.issues.map(issue => [issue.number, issue]));
  const missing = [...new Set(watched)].filter(n => Number.isInteger(n) && n > 0 && !out.has(n));
  // 追跡数が異常に増えてもAPIを際限なく呼ばない。未取得は判定不能のまま残す。
  for (const number of missing.slice(0, 100)) {
    try {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${number}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const issue = await res.json();
      if (issue?.number === number && !issue.pull_request && ['open', 'closed'].includes(issue.state)) out.set(number, issue);
    } catch { /* 個別状態不明。閉じたとは推定しない。 */ }
  }
  return out;
}

async function buildContext(today, ledger = null) {
  const completion = await completionOrigin();
  const runsDoc = readJson(RUNS_PATH, { runs: [] });
  // **空の権限表で分類しない。**{} だと classify は全部 human を返すので
  // 安全側ではあるが、**権限表が無いまま「分類した」ことになる。**
  const matrix = requireShape(readJson(MATRIX_PATH, {}), ['self_repair'],
    { what: 'data/authority-matrix.json', why: '所有者の判定が成り立たない' });
  const costDoc = readJson(COST_PATH, null);
  const statusDoc = readJson(STATUS_PATH, null);
  const routineDoc = readJson(ROUTINE_PATH, null);
  const repo = process.env.GITHUB_REPOSITORY || 'simplememofast/simplememo';
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

  // selfheal は自前で持たず、既存スクリプトの --json をそのまま使う。
  // 同じ判定を2箇所に持つと、必ず片方だけ直される日が来る。
  let selfheal = null;
  try {
    selfheal = JSON.parse(execFileSync(process.execPath,
      [path.join(ROOT, 'scripts/autopilot-selfheal.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8' }));
  } catch (e) {
    console.error(`# selfheal の判定を取得できなかった: ${e.message}`);
  }
  // 実費ゲートも自前で判定しない（selfheal と同じ理由）。上限の判定を
  // 2箇所に持つと、片方だけ直される日が必ず来る。
  let budget = null;
  try {
    budget = JSON.parse(execFileSync(process.execPath,
      [path.join(ROOT, 'scripts/autopilot-budget.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8' }));
  } catch (e) {
    console.error(`# 実費ゲートの判定を取得できなかった: ${e.message}`);
  }
  const workflowRuns = await fetchWorkflowRuns(repo, token);
  const orphans = await fetchOrphanedCommits(repo, token, today,
    { watchSince: orphanWatchSince(ledger) });
  // **issue_closed の材料。**取れなければ null のまま渡す（判定不能を回復と読ませない）。
  const watched = (ledger?.actions ?? []).filter(a => a.state !== 'done' && a.close_check?.kind === 'issue_closed')
    .map(a => a.close_check.params?.issue);
  const issues = await fetchOpenHealthIssues(repo, token, { watched });
  if (issues === null) console.error('# 監視Issueの一覧を取得できず判定不能（台帳を解決扱いにしない）');
  // 台帳そのものも渡す。**handler が積んだ状態（除外一覧）を導出が読めないと、
  // 題と根拠で違う件数が出る。**判定には使わない —— 使うのは件数の表示だけ。
  return { today, runsDoc, matrix, costDoc, statusDoc, routineDoc, selfheal, budget, workflowRuns, orphans, issues,
    ledgerDoc: ledger, repo, token, eventName: process.env.GITHUB_EVENT_NAME, completion,
    // 採点の方針（L4・読むだけ）。D8 の月次追認と、その閉じ条件が accepted_modes を見る
    scorePolicy: readJson(path.join(ROOT, 'data/autonomy-score.json')) };
}

/** Sync runs first, then collect their costs in the same observation.
 * The second phase can only run append-cost; repair/containment handlers are not retried.
 */
export async function applyLedgerCycle(ledger, ctx, { today, matrix, eligibility, judgements,
  refresh, recordJudgements, handlers = HANDLERS, judgeCandidate = judge }) {
  const applied = [];
  for (const costPhase of [false, true]) {
    for (const a of ledger.actions) {
      if ((a.auto === 'append-cost') !== costPhase) continue;
      if (a.state !== 'open' || !a.auto || a.pending_pr) continue;
      // 自動実行は ai と判定されたものだけ。人の領域のアクションに
      // handler を付けたくなったら、まず classify を通ることを確かめる。
      const c = classify(a, matrix);
      if (c.owner !== 'ai') continue;
      // **押せないものは押しに行かない。**handler がファイルを書けても、
      // その後の push が remote rejected になるだけで、書きかけが残る。
      if (c.unattended_blocked) continue;
      // Record before invoking the handler; R2 must never reach its side effect.
      const decision = judgeCandidate({ ...a, close_check_kind: a.close_check?.kind }, eligibility);
      judgements.judgements = mergeJudgements(judgements.judgements, [decision]);
      recordJudgements(judgements);
      if (decision.halted) {
        applied.push({ handler: a.auto, ok: false, changed: 0, log: decision.reasons.join('; ') });
        continue;
      }
      const h = handlers[a.auto];
      if (!h) continue;
      let r;
      try { r = await h(ctx, a); }
      catch (e) { r = { ok: false, changed: 0, log: `handler が例外: ${e.message}` }; }
      applied.push({ handler: a.auto, ...r });
      a.last_run_jst = today;
      a.last_run_log = String(r.log ?? '').slice(0, 2000);
    }
    await refresh(ctx);
    merge(ledger, derive(ctx), today);
    reconcile(ledger, ctx);
  }
  return applied;
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(`--${f}`);

  if (has('selftest')) return await selftest();

  const today = jstToday();

  // status JSON の鮮度だけを見るモード（閉じ条件から呼ばれる）。
  if (has('status-fresh')) {
    const s = readJson(STATUS_PATH, null);
    const behind = s?.date_jst ? daysBetween(s.date_jst, today) : null;
    if (behind == null) { console.error('status JSON を読めない'); process.exit(1); }
    if (behind >= 2) { console.error(`status JSON が ${behind}日前（${s.date_jst}）`); process.exit(1); }
    console.log(`status JSON は ${s.date_jst}（${behind}日前）`);
    return;
  }

  const ledger = readJson(ACTIONS_PATH, null);
  if (!ledger) {
    console.error(`${ACTIONS_PATH} を読めない。台帳が無いと何も判定できない。`);
    process.exit(1);
  }
  // **空の権限表で分類しない。**{} だと classify は全部 human を返すので
  // 安全側ではあるが、**権限表が無いまま「分類した」ことになる。**
  const matrix = requireShape(readJson(MATRIX_PATH, {}), ['self_repair'],
    { what: 'data/authority-matrix.json', why: '所有者の判定が成り立たない' });

  if (has('check')) {
    const problems = validateLedger(ledger, matrix);
    if (problems.length) {
      console.error('アクション台帳が不正:');
      for (const p of problems) console.error(`  - ${p}`);
      console.error('\n閉じ条件の無い依頼は永久に残り、権限の検査を欠いた自動実行は権限の拡大になる。');
      process.exit(1);
    }
    console.log(`アクション台帳 OK（${ledger.actions.length}件・未処理 ${ledger.actions.filter((a) => a.state === 'open').length}件）`);
    return;
  }

  const ctx = await buildContext(today, ledger);
  merge(ledger, derive(ctx), today);
  reconcile(ledger, ctx);

  // --apply のときだけ、実際に手を動かす。
  const applied = [];
  if (has('apply')) {
    const eligibility = loadEligibility({ today });
    const judgements = readJson(ELIGIBILITY_LOG, { judgements: [] });
    applied.push(...await applyLedgerCycle(ledger, ctx, {
      today, matrix, eligibility, judgements,
      recordJudgements: doc => fs.writeFileSync(ELIGIBILITY_LOG, JSON.stringify(doc, null, 2) + '\n'),
      refresh: current => {
        current.runsDoc = readJson(RUNS_PATH, { runs: [] });
        current.costDoc = readJson(COST_PATH, null);
        current.statusDoc = readJson(STATUS_PATH, null);
        for (const [key, script] of [['selfheal', 'autopilot-selfheal'], ['budget', 'autopilot-budget']]) {
          try {
            current[key] = JSON.parse(execFileSync(process.execPath,
              [path.join(ROOT, `scripts/${script}.mjs`), '--json'], { cwd: ROOT, encoding: 'utf8' }));
          } catch { current[key] = null; /* 読めない判定を古い値で閉じない */ }
        }
      },
    }));

    const problems = validateLedger(ledger, matrix);
    if (problems.length) {
      console.error('書き込み前の検査で台帳が不正になった。書かずに終了する:');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    ledger.last_run_jst = today;
    fs.writeFileSync(ACTIONS_PATH, JSON.stringify(ledger, null, 2) + '\n');
  }

  const sum = summarize(ledger, matrix, today);

  // 日報メールが読む形。**status JSON には入れない。**
  // 同じPRで status JSON を触ると、当日のオートパイロットPRがまだ開いている日に
  // 衝突を起こす。別ファイルなら、片方が読めなくてももう片方は届く。
  const payload = {
      as_of_jst: today,
      routine_snapshot_sha256: routineSnapshotDigest(ctx.routineDoc),
      open_total: sum.open_total,
      pending_pr: sum.pending_pr.map(a => ({ id: a.id, title: a.title, pr: a.pending_pr.number,
        first_verified_head: a.pending_pr.head_sha, evidence: a.evidence })),
      oldest_open_days: sum.oldest_open_days,
      acknowledged: sum.acknowledged,
      closed_today: sum.closed_today.map((a) => ({ id: a.id, title: a.title, evidence: a.evidence })),
      human: sum.human.map((a) => ({ id: a.id, title: a.title, detail: a.detail,
        age_days: a.age_days, why: a.owner_why, evidence: a.evidence,
        // **「まだ着手できない」を「放置している」と読ませないための1欄。**
        // age_days は行が立ってからの日数で、期日待ちと放置を区別できない。
        // owner_direct（simplememo-api）はこれがあれば**その日から**滞留を数える。
        not_before_jst: a.not_before_jst ?? null })),
      // detail は AI 行にも入れる。**日報メールだけの出力ではなくなったため。**
      // 主系のプロンプトはこのレポートを「保留事項」の参照先にしており、
      // AI が自分の行を実行するには detail（手順・解除コマンド・判断の根拠）が要る。
      // 台帳そのもの（data/autopilot-actions.json）を読ませない理由は、
      // **閉じた行が消えずに貯まる**から —— 2026-08-25 時点で 14行中9行が done で
      // 22,533文字。AUTOPILOT_LOG.md と同じ「毎回読ませると増え続ける」形になる。
      // こちらは open と当日クローズだけなので、**未処理の件数でしか増えない。**
      ai: sum.ai.map((a) => ({ id: a.id, title: a.title, detail: a.detail,
        age_days: a.age_days, auto: a.auto, evidence: a.evidence })),
      executed: applied.map((r) => ({ handler: r.handler, ok: r.ok, changed: r.changed, log: r.log })),
  };

  const emitTo = argv.includes('--emit-report') ? argv[argv.indexOf('--emit-report') + 1] : null;
  if (emitTo) {
    // 生成物であって台帳ではない。台帳（data/autopilot-actions.json）が正で、
    // これはその日の描画結果。**2つの正を作らない。**
    fs.writeFileSync(path.join(ROOT, emitTo), JSON.stringify(payload, null, 2) + '\n');
  }

  if (has('json')) { console.log(JSON.stringify(payload, null, 2)); return; }

  console.log(render(sum, applied, today));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
