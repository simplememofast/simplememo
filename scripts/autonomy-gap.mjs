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
  // [2026-08-27] **「作った」と「動いた」を分けるための枠。**
  // 実装も配線も済んでいて、あとは1周動いたのを見るだけ、という行がここに入る。
  // これが無いと `not_started`（着手していないだけ）に入れるしかなく、**その語は嘘**。
  // 嘘を避けるためにもう一方へ倒すと、今度は**動いたのを見ずに executor を
  // AI側へ動かす**ことになる。このリポジトリが何度も踏んでいるのはそちら側なので、
  // 「作ったが見ていない」を名前のある状態にしておく。
  verification_pending:    { klass: 'reachable',  label: '作ったが、まだ1周も動いたのを見ていない' },
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
  // [2026-08-26] **`wait` から外した。**「待つだけ」は待てば来るものに使う語で、これは来ない。
  // Apple の Analytics Reports カタログ **156本を全部読んだ**（../simplememo-ios/data/asc/status.json
  // の available_reports）。検索語のレポートは**1本も無い** —— 名前に search / term / query を
  // 含むのは `Spotlight Query Performance` と `Visual Intelligence Image Search Usage` の2本で、
  // どちらもストア検索語ではない。
  //
  // **確かめたのはこの経路だけ。**「Apple がくれない」と書く前に叩く、というのが
  // om-2026-08-25-asc-landed の学びなので、まだ叩いていない面（Sales and Trends /
  // Apple Search Ads / ASCのWeb UI）を到達不能と書かない。次にやることは探索であって待機ではない。
  asc_search_terms:  { kind: 'implement', label: 'ストア検索語を取る面を探す（Analytics には無い）',
                       needs: '**Analytics Reports のカタログ156本に検索語のレポートは無い**'
                            + '（2026-08-26 に available_reports を全件確認）。'
                            + 'Discovery and Engagement が持つのは Page Type / Source Type / Territory まで。'
                            + '**待っても降りてこない** —— 残る面（Sales and Trends / Apple Search Ads / '
                            + 'ASCのWeb UI）のどれが organic の検索語を返すかを叩いて確かめる。'
                            + '**どれも返さないと分かった時点で never 側へ落とす**（それまでは推測で落とさない）' },
  asc_dimension_read: { kind: 'implement', label: '内訳の値を非公開側で読む経路を作る',
                       needs: '**列（Page Type ほか）は降りている**が、値はこの公開リポジトリに運ばない'
                            + '（2026-08-26 の決定・data/publication-policy.json）。'
                            + '読む側は ../simplememo-ios の asc_subscription.rb / asc_funnel.rb と同じ場所に置く' },
  revenue_28d:       { kind: 'wait', label: '収入の観測が28日たまる',
                       // [2026-08-26] **08-26 まで、これは待ちではなかった。**積む側
                       // （growth/scripts/revenue-series.mjs）が読むのは ingest-asc.mjs の出力で、
                       // その ingest は `../simplememo-ios/data/asc/` を読む —— **このリポジトリの
                       // CI に隣は無い。**実測 covered_days は 0 のまま動いていなかった。
                       // 積む処理を取得側（../simplememo-ios/scripts/asc_revenue.rb、毎日実行）へ移し、
                       // **08-26 から実際に増える。**待ちが本物になったのはこの日から。
                       needs: '**08-26 に積み始めた**（それまでは配線が切れていて、待っても増えなかった）。'
                            + '積むのは ../simplememo-ios/scripts/asc_revenue.rb で、'
                            + 'ここが持つのは金額を運ばない写し。月額へ換算するには28日ぶんの観測が要る'
                            + '（推定で埋めない）。28日そろうのは 2026-09-19 前後',
                       satisfied_when: [{ file: 'data/revenue-series.json', path: 'covered_days', atLeast: 28 }] },
  bq_28d:            { kind: 'wait', label: 'BigQuery の28日蓄積が到達する',
                       needs: '9/6前後。D28が測れるようになる',
                       satisfied_when: [{ file: 'data/autopilot-status.json',
                                          path: 'data_freshness.bq_export_days_accumulated', atLeast: 28 }] },
  company_facts:     { kind: 'owner_input', label: '会社の基礎事実を台帳に入れる',
                       needs: '**決算期・役員報酬・インボイス登録は 2026-08-25 に入り、'
                            + '法人税と消費税の申告期限は機械が出している。**残るのは '
                            + 'Apple Developer の加入日・ドメインの更新日・社会保険の具体的な届出期限・法定調書の要否',
                       satisfied_when: [
                         { file: 'data/credential-expiry.json', path: 'apple_developer_enrolled_at' },
                         { file: 'data/credential-expiry.json', path: 'domain_renewal_at' },
                       ] },
  contract_docs:     { kind: 'owner_input', label: '契約書・請求書をリポジトリに置く',
                       needs: '現在ゼロ。書面が無いと分類も照合も対象が存在しない' },
  corp_records:      { kind: 'owner_input', label: '議事録・株主名簿・事故記録の所在を決める',
                       needs: '「発生していない」のか「記録する場所が無い」のかが区別できていない' },
  // [2026-08-27] **決まった。**オーナーが「品質ゲート通過で自動投稿」を選び、
  // 権限表にゲート付き例外として入り（data/authority-matrix.json）、
  // 実行側も入った（../simplememo-ios/scripts/asc_review_reply.rb）。
  // したがってこれはもう owner_decision ではない。**残っているのは1周見ること。**
  reply_gate:        { kind: 'wait', label: '自動投稿が1周 dry_run で動いたのを見る',
                       needs: '**判断も実行も入っている**（planAutoPost / asc_review_reply.rb）。'
                            + '台帳は enabled=true / dry_run=true。あとは1回動いて would_post が'
                            + '出るのを見て dry_run を落とすだけ。'
                            + '回すのは ../simplememo-ios の asc-review-reply.yml（日次 21:40 UTC）。'
                            // [2026-08-27] ここに一度「あちらの Actions が storage 上限で
                            // 止まっているので動かない」と書いた。**同じ日に動いていた**
                            // （00:25Z の #232 の CI が12秒で緑）。前日の観測を、
                            // 確かめ直さずに現在形で書いた。
                            + '**満たされたことをこのリポジトリから機械で確かめる経路は無い** ——'
                            + '証跡（data/review-responses.json）は非公開側にあり、'
                            + '非公開→公開へ push する経路は作っていない' },
  refund_boundary:   { kind: 'owner_decision', label: '返金・チャージバックの承認境界を決める',
                       needs: '金銭が動く不可逆操作。**上限額を決めない限り自動側へ置けない**' },
  inquiry_facts:     { kind: 'implement', label: '問い合わせの再現ファクトを非個人情報として出す',
                       needs: '**取り出す経路は 2026-08-26 に作った**（relay の summarizeReproFacts）。'
                            + '残るのは、それが日報の文面ではなく**リポジトリ側から読める形**で出ること。'
                            + 'あと移行0027の適用と、母数 — inquiries は現在0件で、'
                            + '**来ていない本文の書式を想像して抽出を書かない**' },
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

  // ── check(doc) を実際に呼ぶ ─────────────────────────────────────
  //
  // [2026-08-26] **ここまで、この自己テストは check() を一度も呼んでいなかった。**
  // 上で見ているのは analyse() の算数（上限・分母・譲渡）だけで、
  // 台帳そのものを見る側 —— blocker が登録簿にあるか、unblocked_by が書いてあるか、
  // 率が automation-rate.mjs と一致するか —— は素通りしていた。
  // 実測すると、**check() の中の problems.push を10個すべて潰しても
  // この自己テストは緑のままだった。**覆っているように見えるだけの半分。
  const task = (over = {}) => ({
    area: 'A', task: 'T', executor: 'nobody',
    blocker: 'not_started', unblocked_by: '着手する', unlock: 'ship_it', ...over,
  });
  const reachableUnlock = Object.keys(UNLOCKS)[0];
  const ok = (over) => ({ blocked_on_missing_budget: 99,
    tasks: [task({ unlock: reachableUnlock, ...over })] });
  const hit = (ps, needle) => ps.some((x) => x.includes(needle));

  // **落とすべきものを落とすか。**
  problems.push(...[
    ['blocker が無い', ok({ blocker: null }), 'blocker が無い'],
    ['未登録の blocker', ok({ blocker: 'そんな理由は無い' }), '未登録の blocker'],
    ['unblocked_by が無い', ok({ unblocked_by: null }), 'unblocked_by が無い'],
    ['到達可能なのに unlock が無い', ok({ unlock: null }), 'unlock が無い'],
    ['未登録の unlock', ok({ unlock: 'そんな道は無い' }), '未登録の unlock'],
    ['到達可能でないのに unlock がある',
      { blocked_on_missing_budget: 99,
        tasks: [task({ blocker: 'physical_human', unlock: reachableUnlock })] },
      '到達可能でないのに unlock がある'],
    ['AIが実行しているのに blocker がある',
      { blocked_on_missing_budget: 99, tasks: [task({ executor: 'ai_autonomous' })] },
      'AIが実行しているのに blocker がある'],
  ].flatMap(([label, doc, needle]) => {
    let ps;
    try { ps = check(doc); } catch (e) { return [`check: ${label} で例外: ${e.message}`]; }
    return hit(ps, needle) ? [] : [`check が「${label}」を落とさない（**この判定は何も見ていない**）`];
  }));

  // **落としてはいけないものを落とさないか。**片方だけでは足りない。
  try {
    const clean = check({ blocked_on_missing_budget: 99,
      tasks: [task({ blocker: 'physical_human', unlock: null })] });
    if (clean.length) problems.push(`check が正しい台帳を落とした: ${clean[0]}`);
  } catch (e) {
    problems.push(`check: 正常な台帳で例外: ${e.message}`);
  }

  // ── blocked_on（届いたのに待ち続けていないか） ─────────────────
  const covDoc = (over = {}) => ({
    blocked_on_missing_budget: 99,
    tasks: [{ area: 'A', task: 'T', executor: 'nobody',
      blocker: 'external_data', unblocked_by: '待っている',
      unlock: Object.keys(UNLOCKS)[0], ...over }],
  });
  const gotHere = { file: 'data/automation-coverage.json' };          // 必ず在る
  const notYet = { file: 'data/そんなファイルは無い.json' };            // 必ず無い

  problems.push(...[
    ['**述語が全部満たされたら落ちる**（届いた材料を待ち続けない）',
      covDoc({ blocked_on: [gotHere] }), true, '待っていた材料がもう在る'],
    ['1つでも欠けていれば落ちない（まだ待っている）',
      covDoc({ blocked_on: [gotHere, notYet] }), false, null],
    ['**not_started では落ちない**（着手していないだけは待っていない）',
      covDoc({ blocker: 'not_started', unblocked_by: 'やっていない', blocked_on: [gotHere] }), false, null],
    ['述語が無ければ落ちない（上限の範囲内なら）',
      covDoc({}), false, null],
  ].flatMap(([label, doc, shouldFail, needle]) => {
    let ps;
    try { ps = check(doc); } catch (e) { return [`blocked_on: ${label} で例外: ${e.message}`]; }
    const hit = needle ? ps.some((x) => x.includes(needle)) : ps.length > 0;
    if (hit !== shouldFail) {
      return [`blocked_on: 「${label}」が期待どおりでない（${JSON.stringify(ps)}）`];
    }
    return [];
  }));

  // 述語の形（path / atLeast / dir）が効いているか
  const predCases = [
    ['ファイルが在るだけの述語', { file: 'data/automation-coverage.json' }, true],
    ['無いファイルは満たされない', { file: 'data/無い.json' }, false],
    ['path が在れば満たされる', { file: 'data/automation-coverage.json', path: 'tasks' }, true],
    ['path が無ければ満たされない', { file: 'data/automation-coverage.json', path: 'そんな.位置' }, false],
    ['**atLeast は数で見る**（在るだけでは満たさない）',
      { file: 'data/autopilot-status.json', path: 'data_freshness.bq_export_days_accumulated', atLeast: 99999 }, false],
    ['ディレクトリの件数も見る', { dir: 'scripts', atLeast: 1 }, true],
    ['無いディレクトリは満たされない', { dir: 'そんなディレクトリ', atLeast: 1 }, false],
    ['**contains: 在る語は満たす**', { dir: 'growth/data/appstore', contains: 'Page Type' }, true],
    ['**contains: 無い語は満たさない**（在ることと、要るものが在ることは違う）',
      { dir: 'growth/data/appstore', contains: 'Search Term' }, false],
    ['contains はファイル単位でも効く',
      { file: 'data/automation-coverage.json', contains: 'そんな語は入っていない' }, false],
  ];
  for (const [label, pred, want] of predCases) {
    let got;
    try { got = blockedOnSatisfied(pred); } catch (e) { problems.push(`述語: ${label} で例外: ${e.message}`); continue; }
    if (got !== want) problems.push(`述語「${label}」が ${got}（${want} のはず）`);
  }

  // 入口の述語（開いた入口を待ち続けない）。**両方向を見る。**
  {
    if (!Object.values(UNLOCKS).some((u) => u.satisfied_when)) {
      problems.push('satisfied_when を持つ入口が1つも無い（**この判定は空回りしている**）');
    }
    const taskAt = (unlock, over = {}) => ({ blocked_on_missing_budget: 99, tasks: [
      { area: 'A', task: 'T', executor: 'nobody', blocker: 'external_data',
        unblocked_by: 'x', unlock, blocked_on: [{ file: 'data/無い.json' }], ...over },
    ] });
    const OPEN = { kind: 'wait', label: '開いた入口', needs: 'x',
      satisfied_when: [{ file: 'data/automation-coverage.json' }] };
    const SHUT = { kind: 'wait', label: 'まだの入口', needs: 'x',
      satisfied_when: [{ file: 'data/そんなファイルは無い.json' }] };

    const fired = check(taskAt('u'), { unlocks: { u: OPEN } });
    if (!fired.some((x) => x.includes('もう開いている'))) {
      problems.push('**開いた入口を待ち扱いのままにしても鳴らない**（計画が古い材料を待てと言い続ける）');
    }
    const quiet = check(taskAt('u'), { unlocks: { u: SHUT } });
    if (quiet.some((x) => x.includes('もう開いている'))) {
      problems.push('まだ開いていない入口で「もう開いている」と言った（常に鳴る検査も何も見ていない）');
    }
    // 待ち種別でなければ鳴らない
    const notWaiting = check(taskAt('u', { blocker: 'not_started', unblocked_by: 'やっていない' }),
      { unlocks: { u: OPEN } });
    if (notWaiting.some((x) => x.includes('もう開いている'))) {
      problems.push('not_started の行で「もう開いている」と言った');
    }
  }

  // ラチェット
  const many = { blocked_on_missing_budget: 0, tasks: [
    { area: 'A', task: 'T1', executor: 'nobody', blocker: 'external_data',
      unblocked_by: 'x', unlock: Object.keys(UNLOCKS)[0] },
  ] };
  if (!check(many).some((x) => x.includes('述語の無い「待ち」'))) {
    problems.push('述語の無い待ちが上限を超えても落ちない');
  }
  if (!check({ tasks: [] }).some((x) => x.includes('blocked_on_missing_budget が数でない'))) {
    problems.push('上限を書き忘れても落ちない（**無ければ無制限、が一番危ない**）');
  }

  // **実データが通ること。**
  try {
    const real = check(JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf8')));
    if (real.length) problems.push(`実データで check が ${real.length} 件: ${real[0]}`);
  } catch (e) {
    problems.push(`実データで check が例外: ${e.message}`);
  }
  return problems;
}

