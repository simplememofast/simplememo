#!/usr/bin/env node
/**
 * 条項検査の40マスを、**読む順序**に変える。
 *
 *   node scripts/vendor-clause-worksheet.mjs           # 順序と、各マスの材料を出す
 *   node scripts/vendor-clause-worksheet.mjs --json    # 機械可読
 *   node scripts/vendor-clause-worksheet.mjs --check   # CI: 2つの台帳の整合
 *   node scripts/vendor-clause-worksheet.mjs --selftest # 導出そのものの自己検査
 *
 * 【なぜ要るか】
 * `check-corporate.mjs` は「全観点が未確認のベンダー 10社」と出す。正しいが、
 * **40マスが等価に見える。**実際には等価ではない —— resend には宛先アドレスと
 * メモ本文が渡っていて代替が無く、prtimes には個人データが渡っていない。
 * それでも台帳の上では同じ `unreviewed` が40個並ぶ。
 *
 * **等価に見える一覧は、着手されない。**この行が 2026-08-22 から動いていないのは
 * 判断が重いからではなく、**どこから読めばいいかが出ていない**からでもある。
 *
 * 【この script が決めないこと】
 * **ok / risk は決めない。**それは法的判断で、`data/corporate-obligations.json` の
 * $note が「確認は人が規約を読むことでしか進まない」と書いたとおり人の領域。
 * ここが出すのは**順序と材料**だけ —— どのマスから読むと露出が大きいか、
 * そのマスで何が賭かっているか（何を渡しているか・止まると何が起きるか・代替はあるか）。
 *
 * 【順序の作り方 — 台帳に記録された事実だけから導く】
 * 推測を混ぜない。使うのは vendor-register.json の4欄だけ:
 *
 *   personal_data … personal 2 / pseudonymous 1 / none 0
 *   critical      … 落ちると何が止まるか
 *   fallback      … 代替が在るか
 *   money_flow    … 金銭が動くか
 *
 * マスごとの露出:
 *
 *   personal_data … personal_data の水準そのもの（0〜2）
 *   liability_cap … critical + 代替が無い（0〜2）
 *                   **止まったときに請求できるかは、代替が無いほど効く。**
 *                   代替が在るなら冗長化で守れるので、条項に賭かるものが小さい
 *   governing_law … 金銭が動く + critical（0〜2）
 *                   **争う実益と、争う相手が事業の根幹かどうか**
 *   ip            … **導出しない。**下記
 *
 * 【ip に順序をつけない理由】
 * 「著作物・生成物を誰が抱えているか」を表す欄が vendor-register.json に無い。
 * `used_for` は自由文（「オートパイロット・QA判定・原稿執筆」等）で、
 * **自由文を正規表現で読んで順位にすると、書き方が変わった日に順序が黙って変わる。**
 * 材料が欠けたら順位を作らない —— `check-rollout-promotion` の
 * holds_when_unknown と同じ側に倒してある。**これは欠落の報告であって、
 * 「ip は重要でない」ではない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, broken, run } from './lib/selftest.mjs';
import { MONEY_FLOWS } from './check-vendors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTER_PATH = path.join(ROOT, 'data/vendor-register.json');
export const OBLIGATIONS_PATH = path.join(ROOT, 'data/corporate-obligations.json');

/** personal_data の水準を数にする。**登録簿に無い語は 0 にしない**（null で落とす）。 */
export const DATA_WEIGHT = { none: 0, pseudonymous: 1, personal: 2 };

/** 順序をつけない条項。**材料が台帳に無いものをここに置く。** */
export const UNRANKED_CLAUSES = new Set(['ip']);

/**
 * 1ベンダー1条項の露出。**純関数。**
 * 返すのは 0〜2 の数か、`null`（順序をつけない／つけられない）。
 */
