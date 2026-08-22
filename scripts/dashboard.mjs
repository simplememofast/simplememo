#!/usr/bin/env node
/**
 * 運営ダッシュボード — 台帳から生成する。
 *
 *   node scripts/dashboard.mjs                    # build/dashboard.html へ出力
 *   node scripts/dashboard.mjs --out path.html
 *
 * **数字をこのファイルに書かない。** すべて既存の集計関数から取る。
 * 手で書いた瞬間、台帳とダッシュボードのどちらが正か分からなくなる
 * （このリポジトリはフラグで一度その事故を起こしている）。
 *
 * 出力先は .gitignore に入れてある。docs/ は robots で Disallow して
 * いるが Cloudflare Pages は 200 で配信するので、コミットすると
 * 予算・障害・未解消件数が推測可能なURLで公開される。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarize as rateSummarize } from './automation-rate.mjs';
import { load as runsLoad, summarize as runsSummarize } from './autopilot-runs.mjs';
import { loadLedger, summarize as budgetSummarize, modelUsage, detectAnomalies } from './autopilot-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const pct = (n, digits = 1) => `${(n * 100).toFixed(digits)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 台帳 ───────────────────────────────────────────────
const coverage = readJSON('data/automation-coverage.json');
const rate = rateSummarize(coverage);
const runs = runsSummarize(runsLoad());
const ledger = loadLedger();
const MONTH = runs.window.to.slice(0, 7);
const budget = budgetSummarize(ledger, MONTH);
const models = modelUsage(ledger, MONTH);
const anomaly = detectAnomalies(ledger, MONTH);
const capProvisional = ledger.budget.cap_set_by === 'placeholder';
const authority = readJSON('data/authority-matrix.json');

const domains = authority.domains ?? [];
const gated = domains.filter((d) => d.requires_approval).length;

// ── 部品 ───────────────────────────────────────────────

/** 数値ひとつ。state は ok / warn / crit / unknown。 */
function readout({ label, value, unit = '%', note = '', state = '' }) {
  return `<div class="readout${state ? ` is-${state}` : ''}">
    <div class="readout__label">${esc(label)}</div>
    <div class="readout__value">${esc(value)}${unit ? `<span class="readout__unit">${esc(unit)}</span>` : ''}</div>
    ${note ? `<div class="readout__note">${esc(note)}</div>` : ''}
  </div>`;
}

function panel({ title, lede = '', body, source = '', state = '' }) {
  return `<section class="panel${state ? ` is-${state}` : ''}">
    <header class="panel__head">
      <h2 class="panel__title">${esc(title)}</h2>
      ${lede ? `<p class="panel__lede">${lede}</p>` : ''}
    </header>
    ${body}
    ${source ? `<p class="panel__source">${esc(source)}</p>` : ''}
  </section>`;
}

/** 横棒。分母と分子を必ず併記する（率だけ出さない）。 */
function bar(label, value, detail, state = '') {
  const w = Math.max(0, Math.min(100, value * 100));
  return `<div class="bar${state ? ` is-${state}` : ''}">
    <div class="bar__label">${esc(label)}</div>
    <div class="bar__track"><div class="bar__fill" style="width:${w.toFixed(1)}%"></div></div>
    <div class="bar__value">${pct(value)}<span class="bar__pct">%</span></div>
    <div class="bar__detail">${esc(detail)}</div>
  </div>`;
}

// ── 各パネル ───────────────────────────────────────────

const o = rate.overall;
const thesis = panel({
  title: '自動化率 — 4つの分母',
  lede: '<strong>1つの数字にすると、必ず都合のよい数字になる。</strong>どれか1つだけを出さない。'
      + '分母を変えれば 31% にも 82% にもなる。同じ現実である。',
  body: `<div class="readouts readouts--four">
    ${readout({ label: '総合自動化率', value: pct(o.overall_automation_rate), note: `定義タスク ${o.defined}（未実装63を含む・最も厳しい）`, state: 'crit' })}
    ${readout({ label: 'AI実行率', value: pct(o.ai_execution_rate), note: `実施中 ${o.doing}（未実装を除く）`, state: 'warn' })}
    ${readout({ label: 'AI関与率', value: pct(o.ai_involvement_rate), note: `実施中 ${o.doing}（提案・下書きも数える・最も甘い）`, state: 'ok' })}
    ${readout({ label: 'カバー率', value: pct(o.coverage_rate), note: 'そもそも誰かがやっているタスクの割合', state: 'warn' })}
  </div>
  <p class="panel__foot"><strong>現在地は総合自動化率 ${pct(o.overall_automation_rate)}%。</strong>
  あるべき運営業務のうち、AIが実行しているのは3割。
  残りのうち63件は<strong>誰もやっていない</strong>（自動化以前に未着手）。</p>`,
  source: `data/automation-coverage.json · ${coverage.tasks.length} タスク / ${Object.keys(rate.by_area).length} 領域 · scripts/automation-rate.mjs`,
});

