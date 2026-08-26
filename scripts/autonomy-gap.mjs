#!/usr/bin/env node
/**
 * 自律度の到達可能上限 — 「61.3% を 95% にする」が何を要求するかを機械が出す。
 *
 *   node scripts/autonomy-gap.mjs            # 現在値・上限・95%に要る譲渡の内訳
 *   node scripts/autonomy-gap.mjs --json     # 機械可読
 *   node scripts/autonomy-gap.mjs --target 95
 *   node scripts/autonomy-gap.mjs --plan --target 70   # 目標までの最短路
 *   node scripts/autonomy-gap.mjs --check    # CI: 分類の網羅・登録語・算数の一致
 *   node scripts/autonomy-gap.mjs --selftest # 検査そのものの自己検査（台帳を読まない）
 *
 * 【なぜ要るか】
 * `automation-rate.mjs` は「いま何%か」を出すが、**その先に何があるかを言わない。**
 * 総合自動化率 61.3% は、放っておくと「あと 38.7% ぶん実装すれば埋まる」と読まれる。
 * 実際には、AIが実行していない 67 タスクのうち **実装量で解けるものは少数**で、
 * 残りは外部データ・鍵・検出力・そして**意図的に人へ残した境界**で止まっている。
 *
 * この差は数字を見ても分からない。**分からないまま目標値を置くと、
 * 達成する方法が「境界を渡す」しか無くなる。** それは安全装置を外すのと同じ意味で、
 * しかも数字の上では「自律度が上がった」としか見えない。
 * だからここは、**95% に届かせるには何を渡すことになるのかを、名指しで出す。**
 *
 * 【到達可能の定義】
 * reachable  … 実装・外部接続・書類の用意で AI 実行側へ動かせる
 * owner_only … **オーナーが権限表を書き換えない限り動かない**（policy_boundary）
 * never      … 物理・対人・法的責任、構造的に観測不能、検出力不足
 *
 * **owner_only と never を到達可能側に数えないこと。**
 * ここを混ぜると、この script は「頑張れば95%に行けます」と言う道具になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVERAGE_PATH, summarize } from './automation-rate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 実行していない理由の登録簿。**ここに無い値は --check が落とす。** */
export const BLOCKERS = {
  not_started:             { klass: 'reachable',  label: '着手していないだけ' },
  external_data:           { klass: 'reachable',  label: '外部データ待ち' },
  external_credential:     { klass: 'reachable',  label: '外部サービスの鍵・契約' },
  missing_source_document: { klass: 'reachable',  label: '対象の書類がリポジトリに無い' },
  approval_design_first:   { klass: 'reachable',  label: '承認境界の設計が先' },
  policy_boundary:         { klass: 'owner_only', label: '意図的に人へ残した境界' },
  physical_human:          { klass: 'never',      label: '物理・対人・法的責任' },
  human_consent:           { klass: 'never',      label: '人の同意・操作が要る（ブラウザ同意・鍵の再発行）' },
  structural:              { klass: 'never',      label: '構造的に観測できない' },
  statistical_power:       { klass: 'never',      label: '分母が足りず判定できない' },
};

const AI = new Set(['ai_autonomous', 'ai_executes_gated']);
const NON_AI = new Set(['nobody', 'ai_proposes', 'human_only']);

