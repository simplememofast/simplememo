#!/usr/bin/env node
/**
 * **書き出す側のコードが、まだ動くか。**
 *
 *   node scripts/check-generators.mjs --check     # 台帳が全部の生成器を挙げているか（木を触らない）
 *   node scripts/check-generators.mjs --run       # 実際に走らせる（**木を触る。**クリーンでないと拒否）
 *   node scripts/check-generators.mjs --selftest
 *
 * 【なぜ要るか】2026-08-26 に2つ踏んだ。どちらも **CI が --write を一度も走らせて
 * いなかった**ために生きていた。
 *
 *   1. growth/scripts/revenue-series.mjs --write が
 *      `ReferenceError: policy is not defined` で落ちていた。**一度も成功していない。**
 *      落ちる場所が「方針側の日数も同時に合わせる（ずれたままにしない）」の行で、
 *      **ずれたままにしないための行が、ずれたままにしていた。**
 *
 *   2. assets/img/autopilot/autonomy-timeline.svg が台帳から4日ぶん遅れていた。
 *      見出しが「4か月で18倍」、台帳から作ると「9倍」。**倍近い過大**が
 *      配信原稿の参照先に乗っていた。
 *
 * CI は各検査の `--selftest` と `--check` を回すが、**`--write` は回さない。**
 * 生成器は「書いた結果」だけが検査されていて、「書く動作そのもの」は
 * 誰も動かしていなかった。実測4秒で済むので、回す。
 *
 * 【走らせないもの】autopilot-act / autopilot-budget / ingest-asc などは
 * **実際に行動する側**（課金・送信・状態遷移）なので、ここでは絶対に回さない。
 * 台帳の `never_run` に理由つきで挙げてある。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assert, run as runScenarios } from './lib/selftest.mjs';
import { readLedger, requireShape } from './lib/read-ledger.mjs';
import { mask } from './check-guard-shapes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER_PATH = path.join(ROOT, 'data/generators.json');

/**
 * 書き出す指示に見える引数。**ここに無い旗を足したら、台帳にも足す。**
 *
 * **この検査が見ているのはここまで、と先に書いておく。**
 * autopilot-act / autopilot-selfheal / recover-ingest / ingest-asc などは
 * `--record` `--contain` `--bump` や位置引数で状態を書き換える**行動する側**で、
 * ここでは検出もしないし走らせもしない。**回したら本当に行動してしまう。**
 * 「全部の書き手を見ている」と読めないように、範囲を名指ししておく。
 */
const WRITE_FLAGS = ['--write', '--sync', '--svg', '--rebuild'];

/** 隣リポジトリ。揃っていない場所では、書かずに拒否するのが正しい生成器がある。 */
const SIBLINGS = ['simplememo-api', 'simplememo-ios'];

