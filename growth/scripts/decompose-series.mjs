#!/usr/bin/env node
/**
 * 系列から曜日効果と既知の外部要因を分離する。
 *
 *   node growth/scripts/decompose-series.mjs           # 表示
 *   node growth/scripts/decompose-series.mjs --check    # CI
 *
 * 【なぜ要るか】
 * 「8/18の山（当日送信者2.8倍）がPR起点かアプリ配信起点か」の切り分けに
 * 半日かかった、という記録が annotations.json の冒頭にある。台帳は作られたが、
 * **突き合わせは人がやっていた。**
 *
 * ここでやるのは3つ。
 *   1. 曜日効果を出す（土日に落ちるのは季節性であって異変ではない）
 *   2. 曜日で説明できない外れ値を出す
 *   3. その外れ値が annotations.json の配信・リリースと同じ日か見る
 *
 * **説明できた山を「効果があった」と言わない。**PR配信日に伸びたことは
 * 相関であって、PRが原因だという証明ではない。ここが出すのは
 * **「説明がつく／つかない」の仕分けだけ**で、因果は主張しない。
 *
 * 【母数が小さいことを隠さない】
 * 1日あたりのクリックが数十件の系列で、中央値比2倍は珍しくない。
 * **観測が28日に満たない系列では、外れ値の判定そのものをしない。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const GSC_DIR = path.join(ROOT, 'growth/data/gsc');
export const ANNOTATIONS_PATH = path.join(ROOT, 'growth/data/annotations.json');
/** これ未満の観測数では外れ値の判定をしない。ノイズフロアと同じ規律。 */
export const MIN_DAYS = 28;
/** 曜日効果を除いたあと、中央値のこの倍を超えたら外れ値候補。 */
export const OUTLIER_RATIO = 2.0;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 曜日ごとの係数（全体中央値に対する比）。**平均ではなく中央値**で出す。 */
export function weekdayFactors(rows, key = 'clicks') {
  const overall = median(rows.map((r) => r[key]));
  const byDow = {};
  for (const r of rows) {
    const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    (byDow[dow] ||= []).push(r[key]);
  }
  const factors = {};
  for (const [dow, xs] of Object.entries(byDow)) {
    factors[dow] = overall ? median(xs) / overall : null;
  }
  return { overall, factors };
}

/** 曜日効果を除いた残差から外れ値を拾う。 */
export function outliers(rows, key = 'clicks') {
  if (rows.length < MIN_DAYS) {
    return { judged: false, reason: `観測 ${rows.length} 日 < ${MIN_DAYS} 日。**判定していない（異常なしではない）**`, items: [] };
  }
  const { overall, factors } = weekdayFactors(rows, key);
  const adjusted = rows.map((r) => {
    const dow = new Date(`${r.date}T00:00:00Z`).getUTCDay();
    const f = factors[dow] || 1;
    return { ...r, adjusted: f > 0 ? r[key] / f : r[key] };
  });
  const base = median(adjusted.map((r) => r.adjusted));
  // **0 を基準に比は作れない。**全期間0クリックの系列で `base > 0` を
  // 満たさないまま items を空にすると、`judged: true` のまま「外れ値なし」を出す。
  // それは「見た結果なにも無かった」ではなく「見られなかった」。
  if (!(base > 0)) {
    return {
      judged: false,
      reason: `基準（曜日調整後の中央値）が ${base} — **比を作れないので判定していない。**`
        + '全期間0の系列は「異常なし」ではなく「この方法では読めない」',
      items: [],
    };
  }
  const items = adjusted
    .filter((r) => base > 0 && (r.adjusted / base >= OUTLIER_RATIO || r.adjusted / base <= 1 / OUTLIER_RATIO))
    .map((r) => ({
      date: r.date, value: r[key], adjusted: Number(r.adjusted.toFixed(1)),
      ratio: Number((r.adjusted / base).toFixed(2)),
      direction: r.adjusted > base ? 'up' : 'down',
    }));
  return { judged: true, overall, base, factors, items };
}