export function exposure(clause, v) {
  if (UNRANKED_CLAUSES.has(clause)) return null;
  if (!v || typeof v !== 'object') return null;

  switch (clause) {
    case 'personal_data': {
      const w = DATA_WEIGHT[v.personal_data];
      return w === undefined ? null : w;
    }
    case 'liability_cap':
      // **代替が無いほど条項に賭かる。**在るなら冗長化で守れる。
      return (v.critical ? 1 : 0) + (v.fallback ? 0 : 1);
    case 'governing_law':
      // 争う実益（金銭が動く）と、相手が事業の根幹か。
      //
      // [2026-08-28] **`v.money_flow && …` だった。check-guard-shapes に捕まった。**
      // 欄が欠けたベンダーは falsy で 0 になり、**「金銭が動かない」と同じ扱い**に
      // なっていた。露出が小さく見えるので読む順序が後ろへ下がる ——
      // **欠けているほど安全に見える**という、いちばん悪い向きの丸め。
      // personal_data と同じく、**登録簿に無い値は null**（順位を作らない）。
      if (!MONEY_FLOWS.includes(v.money_flow)) return null;
      return (v.money_flow !== 'none' ? 1 : 0) + (v.critical ? 1 : 0);
    default:
      return null;
  }
}

/** そのマスで何が賭かっているかを、台帳の言葉のまま並べる。**要約しない。** */
export function stakes(clause, v) {
  const out = [];
  if (clause === 'personal_data') {
    out.push(`渡しているもの: ${v.personal_data}`);
    if (v.$personal_data) out.push(v.$personal_data);
  }
  if (clause === 'liability_cap') {
    if (v.breaks_if_down) out.push(`止まると: ${v.breaks_if_down}`);
    out.push(v.fallback ? `代替: ${v.fallback}` : `代替: **無し**${v.fallback_note ? ` — ${v.fallback_note}` : ''}`);
  }
  if (clause === 'governing_law') {
    out.push(`金銭: ${v.money_flow}${v.payment_method ? `（${v.payment_method}）` : ''}`);
    if (v.spend_cap_ref) out.push(`上限の参照先: ${v.spend_cap_ref}`);
  }
  return out;
}

/**
 * DPA レビューの4観点。**⑦の行が名指ししているもの**をそのまま使う
 * （「AI事業者のDPA・データ利用・SLA・撤退計画の審査」）。
 * 勝手に増やさない —— 観点が増えると、台帳の行が言っていないことを聞き始める。
 */
export const DPA_ASPECTS = [
  ['dpa',      'DPA（データ処理契約）',
   '締結済みか。**規約に自動で含まれるのか、別途の署名が要るのか。**'
   + '「GDPR 準拠」と書いてあることは、契約が在ることを意味しない'],
  ['data_use', 'データの使われ方',
   '再委託先（subprocessors）は誰か。保存される国・リージョンはどこか。'
   + '**こちらのデータをそのベンダーの学習・改善に使う条項があるか**'],
  ['sla',      'SLA と事故時の扱い',
   '稼働率の約束があるか。**侵害の通知期限**は何時間／何日か'],
  ['exit',     '撤退計画',
   '解約したときデータはいつ消えるか。**取り出す手段があるか。**'
   + '「削除する」と「取り出せる」は別'],
];

/**
 * DPA レビュー1件の露出。**純関数。**返すのは数か `null`。
 *
 * 条項側の `exposure()` と同じ規律で作る:
 *
 *   personal_data … **DPA の主題そのもの**なので重みを2倍に取る（0/2/4）
 *   critical      … 落ちると事業が止まるか（+1）
 *   代替が無い    … 逃げ場が無いほど契約に賭かる（+1）
 *
 * **登録簿に無い語は `null`。**0 に丸めると「渡していない」と同じ順位になり、
 * **欄が欠けているほど安全に見える** —— governing_law で 2026-08-28 に
 * 踏んだのと同じ向きの誤り。
 */
export function dpaExposure(v) {
  if (!v || typeof v !== 'object') return null;
  const w = DATA_WEIGHT[v.personal_data];
  if (w === undefined) return null;
  return w * 2 + (v.critical ? 1 : 0) + (v.fallback ? 0 : 1);
}

