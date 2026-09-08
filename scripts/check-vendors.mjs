#!/usr/bin/env node
/**
 * 依存ベンダー台帳の検査。
 *
 *   node scripts/check-vendors.mjs
 *   node scripts/check-vendors.mjs --check
 *   node scripts/check-vendors.mjs --json
 *
 * **「見ていない」を「問題なし」と書かないための検査。**
 * 個人データを渡しているのに DPA を確認していないベンダーを名指しする。
 *
 * 資格情報の台帳（credential-expiry.json）とも突き合わせる。片方にしか
 * 載っていないベンダーは、どちらかの棚卸しが古い。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { readLedger, readLedgerScenarios } from './lib/read-ledger.mjs';
import { readJSON } from './lib/read-json.mjs';
import { vendorReviewProblems, vendorReviewScenarios } from './lib/vendor-operating-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DATA_LEVELS = ['none', 'pseudonymous', 'personal'];
/** 金銭の動き方。none も明示させる（書いていない＝考えていない、を許さない）。 */
export const MONEY_FLOWS = ['none', 'subscription', 'usage', 'one_off'];

function dayNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp / 86400000;
}

/** Recorded plan dates are observations, not proof of renewal or service shutdown. */
export function planDates(doc, { today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()) } = {}) {
  const now = dayNumber(today);
  if (now === null) throw new Error('plan dates: today must be an ISO calendar date');
  const rows = [], errors = [], unobserved = [];
  for (const vendor of doc.vendors) {
    const term = vendor.plan_dates;
    if (term === undefined) { unobserved.push(vendor.id); continue; }
    if (!term || typeof term !== 'object' || Array.isArray(term)) {
      errors.push(`${vendor.id}: plan_dates must be an observation object`); continue;
    }
    const start = dayNumber(term.starts_on), end = dayNumber(term.ends_on), observed = dayNumber(term.observed_on);
    let validSource = false;
    try { validSource = new URL(term.source).protocol === 'https:'; } catch { /* Missing source is invalid. */ }
    if (start === null || end === null || observed === null || start > end || observed > now
        || typeof term.plan !== 'string' || !term.plan.trim() || !validSource
        || term.renewal_after_term !== 'unverified') {
      errors.push(`${vendor.id}: invalid plan dates, observation source, or unsupported renewal claim`); continue;
    }
    const days = end - now;
    rows.push({ vendor: vendor.id, plan: term.plan, observed_on: term.observed_on, ends_on: term.ends_on,
      days_until_recorded_end: days, status: days < 0 ? 'recorded_term_elapsed' : days <= 90 ? 'review_due' : 'recorded',
      renewal_after_term: 'unverified' });
  }
  return { as_of: today, review_days: 90, rows, unobserved, errors };
}

