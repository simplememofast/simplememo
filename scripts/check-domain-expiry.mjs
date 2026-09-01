#!/usr/bin/env node
/**
 * ドメインの有効期限を RDAP から読む。**「管理画面にしか無い」は事実ではなかった。**
 *
 *   node scripts/check-domain-expiry.mjs            # 取得して期限を出す（CIで走る）
 *   node scripts/check-domain-expiry.mjs --check    # CI: 台帳との食い違いで exit 1
 *   node scripts/check-domain-expiry.mjs --selftest # 解析の自己検査（ネットを見ない）
 *   node scripts/check-domain-expiry.mjs --write    # 台帳の next_due を更新する
 *
 * 【なぜ要るか】
 * `data/corporate-obligations.json` の `domain-renewal` は long らく
 * **未把握**で、理由に「レジストラの管理画面にしか無い」と書いてあった。
 * **それは違う。**gTLD の有効期限は RDAP で誰でも引ける公開情報で、
 * ICANN が全レジストラに提供を義務づけている。
 *
 * 期限が切れると**サイト・メールのFromドメイン・Universal Link が全部止まる**
 * （台帳の what_breaks より）。代替が無い critical なのに、
 * **誰も見ていない状態が「見られない」という誤った理由で続いていた。**
 *
 * 【取得はCI、解析はここ】
 * このリポジトリのエージェント環境はプロキシが RDAP への CONNECT を 403 で
 * 拒否する（`rdap.org` も `rdap.verisign.com` も届かない）。**GitHub の
 * ランナーからは届く** —— seo-daily.yml が iTunes Lookup で同じ形を使っている。
 * したがって解析は純関数にして手元で自己検査し、取得はCIに任せる。
 *
 * 【取れなかったことを「大丈夫」と書かない】
 * 取得に失敗した回は `unknown` を返し、**台帳の値を消さない**。
 * ネットワークが塞がれている環境で走らせても「期限なし」にはならない。
 * このリポジトリが繰り返し踏んでいる誤り（読めなかった＝異常なし）を持ち込まない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/corporate-obligations.json');
export const DEADLINE_ID = 'domain-renewal';

/** 引く先。**1つ目が落ちたら2つ目**（rdap.org はブートストラップの転送）。 */
export const RDAP_ENDPOINTS = [
  'https://rdap.verisign.com/com/v1/domain/',
  'https://rdap.org/domain/',
];

/** 期限が近いと言い始める日数。**切れてから気づく種類のものなので長め。** */
export const WARN_DAYS = 60;

/**
 * 自動更新の決済が試行される日（期限の何日前か）。
 *
 * 【2026-09-01 追加】**この日付が要るのは、失敗が機械から見えないから。**
 * ムームードメインは期限の30日前に**1回だけ**課金し、**再試行しない。**
 * 落ちると**自動更新設定がOFFになる**。カードを直しても再決済されない
 * （data/corporate-obligations.json の deadlines[domain-renewal].payment_attempt）。
 *
 * **RDAP は成功しても失敗しても同じ日付を返す。**つまり下の WARN_DAYS は
 * **どちらの場合も等しく鳴る** —— **鳴っていることは決済が通ったことを意味しない。**
 * 唯一の観測点は管理画面の「状態」欄で、ログインが要るのでここからは見えない。
 *
 * **だから機械にできるのは日付を出すところまで。**「いつ人が見に行けばよいか」を
 * 出しておかないと、60日警告を見た人が**何を確かめるべきか分からないまま消す。**
 */
export const PAYMENT_ATTEMPT_DAYS_BEFORE = 30;