/** そのベンダーで何が賭かっているか。**台帳の言葉のまま。要約しない。** */
export function dpaStakes(v) {
  const out = [`渡しているもの: ${v.personal_data}`];
  if (v.$personal_data) out.push(v.$personal_data);
  if (v.used_for) out.push(`用途: ${v.used_for}`);
  if (v.breaks_if_down) out.push(`止まると: ${v.breaks_if_down}`);
  out.push(v.fallback ? `代替: ${v.fallback}` : `代替: **無し**${v.fallback_note ? ` — ${v.fallback_note}` : ''}`);
  return out;
}

/**
 * まだ読んでいない DPA を、露出の大きい順に並べる。
 *
 * **`personal_data: none` は対象外**（check-vendors の未レビュー判定と同じ条件）。
 * **`dpa_reviewed` に日付が入っている行も出さない** —— 終わったものが並び続けると、
 * 一覧そのものが読まれなくなる。
 */
export function buildDpa(register) {
  const problems = [];
  const rows = [];
  for (const v of register?.vendors ?? []) {
    if (v.personal_data === 'none') continue;
    if (v.dpa_reviewed) continue;
    const ex = dpaExposure(v);
    if (ex === null) {
      problems.push(`${v.id}: personal_data「${v.personal_data}」が登録簿の語彙に無い`
        + ' — **順位を作れない。**0 に丸めると渡していないベンダーと同じ順位になる');
      continue;
    }
    // **下書きがあっても一覧から外さない。**外すと人が読みに来なくなる
    // （条項側で同じ規律を自己テストで固定している）。
    rows.push({ id: v.id, name: v.name, exposure: ex, stakes: dpaStakes(v),
      draft: v.dpa_draft ? { at: v.dpa_draft.at, by: v.dpa_draft.by,
        open_questions: v.dpa_draft.open_questions ?? [] } : null });
  }
  rows.sort((a, b) => b.exposure - a.exposure || a.id.localeCompare(b.id));
  return { problems, rows };
}

export function load() {
  return {
    register: JSON.parse(fs.readFileSync(REGISTER_PATH, 'utf8')),
    obligations: JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8')),
  };
}

/**
 * 2つの台帳を突き合わせて、順序つきのマス一覧を作る。
 * **片方にしか居ないベンダーは problems に出す**（黙って落とさない）。
 */
export function build({ register, obligations }) {
  const problems = [];
  const cr = obligations?.contract_review;
  if (!cr || !Array.isArray(cr.vendors) || !Array.isArray(cr.clauses)) {
    return { problems: ['contract_review が読めない'], cells: [], unranked: [] };
  }

  const byId = new Map((register?.vendors ?? []).map((v) => [v.id, v]));
  const cells = [];
  const unranked = [];

  for (const row of cr.vendors) {
    const v = byId.get(row.id);
    if (!v) {
      problems.push(`vendor-register.json に「${row.id}」が無い — 順序をつける材料が取れない`);
      continue;
    }
    for (const clause of cr.clauses) {
      const state = row[clause];
      // **人が見たものだけを順序から外す。**
      // [2026-08-28] `state !== 'unreviewed'` だけで外していたが、それだと
      // **AIが下書きした瞬間にマスが一覧から消える。**消えれば人は読みに来ない ——
      // それは「見ていない」を隠しただけで、`$note` が言う
      // 「見たという記録が嘘を守る」に自分から寄っていく。**人が見るまでが未読。**
      // [2026-08-28] **行ぜんぶが下書き**（reviewed_by: ai_draft）と、
      // **その観点だけが下書き**（draft_clauses に名指し）の両方を拾う。
      // 後者は「4観点のうち3つを人が確認し、1つが下書きのまま」で実際に出た形。
      // **下書きの印は、下書きが在るマスにだけ付ける。**
      // 行ぜんぶが `ai_draft` でも、その中の未読のマスには下書きが無い。
      // 印だけ付けると「読んだのか読んでいないのか」が一覧から判らなくなる。
      const reviewed = state !== 'unreviewed';
      const draft = reviewed
        && (row.reviewed_by === 'ai_draft' || (row.draft_clauses || []).includes(clause));
      if (reviewed && !draft) continue;
      const score = exposure(clause, v);
      const cell = {
        vendor: row.id, name: v.name ?? row.id, clause, state, draft,
        exposure: score, source: row.source ?? null, stakes: stakes(clause, v),
      };
      (score === null ? unranked : cells).push(cell);
    }
  }

  // 露出の大きい順。同点は台帳の並び（＝人が決めた重要度順）を保つので安定ソート。
  cells.sort((a, b) => b.exposure - a.exposure);
  return { problems, cells, unranked };
}

