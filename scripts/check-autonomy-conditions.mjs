#!/usr/bin/env node
/**
 * 自律の段階を、**宣言ではなく条件から計算する。**
 *
 *   node scripts/check-autonomy-conditions.mjs          # 現在地
 *   node scripts/check-autonomy-conditions.mjs --check  # CI
 *
 * 【なぜ作るか】
 * 「閉ループ」「再帰的自己改善」「自律運営」は、名乗った瞬間に強い言葉になる。
 * **だから名乗らせない。**7条件それぞれに証跡を要求し、段階は充足から導出する。
 * `level` を台帳に手で書ける形にしない —— 書ける形にすると、
 * **実績ではなく気分で段階が上がる。**
 *
 * 【下位が partial なら上位を名乗れない】
 * ⑥⑦ が met でも ④ が partial なら Autopilot 止まり。
 * 段階は「揃ったところまで」であって、飛び級を許さない。
 *
 * 【lane を分ける】
 * この運用は基盤側（記事・SEO・自分の修理）と機能側（アプリの機能）で
 * 成熟度がまったく違う。**まとめて名乗ると、強いほうの実績で弱いほうを覆う。**
 * 実際 ④⑤ は基盤側では実績があるが、機能側は本番改善サイクルの完走が0件。
 *
 * 【落とすもの】
 *   - status が未定義の値
 *   - met / partial なのに evidence が無い、または指すファイルが存在しない
 *   - met 以外なのに missing が無い（**何が足りないかを言えないなら測っていない**）
 *   - lanes を書いたのに status が partial でない（片側だけ met は partial）
 *
 * 【落とさないもの】
 * **partial や not_met そのものでは落とさない。**現在地であって不具合ではない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONDITIONS_PATH = path.join(ROOT, 'data/autonomy-conditions.json');

export const STATUSES = ['met', 'partial', 'not_met'];

/**
 * 段階を導出する。**揃ったところまでしか名乗れない。**
 * 上位が met でも下位が met でなければ、そこで止まる。
 */
export const LANES = ['infra', 'product'];

/**
 * その lane から見た条件の状態。
 * lane 別の記載があればそれを使い、無ければ全体の status を使う
 * （lane を分けていない条件は、どちらの lane でも同じ状態という意味）。
 */
export function statusFor(condition, lane) {
  return condition.lanes?.[lane]?.status ?? condition.status;
}

export function deriveLevel(doc, lane = null) {
  const by = Object.fromEntries((doc.conditions ?? [])
    .map((c) => [c.id, lane ? statusFor(c, lane) : c.status]));
  const allMet = (ids) => ids.every((id) => by[id] === 'met');
  const levels = doc.$levels ?? {};
  if (!allMet(levels.autopilot ?? [])) return 'pre_autopilot';
  if (!allMet(levels.closed_loop ?? [])) return 'autopilot';
  if (!allMet(levels.recursive ?? [])) return 'closed_loop';
  return 'recursive';
}

export const LEVEL_LABEL = {
  pre_autopilot: '**Autopilot に届いていない**（①〜④のどれかが未充足）',
  autopilot: 'Autopilot（①〜④が充足）',
  closed_loop: 'Closed-loop Autonomy（⑤まで充足）',
  recursive: '再帰的に運営能力が改善している（⑥⑦まで充足）',
};

export function validate(doc, { exists = (p) => fs.existsSync(path.join(ROOT, p)) } = {}) {
  const problems = [];
  const conditions = doc.conditions ?? [];
  if (conditions.length !== 7) problems.push(`条件が7つでない（${conditions.length}）`);

  for (const c of conditions) {
    const at = `条件${c.n}「${c.title ?? c.id}」`;
    if (!STATUSES.includes(c.status)) {
      problems.push(`${at}: status が未定義の値（${STATUSES.join(' | ')}）`);
    }
    if (c.status !== 'not_met') {
      if (!c.evidence?.length) problems.push(`${at}: ${c.status} なのに evidence が無い`);
      for (const e of c.evidence ?? []) {
        if (!exists(e)) problems.push(`${at}: evidence "${e}" が存在しない`);
      }
    }
    // **何が足りないかを言えないなら、それは「部分的にできている」ではなく「測っていない」。**
    if (c.status !== 'met' && !c.missing) {
      problems.push(`${at}: ${c.status} なのに missing が無い`
        + ' — **何が足りないかを言えないなら、測っていない**');
    }
    // 片側だけ met は partial。lanes を書いて met を名乗らせない
    if (c.lanes && c.status === 'met') {
      problems.push(`${at}: lanes を分けているのに status が met`
        + ' — **片側だけ充足しているなら partial**');
    }
  }

  // level を台帳に書いていないこと。**書ける形にしない**
  if ('level' in doc) {
    problems.push('level が台帳に書いてある — **段階は導出する。**手で書くと実績ではなく気分で上がる');
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(CONDITIONS_PATH, 'utf8'));
  const problems = validate(doc);

  const MARK = { met: '✓', partial: '△', not_met: '✗' };
  console.log(`自律の7条件 — ${doc.assessed_at} 時点\n`);
  for (const c of doc.conditions ?? []) {
    console.log(`  ${MARK[c.status] ?? '?'} ${c.n}. ${c.title}`);
    if (c.measured) console.log(`      実測: ${c.measured}`);
    if (c.lanes) {
      for (const [lane, v] of Object.entries(c.lanes)) {
        console.log(`      ${lane}: ${MARK[v.status] ?? '?'} ${v.note}`);
      }
    }
    if (c.missing) console.log(`      足りないもの: ${c.missing.replace(/\*\*/g, '')}`);
    console.log('');
  }

  console.log('  現在地（**lane ごとに導出する**）\n');
  const LANE_LABEL = { infra: '基盤側（記事・SEO・自分の修理）', product: '機能側（アプリの機能）' };
  for (const lane of LANES) {
    console.log(`    ${LANE_LABEL[lane]}`);
    console.log(`      ${LEVEL_LABEL[deriveLevel(doc, lane)]}`);
  }
  console.log(`\n    まとめて1つに潰すと ${LEVEL_LABEL[deriveLevel(doc)]}`);
  console.log('    — **強いほうの実績で弱いほうを覆わないため、lane を分けて出す。**\n');
  console.log('  **段階は導出であって宣言ではない。**下位が揃うまで上位は名乗らない。');
  console.log('  partial / not_met は現在地であって不具合ではないので、ここでは落とさない。');

  if (problems.length) {
    console.error(`\n自律の7条件: 問題 ${problems.length}件`);
    for (const p of problems) console.error(`  - ${p}`);
    if (argv.includes('--check')) process.exit(1);
  } else {
    console.log('\n自律の7条件: 台帳の形に問題なし');
  }
}
