#!/usr/bin/env node
/**
 * **取引関係が「定型」か「非定型」かを機械が導き、食い違いを落とす。**
 *
 *   node scripts/check-contract-kind.mjs            # 一覧
 *   node scripts/check-contract-kind.mjs --check    # CI
 *   node scripts/check-contract-kind.mjs --selftest # 導出の自己検査（ネットも隣も見ない）
 *
 * 【なぜ要るか — 分類が台帳のどこにも無かった】
 * `data/automation-coverage.json` の ⑦「定型／非定型契約の分類」は、
 * 材料が揃ったあとも `not_started` のまま残っていた。揃っていたのは:
 *
 *   data/vendor-register.json           … 11社。全社が terms_accepted_by を持つ
 *   data/corporate-obligations.json     … 条項44マス（11社×4観点）。2026-08-29 に読了
 *   ../simplememo-api/contract-register … 書面の受け皿（contracts は空）
 *
 * **無かったのは「導く側」。**どの関係が定型でどれが非定型かは、
 * 3つの台帳を人が突き合わせないと言えない状態だった。ここがその導出。
 *
 * 【定型／非定型の線】
 * 定型（standard）… 各社が公開している規約への同意で成立した関係。交渉が無い（附合契約）
 * 非定型（non_standard）… 個別に交渉・署名した書面がある関係
 *
 *   terms_accepted_by が在る ＋ 書面が無い  → standard
 *   書面（api の contracts[]）が在る        → non_standard
 *   どちらも無い                            → **undetermined（成立の経緯が台帳に無い）**
 *
 * **undetermined を standard に丸めない。**「規約に同意したはず」は推測で、
 * このリポジトリが繰り返し踏んでいる誤り（記録が無い＝問題なし）そのものになる。
 *
 * 【一度も発火しない検査を作らない — 何が発火させるか】
 * 台帳の規則にそのまま当たる論点なので、先に書く。**今日は11社すべてが定型**で、
 * この検査は緑になる。それでも空回りではない理由は、入口の側にある:
 *
 *   1. 新しい取引先が terms_accepted_by 無しで足される
 *      → **実際に起きうる。**`check-vendors` は資格情報の台帳に居て
 *        ベンダー台帳に無い相手を2件（google / postiz）挙げ続けている
 *   2. 書面の契約が1件でも api 側に入る → non_standard になり、人の承認を要求する
 *   3. 公開側が standard、api 側が書面を持つ → **両立しない。**落とす
 *
 * **1件目が入った日から動く**のは api 側の受け皿と同じ性質で、
 * ここが足したのは「入ってから気づく」ではなく「入った瞬間に落ちる」ほう。
 *
 * 【非定型を機械が承認済みにはできない】
 * `data/authority-matrix.json` の「契約・支払い・送金」は
 * requires_approval: true / human_only: ["すべて"]。
 * だから non_standard と導いた行は `approved_by: "human"` を必ず要求する。
 * **AI が非定型契約を承認済みと書ける経路は作らない。**
 *
 * 【隣が読めないときに「問題なし」と書かない】
 * このリポジトリの CI に ../simplememo-api は無い（ingest-asc.mjs が同じことを書いている）。
 * 隣が読めた回だけ書面との照合を出し、読めない回は **照合していないと明示する。**
 * 読めなかったことを「食い違いが無かった」に化けさせない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VENDOR_PATH = path.join(ROOT, 'data/vendor-register.json');
export const API_CONTRACTS_PATH = path.resolve(ROOT, '../simplememo-api/data/contract-register.json');

export const KINDS = ['standard', 'non_standard', 'undetermined'];

/**
 * **純粋な導出。**vendor 1件と、その相手の書面（0件以上）から種別を決める。
 * 隣が読めなかった回は `written = null` を渡す（「書面が無い」ではなく「見ていない」）。
 */
export function deriveKind(vendor, written) {
  const hasTerms = typeof vendor?.terms_accepted_by === 'string' && vendor.terms_accepted_by.length > 0;
  if (Array.isArray(written) && written.length > 0) {
    // 書面が在る。その行自身が定型を名乗っていても、**書面がある以上ここは非定型側**に置く。
    // （定型の写しを保管しているだけ、という主張は人の承認で示す）
    return 'non_standard';
  }
  if (hasTerms) return 'standard';
  return 'undetermined';
}

/**
 * 台帳3つを突き合わせる。`contracts` は api 側の contracts[]（隣が読めないときは null）。
 * **自己テストはここを壊して落ちるのを見る。**
 */
export function validate(vendorDoc, contracts) {
  const problems = [];
  const rows = [];
  const vendors = vendorDoc?.vendors;
  if (!Array.isArray(vendors)) return { problems: ['vendor-register.json の vendors が配列でない'], rows };

  const neighborRead = Array.isArray(contracts);
  const byVendor = new Map();
  if (neighborRead) {
    for (const c of contracts) {
      const id = c?.vendor ?? c?.vendor_id ?? c?.id;
      if (!byVendor.has(id)) byVendor.set(id, []);
      byVendor.get(id).push(c);
    }
  }

  const known = new Set(vendors.map((v) => v?.id));
  for (const v of vendors) {
    const written = neighborRead ? (byVendor.get(v.id) ?? []) : null;
    const kind = deriveKind(v, written);
    rows.push({ id: v.id, name: v.name, kind, money_flow: v.money_flow, approved_by: v.approved_by });

    // 金銭が動く相手は、成立の経緯が台帳に無いままにしない。
    if (kind === 'undetermined') {
      problems.push(`「${v.id}」の成立の経緯が台帳に無い — terms_accepted_by も書面も無い`
        + `（money_flow: ${v.money_flow ?? '未記載'}）。**規約に同意したはず、で埋めない**`);
    }
    // 非定型は人の承認が要る（権限表「契約・支払い・送金」が human_only）。
    if (kind === 'non_standard' && v.approved_by !== 'human') {
      problems.push(`「${v.id}」は書面があるので非定型 — approved_by が "human" でない`
        + `（いま: ${JSON.stringify(v.approved_by)}）。**AIが非定型契約を承認済みにはできない**`);
    }
  }

  // 隣にだけ居る相手。書面があるのにベンダー台帳に無いと、条項検査も期限管理も掛からない。
  if (neighborRead) {
    for (const [id, list] of byVendor) {
      if (!known.has(id)) {
        problems.push(`書面が ${list.length} 件あるのに、ベンダー台帳に「${id}」が無い`
          + ` — 条項検査にも支払いの照合にも掛からないまま残る`);
      }
    }
  }

  return { problems, rows, neighborRead };
}