/**
 * CI が見るもの。**新しい赤を足さない** —— 未確認であること自体は
 * check-corporate.mjs が既に報告していて、二重に落とす意味が無い。
 * ここが落とすのは**2つの台帳がずれたとき**だけ。
 */
export function check(doc) {
  const { problems } = build(doc);
  const cr = doc.obligations?.contract_review;
  for (const clause of cr?.clauses ?? []) {
    const sample = doc.register?.vendors?.[0];
    if (sample && exposure(clause, sample) === null && !UNRANKED_CLAUSES.has(clause)) {
      problems.push(`条項「${clause}」に露出の導出が無い — UNRANKED_CLAUSES に入れるか、導出を書く`);
    }
  }
  return problems;
}

function fixture() {
  return {
    register: { vendors: [
      { id: 'a', name: 'A', personal_data: 'personal', critical: true, fallback: null,
        fallback_note: '代替なし', breaks_if_down: '主機能が止まる', money_flow: 'subscription' },
      { id: 'b', name: 'B', personal_data: 'none', critical: false, fallback: '別経路',
        breaks_if_down: '何も止まらない', money_flow: 'none' },
    ] },
    obligations: { contract_review: {
      clauses: ['liability_cap', 'ip', 'personal_data', 'governing_law'],
      // **露出の低い b を先に置く。**a を先に置くと、並べ替えを消しても
      // 「先頭が a」が通ってしまい、**テストが正しい理由で通らなくなる。**
      // （実際に一度そうなっていた: 並べ替えを消しても9件とも緑だった）
      vendors: [
        { id: 'b', liability_cap: 'unreviewed', ip: 'unreviewed', personal_data: 'unreviewed', governing_law: 'unreviewed', source: 'https://b' },
        { id: 'a', liability_cap: 'unreviewed', ip: 'unreviewed', personal_data: 'unreviewed', governing_law: 'unreviewed', source: 'https://a' },
      ],
    } },
  };
}

