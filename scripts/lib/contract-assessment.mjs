import crypto from 'node:crypto';
import { looksLikeTerms } from '../vendor-terms.mjs';
import { assert } from './selftest.mjs';

export const REVIEW_AREAS = ['liability_cap', 'indemnification', 'ip', 'personal_data',
  'confidentiality', 'warranties', 'termination', 'governing_law', 'insurance',
  'assignment', 'force_majeure', 'payment'];
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const digest = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;

// Validate provenance and scope, not the legal correctness of AI conclusions.
export function assessmentProblems(rows, vendors) {
  if (!Array.isArray(rows)) return ['AI条項検査の記録が配列でない'];
  const problems = [], seen = new Set();
  for (const r of rows) {
    const fail = (why) => problems.push(`AI条項検査 ${r?.id ?? '?'}: ${why}`);
    if (!r || typeof r !== 'object') { fail('記録が不正'); continue; }
    if (!nonempty(r.id) || seen.has(r.id)) fail('ID欠落又は重複');
    seen.add(r.id);
    const v = vendors.find((v) => v.id === r.vendor_id);
    if (!v || r.source?.url !== v.source) fail('登録ベンダーの原文URLと一致しない');
    if (r.actor !== 'ai' || !nonempty(r.agent)) fail('AI実行者を明記する');
    if (r.contract_approved !== false || r.scope !== 'public_terms_analysis'
      || r.agreement_applicability !== 'unverified') fail('公開規約の読解を契約承認・適用確認に変えている');
    if (r.basis !== 'generic_customer_review') fail('未承認の自社プレイブックを名乗っている');
    if (!nonempty(r.observed_at) || !Number.isFinite(Date.parse(r.observed_at))) fail('観測日時が不正');
    if (!digest(r.source?.sha256) || !Number.isInteger(r.source?.characters)
      || r.source.characters < 2000 || !nonempty(r.source?.version)) fail('原文の指紋・長さ・版が不正');
    if (!Array.isArray(r.open_questions) || !r.open_questions.length
      || r.open_questions.some((q) => !nonempty(q))) fail('未確認事項が無い');
    if (!r.findings || typeof r.findings !== 'object') { fail('検査結果が無い'); continue; }
    if (Object.keys(r.findings).some((k) => !REVIEW_AREAS.includes(k))) fail('未知の検査観点');
    for (const key of REVIEW_AREAS) {
      const f = r.findings[key];
      if (!f || !['risk', 'conditional', 'not_identified'].includes(f.result)
        || !nonempty(f.summary) || !nonempty(f.action)) { fail(`${key}: 結果・根拠・対応が不足`); continue; }
      if (!Array.isArray(f.evidence) || !f.evidence.length) { fail(`${key}: 原文位置が無い`); continue; }
      for (const e of f.evidence) {
        if (!e || !nonempty(e.section) || !digest(e.sha256) || !Number.isInteger(e.start)
          || !Number.isInteger(e.length) || e.start < 0 || e.length <= 0
          || e.start + e.length > r.source?.characters) fail(`${key}: 原文位置が範囲外`);
      }
    }
  }
  return problems;
}

// The agent supplies the judgment; the full fetched text is required to bind it
// to exact sections. Source text and private extraction markers are not published.
export function bindAssessment(input, text, vendors) {
  if (typeof text !== 'string' || text.length > 200000 || !looksLikeTerms(text).ok)
    throw new Error('原文を取得できていない');
  const findings = {};
  for (const key of REVIEW_AREAS) {
    const f = input.findings?.[key];
    if (!f || !Array.isArray(f.references)) throw new Error(`${key}: 原文参照が無い`);
    const evidence = f.references.map(({ section, from, to }) => {
      if (!nonempty(from) || !nonempty(to)) throw new Error(`${key}: 原文参照が不正`);
      const start = text.indexOf(from);
      const end = text.indexOf(to, start + from.length);
      if (!nonempty(from) || !nonempty(to) || start < 0 || end <= start
        || text.lastIndexOf(from) !== start) throw new Error(`${key}: 原文の範囲を一意に特定できない`);
      const span = text.slice(start, end);
      return { section, start, length: span.length, sha256: hash(span) };
    });
    findings[key] = { result: f.result, summary: f.summary, action: f.action, evidence };
  }
  const row = { ...input, source: { ...input.source, sha256: hash(text), characters: text.length }, findings };
  const problems = assessmentProblems([row], vendors);
  if (problems.length) throw new Error(problems.join('\n'));
  return row;
}

export const assessmentScenarios = [
  ['AI条項検査: 原文・承認・人の判定を混同しない', () => {
    const text = 'BEGIN agreement liability ' + 'text '.repeat(450) + ' END';
    const vendors = [{ id: 'sample', source: 'https://example.com/terms' }];
    const input = { id: 'sample-review', vendor_id: 'sample', actor: 'ai', agent: 'test',
      scope: 'public_terms_analysis', contract_approved: false, agreement_applicability: 'unverified',
      basis: 'generic_customer_review', observed_at: '2026-09-06T00:00:00Z',
      source: { url: vendors[0].source, version: 'fixture' }, open_questions: ['Applicability unknown'],
      findings: Object.fromEntries(REVIEW_AREAS.map((k) => [k, { result: 'conditional', summary: 'Fixture',
        action: 'Verify', references: [{ section: 'fixture', from: 'BEGIN', to: 'END' }] }])) };
    const row = bindAssessment(input, text, vendors);
    assert(assessmentProblems([row], vendors).length === 0, '正しい検体');
    for (const change of [
      (r) => { r.contract_approved = true; }, (r) => { r.actor = 'human'; },
      (r) => { r.agreement_applicability = 'verified'; }, (r) => { delete r.findings.ip; },
      (r) => { r.source.sha256 = ''; }, (r) => { r.source.url = 'https://other.example/terms'; },
      (r) => { r.findings.ip.evidence[0].length = text.length + 1; },
      (r) => { r.open_questions = []; },
    ]) {
      const bad = structuredClone(row); change(bad);
      assert(assessmentProblems([bad], vendors).length > 0, '不正な検査記録を拒否');
    }
    assert(assessmentProblems([row, row], vendors).length > 0, '重複記録を拒否');
    for (const broken of ['short agreement', text.replace('BEGIN', 'MISSING')]) {
      let failed = false; try { bindAssessment(input, broken, vendors); } catch { failed = true; }
      assert(failed, '原文が違えば記録できない');
    }
  }],
];
