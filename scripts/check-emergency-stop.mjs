#!/usr/bin/env node
/**
 * 緊急停止 — 全経路が本当にこれを見ていることを検査する。
 *
 *   node scripts/check-emergency-stop.mjs           # 状態
 *   node scripts/check-emergency-stop.mjs --check   # CI
 *   node scripts/check-emergency-stop.mjs --status  # 停止中なら exit 1（運用用）
 *
 * 【この検査が守っていること】
 * 停止スイッチそのものではなく、**スイッチが配線されたままであること。**
 * 台帳を1つ置くだけなら誰でもできる。危ないのは、後から経路が増えたときに
 * **新しい経路だけがこれを見ない**状態で、しかもそれは平常時には何の症状も出ない。
 * 止めたい日に初めて分かる。
 *
 * だから見るのは3つ:
 *   1. 実行判定（autopilot-gate.mjs）が最初に見ているか
 *   2. 主系ワークフローの Gate が、チェックアウト前に見ているか
 *   3. 手順書（Runbook）が副系セッションに同じことを要求しているか
 *      — 副系はワークフローではなくセッションなので、**文章が配線**になる
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, baseState, CODES } from './autopilot-gate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STOP_PATH = path.join(ROOT, 'data/emergency-stop.json');
const WORKFLOW = path.join(ROOT, '.github/workflows/obsidian-autopilot.yml');
const RUNBOOK = path.join(ROOT, 'docs/obsidian/AUTOPILOT_RUNBOOK.md');

export function validate(doc, { workflow = '', runbook = '' } = {}) {
  const problems = [];
  if (typeof doc.stopped !== 'boolean') problems.push('stopped が真偽値でない');
  if (doc.stopped) {
    if (!doc.reason) problems.push('停止中なのに reason が無い — 解除してよいか誰にも分からない');
    if (!doc.stopped_at) problems.push('停止中なのに stopped_at が無い');
    if (doc.stopped_by !== 'human' && doc.stopped_by !== 'ai') {
      problems.push('stopped_by は human か ai');
    }
  }
  if (doc.policy?.ai_may_resume) {
    problems.push('policy.ai_may_resume が true — **AIによる解除を許さない。**'
      + '止める側の誤りは1日の出荷が止まるだけだが、解除する側の誤りは止めたかった事象を素通りさせる');
  }

  // 1. 判定が実際に効いているか。**文言ではなく振る舞いで確かめる。**
  const stopped = decide(baseState({ emergencyStop: true, emergencyStopReason: 'test' }));
  if (stopped.code !== CODES.EMERGENCY_STOP || stopped.run) {
    problems.push('実行判定が緊急停止を返さない — 台帳があっても止まらない');
  }
  // force で飛び越えられないこと
  const forced = decide(baseState({ emergencyStop: true, emergencyStopReason: 'test', force: true }));
  if (forced.code !== CODES.EMERGENCY_STOP) {
    problems.push('force が緊急停止を飛び越える — force は冪等チェック用であって停止の解除ではない');
  }
  // 他のどの理由よりも先に出ること（予算・鍵・故障の陰に隠れない）
  const shadowed = decide(baseState({
    emergencyStop: true, emergencyStopReason: 'test',
    budgetOver: true, secretsPresent: false, credentialRejected: true, githubApiReachable: false,
  }));
  if (shadowed.code !== CODES.EMERGENCY_STOP) {
    problems.push('緊急停止が他の理由の陰に隠れる — **止めたいときに止まらない**');
  }

  // 2. 主系ワークフローが見ているか
  if (workflow && !workflow.includes('emergency-stop.json')) {
    problems.push('obsidian-autopilot.yml が emergency-stop.json を見ていない');
  }
  // 3. 手順書が副系に要求しているか（副系はセッションなので文章が配線）
  if (runbook && !runbook.includes('emergency-stop.json')) {
    problems.push('AUTOPILOT_RUNBOOK.md が副系セッションに緊急停止の確認を要求していない'
      + ' — **副系はワークフローではないので、文章が唯一の配線**');
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
  const workflow = fs.existsSync(WORKFLOW) ? fs.readFileSync(WORKFLOW, 'utf8') : '';
  const runbook = fs.existsSync(RUNBOOK) ? fs.readFileSync(RUNBOOK, 'utf8') : '';

  if (process.argv.includes('--status')) {
    if (doc.stopped) {
      console.log(`STOPPED: ${doc.reason}（${doc.stopped_at} / ${doc.stopped_by}）`);
      process.exit(1);
    }
    console.log('running');
    process.exit(0);
  }

  const problems = validate(doc, { workflow, runbook });
  console.log('緊急停止スイッチ\n');
  console.log(`  状態: ${doc.stopped ? `**停止中** — ${doc.reason}` : '稼働中'}`);
  console.log(`  AIが止めること: ${doc.policy.ai_may_stop ? '許す' : '許さない'}`
    + ` / AIが解除すること: ${doc.policy.ai_may_resume ? '許す' : '**許さない**'}`);
  console.log('');
  console.log('  配線の確認（**台帳があるだけでは止まらない**）:');
  console.log(`    実行判定が最初に見る          ${decide(baseState({ emergencyStop: true })).code === CODES.EMERGENCY_STOP ? 'OK' : 'NG'}`);
  console.log(`    force で飛び越えられない      ${decide(baseState({ emergencyStop: true, force: true })).code === CODES.EMERGENCY_STOP ? 'OK' : 'NG'}`);
  console.log(`    主系ワークフローが見る        ${workflow.includes('emergency-stop.json') ? 'OK' : 'NG'}`);
  console.log(`    手順書が副系に要求する        ${runbook.includes('emergency-stop.json') ? 'OK' : 'NG'}`);
  console.log('');
  console.log('  この仕組みの外にある最後の手段: **資格情報の失効**。');
  console.log('  リポジトリが読めない・判定が壊れている場合でも止まる。');

  if (problems.length) {
    console.error('\n緊急停止: 配線の穴');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n全経路が緊急停止を見ている。');
}