export function explain(items, annotations) {
  const byDate = new Map();
  for (const a of annotations) byDate.set(a.date, a);
  return items.map((o) => {
    // 配信・リリースは当日と翌日に効きうるので前日も見る
    const prev = new Date(`${o.date}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const hit = byDate.get(o.date) || byDate.get(prev.toISOString().slice(0, 10));
    return { ...o, annotation: hit ? { date: hit.date, type: hit.type, label: hit.label.slice(0, 60) } : null };
  });
}

function latestSnapshot() {
  if (!fs.existsSync(GSC_DIR)) return null;
  const labels = fs.readdirSync(GSC_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!labels.length) return null;
  const f = path.join(GSC_DIR, labels[labels.length - 1], 'dates.json');
  if (!fs.existsSync(f)) return null;
  return { label: labels[labels.length - 1], rows: JSON.parse(fs.readFileSync(f, 'utf8')) };
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
//
// この道具が守っているのは **「判定していない」と「異常なし」を分ける**こと。
// 母数が足りない系列に判定を出すと、数十件の系列で中央値比2倍という
// 珍しくもない揺れが「異変」になる。
if (process.argv.includes('--selftest')) {
  /** n日ぶんの系列。fn(i) でその日のクリック数を決める。 */
  const series = (n, fn) => Array.from({ length: n }, (_, i) => {
    const d = new Date('2026-01-01T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), clicks: fn(i) };
  });

  const SCENARIOS = [
    ['**28日未満は判定しない**（異常なしではない）', () => {
      const r = outliers(series(27, () => 10));
      if (r.judged) throw new Error('母数不足で判定を出した');
      if (!r.reason.includes('判定していない')) throw new Error(`理由が違う: ${r.reason}`);
      if (r.items.length) throw new Error('判定していないのに外れ値を出した');
    }],
    ['28日あれば判定する（**常に判定しないのは、判定できないのと同じ**）', () => {
      if (!outliers(series(28, () => 10)).judged) throw new Error('母数が足りても判定しない');
    }],
    ['**全期間0の系列は判定しない**（0を基準に比は作れない）', () => {
      const r = outliers(series(28, () => 0));
      if (r.judged) throw new Error('**「異常なし」として通した**——見られなかっただけ');
      if (!r.reason.includes('比を作れない')) throw new Error(`理由が違う: ${r.reason}`);
    }],
    ['平坦な系列に外れ値は出ない（偽陽性を作らない）', () => {
      const r = outliers(series(28, () => 10));
      if (r.items.length) throw new Error(`平坦なのに ${r.items.length} 件`);
    }],
    ['**跳ねた日は外れ値になる**（上向き）', () => {
      const r = outliers(series(28, (i) => (i === 14 ? 100 : 10)));
      const hit = r.items.find((x) => x.direction === 'up');
      if (!hit) throw new Error('跳ねた日を拾わなかった');
      if (hit.value !== 100) throw new Error(`値が違う: ${hit.value}`);
    }],
    ['**落ちた日も外れ値になる**（下向きを見落とさない）', () => {
      const r = outliers(series(28, (i) => (i === 14 ? 1 : 20)));
      if (!r.items.some((x) => x.direction === 'down')) throw new Error('落ちた日を拾わなかった');
    }],
    ['**曜日効果は外れ値にしない**（土日に落ちるのは季節性）', () => {
      // 日曜(0)と土曜(6)だけ半分。毎週同じなので、これは異変ではない。
      const r = outliers(series(56, (i) => {
        const d = new Date('2026-01-01T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + i);
        const dow = d.getUTCDay();
        return dow === 0 || dow === 6 ? 10 : 20;
      }));
      if (r.items.length) throw new Error(`曜日効果を異変にした: ${JSON.stringify(r.items)}`);
    }],
    ['曜日係数が中央値で出ている（平均だと1日の跳ねで歪む）', () => {
      const rows = series(28, (i) => (i === 0 ? 1000 : 10));
      const { overall } = weekdayFactors(rows);
      if (overall !== 10) throw new Error(`中央値が ${overall}（平均なら 45 付近になる）`);
    }],
    ['**外れ値と同じ日の注記を結びつける**（説明がつくかの仕分け）', () => {
      const items = [{ date: '2026-08-18', value: 100, adjusted: 100, ratio: 3, direction: 'up' }];
      const out = explain(items, [{ date: '2026-08-18', type: 'pr', label: '配信' }]);
      if (!out[0].annotation) throw new Error('同日の注記を結びつけなかった');
    }],
    ['前日の注記も結びつける（配信は翌日に効きうる）', () => {
      const items = [{ date: '2026-08-18', value: 100, adjusted: 100, ratio: 3, direction: 'up' }];
      const out = explain(items, [{ date: '2026-08-17', type: 'release', label: '配信' }]);
      if (!out[0].annotation) throw new Error('前日の注記を結びつけなかった');
    }],
    ['**関係ない日の注記は結びつけない**（説明がついたことにしない）', () => {
      const items = [{ date: '2026-08-18', value: 100, adjusted: 100, ratio: 3, direction: 'up' }];
      const out = explain(items, [{ date: '2026-01-01', type: 'pr', label: '別の日' }]);
      if (out[0].annotation) throw new Error('無関係な注記を結びつけた（**因果を作っている**）');
    }],
    ['実データで例外なく走る', () => {
      const snap = latestSnapshot();
      if (!snap) return;
      outliers(snap.rows);
    }],
  ];
  let failed = 0;
  for (const [name, fn] of SCENARIOS) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${SCENARIOS.length} 件中 ${failed} 件失敗`);
  process.exit(failed === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const snap = latestSnapshot();
  const annotations = JSON.parse(fs.readFileSync(ANNOTATIONS_PATH, 'utf8')).annotations || [];
  if (!snap) {
    console.log('系列が無い（GSCスナップショット未取得）。');
    process.exit(process.argv.includes('--check') ? 0 : 0);
  }
  const res = outliers(snap.rows);
  console.log(`系列の分解 — ${snap.label}（${snap.rows.length}日）\n`);
  if (!res.judged) {
    console.log(`  ${res.reason}`);
    if (process.argv.includes('--check')) console.log('\n  判定できないことを判定したことにしない。');
    process.exit(0);
  }
  const names = ['日', '月', '火', '水', '木', '金', '土'];
  console.log('  曜日効果（全体中央値に対する比）:');
  for (let d = 0; d < 7; d++) {
    const f = res.factors[d];
    console.log(`    ${names[d]}  ${f === undefined || f === null ? '—' : f.toFixed(2)}`);
  }
  const explained = explain(res.items, annotations);
  console.log(`\n  曜日で説明できない日 ${explained.length}件:`);
  if (!explained.length) console.log('    なし。**この期間の動きは曜日効果の範囲。**');
  for (const o of explained) {
    console.log(`    ${o.date}  ${o.direction === 'up' ? '↑' : '↓'} ${o.value}（曜日調整後 ${o.adjusted} / 中央値比 ${o.ratio}）`);
    console.log(`      ${o.annotation ? `→ ${o.annotation.type}: ${o.annotation.label}` : '**外部要因の記録なし。**理由が分かったら annotations.json に足す'}`);
  }
  console.log('\n  **説明がついた山を「効果があった」と読まない。**同じ日に配信があったことは');
  console.log('  相関であって、配信が原因だという証明ではない。ここが出すのは仕分けだけ。');
  if (process.argv.includes('--check')) console.log('\n  分解できた。');
}
