/**
 * マーケ施策の stop-loss — **評価日を待たずに「戻す」判断だけを機械が出す。**
 *
 * 【なぜ要るか】
 * 開発側には既に stop-loss がある（simplememo-api の rollout-guard.ts の kill、
 * Crash-free率・送信成功率による自動停止）。**マーケ側だけ無かった。**
 * experiments.json は評価日と判定を持つが、
 * **「悪化したら評価日を待たずに戻す」条件を持っていない。**
 *
 * つまり 2026-07-01 に変えたタイトルが CTR を半分にしていても、
 * **7/29 の評価日まで誰も止めない。**実際に 2026-07-01/02 の7件は
 * 6週間そのまま放置され、しかも基準値未記録で最後まで判定できなかった。
 *
 * 【rollout-guard と同じ非対称にしてある（ここが設計の要）】
 *
 *   revert   … **自律実行してよい。**元の文言に戻すだけで、可逆で安全な方向
 *   expand   … **承認が要る。**露出を広げる方向は、広げてから戻しても
 *              「見た人が見なかったことにはならない」
 *
 * この関数は **expand を返さない。**返すのは revert / continue / hold の3つだけ。
 * 「効いているから他ページへ展開しよう」は人が決める。
 *
 * 【測れないときは判定しない】
 * サンプル不足・基準値なし・スナップショット欠落は **hold** を返す。
 * **「判定していない」を「異常なし」と書かない**（rollout-guard と同じ規律）。
 */

/** 両側95%の z。simplememo-api/src/stats.ts と同じ値を使う。 */
const Z_95 = 1.959963984540054;

/**
 * Wilson score interval。**正規近似（k/n ± z·√…）は使わない** —— CTR のような
 * 小さい p と小さい n では区間が [負, 正] にまたがって無意味になる。
 *
 * simplememo-api/src/stats.ts の wilson95 と同じ式。**なぜ共有しないか**:
 * あちらは Workers 上の TypeScript で、こちらは Node の素の mjs。
 * ビルド経路を跨いで1関数を共有するために依存を足すより、
 * **20行を写して「同じ式であること」をテストで固定する**ほうが壊れにくい
 * （growth/lib/stoploss.test の `wilson95 は api 側と同じ値を返す`）。
 */
export function wilson95(k, n, z = Z_95) {
  if (!Number.isFinite(k) || !Number.isFinite(n)) return null;
  if (n <= 0 || k < 0 || k > n) return null;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  // **端は式ではなく定義で置く**（api 側と同じ理由）。k=0 の下限と k=n の上限は
  // 数学的にちょうど 0 / 1 だが、浮動小数では 2.8e-17 のような塵が残り、
  // 「下限は 0 か」を === で確かめられなくなる。
  return {
    lo: k === 0 ? 0 : Math.max(0, center - half),
    hi: k === n ? 1 : Math.min(1, center + half),
  };
}

/**
 * 既定の停止条件。**数値ではなく「何を守るか」で決めてある。**
 *
 * min_impressions: 表示が少ないうちは CTR が跳ねる。1クリックで 0%→10% になる
 *   ような母数で「悪化した」と言わない。GSC の28日窓で 200 は、
 *   この規模のサイトだと下位ページでも1か月あれば届く水準。
 * require_disjoint: 基準と現在の95%区間が**重なっていないこと**を要求する。
 *   点推定の比較（3.0% → 2.4% だから悪化）は、この母数では簡単に嘘になる。
 * min_relative_drop: 統計的に有意でも、**実害の無い差で戻さない。**
 *   区間が離れていても相対20%未満の低下なら continue にする。
 */
export const DEFAULT_RULES = {
  min_impressions: 200,
  require_disjoint: true,
  min_relative_drop: 0.20,
};

export const ACTIONS = ['revert', 'continue', 'hold'];

/**
 * 1件の実験について、いま戻すべきかを判定する。
 *
 * @param baseline {{clicks:number, impressions:number}|null} 変更前
 * @param current  {{clicks:number, impressions:number}|null} 現在
 * @returns {{action:'revert'|'continue'|'hold', reason:string, evidence:object}}
 */
export function evaluate(baseline, current, rules = DEFAULT_RULES) {
  const usable = (x) => x && Number.isFinite(x.clicks) && Number.isFinite(x.impressions) && x.impressions > 0;

  if (!usable(baseline)) {
    return { action: 'hold', reason: '基準値が無い（**測っていないので、悪化しているかどうかも言えない**）', evidence: {} };
  }
  if (!usable(current)) {
    return { action: 'hold', reason: '現在値が取れない（スナップショット欠落。**「変化なし」ではない**）', evidence: {} };
  }
  if (baseline.impressions < rules.min_impressions || current.impressions < rules.min_impressions) {
    return {
      action: 'hold',
      reason: `表示が少ない（基準 ${baseline.impressions} / 現在 ${current.impressions}、下限 ${rules.min_impressions}）`
        + ' — **この母数では CTR が1クリックで跳ねる**ので判定しない',
      evidence: { baseline_impressions: baseline.impressions, current_impressions: current.impressions },
    };
  }

  const b = wilson95(baseline.clicks, baseline.impressions);
  const c = wilson95(current.clicks, current.impressions);
  if (!b || !c) return { action: 'hold', reason: '区間を計算できない', evidence: {} };

  const bp = baseline.clicks / baseline.impressions;
  const cp = current.clicks / current.impressions;
  const relDrop = bp > 0 ? (bp - cp) / bp : 0;
  const disjoint = c.hi < b.lo; // 現在の上限が基準の下限より下＝有意に低い
  const evidence = {
    baseline_ctr: bp, current_ctr: cp, relative_drop: relDrop,
    baseline_ci: b, current_ci: c, disjoint,
  };

  if (cp >= bp) return { action: 'continue', reason: '低下していない', evidence };
  if (rules.require_disjoint && !disjoint) {
    return {
      action: 'hold',
      reason: `低下しているが95%区間が重なる（基準 ${(bp * 100).toFixed(2)}% [${(b.lo * 100).toFixed(2)}–${(b.hi * 100).toFixed(2)}]`
        + ` / 現在 ${(cp * 100).toFixed(2)}% [${(c.lo * 100).toFixed(2)}–${(c.hi * 100).toFixed(2)}]）`
        + ' — **点推定の差だけで戻さない**',
      evidence,
    };
  }
  if (relDrop < rules.min_relative_drop) {
    return {
      action: 'continue',
      reason: `有意に低いが相対 ${(relDrop * 100).toFixed(1)}% の低下（下限 ${(rules.min_relative_drop * 100)}%）`
        + ' — **有意と実害は別**',
      evidence,
    };
  }
  return {
    action: 'revert',
    reason: `CTR が ${(bp * 100).toFixed(2)}% → ${(cp * 100).toFixed(2)}%（相対 ${(relDrop * 100).toFixed(1)}% 低下）で、95%区間が重ならない`,
    evidence,
  };
}

/**
 * **この関数は expand を返さない。**呼び出し側がそれに依存してよいことを、
 * 明示的に固定しておく（権限表の非対称をコードで表す）。
 */
export function isAutonomous(action) {
  return action === 'revert';
}
