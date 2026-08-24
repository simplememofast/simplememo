#!/usr/bin/env node
/**
 * 契約条項の検査 — 「読んだ」と「読んでいない」を混ぜない。
 *
 *   node scripts/check-contract-terms.mjs           # 一覧
 *   node scripts/check-contract-terms.mjs --check   # CI: 不備があれば exit 1
 *   node scripts/check-contract-terms.mjs --json
 *
 * ## なぜ別ファイルにしないか
 *
 * 条項は `data/vendor-register.json` の各ベンダーに `contract_terms` として持つ。
 * ベンダー台帳と条項台帳を分けると、**片方にしか載っていない事業者**が必ず生まれ、
 * どちらが正か分からなくなる。`scripts/check-vendors.mjs` が事業者の存在を、
 * この検査が条項の中身を見る、という分担にしてある。
 *
 * ## 4つの条項は `data/automation-coverage.json` の task 名がそのまま来ている
 *
 * ⑦『責任上限・知財・個人情報・準拠法の条項検査』。**検査項目を勝手に増やさない**
 * （増やすなら台帳のタスク名の側を先に直す）。`exit_plan` だけは任意で、
 * ⑫事業継続性の「外部サービス停止時の縮退運転」と重なるため参考として置く。
 *
 * ## verdict に `unknown` を残してある理由
 *
 * **`unknown` は失敗ではなく、正しい記録。**「まだ読んでいない」を書けなくすると、
 * 埋めるために推測が入る。`data/credential-expiry.json` が期限未記入を
 * 「未把握」として別枠に出しているのと同じ扱いで、**数えて名指しはするが、
 * ゼロや『問題なし』では埋めない。**
 *
 * ## `source` を必須にしてあるのが本体
 *
 * `unknown` 以外の判定には「何を読んでそう判断したか」（規約URL・契約書名・
 * 管理画面のページ）を必ず書かせる。**出典の無い『問題なし』は、
 * 見ていないのと区別がつかない。**ここが空のまま通ると、この検査は
 * 「レビュー済みという文字列があるか」を見るだけの装置になる。
 *
 * ## 個人データを渡している事業者だけを必須にする
 *
 * `policy.enforce_clause_review` を true にすると、personal_data が none 以外の
 * 事業者に未記入があるだけで落ちる。`enforce_unreviewed` と同じ考え方で、
 * **リスクの大きいところから順に強制する**（全社を一度に必須にすると、
 * 埋まるまで CI が落ち続けて auto-merge が止まる）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** 検査する条項。**automation-coverage.json のタスク名が正。** */
export const CLAUSES = {
  liability_cap:       '責任上限',
  ip:                  '知財',
  personal_data_terms: '個人情報',
  governing_law:       '準拠法',
};
/** 任意。⑫事業継続性と重なるので参考扱い。 */
export const OPTIONAL_CLAUSES = { exit_plan: '撤退計画' };

/**
 * ok        … 確認した。こちらの条件で問題なし
 * attention … 確認した。**引っかかる点がある**（note 必須）
 * na        … その契約に当該条項が無い／概念として当たらない（note 必須）
 * unknown   … **まだ読んでいない。**推測で埋めない
 */
export const VERDICTS = new Set(['ok', 'attention', 'na', 'unknown']);

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function checkContractTerms(doc) {
  const problems = [];
  const stats = { ok: 0, attention: 0, na: 0, unknown: 0, missing: 0 };
  const enforce = doc.policy?.enforce_clause_review === true;

  for (const v of doc.vendors) {
    const handlesPersonal = v.personal_data !== 'none';
    const terms = v.contract_terms || {};
    const required = enforce && handlesPersonal;

    for (const [key, label] of Object.entries(CLAUSES)) {
      const entry = terms[key];

      if (!entry || !entry.verdict) {
        stats.missing++;
        const msg = `${v.id} — ${label}（${key}）の記入が無い`;
        if (required) problems.push(`${msg}。**個人データを渡している事業者は必須**`);
        continue;
      }

      if (!VERDICTS.has(entry.verdict)) {
        problems.push(`${v.id} — ${label}: 未知の verdict "${entry.verdict}"（${[...VERDICTS].join(' / ')}）`);
        continue;
      }

      stats[entry.verdict]++;

      // attention / na は理由が無いと後から読めない。
      if ((entry.verdict === 'attention' || entry.verdict === 'na') && !nonEmpty(entry.note)) {
        problems.push(`${v.id} — ${label}: verdict=${entry.verdict} なのに note が無い`);
      }

      // 出典の無い判定は、見ていないのと区別がつかない。
      if (entry.verdict !== 'unknown' && !nonEmpty(entry.source)) {
        problems.push(`${v.id} — ${label}: **何を読んでそう判断したかが無い**（source 必須）`);
      }

      if (required && entry.verdict === 'unknown') {
        problems.push(`${v.id} — ${label}: 個人データを渡しているのに未確認のまま`);
      }
    }

    for (const [key, label] of Object.entries(OPTIONAL_CLAUSES)) {
      const entry = terms[key];
      if (entry && entry.verdict && !VERDICTS.has(entry.verdict)) {
        problems.push(`${v.id} — ${label}: 未知の verdict "${entry.verdict}"`);
      }
    }

    // dpa_reviewed と条項の整合。**片方だけ進んだ状態を放置しない。**
    const anyReviewed = Object.keys(CLAUSES).some(
      (k) => terms[k]?.verdict && terms[k].verdict !== 'unknown',
    );
    if (v.dpa_reviewed && !anyReviewed) {
      problems.push(`${v.id} — dpa_reviewed が入っているのに、条項が1つも確認されていない。`
        + '**「レビュー済み」だけが独り歩きしている**');
    }
  }

  return { problems, stats, enforce };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = readJSON('data/vendor-register.json');
  const { problems, stats, enforce } = checkContractTerms(doc);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({ stats, enforce, problems }, null, 2));
    process.exit(problems.length && argv.includes('--check') ? 1 : 0);
  }

  const labels = { ...CLAUSES };
  console.log(`契約条項 — ${doc.vendors.length}社 × ${Object.keys(CLAUSES).length}条項`);
  console.log(`  強制: ${enforce ? '個人データを渡している事業者は必須' : '**警告のみ**（enforce_clause_review: false）'}`);
  console.log(`  確認済 ${stats.ok} / 要確認 ${stats.attention} / 対象外 ${stats.na}`
    + ` / **未確認 ${stats.unknown}** / 未記入 ${stats.missing}\n`);

  for (const v of doc.vendors) {
    const terms = v.contract_terms || {};
    const marks = Object.keys(CLAUSES).map((k) => {
      const val = terms[k]?.verdict;
      return { ok: '●', attention: '▲', na: '－', unknown: '○' }[val] || '·';
    }).join(' ');
    const tag = { personal: ' ★個人データ', pseudonymous: ' ・仮名化' }[v.personal_data] || '';
    console.log(`  ${marks}  ${v.id}${tag}`);
    for (const [k, label] of Object.entries(labels)) {
      const e = terms[k];
      if (e?.verdict === 'attention') console.log(`         ▲ ${label}: ${e.note}`);
    }
  }
  console.log('\n  ● 確認済  ▲ 要確認  － 対象外  ○ 未確認  · 未記入');
  console.log(`  順: ${Object.values(CLAUSES).join(' / ')}`);

  if (problems.length) {
    console.log(`\n  不備 ${problems.length}件`);
    problems.forEach((p) => console.log(`    ✗ ${p}`));
    if (argv.includes('--check')) process.exit(1);
  } else {
    console.log('\n条項台帳の形に問題なし。');
  }
}