/**
 * 「待っているもの」を機械が確かめられる形で書く。
 *
 * [2026-08-26] **台帳が、もう届いている材料を「待っている」と言い続けていた。**
 * ⑦法人経営の税務行は `unblocked_by` に「決算期・従業員の有無・課税事業者かが
 * リポジトリに無い」と書いてあるが、3つとも 2026-08-25 にオーナー確認で入っており、
 * 指している検査（check-corporate.mjs）は法人税と消費税の期限を実際に出している。
 * note のほうも「消費税は未把握」と書いたままだった。
 *
 * **「ブロックされている」と「ブロックされているか確かめていない」は違う。**
 * 散文で書くかぎり、届いた日に誰も直さない。だから届いたことを機械が見られる形にする。
 *
 * 述語の形（すべて満たされたら、その行はもう待っていない）:
 *   { file: 'data/x.json' }                       … ファイルが在る
 *   { file: 'data/x.json', path: 'a.b.c' }        … その位置に値が在る（null/undefined 以外）
 *   { file: 'data/x.json', path: 'a.b', atLeast: 28 } … 数がその値以上
 *   { dir: 'growth/data/appstore', atLeast: 1 }   … ディレクトリに N 件以上
 *   { dir: '...', contains: 'Search Term' }       … その語がどれかのファイルに現れた
 *
 * `contains` は「**待っている次元が届いたか**」を書くためにある。
 * 「ファイルが在る」では足りない場合がある —— 例えば ASC のレポートは降りているが、
 * 検索語の列を持つレポートはまだ無い。**在ることと、要るものが在ることは違う。**
 */
