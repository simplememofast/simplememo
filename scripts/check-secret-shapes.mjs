#!/usr/bin/env node
/**
 * 追跡ファイルに資格情報の形をした値が入っていないか（2026-11-10 監査）。
 *
 *   node scripts/check-secret-shapes.mjs            # 追跡ファイルを走査（該当があれば exit 1）
 *   node scripts/check-secret-shapes.mjs --selftest
 *
 * 出すのは `path:line kind` だけで、値は出さない。追跡ファイルは全部読む —— 生成ロケールと
 * js/i18n/ も読む（各ロケールの index.html は data/i18n/pages.json の existing＝手書きで写しではなく、
 * ロケールのディレクトリに置いた登録外のファイルは翻訳の検査も読まない）。全部読んでも数秒で済む。
 * バイナリ（NUL を含む）は読まない。ファイル名も読む（名前は中身と同じく公開される）。名前が
 * 当たったときは名前そのものが値なので、パスを出さずに追跡一覧の何番目かだけを出す。
 * 許可はパス＋種類の明示リスト（ALLOW）。いまは空で通る。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanText, SECRET_SHAPES, SHAPE_SAMPLES } from './lib/secret-shapes.mjs';
import { GIT_REPOSITORY_ENV } from './lib/preflight-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** `path` と `kind` の組で許す。足すときは、なぜ実値でないかを書く。 */
const ALLOW = [];

/** Scans every tracked file of `root` (names, then text contents). Findings carry a path or an index, never a value. */
function scanTracked(root, allow = ALLOW, env = process.env) {
  const files = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env })
    .split('\0').filter(Boolean);
  const findings = [];
  // Names first, each on its own (a name may hold a newline). A matching path is never printed: the name is the value.
  const badNames = new Set();
  for (const [index, file] of files.entries()) {
    for (const hit of scanText(file)) {
      badNames.add(index);
      findings.push(`(追跡ファイル一覧の ${index + 1} 番目の名前) ${hit.kind}`);
    }
  }
  let unread = 0;
  let binary = 0;
  for (const [index, file] of files.entries()) {
    let buf;
    // A tracked path missing from the checkout (deleted locally, or a gitlink) is counted, not hidden.
    try { buf = fs.readFileSync(path.join(root, file)); } catch { unread += 1; continue; }
    if (buf.includes(0)) { binary += 1; continue; }
    for (const hit of scanText(buf.toString('utf8'))) {
      if (allow.some((a) => a.path === file && a.kind === hit.kind)) continue;
      findings.push(`${badNames.has(index) ? `(追跡ファイル一覧の ${index + 1} 番目)` : file}:${hit.line} ${hit.kind}`);
    }
  }
  return { count: files.length, binary, unread, findings };
}

/**
 * The environment for git in a throwaway repository: none of the variables that point git at another
 * repository or index (GIT_REPOSITORY_ENV, shared with preflight-runner.mjs, plus the numbered
 * GIT_CONFIG_KEY_n / VALUE_n), and no system or global configuration.
 */
function isolatedGitEnv(base) {
  const env = { ...base };
  for (const key of Object.keys(env)) {
    if (GIT_REPOSITORY_ENV.includes(key) || /^GIT_CONFIG_(?:KEY|VALUE)_\d+$/.test(key)) delete env[key];
  }
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
}
const git = (args, env) => execFileSync('git', ['-c', `core.hooksPath=${os.devNull}`, ...args], { encoding: 'utf8', env });