export function analyse(doc, { target = 0.95 } = {}) {
  const scored = doc.tasks.filter((t) => t.executor !== 'intentional_no');
  const denom = scored.length;
  const now = scored.filter((t) => AI.has(t.executor)).length;

  const bucket = { reachable: [], owner_only: [], never: [] };
  for (const t of scored) {
    if (AI.has(t.executor)) continue;
    const b = BLOCKERS[t.blocker];
    if (!b) continue; // --check が別に落とす
    bucket[b.klass].push(t);
  }

  const ceiling = now + bucket.reachable.length;
  const need = Math.ceil(target * denom);
  // 到達可能を全部埋めてなお足りないぶんは、境界を渡すことでしか埋まらない。
  const handover = Math.min(bucket.owner_only.length, Math.max(0, need - ceiling));
  // 境界を**全部**渡した場合の上限。ここを超える目標は、渡しても届かない。
  const ceilingWithHandover = ceiling + bucket.owner_only.length;
  const unreachable_by = Math.max(0, need - ceilingWithHandover);

  const byBlocker = {};
  for (const t of scored) {
    if (AI.has(t.executor)) continue;
    (byBlocker[t.blocker] ??= []).push(t);
  }

  return {
    denominator: denom,
    now,
    now_rate: now / denom,
    ceiling,
    ceiling_rate: ceiling / denom,
    ceiling_with_handover: ceilingWithHandover,
    ceiling_with_handover_rate: ceilingWithHandover / denom,
    target,
    need,
    handover_required: handover,
    unreachable_by,
    buckets: {
      reachable: bucket.reachable.length,
      owner_only: bucket.owner_only.length,
      never: bucket.never.length,
    },
    by_blocker: Object.fromEntries(
      Object.entries(byBlocker).map(([k, v]) => [k, v.length]),
    ),
    owner_only_tasks: bucket.owner_only.map((t) => ({ area: t.area, task: t.task, unblocked_by: t.unblocked_by })),
    never_tasks: bucket.never.map((t) => ({ area: t.area, task: t.task, unblocked_by: t.unblocked_by })),
    reachable_tasks: bucket.reachable.map((t) => ({
      area: t.area, task: t.task, blocker: t.blocker, unlock: t.unlock, unblocked_by: t.unblocked_by,
    })),
  };
}


/**
 * 解除条件の登録簿。**1タスク＝1作業ではない。**
 * ASCのレポートが降りれば4件が同時に動き、問い合わせの再現ファクトを1本出せば2件動く。
 * 個別に積むと順番を間違えるので、**解除する行為のほうを単位にする。**
 *
 *   kind … 誰が何をするか。--plan はこの順で安い順に並べる
 *          wait              … 待てば解ける（こちらの作業はゼロ）
 *          owner_input       … オーナーしか知らない事実・書類を入れる
 *          owner_decision    … 境界をどう引くかの判断。**決めないと実装しても数字は動かない**
 *          implement         … 実装量で解ける
 *          external_contract … 外部の鍵・契約が要る
 */
