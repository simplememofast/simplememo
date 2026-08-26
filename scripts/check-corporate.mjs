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
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { requireShape } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OBLIGATIONS_PATH = path.join(ROOT, 'data/corporate-obligations.json');
const VENDOR_PATH = path.join(ROOT, 'data/vendor-register.json');

export const CLAUSE_STATES = ['ok', 'risk', 'unreviewed', 'not_applicable'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** これより近い期限は警告。資格情報の30日と揃える。 */
export const WARN_DAYS = 30;

/**
 * 決算期（何月末で締めるか）から、法人税・地方税の申告期限を導く。
 *
 * **手で書かない。**日付を台帳に直書きすると、翌年になっても誰も直さず
 * 「期限を過ぎている」か「もう過ぎた日付が next_due に残る」のどちらかになる。
 * このリポジトリが数字ではなく数え方を凍結しているのと同じ理由で、
 * ここも**決算月だけを持って、期限は毎回計算する。**
 *
 * 原則は事業年度終了日の翌日から2か月以内。
 * **申告期限の延長特例（1か月）を適用している場合は、この計算より1か月遅い。**
 * 適用の有無はリポジトリから取れないので、`filing_extension_months` を明示で持つ。
 *
 * @param fyEndMonth 決算月（1〜12）。2 なら2月末締め
 * @param today      YYYY-MM-DD
 * @param extraMonths 延長特例の月数（既定0）
 */
export function nextCorporateTaxDue(fyEndMonth, today, extraMonths = 0) {
  if (!Number.isInteger(fyEndMonth) || fyEndMonth < 1 || fyEndMonth > 12) return null;
  const t = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;

  // 決算期末の候補を年ごとに作り、**今日より後に来る最初の申告期限**を返す。
  for (let y = t.getUTCFullYear() - 1; y <= t.getUTCFullYear() + 2; y += 1) {
    // 決算期末＝その月の末日（UTCの月末は翌月0日で取れる）
    const fyEnd = new Date(Date.UTC(y, fyEndMonth, 0));
    // 期限＝末日の (2 + 延長) か月後の同日。月末締めなので月末に落ちる。
    const due = new Date(Date.UTC(y, fyEndMonth + 2 + extraMonths, 0));
    if (due > t && fyEnd <= due) return due.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * @param {Set|null} vendorIds  ベンダー台帳の id。**null は「照合しない」**で、
 *   空の Set は「ベンダー台帳が空」。この2つは違う。
 */
export function validate(doc, { vendorIds = null, today = new Date().toISOString().slice(0, 10) } = {}) {
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
      // **決算期から導ける期限は、導いた値と一致することを強制する。**
      // 手で書き換えて年をまたぎ忘れる経路をつぶす。
      if (d.derive_from === 'fiscal_year_end') {
        const m = doc.entity?.fiscal_year_end_month;
        const ext = d.filing_extension_months ?? 0;
        const derived = nextCorporateTaxDue(m, today, ext);
        if (!derived) {
          problems.push(`${at}: derive_from: fiscal_year_end だが entity.fiscal_year_end_month が無い/不正`);
        } else if (derived !== d.next_due) {
          problems.push(`${at}: next_due ${d.next_due} が決算期${m}月からの導出 ${derived} と違う`
            + '（延長特例は filing_extension_months で明示すること。**手で日付を書き換えない**）');
        }
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
      // [2026-08-26] ここは `vendorIds.size && !vendorIds.has(...)` だった。
      // **ベンダー台帳が空だと、この規則が丸ごと消える。**
      // 実測: 台帳に無い id を contract_review へ足す → 捕まる。
      // そのまま vendor-register.json を空にする → **検出なし**。
      // 消える規則の文面が「片方だけ増えると照合が素通りする」で、
      // **素通りさせる条件を自分で持っていた。**
      if (vendorIds && !vendorIds.has(v.id)) {
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
    for (const id of vendorIds || []) {
      if (!seen.has(id)) problems.push(`contract_review に「${id}」が無い — ベンダー台帳にあるのに条項を見る対象から漏れている`);
    }
  }
  return { problems, warnings };
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
const SELFTEST_BREAKAGES = [
  ['**切れたら何が止まるか**が無い期限は落ちる（優先順位が付かない）', (d) => { delete d.deadlines[0].what_breaks; }],
  ['id と title が無ければ落ちる', (d) => { delete d.deadlines[0].id; delete d.deadlines[0].title; }],
  ['confirmed なのに日付が不正なら落ちる', (d) => { d.deadlines[0].confirmed_by_owner = true; d.deadlines[0].next_due = 'そのうち'; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8')),
  (d) => validate(d).problems,
  SELFTEST_BREAKAGES,
);

// [2026-08-26] **空の台帳で規則が消える形**を固定する。
// `vendorIds.size &&` だった頃は、vendor-register.json を空にすると
// 「ベンダー台帳に無い id」が1件も出なかった（実測済み）。
SCENARIOS.push(
  ['**ベンダー台帳が空なら contract_review は全部照合できない**（空を「照合しない」と読まない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const p = validate(d, { vendorIds: new Set() }).problems;
    assert(p.some((x) => x.includes('ベンダー台帳に無い id')),
      '空のベンダー台帳を通した — **片方だけ増えたのを検出できない**');
  }],
  ['null は「照合しない」（空の Set とは別）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const p = validate(d, { vendorIds: null }).problems;
    assert(!p.some((x) => x.includes('ベンダー台帳に無い id')), '照合しない指定で照合した');
  }],
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
  const vendors = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
  requireShape(vendors, ['vendors'], { what: 'data/vendor-register.json',
    why: '契約条項を見る対象と突き合わせられない（**片側だけ増えたのを検出できない**）' });
  const vendorIds = new Set(vendors.vendors.map((v) => v.id));
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
