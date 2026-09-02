#!/usr/bin/env node
/**
 * **Lane B（iOSアプリ本体）の運転台帳 — 1版1行。**
 *
 *   node scripts/app-releases.mjs             # 表示（台帳を読む）
 *   node scripts/app-releases.mjs --write     # 隣の simplememo-ios から作り直す（3リポジトリが揃った場所で）
 *   node scripts/app-releases.mjs --check     # CI: 台帳の算数・形・鮮度（隣は読まない）
 *   node scripts/app-releases.mjs --selftest
 *
 * 【なぜ要るか — 2026-09-02 の配信前日に気づいた】
 * 運転台帳（data/autopilot-runs.json）が数えているのは **Lane A（サイト・運営基盤）** だけで、
 * 23日間の「出荷19件」にアプリ本体の更新は1件も入っていない。いっぽう同じ期間に
 * アプリ本体は 7版が App Store に並んでいるのに、**それを1行ずつ言える台帳がどこにも無かった。**
 * 「公開中の実アプリで本番リリース実績を公開」と書くには、Lane B にも同じ形の台帳が要る。
 *
 * 【1行に何を持つか】
 *   version / tag / tag_at / tag_sha        … git のタグ（版の出発点）
 *   build                                   … TestFlight のビルド番号と処理完了時刻（ASC 観測）
 *   device_verification                     … 実機で確かめた記録（**人の申告**。機械の検証ではない）
 *   asc                                     … App Store 側の状態と、版のレコードが作られた時刻
 *   store.released_between                  … READY_FOR_DISTRIBUTION を**初めて観測した時刻**と、
 *                                             その直前に別の状態を観測した時刻の対。**公開時刻そのものは
 *                                             Apple が返さない**ので、観測の挟み撃ちで幅として持つ
 *   code                                    … 直前のタグからの差分（コミット・変更行・AI著者）。
 *                                             数え方は scripts/code-authorship.mjs と同じ
 *
 * 【推測で埋めない】
 *   - 実機確認の台帳は 2026-08-28 に始まった。それ以前の版は「無い」と書く（null に理由つき）
 *   - Apple の版の一覧は直近10版しか持たない。それより古い版の ASC 欄も null
 *   - 審査提出（reviewSubmissions）は版を持たない応答なので、**版に紐づけない**。
 *     窓の合計件数だけを summary に持つ
 *
 * 【この台帳が言えること・言えないこと】
 *   言える   … 同期間にタグを切った版の数、うち App Store に並んだ数、実機確認の記録がある数、
 *              公開が観測された時刻の幅、各版のコード差分の AI 著者率
 *   言えない … 「AIがアプリを出した」。提出・実機確認・公開は人の操作
 *              （data/authority-matrix.json の該当3領域。この台帳はそれを数字で裏づける側）
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { readLedger } from './lib/read-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/app-releases.json');
const IOS = path.resolve(ROOT, '..', 'simplememo-ios');
const MATERIALS = 'data/appstore/release-materials.json';
const DEVICE = 'data/appstore/device-verification.json';

/** 台帳の鮮度。**超えたら --check が落ちる。**隣のリポジトリは CI に無いので、人か日次セッションが --write する。 */
export const MAX_AGE_DAYS = 30;
/** 既定の窓の始まり（Lane A の運転台帳と同じ日）。 */
export const DEFAULT_FROM = '2026-08-11';
/** 実機確認の台帳が始まった日。**これより前の版に記録が無いのは欠落ではない。** */
const DEVICE_LEDGER_SINCE = '2026-08-28';
const READY = 'READY_FOR_DISTRIBUTION';
export const ASC_STATES = new Set([
  READY, 'PENDING_DEVELOPER_RELEASE', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED', 'REJECTED', 'READY_FOR_SALE', 'PROCESSING_FOR_DISTRIBUTION', 'ACCEPTED',
  'REPLACED_WITH_NEW_VERSION', 'REMOVED_FROM_SALE', 'METADATA_REJECTED', 'INVALID_BINARY',
  'WAITING_FOR_EXPORT_COMPLIANCE', 'PENDING_APPLE_RELEASE', 'DEVELOPER_REMOVED_FROM_SALE',
]);

