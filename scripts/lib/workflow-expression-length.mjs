// GitHub's limit on one workflow expression, measured before a push instead of after it.
//
// A workflow string that contains `${{ }}` is turned into one expression, format('<literal>', <args>), with the
// literal's quotes and braces doubled. GitHub refuses the whole workflow file when such an expression is too long:
// "Invalid workflow file … Exceeded max expression length 21000". The file then starts no job at all (every push
// shows a failed run with no jobs; a schedule or a manual start runs nothing).
//
// 2026-10-31 (PR #2213): the Obsidian Autopilot model prompt grew from 19,069 to 21,284 UTF-8 bytes with one line
// added, and GitHub marked .github/workflows/obsidian-autopilot.yml invalid at the `prompt: |` line (runs
// 41070835616 and 41092240147, no jobs). That prompt was 11,188 UTF-16 units, far under 21000, so the limit is read
// as UTF-8 bytes. **That reading is an inference from those two points; GitHub does not document the unit.** UTF-8
// bytes are never fewer than UTF-16 units, so this count is the stricter of the two usual readings. A reading that
// counts two bytes per UTF-16 unit would also fit both points; nothing here guards against it, and the push's own
// run is the only proof that a file is valid.
//
// Neither the YAML schema, actionlint nor SEO Validation sees this limit: this check is the only local guard.
// The line reader below was compared on 2026-10-31 with a YAML parser (yaml 2.9.1, outside the repository) on all
// 27 workflows plus the main and 10-30 versions of obsidian-autopilot.yml: the same 575 strings, the same sizes.
// The margin is for the parts of GitHub's computation this file does not see (separators, trimming, the unit).

import assert from 'node:assert/strict';

export const GITHUB_EXPRESSION_LIMIT = 21000;
export const EXPRESSION_MARGIN_BYTES = 500;
export const EXPRESSION_BUDGET_BYTES = GITHUB_EXPRESSION_LIMIT - EXPRESSION_MARGIN_BYTES;

/**
 * The expression GitHub builds from one string, or null when the string has no `${{ }}`.
 * A string that is exactly one `${{ x }}` is the expression `x`; anything else is format('…{0}…', x, …).
 * Like GitHub's reader, a `}}` inside a quoted string of the expression does not close it.
 */
export function templateExpression(text) {
  if (typeof text !== 'string' || !text.includes('${{')) return null;
  const literals = [];
  const args = [];
  let rest = text;
  for (let open = rest.indexOf('${{'); open >= 0; open = rest.indexOf('${{')) {
    let close = -1;
    let quoted = false;
    for (let i = open + 3; i < rest.length - 1; i++) {
      if (rest[i] === "'") quoted = !quoted;
      else if (!quoted && rest[i] === '}' && rest[i + 1] === '}') { close = i; break; }
    }
    assert(close >= 0, 'an unclosed ${{ expression');
    literals.push(rest.slice(0, open));
    args.push(rest.slice(open + 3, close).trim());
    rest = rest.slice(close + 2);
  }
  if (args.length === 1 && literals[0] === '' && rest === '') return args[0];
  const escape = literal => literal.replace(/'/g, "''").replace(/\{/g, '{{').replace(/\}/g, '}}');
  return `format('${literals.map((literal, i) => `${escape(literal)}{${i}}`).join('')}${escape(rest)}', ${args.join(', ')})`;
}

const indentOf = line => line.length - line.trimStart().length;
const blank = line => line.trim() === '';
// `key: value`, `- key: value` and `- value`. The value starts at `column`; a key-less line has no key.
const ENTRY = /^( *)((?:- +)*)(?:((?:[^\s#'"{[:][^:#]*?)|'[^']*'|"[^"]*") *:(?= |$) *)?(.*)$/;
const BLOCK = /^[|>]([1-9]?)([+-]?)([1-9]?) *(?:#.*)?$/;

/**
 * Every string in a workflow file that GitHub turns into an expression, with its 1-based line, key and size in
 * UTF-8 bytes. Block scalars (`|`, `>`, with any chomping) are read as literal text: folding only turns line breaks
 * into spaces, so the literal reading is never shorter. A plain or quoted value that continues on deeper lines is
 * joined with spaces. Comment lines and strings without `${{ }}` are skipped.
 */
export function templateStrings(source) {
  const lines = String(source).split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const startLine = i + 1;
    if (blank(line) || /^ *#/.test(line)) continue;
    const entry = ENTRY.exec(line);
    if (!entry) continue;
    const column = entry[1].length + entry[2].length;
    const key = entry[3] ?? null;
    const value = entry[4];
    let text = null;
    const block = BLOCK.exec(value);
    if (block) {
      const chomp = block[2];
      const body = [];
      let content = null;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j];
        if (blank(next)) { body.push(next); continue; }
        const indent = indentOf(next);
        if (content === null) {
          if (indent <= column) break;
          content = indent;
        }
        if (indent < content) break;
        body.push(next);
      }
      // Trailing blank lines belong to the scalar only with `+`.
      let kept = body.length;
      while (kept > 0 && blank(body[kept - 1])) kept--;
      const lineText = body.slice(0, chomp === '+' ? body.length : kept).map(l => (blank(l) ? l.slice(content ?? 0) : l.slice(content)));
      text = lineText.join('\n') + (chomp === '-' || lineText.length === 0 ? '' : '\n');
      i = j - 1;
    } else if (value !== '') {
      const parts = [value];
      let j = i + 1;
      for (; j < lines.length && !blank(lines[j]) && !/^ *#/.test(lines[j]) && indentOf(lines[j]) > column; j++) parts.push(lines[j].trim());
      i = j - 1;
      text = parts.join(' ');
      if (/^'.*'$/s.test(text)) text = text.slice(1, -1).replace(/''/g, "'");
      else if (/^".*"$/s.test(text)) text = text.slice(1, -1);
    }
    const expression = templateExpression(text);
    if (expression !== null) found.push({ line: startLine, key, bytes: Buffer.byteLength(expression, 'utf8') });
  }
  return found;
}

/** Throws when a string in the workflow would be an expression over the budget (GitHub's limit less the margin). */
export function checkExpressionLengths(source, budget = EXPRESSION_BUDGET_BYTES) {
  const over = templateStrings(source).filter(found => found.bytes > budget);
  assert(over.length === 0, `workflow expression over ${budget} UTF-8 bytes (GitHub refuses the file over ${GITHUB_EXPRESSION_LIMIT}): `
    + over.map(found => `line ${found.line} ${found.key ?? '(value)'} ${found.bytes}`).join(', '));
  return true;
}
