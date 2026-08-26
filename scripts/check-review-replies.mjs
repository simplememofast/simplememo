#!/usr/bin/env node
/**
 * App Store レビュー返信の**下書きと承認境界**を検査する。
 *
 *   node scripts/check-review-replies.mjs            # 表示
 *   node scripts/check-review-replies.mjs --check    # CI
 *   node scripts/check-review-replies.mjs --selftest
 *
 * 【なぜ返信だけ扱いが違うか】
 * レビュー返信は**公開される。**しかも書いた相手だけでなく、
 * ストアを見る全員に対する会社の発言になる。取り消しても
 * 「見た人が見なかったことにはならない」——これは段階公開の promote を
 * 人に残しているのと同じ理由（rollout-guard.ts）。
 *
 * したがって**この運用の非対称をそのまま当てる**:
 *
 *   下書きを作る     … 可逆。外に何も出ない        → **AIが実行してよい**
 *   下書きを検査する … 同上                        → AIが実行
 *   **投稿する**     … 公開。不可逆                → **人が承認する**
 *
 * **このファイルは投稿しない。**ASC への POST は持っていない。
 * 持たせるなら権限表（⑧）と、ここでの承認記録を先に通すこと。
 *
 * 【何を落とすか】
 *   - 捌いていないレビューへの下書き（review-intake に無い review_id）
 *   - **承認なしの posted**（承認者がAIのものも含む）
 *   - 承認より前に投稿した記録
 *   - 禁止表現・古い事実（check-pr-facts.mjs の checkText を再利用）
 *   - 個人情報の混入（**公開される文面なので、相手のメールアドレスも書けない**）
 *   - **期日や版の約束**（公開の場での約束は不可逆）
 *   - 長すぎる文面
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkText } from './check-pr-facts.mjs';
import { requireShape } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPLIES_PATH = path.join(ROOT, 'data/review-replies.json');
export const INTAKE_PATH = path.join(ROOT, 'data/review-intake.json');

/**
 * 文字数の上限。
 *
 * **Apple は公式に上限を公表していない。**業界で繰り返される 5,970 は
 * 有志の実測から来た値で、仕様ではない（＝予告なく変わりうる）。
 * したがって**その際どいところを狙わない。**実務上、レビュー返信が
 * 2,000字を超えることはまず無いので、そこで止める。
 * **公表されていない上限に頼る設計にしない**、が主眼。
 */
export const MAX_CHARS = 2000;
export const UNVERIFIED_APPLE_LIMIT = 5970;

/** 公開される文面に入ってはいけないもの。 */
const PII_PATTERNS = [
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/, what: 'メールアドレス' },
  { re: /\b0\d{1,4}-\d{1,4}-\d{3,4}\b/, what: '電話番号' },
  { re: /@[A-Za-z0-9_]{3,}/, what: 'SNSアカウント名' },
];

/**
 * 期日・版の約束。**公開の場で約束すると取り消せない。**
 * 「検討します」は約束ではないので通す。**断定的な予告だけを止める。**
 */
const PROMISE_PATTERNS = [
  { re: /次(の|回の)?(アップデート|バージョン|版|リリース)で(対応|修正|追加|実装)/, what: '次版での対応を約束している' },
  { re: /\d+月(まで|中)に(対応|修正|追加|実装|リリース)/, what: '期日を約束している' },
  { re: /(必ず|確実に)(対応|修正|追加|実装)(します|いたします)/, what: '無条件の約束になっている' },
  { re: /v?\d+\.\d+(\.\d+)?\s*で(対応|修正|追加)/, what: '版を名指しで約束している' },
];

/**
 * @param {Set|null} intakeIds  捌いたレビューの id。**null は「照合しない」**で、
 *   空の Set は「捌いたレビューが1件も無い」。この2つは違う。
 */
