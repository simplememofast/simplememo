#!/usr/bin/env node
/**
 * 資格情報・証明書の期限検査。
 *
 *   node scripts/check-expiry.mjs           # 一覧
 *   node scripts/check-expiry.mjs --check   # CI用（fail_days を切ったら exit 1）
 *   node scripts/check-expiry.mjs --json
 *   node scripts/check-expiry.mjs --no-net  # TLS実測をせず台帳の値だけで判定
 *
 * **「期限を知らない」を「余裕がある」と書かない。**
 * expires_at が未記入のものは unknown として別枠で数える。ここを 0 件扱いに
 * すると、この検査そのものが「切れた日に初めて分かる」状態の追認になる。
 */

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = path.join(ROOT, 'data/credential-expiry.json');
const DAY = 86_400_000;

export const STATES = {
  FAIL: 'fail',                 // 期限が近すぎる／切れている
  WARN: 'warn',                 // 警告期間に入った
  OK: 'ok',
  UNKNOWN: 'unknown',           // 期限を把握していない
  UNVERIFIABLE: 'unverifiable', // 実測しようとしたが信用できない結果だった
  NO_EXPIRY: 'no_expiry',       // 期限の概念が無い
};

/** 台帳1件の判定。**純関数**（時計もネットワークも外から渡す）。 */
export function classify(cred, { now, policy, observed = null }) {
  if (cred.source === 'none') {
    return { state: STATES.NO_EXPIRY, days: null,
             detail: '期限の概念が無い（失効・権限変更は別の監視で拾う）' };
  }
  if (observed?.error) {
    return { state: STATES.UNVERIFIABLE, days: null, detail: observed.error };
  }
  const iso = observed?.expires_at ?? cred.expires_at;
  if (!iso) {
    return { state: STATES.UNKNOWN, days: null,
             detail: '期限が台帳に未記入。**把握していないだけで、余裕があるわけではない**' };
  }
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return { state: STATES.UNKNOWN, days: null, detail: `日付を解釈できない: ${iso}` };
  }
  const days = Math.floor((ms - now) / DAY);
  const source = observed ? '実測' : '台帳';
  if (days <= policy.fail_days) {
    return { state: STATES.FAIL, days,
             detail: days < 0 ? `${-days}日前に切れている（${source}）` : `残り${days}日（${source}）` };
  }
  if (days <= policy.warn_days) return { state: STATES.WARN, days, detail: `残り${days}日（${source}）` };
  return { state: STATES.OK, days, detail: `残り${days}日（${source}）` };
}

/**
 * TLSの実測。**発行元が信用できる集合に無ければ期限を返さない。**
 *
 * 実行環境が中間者復号していると、読めるのはプロキシの証明書で、その notAfter を
 * 本番の期限として報告すると嘘になる（この環境で実際に Anthropic egress の
 * 証明書が観測された）。scripts/compute_spki_pins.sh のヘッダと同じ理由。
 */
export function inspectIssuer(cert, trusted) {
  const issuer = [cert?.issuer?.O, cert?.issuer?.CN].filter(Boolean).join(' / ') || '不明';
  const ok = trusted.some((t) => issuer.toLowerCase().includes(t.toLowerCase()));
  if (!ok) {
    return { error: `発行元が信用集合に無い（${issuer}）。中間者復号の可能性があるため期限を報告しない` };
  }
  const ms = Date.parse(cert.valid_to);
  if (Number.isNaN(ms)) return { error: `notAfter を解釈できない: ${cert.valid_to}` };
  return { expires_at: new Date(ms).toISOString(), issuer };
}

function fetchCert(host, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const socket = tls.connect({ host, port: 443, servername: host }, () => {
      const cert = socket.getPeerCertificate(true);
      socket.destroy();
      finish({ cert });
    });
    socket.on('error', (e) => finish({ error: `接続できない: ${e.message}` }));
    setTimeout(() => { socket.destroy(); finish({ error: 'タイムアウト' }); }, timeoutMs);
  });
}

const LABEL = {
  [STATES.FAIL]: '期限切れ間近',
  [STATES.WARN]: '要更新',
  [STATES.OK]: '余裕あり',
  [STATES.UNKNOWN]: '**未把握**',
  [STATES.UNVERIFIABLE]: '実測不能',
  [STATES.NO_EXPIRY]: '期限なし',
};
const ORDER = [STATES.FAIL, STATES.UNKNOWN, STATES.WARN, STATES.UNVERIFIABLE, STATES.OK, STATES.NO_EXPIRY];

export async function run({ net = true, now = Date.now() } = {}) {
  const doc = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const policy = doc.policy;
  const rows = [];

  for (const cred of doc.credentials) {
    let observed = null;
    if (cred.source === 'tls' && cred.host) {
      if (!net) {
        observed = { error: '--no-net のため実測していない' };
      } else {
        const r = await fetchCert(cred.host);
        observed = r.error ? { error: r.error } : inspectIssuer(r.cert, doc.trusted_tls_issuers);
      }
    }
    rows.push({ ...classify(cred, { now, policy, observed }), cred });
  }
  return { policy, rows };
}

