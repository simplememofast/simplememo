/**
 * JST の暦日（YYYY-MM-DD）。autopilot-gate / check-landing-freshness /
 * ep-ratify / check-pr-release-ledger が同じ定義を別々に持っていたものを
 * 寄せた（2026-09-25・値は不変）。各ファイルは従来どおり todayJst を
 * 公開し続ける（再輸出）ので、import しているスクリプトはそのまま。
 *
 * **autonomy-score.mjs と autonomy-eligibility.mjs の同じ定義はここへ
 * 寄せていない。**あの2本は check-definitions.mjs がバイト単位の
 * チェックサムで固定している（KPI の定義そのもの）。
 *
 * 引数は Date。数（エポックミリ秒）を渡す版（pr-evaluation-due.mjs）や
 * Intl で出す版（autopilot-act.mjs の jstToday）とは入れ替えられない。
 */
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
