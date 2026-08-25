#!/usr/bin/env node
/**
 * 週次監査の**入力を組み立てる。**
 *
 *   node scripts/audit-brief.mjs          # 監査AIに渡す資料
 *   node scripts/audit-brief.mjs --check  # 約束どおり回っているか＋監査自身の実績
 *
 * 【なぜ入力を組み立てるのか — 観点を渡すだけでは出ない】
 * 憲章（data/audit-charter.json）には観点が4つある。ところが**その観点だけを
 * 渡しても、2026-08-25 に出た誤り3件はどれも出ない。**観点の検査項目を読むと
 * 理由が分かる:
 *
 *   overclaim         「主張が automation-coverage.json の分類と矛盾していないか」
 *                     … **台帳 ↔ 台帳。**現実とは突き合わせていない
 *   guardrail_erosion 「必須CIチェックの本数が減っていないか」
 *                     … **数えているのはリスト。**ワークフローではない
 *
 * 実際その3件は台帳同士としては完全に整合していた。ずれていたのは
 * **台帳と、それが指している現実**のほうだった。
 *
 * だから一次入力を**未検査の対**（data/claim-referent.json の covered:false）にする。
 * 「自由に考えろ」ではなく「**この対を1つずつ開いて比べろ**」と渡す。
 *
 * 【機械で見られるものは監査AIに回さない】
 * 今日わかったとおり、AIも人と同じ誤りをする（在るものを見にいかない）。
 * 突き合わせが機械でできるなら検査を書くほうが速くて確実で、
 * **監査に回すのは「機械では見られないと分かっている対」だけ。**
 *
 * 【--check が見るもの】
 *   - 憲章が週1と言っているのに、実際に走っているか（**約束と実績の対**）
 *   - 所見の出どころの内訳（**監査が仕事をしているかを、監査自身の出力で測る**）
 *
 * マージゲート（seo-check.yml）では**報告のみで落とさない。**
 * ここで落とすと、監査が滞っているだけで無関係な修正まで出荷できなくなり、
 * 「出荷を通すために監査を形だけ回す」方へ圧力がかかる。
 * check-experiments.mjs を報告のみにしてあるのと同じ理由。
 * **落とすのは監査ワークフロー自身の中だけ。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** 週1と言っている以上、これを超えたら「回っていない」。 */
export const MAX_INTERVAL_DAYS = 14;

/** 定期監査が見つけたと数えてよい found_by。**これ以外は事故か指摘。** */
export const PERIODIC = 'periodic_audit';

export function ageDays(iso, today = new Date()) {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  return Math.floor((today - t) / 86_400_000);
}

/**
 * 監査自身の実績。**監査が仕事をしているかを、監査の出力で測る。**
 * ここが 0 のまま動かないなら、悪いのは運用ではなく監査の設計。
 */
export function auditKpi(findings) {
  const rows = findings.findings ?? [];
  const by = {};
  for (const f of rows) by[f.found_by ?? 'unknown'] = (by[f.found_by ?? 'unknown'] ?? 0) + 1;
  const periodic = by[PERIODIC] ?? 0;
  return { total: rows.length, periodic, by, rate: rows.length ? periodic / rows.length : null };
}

export function validate({ charter, findings, today = new Date() } = {}) {
  const problems = [];
  const last = charter.cadence?.last_run_at ?? null;
  const age = ageDays(last, today);

  if (!last) {
    problems.push('憲章は週1と言っているが、**一度も走っていない**（cadence.last_run_at が null）'
      + ' — 決めた周期で回っていない監査は、**在ることになっているだけ**');
  } else if (age === null) {
    problems.push(`cadence.last_run_at "${last}" を日付として読めない`);
  } else if (age > MAX_INTERVAL_DAYS) {
    problems.push(`前回の監査から ${age}日（上限 ${MAX_INTERVAL_DAYS}日）`
      + ' — **週1と書いてあるものが回っていない**');
  }

  const kpi = auditKpi(findings);
  if (kpi.total > 0 && kpi.periodic === 0) {
    problems.push(`所見 ${kpi.total}件すべてが定期監査以外の出どころ`
      + '（事故・別作業のついで・外からの指摘）'
      + ' — **監査の設計が仕事をしていない証拠。**観点ではなく未検査の対を入力にすること');
  }
  return problems;
}

