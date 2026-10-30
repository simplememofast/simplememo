#!/usr/bin/env node
/**
 * 資格情報の権限・経路・失効手順 — 「止めたいときに、どれを失効させるか」に答えられるか。
 *
 *   node scripts/check-credentials.mjs          # 一覧
 *   node scripts/check-credentials.mjs --check  # CI
 *   node scripts/check-credentials.mjs --stop <経路>   # その経路を止める鍵を出す
 *
 * 【なぜ作るか】
 * 緊急停止の台帳には、この仕組みの外にある最後の手段として
 * **「credential-expiry.json に載っている鍵を無効化する」**と書いてあった。
 * ところが 2026-08-22 に数えたら、ワークフローが実際に使っている secret 11件のうち
 * **台帳にあったのは3件だけ**で、主系を止める鍵（GH_PAT）が入っていなかった。
 * つまり最後の手段が指す先が空だった。**平常時には何の症状も出ない穴。**
 *
 * だから見るのは、期限（それは check-expiry.mjs の仕事）ではなく次の5つ:
 *   1. ワークフローが読む secret が全部台帳にあるか（新しい経路が増えたときに漏れる）
 *   2. 鍵ごとに**失効のさせ方**と**失効させると何が止まるか**が書いてあるか
 *   3. 経路（emergency-stop.json の agents）ごとに、止められる鍵が1つ以上あるか
 *   4. 「自動運転を止める」と名乗る鍵が実在するか
 *   5. secret を**名前で1つずつ**読んでいるか（2026-10-30・セキュリティ監査 F6 の残り）。
 *      `${{ toJSON(secrets) }}`・`secrets[…]`・`${{ secrets }}`・`secrets: inherit` は名前を
 *      書かずに全部を渡すので、1 の台帳もモデルのジョブの検査もすり抜ける。モデルのジョブでは
 *      例外なく落とし、それ以外のジョブは台帳の `$bulk_secret_access`（workflow・job・reason）に
 *      書いたものだけを通す。規則は scripts/lib/workflow-secrets.mjs。ワークフローは字面ではなく
 *      YAML として読む（ruby の Psych）。**読めないファイルは落とす**（飛ばさない）。
 *
 * 【renewal と revocation は別物】
 * 更新手順があることは、失効手順があることを意味しない。急いでいるときに
 * 「どこを押せば止まるか」が書いていない台帳は、読む時間のほうが長くなる。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assert, ledgerScenarios, run } from './lib/selftest.mjs';
import { DOTNET_WHITESPACE, bulkSecretFindings, bulkSecretProblems, inspectWorkflows, readYamlEvents } from './lib/workflow-secrets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRED_PATH = path.join(ROOT, 'data/credential-expiry.json');
const STOP_PATH = path.join(ROOT, 'data/emergency-stop.json');
const WF_DIRS = [
  path.join(ROOT, '.github/workflows'),
  path.join(ROOT, '../simplememo-ios/.github/workflows'),
  path.join(ROOT, '../simplememo-api/.github/workflows'),
];

/** ワークフローが実際に読んでいる secret 名を集める。台帳ではなく**現物**から。 */
export function secretsInUse(dirs = WF_DIRS, { required = false } = {}) {
  const found = new Map(); // name -> [file]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      if (required) throw new Error(`検査対象が存在しない: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x));
    if (required && files.length === 0) throw new Error(`検査対象にワークフローが無い: ${dir}`);
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/secrets(?:\.([A-Z0-9_]+)|\[\s*['"]([A-Z0-9_]+)['"]\s*\])/g)) {
        const name = m[1] || m[2];
        const list = found.get(name) || [];
        if (!list.includes(f)) list.push(f);
        found.set(name, list);
      }
    }
  }
  return found;
}

/** UTF-8 として読めないファイルは text: null（検査が「読めない」で落とす。置換文字で読み進めない）。 */
const readWorkflows = (dir) => fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x)).map((name) => {
  try { return { name, text: new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(path.join(dir, name))) }; }
  catch { return { name, text: null }; }
});

/** 名前を書かずに secret を読む箇所（5）。ディレクトリごとに読む（呼び先の解決は同じディレクトリの中）。 */
export function bulkSecretsInUse(dirs = WF_DIRS) {
  return dirs.filter((dir) => fs.existsSync(dir)).flatMap((dir) => bulkSecretFindings(readWorkflows(dir)));
}

/** 台帳が申告している secret 名（1件が複数を束ねることがある）。 */
export function declaredSecrets(doc) {
  const out = new Map();
  for (const c of doc.credentials || []) {
    for (const name of String(c.secret || '').split('/').map((s) => s.trim()).filter(Boolean)) {
      out.set(name, c.id);
    }
  }
  return out;
}

export function validate(doc, stopDoc, inUse) {
  const problems = [];
  const declared = declaredSecrets(doc);
  const exempt = Object.keys(doc.$exempt_secrets || {});

  // 1. 現物にあって台帳に無い secret
  for (const [name, files] of inUse) {
    if (exempt.includes(name) || declared.has(name)) continue;
    problems.push(`secret ${name} をワークフローが読んでいるのに台帳に無い（${files.join(', ')}）`
      + ' — **止めたいときに、その鍵の存在に気づけない**');
  }
  // 台帳にあって現物に無いものは落とさない（Workers の secret など、
  // ワークフロー以外から使う鍵が正当に存在する）。ただし数えて出す。

  // 2. 失効手順と影響範囲
  for (const c of doc.credentials || []) {
    if (!c.revocation) {
      problems.push(`${c.id}: revocation が無い — 更新手順（renewal）は失効手順ではない`);
    }
    if (!c.blast_radius) {
      problems.push(`${c.id}: blast_radius が無い — **止める前に何が止まるかを読めない台帳は、急いでいるときに読まれない**`);
    }
    for (const a of c.agents || []) {
      if (!stopDoc.agents?.[a]) {
        problems.push(`${c.id}: 経路 "${a}" が emergency-stop.json に無い — 台帳どうしが食い違っている`);
      }
    }
  }

  // 3. 経路ごとに止められる鍵があるか
  const routes = Object.keys(stopDoc.agents || {}).filter((k) => !k.startsWith('$'));
  for (const r of routes) {
    const keys = (doc.credentials || []).filter((c) => (c.agents || []).includes(r));
    if (!keys.length) {
      problems.push(`経路 "${r}" を止められる鍵が台帳に1つも無い`
        + ' — 判定が壊れているときの最後の手段が、この経路には存在しないことになる');
    }
  }

  // 4. 「自動運転を止める」と名乗る鍵が実在するか
  const stoppers = (doc.credentials || []).filter((c) => c.revoke_stops_automation);
  if (!stoppers.length) {
    problems.push('revoke_stops_automation の鍵が1件も無い'
      + ' — 緊急停止の台帳が書いている**最後の手段が指す先が空**');
  }
  return problems;
}


