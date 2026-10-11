#!/usr/bin/env node
/**
 * 各社の規約本文を取りに行き、**改定されたら「読み直し」に戻す。**
 *
 *   node scripts/vendor-terms.mjs             # 取得して現況を出す（CIで走る）
 *   node scripts/vendor-terms.mjs --write     # 台帳の指紋を更新する
 *   node scripts/vendor-terms.mjs --check     # CI: 台帳の形と自己検査
 *   node scripts/vendor-terms.mjs --selftest  # 解析の自己検査（ネットを見ない）
 *
 * 【なぜ要るか — 一度読んでも、改定されたら振り出しに戻る】
 * `data/corporate-obligations.json` の `contract_review` は 10社 × 4観点 = 40マスで、
 * **現状すべて unreviewed**。台帳は理由を「書面契約が無く各社規約への同意で成立している
 * ので、確認は人が規約を読むことでしか進まない」と書いていて、それ自体は正しい。
 *
 * **ただし正しいのは「最初の1回」だけ。**規約は改定される。人が読んで ok と書いた翌月に
 * 責任上限が変わっても、**台帳は ok のままになる。**これは
 * unreviewed（見ていない）より悪い —— **見たことがある、という記録が嘘を守る。**
 *
 * だからここが持つのは判定ではなく**「いつの本文を見たか」**:
 *
 *   人がやること … 本文を読んで ok / risk を決める（法的判断。ここでは触らない）
 *   機械がやること … 本文を取りに行き、**指紋が変わったら reviewed を unreviewed へ戻す**
 *
 * 【取得はCI、解析はここ】
 * check-domain-expiry と同じ。このエージェント環境のプロキシは各社の規約ページへの
 * CONNECT を拒否する（2026-08-26 に resend / cloudflare / anthropic で確認・全て 000）。
 * **GitHub のランナーからは届く**ので、解析は純関数にして手元で自己検査し、取得はCIに任せる。
 *
 * 【取れなかったことを「変わっていない」と書かない】
 * 取得に失敗した回は `unknown` を返し、**台帳を触らない**。
 * このリポジトリが繰り返し踏んでいる誤り（読めなかった＝異常なし）を持ち込まない。
 *
 * 【指紋が追うのは「source が指すページ」であって、条項そのものではない】
 * **2026-08-26 に実データで確認。**apple の source（developer.apple.com/terms/）から
 * 取れたのは 10,531 字の**規約の一覧ページ**で、各契約の本文は別（PDF を含む）。
 * つまりこの指紋が言えるのは:
 *
 *   changed   … **そのページで何かが動いた。**条項が変わった証明ではない（改版の告知や
 *               並び替えでも動く）。**「読み直せ」の合図**であって「変わった」の断定ではない
 *   unchanged … そのページは同じ。**リンク先のPDFの改定は見えない**
 *
 * だから reviewed を戻す方向にだけ使う。**戻しすぎる誤りは読み直しで済み、
 * 戻さない誤りは嘘の ok が残る。**非対称なので、粗いほうへ倒してある。
 *
 * 【中身が無いページを「取得できた」と書かない】
 * 法務ページは JS で本文を描くものがある。取れた HTML が殻だけでも 200 は返るので、
 * **殻の指紋が「安定している」ように見える。**改定を永久に見逃す形なので、
 * 本文らしさ（長さと語）を確かめてから指紋を取る。
 *
 * 【指紋は本文だけに取る — 2026-09-24】
 * **ページ全体の指紋は、メニューが1語増えるだけで動いていた。**Web アーカイブの
 * 写しで同じ関数を回して確かめた（写しの指紋が台帳の値と一致することで、CI が見た
 * 本文と同じだと確認したうえで比べた）:
 *
 *   anthropic  09-08 / 09-15 / 09-21 / 09-22 と4回指紋が変わったが、差分はフッターの
 *              メニュー（Commerce / Scientists / Sales / Developer blog の追加）だけ。
 *              条項の本文（<main> の中）は 4回とも同じ
 *   appsflyer  08-25〜09-24 に3回変わったが、差分はヘッダーのメニューと顧客事例の並び
 *              （eBay → Soundcloud 等）だけ。<main> の中は3回とも同じ
 *   search_console 09-15 に変わったが、差分はヘッダーのメニューの並び順だけ
 *
 * **戻す側に倒してある設計でも、これは戻しすぎの誤りでは済まない。**毎週のように
 * 人の判定が消えると、読み直しが「メニューが動いた合図」になって読まれなくなる ——
 * 2026-09-24 にオーナーが32マスを付け直した翌週（09-28）に、うち8マス（anthropic・
 * appsflyer）が本文の変わらないまま戻る状態だった。
 *
 * だから台帳の行に `body_scope` を持たせ、**指紋を取る範囲を本文に絞る**:
 *
 *   "main"               … ページの <main> 要素（ちょうど1つのときだけ）の中の文字
 *   { "from", "to" }     … ページの文字のうち、from の最初の出現から、その後ろの to の
 *                          直前まで（<main> が無いページ用）
 *   なし                 … これまでどおりページ全体
 *
 * 記録した指紋がどの範囲のものかは `fingerprint_scope` に残す（なし＝ページ全体）。
 * **範囲を取れなかった回は、戻す側に倒す**（unknown にすると、作りが変わった日から
 * 嘘の ok が永久に残る）。ただしページ全体が前回と1文字も変わっていなければ戻さない
 * （範囲の設定を間違えただけで人の判定を消さない）。
 * 範囲を初めて付けた行は、**ページ全体の指紋が前回と同じときだけ**本文の指紋へ
 * 付け替える。違っていれば本文が変わったかは判らないので、戻す。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/corporate-obligations.json');

/** 見る観点。**台帳の clauses と同じ順**（片方だけ増えたら --check が落とす）。 */
export const CLAUSES = ['liability_cap', 'ip', 'personal_data', 'governing_law'];

