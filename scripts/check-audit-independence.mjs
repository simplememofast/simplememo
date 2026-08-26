#!/usr/bin/env node
/**
 * 独立監査 — **監査の中身ではなく、独立していることを検査する。**
 *
 *   node scripts/check-audit-independence.mjs           # 表示
 *   node scripts/check-audit-independence.mjs --check   # CI
 *
 * 【なぜ独立の担保のほうが難しいか】
 * 監査を同じパイプラインの中に置くと、**都合の悪い監査を止める権限も同じ側にある。**
 * 自己修復レーンは自分のCIを直せるので、放っておけば監査も直せてしまう。
 * だから機械が守るのは次の3点だけにしてある:
 *
 *   1. 憲章と所見の台帳を、自己修復レーンが書き換えられない
 *   2. 監査に使うモデルが、監査される側と違う（同じだと同じ盲点を共有する）
 *   3. 所見は消せない（追記のみ・連番が飛んだら落ちる）
 *
 * **監査AIは何も直さない。**直す権限を持たせると、
 * 「直したことにして所見を閉じる」が最短経路になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHARTER_PATH = path.join(ROOT, 'data/audit-charter.json');
export const FINDINGS_PATH = path.join(ROOT, 'data/audit-findings.json');
const AUTHORITY_PATH = path.join(ROOT, 'data/authority-matrix.json');
const ROUTING_PATH = path.join(ROOT, 'data/model-routing.json');

export function validate(charter, findings, { mayModify = [], routing = null } = {}) {
  const problems = [];
  const ind = charter.independence || {};

  // 1. 自己修復が触れないこと。**ここが破れると、他の2つは無意味。**
  for (const f of ind.must_not_be_modifiable_by_self_repair || []) {
    if (mayModify.includes(f)) {
      problems.push(`${f} が self_repair.may_modify に入っている`
        + ' — **監査される側が監査を書き換えられる状態**');
    }
  }
  if (ind.may_modify_anything) {
    problems.push('independence.may_modify_anything が true — 監査AIに直す権限を渡さない'
      + '（「直したことにして所見を閉じる」が最短経路になる）');
  }
  if (ind.reports_to !== 'owner') problems.push('independence.reports_to は owner');

  // 2. 監査に使うモデルが、監査される側と違うこと
  if (routing) {
    const audit = routing.rules?.audit;
    if (!audit) {
      problems.push('model-routing.json に audit の振り分けが無い'
        + ' — 監査だけ別モデルにする配線が無い');
    } else {
      for (const other of ind.must_use_different_model_from || []) {
        const r = routing.rules?.[other];
        if (r && r.model === audit.model) {
          problems.push(`監査のモデルが ${other} と同じ（${audit.model}）`
            + ' — **同じモデルは同じ盲点を共有する**');
        }
      }
    }
  }

  // 3. 所見が消えていないこと（追記のみ・連番が飛ばない）
  const seqs = (findings.findings || []).map((f) => f.seq);
  for (let i = 0; i < seqs.length; i++) {
    if (seqs[i] !== i + 1) {
      problems.push(`所見の連番が飛んでいる（${i + 1}番目が seq=${seqs[i]}）`
        + ' — **消せる台帳に意味は無い。**対応済みにするときも行は残し resolution を足す');
      break;
    }
  }
  if (findings.next_seq !== seqs.length + 1) {
    problems.push(`next_seq=${findings.next_seq} が所見数 ${seqs.length} と合わない`);
  }
  for (const f of findings.findings || []) {
    if (!charter.dimensions?.some((d) => d.id === f.dimension)) {
      problems.push(`所見 seq=${f.seq} の dimension "${f.dimension}" が憲章に無い`);
    }
    if (!f.observed_at || !f.summary) problems.push(`所見 seq=${f.seq} に observed_at / summary が無い`);
  }

  // 憲章の中身が空でないこと（次元ゼロの監査は監査ではない）
  for (const d of charter.dimensions || []) {
    if (!Array.isArray(d.checks) || !d.checks.length) problems.push(`dimension ${d.id}: checks が空`);
    if (!d.why) problems.push(`dimension ${d.id}: why が無い`);
  }
  if ((charter.dimensions || []).length < 3) problems.push('監査の観点が3つ未満');
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const charter = JSON.parse(fs.readFileSync(CHARTER_PATH, 'utf8'));
  const findings = JSON.parse(fs.readFileSync(FINDINGS_PATH, 'utf8'));
  const authority = JSON.parse(fs.readFileSync(AUTHORITY_PATH, 'utf8'));
  const routing = fs.existsSync(ROUTING_PATH) ? JSON.parse(fs.readFileSync(ROUTING_PATH, 'utf8')) : null;
  const mayModify = authority.self_repair?.may_modify ?? [];
  const problems = validate(charter, findings, { mayModify, routing });

  console.log(`独立監査 — 観点 ${charter.dimensions.length}件 / 所見 ${findings.findings.length}件\n`);
  for (const d of charter.dimensions) {
    console.log(`  ${d.title}（${d.checks.length}項目）`);
    console.log(`    ${d.why}`);
  }
  console.log('\n  独立の担保:');
  console.log(`    自己修復が触れない          ${charter.independence.must_not_be_modifiable_by_self_repair.every((f) => !mayModify.includes(f)) ? 'OK' : 'NG'}`);
  console.log(`    監査だけ別モデル            ${routing?.rules?.audit ? `OK（${routing.rules.audit.model}）` : 'NG'}`);
  console.log(`    所見は追記のみ              ${findings.next_seq === findings.findings.length + 1 ? 'OK' : 'NG'}`);
  console.log(`    監査AIに直す権限を渡さない  ${charter.independence.may_modify_anything ? 'NG' : 'OK'}`);
  console.log(`\n  実施: ${charter.cadence.last_run_at ?? '**まだ一度も走らせていない**（憲章と独立の担保ができただけ）'}`);
  console.log('  所見ゼロは「問題なし」ではなく「まだ見ていない」。');

  if (problems.length) {
    console.error('\n独立監査: 独立が担保できていない');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n独立の3点が担保されている。');
}
