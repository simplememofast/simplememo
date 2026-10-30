/**
 * secret を名前で1つずつ読んでいるか（2026-10-30・セキュリティ監査 F6 の残り）。
 *
 * 【なぜ要るか】
 * secret の検査はどれも**名前で**探している。check-credentials.mjs の secretsInUse は
 * `secrets.NAME` を数え、autopilot-data.mjs の --check は GCP_SERVICE_ACCOUNT_JSON の字面を、
 * autopilot-publish.mjs の --check は `secrets.NAME` の形を見る。ところが
 *
 *     ${{ toJSON(secrets) }}   ${{ secrets }}   secrets[format(…)]   secrets.*   secrets: inherit
 *
 * は名前を書かずに**全部の secret** を渡すので、3つとも素通りする。これがモデルのジョブ
 * （WebFetch や検索語で第三者の文章を読む）に足されると、モデルが全部の鍵を持つ。
 * GitHub の式は大文字小文字を区別しないので、`SECRETS.GH_PAT` や `secrets.gh_pat` も
 * 名前の検査（大文字・小文字を区別する）をすり抜ける。
 *
 * 【規則】式の中の secrets は `secrets.NAME`（NAME は大文字・数字・_）か `secrets['NAME']` の
 * 形でしか読まない。`secrets: inherit` は、同じディレクトリにあってモデルを動かさない
 * ワークフローを呼ぶときだけ認める（呼ばれた側も同じ規則で検査されるので、名前で読むしかない）。
 * それ以外はすべて問題。例外は**モデルを動かさないジョブ**に限り、呼び出し側が理由つきで許す。
 *
 * 【どこまで見るか】
 * 式は生の本文から拾う（`${{ … }}` と `if:` の値）。run: の中の `#` の行も見る —— GitHub は
 * シェルより先に式を展開するので、コメントの行でも鍵がランナーのファイルに書き込まれる。
 * YAML の二重引用符のエスケープ（`\x73ecrets`、行末の `\` での行継ぎ）は戻してから見る。
 * モデルのジョブかどうかは字面（MODEL_MARKERS）と、呼んでいる再利用ワークフローで決める。
 * 一覧に無い新しいモデルの動かし方は見えないので、例外を許すときは人がジョブを読むこと。
 */

/** モデルを動かす印。迷う書き方は「動かす」側に倒す（例外を許せなくなるだけで、検出は減らない）。 */
export const MODEL_MARKERS = /anthropics\/claude-code-action|claude[-_]code[-_]oauth[-_]token|anthropic[-_]api[-_]key|@anthropic-ai\/claude-code|claude-agent-sdk|openai[-_]api[-_]key|openai\/codex-action|@openai\/codex|gemini[-_]api[-_]key|run-gemini-cli|\bclaude\s+(?:-p|--print)\b|\bcodex\s+exec\b/i;

const unescapeCode = (match, hex) => {
  const code = parseInt(hex, 16);
  // 改行は戻さない（行の形が崩れるとジョブの区切りを読み違える）。改行は secrets の字面を作れない。
  return code === 0x0a || code === 0x0d ? match : String.fromCodePoint(code);
};

/**
 * YAML の二重引用符の中で効くエスケープを戻す。ブロック（run: |）の中まで戻すのは過剰だが、
 * 見つかる側に倒れるだけ。joinLines は行末の `\` による行継ぎも戻す（行番号は変わる）。
 */
export function decodeYamlEscapes(text, { joinLines = false } = {}) {
  let out = String(text)
    .replace(/\\x([0-9A-Fa-f]{2})/g, unescapeCode)
    .replace(/\\u([0-9A-Fa-f]{4})/g, unescapeCode)
    .replace(/\\U([0-9A-Fa-f]{8})/g, unescapeCode);
  if (joinLines) out = out.replace(/\\\r?\n[ \t]*/g, '');
  return out;
}

