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
 */
export function reconcile({ text, fetchError, recorded }) {
  if (fetchError) return { verdict: 'unknown', fingerprint: recorded?.fingerprint ?? null, why: fetchError };
  const shape = looksLikeTerms(text);
  if (!shape.ok) return { verdict: 'unknown', fingerprint: recorded?.fingerprint ?? null, why: shape.why };

  const fp = fingerprint(text);
  const before = recorded?.fingerprint ?? null;
  if (!before) return { verdict: 'unseen', fingerprint: fp, why: '初めて指紋を取った' };
  if (before === fp) return { verdict: 'unchanged', fingerprint: fp, why: '前回と同じ本文' };
  return { verdict: 'changed', fingerprint: fp, before,
           why: `**本文が変わった**（${before} → ${fp}）` };
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
      next.reset_reason = `本文が改定された（${r.before} → ${r.fingerprint}・${today}）`
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

async function fetchTerms(url, { fetchImpl = fetch } = {}) {
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'simplememo-vendor-terms/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { text: null, fetchError: `HTTP ${res.status}` };
    return { text: toText(await res.text()), fetchError: null };
  } catch (e) {
    return { text: null, fetchError: `取得に失敗: ${String(e).slice(0, 100)}` };
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

  return p;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest')) {
    const problems = selftest();
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
  // **台帳の観点とこの script の観点がずれていないか。**片方だけ増えると素通りする
  const declared = cr.clauses ?? [];
  if (declared.join(',') !== CLAUSES.join(',')) {
    problems.push(`台帳の clauses [${declared}] と vendor-terms の CLAUSES [${CLAUSES}] が違う`
      + ' — **片方だけ増やすと、増えたほうが検査されないまま通る**');
  }

  console.log(`規約本文の指紋（${today} JST）\n`);
  const counts = { unknown: 0, unseen: 0, unchanged: 0, changed: 0 };
  const resets = [];

  for (const [i, row] of cr.vendors.entries()) {
    if (!row.source) { console.log(`  ${row.id.padEnd(14)} source が無い — 飛ばす`); continue; }
    const { text, fetchError } = argv.includes('--offline')
      ? { text: null, fetchError: '--offline' }
      : await fetchTerms(row.source);
    const r = reconcile({ text, fetchError, recorded: row });
    counts[r.verdict] += 1;
    const { row: next, reset } = applyVerdict(row, r, today);
    cr.vendors[i] = next;
    if (reset.length) resets.push({ id: row.id, reset });
    console.log(`  ${row.id.padEnd(14)} ${r.verdict.padEnd(10)} ${r.why ?? ''}`);
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

  if (argv.includes('--write')) {
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
