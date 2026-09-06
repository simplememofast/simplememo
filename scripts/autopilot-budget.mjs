#!/usr/bin/env node
/**
 * オートパイロットの実費台帳を集計し、月次上限で「自分を止める」判定を返す。
 *
 *   node scripts/autopilot-budget.mjs                     # 当月の集計を表示
 *   node scripts/autopilot-budget.mjs --check             # 上限超過なら exit 1
 *   node scripts/autopilot-budget.mjs --json              # 機械可読（status JSONへ差し込む用）
 *   node scripts/autopilot-budget.mjs --month 2026-08     # 月を指定
 *   node scripts/autopilot-budget.mjs --append --date 2026-08-23 --route actions \
 *        --run-id 123 --job-id 456 --cost 0.81 --turns 30 --outcome shipped
 *   node scripts/autopilot-budget.mjs --check-run-cap --task article   # 1回上限
 *   node scripts/autopilot-budget.mjs --runtime-budget --task article # SDKへ渡す支出閾値
 *   node scripts/autopilot-budget.mjs --ack-overrun <run_id> --why "…" # 人間のみ
 *
 * 【1回あたりの上限（--check-run-cap）】
 * data/model-routing.json の rules.<kind>.max_usd_per_run は長らく**宣言だけ**で、
 * 参照していたのは check-model-routing.mjs の内部整合検査だけだった。実行時に
 * 効く経路が無かったので、2026-08-23 の1回は article の上限 $2.00 に対して
 * $7.2967（3.6倍）を使い切って正常終了している。**上限は在るのに当たらなかった。**
 *
 * 2026-09-06: SDKは応答ごとに費用を加算し、--max-budget-usdで次の呼出を止められる。
 * --runtime-budget は既存の1回上限と、skip_run時の月次残枠の上界から閾値を出す。
 * 進行中の応答分は超え得るので、これは請求額の厳密な上限ではない。
 * --check-run-cap は、その種別の直近runが上限を超えたまま**未レビュー**なら
 * 非ゼロを返し、ワークフローが主系の次回をスキップする。
 *
 * 【解除は人間のみ】
 * --ack-overrun は data/authority-matrix.json の「AI実費」が人間に残している
 * `monthly_usd_cap の決定` と同じ側にある。**AIが自分の超過を自分で承認できると、
 * 上限が「お願い」になる。**止まっている間も副系CCRは別経路なので出荷は続く
 * （二重化がここで効く）ため、承認を待つ間に運用が止まることはない。
 *
 * 【なぜ表示ではなく exit code なのか】
 * 「予算を可視化した」と「予算に応じて止まる」は別物で、外に言えるのは後者だけ。
 * --check が非ゼロを返し、obsidian-autopilot.yml の Gate がそれを見て run=false に
 * する経路まで通っていて初めて、この仕組みは自己制御と呼べる。表示だけなら
 * 「見ているが従っていない」であり、それは growth/README.md が冒頭で戒めている
 * 「散文は手を挙げない」と同じ失敗の別形態になる。
 *
 * 【超過していても止めないもの】
 * 副系CCR Routine は別経路で、このスクリプトからは観測も停止もできない
 * （スケジュール起動セッションのログは外部から読めない — Runbook §0-2）。
 * したがって --check が守れるのは主系だけである。この非対称性は隠さず出力する。
 *
 * 【丸めない】
 * total_cost_usd は claude-execution-output.json の値をそのまま貯める。
 * 表示のときだけ4桁に丸める。台帳側で丸めると、月合計が実際の請求とずれる。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { load as loadRouting } from './check-model-routing.mjs';
import { OUTCOMES } from './autopilot-runs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/autopilot-cost.json');

/** JSTの暦日/暦月。CIのランナーはUTCなので、必ず明示的に変換する。 */
/** JSTの今日（YYYY-MM-DD）。cap_review の日付に使う。 */
export function todayJst(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function jstMonth(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).format(d).slice(0, 7);
}

