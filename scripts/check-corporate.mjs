#!/usr/bin/env node
/**
 * 法人としての期限・記録・契約条項を検査する。
 *
 *   node scripts/check-corporate.mjs           # 表示
 *   node scripts/check-corporate.mjs --check   # CI
 *
 * 【この台帳が守っていること】
 * **「把握していない」を「余裕がある」と読ませないこと。**
 * 期限の実日付も議事録の所在も契約書の本文も、リポジトリの外にあって
 * オーナーしか埋められない。だからここでできるのは、
 * **空いている場所を空いていると言い続けること**だけ。
 *
 * 資格情報の期限監視（check-expiry.mjs）が critical 3件を「未把握」として
 * 独立した状態で持っているのと同じ形にしてある。ok側に混ぜない。
 *
 * 【落とすもの／報告するもの】
 * 落とす … 台帳の形が壊れている（理由の無い未確認・存在しないベンダー参照・
 *          confirmed なのに日付が無い・期限を過ぎている）
 * 報告   … 未確認の件数そのもの。**これで落とすと、埋まるまでCIが永久に赤くなる**
 *          （埋められるのはオーナーだけなので、赤いCIは何も動かさない）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OBLIGATIONS_PATH = path.join(ROOT, 'data/corporate-obligations.json');
const VENDOR_PATH = path.join(ROOT, 'data/vendor-register.json');

export const CLAUSE_STATES = ['ok', 'risk', 'unreviewed', 'not_applicable'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** これより近い期限は警告。資格情報の30日と揃える。 */
export const WARN_DAYS = 30;

export function validate(doc, { vendorIds = new Set(), today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const warnings = [];

  for (const d of doc.deadlines || []) {
    const at = `deadlines「${d.title || d.id}」`;
    if (!d.id || !d.title) problems.push(`${at}: id と title が要る`);
    if (!d.what_breaks) problems.push(`${at}: what_breaks が無い — 切れたら何が止まるか書いていない期限は優先順位が付かない`);
    if (d.confirmed_by_owner) {
      if (!DATE.test(d.next_due || '')) {
        problems.push(`${at}: confirmed なのに next_due が YYYY-MM-DD でない`);
      } else {
        const days = Math.round((new Date(d.next_due) - new Date(today)) / 86400000);
        if (days < 0) problems.push(`${at}: 期限を ${-days} 日過ぎている`);
        else if (days <= WARN_DAYS) warnings.push(`${at}: あと ${days} 日`);
      }
    } else if (!d.unconfirmed_reason) {
      problems.push(`${at}: 未確認なのに理由が無い`
        + ' — **「把握していない」は「余裕がある」ではない。**なぜ埋まらないかを残す');
    }
  }

  for (const r of doc.records || []) {
    const at = `records「${r.title || r.id}」`;
    if (typeof r.exists !== 'boolean') problems.push(`${at}: exists を明示すること`);
    if (r.exists && !r.where) problems.push(`${at}: あると書いているのに所在が無い`);
    if (!r.exists && !r.note) problems.push(`${at}: 無いのに理由が無い`);
  }

  const cr = doc.contract_review;
  if (cr) {
    const seen = new Set();
    for (const v of cr.vendors || []) {
      const at = `contract_review「${v.id}」`;
      if (vendorIds.size && !vendorIds.has(v.id)) {
        problems.push(`${at}: ベンダー台帳に無い id — 片方だけ増えると照合が素通りする`);
      }
      if (seen.has(v.id)) problems.push(`${at}: id が重複`);
      seen.add(v.id);
      for (const c of cr.clauses || []) {
        if (!CLAUSE_STATES.includes(v[c])) {
          problems.push(`${at}: ${c} が ${CLAUSE_STATES.join('/')} のいずれかで要る`);
        }
      }
      const anyReviewed = (cr.clauses || []).some((c) => v[c] !== 'unreviewed');
      if (anyReviewed && !v.reviewed_at) problems.push(`${at}: 確認した観点があるのに reviewed_at が無い`);
      if (v.liability_cap === 'risk' && !v.risk_note) {
        problems.push(`${at}: risk と書いたのに risk_note が無い — 何が危ないか残らない`);
      }
    }
    // ベンダー台帳にあるのにここに無い＝検査対象から漏れている
    for (const id of vendorIds) {
      if (!seen.has(id)) problems.push(`contract_review に「${id}」が無い — ベンダー台帳にあるのに条項を見る対象から漏れている`);
    }
  }
  return { problems, warnings };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
  const vendors = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
  const vendorIds = new Set((vendors.vendors || []).map((v) => v.id));
  const { problems, warnings } = validate(doc, { vendorIds });

  const unconfirmed = (doc.deadlines || []).filter((d) => !d.confirmed_by_owner);
  const missingRecords = (doc.records || []).filter((r) => !r.exists);
  const cr = doc.contract_review || {};
  const unreviewedVendors = (cr.vendors || []).filter(
    (v) => (cr.clauses || []).every((c) => v[c] === 'unreviewed'));

  console.log('法人としての期限・記録・契約条項\n');
  console.log(`  期限 ${doc.deadlines.length}件 — うち**未把握 ${unconfirmed.length}件**`);
  for (const d of doc.deadlines) {
    console.log(`    ${d.confirmed_by_owner ? d.next_due : '**未把握**'.padEnd(10)}  ${d.title}`);
    if (!d.confirmed_by_owner) console.log(`                ${d.unconfirmed_reason}`);
  }
  console.log(`\n  記録 ${doc.records.length}件 — うち**所在が決まっていない ${missingRecords.length}件**`);
  for (const r of doc.records) {
    console.log(`    ${r.exists ? 'あり  ' : '**無し**'}  ${r.title}`);
    if (!r.exists) console.log(`              ${r.note}`);
  }
  console.log(`\n  契約条項 ${cr.vendors?.length ?? 0}社 × ${cr.clauses?.length ?? 0}観点`);
  console.log(`    **全観点が未確認のベンダー ${unreviewedVendors.length}社**`);
  console.log('    書面の契約書は無く、各社の規約への同意で成立している。');
  console.log('    **unreviewed は「問題なし」ではなく「見ていない」。**');

  if (warnings.length) {
    console.log('\n  期限が近い:');
    for (const w of warnings) console.log(`    ${w}`);
  }
  console.log('\n  **この台帳は器で、中身の大半はまだ空。**埋められるのはオーナーだけ。');
  console.log('  ここでできるのは、空いている場所を空いていると言い続けることだけ。');

  if (problems.length) {
    console.error('\n法人の台帳: 形の問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log('\n台帳の形に問題なし（未把握の件数は上に出ている。ゼロではない）。');
  }
}
