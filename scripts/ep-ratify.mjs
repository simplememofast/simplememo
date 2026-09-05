#!/usr/bin/env node
/**
 * EP（エスカレーション精度）の委任判定を、**人が読んで追認・反転する**道具。
 *
 *   node scripts/ep-ratify.mjs --list                                  # 委任判定の一覧（未追認を先に）
 *   node scripts/ep-ratify.mjs --ratify   <act-id> --evidence "…"      # 納得した行を人の判定に上書き
 *   node scripts/ep-ratify.mjs --overturn <act-id> --evidence "…"      # 納得しない行を反転して人の判定に
 *   node scripts/ep-ratify.mjs --selftest
 *
 * 【なぜ要るか】2026-09-05、EP 精度の判定（owner_needed）はオーナーが AI へ**全面委任**した
 * （data/autonomy-score.json の ep.precision_review.delegations）。点は入るが、
 * 「必要だった」と判定するほど点が上がる向きの利害が判定者（AI）の側に残る。
 * 同日、オーナーはその上に **月1で人が追認する** を選んだ（同 ratification）。
 * 追認は点を動かさない（委任で既に数えている）。動くのは公開面の「人の判定 0 件」で、
 * **反転した件数が、AI の自己採点がどれだけ甘かったかの実測**になる。
 *
 * 【この道具が守ること】
 * - 元の AI 判定を消さない。`ratified_from` に mode / reviewer / reason / evidence_sha を残す
 * - 人の判定には **判定者・日付・根拠（オーナーの言葉）** が必ず付く。
 *   `scripts/autonomy-score.mjs --check` が、根拠の無い `mode: "human"` を台帳から落とす
 * - **自動運転の中では動かない。**GitHub Actions（GITHUB_ACTIONS=true）では --ratify / --overturn を拒む。
 *   追認は人の操作で、AI が代筆すると #901 の穴（自己採点）に戻る。--list は誰が撃ってもよい
 *
 * 【起票】月初の日次アクチュエータ（scripts/autopilot-act.mjs D8）が
 * `act-ep-ratification-<YYYY-MM>` をオーナー行として立てる。追認せずに窓（14日）を過ぎたら閉じ、
 * 未追認は翌月の起票に持ち越す。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ACTIONS_PATH = path.join(ROOT, 'data/autopilot-actions.json');
export const POLICY_PATH = path.join(ROOT, 'data/autonomy-score.json');
export const MIN_EVIDENCE_CHARS = 12;

export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 委任で数えている判定（accepted_modes に無い mode）か。判定者の記録が無い行は対象外（数えられていない）。 */
export function isDelegatedReview(review, policy) {
  const accepted = new Set(policy?.ep?.precision_review?.accepted_modes ?? ['human']);
  if (typeof review?.mode !== 'string' || review.mode.length === 0) return false;
  return !accepted.has(review.mode);
}

/** 一覧。未追認（委任のまま）を先に、追認済みを後に。 */
export function listReviews(actions, policy) {
  const rows = [];
  for (const a of actions) {
    if (typeof a?.owner_needed !== 'boolean') continue;
    const r = a.owner_needed_review;
    if (typeof r?.mode !== 'string') continue;
    rows.push({
      id: a.id, owner_needed: a.owner_needed, mode: r.mode, reviewer: r.reviewer ?? null,
      reviewed_jst: r.reviewed_jst ?? null, delegated: isDelegatedReview(r, policy),
      ratified: r.ratified_from ? true : false, reason: typeof r.reason === 'string' ? r.reason : '',
      title: a.title ?? '',
    });
  }
  return rows.sort((x, y) => Number(y.delegated) - Number(x.delegated) || x.id.localeCompare(y.id));
}

/**
 * 1行を人の判定に上書きする（純関数。台帳は触らない）。
 * verdict は 'ratify'（追認）か 'overturn'（反転）。元の判定は ratified_from に残す。
 */
