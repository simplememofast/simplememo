#!/usr/bin/env node
/**
 * PRD（要件定義）の完全性検査 — 「設計は書いた」を機械が確かめる。
 *
 *   node scripts/check-prd.mjs           # 一覧
 *   node scripts/check-prd.mjs --check   # CI: 不備があれば exit 1
 *   node scripts/check-prd.mjs --json
 *
 * ## なぜ要るか
 *
 * `data/automation-coverage.json` は ①次期機能開発 の2タスクを長く
 * `ai_proposes` に置いていた。理由は能力ではなく**定型化されていないこと**で、
 * 台帳の note にそう書いてある —— 「都度作成・定型化されていない」。
 *
 * 設計文書は実際に書かれていた（`../simplememo-ios/docs/obsidian-only-mode-design.md`、
 * `../simplememo-ios/docs/reports/feature_requests_2026-07-31_obsidian_user.md`）。
 * だが**書かれたかどうかを誰も見ていない**ので、書かれない回があっても気づけない。
 * growth/README.md の失敗——「計画は散文の中に住んでいて、散文は手を挙げない」——と
 * 同じ形をしている。
 *
 * そこでこの検査は **「着手してよい」と宣言した候補には、必ず完全なPRDがある** を
 * 強制する。PRDが無ければ `ready` にできない。**書かないと進めない**形にすることで、
 * 設計工程が提案ではなく実行になる。
 *
 * ## 受入条件は「検証できる形」でしか受け取らない
 *
 * `acceptance[].verify` を必須にしてある。「使いやすくなっていること」のような
 * 検証不能な受入条件は、**後からどうとでも読めるので受入条件ではない**。
 * 誰が・どうやって確かめるかを書けないものは、まだ設計が終わっていない。
 *
 * ## VISION §13 の6問は「答えたか」だけを見る
 *
 * **答えの内容の当否は機械が判定しない。**判定できると称すると、
 * ビジョン適合の判断そのものを機械に委ねたことになる。
 * ここが見るのは「6問すべてに答えを書いたか」と、
 * **`conflict` と答えたなら解決方針（`resolution`）を書いたか**だけ。
 *
 * **衝突を書ける選択肢を用意してあるのが要点。** 用意しないと、
 * ビジョンと衝突する要望が来たときに黙って片方へ寄せることになる
 * （`../simplememo-ios/CLAUDE.md`「衝突自体を明示すること」）。
 *
 * ## リスクのある候補は、PRDがあっても承認欄が要る
 *
 * `scripts/feature-score.mjs` の GATED_RISKS と同じ考え方。
 * 不可逆・課金・プライバシー・審査に触る候補は、**点数でもPRDでも消えない**。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATED_RISKS } from './feature-score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** VISION §13 のチェック6問。**数と並びはビジョン側が正。** */
export const VISION_QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'];

/** 6問への答え方。`conflict` を選べることが重要（黙って寄せさせない）。 */
export const VISION_VERDICTS = new Set(['yes', 'no', 'na', 'conflict']);

