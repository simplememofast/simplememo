#!/usr/bin/env node
/**
 * 機能バックログの自動優先順位付け。
 *
 *   node scripts/feature-score.mjs           # 順位
 *   node scripts/feature-score.mjs --check   # CI用
 *   node scripts/feature-score.mjs --json
 *
 * **これが無いと「一気通貫」は成立しない。** 計測する仕組みと作る仕組みが
 * それぞれあっても、**計測の結果が次に作るものを決めていない**なら、
 * 工程が並んでいるだけで通ってはいない。ここがその接続。
 *
 * ## 確信度は主観で置かない
 *
 * 確信度は「どれだけ強い根拠があるか」で機械的に決まる（EVIDENCE_STRENGTH）。
 * 実測がある候補は高く、思いつきは低い。**根拠の無い候補が「確信度が高い」と
 * 主張できない**ようにしてある。ここを手で置けるようにすると、
 * 順位はいくらでも動かせる。
 *
 * ## リスクは点数を下げるのではなく、承認を要求する
 *
 * リスクを掛け算で効かせると、**期待効果が大きければ危険な案が1位になる**。
 * 不可逆・課金・プライバシーに触る候補は、点数と無関係に承認を要求する
 * （data/authority-matrix.json と同じ考え方）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJSON } from './lib/read-json.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 根拠の強さ → 確信度。**手で置かせない。** */
export const EVIDENCE_STRENGTH = {
  measured_ours: 1.0,      // 自前の実測（BigQuery / 運転台帳 / ベンチマーク）
  measured_external: 0.7,  // 外部の実測（GSC・ASC・ストアレビュー）
  observed: 0.5,           // 観察はしたが数えていない（問い合わせ・レビュー本文）
  analogous: 0.3,          // 別の場所で効いた事例からの類推
  hypothesis: 0.15,        // 思いつき。**ゼロにはしない**が、実測には勝てない
};

/** 承認が要るリスク種別。**点数では消せない。** */
export const GATED_RISKS = new Set(['irreversible', 'billing', 'privacy', 'review']);

export function designDecisionProblems(item) {
  const d = item.design_decision;
  if (d === undefined) return [];
  const problems = [];
  if (d?.by !== 'ai' || d?.verdict !== 'accepted') problems.push('設計決定はAIによる採用記録であること');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.at ?? '')) problems.push('設計決定日が必要');
  if (!/^docs\/[a-z0-9_/-]+\.md$/.test(d?.document ?? '') || d.document.includes('..')) problems.push('設計文書はdocs内のMarkdownであること');
  if (typeof d?.rationale !== 'string' || d.rationale.trim().length < 30) problems.push('採用の根拠が必要');
  if (!Array.isArray(d?.acceptance) || d.acceptance.length < 3 || d.acceptance.some(x => typeof x !== 'string' || x.trim().length < 10)) problems.push('具体的な受入条件が3件以上必要');
  if (!Array.isArray(d?.source_refs) || !d.source_refs.length || d.source_refs.some(x => !item.evidence?.includes(x))) problems.push('既存候補の根拠に結び付く出典が必要');
  if ((item.risks ?? []).length) problems.push('リスク付き候補の承認を設計採用で代替しない');
  return problems;
}

export function recordDesign(doc, id, decision) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) throw new Error('採用判断のオブジェクトが必要');
  const matches = doc.candidates.filter(c => c.id === id);
  if (matches.length !== 1) throw new Error('候補が一意に存在すること');
  const item = matches[0];
  if (item.design_decision !== undefined) throw new Error('既存の採用判断は上書きしない');
  const next = { ...item, design_decision: decision };
  const problems = designDecisionProblems(next);
  if (problems.length) throw new Error(problems.join('; '));
  return { ...doc, candidates: doc.candidates.map(c => c.id === id ? next : c) };
}