// ── 自己テスト（**落ちることを確かめる**） ──────────────────────
const SELFTEST_BREAKAGES = [
  ['**失効手順が無い**のは落ちる（更新手順は失効手順ではない）', (d) => { delete d.credentials[0].revocation; }],
  ['**止めたとき何が止まるかが無い**のは落ちる', (d) => { delete d.credentials[0].blast_radius; }],
  ['emergency-stop に無い経路を名乗ったら落ちる', (d) => { d.credentials[0].agents = ['そんな経路は無い']; }],
];
const SCENARIOS = ledgerScenarios(
  () => JSON.parse(fs.readFileSync(CRED_PATH, 'utf8')),
  (d) => validate(d, JSON.parse(fs.readFileSync(STOP_PATH, 'utf8')), secretsInUse()),
  SELFTEST_BREAKAGES,
);

SCENARIOS.push(['明示した検査対象の欠落・空ディレクトリは成功にしない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-scan-'));
  try {
    for (const target of [path.join(dir, 'missing'), dir]) {
      let rejected = false;
      try { secretsInUse([target], { required: true }); } catch { rejected = true; }
      assert(rejected, '検査対象なしを成功にした');
    }
    fs.writeFileSync(path.join(dir, 'test.yml'), "token: ${{ secrets.NEW_UNREGISTERED_KEY }}\nother: ${{ secrets['BRACKET_KEY'] }}\n");
    const found = secretsInUse([dir], { required: true });
    assert(found.has('NEW_UNREGISTERED_KEY') && found.has('BRACKET_KEY'), '実物のsecretを収集できない');
    const doc = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    const stop = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
    assert(validate(doc, stop, found).some(p => p.includes('NEW_UNREGISTERED_KEY')), '未登録secretで落ちない');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}]);

// ── 5. 名前で読まない secret（監査 F6 の残り）──────────────────────
// 検体は obsidian-autopilot.yml の形（モデルの無い collect → モデルのジョブ → 再利用ワークフローの
// 呼び出し）を縮めたもの。sibling リポジトリの CI はこのファイルを .github 無しで動かすので、
// 実物のワークフローを使う検体は、実物があるときだけ足す（下）。
const BULK_FIXTURE = {
  'fixture.yml': [
    'name: fixture',
    'on:',
    '  workflow_dispatch:',
    'permissions: {}',
    'env:',
    "  PLAIN: 'secrets are named one by one'",
    'jobs:',
    '  collect:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Collect',
    '        env:',
    '          GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}',
    '        run: node scripts/autopilot-data.mjs --digest "$RUNNER_TEMP/gsc-digest"',
    '  autopilot:',
    '    needs: collect',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - name: Gate',
    '        id: gate',
    "        if: always() && steps.secrets.outputs.ok != 'secrets'",
    "        run: echo \"${{ format('{0}', 'secrets') }}\"",
    '      - name: Claude Code',
    '        id: claude',
    '        uses: anthropics/claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13',
    '        env:',
    '          GH_TOKEN: ${{ github.token }}',
    '        with:',
    '          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
    "          github_token: ${{ secrets['GITHUB_TOKEN'] }}",
    '  call:',
    '    uses: ./.github/workflows/callee.yml',
    '    secrets: inherit',
    '',
  ].join('\n'),
  'callee.yml': [
    'on:',
    '  workflow_call:',
    'jobs:',
    '  publish:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo publish',
    '        env:',
    '          TOKEN: ${{ secrets.GH_PAT }}',
    '',
  ].join('\n'),
};
const bulkFiles = (edit = (files) => files) => Object.entries(edit({ ...BULK_FIXTURE })).map(([name, text]) => ({ name, text }));
/** 検体の書き換え。**置き換える先が無ければ落ちる**（黙って元の検体を検査しない）。`$` は特別扱いしない。 */
const replace = (file, from, to) => (f) => {
  assert(f[file].includes(from), `検体に「${from.trim()}」が無い（自己テストの書き方の誤り）`);
  return { ...f, [file]: f[file].replace(from, () => to) };
};
const chain = (...edits) => (f) => edits.reduce((acc, edit) => edit(acc), f);
const MODEL_SECRET = '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}';
const inModel = (form) => replace('fixture.yml', MODEL_SECRET, form);
const MODEL_ENV = '          GH_TOKEN: ${{ github.token }}\n';
const COLLECT_ENV = '          GOOGLE_SERVICE_ACCOUNT_JSON: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}\n';
const MODEL_WITH = "          github_token: ${{ secrets['GITHUB_TOKEN'] }}\n";
const lines = (...l) => l.map((x) => `          ${x}\n`).join('');
const modelEnv = (...l) => replace('fixture.yml', MODEL_ENV, MODEL_ENV + lines(...l));
const collectEnv = (...l) => replace('fixture.yml', COLLECT_ENV, COLLECT_ENV + lines(...l));
const modelCallee = replace('callee.yml', '      - run: echo publish', '      - uses: anthropics/claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13');
const INHERIT = '    secrets: inherit\n';
/** YAML の単引用符の '' で、式の中に '}}' を作る形（字面の切り出しは途中で止まる）。 */
const quoteTrick = (body) => `'\${{ ''}}'' && ${body} }}'`;

