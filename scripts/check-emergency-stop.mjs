#!/usr/bin/env node
/**
 * 緊急停止 — 全経路が本当にこれを見ていることを検査する。
 *
 *   node scripts/check-emergency-stop.mjs           # 状態
 *   node scripts/check-emergency-stop.mjs --check   # CI
 *   node scripts/check-emergency-stop.mjs --status  # 停止中なら exit 1（運用用）
 *   node scripts/check-emergency-stop.mjs --trip <経路|all> --reason <trigger>
 *                                                   # 止める。**解除する道具は無い**
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
const RULES_PATH = path.join(ROOT, 'data/escalation-rules.json');

/**
 * 停止を立てる。**AIが自分（や隣の経路）を止めるための唯一の入口。**
 *
 * 止める側だけを機械に開ける。解除する関数はこのファイルに無く、
 * 作らない — 台帳を人が書き換えることでしか戻せない。非対称にしてある理由は
 * policy.$resume_note と同じで、止めすぎの損は出荷1日、解除しすぎの損は
 * 「止めたかった事象を素通りさせる」で、後者だけが取り返しがつかない。
 *
 * 理由は自由文にしない。**escalation-rules.json に stop_automation: true で
 * 載っている trigger だけ**を受ける。自由文を許すと、機械が自分の判断で
 * 「止めるほどではない」と書いて止めない経路ができる。
 *
 * すでに止まっている経路は上書きしない。最初の理由が原因で、
 * あとから来る理由はその結果であることが多い。
 */
export function applyTrip(doc, { agent, reason, by = 'ai', at, rules = [] } = {}) {
  const next = JSON.parse(JSON.stringify(doc));
  const rule = rules.find((r) => r.trigger === reason);
  if (!rule) return { error: `理由 "${reason}" が escalation-rules.json に無い — 規則に無い停止は解除の判断ができない` };
  if (!rule.stop_automation) return { error: `理由 "${reason}" は stop_automation: false — 止める規則ではない` };
  if (by !== 'human' && by !== 'ai') return { error: 'by は human か ai' };
  if (by === 'ai' && !next.policy?.ai_may_stop) return { error: 'policy.ai_may_stop が false — AIは止められない' };

  const stamp = at || new Date().toISOString();
  if (agent === 'all') {
    if (next.stopped) return { doc: next, changed: false, already: true };
    next.stopped = true;
    next.reason = reason;
    next.stopped_at = stamp;
    next.stopped_by = by;
    return { doc: next, changed: true };
  }
  const a = next.agents?.[agent];
  if (!a || agent.startsWith('$')) return { error: `経路 "${agent}" が台帳に無い` };
  if (a.stopped) return { doc: next, changed: false, already: true };
  a.stopped = true;
  a.reason = reason;
  a.stopped_at = stamp;
  a.stopped_by = by;
  return { doc: next, changed: true };
}