// code-authorship.mjs と同じ定義。**ここを変えるならあちらも変える。**
const AI_AUTHOR = /claude/i;
const AI_TRAILER = /^Co-Authored-By:\s*Claude/im;
/**
 * [2026-09-02] 定義 v2。**PR 本文の末尾に付く機械の足跡**も AI 著者の印に数える。
 * GitHub の squash マージはコミット本文に PR 本文を写すが、Claude Code が作る PR 本文の末尾は
 * 「🤖 Generated with [Claude Code]」とセッション URL であって Co-Authored-By ではない。
 * v1（署名とトレーラーだけ）ではそれが人側に落ちる。8/11〜9/1 の実測では v1 と v2 の値は
 * 一致した（足跡を持つ squash コミットがまだ無かった）ので、公開値は動いていない。
 * 手で書ける印なので「厳密に AI が書いた」証明ではないが、**申告の無いコミットを人側に数える**
 * 方針は変えない —— 申告の書式を1つ増やしただけ。
 */
const AI_FOOTPRINT = /Generated with \[Claude Code\]|claude\.ai\/code\/session|^Claude-Session:/im;

const git = (args, cwd = IOS) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

/** JST の日付（YYYY-MM-DD）。タグ日・窓の判定はすべてこれで揃える。 */
export function jstDate(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 版の並び（5.7.10 は 5.7.9 の後）。 */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function assertSiblingReady() {
  if (!fs.existsSync(path.join(IOS, '.git'))) {
    throw new Error(`${IOS} が無い — 3リポジトリが揃った場所で --write を実行する。**部分的な計測を台帳にしない。**`);
  }
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim();
  if (shallow === 'true') {
    throw new Error('simplememo-ios が浅いクローン — タグと履歴が欠ける。`git fetch --unshallow origin` してから --write');
  }
}

/** v* タグ。版の順に並べる。 */
export function readTags() {
  const out = git(['for-each-ref', 'refs/tags', '--format=%(refname:short)%01%(creatordate:iso-strict)%01%(objectname)']);
  const tags = [];
  for (const line of out.split('\n')) {
    const [name, at, sha] = line.split('\x01');
    if (!/^v\d+\.\d+\.\d+$/.test(name || '')) continue;
    tags.push({ tag: name, version: name.slice(1), tag_at: at, tag_sha: sha });
  }
  return tags.sort((a, b) => compareVersions(a.version, b.version));
}

/** 隣の1ファイルの git 履歴を、コミットごとに JSON で読む。読めない断面は捨てずに数える。 */
function fileHistory(relPath) {
  const log = git(['log', '--format=%H%x01%aI', '--', relPath]).trim();
  const snapshots = [];
  let unreadable = 0;
  for (const line of log ? log.split('\n') : []) {
    const [sha, at] = line.split('\x01');
    try {
      const doc = JSON.parse(git(['show', `${sha}:${relPath}`]));
      snapshots.push({ sha, at, doc });
    } catch { unreadable += 1; }
  }
  // 古い順に
  snapshots.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { snapshots, unreadable };
}

/**
 * release-materials.json の履歴から、版ごとに「READY を初めて観測した時刻」と
 * 「その直前に READY 以外を観測した時刻」を取る。**公開時刻は Apple が返さない。**
 * 観測の挟み撃ちで幅として持つ。
 */
export function storeObservations(snapshots) {
  const byVersion = {};
  for (const s of snapshots) {
    const versions = s.doc?._observed?.versions;
    if (!Array.isArray(versions)) continue;
    for (const v of versions) {
      if (!v?.version) continue;
      const rec = (byVersion[v.version] ??= { first_ready_at: null, last_not_ready_before_ready_at: null, first_seen_at: null, first_seen_state: null });
      if (rec.first_seen_at === null) { rec.first_seen_at = s.at; rec.first_seen_state = v.state ?? null; }
      if (v.state === READY) {
        if (rec.first_ready_at === null) rec.first_ready_at = s.at;
      } else if (rec.first_ready_at === null) {
        rec.last_not_ready_before_ready_at = s.at;
      }
    }
  }
  return byVersion;
}

/** 実機確認の履歴。版ごとに最新の記録。 */
export function deviceRecords(snapshots) {
  const byVersion = {};
  for (const s of snapshots) {
    const d = s.doc;
    if (!d?.version || !d?.sha) continue;
    byVersion[d.version] = { sha: d.sha, at: d.at ?? null, recorded_from: d.recorded_from ?? null };
  }
  return byVersion;
}

/** タグ間の差分を、code-authorship.mjs と同じ定義で数える。 */
export function countRange(range) {
  const out = git(['log', range, '--no-merges', '--pretty=format:%H%x01%an <%ae>%x01%B%x02']);
  const seen = new Set();
  const r = { commits_total: 0, commits_ai: 0, lines_total: 0, lines_ai: 0 };
  for (const chunk of out.split('\x02')) {
    const c = chunk.trim();
    if (!c) continue;
    const [sha, author, body] = c.split('\x01');
    if (!sha || seen.has(sha)) continue;
    seen.add(sha);
    const isAI = AI_AUTHOR.test(author || '') || AI_TRAILER.test(body || '') || AI_FOOTPRINT.test(body || '');
    let lines = 0;
    try {
      const stat = git(['show', '--numstat', '--format=', sha]);
      for (const row of stat.split('\n')) {
        const m = /^(\d+|-)\t(\d+|-)\t/.exec(row);
        if (!m) continue;
        lines += (m[1] === '-' ? 0 : Number(m[1])) + (m[2] === '-' ? 0 : Number(m[2]));
      }
    } catch { /* 読めないコミットは行数0で数える（存在は数える） */ }
    r.commits_total += 1; r.lines_total += lines;
    if (isAI) { r.commits_ai += 1; r.lines_ai += lines; }
  }
  return r;
}

export function buildRows({ tags, materials, storeObs, devices, fromDate }) {
  const versions = new Map((materials?._observed?.versions ?? []).map((v) => [v.version, v]));
  const builds = new Map((materials?._observed?.builds?.rows ?? []).map((b) => [b.marketing_version, b]));
  const live = materials?._observed?.live_version ?? null;
  const rows = [];
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    if (jstDate(t.tag_at) < fromDate) continue;
    const prev = tags[i - 1] ?? null;
    const v = versions.get(t.version) ?? null;
    const b = builds.get(t.version) ?? null;
    const so = storeObs[t.version] ?? null;
    const dv = devices[t.version] ?? null;

    let store = null;
    if (v?.state === READY) {
      if (so?.first_ready_at && so.last_not_ready_before_ready_at) {
        store = { released_between: [so.last_not_ready_before_ready_at, so.first_ready_at], released_before: null,
          how: '観測の挟み撃ち（READY 以外を最後に見た時刻 〜 READY を初めて見た時刻）' };
      } else if (so?.first_ready_at) {
        store = { released_between: null, released_before: so.first_ready_at,
          how: '初めて観測した時点で既に READY。**下限は無い**（観測が始まる前に公開されていた）' };
      } else {
        store = { released_between: null, released_before: null, how: '現在の一覧で READY だが、履歴に観測が無い' };
      }
    }

    let device;
    if (dv) {
      device = { sha: dv.sha, at: dv.at, recorded_from: dv.recorded_from, sha_matches_tag: dv.sha === t.tag_sha };
    } else if (jstDate(t.tag_at) < DEVICE_LEDGER_SINCE) {
      device = null;
    } else {
      device = null;
    }
    const deviceNote = dv ? null
      : (jstDate(t.tag_at) < DEVICE_LEDGER_SINCE
        ? `実機確認の台帳（${DEVICE}）は ${DEVICE_LEDGER_SINCE} に始まった。**この版の記録は無い**（無いのであって、確認しなかったとは言えない）`
        : '記録が無い。TestFlight 止まりか、記録されていないかのどちらか');

    rows.push({
      version: t.version, tag: t.tag, tag_at: t.tag_at, tag_sha: t.tag_sha,
      build: b ? { number: String(b.build_number), uploaded_at: b.uploaded_at ?? null, processing_state: b.processing_state ?? null } : null,
      device_verification: device,
      $device_note: deviceNote,
      asc: v ? { state: v.state ?? null, version_created_at: v.created_at ?? null, live: live === t.version } : null,
      $asc_note: v ? null : 'Apple の版の一覧（直近10版）に無い。TestFlight 段階か、一覧の外',
      store,
      code: prev ? { since_tag: prev.tag, ...countRange(`${prev.tag}..${t.tag}`) } : null,
    });
  }
  return rows;
}

