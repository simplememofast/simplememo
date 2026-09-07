import { assessmentProblems } from './contract-assessment.mjs';
import { assert } from './selftest.mjs';

const text = (v) => typeof v === 'string' && v.trim().length > 0;

// Validate reference integrity and analysis scope, not legal correctness.
export function comparisonProblems(cr) {
  const problems = assessmentProblems(cr.ai_assessments, cr.vendors);
  if (problems.length) return problems;
  const rows = cr.ai_comparisons;
  if (!Array.isArray(rows) || !rows.length) return [...problems, '契約比較の実行記録が無い'];
  const ids = new Set();
  for (const row of rows) {
    const fail = (message) => problems.push(`契約比較 ${row?.id ?? '?'}: ${message}`);
    if (!row || !text(row.id) || ids.has(row.id)) { fail('ID欠落又は重複'); continue; }
    ids.add(row.id);
    if (row.actor !== 'ai' || !text(row.agent) || !Number.isFinite(Date.parse(row.observed_at))) fail('AI実行者・日時が不正');
    if (row.scope !== 'public_terms_comparison' || row.contract_approved !== false
        || row.agreement_applicability !== 'unverified') fail('比較を契約承認・適用確認へ変えている');
    if (!Array.isArray(row.sources) || !row.sources.length) { fail('比較元が無い'); continue; }
    const seen = new Set();
    for (const source of row.sources) {
      const assessment = cr.ai_assessments?.find((a) => a.id === source?.assessment_id);
      if (!assessment || seen.has(source.assessment_id)
          || assessment.source.sha256 !== source.source_sha256) fail('比較元欠落・重複又は原文指紋変更');
      if (source) seen.add(source.assessment_id);
    }
    // This portfolio comparison explicitly covers the registered analysis set.
    // A newly added source needs a fresh comparison, not silent omission.
    if (cr.ai_assessments?.some((a) => !seen.has(a.id))) fail('比較していない分析がある');
    for (const clause of cr.clauses ?? []) {
      const finding = row.findings?.[clause];
      if (!finding || !['difference', 'risk', 'action'].every((k) => text(finding[k]))) fail(`${clause}: 条件差・リスク・対応が不足`);
    }
    if (Object.keys(row.findings ?? {}).some((k) => !cr.clauses.includes(k))) fail('未知の比較観点');
    if (!Array.isArray(row.limitations) || !row.limitations.length || row.limitations.some((v) => !text(v))) fail('比較の限界が無い');
  }
  return problems;
}

export function comparisonReport(cr) {
  const problems = comparisonProblems(cr);
  if (problems.length) return { problems, comparisons: [] };
  return { problems, comparisons: cr.ai_comparisons.map((row) => ({ ...row,
    sources: row.sources.map((ref) => {
      const a = cr.ai_assessments.find((a) => a.id === ref.assessment_id);
      return { ...ref, vendor: a.vendor_id, observed_at: a.observed_at, source: a.source,
        findings: Object.fromEntries(cr.clauses.map((clause) => [clause, a.findings[clause]])) };
    }),
  })) };
}

export function comparisonScenarios(cr) {
  return [
    ['契約比較: 実データの条件差と原文根拠を出力する', () => {
      const report = comparisonReport(cr);
      assert(!report.problems.length, report.problems.join(' / '));
      const row = report.comparisons[0];
      assert(row.sources.length === cr.ai_assessments.length, '比較元が欠けた');
      assert(row.sources.every((s) => s.findings.ip.evidence.length > 0), '原文位置が欠けた');
    }],
    ['契約比較: 原文変更・分析欠落・承認偽装を拒否する', () => {
      for (const mutate of [
        (r) => { r.sources[0].source_sha256 = '0'.repeat(64); },
        (r) => { r.sources.pop(); },
        (r) => { r.sources.push(r.sources[0]); },
        (r) => { r.contract_approved = true; },
        (r) => { delete r.findings.ip.risk; },
      ]) {
        const copy = structuredClone(cr);
        mutate(copy.ai_comparisons[0]);
        const report = comparisonReport(copy);
        assert(report.problems.length > 0 && report.comparisons.length === 0, '不正な比較を出力した');
      }
    }],
  ];
}
