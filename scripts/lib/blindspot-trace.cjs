// **中身を読んだものだけ**を記録する。
// existsSync / readdirSync も拾った版は、evidence の存在確認まで「読んだ」に数えて
// 116 件の候補を出した —— 存在だけ見ているファイルを壊しても落ちないのは当然で、
// 欠陥ではない。**測る対象を間違えると、候補が本物に見える。**
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.TRACE_OUT;
const ROOT = process.env.TRACE_ROOT;
const seen = new Set();
const orig = fs.readFileSync;
fs.readFileSync = function (p, ...rest) {
  try {
    const s = String(p);
    if (s.startsWith(ROOT)) seen.add(path.relative(ROOT, s));
  } catch {}
  return orig.call(this, p, ...rest);
};
process.on('exit', () => { try { fs.writeFileSync(out, [...seen].join('\n')); } catch {} });