/** 窓の集計。**台帳の行から決まる**ので、--check が再計算して突き合わせられる。 */
export function summarize(doc, { from = doc.window?.from ?? DEFAULT_FROM, to = doc.window?.to ?? '9999-12-31' } = {}) {
  const rows = (doc.rows ?? []).filter((r) => { const d = jstDate(r.tag_at); return d !== null && d >= from && d <= to; });
  const ready = rows.filter((r) => r.asc?.state === READY);
  const verified = rows.filter((r) => r.device_verification && r.device_verification.sha_matches_tag === true);
  const bounded = ready.filter((r) => Array.isArray(r.store?.released_between));
  const code = rows.reduce((a, r) => (r.code ? {
    commits_total: a.commits_total + r.code.commits_total,
    commits_ai: a.commits_ai + r.code.commits_ai,
    lines_total: a.lines_total + r.code.lines_total,
    lines_ai: a.lines_ai + r.code.lines_ai,
  } : a), { commits_total: 0, commits_ai: 0, lines_total: 0, lines_ai: 0 });
  const rate = (n, d) => (d > 0 ? Number((n / d * 100).toFixed(1)) : null);
  return {
    window: { from, to },
    tags: rows.length,
    store_ready: ready.length,
    store_ready_versions: ready.map((r) => r.version),
    device_verified_same_sha: verified.length,
    release_time_bounded: bounded.length,
    code,
    code_ai_commit_rate_pct: rate(code.commits_ai, code.commits_total),
    code_ai_line_rate_pct: rate(code.lines_ai, code.lines_total),
  };
}