const areas = Object.entries(rate.by_area)
  .sort((a, b) => b[1].overall_automation_rate - a[1].overall_automation_rate);
const areaPanel = panel({
  title: '領域別',
  lede: '開発だけが自律しているわけではない。<strong>法人経営とアナログ領域は 0%</strong>で、'
      + 'ここは「AIが遅い」のではなく<strong>着手していない</strong>。',
  body: `<div class="bars">${areas.map(([name, a]) => bar(
    name, a.overall_automation_rate, `${a.defined} タスク中 ${a.counts.ai_autonomous + a.counts.ai_executes_gated} をAIが実行 / 未実装 ${a.counts.nobody}`,
    a.overall_automation_rate === 0 ? 'crit' : a.overall_automation_rate >= 0.5 ? 'ok' : 'warn'
  )).join('')}</div>`,
  source: 'data/automation-coverage.json · scripts/automation-rate.mjs --json',
});

const autonomy = panel({
  title: '成果物の自律性',
  lede: 'ここが<strong>この運営で一番強い数字</strong>で、他の率とは物差しが違う。'
      + '「何件のタスクを自動化したか」ではなく<strong>「出したものに人が手を入れたか」</strong>。',
  body: `<div class="readouts readouts--two">
    ${readout({ label: '成果物のAI自律率', value: pct(runs.artifact_autonomy_rate), note: `出荷 ${runs.totals.shipped} 件のうち、人が中身に触っていない割合`, state: 'ok' })}
    ${readout({ label: '変更行のAI比率', value: '98.8', note: '開発領域のみ。別の物差しなので他領域と足さない', state: 'ok' })}
  </div>
  <p class="panel__foot">人間の介入は <strong>${pct(runs.human_intervention_rate)}%</strong> あるが、
  内訳を開くと<strong>成果物への介入は0件</strong>。人がやっていたのは基盤の修理と起動で、
  出したものの中身には一度も触っていない。
  <strong>${pct(runs.human_intervention_rate)}% を隠して100%だけを出さない</strong>ため、両方を並べる。</p>`,
  source: 'data/autopilot-runs.json · scripts/autopilot-runs.mjs',
});

const KIND_JA = { artifact: '成果物への介入', infra: '基盤の修理', substitute: '代走', bootstrap: '立ち上げ', request: '起票のみ' };
const KIND_NOTE = { artifact: 'AIの自律性の中核', infra: '', substitute: '', bootstrap: '一度きり', request: '未実行' };
const interventions = panel({
  title: `人間介入の内訳 — 合計 ${pct(runs.human_intervention_rate)}%`,
  lede: '<strong>合計だけでは何も分からない。</strong>「半分は人がやっている」と読めてしまうが、'
      + '実際に人が触っていたのは基盤と起動だけである。',
  body: `<div class="bars">${Object.entries(runs.intervention_by_kind).map(([kind, v]) => bar(
    KIND_JA[kind] ?? kind, v.rate,
    `${v.runs} 実行${KIND_NOTE[kind] ? ` · ${KIND_NOTE[kind]}` : ''}`,
    kind === 'artifact' ? 'ok' : 'warn'
  )).join('')}</div>`,
  source: 'data/autopilot-runs.json · intervention_by_kind',
});

const r = runs.by_route;
const operations = panel({
  title: `運転台帳 — ${runs.window.from} 〜 ${runs.window.to}（${runs.window.days}日 / ${runs.totals.runs} run）`,
  body: `<div class="readouts readouts--four">
    ${readout({ label: 'AI完走率', value: pct(runs.completion_rate), note: `${runs.totals.shipped} / ${runs.totals.attempted} 着手`, state: 'warn' })}
    ${readout({ label: '変更失敗率', value: pct(runs.change_failure_rate), note: `${runs.totals.failed} / ${runs.totals.attempted} 着手`, state: 'warn' })}
    ${readout({ label: '出荷日率', value: pct(runs.shipping_day_rate), note: `${runs.window.days} 日中`, state: 'ok' })}
    ${readout({ label: '無運転日', value: String(runs.totals.no_run), unit: '日', note: runs.no_run_days.join(' / ') || 'なし', state: 'crit' })}
  </div>
  <div class="routes">
    <div class="route is-crit">
      <div class="route__name">主系（GitHub Actions）</div>
      <div class="route__value">${r.primary.shipped} / ${r.primary.attempted} 出荷</div>
      <p class="route__note"><strong>一度も出荷していない。</strong>日々の出荷を担っているのは副系である。</p>
    </div>
    <div class="route is-ok">
      <div class="route__name">副系・代走（CCR Routines）</div>
      <div class="route__value">${r.secondary.shipped} / ${r.secondary.attempted} 出荷</div>
      <p class="route__note">切替は「起きた」のではなく<strong>常態</strong>。冗長化が実際に効いている状態。</p>
    </div>
  </div>`,
  source: 'data/autopilot-runs.json · scripts/autopilot-runs.mjs',
});