/** PRDに必ず要る欄。**空文字は「書いた」に数えない。** */
const REQUIRED_TEXT = ['problem', 'source', 'ux', 'i18n', 'rollback'];

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function checkPrds(prdDoc, backlogDoc) {
  const problems = [];
  const byId = new Map(backlogDoc.candidates.map((c) => [c.id, c]));
  const prds = prdDoc.prds || [];
  const seen = new Set();

  for (const prd of prds) {
    const where = `prd:${prd.id}`;

    if (seen.has(prd.id)) problems.push(`${where} — 同じ id のPRDが2件ある`);
    seen.add(prd.id);

    const cand = byId.get(prd.id);
    if (!cand) {
      // 候補が消えたのにPRDだけ残ると、根拠の無い設計書が台帳に居座る。
      problems.push(`${where} — data/feature-backlog.json に該当候補が無い（孤児PRD）`);
      continue;
    }

    for (const f of REQUIRED_TEXT) {
      if (!nonEmpty(prd[f])) problems.push(`${where} — ${f} が空。**未定なら「未定」と書く**（空欄と未定は違う）`);
    }

    // 受入条件 — 検証方法を書けないものは受入条件として受け取らない。
    if (!Array.isArray(prd.acceptance) || prd.acceptance.length === 0) {
      problems.push(`${where} — acceptance が空。受入条件の無いPRDは着手可否を判断できない`);
    } else {
      prd.acceptance.forEach((a, i) => {
        if (!nonEmpty(a.given)) problems.push(`${where} — acceptance[${i}].given が空`);
        if (!nonEmpty(a.expect)) problems.push(`${where} — acceptance[${i}].expect が空`);
        if (!nonEmpty(a.verify)) {
          problems.push(`${where} — acceptance[${i}].verify が空。**どう確かめるかを書けない条件は検証不能**`);
        }
      });
    }

    if (!Array.isArray(prd.out_of_scope) || prd.out_of_scope.length === 0) {
      // 「やらないこと」が無いPRDは、実装中にいくらでも膨らむ。
      problems.push(`${where} — out_of_scope が空。**やらないことを書いていない設計は範囲が決まっていない**`);
    }

    // VISION §13 の6問。
    const vc = prd.vision_check || {};
    for (const q of VISION_QUESTIONS) {
      const a = vc[q];
      if (!a || !VISION_VERDICTS.has(a.verdict)) {
        problems.push(`${where} — vision_check.${q} が未回答（${[...VISION_VERDICTS].join(' / ')} のいずれか）`);
        continue;
      }
      if (!nonEmpty(a.note)) problems.push(`${where} — vision_check.${q} に理由が無い`);
      if (a.verdict === 'conflict' && !nonEmpty(a.resolution)) {
        problems.push(`${where} — vision_check.${q} が conflict なのに resolution が無い。`
          + '**衝突を書いたまま放置しない**（黙って片方へ寄せないために conflict がある）');
      }
    }

    // リスク持ちは承認欄が要る。点数でもPRDでも消えない。
    const gated = (cand.risks || []).filter((r) => GATED_RISKS.has(r));
    if (gated.length > 0) {
      const ap = prd.approval;
      if (!ap || !nonEmpty(ap.status)) {
        problems.push(`${where} — risks=[${gated.join(', ')}] は承認が要るのに approval.status が無い`);
      } else if (ap.status === 'approved' && !nonEmpty(ap.approved_by)) {
        problems.push(`${where} — approval.status=approved なのに approved_by が無い`);
      }
    }
  }

  // 本丸: PRD無しで「着手してよい」と宣言させない。
  for (const cand of backlogDoc.candidates) {
    if (cand.ready === true && !seen.has(cand.id)) {
      problems.push(`backlog:${cand.id} — ready=true なのにPRDが無い。`
        + '**設計を書かずに着手可にはできない**（この検査の存在理由）');
    }
  }

  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const prdDoc = readJSON('data/feature-prd.json');
  const backlogDoc = readJSON('data/feature-backlog.json');
  const problems = checkPrds(prdDoc, backlogDoc);
  const prds = prdDoc.prds || [];
  const byId = new Map(backlogDoc.candidates.map((c) => [c.id, c]));

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ count: prds.length, problems }, null, 2));
    process.exit(problems.length && argv.includes('--check') ? 1 : 0);
  }

  console.log(`PRD — ${prds.length}件 / 候補 ${backlogDoc.candidates.length}件`);
  console.log('  受入条件は verify を必須にしてある。検証方法を書けないものは受入条件ではない。\n');

  for (const prd of prds) {
    const cand = byId.get(prd.id);
    const gated = ((cand?.risks) || []).filter((r) => GATED_RISKS.has(r));
    const conflicts = VISION_QUESTIONS.filter((q) => prd.vision_check?.[q]?.verdict === 'conflict');
    const flags = [
      cand?.ready === true ? '着手可' : '未着手',
      gated.length ? `承認要（${gated.join(',')}: ${prd.approval?.status || '未記入'}）` : null,
      conflicts.length ? `**VISION衝突 ${conflicts.join(',')}**` : null,
    ].filter(Boolean);
    console.log(`  ${prd.id}`);
    console.log(`      ${prd.title || cand?.title || ''}`);
    console.log(`      受入 ${(prd.acceptance || []).length}件 / ${flags.join(' / ')}`);
  }

  const readyNoPrd = backlogDoc.candidates.filter((c) => c.ready === true && !prds.some((p) => p.id === c.id));
  if (readyNoPrd.length) {
    console.log(`\n  [PRD無しで着手可] ${readyNoPrd.length}件`);
    readyNoPrd.forEach((c) => console.log(`      ${c.id}`));
  }

  if (problems.length) {
    console.log(`\n  不備 ${problems.length}件`);
    problems.forEach((p) => console.log(`    ✗ ${p}`));
    if (argv.includes('--check')) process.exit(1);
  } else {
    console.log('\nPRDの形に問題なし。');
  }
}