export function validate(doc, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['台帳が object でない'];
  if (!doc.method?.code_ai_author_definition) problems.push('method.code_ai_author_definition が無い — 数え方の残っていない数字は再現できない');
  if (!doc.method?.release_time_definition) problems.push('method.release_time_definition が無い — 公開時刻を何で観測したかが残っていない');
  if (typeof doc.measured_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.measured_at)) {
    problems.push('measured_at が YYYY-MM-DD でない');
  } else {
    const age = (Date.parse(today) - Date.parse(doc.measured_at)) / 86400000;
    if (age > MAX_AGE_DAYS) {
      problems.push(`measured_at ${doc.measured_at} が ${Math.floor(age)} 日前（許容 ${MAX_AGE_DAYS} 日）`
        + ' — **古い台帳は、無い台帳と同じ。**3リポジトリの揃った場所で `node scripts/app-releases.mjs --write`');
    }
  }
  const rows = doc.rows;
  if (!Array.isArray(rows) || rows.length === 0) { problems.push('rows が空 — 版が1つも無い台帳は台帳ではない'); return problems; }
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = `rows[${i}] ${r?.version ?? '(版無し)'}`;
    if (!r || typeof r !== 'object') { problems.push(`${at}: object でない`); return; }
    if (typeof r.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(r.version)) problems.push(`${at}: version が x.y.z でない`);
    if (seen.has(r.version)) problems.push(`${at}: 版が重複`);
    seen.add(r.version);
    if (r.tag !== `v${r.version}`) problems.push(`${at}: tag が v<version> でない`);
    if (jstDate(r.tag_at) === null) problems.push(`${at}: tag_at が読めない`);
    if (typeof r.tag_sha !== 'string' || !/^[0-9a-f]{40}$/.test(r.tag_sha)) problems.push(`${at}: tag_sha が40桁の sha でない`);
    if (i > 0 && compareVersions(rows[i - 1].version, r.version) >= 0) problems.push(`${at}: 版の順に並んでいない`);
    if (r.asc && r.asc.state !== null && !ASC_STATES.has(r.asc.state)) problems.push(`${at}: asc.state "${r.asc.state}" は既知の状態でない`);
    if (r.store) {
      const rb = r.store.released_between;
      if (rb !== null && (!Array.isArray(rb) || rb.length !== 2 || !(Date.parse(rb[0]) <= Date.parse(rb[1])))) {
        problems.push(`${at}: store.released_between が [下限, 上限] の順でない`);
      }
      if (rb === null && r.store.released_before === null && !r.store.how) problems.push(`${at}: store に観測も理由も無い`);
      if (r.asc?.state !== READY) problems.push(`${at}: READY でないのに store がある（公開の観測は READY にしか付かない）`);
    }
    if (r.device_verification) {
      const d = r.device_verification;
      const want = d.sha === r.tag_sha;
      if (d.sha_matches_tag !== want) problems.push(`${at}: device_verification.sha_matches_tag が実際（${want}）と違う`);
      if (!d.recorded_from) problems.push(`${at}: device_verification.recorded_from が無い — 人の申告か機械の検証かを区別できない`);
    }
    if (r.code) {
      const c = r.code;
      for (const k of ['commits_total', 'commits_ai', 'lines_total', 'lines_ai']) {
        if (typeof c[k] !== 'number' || c[k] < 0) problems.push(`${at}: code.${k} が非負の数でない`);
      }
      if (c.commits_ai > c.commits_total || c.lines_ai > c.lines_total) problems.push(`${at}: code の AI 分が合計を超えている`);
      if (typeof c.since_tag !== 'string') problems.push(`${at}: code.since_tag が無い — どこからの差分か分からない`);
    }
  });
  // summary は行から再計算できる。**丸めた値を別に持たない**（code-authorship と同じ規律）
  if (!doc.summary || !doc.window) {
    problems.push('summary / window が無い — 公開面が引く数字の正が消える');
  } else {
    const want = summarize(doc);
    for (const k of ['tags', 'store_ready', 'device_verified_same_sha', 'release_time_bounded', 'code_ai_commit_rate_pct', 'code_ai_line_rate_pct']) {
      if (doc.summary[k] !== want[k]) problems.push(`summary.${k} ${JSON.stringify(doc.summary[k])} が行からの再計算 ${JSON.stringify(want[k])} と違う`);
    }
    for (const k of Object.keys(want.code)) {
      if (doc.summary.code?.[k] !== want.code[k]) problems.push(`summary.code.${k} が行の合計と違う`);
    }
  }
  return problems;
}