/** 決済が試行される日。期限が取れていなければ null（推定しない）。 */
export function paymentAttemptDate(due, daysBefore = PAYMENT_ATTEMPT_DAYS_BEFORE) {
  if (!due) return null;
  const t = Date.parse(`${due}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t - daysBefore * 86400000).toISOString().slice(0, 10);
}

/**
 * RDAP の応答から有効期限を取り出す。**純関数。**
 *
 * RDAP は `events[].eventAction === 'expiration'` に期限を置く。
 * 大文字小文字と表記ゆれ（`expiration` / `Expiration`）があるので緩く当てるが、
 * **`registration` や `last changed` を期限と取り違えない**ように
 * 前方一致ではなく語で当てる。
 */
export function parseExpiry(doc) {
  if (!doc || !Array.isArray(doc.events)) return null;
  for (const e of doc.events) {
    const action = String(e?.eventAction ?? '').trim().toLowerCase();
    if (action !== 'expiration') continue;
    const iso = String(e?.eventDate ?? '');
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/**
 * RDAP の応答から**上位レジストラ名**を取り出す。**純関数。**
 *
 * [2026-08-28] **これは規約からは分からなかった問い。**
 * ムームードメイン利用規約 §2 は上位レジストラの規約を丸ごと取り込む構造で、
 * 本文は候補としてお名前.com と eNom を掲げるが、
 * **どれが simplememofast.com に乗っているかは書いていない。**
 * どちらかで景色が変わる —— お名前.com なら §32 が事業者登録者について
 * 「一切の責任を負わない」、eNom なら §18 が Washington 州法・JAMS 仲裁で、
 * 責任上限は $400 以下。**規約を読んでも閉じない不明が、RDAP には出ている。**
 *
 * RDAP は `entities[].roles` に `registrar` を持つ要素を置き、
 * 名前は jCard（`vcardArray`）の `fn` に入る。IANA ID は
 * `publicIds[].type === 'IANA Registrar ID'`。
 * **どちらも無いことがある**ので、取れなかったら null を返す ——
 * **取れなかったことを「上位レジストラが無い」と混ぜない。**
 */
export function parseRegistrar(doc) {
  if (!doc || !Array.isArray(doc.entities)) return null;
  for (const ent of doc.entities) {
    const roles = Array.isArray(ent?.roles) ? ent.roles : [];
    if (!roles.some((r) => String(r).trim().toLowerCase() === 'registrar')) continue;
    let name = null;
    const card = ent?.vcardArray;
    // jCard は ['vcard', [ ['fn', {}, 'text', '名前'], ... ]] という形。
    if (Array.isArray(card) && Array.isArray(card[1])) {
      for (const f of card[1]) {
        if (Array.isArray(f) && String(f[0]).toLowerCase() === 'fn' && typeof f[3] === 'string') {
          name = f[3];
          break;
        }
      }
    }
    let ianaId = null;
    for (const pid of (Array.isArray(ent?.publicIds) ? ent.publicIds : [])) {
      if (String(pid?.type ?? '').toLowerCase().includes('iana')) {
        ianaId = String(pid.identifier ?? '') || null;
        break;
      }
    }
    if (!name && !ianaId) return null;
    return { name, ianaId };
  }
  return null;
}

/** 残り日数。**同日は 0**（「切れていない」と「今日切れる」を混ぜない）。 */
export function daysUntil(dueYmd, todayYmd) {
  const due = Date.parse(`${dueYmd}T00:00:00Z`);
  const today = Date.parse(`${todayYmd}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(today)) return null;
  return Math.round((due - today) / 86400000);
}

/**
 * 取得結果と台帳を突き合わせる。**取れなかったことを一致と書かない。**
 *
 * 返す verdict:
 *   unknown   … 取得できなかった。**台帳は触らない**
 *   fresh     … 取得できて、台帳と一致
 *   stale     … 取得できて、台帳と違う（--write で直す）
 *   expiring  … 取得できて、残りが WARN_DAYS 未満
 *   expired   … 取得できて、すでに過ぎている
 */
export function reconcile({ fetched, ledgerDue, today, warnDays = WARN_DAYS }) {
  if (!fetched) {
    return { verdict: 'unknown', due: ledgerDue ?? null, days: null,
             why: 'RDAP から取得できなかった。**台帳の値は据え置く**（取れないことは期限が無いことではない）' };
  }
  const days = daysUntil(fetched, today);
  if (days !== null && days < 0) {
    return { verdict: 'expired', due: fetched, days, why: '**すでに期限を過ぎている**' };
  }
  if (days !== null && days < warnDays) {
    return { verdict: 'expiring', due: fetched, days, why: `残り ${days} 日` };
  }
  if (ledgerDue !== fetched) {
    return { verdict: 'stale', due: fetched, days,
             why: `台帳は ${ledgerDue ?? '未把握'} だが RDAP は ${fetched}` };
  }
  return { verdict: 'fresh', due: fetched, days, why: '台帳と一致' };
}

