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

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireShape } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ACTIONS_PATH = path.join(ROOT, 'data/autopilot-actions.json');
const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
const COST_PATH = path.join(ROOT, 'data/autopilot-cost.json');
const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');
const STATUS_PATH = path.join(ROOT, 'data/autopilot-status.json');

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

export const CLOSE_CHECKS = {
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
  cost_covers_runs({ exclude = [] }, ctx) {
    if (!ctx.costDoc) return { closed: false, evidence: '実費台帳を読めず判定不能' };
    const costed = new Set((ctx.costDoc.runs ?? []).map((e) => String(e.run_id ?? '')));
    // **実費が原理的に存在しない run がある。** Claude Code ステップに到達せず
    // 落ちた回（apt詰まり・actor拒否など）は実行ログ自体が無いので、待っても
    // 永久に埋まらない。ここを除外しないと、この依頼は**閉じない依頼**になる
    // ——この台帳が潰したかった「堆積」そのものに戻る。
    // 除外は handler が実測（取得を試みて失敗）してから積む。最初から諦めない。
    const skip = new Set(exclude);
    const missing = (ctx.runsDoc?.runs ?? [])
      .filter((r) => r.attempted && r.external_ref
        && !costed.has(String(r.external_ref)) && !skip.has(r.run_id));
    const note = skip.size > 0 ? `（実費が存在しない ${skip.size}件を除外: ${[...skip].join(', ')}）` : '';
    return missing.length === 0
      ? { closed: true, evidence: `着手した run はすべて実費台帳にある${note}` }
      : { closed: false, evidence: `実費が未記録の run が ${missing.length}件: ${missing.map((r) => r.run_id).join(', ')}${note}` };
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
    if (!ctx.issues.has(issue)) {
      // 取得できた一覧に**無い**＝ open ではない。健康ワークフローは回復時に閉じるので、
      // 一覧が open だけを持つ前提ならこれは「閉じた」。**前提を明示しておく。**
      return { closed: true, evidence: `#${issue} は open な監視Issueの一覧に無い（回復とみなす）` };
    }
    return { closed: false, evidence: `#${issue} がまだ open` };
  },

  /**
   * 取り残しが解消したら閉じる。**判定できないときは閉じない。**
   * 走査が取れなかった回（null）を「取り残しは無い」と読むと、故障が消える方向に効く。
   */
  branch_caught_up({ pr }, ctx) {
    if (!Number.isInteger(pr)) return { closed: false, evidence: 'PR番号が指定されていない' };
    if (!Array.isArray(ctx.orphans)) {
      return { closed: false, evidence: '取り残しの走査結果を取得できず判定不能（解消したという意味ではない）' };
    }
    const still = ctx.orphans.find((o) => o.pr === pr);
    return still
      ? { closed: false, evidence: `#${pr} はまだ ${still.ahead_by} 件先にある` }
      : { closed: true, evidence: `#${pr} の取り残しは解消（走査に出てこない）` };
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
  // **自動修復はさせない。**取り残しの中身は台帳のこともあれば書きかけのこともあり、
  // 機械が中身を見ずに cherry-pick すると「訂正が生き残っているかの確認」を飛ばす。
  // 検知して起票するところまでで、適用はセッションが行う。
  for (const o of ctx.orphans ?? []) {
    out.push({
      id: `act-orphaned-pr-${o.pr}`,
      title: `PR #${o.pr} のマージ後に ${o.ahead_by} コミットが取り残されている`,
      detail: `ブランチ ${o.branch} が、マージ時の head（${o.merged_sha.slice(0, 7)}）より`
        + `${o.ahead_by} 件先にあり、**それらは main にも無い**: ${o.commits.join(', ')}。`
        + (o.landed_elsewhere ? `（別の${o.landed_elsewhere}件は後続PRで着地済みなので除外した）` : '')
        + '\n\n'
        + '**auto-merge は検証済みSHAだけをマージする設計なので、これは事故ではなく帰結。**'
        + 'PRが既に閉じているため、次の検証が拾う先が無い。\n\n'
        + '**中身を見てから適用すること。**台帳の更新なら再投入、書きかけなら捨てる。'
        + '機械が中身を見ずに cherry-pick しない（この行に auto を付けない理由）。',
      source: 'orphan',
      touches: [],
      auto: null,
      close_check: { kind: 'branch_caught_up', params: { pr: o.pr } },
    });
  }

  // --- D4: 実費台帳の取りこぼし ---
  //
  // Runbook §5-3 は「翌日のセッションが台帳へ入れる」と書いている。
  // 人手（セッション手動）の手順は、忙しい日から順に落ちる。--append は
  // run_id で冪等なので、機械が毎日やって害が無い。
  if (ctx.costDoc) {
    // 導出は運転台帳だけで完結させる（APIが読めない日でも「実費が未記録」は言える）。
    // 実際の金額はジョブログにしか無いので、取りに行くのは handler の仕事。
    const costed = new Set((ctx.costDoc.runs ?? []).map((e) => String(e.run_id ?? '')));
    const missing = runs.filter((r) => r.attempted && r.external_ref && !costed.has(String(r.external_ref)));
    if (missing.length > 0) {
      out.push({
        id: 'act-cost-sync',
        title: `実費台帳に載っていない run が ${missing.length}件`,
        detail: missing.map((r) => `${r.run_id}（run ${r.external_ref}）`).join(', ')
          + '。Runbook §5-3 は「翌日のセッションが入れる」としているが、手順は忙しい日から落ちる。',
        source: 'cost',
        touches: ['data/autopilot-cost.json'],
        auto: 'append-cost',
        close_check: { kind: 'cost_covers_runs', params: {} },
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
  const added = [];
  for (const d of derived) {
    if (byId.has(d.id)) {
      const cur = byId.get(d.id);
      cur.last_seen_jst = today;
      // 件数など、事実として動くものだけ追従させる
      if (cur.state === 'open') { cur.title = d.title; cur.detail = d.detail; }
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
  const open = ledger.actions.filter((a) => a.state === 'open');
  const rows = open.map((a) => {
    const c = classify(a, matrix);
    return { ...a, owner: c.owner, owner_why: c.why, age_days: daysBetween(a.created_jst, today) ?? 0 };
  });
  rows.sort((a, b) => (b.age_days - a.age_days) || a.id.localeCompare(b.id));
  return {
    open_total: rows.length,
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
// マージ後に取り残されたコミット
// ============================================================
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

/** 何日ぶんのマージ済みPRを見るか。**古い取り残しは拾っても直せない。** */
export const ORPHAN_LOOKBACK_DAYS = 7;

/**
 * マージ後に push された取り残しを探す。**取れなかったら null**
 * （空配列だと「取り残しは無い」＝逆の結論になる）。
 */
export async function fetchOrphanedCommits(repo, token, today, { fetchImpl = fetch } = {}) {
  if (!token) return null;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'simplememo-autopilot-act',
  };
  const get = async (url) => {
    const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  };
  try {
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - ORPHAN_LOOKBACK_DAYS * 86400000);
    const prs = await get(`https://api.github.com/repos/${repo}/pulls`
      + '?state=closed&sort=updated&direction=desc&per_page=30');
    const out = [];
    for (const pr of prs) {
      if (!pr.merged_at || Date.parse(pr.merged_at) < since.getTime()) continue;
      // ① マージ後に push されたもの ② main に無いもの —— **その積だけが取り残し。**
      let after;
      let notOnBase;
      try {
        [after, notOnBase] = await Promise.all([
          get(`https://api.github.com/repos/${repo}/compare/`
            + `${encodeURIComponent(pr.head.sha)}...${encodeURIComponent(pr.head.ref)}`),
          get(`https://api.github.com/repos/${repo}/compare/`
            + `${encodeURIComponent(pr.base.ref)}...${encodeURIComponent(pr.head.ref)}`),
        ]);
      } catch {
        continue; // ブランチが消えている（＝取り残しは起こりえない）
      }
      const missing = new Set((notOnBase.commits ?? []).map((c) => c.sha));
      const orphaned = (after.commits ?? []).filter((c) => missing.has(c.sha));
      if (orphaned.length > 0) {
        out.push({
          pr: pr.number,
          branch: pr.head.ref,
          merged_sha: pr.head.sha,
          ahead_by: orphaned.length,
          landed_elsewhere: (after.commits ?? []).length - orphaned.length,
          commits: orphaned.map((c) => c.sha.slice(0, 7)),
        });
      }
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
      if (jr.ok) steps = ((await jr.json()).jobs ?? [])[0]?.steps ?? null;
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
    let note;
    if (estop?.conclusion === 'failure') {
      note = '緊急停止が立っていたため着手しなかった（data/emergency-stop.json）';
    } else if (ran(route)) {
      // **ここが 2026-08-25 まで名前を持っていなかった停止。**解除は人間のみ
      // なので、気づかれないと毎日この形で静かに止まり続ける。
      note = '1回あたりの実費上限が未レビューのため着手しなかった'
        + '（node scripts/autopilot-budget.mjs --check-run-cap）。解除は人間のみ';
    } else if (ran(budget)) {
      note = '当月の実費が月次上限に達していたため着手しなかった（data/autopilot-cost.json）';
    } else if (ran(estop) || gate != null) {
      note = `Gate で止まった（秘密鍵未設定・当日重複のいずれか。Gate=${gate?.conclusion ?? '不明'}）`;
    } else {
      // ステップ情報が無い run（API の取得漏れなど）。**決まらないなら決めない。**
      note = `Claude Code ステップ未実行。手前のどこで止まったかはステップ情報が無く判定できない（Gate=${gate?.conclusion ?? '不明'}）`;
    }
    return { outcome: 'skipped_gate', attempted: false, failure_class: null,
      failure_reason: null, note };
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

export const HANDLERS = {
  /**
   * 運転台帳の同期。Actions API の run を台帳へ落とす。
   * autopilot-runs.mjs --append を呼ぶ（検証を通す唯一の書き込み経路）。
   */
  async 'reconcile-runs'(ctx) {
    if (!ctx.workflowRuns) return { ok: false, changed: 0, log: 'Actions API を読めず同期できない' };
    const known = new Set((ctx.runsDoc?.runs ?? []).map((r) => String(r.external_ref ?? '')));
    const log = [];
    let changed = 0;
    for (const run of ctx.workflowRuns) {
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
      const taken = new Set((ctx.runsDoc?.runs ?? []).map((r) => r.run_id));
      if (taken.has(runId)) runId = `${runId}-${run.id}`;
      if (taken.has(runId)) { log.push(`${run.id}: ${runId} が既にある`); continue; }
      // shipped は PR 番号が要る（validate が落とす）。PRの特定は機械には荷が重いので
      // **成功した回は書かない**。書かないことで指標が甘くなることは無い
      //（shipped を落とすと完走率は下がる側に倒れる）。
      if (v.outcome === 'shipped') { log.push(`${run.id}: 成功回はPR特定が要るため自動追記しない`); continue; }
      const args = ['--append', '--run-id', runId, '--date', run.jst_date, '--route', 'actions',
        '--outcome', v.outcome, '--attempted', String(v.attempted),
        '--external-ref', String(run.id), '--source', 'act-reconcile'];
      if (v.failure_reason) args.push('--failure-reason', v.failure_reason);
      if (v.failure_class) args.push('--failure-class', v.failure_class);
      if (v.needs_triage) args.push('--needs-triage', 'true');
      args.push('--detected-at', new Date().toISOString());
      try {
        const out = execFileSync(process.execPath,
          [path.join(ROOT, 'scripts/autopilot-runs.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
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
  async 'append-cost'(ctx, action) {
    if (!ctx.token || !ctx.repo) return { ok: false, changed: 0, log: '認証情報が無く実費を取得できない' };
    const costed = new Set((ctx.costDoc?.runs ?? []).map((e) => String(e.run_id ?? '')));
    const targets = (ctx.runsDoc?.runs ?? [])
      .filter((r) => r.attempted && r.external_ref && !costed.has(String(r.external_ref)))
      .slice(-10); // 一度に遡る上限。歴史全部を毎日取りに行かない
    const log = [];
    let changed = 0;
    const unmeasurable = [];
    for (const r of targets) {
      const cost = await fetchRunCost(ctx.repo, ctx.token, r.external_ref);
      if (cost == null) {
        // ジョブログに実費行が無い ＝ Claude Code ステップに到達せず落ちた回。
        // **0 を書かない**（「無料で動いた」になる）。代わりに、待っても埋まらない
        // ものとして除外に積む。積まないと、この依頼が永久に開いたままになる。
        log.push(`${r.run_id}: 実費行がジョブログに無い（0ではなく、そもそも発生していない）→ 除外に積む`);
        unmeasurable.push(r.run_id);
        continue;
      }
      const args = ['--append', '--date', r.date_jst, '--route', r.route,
        '--run-id', String(r.external_ref), '--cost', String(cost.usd),
        '--outcome', r.outcome, '--note', '日次アクチュエータが自動追記（ジョブログの result 行）'];
      if (cost.turns != null) args.push('--turns', String(cost.turns));
      // 種別は**分かるときだけ**書く。推測を入れると種別ごとの枠が静かに嘘になる。
      const kind = r.lane === 'F' ? 'repair'
        : ['new', 'refresh', 'wiring'].includes(r.action) ? 'article' : null;
      if (kind) args.push('--task-kind', kind);
      try {
        const out = execFileSync(process.execPath,
          [path.join(ROOT, 'scripts/autopilot-budget.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
        log.push(`${r.run_id}: ${out.trim()}`);
        if (!out.startsWith('skip')) changed += 1;
      } catch (e) {
        log.push(`${r.run_id}: 追記に失敗 ${e.stderr?.toString().trim() ?? e.message}`);
      }
    }
    if (unmeasurable.length > 0 && action?.close_check?.params) {
      const cur = new Set(action.close_check.params.exclude ?? []);
      for (const id of unmeasurable) cur.add(id);
      action.close_check.params.exclude = [...cur].sort();
    }
    return { ok: true, changed, log: log.join('\n') || '対象なし' };
  },

  /**
   * 封じ込め。上限に達した故障の経路を止める。
   * **止めるのはAIがやってよい（policy.ai_may_stop）。解除はしない。**
   */
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

/** ジョブログから result 行の total_cost_usd / num_turns を拾う。 */
async function fetchRunCost(repo, token, runId) {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
    'user-agent': 'simplememo-autopilot-act' };
  try {
    const jr = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`,
      { headers, signal: AbortSignal.timeout(20_000) });
    if (!jr.ok) return null;
    const jobId = ((await jr.json()).jobs ?? [])[0]?.id;
    if (!jobId) return null;
    const lr = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${jobId}/logs`,
      { headers, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!lr.ok) return null;
    const text = await lr.text();
    const cost = text.match(/"total_cost_usd"\s*:\s*([0-9.]+)/)
      ?? text.match(/AI実費:\s*\*\*\$([0-9.]+)\*\*/);
    if (!cost) return null;
    const turns = text.match(/"num_turns"\s*:\s*(\d+)/);
    return { usd: Number(cost[1]), turns: turns ? Number(turns[1]) : null };
  } catch { return null; }
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.created_jst || '')) p.push(`${at}: created_jst must be YYYY-MM-DD`);
    if (!a.title) p.push(`${at}: title is required`);
    if (!a.close_check?.kind) p.push(`${at}: close_check.kind is required — 閉じ条件の無い依頼は永久に残る`);
    else if (!CLOSE_CHECKS[a.close_check.kind]) p.push(`${at}: 未知の close_check: ${a.close_check.kind}`);
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
  if (sum.open_total === 0) L.push('', '未処理なし。');
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
  const matrix = {
    self_repair: {
      may_modify: ['data/autopilot-runs.json', '.github/workflows/obsidian-autopilot.yml'],
      unattended_cannot_push: {
        paths: ['.github/workflows/obsidian-autopilot.yml'],
        who_applies: '副系CCRセッション',
      },
      stop_after_failed_repairs: 3,
    },
    domains: [{ domain: '承認が要る領域', requires_approval: true }],
  };

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
    CLOSE_CHECKS.issue_closed({ issue: 7 }, { issues: new Map([[7, {}]]) }).closed === false);
  t('open 一覧から消えたら閉じる',
    CLOSE_CHECKS.issue_closed({ issue: 7 }, { issues: new Map([[9, {}]]) }).closed === true);
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
    const found = await fetchOrphanedCommits('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch });
    t('**後続PRで着地済みのコミットを取り残しに数えない**',
      found.length === 1 && found[0].ahead_by === 1 && found[0].commits[0] === 'orphan1');
    t('着地済みの件数を別に持つ（なぜ除いたかが読める）', found[0].landed_elsewhere === 5);
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
    const found = await fetchOrphanedCommits('o/r', 'tok', '2026-08-26', { fetchImpl: fakeFetch });
    t('マージ後に push が無ければ取り残しゼロ', found.length === 0);
  }
  {
    // **取得に失敗したら null。**空配列だと「取り残しは無い」になる
    const boom = async () => { throw new Error('network'); };
    t('**走査に失敗したら null（空配列にしない）**',
      await fetchOrphanedCommits('o/r', 'tok', '2026-08-26', { fetchImpl: boom }) === null);
    t('トークンが無ければ null', await fetchOrphanedCommits('o/r', null, '2026-08-26') === null);
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
  {
    const o = derive({ orphans: [{ pr: 586, branch: 'claude/x', merged_sha: 'abcdef1234', ahead_by: 1, commits: ['ee4e37c'] }] })
      .filter((a) => a.source === 'orphan');
    t('取り残しから行が立つ', o.length === 1 && o[0].id === 'act-orphaned-pr-586');
    t('**取り残しに auto を付けない**（中身を見ずに cherry-pick しない）', o[0].auto === null);
    t('取り残しの行に閉じ条件がある', o[0].close_check?.kind === 'branch_caught_up');
    t('走査が未取得なら行を立てない', derive({ orphans: null }).filter((a) => a.source === 'orphan').length === 0);
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
  t('run_id 無しは先に run_id を入れろと書く', (noIdDerive[0]?.detail ?? '').includes('run_id を入れる'));
  t('run_id 無しの閉じ条件は日付と種別で照合する',
    noIdDerive[0]?.close_check?.params?.date_jst === '2026-08-25'
    && noIdDerive[0]?.close_check?.params?.task_kind === 'repair');

  // 閉じ条件: 実費が原理的に存在しない run は除外できる（除外しないと永久に閉じない）
  const costCtx = { costDoc: { runs: [] }, runsDoc: { runs: [
    { run_id: 'never', attempted: true, external_ref: '1' }] } };
  t('除外前は閉じない', CLOSE_CHECKS.cost_covers_runs({}, costCtx).closed === false);
  const excluded = CLOSE_CHECKS.cost_covers_runs({ exclude: ['never'] }, costCtx);
  t('除外すれば閉じる', excluded.closed === true);
  t('除外したことを隠さない', excluded.evidence.includes('実費が存在しない 1件'));

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
  t('切り分けが skipped なら資格情報を無事と書かない',
    !withProbe('skipped').failure_reason.includes('資格情報は通っている'));
  // 形（failure_class）は据え置き。種別を動かすと D5 の連続判定と
  // close_check の再発判定が別種別として数え直される。
  t('切り分けの結果で failure_class は動かさない',
    credBad.failure_class === 'immediate_failure' && credOk.failure_class === 'immediate_failure');
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

async function buildContext(today) {
  const runsDoc = readJson(RUNS_PATH, { runs: [] });
  // **空の権限表で分類しない。**{} だと classify は全部 human を返すので
  // 安全側ではあるが、**権限表が無いまま「分類した」ことになる。**
  const matrix = requireShape(readJson(MATRIX_PATH, {}), ['self_repair'],
    { what: 'data/authority-matrix.json', why: '所有者の判定が成り立たない' });
  const costDoc = readJson(COST_PATH, null);
  const statusDoc = readJson(STATUS_PATH, null);
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
  const orphans = await fetchOrphanedCommits(repo, token, today);
  return { today, runsDoc, matrix, costDoc, statusDoc, selfheal, budget, workflowRuns, orphans, repo, token };
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

  const ctx = await buildContext(today);
  merge(ledger, derive(ctx), today);
  reconcile(ledger, ctx);

  // --apply のときだけ、実際に手を動かす。
  const applied = [];
  if (has('apply')) {
    for (const a of ledger.actions) {
      if (a.state !== 'open' || !a.auto) continue;
      // 自動実行は ai と判定されたものだけ。人の領域のアクションに
      // handler を付けたくなったら、まず classify を通ることを確かめる。
      const c = classify(a, matrix);
      if (c.owner !== 'ai') continue;
      // **押せないものは押しに行かない。**handler がファイルを書けても、
      // その後の push が remote rejected になるだけで、書きかけが残る。
      if (c.unattended_blocked) continue;
      const h = HANDLERS[a.auto];
      if (!h) continue;
      let r;
      try { r = await h(ctx, a); }
      catch (e) { r = { ok: false, changed: 0, log: `handler が例外: ${e.message}` }; }
      applied.push({ handler: a.auto, ...r });
      a.last_run_jst = today;
      a.last_run_log = String(r.log ?? '').slice(0, 2000);
    }
    // 実行で状態が変わっているので、台帳を読み直してもう一度突き合わせる。
    // （reconcile-runs が台帳を書き換えた直後に ledger_covers_runs を通したい）
    ctx.runsDoc = readJson(RUNS_PATH, { runs: [] });
    ctx.costDoc = readJson(COST_PATH, null);
    try {
      ctx.selfheal = JSON.parse(execFileSync(process.execPath,
        [path.join(ROOT, 'scripts/autopilot-selfheal.mjs'), '--json'], { cwd: ROOT, encoding: 'utf8' }));
    } catch { /* 直前の値のまま */ }
    merge(ledger, derive(ctx), today);
    reconcile(ledger, ctx);

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
      open_total: sum.open_total,
      oldest_open_days: sum.oldest_open_days,
      acknowledged: sum.acknowledged,
      closed_today: sum.closed_today.map((a) => ({ id: a.id, title: a.title, evidence: a.evidence })),
      human: sum.human.map((a) => ({ id: a.id, title: a.title, detail: a.detail,
        age_days: a.age_days, why: a.owner_why, evidence: a.evidence })),
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
