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


// ── 自動投稿のゲート ──────────────────────────────────────────────
//
// [2026-08-27] **オーナーが承認境界を「品質ゲート通過で自動投稿」に決めた。**
//
// この台帳の元の設計は逆で、「投稿は公開・不可逆だから人が承認する」と書いてあった。
// 私も2度その側を推した。**決めたのはオーナーで、これはその決定の実装。**
//
// 【人が全件読まなくなる、ということ】
// これまでは下書きが多少雑でも、投稿前に人が1件ずつ読んでいた。
// これからは**このゲートが唯一の関門**になる。だから:
//
//   1. **既存の検査は床であって天井ではない。**validate() に1件でも問題があれば止める
//   2. **判断材料が無ければ止める。**星の数やレビュー本文が台帳に無い下書きは、
//      「たぶん大丈夫」ではなく hold。読めなかったことを安全と読まない
//   3. **既定は止まっている側。**enabled: false / dry_run: true で入れる。
//      機構を入れることと動かすことを分ける（問い合わせ自動返信と同じ手順）
//
// 【人の承認経路は消していない】
// approved_by による投稿はそのまま残る。自動で出たものは `auto_posted_at` に入り、
// **どちらの経路で公開されたかが後から区別できる。**
// 自動投稿は「承認」ではないので、**AIを approved_by に書くことは今までどおり禁止。**

/** 星がこれ以下なら自動投稿しない。**怒っている相手に定型文を返すのは火に油。** */
export const AUTO_POST_MIN_RATING = 3;

/**
 * 自動投稿に載せない話題。**当たったら人へ。**
 * 返金・法務・個人情報・保安・データ消失は、定型の謝罪で閉じてよい話ではない。
 */
export const ESCALATE_PATTERNS = [
  { re: /返金|refund|返品|チャージバック/i, what: '返金' },
  { re: /訴|弁護士|法的|消費者庁|lawyer|legal/i, what: '法務' },
  { re: /個人情報|プライバシー|privacy|GDPR/i, what: '個人情報' },
  { re: /脆弱|セキュリティ|漏(えい|洩)|security|breach/i, what: '保安' },
  { re: /(データ|メモ)が(消|きえ|飛)|消失|全部消え|data loss/i, what: 'データ消失' },
];

/**
 * 1件の下書きを自動投稿してよいか。**純関数。**
 *
 * 落ちる順に並べてある。**先に落ちたものが理由**になる（複数当たっても最初の1つを返す）。
 * 返す decision:
 *   post       … 投稿してよい
 *   would_post … dry_run なので投稿しないが、通っている
 *   hold       … 止める。why に理由
 */
