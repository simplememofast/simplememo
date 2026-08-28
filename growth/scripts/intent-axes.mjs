#!/usr/bin/env node
/**
 * **DL意図と課金意図を分けて見る。そして宣言が実測と食い違う面を出す。**
 *
 *   node growth/scripts/intent-axes.mjs           # 表示
 *   node growth/scripts/intent-axes.mjs --json
 *   node growth/scripts/intent-axes.mjs --check   # 矛盾があれば非0
 *   node growth/scripts/intent-axes.mjs --selftest
 *
 * 【なぜ要るか】
 * businessRelevance は「インストールにどれだけ近いか」の1次元しか無く、
 * **DLと課金を同じ数字で表していた。**Premium が売っているのは機能ではなく
 * 送信回数の上限（Free 1日3通 → 無制限）なので、課金するのは
 * 「毎日何度もキャプチャする人」だけである。**「無料のメモアプリを探している人」を
 * たくさん集めても、そこは増えない。**
 *
 * 【2軸目を足すこと自体の危険】
 * 手入力の重みを増やせば、**都合のよい物語をいくらでも作れる。**
 * だからこの道具の仕事は「2軸を並べること」ではなく、次の2つに絞ってある。
 *
 *   1. **食い違う面だけを出す。**2軸が一致している面では、2軸目は何も足していない。
 *      価値があるのは DL◎ かつ 課金△ のような、**片方だけを見ると判断を誤る面。**
 *   2. **宣言を実測で殴る。**課金意図を高く宣言した面が、実際には「無料」を含む
 *      クエリで出ているなら、その宣言は間違っている。--check はそれで落ちる。
 *
 * 【実測の限界を先に書く】
 * freeSeekingShare は **query-pages の可視分のみ**。GSC は下位クエリを匿名化して
 * 返さない（2026-08-24窓では表示の約64%が匿名化）。したがって
 * **0% は「無料狙いが無い」ではなく「可視スライスには無い」**。
 * この非対称ゆえに、--check は「高く宣言 × 実測が高い」だけを矛盾として扱い、
 * 「高く宣言 × 実測 0%」は矛盾に数えない。**片側だけが反証になる。**
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSnapshots, loadSnapshot, toPath,
  businessRelevance, monetizationRelevance, freeSeekingShare,
} from '../lib/gsc.mjs';

/** 宣言が実測に殴られたと呼ぶ線。可視スライスの3割が無料狙いなら、高い宣言は保てない。 */
export const CONTRADICTION_FREE_SHARE = 0.3;
/** 「課金意図が高い」と呼ぶ線。 */
export const HIGH = 0.7;
/** 「課金意図が低い」と呼ぶ線。 */
export const LOW = 0.2;
/** 無料狙いがこれ以下なら「無料狙いは見えていない」。 */
export const NEGLIGIBLE_FREE_SHARE = 0.02;
/** 2軸がこれだけ離れたら「食い違っている」と呼ぶ。 */
export const DIVERGENCE = 0.3;

const label = (v) => (v >= 0.9 ? '◎' : v >= 0.7 ? '○' : v >= 0.5 ? '△' : '×');

/**
 * ページごとに2軸と実測を並べる。**純関数**にしてあるので検体で試せる。
 *
 * `dl` / `pay` を差し替えられるのは、**判定の対称性を検体で固定するため。**
 * 実データには 課金 > DL の面が2つ（/apple-watch/ 系・差 0.1）しか無く、
 * DIVERGENCE には届かない。**つまり「片方向しか報告しない」壊し方を、
 * 実データでは踏めない。**踏めない壊し方は、検体で踏む。
 */
export function axes(snapshot, {
  minImpressions = 100, dl = businessRelevance, pay = monetizationRelevance,
} = {}) {
  const free = freeSeekingShare(snapshot.queryPages, { minImpressions });
  const rows = [];
  for (const r of snapshot.pages || []) {
    const p = toPath(r.page);
    const dlV = dl(p);
    const payV = pay(p);
    const f = free.get(p) || null;
    rows.push({
      page: p,
      clicks: r.clicks,
      impressions: r.impressions,
      dl: dlV,
      pay: payV,
      gap: dlV - payV,
      free_seeking_share: f ? f.share : null,
      free_seeking_impressions: f ? f.free : null,
    });
  }
  rows.sort((a, b) => b.impressions - a.impressions);

  // 食い違い: 2軸が DIVERGENCE 以上離れている面。**両向きとも出す。**
  const diverging = rows.filter((r) => Math.abs(r.gap) >= DIVERGENCE);

  // 矛盾: 課金意図を高く宣言したのに、可視クエリが無料狙いに寄っている面。
  const contradictions = rows.filter(
    (r) => r.pay >= HIGH && r.free_seeking_share != null && r.free_seeking_share >= CONTRADICTION_FREE_SHARE,
  );

  // **根拠が見えていない低い宣言。**「無料狙いだから低い」と書いた面のうち、
  // 可視クエリに無料狙いがほとんど出ていないもの。
  //
  // **これは反証ではない**（匿名化で見えていないだけかもしれない）。
  // 言えるのは「宣言の理由が、手元の実測には出ていない」までで、
  // だから --check では落とさない。**落とさないが、黙らせもしない** ——
  // 実測の裏づけがある低い宣言と、無い低い宣言を、同じ見た目にしない。
  const unsupported = rows.filter(
    (r) => r.pay <= LOW && r.free_seeking_share != null && r.free_seeking_share <= NEGLIGIBLE_FREE_SHARE,
  );

  return { label: snapshot.label, rows, diverging, contradictions, unsupported };
}

