/**
 * 台帳を読む。**「無い」と「読めない」を混ぜない。**
 *
 * 【なぜ要るか】
 * 2026-08-26 に機械で当たったところ、**構文が壊れた台帳を既定値に落とす**書き方が
 * CI の検査に12箇所あった。いちばん重かったのは
 * `readJson('data/authority-matrix.json', {})` で、**権限表が壊れていても
 * `autopilot-act --check` は exit 0 を返していた。**空の権限表では classify が
 * 全部 human を返すので安全側ではあるが、壊れていることを誰も知らないまま
 * 縮退で走り続ける。
 *
 * 他にも同じ形があった:
 *   - check-vendors  … 資格情報の台帳が壊れると、**いま出ている食い違い1件が節ごと消える**
 *   - autopilot-runs … 費用の台帳が壊れると、**実費の行が消えて0とも未観測とも区別がつかない**
 *
 * どれも「見なかった」を「異常なし」と同じ見た目にする形で、
 * このリポジトリが繰り返し直してきたものと同じ。
 *
 * 【分け方】
 *   無い       … 正当な場合がある（初回・その台帳を持たない環境）。onMissing を返す
 *   読めない   … 正当な場合が無い。**投げる**
 *
 * 呼ぶ側が「無くてよい」かどうかを決める。ここでは決めない。
 */
import fs from 'node:fs';

/**
 * @param {string} abs   絶対パス
 * @param {object} opts
 * @param {*} opts.onMissing  ファイルが無いときに返す値（既定 null）
 * @param {string} opts.why   読めなかったときに添える一言（何が見えなくなるか）
 */
export function readLedger(abs, { onMissing = null, why = '' } = {}) {
  if (!fs.existsSync(abs)) return onMissing;
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    throw new Error(`${abs} を開けない（${e.message}）${why ? ` — ${why}` : ''}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${abs} を読めない（${e.message}）`
      + `${why ? ` — ${why}` : ''}`
      + ' — **無いのではなく読めないので止める。**既定値に落とすと縮退したまま静かに走り続ける');
  }
}

/**
 * この helper 自身のシナリオ。**使う検査の自己テストから呼ぶ。**
 * 1箇所で書いて、複数の CI 検査から実際に走らせる。
 */
export function readLedgerScenarios(fsMod = fs, os = null) {
  const nodeOs = os ?? { tmpdir: () => '/tmp' };
  const mk = (content) => {
    const dir = fsMod.mkdtempSync(`${nodeOs.tmpdir()}/rl-`);
    const p = `${dir}/x.json`;
    if (content !== null) fsMod.writeFileSync(p, content);
    return p;
  };
  return [
    ['**無いファイルは onMissing を返す**（初回・その台帳を持たない環境）', () => {
      const p = mk(null);
      if (readLedger(p, { onMissing: 'なし' }) !== 'なし') throw new Error('onMissing が返らない');
    }],
    ['読めるファイルは中身を返す', () => {
      const got = readLedger(mk('{"a":1}'));
      if (got?.a !== 1) throw new Error(JSON.stringify(got));
    }],
    ['**壊れたファイルは投げる**（既定値に落とさない）', () => {
      let threw = false;
      try { readLedger(mk('{ broken')); } catch { threw = true; }
      if (!threw) throw new Error('壊れた台帳を通した（**この helper は何も守っていない**）');
    }],
    ['**壊れたファイルで onMissing は返さない**（無いと読めないを混ぜない）', () => {
      let got = '投げなかった';
      try { got = readLedger(mk('{ broken'), { onMissing: {} }); } catch { got = null; }
      if (got !== null) throw new Error('onMissing を返した — 無いのと同じ扱いになっている');
    }],
    ['読めなかった理由に「何が見えなくなるか」を添えられる', () => {
      try {
        readLedger(mk('{ broken'), { why: '突き合わせが消える' });
      } catch (e) {
        if (!e.message.includes('突き合わせが消える')) throw new Error(e.message);
        return;
      }
      throw new Error('投げなかった');
    }],
  ];
}