/**
 * 本文らしさの下限。**これを下回ったら「取得できた」と扱わない。**
 * 数字そのものより「殻を通さない」ことが目的で、実測した規約本文はどれも数万字ある。
 */
export const MIN_TEXT_LENGTH = 2000;

/** 本文なら必ずどれか出てくる語。**殻（JSだけのページ）を弾く二の矢。** */
export const LEGAL_ANCHORS = [
  'terms', 'agreement', 'liability', 'privacy', 'governing', 'warrant',
  '利用規約', '責任', '準拠法', '個人情報',
];

/**
 * HTML から本文らしいテキストを取り出す。**純関数。**
 *
 * 完全なパースはしない（依存を増やさない）。**script / style を先に落とす**のは、
 * 中の JS が語を含んでいると「本文がある」と誤判定するため —— 殻を弾く仕掛けを
 * 自分で無効にしないこと。
 */
export function toText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// [2026-09-24] **toText は変えないこと。**範囲を初めて付ける回は「ページ全体の指紋が
// 前回と同じか」で付け替えを決める。toText の出力が1文字でも変わると、全社が
// 「ページが変わった」になって一斉に戻る。

/**
 * `<main>` 要素の中身。**ちょうど1つのときだけ**返す（0個・2個以上は null）。
 *
 * 数えるのは script / style / コメントを落としたあと —— JS の文字列に `<main` が
 * 入っているページで数え違えないため。入れ子や2個目を推測で選ばない
 * （**選び方を間違えた範囲の指紋は、安定して間違い続ける**）。
 */
export function mainElement(html) {
  if (typeof html !== 'string') return null;
  const clean = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const opens = clean.match(/<main\b/gi) || [];
  const closes = clean.match(/<\/main\s*>/gi) || [];
  if (opens.length !== 1 || closes.length !== 1) return null;
  const m = clean.match(/<main\b[^>]*>([\s\S]*)<\/main\s*>/i);
  return m ? m[1] : null;
}

/**
 * 指紋を取る範囲の名前。記録した指紋に `fingerprint_scope` として添える。
 *
 *   なし → 'page' / "main" → 'main' / { from, to } → 'anchors:<8桁>'
 *
 * 目印は名前に焼き込む（目印の文字の sha256 先頭8桁）。**目印を書き換えたら別の範囲**
 * なので、前の指紋と比べずに戻す側へ倒すため。読めない書き方は null。
 */
export function scopeKey(bodyScope) {
  if (bodyScope === undefined || bodyScope === null) return 'page';
  if (bodyScope === 'main') return 'main';
  if (bodyScope && typeof bodyScope === 'object' && !Array.isArray(bodyScope)
      && typeof bodyScope.from === 'string' && bodyScope.from.trim() !== ''
      && typeof bodyScope.to === 'string' && bodyScope.to.trim() !== '') {
    const h = crypto.createHash('sha256')
      .update(`${bodyScope.from}\u0000${bodyScope.to}`, 'utf8').digest('hex').slice(0, 8);
    return `anchors:${h}`;
  }
  return null;
}

/**
 * ページから、指紋を取る範囲の文字を切り出す。**純関数。**
 * 返すのは `{ body, key, why }`。body が null なら範囲が取れなかった（why に理由）。
 *
 * 目印は「from の最初の出現」から「その後ろの to の最初の出現」の直前まで。
 * to を from より前から探さない（ヘッダーに同じ語があるページで、本文が空になる）。
 */
export function extractBody({ html, text }, bodyScope) {
  const key = scopeKey(bodyScope);
  if (key === null) return { body: null, key, why: 'body_scope の書き方が読めない' };
  if (key === 'page') return { body: text, key, why: null };
  if (key === 'main') {
    const inner = mainElement(html);
    if (inner === null) return { body: null, key, why: '本文の枠（ちょうど1つの <main>）が見つからない' };
    return { body: toText(inner), key, why: null };
  }
  const i = text.indexOf(bodyScope.from);
  if (i < 0) return { body: null, key, why: `本文の始まりの目印が見つからない（${bodyScope.from}）` };
  const j = text.indexOf(bodyScope.to, i + bodyScope.from.length);
  if (j < 0) return { body: null, key, why: `本文の終わりの目印が見つからない（${bodyScope.to}）` };
  return { body: text.slice(i, j).trim(), key, why: null };
}

/**
 * 台帳の `body_scope` / `fingerprint_scope` の書き方の検査（ネットを見ない）。
 * **読めない設定は実行時に unknown になり、見張りが黙って外れる**ので、PR の時点で落とす。
 */
export function scopeProblems(vendors) {
  const problems = [];
  for (const v of vendors || []) {
    if ('body_scope' in v && scopeKey(v.body_scope) === null) {
      problems.push(`${v.id}: body_scope が読めない（"main" か { "from", "to" } の空でない文字列）`
        + ' — **読めない設定では指紋が取れず、見張りが黙って外れる**');
    }
    if ('fingerprint_scope' in v && !(v.fingerprint_scope === 'main'
        || /^anchors:[0-9a-f]{8}$/.test(String(v.fingerprint_scope)))) {
      problems.push(`${v.id}: fingerprint_scope が読めない（${JSON.stringify(v.fingerprint_scope)}）`
        + ' — ページ全体の指紋なら欄ごと無しにする');
    }
    if ('fingerprint_scope' in v && !v.fingerprint) {
      problems.push(`${v.id}: 指紋が無いのに fingerprint_scope がある`);
    }
  }
  return problems;
}

/**
 * 取れた本文が本物か。**「200が返った」を「読めた」と読み替えない。**
 * 返すのは真偽ではなく理由つきの判定（なぜ弾いたかが残らないと直せない）。
 */
