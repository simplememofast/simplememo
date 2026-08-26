#!/usr/bin/env node
/**
 * **止める仕組みが、実際に止まることを確かめた記録。**
 *
 *   node scripts/check-stop-drills.mjs           # 表示
 *   node scripts/check-stop-drills.mjs --check   # CI
 *   node scripts/check-stop-drills.mjs --selftest
 *
 * 【なぜ要るか — 2026-08-26】
 * ④自動本番デプロイは 53.3% で止まっていて、**残る非ゲート行はすべて意図的な境界**
 * だった（提出・実機確認・公開・kill・タグ作成）。executor を動かして率を上げるには
 * 境界を渡すしかなく、それは numbers.md が警告している行為そのもの。
 * **率を上げられない領域で、上げずに強くできるところを探した。**
 *
 * 台帳の note には既にこう書いてあった:
 *   - 「Crash-free率・送信成功率による自動停止 … **本番でまだ1回も発火していない**」
 *   - 「Remote Kill Switch … **本番で kill を1回も通していない**
 *      （止まることを確かめていない停止機構は無いのと同じ）。**次に確かめるべきはこれ**」
 *
 * つまり台帳自身が次の一手を名指ししていた。**散文で。**
 * このリポジトリは `prose-does-not-stop-an-agent` を学びとして持っているので、
 * 散文のままにせず、**数えられる形**にする。
 *
 * 【この検査が守ること】
 *   1. 止める仕組みを**全部列挙**し、それぞれの証跡ファイルが実在すること
 *   2. **訓練には「何を観測したか」が要る。**「実行した」だけの記録は落とす
 *   3. **production を名乗るには、その日付と観測が要る。**単体テストからは昇格できない
 *   4. production に届いていない仕組みには、**なぜ届いていないか**が要る
 *      （「まだ」と書いて終わりにさせない）
 *   5. 「本番で止まることを確かめた件数」が宣言と一致すること
 *      —— **公開文へこの数を書いたあと、実態とずれるのを防ぐ**
 *
 * 【この検査がやらないこと】
 * 訓練を促さない。訓練するかどうかは**止める対象が本番にあるか**で決まり、
 * それは人の判断（本番で kill を引けば利用者に影響が出る）。
 * ここが持つのは「確かめていない」を「確かめた」に見せない、という一点だけ。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/stop-drills.json');

/**
 * 確かめ方の段階。**上へ行くほど「実際に止まった」に近い。**
 * 単体テストと本番を同じ語で呼ばないためだけに、この語彙がある。
 */
export const LEVELS = ['static', 'unit', 'local', 'production'];
export const LEVEL_RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));

/** 証跡パスが実在するか。**隣のリポジトリは、見えるときだけ確かめる。** */
export function evidenceChecker(root = ROOT) {
  return (p) => {
    if (p.startsWith('../')) {
      // 隣のリポジトリ。CI からは見えないので、**見えないときは確かめない**
      // （確かめられないものを、確かめたことにしない）。
      // ローカルでは見えるので、そのときは実際に確かめる —— 名前を変えたのに
      // 台帳が古いまま、を手元で拾える。
      const sibling = path.join(root, p.split('/').slice(0, 2).join('/'));
      if (!fs.existsSync(sibling)) return null; // 判定していない
      return fs.existsSync(path.join(root, p));
    }
    return fs.existsSync(path.join(root, p));
  };
}

/** 仕組みごとの、到達している最高段階。訓練が1つも無ければ null。 */
export function highestLevel(m) {
  const ranks = (m.drills || [])
    .map((d) => LEVEL_RANK[d.level])
    .filter((r) => r !== undefined);
  if (!ranks.length) return null;
  return LEVELS[Math.max(...ranks)];
}