/** 結論に使えない状態を黙って通さない。 */
export function validate(a) {
  const problems = [];
  for (const r of a.contradictions) {
    problems.push(
      `${r.page}: 課金意図を ${r.pay} と宣言しているが、可視クエリの `
      + `${(100 * r.free_seeking_share).toFixed(1)}% が無料狙い`
      + ' — **宣言のほうを直す。**実測に合わせて重みを下げるか、下げない理由を書く',
    );
  }
  return problems;
}

const pct = (v) => (v == null ? '  —  ' : `${(100 * v).toFixed(1)}%`);
const width = (s) => [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
const padTo = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));

export function render(a) {
  const L = [];
  L.push(`DL意図 × 課金意図 — ${a.label}`);
  L.push('  課金意図は**宣言**（Free 1日3通 / Premium 無制限 から逆算した手入力）。');
  L.push('  無料狙い%は**実測**だが、query-pages の可視分のみ（下位クエリは匿名化されている）。');
  L.push('');
  L.push(`  ${padTo('2軸が食い違う面', 40)} 表示   DL   課金   無料狙い%`);
  if (!a.diverging.length) L.push('  （無し）');
  for (const r of a.diverging.slice(0, 12)) {
    L.push(`  ${padTo(r.page, 40)}${String(r.impressions).padStart(5)}  `
      + `${label(r.dl)} ${r.dl.toFixed(1)}  ${label(r.pay)} ${r.pay.toFixed(1)}   ${pct(r.free_seeking_share)}`);
  }
  L.push('');
  if (a.unsupported.length) {
    L.push('  **低い宣言のうち、無料狙いが可視クエリに出ていない面:**');
    for (const r of a.unsupported) {
      L.push(`    ${r.page} — 課金 ${r.pay} と宣言 / 無料狙い ${pct(r.free_seeking_share)}`
        + '（**反証ではない。**匿名化で見えていない可能性がある。ただし「無料狙いだから低い」とは言えない）');
    }
    L.push('');
  }
  if (a.contradictions.length) {
    L.push('  **宣言が実測と食い違っている面:**');
    for (const r of a.contradictions) {
      L.push(`    ${r.page} — 課金 ${r.pay} と宣言 / 無料狙い ${pct(r.free_seeking_share)}`);
    }
  } else {
    L.push('  宣言と実測の食い違いは無し（**ただし可視スライスの中での話**）。');
  }
  return L.join('\n');
}