export function looksLikeTerms(text) {
  if (!text || text.length < MIN_TEXT_LENGTH) {
    return { ok: false, why: `本文が短すぎる（${text ? text.length : 0} 字 < ${MIN_TEXT_LENGTH}）`
      + ' — **JSで描くページの殻を掴んだ可能性。**殻の指紋は安定するので、改定を永久に見逃す' };
  }
  const lower = text.toLowerCase();
  if (!LEGAL_ANCHORS.some((a) => lower.includes(a))) {
    return { ok: false, why: '規約らしい語が1つも無い — 別のページを掴んでいる' };
  }
  return { ok: true, why: null };
}

/** 本文の指紋。**先頭12文字**（台帳が読める長さで、衝突は実用上問題にならない）。 */
/**
 * 指紋の上限（`never_fingerprinted_budget`）を、**締める方向にだけ**動かす。
 *
 * **これが無いと膠着する。**上限は現状の2社ぶんで置いてあるが、指紋が付いた日に
 * 実数が減ると `check-corporate` の「枠が余っている」で落ちる ——
 * **落ちるのは、その指紋を運んでいる週次のPR自身。**マージされないので指紋は
 * 台帳に入らず、翌週また同じところで落ちる。`reset_grace_days` を入れた理由
 * （2026-08-29）とまったく同じ形で、**機械が仕事をした瞬間に機械の仕事が止まる。**
 *
 * だから**直した機械が、同じコミットで上限も下げる。**
 *
 * **上げるほうは機械にやらせない。**上げるのは「取れなくなったことを受け入れる」
 * 判断で、理由を `$never_fingerprinted_budget` に書く人の仕事。機械が上げられると
 * **壊れるたびに上限が追いかけて、ラチェットが効かなくなる。**
 * このリポジトリの非対称（自律実行は止める方向のみ）と同じ向きに倒してある。
 */
export function tightenFingerprintBudget(cr) {
  const before = cr.never_fingerprinted_budget;
  if (typeof before !== 'number') return { changed: false, before, after: before };
  const actual = (cr.vendors || []).filter((v) => !v.fingerprint).length;
  if (actual >= before) return { changed: false, before, after: before };
  cr.never_fingerprinted_budget = actual;
  return { changed: true, before, after: actual };
}