export function score(item) {
  const problems = designDecisionProblems(item);
  if (problems.length) return { error: problems.join("; ") };
  const confidence = EVIDENCE_STRENGTH[item.evidence_strength];
  if (confidence === undefined) return { error: `未知の evidence_strength: ${item.evidence_strength}` };
  if (!(item.effort_days > 0)) return { error: 'effort_days は正の数' };

  const risks = item.risks ?? [];
  const gated = risks.filter((r) => GATED_RISKS.has(r));

  // 効果 × 確信度 ÷ 工数。リスクは掛けない（下の gated で別に扱う）。
  const value = (item.expected_effect * confidence) / item.effort_days;

  return {
    confidence,
    value,
    gated: gated.length > 0,
    gated_by: gated,
    // 根拠が弱いものは「やらない」ではなく「まず測る」。
    next_step: [
      item.design_decision ? `設計採用済み（AI・${item.design_decision.at}）: ${item.design_decision.document}` : null,
      confidence <= EVIDENCE_STRENGTH.analogous
        ? 'まず測る（この確信度で作ると、効いたかどうかも判定できない）'
        : gated.length ? `実装前に承認（${gated.join(', ')}）` : '着手可',
    ].filter(Boolean).join(' / '),
  };
}

export function rank(doc) {
  const rows = doc.candidates.map((c) => ({ ...c, ...score(c) }));
  const errors = rows.filter((r) => r.error);
  const ok = rows.filter((r) => !r.error).sort((a, b) => b.value - a.value);
  return { ranked: ok, errors };
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// この採点が守っているのは「根拠が弱いものを『やらない』ではなく『まず測る』へ
// 送る」ことと、「承認が要るリスクを黙って通さない」こと。
// **その2つが効かなくなったときに検出できること**を固定する。
const SCENARIOS = [
  ['AIの設計採用がバックログ出力へ反映され、無根拠・リスク付き・上書きを拒否する', () => {
    const item = { id: 'fixture', title: '検体', evidence_strength: 'observed', expected_effect: 5, effort_days: 2, risks: [], evidence: ['data/review-intake.json'] };
    const decision = { by: 'ai', verdict: 'accepted', at: '2026-09-06', document: 'docs/designs/fixture.md', rationale: '実際の利用者要望と現在の実装制約を比較し、後方互換性を保つ設計を採用する。', acceptance: ['既存設定では同じ保存先を使うこと', '選択したフォルダの外へ書かないこと', '設定変更の取消は元の状態を保つこと'], source_refs: item.evidence };
    const doc = { candidates: [item] };
    const applied = recordDesign(doc, item.id, decision);
    if (item.design_decision || !rank(applied).ranked[0].next_step.includes('設計採用済み')) throw new Error('判断が適用されない、または入力を書き換えた');
    const reject = fn => { let failed = false; try { fn(); } catch { failed = true; } if (!failed) throw new Error('不正な設計採用を拒否しない'); };
    for (const patch of [{ by: 'owner' }, { verdict: 'approved' }, { acceptance: [] }, { source_refs: ['invented'] }, { document: '../outside.md' }, { rationale: '' }]) {
      const bad = { ...decision, ...patch };
      reject(() => recordDesign(doc, item.id, bad));
      if (!score({ ...item, design_decision: bad }).error) throw new Error('不正な既存記録が採点を通った');
    }
    reject(() => recordDesign({ candidates: [{ ...item, risks: ['billing'] }] }, item.id, decision));
    reject(() => recordDesign(applied, item.id, decision));
    reject(() => recordDesign(doc, 'missing', decision));
    reject(() => recordDesign(doc, item.id, undefined));
    if (!score({ ...applied.candidates[0], evidence_strength: 'hypothesis' }).next_step.includes('まず測る')) throw new Error('採用で計測の条件を消した');
  }],
  ['知らない evidence_strength は error を返す（0点で通さない）', () => {
    const r = score({ evidence_strength: 'なんとなく', expected_effect: 1, effort_days: 1 });
    if (!r.error) throw new Error('未知の確信度が通った');
  }],
  ['**工数0は error**（ゼロ除算で無限大の価値にしない）', () => {
    const r = score({ evidence_strength: 'analogous', expected_effect: 1, effort_days: 0 });
    if (!r.error) throw new Error('effort_days=0 が通った');
  }],
  ['工数が負でも error', () => {
    const r = score({ evidence_strength: 'analogous', expected_effect: 1, effort_days: -3 });
    if (!r.error) throw new Error('負の工数が通った');
  }],
  ['**確信度が低いと「まず測る」へ送る**（この確信度で作ると効いたかも判定できない）', () => {
    const r = score({ evidence_strength: 'analogous', expected_effect: 10, effort_days: 1 });
    if (!r.next_step.includes('まず測る')) throw new Error(`next_step=${r.next_step}`);
  }],
  ['**承認が要るリスクは gated になる**（黙って着手可にしない）', () => {
    const risky = [...GATED_RISKS][0];
    const r = score({ evidence_strength: 'measured_ours', expected_effect: 10, effort_days: 1, risks: [risky] });
    if (!r.gated) throw new Error(`${risky} が gated にならない`);
    if (!r.next_step.includes('承認')) throw new Error(`next_step=${r.next_step}`);
  }],
  ['効果 × 確信度 ÷ 工数（式が入れ替わっていない）', () => {
    const a = score({ evidence_strength: 'measured_ours', expected_effect: 10, effort_days: 1 });
    const b = score({ evidence_strength: 'measured_ours', expected_effect: 10, effort_days: 2 });
    if (!(a.value > b.value)) throw new Error('工数が増えても価値が下がらない');
  }],
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) {
    let failed = 0;
    for (const [name, fn] of SCENARIOS) {
      try { fn(); console.log(`  ok   ${name}`); }
      catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
    }
    console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
    process.exit(failed === 0 ? 0 : 1);
  }
  const argv = process.argv.slice(2);
  const doc = readJSON(ROOT, 'data/feature-backlog.json');
  if (argv.includes('--record-design')) {
    const id = argv[argv.indexOf('--record-design') + 1];
    const input = argv[argv.indexOf('--decision-file') + 1];
    if (!argv.includes('--decision-file') || !input) throw new Error('--decision-file が必要');
    const decision = JSON.parse(fs.readFileSync(input, 'utf8'));
    const next = recordDesign(doc, id, decision);
    if (!fs.existsSync(path.join(ROOT, decision.document))) throw new Error('採用する設計文書が存在しない');
    fs.writeFileSync(path.join(ROOT, 'data/feature-backlog.json'), JSON.stringify(next, null, 2) + '\n');
    console.log(`設計を採用した: ${id}`);
    process.exit(0);
  }
  const { ranked, errors } = rank(doc);
  for (const item of doc.candidates) {
    if (item.design_decision && !designDecisionProblems(item).length && !fs.existsSync(path.join(ROOT, item.design_decision.document))) {
      errors.push({ title: item.title, error: '設計文書が存在しない' });
    }
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ranked, errors }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log('機能バックログ — 期待効果 × 確信度 ÷ 工数');
  console.log('  確信度は根拠の強さで決まる。手で置けない。\n');

  ranked.forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${r.value.toFixed(2)}  ${r.title}`);
    console.log(`      効果${r.expected_effect} × 確信${r.confidence}（${r.evidence_strength}）÷ ${r.effort_days}日`);
    console.log(`      → ${r.next_step}`);
    if (r.evidence?.length) console.log(`      根拠: ${r.evidence.join(' / ')}`);
    console.log('');
  });

  const weak = ranked.filter((r) => r.confidence <= EVIDENCE_STRENGTH.analogous);
  if (weak.length) {
    console.log(`  根拠が弱い候補 ${weak.length}件 — **順位が高くても、まず測る。**`);
    console.log('  作ってから「効いたか分からない」になるのが一番高くつく。\n');
  }
  const gated = ranked.filter((r) => r.gated);
  if (gated.length) {
    console.log(`  承認が要る候補 ${gated.length}件（点数では消えない）:`);
    for (const g of gated) console.log(`    ${g.title} — ${g.gated_by.join(', ')}`);
    console.log('');
  }

  if (errors.length) {
    for (const e of errors) console.log(`  NG: ${e.title} — ${e.error}`);
  }
  if (argv.includes('--check')) {
    if (errors.length) { console.error(`バックログの形に問題: ${errors.length}件`); process.exit(1); }
    console.log('バックログの形に問題なし。');
  }
}