export function applyReview(row, { verdict, evidence, today, by = 'owner' }) {
  if (!row || typeof row !== 'object') throw new Error('row required');
  if (typeof row.owner_needed !== 'boolean') throw new Error(`${row.id ?? '?'}: owner_needed が無い（判定されていない行は追認できない）`);
  const prev = row.owner_needed_review;
  if (typeof prev?.mode !== 'string') throw new Error(`${row.id}: 判定者の記録（owner_needed_review）が無い`);
  if (prev.mode === 'human') throw new Error(`${row.id}: 既に人の判定になっている`);
  if (!['ratify', 'overturn'].includes(verdict)) throw new Error('verdict must be ratify|overturn');
  if (typeof evidence !== 'string' || evidence.trim().length < MIN_EVIDENCE_CHARS) {
    throw new Error(`根拠（--evidence）が要る。${MIN_EVIDENCE_CHARS} 文字以上で、オーナーの言葉を引用する`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) throw new Error('today must be YYYY-MM-DD');
  if (by !== 'owner') throw new Error('人の判定者は owner だけ（AI や第三者の名前を書かない）');
  const next = { ...row };
  next.owner_needed = verdict === 'overturn' ? !row.owner_needed : row.owner_needed;
  next.owner_needed_review = {
    mode: 'human', reviewer: by, reviewed_jst: today, verdict,
    evidence: evidence.trim(),
    ratified_from: {
      mode: prev.mode, reviewer: prev.reviewer ?? null, reviewed_jst: prev.reviewed_jst ?? null,
      owner_needed: row.owner_needed, reason: prev.reason ?? null, evidence_sha: prev.evidence_sha ?? null,
    },
  };
  return next;
}

/** 人の判定として数えてよい形か（judged by human ⇒ 判定者・日付・根拠が揃っている）。 */
export function humanReviewProblems(actions) {
  const problems = [];
  for (const a of actions ?? []) {
    const r = a?.owner_needed_review;
    if (r?.mode !== 'human') continue;
    const at = `data/autopilot-actions.json#${a.id ?? '?'}`;
    if (r.reviewer !== 'owner') problems.push(`${at}: 人の判定なのに reviewer が owner でない（${r.reviewer ?? '空'}）`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.reviewed_jst ?? '')) problems.push(`${at}: 人の判定なのに reviewed_jst が無い`);
    if (typeof r.evidence !== 'string' || r.evidence.trim().length < MIN_EVIDENCE_CHARS) {
      problems.push(`${at}: 人の判定なのに根拠（evidence）が無い — 機械が mode: human と書いたのと見分けがつかない`);
    }
  }
  return problems;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function selftest() {
  let n = 0, bad = 0;
  const ok = (name, fn) => { n += 1; try { fn(); } catch (e) { bad += 1; console.error(`  ✗ ${name}\n      ${e.message}`); } };
  const eq = (got, want, msg) => { n += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { bad += 1; console.error(`  ✗ ${msg}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`); } };
  const throws = (name, fn, re) => { n += 1; try { fn(); bad += 1; console.error(`  ✗ ${name}: 落ちなかった`); } catch (e) { if (!re.test(e.message)) { bad += 1; console.error(`  ✗ ${name}: 別の理由で落ちた: ${e.message}`); } } };
  const P = { ep: { precision_review: { accepted_modes: ['human'], delegations: [{ mode: 'owner_delegated', reviewer: 'codex' }] } } };
  const delegated = { id: 'act-x', title: 'x', force_owner: 'human', owner_needed: true,
    owner_needed_review: { mode: 'owner_delegated', reviewer: 'codex', reviewed_jst: '2026-09-04', reason: 'AIの理由', evidence_sha: 'abc' } };
  const evidence = '2026-10-01、オーナーが「これは私が判断すべき件だった」と述べた';

  eq(isDelegatedReview(delegated.owner_needed_review, P), true, '委任判定は追認の対象');
  eq(isDelegatedReview({ mode: 'human' }, P), false, '人の判定は対象外');
  eq(isDelegatedReview(undefined, P), false, '判定者の記録が無い行は対象外（そもそも数えられていない）');
  eq(listReviews([delegated, { ...delegated, id: 'act-h', owner_needed_review: { mode: 'human', reviewer: 'owner' } },
    { id: 'act-none', owner_needed: true }], P).map((r) => `${r.id}:${r.delegated}`), ['act-x:true', 'act-h:false'],
    '一覧は未追認を先に、記録の無い行は出さない');

  const r1 = applyReview(delegated, { verdict: 'ratify', evidence, today: '2026-10-01' });
  eq(r1.owner_needed, true, '追認は判定を変えない');
  eq(r1.owner_needed_review?.mode, 'human', '追認後は人の判定');
  eq(r1.owner_needed_review?.reviewer, 'owner', '判定者は owner');
  eq(r1.owner_needed_review?.ratified_from?.reviewer, 'codex', '**元の AI 判定を消さない**');
  eq(r1.owner_needed_review?.ratified_from?.reason, 'AIの理由', '元の理由も残す');
  eq(delegated.owner_needed_review.mode, 'owner_delegated', '入力の行を書き換えない（純関数）');
  const r2 = applyReview(delegated, { verdict: 'overturn', evidence, today: '2026-10-01' });
  eq(r2.owner_needed, false, '反転は判定を裏返す');
  eq(r2.owner_needed_review?.ratified_from?.owner_needed, true, '反転前の判定を残す（AI の甘さの実測）');
  eq(humanReviewProblems([r1, r2, delegated]), [], '道具が書いた人の判定は根拠が揃っている');

  throws('根拠なしは拒む', () => applyReview(delegated, { verdict: 'ratify', evidence: '', today: '2026-10-01' }), /根拠/);
  throws('短すぎる根拠は拒む', () => applyReview(delegated, { verdict: 'ratify', evidence: 'ok', today: '2026-10-01' }), /根拠/);
  throws('既に人の判定なら拒む', () => applyReview(r1, { verdict: 'ratify', evidence, today: '2026-10-01' }), /既に人の判定/);
  throws('判定者の記録が無ければ拒む', () => applyReview({ id: 'a', owner_needed: true }, { verdict: 'ratify', evidence, today: '2026-10-01' }), /判定者の記録/);
  throws('判定されていない行は拒む', () => applyReview({ id: 'a' }, { verdict: 'ratify', evidence, today: '2026-10-01' }), /owner_needed/);
  throws('owner 以外の判定者は拒む', () => applyReview(delegated, { verdict: 'ratify', evidence, today: '2026-10-01', by: 'codex' }), /owner だけ/);
  throws('verdict の綴りが違えば拒む', () => applyReview(delegated, { verdict: 'accept', evidence, today: '2026-10-01' }), /verdict/);

  eq(humanReviewProblems([{ id: 'm', owner_needed_review: { mode: 'human' } }]).length, 3,
    '**機械が mode: human とだけ書いた行は3点で落ちる**（判定者・日付・根拠）');
  eq(humanReviewProblems([{ id: 'm', owner_needed_review: { mode: 'human', reviewer: 'codex', reviewed_jst: '2026-10-01', evidence: evidence } }]).length, 1,
    'reviewer が owner でなければ落ちる');
  eq(humanReviewProblems([delegated]), [], '委任判定はこの検査の対象外（別の規則が数えない）');

  console.log(`  自己テスト ${n} 件中 ${bad} 件失敗`);
  return bad;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) { process.exit(selftest() === 0 ? 0 : 1); }
  const policy = readJson(POLICY_PATH);
  const doc = readJson(ACTIONS_PATH);
  if (args.includes('--list')) {
    const rows = listReviews(doc.actions ?? [], policy);
    const pending = rows.filter((r) => r.delegated);
    console.log(`委任判定 ${pending.length} 件（未追認）／ 人の判定 ${rows.length - pending.length} 件\n`);
    for (const r of rows) {
      console.log(`  ${r.delegated ? '□' : '■'} ${r.id}  owner_needed=${r.owner_needed}  ${r.mode}${r.reviewer ? '/' + r.reviewer : ''}${r.reviewed_jst ? ' ' + r.reviewed_jst : ''}`);
      console.log(`      ${r.title.slice(0, 80)}`);
      if (r.reason) console.log(`      理由: ${r.reason.slice(0, 120)}`);
    }
    console.log('\n  追認: node scripts/ep-ratify.mjs --ratify <id> --evidence "オーナーの言葉"');
    console.log('  反転: node scripts/ep-ratify.mjs --overturn <id> --evidence "オーナーの言葉"');
    return;
  }
  const verdict = args.includes('--ratify') ? 'ratify' : (args.includes('--overturn') ? 'overturn' : null);
  if (!verdict) { console.error('使い方: --list | --ratify <id> --evidence "…" | --overturn <id> --evidence "…" | --selftest'); process.exit(2); }
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.error('**自動運転の中では追認しない。**人が手元で実行する（AI が代筆すると自己採点に戻る）');
    process.exit(2);
  }
  const id = args[args.indexOf(`--${verdict}`) + 1];
  const ei = args.indexOf('--evidence');
  const evidence = ei >= 0 ? args[ei + 1] : '';
  const idx = (doc.actions ?? []).findIndex((a) => a.id === id);
  if (idx < 0) { console.error(`${id}: 台帳に無い`); process.exit(2); }
  const next = applyReview(doc.actions[idx], { verdict, evidence, today: todayJst() });
  doc.actions[idx] = next;
  fs.writeFileSync(ACTIONS_PATH, JSON.stringify(doc, null, 2) + '\n');
  console.log(`${id}: ${verdict} — owner_needed=${next.owner_needed}（元の判定 ${next.owner_needed_review.ratified_from.mode}/${next.owner_needed_review.ratified_from.reviewer} は ratified_from に残した）`);
  console.log('台帳をコミットして push すること。点は動かない。公開面の「人の判定 N 件」が変わる。');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