// ── 自己テスト（境界の固定） ──────────────────────────
// このスクリプトの価値は「判定が正しいこと」だけなので、境界はここで固定する。
const SCENARIOS = [
  ['期限なしは期限切れにならない',
    { source: 'none' }, null, STATES.NO_EXPIRY],
  ['未記入は unknown（ok に落とさない）',
    { source: 'declared', expires_at: null }, null, STATES.UNKNOWN],
  ['解釈できない日付も unknown',
    { source: 'declared', expires_at: 'いつか' }, null, STATES.UNKNOWN],
  ['fail_days ちょうどは fail（境界は含む）',
    { source: 'declared', expires_at: '2026-08-29T00:00:00Z' }, null, STATES.FAIL],
  ['fail_days の翌日は warn',
    { source: 'declared', expires_at: '2026-08-30T00:00:00Z' }, null, STATES.WARN],
  ['warn_days ちょうどは warn',
    { source: 'declared', expires_at: '2026-09-21T00:00:00Z' }, null, STATES.WARN],
  ['warn_days を超えれば ok',
    { source: 'declared', expires_at: '2026-09-23T00:00:00Z' }, null, STATES.OK],
  ['過去の日付は fail',
    { source: 'declared', expires_at: '2026-01-01T00:00:00Z' }, null, STATES.FAIL],
  ['実測が信用できなければ unverifiable（台帳の値にも落ちない）',
    { source: 'tls', expires_at: '2027-01-01T00:00:00Z' }, { error: '中間者' }, STATES.UNVERIFIABLE],
  ['実測が取れれば台帳より実測を優先する',
    { source: 'tls', expires_at: '2027-01-01T00:00:00Z' },
    { expires_at: '2026-08-25T00:00:00Z' }, STATES.FAIL],
];

function selftest() {
  const now = Date.parse('2026-08-22T00:00:00Z');
  const policy = { warn_days: 30, fail_days: 7 };
  let failed = 0;

  for (const [name, cred, observed, expected] of SCENARIOS) {
    const got = classify(cred, { now, policy, observed }).state;
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? 'OK  ' : 'NG  '} ${name}${ok ? '' : ` — 期待 ${expected} / 実際 ${got}`}`);
  }

  // 発行元の検査
  const trusted = ["Let's Encrypt", 'Google Trust Services'];
  const cases = [
    ['正規の発行元は期限を返す',
      { issuer: { O: "Let's Encrypt", CN: 'R3' }, valid_to: 'Dec 31 2026 GMT' }, false],
    ['中間者の発行元は期限を返さない',
      { issuer: { O: 'Anthropic', CN: 'Egress Gateway' }, valid_to: 'Dec 31 2026 GMT' }, true],
    ['発行元不明も期限を返さない',
      { valid_to: 'Dec 31 2026 GMT' }, true],
  ];
  for (const [name, cert, wantError] of cases) {
    const r = inspectIssuer(cert, trusted);
    const ok = Boolean(r.error) === wantError;
    if (!ok) failed++;
    console.log(`  ${ok ? 'OK  ' : 'NG  '} ${name}`);
  }
  return failed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest')) {
    console.log('期限判定の自己テスト');
    const failed = selftest();
    console.log(failed ? `\n${failed} 件失敗` : '\n全シナリオ通過');
    process.exit(failed ? 1 : 0);
  }

  const { policy, rows } = await run({ net: !argv.includes('--no-net') });

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      policy,
      rows: rows.map((r) => ({ id: r.cred.id, state: r.state, days: r.days, detail: r.detail })),
    }, null, 2));
    process.exit(0);
  }

  console.log('資格情報・証明書の期限（data/credential-expiry.json）');
  console.log(`  警告 ${policy.warn_days}日前 / 失敗 ${policy.fail_days}日前\n`);

  const by = Object.fromEntries(ORDER.map((s) => [s, rows.filter((r) => r.state === s)]));
  for (const state of ORDER) {
    if (!by[state].length) continue;
    console.log(`  [${LABEL[state]}] ${by[state].length}件`);
    for (const r of by[state]) {
      console.log(`    ${r.cred.critical ? '★' : ' '} ${r.cred.label}`);
      console.log(`        ${r.detail}`);
      if (state === STATES.FAIL || state === STATES.WARN) {
        console.log(`        止まるもの: ${r.cred.breaks_if_expired}`);
        console.log(`        更新手順:   ${r.cred.renewal}`);
      }
    }
    console.log('');
  }

  const unknownCritical = by[STATES.UNKNOWN].filter((r) => r.cred.critical);
  if (unknownCritical.length) {
    console.log(`  ⚠ critical のうち ${unknownCritical.length} 件が未把握。`);
    console.log('    これらは「切れた日に初めて分かる」状態のまま。日付を埋めたら');
    console.log('    data/credential-expiry.json の policy.enforce_unknown を true にする。');
    console.log('');
  }

  if (argv.includes('--check')) {
    const failed = by[STATES.FAIL].length;
    const blockedByUnknown = policy.enforce_unknown ? unknownCritical.length : 0;
    if (failed || blockedByUnknown) {
      console.error(`期限検査に失敗: 期限切れ間近 ${failed}件 / 未把握(critical) ${blockedByUnknown}件`);
      process.exit(1);
    }
    console.log('期限検査に問題なし（未把握の件数は上に出ている。ゼロではない）。');
  }
}