const pct = (v) => (v === null || v === undefined ? 'n/a' : `${v.toFixed(1)}%`);

export function render(doc) {
  const s = doc.summary;
  const o = [];
  o.push(`Lane B（iOSアプリ本体）の運転台帳 — 窓 ${s.window.from} 〜 ${s.window.to}（計測 ${doc.measured_at}）\n`);
  o.push(`  タグを切った版              ${s.tags}`);
  o.push(`  うち App Store に並んだ版    ${s.store_ready}   (${s.store_ready_versions.join(', ') || '—'})`);
  o.push(`  実機確認の記録がある版       ${s.device_verified_same_sha}   (同じ sha への人の申告。台帳は ${DEVICE_LEDGER_SINCE} から)`);
  o.push(`  公開時刻を幅で観測できた版   ${s.release_time_bounded}   (Apple は公開時刻を返さない。観測の挟み撃ち)`);
  o.push(`  コード差分の AI 著者率       コミット ${pct(s.code_ai_commit_rate_pct)} (${s.code.commits_ai}/${s.code.commits_total})`
    + ` / 変更行 ${pct(s.code_ai_line_rate_pct)} (${s.code.lines_ai.toLocaleString()}/${s.code.lines_total.toLocaleString()})`);
  o.push('');
  o.push('  版        タグ日(JST)  ビルド  実機確認         App Store                公開の観測                    コード(AI/全)');
  for (const r of doc.rows) {
    const dev = r.device_verification ? (r.device_verification.sha_matches_tag ? '記録あり(同sha)' : '記録あり(別sha)') : '記録なし';
    const asc = r.asc ? `${r.asc.state}${r.asc.live ? ' (live)' : ''}` : '一覧に無い';
    let rel = '—';
    if (r.store?.released_between) rel = `${r.store.released_between[0].slice(0, 16)}Z〜${r.store.released_between[1].slice(11, 16)}Z`;
    else if (r.store?.released_before) rel = `〜${r.store.released_before.slice(0, 16)}Z(上限のみ)`;
    const code = r.code ? `${r.code.commits_ai}/${r.code.commits_total}` : '—';
    o.push(`  ${r.version.padEnd(9)} ${jstDate(r.tag_at)}   ${(r.build?.number ?? '—').padEnd(6)}  ${dev.padEnd(16)} ${asc.padEnd(24)} ${rel.padEnd(29)} ${code}`);
  }
  o.push('');
  o.push('  **言えないこと**: 「AIがアプリを出した」。実機確認・審査提出・公開は人の操作（data/authority-matrix.json）。');
  o.push('  この台帳はその境界を数字で裏づける側で、Lane A の運転台帳（data/autopilot-runs.json）と混ぜない。');
  return o.join('\n');
}

