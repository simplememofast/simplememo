#!/usr/bin/env node
/**
 * **CI が走らせるものを、手元で同じだけ回す。**
 *
 *   node scripts/preflight.mjs            # 全部
 *   node scripts/preflight.mjs --list     # 何を回すかだけ出す
 *   node scripts/preflight.mjs --only pub # 名前で絞る
 *
 * 【なぜ要るか — 2026-08-28 に実際に踏んだ】
 * 出荷の門（check-release-gate）を作ったとき、**手で9本選んで回して出した。**
 * CI は73本回していて、その中の `check-publication` が落ちた ——
 * 公開リポジトリに新しいデータファイルを足したのに、公開してよいかを
 * 分類していなかった。**データファイルを足したコミットで、データファイルに
 * 効く検査を回していなかった。**
 *
 * 【一覧を手で持たない】
 * **`.github/workflows/seo-check.yml` から導く。**手で持つと、CI に検査を足した
 * 日にここが古くなり、「手元で通ったのにCIで落ちる」が戻ってくる。
 * 導出なので、CI に1本足せばここも1本増える。
 *
 * 【手元でだけ落ちるものがある — 2026-08-28 の実測】
 * `check-generators --run` は `data/financial-policy.json` と
 * `data/revenue-series.json` が再生成で変わると言う。**これは main でも同じ**
 * （origin/main の当該2ファイルへ戻して確かめた）。CI では通っているので、
 * 生成器の出力がこの環境と CI で違う。**私の変更で増えたものではない。**
 *
 * **↑ ここまでは正しいが、原因を掴んでいなかった。**同じ日の後刻に分かった:
 *
 *   data/revenue-series.json は `../simplememo-ios/data/revenue/series.json`
 *   の**写し**で、隣が進むと古くなる（covered_days 1→2 / last_day 08-23→08-26）。
 *   data/financial-policy.json の `revenue_history_days` はそこから来る。
 *
 * つまり**「環境で出力が違う」のではなく、コミット済みの写しが実際に古い。**
 * CI が緑なのは、**CI が隣リポジトリを checkout しないから** ——
 * 隣が要る生成器はそこで非0を返し、CI はその拒否を確かめている
 * （seo-check.yml に明記。免除ではない）。
 *
 * **したがって写しの古さは、隣が見える場所でしか観測できない。**
 * この preflight が鏡を隣の見える位置に置いているのは、まさにそのため。
 * 見つけたら直す（この2本は 2026-08-28 に再生成して commit した）。
 *
 * **それでも skip の一覧は作らない。**下の理由のとおり。
 *
 * 【上の「数が変われば気づける」は、同じ日に破れた】
 * 元はここに「2本目が増えた日には数が変わって気づける」と書いていた。**破れた。**
 * `data/check-selftests.json` を手で末尾へ追記して（生成器は script 名でソートする）
 * CI が落ちたが、**手元の数は 1 本のまま**だった —— 2本目の失敗が
 * *同じ1本の中* に入ったからで、既知の1本が新しい1本を覆い隠した。
 * 「数を見ていれば気づく」は、**失敗が別の行に出るときにしか効かない。**
 *
 * 【だから鏡を作って、実際に走らせる】
 * `check-generators --run` は作業ツリーがクリーンでないと走らない（人の編集を
 * 潰さないため。正しい）。しかし preflight は**定義上、未コミットの変更がある
 * 状態で走る**ので、この1本は構造的に到達できなかった。
 * いまは追跡ファイルを一時ディレクトリへ写して `git init && commit` し、
 * **こちらの編集を含んだままクリーンな木**を作ってそこで走らせる。
 * 本物の木には触れない。
 *
 * 【落ちたものを隠さない】
 * 手元では通らないもの（外部の資格情報や BigQuery が要るもの）もある。
 * **それを「skip」に分類して黙らせない** —— 落ちたものは落ちたものとして出し、
 * 何が要るかは実行した人が読む。分類を持つと、**本当に落ちたものがそこに紛れる。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/seo-check.yml');

/**
 * ワークフローから `node <script> <args>` の行を拾う。**純関数。**
 *
 * 行頭の空白と `-` を落としてから見る（YAML のブロック内なので字下げがある）。
 * `&&` や `|` でつながった行は**取らない** —— 手元で意味が変わりうるものを
 * 黙って走らせない。
 */