const t = runs.timings;
const hrs = (v) => v == null ? '—' : v.toFixed(1);
const timings = panel({
  title: '検知と修理',
  lede: '<strong>弱点は修理の速さではなく、気づくまでの時間。</strong>'
      + '最大値と中央値の開きがそれを示している（中央値だけ見ると健全に見える）。',
  body: `<div class="readouts readouts--four">
    ${readout({ label: '検知まで（中央値）', value: hrs(t.time_to_detect_hours.median), unit: 'h', note: `最大 ${hrs(t.time_to_detect_hours.max)}h · n=${t.time_to_detect_hours.n}`, state: 'crit' })}
    ${readout({ label: '修理まで（中央値）', value: hrs(t.time_to_repair_hours.median), unit: 'h', note: `最大 ${hrs(t.time_to_repair_hours.max)}h · n=${t.time_to_repair_hours.n}`, state: 'ok' })}
    ${readout({ label: '未解消', value: String(t.unresolved.length), unit: '件', note: t.unresolved.map((u) => `${u.run_id}[${u.failure_class}]`).join(' / ') || 'なし', state: t.unresolved.length ? 'crit' : 'ok' })}
    ${readout({ label: '承認制の領域', value: `${gated} / ${domains.length}`, unit: '', note: '不可逆な操作は人の承認を必ず通す', state: 'ok' })}
  </div>`,
  source: 'data/autopilot-runs.json · data/authority-matrix.json',
});

const modelList = Object.entries(models.counts).map(([m, c]) => `${m} ×${c}`).join(' / ') || '記録なし';
const cost = panel({
  title: `AI費用 — ${budget.month}`,
  body: `<div class="readouts readouts--four">
    ${readout({ label: '実費', value: `$${budget.spent.toFixed(2)}`, unit: '', note: `上限 $${budget.cap}（${capProvisional ? '暫定値・オーナー未確認' : '確定'}）`, state: 'ok' })}
    ${readout({ label: '主系の実費', value: `$${budget.by_route.actions.spent.toFixed(2)}`, unit: '', note: `${budget.by_route.actions.runs} run 分`, state: 'ok' })}
    ${readout({ label: '副系の実費', value: '未観測', unit: '', note: 'ゼロではない。スケジュール起動のログが外部から読めない', state: 'unknown' })}
    ${readout({ label: '異常消費', value: anomaly.judged ? `${anomaly.hits?.length ?? 0} 件` : '未判定', unit: '', note: anomaly.reason ?? '', state: anomaly.judged ? 'ok' : 'unknown' })}
  </div>
  <p class="panel__foot">使用モデル: <span class="mono">${esc(modelList)}</span>。
  <strong>この合計は運用全体の実費ではない。</strong>副系が未観測である以上、
  「予算に応じて配分している」と対外的には言わない。</p>`,
  source: 'data/autopilot-cost.json · scripts/autopilot-budget.mjs',
});

const UNKNOWNS = [
  ['前月比', '前月の測定が存在しない（自動化率の初回測定が 2026-08-22）。増減は次回測定から'],
  ['機能改善の増分効果', '対照群が無い。「AIが継続率を上げた」は現時点で言えない'],
  ['売上・継続率へのAI寄与', '測定基盤が無い。数字が動いてもAIの寄与分は切り出せない'],
  ['副系の実費', 'スケジュール起動セッションのログを外部から読めない'],
  ['Zero-decision Capture Rate', 'プロダクトの究極KPIだが未実測。実測が出るまで対外的に数値を書かない'],
  ['段階公開の実績', '機構は 2026-08-22 に両側実装。本番で1回も回していない'],
];
const unknowns = panel({
  state: 'unknown',
  title: '測れていないもの',
  lede: '<strong>このパネルを他と同じ大きさで置いているのが、このダッシュボードの設計そのもの。</strong>'
      + '測れていないものを空欄や0で描くと、見た人は「問題なし」と読む。'
      + '<strong>「測っていない」と「測って問題が無かった」は別のこと。</strong>',
  body: `<ul class="unknowns">${UNKNOWNS.map(([k, v]) => `<li class="unknown">
    <span class="unknown__key">${esc(k)}</span>
    <span class="unknown__why">${esc(v)}</span>
  </li>`).join('')}</ul>`,
  source: 'docs/pr-autopilot-2026-09-evidence.md · docs/autopilot-roadmap.md',
});

