/**
 * growth/scripts の引数読み取り。5本のスクリプト（ingest-bigquery / ingest-gsc /
 * analyze / bq-preflight / full-funnel）が同じ4行を別々に持っていたものを
 * 寄せた（2026-09-25・挙動は不変）。
 *
 * **experiments.mjs は同じ定義を自分で持ったままにしてある。**
 * check-experiment-evidence.mjs が experiments.mjs と依存4本だけを一時
 * ディレクトリへ写して CLI として走らせる（依存の一覧を固定している）ので、
 * ここを import させるとその隔離が崩れる。
 *
 *   const flag = flagReader(argv);
 *   flag('top', 20)   // `--top 5` → '5'、無い・値が無い・次が `--…` → 20
 *
 * 値は文字列のまま返す（数にするのは呼び出し側）。空文字の値は「無い」扱い。
 *
 * **`argv.includes('--write')` のような真偽のフラグはここに寄せない。**
 * scripts/check-generators.mjs が、書き込むスクリプトをその字面で見つけている。
 */
export function flagReader(argv) {
  return (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
  };
}