function selftest() {
  const scenarios = [
    ['実データで問題が出ない', () => assert(check(load()).length === 0, check(load()).join(' / '))],

    ['露出の大きいマスが先に来る', () => {
      const { cells } = build(fixture());
      assert(cells[0].vendor === 'a', `先頭が a でない: ${cells[0]?.vendor}`);
      assert(cells[cells.length - 1].vendor === 'b', '末尾が b でない');
    }],

    ['ip には順序をつけない（材料が台帳に無い）', () => {
      const { cells, unranked } = build(fixture());
      assert(cells.every((c) => c.clause !== 'ip'), 'ip が順序つきに混ざった');
      assert(unranked.length === 2, `unranked が 2 でない: ${unranked.length}`);
    }],

    ['**代替が在ると liability_cap の露出は下がる**', () => {
      const withFb = exposure('liability_cap', { critical: true, fallback: '別経路' });
      const without = exposure('liability_cap', { critical: true, fallback: null });
      assert(without > withFb, `代替の有無で差が出ない: ${without} vs ${withFb}`);
    }],

    // ── DPA ワークシート（2026-09-01 追加）──────────────────────
    ['DPA: 露出の大きいベンダーが先に来る', () => {
      const reg = { vendors: [
        { id: 'lo', name: 'lo', personal_data: 'pseudonymous', critical: false, fallback: '別経路' },
        { id: 'hi', name: 'hi', personal_data: 'personal', critical: true, fallback: null },
      ] };
      const { rows } = buildDpa(reg);
      assert(rows[0].id === 'hi', `先頭が hi でない: ${rows[0]?.id}`);
      assert(rows[0].exposure > rows[1].exposure, '露出に差が出ていない');
    }],

    ['**DPA: 知らない personal_data の語を 0 にしない**（欠けているほど安全に見える丸めを作らない）', () => {
      assert(dpaExposure({ personal_data: 'なにか' }) === null, '語彙外が数になった');
      assert(dpaExposure({ critical: true }) === null, '欄の欠落が数になった');
      const { problems, rows } = buildDpa({ vendors: [
        { id: 'x', name: 'x', personal_data: 'なにか' },
      ] });
      assert(rows.length === 0, '順位を作れない行が一覧に混ざった');
      assert(problems.length === 1, '**黙って落としている** — 落とすなら problems に出すこと');
    }],

    ['**DPA: 下書きがあっても一覧から消さない**（消すと人が読みに来ない）', () => {
      const v = { id: 'd', name: 'd', personal_data: 'personal', critical: true,
        dpa_draft: { at: '2026-09-01', by: 'external_research', open_questions: ['未解決の点'] } };
      const { rows } = buildDpa({ vendors: [v] });
      assert(rows.length === 1, '下書きがあると一覧から消えた');
      assert(rows[0].draft, '下書きの印が載っていない');
      assert(rows[0].draft.open_questions.length === 1, '未解決の点が落ちている');
    }],

    ['**DPA: 下書きは dpa_reviewed の代わりにならない**（読んだことにしない）', () => {
      const base = { id: 'd', name: 'd', personal_data: 'personal', critical: true };
      const drafted = { ...base, dpa_draft: { at: '2026-09-01', by: 'external_research' } };
      const reviewed = { ...base, dpa_reviewed: '2026-09-01' };
      assert(buildDpa({ vendors: [drafted] }).rows.length === 1,
        '下書きだけで「読んだ」扱いになっている');
      assert(buildDpa({ vendors: [reviewed] }).rows.length === 0,
        '人が読んだ行が残り続けている');
    }],

    ['DPA: personal_data が none の行は対象外（check-vendors の未レビュー判定と同じ条件）', () => {
      const { rows } = buildDpa({ vendors: [{ id: 'n', name: 'n', personal_data: 'none' }] });
      assert(rows.length === 0, 'none が一覧に出た');
    }],

    ['**DPA: 読み終わった行は出さない**（終わったものが並ぶと一覧が読まれなくなる）', () => {
      const v = { id: 'd', name: 'd', personal_data: 'personal', critical: true };
      assert(buildDpa({ vendors: [v] }).rows.length === 1, '未レビューが出ない');
      assert(buildDpa({ vendors: [{ ...v, dpa_reviewed: '2026-09-01' }] }).rows.length === 0,
        'レビュー済みが出続ける');
    }],

    ['DPA: 代替が在ると露出は下がる', () => {
      const base = { personal_data: 'personal', critical: true };
      assert(dpaExposure({ ...base, fallback: null }) > dpaExposure({ ...base, fallback: '別経路' }),
        '代替の有無で差が出ない');
    }],

    ['DPA: 観点は⑦の行が名指しした4つのまま（勝手に増やさない）', () => {
      assert(DPA_ASPECTS.length === 4, `観点が 4 でない: ${DPA_ASPECTS.length}`);
      const ids = DPA_ASPECTS.map(([id]) => id).join(',');
      assert(ids === 'dpa,data_use,sla,exit', `観点の並びが違う: ${ids}`);
    }],

    // [2026-09-01] **`rows.length === 9` と件数を焼き込んでいた。**
    // オーナーが3社を `dpa_reviewed` にした日に落ちた —— **検査が壊れたのではなく、
    // 検体が実データの件数に寄りかかっていた。**
    //
    // **同じ形を今日3回踏んでいる**（check-expert-escalation で asks[1] → asks[0] →
    // 0件、そしてこれ）。件数は台帳が動けば変わる。**変わらないのは不変条件のほう**なので、
    // 期待値も実データから導く。
    ['**DPA: 実データで順位が作れる**（件数は焼き込まない）', () => {
      const reg = load().register;
      const { problems, rows } = buildDpa(reg);
      assert(problems.length === 0, problems.join(' / '));

      // 不変条件: 「個人データを渡していて、まだ読んでいない」ベンダーと1対1で対応する。
      // これは check-vendors の未レビュー判定と同じ条件（scripts/check-vendors.mjs）。
      const expected = (reg.vendors ?? [])
        .filter((v) => v.personal_data !== 'none' && !v.dpa_reviewed)
        .map((v) => v.id).sort();
      const got = rows.map((r) => r.id).sort();
      assert(JSON.stringify(got) === JSON.stringify(expected),
        `一覧が未レビュー集合と一致しない: ${got.join(',')} vs ${expected.join(',')}`);
      assert(rows.every((r) => Number.isInteger(r.exposure)), '露出が数でない行がある');

      // **空になったら空回りしている。**全部読み終えた日にこの検体は意味を失うので、
      // そのときは「読み終えた」ことを別の検体で固定すること。
      assert(expected.length > 0,
        '未レビューが0件 —— **この検体は空回りしている。**'
        + '全社読み終えたなら、policy.enforce_unreviewed を true にして守る側へ移すこと');
    }],

    ['**知らない personal_data の語を 0 にしない**', () => {
      assert(exposure('personal_data', { personal_data: 'なにか' }) === null,
        '登録簿に無い語が数になった（0 に丸めると「渡していない」と同じ扱いになる）');
    }],

    ['**money_flow が欠けたら順位を作らない**（欠けているほど安全に見える丸めを作らない）', () => {
      assert(exposure('governing_law', { critical: true }) === null,
        'money_flow 欠落が数になった — 「金銭が動かない」と同じ扱いになり、露出が小さく見えて読む順序が後ろへ下がる');
      assert(exposure('governing_law', { money_flow: 'なにか', critical: true }) === null,
        '登録簿に無い money_flow が数になった');
      assert(exposure('governing_law', { money_flow: 'subscription', critical: true }) === 2,
        '登録済みの値で露出が出ない');
    }],

    ['**AIの下書きは順序に残る**（下書きで一覧から消えると、人が読みに来ない）', () => {
      const doc = fixture();
      const row = doc.obligations.contract_review.vendors.find((v) => v.id === 'a');
      row.personal_data = 'ok';
      row.reviewed_by = 'ai_draft';
      const { cells } = build(doc);
      const c = cells.find((x) => x.vendor === 'a' && x.clause === 'personal_data');
      assert(c, '下書き済みのマスが順序から消えた — それは未読を隠しただけ');
      assert(c.draft === true, 'draft の印が付いていない');
    }],

    ['**未読のマスに下書きの印を付けない**（行が ai_draft でも、読んでいないものは読んでいない）', () => {
      const doc = fixture();
      const row = doc.obligations.contract_review.vendors.find((v) => v.id === 'a');
      row.liability_cap = 'ok';       // これは下書き
      row.reviewed_by = 'ai_draft';   // 行ぜんぶが下書き扱い
      const { cells } = build(doc);   // personal_data は unreviewed のまま
      const drafted = cells.find((x) => x.vendor === 'a' && x.clause === 'liability_cap');
      const untouched = cells.find((x) => x.vendor === 'a' && x.clause === 'personal_data');
      assert(drafted && drafted.draft === true, '下書きのマスに印が付いていない');
      assert(untouched && untouched.draft === false,
        '**未読のマスに下書きの印が付いた** — 読んだのか読んでいないのかが一覧から判らなくなる');
    }],

    ['**観点ごとの下書きも順序に残る**（人が確認済みの行に1つだけ下書きが混じる形）', () => {
      const doc = fixture();
      const row = doc.obligations.contract_review.vendors.find((v) => v.id === 'a');
      row.liability_cap = 'ok'; row.personal_data = 'ok';
      row.reviewed_by = 'human';
      row.draft_clauses = ['personal_data'];
      const { cells } = build(doc);
      assert(!cells.some((x) => x.vendor === 'a' && x.clause === 'liability_cap'),
        '人が確認した観点が順序に残った');
      const c = cells.find((x) => x.vendor === 'a' && x.clause === 'personal_data');
      assert(c && c.draft === true,
        '観点ごとの下書きが順序から消えた — 行が human なだけで、その観点は誰も見ていない');
    }],

    ['見たマスは順序に出ない', () => {
      const doc = fixture();
      // **添字ではなく id で指す。**検体の並びは「並べ替えが効いていること」を
      // 見るために入れ替えてあるので、添字で指すと検体をいじった日に黙ってずれる。
      doc.obligations.contract_review.vendors.find((v) => v.id === 'a').personal_data = 'ok';
      const { cells } = build(doc);
      assert(!cells.some((c) => c.vendor === 'a' && c.clause === 'personal_data'),
        'reviewed 済みのマスが残った');
    }],

    // --- 壊すと落ちる側 -----------------------------------------------------
    ['壊し: 片方の台帳にしか居ないベンダーを見逃さない', () => {
      const p = broken(fixture(), (d) => { d.register.vendors = d.register.vendors.filter((v) => v.id !== 'b'); });
      const { problems } = build(p);
      assert(problems.some((x) => x.includes('b')), '片側だけのベンダーが素通りした');
    }],

    ['壊し: 露出の導出が無い条項を見逃さない', () => {
      const p = broken(fixture(), (d) => { d.obligations.contract_review.clauses.push('新しい観点'); });
      assert(check(p).length > 0, '導出の無い条項が素通りした');
    }],

    ['壊し: contract_review が読めなければ落とす', () => {
      const p = broken(fixture(), (d) => { delete d.obligations.contract_review; });
      assert(build(p).problems.length > 0, '読めない台帳が素通りした');
    }],
  ];
  return run(scenarios, { label: '条項ワークシート' });
}

