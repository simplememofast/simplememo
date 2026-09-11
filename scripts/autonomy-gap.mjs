#!/usr/bin/env node
/**
 * 自律度の到達可能上限 — 「61.3% を 95% にする」が何を要求するかを機械が出す。
 *
 *   node scripts/autonomy-gap.mjs            # 現在値・上限・95%に要る譲渡の内訳
 *   node scripts/autonomy-gap.mjs --json     # 機械可読
 *   node scripts/autonomy-gap.mjs --target 95
 *   node scripts/autonomy-gap.mjs --plan --target 70   # 目標までの最短路
 *   node scripts/autonomy-gap.mjs --execution-plan --target 90 # AI実行率を厳密に超える条件
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
import os from 'node:os';
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
  circular_prerequisite:   { klass: 'never',      label: '実行前の条件に、この業務の実行済み判定が含まれる' },
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
  delegated_device_verification: { kind: 'owner_input', label: '接続した実機の購入・復元の前提を整え、全項目の結果を揃える',
                       needs: 'ユーザーが接続・信頼し利用を指示した端末の実機テストは委任済み。'
                            + '現在の5.8.54(1342)は同じ配布版で5/6確認済みで、購入・復元が未完了。'
                            + '既存Premium状態からの復元反復は停止し、専用Sandboxで購入前の状態と有効な権利の再取得を別々に検証する。'
                            + '旧ビルドの購入成功やPremium表示で代用せず、全6項目・実行者・時刻・同一SHAが揃うまで加点しない。' },
  pr_dispatch_verified: { kind: 'wait', label: '実測目標と配信前条件を満たし、今回のPRを配信・公開確認する',
                       needs: '今回の企業182412・下書き10は委任済み。未丸め実測99%超の最新台帳と'
                            + '同一原稿・PR TIMESプレビュー、品質、宛先、日時、料金、未配信状態を'
                            + 'evaluateDispatchで照合し、allowed=trueの時だけ配信して公開URL・本文・日時を確認する。'
                            + '目標到達だけでは全条件の完了とせず、配信前の先取り加点もしない。' },
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
  asc_dimension_read: { kind: 'implement', label: 'CPPの一次指標と比較期間を非公開側で確認する',
                       needs: '日次・週次Detailedのページ×種別集計はiOS PR #401/#402で本番稼働済み。'
                            + '観測したCPPセルは更新やImpressionで、初回DL・ページ閲覧とは異なる。'
                            + '月次DetailedまたはASCのCPP画面で一次指標の観測可否を確認し、'
                            + '共通期間・比較対象・同時施策を記録する。未観測を0にしない。'
                            + '実験評価の数値は非公開simplememo-ios側に保持する。' },
  revenue_28d:       { kind: 'implement', label: '売上の欠測と費用・継続データを判断に接続する',
                       needs: '日次v2は現在28日窓の確定観測日数で、時間経過だけでは全日が揃わない。'
                            + '欠測を0にせず、期間比較には非公開simplememo-iosのApple暦週・暦月系列を使う。'
                            + 'AI原価回収は同期間の費用と配賦、LTVは獲得分母と継続・課金の結合、'
                            + '全体予算はベンダー実支出・残高・入金を照合して判断する。'
                            + '28日到達は日次観測範囲の条件に限り、これらの業務完了を証明しない。',
                       satisfied_when: [{ file: 'data/revenue-series.json', path: 'covered_days', atLeast: 28 }] },
  // Keep the legacy ID for historical plan references; search exports are not app cohorts.
  bq_28d:            { kind: 'wait', label: '同一コホートの実観測・成熟・課金履歴を検証する（日次接続済み）',
                       needs: 'API306で日次の購読cohort接続と本番保存は完了したが、対象2週は適格コホートが空。'
                            + '元の初回起動context、購読との対応、D7/D28の成熟と計測範囲を実観測で照合する。'
                            + '完全な課金・解約履歴の不足も残る。現在の状態・復元済み価格・通知カテゴリ合算で代用しない。'
                            + 'Search Consoleの日数、空の評価ファイル、workflow成功だけではこの待ちは解除しない。'
                            + '不足を具体化して必要な対応へ進み、詳細は非公開側に保持する。' },
  // [2026-08-28] **述語を書き直した。旧版は構造的に真になれなかった。**
  // `data/credential-expiry.json` の `apple_developer_enrolled_at` /
  // `domain_renewal_at` を見ていたが、**その名前のフィールドはリポジトリのどこにも無く、
  // 書く経路も無かった。**（grep して、この述語の中にしか出てこないことを確かめた。）
  // つまりこの入口は「オーナーが埋めても、機械は永久に開いたと言わない」形をしていた。
  // **満たされない述語は、満たされていない状態と見分けがつかない。**2日気づかなかった。
  //
  // Apple 側は日付そのものを追うのをやめた。台帳自身が
  // 「監視を自動化するより、監視が要らない形にするほうが強い」と結論していて
  // （deadlines[apple-developer-program].better_fix）、**根の問いは加入日ではなく
  // auto-renew が入っているか。**`auto_renew_confirmed` は true/false どちらでも
  // 「確かめた」なので述語は真になる —— false なら毎年の期限監視が要る形に戻るだけで、
  // **確かめたことは確かめたこと。**
  company_facts:     { kind: 'owner_input', label: '会社の基礎事実を台帳に入れる',
                       needs: '**決算期・役員報酬・インボイス登録は 2026-08-25 に入り、'
                            + '法人税と消費税の申告期限は機械が出している。**\n\n'
                            + '**[2026-09-01] Apple は閉じた。**自動更新は入っていない（`false`）——'
                            + '4通りで確かめた（Web の2つの役割・購入時の請求書・iOSアプリ）。'
                            + '**入っていないと分かったので、期限監視は外せない。**\n\n'
                            + '残るのは3つ: ドメインの更新日（RDAP から機械が入れる。'
                            + 'seo-daily の週次段が #754 で修正されたので次の回で入る）・'
                            + '**社会保険の具体的な届出期限**（確認先は税理士か年金事務所。'
                            + '社労士は雇っていない）・**法定調書の要否**'
                            + '（freee の probe が外注費と支払報酬料の計上を確認済みなので'
                            + '「不要」では閉じない。判定は税務の領域）',
                       satisfied_when: [
                         { file: 'data/corporate-obligations.json',
                           path: 'deadlines[id=apple-developer-program].auto_renew_confirmed' },
                         { file: 'data/corporate-obligations.json',
                           path: 'deadlines[id=domain-renewal].next_due' },
                         // [2026-09-01] **この2つを足した。述語が行の条件より狭かった。**
                         //
                         // この入口が持つ行（⑦ 税務・給与・社会保険・法定期限の管理）の
                         // `unblocked_by` は**4つ**を待つと書いてあるのに、述語は**2つ**しか
                         // 見ていなかった。Apple が閉じ、ドメインが入った時点で
                         // **述語だけが「開いた」と言い、社会保険と法定調書が未把握のまま
                         // 行を動かせと迫る形**になっていた。
                         //
                         // **狭い述語は、緩い述語より危ない。**満たされない述語は
                         // 「まだです」と言い続けるだけだが、狭い述語は
                         // **条件の一部だけで開いたと宣言する** —— そして開いた入口は
                         // 上の検査が「待ち扱いのままだ」と催促するので、
                         // **数字を上げる方向へ押してくる。**
                         //
                         // どちらも到達可能。social-insurance は該当が確定していて
                         // 残るのは期限（税理士か年金事務所）、legal-record-statutory は
                         // freee の probe が計上ありを返しているので「不要」で閉じない。
                         { file: 'data/corporate-obligations.json',
                           path: 'deadlines[id=social-insurance].next_due' },
                         { file: 'data/corporate-obligations.json',
                           path: 'deadlines[id=legal-record-statutory].next_due' },
                       ] },
  // [2026-08-28] **書き換えた。旧版は、この台帳自身が否定している前提で立っていた。**
  // 旧ラベルは「契約書・請求書をリポジトリに置く」、旧 needs は
  // 「現在ゼロ。書面が無いと分類も照合も対象が存在しない」。
  // だが `data/corporate-obligations.json` の records は
  // **「書面の契約書は無く、規約への同意で成立している」**（exists: true・所在も記録済み）と
  // 書いてある。**存在しない書面が届くのを、3つの行が待っていた。**
  //
  // 3行のうち2行（契約の分類・条項比較）は対象が規約本文で、それは特定済み・
  // 指紋監視（週1回・月曜）・6/40マス読解済み。**`vendor_terms` へ移した。**
  // 残る1行（照合）だけが本当に材料を欠いているが、**欠けているのは書類ではなくデータ。**
  //
  // **原本はどのリポジトリにも置かない（2026-08-28 決定）。**
  // git の履歴は消せず simplememo は公開。原本には既に居場所がある
  // （規約＝各ベンダーの管理画面 / 請求書＝freee）ので、写しは正を2つにするだけ。
  // これは item 3 で直した「述語が古い写しを読む」のと同じ形の事故を、先に断っている。
  // [2026-09-01] **役目を終えた。行は0件。**この入口は「freee に取り出し口があるか」を
  // オーナーに確かめてもらう前提で立っていたが、**その問いは 2026-08-27 に本番で
  // 答えが出ていた**（cron `freee_balance` が `/api/1/walletables` を叩いて 200）。
  // **入口が要求していたのは、既に手元に在るものだった。**
  // 行は `impl_invoice_reconcile`（実装）へ移した。**消さない理由**は corp_records と同じ。
  contract_docs:     { kind: 'owner_input', label: 'freee の請求データを機械が読めるようにする',
                       needs: '**照合に要るのは書類ではなくデータ**（金額・日付・相手・入金状態）。'
                            + '原本は freee にあり、**リポジトリへ写しは置かない**（2026-08-28 決定）。'
                            + '要るのは取り出し口 —— **freee にAPIの経路があるかは未確認で、'
                            + 'あると仮定して計画に載せていない。**'
                            + '確かめるのはオーナー側（このセッションのプロキシから freee を叩けない）' },
  // [2026-08-28] **所在は決めた（オーナーが判断を委任）。残っているのは実在の確認だけ。**
  //   事故記録   … ../simplememo-api/data/incidents.json を**実際に作った**。
  //                非公開・個人データが通る側・data-retention.json の隣。
  //                検査も置いた（あちらの test/incidents.test.ts）。
  //                **空の entries が「起きていない」を意味する** ——
  //                ファイルが無い状態は何も意味しなかった。旧 needs の
  //                「発生していないのか場所が無いのか区別できていない」は、これで解けた。
  //   議事録     … **本店**（会社法318条2項）。リポジトリには置かない。
  //   株主名簿   … **本店**（会社法125条1項）。同上。**氏名・住所が載るので、
  //                非公開リポジトリでも置かない** —— git の履歴は消せない。
  //
  // **法が保管場所を指定している以上、機械は肩代わりできない。**入れても義務は
  // 果たされず、正が2つになるだけ。この台帳が持つのは所在の指示であって文書ではない。
  //
  // 述語は `exists` ではなく `existence_confirmed_at` を見る。
  // **`exists: false` は「無い」と「確かめていない」を同じ値にする** ——
  // 確かめても機械が気づかない形になり、company_facts でやったのと同じ罠になる。
  // [2026-09-01] **役目を終えた。行は0件。**オーナーが「ない」と答えて
  // `existence_confirmed_at` が入り、述語3つはすべて満たされた。
  // ただし持っていた行（⑦ 記録の保存）は `physical_human` へ移して `unlock` を外した ——
  // **法が保管場所を本店と指定している以上、機械が持てるようになる日が来ない。**
  // `--plan` は行を持たない入口を出さないので、ここは記録として残す。
  // **消さない理由**: 何がこの入口を閉じたのかが分からなくなる。
  corp_records:      { kind: 'owner_input', label: '議事録・株主名簿が実在するかを1回確かめる',
                       needs: '**所在は決まった（2026-08-28）。事故台帳は作成済み。**'
                            + '残るのは本店に議事録・株主名簿が実在するかを見ること。'
                            + '**無かった場合も日付を入れる** —— 確かめたことは確かめたこと。'
                            + 'あわせて取締役会設置会社かどうか（登記事項）。'
                            + '非設置なら取締役会議事録はそもそも不要で、株主総会議事録だけが対象になる',
                       satisfied_when: [
                         { file: 'data/corporate-obligations.json',
                           path: 'records[id=board-minutes].existence_confirmed_at' },
                         { file: 'data/corporate-obligations.json',
                           path: 'records[id=shareholder-register].existence_confirmed_at' },
                         { file: 'data/corporate-obligations.json',
                           path: 'records[id=incident-records].where' },
                       ] },
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
  // [2026-08-27] **`refund_boundary` を消した。**「上限額を決めない限り自動側へ置けない」と
  // 書いてあったが、Apple のドキュメントを取って読んだら**返金を発行するエンドポイントが
  // 存在しない。**機械が返金できないので、上限額は何も止めていなかった。
  //
  // 残った本当の境界（refundPreference をAppleに出すか）は owner_only なので
  // unlock を持てない —— 行の note に書いてある。ここに残るのは実装のほう。
  // [2026-08-27] **実測で分かれた。**鍵は通る（probe が 404 を返した ＝ 認証は抜けた）が、
  // 通知URLが設定されていない。そして**設定する面が機械に無い** ——
  // App Store Connect API の webhooks は BUILD_UPLOAD_STATE_UPDATED などの
  // ビルド・審査の事象だけで、CONSUMPTION_REQUEST は入っていない。
  // Server API の索引にも無い。**両方数えた上で、人の画面操作しか残らなかった。**
  refund_notification_url: { kind: 'owner_input',
                       label: 'App Store Connect で通知URLを1回設定する',
                       needs: '**機械にはこの面が無い**（ASC API・Server API の索引を'
                            + '両方数えて確認）。人が App Store Connect の画面で1回設定する。'
                            + '**設定さえ済めば、受け口も応答も機械側で完結する** ——'
                            + 'これは繰り返し人が要る類の壁ではなく、一度きりの錠',
                       satisfied_when: [{ file: '../simplememo-ios/data/asc-server-api.json',
                                          contains: '"notification_url_configured": true' }] },
  refund_observe:    { kind: 'wait', label: '実際の返金が1件届くのを待つ（受け口は本番に在る）',
                       needs: '**[2026-08-28] `implement` から `wait` へ移した。作るものが無くなった。**'
                            + 'ここには「鍵が通るか未確認」「受け口が要る」と書いてあったが、'
                            + 'どちらも解決済み —— 鍵は通り（`bid` クレームを足すだけだった）、'
                            + '通知URLは設定済み（asc-server-api.json の '
                            + '`notification_url_configured: true`・Apple のテスト配信が SUCCESS）、'
                            + '受け口・検証器・記録・保持は simplememo-api#193 で main に入った。'
                            + '**残っているのは、実際の返金が1件届くこと**だけで、これは実装では早められない。'
                            + '\n\n**この欄が古いまま `implement` だったことの害は、件数ではなく向きに出る** —— '
                            + '`--plan` が「作れば進む」と言い続け、**既に在るものを作る計画**を毎回先頭付近に置く。'
                            + '到達可能の分類（reachable）は変えていない。変えたのは「誰が動かすか」だけ' },
  // [2026-09-03] **前提が2つとも失効していた。**この欄は「移行0027の適用」と
  // 「母数 — inquiries は現在0件」を待ちに数えていたが、**どちらも既に済んでいる。**
  // 待ちを2つ抱えたままだと `--plan` がこの行を「まだ材料が無い」側に置き続け、
  // **実装で届くものが待ちに見える**（この登録簿が refund_observe で一度直した向きの、逆）。
  inquiry_facts:     { kind: 'implement', label: '再現ファクトから、テストとIssueを実際に作る側を作る',
                       needs: '**取り出す経路は 2026-08-26 に作った**（relay の summarizeReproFacts）。'
                            + '残るのは、それが日報の文面ではなく**リポジトリ側から読める形**で出ること。'
                            + '\n\n**[2026-09-03 訂正] 待ちに数えていた2つは、どちらも済んでいた。**'
                            + '\n\n**(1) 移行0027 は適用済み。**`simplememo-api/migrations/historical/'
                            + '2026-09-01_backfill_d1_migrations_0026_0028.sql` が**スキーマ側で確認**して'
                            + 'そう書いている（`device` cid 12 / `os` cid 13 が在る＝0026 と 0027 は適用済み）。'
                            + '台帳の行が欠けていただけで、DDL は 2026-08-27 22:17 に当たっていた。'
                            + '2026-09-03 時点で `migrations list --remote` は「適用するものは無い」。'
                            + '\n\n**(2) inquiries は0件ではない。**`simplememo-api/docs/email_intake.md` が'
                            + '実データの `email_hash` を並べ、同一差出人・同一分類で `auto_replied` が '
                            + '**0 → 1 に遷移した**のを記録している（独立に2回）。'
                            + '「直近24時間の auto_replied=1 は0件」という**数え上げも実データに対して**行われている。'
                            + '\n\n**したがって残っているのは実装だけ。**ただし設計判断が1つ要る —— '
                            + '**取り出し口をどこに置き、誰が読むか。**relay の管理鍵は '
                            + '`data/release-materials.json` が「**本番の管理鍵を、日次の可視化のためだけに'
                            + '別リポジトリの CI へ広げない**」と定めており、simplememo は公開リポジトリ。'
                            + '**[2026-09-03 続き] 決めて、作った。**オーナーが「simplememo-api が自分で書く」を選んだので、'
                            + '`GET /admin/repro-facts` と日次ワークフローを**あちら側に**足した（simplememo-api#236）。'
                            + '`ADMIN_API_KEY` は元からあちらにしか無いので、**鍵は1ミリも広がっていない。**'
                            + 'このリポジトリは置かれた `data/repro-facts.json` を読むだけでよい。'
                            + '\n\n**作るものは無くなった。残っているのは1周動いたのを見ること**'
                            + '（日次は 06:20 UTC / 15:20 JST）。'
                            + '\n\n**[2026-09-04 訂正] ここで `wait` にしたのは誤りだった。**'
                            + '「作るものは無い」と書いたが、**それは材料の話で、2行の題名の話ではない。**'
                            + '\n\n    行が言っていること   再現テストを**自動生成**する / Issueと回帰テストを**作成**する'
                            + '\n    作ったもの           端末/OS/版/分類の**数え上げ**を機械が読める形に置いた'
                            + '\n\n**材料が読めるようになっただけで、生成はしていない。**2行の note は元から'
                            + '「手動運用」「手動では実績あり」と書いてあり、そこは変わっていない。'
                            + '`kind` を `implement` へ戻し、ラベルも残っている作業のほうに直した —— '
                            + '**材料の完了を、行の完了と数えない。**' },
  // [2026-09-07] Public-text analysis is now performed by AI. Historical human
  // verdicts, actual agreement applicability, and DPA operations are separate.
  // Do not send the owner back to documents already read, or equate reading
  // with approval. This next-action classification does not change executors.
  vendor_terms:      { kind: 'implement', label: 'AI条項検査の残資料・実契約・運用条件を照合する',
                       needs: '公開規約の分析記録は data/corporate-obligations.json の '
                            + 'contract_review.ai_assessments を参照する。過去の人の判定を上書きしない。'
                            + '原文取得とAI分析を、人による再読だけを待つ作業として扱わない。'
                            + '\n\n残作業: 利用サービスに対応する契約版・注文書・請求地域・例外を照合し、'
                            + 'DPAの受諾、再委託先、SCC、設定、削除・撤退手順、SLAを確認する。'
                            + 'Firebaseの共通GCP本文は既存分析を参照し、同じ本文の複製で件数を増やさない。'
                            + '追加条項の読了範囲と実管理画面の観測は '
                            + 'docs/firebase-service-scope-2026-09-07.md に記録している。'
                            + '\n\n条項検査・DPA等の審査・定型契約の比較は対象範囲が異なる。'
                            + '各行の実行証跡を揃えてから個別に移管を判断し、公開文書の読了だけで'
                            + '契約承認や全業務完了にしない。新規の契約受諾など別途の操作条件は維持する。'
                            + '\n\n改定検知は seo-daily の月曜ゲートで週1回。主URLの指紋は'
                            + 'リンク先の全文監視を保証しない。取得失敗・文字コードの変化・未読文書を'
                            + '未確認として扱い、最新の取得記録を参照する。' },
  impl_product:      { kind: 'implement', label: 'プロダクト側を作る',
                       needs: 'PRDの定型化 / カナリアを本番で1周 / 課金失敗の回復 / 障害案内の一斉配信' },
  // [2026-08-27] オーナー判断「お金周りを除いて渡す」で、境界24件のうち15件が
  // policy_boundary から外れた。**外れた先は自動側ではなく実装側。**
  // 下の2つは、その15件が「何をすれば動くか」を分けたもの。
  // [2026-08-28] **`structural`（不能）から出てきた最初の行。**
  // 「セッションのログが外部から読めない」は transcript については正しいが、
  // **走ったかどうかは Routines API の last_run が返す。**読む側を一度も
  // 試さずに不能と書いていた。読んだ瞬間に4件の停止・失敗が見つかっている。
  // [2026-08-28 夕] **`implement` から `owner_input` へ移した。作って回して確かめた。**
  // `create_trigger` で日次 Routine を作り `fire_trigger` で1回走らせたところ、
  // **`environment_id` は引き継がれた**（＝sources は明示すれば付く）が、
  // **`mcp__*` は引き継がれない**（作成時に警告が返り、allowed_tools にも1つも無い）。
  // `list_triggers` が呼べない以上、Routine 側からは写しを取り直せない。
  // 実走は SUCCEEDED で終わり、ブランチもPRも作られなかった（`cse_015iYEg3GrcfQ2A55jv9aZD1`）。
  // **日次で失敗し続けて未対応枠を食うので Routine は削除した。**
  // [2026-08-28 夕] **UI の経路も叩いた。閉じた。**オーナーが Routines UI から作って
  // 1回走らせたが、ブランチ0・PR0。原因は connector ではなく**リポジトリ**のほうで、
  // **編集画面にリポジトリを指定する欄が無い**（名前/手順/頻度/権限の4つだけ）。
  // 発火するのは Cowork のセッション（folders_state: NONE・sources 無し）。
  //
  // **それでも never へは落とさない。**叩いていない面が2つ残っている:
  //   (1) 既存の副系Routine（環境IDを持ち、現にPRを作っている）のセッションが MCP を持つか
  //   (2) 自己バインドの Routine（既存セッションへ配信されるので、そのMCPが使える）
  // 2回とも last_run は SUCCEEDED だった。**成功表示を根拠にしないこと。**
  impl_routine_snapshot: { kind: 'owner_input', label: '副系の発火記録を定期的に取り直す（主体がまだ居ない）',
                           needs: '検査は実装済み（scripts/check-routine-runs.mjs）で、'
                                + '写しの鮮度・列挙の網羅・ラチェットを見る。**取り直しの `--sync` も実装済み。**'
                                + '**残るのは写しを取り直す主体** —— `list_triggers` は'
                                + 'セッションのMCPツールでCIのランナーからは叩けず、'
                                + '**`create_trigger` で作った Routine は MCP を持てず**、'
                                + '**Routines UI で作った Routine はリポジトリを持てない**'
                                + '（2026-08-28 に両方とも実走で確認）。'
                                + '残る未検証は「既存の副系Routineが MCP を持つか」と「自己バインド」の2つ。'
                                + '取り直しが自動になれば、記録は主系（Actions の run 列挙）と'
                                + '同じ意味で完結する' },
  // [2026-08-28] **`impl_machine_gate`（9件）と `impl_granted`（6件）を消した。**
  // この2つが、上位3群で「実装すれば +18件（+9.0pt）」と出していた入口だが、
  // **15件のうち12件は、行の unblocked_by が自分で「人に残した」と書いていた。**
  // 権限表と1件ずつ突き合わせて `policy_boundary` / `human_consent` へ移した
  // （PR TIMES配信・ChatOps起動・削除要求・危機対応・停止訓練・要望の採否・
  //   SNS再開・タグ作成・緊急kill・課金導線・推論の置き場所・収集同意）。
  //
  // **消したのは入口であって、仕事ではない。**残った3件は本当に残っていて、
  // ただし要るものが3件とも違ったので、下の2つへ割った
  // （App Review提出 / App Store公開 → `ship_execute`、段階公開の昇格 → 待ち）。
  //
  // **同じ誤りをもう一度入れないために。**この2つの入口が長く残ったのは、
  // 「境界が外れた」と「作れば動く」を1つの語で書いていたからで、
  // 権限表を見れば1件ずつ違うと分かる状態だった。
  // **入口の名前は、要るものを名指しできる粒度で切ること。**
  impl_invoice_reconcile: { kind: 'implement', label: '請求と入金の照合を作る（鍵はもう在る）',
                       needs: '**freee の OAuth は 2026-08-27 から本番で動いている。**'
                            + '`FREEE_CLIENT_ID` / `FREEE_CLIENT_SECRET` は Workers の secret に在り、'
                            + 'refresh token は KV の `freee:refresh_token`。'
                            + '`/api/1/walletables`（口座）と `/api/1/wallet_txns`（明細）は既に叩いている。'
                            + '**新しい鍵も新しいアプリも要らない。**\n\n'
                            + '**足りないのは請求書側だけ** —— freee請求書 API の `GET /invoices` から '
                            + '`issue_date` / `due_date` / `partner_*` / `payment_status` / `payment_date` / '
                            + '`due_amount` を取り、入金済みかを読む。**この行が要求しているのは'
                            + '「入金済みか」までなので `payment_status` で足りる。**\n\n'
                            + '**既存アプリの権限に `invoices` の GET を足すと再認可が要りうる** —— '
                            + '動いている `freee_balance` を壊す形になりかねないので、'
                            + '**先に壊さない手順を決めてから触る。**\n\n'
                            + '**期日つき: 2026-09-21 に `GET /invoices` の破壊的変更**'
                            + '（`limit + offset` が 10,000 以上のリクエストが制限対象）。'
                            + '**日付範囲で取る形にしておけば当たらない。**' },

  // [2026-09-03] **境界が外れた行。**オーナーが submit_review=false に限って渡した
  // （権限表「アプリのビルド・TestFlight内部配信」の ai_may）。**作るものは無い** ——
  // 経路（release.yml）も門（preflight の CI緑判定）も元から在り、塞いでいたのは
  // 書いてある規則のほうだった。したがって implement ではない。
  //
  // `wait` にしたのは reply_gate（「自動投稿が1周 dry_run で動いたのを見る」）と
  // 同じ理由 —— **残っているのは1周見ることだけ**で、その機会は次の出荷が要るときに来る。
  // 出荷の必要が無いのに1回起動してみせるのは、TestFlight のビルド番号を焼くだけで
  // 何も確かめていない（番号は再利用できない）。
  testflight_first_dispatch: { kind: 'wait',
                       label: 'AI が TestFlight 配信を1回起動したのを見る（経路も門も在る）',
                       needs: '**2026-09-03 にオーナーが submit_review=false に限って渡した。**'
                            + '作るものは無く、残っているのは AI が `release.yml` を '
                            + '`submit_review=false` で1回起動し、TestFlight に載るまでを見ること。'
                            + '\n\n**技術的な経路は元から開いていた** —— MCP の `actions_run_trigger` は '
                            + 'actions:write を持ち（2026-08-28 実測）、issue コメントの橋は'
                            + 'セッションをオーナーとして通す（run 30699556723 で実際に出荷済み）。'
                            + '**塞いでいたのは書いてある規則で、機械の門ではなかった。**'
                            + '\n\n機会は次の出荷が要るときに来る。**確かめるためだけに起動しない** —— '
                            + 'TestFlight のビルド番号は再利用できないので、焼くだけで何も確かめていない' },
  ship_execute:      { kind: 'implement', label: '出荷の実行側を作る（門はもう在る）',
                       needs: '**門は 2026-08-28 に入った**（#708・`scripts/check-release-gate.mjs` の '
                            + '`evaluateSubmission` / `evaluateRelease`）。権限表も同日に '
                            + '`requires_approval: false` ＋ machine_gate へ動いている。'
                            + '**残っているのは実行側** —— ASCへの提出・公開を実際に呼ぶ経路と、'
                            + 'タグ作成の権限。**そのあとに `policy.enabled` を立てる操作が要り、'
                            + 'そこは権限表で human_only**（AIが自分で立てる経路は作らない）。'
                            + '\n\n**門ができたことを「動いた」と数えない** —— '
                            + 'coverage 台帳の executor は据え置いてある' },
  // [2026-09-01] kind を `wait` → `owner_input` へ。**待っても母数は貯まらない**ことを
  // ガード自身が計算して出した（run 33497186518）。needs に全文と算数を置いてある。
  rollout_first_pass:{ kind: 'owner_input',
                       label: 'カナリアの母数を判定に届かせる（窓を広げるか、上限を上げる）',
                       needs: '**[2026-09-01 訂正] 「待つだけ」は誤りだった。待っても母数は貯まらない。**'
                            + '旧版はここに「作るものもオーナー操作も残っていない／残るのは48時間の'
                            + '寝かせと各群30の母数で、どちらも実装では早められない」と書いていた。'
                            + '**寝かせは 08-29 に明けており、それでも通っていない。**'
                            + '\n\n門は毎日走っている（rollout-promote.yml・schedule）。'
                            + '**2026-09-01 10:23Z の run 33497186518 が、止めている理由を自分で計算して出した:**'
                            + '\n\n```\n露出 9 / 対照 45（版が古い 4 は除外済み）＝ 窓の母数 54\n'
                            + '各群 30 が要る → 2群で最低 60。**54 < 60 で足りない**\n'
                            + '露出を 30 にするには rollout 56% 以上\n'
                            + '機械の上限は 50%（max_auto_rollout）→ 露出 27 で、**30 に届かない**\n```'
                            + '\n\n**ガード自身の言葉: 「窓は転がるので、待っても母数は貯まらない」。**'
                            + '窓は3日で、必要なのは約10日ぶん。**時間の問題ではなく窓幅と母数の問題。**'
                            + '\n\n**したがって「門が効き始めるのは25%以降」も誤りだった** —— '
                            + '25%でも50%でも、この母数では判定に届かない。動く道は2つしかない:'
                            + '\n\n  (a) オーナーが rollout を 56% 以上へ上げる。**機械の上限 50% を超える**ので'
                            + '委譲の外（`max_auto_rollout` を上げること自体がオーナー判断）'
                            + '\n  (b) ガードの窓を 3日 → 約10日 へ広げる。実装で届くが、'
                            + '**kill を持つガードの検知遅延を伸ばす**変更なので、率のために黙って倒さない'
                            + '\n\n**分類は据え置いた。**(b) が実在する以上 `never` ではなく、'
                            + '`statistical_power` へ倒すと「install が増えれば解ける」ことまで消える。'
                            + '**変えたのは「誰が動かせば進むか」だけ** —— ⑨返金と④出荷でやったのと同じ訂正。' },
  // [2026-08-31] **`vendor_terms` から1行だけ切り出した。**
  // ⑦「定型／非定型契約の分類」は「人が規約を読む」を待っていたが、
  // **分類に要るのは規約本文ではなく台帳**（書面契約ゼロ ＋ 11社の terms_accepted_by）で、
  // それは既に手元にある。**待ち方そのものが間違っていた行。**
  impl_contract_class: { kind: 'implement', label: '契約の定型／非定型を機械が導く経路を作る',
                       needs: '**材料は揃っている** —— `../simplememo-api/data/contract-register.json` の '
                            + 'contracts は空（書面契約ゼロ）、成立している11社は `data/vendor-register.json` の '
                            + '規約同意。**無いのは導く側とCIの照合。**'
                            + '\n\n非定型は人の承認が要る（権限表「契約・支払い・送金」が human_only）ので、'
                            + '**機械が出せるのは分類と食い違いの検出まで。**'
                            + '`check-contracts.mjs` は既に `kind: "non_standard"` に '
                            + '`approved_by: "human"` を要求している。'
                            + '\n\n**分母が薄いことは自覚しておく** —— いま分類の対象は11社で、'
                            + 'しかも全部が同じ種別（規約同意＝定型）になる見込み。'
                            + '**一度も発火しない検査を作らない**のがこの台帳の規則なので、'
                            + '作るなら「非定型が現れたときに承認を要求する」側が本体で、'
                            + '分類そのものは副産物として扱うこと' },
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
  analytics_vendors: { kind: 'implement', label: 'ahrefs / AppsFlyer / Firebase の継続取得',
                       needs: 'AppsFlyerの限定集計APIは取得成功。Ahrefsの継続取得とFirebase iOSの計測経路が残る。3社すべてが鍵待ちではない。WebのGA4をFirebase iOSのデータに代用しない。' },
  impl_onboarding: { kind: 'implement', label: '初回オンボーディングの課金導線を改善する',
                       needs: '2026-09-09の包括委任は受領済み。既存価格・権利を維持する提示とタイミングを設計・実装し、品質と配信の既存ゲートを通して適用する。未配信の設計や他業務の修正だけでは加点しない。' },
  // Retain the historical ID; the existing feed and official journal export are now verified.
  bank_feed:         { kind: 'implement', label: '取得済みの会計資料から照合・仕訳処理・月次締めを統合する',
                       needs: '既存freeeの銀行明細・収入支出取引・公式仕訳帳と個人口座の公式銀行原本・振込詳細を取得済み。会社関連送金と実引落を照合した。'
                            + '法人側の同期後原本、対応先未特定の入金、外部決済の帰属と内訳、期首残高・未登録明細・総額と手数料・税区分・配賦を照合し、'
                            + 'その根拠で必要な仕訳処理と月次締めの統合を実行・検証する。'
                            + '新しいアプリや資格情報は不要。読取成功・貸借一致だけでは業務完了にしない。' },
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

/** AI execution uses active tasks; starting a nobody task grows both counts.
 * Scenarios are arithmetic requirements, not authorization or execution evidence.
 * Never invent tasks or relabel a blocker to make a target attainable.
 */
