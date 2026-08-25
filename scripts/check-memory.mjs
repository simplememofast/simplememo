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

/**
 * **記録があるべき改善のうち、記録されていないものを数える。**
 *
 * 記憶が在ることと、記憶が網羅していることは別。
 * 4件書いた時点で「⑥は満たした」と言えてしまうと、**残り15件が消える。**
 *
 * 【何を「記録があるべき」とするか】
 * **出荷を全部対象にしない。**毎日の記事1本ごとに Signal→Learning を書かせると、
 * 「気をつける」で埋まった台帳ができる。**形だけの記憶は、無い記憶より悪い**
 * （在ることになってしまうので）。対象は、**それ自体が1つの学びである出来事**だけ:
 *
 *   監査の所見     … 信号から規則の変更まで揃っている。**必ず書ける**
 *   評価済みの実験 … 判定まで出ている。**learning だけが欠けている**
 *   自己修理       … 故障を検知して直した。何を学んだかが要る
 *
 * 【落とし方を分ける】
 * 所見だけを落とす。**残り2種は報告に留める。**
 * 理由は、実験12件と修理4件の learning を書くには実際に読み直す作業が要り、
 * ここで落とすと**CIが赤で固定される。**この運営には 2026-08-22〜24 に
 * CIが3日赤で固定され、auto-merge が止まってデプロイごと止まった前例がある。
 * **赤で固定された検査は、やがて外される。**
 */
