#!/usr/bin/env node
/**
 * 機能の**本番改善サイクルを完走させる**ための台帳を検査する。
 *
 *   node scripts/check-feature-outcomes.mjs           # 表示
 *   node scripts/check-feature-outcomes.mjs --check   # CI
 *   node scripts/check-feature-outcomes.mjs --selftest
 *
 * 【なぜ要るか】
 * コンテンツ側は完走している —— growth/experiments/experiments.json が
 * 仮説・基準値・評価日・判定を持ち、評価日を過ぎたら CI が鳴る。
 * **機能側にはそれが無かった。**
 *
 *   data/feature-backlog.json  … 候補の**採点だけ**（12件・status も出荷先も無い）
 *   rollout-guard の GUARD_METRICS … launch_ok / send_success / activation
 *
 * ガードが持つ3指標は**「壊していないか」の安全指標**であって、
 * **「狙った効果が出たか」の成功指標ではない。**だから機能を出しても
 * 「壊れていない」までしか言えず、**効いたかどうかは誰も測っていなかった。**
 * RSI監査（docs/pr-autopilot-2026-09-rsi-audit.md）が④ Self-evaluation を
 * 「コンテンツ側は回っている / 機能側は0件」としているのがこれ。
 *
 * 【この検査の核心 —— 出す前に測り方を決めさせる】
 * `declared_at <= shipped_at` を強制する。**出した後で指標を決めると、
 * 出た結果に合う指標を選べてしまう。**
 *
 * そして growth 側で実際に起きた失敗がここにも当てはまる:
 * 2026-07-01/02 のタイトル実験7件は**全件が「変更前の値を記録しないまま変えた」**で
 * 潰れた（growth/lib/ledger.mjs の measurement_failed）。
 * **同じ規律を機能側にも当てる** —— あちらで学んだことが、こちらに効いていなかった。
 *
 * 【判定語彙は運転記憶と同じ5値】
 * 成功／失敗／無変化／判断不能／**計測失敗**。
 * 「測れたが母数が足りない」と「そもそも測っていない」を分ける。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERDICTS } from './check-operating-memory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/feature-outcomes.json');
const BACKLOG_PATH = path.join(ROOT, 'data/feature-backlog.json');

/** 安全指標。**これだけを成功指標にできない**（壊していないことは、効いたことではない）。 */
export const GUARD_ONLY_METRICS = ['launch_ok', 'send_success'];
/** 判定に「効いた／外した」を書くなら、数字の入った基準が要る。 */
export const NEEDS_BASELINE = ['success', 'failure'];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validate(doc, { backlogIds = new Set(), today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const warnings = [];
  const seen = new Set();

  for (const f of doc.features || []) {
    const at = `feature ${f.id || '(id無し)'}`;
    if (!f.id) { problems.push('id の無い行がある'); continue; }
    if (seen.has(f.id)) problems.push(`${at}: id が重複`);
    seen.add(f.id);

    if (f.backlog_id && backlogIds.size && !backlogIds.has(f.backlog_id)) {
      problems.push(`${at}: backlog_id "${f.backlog_id}" が feature-backlog.json に無い`);
    }
    for (const k of ['declared_at', 'evaluation_at']) {
      if (f[k] && !DATE.test(f[k])) problems.push(`${at}: ${k} が YYYY-MM-DD でない`);
    }

    // --- ここが核心 -------------------------------------------------------
    if (f.shipped_at) {
      if (!DATE.test(f.shipped_at)) problems.push(`${at}: shipped_at が YYYY-MM-DD でない`);
      if (!f.declared_at) {
        problems.push(`${at}: 出荷済みなのに declared_at が無い`
          + ' — **出した後で指標を決めると、出た結果に合う指標を選べてしまう**');
      } else if (f.declared_at > f.shipped_at) {
        problems.push(`${at}: 指標を出荷の後に決めている（宣言 ${f.declared_at} / 出荷 ${f.shipped_at}）`
          + ' — **測り方は出す前に決める**');
      }
      if (!f.evaluation_at) {
        problems.push(`${at}: 出荷済みなのに evaluation_at が無い`
          + ' — 評価日の無い施策は、いつまでも「様子見」でいられる');
      }
    }

    const m = f.metric;
    if (f.declared_at) {
      if (!m || !m.key) problems.push(`${at}: metric.key が無い`);
      else {
        if (!m.numerator) problems.push(`${at}: metric.numerator が無い — **散文の指標は測れない**`);
        if (typeof m.higher_is_better !== 'boolean') {
          problems.push(`${at}: metric.higher_is_better を明示すること（どちらへ動けば良いのか）`);
        }
        if (GUARD_ONLY_METRICS.includes(m.key) && !m.why_guard_metric) {
          problems.push(`${at}: metric.key "${m.key}" は**安全指標**`
            + ' — 壊していないことは効いたことではない。'
            + ' 成功指標として使うなら why_guard_metric に理由を書く');
        }
      }
    }

    // 判定
    if (f.verdict) {
      if (!VERDICTS.includes(f.verdict)) {
        problems.push(`${at}: verdict "${f.verdict}" は5値のどれでもない — ${VERDICTS.join(' / ')}`);
      }
      if (!f.evaluated_at) problems.push(`${at}: verdict はあるが evaluated_at が無い`);
      const hasBaseline = m?.baseline && Object.values(m.baseline)
        .some((v) => typeof v === 'number' && Number.isFinite(v));
      if (NEEDS_BASELINE.includes(f.verdict) && !hasBaseline) {
        problems.push(`${at}: verdict が ${f.verdict} なのに metric.baseline に数字が無い`
          + ' — **効いた／外したは、比べる相手があって初めて言える。**'
          + ' 測っていないなら measurement_failed');
      }
      if (!f.learning) {
        problems.push(`${at}: 判定したのに learning が無い`
          + ' — **判定で終わると、次の判断は変わらない**');
      }
    } else if (f.evaluation_at && f.evaluation_at <= today && f.shipped_at) {
      // 評価日を過ぎたのに判定が無い。**落とさず鳴らす**
      // （出荷を人質にしない —— check-experiments.mjs と同じ理由）。
      warnings.push(`${at}: 評価日 ${f.evaluation_at} を過ぎたが判定が無い`);
    }
  }
  return { problems, warnings };
}

/** 完走した機能の数。**「出荷した数」と混ぜない。** */
export function summarize(doc) {
  const fs_ = doc.features || [];
  return {
    total: fs_.length,
    declared: fs_.filter((f) => f.declared_at).length,
    shipped: fs_.filter((f) => f.shipped_at).length,
    evaluated: fs_.filter((f) => f.verdict).length,
    completed: fs_.filter((f) => f.shipped_at && f.verdict && f.learning).length,
  };
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };
  const base = (over = {}) => ({ features: [{
    id: 'f1', declared_at: '2026-08-01', shipped_at: '2026-08-10', evaluation_at: '2026-09-10',
    metric: { key: 'obsidian_append_rate', numerator: 'obsidian_append_ok',
      denominator: 'obsidian_append_ok|obsidian_append_failed', higher_is_better: true,
      baseline: { rate: 0.62, n: 400 } },
    ...over } ] });
  const P = (doc, opts) => validate(doc, { today: '2026-08-25', ...opts }).problems;
  const W = (doc) => validate(doc, { today: '2026-08-25' }).warnings;

  t('正しい行は通る', P(base()).length === 0);

  // 核心
  t('**出荷後に指標を決めたら落ちる**',
    P(base({ declared_at: '2026-08-20' })).some((p) => p.includes('出荷の後に決めている')));
  t('宣言なしの出荷は落ちる',
    P(base({ declared_at: undefined })).some((p) => p.includes('declared_at が無い')));
  t('評価日の無い出荷は落ちる',
    P(base({ evaluation_at: undefined })).some((p) => p.includes('evaluation_at が無い')));

  // 安全指標を成功指標にしない
  t('**安全指標だけを成功指標にできない**',
    P(base({ metric: { key: 'launch_ok', numerator: '!launch_incomplete', higher_is_better: true } }))
      .some((p) => p.includes('安全指標')));
  t('理由を書けば安全指標も使える',
    P(base({ metric: { key: 'send_success', numerator: 'memo_send_success', higher_is_better: true,
      why_guard_metric: '送信の確実性そのものが要望なので、これが成功指標', baseline: { rate: 0.9 } } }))
      .length === 0);

  // 判定
  t('5値以外の判定は落ちる',
    P(base({ verdict: 'keep', evaluated_at: '2026-09-10', learning: 'x' }))
      .some((p) => p.includes('5値')));
  t('**基準の数字が無いのに「効いた」と書けない**',
    P(base({ verdict: 'success', evaluated_at: '2026-09-10', learning: 'x',
      metric: { key: 'k', numerator: 'a', higher_is_better: true, baseline: { note: '未記録' } } }))
      .some((p) => p.includes('baseline に数字が無い')));
  t('measurement_failed なら基準が無くても書ける',
    P(base({ verdict: 'measurement_failed', evaluated_at: '2026-09-10', learning: 'x',
      metric: { key: 'k', numerator: 'a', higher_is_better: true } })).length === 0);
  t('判定したのに learning が無ければ落ちる',
    P(base({ verdict: 'no_change', evaluated_at: '2026-09-10' }))
      .some((p) => p.includes('learning が無い')));

  // 評価日超過は**鳴らすが落とさない**
  t('評価日超過は警告どまり（出荷を人質にしない）',
    P(base({ evaluation_at: '2026-08-01' })).length === 0
      && W(base({ evaluation_at: '2026-08-01' })).length === 1);

  t('存在しない backlog_id は落ちる',
    validate(base({ backlog_id: 'zzz' }), { backlogIds: new Set(['a']), today: '2026-08-25' })
      .problems.some((p) => p.includes('feature-backlog.json に無い')));

  const s = summarize({ features: [
    { id: 'a', declared_at: 'x', shipped_at: 'y' },
    { id: 'b', declared_at: 'x', shipped_at: 'y', verdict: 'success', learning: 'z' },
  ] });
  t('完走の数と出荷の数を分けて数える', s.shipped === 2 && s.completed === 1);

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const backlog = fs.existsSync(BACKLOG_PATH)
    ? new Set((JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8')).candidates || []).map((c) => c.id))
    : new Set();
  const { problems, warnings } = validate(doc, { backlogIds: backlog });
  const s = summarize(doc);

  console.log(`機能の改善サイクル — 宣言 ${s.declared} / 出荷 ${s.shipped}`
    + ` / 判定 ${s.evaluated} / **完走 ${s.completed}**\n`);
  for (const f of doc.features || []) {
    const state = f.verdict ? `判定 ${f.verdict}` : (f.shipped_at ? '評価待ち' : '未出荷');
    console.log(`  [${state}] ${f.id}  ${f.title ?? ''}`);
    if (f.metric?.key) console.log(`         指標 ${f.metric.key} / 評価日 ${f.evaluation_at ?? '—'}`);
  }
  if (!doc.features?.length) {
    console.log('  1件も無い。**「完走0件」であって「機能を出していない」ではない。**');
    console.log('  出荷はしているが、出す前に測り方を決めた機能がまだ無い。');
  }
  for (const w of warnings) console.log(`\n  ⚠ ${w}`);

  if (problems.length) {
    console.error('\n機能の改善サイクル: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n宣言の順序・指標の形・判定の条件に問題なし。');
}