export function executionPlan(doc, target = 0.9) {
  if (!Number.isFinite(target) || target <= 0 || target >= 1) {
    throw new Error('AI実行率の目標は0超100未満で指定する');
  }
  if (!Array.isArray(doc?.tasks) || doc.tasks.some((t) =>
    !t || (!AI.has(t.executor) && !NON_AI.has(t.executor) && t.executor !== 'intentional_no'))) {
    throw new Error('tasks又はexecutorが不正');
  }
  const s = summarize(doc).overall;
  if (!s.doing) throw new Error('実施中タスクが無くAI実行率を計算できない');
  const outstanding = doc.tasks.filter((t) => NON_AI.has(t.executor));
  if (outstanding.some((t) => !BLOCKERS[t.blocker])) throw new Error('未登録のblocker');
  const active = outstanding.filter((t) => t.executor !== 'nobody');
  const fresh = outstanding.filter((t) => t.executor === 'nobody');
  const reachableActive = active.filter((t) => BLOCKERS[t.blocker].klass === 'reachable').length;
  const reachableNew = fresh.filter((t) => BLOCKERS[t.blocker].klass === 'reachable').length;
  const scenarios = fresh.map((_, i) => i + 1);
  scenarios.unshift(0);
  const rows = scenarios.map((started) => {
    const denominator = s.doing + started;
    let required = Math.floor(target * denominator) + 1;
    // Correct floating-point products at integral thresholds, e.g. 58% of 50.
    while (required / denominator <= target) required += 1;
    const transfer = Math.max(0, required - s.ai_executes - started);
    return {
      newly_started: started, active_transfers_required: transfer,
      total_changes: started + transfer, numerator: s.ai_executes + started + transfer,
      denominator, rate: (s.ai_executes + started + transfer) / denominator,
      arithmetically_possible: transfer <= active.length,
      within_classified_reachable: transfer <= reachableActive && started <= reachableNew,
    };
  });
  const ceilingNumerator = s.ai_executes + reachableActive + reachableNew;
  const ceilingDenominator = s.doing + reachableNew;
  return {
    metric: 'ai_execution_rate', comparison: 'strictly_greater_than', target,
    current: s, reachable_active: reachableActive, reachable_nobody: reachableNew,
    classified_ceiling: { numerator: ceilingNumerator, denominator: ceilingDenominator,
      rate: ceilingNumerator / ceilingDenominator },
    scenarios: rows,
    tasks: outstanding.map(({ area, task, executor, blocker, unlock }) =>
      ({ area, task, executor, blocker, unlock, classification: BLOCKERS[blocker].klass })),
    limitations: [
      '既存台帳のタスクだけを使う。細分化・架空タスク追加による達成を計画しない。',
      '到達可能分類は実装・資料・観測待ちも含む楽観上限。完了や権限委譲の証拠ではない。',
      '既存分類を自動変更しない。境界変更は対象業務の条件と実行証跡を確認して別途行う。',
    ],
  };
}