/**
 * Actions が評価する式を、位置つきで拾う。`${{ … }}`（'…' の中の `}}` は閉じとみなさない）と、
 * `if:` の値（`${{ }}` なしでも式。折り返した値は、より深く字下げした行まで続く）。
 */
export function workflowExpressions(text) {
  const found = [];
  for (let at = text.indexOf('${{'); at !== -1; at = text.indexOf('${{', at + 3)) {
    let i = at + 3, quoted = false;
    for (; i < text.length && (quoted || !text.startsWith('}}', i)); i++) if (text[i] === "'") quoted = !quoted;
    found.push({ index: at, text: text.slice(at + 3, i) });
  }
  const lines = text.split('\n');
  let offset = 0;
  lines.forEach((line, n) => {
    const key = line.match(/^(\s*(?:-\s+)?)(?:if|'if'|"if")\s*:/);
    if (key) {
      let value = line.slice(key[0].length);
      for (let k = n + 1; k < lines.length && (!lines[k].trim() || lines[k].search(/\S/) > key[1].length); k++) value += '\n' + lines[k];
      found.push({ index: offset, text: value });
    }
    offset += line.length + 1;
  });
  return found;
}

/**
 * 式の中で、secrets を名前1つで読んでいない箇所（抜粋の配列）。
 * 許すのは `secrets.NAME` と `secrets['NAME']` だけ。'…' の文字列の中は見ない。
 */
export function bulkSecretForms(expression) {
  const text = String(expression)
    .replace(/(?<![\w.-])secrets\['[A-Z_][A-Z0-9_]*'\]/g, '§')
    .replace(/'(?:[^']|'')*'/g, "''");
  const forms = [];
  for (const m of text.matchAll(/(?<![\w.-])secrets(?![\w-])/gi)) {
    if (/^secrets\.[A-Z_][A-Z0-9_]*(?![\w-])/.test(text.slice(m.index))) continue;
    forms.push(text.slice(Math.max(0, m.index - 12), m.index + 28).replace(/\s+/g, ' ').trim());
  }
  return forms;
}

/**
 * 式の切り出しに頼らない拾い直し（位置つき）。YAML の単引用符の中では `'` を `''` と書くので、
 * `'${{ ''}}'' && toJSON(secrets) }}'` の切り出しは `}}` で止まり、後ろの secrets を見ない
 * （GitHub は YAML を戻してから式を読むので、全体が1つの式になる）。ここでは引用符を数えずに、
 * `secrets` が式として使われている形（前後が括弧・区切り・演算子、`.*`・`[…]`）を全部拾う。
 * 文章の中の語は前後が文字なので拾わない。コメントも飛ばさない（引用符の中の `#` はコメントではない）。
 */