/** モデルのジョブ（autopilot）に入れたら、例外を書いても落ちなければならない形。 */
const BULK_BREAKAGES = [
  ['toJSON(secrets) を経由して名前を引く', inModel('${{ fromJSON(toJSON(secrets)).CLAUDE_CODE_OAUTH_TOKEN }}')],
  ['関数名の大文字小文字を変えた toJson(secrets)', inModel('${{ toJson(secrets) }}')],
  ['${{ secrets }} そのもの', inModel('${{ secrets }}')],
  ['format で作った添字 secrets[format(…)]', inModel("${{ secrets[format('{0}_TOKEN', 'CLAUDE_CODE_OAUTH')] }}")],
  ['変数の添字 secrets[env.NAME]', inModel('${{ secrets[env.NAME] }}')],
  ['全部を並べる secrets.*', inModel("${{ join(secrets.*, ',') }}")],
  ['文脈名の大文字 SECRETS.NAME（大文字小文字を区別する名前の検査をすり抜ける）', inModel('${{ SECRETS.CLAUDE_CODE_OAUTH_TOKEN }}')],
  ['名前の小文字 secrets.name（同上）', inModel('${{ secrets.claude_code_oauth_token }}')],
  ['YAML の二重引用符のエスケープ（\\x73ecrets）', inModel('"${{ toJSON(\\x73ecrets) }}"')],
  ['YAML の行継ぎ（行末の \\）で分けた字面', inModel('"${{ toJSON(sec\\\n            rets) }}"')],
  ["YAML の単引用符の '' で式の中に '}}' を作る（切り出しが途中で止まる）",
    inModel(quoteTrick('fromJSON(toJSON(secrets)).CLAUDE_CODE_OAUTH_TOKEN'))],
  ["format の書式に '}}' を入れる（同上）", inModel("'${{ format(''{0}}}'', toJSON(secrets)) }}'")],
  ['単引用符の値を折り返して、secrets を ${{ の無い行に置く', inModel("'${{ ''}}''\n            && toJSON(secrets) }}'")],
  ['複数行の式', replace('fixture.yml', 'id: claude\n',
    'id: claude\n        run: |\n          echo "${{\n            toJSON(secrets)\n          }}"\n')],
  ['if: の式（${{ }} なし）', replace('fixture.yml', 'id: claude\n', "id: claude\n        if: contains(toJSON(secrets), 'x')\n")],
  ['run: の中の # の行（GitHub はシェルより先に式を展開する）', replace('fixture.yml', 'id: claude\n',
    'id: claude\n        run: |\n          # ${{ toJSON(secrets) }}\n')],
  ['ワークフロー全体の env（モデルのジョブにも効く）', replace('fixture.yml', 'env:\n  PLAIN:', 'env:\n  ALL: ${{ toJSON(secrets) }}\n  PLAIN:')],
  ['secrets: inherit でモデルを動かす呼び先へ渡す', modelCallee],
  ['secrets: inherit で中身を確かめられない外の呼び先へ渡す', replace('fixture.yml',
    'uses: ./.github/workflows/callee.yml', 'uses: example/repo/.github/workflows/x.yml@0123456789abcdef0123456789abcdef01234567')],
];
const ALLOW_MODEL = [{ workflow: 'fixture.yml', job: 'autopilot', reason: '検体' }, { workflow: 'fixture.yml', job: '(workflow)', reason: '検体' },
  { workflow: 'fixture.yml', job: 'call', reason: '検体' }];

// 2026-10-30 の作り直し: 字面を追う版（cdc207a9f）が0件で通した5系統（A〜E）と、名前を字面から
// 隠す書き方（L）。独立したレビューが実物のワークフローで示したもの。
const escaped = (e) => inModel(`"\${{ fromJSON(toJSON(${e}secrets)).CLAUDE_CODE_OAUTH_TOKEN }}"`);
const toModelTrick = inModel(quoteTrick('fromJSON(toJSON(secrets)).CLAUDE_CODE_OAUTH_TOKEN'));
const inheritAs = (to) => chain(modelCallee, replace('fixture.yml', INHERIT, to));
const jobsAs = (header) => replace('fixture.yml', '\njobs:\n', `\n${header}\n`);
const bomb = ['a: &a [x, x, x, x, x, x, x, x, x, x]',
  ...['b', 'c', 'd', 'e'].map((k, n) => `${k}: &${k} [${Array(10).fill(`*${'abcd'[n]}`).join(', ')}]`),
  'jobs:', '  a:', '    runs-on: ubuntu-latest', '    steps: [{ run: echo }]', ''].join('\n');

/**
 * [名前, 書き換え, モデルのジョブ（file#job）, 抜粋に含まれるべき文字列]。どれも、全部のジョブに例外を
 * 書いても落ちなければならない。
 */
