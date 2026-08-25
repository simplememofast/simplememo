#!/usr/bin/env node
/**
 * 運営記憶 — **1つの改善を、最初から最後まで追える形になっているか。**
 *
 *   node scripts/check-memory.mjs          # 一覧
 *   node scripts/check-memory.mjs --check  # CI
 *   node scripts/check-memory.mjs --open   # 結果待ちのものだけ
 *
 * 【なぜ作るか】
 * 2026-08-25 の自己採点で、条件⑥（成否を次回の判断へ残す）が最大の欠落だった。
 * 記録は揃っていたが**連結していなかった** —— 実験台帳には判定（decision）まで
 * 在るのに、**learning に相当する列が1つも無い。**評価済み12件のうち7件が
 * inconclusive のまま、次に何を変えるかがどこにも書かれていなかった。
 *
 * 【この検査が守る4つ】
 *
 * 1. **写さない。指す。**signal.ref は既存台帳のエントリを指し、値を写さない。
 *    写すと必ずずれる —— それが 2026-08-25 に3回起きたことそのもの。
 *
 * 2. **順序を守る。**outcome が無いのに verdict は書けない。
 *    verdict が無いのに learning は書けない。
 *    **結果が出る前に「学んだこと」を書けるなら、それは学びではなく感想。**
 *
 * 3. **learning は必ず何かを変えるか、変えない理由を持つ。**
 *    policy_change か no_policy_change_reason のどちらかが要る。
 *    **どちらも無い learning は「気をつける」と同じで、次に何も起きない。**
 *
 * 4. **追記のみ。**連番が飛んだら落ちる。
 *    都合の悪い記憶を消せる記憶は、記憶ではない。
 *
 * 【落とさないもの】
 * **open（結果待ち）では落とさない。**結果が出ていないのに埋めさせると、
 * 推測が記憶に混ざる。undetermined / measurement_failed も落とさない ——
 * 「判定していない」を「異常なし」と書かないのと同じで、
 * **分からなかったことは分からなかったと残すのが正しい。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEMORY_PATH = path.join(ROOT, 'data/operating-memory.json');

export const VERDICTS = ['improved', 'worsened', 'no_change', 'undetermined', 'measurement_failed'];
export const STATUSES = ['open', 'closed'];

/**
 * `台帳.json#seq=1` / `台帳.json#id` / 素のパス を解決する。
 * **指した先が実在することまで見る** —— 参照が解決しない記憶は、
 * 書いた本人にしか読めない。
 */
export function resolveRef(ref, { root = ROOT } = {}) {
  if (typeof ref !== 'string' || !ref) return { ok: false, why: 'ref が空' };
  const [rawPath, anchor] = ref.split('#');
  const candidates = [rawPath, `data/${rawPath}`];
  const found = candidates.find((c) => fs.existsSync(path.join(root, c)));
  if (!found) return { ok: false, why: `"${rawPath}" が存在しない` };
  if (!anchor) return { ok: true };

  let doc;
  try { doc = JSON.parse(fs.readFileSync(path.join(root, found), 'utf8')); }
  catch { return { ok: false, why: `"${found}" を読めない` }; }

  const [key, value] = anchor.includes('=') ? anchor.split('=') : ['id', anchor];
  // **`$` で始まるキーは注釈。**ここを除かないと `$comment`（説明文の配列）を
  // レコード配列と取り違える。最初の実装で実際にそうなり、
  // 実在する seq=1 を「無い」と報告した。
  const rows = Object.entries(doc)
    .filter(([k, v]) => !k.startsWith('$') && Array.isArray(v))
    .map(([, v]) => v)
    .find((v) => v.some((x) => x && typeof x === 'object')) ?? [];
  const hit = rows.some((r) => String(r?.[key]) === value);
  return hit ? { ok: true } : { ok: false, why: `"${found}" に ${key}=${value} が無い` };
}