function brief() {
  const pairs = read('data/claim-referent.json');
  const charter = read('data/audit-charter.json');
  const findings = read('data/audit-findings.json');
  const authority = read('data/authority-matrix.json');
  const runs = read('data/autopilot-runs.json');
  const conditions = read('data/autonomy-conditions.json');

  const gaps = (pairs.pairs ?? []).filter((p) => p.covered !== true);
  const kpi = auditKpi(findings);
  const out = [];

  out.push('# 週次監査 — 入力', '');
  out.push(`前回: ${charter.cadence?.last_run_at ?? '**一度も走っていない**'}`);
  out.push(`所見: ${kpi.total}件（うち定期監査由来 **${kpi.periodic}件**）`);
  out.push('');
  out.push('## 0. やってはいけないこと', '');
  out.push('- **直さない。**所見を書くだけ。直す権限を持つと「直したことにして閉じる」が最短経路になる');
  out.push('- **所見を消さない・閉じない。**追記のみ（連番が飛ぶとCIが落ちる）');
  out.push('- **憲章と所見の台帳を書き換えない**（自己修復レーンの may_modify に入っていない）');
  out.push('- 機械で突き合わせられると分かったものは、所見にせず**検査を提案する**');
  out.push('');
  out.push('## 1. 一次入力 — 未検査の対', '');
  out.push('**ここから順に見る。**「自由に考える」ことは求めていない。');
  out.push('主張と、それが指しているものを**実際に開いて比べる**こと。');
  out.push('2026-08-25 に出た誤り3件は、どれもこの形の対で、深い洞察ではなく');
  out.push('開いて比べただけで出た。', '');
  for (const p of gaps) {
    out.push(`### ${p.id}`);
    out.push(`- 主張: ${p.claim}`);
    out.push(`- 指しているもの: ${p.referent}`);
    out.push(`- 見ていない理由: ${p.why_uncovered}`);
    out.push('');
  }
  out.push('## 2. 歯止めの推移', '');
  out.push(`- 必須CIチェック: ${authority.self_repair?.required_ci_checks?.length ?? 0}本`);
  out.push(`  **減っていたら、それ自体が所見。**増えているぶんには問題ない`);
  out.push(`- 自己修復が触ってよいファイル: ${authority.self_repair?.may_modify?.length ?? 0}件`);
  out.push('- `enforce` が false のまま放置されていないか（model-eval など）');
  out.push('- 「未設定と決めた」が**空欄に戻っていないか**（空欄と未設定は違う）');
  out.push('');
  out.push('## 3. 静かに止まっていないか', '');
  const rows = runs.runs ?? [];
  const unresolved = rows.filter((r) => r.failure_class && !rows.some((x) => (x.repair_of ?? []).includes(r.id)));
  out.push(`- run ${rows.length}件 / **未修理の故障 ${unresolved.length}件**`);
  out.push('- 緑のまま成果物が出ていない日が続いていないか');
  out.push('- 「未観測」が「ゼロ」として扱われていないか');
  out.push('');
  out.push('## 4. 主張が実装を超えていないか', '');
  for (const c of conditions.conditions ?? []) {
    if (c.status === 'met') continue;
    out.push(`- ${c.n}. ${c.title} … **${c.status}**`);
  }
  out.push('');
  out.push('  **対外文言がこの状態を超えていないか。**とくに「閉ループ」「自律」');
  out.push('  「再帰的」は、条件の充足から導出した段階を超えて名乗っていないか。');
  out.push('');
  out.push('## 5. 倫理・評判・長期影響', '');
  for (const d of charter.dimensions ?? []) {
    if (d.id !== 'ethics_reputation') continue;
    for (const c of d.checks ?? []) out.push(`- ${c}`);
  }
  out.push('');
  out.push('## 6. 所見の書き方', '');
  out.push('`data/audit-findings.json` へ追記する。**found_by は必ず `periodic_audit`**');
  out.push('（この監査で見つけたものだけ。別作業のついでに気づいたものは別の値にする）。');
  out.push('`resolution` は**書かない** — 直すのは監査の仕事ではない。');
  out.push('見つからなければ**所見ゼロで終えてよい。**');
  out.push('ただし `cadence.last_run_at` は必ず更新すること（走ったこと自体が記録）。');
  return out.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const charter = read('data/audit-charter.json');
  const findings = read('data/audit-findings.json');

  if (argv.includes('--check')) {
    const problems = validate({ charter, findings });
    const kpi = auditKpi(findings);
    console.log('週次監査 — 約束と実績\n');
    console.log(`  前回: ${charter.cadence?.last_run_at ?? '**一度も走っていない**'}`);
    console.log(`  所見 ${kpi.total}件の出どころ:`);
    for (const [k, n] of Object.entries(kpi.by)) {
      console.log(`    ${k === PERIODIC ? '**' + k + '**' : k}: ${n}件`);
    }
    console.log(`\n  定期監査由来: **${kpi.periodic} / ${kpi.total}件**`);
    console.log('  **これが監査のKPI。**動かないなら、悪いのは運用ではなく監査の設計。');

    if (problems.length) {
      console.log(`\n週次監査: 未達 ${problems.length}件`);
      for (const p of problems) console.log(`  - ${p}`);
      // **マージゲートでは落とさない。**監査の滞りで無関係な出荷を止めると、
      // 「通すために形だけ回す」方へ圧力がかかる。落とすのは監査ワークフロー自身。
      if (argv.includes('--strict')) process.exit(1);
      console.log('\n  （報告のみ。落とすのは監査ワークフロー自身の中だけ — `--strict`）');
    } else {
      console.log('\n週次監査: 約束どおり回っている');
    }
    process.exit(0);
  }

  console.log(brief());
}
