#!/usr/bin/env node
/**
 * 資格情報の権限・経路・失効手順 — 「止めたいときに、どれを失効させるか」に答えられるか。
 *
 *   node scripts/check-credentials.mjs          # 一覧
 *   node scripts/check-credentials.mjs --check  # CI
 *   node scripts/check-credentials.mjs --stop <経路>   # その経路を止める鍵を出す
 *
 * 【なぜ作るか】
 * 緊急停止の台帳には、この仕組みの外にある最後の手段として
 * **「credential-expiry.json に載っている鍵を無効化する」**と書いてあった。
 * ところが 2026-08-22 に数えたら、ワークフローが実際に使っている secret 11件のうち
 * **台帳にあったのは3件だけ**で、主系を止める鍵（GH_PAT）が入っていなかった。
 * つまり最後の手段が指す先が空だった。**平常時には何の症状も出ない穴。**
 *
 * だから見るのは、期限（それは check-expiry.mjs の仕事）ではなく次の4つ:
 *   1. ワークフローが読む secret が全部台帳にあるか（新しい経路が増えたときに漏れる）
 *   2. 鍵ごとに**失効のさせ方**と**失効させると何が止まるか**が書いてあるか
 *   3. 経路（emergency-stop.json の agents）ごとに、止められる鍵が1つ以上あるか
 *   4. 「自動運転を止める」と名乗る鍵が実在するか
 *
 * 【renewal と revocation は別物】
 * 更新手順があることは、失効手順があることを意味しない。急いでいるときに
 * 「どこを押せば止まるか」が書いていない台帳は、読む時間のほうが長くなる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRED_PATH = path.join(ROOT, 'data/credential-expiry.json');
const STOP_PATH = path.join(ROOT, 'data/emergency-stop.json');
const WF_DIRS = [
  path.join(ROOT, '.github/workflows'),
  path.join(ROOT, '../simplememo-ios/.github/workflows'),
  path.join(ROOT, '../simplememo-api/.github/workflows'),
];

/** ワークフローが実際に読んでいる secret 名を集める。台帳ではなく**現物**から。 */
export function secretsInUse(dirs = WF_DIRS) {
  const found = new Map(); // name -> [file]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
        const list = found.get(m[1]) || [];
        if (!list.includes(f)) list.push(f);
        found.set(m[1], list);
      }
    }
  }
  return found;
}

/** 台帳が申告している secret 名（1件が複数を束ねることがある）。 */
export function declaredSecrets(doc) {
  const out = new Map();
  for (const c of doc.credentials || []) {
    for (const name of String(c.secret || '').split('/').map((s) => s.trim()).filter(Boolean)) {
      out.set(name, c.id);
    }
  }
  return out;
}

export function validate(doc, stopDoc, inUse) {
  const problems = [];
  const declared = declaredSecrets(doc);
  const exempt = Object.keys(doc.$exempt_secrets || {});

  // 1. 現物にあって台帳に無い secret
  for (const [name, files] of inUse) {
    if (exempt.includes(name) || declared.has(name)) continue;
    problems.push(`secret ${name} をワークフローが読んでいるのに台帳に無い（${files.join(', ')}）`
      + ' — **止めたいときに、その鍵の存在に気づけない**');
  }
  // 台帳にあって現物に無いものは落とさない（Workers の secret など、
  // ワークフロー以外から使う鍵が正当に存在する）。ただし数えて出す。

  // 2. 失効手順と影響範囲
  for (const c of doc.credentials || []) {
    if (!c.revocation) {
      problems.push(`${c.id}: revocation が無い — 更新手順（renewal）は失効手順ではない`);
    }
    if (!c.blast_radius) {
      problems.push(`${c.id}: blast_radius が無い — **止める前に何が止まるかを読めない台帳は、急いでいるときに読まれない**`);
    }
    for (const a of c.agents || []) {
      if (!stopDoc.agents?.[a]) {
        problems.push(`${c.id}: 経路 "${a}" が emergency-stop.json に無い — 台帳どうしが食い違っている`);
      }
    }
  }

  // 3. 経路ごとに止められる鍵があるか
  const routes = Object.keys(stopDoc.agents || {}).filter((k) => !k.startsWith('$'));
  for (const r of routes) {
    const keys = (doc.credentials || []).filter((c) => (c.agents || []).includes(r));
    if (!keys.length) {
      problems.push(`経路 "${r}" を止められる鍵が台帳に1つも無い`
        + ' — 判定が壊れているときの最後の手段が、この経路には存在しないことになる');
    }
  }

  // 4. 「自動運転を止める」と名乗る鍵が実在するか
  const stoppers = (doc.credentials || []).filter((c) => c.revoke_stops_automation);
  if (!stoppers.length) {
    problems.push('revoke_stops_automation の鍵が1件も無い'
      + ' — 緊急停止の台帳が書いている**最後の手段が指す先が空**');
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const stopDoc = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
  const inUse = secretsInUse();

  const stopAt = process.argv.indexOf('--stop');
  if (stopAt !== -1) {
    const route = process.argv[stopAt + 1];
    const keys = doc.credentials.filter((c) => (c.agents || []).includes(route));
    if (!keys.length) { console.error(`経路 "${route}" を止められる鍵が台帳に無い`); process.exit(1); }
    console.log(`経路 "${route}" を止める鍵:\n`);
    for (const c of keys) {
      console.log(`  ${c.label}${c.secret ? `（${c.secret}）` : ''}`);
      console.log(`    失効: ${c.revocation}`);
      console.log(`    影響: ${c.blast_radius}\n`);
    }
    console.log('**これは最後の手段。**まず data/emergency-stop.json を立てるほうが速く、意図が残る。');
    process.exit(0);
  }

  const problems = validate(doc, stopDoc, inUse);
  const declared = declaredSecrets(doc);
  console.log('資格情報 — 権限・経路・失効手順\n');
  console.log(`  ワークフローが読む secret ${inUse.size}件 / 台帳が申告 ${declared.size}件`
    + ` / 対象外 ${Object.keys(doc.$exempt_secrets || {}).length}件\n`);
  for (const c of doc.credentials) {
    const routes = (c.agents || []).length ? (c.agents || []).join(',') : '—';
    const stops = c.revoke_stops_automation ? ' ⛔止まる' : '';
    console.log(`  ${c.critical ? '★' : ' '} ${c.id.padEnd(28)} 経路:${routes}${stops}`);
  }
  console.log('\n  自動運転を止められる鍵:');
  for (const c of doc.credentials.filter((x) => x.revoke_stops_automation)) {
    console.log(`    ${c.label} — ${c.blast_radius}`);
  }
  console.log('\n  経路ごとに `--stop <経路>` で失効手順が出る。');
  console.log('  **ただし最後の手段。**緊急停止の台帳を立てるほうが速く、意図が残る。');

  if (problems.length) {
    console.error('\n資格情報の台帳: 穴');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n止めたい経路ごとに、失効させる鍵が名指しできる。');
}