export function validate(doc, { workflow = '', runbook = '', rules = [] } = {}) {
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

  // 経路ごとの停止も、判定が実際に効いていること
  const agentStopped = decide(baseState({ agentStopped: true, agentStopReason: 'test' }));
  if (agentStopped.code !== CODES.AGENT_STOPPED || agentStopped.run) {
    problems.push('実行判定が経路ごとの停止を返さない');
  }
  // 全体停止のほうが強いこと（両方立っているときに経路側が出ると、全体停止が弱く見える）
  const both = decide(baseState({ emergencyStop: true, agentStopped: true, emergencyStopReason: 'x', agentStopReason: 'y' }));
  if (both.code !== CODES.EMERGENCY_STOP) {
    problems.push('全体停止より経路ごとの停止が先に出る — **全体停止は常に最強でなければならない**');
  }
  for (const [route, a] of Object.entries(doc.agents || {})) {
    if (route.startsWith('$')) continue;
    if (typeof a.stopped !== 'boolean') problems.push(`agents.${route}.stopped が真偽値でない`);
    if (a.stopped && !a.reason) problems.push(`agents.${route}: 停止中なのに理由が無い`);
  }
  if (!doc.agents || Object.keys(doc.agents).filter((k) => !k.startsWith('$')).length < 3) {
    problems.push('経路ごとの停止が3経路未満 — 主系・副系・監査は最低限required');
  }

  // 停止を立てる経路が生きていること。**振る舞いで確かめる**（配線の検査と同じ理由）。
  const someAgent = Object.keys(doc.agents || {}).find((k) => !k.startsWith('$'));
  const stopRule = rules.find((r) => r.stop_automation);
  if (!stopRule) {
    problems.push('escalation-rules.json に stop_automation: true の規則が無い — 機械が止める理由が1つも無い');
  } else if (someAgent) {
    const t = applyTrip(doc, { agent: someAgent, reason: stopRule.trigger, by: 'ai', at: '2026-01-01T00:00:00Z', rules });
    if (t.error || !t.changed) problems.push(`AIが経路を止められない（${t.error || '変化なし'}）`);
    // 規則に無い理由では止まらない
    const bogus = applyTrip(doc, { agent: someAgent, reason: '__not_a_rule__', by: 'ai', at: '2026-01-01T00:00:00Z', rules });
    if (!bogus.error) problems.push('規則に無い理由で停止できてしまう — 自由文の停止は解除の判断ができない');
    // 二重に立てても最初の理由を上書きしない
    if (t.doc) {
      const again = applyTrip(t.doc, { agent: someAgent, reason: stopRule.trigger, by: 'ai', at: '2026-02-02T00:00:00Z', rules });
      if (again.changed) problems.push('停止中の経路を上書きする — 最初の理由が原因で、後の理由はその結果');
    }
  }
  // 解除の関数を持っていないこと。**ここに resume を足した瞬間に落ちる。**
  const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  if (/export function (resume|applyResume|clearStop)/.test(self)) {
    problems.push('解除の関数がある — **解除は人が台帳を書き換えることでしか行えない**');
  }

  // 2. 主系ワークフローが見ているか
  if (workflow && !workflow.includes('emergency-stop.json')) {
    problems.push('obsidian-autopilot.yml が emergency-stop.json を見ていない');
  }
  // 全体停止だけ見て経路ごとの停止を見ないと、「主系だけ止めたい」が効かない。
  // **これは平常時に症状が出ない**ので、機械で見るしかない。
  if (workflow && workflow.includes('emergency-stop.json') && !/agents/.test(workflow)) {
    problems.push('obsidian-autopilot.yml が agents（経路ごとの停止）を見ていない'
      + ' — 全体停止しか効かないなら、経路ごとの停止は台帳の飾り');
  }
  // 修理上限に達した経路が、着手前に止まること
  if (workflow && !workflow.includes('--contain')) {
    problems.push('obsidian-autopilot.yml が封じ込め（--contain）を通らない'
      + ' — 上限に達した故障を「人に上げる」と表示するだけでは、翌朝また同じ経路が走る');
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
  const rules = fs.existsSync(RULES_PATH)
    ? (JSON.parse(fs.readFileSync(RULES_PATH, 'utf8')).rules || [])
    : [];

  // 止める（解除は無い）。--agent all で全体。
  const tripAt = process.argv.indexOf('--trip');
  if (tripAt !== -1) {
    const agent = process.argv[tripAt + 1];
    const reason = process.argv[process.argv.indexOf('--reason') + 1];
    const byAt = process.argv.indexOf('--by');
    const by = byAt === -1 ? 'ai' : process.argv[byAt + 1];
    if (!agent || !reason || agent.startsWith('--')) {
      console.error('使い方: --trip <経路|all> --reason <escalation-rules の trigger> [--by ai|human]');
      process.exit(2);
    }
    const r = applyTrip(doc, { agent, reason, by, rules });
    if (r.error) { console.error(`停止できない: ${r.error}`); process.exit(2); }
    if (r.already) { console.log(`${agent} はすでに停止中 — 理由を上書きしない`); process.exit(0); }
    fs.writeFileSync(STOP_PATH, `${JSON.stringify(r.doc, null, 2)}\n`);
    console.log(`停止した: ${agent}（${reason} / ${by}）`);
    console.log('**解除はこの道具ではできない。**data/emergency-stop.json を人が戻す。');
    process.exit(0);
  }

  if (process.argv.includes('--status')) {
    if (doc.stopped) {
      console.log(`STOPPED: ${doc.reason}（${doc.stopped_at} / ${doc.stopped_by}）`);
      process.exit(1);
    }
    console.log('running');
    process.exit(0);
  }

  const problems = validate(doc, { workflow, runbook, rules });
  console.log('緊急停止スイッチ\n');
  console.log(`  状態: ${doc.stopped ? `**停止中** — ${doc.reason}` : '稼働中'}`);
  console.log(`  AIが止めること: ${doc.policy.ai_may_stop ? '許す' : '許さない'}`
    + ` / AIが解除すること: ${doc.policy.ai_may_resume ? '許す' : '**許さない**'}`);
  console.log('');
  console.log('  配線の確認（**台帳があるだけでは止まらない**）:');
  console.log(`    実行判定が最初に見る          ${decide(baseState({ emergencyStop: true })).code === CODES.EMERGENCY_STOP ? 'OK' : 'NG'}`);
  console.log(`    force で飛び越えられない      ${decide(baseState({ emergencyStop: true, force: true })).code === CODES.EMERGENCY_STOP ? 'OK' : 'NG'}`);
  console.log(`    経路ごとにも止められる        ${decide(baseState({ agentStopped: true })).code === CODES.AGENT_STOPPED ? 'OK' : 'NG'}`);
  console.log(`    全体停止のほうが強い          ${decide(baseState({ emergencyStop: true, agentStopped: true })).code === CODES.EMERGENCY_STOP ? 'OK' : 'NG'}`);
  console.log(`    主系ワークフローが見る        ${workflow.includes('emergency-stop.json') ? 'OK' : 'NG'}`);
  console.log(`    手順書が副系に要求する        ${runbook.includes('emergency-stop.json') ? 'OK' : 'NG'}`);
  console.log(`    AIが自分で止められる          ${doc.policy.ai_may_stop ? 'OK（--trip）' : 'NG'}`);
  console.log(`    AIは解除できない              ${doc.policy.ai_may_resume ? 'NG' : 'OK（解除の関数を持たない）'}`);
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
