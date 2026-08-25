#!/usr/bin/env node
/**
 * autonomy-conditions.json の `measured` が、**台帳から数え直した値と合っているか。**
 *
 * 【なぜ要るか】
 * `measured` は手で書いた散文で、誰も突き合わせていなかった。
 * 2026-08-25 の第1回定期監査で①〜⑥を数え直したところ5つは合っていたが、
 * **⑦だけ「必須CIチェック 40→53本」で止まっていた**（実際は57本）。
 * 合っていた5つも、合っていることを誰も守ってはいなかった ——
 * 実験のベースラインとまったく同じ形。
 *
 * 【二段で見る】
 *   1. facts   … 台帳から数え直した値と `measured_facts` が一致するか（**厳密**）
 *   2. 散文    … その値が `measured` の文中に現れるか（**緩い**）
 *
 * 台帳が動くと 1 が落ちる。facts を直すと、こんどは 2 が落ちる。
 * **数字を更新しないと散文が通らない**形で連鎖させてある。
 * 2 は「その桁が文中にある」しか見ないので、小さい数では取りこぼしうる。
 * **厳密なのは 1 のほうで、2 は散文が置き去りになるのを防ぐ添え木。**
 *
 * 【measured を自動生成しない理由】
 * 散文には数字以外のことが書いてある（何を数えていないか、どう読むべきか）。
 * 生成に寄せるとその部分が消える。**数字だけを縛って、文は人／AIに書かせる。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

/** 台帳から数え直せる値。**ここに無いものは縛らない。** */
export function derive() {
  const runs = read('data/autopilot-runs.json').runs ?? [];
  const exps = read('growth/experiments/experiments.json').experiments ?? [];
  const mem = read('data/operating-memory.json').records ?? [];
  const auth = read('data/authority-matrix.json');
  const findCi = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (k === 'required_ci_checks') return v;
      if (v && typeof v === 'object') { const f = findCi(v); if (f) return f; }
    }
  };
  const ev = exps.filter((e) => e.status === 'evaluated');
  return {
    runs_total: runs.length,
    runs_shipped: runs.filter((r) => r.outcome === 'shipped').length,
    repairs: runs.filter((r) => r.repair_of).length,
    experiments_total: exps.length,
    experiments_evaluated: ev.length,
    experiments_running: exps.filter((e) => e.status === 'running').length,
    experiments_inconclusive: ev.filter((e) => e.decision === 'inconclusive').length,
    memory_records: mem.length,
    required_ci_checks: (findCi(auth) ?? []).length,
  };
}

export function validate(conditions, facts = derive()) {
  const problems = [];
  for (const c of conditions.conditions ?? []) {
    // **数字を書いたなら縛らせる。**
    // ここを素通りにすると、measured_facts を書かないほうが検査を通る形になり、
    // 「縛っていない条件が既定」に戻る。新しい台帳が既定で誰にも見られていない、
    // というのを check-claims.mjs で塞いだのと同じ理由。
    const declared = c.measured_facts;
    if (!declared) {
      if (/\d/.test(c.measured ?? '')) {
        problems.push(`条件${c.n}: measured に数字があるのに measured_facts が無い`
          + ' — **数え直せない数字は、書いただけの数字**。'
          + '数え直せないなら derive() に足すか、measured から数字を外すこと');
      }
      continue;
    }
    for (const [key, value] of Object.entries(declared)) {
      if (!(key in facts)) {
        problems.push(`条件${c.n}: measured_facts の "${key}" は数え直せる値の一覧に無い`
          + `（derive() に足すか、名前を直す）`);
        continue;
      }
      if (facts[key] !== value) {
        problems.push(`条件${c.n}: ${key} が台帳と違う — measured_facts は ${value}、`
          + `台帳を数え直すと **${facts[key]}**`);
        continue;
      }
      // 散文の側が置き去りになっていないか（**添え木。厳密ではない**）
      if (!new RegExp(`\\b${value}\\b`).test(c.measured ?? '')) {
        problems.push(`条件${c.n}: ${key}=${value} が measured の文中に見当たらない`
          + ` — **数字だけ直して文を直していない**可能性`);
      }
    }
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const conditions = read('data/autonomy-conditions.json');
  const facts = derive();
  const problems = validate(conditions, facts);

  console.log('自律条件の実測値 — **台帳から数え直して突き合わせる**\n');
  for (const [k, v] of Object.entries(facts)) console.log(`  ${k.padEnd(26)} ${v}`);

  const bound = (conditions.conditions ?? []).filter((c) => c.measured_facts);
  console.log(`\n  縛っている条件: ${bound.length} / ${(conditions.conditions ?? []).length}`);
  console.log('  **縛っていない条件は「見ていない」。**measured_facts を書けば縛られる');

  if (problems.length) {
    console.error(`\n自律条件の実測値: ずれ ${problems.length}件`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\n自律条件の実測値: 台帳と一致');
}