export function loadLedger(file = LEDGER_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function runtimeBudget(ledger, routing, kind, month = jstMonth()) {
  assert(typeof kind === 'string' && Object.hasOwn(routing?.rules ?? {}, kind), 'runtime budget requires a known task kind');
  const perRun = routing.rules[kind].max_usd_per_run;
  assert(Number.isFinite(perRun) && perRun > 0, 'runtime per-run budget must be finite and positive');
  const problems = validate(ledger);
  assert(problems.length === 0, `runtime budget ledger invalid: ${problems.join('; ')}`);
  assert(Number.isFinite(ledger.budget.monthly_usd_cap)
    && ledger.runs.every(r => Number.isFinite(r.total_cost_usd)), 'runtime budget requires finite recorded costs and monthly cap');
  assert(/^\d{4}-\d{2}$/.test(month), 'runtime budget month required');
  const state = overruns(ledger, routing, { month });
  assert(!state.unreviewed.some(r => r.task_kind === kind), 'runtime budget blocked by unreviewed overrun');
  const spent = ledger.runs.filter(r => r.date_jst.startsWith(month)).reduce((sum, r) => sum + r.total_cost_usd, 0);
  const upperBound = ledger.budget.monthly_usd_cap - spent;
  const usd = ledger.budget.on_exceed === 'skip_run' ? Math.min(perRun, upperBound) : perRun;
  assert(Number.isFinite(usd) && usd > 0, 'runtime budget has no positive spending allowance');
  return { usd, per_run_usd: perRun, remaining_upper_bound_usd: upperBound };
}

export function runtimeBudgetWiring(source) {
  const blocks = source.split(/^ {6}- name: /m).slice(1);
  const step = id => {
    const matches = blocks.filter(b => new RegExp(`^ {8}id: ${id}$`, 'm').test(b));
    assert(matches.length === 1, `runtime budget requires one ${id} step`);
    return matches[0];
  };
  const route = step('route'), claude = step('claude');
  const shell = route.match(/^ {8}run: \|\n((?:(?: {10}[^\n]*|)\n)*)/m)?.[1]?.replace(/^ {10}/gm, '');
  const args = claude.match(/^ {10}claude_args: \|\n((?: {12}[^\n]*\n)*)/m)?.[1]?.replace(/^ {12}/gm, '');
  assert(shell && args, 'runtime budget execution blocks are missing');
  const activeArgs = args.split('\n').filter(line => line.trim() && !line.trimStart().startsWith('#'));
  assert(activeArgs.filter(line => /^--max-budget-usd\b/.test(line)).length === 1
    && activeArgs.includes('--max-budget-usd ${{ steps.route.outputs.runtime_budget_usd }}'), 'Claude must consume the route runtime budget exactly once');
  return { shell, args };
}

/**
 * 台帳の形を検証する。壊れた台帳は「集計できない」ではなく「上限に永久に
 * 当たらない」を意味するので、check-experiments.mjs と同じくここは常に落とす。
 */
export function validate(ledger) {
  const problems = [];
  if (!ledger || typeof ledger !== 'object') return ['ledger is not an object'];
  const b = ledger.budget;
  if (!b || typeof b !== 'object') problems.push('budget section is missing');
  else {
    if (typeof b.monthly_usd_cap !== 'number' || !(b.monthly_usd_cap > 0)) {
      problems.push('budget.monthly_usd_cap must be a positive number');
    }
    if (b.on_exceed !== 'skip_run' && b.on_exceed !== 'warn_only') {
      problems.push(`budget.on_exceed must be "skip_run" or "warn_only" (got ${JSON.stringify(b.on_exceed)})`);
    }
  }
  // 種別ごとの枠。**合計が月次上限を超えていたら、枠は装飾になる。**
  const tb = ledger.budget?.task_budgets;
  if (tb) {
    let total = 0;
    for (const [kind, v] of Object.entries(tb)) {
      if (typeof v?.monthly_usd_cap !== 'number' || !(v.monthly_usd_cap > 0)) {
        problems.push(`budget.task_budgets.${kind}.monthly_usd_cap must be a positive number`);
      } else total += v.monthly_usd_cap;
      if (!v?.note) problems.push(`budget.task_budgets.${kind}.note が無い — 枠を置いた理由が残らない`);
    }
    const cap = ledger.budget?.monthly_usd_cap;
    if (typeof cap === 'number' && total > cap + 1e-9) {
      problems.push(`budget.task_budgets の合計 $${total} が monthly_usd_cap $${cap} を超えている`
        + ' — 種別の枠を全部使うと月次上限を超える状態は、枠が装飾になっている');
    }
  }

  const an = ledger.budget?.anomaly;
  if (an) {
    for (const k of ['median_window', 'multiple', 'min_samples', 'min_absolute_usd']) {
      if (typeof an[k] !== 'number') problems.push(`budget.anomaly.${k} must be a number`);
    }
    if (an.min_samples < 2) problems.push('budget.anomaly.min_samples は2以上（1点では中央値に意味が無い）');
  }
  if (!Array.isArray(ledger.runs)) problems.push('runs must be an array');
  else {
    ledger.runs.forEach((r, i) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r?.date_jst || '')) problems.push(`runs[${i}].date_jst must be YYYY-MM-DD`);
      if (typeof r?.total_cost_usd !== 'number' || !(r.total_cost_usd >= 0)) {
        problems.push(`runs[${i}].total_cost_usd must be a non-negative number`);
      }
      if (r?.route !== 'actions' && r?.route !== 'ccr') {
        problems.push(`runs[${i}].route must be "actions" or "ccr" (got ${JSON.stringify(r?.route)})`);
      }
      // レビュー済みの印は、**理由が無ければ印ではない。**空の cap_review を
      // 置けるなら、1回上限は書き換え1文字で無効化できることになる。
      if (r?.cap_review !== undefined) {
        const cr = r.cap_review;
        if (!cr || typeof cr !== 'object') problems.push(`runs[${i}].cap_review must be an object`);
        else {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(cr.at || '')) problems.push(`runs[${i}].cap_review.at must be YYYY-MM-DD`);
          if (!cr.why || String(cr.why).trim().length < 10) {
            problems.push(`runs[${i}].cap_review.why が無い（または短すぎる） — 超過を通した理由が残らない`);
          }
          if (cr.by !== 'owner') problems.push(`runs[${i}].cap_review.by must be "owner"（1回上限の解除は人間のみ）`);
        }
      }
    });
  }
  return problems;
}

/**
 * 当月の集計。route ごとに分けるのは、主系と副系で「測れているかどうか」が
 * 違うため。合算だけ出すと、測れていない副系の消費がゼロに見えてしまう。
 */