export function validate(doc, { intakeIds = null } = {}) {
  const problems = [];
  const seen = new Set();

  for (const r of doc.replies || []) {
    const at = `reply ${r.review_id || '(review_id無し)'}`;
    if (!r.review_id) { problems.push('review_id の無い下書きがある'); continue; }
    if (seen.has(r.review_id)) problems.push(`${at}: review_id が重複`);
    seen.add(r.review_id);

    // 捌いていないレビューに返信しない。**分類より先に文面を書かない。**
    //
    // [2026-08-26] ここは `intakeIds.size && !intakeIds.has(...)` だった。
    // **捌いた台帳が空だと、この規則が丸ごと消える。**
    // 空 = 「1件も捌いていない」なので、下書きが在るなら全部が違反のはず。
    // それを「照合する相手が無いから飛ばす」と読んでいた。
    // 公開は取り消せない（見た人が見なかったことにはならない）ので、
    // **ここを緩める方向の既定は置かない。**
    if (intakeIds && !intakeIds.has(r.review_id)) {
      problems.push(`${at}: review-intake.json に無いレビューへの下書き`
        + ' — **どう処理するかを決める前に文面を書かない**');
    }

    if (!r.draft || !r.draft.trim()) problems.push(`${at}: draft が空`);
    else {
      if (r.draft.length > MAX_CHARS) {
        problems.push(`${at}: ${r.draft.length}字（上限 ${MAX_CHARS}）`);
      }
      for (const p of PII_PATTERNS) {
        if (p.re.test(r.draft)) {
          problems.push(`${at}: 下書きに${p.what}が入っている`
            + ' — **返信は公開される。**相手の連絡先も書けない');
        }
      }
      for (const p of PROMISE_PATTERNS) {
        if (p.re.test(r.draft)) {
          problems.push(`${at}: ${p.what}`
            + ' — **公開の場での約束は取り消せない。**「検討します」までにする');
        }
      }
      // 禁止表現・古い事実は配信原稿と同じ物差しで見る
      // checkText は { mode, violations, missingName } を返す（配列ではない）
      const { violations } = checkText(r.draft);
      for (const x of violations || []) {
        problems.push(`${at}: ${x.message}（${x.rule}）`);
      }
    }

    // ここが本題 —— **承認なしに公開されない**
    if (r.posted_at) {
      if (!r.approved_by) {
        problems.push(`${at}: 承認なしで posted_at が入っている`
          + ' — **公開は人が承認する。**AIが実行してよい範囲ではない');
      } else if (r.approved_by === 'ai' || /claude|autopilot|bot/i.test(r.approved_by)) {
        problems.push(`${at}: 承認者が ${r.approved_by}`
          + ' — **AIは承認者になれない**（spend-approvals と同じ規律）');
      }
      if (r.approved_at && r.approved_at > r.posted_at) {
        problems.push(`${at}: 承認より前に投稿している（承認 ${r.approved_at} / 投稿 ${r.posted_at}）`);
      }
      if (!r.approved_at) problems.push(`${at}: posted_at はあるが approved_at が無い`);
    }
  }
  return problems;
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };
  const ids = new Set(['r1']);
  const base = (over = {}) => ({ replies: [{ review_id: 'r1', draft: 'ご報告ありがとうございます。状況を確認しています。', ...over }] });
  const has = (doc, needle) => validate(doc, { intakeIds: ids }).some((p) => p.includes(needle));

  t('普通の下書きは通る', validate(base(), { intakeIds: ids }).length === 0);
  // [2026-08-26] **空の台帳で規則が消える形**を固定する。
  t('**捌いた台帳が空なら下書きは全部違反**（空を「照合しない」と読まない）',
    validate(base(), { intakeIds: new Set() })
      .some((p) => p.includes('review-intake.json に無い')));
  t('null は「照合しない」（空の Set とは別）',
    validate(base(), { intakeIds: null })
      .every((p) => !p.includes('review-intake.json に無い')));
  t('捌いていないレビューへの下書きは落ちる',
    has({ replies: [{ review_id: 'zzz', draft: 'x' }] }, 'review-intake.json に無い'));

  // 承認境界
  t('**承認なしの投稿は落ちる**', has(base({ posted_at: '2026-08-25' }), '承認なしで posted_at'));
  t('**AIは承認者になれない**',
    has(base({ posted_at: '2026-08-25', approved_at: '2026-08-24', approved_by: 'claude' }), 'AIは承認者になれない'));
  t('autopilot も承認者にできない',
    has(base({ posted_at: '2026-08-25', approved_at: '2026-08-24', approved_by: 'autopilot' }), 'AIは承認者になれない'));
  t('人の承認があれば通る',
    validate(base({ posted_at: '2026-08-25', approved_at: '2026-08-24', approved_by: 'owner' }), { intakeIds: ids }).length === 0);
  t('承認より前の投稿は落ちる',
    has(base({ posted_at: '2026-08-23', approved_at: '2026-08-24', approved_by: 'owner' }), '承認より前に投稿'));
  t('approved_at の無い投稿は落ちる',
    has(base({ posted_at: '2026-08-25', approved_by: 'owner' }), 'approved_at が無い'));

  // 公開される文面
  t('メールアドレスは書けない', has(base({ draft: 'support@example.com までご連絡ください' }), 'メールアドレス'));
  t('電話番号も書けない', has(base({ draft: 'お電話 03-1234-5678 まで' }), '電話番号'));
  t('**次版での対応を約束できない**', has(base({ draft: '次のアップデートで対応します。' }), '次版での対応'));
  t('期日の約束も落ちる', has(base({ draft: '9月中に修正します。' }), '期日を約束'));
  t('版を名指しした約束も落ちる', has(base({ draft: 'v5.9 で対応します。' }), '版を名指し'));
  t('「検討します」は約束ではないので通る',
    validate(base({ draft: 'ご要望として検討します。ありがとうございます。' }), { intakeIds: ids }).length === 0);
  t('長すぎる下書きは落ちる', has(base({ draft: 'あ'.repeat(MAX_CHARS + 1) }), `上限 ${MAX_CHARS}`));
  t('**公表されていないApple上限より十分手前で止める**', MAX_CHARS < UNVERIFIED_APPLE_LIMIT / 2);
  t('禁止表現は配信原稿と同じ物差しで落とす',
    has(base({ draft: '完全自動化しています。' }), '完全自動化'));
  t('review_id の重複は落ちる',
    validate({ replies: [{ review_id: 'r1', draft: 'a' }, { review_id: 'r1', draft: 'b' }] }, { intakeIds: ids })
      .some((p) => p.includes('重複')));

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const doc = JSON.parse(fs.readFileSync(REPLIES_PATH, 'utf8'));
  const intake = JSON.parse(fs.readFileSync(INTAKE_PATH, 'utf8'));
  requireShape(intake, ['dispositions'], { what: 'data/review-intake.json',
    why: '捌いたかどうかを照合できない（**公開は取り消せない**）' });
  const intakeIds = new Set(intake.dispositions.map((d) => d.review_id));
  const problems = validate(doc, { intakeIds });

  const drafted = (doc.replies || []).filter((r) => !r.posted_at);
  const posted = (doc.replies || []).filter((r) => r.posted_at);
  console.log(`レビュー返信 — 下書き ${drafted.length} / 投稿済み ${posted.length}\n`);
  for (const r of doc.replies || []) {
    const state = r.posted_at ? `投稿済み（承認 ${r.approved_by}）` : (r.approved_by ? '承認済み・未投稿' : '**承認待ち**');
    console.log(`  [${state}] ${r.review_id}`);
    console.log(`      ${String(r.draft).slice(0, 54)}…`);
  }
  if (!doc.replies?.length) {
    console.log('  下書きなし。**「返信していない」であって「返信できない」ではない。**');
  }
  console.log(`\n  **このスクリプトは投稿しない。**ASC への POST は持っていない。`);
  console.log(`  下書きと検査はAIが実行し、**公開だけを人が承認する**（rollout-guard の promote と同じ非対称）。`);

  if (problems.length) {
    console.error('\nレビュー返信: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n承認境界・公開してよい文面の条件に問題なし。');
}
