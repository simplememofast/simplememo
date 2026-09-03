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
 * 【2026-09-01 訂正 — 上の1行は、書かれてから一度も本当ではなかった】
 * 拾えていたのは `run: |` のブロック形式だけで、**1行形式の
 * `run: node scripts/foo.mjs --check` を1本も拾っていなかった。**
 * 実測 CI 108 本のうち **47 本（43%）** がその形。61 本を全部通して
 * 「手元は緑」と出していた。
 *
 * **足りないことは症状に出ない。**落ちる検査が増えるなら気づくが、
 * 検査そのものが減るのは、残りが通ればただの緑になる。
 * このファイルが潰すために作られた「手元で緑・CIで赤」が、
 * このファイル自身の中に残っていた。
 *
 * 見つかり方も同型だった。`check-escalation.mjs --check` が手元で赤いのに
 * preflight は「2 本失敗」と言い、その2本にそれが入っていなかった。
 *
 * 対処は2つ。(1) 1行形式を拾う。(2) **取らなかった行を理由つきで必ず表に出す**
 * （`auditExtraction`）。分類できない実行行が出たら緑にせず exit 2 にする ——
 * 見たことのない書き方は「たぶん要らない」ではなく「まだ分かっていない」。
 * 本数の増減そのものは止められないが、**黙って減ることは止まる。**
 *
 * 【2026-09-03 — 同じ穴が、もう一段あった】
 * 1行形式を拾うようになった後も、導出は **`.mjs` で終わる行しか見ていなかった。**
 * 落ちていたのは 8 本で、そこに **`seo-check.js`（このリポジトリの主検査・12ゲート）**
 * が入っている。CI と手元の差は 125 対 133 だった。
 *
 * 見つけ方は自力ではない。`check-selftests.mjs` のラチェットが**まったく同じ形**で
 * `.js` を1本も見ていないのが先に分かり（act-ci-selftest-ratchet-js-blind）、
 * そちらを直したときに**この鏡も同じ正規表現を持っている**ことに気づいた。
 * **1か所直して終わりにすると、鏡のほうが古い版を映し続ける。**
 *
 * 併せて **`if:` 付きのステップは取らないことにした。**`.mjs` には該当が1本も
 * 無かったので今日までは同じ結果になるが、`.js` を拾うと
 * `node scripts/indexnow-notify.js --since 1`（main への push 限定）が入ってくる ——
 * 手元で回すと検査ではなく **IndexNow への実送信**になる。取らなかったことは
 * 「条件付き」として表に出す（黙って減らさない、は同じ）。
 *
 * 導出そのものは `--selftest` で留めてある。2回続けて**症状に出ない形**で
 * 壊れたので、境界を検体で持つ。
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
 *
 * 【2026-09-01 修正】**1行形式の `run: node ...` を落としていた。**
 *
 * 拾えていたのはブロック形式（`run: |` の下に字下げして書く）だけで、
 * `run: node scripts/foo.mjs --check` と1行で書かれたステップは
 * `line.startsWith('node ')` に一度も当たらない。**実測で CI 108 本のうち
 * 47 本（43%）がこの形**で、preflight はそれを1本も回さずに
 * 「61 本中 N 本失敗」と出していた。
 *
 * このファイルの冒頭には「**導出なので、CI に1本足せばここも1本増える**」と
 * 書いてある。1行形式で足された日は増えなかったので、その主張は嘘だった。
 * しかも**足りないことは表に出ない** —— 少ない本数を全部通せば緑になる。
 * 手元で緑を見てから CI で落ちる、というこのファイルが潰すために作られた
 * 事象そのものが、このファイルの中に残っていた。
 *
 * 見つかり方も同じ形だった。`check-escalation.mjs --check` が手元で赤いのに
 * preflight は「2 本失敗」と言い、その2本にそれが入っていなかった。
 */