export function validate(doc, { resolve = resolveRef } = {}) {
  const problems = [];
  const records = doc.records ?? [];
  if (!records.length) return ['records が空'];

  records.forEach((r, i) => {
    const at = `records[seq=${r.seq ?? '?'}]`;
    // 追記のみ。連番が飛んだら落とす
    if (r.seq !== i + 1) problems.push(`${at}: 連番が飛んでいる（${i + 1}番目が seq=${r.seq}）`);
    if (!STATUSES.includes(r.status)) problems.push(`${at}: status が未定義の値`);
    if (!r.signal?.what) problems.push(`${at}: signal.what が無い`);
    if (!r.hypothesis) problems.push(`${at}: hypothesis が無い`);
    if (!r.decision) problems.push(`${at}: decision が無い`);

    // **写さない。指す。**参照が解決しない記憶は、書いた本人にしか読めない
    if (r.signal?.ref) {
      const res = resolve(r.signal.ref);
      if (!res.ok) problems.push(`${at}: signal.ref が解決しない — ${res.why}`);
    }
    for (const f of r.execution?.refs ?? []) {
      const res = resolve(f);
      if (!res.ok) problems.push(`${at}: execution.refs が解決しない — ${res.why}`);
    }
    for (const f of r.policy_change?.refs ?? []) {
      const res = resolve(f);
      if (!res.ok) problems.push(`${at}: policy_change.refs が解決しない — ${res.why}`);
    }

    // **順序。**結果が出る前に学びは書けない
    if (r.verdict && !r.outcome) {
      problems.push(`${at}: outcome が無いのに verdict がある`
        + ' — **結果を測る前に判定できない**');
    }
    if (r.learning && !r.verdict) {
      problems.push(`${at}: verdict が無いのに learning がある`
        + ' — **判定する前の「学び」は感想**');
    }
    if (r.verdict && !VERDICTS.includes(r.verdict)) {
      problems.push(`${at}: verdict が未定義の値（${VERDICTS.join(' | ')}）`);
    }

    // **learning は必ず何かを変えるか、変えない理由を持つ**
    if (r.learning && !r.policy_change && !r.no_policy_change_reason) {
      problems.push(`${at}: learning があるのに policy_change も no_policy_change_reason も無い`
        + ' — **どちらも無い learning は「気をつける」と同じで、次に何も起きない**');
    }

    // closed は最後まで書けている。open は書けていなくてよい
    if (r.status === 'closed') {
      for (const k of ['execution', 'outcome', 'verdict', 'learning']) {
        if (!r[k]) problems.push(`${at}: closed なのに ${k} が無い`);
      }
    }
  });

  if (doc.next_seq !== records.length + 1) {
    problems.push(`next_seq=${doc.next_seq} が記録数 ${records.length} と合わない`);
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
  const problems = validate(doc);
  const records = doc.records ?? [];
  const closed = records.filter((r) => r.status === 'closed');
  const open = records.filter((r) => r.status === 'open');
  const changed = closed.filter((r) => r.policy_change);

  console.log('運営記憶 — 1つの改善を最初から最後まで\n');
  console.log(`  記録 ${records.length}件（完了 ${closed.length} / 結果待ち ${open.length}）`);
  console.log(`  **規則そのものを変えたもの: ${changed.length}件**`);
  const byVerdict = {};
  for (const r of closed) byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;
  if (closed.length) console.log(`  判定: ${Object.entries(byVerdict).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
  console.log('');

  const show = argv.includes('--open') ? open : records;
  for (const r of show) {
    console.log(`  ${r.status === 'closed' ? '●' : '○'} seq=${r.seq}  ${r.signal.what.slice(0, 60)}`);
    if (r.verdict) console.log(`      判定: ${r.verdict}`);
    if (r.learning) console.log(`      学び: ${r.learning.replace(/\*\*/g, '').slice(0, 100)}`);
    if (r.policy_change) console.log(`      変えたもの: ${r.policy_change.what.slice(0, 80)}`);
    if (r.status === 'open') console.log('      **結果待ち。**推測で埋めない');
    console.log('');
  }

  if (!argv.includes('--check')) {
    console.log('  **open では落とさない。**結果が出ていないのに埋めさせると、推測が記憶に混ざる。');
    console.log('  undetermined / measurement_failed も落とさない — 分からなかったことは、そう残す。');
  }

  if (problems.length) {
    console.error(`\n運営記憶: 問題 ${problems.length}件`);
    for (const p of problems) console.error(`  - ${p}`);
    if (argv.includes('--check')) process.exit(1);
  } else {
    console.log('\n運営記憶: OK');
  }
}