function report() {
  const doc = load();
  const { problems, cells, unranked } = build(doc);

  console.log('\n条項検査の読む順序 — 未確認のマスだけを、台帳の事実で並べた\n');
  if (problems.length) {
    for (const p of problems) console.log(`  **問題** ${p}`);
    console.log('');
  }

  let last = null;
  for (const c of cells) {
    if (c.exposure !== last) {
      const label = c.exposure === 2 ? '露出 2 — ここから読む'
                  : c.exposure === 1 ? '露出 1'
                  : '露出 0 — 台帳の事実の上では賭かるものが小さい';
      console.log(`  ${label}`);
      last = c.exposure;
    }
    console.log(`    ${c.clause.padEnd(14)} ${c.name}${c.draft ? '  **AIの下書きあり — 人はまだ見ていない**' : ''}`);
    for (const s of c.stakes) console.log(`        ${s}`);
    if (c.source) console.log(`        読む先: ${c.source}`);
  }

  // **読む先が無いマスは、順序の中に紛れると見えない。**露出が大きいほど害が出るので
  // 別立てで出す。埋まっていない理由が「見ていない」ではなく「読む先が台帳に無い」なら、
  // それは人が読めば済む話ではなく、**先に台帳を直す話**になる。
  const noSource = cells.filter((c) => !c.source);
  if (noSource.length) {
    console.log(`\n  **読む先が台帳に無い ${noSource.length} マス** — 読もうとしても読めない`);
    for (const c of noSource) {
      console.log(`    露出 ${c.exposure}  ${c.clause.padEnd(14)} ${c.name}`);
    }
    console.log('    `contract_review` の `source` が null。**人が読めば済む話ではない** ——');
    console.log('    先に読む先を台帳へ入れるところまでがオーナーの作業になる。');
  }

  if (unranked.length) {
    console.log(`\n  順序をつけていない ${unranked.length} マス（${[...new Set(unranked.map((u) => u.clause))].join(' / ')}）`);
    console.log('    **材料が台帳に無い。**「著作物・生成物を誰が抱えているか」を表す欄が');
    console.log('    vendor-register.json に無く、used_for は自由文なので順位に使えない。');
    console.log('    **これは欠落の報告であって、重要でないという意味ではない。**');
  }

  console.log('\n  **この一覧は ok / risk を決めない。**決めるのは人で、ここが出すのは順序と材料だけ。');
  // [2026-08-29] **ここは嘘を言っていた。**`policy.enforce_unreviewed` は
  // data/vendor-register.json にあり、守るのは **DPAレビュー**（dpa_reviewed）で、
  // **この40/44マスとは別物。**実測: 1マスを unreviewed に戻しても
  // check-corporate --check は exit 0。**条項マスを守る検査は存在しない。**
  console.log('  **[2026-08-29] 守る検査が入った。**check-corporate の clauseGuard が、'
    + '一度も見ていないマス（上限0）と、改定で戻されたまま14日過ぎたマスで落とす。'
    + 'policy.enforce_unreviewed（vendor-register.json）は別物で、守るのは DPAレビュー。\n');
  return problems.length;
}