/** ソースを走査して「書き出す旗を持つ」スクリプトを挙げる。 */
export function writersIn(rawSrc) {
  // [2026-08-26] 生のソースで当てると、**この検査自身の自己テストに書いた
  // 文字列リテラル**まで拾った（102件の誤検出を出した走査と同じ失敗を同じ日に2度）。
  //
  // ただし旗の名前そのものが文字列リテラルなので、潰した側から読むと消えてしまう。
  // mask は位置を1対1で保つので、**呼び出しの形は潰した側で当て、
  // 旗の中身は元のソースの同じ位置から読む。**
  // こうすると「文字列の中に書かれた呼び出し」は潰れて当たらず、
  // 本物の `argv.includes('--write')` だけが残る。
  const masked = mask(rawSrc);
  const flags = new Set();
  for (const m of masked.matchAll(/argv\.(?:includes|indexOf)\(\s*'/g)) {
    const q = m.index + m[0].length - 1;          // 開き引用符の位置
    const close = rawSrc.indexOf("'", q + 1);
    if (close < 0) continue;
    const flag = rawSrc.slice(q + 1, close);
    if (WRITE_FLAGS.includes(flag)) flags.add(flag);
  }
  return [...flags].sort();
}

function sources() {
  const out = [];
  for (const dir of ['scripts', 'growth/scripts']) {
    const d = path.join(ROOT, dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (f.endsWith('.mjs')) out.push(`${dir}/${f}`);
  }
  return out.sort();
}

export function scanWriters() {
  const out = [];
  for (const rel of sources()) {
    const flags = writersIn(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (flags.length) out.push({ file: rel, flags });
  }
  return out;
}

/**
 * 出力が**リポジトリの外**（時計・ネット・子プロセス）で決まりうる書き手か。**純関数。**
 *
 * [2026-08-27] **同じ日に2回踏んだので機械にした。**
 *
 *   #653 … CIだけ10社の規約を取得できて、指紋が毎回変わり `--run` が落ちた
 *   #655 … JSTの日付が回った瞬間 synced_at だけ変わって `--run` が落ちた
 *
 * #654 で「ネット・時刻・外部APIが混ざる生成器は再生成して比較に載せられない」と
 * **散文で**書いたが、その数時間後に自分の生成器で2度目を踏んでいる。
 * この台帳には `prose-does-not-stop-an-agent` という学びが既にあるので、規則にする。
 *
 * **落とすのではなく、宣言を要求する。**時計に触ること自体は悪くない ——
 * 悪いのは**触っているのに考えていない**こと。run に載せるなら次のどちらかを書かせる:
 *
 *   dated: true       … 出力に日付が入る。**その分ファイルの鮮度検査は効かなくなる**
 *   deterministic_why … 日付が入らない理由（例: 中身が変わった回しか書かない）
 *
 * 検出は粗くてよい（誤検知は宣言1行で済み、見逃しはCIが不定期に赤くなる）。
 */
export const NONDETERMINISTIC_CALLS = [
  [/\bDate\.now\(\)/, 'Date.now()'],
  [/new Date\(\)/, 'new Date()'],
  [/\bfetch\(/, 'fetch()'],
  [/execFileSync|execSync|spawnSync/, '子プロセス'],
];

export function nondeterministicCalls(src) {
  return NONDETERMINISTIC_CALLS.filter(([re]) => re.test(String(src ?? ''))).map(([, n]) => n);
}

/** run の1件を見る。**宣言が無ければ理由を返す。** */
export function undeclaredNondeterminism(entry, src) {
  const hits = nondeterministicCalls(src);
  if (!hits.length) return null;
  if (entry?.dated === true) return null;
  if (typeof entry?.deterministic_why === 'string' && entry.deterministic_why.trim()) return null;
  return `台帳の run「${entry?.cmd ?? '?'}」は ${hits.join(' / ')} を使う`
    + ' — **出力がリポジトリの外で決まりうる。**再生成して比べる検査に載せる以上、'
    + 'dated: true（日付が入る／その分ファイルの鮮度検査は効かなくなる）か '
    + 'deterministic_why（日付が入らない理由）のどちらかを書くこと';
}

/**
 * 台帳が全部を挙げているかだけ見る。**木を触らない。**
 * 走らせない判断（never_run）も、理由つきで挙がっていることを要求する。
 */
export function validate(writers, doc, { exists = (f) => fs.existsSync(path.join(ROOT, f)) } = {}) {
  const problems = [];
  const listed = new Map();
  for (const g of doc.run || []) listed.set(g.cmd.split(' ')[0], g);
  for (const g of doc.never_run || []) {
    listed.set(g.file, g);
    if (!g.why) problems.push(`never_run「${g.file}」に理由が無い — **走らせない判断こそ理由が要る**`);
  }
  for (const w of writers) {
    if (!listed.has(w.file)) {
      problems.push(`${w.file}（${w.flags.join(' ')}）が台帳に無い`
        + ' — **書く動作を誰も動かしていない状態を作らない。**'
        + 'run か never_run のどちらかへ、理由つきで足すこと');
    }
  }
  // 逆向きは **run 側だけ**に効かせる。never_run は「この検査の範囲外の書き手」を
  // わざと挙げている欄で、そこにあるものは `--record` `--contain` など別の旗を持つ。
  // ここまで旗の有無で縛ると、**範囲外だと書いた記録のほうが消える。**
  const files = new Set(writers.map((w) => w.file));
  for (const g of doc.run || []) {
    const f = g.cmd.split(' ')[0];
    if (!files.has(f) && !g.flagless) {
      problems.push(`台帳の run「${f}」に書き出す旗が無い`
        + ' — 直したなら台帳からも消す。旗を持たない書き手なら flagless: true を書く');
    }
  }
  // **時計・ネットに触る run は、宣言を書かせる。**（上の注記）
  for (const g of doc.run || []) {
    const f = g.cmd.split(' ')[0];
    let src = null;
    try { src = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { /* 実在しないのは下で見る */ }
    if (src === null) continue;
    const why = undeclaredNondeterminism(g, src);
    if (why) problems.push(why);
  }
  // 台帳が腐るのは旗ではなくファイルの消失で見る（never_run も含めて全部）。
  for (const [f] of listed) {
    if (!exists(f)) problems.push(`台帳の「${f}」が実在しない — 消したなら台帳からも消す`);
  }
  return problems;
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

function dirtyPaths() {
  return git(['status', '--porcelain'])
    .split('\n').filter(Boolean).map((l) => ({ code: l.slice(0, 2), file: l.slice(3).trim() }));
}

/** 実際に走らせる。**呼ぶ側は木がクリーンであることを確かめてから。** */
function doRun(doc) {
  const problems = [];
  const dated = new Set(doc.run.filter((g) => g.dated).flatMap((g) => g.writes || []));
  for (const g of doc.run) {
    const [script, ...args] = g.cmd.split(' ');
    const started = Date.now();
    let rc = 0; let tail = '';
    try {
      execFileSync('node', [script, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 180000, stdio: 'pipe' });
    } catch (e) {
      rc = e.status ?? 1;
      tail = String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-2).join(' / ');
    }
    // [2026-08-26] 隣リポジトリが要るものは、**隣が無いとき非0で拒否するのが正しい**
    // （「部分的な計測を台帳にしない」）。それを「壊れている」と読むと、
    // 逆に**拒否を免除する例外**を作ることになる。なので向きを分けて確かめる:
    //   隣が在る → exit 0 であること
    //   隣が無い → **非0で拒否すること**（黙って何もしないのは通さない）
    const needsSiblings = g.needs === 'siblings';
    const haveSiblings = SIBLINGS.every((r) => fs.existsSync(path.join(ROOT, '..', r)));
    const want = needsSiblings && !haveSiblings ? 'refuse' : 'ok';
    const good = want === 'ok' ? rc === 0 : rc !== 0;
    const label = want === 'refuse' ? (good ? '拒否' : 'FAIL') : (good ? 'ok  ' : 'FAIL');
    console.log(`  ${label} ${g.cmd.padEnd(44)} ${Date.now() - started}ms`
      + (want === 'refuse' ? '  （隣が無いので拒否を確かめた）' : ''));
    if (!good) {
      problems.push(want === 'refuse'
        ? `${g.cmd} が隣リポジトリ無しで exit 0 — **揃っていない場所で書いている。**`
          + '無いものを「無かった」として固めてしまう'
        : `${g.cmd} が exit ${rc} — **書く動作が壊れている。**${tail}`);
    }
  }

  // 追跡下のファイルが動いたら、コミット済みの生成物が台帳より古かったということ
  for (const { code, file } of dirtyPaths()) {
    if (code.includes('?')) continue;                        // 新規（日付つき出力など）
    if (dated.has(file)) { console.log(`  （日付つき）${file}`); continue; }
    problems.push(`${file} が再生成で変わった — **コミット済みの生成物が元より古い。**`
      + '同じコミットに生成物を含めること');
  }
  return problems;
}

/**
 * 走らせて動いたものを元へ戻す。**追跡外の新規ファイルも消す** ——
 * 残すと後続の検査（公開方針の分類など）が、検査が作ったファイルを見てしまう。
 */
function restore(before) {
  const wasThere = new Set(before.map((d) => d.file));
  const now = dirtyPaths().filter((d) => !wasThere.has(d.file));
  const tracked = now.filter((d) => !d.code.includes('?')).map((d) => d.file);
  const added = now.filter((d) => d.code.includes('?')).map((d) => d.file);
  if (tracked.length) git(['checkout', '--', ...tracked]);
  for (const f of added) {
    const abs = path.join(ROOT, f);
    if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
  }
  return [...tracked, ...added];
}

// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SCENARIOS = [
  ['--write を持つスクリプトを見つける', () => {
    const f = writersIn("if (process.argv.includes('--write')) { x(); }");
    assert(f.includes('--write'), JSON.stringify(f));
  }],
  ['**indexOf で読む旗も見つける**（--svg はこの形で、だから見落とされていた）', () => {
    const f = writersIn("const si = argv.indexOf('--svg');");
    assert(f.includes('--svg'), '--svg を見落とした — **実際に古くなっていたのがこの形**');
  }],
  ['書き出す旗の無いスクリプトは挙げない', () => {
    assert(writersIn("argv.includes('--check')").length === 0, '--check を書き出しに数えた');
  }],
  ['**時計やネットに触る run は宣言が要る**', () => {
    const e = { cmd: 'x.mjs --write' };
    assert(undeclaredNondeterminism(e, 'const t = Date.now();'), 'Date.now() を素通しした');
    assert(undeclaredNondeterminism(e, 'await fetch(u);'), 'fetch() を素通しした');
    assert(undeclaredNondeterminism(e, 'execFileSync("git", a);'), '子プロセスを素通しした');
    assert(undeclaredNondeterminism(e, 'new Date()'), 'new Date() を素通しした');
  }],
  ['宣言があれば通る（**落とすのではなく考えさせる**）', () => {
    const src = 'const t = Date.now();';
    assert(!undeclaredNondeterminism({ cmd: 'x', dated: true }, src), 'dated: true を通していない');
    assert(!undeclaredNondeterminism({ cmd: 'x', deterministic_why: '中身が同じなら書かない' }, src),
      'deterministic_why を通していない');
  }],
  ['**空の理由は理由ではない**', () => {
    assert(undeclaredNondeterminism({ cmd: 'x', deterministic_why: '  ' }, 'Date.now()'),
      '空白だけの理由を通した');
    assert(undeclaredNondeterminism({ cmd: 'x', dated: 'yes' }, 'Date.now()'),
      'dated が真偽値でないものを通した');
  }],
  ['触っていないものは挙げない（**宣言を儀式にしない**）', () => {
    assert(nondeterministicCalls('const a = 1 + 2;').length === 0, '無関係なソースを挙げた');
    assert(!undeclaredNondeterminism({ cmd: 'x' }, 'const a = 1;'), '触っていないのに宣言を要求した');
  }],
  ['**台帳に無い生成器は落ちる**', () => {
    const p = validate([{ file: 'scripts/x.mjs', flags: ['--write'] }], { run: [], never_run: [] }, { exists: () => true });
    assert(p.length === 1 && p[0].includes('台帳に無い'), JSON.stringify(p));
  }],
  ['**never_run に理由が無ければ落ちる**（走らせない判断こそ理由が要る）', () => {
    const p = validate([{ file: 'scripts/x.mjs', flags: ['--write'] }],
      { run: [], never_run: [{ file: 'scripts/x.mjs' }] }, { exists: () => true });
    assert(p.some((x) => x.includes('理由が無い')), JSON.stringify(p));
  }],
  ['理由つきの never_run は通る', () => {
    const p = validate([{ file: 'scripts/x.mjs', flags: ['--write'] }],
      { run: [], never_run: [{ file: 'scripts/x.mjs', why: '実際に課金する' }] }, { exists: () => true });
    assert(p.length === 0, JSON.stringify(p));
  }],
  ['run にあるのに旗が消えたら落ちる（記録が実体と合わなくなる）', () => {
    const p = validate([], { run: [{ cmd: 'scripts/x.mjs --write' }], never_run: [] }, { exists: () => true });
    assert(p.some((x) => x.includes('直したなら台帳からも消す')), JSON.stringify(p));
  }],
  ['flagless と書いた書き手は旗が無くても通る（無条件に書くもの）', () => {
    const p = validate([], { run: [{ cmd: 'scripts/x.mjs', flagless: true }], never_run: [] }, { exists: () => true });
    assert(p.length === 0, JSON.stringify(p));
  }],
  ['**never_run は旗の有無で縛らない**（範囲外の書き手を挙げる欄なので）', () => {
    const p = validate([], { run: [], never_run: [{ file: 'scripts/x.mjs', why: '行動する側' }] }, { exists: () => true });
    assert(p.length === 0, JSON.stringify(p));
  }],
  ['**台帳のファイルが消えていたら落ちる**（記録だけ残らせない）', () => {
    const p = validate([], { run: [], never_run: [{ file: 'scripts/gone.mjs', why: 'x' }] }, { exists: () => false });
    assert(p.some((x) => x.includes('実在しない')), JSON.stringify(p));
  }],
  ['**コメントや文字列の中の旗は拾わない**', () => {
    assert(writersIn("// process.argv.includes('--write') と昔は書いていた").length === 0, 'コメントを拾った');
    assert(writersIn(`const s = "argv.includes('--write')";`).length === 0, '文字列を拾った');
  }],
  ['**実データが台帳と合っている**', () => {
    const doc = readLedger(LEDGER_PATH, { onMissing: null, why: '生成器の一覧が無い' });
    assert(doc !== null, 'data/generators.json が無い');
    requireShape(doc, ['run', 'never_run'], { what: 'data/generators.json', why: '走らせる/走らせないを分けられない' });
    const p = validate(scanWriters(), doc);
    assert(p.length === 0, `${p.length} 件: ${p.slice(0, 2).join(' / ')}`);
  }],
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(runScenarios(SCENARIOS) === 0 ? 0 : 1);

  const doc = readLedger(LEDGER_PATH, { onMissing: null, why: '**どの生成器を動かすべきかが分からない**' });
  if (doc === null) { console.error('data/generators.json が無い'); process.exit(1); }
  requireShape(doc, ['run', 'never_run'], { what: 'data/generators.json', why: '走らせる/走らせないを分けられない' });

  const problems = validate(scanWriters(), doc);

  if (argv.includes('--run')) {
    const before = dirtyPaths();
    if (before.length) {
      console.error('作業ツリーがクリーンでないので走らせない — **人の編集を潰さない。**');
      for (const d of before.slice(0, 5)) console.error(`  ${d.code} ${d.file}`);
      process.exit(1);
    }
    console.log(`書き出す側を実際に走らせる — ${doc.run.length} 本\n`);
    try {
      problems.push(...doRun(doc));
    } finally {
      const restored = restore(before);
      if (restored.length) console.log(`\n  （${restored.length} 件を元へ戻した）`);
      const left = dirtyPaths().filter((d) => !before.some((b) => b.file === d.file));
      if (left.length) {
        console.error('**戻しきれていない**:');
        for (const d of left) console.error(`  ${d.code} ${d.file}`);
        process.exit(1);
      }
    }
  } else {
    console.log(`書き出す側 ${scanWriters().length} 本`
      + `（走らせる ${doc.run.length} / 走らせない ${doc.never_run.length}）`);
    console.log('  **これは一覧の照合だけ。**実際に動かすのは --run');
  }

  if (problems.length) {
    console.error('\n生成器: 不整合');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\n書き出す側は全部台帳にあり、走らせたものは全部通った。');
}
