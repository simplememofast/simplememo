#!/usr/bin/env node
/**
 * **2つの台帳が食い違ったら落とす。**
 *
 *   node scripts/check-coverage-authority.mjs           # 表を出す
 *   node scripts/check-coverage-authority.mjs --check   # CI
 *   node scripts/check-coverage-authority.mjs --selftest
 *
 * 【なぜ要るか — 2026-08-28 に手で見つけた誤りを、機械に見つけさせる】
 * `data/automation-coverage.json` は「なぜAIが実行していないか」を blocker で持ち、
 * `data/authority-matrix.json` は「誰が実行してよいか」を持つ。
 * **同じことを2か所に書いているので、片方だけ動く。**実際そうなった:
 *
 *   ・**境界なのに実装待ちと書いていた**（12件）。unblocked_by は自分で
 *     「人に残した」と書いているのに blocker は `not_started` で、
 *     `--plan` が「実装すれば +18件（+9.0pt）」と出し続けていた。
 *     **天井が実際より 6.0pt 高く出る。**
 *   ・**境界が外れたのに古い前提のままだった**（App Review提出 / App Store公開）。
 *     オーナーが渡し、権限表は `requires_approval: false` ＋ machine_gate へ動いたのに、
 *     coverage 側の行は「恒久的に人へ残した」と書いたままだった。
 *     **こちらは逆向きに、やれることを隠す。**
 *
 * どちらも**読めば分かる**状態で数日残っていた。読む人が居ないと直らないものは、
 * 直らない。
 *
 * 【どう繋ぐか — 領域ではなく、条項を名指しさせる】
 * 領域まるごとで突き合わせると**部分的に渡した領域**が扱えない。
 * 「段階公開の撤回」は ai_may に『ガードの判定が閾値を割ったときの kill』を持ち、
 * human_only に『ガードの判定によらない kill（手動・訓練を含む）』を持つ。
 * **同じ領域の中で、渡した側と残した側が並んでいる。**
 *
 * だから coverage の行には**条項の文字列そのもの**を書かせる:
 *
 *   "authority": { "domain": "…", "human_only": "…" }   境界は人の側にある
 *   "authority": { "domain": "…", "ai_may":     "…" }   境界は外れている
 *
 * 表からその条項が消えたら（＝オーナーが渡した／取り上げた）、**照合が落ちる。**
 * 分類を直すか、名指しを直すかを、その場で選ばせる。
 *
 * 【名指しできない行は、書かずに済ませられない】
 * 表に領域が無い境界（機能の採否・課金導線・VISION §14 など）は
 * `$authority_absent` に理由を書く。**件数はラチェット**
 * （`authority_absent_budget`）で、増える方向を止める。
 * 散文だけを根拠にした境界が、黙って増えるのを防ぐため。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { BLOCKERS } from './autonomy-gap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COVERAGE_PATH = path.join(ROOT, 'data/automation-coverage.json');
export const MATRIX_PATH = path.join(ROOT, 'data/authority-matrix.json');

const AI = new Set(['ai_autonomous', 'ai_executes_gated']);

export function load() {
  return {
    coverage: JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')),
    matrix: JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8')),
  };
}

/** 条項の文字列は表の実物と完全一致であること。**近い文字列を通さない。** */
function citedClause(domain, side, clause) {
  const list = domain[side];
  return Array.isArray(list) && list.includes(clause);
}

export function validate({ coverage, matrix }) {
  const problems = [];
  const byName = new Map((matrix.domains ?? []).map((d) => [d.domain, d]));

  for (const t of coverage.tasks ?? []) {
    const at = `${t.area} :: ${t.task}`;
    const a = t.authority;

    if (a !== undefined) {
      if (!a || typeof a !== 'object' || typeof a.domain !== 'string') {
        problems.push(`${at}: authority の形が違う（domain と human_only/ai_may のどちらか一方が要る）`);
        continue;
      }
      const d = byName.get(a.domain);
      if (!d) {
        problems.push(`${at}: 権限表に領域「${a.domain}」が無い`
          + '（**名前を写し間違えると、照合は黙って空回りする**）');
        continue;
      }
      const hasHeld = typeof a.human_only === 'string';
      const hasGiven = typeof a.ai_may === 'string';
      if (hasHeld === hasGiven) {
        problems.push(`${at}: human_only と ai_may は**どちらか一方だけ**書く`
          + '（両方／どちらも無し、はどちら側の主張か決まらない）');
        continue;
      }

      if (hasHeld) {
        if (!citedClause(d, 'human_only', a.human_only)) {
          problems.push(`${at}: 権限表「${a.domain}」の human_only に`
            + `「${a.human_only}」が無い —— **表が先に動いた可能性がある。**`
            + '渡されたのなら blocker を直し、条項名が変わっただけならここを直す');
        }
        // 人の側にある条項を名指ししながら、AIが実行していることにはできない。
        if (AI.has(t.executor)) {
          problems.push(`${at}: human_only の条項を名指ししているのに executor が ${t.executor}`);
        }
        // **境界を到達可能側に数えない。**これが 2026-08-28 の12件。
        const klass = BLOCKERS[t.blocker]?.klass;
        if (klass === 'reachable') {
          problems.push(`${at}: 権限表が人へ残している条項なのに blocker「${t.blocker}」が到達可能`
            + ' —— **実装量では動かない行を天井に数えている**'
            + '（`--plan` が「作れば進む」と言い続ける）');
        }
      }

      if (hasGiven) {
        if (!citedClause(d, 'ai_may', a.ai_may)) {
          problems.push(`${at}: 権限表「${a.domain}」の ai_may に`
            + `「${a.ai_may}」が無い —— **取り上げられたのなら blocker を境界へ戻す**`);
        }
        // 逆向きの食い違い。**渡されたものを「人に残した」と書き続けない。**
        if (t.blocker === 'policy_boundary') {
          problems.push(`${at}: ai_may の条項を名指ししているのに blocker が policy_boundary`
            + ' —— **境界は外れている。**やれることを隠す向きの食い違い');
        }
      }
    }

    if (t.$authority_absent !== undefined) {
      if (typeof t.$authority_absent !== 'string' || !t.$authority_absent.trim()) {
        problems.push(`${at}: $authority_absent が空`);
      }
      if (a !== undefined) {
        problems.push(`${at}: authority と $authority_absent の両方がある`);
      }
      if (t.blocker !== 'policy_boundary') {
        problems.push(`${at}: $authority_absent は境界の行にだけ書く（いまの blocker は「${t.blocker}」）`);
      }
    }
  }

  // **境界だと言うなら、表を指すか、指せない理由を書く。**どちらも無い行を通さない。
  const bounded = (coverage.tasks ?? []).filter((t) => t.blocker === 'policy_boundary');
  const naked = bounded.filter((t) => t.authority === undefined && t.$authority_absent === undefined);
  for (const t of naked) {
    problems.push(`${t.area} :: ${t.task}: policy_boundary なのに権限表を指していない`
      + '（authority か $authority_absent のどちらかを書く）');
  }

  // ラチェット。**散文だけが根拠の境界を増やさない。**
  const absent = bounded.filter((t) => t.$authority_absent !== undefined);
  const budget = coverage.authority_absent_budget;
  if (typeof budget !== 'number') {
    problems.push('authority_absent_budget が数でない — 無ければ無制限、が一番危ない');
  } else if (absent.length > budget) {
    problems.push(`権限表を指せない境界が ${absent.length} 件で、上限 ${budget} を超えた`
      + ' —— **表に領域を足して名指しするか、境界でないと認めて分類を直すか。**'
      + '上限を上げて通さない');
  }

  return problems;
}