export function coverage({ memory, findings, experiments, runs }) {
  const refs = new Set((memory.records ?? []).map((r) => r.signal?.ref).filter(Boolean));
  const covered = (ref) => refs.has(ref);

  const required = [];
  for (const f of findings.findings ?? []) {
    required.push({ kind: 'finding', id: `seq=${f.seq}`, ref: `audit-findings.json#seq=${f.seq}`, blocking: true });
  }
  for (const e of (experiments.experiments ?? []).filter((x) => x.status === 'evaluated')) {
    // **二度と学べない実験がある。**変更前を記録しないまま変えた実験は、
    // 評価日が来ても仮説の可否が出ない（2026-07のバッチ7件）。
    // これを「未記録」に混ぜると、網羅率に**永久に埋まらない床**ができて、
    // やがて「どうせ上がらない数字」として読まれなくなる。
    // かといって seq=4 で7件まとめて covered にするのは違う ——
    // seq=4 が残したのは**測り方についての学び**であって、
    // 「その改題がCTRを上げたか」は今も分からないし、これからも分からない。
    // なので covered にはせず、**学べない件として別に数えて理由を書く。**
    //
    // **どの設計が baseline を要求していたかで判定する。**
    // 「inconclusive かつ baseline 無し」だけで貼ると広すぎる ——
    // holdout は同時期の対照群と比べる設計なので、そもそも変更前を要らない。
    // その holdout が inconclusive になったのは母数不足など**別の理由**で、
    // 「変更前が無いから永久に出ない」は**その実験については嘘**になる。
    //
    // 貼るのは、変更前が要る設計だったのに無い2通りだけ:
    //   control.kind === 'pre_post'  … 前と後を比べると宣言している
    //   control 欄が無い             … 2026-07のバッチはこの形（比較設計を書く規則より前）
    // **この2通りはどちらも、いまは open にできない。**
    //   前者 growth/lib/ledger.mjs の pre_post↔baseline 規則（2026-08-25）
    //   後者 同ファイルの control.kind 必須規則（2026-08-22）
    // evaluated には open を経ずに到達できないので、**この床はこれ以上伸びない。**
    // 伸びたとしたらどちらかの規則が外れたということで、そのときは
    // check-authority.mjs の逆向き突き合わせが検査の消失として鳴る。
    const b = e.baseline;
    const hasValue = b && Object.entries(b).some(([k, v]) => k !== 'note' && v !== null && v !== undefined);
    const neededBaseline = e.control?.kind === 'pre_post' || !e.control?.kind;
    const unlearnable = e.decision === 'inconclusive' && !hasValue && neededBaseline;
    required.push({
      kind: 'experiment', id: e.id, ref: `growth/experiments/experiments.json#id=${e.id}`,
      blocking: false, unlearnable,
      ...(unlearnable ? { unlearnable_reason: '変更前を要る設計なのに記録が無く、仮説の可否は永久に出ない' } : {}),
    });
  }
  for (const r of (runs.runs ?? []).filter((x) => x.repair_of)) {
    required.push({ kind: 'repair', id: r.run_id, ref: `autopilot-runs.json#run_id=${r.run_id}`, blocking: false });
  }

  const missing = required.filter((r) => !covered(r.ref));
  const unlearnable = missing.filter((r) => r.unlearnable);
  const reachable = required.length - unlearnable.length;
  return {
    required, missing, unlearnable,
    blocking: missing.filter((r) => r.blocking),
    // **生の網羅率を主にする。**到達可能ぶんの率（reachable_rate）は
    // 必ず見栄えが良くなるほうなので、単独では出さない。
    rate: required.length ? (required.length - missing.length) / required.length : null,
    reachable_rate: reachable ? (reachable - (missing.length - unlearnable.length)) / reachable : null,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const doc = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));

  if (argv.includes('--coverage')) {
    const r = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    const cov = coverage({
      memory: doc,
      findings: r('data/audit-findings.json'),
      experiments: r('growth/experiments/experiments.json'),
      runs: r('data/autopilot-runs.json'),
    });
    const pct = cov.rate === null ? 'n/a' : `${(cov.rate * 100).toFixed(1)}%`;
    console.log('運営記憶の網羅 — **記録があるべき改善のうち、書かれているもの**\n');
    console.log(`  ${cov.required.length - cov.missing.length} / ${cov.required.length} 件  = **${pct}**\n`);
    const byKind = {};
    for (const m of cov.missing) (byKind[m.kind] ??= []).push(m.id);
    for (const [kind, ids] of Object.entries(byKind)) {
      const label = { finding: '監査の所見', experiment: '評価済みの実験', repair: '自己修理' }[kind] ?? kind;
      console.log(`  記録が無い ${label}: ${ids.length}件`);
      console.log(`    ${ids.slice(0, 6).join(' , ')}${ids.length > 6 ? ' …' : ''}`);
    }

    if (cov.unlearnable.length) {
      const rpct = cov.reachable_rate === null ? 'n/a' : `${(cov.reachable_rate * 100).toFixed(1)}%`;
      const reachable = cov.required.length - cov.unlearnable.length;
      console.log(`\n  うち **${cov.unlearnable.length}件は書けない** — ${cov.unlearnable[0].unlearnable_reason}`);
      console.log(`    ${cov.unlearnable.map((u) => u.id).slice(0, 8).join(' , ')}`);
      console.log(`    **この分は永久に埋まらない。**混ぜたままにすると、上がらない床を持つ数字になり、`);
      console.log(`    やがて「どうせ動かない指標」として読まれなくなるので、分けて出す。`);
      console.log(`    到達可能ぶんだけなら ${cov.required.length - cov.missing.length} / ${reachable} 件 = ${rpct}`);
      console.log(`    （**こちらは必ず見栄えが良くなる数字なので、単独では出さない。**上の生の率が主）`);
      console.log(`    **床はこれ以上伸びない** — この形は2通りしか無く、どちらも open にできない:`);
      console.log(`      pre_post なのに baseline 無し … growth/lib/ledger.mjs（2026-08-25）`);
      console.log(`      control 欄が無い              … 同ファイルの control.kind 必須（2026-08-22）`);
    }
    console.log('\n  **出荷を全部対象にしていない。**毎日の記事ごとに書かせると');
    console.log('  「気をつける」で埋まった台帳ができる。形だけの記憶は、無い記憶より悪い。');
    console.log('  落とすのは所見だけ — 実験と修理は読み直す作業が要るので報告に留める');
    console.log('  （**赤で固定された検査は、やがて外される**）。');

    if (cov.blocking.length) {
      console.error(`\n運営記憶の網羅: 所見 ${cov.blocking.length}件に記録が無い`);
      for (const b of cov.blocking) console.error(`  - ${b.ref}`);
      if (argv.includes('--check')) process.exit(1);
    } else {
      console.log('\n運営記憶の網羅: 所見はすべて記録されている（実験と修理は上のとおり未記録）');
    }
    process.exit(0);
  }

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