export function extractCommands(yamlText) {
  const out = [];
  for (const raw of String(yamlText ?? '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('node ')) continue;
    if (/[|&;><]/.test(line)) continue;          // 合成された行は取らない
    if (/\$\{\{|\$[A-Z_]/.test(line)) continue;  // 変数を含む行は手元で意味が変わる
    const m = line.match(/^node\s+((?:scripts|growth\/scripts)\/[A-Za-z0-9_.-]+\.mjs)(.*)$/);
    if (!m) continue;
    const args = m[2].trim();
    out.push({ script: m[1], args: args === '' ? [] : args.split(/\s+/) });
  }
  // 同じ script+args は1回だけ
  const seen = new Set();
  return out.filter((c) => {
    const k = `${c.script} ${c.args.join(' ')}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? argv[i + 1] : null;
})();

let cmds;
try {
  cmds = extractCommands(fs.readFileSync(WORKFLOW, 'utf8'));
} catch (e) {
  console.error(`ワークフローが読めない: ${WORKFLOW}\n${e.message}`);
  process.exit(2);
}
if (cmds.length === 0) {
  // **0本を「全部通った」と出さない。**導出が壊れたときに緑になるのが一番まずい
  console.error('ワークフローから1本も拾えなかった — 導出が壊れている');
  process.exit(2);
}
if (only) cmds = cmds.filter((c) => `${c.script} ${c.args.join(' ')}`.includes(only));

if (argv.includes('--list')) {
  for (const c of cmds) console.log(`node ${c.script} ${c.args.join(' ')}`.trim());
  console.log(`\n${cmds.length} 本（.github/workflows/seo-check.yml から導出）`);
  process.exit(0);
}

/** クリーンな作業ツリーを要求するもの。**該当は今のところ1本。** */
function needsCleanTree(c) {
  return c.script.endsWith('check-generators.mjs') && c.args.includes('--run');
}

/**
 * 追跡ファイル＋未追跡（無視されていない）ファイルを一時ディレクトリへ写し、
 * `git init && commit` して**クリーンな木**にする。
 *
 * **本物の木には触れない。**生成器は写しの中で書き、写しごと捨てる。
 * 作れなければ null を返す（**黙って本物で走らせない** —— 人の編集を潰す）。
 */
function makeMirror() {
  const list = (args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) return null;
    return r.stdout.split('\0').filter(Boolean);
  };
  const tracked = list(['ls-files', '-z']);
  const untracked = list(['ls-files', '--others', '--exclude-standard', '-z']);
  if (!tracked || !untracked) {
    console.log('  （鏡を作れない: git が読めない — この1本は走らせない）');
    return null;
  }
  let dir;
  try {
    // **隣（`../simplememo-ios` など）が見える位置に置く。**
    // `/tmp` に置くと隣が消え、隣を読む生成器（revenue-series / code-authorship /
    // check-degradation）が「書かずに通る」ようになって**偽の緑**になる。
    // 2026-08-28、最初 os.tmpdir() に置いて実際にそうなった ——
    // 本物の木では落ちる2件が、鏡では通っていた。
    dir = fs.mkdtempSync(path.join(path.dirname(ROOT), '.preflight-mirror-'));
    for (const rel of [...tracked, ...untracked]) {
      const src = path.join(ROOT, rel);
      // 削除済みの追跡ファイルは ls-files に残る。**無いものを写そうとして落ちない。**
      if (!fs.existsSync(src)) continue;
      const dst = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    const git = (args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    git(['-c', 'init.defaultBranch=main', 'init', '-q']);
    git(['add', '-A']);
    const commit = git(['-c', 'user.email=preflight@local', '-c', 'user.name=preflight',
      'commit', '-q', '-m', 'preflight mirror']);
    if (commit.status !== 0) {
      console.log('  （鏡をコミットできない — この1本は走らせない）');
      fs.rmSync(dir, { recursive: true, force: true });
      return null;
    }
    process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
  } catch (e) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    console.log(`  （鏡を作れない: ${e.message} — この1本は走らせない）`);
    return null;
  }
}

console.log(`CI と同じ ${cmds.length} 本を回す（seo-check.yml から導出）\n`);
const failed = [];
let mirror = null;
for (const c of cmds) {
  const label = `${c.script} ${c.args.join(' ')}`.trim().replace(/^scripts\//, '');
  // **クリーンな木を要求するものは、鏡で走らせる。**
  // 本物の木は preflight を回している時点で汚れているので、そこでは走れない。
  let cwd = ROOT;
  if (needsCleanTree(c)) {
    if (mirror === null) mirror = makeMirror();   // 1回だけ作って使い回す
    if (mirror) cwd = mirror;
  }
  const r = spawnSync('node', [c.script, ...c.args], { cwd, encoding: 'utf8' });
  if (r.status === 0) {
    console.log(`  ok    ${label}`);
  } else {
    failed.push({ label, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() });
    console.log(`  FAIL  ${label}`);
  }
}

console.log(`\n${cmds.length} 本中 ${failed.length} 本失敗`);
for (const f of failed) {
  console.log(`\n--- ${f.label} ---`);
  console.log(f.out.split('\n').slice(-12).join('\n'));
}
if (failed.length) {
  console.log('\n**手元で落ちるものもここに出る。**外部の資格情報や BigQuery が要るものは');
  console.log('手元では通らないが、**それを skip に分類して黙らせていない** ——');
  console.log('分類を持つと、本当に落ちたものがそこに紛れる。');
}
process.exit(failed.length ? 1 : 0);
}
