/**
 * 素通しの JSON 読み。**read-ledger.mjs の readLedger とは別物。**
 *
 * 「無い」も「読めない」もそのまま投げる（ENOENT / SyntaxError）。
 * readLedger の「無い＝onMissing / 読めない＝投げる」の区別を持たない。
 * 台帳が無くてよい場面が無い（無ければその場で落ちてよい）呼び出し側の
 * 7 スクリプトが同じ1行を重複定義していたのを、ここに寄せただけ。
 *
 * read-ledger.mjs に足していないのは意図的 —— あのファイルは
 * data/review-gate-pin.json が指紋でピンしている（check-review-gate-pin.mjs）。
 * 素通しヘルパの追加でゲートの指紋を動かさないため、別ファイルに置く。
 */
import fs from 'node:fs';
import path from 'node:path';

export function readJSON(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