export const UNLOCKS = {
  asc_reports:       { kind: 'wait', label: 'App Store Connect の Analytics レポートが降りる',
                       needs: '現在0件。取得の配線は済んでいて、Apple側のレポート生成待ち' },
  bq_28d:            { kind: 'wait', label: 'BigQuery の28日蓄積が到達する',
                       needs: '9/6前後。D28が測れるようになる' },
  company_facts:     { kind: 'owner_input', label: '会社の基礎事実を台帳に入れる',
                       needs: '決算期・従業員の有無・課税事業者かどうかの3つ。**入れば申告期限は機械が出せる**' },
  contract_docs:     { kind: 'owner_input', label: '契約書・請求書をリポジトリに置く',
                       needs: '現在ゼロ。書面が無いと分類も照合も対象が存在しない' },
  corp_records:      { kind: 'owner_input', label: '議事録・株主名簿・事故記録の所在を決める',
                       needs: '「発生していない」のか「記録する場所が無い」のかが区別できていない' },
  reply_gate:        { kind: 'owner_decision', label: '返信文面の承認境界を決める',
                       needs: '**品質ゲート通過で自動投稿にするか、1件ずつ承認にするか。**'
                            + '後者を選ぶと ai_proposes 止まりで、実装しても総合自動化率は動かない' },
  refund_boundary:   { kind: 'owner_decision', label: '返金・チャージバックの承認境界を決める',
                       needs: '金銭が動く不可逆操作。**上限額を決めない限り自動側へ置けない**' },
  inquiry_facts:     { kind: 'implement', label: '問い合わせの再現ファクトを非個人情報として出す',
                       needs: '本文はD1にあり個人情報。端末・OS・版・エラー種別だけを取り出す経路を作る' },
  vendor_terms:      { kind: 'implement', label: '各社の規約本文を取り込んで条項検査に載せる',
                       needs: '書面契約は無く規約への同意で成立。現状40マスすべて unreviewed' },
  impl_product:      { kind: 'implement', label: 'プロダクト側を作る',
                       needs: 'PRDの定型化 / カナリアを本番で1周 / 課金失敗の回復 / 障害案内の一斉配信' },
  impl_backlog:      { kind: 'implement', label: 'バックログの作り方を直す',
                       needs: '**追加の候補しか持っていない。**減らす提案を採点対象に入れ、中期のロードマップを組み立てる経路を作る' },
  impl_measurement:  { kind: 'implement', label: 'North Star Metric を実測する',
                       needs: '定義は VISION にある。**無いのは観測** — Capture後にユーザーが直したかをアプリ側で計装する' },
  impl_qa:           { kind: 'implement', label: 'テストを減らす／直す経路を作る',
                       needs: '足す経路はあるが、flaky検出も未使用テストの検出も無い。放置すると「赤いのが普通」になる' },
  impl_seo:          { kind: 'implement', label: '検索意図の変化を時系列で見る',
                       needs: '材料は analyze.mjs にある（CTR gap）。**無いのは窓をまたいだ比較**で、decay と同じ問題' },
  impl_analog:       { kind: 'implement', label: 'アナログ領域の実行経路を作る', defer: true,
                       needs: 'イベント・人事・公的資金・営業・R&D。**業務そのものが今は無い**ので、'
                            + '数字のために作ると本末転倒になる。実需が出てから',
                       defer_why: '**件数が最大（5件）なので、安い順に並べると先頭に来てしまう。**'
                            + '従業員も営業活動も無い会社に採用パイプラインを作るのは、'
                            + '運営が良くなるからではなく分母の都合。**それを一番上に置く並びは間違い**なので後置する' },
  trend_source:      { kind: 'external_contract', label: '外部トレンドを取る経路',
                       needs: 'Googleトレンド/はてブ/ランキングの取得手段' },
  analytics_vendors: { kind: 'external_contract', label: 'ahrefs / AppsFlyer / Firebase / 生成AI検索',
                       needs: '鍵と契約' },
  bank_feed:         { kind: 'external_contract', label: '銀行・カードの明細連携',
                       needs: 'freee の読み取りは入ったが明細側が無い' },
};

/**
 * --plan の並び順。**「安い」の基準はオーナーの手数**であって、機械の作業量ではない。
 *
 * この運用の目的関数は「人間を日常作業のボトルネックから外す」ことなので、
 * **実装（機械がやる）より先にオーナー入力を置く並びは、目的と逆を向く。**
 * 実装7件でオーナー入力5件を肩代わりできるなら、そちらが安い。
 */
export const UNLOCK_ORDER = ['wait', 'implement', 'owner_decision', 'owner_input', 'external_contract'];

/** 目標まで、解除する行為を安い順に積む。 */
export function planTo(doc, target) {
  const a = analyse(doc, { target });
  const groups = new Map();
  for (const t of a.reachable_tasks) {
    const g = groups.get(t.unlock) ?? { id: t.unlock, tasks: [] };
    g.tasks.push(t); groups.set(t.unlock, g);
  }
  const ordered = [...groups.values()].sort((x, y) => {
    // defer は件数に関係なく最後。**数字のためだけに作る仕事を先頭に置かない。**
    const dx = UNLOCKS[x.id]?.defer ? 1 : 0, dy = UNLOCKS[y.id]?.defer ? 1 : 0;
    if (dx !== dy) return dx - dy;
    const kx = UNLOCK_ORDER.indexOf(UNLOCKS[x.id]?.kind), ky = UNLOCK_ORDER.indexOf(UNLOCKS[y.id]?.kind);
    return kx !== ky ? kx - ky : y.tasks.length - x.tasks.length;
  });
  let got = a.now; const steps = [];
  for (const g of ordered) {
    const done = got >= a.need;
    got += g.tasks.length;
    steps.push({ ...g, kind: UNLOCKS[g.id]?.kind, cumulative: got, rate: got / a.denominator, after_target: done });
  }
  return { ...a, steps };
}