function selftest() {
  const scenarios = ledgerScenarios(load, validate, [
    ['**表から条項が消えたら落ちる**（渡されたのに境界のまま）', (d) => {
      const dom = d.matrix.domains.find((x) => x.domain === 'プレスリリースの配信');
      dom.human_only = dom.human_only.filter((c) => c !== 'PR TIMES管理画面からの配信操作');
    }],
    ['**境界を到達可能側に数えたら落ちる**（2026-08-28 の12件）', (d) => {
      const t = d.coverage.tasks.find((x) => x.task === 'PR TIMES への配信操作');
      t.blocker = 'not_started'; t.unlock = 'impl_product';
    }],
    ['**渡されたものを境界と書いたら落ちる**（逆向きの食い違い）', (d) => {
      d.coverage.tasks.find((x) => x.task === 'App Review への提出').blocker = 'policy_boundary';
    }],
    ['ai_may から条項が消えたら落ちる（取り上げられた）', (d) => {
      const dom = d.matrix.domains.find((x) => x.domain === 'App Review への提出');
      dom.ai_may = [];
    }],
    ['領域名を写し間違えたら落ちる（照合が空回りしない）', (d) => {
      d.coverage.tasks.find((x) => x.task === '価格の変更').authority.domain = 'プレスリリ－スの配信';
    }],
    ['human_only を名指ししながらAI実行にしたら落ちる', (d) => {
      d.coverage.tasks.find((x) => x.task === '価格の変更').executor = 'ai_executes_gated';
    }],
    ['**表も指さず理由も書かない境界は落ちる**', (d) => {
      delete d.coverage.tasks.find((x) => x.task === 'ChatOps によるリリース起動').$authority_absent;
    }],
    ['理由が空文字なら落ちる（欄を作っただけで通さない）', (d) => {
      d.coverage.tasks.find((x) => x.task === 'ChatOps によるリリース起動').$authority_absent = '   ';
    }],
    ['ラチェットが増加を止める', (d) => {
      d.coverage.authority_absent_budget = 0;
    }],
    ['上限が数でなければ落ちる', (d) => { delete d.coverage.authority_absent_budget; }],
    ['human_only と ai_may を両方書いたら落ちる', (d) => {
      d.coverage.tasks.find((x) => x.task === '価格の変更').authority.ai_may = 'すべて';
    }],
  ]);
  const failed = run(scenarios, { label: 'coverage×権限表' });
  return failed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = load();
  const problems = validate(doc);
  const linked = doc.coverage.tasks.filter((t) => t.authority);
  const absent = doc.coverage.tasks.filter((t) => t.$authority_absent);

  console.log(`coverage 台帳 × 権限表 — 名指し ${linked.length} 件`
    + `（人の側 ${linked.filter((t) => t.authority.human_only).length}`
    + ` / 渡した側 ${linked.filter((t) => t.authority.ai_may).length}）`
    + ` ＋ 表に領域が無い境界 ${absent.length}/${doc.coverage.authority_absent_budget} 件`);
  for (const t of linked) {
    const side = t.authority.human_only ? '人' : 'AI';
    console.log(`  [${side}] ${t.area} :: ${t.task}\n        → ${t.authority.domain}`);
  }

  if (problems.length) {
    console.error('\n**2つの台帳が食い違っている:**');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n**どちらが新しいかは機械には決められない。**'
      + '権限表が動いたのなら coverage の blocker を直し、'
      + '条項の書き換えなら名指しを直す。**どちらも「合いそうな方へ寄せる」で決めない。**');
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log('\n名指しはすべて権限表の実物と一致。**「緑」は境界が正しいという意味ではない** —'
      + '見ているのは2つの台帳がずれていないことだけ。');
  }
}