export function extractCommands(yamlText) {
  const out = [];
  let stepHasIf = false;
  for (const raw of String(yamlText ?? '').split('\n')) {
    let line = raw.trim();
    // `- run: node ...` / `run: node ...` / `- node ...` のどれでも同じ扱いにする。
    // **コマンド本体を取り出してから**既存の除外（合成・変数）に掛けること。
    // 順序を逆にすると、`run:` の付いた合成行が素通りする。
    if (line.startsWith('- ')) { stepHasIf = false; line = line.slice(2).trim(); }
    if (/^if:\s/.test(line)) { stepHasIf = true; continue; }
    const inline = line.match(/^run:\s+(.+)$/);
    if (inline) line = inline[1].trim();
    if (!line.startsWith('node ')) continue;
    if (/[|&;><]/.test(line)) continue;          // 合成された行は取らない
    if (/\$\{\{|\$[A-Z_]/.test(line)) continue;  // 変数を含む行は手元で意味が変わる
    if (stepHasIf) continue;                     // 条件付きのステップは手元で意味が違う
    const m = line.match(/^node\s+((?:scripts|growth\/scripts)\/[A-Za-z0-9_.-]+\.m?js)(.*)$/);
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

/**
 * **取らなかった行を、理由つきで数える。**
 *
 * 取りこぼしは本数が減るだけなので、**残りが全部通れば緑になる。**
 * 実際 2026-09-01 まで、1行形式の `run: node ...` を47本（CI全体の43%）
 * 落としたまま「61本中N本失敗」と出していた。**足りないことは症状に出ない。**
 *
 * そこで、コマンド行に見えるのに取らなかったものを必ず表に出す。
 * 理由の付くもの（合成・変数・対象外の実行系）は出したうえで通し、
 * **どれにも当てはまらない形が出たら落とす** —— 見たことのない書き方は
 * 「たぶん要らない」ではなく「まだ分かっていない」なので、緑にしない。
 */
export function auditExtraction(yamlText) {
  const dropped = { composed: [], variable: [], conditional: [], out_of_scope: [], unknown: [] };
  let taken = 0;
  let stepHasIf = false;
  for (const raw of String(yamlText ?? '').split('\n')) {
    let line = raw.trim();
    if (line.startsWith('- ')) { stepHasIf = false; line = line.slice(2).trim(); }
    if (/^if:\s/.test(line)) { stepHasIf = true; continue; }
    const inline = line.match(/^run:\s+(.+)$/);
    if (inline) line = inline[1].trim();
    // 実行系に見える行だけを対象にする（散文やYAMLの他のキーは無視）
    if (!/^(node|python3|npx)\s/.test(line)) continue;
    if (/^node\s+(?:scripts|growth\/scripts)\/[A-Za-z0-9_.-]+\.m?js/.test(line)
        && !/[|&;><]/.test(line) && !/\$\{\{|\$[A-Z_]/.test(line) && !stepHasIf) { taken += 1; continue; }
    if (/[|&;><]/.test(line)) { dropped.composed.push(line); continue; }
    if (/\$\{\{|\$[A-Z_]/.test(line)) { dropped.variable.push(line); continue; }
    // **条件付きのステップは、手元では意味が違う。**CI 側の `if:` が
    // 「main への push のときだけ」と言っているものを手元で回すと、
    // 検査ではなく副作用（IndexNow への実送信）が起きる。
    if (stepHasIf) { dropped.conditional.push(line); continue; }
    // .py / npx / growth/lib のテストは、**現状は回していない。**
    // 回さないこと自体は判断だが、黙って消えていてよい理由は無いので表に出す。
    if (/^(python3\s|npx\s)/.test(line) || /^node\s+\S+\.py\b/.test(line)
        || /^node\s+\S+\.test\.mjs\b/.test(line)) { dropped.out_of_scope.push(line); continue; }
    dropped.unknown.push(line);
  }
  return { taken, dropped };
}

// **import されたときに走らせない。**export しているものを import した側が
// `--check` を持っていると、ここが `process.exit()` を呼んで
// **呼び出し側のコードを1行も走らせずに exit 0 する**（2026-08-28 に実測）。
// 検査は scripts/check-module-entry.mjs。
/**
 * **導出そのものを固定する。**
 *
 * この道具が壊れる形は毎回同じ —— **拾えなくなるだけなので、残りが全部通れば緑になる。**
 * 実際に2回起きている:
 *   - 2026-09-01: 1行形式の `run: node ...` を拾わず、CI 108 本のうち 47 本（43%）を
 *     落としたまま「61 本中 N 本失敗」と出していた
 *   - 2026-09-03: `.mjs` しか拾わず、`seo-check.js` など 8 本を落としていた
 *     （data/autopilot-actions.json#act-ci-selftest-ratchet-js-blind と同じ形）
 *
 * どちらも症状に出ない。だから**境界を検体で留めておく。**
 */
function selftest() {
  const cases = [];
  const t = (name, fn) => cases.push([name, fn]);
  const yaml = (...lines) => lines.join('\n');
  const names = (text) => extractCommands(text).map((c) => `${c.script} ${c.args.join(' ')}`.trim());

  t('1行形式の run: を拾う（2026-09-01 まで 47 本落としていた）', () => {
    const got = names(yaml('      - name: x', '        run: node scripts/a.mjs --check'));
    assertEq(got.join(), 'scripts/a.mjs --check');
  });
  t('ブロック形式も拾う', () => {
    const got = names(yaml('      - name: x', '        run: |', '          node scripts/b.mjs'));
    assertEq(got.join(), 'scripts/b.mjs');
  });
  t('**`.js` も拾う**（2026-09-03 まで主検査を落としていた）', () => {
    const got = names(yaml('      - name: x', '        run: node scripts/seo-check.js --selftest'));
    assertEq(got.join(), 'scripts/seo-check.js --selftest');
  });
  t('growth/scripts も拾う', () => {
    const got = names(yaml('        run: node growth/scripts/c.mjs --check'));
    assertEq(got.join(), 'growth/scripts/c.mjs --check');
  });
  // 手元で回すと検査ではなく**副作用**になる。IndexNow の実送信がこれ。
  t('**`if:` 付きのステップは取らない**（手元では意味が違う）', () => {
    const text = yaml('      - name: x', "        if: github.ref == 'refs/heads/main'",
      '        run: node scripts/d.js --since 1');
    assertEq(names(text).join(), '');
    assertEq(auditExtraction(text).dropped.conditional.join(), 'node scripts/d.js --since 1');
  });
  t('`if:` は次のステップへ漏れない', () => {
    const text = yaml('      - name: x', "        if: github.ref == 'refs/heads/main'",
      '        run: node scripts/d.mjs', '      - name: y', '        run: node scripts/e.mjs');
    assertEq(names(text).join(), 'scripts/e.mjs');
  });
  t('合成された行は取らない', () => {
    assertEq(names(yaml('        run: |', '          node scripts/f.mjs || EXIT=$?')).join(), '');
  });
  t('変数を含む行は取らない', () => {
    assertEq(names(yaml('        run: node scripts/g.mjs --x ${{ github.sha }}')).join(), '');
  });
  t('同じ script+args は1本にまとめる', () => {
    const text = yaml('        run: node scripts/h.mjs --check', '        run: node scripts/h.mjs --check');
    assertEq(names(text).length, 1);
  });
  t('python は対象外として表に出す（黙って消さない）', () => {
    const d = auditExtraction(yaml('        run: python3 scripts/i.py --check')).dropped;
    assertEq(d.out_of_scope.join(), 'python3 scripts/i.py --check');
    assertEq(d.unknown.length, 0);
  });
  // **見たことのない書き方は「たぶん要らない」ではなく「まだ分かっていない」。**
  t('分類できない実行行は unknown に落ちる（＝緑にしない）', () => {
    assertEq(auditExtraction(yaml('        run: node tools/j.mjs')).dropped.unknown.length, 1);
  });
  t('実データ: 取りこぼしの分類に unknown が無い', () => {
    const d = auditExtraction(fs.readFileSync(WORKFLOW, 'utf8')).dropped;
    assertEq(d.unknown.join(' / '), '');
  });
  t('実データ: 1本も拾えない、が起きていない', () => {
    const n = extractCommands(fs.readFileSync(WORKFLOW, 'utf8')).length;
    if (!(n > 100)) throw new Error(`導出が ${n} 本しかない — 壊れている可能性`);
  });

  let failed = 0;
  for (const [name, fn] of cases) {
    try { fn(); console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name}\n       ${e.message}`); }
  }
  console.log(`\n  自己テスト ${cases.length} 件中 ${failed} 件失敗`);
  return failed === 0 ? 0 : 1;
}

function assertEq(got, want) {
  if (got !== want) throw new Error(`got ${JSON.stringify(got)} / want ${JSON.stringify(want)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
const argv = process.argv.slice(2);
if (argv.includes('--selftest')) process.exit(selftest());
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
// **取らなかった行を先に出す。**本数が減っただけの導出は、残りが全部通れば
// 緑になる（2026-09-01 まで47本を落としたまま緑を出していた）。
{
  const audit = auditExtraction(fs.readFileSync(WORKFLOW, 'utf8'));
  const d = audit.dropped;
  const n = d.composed.length + d.variable.length + d.conditional.length
    + d.out_of_scope.length + d.unknown.length;
  if (n > 0) {
    console.log(`導出で取らなかった ${n} 行（理由つき。**黙って減らさない**）:`);
    const show = (label, xs) => {
      for (const x of xs) console.log(`  ${label}  ${x}`);
    };
    show('合成    ', d.composed);
    show('変数    ', d.variable);
    show('条件付き', d.conditional);
    show('対象外  ', d.out_of_scope);
    show('**不明**', d.unknown);
    console.log('');
  }
  if (d.unknown.length) {
    // 見たことのない書き方は「たぶん要らない」ではなく「まだ分かっていない」。
    console.error('導出が分類できない実行行がある — 緑にしない');
    process.exit(2);
  }
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
