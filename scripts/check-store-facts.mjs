#!/usr/bin/env node
/**
 * App Store 由来の公開表示（評価・バージョン）が古くなっていないか。
 *
 *   node scripts/check-store-facts.mjs --check      # CI（ネットに触らない）
 *   node scripts/check-store-facts.mjs --net        # 実物と突き合わせる
 *   node scripts/check-store-facts.mjs --net --write # 差分を台帳へ書く
 *
 * 【なぜ作るか】
 * `data/site-constants.json` の `ratingValue` / `ratingCount` は
 * **JSON-LD の aggregateRating として12ページに出ている公開表示**で、
 * `appVersion` も同じくサイトに出る。ところがどちらも
 * **人が App Store Connect を見て手で書いた値**だった。
 *
 * 台帳のメモにはこう書いてある:
 *   「NOT machine-verified: エージェントのサンドボックスはプロキシ越しで、
 *     itunes.apple.com への CONNECT が拒否されるため再確認できなかった」
 *
 * つまり**古くなっても誰も気づかない。**評価の集計はGoogleのポリシー上も
 * 実体のある値であることが要る表示で、「更新を忘れていた」は理由にならない。
 *
 * 【2段構えにする理由】
 * - `--check` … **ネットに触らない。**見るのは「いつ確認したか」だけ。
 *   PRのたびに外部APIを叩くと、向こうの不調でCIが赤くなり、
 *   やがて無視されるようになる（`check-benchmark` を報告のみにしたのと同じ理由）。
 * - `--net` … 実物を取りに行く。**日次のワークフローで回す。**
 *   GitHub のランナーは itunes.apple.com に到達できる（サンドボックスと違う）。
 *
 * 【この検査が保証しないこと】
 * iTunes Lookup API が返すのは**そのストアフロントの集計**で、
 * App Store Connect の全世界集計とは一致しないことがある。
 * ここが見ているのは「サイトの表示が実物からずれていないか」であって、
 * どちらが正しいかではない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS = path.join(ROOT, 'data/site-constants.json');
const APP_ID = '6758438948';

/** 公開表示が「いつ確認されたか」の上限。超えたら落とす。 */
export const MAX_AGE_DAYS = 45;
/**
 * 価格の上限。評価より長い —— 価格は滅多に変わらないので、
 * 45日で落とすと**確認していないのに確認したことにする圧力**になる。
 * ただし無期限にはしない: Apple は為替に応じて日本円の価格帯を調整することがあり、
 * そのときサイトだけが古い価格を出し続ける。
 */
export const PRICE_MAX_AGE_DAYS = 180;

const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/g;

/** メモ文から**最も新しい**日付を取る（過去の経緯も書かれているため）。 */
export function latestDate(note) {
  if (!note) return null;
  const all = [...String(note).matchAll(DATE_RE)].map((m) => m[0]).sort();
  return all.length ? all[all.length - 1] : null;
}

export function ageDays(iso, today = new Date()) {
  if (!iso) return null;
  return Math.floor((today - new Date(`${iso}T00:00:00Z`)) / 86_400_000);
}

/** ネットに触らない検査。**見るのは鮮度と形だけ。** */
export function validateOffline(doc, today = new Date()) {
  const problems = [];
  const rows = [];
  const fields = [
    { value: 'ratingValue', note: 'ratingNote', label: '評価（aggregateRating）', maxAge: MAX_AGE_DAYS },
    { value: 'ratingCount', note: 'ratingNote', label: '評価件数', maxAge: MAX_AGE_DAYS },
    { value: 'appVersion', note: 'appVersionNote', label: '公開バージョン', maxAge: MAX_AGE_DAYS },
    // 価格は滅多に変わらないので窓が長い。**変わらないことと、確認していることは別。**
    // Apple は為替に応じて日本円の価格帯を調整することがあり、そのとき
    // サイトだけが古い価格を出し続ける。景表法の観点で一番高くつく表示。
    { value: 'priceMonthlyJpy', note: 'priceNote', label: '月額（円）', maxAge: PRICE_MAX_AGE_DAYS },
    { value: 'priceYearlyJpy', note: 'priceNote', label: '年額（円）', maxAge: PRICE_MAX_AGE_DAYS },
    { value: 'priceMonthlyUsd', note: 'priceNote', label: '月額（USD）', maxAge: PRICE_MAX_AGE_DAYS },
    { value: 'priceYearlyUsd', note: 'priceNote', label: '年額（USD）', maxAge: PRICE_MAX_AGE_DAYS },
  ];
  for (const f of fields) {
    if (doc[f.value] === undefined) { problems.push(`${f.value} が無い`); continue; }
    const when = latestDate(doc[f.note]);
    const age = ageDays(when, today);
    rows.push({ label: f.label, value: doc[f.value], when, age });
    if (!when) {
      problems.push(`${f.note} に確認日が無い — **古くなっても気づけない**`);
      continue;
    }
    if (age > f.maxAge) {
      problems.push(`${f.label} は ${when} 以降そのまま（${age}日前・上限 ${f.maxAge}日）`
        + ' — **公開している表示なので、確認していない値を出し続けない。**'
        + '`node scripts/check-store-facts.mjs --net` で確認して台帳を更新する');
    }
  }
  // 【価格の筋が通っているか】年額が月額×12以上なら、年額を選ぶ理由が無い。
  // 数字の打ち間違いはこの形で出るので、公開前に落とす。
  const num = (v) => Number(String(v ?? '').replace(/[,\s]/g, ''));
  for (const [m, y, cur] of [['priceMonthlyJpy', 'priceYearlyJpy', 'JPY'],
    ['priceMonthlyUsd', 'priceYearlyUsd', 'USD']]) {
    const mv = num(doc[m]); const yv = num(doc[y]);
    if (!Number.isFinite(mv) || !Number.isFinite(yv) || mv <= 0 || yv <= 0) {
      problems.push(`${cur} の価格が数値として読めない（${doc[m]} / ${doc[y]}）`);
      continue;
    }
    if (yv >= mv * 12) {
      problems.push(`${cur}: 年額 ${yv} が月額 ${mv} の12倍以上`
        + ' — **年額を選ぶ理由が無い価格になっている。**打ち間違いを疑う');
    }
  }

  // 数として成立しているか
  const rv = Number(doc.ratingValue);
  const rc = Number(doc.ratingCount);
  if (!(rv >= 0 && rv <= 5)) problems.push(`ratingValue が 0〜5 でない（${doc.ratingValue}）`);
  if (!(Number.isInteger(rc) && rc >= 0)) problems.push(`ratingCount が非負整数でない（${doc.ratingCount}）`);
  // **件数ゼロで平均を出さない。**実体の無い集計評価は出してはいけない表示。
  if (rc === 0 && rv > 0) {
    problems.push('ratingCount が 0 なのに ratingValue が出ている'
      + ' — **実体の無い集計評価を公開しない**');
  }
  return { problems, rows };
}

