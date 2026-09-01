#!/usr/bin/env node
/**
 * 週次スナップショットを取る回かどうかを決める。**曜日だけでは決めない。**
 *
 *   node scripts/should-snapshot.mjs --decide            # CI: 判定を出す
 *   node scripts/should-snapshot.mjs --decide --manual true
 *   node scripts/should-snapshot.mjs --selftest          # 判定の自己検査
 *
 * 【なぜ要るか — 2026-09-01 に1週ぶん飛んだ】
 * `.github/workflows/seo-daily.yml` の週次段は長らく
 * **`[ "$(date -u +%u)" = "1" ]`（UTC月曜）** だけで開いていた。
 * cron は `0 21 * * *` で、**UTCの日境界の3時間前**に置いてある。
 *
 * GitHub の schedule は混雑すると遅れる。08-26 以降、実測で 2〜8 時間ずれている:
 *
 *     08-30 23:15Z (日)  遅延2h
 *     09-01 00:25Z (火)  遅延3h   ← 月曜21:00Z の回が**火曜に着地した**
 *
 * **その週の月曜UTCに1回も走らなかった。**門は一度も開かず、誰も落ちず、
 * ジョブは全部 success のまま週が終わった。実害は2つ出ている:
 *
 *     growth/data/gsc/ の最新ラベル … 2026-08-24（8日前）
 *     規約本文の指紋               … 11社ぜんぶ空（初着弾は 08-31 の予定だった）
 *
 * **遅延3時間で週次が消えるのは、cron と門の距離が3時間しかないから。**
 * 時刻をずらしても距離が縮むだけで、**遅延がその距離を超えれば同じことが起きる。**
 * だから曜日を捨て、**「前回から何日たったか」を併せて見る。**
 *
 * 【曜日を残した理由】置き換えずに足した。cron が時間どおりなら今までと
 * 同じ月曜に走る。**変えたのは「月曜を逃したとき」だけ**で、正常時の挙動は動かない。
 *
 * 【前回がいつかは、成果物そのものから読む】
 * `growth/data/gsc/<YYYY-MM-DD>/` はこの段が書くディレクトリで、**名前が日付**。
 * 別に管理表を持つと、管理表だけ進んで実体が無い状態を作れてしまう。
 *
 * 【読めなかったときは「取る」側へ倒す】
 * ラベルが1つも無い／日付として読めない回は **取る**。
 * このリポジトリが繰り返し踏んでいる「読めなかった＝異常なし」を持ち込まない。
 * 週次が1回余計に走る害は、**気づかずに消える害より小さい。**
 *
 * 【承知のうえで残す挙動】スナップショットのPRがマージされない間、main の
 * ラベルは古いままなので、**この段は毎日開き続ける**（BigQuery を毎日引く）。
 * 「マージされるまで諦めない」は挙動として正しく、PR作成側は既に
 * 開いているPRを二重に作らない。**止めるための仕掛けは足さない** ——
 * いま起きていないことのために門を増やすと、この台帳が禁じている
 * 「一度も発火しない検査」になる。起きたらジョブ要約に理由が毎日出る。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, run } from './lib/selftest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GSC_DIR = path.join(ROOT, 'growth/data/gsc');

/** 月曜を逃したと判断するまでの日数。**週次なので7。** */
export const CATCHUP_DAYS = 7;

const LABEL_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `growth/data/gsc/` の中でいちばん新しい日付ディレクトリ。無ければ null。 */
export function latestLabel(dir = GSC_DIR) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const labels = names.filter((n) => LABEL_RE.test(n)).sort();
  return labels.length ? labels[labels.length - 1] : null;
}