export function audit(doc) {
  const errors = [];
  const unreviewed = [];
  const noFallback = [];
  // Dependencies found in deployed/source paths must be visible before their
  // contract or payment facts are known. This queue grants no approval.
  const discoveries = doc.discovered_dependencies ?? [];
  const discoveryIds = new Set(doc.vendors.map(v => v.id));
  if (!Array.isArray(discoveries)) errors.push('discovered_dependencies must be an array');
  else for (const v of discoveries) {
    if (!v || typeof v.id !== 'string' || !v.id.trim() || discoveryIds.has(v.id)) {
      errors.push('discovered dependency has missing or duplicate id'); continue;
    }
    discoveryIds.add(v.id);
    if (!DATA_LEVELS.includes(v.personal_data)
        || !['pending_review', 'account_verification_pending'].includes(v.status)
        || (v.status === 'account_verification_pending'
          && (typeof v.operating_review_id !== 'string' || !v.operating_review_id.trim()))
        || v.payment_authorized !== false || v.contract_approved !== false
        || !Array.isArray(v.evidence) || !v.evidence.length
        || v.evidence.some(x => typeof x !== 'string' || !x.trim())
        || !Array.isArray(v.open_questions) || !v.open_questions.length
        || v.open_questions.some(x => typeof x !== 'string' || !x.trim())) {
      errors.push(`${v.id}: discovery needs evidence, questions and explicit non-approval`);
    }
  }

  for (const v of doc.vendors) {
    if (!DATA_LEVELS.includes(v.personal_data)) {
      errors.push(`${v.id}: personal_data が未定義の値: ${v.personal_data}`);
    }
    // 落ちたら何が止まるかを書いていないベンダーは、台帳に載っている意味が無い。
    if (!v.breaks_if_down) errors.push(`${v.id}: breaks_if_down が空`);

    // 代替が無いこと自体は問題ではない。**理由が書いていないのが問題。**
    if (!v.fallback) {
      if (!v.fallback_note) errors.push(`${v.id}: 代替が無いのに理由が書いていない`);
      if (v.critical) noFallback.push(v);
    }
    // 個人データを渡していて未レビュー = 見ていないだけ。
    if (v.personal_data !== 'none' && !v.dpa_reviewed) unreviewed.push(v);

    // --- 取引先・送金先の許可リスト（2026-08-22追加） --------------------
    //
    // 「契約・支払い・送金」は権限表で human_only だが、**それだけでは
    // 『誰に払ってよいか』が定義されていない。**ここに載っていない相手への
    // 支払いは、そもそも許可されていない状態にする。
    if (!MONEY_FLOWS.includes(v.money_flow)) {
      errors.push(`${v.id}: money_flow が ${MONEY_FLOWS.join('/')} のいずれかで要る`);
    } else if (v.money_flow !== 'none') {
      if (v.approved_by !== 'human') {
        errors.push(`${v.id}: 金銭が動く取引先は approved_by: "human" が要る`
          + '（**AIが取引先を増やせる状態にしない**）');
      }
      if (!v.approved_at) errors.push(`${v.id}: approved_at が無い — いつ許可したかが残らない`);
      if (!v.payment_method) errors.push(`${v.id}: payment_method が無い — どの経路で金が動くか分からない`);
      // 上限は未設定でよい。**「未設定と決めた」と書かせる**のが要件。
      if (!v.spend_cap_ref) {
        errors.push(`${v.id}: spend_cap_ref が無い（上限が無いなら "unset" と書き、理由を残す）`);
      } else if (v.spend_cap_ref === 'unset' && !v.spend_cap_note) {
        errors.push(`${v.id}: spend_cap_ref が "unset" なのに理由が無い — 空欄と「未設定と決めた」は違う`);
      }
    }
  }
  errors.push(...planDates(doc).errors);
  return { errors, unreviewed, noFallback, discoveries: Array.isArray(discoveries) ? discoveries : [],
    money: doc.vendors.filter((v) => v.money_flow && v.money_flow !== 'none') };
}

/**
 * 資格情報の台帳と突き合わせる。片方が古くなるのを防ぐ。
 *
 * **名前の一致で推測しない。**credential 側に vendor を明示させる。
 * 推測で当てると誤検出が出て、出力そのものが読まれなくなる
 * （最初の実装がそうなり、Provisioning Profile と ASC キーを
 *  「ベンダー台帳に無い」と誤って名指しした）。
 */
export function crossCheck(vendors, credentials) {
  const ids = new Set(vendors.map((v) => v.id));
  const missing = [];
  for (const c of credentials) {
    if (!c.vendor) { missing.push({ credential: c.id, label: c.label, reason: 'vendor 未記入' }); continue; }
    if (!ids.has(c.vendor)) missing.push({ credential: c.id, label: c.label, reason: `未登録の vendor: ${c.vendor}` });
  }
  return missing;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**落ちたとき何が止まるかが空**なら落ちる', (d) => { delete d.vendors[0].breaks_if_down; }],
  ['知らない personal_data は落ちる', (d) => { d.vendors[0].personal_data = 'たぶん渡してない'; }],
  ['**代替が無いのに理由が書いていない**のは落ちる', (d) => { d.vendors[0].fallback = null; delete d.vendors[0].fallback_note; }],
];
const SCENARIOS = ledgerScenarios(
  () => readJSON(ROOT, 'data/vendor-register.json'),
  (d) => audit(d).errors,
  SELFTEST_BREAKAGES,
);

// **台帳の読み方そのもの**も、この検査から走らせる。
// 壊れた台帳を既定値に落とすと、突き合わせが消えて「食い違いなし」と同じ見た目になる。
SCENARIOS.push(...readLedgerScenarios(fs, os));
SCENARIOS.push(...vendorReviewScenarios);