const MODEL_BYPASSES = [
  ['(A) 二重引用符の \\t を secrets の前に置く', escaped('\\t')],
  ['(A) 二重引用符の \\n', escaped('\\n')],
  ['(A) 二重引用符の \\_（U+00A0）', escaped('\\_')],
  ['(A) 二重引用符の \\L（U+2028）', escaped('\\L')],
  ['(A) 二重引用符の \\N（U+0085）', escaped('\\N')],
  ['(A) 二重引用符の \\P（U+2029）', escaped('\\P')],
  ['(A) 二重引用符の \\ ・\\v・\\f・\\r（空白のエスケープ）', escaped('\\ \\v\\f\\r')],
  ['(A) ${{ の直後の \\t（${{\\tsecrets }}）', inModel('"${{\\tsecrets }}"')],
  ['(A) secrets.* の前の \\t', inModel('"${{ join(\\tsecrets.*, \',\') }}"')],
  ["(A) 単引用符の '' と、生の U+0085 を secrets の前後に置く", inModel(quoteTrick('fromJSON(toJSON(\u0085secrets\u0085)).CLAUDE_CODE_OAUTH_TOKEN'))],
  ["(B) '' の後ろで名前を小文字にする secrets.gcp_service_account_json", inModel(quoteTrick('secrets.gcp_service_account_json'))],
  ["(B) '' の後ろで文脈名を大文字にする SECRETS.GH_PAT", inModel(quoteTrick('SECRETS.GH_PAT'))],
  ["(B) '' の後ろで添字の名前を小文字にする secrets[''gh_pat'']", inModel(quoteTrick("secrets[''gh_pat'']"))],
  ["(B) 文脈名の先頭だけ大文字 Secrets['GH_PAT']", inModel("${{ Secrets['GH_PAT'] }}")],
  ["(B) 添字の名前の小文字 secrets['gh_pat']", inModel("${{ secrets['gh_pat'] }}")],
  ['(B) 間に空白を入れた secrets . GH_PAT（名前の検査の字面に合わない）', inModel('${{ secrets . GH_PAT }}')],
  ["(B) 添字の中の空白 secrets[ 'GH_PAT' ]", inModel("${{ secrets[ 'GH_PAT' ] }}")],
  // 同じ値の地の文に正しい字面を置き、名前が字面にあるかの検査では拾えない形にする（読み方の判定だけで落とす）。
  ['(B) 地の文に secrets.GH_PAT を置いても、文脈名の大文字 SECRETS.GH_PAT は落とす', inModel('${{ SECRETS.GH_PAT }} secrets.GH_PAT')],
  ['(B) 地の文に secrets.GH_PAT を置いても、間に空白を入れた secrets . GH_PAT は落とす', inModel('${{ secrets . GH_PAT }} secrets.GH_PAT')],
  ['(C) secrets: の値を次の行に置く', inheritAs('    secrets:\n      inherit\n'), 'fixture.yml#call'],
  ['(C) 鍵を引用符で囲む "secrets": inherit', inheritAs('    "secrets": inherit\n'), 'fixture.yml#call'],
  ['(C) 折り畳みのブロック secrets: >-', inheritAs('    secrets: >-\n      inherit\n'), 'fixture.yml#call'],
  ["(C) 値を引用符で囲む secrets: 'inherit'", inheritAs("    secrets: 'inherit'\n"), 'fixture.yml#call'],
  ['(C) 型を書く secrets: !!str inherit', inheritAs('    secrets: !!str inherit\n'), 'fixture.yml#call'],
  ['(C) コロンの前の空白 secrets : inherit', inheritAs('    secrets : inherit\n'), 'fixture.yml#call'],
  ['(C) 複合キー ? secrets', inheritAs('    ? secrets\n    : inherit\n'), 'fixture.yml#call'],
  ['(C) ジョブをフロー形式で書く { uses: …, secrets: inherit }', chain(modelCallee, replace('fixture.yml',
    `  call:\n    uses: ./.github/workflows/callee.yml\n${INHERIT}`, '  call: { uses: ./.github/workflows/callee.yml, secrets: inherit }\n')), 'fixture.yml#call'],
  ['(C) 外のリポジトリの呼び先へ、次の行の inherit', chain(replace('fixture.yml', 'uses: ./.github/workflows/callee.yml',
    'uses: example/agent/.github/workflows/agent.yml@0123456789abcdef0123456789abcdef01234567'), replace('fixture.yml', INHERIT, '    secrets:\n      inherit\n')), 'fixture.yml#call'],
  ["(D) モデルの無いジョブで '' の形のアンカーを作り、モデルのジョブでエイリアスを参照する",
    chain(collectEnv(`BULK_LIST: &all ${quoteTrick('toJSON(secrets)')}`), modelEnv('ALL: *all'))],
  ['(D) env の対応表ごとアンカーにして、モデルの段でエイリアスにする', chain(
    replace('fixture.yml', `        env:\n${COLLECT_ENV}`, `        env: &envs\n          ALL: \${{ toJSON(secrets) }}\n${COLLECT_ENV}`),
    replace('fixture.yml', `        env:\n${MODEL_ENV}`, '        env: *envs\n'))],
  ['(D) 名前1つの読み方でも、エイリアスでモデルのジョブへ持ち込む（ジョブの字面に名前が無い）', chain(
    replace('fixture.yml', COLLECT_ENV, '          GOOGLE_SERVICE_ACCOUNT_JSON: &gcp ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}\n'), modelEnv('G: *gcp'))],
  ['(D) 同じ名前のアンカーを定義し直す（GitHub は最後の定義を使う）', chain(
    collectEnv('A1: &x harmless', `A2: &x \${{ toJSON(secrets) }}`), modelEnv('X: *x'))],
  ['(D) モデルの印をエイリアスで持ち込んだジョブも、モデルのジョブとして扱う', chain(
    replace('fixture.yml', 'uses: anthropics/claude-code-action@', 'uses: &act anthropics/claude-code-action@'),
    (f) => ({ ...f, 'fixture.yml': `${f['fixture.yml']}  sneaky:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: *act\n        with:\n          all: \${{ toJSON(secrets) }}\n` })),
    'fixture.yml#sneaky'],
  ['(C) inherit をエイリアスで書く secrets: *inh', chain(modelCallee,
    replace('fixture.yml', "  PLAIN: 'secrets are named one by one'\n", "  PLAIN: 'secrets are named one by one'\n  MODE: &inh inherit\n"),
    replace('fixture.yml', INHERIT, '    secrets: *inh\n')), 'fixture.yml#call'],
  ['(E) jobs : （コロンの前に空白）', chain(jobsAs('jobs :'), toModelTrick)],
  ['(E) "jobs":', chain(jobsAs('"jobs":'), toModelTrick)],
  ["(E) 'jobs':", chain(jobsAs("'jobs':"), toModelTrick)],
  ['(E) 複合キー ? jobs', chain(jobsAs('? jobs\n:'), toModelTrick)],
  ['(E) jobs の鍵をエイリアスで書く *k :', chain(replace('fixture.yml', 'name: fixture\n', 'name: &k jobs\n'), jobsAs('*k :'), toModelTrick)],
  ['(E) 単引用符の値の続きを0桁目に置く', inModel("'${{ ''}}''\n&& fromJSON(toJSON(secrets)).CLAUDE_CODE_OAUTH_TOKEN }}'")],
  ['(E) 改行が CR だけのファイル', chain(toModelTrick, (f) => ({ ...f, 'fixture.yml': f['fixture.yml'].replace(/\n/g, '\r') }))],
  ['(E) ファイル全体をフロー形式で書く', (f) => ({ ...f, 'flow.yml': '{on: push, jobs: {ai: {runs-on: x, steps: [{uses: anthropics/claude-code-action@925afb53776cf1a2b738c6bdbed37b4d4000ef13, with: {t: "${{ toJSON(secrets) }}"}}]}}}\n' }),
    'flow.yml#ai'],
  ['ワークフロー全体の env にモデルの鍵があれば、印の無いジョブもモデルのジョブ', chain(
    replace('fixture.yml', "env:\n  PLAIN:", 'env:\n  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}\n  PLAIN:'),
    replace('fixture.yml', COLLECT_ENV, '          ALL: ${{ toJSON(secrets) }}\n')), 'fixture.yml#collect'],
  ['対応表の鍵に書いた式（GitHub は鍵の式も読む場所がある）', modelEnv('"${{ toJSON(secrets) }}": x')],
  ['(L) 名前の1文字を YAML のエスケープで書く secrets.GCP_SERVICE_ACCOUNT_JSO\\x4e', modelEnv('G: "${{ secrets.GCP_SERVICE_ACCOUNT_JSO\\x4e }}"')],
  ["(L) 単引用符の中の secrets[''GCP_SERVICE_ACCOUNT_JSON'']（'' のままでは名前の検査が読めない）",
    modelEnv("G: '${{ secrets[''GCP_SERVICE_ACCOUNT_JSON''] }}'")],
  ['(L) 名前の途中で行継ぎ（行末の \\）', modelEnv('G: "${{ secrets.GCP_SERVICE_\\\n            ACCOUNT_JSON }}"')],
  // 字面の位置（libyaml の行・桁）を1行でも取り違えると、前後の行のコメントにある名前を「字面にある」と
  // 数えて見落とす。libyaml が改行に数える文字（CRLF・U+0085・U+2028）を前に置く（BOM・絵文字も混ぜる）。
  ['(L) エスケープで書いた名前は、前後の行のコメントに同じ名前を字面で書いても見つける（BOM・CRLF・U+0085・U+2028・絵文字の後ろ）', chain(
    modelEnv("N: 'a\u0085b'", "S: 'c\u2028d'", 'J: "日本語の説明🙂"', '#   secrets.GCP_SERVICE_ACCOUNT_JSON',
      'G: "${{ secrets.GCP_SERVICE_ACCOUNT_JSO\\x4e }}"', '#   secrets.GCP_SERVICE_ACCOUNT_JSON'),
    (f) => ({ ...f, 'fixture.yml': `\uFEFF${f['fixture.yml'].replace(/\n/g, '\r\n')}` })), 'fixture.yml#autopilot', 'secrets.GCP_SERVICE_ACCOUNT_JSON（'],
];