export function write({ from = DEFAULT_FROM, at = new Date().toISOString().slice(0, 10) } = {}) {
  assertSiblingReady();
  const tags = readTags();
  const materials = readLedger(path.join(IOS, MATERIALS), { onMissing: null, why: 'App Store 側の状態が読めない' });
  const mh = fileHistory(MATERIALS);
  const dh = fileHistory(DEVICE);
  const rows = buildRows({ tags, materials, storeObs: storeObservations(mh.snapshots), devices: deviceRecords(dh.snapshots), fromDate: from });
  const doc = {
    $comment: [
      'Lane B（iOSアプリ本体）の運転台帳。**scripts/app-releases.mjs --write の出力そのもの。**手で書き換えない。',
      '1版1行。タグ・ビルド・実機確認の記録・App Store の状態・公開が観測された時刻の幅・コード差分の AI 著者率。',
      '',
      '**言えること**: 同期間にタグを切った版の数、うち App Store に並んだ数、実機確認の記録がある数、公開の観測幅、各版のコード差分。',
      '**言えないこと**: 「AIがアプリを出した」。提出・実機確認・公開は人の操作（data/authority-matrix.json）。',
      '',
      '公開時刻そのものは Apple が返さない。released_between は「READY 以外を最後に見た時刻」と',
      '「READY を初めて見た時刻」の対で、実体は simplememo-ios/data/appstore/release-materials.json の git 履歴。',
      '実機確認は recorded_from が "owner statement" のとき人の申告であって、機械の検証ではない。',
    ],
    measured_at: at,
    window: { from, to: at },
    method: {
      tags: 'simplememo-ios の refs/tags のうち v<x.y.z>。tag_at は creatordate、JST の日付で窓に入れる',
      code_ai_author_definition: 'author に Claude を含む、または本文に Co-Authored-By: Claude、または本文に Claude Code の足跡（Generated with [Claude Code] / claude.ai/code/session / Claude-Session:）— scripts/code-authorship.mjs と同じ定義 v2。差分は直前のタグ..このタグ、マージ除く',
      release_time_definition: 'release-materials.json の履歴で READY_FOR_DISTRIBUTION を初めて観測した時刻と、その直前に別の状態を観測した時刻の対。観測前から READY の版は上限だけ',
      device_verification: 'device-verification.json の履歴。版ごとに最新の記録。sha がタグと一致するかを sha_matches_tag に持つ',
      materials_snapshots: mh.snapshots.length,
      materials_unreadable_snapshots: mh.unreadable,
      device_snapshots: dh.snapshots.length,
    },
    known_limits: [
      `実機確認の台帳は ${DEVICE_LEDGER_SINCE} に始まった。それ以前の版の「記録なし」は欠落であって、確認しなかったことの証拠ではない`,
      'Apple の版の一覧は直近10版。それより古い版の asc は null',
      '審査提出（reviewSubmissions）は版を持たない応答なので版に紐づけない。件数は summary.review_submissions_in_window',
      'code は直前のタグからの差分。**TestFlight 止まりの版の差分も、次に並んだ版に含まれない**（版ごとに独立）',
      'AI 著者の定義は署名とトレーラーだけを見る。手元の環境から所有者の署名でコミットした変更は人側に数える（code-authorship と同じ限界）',
    ],
    rows,
  };
  doc.summary = summarize(doc);
  const subs = materials?._observed?.review_submissions ?? [];
  doc.summary.review_submissions_in_window = subs.filter((s) => { const d = jstDate(s.submitted_at); return d && d >= from && d <= at; }).length;
  fs.writeFileSync(LEDGER_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['summary が行の再計算と違えば落ちる', (d) => { d.summary.store_ready += 1; }],
  ['AI 分が合計を超えれば落ちる', (d) => { const r = d.rows.find((x) => x.code); r.code.commits_ai = r.code.commits_total + 1; }],
  ['版の順が崩れれば落ちる', (d) => { d.rows.reverse(); }],
  ['公開の観測が [上限, 下限] の逆なら落ちる', (d) => {
    const r = d.rows.find((x) => Array.isArray(x.store?.released_between));
    assert(r, '検体に released_between を持つ行が無い');
    r.store.released_between.reverse();
  }],
  ['実機確認の sha 判定が実際と違えば落ちる', (d) => {
    const r = d.rows.find((x) => x.device_verification);
    assert(r, '検体に実機確認の記録が無い');
    r.device_verification.sha_matches_tag = !r.device_verification.sha_matches_tag;
  }],
  ['READY でない版に公開の観測が付いていれば落ちる', (d) => {
    const r = d.rows.find((x) => !x.store);
    assert(r, '検体に store 無しの行が無い');
    r.store = { released_between: null, released_before: null, how: 'x' };
  }],
  ['数え方（method）を消せば落ちる', (d) => { delete d.method; }],
  ['台帳が古ければ落ちる', (d) => { d.measured_at = '2000-01-01'; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')),
  (d) => validate(d),
  SELFTEST_BREAKAGES,
);
// 台帳を読まない境界も固定する
SCENARIOS.push(['jstDate は +9h で日付を切る', () => {
  assert(jstDate('2026-08-28T22:34:07Z') === '2026-08-29', 'UTC 22:34 は JST の翌日');
  assert(jstDate('2026-08-29T08:53:53+09:00') === '2026-08-29', 'JST はそのまま');
  assert(jstDate('x') === null, '読めない時刻は null');
}]);
SCENARIOS.push(['版の並びは数値で比べる（5.7.10 > 5.7.9）', () => {
  assert(compareVersions('5.7.10', '5.7.9') > 0, '5.7.10 は 5.7.9 の後');
  assert(compareVersions('5.8.0', '5.7.11') > 0, '5.8.0 は 5.7.11 の後');
}]);
SCENARIOS.push(['公開の観測は READY 以外→READY の対で取る', () => {
  const snaps = [
    { at: '2026-08-28T10:00:00Z', doc: { _observed: { versions: [{ version: '9.9.9', state: 'WAITING_FOR_REVIEW' }] } } },
    { at: '2026-08-28T12:00:00Z', doc: { _observed: { versions: [{ version: '9.9.9', state: 'WAITING_FOR_REVIEW' }] } } },
    { at: '2026-08-28T22:00:00Z', doc: { _observed: { versions: [{ version: '9.9.9', state: READY }] } } },
    { at: '2026-08-29T22:00:00Z', doc: { _observed: { versions: [{ version: '9.9.9', state: READY }] } } },
  ];
  const o = storeObservations(snaps)['9.9.9'];
  assert(o.first_ready_at === '2026-08-28T22:00:00Z', '最初の READY');
  assert(o.last_not_ready_before_ready_at === '2026-08-28T12:00:00Z', 'その直前の非 READY');
}]);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(run(SCENARIOS) === 0 ? 0 : 1);
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
  if (argv.includes('--write')) {
    const doc = write({ from: arg('--from', DEFAULT_FROM), at: arg('--at', new Date().toISOString().slice(0, 10)) });
    console.log(render(doc));
    console.log(`\n台帳を書いた: data/app-releases.json（${doc.rows.length} 版）`);
    process.exit(0);
  }
  const doc = readLedger(LEDGER_PATH, { onMissing: null, why: 'Lane B の台帳' });
  if (!doc) { console.error('data/app-releases.json が無い — 3リポジトリの揃った場所で --write'); process.exit(1); }
  const problems = validate(doc);
  console.log(render(doc));
  if (argv.includes('--check')) {
    console.log('\n  **この検査は隣のリポジトリを読まない。**見るのは算数・形・鮮度だけ。数え直すときは --write。');
    if (problems.length) {
      console.error('\nLane B 台帳: 不整合');
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log('\nLane B 台帳の算数・形・鮮度に問題なし。');
  } else if (problems.length) {
    console.log('\n⚠ 不整合:');
    for (const p of problems) console.log(`  - ${p}`);
  }
}