export function evaluateAutoPost({ reply, policy = {}, problems = [], postedToday = 0 }) {
  const ap = policy.auto_post || {};
  const never = policy.never_auto_post || {};
  const hold = (why) => ({ decision: 'hold', why });

  // **既存の検査が床。**1件でも問題があれば自動では出さない
  if (problems.length) return hold(`下書きに検査の問題が ${problems.length} 件`);
  if (policy.kill_switch) return hold('kill_switch が立っている');
  if (!ap.enabled) return hold('自動投稿が有効になっていない');

  // 人の承認経路に乗っているものを、自動側で横取りしない
  if (reply.approved_by) return hold('人の承認が付いている（人の経路で投稿する）');
  if (reply.posted_at || reply.auto_posted_at) return hold('すでに投稿済み');

  if (!reply.draft || !reply.draft.trim()) return hold('draft が空');

  // **判断材料が無ければ止める。**「たぶん大丈夫」で公開しない
  if (typeof reply.rating !== 'number') {
    return hold('rating が無い — **星の数が分からないものを自動で公開しない**');
  }
  const min = typeof never.rating_at_most === 'number' ? never.rating_at_most : AUTO_POST_MIN_RATING - 1;
  if (reply.rating <= min) return hold(`★${reply.rating} — 低評価は人が読む`);

  if (typeof reply.review_text !== 'string' || !reply.review_text.trim()) {
    return hold('review_text が無い — **本文を見ずに話題の判定はできない**');
  }
  for (const p of ESCALATE_PATTERNS) {
    if (p.re.test(reply.review_text) || p.re.test(reply.draft)) {
      return hold(`${p.what}に触れている — 定型の返信で閉じてよい話ではない`);
    }
  }

  const cap = typeof ap.daily_cap === 'number' ? ap.daily_cap : 0;
  if (postedToday >= cap) return hold(`本日の自動投稿が上限 ${cap} 件に達している`);

  if (ap.dry_run) return { decision: 'would_post', why: 'dry_run（通っているが投稿しない）' };
  return { decision: 'post', why: 'ゲートを通過' };
}

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

  // ── 自動投稿のゲート ──────────────────────────────────────
  const okPolicy = { auto_post: { enabled: true, dry_run: false, daily_cap: 3 },
                     never_auto_post: { rating_at_most: 2 }, kill_switch: false };
  const okReply = { review_id: 'r1', draft: 'ご利用ありがとうございます。', rating: 5,
                    review_text: '使いやすいです' };
  const ev = (o = {}) => evaluateAutoPost({ reply: { ...okReply, ...(o.reply || {}) },
    policy: { ...okPolicy, ...(o.policy || {}) }, problems: o.problems || [],
    postedToday: o.postedToday || 0 });

  t('通る下書きは post', ev().decision === 'post');

  // **既存の検査が床**
  t('**検査に問題があれば止める**', ev({ problems: ['x'] }).decision === 'hold');
  // **既定は止まっている側**
  t('有効でなければ止める',
    ev({ policy: { auto_post: { enabled: false, dry_run: false, daily_cap: 3 } } }).decision === 'hold');
  t('kill_switch で止まる', ev({ policy: { kill_switch: true } }).decision === 'hold');
  t('dry_run では投稿しない',
    ev({ policy: { auto_post: { enabled: true, dry_run: true, daily_cap: 3 } } }).decision === 'would_post');

  // **人の経路を横取りしない／二重投稿しない**
  t('人の承認が付いていれば自動側は触らない',
    ev({ reply: { approved_by: 'owner' } }).decision === 'hold');
  t('投稿済みは止める', ev({ reply: { posted_at: '2026-08-27' } }).decision === 'hold');
  t('自動投稿済みも止める', ev({ reply: { auto_posted_at: '2026-08-27' } }).decision === 'hold');

  // **判断材料が無ければ止める**
  t('**rating が無ければ止める**', ev({ reply: { rating: undefined } }).decision === 'hold');
  t('rating が数値でなければ止める', ev({ reply: { rating: '5' } }).decision === 'hold');
  t('**review_text が無ければ止める**', ev({ reply: { review_text: undefined } }).decision === 'hold');
  t('空の review_text も止める', ev({ reply: { review_text: '   ' } }).decision === 'hold');

  // **低評価は人が読む**
  t('★2 は止める', ev({ reply: { rating: 2 } }).decision === 'hold');
  t('★1 は止める', ev({ reply: { rating: 1 } }).decision === 'hold');
  t('★3 は通る', ev({ reply: { rating: 3 } }).decision === 'post');

  // **重い話題は人へ**（レビュー本文でも下書きでも当てる）
  t('返金の話は止める', ev({ reply: { review_text: '返金してほしい' } }).decision === 'hold');
  t('法務の話は止める', ev({ reply: { review_text: '弁護士に相談します' } }).decision === 'hold');
  t('個人情報の話は止める', ev({ reply: { review_text: 'プライバシーが心配' } }).decision === 'hold');
  t('データ消失は止める', ev({ reply: { review_text: 'メモが全部消えた' } }).decision === 'hold');
  t('**下書き側に出ても止める**', ev({ reply: { draft: '返金の手続きはこちらです' } }).decision === 'hold');

  // 日次上限
  t('上限に達したら止める', ev({ postedToday: 3 }).decision === 'hold');
  t('上限未満なら通る', ev({ postedToday: 2 }).decision === 'post');
  t('上限が無い台帳では止める（既定0）',
    ev({ policy: { auto_post: { enabled: true, dry_run: false } } }).decision === 'hold');

  // 理由が残る
  t('止めた理由が文字列で残る', typeof ev({ reply: { rating: 1 } }).why === 'string');


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

  const drafted = (doc.replies || []).filter((r) => !r.posted_at && !r.auto_posted_at);
  const posted = (doc.replies || []).filter((r) => r.posted_at || r.auto_posted_at);
  console.log(`レビュー返信 — 下書き ${drafted.length} / 投稿済み ${posted.length}\n`);

  // **ゲートを実際に通す。**「規則がある」と「その規則で何件通るか」は別。
  const policy = doc.policy || {};
  const decided = (doc.replies || []).map((r) => ({
    r, ev: evaluateAutoPost({ reply: r, policy, problems: validate({ replies: [r] }, { intakeIds }) }),
  }));

  for (const { r, ev } of decided) {
    const state = r.auto_posted_at ? '**自動投稿済み**'
      : r.posted_at ? `投稿済み（承認 ${r.approved_by}）`
      : r.approved_by ? '承認済み・未投稿'
      : `自動: ${ev.decision}`;
    console.log(`  [${state}] ${r.review_id}`);
    console.log(`      ${String(r.draft).slice(0, 54)}…`);
    if (!r.posted_at && !r.auto_posted_at) console.log(`      → ${ev.why}`);
  }
  if (!doc.replies?.length) {
    console.log('  下書きなし。**「返信していない」であって「返信できない」ではない。**');
  }

  const ap = policy.auto_post || {};
  console.log(`\n  自動投稿: ${ap.enabled ? '有効' : '**無効**'}`
    + `${ap.dry_run ? '（dry_run）' : ''} / 日次上限 ${ap.daily_cap ?? '未設定'}`
    + `${policy.kill_switch ? ' / **kill_switch が立っている**' : ''}`);
  console.log(`  **このスクリプトは投稿しない。**ASC への POST はまだどこにも無い —— `
    + `ゲートを先に作って、実行を後から足す（逆にすると境界が後付けになる）。`);
  console.log(`  承認境界は 2026-08-27 に「品質ゲート通過で自動投稿」へ変わった。`
    + `**人の承認経路（approved_by）は残してある。**`);

  if (problems.length) {
    console.error('\nレビュー返信: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n承認境界・公開してよい文面の条件に問題なし。');
}