SCENARIOS.push(['未審査依存先は支払許可リストへ入らず、不正な承認・重複を拒否する', () => {
  const doc = readJSON(ROOT, 'data/vendor-register.json');
  doc.discovered_dependencies = [{ id: 'unverified_test', personal_data: 'personal',
    status: 'pending_review', payment_authorized: false, contract_approved: false,
    evidence: ['source.ts'], open_questions: ['Contract applicability'] }];
  const report = audit(doc);
  assert(report.errors.length === 0, 'valid discovery rejected');
  assert(report.discoveries.length === 1, 'valid discovery missing from inventory');
  assert(!report.money.some(v => v.id === 'unverified_test'), 'discovery authorized payment');
  for (const mutate of [
    v => { v.payment_authorized = true; }, v => { v.contract_approved = true; },
    v => { v.id = doc.vendors[0].id; }, v => { v.evidence = []; },
  ]) {
    const copy = structuredClone(doc); mutate(copy.discovered_dependencies[0]);
    assert(audit(copy).errors.length > 0, 'invalid discovery accepted');
  }
}]);

const planFixture = () => ({ vendors: [{ id: 'test', plan_dates: {
  plan: 'Welcome', starts_on: '2026-04-24', ends_on: '2027-04-23', observed_on: '2026-09-07',
  source: 'https://example.com/account/plan', renewal_after_term: 'unverified',
} }] });
SCENARIOS.push(
  ['期限の91日前は記録、90日前から再確認を要求する', () => {
    assert(planDates(planFixture(), { today: '2027-01-22' }).rows[0].status === 'recorded', 'early warning');
    assert(planDates(planFixture(), { today: '2027-01-23' }).rows[0].status === 'review_due', '90-day warning missing');
  }],
  ['期限当日と翌日を区別し、停止・更新済みとは断定しない', () => {
    const end = planDates(planFixture(), { today: '2027-04-23' }).rows[0];
    const after = planDates(planFixture(), { today: '2027-04-24' }).rows[0];
    assert(end.status === 'review_due' && end.days_until_recorded_end === 0, 'end date lost');
    assert(after.status === 'recorded_term_elapsed' && after.renewal_after_term === 'unverified', 'fabricated service state');
  }],
  ['未観測と不正な観測を区別する', () => {
    const d = planFixture(); delete d.vendors[0].plan_dates;
    assert(planDates(d).unobserved[0] === 'test', 'absence treated as a known term');
    d.vendors[0].plan_dates = null;
    assert(planDates(d).errors.length === 1, 'null observation silently discarded');
  }],
  ...[
    ['invalid date', t => { t.ends_on = '2027-02-30'; }],
    ['reversed dates', t => { t.starts_on = '2028-01-01'; }],
    ['future observation', t => { t.observed_on = '2028-01-01'; }],
    ['missing source', t => { delete t.source; }],
    ['renewal assertion', t => { t.renewal_after_term = 'confirmed'; }],
  ].map(([name, mutate]) => [`plan dates reject ${name}`, () => {
    const d = planFixture(); mutate(d.vendors[0].plan_dates);
    assert(planDates(d, { today: '2026-09-07' }).errors.length > 0, 'invalid observation passed');
  }]),
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const argv = process.argv.slice(2);
  const doc = readJSON(ROOT, 'data/vendor-register.json');
  const { errors, unreviewed, noFallback, money, discoveries } = audit(doc);
  const operatingReview = readJSON(ROOT, 'data/vendor-operating-review.json');
  errors.push(...vendorReviewProblems(operatingReview, doc, {
    readFile: file => fs.readFileSync(path.join(ROOT, file)),
  }));
  const plans = planDates(doc);

  if (argv.includes('--plan-dates')) {
    console.log(`記録されたベンダープランの期限（${plans.as_of}、${plans.review_days}日前から再確認）`);
    for (const row of plans.rows) {
      const message = `${row.vendor}: ${row.plan} / 記録上の終了日 ${row.ends_on} / 残り ${row.days_until_recorded_end}日 / ${row.status} / 観測 ${row.observed_on}`;
      console.log(message);
      if (row.status !== 'recorded') console.log(`::warning title=Vendor plan review::${message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}。現在のプラン・継続条件を再確認してください。自動更新やサービス停止は未確認。`);
    }
    console.log(`期限未観測: ${plans.unobserved.length}社（${plans.unobserved.join(', ')}）。無期限契約を意味しない。`);
    errors.forEach(e => console.error(e));
    process.exit(errors.length ? 1 : 0);
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      total: doc.vendors.length,
      discovered_dependencies: discoveries,
      inventory_total: doc.vendors.length + discoveries.length,
      operating_review: { id: operatingReview.id, actor: operatingReview.actor,
        reviewed_at: operatingReview.reviewed_at, valid_until: operatingReview.valid_until,
        decisions: operatingReview.decisions,
        note: 'Conditional operating decisions; historical human DPA dates and unresolved applicability remain separate.' },
      unreviewed: unreviewed.map((v) => v.id),
      no_fallback: noFallback.map((v) => v.id),
      errors,
      plan_dates: plans,
    }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`依存ベンダー ${doc.vendors.length}社（data/vendor-register.json）\n`);
  console.log(`  AIによる4観点の運用審査: ${operatingReview.decisions.length}社 / ${operatingReview.reviewed_at}`);
  console.log(`  期限: ${operatingReview.valid_until} UTC。契約適用・是正完了は各社の未解決事項を参照。\n`);
  if (discoveries.length) {
    console.log(`  追加依存先 ${discoveries.length}社（契約・支払許可なし）:`);
    for (const v of discoveries) console.log(`    ${v.id}: ${v.status} / ${v.personal_data} / ${v.open_questions?.join(' / ')}`);
    console.log('    既存登録分だけで審査の網羅性を判断しない。\n');
  }

  const byData = { personal: [], pseudonymous: [], none: [] };
  for (const v of doc.vendors) (byData[v.personal_data] ??= []).push(v);

  for (const level of ['personal', 'pseudonymous', 'none']) {
    const list = byData[level] ?? [];
    if (!list.length) continue;
    console.log(`  [渡している個人データ: ${level}] ${list.length}社`);
    for (const v of list) {
      console.log(`    ${v.critical ? '★' : ' '} ${v.name}`);
      console.log(`        止まると: ${v.breaks_if_down}`);
      console.log(`        代替:     ${v.fallback ?? `**無し** — ${v.fallback_note}`}`);
    }
    console.log('');
  }

  if (noFallback.length) {
    console.log(`  ★ 代替が無い critical ベンダー ${noFallback.length}社:`);
    for (const v of noFallback) console.log(`    ${v.name} — ${v.fallback_note}`);
    console.log('    **ここが止まると復旧手段が無い。**事業継続性（⑫）の中核。\n');
  }

  if (unreviewed.length) {
    console.log(`  従来の人による DPA 確認日が未記録 ${unreviewed.length}社:`);
    for (const v of unreviewed) console.log(`    ${v.name}（${v.personal_data}）`);
    console.log('    AIの運用審査は別記録。人の確認日、契約の受諾版、是正完了を代入しない。');
    console.log('    policy.enforce_unreviewed は従来の人の確認日を要求するフラグのまま。\n');
  }

  if (money.length) {
    console.log(`  金銭が動く取引先（許可リスト）${money.length}社:`);
    for (const v of money) {
      const cap = v.spend_cap_ref === 'unset' ? `上限未設定 — ${v.spend_cap_note}` : `上限: ${v.spend_cap_ref}`;
      console.log(`    ${v.name}  [${v.money_flow} / ${v.payment_method}]  承認 ${v.approved_at}`);
      console.log(`      ${cap}`);
    }
    console.log('    **ここに無い相手への支払いは許可されていない。**');
    console.log('    上限が設定されているのは AI実費と広報配信だけで、他は "unset"。\n');
  }

  // **「無い」と「読めない」を分ける。**
  //
  // [2026-08-26] ここは catch で両方を飲み込んでいた。実測すると、
  // credential-expiry.json を壊しただけで**この節が丸ごと消えた** ——
  // いま実際に出ている食い違い1件も一緒に消える。
  // 読めなかったことを、食い違いが無いことと同じ見た目にしない。
  let cross = [];
  const CRED = 'data/credential-expiry.json';
  if (!fs.existsSync(path.join(ROOT, CRED))) {
    console.log(`  （${CRED} が無い環境なので、資格情報との突き合わせは飛ばした）\n`);
  } else {
    let creds;
    try {
      creds = readLedger(path.join(ROOT, CRED),
        { why: '突き合わせを飛ばすと「食い違いなし」と同じ見た目になる' }).credentials;
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    cross = crossCheck(doc.vendors, creds);
  }
  if (cross.length) {
    console.log('  資格情報の台帳とベンダー台帳の食い違い:');
    for (const c of cross) console.log(`    ${c.label} — ${c.reason}`);
    console.log('');
  }

  errors.forEach((e) => console.log(`  NG: ${e}`));

  if (argv.includes('--check')) {
    const blocked = doc.policy.enforce_unreviewed ? unreviewed.length + discoveries.length : 0;
    if (errors.length || blocked) {
      console.error(`ベンダー台帳の検査に失敗: 形の問題 ${errors.length}件 / 未レビュー ${blocked}社`);
      process.exit(1);
    }
    console.log('ベンダー台帳の形に問題なし（未確認の件数は上に出ている。ゼロではない）。');
  }
}