/** 誤検出しない形（どれも検出0件）。 */
const BULK_PASSES = [
  ["名前で1つずつ読む検体（文字列の中の secrets・steps.secrets・secrets['NAME']・モデルの無い呼び先への inherit）", (f) => f],
  ['モデルの無いジョブの説明文の「, secrets,」', collectEnv("NOTE: 'No send, secrets, adoption or billing'")],
  ['モデルのジョブの prompt の文章（箇条書き・&&・括弧・needs の配列）', replace('fixture.yml', MODEL_WITH, MODEL_WITH + lines('prompt: |',
    '  Never print secrets, tokens or keys.', '  Do not echo any value (tokens, secrets).', '  Do not reveal secrets.', '  * Then open a PR.',
    '  If unsure about secrets && tokens, stop.', '  needs: [build, secrets]'))],
  ['YAML のコメント（GitHub は読まない）', modelEnv('# ${{ toJSON(secrets) }} はコメント')],
  ["式の中の文字列（'' のエスケープを含む）と steps.secrets", modelEnv("A: \"${{ format('it''s {0}', 'secrets') }}\"", "B: ${{ 'toJSON(secrets)' }}",
    'C: ${{ steps.secrets.outputs.x }}')],
  ['名前1つの読み方を単引用符・折り畳み・フロー形式で書く', modelEnv("T: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}'",
    'U: >-', '  ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}', "V: { W: \"${{ secrets['GITHUB_TOKEN'] }}\" }")],
  ['BOM・CRLF・絵文字・U+0085・U+2028 の後ろでも、字面の位置を取り違えない', chain(
    modelEnv("N: 'a\u0085b'", "S: 'c\u2028d'", 'J: "日本語の説明🙂"', "T: '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}'"),
    (f) => ({ ...f, 'fixture.yml': `\uFEFF${f['fixture.yml'].replace(/\n/g, '\r\n')}` }))],
  ['if: の値を2通り（${{ }} の中と、値そのもの）に読んでも、名前1つの読み方を二重に数えない',
    replace('fixture.yml', 'id: claude\n', "id: claude\n        if: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN != '' }}\n")],
];

