#!/usr/bin/env node
/**
 * プレスリリースの見出し・リード文を、実装台帳に当てて検証する。
 *
 *   node scripts/check-pr-claims.mjs           # 一覧
 *   node scripts/check-pr-claims.mjs --check   # CI用（未解決の参照があれば exit 1）
 *   node scripts/check-pr-claims.mjs --json
 *
 * **原稿が実装から離れていくのを止めるための検査。**
 * リード文に書いた工程が台帳で裏付けられているかを、配信前ではなく毎PRで見る。
 *
 * 支持率が閾値を割っても **exit 1 にはしない** — それは「まだ書けない」であって
 * 「壊れている」ではない。落とすのは台帳の参照が解決できないとき（＝原稿と
 * 台帳のどちらかが古い）。**赤い行を黙って消すためのスクリプトにしない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const AI_EXECUTES = new Set(['ai_autonomous', 'ai_executes_gated']);
const HUMAN_HELD = new Set(['human_only', 'ai_executes_gated', 'ai_proposes']);
/**
 * mode: 'ai_proposes' 用。**「AIがやる」と「AIが出す」を書き分けるために足した**
 * （2026-08-25）。
 *
 * それまで mode は ai_executes と human_approves の2つしか無く、
 * 「AIは提案までで、決めるのは人」という中間を表現できなかった。表現できないと
 * どうなるかというと、**中間の工程が「AIが実行する」側に丸められる。**
 * 実際そうなっていて、サブタイトルの「機能開発」は台帳で60%（設計への
 * 落とし込みとPRD作成が ai_proposes）なのに、原稿は実行と読める書き方をしていた。
 * 本文 §3 は「分析と提案はAI」と正しく書いており、**サブタイトルだけが強かった。**
 *
 * nobody / intentional_no は入れない。**提案すら出ていないものを「提案まで」とは
 * 言えない。**
 */
const AI_INVOLVED = new Set(['ai_autonomous', 'ai_executes_gated', 'ai_proposes']);

export function evaluate(claimsDoc, coverage) {
  const index = new Map(coverage.tasks.map((t) => [`${t.area}::${t.task}`, t]));
  const unresolved = [];

  const claims = claimsDoc.claims.map((c) => {
    const rows = c.requires.map((ref) => {
      const task = index.get(ref);
      if (!task) unresolved.push({ claim: c.id, ref });
      return { ref, task: task ?? null };
    });

    const found = rows.filter((r) => r.task);
    const modeSet = c.mode === 'human_approves' ? HUMAN_HELD
      : c.mode === 'ai_proposes' ? AI_INVOLVED
        : AI_EXECUTES;
    const satisfied = found.filter((r) => modeSet.has(r.task.executor));
    const support = found.length ? satisfied.length / found.length : 0;

    return {
      ...c,
      rows,
      support,
      supported: support >= claimsDoc.pass_threshold,
      weak: found.filter((r) => !satisfied.includes(r)),
    };
  });

  return { claims, unresolved };
}

const LABEL = {
  ai_autonomous: '自律', ai_executes_gated: 'ゲート', ai_proposes: '提案',
  human_only: '人間', nobody: '未実装', intentional_no: 'やらない',
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const claimsDoc = readJSON('data/pr-claims.json');
  const coverage = readJSON('data/automation-coverage.json');
  const { claims, unresolved } = evaluate(claimsDoc, coverage);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      claims: claims.map((c) => ({ id: c.id, phrase: c.phrase, support: c.support, supported: c.supported })),
      unresolved,
    }, null, 2));
    process.exit(0);
  }

  console.log('プレスリリースの主張 × 実装台帳');
  console.log(`  見出し: ${claimsDoc.headline}`);
  console.log(`  支持の下限: ${(claimsDoc.pass_threshold * 100).toFixed(0)}%\n`);

  const sorted = [...claims].sort((a, b) => a.support - b.support);
  for (const c of sorted) {
    const pct = (c.support * 100).toFixed(0).padStart(3);
    const mark = c.supported ? '書ける' : '**書けない**';
    console.log(`  ${pct}%  ${mark}  「${c.phrase}」${c.mode === 'human_approves' ? '（人の承認）' : c.mode === 'ai_proposes' ? '（提案まで）' : ''}`);
    if (c.note) console.log(`         ${c.note}`);
    for (const r of c.weak) {
      console.log(`         ✗ [${LABEL[r.task.executor]}] ${r.ref.split('::')[1]}`);
    }
    console.log('');
  }

  const blocked = claims.filter((c) => !c.supported);
  if (blocked.length) {
    console.log(`  この見出しで撃つには ${blocked.length} 件が足りない:`);
    for (const c of blocked) {
      const need = c.weak.filter((r) => r.task.executor === 'nobody');
      console.log(`    「${c.phrase}」— 未実装 ${need.length}件 / 提案止まり ${c.weak.length - need.length}件`);
    }
    console.log('');
    console.log('  **支持率が低いことでは落とさない。**それは「まだ書けない」であって');
    console.log('  「壊れている」ではない。落とすのは台帳の参照が解決できないときだけ。');
    console.log('');
  }

  if (unresolved.length) {
    console.log('  台帳に見つからない参照（原稿か台帳のどちらかが古い）:');
    for (const u of unresolved) console.log(`    ${u.claim}: ${u.ref}`);
    console.log('');
  }

  if (argv.includes('--check')) {
    if (unresolved.length) {
      console.error(`主張の検証に失敗: 解決できない参照が ${unresolved.length} 件`);
      process.exit(1);
    }
    console.log('参照はすべて解決した（支持率は上の一覧を見ること）。');
  }
}