// ── 自己テスト（**落ちることを確かめる**） ────────────────────────
function selftest() {
  const failures = []; let total = 0;
  const t = (name, ok) => { total += 1; if (!ok) failures.push(name); console.log(`${ok ? '  ok ' : '  NG '} ${name}`); };

  const P = (page, clicks, impressions) => ({ page, clicks, impressions, position: 5, ctr: 0 });
  const QP = (query, page, impressions) => ({ query, page, impressions, clicks: 0, position: 5, ctr: 0 });
  const snap = (pages, queryPages = []) => ({ label: 'T', meta: {}, pages, queryPages });

  t('2軸が一致している面は食い違いに出さない',
    axes(snap([P('/obsidian/', 5, 500)])).diverging.length === 0);
  t('**DLは高いが課金が低い面を拾う**（片方だけ見ると判断を誤る面）',
    axes(snap([P('/blog/free-memo-apps-ranking', 5, 500)])).diverging.length === 1);

  // 無料狙いの実測
  const withFree = snap([P('/obsidian/', 5, 500)],
    [QP('obsidian 無料', '/obsidian/', 400), QP('obsidian 音声入力', '/obsidian/', 100)]);
  const a1 = axes(withFree);
  t('無料狙いの割合を可視クエリから数える',
    Math.abs(a1.rows[0].free_seeking_share - 0.8) < 1e-9);
  t('**高く宣言した面が無料狙いなら矛盾として出す**', a1.contradictions.length === 1);
  t('矛盾は検査で問題になる', validate(a1).length === 1);

  // 反証は片側だけ
  const noFree = snap([P('/obsidian/', 5, 500)], [QP('obsidian 音声入力', '/obsidian/', 500)]);
  t('**実測 0% は矛盾に数えない**（匿名化で見えていないだけかもしれない）',
    axes(noFree).contradictions.length === 0);
  t('そのとき検査は何も言わない', validate(axes(noFree)).length === 0);

  // 低く宣言した面は、無料狙いでも矛盾ではない（宣言どおり）
  const lowDeclared = snap([P('/blog/free-memo-apps-ranking', 5, 500)],
    [QP('メモアプリ 無料', '/blog/free-memo-apps-ranking', 500)]);
  t('**低く宣言した面が無料狙いなのは矛盾ではない**（宣言が当たっている）',
    axes(lowDeclared).contradictions.length === 0);

  // 母数
  const thin = snap([P('/obsidian/', 1, 50)], [QP('obsidian 無料', '/obsidian/', 50)]);
  t('**母数が足りない面では割合を作らない**（1クエリで跳ねる）',
    axes(thin).rows[0].free_seeking_share === null);
  t('割合が無ければ矛盾にもしない', axes(thin).contradictions.length === 0);

  // 語の固定
  t('「無料」を拾う', axes(snap([P('/obsidian/', 1, 200)], [QP('メモ 無料', '/obsidian/', 200)])).rows[0].free_seeking_share === 1);
  t('**「free」を語の境界で拾う**（freelance を無料と読まない）',
    axes(snap([P('/obsidian/', 1, 200)], [QP('freelance memo', '/obsidian/', 200)])).rows[0].free_seeking_share === 0);

  // 根拠が見えていない低い宣言
  const lowNoFree = snap([P('/blog/best-memo-apps-2026', 5, 500)],
    [QP('メモアプリ おすすめ', '/blog/best-memo-apps-2026', 500)]);
  t('**低く宣言したのに無料狙いが見えない面を出す**（根拠が実測に無い）',
    axes(lowNoFree).unsupported.length === 1);
  t('**それは検査では落とさない**（匿名化と区別できない）', validate(axes(lowNoFree)).length === 0);
  t('無料狙いが実際に出ている低い宣言は「根拠なし」に入れない',
    axes(lowDeclared).unsupported.length === 0);
  t('実測が無い面は「根拠なし」に入れない（**測っていないと矛盾を混ぜない**）',
    axes(snap([P('/blog/best-memo-apps-2026', 5, 500)])).unsupported.length === 0);

  // **食い違いは両向きに出す。**実データでは 課金 > DL の差が 0.1 までしか無く、
  // この壊し方を実データでは踏めない。検体で踏む。
  const oneSided = snap([P('/x/', 1, 100)]);
  t('**課金 > DL の食い違いも出す**（片方向だけ報告しない）',
    axes(oneSided, { dl: () => 0.3, pay: () => 1.0 }).diverging.length === 1);
  t('DL > 課金 の食い違いも出す',
    axes(oneSided, { dl: () => 1.0, pay: () => 0.3 }).diverging.length === 1);
  t('差が小さければどちら向きでも出さない',
    axes(oneSided, { dl: () => 0.5, pay: () => 0.6 }).diverging.length === 0);

  const labels = listSnapshots();
  if (labels.length) {
    const a = axes(loadSnapshot(labels[labels.length - 1]));
    t('**実データで2軸が出る**', a.rows.length > 0);
    t('実データに食い違う面がある（**2軸目が何かを足している**）', a.diverging.length > 0);
  } else {
    t('**スナップショットが無い**', false);
  }

  if (failures.length) { console.log(`\nselftest: ${total}件中 ${failures.length}件 失敗 — ${failures.join(' / ')}`); return 1; }
  console.log(`\nselftest: 全${total}件 通過`);
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(selftest());
  const labels = listSnapshots();
  if (!labels.length) { console.error('スナップショットが無い'); process.exit(1); }
  const a = axes(loadSnapshot(labels[labels.length - 1]));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(a, null, 2)); process.exit(0); }
  console.log(render(a));
  const problems = validate(a);
  if (problems.length) {
    console.error('\n宣言と実測の矛盾:');
    for (const p of problems) console.error(`  - ${p}`);
    if (process.argv.includes('--check')) process.exit(1);
  }
}