/** 台帳を読まずに検査そのものを検査する（automation-rate.mjs / autopilot-runs.mjs と同じ作法）。 */
export function selftest() {
  const problems = [];
  const mk = (executor, blocker) => ({ area: '① 検査用', task: 't', executor, blocker, unblocked_by: 'u', evidence: [] });

  // 1. owner_only / never は到達可能側に数えない
  const a = analyse({ tasks: [mk('ai_autonomous'), mk('human_only', 'policy_boundary')] });
  if (a.ceiling !== 1) problems.push('policy_boundary を上限に数えている');
  const b = analyse({ tasks: [mk('ai_autonomous'), mk('nobody', 'physical_human')] });
  if (b.ceiling !== 1) problems.push('physical_human を上限に数えている');

  // 2. reachable は上限に数える
  const c = analyse({ tasks: [mk('ai_autonomous'), mk('nobody', 'not_started')] });
  if (c.ceiling !== 2) problems.push('not_started を上限に数えていない');

  // 3. intentional_no は分母から外れる
  const d = analyse({ tasks: [mk('ai_autonomous'), mk('intentional_no')] });
  if (d.denominator !== 1) problems.push('intentional_no を分母に入れている');

  // 4. 上限で足りるなら譲渡は0、足りないなら正の数
  const e = analyse({ tasks: [mk('ai_autonomous'), mk('nobody', 'not_started')] }, { target: 1 });
  if (e.handover_required !== 0) problems.push('上限で届くのに譲渡を要求している');
  const f = analyse({ tasks: [mk('ai_autonomous'), mk('human_only', 'policy_boundary')] }, { target: 1 });
  if (f.handover_required !== 1) problems.push('境界を渡さないと届かないことを出していない');

  // 6. **境界を全部渡しても届かない目標**を、届くように見せない
  const g = analyse({ tasks: [mk('ai_autonomous'), mk('human_only', 'policy_boundary'), mk('nobody', 'physical_human')] }, { target: 1 });
  if (g.handover_required > g.buckets.owner_only) problems.push('渡せる件数より多くの譲渡を要求している');
  if (g.unreachable_by !== 1) problems.push('渡しても届かない件数を出していない');

  // 5b. defer は件数が最大でも最後に来る
  {
    const doc = { tasks: [
      mk('ai_autonomous'),
      { area: '① 検査用', task: 'defer5', executor: 'nobody', blocker: 'not_started', unblocked_by: 'u', unlock: 'impl_analog', evidence: [] },
      { area: '① 検査用', task: 'wait1', executor: 'nobody', blocker: 'external_data', unblocked_by: 'u', unlock: 'bq_28d', evidence: [] },
    ] };
    const pl = planTo(doc, 1);
    if (pl.steps[pl.steps.length - 1]?.id !== 'impl_analog') p.push('defer が最後に来ていない');
  }

  // 5. 登録簿の klass は3種類だけ
  for (const [k, v] of Object.entries(BLOCKERS)) {
    if (!['reachable', 'owner_only', 'never'].includes(v.klass)) problems.push(`未知の klass: ${k}`);
  }
  return problems;
}