export function summarize(ledger, month = jstMonth()) {
  const rows = ledger.runs.filter((r) => r.date_jst.startsWith(month));
  const sum = (rs) => rs.reduce((a, r) => a + r.total_cost_usd, 0);
  const actions = rows.filter((r) => r.route === 'actions');
  const ccr = rows.filter((r) => r.route === 'ccr');
  const spent = sum(rows);
  const cap = ledger.budget.monthly_usd_cap;
  const shipped = rows.filter((r) => r.outcome === 'shipped').length;
  return {
    month,
    cap,
    spent,
    // **副系が測れていない月、これは「使った額」ではなく「使った額の下限」。**
    // 名前を epistemic status ごと持たせる —— 下流はどれを引用しても嘘にならない。
    spent_is_lower_bound: ccr.length === 0,
    // **残高は、支出が全部見えているときにしか出せない。**
    // 一部しか測れていない月に `cap - spent` を「残り」と呼ぶと、
    // **測っていないぶんが「まだ使える」に化ける。**そこは null にする
    // （「判定していない」を「大丈夫」と混ぜない、というこの台帳の他の規律と同じ）。
    remaining: ccr.length > 0 ? cap - spent : null,
    // 測れているぶんだけを引いた値。**残高ではなく上限**（実際の残りはこれ以下）。
    // 名前に上限だと書いてあれば、そのまま引用されても誤りにならない。
    remaining_upper_bound: cap - spent,
    // **`over: false` は「枠内」ではない。**spent が下限なので、この判定は
    // 遅れる方向にしか外れない（早すぎる停止は起きない）。止める閾値を
    // 下限で判定してよいかは monthly_usd_cap と同じく人間側の判断なので、
    // ここでは挙動を変えずに性質だけ書いておく。
    over: spent >= cap,
    runs: rows.length,
    shipped,
    // 1記事あたり単価。shipped が 0 の月は null（0除算を「無料」と誤読させない）
    usd_per_shipped: shipped > 0 ? sum(rows) / shipped : null,
    by_route: {
      actions: { runs: actions.length, spent: sum(actions) },
      ccr: { runs: ccr.length, spent: sum(ccr) },
    },
    // 測れていない部分の明示。台帳にccr行が1件も無い月は、副系の消費が
    // ゼロなのではなく「観測手段が無い」。ここを取り違えると過少報告になる。
    ccr_measured: ccr.length > 0,
    by_task: summarizeTasks(ledger, rows),
    // 1回あたりの上限。**読めなかったら null。**「判定していない」を
    // 「超過なし」と混ぜると、routing を消すだけで上限が消える。
    run_caps: (() => {
      try { return overruns(ledger, loadRouting(), { month }); } catch { return null; }
    })(),
  };
}

/**
 * 種別ごとの消化。**分類されていない run を落とさない。**
 * 落とすと合計が合わなくなり、「使っていない」ように見える。
 */
export function summarizeTasks(ledger, rows) {
  const caps = ledger.budget?.task_budgets ?? {};
  const out = {};
  for (const [kind, v] of Object.entries(caps)) {
    out[kind] = { cap: v.monthly_usd_cap, spent: 0, runs: 0, over: false };
  }
  let unclassified = 0, unclassifiedRuns = 0;
  for (const r of rows) {
    const k = r.task_kind;
    if (k && out[k]) { out[k].spent += r.total_cost_usd; out[k].runs += 1; }
    else { unclassified += r.total_cost_usd; unclassifiedRuns += 1; }
  }
  for (const v of Object.values(out)) v.over = v.spent >= v.cap;
  return { kinds: out, unclassified_usd: unclassified, unclassified_runs: unclassifiedRuns };
}

/**
 * 1回あたりの上限を超えた run。**上限は model-routing.json 側が正**で、
 * この台帳には持たせない（2箇所に置くと必ず片方が古くなる）。
 *
 * **超過は保存せず、毎回その場で導出する。**上限を直したら過去の判定も
 * 一緒に変わるのが正しい。保存すると、上限を下げたのに古い run が
 * 「セーフ」のまま残る。保存するのは `cap_review`（人間のレビュー）だけで、
 * それは導出できない judgement だから。
 *
 * task_kind が無い run は**判定しない**。「上限が無い」と「種別が未記録」を
 * 混ぜると、種別を書き忘れた run が黙って上限を素通りする。
 */
export function overruns(ledger, routing, { month = null } = {}) {
  const rules = routing?.rules ?? {};
  const rows = month ? ledger.runs.filter((r) => r.date_jst.startsWith(month)) : ledger.runs;
  const out = [];
  let unclassified = 0;
  for (const r of rows) {
    if (!r.task_kind) { unclassified += 1; continue; }
    const cap = rules[r.task_kind]?.max_usd_per_run;
    if (typeof cap !== 'number' || !(cap > 0)) continue;
    if (!(r.total_cost_usd > cap)) continue;
    out.push({
      run_id: r.run_id ?? null, date_jst: r.date_jst, task_kind: r.task_kind,
      cost: r.total_cost_usd, cap, times: Number((r.total_cost_usd / cap).toFixed(1)),
      reviewed: Boolean(r.cap_review),
      why: r.cap_review?.why ?? null,
    });
  }
  return { overruns: out, unreviewed: out.filter((o) => !o.reviewed), runs_without_kind: unclassified };
}

/**
 * 異常消費の検知。**絶対額のしきい値は置かない。**
 *
 * 実績が1点しか無い段階で「$5を超えたら異常」と決めると、それは推測であって
 * 基準ではない。代わりに直近の中央値との比で見る。中央値は実績が増えるほど
 * 正確になるので、**基準そのものが自己較正される。**
 *
 * min_samples 未満では判定しない。**判定できないことを「異常なし」とも
 * 「異常あり」とも言わない** — Runbook が繰り返し戒めている
 * 「取得できなかった」と「増えていない」の取り違えと同じ規律。
 */