async function fetchExpiry(domain, { fetchImpl = fetch } = {}) {
  for (const base of RDAP_ENDPOINTS) {
    try {
      const res = await fetchImpl(`${base}${encodeURIComponent(domain)}`, {
        headers: { Accept: 'application/rdap+json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const doc = await res.json();
      const parsed = parseExpiry(doc);
      // [2026-08-28] **同じ応答から上位レジストラも拾う。**
      // 期限が取れた endpoint の応答だけを使う（別の endpoint の名前を混ぜない）。
      // registrar が取れなくても期限は返す —— **片方が欠けても、取れたほうは捨てない。**
      if (parsed) return { expiry: parsed, source: base, registrar: parseRegistrar(doc) };
    } catch {
      // 次の endpoint へ。**最後まで落ちたら unknown**（例外で止めない）
    }
  }
  return { expiry: null, source: null, registrar: null };
}

export function readLedger() {
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

export function findDeadline(doc) {
  return (doc.deadlines ?? []).find((d) => d.id === DEADLINE_ID) ?? null;
}

export function selftest() {
  const p = [];
  const eq = (got, want, msg) => { if (got !== want) p.push(`${msg}（got ${JSON.stringify(got)}）`); };

  // 解析
  eq(parseExpiry({ events: [{ eventAction: 'expiration', eventDate: '2027-03-14T04:00:00Z' }] }),
     '2027-03-14', '期限を取れない');
  eq(parseExpiry({ events: [{ eventAction: 'Expiration', eventDate: '2027-03-14T04:00:00Z' }] }),
     '2027-03-14', '大文字の eventAction を取れない');
  // **登録日を期限と取り違えない。**ここが一番high-costな読み違え。
  eq(parseExpiry({ events: [
       { eventAction: 'registration', eventDate: '2025-03-14T04:00:00Z' },
       { eventAction: 'last changed', eventDate: '2026-01-01T04:00:00Z' },
     ] }), null, '登録日や更新日を期限として拾っている');
  eq(parseExpiry({ events: [{ eventAction: 'expiration', eventDate: 'not-a-date' }] }), null,
     '壊れた日付を通している');
  eq(parseExpiry(null), null, 'null で落ちる');
  eq(parseExpiry({}), null, 'events が無いときに落ちる');

  // 上位レジストラ — **規約からは閉じなかった不明を、ここで閉じる**
  const REG = { entities: [
    { roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', '別の名前']]] },
    { roles: ['registrar'],
      vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', 'GMO Internet, Inc.']]],
      publicIds: [{ type: 'IANA Registrar ID', identifier: '49' }] },
  ] };
  eq(JSON.stringify(parseRegistrar(REG)), JSON.stringify({ name: 'GMO Internet, Inc.', ianaId: '49' }),
     'レジストラを取れない');
  // **registrant を registrar と取り違えない。**期限側で登録日を取り違える誤りと同じ形。
  eq(parseRegistrar({ entities: [{ roles: ['registrant'],
       vcardArray: ['vcard', [['fn', {}, 'text', '登録者']]] }] }), null,
     '**registrant をレジストラとして拾っている**');
  eq(parseRegistrar({ entities: [{ roles: ['Registrar'],
       vcardArray: ['vcard', [['fn', {}, 'text', 'eNom, LLC']]] }] })?.name, 'eNom, LLC',
     '大文字の roles を取れない');
  eq(parseRegistrar({ entities: [{ roles: ['registrar'] }] }), null,
     '名前もIDも無いのに何かを返している');
  eq(parseRegistrar({}), null, 'entities が無いときに落ちる');
  eq(parseRegistrar(null), null, 'null で落ちる');

  // 残り日数
  eq(daysUntil('2026-09-01', '2026-08-26'), 6, '残り日数が違う');
  eq(daysUntil('2026-08-26', '2026-08-26'), 0, '**同日は 0**（切れていないと今日切れるを混ぜない）');
  eq(daysUntil('2026-08-20', '2026-08-26'), -6, '過ぎたぶんが負にならない');

  // 突き合わせ — **取れなかった回**
  const unk = reconcile({ fetched: null, ledgerDue: '2027-03-14', today: '2026-08-26' });
  eq(unk.verdict, 'unknown', '取得失敗を unknown にしていない');
  eq(unk.due, '2027-03-14', '**取得失敗で台帳の値を消している**');

  const unk2 = reconcile({ fetched: null, ledgerDue: null, today: '2026-08-26' });
  eq(unk2.due, null, '未把握のまま unknown を返せていない');

  // 突き合わせ — 取れた回
  eq(reconcile({ fetched: '2027-03-14', ledgerDue: '2027-03-14', today: '2026-08-26' }).verdict,
     'fresh', '一致を fresh にしていない');
  eq(reconcile({ fetched: '2027-03-14', ledgerDue: null, today: '2026-08-26' }).verdict,
     'stale', '未把握との差を stale にしていない');
  eq(reconcile({ fetched: '2026-10-01', ledgerDue: '2026-10-01', today: '2026-08-26' }).verdict,
     'expiring', `残り ${WARN_DAYS} 日未満を expiring にしていない`);
  eq(reconcile({ fetched: '2026-08-01', ledgerDue: '2026-08-01', today: '2026-08-26' }).verdict,
     'expired', '過ぎているものを expired にしていない');
  // **期限が近いことは、台帳と一致していても言う。**一致を理由に黙らない
  eq(reconcile({ fetched: '2026-09-01', ledgerDue: '2026-09-01', today: '2026-08-26' }).verdict,
     'expiring', '台帳と一致していると期限切れ間近を黙っている');

  // 決済試行日 —— **期限から引くだけ。取れていなければ出さない。**
  eq(paymentAttemptDate('2027-01-30'), '2026-12-31', '決済試行日を期限の30日前に置いていない');
  eq(paymentAttemptDate(null), null, '**期限が無いのに決済日を推定している**');
  eq(paymentAttemptDate('not-a-date'), null, '壊れた日付から決済日を作っている');
  // 月またぎ・年またぎで壊れないこと（手計算だと落ちる形）
  eq(paymentAttemptDate('2027-03-01'), '2027-01-30', '月またぎで決済試行日がずれる');
  // WARN_DAYS は決済試行より前に鳴る必要がある。**逆転したら警告が手遅れになる。**
  eq(WARN_DAYS > PAYMENT_ATTEMPT_DAYS_BEFORE, true,
     '**60日警告が決済試行より後になっている** —— 鳴った時にはもう1回きりの課金が済んでいる');

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
    console.log('check-domain-expiry: 自己検査に問題なし。');
    process.exit(0);
  }

  const doc = readLedger();
  const entry = findDeadline(doc);
  if (!entry) {
    console.error(`data/corporate-obligations.json に "${DEADLINE_ID}" が無い`);
    process.exit(1);
  }
  const domain = entry.domain ?? 'simplememofast.com';
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST

  const { expiry, source, registrar } = await fetchExpiry(domain);
  const r = reconcile({ fetched: expiry, ledgerDue: entry.next_due ?? null, today });

  console.log(`ドメインの有効期限（${domain}）\n`);
  console.log(`  台帳: ${entry.next_due ?? '**未把握**'}`);
  console.log(`  RDAP: ${expiry ?? '**取得できず**'}${source ? `  (${source})` : ''}`);
  console.log(`  判定: ${r.verdict} — ${r.why}`);
  // **警告だけ出して「何を見るか」を言わないと、見た人が消して終わる。**
  const attempt = paymentAttemptDate(r.due);
  if (attempt) {
    console.log(`\n  決済の試行: ${attempt} ごろ（期限の ${PAYMENT_ATTEMPT_DAYS_BEFORE} 日前・**1回だけ・再試行なし**）`);
    console.log('  **失敗しても RDAP の日付は変わらない。**この検査では成功と区別がつかない。');
    console.log('  → その数日後に管理画面の「状態」欄が「自動更新中」のままかを1回見ること');
    console.log('     落ちていた場合、カードを直しても自動では再決済されない（手で支払う）');
  }
  if (r.verdict === 'unknown') {
    console.log('\n  **取得できなかったことを「期限なし」と読まないこと。**');
    console.log('  エージェント環境はプロキシが RDAP への CONNECT を拒否する。CIでは届く。');
  }

  if (argv.includes('--write')) {
    if (r.verdict === 'unknown') {
      console.log('\n  → 書かない（取得できていない）');
    } else {
      entry.next_due = r.due;
      entry.source = 'rdap';
      entry.unconfirmed_reason = null;
      entry.$derived = 'RDAP から取得。**手で書かない** — scripts/check-domain-expiry.mjs --write が正';
      // [2026-08-28] **上位レジストラも同じ応答から拾う。**
      // 規約（ムームードメイン §2）は上位レジストラ規約を丸ごと取り込むが、
      // **誰が乗っているかは書いていない。**契約条項の registrar 行はそこで止まっている。
      // 取れなければ書かない —— **取れなかったことを「無い」と混ぜない。**
      const reg = registrar;
      if (reg) {
        entry.upstream_registrar = reg.name;
        entry.upstream_registrar_iana_id = reg.ianaId;
        entry.$upstream_registrar = '**RDAP から取得。手で書かない。**'
          + 'ムームードメイン利用規約 §2 が上位レジストラの規約を取り込む構造なので、'
          + '**誰が乗っているかで適用される責任条項が変わる**'
          + '（お名前.com なら事業者登録者に一切責任を負わない / eNom なら Washington 州法・'
          + 'JAMS 仲裁・上限 $400 以下）。contract_review の registrar 行の '
          + '$governing_law がこの値を待っている';
      }
      fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(doc, null, 2)}\n`);
      console.log(`\n  → 台帳を更新（${r.due}）`);
    }
  }

  if (argv.includes('--check')) {
    const problems = selftest();
    // **unknown では落とさない。**取れないことは、こちらの壊れではない。
    if (r.verdict === 'expired') problems.push(`ドメインの期限が過ぎている（${r.due}）`);
    if (r.verdict === 'stale') {
      problems.push(`台帳の next_due が RDAP と違う（台帳 ${entry.next_due ?? '未把握'} / RDAP ${r.due}）`
        + ' — `--write` を同じコミットに含めること');
    }
    if (problems.length) {
      console.error('\nドメイン期限: 不整合');
      for (const x of problems) console.error(`  - ${x}`);
      process.exit(1);
    }
    console.log('\n問題なし。');
  }
}