/**
 * DPA レビューの読む順序。**条項側と同じで、決めるのは人。**
 *
 * ここが出すのは順序と、各ベンダーで何が賭かっているかと、**何を探せばいいか**。
 * `dpa_reviewed` に日付を入れるのは、読んだ人。
 */
function dpaReport() {
  const { register } = load();
  const { problems, rows } = buildDpa(register);

  console.log('\nDPAレビューの読む順序 — まだ読んでいないベンダーを、台帳の事実で並べた\n');

  if (!rows.length) {
    console.log('  未レビューのベンダーは無い。\n');
    return problems.length;
  }

  console.log('  **この一覧は締結の要否も可否も決めない。**決めるのは人で、'
    + 'ここが出すのは順序と材料だけ（条項ワークシートと同じ規律）。');
  console.log('  露出 = personal_data×2 ＋ critical ＋ 代替なし。**登録簿の4欄だけから導いている。**\n');

  for (const [i, r] of rows.entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. [露出 ${r.exposure}] ${r.id} — ${r.name}`);
    for (const s2 of r.stakes) console.log(`        ${String(s2).replace(/\n+/g, ' ')}`);
    if (r.draft) {
      console.log(`        **下書きあり**（${r.draft.at} / ${r.draft.by}）—— `
        + '**人の確認はまだ。**`dpa_reviewed` は空のまま');
      for (const q of r.draft.open_questions) {
        console.log(`          未解決: ${String(q).replace(/\n+/g, ' ')}`);
      }
    }
    console.log('');
  }

  console.log('  各ベンダーで見る4観点（⑦の行が名指ししているもの）:\n');
  for (const [, label, what] of DPA_ASPECTS) {
    console.log(`    ${label}`);
    console.log(`      ${what}\n`);
  }

  console.log('  **原文はこのセッションから読めない。**エージェント環境の egress プロキシが');
  console.log('  ベンダーのドメインを塞いでいる（2026-09-01 実測: resend.com / www.cloudflare.com /');
  console.log('  docs.github.com すべて EGRESS_BLOCKED）。**検索の要約を原文の代わりに使わない。**');
  console.log('  外部リサーチか人が読み、`dpa_reviewed` に日付を入れる。\n');

  for (const p of problems) console.error(`  **問題** ${p}`);
  return problems.length;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);
  if (process.argv.includes('--dpa')) process.exit(dpaReport() ? 1 : 0);
  if (process.argv.includes('--json')) {
    const doc = load();
    const out = process.argv.includes('--dpa-json')
      ? buildDpa(doc.register) : build(doc);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }
  if (process.argv.includes('--check')) {
    const problems = check(load());
    for (const p of problems) console.error(`  **問題** ${p}`);
    if (problems.length) process.exit(1);
    console.log('条項ワークシート: 2つの台帳は揃っている。');
    process.exit(0);
  }
  process.exit(report() ? 1 : 0);
}