export function detectAnomalies(ledger, month = jstMonth()) {
  const cfg = ledger.budget?.anomaly;
  if (!cfg) return { enabled: false, reason: 'budget.anomaly が未設定' };
  const all = [...ledger.runs].sort((a, b) => (a.date_jst < b.date_jst ? -1 : 1));
  const window = all.slice(-cfg.median_window);
  if (window.length < cfg.min_samples) {
    return {
      enabled: true, judged: false,
      reason: `実績 ${window.length} 件 < 判定に必要な ${cfg.min_samples} 件。判定していない（異常なしではない）`,
      samples: window.length,
    };
  }
  const sorted = window.map((r) => r.total_cost_usd).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const threshold = Math.max(median * cfg.multiple, cfg.min_absolute_usd);
  const hits = all.filter((r) => r.date_jst.startsWith(month) && r.total_cost_usd > threshold);
  return {
    enabled: true, judged: true, median, threshold, samples: window.length,
    anomalies: hits.map((r) => ({
      run_id: r.run_id, date_jst: r.date_jst, cost: r.total_cost_usd,
      times_median: Number((r.total_cost_usd / median).toFixed(1)),
    })),
  };
}

/** モデル別の出現回数。費用の按分はログに無いので**回数しか言えない**。 */
export function modelUsage(ledger, month = jstMonth()) {
  const rows = ledger.runs.filter((r) => r.date_jst.startsWith(month));
  const counts = {};
  let unknown = 0;
  for (const r of rows) {
    if (!Array.isArray(r.models) || r.models.length === 0) { unknown++; continue; }
    for (const m of r.models) counts[m] = (counts[m] || 0) + 1;
  }
  // models が無い run を 0 と数えない。**未記録と未使用は別。**
  return { counts, runs_with_models: rows.length - unknown, runs_without_models: unknown };
}

export function appendRun(ledger, run, { enrichMissing = false } = {}) {
  const required = ['date_jst', 'route', 'total_cost_usd'];
  for (const k of required) {
    if (run[k] === undefined || run[k] === null) throw new Error(`appendRun: ${k} is required`);
  }
  // 同一 run_id の二重追記を防ぐ。ワークフローの再実行で二重計上すると、
  // 上限判定が実態より厳しくなり「使っていないのに止まる」が起きる。
  const existing = run.run_id && ledger.runs.find((r) => r.run_id === run.run_id);
  if (existing && enrichMissing) {
    // A cost can be measured before its result is recorded. Only fill missing
    // result metadata; never replace the amount, review, or an existing result.
    for (const key of required) {
      if (existing[key] !== run[key]) throw Error(`enrich: ${key} differs from recorded cost`);
    }
    if (run.outcome !== undefined && !OUTCOMES.includes(run.outcome)) throw Error('enrich: invalid outcome');
    if (run.task_kind !== undefined && !['article', 'repair', 'analysis'].includes(run.task_kind)) throw Error('enrich: invalid task_kind');
    const patch = {};
    for (const key of ['outcome', 'task_kind']) {
      if (run[key] === undefined) continue;
      if (existing[key] == null) patch[key] = run[key];
      else if (existing[key] !== run[key]) throw Error(`enrich: ${key} is already recorded`);
    }
    Object.assign(existing, patch);
    return { ledger, appended: false, enriched: Object.keys(patch).length > 0,
      reason: `run_id ${run.run_id} already recorded` };
  }
  if (existing) {
    return { ledger, appended: false, reason: `run_id ${run.run_id} already recorded` };
  }
  ledger.runs.push(run);
  ledger.runs.sort((a, b) => (a.date_jst < b.date_jst ? -1 : a.date_jst > b.date_jst ? 1 : 0));
  return { ledger, appended: true };
}

function fmt(n) { return n === null ? 'n/a' : `$${n.toFixed(4)}`; }