/** 隣を読む。無ければ null（「書面が無い」と区別する）。 */
export function readNeighbor(p = API_CONTRACTS_PATH) {
  try {
    const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(doc?.contracts) ? doc.contracts : null;
  } catch {
    return null;
  }
}

const SELFTESTS = [
  ['terms_accepted_by が在れば定型', () => {
    const k = deriveKind({ id: 'x', terms_accepted_by: 'human' }, []);
    if (k !== 'standard') throw new Error(`standard でなく ${k}`);
  }],

  ['**terms も書面も無ければ undetermined**（standard に丸めない）', () => {
    const k = deriveKind({ id: 'x', money_flow: 'subscription' }, []);
    if (k !== 'undetermined') throw new Error(`undetermined でなく ${k}`);
  }],

  ['**書面が在れば非定型**（terms があっても書面が勝つ）', () => {
    const k = deriveKind({ id: 'x', terms_accepted_by: 'human' }, [{ vendor: 'x' }]);
    if (k !== 'non_standard') throw new Error(`non_standard でなく ${k}`);
  }],

  ['**隣を読めなかった回は書面ゼロと同じ扱いにしない**（null と [] を分ける）', () => {
    // null（見ていない）でも terms があるので standard。ここで [] と差が出るのは
    // 「書面が在るのに見えていない」場合で、それは隣が読めた回にしか判定できない。
    const seen = deriveKind({ id: 'x', terms_accepted_by: 'human' }, []);
    const unseen = deriveKind({ id: 'x', terms_accepted_by: 'human' }, null);
    if (seen !== 'standard' || unseen !== 'standard') throw new Error('前提が変わった');
    const noTermsUnseen = deriveKind({ id: 'x' }, null);
    if (noTermsUnseen !== 'undetermined') throw new Error('隣が読めない＋terms 無しは undetermined のまま');
  }],

  ['**実データ: 成立の経緯が無い相手を作ると落ちる**（空回りしていないことの確認）', () => {
    const d = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
    if (validate(d, []).problems.length !== 0) throw new Error('実データが既に落ちている — 前提が違う');
    delete d.vendors[0].terms_accepted_by;
    if (!validate(d, []).problems.some((p) => p.includes('成立の経緯'))) {
      throw new Error('terms_accepted_by を消しても素通りした');
    }
  }],

  ['**実データ: 書面を1件足すと人の承認を要求する**', () => {
    const d = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
    const id = d.vendors[0].id;
    d.vendors[0].approved_by = 'ai';
    if (!validate(d, [{ vendor: id }]).problems.some((p) => p.includes('approved_by'))) {
      throw new Error('非定型なのに AI 承認が素通りした');
    }
  }],

  ['**実データ: 台帳に無い相手の書面は落ちる**', () => {
    const d = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
    if (!validate(d, [{ vendor: 'nowhere' }]).problems.some((p) => p.includes('ベンダー台帳に'))) {
      throw new Error('台帳に無い相手の書面が素通りした');
    }
  }],
];

function main() {
  if (process.argv.includes('--selftest')) {
    let failed = 0;
    for (const [name, fn] of SELFTESTS) {
      try { fn(); console.log(`  ok   ${name}`); }
      catch (e) { failed++; console.error(`  NG   ${name}\n       ${e.message}`); }
    }
    console.log(`\n  contract-kind 自己テスト ${SELFTESTS.length} 件中 ${failed} 件失敗`);
    process.exit(failed ? 1 : 0);
  }

  const vendorDoc = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
  const contracts = readNeighbor();
  const { problems, rows, neighborRead } = validate(vendorDoc, contracts);

  const std = rows.filter((r) => r.kind === 'standard');
  const non = rows.filter((r) => r.kind === 'non_standard');
  const und = rows.filter((r) => r.kind === 'undetermined');

  console.log('契約の定型／非定型 — 台帳から導出\n');
  console.log(`  定型 ${std.length}社 / 非定型 ${non.length}社 / **成立の経緯が不明 ${und.length}社**\n`);
  for (const r of rows) {
    const mark = r.kind === 'standard' ? '定型    ' : (r.kind === 'non_standard' ? '**非定型**' : '**不明**  ');
    console.log(`    ${mark}  ${String(r.id).padEnd(16)} ${r.money_flow ?? '-'}`);
  }

  console.log('\n  **定型＝各社の規約への同意で成立（附合契約）。交渉も署名も無い。**');
  if (neighborRead) {
    console.log(`  書面の照合: 隣を読んだ（api の contracts ${contracts.length} 件）`);
  } else {
    console.log('  書面の照合: **していない** — ../simplememo-api が読めない');
    console.log('             （読めなかったことを「食い違い無し」と書かない）');
  }
  console.log('  **非定型が現れたら、人の承認が要る**（権限表「契約・支払い・送金」）。');

  if (problems.length) {
    console.error('\n契約の分類: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n分類に食い違いなし。');
}

main();