export function fingerprint(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

/**
 * 取得結果と台帳を突き合わせる。**取れなかったことを「変わっていない」と書かない。**
 *
 * 返す verdict:
 *   unknown    … 取得できなかった／殻だった。**台帳は触らない**
 *   unseen     … 初めて指紋を取った（レビュー状態は動かさない）
 *   unchanged  … 前回と同じ本文
 *   changed    … **本文が変わった。**reviewed な観点を unreviewed へ戻す
 *
 * [2026-09-24] 指紋は `recorded.body_scope` の範囲で取る（なし＝ページ全体・これまでどおり）。
 * 返す `scope` は、返した指紋がどの範囲のものか（`fingerprint_scope` に残す）。
 * `label` は戻したときの理由の見出し（`reset_reason` に使う）。
 */
export function reconcile({ text, html = null, fetchError, recorded }) {
  if (fetchError) return { verdict: 'unknown', fingerprint: recorded?.fingerprint ?? null, why: fetchError };
  const shape = looksLikeTerms(text);
  if (!shape.ok) return { verdict: 'unknown', fingerprint: recorded?.fingerprint ?? null, why: shape.why };

  const before = recorded?.fingerprint ?? null;
  const beforeScope = recorded?.fingerprint_scope ?? 'page';
  const pageFp = fingerprint(text);
  const { body, key, why: cutWhy } = extractBody({ html, text }, recorded?.body_scope);
  // 読めない設定は scopeProblems が PR の時点で落とす。ここへ来たら台帳を触らない
  // （設定の誤りで人の判定を消さない。見張りが外れていることは why で名指しする）
  if (key === null) {
    return { verdict: 'unknown', fingerprint: before, why: '**body_scope が読めない** — 台帳を直すまで、この社は見張れていない' };
  }

  const bodyShape = body === null ? null : looksLikeTerms(body);
  if (body === null || !bodyShape.ok) {
    const whyCut = body === null ? cutWhy : `切り出した範囲が本文らしくない（${bodyShape.why}）`;
    // **ページ全体が前回と1文字も変わっていなければ戻さない。**範囲の設定の誤りで
    // 人の判定を消さない（ページ全体の指紋を記録している行だけ、この比較ができる）
    if (before && beforeScope === 'page' && before === pageFp) {
      return { verdict: 'unchanged', fingerprint: pageFp, scope: 'page',
               why: `ページ全体は前回と同じ。**ただし ${whyCut}** — body_scope を見直すこと` };
    }
    // それ以外は戻す側に倒す。**unknown にすると、作りが変わった日から嘘の ok が残る。**
    // 記録するのはページ全体の指紋（次の回に範囲が取れたら、そこから付け替えられる）
    if (!before) return { verdict: 'unseen', fingerprint: pageFp, scope: 'page', why: `初めて指紋を取った（ページ全体。${whyCut}）` };
    return { verdict: 'changed', fingerprint: pageFp, scope: 'page', before, label: '本文の範囲が取れない',
             why: `**${whyCut}** — 作りか本文が変わった。読み直しと body_scope の見直しが要る` };
  }

  const fp = fingerprint(body);
  if (!before) return { verdict: 'unseen', fingerprint: fp, scope: key, why: '初めて指紋を取った' };
  if (beforeScope === key) {
    if (before === fp) return { verdict: 'unchanged', fingerprint: fp, scope: key, why: '前回と同じ本文' };
    return { verdict: 'changed', fingerprint: fp, scope: key, before,
             why: `**本文が変わった**（${before} → ${fp}）` };
  }
  // 範囲の付け替え。**前の指紋がページ全体のものなら、ページ全体で比べられる。**
  if (beforeScope === 'page') {
    if (before === pageFp) {
      return { verdict: 'unchanged', fingerprint: fp, scope: key,
               why: `指紋の範囲をページ全体から本文（${key}）へ移した — ページ全体は前回と同じ` };
    }
    return { verdict: 'changed', fingerprint: fp, scope: key, before, label: '範囲を移す回にページ全体が変わっていた',
             why: `**範囲を移す回に、ページ全体が前回と違った**（${before} → ${pageFp}）`
               + ' — 本文が変わったかは判らないので読み直しへ' };
  }
  // 前の指紋が別の範囲（目印を書き換えた等）のものなら、比べようがない
  return { verdict: 'changed', fingerprint: fp, scope: key, before, label: '指紋の範囲の設定が変わった',
           why: `**指紋の範囲の設定が変わった**（${beforeScope} → ${key}）— 前の指紋と比べられないので読み直しへ` };
}

/**
 * 改定を受けて1社の行を書き換える。**純関数。**
 *
 * - `changed` のときだけ、**reviewed だった観点を unreviewed へ戻す。**
 *   not_applicable は戻さない（「うちには関係ない」は本文が変わっても普通は変わらず、
 *   戻すと毎回の改定で全社が赤くなって読まれなくなる）
 * - `unknown` では**何も触らない**
 * - 指紋と取得日は unseen / unchanged / changed で更新する
 */
export function applyVerdict(row, r, today) {
  if (r.verdict === 'unknown') return { row, reset: [] };
  const next = { ...row, fingerprint: r.fingerprint, fetched_at: today };
  // [2026-09-24] 指紋がどの範囲のものか。ページ全体なら欄を置かない（これまでの行の形のまま）
  if (r.scope && r.scope !== 'page') next.fingerprint_scope = r.scope;
  else delete next.fingerprint_scope;
  const reset = [];
  if (r.verdict === 'changed') {
    for (const c of CLAUSES) {
      if (next[c] === 'ok' || next[c] === 'risk') { next[c] = 'unreviewed'; reset.push(c); }
    }
    if (reset.length) {
      next.reviewed_at = null;
      // [2026-08-28] **判定と一緒に「誰が読んだか」も落とす。**
      // reviewed_by / draft_note / risk_note は**前の本文に対する記録**なので、
      // 判定だけ戻して残すと「AIの下書きどまり」の表示や risk の理由だけが
      // 生き残り、**中身の無い印が付いたまま**になる。
      // reviewed_at を null にするのと同じ理由で、同じ場所で落とす。
      delete next.reviewed_by;
      delete next.draft_note;
      delete next.draft_clauses;
      delete next.risk_note;
      next.reset_reason = `${r.label ?? '本文が改定された'}（${r.before} → ${r.fingerprint}・${today}）`
        + ' — **前の判定は前の本文に対するもの。**読み直すまで unreviewed';
      // [2026-08-29] **戻した日と、戻した観点を残す。**
      // check-corporate が「改定で戻された直後」と「ずっと読んでいない」を
      // 区別するのに要る。**`fetched_at` では代用できない** ——
      // あちらは改定が無くても毎回の取得で今日になるので、
      // 戻されたマスが何日放置されているかを測れない。
      next.reset_at = today;
      next.reset_clauses = reset.slice();
    }
  }
  return { row: next, reset };
}

export function decodeTermsHtml(bytes, contentType = '') {
  // HTTP charset takes precedence over an HTML declaration. Do not fingerprint
  // replacement characters when a legacy Japanese page is decoded as UTF-8.
  const charset = /charset\s*=\s*["']?([^\s;"'>]+)/i;
  const headerEncoding = contentType.match(charset)?.[1];
  const prefix = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
  const metaEncoding = [...prefix.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => tag.match(charset)?.[1]).find(Boolean);
  return new TextDecoder(headerEncoding || metaEncoding || 'utf-8', { fatal: true }).decode(bytes);
}

export async function fetchTerms(url, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'simplememo-vendor-terms/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { text: null, html: null, fetchError: `HTTP ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    // [2026-09-24] html も返す（`body_scope: "main"` は <main> 要素を HTML から切り出す）
    const html = decodeTermsHtml(bytes, res.headers.get('content-type') || '');
    return { text: toText(html), html, fetchError: null };
  } catch (e) {
    return { text: null, html: null, fetchError: `取得に失敗: ${String(e).slice(0, 100)}` };
  }
}

export function readLedger() {
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

export function selftest() {
  const p = [];
  const eq = (got, want, msg) => { if (got !== want) p.push(`${msg}（got ${JSON.stringify(got)}）`); };

  // --- 本文の取り出し ---
  eq(toText('<p>hello <b>world</b></p>'), 'hello world', 'タグを落とせていない');
  // **script の中身を本文と数えない。**数えると殻を弾く仕掛けが自分で無効になる
  eq(toText('<script>var terms="liability agreement"</script><p>x</p>'), 'x',
     '**script の中身を本文に数えている**（殻を弾く判定が無意味になる）');
  eq(toText('<style>.a{}</style><p>y</p>'), 'y', 'style の中身を本文に数えている');
  eq(toText(null), '', 'null で落ちる');

  const japanese = Uint8Array.from([205, 248, 205, 209, 181, 172, 204, 243]);
  eq(decodeTermsHtml(japanese, 'text/html; charset=EUC-JP'), '利用規約', 'HTTPのEUC-JPを読めない');
  const legacyPage = Buffer.concat([Buffer.from('<meta http-equiv="content-type" content="text/html; charset=euc-jp"><p>'), japanese, Buffer.from('</p>')]);
  eq(toText(decodeTermsHtml(legacyPage)), '利用規約', 'HTMLの文字コード宣言を読めない');
  eq(decodeTermsHtml(new TextEncoder().encode('利用規約')), '利用規約', 'UTF-8の既存ページが壊れた');
  const headerWins = new TextEncoder().encode('<meta charset="euc-jp"><p>利用規約</p>');
  eq(toText(decodeTermsHtml(headerWins, 'text/html; charset=utf-8')), '利用規約', 'HTTP宣言が優先されない');
  for (const contentType of ['', 'text/html; charset=unknown-encoding']) {
    let rejected = false;
    try { decodeTermsHtml(japanese, contentType); } catch { rejected = true; }
    eq(rejected, true, '文字化け・未知の文字コードを指紋に通している');
  }

  // --- 殻を通さない ---
  const real = `terms of service ${'liability and governing law. '.repeat(200)}`;
  eq(looksLikeTerms(real).ok, true, '本物の本文を弾いている');
  eq(looksLikeTerms('<div id=app></div>').ok, false, '**殻を通している**');
  // **長さの下限そのものを守る。**上の殻は語が1つも無いので「語の判定」で弾けてしまい、
  // 下限を 0 にしても落ちなかった（実測）。**現実の殻は語を持つ** ——
  // JSで描く法務ページの HTML は <title>Terms of Service</title> を持つのが普通で、
  // そこだけ掴むと「安定した指紋」ができて改定を永久に見逃す。
  eq(looksLikeTerms('Terms of Service').ok, false,
     '**語はあるが短い殻を通している**（長さの下限が効いていない）');
  eq(looksLikeTerms('').ok, false, '空を通している');
  // 長いだけで規約でないものも弾く
  eq(looksLikeTerms('lorem ipsum '.repeat(500)).ok, false, '長いだけの別ページを通している');
  // 弾いたときは理由が残る（残らないと直せない）
  eq(typeof looksLikeTerms('x').why, 'string', '弾いた理由が残っていない');

  // --- 指紋 ---
  eq(fingerprint('abc'), fingerprint('abc'), '同じ本文で指紋が変わる');
  eq(fingerprint('abc') === fingerprint('abd'), false, '違う本文で指紋が同じ');
  eq(fingerprint('abc').length, 12, '指紋の長さが違う');

  // --- 突き合わせ ---
  const rec = { fingerprint: fingerprint(real) };
  eq(reconcile({ text: real, recorded: rec }).verdict, 'unchanged', '同じ本文を unchanged にしていない');
  eq(reconcile({ text: `${real} added`, recorded: rec }).verdict, 'changed', '**改定を検知していない**');
  eq(reconcile({ text: real, recorded: {} }).verdict, 'unseen', '初回を unseen にしていない');
  // **取れなかった回**
  const unk = reconcile({ fetchError: 'HTTP 503', recorded: rec });
  eq(unk.verdict, 'unknown', '取得失敗を unknown にしていない');
  eq(unk.fingerprint, rec.fingerprint, '**取得失敗で台帳の指紋を消している**');
  // **殻は unknown。**「変わっていない」ではない
  const shell = reconcile({ text: '<div id=app></div>', recorded: rec });
  eq(shell.verdict, 'unknown', '**殻を unchanged と読んでいる**（改定を永久に見逃す）');
  eq(shell.fingerprint, rec.fingerprint, '殻で台帳の指紋を上書きしている');

  // --- 改定を受けた書き換え ---
  const row = { id: 'x', liability_cap: 'ok', ip: 'risk', personal_data: 'unreviewed',
                governing_law: 'not_applicable', reviewed_at: '2026-08-01', fingerprint: 'aaa',
                reviewed_by: 'ai_draft', draft_note: '前の本文を読んだ記録', risk_note: '前の本文への理由',
                draft_clauses: ['ip'] };
  const changed = applyVerdict(row, { verdict: 'changed', fingerprint: 'bbb', before: 'aaa' }, '2026-08-26');
  eq(changed.row.liability_cap, 'unreviewed', '**改定後も ok のまま**（前の本文への判定が残る）');
  eq(changed.row.ip, 'unreviewed', '改定後も risk のまま');
  // [2026-08-28] **誰が読んだかも、前の本文に対する記録。**判定だけ戻して残すと
  // 「AIの下書きどまり」の表示や risk の理由だけが生き残り、中身の無い印が付いたままになる。
  eq(changed.row.reviewed_by, undefined, '**改定後も reviewed_by が残っている**（中身の無い印が付いたままになる）');
  eq(changed.row.draft_note, undefined, '改定後も draft_note が残っている');
  eq(changed.row.draft_clauses, undefined, '改定後も draft_clauses が残っている');
  eq(changed.row.risk_note, undefined, '改定後も risk_note が残っている');
  // **not_applicable は戻さない。**戻すと毎回の改定で全社が赤くなり、読まれなくなる
  eq(changed.row.governing_law, 'not_applicable', 'not_applicable まで戻している');
  eq(changed.row.reviewed_at, null, '読み直し前なのに reviewed_at が残っている');
  eq(changed.reset.length, 2, '戻した観点の数が違う');
  eq(changed.row.fingerprint, 'bbb', '指紋を更新していない');
  eq(typeof changed.row.reset_reason, 'string', '戻した理由が残っていない');
  // [2026-08-29] **戻した日と観点。**check-corporate の猶予がこれを読む。
  eq(changed.row.reset_at, '2026-08-26', '**戻した日が残っていない**（何日放置されたかを測れない）');
  eq(JSON.stringify(changed.row.reset_clauses), JSON.stringify(changed.reset),
     '戻した観点の一覧が残っていない');

  // 変わっていなければ判定に触らない
  const same = applyVerdict(row, { verdict: 'unchanged', fingerprint: 'aaa' }, '2026-08-26');
  eq(same.row.liability_cap, 'ok', '変わっていないのに判定を戻している');
  eq(same.row.fetched_at, '2026-08-26', '取得日を更新していない');

  // **取れなかった回は行ごと触らない**
  const untouched = applyVerdict(row, { verdict: 'unknown', fingerprint: 'aaa' }, '2026-08-26');
  eq(untouched.row.fetched_at, undefined, '**取得できていないのに取得日を書いている**');
  eq(untouched.row.liability_cap, 'ok', '取得できていないのに判定を触っている');

  // 初回は判定を動かさない（見ていないものを見たことにしない）
  const first = applyVerdict({ ...row, fingerprint: null }, { verdict: 'unseen', fingerprint: 'ccc' }, '2026-08-26');
  eq(first.row.liability_cap, 'ok', '初回取得で判定を戻している');
  eq(first.row.fingerprint, 'ccc', '初回の指紋を残していない');

  // --- 上限は締める方向にだけ ---
  const cr2 = (budget, fps) => ({ never_fingerprinted_budget: budget,
    vendors: fps.map((f, i) => ({ id: `v${i}`, source: 'x', fingerprint: f })) });

  const down = cr2(2, ['aaa', 'bbb', null]);
  eq(tightenFingerprintBudget(down).after, 1, '実数まで下げていない');
  eq(down.never_fingerprinted_budget, 1, '台帳側を書き換えていない');

  // **ここが本体。**上げられると、壊れるたびに上限が追いかけてラチェットが死ぬ
  const up = cr2(0, [null, null, 'ccc']);
  eq(tightenFingerprintBudget(up).changed, false, '**機械が上限を上げた**');
  eq(up.never_fingerprinted_budget, 0, '**機械が上限を上げた**（台帳が緩んだ）');

  const level = cr2(1, ['aaa', null]);
  eq(tightenFingerprintBudget(level).changed, false, '同数なのに動かしている');

  // 数でないときに 0 を書き込まない（**上限の不在を「上限0」に化けさせない**）
  const broken = { never_fingerprinted_budget: null, vendors: [] };
  eq(tightenFingerprintBudget(broken).changed, false, '数でない上限を触っている');
  eq(broken.never_fingerprinted_budget, null, '**数でない上限に値を書き込んだ**');

  // 全社に指紋が付いた日は 0 まで落ちる（膠着の出口）
  const done = cr2(2, ['aaa', 'bbb']);
  eq(tightenFingerprintBudget(done).after, 0, '全社そろっても 0 まで落ちない');

  // --- [2026-09-24] 指紋は本文だけに取る ---
  // 検体: 本文は <main> の中、メニューは外。**メニューだけが動いた2枚**と、本文が動いた1枚
  const legal = `Terms of Service Effective June 1, 2026 ${'The liability of each party is limited. '.repeat(80)}`;
  const pageOf = (menu, body) => `<html><header><nav>${menu}</nav></header>`
    + `<script>var x="<main>"</script><main><h1>${body}</h1></main><footer>${menu} Privacy</footer></html>`;
  const menuA = 'Products Claude Research News Careers '.repeat(60);
  const menuB = 'Products Claude Commerce Research News Scientists Careers '.repeat(60);
  const v1 = pageOf(menuA, legal);
  const v2 = pageOf(menuB, legal);
  const v3 = pageOf(menuA, `${legal} A new clause about liability.`);
  const t = (html) => ({ html, text: toText(html) });

  // <main> は script の中の文字を数えない。ちょうど1つのときだけ
  eq(toText(mainElement(v1)), toText(`<h1>${legal}</h1>`), '**<main> の中身を取り出せていない**（script の中の <main> を数えた）');
  eq(mainElement('<main>a</main><main>b</main>'), null, '**<main> が2つあるのに片方を選んでいる**（選び方を推測している）');
  eq(mainElement('<div>x</div>'), null, '<main> が無いのに何かを返している');
  eq(mainElement(null), null, 'null で落ちる');

  // 範囲の名前
  eq(scopeKey(undefined), 'page', '設定なしがページ全体になっていない');
  eq(scopeKey('main'), 'main', '"main" を読めない');
  const anchors = { from: 'Terms of Service Effective', to: 'Privacy' };
  eq(/^anchors:[0-9a-f]{8}$/.test(scopeKey(anchors)), true, '目印の範囲名が読めない形');
  eq(scopeKey(anchors) === scopeKey({ from: 'Terms of Service Effective', to: 'Careers' }), false,
     '**目印を書き換えても同じ範囲名になる**（前の指紋と比べてしまう）');
  for (const bad of ['body', { from: 'x' }, { from: '', to: 'y' }, ['main'], 1]) {
    eq(scopeKey(bad), null, `読めない設定を読めたことにしている（${JSON.stringify(bad)}）`);
  }

  // 目印: to は from の後ろから探す
  const anchored = extractBody(t(v1), anchors);
  // 切り出せなかったとき（null）に次の2行が空振りで通らないよう、型を先に固定する
  eq(typeof anchored.body, 'string', '**目印で切り出せていない**');
  eq(String(anchored.body).startsWith('Terms of Service Effective'), true, '目印の始まりから切り出せていない');
  eq(String(anchored.body).includes('Privacy'), false, '終わりの目印を範囲に含めている');
  eq(extractBody(t(v1), { from: 'Not on the page', to: 'Privacy' }).body, null, '始まりの目印が無いのに切り出している');
  eq(extractBody(t(v1), { from: 'Terms of Service Effective', to: 'Not on the page' }).body, null, '終わりの目印が無いのに切り出している');
  eq(extractBody(t(`<p>Privacy ${legal}</p>`), anchors).body, null,
     '**終わりの目印を始まりより前から探している**（ヘッダーに同じ語があると本文が空になる）');

  // **本体。**メニューだけが動いても unchanged、本文が動いたら changed
  const mainRow = { id: 'x', body_scope: 'main', fingerprint_scope: 'main', liability_cap: 'ok' };
  const firstMain = reconcile({ ...t(v1), recorded: { ...mainRow, fingerprint: null } });
  eq(firstMain.verdict, 'unseen', '範囲つきの初回が unseen でない');
  eq(firstMain.scope, 'main', '範囲つきの初回に範囲名が付いていない');
  const rowMain = { ...mainRow, fingerprint: firstMain.fingerprint };
  eq(reconcile({ ...t(v2), recorded: rowMain }).verdict, 'unchanged',
     '**メニューが動いただけで本文が変わったことにしている**（毎週人の判定が消える）');
  eq(reconcile({ ...t(v3), recorded: rowMain }).verdict, 'changed', '**本文の改定を見逃している**');
  // 同じ検体で、範囲なし（これまでの動き）はメニューの変化で動く —— 上の unchanged が
  // 範囲のおかげで通っていることの確認（検体がたまたま同じ指紋になっていないこと）
  const pageRow = { id: 'x', fingerprint: fingerprint(toText(v1)), liability_cap: 'ok' };
  eq(reconcile({ ...t(v2), recorded: pageRow }).verdict, 'changed', '検体のメニューの変化がページ全体の指紋に出ていない（検体が壊れている）');

  // **範囲が取れない回は戻す。**unknown にすると、作りが変わった日から嘘の ok が残る
  const noMain = `<html><nav>${menuA}</nav><div>${legal}</div></html>`;
  const lost = reconcile({ ...t(noMain), recorded: rowMain });
  eq(lost.verdict, 'changed', '**<main> が消えたのに戻していない**（作りが変わった日から嘘の ok が残る）');
  eq(lost.scope, 'page', '範囲が取れない回にページ全体の指紋を記録していない');
  eq(typeof lost.label, 'string', '範囲が取れない回の理由の見出しが無い');
  // 本文らしくない範囲（殻）も同じ
  const shellMain = `<html><nav>${menuA} Terms Privacy</nav><main><div id=app></div></main><footer>${legal}</footer></html>`;
  eq(reconcile({ ...t(shellMain), recorded: rowMain }).verdict, 'changed', '**<main> が殻なのに unchanged / unknown にしている**');
  // **殻の指紋は安定する。**殻のまま記録された行が、翌週も殻なら unchanged を返し続ける形を作らない
  eq(reconcile({ ...t(shellMain), recorded: { ...rowMain, fingerprint: fingerprint(toText(mainElement(shellMain))) } }).verdict, 'changed',
     '**殻の <main> の指紋を「前回と同じ本文」と読んでいる**（改定を永久に見逃す）');
  eq(reconcile({ ...t(shellMain), recorded: { ...mainRow, fingerprint: null } }).scope, 'page',
     '**殻の <main> の指紋を本文の指紋として記録している**');
  // ただし、ページ全体が前回と1文字も変わっていなければ戻さない（設定の誤りで判定を消さない）
  const misconfigured = { id: 'x', body_scope: { from: 'typo', to: 'Privacy' }, fingerprint: fingerprint(toText(v1)), liability_cap: 'ok' };
  eq(reconcile({ ...t(v1), recorded: misconfigured }).verdict, 'unchanged',
     '**ページが1文字も変わっていないのに、目印の打ち間違いで判定を消している**');

  // 付け替え: 前の指紋がページ全体のもの
  const migrating = { id: 'x', body_scope: 'main', fingerprint: fingerprint(toText(v1)), liability_cap: 'ok' };
  const moved = reconcile({ ...t(v1), recorded: migrating });
  eq(moved.verdict, 'unchanged', '**ページが同じなのに、範囲を移す回に戻している**');
  eq(moved.fingerprint, firstMain.fingerprint, '付け替え後の指紋が本文の指紋でない');
  eq(moved.scope, 'main', '付け替え後の範囲名が無い');
  eq(reconcile({ ...t(v2), recorded: migrating }).verdict, 'changed',
     '**範囲を移す回にページが変わっていたのに戻していない**（本文が変わったかは判らない）');
  // 前の指紋が別の範囲（目印を書き換えた）なら比べようがない。**指紋が同じ値でも比べない** ——
  // 検体の指紋をわざと今の範囲の値にしておく（違う値だと、比べても changed になって素通りする）
  const reanchored = { id: 'x', body_scope: anchors, fingerprint: fingerprint(anchored.body),
                       fingerprint_scope: 'anchors:00000000', liability_cap: 'ok' };
  eq(reconcile({ ...t(v1), recorded: reanchored }).verdict, 'changed',
     '**範囲の設定が変わったのに、前の指紋と比べている**');
  // 読めない設定は触らない（scopeProblems が PR で落とす）
  eq(reconcile({ ...t(v1), recorded: { ...rowMain, body_scope: 'body' } }).verdict, 'unknown', '読めない設定で判定を動かしている');
  // 範囲なしの行は、これまでとまったく同じ動き（toText を変えると全社が一斉に戻る）
  eq(reconcile({ ...t(v1), recorded: pageRow }).verdict, 'unchanged', '**範囲なしの行の動きが変わった**');
  eq(reconcile({ text: toText(v1), recorded: pageRow }).verdict, 'unchanged', 'html を渡さない呼び出しで範囲なしの行が動かない');

  // 書き戻し: 範囲名を残す／ページ全体なら欄を置かない
  eq(applyVerdict(rowMain, moved, '2026-09-24').row.fingerprint_scope, 'main', '**指紋の範囲を台帳に残していない**');
  eq('fingerprint_scope' in applyVerdict(rowMain, lost, '2026-09-24').row, false,
     'ページ全体の指紋に範囲名を残している（次の回に付け替えられない）');
  const lostRow = applyVerdict(rowMain, lost, '2026-09-24').row;
  eq(lostRow.liability_cap, 'unreviewed', '範囲が取れない回に判定を戻していない');
  eq(String(lostRow.reset_reason ?? '').startsWith(String(lost.label)), true, '戻した理由の見出しが「本文が改定された」のまま');

  // 台帳の設定の検査
  eq(scopeProblems([{ id: 'a', body_scope: 'main', fingerprint: 'x', fingerprint_scope: 'main' }]).length, 0, '正しい設定を落としている');
  eq(scopeProblems([{ id: 'a', body_scope: 'body' }]).length, 1, '**読めない body_scope を通している**（見張りが黙って外れる）');
  eq(scopeProblems([{ id: 'a', fingerprint: 'x', fingerprint_scope: 'page' }]).length, 1, 'ページ全体の範囲名を欄で書いた行を通している');
  eq(scopeProblems([{ id: 'a', fingerprint_scope: 'main' }]).length, 1, '指紋が無いのに範囲名がある行を通している');

  return p;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest')) {
    const problems = selftest();
    // [2026-09-24] 台帳の範囲の設定もここで見る（CI で走るのはこのモードだけ）。
    // **読めない設定は実行時に unknown になり、見張りが黙って外れる**ので PR の時点で落とす
    problems.push(...scopeProblems(readLedger().contract_review?.vendors).map((x) => `台帳: ${x}`));
    if (problems.length) {
      console.error('自己検査で問題:');
      for (const x of problems) console.error(`  - ${x}`);
      process.exit(1);
    }
    console.log('vendor-terms: 自己検査に問題なし。');
    process.exit(0);
  }

  const doc = readLedger();
  const cr = doc.contract_review;
  if (!cr || !Array.isArray(cr.vendors)) {
    console.error('data/corporate-obligations.json に contract_review.vendors が無い');
    process.exit(1);
  }
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const problems = selftest();
  problems.push(...scopeProblems(cr.vendors).map((x) => `台帳: ${x}`));
  // **台帳の観点とこの script の観点がずれていないか。**片方だけ増えると素通りする
  const declared = cr.clauses ?? [];
  if (declared.join(',') !== CLAUSES.join(',')) {
    problems.push(`台帳の clauses [${declared}] と vendor-terms の CLAUSES [${CLAUSES}] が違う`
      + ' — **片方だけ増やすと、増えたほうが検査されないまま通る**');
  }

  console.log(`規約本文の指紋（${today} JST）\n`);
  const counts = { unknown: 0, unseen: 0, unchanged: 0, changed: 0 };
  const resets = [];
  // **`unknown` は2つの状態を同じ値にしている。**分けて名前で出す ——
  // 「指紋は在るが今日は取れなかった」は見張りが立っている（今日更新できなかっただけ）。
  // 「指紋が一度も無い」は**見張りが一度も立っていない**ので、本文が改定されても
  // reviewed が戻らない。**恒久的な穴なのに、同じ行に混ざって数だけ増える。**
  // 数え直しではなく表示の分割なので counts は触らない（--check の判定は台帳側が持つ）。
  const unwatched = [];

  for (const [i, row] of cr.vendors.entries()) {
    if (!row.source) { console.log(`  ${row.id.padEnd(14)} source が無い — 飛ばす`); continue; }
    const { text, html, fetchError } = argv.includes('--offline')
      ? { text: null, html: null, fetchError: '--offline' }
      : await fetchTerms(row.source);
    const r = reconcile({ text, html, fetchError, recorded: row });
    counts[r.verdict] += 1;
    const { row: next, reset } = applyVerdict(row, r, today);
    cr.vendors[i] = next;
    if (reset.length) resets.push({ id: row.id, reset });
    const never = r.verdict === 'unknown' && r.fingerprint === null;
    if (never) unwatched.push({ id: row.id, why: r.why ?? '' });
    const mark = never ? ' ← **指紋がまだ一度も無い**' : '';
    console.log(`  ${row.id.padEnd(14)} ${r.verdict.padEnd(10)} ${r.why ?? ''}${mark}`);
  }

  console.log(`\n  取得できず ${counts.unknown} / 初回 ${counts.unseen}`
    + ` / 変化なし ${counts.unchanged} / **改定 ${counts.changed}**`);
  if (resets.length) {
    console.log('\n  **改定を受けて読み直しへ戻した:**');
    for (const x of resets) console.log(`    ${x.id}: ${x.reset.join(', ')}`);
    console.log('  前の判定は前の本文に対するもの。**読んだ記録が嘘を守る形にしない。**');
  }
  if (counts.unknown) {
    console.log('\n  **取得できなかったことを「変わっていない」と読まないこと。**');
    console.log('  エージェント環境はプロキシが各社の規約ページへの CONNECT を拒否する。CIでは届く。');
  }
  if (unwatched.length) {
    console.log(`\n  **指紋が一度も付いていない ${unwatched.length} 社:**`);
    for (const x of unwatched) console.log(`    ${x.id.padEnd(14)} ${x.why}`);
    console.log('  **今日取れなかったのとは別の話。**この社は本文が改定されても'
      + ' reviewed が戻らない —— 人が付けた ok / risk を守っているのは指紋のほうで、');
    console.log('  **見張りが一度も立っていない。**上限は台帳の'
      + ' `contract_review.never_fingerprinted_budget`（check-corporate が数える）。');
  }

  if (argv.includes('--write')) {
    const t = tightenFingerprintBudget(cr);
    if (t.changed) {
      console.log(`\n  **指紋の上限を ${t.before} → ${t.after} へ下げた。**`
        + '見張りが立った社のぶんは同じコミットで締める'
        + '（下げないと、この指紋を運ぶPR自身が「枠が余っている」で落ちて膠着する）。');
    }
    fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(doc, null, 2)}\n`);
    console.log('\n  → 台帳を更新した。');
  }

  if (argv.includes('--check')) {
    if (problems.length) {
      console.error('\n規約本文: 不整合');
      for (const x of problems) console.error(`  - ${x}`);
      process.exit(1);
    }
    console.log('\n問題なし。');
  }
}