export function render(s, ledger) {
  const out = [];
  // 残高が出せない月は「残り」と書かない。上限のほうを、上限だと書いて出す。
  const tail = s.remaining === null
    ? `(remaining 不明 — 測れているぶんを引いた上限は ${fmt(s.remaining_upper_bound)})`
    : `(remaining ${fmt(s.remaining)})`;
  const scope = s.spent_is_lower_bound ? '主系のみ・下限 ' : '';
  out.push(`Autopilot budget ${s.month}: ${scope}${fmt(s.spent)} / ${fmt(s.cap)} ${tail}`);
  out.push(`  runs ${s.runs} · shipped ${s.shipped} · per shipped ${fmt(s.usd_per_shipped)}`);
  out.push(`  actions: ${s.by_route.actions.runs} runs ${fmt(s.by_route.actions.spent)}`);
  out.push(`  ccr:     ${s.by_route.ccr.runs} runs ${fmt(s.by_route.ccr.spent)}`);
  if (!s.ccr_measured) {
    out.push('  NOTE: CCR(副系)の実費は0ではなく未観測。スケジュール起動セッションの');
    out.push('        ログは外部から読めないため、この合計は運用全体の実費ではない。');
  }
  const mu = modelUsage(ledger, s.month);
  if (mu.runs_with_models > 0) {
    const line = Object.entries(mu.counts).map(([m, n]) => `${m} x${n}`).join(' / ');
    out.push(`  モデル: ${line}`);
    if (mu.runs_without_models > 0) {
      out.push(`         （${mu.runs_without_models} run はモデル未記録。未使用ではない）`);
    }
  }
  const an = detectAnomalies(ledger, s.month);
  if (an.enabled && !an.judged) {
    out.push(`  異常消費: 判定していない（${an.reason}）`);
  } else if (an.enabled) {
    if (an.anomalies.length === 0) {
      out.push(`  異常消費: なし（中央値 ${fmt(an.median)} / しきい値 ${fmt(an.threshold)} / n=${an.samples}）`);
    } else {
      for (const a of an.anomalies) {
        out.push(`  ⚠ 異常消費: ${a.date_jst} ${a.run_id} = ${fmt(a.cost)}（中央値の ${a.times_median} 倍）`);
      }
    }
  }
  if (s.run_caps) {
    const { overruns: ovs, unreviewed, runs_without_kind } = s.run_caps;
    if (ovs.length === 0) {
      out.push('  1回あたりの上限: 超過なし');
    } else {
      for (const o of ovs) {
        out.push(`  ${o.reviewed ? '·' : '⛔'} 1回上限の超過: ${o.date_jst} ${o.task_kind} `
          + `${fmt(o.cost)} / 上限 ${fmt(o.cap)}（${o.times}倍）`
          + (o.reviewed ? ` — レビュー済: ${o.why}` : ' — **未レビュー。主系の次回を止める**'));
      }
      if (unreviewed.length) {
        out.push('    解除: node scripts/autopilot-budget.mjs --ack-overrun <run_id> --why "…"');
        out.push('    **人間のみ。**AIが自分の超過を自分で通せると、上限が「お願い」になる。');
        out.push('    止まるのは主系だけで、副系CCRは別経路のため出荷は続く。');
      }
    }
    if (runs_without_kind) {
      out.push(`    NOTE: task_kind が無い run ${runs_without_kind} 件は1回上限を判定していない`
        + '（判定していない ≠ 上限内）');
    }
  } else {
    // [2026-08-26] ここに else が無かった。**値のほうは null を保っていたのに
    // （#631 で直した）、表示のほうが黙って節ごと消えていた。**
    // 実測: model-routing.json を壊すと、この節だけでなく
    // **実在する超過2件（08-23 article $7.2967 / 08-25 repair $11.9329）が
    // 報告から消える。**読む側には「超過なし」と区別がつかない。
    // 判定できなかったことは、判定して問題が無かったことと同じ見た目にしない。
    out.push('  1回あたりの上限: **判定していない**'
      + '（data/model-routing.json を読めない — **判定していない ≠ 上限内**）');
  }

  const bt = s.by_task;
  if (bt && Object.keys(bt.kinds).length) {
    out.push('  種別ごとの枠:');
    for (const [kind, v] of Object.entries(bt.kinds)) {
      out.push(`    ${kind.padEnd(10)} ${fmt(v.spent)} / ${fmt(v.cap)}`
        + `  ${v.over ? '**枠切れ**' : ''}  (${v.runs} runs)`);
    }
    if (bt.unclassified_runs) {
      out.push(`    ${'(未分類)'.padEnd(10)} ${fmt(bt.unclassified_usd)}`
        + `  ← 種別が付いていない run ${bt.unclassified_runs} 件。**落とさず出す**（合計が合わなくなるため）`);
    }
    out.push('    NOTE: 種別の枠を超えても主系全体は止まらない（止めるのは月次上限）。');
  }

  // **条件を cap_set_by から cap_basis へ移した（2026-09-03）。**
  // 旧条件だと、オーナーが額を決めた瞬間にこの注記ごと消える。だが消えてよいのは
  // 「オーナー未確認」の部分だけで、**「まだ実測ではない」ほうは残る。**
  // 額を誰が決めたか（cap_set_by）と、何に基づくか（cap_basis）は別の問い。
  if (ledger.budget.cap_set_by === 'placeholder') {
    out.push('  NOTE: monthly_usd_cap は暫定値（オーナー未確認）。');
  }
  if ((ledger.budget.cap_basis ?? 'placeholder') !== 'measured') {
    out.push(`  NOTE: monthly_usd_cap の根拠は ${ledger.budget.cap_basis ?? 'placeholder'}`
      + '（月次の実測ではない）。**「予算に応じて配分している」と対外的に言わないこと。**');
  }
  return out.join('\n');
}

