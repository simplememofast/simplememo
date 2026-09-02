#!/usr/bin/env node
/**
 * 法人としての期限・記録・契約条項を検査する。
 *
 *   node scripts/check-corporate.mjs           # 表示
 *   node scripts/check-corporate.mjs --check   # CI
 *
 * 【この台帳が守っていること】
 * **「把握していない」を「余裕がある」と読ませないこと。**
 * 期限の実日付も議事録の所在も契約書の本文も、リポジトリの外にあって
 * オーナーしか埋められない。だからここでできるのは、
 * **空いている場所を空いていると言い続けること**だけ。
 *
 * 資格情報の期限監視（check-expiry.mjs）が critical 3件を「未把握」として
 * 独立した状態で持っているのと同じ形にしてある。ok側に混ぜない。
 *
 * 【落とすもの／報告するもの】
 * 落とす … 台帳の形が壊れている（理由の無い未確認・存在しないベンダー参照・
 *          confirmed なのに日付が無い・期限を過ぎている）
 * 報告   … 未確認の件数そのもの。**これで落とすと、埋まるまでCIが永久に赤くなる**
 *          （埋められるのはオーナーだけなので、赤いCIは何も動かさない）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { requireShape } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OBLIGATIONS_PATH = path.join(ROOT, 'data/corporate-obligations.json');
const VENDOR_PATH = path.join(ROOT, 'data/vendor-register.json');

export const CLAUSE_STATES = ['ok', 'risk', 'unreviewed', 'not_applicable'];

/**
 * **誰がその読みを出したか。**
 *
 * [2026-08-28] オーナーが条項検査を「おまかせ」と委ねた日に足した。
 * それまで `reviewed_at`（いつ見たか）はあったが、**誰が見たかは無かった。**
 * 人が読んだ `ok` と、AIが読んだ `ok` が、台帳の上で同じ字面になる。
 *
 * **同じ日に、その危険が実際に出た。**Apple の規約を機械で読みに行ったところ、
 * §13（責任の制限）と §14.10（準拠法）は本文が取得できなかったのに、
 * 要約器が「通常はカリフォルニア州法」と**一般論で埋めて返してきた。**
 * これをそのまま `ok` にしていたら、台帳は「読んだ」と言い続ける。
 * `$note` が言う「**見たという記録が嘘を守る**」の、新しい形。
 *
 *   human     … 人が本文を読んで決めた
 *   ai_draft  … AIが本文を読んで下書きした。**まだ人は見ていない**
 *
 * **ai_draft は「見た」に数えない。**ワークシート（vendor-clause-worksheet.mjs）は
 * ai_draft のマスを読む順序に残し続ける —— 下書きが済んだ瞬間に一覧から
 * 消えるなら、それは unreviewed を隠しただけになる。
 */