export function check(doc) {
  const problems = [];
  for (const t of doc.tasks) {
    if (!NON_AI.has(t.executor)) {
      if (t.blocker) problems.push(`AIが実行しているのに blocker がある: ${t.area} / ${t.task}`);
      continue;
    }
    if (!t.blocker) { problems.push(`blocker が無い: ${t.area} / ${t.task}`); continue; }
    if (!BLOCKERS[t.blocker]) problems.push(`未登録の blocker "${t.blocker}": ${t.area} / ${t.task}`);
    if (!t.unblocked_by) problems.push(`unblocked_by が無い: ${t.area} / ${t.task}`);
    if (BLOCKERS[t.blocker]?.klass === 'reachable') {
      if (!t.unlock) problems.push(`到達可能なのに unlock が無い: ${t.area} / ${t.task}`);
      else if (!UNLOCKS[t.unlock]) problems.push(`未登録の unlock "${t.unlock}": ${t.area} / ${t.task}`);
    } else if (t.unlock) {
      problems.push(`到達可能でないのに unlock がある: ${t.area} / ${t.task}`);
    }
  }
  for (const [k, v] of Object.entries(UNLOCKS)) {
    if (!UNLOCK_ORDER.includes(v.kind)) problems.push(`未知の unlock kind: ${k}`);
  }
  // 算数が automation-rate.mjs と一致すること（数字の出所を2つ作らない）
  const s = summarize(doc).overall;
  const a = analyse(doc);
  if (Math.abs(s.overall_automation_rate - a.now_rate) > 1e-9) {
    problems.push(`総合自動化率が automation-rate.mjs と一致しない: ${s.overall_automation_rate} vs ${a.now_rate}`);
  }
  if (a.ceiling < a.now) problems.push('上限が現在値を下回っている');
  return problems;
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest')) {
    const p = selftest();
    if (p.length) { console.error('自己検査で問題:'); for (const x of p) console.error(`  - ${x}`); process.exit(1); }
    console.log('autonomy-gap: 自己検査に問題なし。');
    process.exit(0);
  }

  const doc = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8'));
  const ti = argv.indexOf('--target');
  const target = ti >= 0 && argv[ti + 1] ? Number(argv[ti + 1]) / 100 : 0.95;
  const a = analyse(doc, { target });

  if (argv.includes('--check')) {
    const p = [...selftest(), ...check(doc)];
    if (p.length) { console.error('自律度ギャップ台帳に問題:'); for (const x of p) console.error(`  - ${x}`); process.exit(1); }
    console.log(`自律度ギャップ: 分類 ${a.buckets.reachable + a.buckets.owner_only + a.buckets.never} 件すべてに理由あり。算数も一致。`);
    process.exit(0);
  }

  if (argv.includes('--plan')) {
    const pl = planTo(doc, target);
    if (argv.includes('--json')) { console.log(JSON.stringify(pl, null, 2)); process.exit(0); }
    console.log(`目標 ${pct(pl.target)} までの最短路（現在 ${pct(pl.now_rate)} / 上限 ${pct(pl.ceiling_rate)}）`);
    console.log(`  必要 ${pl.need}/${pl.denominator}  あと ${Math.max(0, pl.need - pl.now)} タスク\n`);
    const KIND = { wait: '待つだけ', owner_input: 'オーナー入力', owner_decision: 'オーナー判断', implement: '実装', external_contract: '外部契約' };
    for (const s2 of pl.steps) {
      const mark = s2.after_target ? '  ' : '→ ';
      console.log(`${mark}[${KIND[s2.kind].padEnd(6)}] ${UNLOCKS[s2.id].label}`);
      console.log(`     +${s2.tasks.length}件 → ${s2.cumulative}/${pl.denominator} = ${pct(s2.rate)}${s2.after_target ? '   （目標到達後）' : ''}`);
      console.log(`     要るもの: ${UNLOCKS[s2.id].needs}`);
      if (UNLOCKS[s2.id].defer) console.log(`     **後置**: ${UNLOCKS[s2.id].defer_why}`);
      for (const t of s2.tasks) console.log(`       - ${t.area[0]} ${t.task}`);
      console.log('');
    }
    const upto = pl.steps.filter((x) => !x.after_target);
    const byKind = {};
    for (const x of upto) byKind[x.kind] = (byKind[x.kind] ?? 0) + x.tasks.length;
    console.log('  目標までの内訳（誰がやるか）:');
    for (const k of UNLOCK_ORDER) if (byKind[k]) console.log(`    ${KIND[k].padEnd(6)} ${byKind[k]} 件`);
    const machine = (byKind.wait ?? 0) + (byKind.implement ?? 0);
    const ownerGroups = upto.filter((x) => x.kind === 'owner_input' || x.kind === 'owner_decision');
    console.log(`\n  **機械と時間だけで ${pl.now + machine}/${pl.denominator} = ${pct((pl.now + machine) / pl.denominator)}。**`);
    if (ownerGroups.length) {
      console.log(`  目標に届かせるのに要るオーナーの手数は ${ownerGroups.length} 件:`);
      for (const g of ownerGroups) console.log(`    - ${UNLOCKS[g.id].label}（${g.tasks.length}タスクが動く）`);
    } else {
      console.log('  オーナーの手数ゼロで届く。');
    }
    process.exit(0);
  }

  if (argv.includes('--json')) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }

  console.log(`自律度の到達可能上限（分母 ${a.denominator} タスク・意図的にやらないを除く）\n`);
  console.log(`    現在              ${a.now}/${a.denominator}  = ${pct(a.now_rate)}`);
  console.log(`    到達可能な上限    ${a.ceiling}/${a.denominator}  = ${pct(a.ceiling_rate)}   ← 実装・外部接続・書類で届く範囲`);
  console.log(`    目標 ${pct(a.target)}         ${a.need}/${a.denominator}`);
  console.log('');
  console.log(`    境界を全部渡しても  ${a.ceiling_with_handover}/${a.denominator}  = ${pct(a.ceiling_with_handover_rate)}   ← 人へ残した ${a.buckets.owner_only} 件をすべてAIに渡した場合`);
  console.log('');
  if (a.unreachable_by > 0) {
    console.log(`  **目標 ${pct(a.target)} には、意図的な境界を1件残らず渡しても ${a.unreachable_by} 件届かない。**`);
    console.log(`  残りは物理・対人・観測不能・検出力不足の ${a.buckets.never} 件で、渡しても実行できない:\n`);
    for (const t of a.never_tasks) console.log(`     ${t.area} :: ${t.task}`);
    console.log('');
    console.log(`  つまり目標値そのものが、この分母では成立しない。`);
    console.log(`  分母を変えずに達成する方法は無く、**達成したことにする方法だけがある。**`);
  } else if (a.handover_required > 0) {
    console.log(`  **到達可能なものを全部やっても ${a.need - a.ceiling} 件足りない。**`);
    console.log(`  目標に届かせるには、意図的に人へ残した ${a.buckets.owner_only} 件のうち`);
    console.log(`  **${a.handover_required} 件をAIへ渡す**ことになる。渡す候補は次のとおり:\n`);
    for (const t of a.owner_only_tasks) console.log(`     ${t.area} :: ${t.task}`);
    console.log('');
    console.log(`  物理・対人・観測不能・検出力不足の ${a.buckets.never} 件は、渡しても実行できない。`);
  } else {
    console.log(`  目標は到達可能な上限の内側にある（境界を渡す必要は無い）。`);
  }
  console.log('\n  実行していない理由の内訳:\n');
  for (const [k, v] of Object.entries(a.by_blocker).sort((x, y) => y[1] - x[1])) {
    const b = BLOCKERS[k];
    console.log(`    ${String(v).padStart(3)} 件  ${k.padEnd(24)} ${b ? b.label : '**未登録**'}  [${b ? b.klass : '?'}]`);
  }
  console.log(`\n  到達可能 ${a.buckets.reachable} / オーナー判断 ${a.buckets.owner_only} / 到達不能 ${a.buckets.never}`);
}