/** 台帳を読まずに検査そのものを検査する（automation-rate.mjs / autopilot-runs.mjs と同じ作法）。 */
export function selftest() {
  const problems = [];
  const mk = (executor, blocker) => ({ area: '① 検査用', task: 't', executor, blocker, unblocked_by: 'u', evidence: [] });

  const execDoc = { tasks: [
    ...Array.from({ length: 141 }, () => mk('ai_executes_gated')),
    ...Array.from({ length: 34 }, () => mk('ai_proposes', 'policy_boundary')),
    ...Array.from({ length: 24 }, () => mk('nobody', 'not_started')),
    mk('intentional_no'),
  ] };
  const ep = executionPlan(execDoc);
  if (ep.scenarios[0].active_transfers_required !== 17) problems.push('90%超に必要な既存移管数');
  if (ep.scenarios[24].active_transfers_required !== 15 || ep.scenarios[24].denominator !== 199)
    problems.push('未着手開始時の分母増加');
  if (ep.classified_ceiling.numerator !== 165 || ep.classified_ceiling.denominator !== 199
      || ep.scenarios.some((r) => r.within_classified_reachable)) problems.push('境界を到達可能に混ぜた');
  const exact = executionPlan({ tasks: [...Array.from({ length: 9 }, () => mk('ai_autonomous')),
    mk('human_only', 'policy_boundary')] });
  if (exact.scenarios[0].active_transfers_required !== 1) problems.push('90%ちょうどを90%超としている');
  const float = executionPlan({ tasks: [...Array.from({ length: 29 }, () => mk('ai_autonomous')),
    ...Array.from({ length: 21 }, () => mk('human_only', 'policy_boundary'))] }, 0.58);
  if (float.scenarios[0].active_transfers_required !== 1) problems.push('小数積の丸めで境界を誤る');
  for (const [badDoc, badTarget] of [[execDoc, 1], [execDoc, NaN], [execDoc, 0],
    [{ tasks: [] }, 0.9], [{ tasks: [mk('unknown')] }, 0.9],
    [{ tasks: [mk('ai_autonomous'), mk('human_only', 'unknown')] }, 0.9]]) {
    let failed = false;
    try { executionPlan(badDoc, badTarget); } catch { failed = true; }
    if (!failed) problems.push('実行率計画が不正入力を受け入れた');
  }

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

  // After API306, plans must wait for actual paired observations, without a
  // calendar/file-existence predicate that would turn an empty report into credit.
  {
    const doc = { tasks: [{ area: 'A', task: 'paid cohort evaluation', executor: 'ai_proposes',
      blocker: 'verification_pending', unlock: 'bq_28d', evidence: [] }] };
    const pl = planTo(doc, 1);
    if (pl.steps[0]?.kind !== 'wait' || UNLOCKS.bq_28d.satisfied_when) {
      problems.push('接続済みの購読評価を再実装へ戻すか、日数・空の評価だけで解除している');
    }
    if (pl.now !== 0 || pl.denominator !== 1) problems.push('待ち先の訂正を完了実績へ加算した');
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
    // [2026-08-28] 配列の引き当て。**これが無い間、company_facts の述語は
    // 構造的に真になれなかった。**
    ['**配列を id で引ける**',
      { file: 'data/corporate-obligations.json', path: 'deadlines[id=corporate-tax].next_due' }, true],
    ['引き当たらない id は満たさない',
      { file: 'data/corporate-obligations.json', path: 'deadlines[id=そんな行は無い].next_due' }, false],
    // [2026-09-02] **検体を実データから外した。**この行は長らく
    // `deadlines[id=domain-renewal].next_due` が null であることに寄りかかっていたが、
    // **週次が RDAP から 2027-01-30 を入れた日に、検体のほうが崩れた。**
    // 検査が壊れたのではなく、**検体が「まだ埋まっていない実データ」を借りていた。**
    // 埋まるのが目的の欄を検体に使うと、目的を達成した日に落ちる。
    // （このリポジトリは同じ形を何度か踏んでいる —— 件数を焼き込んだ検体、など。）
    // **借りるのをやめて、その場で作る。**`root` を差し替えられるので実データは要らない。
    ['**引き当たっても値が null なら満たさない**（在ることと埋まっていることは違う）',
      { file: 'data/corporate-obligations.json',
        path: 'deadlines[id=fixture].next_due' }, false, { fixture: { deadlines: [{ id: 'fixture', next_due: null }] } }],
    // **false は「確かめた」なので満たす。**null（確かめていない）と混ぜない。
    // company_facts が Apple の auto_renew_confirmed をこの形で見る ——
    // 自動更新が入っていなかった（false）としても、**確かめたことは確かめたこと。**
    ['**false は「確かめた」なので満たす**（null と混ぜない）',
      { file: 'data/corporate-obligations.json',
        path: 'deadlines[id=domain-renewal].confirmed_by_owner' }, true],
  ];
  for (const [label, pred, want, opts] of predCases) {
    let got;
    let root;
    if (opts?.fixture) {
      // **その場で作った台帳で確かめる。**実データの「まだ埋まっていない欄」を借りない。
      root = fs.mkdtempSync(path.join(os.tmpdir(), 'autonomy-pred-'));
      fs.mkdirSync(path.join(root, 'data'), { recursive: true });
      fs.writeFileSync(path.join(root, pred.file), JSON.stringify(opts.fixture));
    }
    try { got = blockedOnSatisfied(pred, root ? { root } : {}); }
    catch (e) { problems.push(`述語: ${label} で例外: ${e.message}`); continue; }
    finally { if (root) fs.rmSync(root, { recursive: true, force: true }); }
    if (got !== want) problems.push(`述語「${label}」が ${got}（${want} のはず）`);
  }

  // **満たされようがない述語を見つけるか。**
  //
  // [2026-08-28] ここが空いていたので `company_facts` が2日間、
  // 存在しないフィールドを見ていた。**「まだです」と言い続ける誤りは静かで、
  // 出力だけを見ていると正しく動いているのと区別がつかない。**
  {
    const REAL = 'data/corporate-obligations.json';
    const cases = [
      ['**書かれる予定の null は正当な待ち**（誤検出しない）',
        { file: REAL, path: 'deadlines[id=domain-renewal].next_due' }, false],
      ['**存在しないフィールドは幻**（誰も書かない）',
        { file: REAL, path: 'そんなフィールドは無い' }, true],
      ['引き当たらない配列要素も幻',
        { file: REAL, path: 'deadlines[id=そんな行は無い].next_due' }, true],
      ['途中の段が無ければ幻',
        { file: REAL, path: 'entity.そんな段.値' }, true],
      ['**まだ生成されていないファイルは判定しない**（確かめようがない）',
        { file: 'data/そんなファイルは無い.json', path: 'x' }, false],
      ['path の無い述語は対象外', { file: REAL }, false],
      ['dir の述語は対象外', { dir: 'scripts', atLeast: 1 }, false],
    ];
    for (const [label, pred, wantBad] of cases) {
      let why;
      try { why = predicateUnreachable(pred); } catch (e) {
        problems.push(`到達性: ${label} で例外: ${e.message}`); continue;
      }
      if (Boolean(why) !== wantBad) {
        problems.push(`到達性「${label}」が ${JSON.stringify(why)}（${wantBad ? '鳴るはず' : '鳴らないはず'}）`);
      }
    }
    // **check() から鳴ること。**関数が正しくても呼ばれていなければ何も起きない
    //（この自己テストは 2026-08-26 に「check() を一度も呼んでいなかった」をやっている）。
    const phantom = { kind: 'wait', label: '幻の入口', needs: 'x',
      satisfied_when: [{ file: REAL, path: 'そんなフィールドは無い' }] };
    const doc = { blocked_on_missing_budget: 99, tasks: [] };
    if (!check(doc, { unlocks: { u: phantom } }).some((x) => x.includes('満たされようがない'))) {
      problems.push('**満たされようがない述語を check() が落とさない**'
        + '（永久に開かない入口が「まだです」の顔で残る）');
    }
    if (check(doc, { unlocks: { u: { ...phantom,
      satisfied_when: [{ file: REAL, path: 'deadlines[id=domain-renewal].next_due' }] } } })
      .some((x) => x.includes('満たされようがない'))) {
      problems.push('正当な待ち（null）を「満たされようがない」と言った（常に鳴る検査）');
    }
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
  // [2026-08-28] **配列の引き当てを足した。**足すまでは `company_facts` の述語が
  // `data/credential-expiry.json` の最上位に `domain_renewal_at` があることを期待して
  // いたが、**その名前のフィールドはどのファイルにも無い。**実際に書かれているのは
  // `data/corporate-obligations.json` の `deadlines[]` の中で、ドット記法では届かなかった。
  // **述語が構造的に真になれない状態が、誰にも気づかれずに残っていた。**
  //
  // ここで「読める場所に写しを置く」ほうへ倒さない。写しは正が2つになり、
  // 片方が古くなったときに**述語が嘘をつく側**へ倒れる。読めない側を直す。
  const at = (obj, dotted) => dotted.split('.').reduce((o, k) => {
    if (o == null) return o;
    const m = /^([^[\]]+)\[([A-Za-z_$][\w$]*)=([^\]]+)\]$/.exec(k);
    if (!m) return o[k];
    const arr = o[m[1]];
    if (!Array.isArray(arr)) return undefined;
    return arr.find((e) => e && e[m[2]] === m[3]);
  }, obj);
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

/**
 * **その述語は、そもそも満たされうるか。**
 *
 * [2026-08-28] `company_facts` の述語が `data/credential-expiry.json` の
 * `apple_developer_enrolled_at` / `domain_renewal_at` を見ていた。
 * **どちらのフィールドも、どのファイルにも存在せず、書く経路も無かった。**
 * 入口は「オーナーが埋めれば開く」顔をして、実際には**永久に開かない**。
 *
 * 効いたのはこの非対称: **満たされない述語と、まだ満たされていない述語は、
 * 出力が同じ `false` で見分けがつかない。**「まだです」と言い続けるので静かに正しく見える。
 * 2日誰も気づかなかったのは怠慢ではなく、**気づける形をしていなかったから。**
 *
 * 見分け方は構造にある。この台帳の作法では、**埋まる予定のフィールドは `null` で先に
 * 置いてある**（`auto_renew_confirmed: null` ＋ `$auto_renew_confirmed` の由来書き）。
 * だから「キーが在って値が null」は正当な待ちで、**「キーそのものが無い」は誤記か幻。**
 *
 * ファイルがまだ無い場合は判定しない —— これから生成されるファイルを指す述語は正当で、
 * **中身の形は確かめようがない。**確かめられないものを確かめたことにしない。
 */
export function predicateUnreachable(pred, { root = ROOT } = {}) {
  if (!pred.file || !pred.path) return null;
  const abs = path.join(root, pred.file);
  if (!fs.existsSync(abs)) return null;
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;   // 壊れている件は blockedOnSatisfied が例外で鳴らす。二重に鳴らさない
  }
  const keys = pred.path.split('.');
  const leaf = keys.pop();
  let cur = doc;
  for (const k of keys) {
    const m = /^([^[\]]+)\[([A-Za-z_$][\w$]*)=([^\]]+)\]$/.exec(k);
    if (m) {
      const arr = cur?.[m[1]];
      if (!Array.isArray(arr)) return `${pred.file}: ${m[1]} が配列でない`;
      cur = arr.find((e) => e && e[m[2]] === m[3]);
      if (cur === undefined) return `${pred.file}: ${k} に当たる要素が無い`;
      continue;
    }
    cur = cur?.[k];
    if (cur === undefined) return `${pred.file}: ${k} が無い`;
  }
  const m = /^([^[\]]+)\[([A-Za-z_$][\w$]*)=([^\]]+)\]$/.exec(leaf);
  if (m) {
    const arr = cur?.[m[1]];
    if (!Array.isArray(arr)) return `${pred.file}: ${m[1]} が配列でない`;
    return arr.some((e) => e && e[m[2]] === m[3]) ? null : `${pred.file}: ${leaf} に当たる要素が無い`;
  }
  if (cur === null || typeof cur !== 'object') return `${pred.file}: ${keys.join('.')} がオブジェクトでない`;
  return (leaf in cur) ? null
    : `${pred.file}: ${pred.path} というフィールドが無い`
      + '（**埋まる予定なら `null` で置いてある**のがこの台帳の作法。'
      + '無いということは、誰も書かない ―― この述語は満たされようがない）';
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
  // **満たされようがない述語を持っていないか。**（predicateUnreachable の由来を参照）
  // これは上の「もう開いている」と**反対向きの誤り**で、同じ `false` に化ける。
  // 片方だけ見ていると、永久に開かない入口が「まだです」の顔で残る。
  for (const [id, u] of Object.entries(unlocks)) {
    for (const pr of u.satisfied_when || []) {
      const why = predicateUnreachable(pr);
      if (why) {
        problems.push(`入口「${u.label}」(${id}) の述語が満たされようがない — ${why}`
          + '。**オーナーが埋めても機械は開いたと言わない。**'
          + '見る先を実際に書かれている場所へ直すこと');
      }
    }
  }

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
  if (argv.includes('--execution-plan')) {
    try {
      const p = executionPlan(doc, ti < 0 ? 0.9 : Number(argv[ti + 1]) / 100);
      if (argv.includes('--json')) console.log(JSON.stringify(p, null, 2));
      else {
        console.log(`AI実行率 ${pct(p.target)} 超（厳密な > 判定）`);
        console.log(`現在 ${p.current.ai_executes}/${p.current.doing} = ${pct(p.current.ai_execution_rate)}`);
        console.log(`総合 ${pct(p.current.overall_automation_rate)} / 関与 ${pct(p.current.ai_involvement_rate)} / カバー ${pct(p.current.coverage_rate)}`);
        console.log(`現在の到達可能分類の楽観上限 ${p.classified_ceiling.numerator}/${p.classified_ceiling.denominator} = ${pct(p.classified_ceiling.rate)}`);
        console.log('未着手から開始 / 既存業務のAI移管 / 合計変更 / 達成時の分数 / 現分類内');
        for (const r of p.scenarios) console.log(`${r.newly_started} / ${r.active_transfers_required} / ${r.total_changes} / ${r.numerator}/${r.denominator} / ${r.within_classified_reachable ? '候補あり' : '分類上は不足'}${r.arithmetically_possible ? '' : '（既存件数では不可）'}`);
        for (const note of p.limitations) console.log(note);
      }
    } catch (e) { console.error(e.message); process.exit(1); }
    process.exit(0);
  }
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