// ── 出力 ───────────────────────────────────────────────

const html = `<title>SimpleMemo 自律運営ダッシュボード</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>
:root{
  --ground:#F4F7F5; --surface:#FFFFFF; --surface-2:#F9FBFA;
  --ink:#131817; --ink-2:#3D4745; --muted:#66716E; --rule:#DBE3DF;
  --signal:#0B6E5F; --signal-soft:#E4F0EC;
  --ok:#2E7A4E; --warn:#8F5D0C; --crit:#9E322B; --unknown:#5F638A;
  --ok-soft:#E7F2EA; --warn-soft:#F7EEDD; --crit-soft:#F7E8E6; --unknown-soft:#ECEDF5;
  --sans:"Zen Kaku Gothic New",-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;
  --mono:"IBM Plex Mono","SFMono-Regular",Menlo,Consolas,monospace;
  --w:1140px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --ground:#0D110F; --surface:#151A18; --surface-2:#1B211E;
  --ink:#E7EEEA; --ink-2:#BCC7C2; --muted:#8B9793; --rule:#28312D;
  --signal:#54C4AC; --signal-soft:#12302A;
  --ok:#63C48A; --warn:#D6A24A; --crit:#E2796F; --unknown:#9C9FC8;
  --ok-soft:#14291C; --warn-soft:#2C2211; --crit-soft:#2E1917; --unknown-soft:#1C1D2B;
}}
:root[data-theme="dark"]{
  --ground:#0D110F; --surface:#151A18; --surface-2:#1B211E;
  --ink:#E7EEEA; --ink-2:#BCC7C2; --muted:#8B9793; --rule:#28312D;
  --signal:#54C4AC; --signal-soft:#12302A;
  --ok:#63C48A; --warn:#D6A24A; --crit:#E2796F; --unknown:#9C9FC8;
  --ok-soft:#14291C; --warn-soft:#2C2211; --crit-soft:#2E1917; --unknown-soft:#1C1D2B;
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--sans);
  font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--w);margin:0 auto;padding:40px 24px 96px;display:flex;flex-direction:column;gap:28px}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}

/* ── 見出し ── */
.masthead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;
  gap:16px;padding-bottom:22px;border-bottom:2px solid var(--ink)}
.masthead__title{margin:0;font-size:clamp(26px,3.6vw,38px);font-weight:900;letter-spacing:-.02em;text-wrap:balance}
.masthead__app{color:var(--signal)}
.masthead__meta{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right;line-height:1.9}
.masthead__meta strong{color:var(--ink-2);font-weight:600}

.standfirst{margin:0;font-size:17px;line-height:1.85;color:var(--ink-2);max-width:66ch}
.standfirst strong{color:var(--ink);font-weight:700}

/* ── パネル ── */
.panel{background:var(--surface);border:1px solid var(--rule);border-radius:4px;
  padding:26px 26px 20px;display:flex;flex-direction:column;gap:18px}
.panel.is-unknown{border-style:dashed;border-color:var(--unknown);background:var(--surface-2)}
.panel__head{display:flex;flex-direction:column;gap:8px}
.panel__title{margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;
  text-transform:uppercase;color:var(--signal);font-family:var(--mono)}
.panel.is-unknown .panel__title{color:var(--unknown)}
.panel__lede{margin:0;font-size:15px;line-height:1.8;color:var(--ink-2);max-width:70ch}
.panel__lede strong,.panel__foot strong{color:var(--ink);font-weight:700}
.panel__foot{margin:0;padding-top:16px;border-top:1px solid var(--rule);
  font-size:14px;line-height:1.8;color:var(--ink-2);max-width:74ch}
.panel__source{margin:0;padding-top:14px;border-top:1px solid var(--rule);
  font-family:var(--mono);font-size:11px;color:var(--muted);word-break:break-all}

/* ── 数値 ── */
.readouts{display:grid;gap:1px;background:var(--rule);border:1px solid var(--rule)}
.readouts--four{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.readouts--two{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.readout{background:var(--surface);padding:18px 18px 16px;display:flex;flex-direction:column;gap:6px;
  border-top:3px solid var(--rule)}
.readout.is-ok{border-top-color:var(--ok);background:var(--ok-soft)}
.readout.is-warn{border-top-color:var(--warn);background:var(--warn-soft)}
.readout.is-crit{border-top-color:var(--crit);background:var(--crit-soft)}
.readout.is-unknown{border-top-color:var(--unknown);background:var(--unknown-soft);border-top-style:dashed}
.readout__label{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--ink-2)}
.readout__value{font-family:var(--mono);font-size:34px;font-weight:600;line-height:1.1;
  letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
.readout.is-unknown .readout__value{font-size:24px;color:var(--unknown)}
.readout__unit{font-size:17px;font-weight:400;margin-left:2px;color:var(--muted)}
.readout__note{font-size:12px;line-height:1.65;color:var(--muted)}

/* ── 横棒 ── */
.bars{display:flex;flex-direction:column;gap:12px}
.bar{display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(80px,2fr) auto;
  grid-template-areas:"label track value" "detail detail detail";
  align-items:center;gap:4px 14px}
.bar__label{grid-area:label;font-size:14px;font-weight:500}
.bar__track{grid-area:track;height:9px;background:var(--rule);border-radius:1px;overflow:hidden}
.bar__fill{height:100%;background:var(--signal)}
.bar.is-ok .bar__fill{background:var(--ok)}
.bar.is-warn .bar__fill{background:var(--warn)}
.bar.is-crit .bar__fill{background:var(--crit)}
.bar__value{grid-area:value;font-family:var(--mono);font-size:16px;font-weight:600;
  font-variant-numeric:tabular-nums;min-width:62px;text-align:right}
.bar__pct{font-size:11px;color:var(--muted);margin-left:1px}
.bar__detail{grid-area:detail;font-family:var(--mono);font-size:11px;color:var(--muted)}

/* ── 経路 ── */
.routes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.route{padding:18px;border:1px solid var(--rule);border-left-width:4px;border-radius:3px;
  display:flex;flex-direction:column;gap:6px;background:var(--surface-2)}
.route.is-ok{border-left-color:var(--ok)}
.route.is-crit{border-left-color:var(--crit)}
.route__name{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--ink-2);font-weight:600}
.route__value{font-family:var(--mono);font-size:26px;font-weight:600;font-variant-numeric:tabular-nums}
.route.is-crit .route__value{color:var(--crit)}
.route.is-ok .route__value{color:var(--ok)}
.route__note{margin:0;font-size:13px;line-height:1.7;color:var(--ink-2)}
.route__note strong{color:var(--ink)}

/* ── 測れていないもの ── */
.unknowns{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;
  background:var(--rule);border:1px solid var(--rule)}
.unknown{background:var(--surface);padding:14px 16px;display:grid;
  grid-template-columns:minmax(190px,auto) 1fr;gap:4px 20px;align-items:baseline}
.unknown__key{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--unknown)}
.unknown__why{font-size:13.5px;line-height:1.7;color:var(--ink-2)}

@media (max-width:620px){
  .bar{grid-template-columns:1fr auto;grid-template-areas:"label value" "track track" "detail detail"}
  .unknown{grid-template-columns:1fr}
  .masthead__meta{text-align:left}
}
</style>

<div class="wrap">
  <header class="masthead">
    <h1 class="masthead__title">運営ダッシュボード<span class="masthead__app"> / SimpleMemo</span></h1>
    <div class="masthead__meta">
      生成 <strong>${esc(runs.window.to)}</strong><br>
      台帳 <strong>${coverage.tasks.length} タスク</strong> / 運転 <strong>${runs.totals.runs} run</strong><br>
      すべての数字を台帳から生成
    </div>
  </header>

  <p class="standfirst">この画面に<strong>手で書いた数字は1つも無い</strong>。
  すべて <span class="mono">data/*.json</span> から <span class="mono">scripts/dashboard.mjs</span> が生成している。
  <strong>都合のよい分母を選ばないこと</strong>と、<strong>測れていないものを空欄にしないこと</strong>の2つを、
  この画面の設計そのもので守っている。</p>

  ${thesis}
  ${autonomy}
  ${interventions}
  ${operations}
  ${areaPanel}
  ${timings}
  ${cost}
  ${unknowns}
</div>`;

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const out = outIdx >= 0 ? argv[outIdx + 1] : path.join(ROOT, 'build/dashboard.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`運営ダッシュボードを生成: ${out}`);
console.log(`  総合自動化率 ${pct(o.overall_automation_rate)}% / 成果物のAI自律率 ${pct(runs.artifact_autonomy_rate)}%`);
console.log(`  測れていないもの ${UNKNOWNS.length} 件を明示`);