async function fetchStore(country = 'jp') {
  const url = `https://itunes.apple.com/lookup?id=${APP_ID}&country=${country}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.results?.[0];
  if (!r) throw new Error('results が空 — アプリが見つからない');
  return {
    ratingValue: r.averageUserRating,
    ratingCount: r.userRatingCount,
    appVersion: r.version,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const doc = JSON.parse(fs.readFileSync(CONSTANTS, 'utf8'));
  const { problems, rows } = validateOffline(doc);

  console.log('App Store 由来の公開表示 — **確認していない値を出し続けない**\n');
  console.log('  「記載」はメモに書かれた日付。**確認日とは限らない**'
    + '（価格は設定日しか分かっていない）。\n');
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(24)} ${String(r.value).padEnd(8)}`
      + ` 記載 ${r.when ?? '**日付なし**'}${r.age === null ? '' : `（${r.age}日前）`}`);
  }

  if (process.argv.includes('--net')) {
    console.log('\n  実物を取りに行く（GitHub のランナーからは到達できる。'
      + 'エージェントのサンドボックスからはプロキシが CONNECT を拒否する）…');
    let live;
    try {
      live = await fetchStore();
    } catch (e) {
      // **取れなかったことを「一致」と書かない。**
      console.error(`  取得できなかった: ${e.message}`);
      console.error('  **これは「ずれていない」ではない。**取得できなかった、という結果。');
      process.exit(process.argv.includes('--strict') ? 1 : 0);
    }
    const drift = [];
    if (String(doc.ratingValue) !== String(live.ratingValue)) {
      drift.push(`ratingValue ${doc.ratingValue} → ${live.ratingValue}`);
    }
    if (String(doc.ratingCount) !== String(live.ratingCount)) {
      drift.push(`ratingCount ${doc.ratingCount} → ${live.ratingCount}`);
    }
    if (String(doc.appVersion) !== String(live.appVersion)) {
      drift.push(`appVersion ${doc.appVersion} → ${live.appVersion}`);
    }
    console.log(`  実物: 評価 ${live.ratingValue} / ${live.ratingCount}件 / v${live.appVersion}`);
    if (!drift.length) {
      console.log('  **ずれなし。**');
    } else {
      console.log('  ずれ:');
      for (const d of drift) console.log(`    - ${d}`);
      if (process.argv.includes('--write')) {
        const today = new Date().toISOString().slice(0, 10);
        doc.ratingValue = String(live.ratingValue);
        doc.ratingCount = String(live.ratingCount);
        doc.appVersion = String(live.appVersion);
        doc.ratingNote = `Machine-verified from iTunes Lookup (jp) on ${today}. `
          + `${doc.ratingNote || ''}`.slice(0, 900);
        doc.appVersionNote = `Machine-verified from iTunes Lookup (jp) on ${today}. `
          + `${doc.appVersionNote || ''}`.slice(0, 900);
        fs.writeFileSync(CONSTANTS, `${JSON.stringify(doc, null, 2)}\n`);
        console.log('  台帳を更新した。**`node scripts/sync_constants.js --write` で'
          + 'ページのJSON-LDへ反映すること。**');
      } else {
        console.log('  --write で台帳を更新する（そのあと sync_constants.js --write）。');
      }
    }
  } else {
    console.log('\n  **ここはネットに触らない。**見るのは「いつ確認したか」だけ。');
    console.log('  PRのたびに外部APIを叩くと、向こうの不調でCIが赤くなり、やがて無視される。');
    console.log('  実物との突き合わせは --net（日次のワークフローで回す）。');
  }

  if (problems.length) {
    console.error('\n公開表示: 問題');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) console.log('\n公開表示の鮮度と形に問題なし。');
}