export function blockedOnSatisfied(pred, { root = ROOT } = {}) {
  const at = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const hasText = (abs, needle) => {
    try { return fs.readFileSync(abs, 'utf8').includes(needle); } catch { return false; }
  };
  if (pred.dir) {
    const abs = path.join(root, pred.dir);
    if (!fs.existsSync(abs)) return false;
    const files = fs.readdirSync(abs).filter((f) => !f.startsWith('.'));
    if (pred.contains) {
      return files.some((f) => hasText(path.join(abs, f), pred.contains));
    }
    return files.length >= (pred.atLeast ?? 1);
  }
  const abs = path.join(root, pred.file);
  if (!fs.existsSync(abs)) return false;
  if (pred.contains) return hasText(abs, pred.contains);
  if (!pred.path) return true;
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    // [2026-08-26] **ここは自分で書いた飲み込みだった。**壊れたファイルを
    // 「まだ届いていない」と読むと、待ち続ける側へ倒れるので安全に見えるが、
    // **壊れていることを誰も知らない。**判定できないことを、判定できたことにしない。
    throw new Error(`${pred.file} を読めない（${e.message}）`
      + ' — **届いたかどうかを判定できない。**「まだ」と混ぜない');
  }
  const v = at(doc, pred.path);
  if (v === undefined || v === null) return false;
  if (pred.atLeast !== undefined) return typeof v === 'number' && v >= pred.atLeast;
  return true;
}