export function validate(doc, { exists = evidenceChecker() } = {}) {
  const problems = [];
  const unchecked = [];
  if (!doc || !Array.isArray(doc.mechanisms)) return { problems: ['mechanisms must be an array'], unchecked };

  const seen = new Set();
  doc.mechanisms.forEach((m, i) => {
    const at = `mechanisms[${i}]「${m.id ?? '?'}」`;
    if (!m.id) problems.push(`${at}: id が無い`);
    if (seen.has(m.id)) problems.push(`${at}: id が重複している`);
    seen.add(m.id);
    if (!m.stops) problems.push(`${at}: stops が無い — **何が止まるのかを書く**`);
    if (!m.how_to_drill) problems.push(`${at}: how_to_drill が無い — 手順の無い訓練は再現できない`);

    if (!Array.isArray(m.evidence) || m.evidence.length === 0) {
      problems.push(`${at}: evidence が空 — **実装の在処なしに「止める仕組みがある」と数えない**`);
    } else {
      for (const f of m.evidence) {
        const r = exists(f);
        if (r === null) unchecked.push(`${m.id}: ${f}`);
        else if (!r) problems.push(`${at}: evidence "${f}" が存在しない`);
      }
    }

    for (const [j, d] of (m.drills || []).entries()) {
      const dat = `${at}.drills[${j}]`;
      if (!LEVELS.includes(d.level)) {
        problems.push(`${dat}: level は ${LEVELS.join('|')} のいずれか（got ${JSON.stringify(d.level)}）`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.at || '')) problems.push(`${dat}: at が YYYY-MM-DD でない`);
      // **「実行した」だけの記録を残さない。**何が起きたかが書いていなければ、
      // あとから読む人には「動いたらしい」以上のことが分からない。
      if (!d.observed || String(d.observed).trim().length < 10) {
        problems.push(`${dat}: observed が無い（または短すぎる）`
          + ' — **何を観測したかを書く。**「実行した」は観測ではない');
      }
      if (d.level === 'local' || d.level === 'production') {
        if (!d.command && !d.where) {
          problems.push(`${dat}: level=${d.level} なら command か where が要る`
            + ' — **どこで何を通したかが無いと、再現も反証もできない**');
        }
      }
    }

    const top = highestLevel(m);
    if (top === 'production') {
      if (m.blocked_by) problems.push(`${at}: production まで来ているのに blocked_by が残っている`);
    } else if (!m.blocked_by) {
      // **「まだ」で終わらせない。**止められない理由は、たいてい設計の情報を含む
      // （例: 段階公開中のフラグがゼロなので、発火する対象そのものが無い）。
      problems.push(`${at}: production に届いていないのに blocked_by が無い`
        + ' — **なぜ確かめられないのかを書く。**「まだ」は理由ではない');
    }
  });

  return { problems, unchecked };
}

/** 段階ごとの件数。**production の件数が、この台帳の本体。** */
export function tally(doc) {
  const counts = Object.fromEntries([...LEVELS, 'none'].map((l) => [l, 0]));
  for (const m of doc.mechanisms || []) counts[highestLevel(m) ?? 'none'] += 1;
  return { total: (doc.mechanisms || []).length, counts, production: counts.production };
}

/**
 * 宣言と実測を突き合わせる。**宣言が無いときは「合っている」ではない。**
 *
 * [2026-08-26] ここは `doc.production_verified !== undefined && ...` と書かれていて、
 * **宣言の鍵を消すとこの規則は一度も発火しなかった。**実測した:
 *
 *   宣言 2（実測どおり）    → 0件
 *   宣言 99（実測とずれる） → 捕まる
 *   **宣言の鍵を消す**      → **検出なし**
 *
 * この台帳の $production_verified には「公開文にこの数を書くなら、ここが正」と
 * 書いてある。**正を消せば突き合わせも消える**のでは、正の意味が無い。
 * #635 の `READY !== undefined &&` と同じ形。
 */