export const REVIEWERS = ['human', 'ai_draft'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** これより近い期限は警告。資格情報の30日と揃える。 */
export const WARN_DAYS = 30;

/**
 * 決算期（何月末で締めるか）から、法人税・地方税の申告期限を導く。
 *
 * **手で書かない。**日付を台帳に直書きすると、翌年になっても誰も直さず
 * 「期限を過ぎている」か「もう過ぎた日付が next_due に残る」のどちらかになる。
 * このリポジトリが数字ではなく数え方を凍結しているのと同じ理由で、
 * ここも**決算月だけを持って、期限は毎回計算する。**
 *
 * 原則は事業年度終了日の翌日から2か月以内。
 * **申告期限の延長特例（1か月）を適用している場合は、この計算より1か月遅い。**
 * 適用の有無はリポジトリから取れないので、`filing_extension_months` を明示で持つ。
 *
 * @param fyEndMonth 決算月（1〜12）。2 なら2月末締め
 * @param today      YYYY-MM-DD
 * @param extraMonths 延長特例の月数（既定0）
 */
export function nextCorporateTaxDue(fyEndMonth, today, extraMonths = 0) {
  if (!Number.isInteger(fyEndMonth) || fyEndMonth < 1 || fyEndMonth > 12) return null;
  const t = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;

  // 決算期末の候補を年ごとに作り、**今日より後に来る最初の申告期限**を返す。
  for (let y = t.getUTCFullYear() - 1; y <= t.getUTCFullYear() + 2; y += 1) {
    // 決算期末＝その月の末日（UTCの月末は翌月0日で取れる）
    const fyEnd = new Date(Date.UTC(y, fyEndMonth, 0));
    // 期限＝末日の (2 + 延長) か月後の同日。月末締めなので月末に落ちる。
    const due = new Date(Date.UTC(y, fyEndMonth + 2 + extraMonths, 0));
    if (due > t && fyEnd <= due) return due.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * **暦で固定された年次期限**（法定調書合計表の1月31日など）を導く。
 *
 * `nextCorporateTaxDue` と同じ理由でここに置く —— **手で日付を書かない。**
 * `2027-01-31` と直書きすると、2027年2月1日以降は「期限を過ぎている」に化けるか、
 * 誰かが黙って年だけ書き換える。**月日だけを持って、次の到来日は毎回計算する。**
 *
 * 決算期からの導出（`fiscal_year_end`）と違い、こちらは**会社の事情に依存しない。**
 * 法が日付そのものを決めているものだけに使う。
 *
 * **境界は「今日を含まない」。**期限当日はまだ過ぎていないが、
 * `next_due` が今日を指したまま翌日を迎えると期限切れになるので、
 * **当日は「次」に進める側へ倒す**（早く鳴るほうが安全）。
 *
 * @param month 1〜12
 * @param day   1〜31（その月に存在しない日は null）
 * @param today YYYY-MM-DD
 */
export function nextFixedAnnualDue(month, day, today) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const t = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(t.getTime())) return null;
  for (let y = t.getUTCFullYear(); y <= t.getUTCFullYear() + 2; y += 1) {
    const due = new Date(Date.UTC(y, month - 1, day));
    // **月をまたいだ日付を黙って受け取らない**（2/31 は 3/3 になる）。
    if (due.getUTCMonth() !== month - 1 || due.getUTCDate() !== day) return null;
    if (due > t) return due.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * @param {Set|null} vendorIds  ベンダー台帳の id。**null は「照合しない」**で、
 *   空の Set は「ベンダー台帳が空」。この2つは違う。
 */
/**
 * **埋め終えた条項マスを、守る。**
 *
 * [2026-08-29] **ここは長らく何も無かった。**そして台帳3箇所と、この作業中の説明が
 * 「埋めたあと `policy.enforce_unreviewed` を true にすると CI が守る」と言っていた。
 * **嘘だった** —— あのフラグは `data/vendor-register.json` にあり、守るのは DPAレビュー。
 * **実測: 1マスを unreviewed に戻しても `--check` は exit 0。**
 *
 * 守るべきものは2つあり、**性質が違うので別々に数える。**
 *
 * **① 一度も見ていないマス（`unreviewed_budget`）。**
 * ベンダーを足したのに読んでいない、という形。**ラチェット** ——
 * 上限を上げて通さない。44/44 を埋め切った日に 0 にした。
 *
 * **② 改定で戻されたマス（`reset_grace_days`）。**
 * `vendor-terms.mjs` が指紋の変化で `reviewed` を `unreviewed` へ戻したもの。
 * **これを即座に落とすと膠着する** —— seo-daily は改定を検知して
 * `data/corporate-obligations.json` をコミットするPRを出すが、
 * **そのPR自身が落ちて指紋の更新が入らず、翌週また同じ改定を検知する。**
 * 機械が仕事をした瞬間に、機械の仕事が止まる形になる。
 *
 * だから戻された直後は通し、**放置されたら落とす。**猶予は週次取得の2回ぶん。
 * **`fetched_at` では測れない** —— あちらは改定が無くても毎回今日になるので、
 * `vendor-terms` に `reset_at` を書かせて、そちらを見る。
 */
export function clauseGuard(cr, today) {
  const problems = [];
  const clauses = cr.clauses || [];
  const budget = cr.unreviewed_budget;
  const grace = cr.reset_grace_days;
  // **上限が無ければ無制限、が一番危ない。**（check-selftests と同じ扱い）
  if (typeof budget !== 'number') {
    problems.push('contract_review.unreviewed_budget が数でない'
      + ' — **上限の無いラチェットはラチェットではない**');
  }
  if (typeof grace !== 'number') {
    problems.push('contract_review.reset_grace_days が数でない'
      + ' — **猶予が無いと、改定を検知したPR自身が落ちて膠着する**');
  }
  if (problems.length) return problems;

  const never = [];
  const stale = [];
  for (const v of cr.vendors || []) {
    const resetClauses = new Set(Array.isArray(v.reset_clauses) ? v.reset_clauses : []);
    const resetAt = typeof v.reset_at === 'string' ? v.reset_at : null;
    for (const c of clauses) {
      if (v[c] !== 'unreviewed') continue;
      if (resetAt && resetClauses.has(c)) {
        const days = Math.round(
          (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${resetAt}T00:00:00Z`)) / 86400000);
        if (Number.isFinite(days) && days > grace) stale.push(`${v.id}.${c}（${days}日）`);
        continue;   // 猶予の内側。**機械が戻した直後を落とさない**
      }
      never.push(`${v.id}.${c}`);
    }
  }
  if (never.length > budget) {
    problems.push(`一度も見ていない条項マスが ${never.length} 件で、上限 ${budget} を超えた`
      + ` — ${never.join(' / ')}。**読むか、読まない理由を書いて not_applicable にする。**`
      + '（上限を上げて通さない）');
  } else if (never.length < budget) {
    // **余った枠は、次の空欄を黙って飲む。**
    // 直して減らしたら上限も同じPRで下げさせる（check-routine-runs の open_budget と同じ）。
    problems.push(`unreviewed_budget が ${budget} だが、実際に見ていないマスは ${never.length} 件`
      + ' — **枠が余っている。**次にベンダーを足したとき、その空欄を黙って飲む。'
      + `${never.length} へ下げること`);
  }
  if (stale.length) {
    problems.push(`改定で戻されたまま ${grace} 日を過ぎた条項マスが ${stale.length} 件`
      + ` — ${stale.join(' / ')}。**前の判定は前の本文に対するもの。**`
      + '読み直して reviewed_by を付け直すこと');
  }
  return problems;
}

/**
 * **その期限を把握しているか。**「オーナーが確認した」だけが把握ではない。
 *
 * 【なぜ要るか — 機械が入れた権威ある値が「未把握」と表示されていた】
 * 2026-09-02、週次が RDAP から simplememofast.com の有効期限（2027-01-30）を入れた。
 * `check-domain-expiry.mjs --write` は `next_due` と `source: "rdap"` を書き、
 * `unconfirmed_reason` を null にするが、**`confirmed_by_owner` は触らない。**
 * その結果この行は:
 *
 *   - 一覧に「**未把握**」と出続ける（値は在るのに）
 *   - **日付の検査を1つも受けない** —— 期限切れ警告も、近接の警告も飛ばされる
 *   - 「未確認なのに理由が無い」で `--check` が落ちる（理由は null にされたので）
 *
 * **3つ目が効いた。**検査が自分で「この状態は矛盾している」と言った。
 *
 * 【どちらへ直すか】
 * `confirmed_by_owner` を機械が立てる形にはしない —— **フラグの名前が「owner」で、
 * 機械が自己認証する経路を作ることになる。**直すのは「把握」の定義のほう。
 *
 * 出典を名乗り、日付が入っていて、未確認の理由が無い行は**把握している。**
 * オーナーが確認した行と同じように**検査を受けさせる**（そちらが本体）。
 *
 * **既存の5行は変わらない**（どれも source を持たず confirmed_by_owner: true）。
 * 効くのは RDAP 由来のこの1行だけで、**効いた結果は「監視が増える」方向。**
 */
export function isKnown(d) {
  if (d?.confirmed_by_owner === true) return true;
  return typeof d?.source === 'string' && d.source.length > 0
    && DATE.test(d?.next_due || '')
    && d?.unconfirmed_reason == null;
}

export function validate(doc, { vendorIds = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  const warnings = [];

  for (const d of doc.deadlines || []) {
    const at = `deadlines「${d.title || d.id}」`;
    if (!d.id || !d.title) problems.push(`${at}: id と title が要る`);
    if (!d.what_breaks) problems.push(`${at}: what_breaks が無い — 切れたら何が止まるか書いていない期限は優先順位が付かない`);
    if (isKnown(d)) {
      if (!DATE.test(d.next_due || '')) {
        problems.push(`${at}: 把握しているのに next_due が YYYY-MM-DD でない`);
      } else {
        const days = Math.round((new Date(d.next_due) - new Date(today)) / 86400000);
        if (days < 0) problems.push(`${at}: 期限を ${-days} 日過ぎている`);
        else if (days <= WARN_DAYS) warnings.push(`${at}: あと ${days} 日`);
      }
      // **決算期から導ける期限は、導いた値と一致することを強制する。**
      // 手で書き換えて年をまたぎ忘れる経路をつぶす。
      if (d.derive_from === 'fixed_annual') {
        const derived = nextFixedAnnualDue(d.due_month, d.due_day, today);
        if (!derived) {
          problems.push(`${at}: derive_from: fixed_annual だが due_month / due_day が無い/不正`);
        } else if (derived !== d.next_due) {
          problems.push(`${at}: next_due ${d.next_due} が ${d.due_month}/${d.due_day} からの導出 ${derived} と違う`
            + '（**手で日付を書き換えない。**月日だけ持って毎回計算する）');
        }
      }
      if (d.derive_from === 'fiscal_year_end') {
        const m = doc.entity?.fiscal_year_end_month;
        const ext = d.filing_extension_months ?? 0;
        const derived = nextCorporateTaxDue(m, today, ext);
        if (!derived) {
          problems.push(`${at}: derive_from: fiscal_year_end だが entity.fiscal_year_end_month が無い/不正`);
        } else if (derived !== d.next_due) {
          problems.push(`${at}: next_due ${d.next_due} が決算期${m}月からの導出 ${derived} と違う`
            + '（延長特例は filing_extension_months で明示すること。**手で日付を書き換えない**）');
        }
      }
    } else if (!d.unconfirmed_reason) {
      problems.push(`${at}: 未確認なのに理由が無い`
        + ' — **「把握していない」は「余裕がある」ではない。**なぜ埋まらないかを残す');
    }
  }

  for (const r of doc.records || []) {
    const at = `records「${r.title || r.id}」`;
    if (typeof r.exists !== 'boolean') problems.push(`${at}: exists を明示すること`);
    if (r.exists && !r.where) problems.push(`${at}: あると書いているのに所在が無い`);
    if (!r.exists && !r.note) problems.push(`${at}: 無いのに理由が無い`);
    // [2026-08-28] **所在を決めたのに実在が未確認の行は、確かめた日を書ける欄を持つこと。**
    //
    // `exists: false` は「無い」と「確かめていない」を同じ値にする。
    // だから**確かめても値が変わらず、機械は永久に気づかない** ——
    // 同じ日に autonomy-gap の company_facts で直したのと同じ罠で、
    // あちらは「満たされようがない述語」が2日間「まだです」の顔で残っていた。
    //
    // 欄は null でよい（null は「見ていない」）。**無いのが困る。**
    if (r.where && !r.exists && !('existence_confirmed_at' in r)) {
      problems.push(`${at}: 所在は決まったのに existence_confirmed_at が無い`
        + ' — **確かめても値が変わらないので、誰も検知できない**'
        + '（null で置くこと。無かったと確かめた場合も日付を入れる）');
    }
  }

  const cr = doc.contract_review;
  if (cr) {
    problems.push(...clauseGuard(cr, today));
    const seen = new Set();
    for (const v of cr.vendors || []) {
      const at = `contract_review「${v.id}」`;
      // [2026-08-26] ここは `vendorIds.size && !vendorIds.has(...)` だった。
      // **ベンダー台帳が空だと、この規則が丸ごと消える。**
      // 実測: 台帳に無い id を contract_review へ足す → 捕まる。
      // そのまま vendor-register.json を空にする → **検出なし**。
      // 消える規則の文面が「片方だけ増えると照合が素通りする」で、
      // **素通りさせる条件を自分で持っていた。**
      if (vendorIds && !vendorIds.has(v.id)) {
        problems.push(`${at}: ベンダー台帳に無い id — 片方だけ増えると照合が素通りする`);
      }
      if (seen.has(v.id)) problems.push(`${at}: id が重複`);
      seen.add(v.id);
      for (const c of cr.clauses || []) {
        if (!CLAUSE_STATES.includes(v[c])) {
          problems.push(`${at}: ${c} が ${CLAUSE_STATES.join('/')} のいずれかで要る`);
        }
      }
      const anyReviewed = (cr.clauses || []).some((c) => v[c] !== 'unreviewed');
      if (anyReviewed && !v.reviewed_at) problems.push(`${at}: 確認した観点があるのに reviewed_at が無い`);
      // **いつ見たかだけでは足りない。誰が見たかが要る。**
      if (anyReviewed && !REVIEWERS.includes(v.reviewed_by)) {
        problems.push(`${at}: 確認した観点があるのに reviewed_by が ${REVIEWERS.join('/')} のいずれでもない — 人の読みとAIの下書きが同じ字面になる`);
      }
      // 下書きは**何を読めなかったか**を必ず持つ。部分的な読みで断定するのが、
      // この欄を足すきっかけになった失敗そのもの（2026-08-28 の Apple §13 / §14.10）。
      if (v.reviewed_by === 'ai_draft' && !v.draft_note) {
        problems.push(`${at}: ai_draft なのに draft_note が無い — 何を読んで何を読めなかったかが残らない`);
      }
      // [2026-08-28] **読みは観点ごとに起きるが、`reviewed_by` は行に1つしかない。**
      // 4観点のうち3つを人が確認し、1つがAIの下書きのまま、という状態が実際に出た
      // （apple の ip を後から足したとき）。行を `human` にすると下書きまで
      // 人が見たことになり、`ai_draft` に戻すと確認済みの3つが下書き扱いになる。
      // **どちらも嘘なので、例外を名指しで持つ欄を足した。**
      if (v.draft_clauses !== undefined) {
        if (!Array.isArray(v.draft_clauses) || v.draft_clauses.length === 0) {
          problems.push(`${at}: draft_clauses は空でない配列で書く（無いなら欄ごと消す）`);
        } else {
          for (const c of v.draft_clauses) {
            if (!(cr.clauses || []).includes(c)) {
              problems.push(`${at}: draft_clauses に知らない観点「${c}」`);
            } else if (v[c] === 'unreviewed') {
              problems.push(`${at}: draft_clauses の「${c}」が unreviewed — 下書きが無いのに下書き扱いにしている`);
            }
          }
          if (!v.draft_note) {
            problems.push(`${at}: draft_clauses があるのに draft_note が無い — 何を読んで何を読めなかったかが残らない`);
          }
        }
      }
      if (v.liability_cap === 'risk' && !v.risk_note) {
        problems.push(`${at}: risk と書いたのに risk_note が無い — 何が危ないか残らない`);
      }
    }
    // ベンダー台帳にあるのにここに無い＝検査対象から漏れている
    for (const id of vendorIds || []) {
      if (!seen.has(id)) problems.push(`contract_review に「${id}」が無い — ベンダー台帳にあるのに条項を見る対象から漏れている`);
    }
  }
  return { problems, warnings };
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
// 通ることだけ確かめる自己テストは、検査が何も見ていなくても緑になる。
const SELFTEST_BREAKAGES = [
  ['**切れたら何が止まるか**が無い期限は落ちる（優先順位が付かない）', (d) => { delete d.deadlines[0].what_breaks; }],
  ['id と title が無ければ落ちる', (d) => { delete d.deadlines[0].id; delete d.deadlines[0].title; }],
  ['confirmed なのに日付が不正なら落ちる', (d) => { d.deadlines[0].confirmed_by_owner = true; d.deadlines[0].next_due = 'そのうち'; }],
  // [2026-09-02] **機械導出の行も検査を受ける。**受けないと、値が在るのに
  // 期限切れ警告が飛ばされる（RDAP のドメイン期限がその状態だった）。
  ['**機械導出なのに日付が不正なら落ちる**（オーナー確認と同じ検査を受ける）',
    (d) => { const x = d.deadlines.find((y) => y.source && !y.confirmed_by_owner);
             if (!x) throw new Error('機械導出の行が実データに無い — **この検体が空回りしている**');
             x.next_due = 'そのうち'; }],
  ['**機械導出でも理由が残っていれば未把握に戻る**（把握したことにしない）',
    (d) => { const x = d.deadlines.find((y) => y.source && !y.confirmed_by_owner);
             if (!x) throw new Error('機械導出の行が実データに無い');
             x.unconfirmed_reason = null; x.next_due = null; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8')),
  (d) => validate(d).problems,
  SELFTEST_BREAKAGES,
);

// [2026-08-26] **空の台帳で規則が消える形**を固定する。
// `vendorIds.size &&` だった頃は、vendor-register.json を空にすると
// 「ベンダー台帳に無い id」が1件も出なかった（実測済み）。
// [2026-08-28] **誰が読んだかの欄。**人の読みとAIの下書きが同じ字面になるのを止める。
SCENARIOS.push(
  // ── 暦で固定された年次期限（2026-09-01 追加）──────────────────
  ['固定年次: 次の到来日を返す', () => {
    assert(nextFixedAnnualDue(1, 31, '2026-09-01') === '2027-01-31',
      `導出が違う: ${nextFixedAnnualDue(1, 31, '2026-09-01')}`);
    assert(nextFixedAnnualDue(1, 31, '2027-01-30') === '2027-01-31', '直前で次年に飛んでいる');
  }],

  ['**固定年次: 当日は「次」へ倒す**（当日のまま翌日を迎えると期限切れに化ける）', () => {
    assert(nextFixedAnnualDue(1, 31, '2027-01-31') === '2028-01-31',
      '当日を「まだ来ていない」として残している');
  }],

  ['**固定年次: 存在しない日付を黙って繰り上げない**（2/31 が 3/3 になる）', () => {
    assert(nextFixedAnnualDue(2, 31, '2026-09-01') === null, '2/31 が日付として通った');
    assert(nextFixedAnnualDue(undefined, 31, '2026-09-01') === null, '月の欠落が通った');
    assert(nextFixedAnnualDue(1, undefined, '2026-09-01') === null, '日の欠落が通った');
  }],

  ['**固定年次: 手で書いた日付が導出と違えば落ちる**（年をまたいで誰も直さない経路をつぶす）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const t = d.deadlines.find((x) => x.derive_from === 'fixed_annual');
    assert(t, 'fixed_annual の行が実データに無い — **この検査が空回りしている**');
    t.next_due = '2099-01-31';
    assert(validate(d).problems.some((x) => x.includes('からの導出')),
      '手書きの日付が素通りした');
  }],

  ['**固定年次: 月日が欠けたら落ちる**（導出を名乗って導出できない状態を作らない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const t = d.deadlines.find((x) => x.derive_from === 'fixed_annual');
    delete t.due_month;
    assert(validate(d).problems.some((x) => x.includes('due_month')),
      'due_month 欠落が素通りした');
  }],

  ['**読んだのに reviewed_by が無ければ落ちる**（人の読みとAIの下書きが同じ字面になる）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const v = d.contract_review.vendors[0];
    v[d.contract_review.clauses[0]] = 'ok';
    v.reviewed_at = '2026-08-28';
    delete v.reviewed_by;
    assert(validate(d).problems.some((x) => x.includes('reviewed_by')),
      'reviewed_by 無しの読みが素通りした');
  }],
  // [2026-08-28] **確かめた日を書ける欄が消えたら落ちる。**
  // `exists: false` は「無い」と「確かめていない」を潰す。潰れたまま所在だけ決めると、
  // **オーナーが本店を見に行っても台帳の値が動かない。**
  ['**所在は決まったのに確認日の欄が無ければ落ちる**（確かめても値が変わらない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const r = (d.records || []).find((x) => x.where && !x.exists);
    assert(r, '所在は決まったが実在未確認の行が実データに無い — **この検査が空回りしている**');
    delete r.existence_confirmed_at;
    assert(validate(d).problems.some((x) => x.includes('existence_confirmed_at')),
      '確認日の欄が無い行が素通りした');
  }],
  ['**確認日が null なのは正当**（null は「見ていない」であって欠落ではない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const r = (d.records || []).find((x) => x.where && !x.exists);
    r.existence_confirmed_at = null;
    assert(!validate(d).problems.some((x) => x.includes('existence_confirmed_at')),
      'null の確認日を欠落と読んだ — **常に鳴る検査は何も見ていない**');
  }],
  ['**実在する記録には確認日を求めない**（所在があって在るなら、それで足りている）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const r = (d.records || []).find((x) => x.exists);
    assert(r, '実在する記録が実データに無い');
    delete r.existence_confirmed_at;
    assert(!validate(d).problems.some((x) => x.includes('existence_confirmed_at')),
      '在る記録にまで確認日を求めた');
  }],
  // [2026-08-29] **埋め終えたものを守る検査。**入れるまで、44マスを埋め切っても
  // 1マスを unreviewed に戻して --check を走らせると exit 0 だった（実測）。
  ['**一度も見ていないマスが上限を超えたら落ちる**', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    d.contract_review.vendors[0][d.contract_review.clauses[0]] = 'unreviewed';
    assert(validate(d).problems.some((x) => x.includes('一度も見ていない')),
      '**戻したマスが素通りした** —— これが入るまでの状態');
  }],
  ['**上限を先に上げておくのも落とす**（余った枠は次の空欄を黙って飲む）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    d.contract_review.unreviewed_budget = 5;
    const p = validate(d).problems;
    assert(p.some((x) => x.includes('枠が余っている')),
      `枠を先に広げても落ちなかった: ${p.join(' / ')}`);
  }],
  ['上限が数でなければ落ちる（**無ければ無制限、が一番危ない**）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    delete d.contract_review.unreviewed_budget;
    assert(validate(d).problems.some((x) => x.includes('unreviewed_budget')),
      '上限を消しても落ちない');
  }],
  ['猶予が数でなければ落ちる', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    delete d.contract_review.reset_grace_days;
    assert(validate(d).problems.some((x) => x.includes('reset_grace_days')),
      '猶予を消しても落ちない');
  }],
  // **膠着しないことを固定する。**改定を検知したPR自身が落ちると、
  // 指紋の更新が入らず翌週また同じ改定を検知する。
  ['**改定で戻された直後は落とさない**（落とすと seo-daily のPRが入らず膠着する）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const c = d.contract_review.clauses[0];
    const v = d.contract_review.vendors[0];
    v[c] = 'unreviewed';
    v.reset_at = '2026-08-29';
    v.reset_clauses = [c];
    const p = validate(d, { today: '2026-08-31' }).problems;   // 2日後
    assert(!p.some((x) => x.includes('条項マス')),
      `**機械が戻した直後を落とした** —— 膠着する: ${p.join(' / ')}`);
  }],
  ['**猶予を過ぎたら落ちる**（戻されたまま放置させない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const c = d.contract_review.clauses[0];
    const v = d.contract_review.vendors[0];
    v[c] = 'unreviewed';
    v.reset_at = '2026-08-01';
    v.reset_clauses = [c];
    const p = validate(d, { today: '2026-08-29' }).problems;   // 28日後
    assert(p.some((x) => x.includes('戻されたまま')),
      `28日放置しても落ちない: ${p.join(' / ')}`);
  }],
  ['**戻されていない観点は猶予に乗らない**（reset_clauses に無いものを守らない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const [c0, c1] = d.contract_review.clauses;
    const v = d.contract_review.vendors[0];
    v[c1] = 'unreviewed';          // 戻されていない観点を空に
    v.reset_at = '2026-08-29';
    v.reset_clauses = [c0];        // 猶予の対象は別の観点だけ
    assert(validate(d, { today: '2026-08-29' }).problems.some((x) => x.includes('一度も見ていない')),
      '**行に reset_at があるだけで、別の観点まで猶予に乗せた**');
  }],
  ['**登録されていない読み手は落ちる**（"claude" や "auto" を勝手に足させない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const v = d.contract_review.vendors[0];
    v[d.contract_review.clauses[0]] = 'ok';
    v.reviewed_at = '2026-08-28';
    v.reviewed_by = 'claude';
    assert(validate(d).problems.some((x) => x.includes('reviewed_by')),
      '未登録の読み手が素通りした');
  }],
  ['**ai_draft なのに何を読めなかったかが無ければ落ちる**', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const v = d.contract_review.vendors[0];
    v[d.contract_review.clauses[0]] = 'ok';
    v.reviewed_at = '2026-08-28';
    v.reviewed_by = 'ai_draft';
    delete v.draft_note;
    assert(validate(d).problems.some((x) => x.includes('draft_note')),
      '読めた範囲を書かない下書きが素通りした — 部分的な読みで断定するのが、この欄を足したきっかけ');
  }],
  ['**draft_clauses に unreviewed の観点を入れたら落ちる**（下書きが無いのに下書き扱い）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const cr = d.contract_review;
    const v = cr.vendors[0];
    v[cr.clauses[0]] = 'ok'; v.reviewed_at = '2026-08-28'; v.reviewed_by = 'human';
    v.draft_note = 'x';
    v.draft_clauses = [cr.clauses.find((c) => v[c] === 'unreviewed') ?? cr.clauses[1]];
    v[v.draft_clauses[0]] = 'unreviewed';
    assert(validate(d).problems.some((x) => x.includes('draft_clauses')),
      '下書きの無い観点を下書き扱いにしたのが素通りした');
  }],
  ['**draft_clauses に知らない観点を入れたら落ちる**', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const v = d.contract_review.vendors[0];
    v[d.contract_review.clauses[0]] = 'ok'; v.reviewed_at = '2026-08-28';
    v.reviewed_by = 'human'; v.draft_note = 'x'; v.draft_clauses = ['なにか'];
    assert(validate(d).problems.some((x) => x.includes('知らない観点')),
      '登録簿に無い観点名が素通りした');
  }],
  ['**draft_clauses があるのに draft_note が無ければ落ちる**', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const cr = d.contract_review;
    const v = cr.vendors[0];
    for (const c of cr.clauses) v[c] = 'ok';
    v.reviewed_at = '2026-08-28'; v.reviewed_by = 'human';
    v.draft_clauses = [cr.clauses[1]];
    delete v.draft_note;
    assert(validate(d).problems.some((x) => x.includes('draft_note')),
      '読めた範囲を書かない下書きが素通りした');
  }],
  ['**ベンダー台帳が空なら contract_review は全部照合できない**（空を「照合しない」と読まない）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const p = validate(d, { vendorIds: new Set() }).problems;
    assert(p.some((x) => x.includes('ベンダー台帳に無い id')),
      '空のベンダー台帳を通した — **片方だけ増えたのを検出できない**');
  }],
  ['null は「照合しない」（空の Set とは別）', () => {
    const d = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
    const p = validate(d, { vendorIds: null }).problems;
    assert(!p.some((x) => x.includes('ベンダー台帳に無い id')), '照合しない指定で照合した');
  }],
);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(OBLIGATIONS_PATH, 'utf8'));
  const vendors = JSON.parse(fs.readFileSync(VENDOR_PATH, 'utf8'));
  requireShape(vendors, ['vendors'], { what: 'data/vendor-register.json',
    why: '契約条項を見る対象と突き合わせられない（**片側だけ増えたのを検出できない**）' });
  const vendorIds = new Set(vendors.vendors.map((v) => v.id));
  const { problems, warnings } = validate(doc, { vendorIds });

  const unconfirmed = (doc.deadlines || []).filter((d) => !isKnown(d));
  // [2026-08-28] **「所在が決まっていない」と「実在を確かめていない」を分けた。**
  // ここは長らく `!r.exists` を数えて「所在が決まっていない N件」と書いていたが、
  // **数えているものと言っていることが違った。**所在を決めても件数が減らないので、
  // 決めた日にレポートが「まだ決まっていない」と言い続ける。
  // （incident-records の note がまさに「発生していないのか場所が無いのか
  //   区別できていない」と書いていた。**レポート自身も区別していなかった。**）
  const noPlace = (doc.records || []).filter((r) => !r.where);
  const unverified = (doc.records || []).filter((r) => r.where && !r.exists);
  const cr = doc.contract_review || {};
  const unreviewedVendors = (cr.vendors || []).filter(
    (v) => (cr.clauses || []).every((c) => v[c] === 'unreviewed'));
  // **下書きは別勘定で出す。**「確認済み」に混ぜると、人が見ていないものが
  // 見たものとして数えられる。件数を分けておけば、混ぜようがない。
  const draftVendors = (cr.vendors || []).filter(
    (v) => v.reviewed_by === 'ai_draft' || (v.draft_clauses || []).length);

  console.log('法人としての期限・記録・契約条項\n');
  console.log(`  期限 ${doc.deadlines.length}件 — うち**未把握 ${unconfirmed.length}件**`);
  for (const d of doc.deadlines) {
    // **オーナー確認と機械導出を混ぜない。**どちらも把握だが、出所が違う。
    const how = d.confirmed_by_owner ? '' : `  ← ${d.source} から機械が入れた`;
    console.log(`    ${isKnown(d) ? d.next_due : '**未把握**'.padEnd(10)}  ${d.title}${how}`);
    if (!isKnown(d)) console.log(`                ${d.unconfirmed_reason}`);
  }
  console.log(`\n  記録 ${doc.records.length}件 — **所在が未定 ${noPlace.length}件`
    + ` / 所在は決まったが実在は未確認 ${unverified.length}件**`);
  for (const r of doc.records) {
    const mark = !r.where ? '**所在未定**' : (r.exists ? 'あり      ' : '**実在未確認**');
    console.log(`    ${mark}  ${r.title}`);
    if (r.where) console.log(`                  所在: ${r.where}`);
    if (!r.exists) console.log(`                  ${r.note}`);
  }
  console.log(`\n  契約条項 ${cr.vendors?.length ?? 0}社 × ${cr.clauses?.length ?? 0}観点`);
  console.log(`    **全観点が未確認のベンダー ${unreviewedVendors.length}社**`);
  if (draftVendors.length) {
    console.log(`    **AIの下書きどまり ${draftVendors.length}社** — 人はまだ見ていない（reviewed_by: ai_draft）`);
    for (const v of draftVendors) {
      const which = v.reviewed_by === 'ai_draft' ? '全観点' : `${v.draft_clauses.join(' / ')} のみ`;
      console.log(`      ${v.id}（${which}）: ${v.draft_note}`);
    }
  }
  console.log('    書面の契約書は無く、各社の規約への同意で成立している。');
  console.log('    **unreviewed は「問題なし」ではなく「見ていない」。**');

  if (warnings.length) {
    console.log('\n  期限が近い:');
    for (const w of warnings) console.log(`    ${w}`);
  }
  console.log('\n  **この台帳は器で、中身の大半はまだ空。**埋められるのはオーナーだけ。');
  console.log('  ここでできるのは、空いている場所を空いていると言い続けることだけ。');

  if (problems.length) {
    console.error('\n法人の台帳: 形の問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    console.log('\n台帳の形に問題なし（未把握の件数は上に出ている。ゼロではない）。');
  }
}