export function looseSecretUses(text) {
  const src = String(text);
  const uses = [];
  for (const m of src.matchAll(/(?<![\w.$-])secrets(?![\w-])/gi)) {
    const rest = src.slice(m.index);
    if (/^secrets\.[A-Z_][A-Z0-9_]*(?![\w-])/i.test(rest)) continue;
    if (/^secrets\s*\[\s*(?:'|'')[A-Z_][A-Z0-9_]*(?:'|'')\s*\]/i.test(rest)) continue;
    const after = rest.slice('secrets'.length);
    const next = (after.match(/^\s*(\S)/) || [])[1] || '';
    // YAML の鍵（secrets: inherit は下で別に見る）。
    if (next === ':') continue;
    const before = (src.slice(0, m.index).match(/(\S)\s*$/) || [])[1] || '';
    const listed = next === '.' && /^\s*\.\s*[*[]/.test(after);
    if (next === '' || ')}],[|&=!<>'.includes(next) || listed || (before !== '' && '({[,|&=!<>'.includes(before))) {
      uses.push({ index: m.index, form: src.slice(Math.max(0, m.index - 12), m.index + 28).replace(/\s+/g, ' ').trim() });
    }
  }
  return uses;
}

/** ジョブの範囲。jobs: の外（on:・env: など）は `(workflow)` で、ファイルの全ジョブに効く。 */
export function workflowJobs(text) {
  const lines = text.split('\n');
  const starts = [];
  let offset = 0, inJobs = false, indent = null;
  lines.forEach((line) => {
    if (/^jobs:\s*(?:#.*)?$/.test(line)) inJobs = true;
    else if (/^\S/.test(line) && !/^#/.test(line)) inJobs = false;
    else if (inJobs) {
      const m = line.match(/^( +)([A-Za-z_][\w-]*)\s*:\s*(?:#.*)?$/);
      if (m && (indent === null || m[1].length === indent)) {
        indent = m[1].length;
        starts.push({ id: m[2], start: offset, indent });
      }
    }
    offset += line.length + 1;
  });
  return starts.map((job, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    // jobs: の後ろに別の最上位キーがあっても、本文はそこで切る。
    const rest = text.slice(job.start, end);
    const top = rest.search(/\n(?=[^\s#])/);
    return { ...job, end: top === -1 ? end : job.start + top, body: top === -1 ? rest : rest.slice(0, top) };
  });
}

/** そのジョブが呼ぶ再利用ワークフロー（ジョブ直下の uses:）。 */
function calledWorkflow(job) {
  const m = job.body.match(new RegExp(`\\n {${job.indent + 2}}uses:\\s*['"]?([^\\s'"#]+)`));
  return m ? m[1] : null;
}

/**
 * 1つのディレクトリのワークフロー群を読んで、名前で読んでいない箇所（findings）と、
 * ジョブごとのモデルの有無（jobs）を返す。files: [{ name, text }]。model は「モデルを動かしうる」。
 */
export function inspectWorkflows(files) {
  const parsed = new Map(files.map(({ name, text }) => {
    const decoded = decodeYamlEscapes(text);
    return [name, { name, text: decoded, raw: text, jobs: workflowJobs(decoded) }];
  }));
  const modelCache = new Map();
  const jobRunsModel = (file, job, seen = new Set()) => {
    const key = `${file.name}#${job.id}`;
    if (modelCache.has(key)) return modelCache.get(key);
    let result = MODEL_MARKERS.test(job.body);
    const callee = calledWorkflow(job);
    if (!result && callee) {
      const local = callee.match(/^\.\/\.github\/workflows\/([^/]+)$/);
      const target = local ? parsed.get(local[1]) : null;
      // 外のリポジトリや見つからない呼び先は中身を確かめられない。動かしうる側に倒す。
      if (!target || seen.has(target.name)) result = !target;
      else result = fileRunsModel(target, new Set([...seen, file.name]));
    }
    modelCache.set(key, result);
    return result;
  };
  const fileRunsModel = (file, seen = new Set()) => file.jobs.some(job => jobRunsModel(file, job, seen));
  const where = (file, index) => {
    const job = file.jobs.find(j => index >= j.start && index < j.end);
    return { job: job ? job.id : '(workflow)', model: job ? jobRunsModel(file, job) : fileRunsModel(file) };
  };
  const lineOf = (text, index) => text.slice(0, index).split('\n').length;

  const findings = [];
  for (const file of parsed.values()) {
    for (const expression of workflowExpressions(file.text)) {
      for (const form of bulkSecretForms(expression.text)) {
        findings.push({ file: file.name, line: lineOf(file.text, expression.index), form, ...where(file, expression.index) });
      }
    }
    // 行継ぎ（行末の \）で字面を分けた式は、行をつないでから数え直す。増えた分は場所を決められないので
    // ファイル全体の問題にする。
    const joined = decodeYamlEscapes(file.raw, { joinLines: true });
    const count = text => workflowExpressions(text).reduce((n, e) => n + bulkSecretForms(e.text).length, 0);
    if (count(joined) > count(file.text)) {
      findings.push({ file: file.name, line: null, form: '行継ぎ（行末の \\）で分けた式', job: '(workflow)', model: fileRunsModel(file) });
    }
    // 切り出しをすり抜ける書き方（YAML の '' など）は、モデルを動かす範囲だけ字面で拾い直す。
    // モデルの無いジョブは上の式の検査と台帳の例外に任せる（説明文の語を拾って例外が増えるのを避ける）。
    const lines = new Set(findings.filter(f => f.file === file.name).map(f => f.line));
    for (const use of looseSecretUses(file.text)) {
      const at = where(file, use.index);
      const line = lineOf(file.text, use.index);
      if (!at.model || lines.has(line)) continue;
      lines.add(line);
      findings.push({ file: file.name, line, form: use.form, ...at });
    }
    if (fileRunsModel(file) && looseSecretUses(joined).length > looseSecretUses(file.text).length) {
      findings.push({ file: file.name, line: null, form: '行継ぎ（行末の \\）で分けた字面', job: '(workflow)', model: true });
    }
    let offset = 0;
    for (const line of file.text.split('\n')) {
      if (/^\s*secrets\s*:\s*(['"]?)inherit\1\s*(?:#.*)?$/.test(line)) {
        const job = file.jobs.find(j => offset >= j.start && offset < j.end);
        const callee = job ? calledWorkflow(job) : null;
        const local = callee ? callee.match(/^\.\/\.github\/workflows\/([^/]+)$/) : null;
        const target = local ? parsed.get(local[1]) : null;
        // 同じディレクトリでモデルを動かさない呼び先は、呼ばれた側も名前でしか読めない（この検査が見る）。
        if (!target || fileRunsModel(target, new Set([file.name]))) {
          findings.push({ file: file.name, line: lineOf(file.text, offset), form: `secrets: inherit → ${callee ?? '(呼び先なし)'}`,
            ...where(file, offset) });
        }
      }
      offset += line.length + 1;
    }
  }
  const jobs = [...parsed.values()].flatMap(file => file.jobs.map(job => ({ file: file.name, id: job.id, model: jobRunsModel(file, job) })));
  return { findings, jobs };
}

export const bulkSecretFindings = files => inspectWorkflows(files).findings;

/**
 * 問題の文言。allow は [{ workflow, job, reason }]（台帳の $bulk_secret_access）。
 * **モデルを動かしうるジョブは例外にできない。**理由の無い例外も認めない。
 */
export function bulkSecretProblems(findings, allow = []) {
  const problems = [];
  const entries = Array.isArray(allow) ? allow : [];
  if (!Array.isArray(allow)) problems.push('$bulk_secret_access は配列で書く');
  for (const e of entries) {
    if (!e || typeof e.workflow !== 'string' || typeof e.job !== 'string' || typeof e.reason !== 'string' || !e.reason.trim()) {
      problems.push(`$bulk_secret_access の例外は workflow・job・reason（理由）が要る: ${JSON.stringify(e)}`);
    }
  }
  for (const f of findings) {
    const at = `${f.file}${f.line ? `:${f.line}` : ''}（ジョブ ${f.job}）`;
    const allowed = entries.some(e => e && e.workflow === f.file && e.job === f.job && typeof e.reason === 'string' && e.reason.trim());
    if (f.model) {
      problems.push(`${at}: モデルを動かすジョブが secret を名前で読んでいない「${f.form}」`
        + ' — **全部の secret がモデルに渡る。**`secrets.NAME` で1つずつ書く（このジョブは例外にできない）');
    } else if (!allowed) {
      problems.push(`${at}: secret を名前で読んでいない「${f.form}」`
        + ' — 名前の検査（台帳・モデルのジョブの検査）をすり抜ける。`secrets.NAME` で1つずつ書くか、'
        + 'モデルを動かさないジョブなら data/credential-expiry.json の $bulk_secret_access に理由つきで書く');
    }
  }
  return problems;
}