/** Builds the synthetic tree in a fresh temporary repository and walks it with git run under `base` (isolated). */
function repoWalkFixture(base, aws, ghp) {
  const env = isolatedGitEnv(base);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-shapes-'));
  try {
    const put = (file, body) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), body);
    };
    put('index.html', '<p>clean</p>\n');
    put('ko/index.html', `<p>hand-written</p>\n<!-- ${aws} -->\n`);
    put('zh/tmp/notes.txt', `key=${ghp}\n`);
    put('js/i18n/ko/app.0123456789ab.js', `export default {"a":"${aws}"};\n`);
    put('data/zz-escaped.json', JSON.stringify({ note: 'first line\n' + ghp }) + '\n');
    put(`obsidian/${aws}/index.html`, `<p>${ghp}</p>\n`); // the name and the body both match
    git(['init', '-q', dir], env);
    git(['-C', dir, 'add', '-A'], env);
    return scanTracked(dir, [], env);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selftest() {
  let failed = 0;
  const t = (name, ok) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); };
  for (const [kind, sample] of SHAPE_SAMPLES.positive) {
    const hits = scanText(sample);
    t(`拾う: ${kind}`, hits.some((h) => h.kind === kind));
    t(`出力に値が入らない: ${kind}`, !JSON.stringify(hits).includes(sample.slice(-12)));
  }
  for (const sample of SHAPE_SAMPLES.negative) t(`拾わない: ${sample.slice(0, 40)}`, scanText(sample).length === 0);
  t('どの形にも陽性の検体がある（形を足したら検体も足す）',
    SECRET_SHAPES.every(([kind]) => SHAPE_SAMPLES.positive.some(([k]) => k === kind)));

  // The repo walk itself, on a throwaway index (synthetic values only; nothing is committed or pushed).
  const aws = 'AKIA' + 'Q'.repeat(16);
  const ghp = 'ghp_' + 'a1B2c3D4e5'.repeat(4);
  {
    const { findings, count } = repoWalkFixture(process.env, aws, ghp);
    const has = (line) => findings.includes(line);
    t('走査: 手書きのロケールのページを読む（ko/index.html）', has('ko/index.html:2 aws_access_key'));
    t('走査: ロケールのディレクトリの登録外のファイルを読む', has('zh/tmp/notes.txt:1 github_token'));
    t('走査: 生成された js/i18n も読む', has('js/i18n/ko/app.0123456789ab.js:1 aws_access_key'));
    t('走査: JSON のエスケープ（\\n）の直後の値を拾う', has('data/zz-escaped.json:1 github_token'));
    t('走査: ファイル名に入った値を拾い、名前は出さない（そのファイルの中身の該当も番号で出す）',
      findings.some((f) => /^\(追跡ファイル一覧の \d+ 番目の名前\) aws_access_key$/.test(f))
      && findings.some((f) => /^\(追跡ファイル一覧の \d+ 番目\):1 github_token$/.test(f)));
    t('走査: 該当のないファイルは出さない・全件を数える', !findings.some((f) => f.startsWith('index.html')) && count === 6);
    t('走査: 出力に値が入らない', !findings.some((f) => f.includes(aws) || f.includes(ghp)));
  }
  // 2026-11-10 re-review: git exports GIT_DIR to hooks (and GIT_INDEX_FILE, an absolute temp
  // index, for a partial commit). Inherited, they made the throwaway `git init` / `git add` stage
  // the synthetic values in the caller's repository. Run the walk with such an environment aimed at
  // a decoy repository and require the decoy's index to stay as it was.
  const decoy = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-shapes-decoy-'));
  try {
    const clean = isolatedGitEnv(process.env);
    fs.writeFileSync(path.join(decoy, 'a.txt'), 'decoy\n');
    git(['init', '-q', decoy], clean);
    git(['-C', decoy, 'add', 'a.txt'], clean);
    const status = () => git(['-C', decoy, 'status', '--porcelain', '--untracked-files=all'], clean);
    const before = status();
    const hostile = { ...process.env, GIT_DIR: path.join(decoy, '.git'), GIT_INDEX_FILE: path.join(decoy, '.git', 'index') };
    const { count } = repoWalkFixture(hostile, aws, ghp);
    t('走査: 呼び出し元の GIT_DIR / GIT_INDEX_FILE を使わない（呼び出し元の索引に検体を足さない）',
      status() === before && count === 6);
  } finally {
    fs.rmSync(decoy, { recursive: true, force: true });
  }
  console.log(`\n  自己テスト 失敗 ${failed} 件`);
  return failed;
}

if (process.argv.includes('--selftest')) process.exit(selftest() ? 1 : 0);

const { count, binary, unread, findings } = scanTracked(ROOT);
if (findings.length) {
  console.error(`資格情報の形をした値が ${findings.length} 件（値は出していない）:`);
  for (const f of findings) console.error(`  ${f}`);
  console.error('実値なら、消すだけでなく発行元で失効させること（公開リポジトリは履歴も読める）。');
  process.exit(1);
}
console.log(`資格情報の形をした値なし（追跡ファイル ${count} 件。うちバイナリ ${binary} 件と読めなかった ${unread} 件は読んでいない）。`);