export function declarationProblem(declared, measured) {
  if (declared === undefined || declared === null) {
    return `production_verified の宣言が無い — **公開文に書く数の正が消える。**`
      + `実測は ${measured} 件`;
  }
  if (declared !== measured) {
    return `production_verified の宣言 ${declared} が実測 ${measured} と違う`;
  }
  return null;
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };
  const yes = () => true;

  const mech = (over = {}) => ({
    id: 'x', stops: '何か', how_to_drill: '手順', evidence: ['a'],
    blocked_by: '理由', drills: [], ...over,
  });
  const doc = (m) => ({ mechanisms: [m] });
  const P = (m) => validate(doc(m), { exists: yes }).problems;

  t('形が揃っていれば通る', P(mech()).length === 0);
  t('**実装の在処が無ければ落とす**', P(mech({ evidence: [] })).some((p) => p.includes('evidence')));
  t('何が止まるのかが無ければ落とす', P(mech({ stops: null })).some((p) => p.includes('stops')));
  t('手順が無ければ落とす', P(mech({ how_to_drill: null })).some((p) => p.includes('how_to_drill')));
  t('証跡が実在しなければ落とす',
    validate(doc(mech()), { exists: () => false }).problems.some((p) => p.includes('存在しない')));
  t('隣のリポジトリが見えなければ「判定していない」に入れる（落とさない）',
    (() => { const r = validate(doc(mech({ evidence: ['../x/y'] })), { exists: () => null });
      return r.problems.length === 0 && r.unchecked.length === 1; })());

  const drill = (o = {}) => ({ at: '2026-08-26', level: 'local', observed: '止まって exit 1 になった', command: 'x', ...o });
  t('訓練の形が揃っていれば通る',
    P(mech({ drills: [drill()], blocked_by: '理由' })).length === 0);
  t('**「実行した」だけの記録は落とす**',
    P(mech({ drills: [drill({ observed: '実行した' })] })).some((p) => p.includes('観測ではない')));
  t('観測が空でも落とす', P(mech({ drills: [drill({ observed: '' })] })).some((p) => p.includes('observed')));
  t('日付の形を強制する', P(mech({ drills: [drill({ at: '8/26' })] })).some((p) => p.includes('at が')));
  t('知らない段階は落とす', P(mech({ drills: [drill({ level: 'たぶん' })] })).some((p) => p.includes('level は')));
  t('local / production はどこで通したかが要る',
    P(mech({ drills: [drill({ command: undefined })] })).some((p) => p.includes('再現も反証もできない')));
  t('unit は command を求めない',
    P(mech({ drills: [drill({ level: 'unit', command: undefined })] })).length === 0);

  t('**production に届いていないのに理由が無ければ落とす**',
    P(mech({ blocked_by: null })).some((p) => p.includes('「まだ」は理由ではない')));
  t('production まで来たら理由は残さない',
    P(mech({ drills: [drill({ level: 'production' })], blocked_by: '残骸' }))
      .some((p) => p.includes('blocked_by が残っている')));
  t('production まで来て理由が無ければ通る',
    P(mech({ drills: [drill({ level: 'production' })], blocked_by: null })).length === 0);

  t('最高段階は一番上を採る（unit と local があれば local）',
    highestLevel({ drills: [{ level: 'unit' }, { level: 'local' }] }) === 'local');
  t('訓練が無ければ null（**0 ではない**）', highestLevel({ drills: [] }) === null);

  const counted = tally({ mechanisms: [
    { drills: [{ level: 'production' }] }, { drills: [{ level: 'local' }] },
    { drills: [{ level: 'unit' }] }, { drills: [] },
  ] });
  t('段階ごとに数える', counted.total === 4 && counted.production === 1 && counted.counts.none === 1);
  t('**確かめていないものを unit に混ぜない**', counted.counts.unit === 1);

  // [2026-08-26] **宣言が無いと突き合わせが消える形**を固定する。
  t('宣言が実測と合っていれば通る', declarationProblem(2, 2) === null);
  t('宣言が実測とずれれば落ちる', (declarationProblem(99, 2) || '').includes('と違う'));
  t('**宣言が無いのを「合っている」と読まない**',
    (declarationProblem(undefined, 2) || '').includes('正が消える'));
  t('null も同じ（未記入と欠測を分けない）',
    (declarationProblem(null, 2) || '').includes('正が消える'));

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  const { problems, unchecked } = validate(doc);
  const s = tally(doc);

  console.log(`止める仕組み ${s.total} 件 — **本番で止まることを確かめたのは ${s.production} 件**\n`);
  for (const m of doc.mechanisms) {
    const top = highestLevel(m);
    const mark = top === 'production' ? '本番で確認' : top ? `${top} まで` : '**未確認**';
    console.log(`  [${mark}] ${m.id} — ${m.stops}`);
    const last = (m.drills || [])[m.drills.length - 1];
    if (last) console.log(`      直近: ${last.at} ${last.level} — ${last.observed}`);
    if (m.blocked_by) console.log(`      本番で確かめられない理由: ${m.blocked_by}`);
  }

  console.log(`\n  段階: ${LEVELS.map((l) => `${l} ${s.counts[l]}`).join(' / ')} / 未確認 ${s.counts.none}`);
  console.log('  **「実装した」と「止まることを確かめた」を同じ語で呼ばない。**');
  if (unchecked.length) {
    console.log(`\n  この実行から確かめられなかった証跡 ${unchecked.length} 件（隣のリポジトリ）:`);
    for (const u of unchecked.slice(0, 8)) console.log(`    ${u}`);
    console.log('  **確かめられなかったことを「在る」と書かない。**');
  }

  // 宣言との突き合わせ。**公開文へ数を書いたあと、実態とずれるのを防ぐ。**
  const dp = declarationProblem(doc.production_verified, s.production);
  if (dp) problems.push(dp);

  if (problems.length) {
    console.error('\n停止機構の訓練: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n列挙・証跡・訓練の記録に問題なし。');
}