// --- CLI ---------------------------------------------------------------

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**上限超過時の動作が知らない値**なら落ちる', (d) => { d.budget.on_exceed = 'たぶん止まる'; }],
  ['月次上限が数でなければ落ちる', (d) => { d.budget.monthly_usd_cap = 'たくさん'; }],
  ['run の費用が数でなければ落ちる', (d) => { d.runs[0].total_cost_usd = '高かった'; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);

// [2026-08-26] **判定できなかったことが、報告から消えていた。**
// 値は #631 で null を保つようにしたが、render 側に else が無く、
// model-routing.json を壊すと**実在する超過2件ごと**節が消えていた。
// 読む側には「超過なし」と区別がつかない。
// **実データの形で確かめる。**手で組んだ骨だけの s では、render が読む欄が
// 足りずに別の理由で落ちる（一度やった）。summarize の結果の run_caps だけ差し替える。
const budgetDoc = () => JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
SCENARIOS.push(
  ['SDKの支出閾値は既存の1回上限と月次残枠の上界に従う', () => {
    const ledger = budgetDoc(); ledger.runs = [];
    const routing = loadRouting(); routing.rules.article.max_usd_per_run = 8.75;
    assert(runtimeBudget(ledger, routing, 'article', '2026-09').usd === 8.75, '1回上限を渡していない');
    ledger.runs = [{ date_jst: '2026-09-01', route: 'actions', total_cost_usd: ledger.budget.monthly_usd_cap - 0.125 }];
    assert(runtimeBudget(ledger, routing, 'article', '2026-09').usd === 0.125, '月次残枠の上界を超えた');
    ledger.budget.on_exceed = 'warn_only';
    assert(runtimeBudget(ledger, routing, 'article', '2026-09').usd === 8.75, 'warn_onlyの宣言を変更した');
  }],
  ['SDK閾値の欠測・不正値・枠切れ・未レビュー超過は起動許可にしない', () => {
    const ledger = budgetDoc(); ledger.runs = []; const routing = loadRouting();
    const reject = fn => { let failed = false; try { fn(); } catch { failed = true; } assert(failed, '不明/停止を閾値へ変換した'); };
    for (const value of [undefined, null, 0, -1, '10', Infinity, NaN]) {
      reject(() => runtimeBudget(ledger, { ...routing, rules: { ...routing.rules, article: { max_usd_per_run: value } } }, 'article', '2026-09'));
    }
    reject(() => runtimeBudget(ledger, routing, 'unknown', '2026-09'));
    reject(() => runtimeBudget({ ...ledger, runs: null }, routing, 'article', '2026-09'));
    const used = { date_jst: '2026-09-01', route: 'actions', total_cost_usd: ledger.budget.monthly_usd_cap };
    reject(() => runtimeBudget({ ...ledger, runs: [used] }, routing, 'article', '2026-09'));
    reject(() => runtimeBudget({ ...ledger, runs: [{ ...used, total_cost_usd: Infinity }] }, routing, 'article', '2026-09'));
    reject(() => runtimeBudget({ ...ledger, runs: [{ ...used, task_kind: 'article', total_cost_usd: routing.rules.article.max_usd_per_run + 1 }] }, routing, 'article', '2026-09'));
  }],
  ['実workflowのrouteがポリシーを読み、SDK引数へ支出閾値を渡す', () => {
    const source = fs.readFileSync(path.join(ROOT, '.github/workflows/obsidian-autopilot.yml'), 'utf8');
    const { shell } = runtimeBudgetWiring(source);
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-budget-wiring-')));
    try {
      fs.cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'data')); fs.mkdirSync(path.join(dir, 'bin'));
      const ledger = budgetDoc(); ledger.runs = [];
      const routing = loadRouting(); routing.rules.article.max_usd_per_run = 8.75; routing.rules.repair.max_usd_per_run = 18.25;
      fs.writeFileSync(path.join(dir, 'data/autopilot-cost.json'), JSON.stringify(ledger));
      fs.writeFileSync(path.join(dir, 'data/model-routing.json'), JSON.stringify(routing));
      const adapter = `#!${process.execPath}\nconst {spawnSync}=require('node:child_process');\nif (process.argv[2] === 'scripts/autopilot-selfheal.mjs') console.log(JSON.stringify({lane_f_required:process.env.FIXTURE_KIND === 'repair'},null,2));\nelse {const r=spawnSync(${JSON.stringify(process.execPath)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);}\n`;
      fs.writeFileSync(path.join(dir, 'bin/node'), adapter, { mode: 0o700 });
      for (const kind of ['article', 'repair']) {
        const output = path.join(dir, `${kind}.output`);
        const env = { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, GITHUB_OUTPUT: output, FIXTURE_KIND: kind };
        const result = spawnSync('bash', ['-e', '-c', shell], { cwd: dir, env, encoding: 'utf8' });
        assert(result.status === 0, `actual route failed: ${result.stderr}`);
        const text = fs.readFileSync(output, 'utf8');
        assert(text.split('\n').filter(line => line === `runtime_budget_usd=${routing.rules[kind].max_usd_per_run}`).length === 1, `${kind} route output did not contain the actual policy threshold: ${text}`);
      }
      routing.rules.article.max_usd_per_run = 'invalid';
      fs.writeFileSync(path.join(dir, 'data/model-routing.json'), JSON.stringify(routing));
      const result = spawnSync(process.execPath, ['scripts/autopilot-budget.mjs', '--runtime-budget', '--task', 'article'], { cwd: dir, encoding: 'utf8' });
      assert(result.status !== 0 && result.stdout.trim() === '', 'actual CLI emitted an allowance for an invalid policy');
    } finally { fs.rmSync(dir, { recursive: true }); }
  }],
  ['結果未確定の実費を一度だけ計上し、後から欠けた結果のみ補完する', () => {
    const d = budgetDoc(); d.runs = [];
    const cost = { date_jst: '2026-09-05', route: 'actions', run_id: '33959414641',
      total_cost_usd: 0.8407852, num_turns: 20, note: 'measured result' };
    assert(appendRun(d, { ...cost }).appended, '実費が入らない');
    const before = summarize(d, '2026-09');
    assert(before.spent === 0.8407852 && before.shipped === 0, '結果を推測している');
    const metadata = { ...cost, outcome: 'shipped', task_kind: 'article',
      num_turns: 999, note: 'replacement', cap_review: { by: 'owner', at: '2026-09-05', why: 'not a real review' } };
    assert(!appendRun(d, metadata).appended && d.runs[0].outcome === undefined, '既定の追記冪等性が変わった');
    const result = appendRun(d, metadata, { enrichMissing: true });
    assert(result.enriched && !result.appended && d.runs.length === 1, '補完で二重計上');
    const after = summarize(d, '2026-09');
    assert(after.spent === before.spent && after.shipped === 1, '費用か結果の集計が違う');
    assert(d.runs[0].num_turns === 20 && d.runs[0].note === 'measured result'
      && d.runs[0].cap_review === undefined, '補完で費用・レビューを書き換えた');
    assert(!appendRun(d, metadata, { enrichMissing: true }).enriched, '補完が冪等でない');
  }],
  ['既知の費用・日付・経路・結果を補完で変更できない', () => {
    const row = { date_jst: '2026-09-05', route: 'actions', run_id: '33959414641',
      total_cost_usd: 0.8407852, outcome: 'failed' };
    for (const change of [{ total_cost_usd: 0 }, { date_jst: '2026-09-04' }, { route: 'ccr' },
      { outcome: 'shipped' }, { outcome: 'made-up' }, { task_kind: 'made-up' }]) {
      const d = budgetDoc(); d.runs = [{ ...row }];
      let rejected = false;
      try { appendRun(d, { ...row, ...change }, { enrichMissing: true }); } catch { rejected = true; }
      assert(rejected && JSON.stringify(d.runs) === JSON.stringify([row]), '既知の事実を上書きした');
    }
  }],
  ['**判定できなかったら、そう書く**（節ごと消さない）', () => {
    const d = budgetDoc();
    const out = render({ ...summarize(d), run_caps: null }, d);
    assert(out.includes('判定していない'),
      '**判定できなかったことが報告に出ない** — 読む側は「超過なし」と区別できない');
  }],
  // [2026-09-01] **残高が、測れていないぶんを「まだ使える」に化けさせていた。**
  // 日報は `$20.04 / $40.00（残り $19.96）` と出していたが、この $20.04 は
  // 21回中8回（主系のみ）の計上で、副系13回は観測手段が無い。
  // 単価のほうは「主系1記事あたり」と範囲を単位に書いてあった（simplememo-api
  // autopilot-report.ts の注記がその理由を書いている）のに、**同じ理屈が
  // 見出しの金額には適用されていなかった。**
  ['**副系が測れていない月は残高を出さない**（測っていないぶんが「使える」に化ける）', () => {
    const d = budgetDoc();
    const s2 = summarize(d, '2026-08');
    assert(s2.ccr_measured === false, '前提: 2026-08 は副系が未観測');
    assert(s2.remaining === null, `残高が出ている: ${s2.remaining}`);
    assert(s2.spent_is_lower_bound === true, '支出が下限だと言えていない');
  }],
  ['**上限のほうは出す**（出せないと下流が自前で cap - spent を計算し直す）', () => {
    const s2 = summarize(budgetDoc(), '2026-08');
    assert(typeof s2.remaining_upper_bound === 'number' && s2.remaining_upper_bound > 0,
      String(s2.remaining_upper_bound));
    assert(s2.remaining_upper_bound === s2.cap - s2.spent, '上限は cap - spent そのもの');
  }],
  ['残高を出せない月は「残り」と書かない', () => {
    const d = budgetDoc();
    const out = render(summarize(d, '2026-08'), d);
    assert(/remaining 不明/.test(out), out.split('\n')[0]);
    assert(!/\(remaining \$/.test(out), `残高として出ている: ${out.split('\n')[0]}`);
    assert(/主系のみ・下限/.test(out), '支出の範囲が見出しに出ていない');
  }],
  ['**副系が測れた月は従来どおり残高を出す**（測れているのに出さないのは別の嘘）', () => {
    const d = budgetDoc();
    d.runs = [...d.runs, { date_jst: '2026-08-15', route: 'ccr', run_id: 'x',
      total_cost_usd: 1, num_turns: 1, outcome: 'shipped' }];
    const s2 = summarize(d, '2026-08');
    assert(s2.ccr_measured === true, '前提: ccr行を足した');
    assert(s2.remaining === s2.cap - s2.spent, `残高が出ていない: ${s2.remaining}`);
    assert(s2.spent_is_lower_bound === false, '測れているのに下限扱いになっている');
    assert(/\(remaining \$/.test(render(s2, d)), '測れた月に「残り」が出ていない');
  }],
  ['超過なしのときは「超過なし」と書く（両者を同じ語にしない）', () => {
    const d = budgetDoc();
    const out = render({ ...summarize(d),
      run_caps: { overruns: [], unreviewed: [], runs_without_kind: 0 } }, d);
    assert(out.includes('超過なし'), out.slice(0, 300));
    assert(!out.includes('1回あたりの上限: **判定していない**'), '両者が同じ語になっている');
  }],
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const flag = (name) => argv.includes(`--${name}`);
  const val = (name, dflt = undefined) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
  };

  const ledger = loadLedger();
  const problems = validate(ledger);
  if (problems.length) {
    console.error('autopilot-cost.json is malformed:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n壊れた台帳は「上限に永久に当たらない」を意味する。集計不能ではなく安全装置の停止。');
    process.exit(1);
  }

  if (flag('runtime-budget')) {
    try {
      const threshold = runtimeBudget(ledger, loadRouting(), val('task'), val('month', jstMonth()));
      console.log(threshold.usd);
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }

  if (flag('append')) {
    const run = {
      date_jst: val('date'),
      route: val('route', 'actions'),
      run_id: val('run-id') || undefined,
      job_id: val('job-id') || undefined,
      total_cost_usd: Number(val('cost')),
      num_turns: val('turns') !== undefined ? Number(val('turns')) : undefined,
      task_kind: val('task-kind') || undefined,
      outcome: val('outcome') || undefined,
      note: val('note') || undefined,
    };
    for (const k of Object.keys(run)) if (run[k] === undefined) delete run[k];
    if (!Number.isFinite(run.total_cost_usd)) {
      console.error('--cost に数値が要る（取得できなかった回は追記しない。0を書くと「無料で動いた」になる）');
      process.exit(1);
    }
    const res = appendRun(ledger, run, { enrichMissing: flag('enrich-missing-metadata') });
    if (!res.appended && !res.enriched) {
      console.log(`skip: ${res.reason}`);
      process.exit(0);
    }
    const after = validate(ledger);
    if (after.length) throw Error(`cost append rejected: ${after.join('; ')}`);
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
    console.log(`${res.enriched ? 'enriched' : 'appended'} ${run.date_jst} ${run.route} ${fmt(run.total_cost_usd)}`);
    process.exit(0);
  }

  // 1回上限の解除。**人間のみ。**ワークフローからは呼ばない（呼ぶと自己承認になる）。
  if (val('ack-overrun') !== undefined) {
    const id = val('ack-overrun');
    const why = val('why');
    if (!why || why.trim().length < 10) {
      console.error('--why に理由が要る（10文字以上）。理由の無い解除は、上限を1文字で無効化できることと同じ');
      process.exit(1);
    }
    const run = ledger.runs.find((r) => r.run_id === id);
    if (!run) { console.error(`run_id ${id} が台帳に無い`); process.exit(1); }
    run.cap_review = { at: val('at', todayJst()), by: 'owner', why };
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
    console.log(`ack ${id}: ${why}`);
    process.exit(0);
  }

  // 1回上限のゲート。**その種別に未レビューの超過があれば非ゼロ。**
  if (flag('check-run-cap')) {
    const kind = val('task');
    const rc = summarize(ledger, val('month', jstMonth())).run_caps;
    if (!rc) {
      console.error('data/model-routing.json を読めなかった。**判定していない**（上限内ではない）');
      process.exit(1);
    }
    const hits = kind ? rc.unreviewed.filter((o) => o.task_kind === kind) : rc.unreviewed;
    if (hits.length === 0) {
      console.log(`1回上限: ${kind ? `${kind} に` : ''}未レビューの超過なし`);
      process.exit(0);
    }
    for (const o of hits) {
      console.log(`::error file=data/autopilot-cost.json::${o.date_jst} の ${o.task_kind} が`
        + ` 1回上限 ${fmt(o.cap)} に対し ${fmt(o.cost)}（${o.times}倍）。未レビューのため主系を止める。`
        + ` 解除: node scripts/autopilot-budget.mjs --ack-overrun ${o.run_id} --why "…"（人間のみ）`);
    }
    process.exit(1);
  }

  const s = summarize(ledger, val('month', jstMonth()));

  if (flag('json')) {
    console.log(JSON.stringify({
      month: s.month, cap_usd: s.cap, spent_usd: Number(s.spent.toFixed(4)),
      // **残高は測り切れている月だけ。**null は「残りゼロ」ではなく「出せない」。
      // 受け手（simplememo-api の日報）は `typeof === 'number'` で見ているので、
      // null なら「（残り …）」の節がそのまま消える。
      remaining_usd: s.remaining === null ? null : Number(s.remaining.toFixed(4)),
      remaining_usd_upper_bound: Number(s.remaining_upper_bound.toFixed(4)),
      spent_usd_is_lower_bound: s.spent_is_lower_bound,
      over: s.over,
      runs: s.runs, shipped: s.shipped,
      usd_per_shipped: s.usd_per_shipped === null ? null : Number(s.usd_per_shipped.toFixed(4)),
      by_route: s.by_route, ccr_measured: s.ccr_measured,
      // 1回上限のゲート。**主系を実際に止めているのはここ**なのに、長らく
      // --json から漏れていた。機械可読の出力に無いと、日次アクチュエータも
      // 日報も「主系が予算ガードで止まっている」を言えない
      // （null は「判定していない」であって「超過なし」ではない）。
      run_caps: s.run_caps,
      models: modelUsage(ledger, s.month),
      anomaly: detectAnomalies(ledger, s.month),
      cap_set_by: ledger.budget.cap_set_by ?? null,
      // **公開面にも根拠を運ぶ。**誰が決めたか（cap_set_by）だけを出すと、
      // 「オーナーが決めた額」＝「実測から決めた額」と読まれる。別の問いなので両方出す。
      cap_basis: ledger.budget.cap_basis ?? 'placeholder',
    }, null, 2));
    process.exit(0);
  }

  console.log(render(s, ledger));

  // 種別ごとの枠の判定。**主系全体は止めない**（止めるのは月次上限の役目）。
  // 記事の枠切れが修理まで巻き込むと、壊れた基盤の上で翌日も走ることになる。
  if (flag('check') && val('task')) {
    const kind = val('task');
    const t = s.by_task.kinds[kind];
    if (!t) {
      console.error(`未知のタスク種別: ${kind}（budget.task_budgets に無い）`);
      process.exit(1);
    }
    if (t.over) {
      console.log(`::warning file=data/autopilot-cost.json::${kind} の月次枠 ${fmt(t.cap)} に対し ${fmt(t.spent)} を消化。この種別は枠切れ。`);
      process.exit(1);
    }
    console.log(`${kind}: ${fmt(t.spent)} / ${fmt(t.cap)} — 枠内`);
    process.exit(0);
  }

  if (flag('check')) {
    if (s.over && ledger.budget.on_exceed === 'skip_run') {
      console.log(`::warning file=data/autopilot-cost.json::当月の実費 ${fmt(s.spent)} が上限 ${fmt(s.cap)} に到達。主系runをスキップする。`);
      process.exit(1);
    }
    if (s.over) console.log('over cap but on_exceed=warn_only — 止めない');
  }
}