/** 読めないファイル（どれも例外にできない問題になる）。 */
const PARSE_FAILURES = [
  ['YAML の構文の誤り', { 'broken.yml': 'jobs:\n  a: [1\n' }, ''],
  ['文書が2つ（GitHub も受け付けない）', { 'two.yml': 'on: push\njobs:\n  a: { runs-on: x }\n---\njobs:\n  b: { runs-on: x }\n' }, '文書が 2 個'],
  ['空のファイル', { 'empty.yml': '' }, '文書が 0 個'],
  ['定義されていないアンカーへのエイリアス', { 'alias.yml': 'jobs:\n  a:\n    env: *nope\n' }, '定義されていないアンカー'],
  ['自分自身を参照するエイリアス', { 'loop.yml': 'jobs: &j\n  a: *j\n' }, '自分自身を参照する'],
  ['展開すると GitHub の上限（50000 ノード）を超えるエイリアス', { 'bomb.yml': bomb }, 'ノードが 50000 を超える'],
  ['jobs の鍵が無い（ワークフロー全体の env だけ）', { 'nojobs.yml': 'on: push\nenv:\n  X: ${{ toJSON(secrets) }}\n' }, 'ジョブが1つも無い'],
  ['jobs が空', { 'emptyjobs.yml': 'on: push\njobs: {}\n' }, 'ジョブが1つも無い'],
  ['jobs の値が対応表でない', { 'seqjobs.yml': 'on: push\njobs: [a]\n' }, 'jobs の値が対応表でない'],
  ['最上位が対応表でない', { 'list.yml': '- on: push\n  jobs: {}\n' }, '最上位が対応表でない'],
];

const findingsOf = (files) => bulkSecretFindings(files);
const allowEvery = (findings) => findings.map((f) => ({ workflow: f.file, job: f.job, reason: '検体' }));

for (const [name, edit] of BULK_PASSES) {
  SCENARIOS.push([`**誤検出しない**: ${name}`, () => {
    const findings = findingsOf(bulkFiles(edit));
    assert(findings.length === 0 && bulkSecretProblems(findings).length === 0, `誤検出: ${JSON.stringify(findings)}`);
  }]);
}
SCENARIOS.push(['モデルのジョブの判定（検体では autopilot だけ）', () => {
  const model = inspectWorkflows(bulkFiles()).jobs.filter((j) => j.model).map((j) => `${j.file}#${j.id}`);
  assert(model.join(',') === 'fixture.yml#autopilot', `モデルのジョブの判定が違う: ${model}`);
}]);
for (const [name, edit] of BULK_BREAKAGES) {
  SCENARIOS.push([`**モデルのジョブで落ちる（例外を書いても）**: ${name}`, () => {
    const findings = findingsOf(bulkFiles(edit));
    assert(findings.length > 0, '見つけられない');
    assert(findings.every((f) => f.model), `モデルのジョブと判定していない: ${JSON.stringify(findings)}`);
    assert(bulkSecretProblems(findings, ALLOW_MODEL).length > 0, '例外の台帳で通ってしまう');
  }]);
}
for (const [name, edit, at = 'fixture.yml#autopilot', form = ''] of MODEL_BYPASSES) {
  SCENARIOS.push([`**モデルのジョブで落ちる（全部のジョブに例外を書いても）**: ${name}`, () => {
    const findings = findingsOf(bulkFiles(edit));
    assert(findings.some((f) => `${f.file}#${f.job}` === at && f.model && !f.kind && f.form.includes(form)),
      `${at} で見つけられない${form ? `（「${form}」）` : ''}: ${JSON.stringify(findings)}`);
    assert(bulkSecretProblems(findings, allowEvery(findings)).some((p) => p.includes(`ジョブ ${at.split('#')[1]}）`)), '例外の台帳で通ってしまう');
  }]);
}
SCENARIOS.push(['(A) .NET が空白とみなす文字はどれも空白として読む（\\u で1つずつ）', () => {
  for (const ch of DOTNET_WHITESPACE) {
    const code = ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
    const findings = findingsOf(bulkFiles(inModel(`"\${{ toJSON(\\u${code}secrets) }}"`)));
    assert(findings.some((f) => f.job === 'autopilot' && f.model), `U+${code} を空白として読まない`);
  }
}]);
const ANCHOR_FROM_ALLOWED = chain(collectEnv('BULK_LIST: &all ${{ toJSON(secrets) }}'), modelEnv('ALL: *all'));
const ESCAPED_NAME_OUTSIDE_MODEL = replace('fixture.yml', COLLECT_ENV, '          GOOGLE_SERVICE_ACCOUNT_JSON: "${{ secrets.GCP_SERVICE_ACCOUNT_JSO\\x4e }}"\n');
const BULK_OUTSIDE_MODEL = replace('fixture.yml', '${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}', '${{ toJSON(secrets) }}');
const QUOTE_TRICK_OUTSIDE_MODEL = collectEnv(`X: ${quoteTrick('toJSON(secrets)')}`);
const CALLEE_RUNS_MODEL = chain(replace('fixture.yml', INHERIT, '    secrets:\n      ALL: ${{ toJSON(secrets) }}\n'),
  replace('callee.yml', 'TOKEN: ${{ secrets.GH_PAT }}', 'CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}'));
