#!/usr/bin/env node
/**
 * **出荷の門が変わったことを、変えたPRの中で気づかせる。**
 *
 *   node scripts/check-release-gate-pin.mjs                 # 表示
 *   node scripts/check-release-gate-pin.mjs --check         # CI（このリポジトリの写しと照合）
 *   node scripts/check-release-gate-pin.mjs --pin <path>    # **実行側から呼ぶとき**
 *   node scripts/check-release-gate-pin.mjs --selftest
 *
 * 【レビュー返信・段階公開でやったことを、出荷にも当てる】
 * 判断は公開側（このリポジトリの `release-gate-run.mjs` と `check-release-gate.mjs`）、
 * 実行は非公開側（simplememo-ios の `release.yml`。ASC の鍵があちらにしかない）。
 * あちらは留めた指紋と実物が違えば**提出せずに落ちる。**
 *
 * **こちらは鳴子で、同じPRの中で赤くするためだけにある。**実装は
 * `check-review-gate-pin.mjs` と共有する（importClosure / sha12 / drift）。
 *
 * 【`--pin` がある理由 — 先の2つとの違い】
 * レビュー返信も段階公開も、実行側は**Rubyや別言語で自前の照合**を持っていた。
 * 出荷の実行側は**この門そのものを node で走らせる**（simplememo を checkout して
 * `release-gate-run.mjs --materials` を叩く）ので、照合器も同じものを使える。
 * **同じ判定を2つ書かない** —— 2つ書けば、いつか片方だけ直る。
 *
 * だから実行側は自分の pin ファイルを `--pin` で渡す。**留める側と留められる側が
 * 別のリポジトリにいる**という構図は先の2つと同じで、
 * **2か所に同じ値を書かないと片方だけ緑になる**のも同じ。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importClosure, sha12, drift } from './check-review-gate-pin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PIN_PATH = path.join(ROOT, 'data/release-gate-pin.json');
/** **実行側が実際に叩く入口。**判定規則（check-release-gate.mjs）はこの閉包に入る。 */
export const ENTRY = 'scripts/release-gate-run.mjs';
/** 実際に止めている側（非公開）。**両方に同じ値を書かないと、こちらだけ緑になる。** */
export const MIRROR = 'simplememo-ios/data/release-gate-pin.json';

/** `--pin <path>` を読む。**値が無ければ既定へ落とさない**（別の pin で照合したことになる）。 */
export function pinPathFrom(args, { root = ROOT } = {}) {
  const i = args.indexOf('--pin');
  if (i === -1) return path.join(root, 'data/release-gate-pin.json');
  const given = args[i + 1];
  if (!given || given.startsWith('--')) {
    throw new Error('--pin にはパスが要る — **省略を既定へ落とさない**（別の pin で照合したことになる）');
  }
  return path.isAbsolute(given) ? given : path.resolve(process.cwd(), given);
}

export function howToFix(actual, pin) {
  return [
    '',
    '**直し方 — 2か所に同じ値を書く。**片方だけだと、こちらは緑であちらが止まる。',
    '',
    `  1. ${path.relative(ROOT, PIN_PATH)}（このリポジトリ・鳴子）`,
    `  2. ${MIRROR}（**ASC の鍵を持っている側。実際に提出を止めているのはこちら**）`,
    '',
    '     "files": ' + JSON.stringify(actual, null, 7).replace(/\n/g, '\n     '),
    '',
    `  前回留めたのは ${pin.reviewed_at ?? '(不明)'}（${pin.reviewed_note ?? '注記なし'}）。`,
    '  **指紋だけ貼り替えるなら、この仕組みは何もしていない。**差分を読んでから書くこと。',
  ].join('\n');
}

function selftest() {
  let total = 0; const failures = [];
  const t = (n, c) => { total += 1; if (!c) failures.push(n); console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`); };
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };

  t('--pin が無ければ、このリポジトリの写しを見る',
    pinPathFrom([], { root: '/r' }) === '/r/data/release-gate-pin.json');
  t('--pin で差し替えられる（絶対パス）',
    pinPathFrom(['--pin', '/x/p.json'], { root: '/r' }) === '/x/p.json');
  t('相対パスは cwd から解決する',
    pinPathFrom(['--pin', 'data/release-gate-pin.json'], { root: '/r' }).startsWith('/'));
  t('**値の無い --pin は既定へ落とさない**', throws(() => pinPathFrom(['--pin'], { root: '/r' })));
  t('次の旗を値に読まない', throws(() => pinPathFrom(['--pin', '--check'], { root: '/r' })));

  // 実物の閉包が取れること。**留める対象が空になったら、この仕組みは何もしていない。**
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
  const { files, missing } = importClosure(ENTRY, { read });
  t('入口の依存がすべて読める', missing.length === 0);
  t('閉包に判定規則そのものが入っている', files.includes('scripts/check-release-gate.mjs'));
  t('**閉包が入口1本だけになっていない**（依存を数え落としていないか）', files.length >= 3);

  // 1バイト変えたら落ちること。**落ちない留め方は留めていない。**
  const actual = Object.fromEntries(files.map((f) => [f, sha12(read(f))]));
  t('同じ内容なら差分なし', drift(actual, actual).length === 0);
  t('1ファイル変わると落ちる',
    drift({ ...actual, 'scripts/check-release-gate.mjs': '000000000000' }, actual).length > 0);
  t('閉包から1本消えると落ちる（依存が減っても気づく）',
    drift({ ...actual, 'scripts/gone.mjs': '000000000000' }, actual).length > 0);

  console.log(failures.length ? `\n出荷ゲートの指紋 ${total} 件中 ${failures.length} 件失敗` : `\n出荷ゲートの指紋 ${total} 件すべて通過`);
  return failures.length ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest());

  const pinPath = pinPathFrom(args);
  const pin = JSON.parse(fs.readFileSync(pinPath, 'utf8'));
  const read = (rel) => {
    try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; }
  };
  const { files, missing } = importClosure(ENTRY, { read });

  if (missing.length) {
    console.error(`門の依存が読めない: ${missing.join(' / ')}`);
    process.exit(1);
  }

  const actual = Object.fromEntries(files.map((f) => [f, sha12(read(f))]));
  const problems = drift(pin.files || {}, actual);

  console.log(`出荷の門 — ${files.length}ファイル（留め ${pin.reviewed_at}・${path.relative(process.cwd(), pinPath) || pinPath}）`);
  for (const f of files) console.log(`  ${actual[f]}  ${f}`);

  if (problems.length) {
    console.error('\n**門が変わっている。**このまま main へ入ると、'
      + '隣の非公開リポジトリは**提出せずに落ちる**（止まる方向だが、止まったことは次の出荷まで分からない）:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error(howToFix(actual, pin));
    process.exit(1);
  }
  if (args.includes('--check')) console.log('\n留めた指紋と一致。隣は門を通せる状態にある。');
}