/** その行がまだ待っているか。述語が1つも無ければ「確かめていない」。 */
export function stillBlocked(task, opts = {}) {
  const preds = task.blocked_on;
  if (!Array.isArray(preds) || preds.length === 0) return { checkable: false };
  const results = preds.map((pr) => ({ pred: pr, ok: blockedOnSatisfied(pr, opts) }));
  return { checkable: true, results, satisfied: results.every((r) => r.ok) };
}

/** 「何かを待っている」種別。**着手していないだけ、は待っていない。** */
export const WAITING_BLOCKERS = new Set([
  'external_data', 'external_credential', 'missing_source_document', 'human_consent',
]);

export function check(doc, { unlocks = UNLOCKS } = {}) {
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

  // **届いた材料を「待っている」と言い続けない。**
  //
  // 効くのは「何かを待っている」種別だけ。`not_started`（着手していないだけ）は
  // **材料が在るのが前提**なので、揃っていても矛盾ではない。
  for (const t of doc.tasks) {
    if (!t.blocked_on || !WAITING_BLOCKERS.has(t.blocker)) continue;
    const st = stillBlocked(t);
    if (st.satisfied) {
      problems.push(`待っていた材料がもう在る: ${t.area} / ${t.task}`
        + ` — ${t.blocked_on.map((x) => x.path ? `${x.file}:${x.path}` : (x.dir ?? x.file)).join(', ')}`
        + ' が揃っている。**blocker と unblocked_by を実際の状態に直すこと**'
        + '（「ブロックされている」と「ブロックされているか確かめていない」は違う）');
    }
  }

  // **開いた入口を「待っている」と言い続けない。**
  //
  // [2026-08-26] `--plan` が最短路の**先頭**で「App Store Connect の Analytics
  // レポートが降りる（現在0件）」を出していた。実際には 2026-08-25 に10本降りている。
  // **オーナーへ渡す計画が、もう届いたものを待てと言っていた。**
  // 行だけでなく入口（UNLOCKS）にも述語を置く。
  for (const [id, u] of Object.entries(unlocks)) {
    if (!Array.isArray(u.satisfied_when) || !u.satisfied_when.length) continue;
    if (!u.satisfied_when.every((pr) => blockedOnSatisfied(pr))) continue;
    const still = doc.tasks.filter((t) => t.unlock === id && WAITING_BLOCKERS.has(t.blocker));
    if (still.length) {
      problems.push(`入口「${u.label}」はもう開いているのに、${still.length} 件が待ち扱いのまま`
        + ` — ${still.map((t) => t.task).join(' / ')}`
        + '（**計画がオーナーに、もう届いたものを待てと言うことになる**）');
    }
  }

  // ラチェット。**述語の無い「待ち」を増やさない。**
  //
  // 述語が無い行は、届いたかどうかを誰も確かめていない。散文で「〜が無い」と
  // 書いてあるだけなので、**届いた日に直る保証がゼロ。**実際この2行がそうなった。
  // 上限は 2026-08-26 の実測。**上げて通さない。**
  const waiting = doc.tasks.filter((t) => WAITING_BLOCKERS.has(t.blocker));
  const noPred = waiting.filter((t) => !Array.isArray(t.blocked_on) || !t.blocked_on.length);
  const budget = doc.blocked_on_missing_budget;
  if (typeof budget !== 'number') {
    problems.push('blocked_on_missing_budget が数でない — 無ければ無制限、が一番危ない');
  } else if (noPred.length > budget) {
    problems.push(`述語の無い「待ち」が ${noPred.length} 行で、上限 ${budget} を超えた`
      + ' — **届いたかどうかを誰も確かめない行を増やさない。**'
      + 'blocked_on に「何が在れば待たなくてよいか」を書く（上限を上げて通さない）');
  }

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