SCENARIOS.push(['(D) エイリアスで持ち込んだ名前1つの読み方は、エイリアスと名指しして落とす', () => {
  const findings = findingsOf(bulkFiles(MODEL_BYPASSES.find(([name]) => name.startsWith('(D) 名前1つの読み方でも'))[1]));
  assert(findings.some((f) => f.job === 'autopilot' && f.model && f.form.includes('エイリアス *gcp')), JSON.stringify(findings));
}]);
SCENARIOS.push(['(D) 例外を書いたモデルの無いジョブのアンカーでも、モデルのジョブで参照すれば落ちる', () => {
  const findings = findingsOf(bulkFiles(ANCHOR_FROM_ALLOWED));
  const problems = bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect', reason: '名前の一覧を出すだけ' }]);
  assert(problems.length > 0 && problems.every((p) => p.includes('ジョブ autopilot）')), `例外がモデルのジョブまで効いた: ${problems.join(' / ')}`);
}]);
for (const [name, files, reason] of PARSE_FAILURES) {
  SCENARIOS.push([`**読めないファイルは落ちる（例外を書いても）**: ${name}`, () => {
    const findings = findingsOf(Object.entries(files).map(([file, text]) => ({ name: file, text })));
    assert(findings.some((f) => f.kind === 'parse' && f.form.includes(reason)), `読めないファイルを飛ばした（理由「${reason}」）: ${JSON.stringify(findings)}`);
    assert(bulkSecretProblems(findings, allowEvery(findings)).some((p) => p.includes('読めないファイルは検査できないので通さない')),
      '読めないファイルを例外で通した');
  }]);
}
SCENARIOS.push(['**読めないファイルは落ちる**: UTF-8 として読めないファイル（置換文字で読み進めない）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-utf8-'));
  try {
    fs.writeFileSync(path.join(dir, 'bad.yml'), Buffer.from([0x6f, 0x6e, 0x3a, 0x20, 0xff, 0xfe, 0x0a]));
    const findings = bulkSecretsInUse([dir]);
    assert(findings.some((f) => f.kind === 'parse' && f.file === 'bad.yml'), `読めないファイルを飛ばした: ${JSON.stringify(findings)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}]);
SCENARIOS.push(['**YAML を読む ruby が無ければ、検査を空にせず例外にする**', () => {
  let threw = false;
  try { inspectWorkflows(bulkFiles(), { ruby: path.join(os.tmpdir(), 'no-such-ruby-for-credential-selftest') }); } catch { threw = true; }
  assert(threw, 'ruby が無いのに検査が通った');
}]);
SCENARIOS.push(['名前をエスケープで書いた読み方は、モデルの無いジョブでも見つけ、理由つきの例外でだけ通す', () => {
  const findings = findingsOf(bulkFiles(ESCAPED_NAME_OUTSIDE_MODEL));
  assert(findings.length === 1 && findings[0].job === 'collect' && !findings[0].model, JSON.stringify(findings));
  assert(bulkSecretProblems(findings).length === 1, '例外なしで通ってしまう');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect', reason: '検体' }]).length === 0, '例外が効かない');
}]);
SCENARIOS.push(['モデルの無いジョブは、理由つきの例外があるときだけ通る', () => {
  const findings = findingsOf(bulkFiles(BULK_OUTSIDE_MODEL));
  assert(findings.length === 1 && findings[0].job === 'collect' && !findings[0].model, JSON.stringify(findings));
  assert(bulkSecretProblems(findings).length === 1, '例外なしで通ってしまう');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect', reason: '名前の一覧を出すだけ' }]).length === 0, '例外が効かない');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect' }]).length === 2, '理由の無い例外で通ってしまう');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'autopilot', reason: '別のジョブ' }]).length === 1, '別のジョブの例外で通ってしまう');
  assert(bulkSecretProblems(findings, { workflow: 'fixture.yml' }).length > 0, '配列でない台帳を黙って読む');
}]);
SCENARIOS.push(["モデルの無いジョブでも、'' の形の一括読み取りは見つけ、理由つきの例外でだけ通す", () => {
  const findings = findingsOf(bulkFiles(QUOTE_TRICK_OUTSIDE_MODEL));
  assert(findings.length === 1 && findings[0].job === 'collect' && !findings[0].model, JSON.stringify(findings));
  assert(bulkSecretProblems(findings).length === 1, '例外なしで通ってしまう');
  assert(bulkSecretProblems(findings, [{ workflow: 'fixture.yml', job: 'collect', reason: '検体' }]).length === 0, '例外が効かない');
}]);
SCENARIOS.push(['呼び先がモデルを動かすなら、呼ぶ側のジョブもモデルのジョブとして扱う', () => {
  const findings = findingsOf(bulkFiles(CALLEE_RUNS_MODEL));
  assert(findings.length === 1 && findings[0].job === 'call' && findings[0].model, JSON.stringify(findings));
  assert(bulkSecretProblems(findings, ALLOW_MODEL).length === 1, '例外の台帳で通ってしまう');
}]);

// 実物のワークフロー（このリポジトリで走らせたときだけ）: 全部のモデルのジョブに足すと落ちる。
// jobs の鍵を "jobs" : と書き換えても同じ（字面の推測でジョブを見失わない）。
const OWN_WORKFLOWS = WF_DIRS[0];
const HAS_OWN_WORKFLOWS = fs.existsSync(path.join(OWN_WORKFLOWS, 'obsidian-autopilot.yml'));
/** 実物の各モデルのジョブの先頭に `env: BULK: ${{ toJSON(secrets) }}` を足し、jobs の行を header に変えた写し。 */
function ownMutations(files, model) {
  return model.flatMap((target) => ['jobs:', '"jobs" :'].map((header) => ({ target, header, files: files.map((file) => {
    if (file.name !== target.file) return file;
    const text = file.text.split('\n');
    const pad = ' '.repeat(target.column + 2);
    text.splice(target.line, 0, `${pad}env:`, `${pad}  BULK: \${{ toJSON(secrets) }}`);
    const at = text.findIndex((l) => /^jobs:\s*(?:#.*)?$/.test(l));
    assert(at !== -1, `${file.name} に jobs: の行が無い`);
    text[at] = header;
    return { ...file, text: text.join('\n') };
  }) })));
}
if (HAS_OWN_WORKFLOWS) {
  SCENARIOS.push(['実物: 全部のモデルのジョブに toJSON(secrets) を足すと、それぞれ落ちる（例外を書いても・jobs の鍵の書き方を変えても）', () => {
    const files = readWorkflows(OWN_WORKFLOWS);
    const { findings, jobs } = inspectWorkflows(files);
    assert(findings.length === 0, `実物に名前で読まない箇所がある: ${JSON.stringify(findings)}`);
    const model = jobs.filter((j) => j.model);
    const named = model.map((j) => `${j.file}#${j.id}`);
    assert(named.includes('obsidian-autopilot.yml#autopilot') && named.includes('devlog-syndication-platform.yml#draft'),
      `モデルのジョブを見落としている: ${named.join(', ')}`);
    assert(!named.includes('obsidian-autopilot.yml#collect') && !named.includes('obsidian-autopilot.yml#publish'),
      `モデルの無いジョブをモデルのジョブにしている: ${named.join(', ')}`);
    const mutations = ownMutations(files, model);
    readYamlEvents(mutations.flatMap((m) => m.files.map((f) => f.text)));
    for (const { target, header, files: mutated } of mutations) {
      const hit = bulkSecretFindings(mutated);
      assert(hit.length === 1 && hit[0].file === target.file && hit[0].job === target.id && hit[0].model,
        `${target.file}#${target.id}（${header}）に足しても見つけられない: ${JSON.stringify(hit)}`);
      assert(bulkSecretProblems(hit, [{ workflow: target.file, job: target.id, reason: '検体' }]).length === 1,
        `${target.file}#${target.id} が例外の台帳で通ってしまう`);
    }
  }]);
}

