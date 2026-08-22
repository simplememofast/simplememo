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
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/autopilot-cost.json');

/** JSTの暦日/暦月。CIのランナーはUTCなので、必ず明示的に変換する。 */
export function jstMonth(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit',
  }).format(d).slice(0, 7);
}

export function loadLedger(file = LEDGER_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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
    remaining: cap - spent,
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

export function appendRun(ledger, run) {
  const required = ['date_jst', 'route', 'total_cost_usd'];
  for (const k of required) {
    if (run[k] === undefined || run[k] === null) throw new Error(`appendRun: ${k} is required`);
  }
  // 同一 run_id の二重追記を防ぐ。ワークフローの再実行で二重計上すると、
  // 上限判定が実態より厳しくなり「使っていないのに止まる」が起きる。
  if (run.run_id && ledger.runs.some((r) => r.run_id === run.run_id)) {
    return { ledger, appended: false, reason: `run_id ${run.run_id} already recorded` };
  }
  ledger.runs.push(run);
  ledger.runs.sort((a, b) => (a.date_jst < b.date_jst ? -1 : a.date_jst > b.date_jst ? 1 : 0));
  return { ledger, appended: true };
}

function fmt(n) { return n === null ? 'n/a' : `$${n.toFixed(4)}`; }

function render(s, ledger) {
  const out = [];
  out.push(`Autopilot budget ${s.month}: ${fmt(s.spent)} / ${fmt(s.cap)} (remaining ${fmt(s.remaining)})`);
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

  if (ledger.budget.cap_set_by === 'placeholder') {
    out.push('  NOTE: monthly_usd_cap は暫定値（オーナー未確認）。実測が貯まるまで');
    out.push('        「予算に応じて配分している」と対外的に言わないこと。');
  }
  return out.join('\n');
}

// --- CLI ---------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
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
    const res = appendRun(ledger, run);
    if (!res.appended) {
      console.log(`skip: ${res.reason}`);
      process.exit(0);
    }
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
    console.log(`appended ${run.date_jst} ${run.route} ${fmt(run.total_cost_usd)}`);
    process.exit(0);
  }

  const s = summarize(ledger, val('month', jstMonth()));

  if (flag('json')) {
    console.log(JSON.stringify({
      month: s.month, cap_usd: s.cap, spent_usd: Number(s.spent.toFixed(4)),
      remaining_usd: Number(s.remaining.toFixed(4)), over: s.over,
      runs: s.runs, shipped: s.shipped,
      usd_per_shipped: s.usd_per_shipped === null ? null : Number(s.usd_per_shipped.toFixed(4)),
      by_route: s.by_route, ccr_measured: s.ccr_measured,
      models: modelUsage(ledger, s.month),
      anomaly: detectAnomalies(ledger, s.month),
      cap_set_by: ledger.budget.cap_set_by ?? null,
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
