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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

export const DATA_LEVELS = ['none', 'pseudonymous', 'personal'];
/** 金銭の動き方。none も明示させる（書いていない＝考えていない、を許さない）。 */
export const MONEY_FLOWS = ['none', 'subscription', 'usage', 'one_off'];

export function audit(doc) {
  const errors = [];
  const unreviewed = [];
  const noFallback = [];

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
  return { errors, unreviewed, noFallback, money: doc.vendors.filter((v) => v.money_flow && v.money_flow !== 'none') };
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = readJSON('data/vendor-register.json');
  const { errors, unreviewed, noFallback, money } = audit(doc);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      total: doc.vendors.length,
      unreviewed: unreviewed.map((v) => v.id),
      no_fallback: noFallback.map((v) => v.id),
      errors,
    }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }

  console.log(`依存ベンダー ${doc.vendors.length}社（data/vendor-register.json）\n`);

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
    console.log(`  個人データを渡しているのに DPA 未確認 ${unreviewed.length}社:`);
    for (const v of unreviewed) console.log(`    ${v.name}（${v.personal_data}）`);
    console.log('    **「見ていない」であって「問題なし」ではない。**');
    console.log('    確認したら dpa_reviewed に日付を入れる。全部埋めたら');
    console.log('    policy.enforce_unreviewed を true にすると CI が守る。\n');
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

  let cross = [];
  try {
    cross = crossCheck(doc.vendors, readJSON('data/credential-expiry.json').credentials);
  } catch { /* 台帳が無い環境では飛ばす */ }
  if (cross.length) {
    console.log('  資格情報の台帳とベンダー台帳の食い違い:');
    for (const c of cross) console.log(`    ${c.label} — ${c.reason}`);
    console.log('');
  }

  errors.forEach((e) => console.log(`  NG: ${e}`));

  if (argv.includes('--check')) {
    const blocked = doc.policy.enforce_unreviewed ? unreviewed.length : 0;
    if (errors.length || blocked) {
      console.error(`ベンダー台帳の検査に失敗: 形の問題 ${errors.length}件 / 未レビュー ${blocked}社`);
      process.exit(1);
    }
    console.log('ベンダー台帳の形に問題なし（未確認の件数は上に出ている。ゼロではない）。');
  }
}