/** 検体をまとめて1回で読んでおく（ruby の起動を検体ごとに払わない）。読めなければ各検体が報告する。 */
function primeBulkFixtures() {
  const texts = new Set();
  const edits = [...BULK_PASSES, ...BULK_BREAKAGES, ...MODEL_BYPASSES].map(([, edit]) => edit)
    .concat(ANCHOR_FROM_ALLOWED, ESCAPED_NAME_OUTSIDE_MODEL, BULK_OUTSIDE_MODEL, QUOTE_TRICK_OUTSIDE_MODEL, CALLEE_RUNS_MODEL);
  for (const ch of DOTNET_WHITESPACE) edits.push(inModel(`"\${{ toJSON(\\u${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}secrets) }}"`));
  for (const edit of edits) {
    try { for (const f of bulkFiles(edit)) texts.add(f.text.replace(/^\uFEFF/, '')); } catch { /* 書き換えの誤りは、その検体が自分で報告する */ }
  }
  for (const [, files] of PARSE_FAILURES) for (const text of Object.values(files)) texts.add(text);
  try { readYamlEvents([...texts]); } catch { /* ruby が無い・落ちたことは、各検体が自分で報告する */ }
}
const runScenarios = () => { primeBulkFixtures(); return run(SCENARIOS); };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes('--selftest')) process.exit(runScenarios() === 0 ? 0 : 1);
  const doc = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  const stopDoc = JSON.parse(fs.readFileSync(STOP_PATH, 'utf8'));
  const dirAt = process.argv.indexOf('--workflow-dir');
  if (dirAt !== -1 && (!process.argv[dirAt + 1] || process.argv[dirAt + 1].startsWith('--'))) {
    console.error('--workflow-dir requires a directory'); process.exit(1);
  }
  const dirs = dirAt === -1 ? WF_DIRS : [path.resolve(process.argv[dirAt + 1])];
  const inUse = secretsInUse(dirs, { required: dirAt !== -1 });
  console.log(`検査対象: ${dirs.filter(d => fs.existsSync(d)).join(', ')}`);
  for (const dir of dirs.filter(d => !fs.existsSync(d))) console.log(`未検査（別リポジトリのCIで検査）: ${dir}`);

  const stopAt = process.argv.indexOf('--stop');
  if (stopAt !== -1) {
    const route = process.argv[stopAt + 1];
    const keys = doc.credentials.filter((c) => (c.agents || []).includes(route));
    if (!keys.length) { console.error(`経路 "${route}" を止められる鍵が台帳に無い`); process.exit(1); }
    console.log(`経路 "${route}" を止める鍵:\n`);
    for (const c of keys) {
      console.log(`  ${c.label}${c.secret ? `（${c.secret}）` : ''}`);
      console.log(`    失効: ${c.revocation}`);
      console.log(`    影響: ${c.blast_radius}\n`);
    }
    console.log('**これは最後の手段。**まず data/emergency-stop.json を立てるほうが速く、意図が残る。');
    process.exit(0);
  }

  const problems = validate(doc, stopDoc, inUse);
  let bulk = [];
  try {
    bulk = bulkSecretsInUse(dirs);
  } catch (e) {
    problems.push(`secret の読み方を検査できない（5）: ${e.message} — **検査できないことを「問題なし」にしない**`);
  }
  problems.push(...bulkSecretProblems(bulk, doc.$bulk_secret_access));
  const declared = declaredSecrets(doc);
  console.log('資格情報 — 権限・経路・失効手順\n');
  console.log(`  ワークフローが読む secret ${inUse.size}件 / 台帳が申告 ${declared.size}件`
    + ` / 対象外 ${Object.keys(doc.$exempt_secrets || {}).length}件`);
  console.log(`  名前を書かずに secret を読む箇所 ${bulk.length}件`
    + `（モデルのジョブ ${bulk.filter((f) => f.model).length}件 / 台帳の例外 ${Array.isArray(doc.$bulk_secret_access) ? doc.$bulk_secret_access.length : 0}件）\n`);
  for (const c of doc.credentials) {
    const routes = (c.agents || []).length ? (c.agents || []).join(',') : '—';
    const stops = c.revoke_stops_automation ? ' ⛔止まる' : '';
    console.log(`  ${c.critical ? '★' : ' '} ${c.id.padEnd(28)} 経路:${routes}${stops}`);
  }
  console.log('\n  自動運転を止められる鍵:');
  for (const c of doc.credentials.filter((x) => x.revoke_stops_automation)) {
    console.log(`    ${c.label} — ${c.blast_radius}`);
  }
  console.log('\n  経路ごとに `--stop <経路>` で失効手順が出る。');
  console.log('  **ただし最後の手段。**緊急停止の台帳を立てるほうが速く、意図が残る。');

  if (problems.length) {
    console.error('\n資格情報の台帳: 穴');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (process.argv.includes('--check')) {
    if (runScenarios() !== 0) process.exit(1);
    console.log('\n止めたい経路ごとに、失効させる鍵が名指しできる。');
  }
}