/** UTCの経過日数。読めない組み合わせは null（「不明」を 0 日にしない）。 */
export function ageInDays(lastLabel, todayUtc) {
  if (!LABEL_RE.test(String(lastLabel || ''))) return null;
  if (!LABEL_RE.test(String(todayUtc || ''))) return null;
  const a = Date.parse(`${lastLabel}T00:00:00Z`);
  const b = Date.parse(`${todayUtc}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * 判定の本体。**純関数**（ファイルも時計も見ない）。
 *
 * 順に見る:
 *   1. 手動 dispatch      … 曜日も日数も見ない
 *   2. 前回が読めない     … 取る（読めなかった＝取らなくてよい、にしない）
 *   3. UTC月曜            … 取る（従来どおりの周期）
 *   4. 前回から7日以上    … 取る（**月曜を逃した回はここで拾う**）
 *   5. それ以外           … 取らない
 */
export function decide({ manual = false, weekdayUtc, todayUtc, lastLabel = null } = {}) {
  if (manual === true || manual === 'true') {
    return { snapshot: true, ageDays: ageInDays(lastLabel, todayUtc), reason: '手動 dispatch。曜日も経過日数も見ずに取る。' };
  }
  const ageDays = ageInDays(lastLabel, todayUtc);
  if (ageDays === null) {
    return { snapshot: true, ageDays: null,
      reason: `前回のスナップショットが読めない（${JSON.stringify(lastLabel)}）。**読めなかったことを「取らなくてよい」と読まない**ので取る。` };
  }
  if (weekdayUtc === 1) {
    return { snapshot: true, ageDays, reason: `UTC月曜。通常の週次で取る（前回から ${ageDays} 日）。` };
  }
  if (ageDays >= CATCHUP_DAYS) {
    return { snapshot: true, ageDays,
      reason: `**月曜を逃していた。**前回から ${ageDays} 日たっているので、曜日に関係なく取る`
        + '（cron の遅延で月曜UTCに1回も走らなかった週がある。2026-08-31 が実例）。' };
  }
  return { snapshot: false, ageDays,
    reason: `月曜ではなく、前回から ${ageDays} 日（${CATCHUP_DAYS}日未満）。記録用スナップショットのコミットは行わない。` };
}

const SCENARIOS = [
  ['実際に飛んだ週を拾う（火曜・前回8日前）', () => {
    const r = decide({ weekdayUtc: 2, todayUtc: '2026-09-01', lastLabel: '2026-08-24' });
    assert(r.snapshot === true, '拾えていない');
    assert(r.ageDays === 8, `経過日数が違う: ${r.ageDays}`);
  }],
  ['同じ火曜でも、前回が最近なら取らない', () => {
    const r = decide({ weekdayUtc: 2, todayUtc: '2026-09-01', lastLabel: '2026-08-30' });
    assert(r.snapshot === false, '毎日取ってしまう');
  }],
  ['月曜は従来どおり取る', () => {
    assert(decide({ weekdayUtc: 1, todayUtc: '2026-08-24', lastLabel: '2026-08-17' }).snapshot === true, '月曜が閉じている');
  }],
  ['月曜は、前回が昨日でも取る（従来の挙動を変えていない）', () => {
    assert(decide({ weekdayUtc: 1, todayUtc: '2026-08-24', lastLabel: '2026-08-23' }).snapshot === true, '月曜の挙動が変わっている');
  }],
  ['境界: ちょうど7日は取る', () => {
    assert(decide({ weekdayUtc: 3, todayUtc: '2026-09-01', lastLabel: '2026-08-25' }).snapshot === true, '7日で開いていない');
  }],
  ['境界: 6日は取らない', () => {
    assert(decide({ weekdayUtc: 3, todayUtc: '2026-09-01', lastLabel: '2026-08-26' }).snapshot === false, '6日で開いている');
  }],
  ['ラベルが1つも無ければ取る（読めなかった＝異常なし、にしない）', () => {
    assert(decide({ weekdayUtc: 3, todayUtc: '2026-09-01', lastLabel: null }).snapshot === true, '一度も取らないまま黙る');
  }],
  ['日付として読めないラベルでも取る', () => {
    assert(decide({ weekdayUtc: 3, todayUtc: '2026-09-01', lastLabel: 'latest' }).snapshot === true, '壊れた名前で黙る');
  }],
  ['未来のラベルでは経過日数で開かない（が月曜なら開く）', () => {
    assert(decide({ weekdayUtc: 3, todayUtc: '2026-09-01', lastLabel: '2026-09-20' }).snapshot === false, '負の経過で開いている');
    assert(decide({ weekdayUtc: 1, todayUtc: '2026-09-01', lastLabel: '2026-09-20' }).snapshot === true, '月曜が閉じている');
  }],
  ['手動は曜日も日数も見ない', () => {
    assert(decide({ manual: 'true', weekdayUtc: 3, todayUtc: '2026-09-01', lastLabel: '2026-08-31' }).snapshot === true, '手動が効かない');
  }],
  ['ageInDays は不明を 0 日にしない', () => {
    assert(ageInDays(null, '2026-09-01') === null, 'null が 0 日になっている');
    assert(ageInDays('2026-08-25', 'いつか') === null, '壊れた today が 0 日になっている');
  }],
  ['latestLabel は日付でない名前を拾わない', () => {
    const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'snapshot-'));
    fs.mkdirSync(path.join(dir, '2026-08-24'));
    fs.mkdirSync(path.join(dir, '2026-08-11'));
    fs.mkdirSync(path.join(dir, 'README'));
    assert(latestLabel(dir) === '2026-08-24', `拾い間違い: ${latestLabel(dir)}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }],
  ['latestLabel はディレクトリが無くても落ちない', () => {
    assert(latestLabel(path.join(ROOT, 'そんなディレクトリは無い')) === null, '例外か誤った値');
  }],
  ['実データで走る（growth/data/gsc が読めること自体の確認）', () => {
    const l = latestLabel();
    assert(l === null || LABEL_RE.test(l), `実データのラベルが日付でない: ${l}`);
  }],
];

// **import した側で走らせない。**export しているので、ガードの外に
// process.exit() があると `import` するだけで黙って終了する
// （scripts/check-module-entry.mjs が実際にこれを捕まえた）。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);

  if (argv.includes('--selftest')) {
    process.exit(run(SCENARIOS, { label: 'should-snapshot 自己テスト' }) ? 1 : 0);
  } else if (argv.includes('--decide')) {
    const mi = argv.indexOf('--manual');
    const manual = mi >= 0 ? argv[mi + 1] : 'false';
    const now = new Date();
    const todayUtc = now.toISOString().slice(0, 10);
    // JS の getUTCDay() は日曜=0。`date -u +%u` は月曜=1・日曜=7 なので合わせる。
    const weekdayUtc = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
    const r = decide({ manual, weekdayUtc, todayUtc, lastLabel: latestLabel() });
    console.log(`snapshot=${r.snapshot}`);
    console.log(r.reason);
    process.exit(0);
  } else {
    console.error('使い方: --decide [--manual true] | --selftest');
    process.exit(2);
  }
}
