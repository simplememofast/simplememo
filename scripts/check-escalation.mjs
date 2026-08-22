#!/usr/bin/env node
/**
 * 重大案件の有人移管 — 規則の無い故障種別を残さない。
 *
 *   node scripts/check-escalation.mjs           # 表示
 *   node scripts/check-escalation.mjs --check   # CI
 *
 * 【なぜ台帳が要るか】
 * 権限表には「検知したら自動処理を止めて経営者へ移管する」と書いてあった。
 * だが**何が検知で、誰にどう渡すのか、いつまでにか**が決まっていなかった。
 * 決まっていない移管は起きない。
 *
 * 【列挙は台帳から取る】
 * 規則を手で並べると、故障の種類が増えたときに置き去りになる。ここでは
 *   - autopilot-gate.mjs が返す故障・縮退コードの全部
 *   - autopilot-runs.json に**実際に現れた** failure_class の全部
 * を突き合わせ、規則の無いものがあれば落とす。
 * **起きた実績があるものは、次も起きる。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODES } from './autopilot-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RULES_PATH = path.join(ROOT, 'data/escalation-rules.json');
const RUNS_PATH = path.join(ROOT, 'data/autopilot-runs.json');
const AUTHORITY_PATH = path.join(ROOT, 'data/authority-matrix.json');

/** 移管が要るのは故障と縮退。正常なスキップ（設計どおり寝る）は対象外。 */
export const ESCALATABLE_CODES = Object.values(CODES)
  .filter((c) => c.startsWith('fail_') || c.startsWith('degrade_'));

export function validate(doc, { seenClasses = [], policyOnlyDomains = [] } = {}) {
  const problems = [];
  const byTrigger = new Map();
  for (const r of doc.rules || []) {
    const at = `rule ${r.trigger || '(trigger無し)'}`;
    if (!r.trigger) { problems.push('trigger の無い規則がある'); continue; }
    if (byTrigger.has(r.trigger)) problems.push(`${at}: trigger が重複`);
    byTrigger.set(r.trigger, r);
    if (!r.who) problems.push(`${at}: who が無い — 誰に渡すか決まっていない移管は起きない`);
    if (!r.channel) problems.push(`${at}: channel が無い`);
    else if (!doc.policy?.channels?.[r.channel]) problems.push(`${at}: 未知の channel "${r.channel}"`);
    if (typeof r.within_hours !== 'number' || !(r.within_hours > 0)) {
      problems.push(`${at}: within_hours を正の数で置くこと（期限の無い移管は延びる）`);
    }
    if (typeof r.stop_automation !== 'boolean') {
      problems.push(`${at}: stop_automation を明示すること（止めるか走らせるかは毎回の判断にしない）`);
    }
    if (!r.note) problems.push(`${at}: note が無い — なぜ止める／止めないのかが残らない`);
  }

  // 1. 実行判定が返す故障・縮退コードは全部カバーする
  for (const code of ESCALATABLE_CODES) {
    if (!byTrigger.has(code)) problems.push(`故障コード "${code}" に移管規則が無い`);
  }
  // 2. 実際に起きた failure_class は全部カバーする
  for (const cls of seenClasses) {
    if (!byTrigger.has(cls)) {
      problems.push(`運転台帳に現れた failure_class "${cls}" に移管規則が無い`
        + ' — **起きた実績があるものは次も起きる**');
    }
  }
  // 3. 危機領域は必ず自動処理を止める
  for (const d of policyOnlyDomains) {
    const r = [...byTrigger.values()].find((x) => x.domain === d);
    if (!r) problems.push(`権限表の policy_only 領域「${d}」に移管規則が無い`);
    else if (!r.stop_automation) {
      problems.push(`「${d}」の規則が stop_automation: false — **AIが判断も対外発信もしない領域は必ず止める**`);
    }
  }
  return { problems, byTrigger };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const runs = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8')).runs || [];
  const seenClasses = [...new Set(runs.map((r) => r.failure_class).filter(Boolean))];
  const authority = JSON.parse(fs.readFileSync(AUTHORITY_PATH, 'utf8'));
  const policyOnly = (authority.domains || []).filter((d) => d.status === 'policy_only').map((d) => d.domain);

  const { problems, byTrigger } = validate(doc, { seenClasses, policyOnlyDomains: policyOnly });

  console.log(`有人移管の規則 — ${doc.rules.length}件\n`);
  const stop = doc.rules.filter((r) => r.stop_automation);
  const go = doc.rules.filter((r) => !r.stop_automation);
  console.log(`  [自動処理を止めてから渡す] ${stop.length}件`);
  for (const r of stop) console.log(`    ${r.trigger.padEnd(28)} ${r.within_hours}h以内 → ${r.who} / ${r.channel}`);
  console.log(`\n  [走らせたまま知らせる] ${go.length}件`);
  for (const r of go) console.log(`    ${r.trigger.padEnd(28)} ${r.within_hours}h以内 → ${r.who} / ${r.channel}`);

  const unbuilt = doc.rules.filter((r) => r.channel === 'owner_direct');
  if (unbuilt.length) {
    console.log(`\n  ⚠ 経路が未整備の規則 ${unbuilt.length}件（channel: owner_direct）`);
    console.log('    連絡先も停止手段も未定。**名前が付いただけ**であることを隠さない。');
  }
  console.log(`\n  カバーした故障コード ${ESCALATABLE_CODES.length}件 / 実績のある failure_class ${seenClasses.length}件`);

  if (problems.length) {
    console.error('\n有人移管: 規則の穴');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n規則の無い故障種別なし。');
}
