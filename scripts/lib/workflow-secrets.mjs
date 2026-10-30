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
 * 形でしか読まない。しかも**その形がファイルの字面にそのまま書いてある**こと（YAML のエスケープ・
 * 行継ぎ・'' やエイリアスで作った名前は、名前の検査から見えない）。`secrets: inherit` は、
 * 同じディレクトリにあってモデルを動かさないワークフローを呼ぶときだけ認める。
 * それ以外はすべて問題。例外は**モデルを動かさないジョブ**に限り、呼び出し側が理由つきで許す。
 *
 * 【どう読むか（2026-10-30 に作り直した）】
 * 最初の版は YAML を字面のまま追っていた。独立したレビューが、それで見落とす書き方を5系統
 * 見つけた —— 二重引用符のエスケープ（`\t` `\N` `\_` など）、`''` と大文字小文字の組み合わせ、
 * `secrets: inherit` の書き方の変種、アンカーとエイリアス、`jobs :` や `"jobs":`。
 * どれも**字面の推測と YAML の意味のずれ**が原因なので、字面を追うのをやめた。
 *
 *   1. YAML は Ruby の Psych（libyaml）で読む。GitHub の Ubuntu ランナー（22.04・24.04）と macOS に
 *      最初から入っていて、追加の依存が要らない。読めないファイルは「問題」にする（飛ばさない）。
 *      文書が1つでないファイルは GitHub も受け付けない（actions/runner の YamlObjectReader の
 *      ValidateStart/ValidateEnd）。最上位が対応表でない・ジョブが1つも無いファイルも読めない扱いに
 *      する（ジョブを見失ったまま、ファイル全体を「モデル無し」として通さないため）。
 *   2. エイリアスは、actions/runner の YamlObjectReader.MoveNext の手順を写して展開する
 *      （buildYamlDocuments）。アンカーは**開始のイベント**を読んだ時点で登録し、エイリアスは
 *      **イベントを再生しながら、その時点のアンカー表で**解く。「定義した時点の木の写し」で
 *      置き換えると、同じ名前を定義し直したときに GitHub と違う値になる（2026-10-30 の再レビュー）。
 *      展開した後のイベントが 50000 を超えたら読めない扱い。GitHub の上限 c_maxYamlNodes も 50000
 *      だが、あちらは文書と流れの始まり・終わりの4つも数えるので、ここのほうが緩い（GitHub が
 *      受け付けるファイルを、この上限で落とすことはない）。
 *   3. ジョブは最上位の `jobs` の鍵の下（引用符や空白の書き方によらない）。それ以外の最上位
 *      （on・env・defaults など）は `(workflow)` で、全部のジョブに効く。
 *   4. 式は、すべての文字列（鍵も値も）から GitHub と同じ切り出し方で拾う（`${{ … }}`。式の中の
 *      '…' の `}}` は閉じとみなさない。WorkflowParser の TemplateReader.ParseScalar）。`if:` の値は
 *      丸ごと式としても読む。YAML のコメントは GitHub も読まないので見ない。
 *   5. 式は GitHub の字句解析（actions/runner の LexicalAnalyzer）と同じ規則で区切る。空白は
 *      .NET の Char.IsWhiteSpace と同じ文字（U+0085・U+00A0・U+3000 などを含む）。
 *
 * 字面を追う検査（式の切り出し・字面の拾い直し）は残していない。A〜E の書き方で迂回できると
 * 分かっていて、残すと説明文の誤検出だけが残るため。
 *
 * モデルのジョブかどうかは、ジョブの中身（エイリアスを展開した後）とファイル全体の設定に
 * MODEL_MARKERS があるかと、呼んでいる再利用ワークフローで決める。一覧に無い新しいモデルの
 * 動かし方（印の無い第三者の action、同じリポジトリの composite action の中身など）は見えないので、
 * 例外を許すときは人がジョブを読むこと。
 *
 * 【GitHub と食い違いうるところ】GitHub は YamlDotNet（5.3.0）で読む。libyaml と YamlDotNet は
 * 受け付ける範囲が少し違いうる（アンカーの名前に使える文字は、どちらも英数字・`_`・`-` で同じ）。
 * libyaml だけが拒む書き方はここで落ちる（安全側）。両方が受け付けて値が違う書き方は、まだ
 * 見つけていない（探し切ってはいない）。エイリアスの展開の手順は actions/runner のソースを読んで
 * 写したもので、GitHub の上では試していない。
 */

import { spawnSync } from 'node:child_process';

/** モデルを動かす印。迷う書き方は「動かす」側に倒す（例外を許せなくなるだけで、検出は減らない）。 */
export const MODEL_MARKERS = /anthropics\/claude-code-action|claude[-_]code[-_]oauth[-_]token|anthropic[-_]api[-_]key|@anthropic-ai\/claude-code|claude-agent-sdk|openai[-_]api[-_]key|openai\/codex-action|@openai\/codex|gemini[-_]api[-_]key|run-gemini-cli|\bclaude\s+(?:-p|--print)\b|\bcodex\s+exec\b/i;

/**
 * .NET の Char.IsWhiteSpace が真になる文字（式の字句解析が飛ばす空白）。JS の \s とは違う ——
 * U+0085 を含み、U+FEFF を含まない。U+180E は今の Unicode では空白ではないが、古い .NET では
 * 空白だったので空白に入れる（拾う側に倒れるだけ）。
 */
export const DOTNET_WHITESPACE = '\t\n\v\f\r \u0085\u00A0\u1680\u180E\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000';
const isSpace = (c) => c !== undefined && c !== '' && DOTNET_WHITESPACE.includes(c);
const SPACE_RUN = new RegExp(`[${DOTNET_WHITESPACE}]+`, 'g');

/**
 * エイリアスを展開した後のイベント数の上限。GitHub の YamlObjectReader の c_maxYamlNodes と同じ値。
 * どちらも再生したイベント（終わりのイベントを含む）を数えるが、あちらは流れと文書の始まり・終わりの
 * 4つも数えるので、同じ値でもここのほうが緩い。
 */
export const MAX_YAML_NODES = 50000;

// ── 1. YAML を読む（Ruby の Psych = libyaml）──────────────────────────
// イベントの列をそのまま返す。値の型は決めない（`on` を true にしたりしない）。
// 位置は libyaml の行・桁（文字単位）。字面（raw）はその範囲の元の文字列。
const RUBY_READER = String.raw`
require 'psych'
require 'json'
class Collector < Psych::Handler
  attr_reader :events
  BREAKS = ["\n", "\r", "\u0085", "\u2028", "\u2029"]
  def initialize(src)
    @chars = src.each_char.to_a
    @starts = [0]
    i = 0
    while i < @chars.length
      i += @chars[i] == "\r" && @chars[i + 1] == "\n" ? 2 : 1
      @starts << i if BREAKS.include?(@chars[i - 1])
    end
    @events = []
    @loc = [0, 0, 0, 0]
  end
  def event_location(*loc); @loc = loc; end
  def at(line, col); (@starts[line] || @chars.length) + col; end
  def start_document(*); @events << ['D']; end
  def alias(anchor); @events << ['A', anchor, @loc[0], @loc[1]]; end
  def scalar(value, anchor, tag, plain, quoted, style)
    @events << ['S', value, anchor, tag, style, @loc[0], @loc[1], (@chars[at(@loc[0], @loc[1])...at(@loc[2], @loc[3])] || []).join]
  end
  def start_sequence(anchor, tag, *); @events << ['[', anchor, tag, @loc[0], @loc[1]]; end
  def end_sequence(*); @events << [']']; end
  def start_mapping(anchor, tag, *); @events << ['{', anchor, tag, @loc[0], @loc[1]]; end
  def end_mapping(*); @events << ['}']; end
end
out = JSON.parse(STDIN.binmode.read).map do |src|
  begin
    collector = Collector.new(src)
    Psych::Parser.new(collector).parse(src)
    { 'events' => collector.events }
  rescue StandardError => e
    { 'error' => e.message.to_s }
  end
end
STDOUT.binmode.write(JSON.generate(out, ascii_only: true))
`;

const parseCache = new Map();

/**
 * 文字列の配列を YAML のイベント列にする（{ events } か { error }）。同じ本文は1回しか読まない。
 * ruby が無い・落ちた・出力が読めないときは**例外を投げる**（検査を黙って空にしない）。
 */
export function readYamlEvents(texts, { ruby = 'ruby' } = {}) {
  const missing = [...new Set(texts.filter((t) => !parseCache.has(`${ruby}\0${t}`)))];
  if (missing.length) {
    // 非 ASCII は \u で渡す（ruby 側のロケールに左右されない）。
    const input = JSON.stringify(missing).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    const env = { ...process.env };
    delete env.RUBYOPT;
    delete env.RUBYLIB;
    const spawn = (args) => spawnSync(ruby, [...args, '-e', RUBY_READER], { input, encoding: 'utf8', env, maxBuffer: 1 << 30, timeout: 120000 });
    // --disable-gems は起動を速くするだけ。psych / json を読めない環境では外してやり直す。
    let result = spawn(['--disable-gems']);
    if (!result.error && result.status !== 0 && /LoadError|cannot load such file/.test(String(result.stderr))) result = spawn([]);
    if (result.error) throw new Error(`YAML を読む ruby を起動できない（${result.error.code || result.error.message}）`);
    if (result.status !== 0) {
      throw new Error(`YAML を読む ruby が失敗した（終了 ${result.status}${result.signal ? ` ${result.signal}` : ''}）: ${String(result.stderr).trim().slice(0, 300)}`);
    }
    let out;
    try { out = JSON.parse(result.stdout); } catch { throw new Error('YAML を読む ruby の出力が JSON として読めない'); }
    if (!Array.isArray(out) || out.length !== missing.length) throw new Error('YAML を読む ruby の出力の件数が合わない');
    missing.forEach((t, i) => parseCache.set(`${ruby}\0${t}`, out[i]));
  }
  return texts.map((t) => parseCache.get(`${ruby}\0${t}`));
}

/**
 * 1つの文書のイベントを、GitHub と同じ順に再生する（actions/runner の
 * src/Sdk/WorkflowParser/Conversion/YamlObjectReader.cs の MoveNext を写したもの）。
 *
 *   - アンカーは、元の列から**開始のイベント**（スカラー・対応表の始まり・列の始まり）を読んだ時点で
 *     登録する。同じ名前は後の登録が上書きする。だから対応表の中で同じ名前を定義し直すと、その対応表を
 *     閉じた後も内側の定義が残る。再生の中のアンカーは登録し直さない。
 *   - エイリアスは、アンカーのイベントから元の列を再生して展開する。再生の中で出会ったエイリアスは、
 *     **その時点の**アンカー表で解く（アンカーを定義した時点ではない）。
 *   - 閉じていない対応表・列（エイリアス自身を含むもの）へのエイリアスは、GitHub では再生が自分に戻って
 *     終わらず、上限で落ちる。ここでは先に「自分自身を参照する」として落とす。
 *
 * 返すのは { e: イベント, alias }。alias は、再生しているときの**一番外側の**エイリアス（字面に書いて
 * あるもの）の { name, line }。再生していなければ null。
 */
function* replayDocument(events) {
  const anchors = new Map();
  const open = [];
  const closed = new Set();
  const replay = [];
  let next = 0;
  let current = null;
  let count = 0;
  const isStart = (e) => e[0] === '{' || e[0] === '[';
  const isEnd = (e) => e[0] === '}' || e[0] === ']';
  for (;;) {
    // 再生中なら、直前のイベントで深さを調整し、終わったら1段戻る。
    if (replay.length) {
      const top = replay.at(-1);
      if (current[0] === 'S') { if (top.depth === 0) replay.pop(); }
      else if (isStart(current)) top.depth++;
      else if (isEnd(current)) { top.depth--; if (top.depth === 0) replay.pop(); }
    }
    if (replay.length) {
      const top = replay.at(-1);
      top.index++;
      current = events[top.index];
      if (!current) throw new Error('YAML のエイリアスの再生が文書の外に出た');
    } else {
      if (next >= events.length) return;
      const at = next++;
      current = events[at];
      if (isStart(current)) open.push(at);
      else if (isEnd(current)) closed.add(open.pop());
      const anchor = current[0] === 'S' ? current[2] : isStart(current) ? current[1] : null;
      if (anchor != null) anchors.set(anchor, at);
    }
    if (current[0] === 'A') {
      const at = anchors.get(current[1]);
      if (at === undefined) throw new Error(`定義されていないアンカー *${current[1]}`);
      if (isStart(events[at]) && !closed.has(at)) throw new Error(`自分自身を参照するエイリアス *${current[1]}（GitHub でも展開が終わらない）`);
      const alias = replay.length ? replay[0].alias : { name: current[1], line: current[2] + 1 };
      replay.push({ index: at, depth: 0, alias });
      current = events[at];
    }
    if (++count > MAX_YAML_NODES) throw new Error(`イベントが ${MAX_YAML_NODES} を超える（エイリアスを展開した後）`);
    yield { e: current, alias: replay.length ? replay[0].alias : null };
  }
}

/**
 * イベント列から文書の木を作る。エイリアスは replayDocument（GitHub の YamlObjectReader の再生）で
 * 展開する。再生した値のノードには aliasOf（字面に書いてある一番外側のエイリアスの名前）と、
 * そのエイリアスの行を付ける。
 * ノード: { t: 's', v, style, line, raw } / { t: 'm', pairs: [[鍵, 値]] } / { t: 'q', items }
 */
export function buildYamlDocuments(events) {
  const docs = [];
  for (let start = 0; start < events.length;) {
    if (events[start][0] !== 'D') throw new Error(`文書の外に YAML のイベントがある ${JSON.stringify(events[start][0])}`);
    let end = start + 1;
    while (end < events.length && events[end][0] !== 'D') end++;
    docs.push(buildDocument(events.slice(start + 1, end)));
    start = end;
  }
  return docs;
}

function buildDocument(events) {
  const stream = replayDocument(events);
  const take = () => {
    const r = stream.next();
    if (r.done) throw new Error('YAML のイベントが途中で切れている');
    return r.value;
  };
  const read = ({ e, alias }) => {
    if (e[0] === 'S') {
      return alias ? { t: 's', v: String(e[1]), style: null, line: alias.line, raw: '', aliasOf: alias.name }
        : { t: 's', v: String(e[1]), style: e[4], line: e[5] + 1, col: e[6], raw: String(e[7]) };
    }
    if (e[0] === '[' || e[0] === '{') {
      const at = alias ? { line: alias.line, aliasOf: alias.name } : { line: e[3] + 1, col: e[4] };
      const node = e[0] === '[' ? { t: 'q', items: [], ...at } : { t: 'm', pairs: [], ...at };
      const end = e[0] === '[' ? ']' : '}';
      for (let n = take(); n.e[0] !== end; n = take()) {
        if (node.t === 'q') node.items.push(read(n));
        else node.pairs.push([read(n), read(take())]);
      }
      return node;
    }
    throw new Error(`想定外の YAML のイベント ${JSON.stringify(e[0])}`);
  };
  const root = read(take());
  if (!stream.next().done) throw new Error('文書の根の後ろに YAML のイベントがある');
  return root;
}

// ── 2. 式（GitHub と同じ切り出し・字句解析）──────────────────────────

/**
 * 文字列の中の `${{ … }}`。actions/runner の TemplateReader.ParseScalar と同じく、式の中の
 * '…' を数えて（'' は2回反転するので相殺される）、外側の `}}` で閉じる。閉じていなければ
 * 残りを全部式として返す（GitHub はエラーにする。拾う側に倒す）。
 */
export function templateExpressions(raw) {
  const found = [];
  for (let start = raw.indexOf('${{'); start !== -1;) {
    let end = -1;
    let inString = false;
    for (let i = start + 3; i < raw.length; i++) {
      if (raw[i] === "'") inString = !inString;
      else if (!inString && raw[i] === '}' && raw[i - 1] === '}') { end = i; break; }
    }
    if (end === -1) { found.push({ index: start + 3, text: raw.slice(start + 3) }); break; }
    found.push({ index: start + 3, text: raw.slice(start + 3, end - 1) });
    start = raw.indexOf('${{', end + 1);
  }
  return found;
}

const BOUNDARY = '([)],.!><=&|';
const isBoundary = (c) => BOUNDARY.includes(c) || isSpace(c);
const LEGAL_KEYWORD = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMBER_BEFORE = new Set([undefined, 'separator', 'start-group', 'start-index', 'start-parameters', 'operator']);

/**
 * 式の字句（actions/runner の LexicalAnalyzer.TryGetNextToken を写したもの）。正しい式では
 * GitHub と同じ区切り・同じ種類になる。正しくない式（GitHub が読み込みで拒む）の扱いは
 * 合わせていない。種類: named（文脈名）・property（. の後）・function・string・deref・…
 */
export function expressionTokens(expression) {
  const s = String(expression);
  const tokens = [];
  const open = [];
  let i = 0;
  let last;
  const push = (kind, start, value) => { last = { kind, raw: s.slice(start, i), index: start, value }; tokens.push(last); };
  for (;;) {
    while (i < s.length && isSpace(s[i])) i++;
    if (i >= s.length) break;
    const c = s[i];
    const start = i;
    if (c === '(') {
      const kind = last?.kind === 'function' ? 'start-parameters' : 'start-group';
      i++; push(kind, start); open.push(kind);
    } else if (c === '[') {
      i++; push('start-index', start); open.push('start-index');
    } else if (c === ')') {
      const kind = open.at(-1) === 'start-parameters' ? 'end-parameters' : 'end-group';
      open.pop(); i++; push(kind, start);
    } else if (c === ']') {
      open.pop(); i++; push('end-index', start);
    } else if (c === ',') {
      i++; push('separator', start);
    } else if (c === '*') {
      i++; push('wildcard', start);
    } else if (c === "'") {
      let value = '';
      let closed = false;
      i++;
      while (i < s.length) {
        const ch = s[i++];
        if (ch === "'") {
          if (i >= s.length || s[i] !== "'") { closed = true; break; }
          i++;
        }
        value += ch;
      }
      push(closed ? 'string' : 'unexpected', start, value);
    } else if ('!><=&|'.includes(c)) {
      i++;
      if (i < s.length && ['!=', '>=', '<=', '==', '&&', '||'].includes(s.slice(start, start + 2))) { i++; push('operator', start); }
      else if ('!><'.includes(c)) push('operator', start);
      else { while (i < s.length && !isBoundary(s[i])) i++; push('unexpected', start); }
    } else if ((c === '.' && NUMBER_BEFORE.has(last?.kind)) || c === '-' || c === '+' || (c >= '0' && c <= '9')) {
      do i++; while (i < s.length && (!isBoundary(s[i]) || s[i] === '.'));
      push('number', start);
    } else if (c === '.') {
      i++; push('deref', start);
    } else {
      i++;
      while (i < s.length && !isBoundary(s[i])) i++;
      const word = s.slice(start, i);
      let kind = 'unexpected';
      if (LEGAL_KEYWORD.test(word)) {
        let ahead = i;
        while (ahead < s.length && isSpace(s[ahead])) ahead++;
        if (last?.kind === 'deref') kind = 'property';
        else if (['null', 'true', 'false', 'NaN', 'Infinity'].includes(word)) kind = 'literal';
        else if (s[ahead] === '(') kind = 'function';
        else kind = 'named';
      }
      push(kind, start);
    }
  }
  return tokens;
}

const SECRET_NAME = /^[A-Z_][A-Z0-9_]*$/;
const touching = (a, b) => a && b && a.index + a.raw.length === b.index;

/**
 * 式の中の secrets 文脈の使い方。名前1つの読み方なら { canonical: 'secrets.NAME' }、
 * それ以外は { form: 抜粋 }。文脈名も名前も大文字小文字を区別して比べる（GitHub は区別しない
 * ので、違う書き方は名前の検査をすり抜ける）。間に空白を入れた形も認めない。
 */
export function secretUses(expression) {
  const s = String(expression);
  const tokens = expressionTokens(s);
  const uses = [];
  tokens.forEach((t, k) => {
    if (t.kind !== 'named' || t.raw.toLowerCase() !== 'secrets') return;
    const [a, b, c] = [tokens[k + 1], tokens[k + 2], tokens[k + 3]];
    if (t.raw === 'secrets' && a?.kind === 'deref' && b?.kind === 'property' && touching(t, a) && touching(a, b) && SECRET_NAME.test(b.raw)) {
      uses.push({ index: t.index, canonical: `secrets.${b.raw}` });
    } else if (t.raw === 'secrets' && a?.kind === 'start-index' && b?.kind === 'string' && c?.kind === 'end-index'
      && touching(t, a) && touching(a, b) && touching(b, c) && SECRET_NAME.test(b.value) && b.raw === `'${b.value}'`) {
      uses.push({ index: t.index, canonical: `secrets['${b.value}']` });
    } else {
      uses.push({ index: t.index, form: s.slice(Math.max(0, t.index - 12), t.index + 28).replace(SPACE_RUN, ' ').trim() });
    }
  });
  return uses;
}

/** 名前1つの読み方が、その字面に何回そのまま書いてあるか（名前の検査が読めるのはこの数だけ）。 */
function literalCount(raw, canonical) {
  let n = 0;
  for (let at = raw.indexOf(canonical); at !== -1; at = raw.indexOf(canonical, at + 1)) {
    if (canonical.endsWith(']') || !/[A-Za-z0-9_-]/.test(raw[at + canonical.length] ?? '')) n++;
  }
  return n;
}

// ── 3. ワークフロー ──────────────────────────────────────────────

const scalarText = (node) => (node && node.t === 's' ? node.v : null);
const isKey = (node, name) => {
  const v = scalarText(node);
  return v !== null && v.replace(SPACE_RUN, '').toLowerCase() === name;
};

/** 木の中のすべての文字列（鍵も値も）。parentKey は、その値が直接ぶら下がっている鍵。 */
function* strings(node, parentKey = null) {
  if (!node) return;
  if (node.t === 's') { yield { node, parentKey }; return; }
  if (node.t === 'q') { for (const item of node.items) yield* strings(item, null); return; }
  for (const [k, v] of node.pairs) {
    yield* strings(k, null);
    yield* strings(v, scalarText(k));
  }
}
const textOf = (nodes) => nodes.flatMap((n) => [...strings(n)].map(({ node }) => node.v)).join('\n');

/** ジョブの直下の鍵の値（`<<` で混ぜた先も見る。GitHub は `<<` を混ぜないが、安全側に倒す）。 */
function fieldValues(job, name, seen = new Set()) {
  if (!job || job.t !== 'm' || seen.has(job)) return [];
  seen.add(job);
  const out = [];
  for (const [k, v] of job.pairs) {
    if (isKey(k, name)) out.push({ key: k, value: v });
    else if (scalarText(k) === '<<') for (const m of v.t === 'q' ? v.items : [v]) out.push(...fieldValues(m, name, seen));
  }
  return out;
}

const LOCAL_WORKFLOW = /^\.\/\.github\/workflows\/([^/@]+)$/;

/** 1つのファイルを読んで、ジョブとファイル全体の設定に分ける。読めなければ { error }。 */
function analyzeFile(name, text, parsed) {
  if (typeof text !== 'string') return { name, error: 'UTF-8 として読めない' };
  if (parsed.error) return { name, error: parsed.error };
  let docs;
  try { docs = buildYamlDocuments(parsed.events); } catch (e) { return { name, error: e.message }; }
  // GitHub も文書は1つしか受け付けない（YamlObjectReader.ValidateStart / ValidateEnd）。
  if (docs.length !== 1) return { name, error: `文書が ${docs.length} 個ある（GitHub はワークフローとして受け付けない）` };
  const root = docs[0];
  // 最上位が対応表でない・jobs が無い・ジョブが1つも無いファイルも読めない扱いにする。どれも
  // ワークフローとしては使えない形で、この読み方と GitHub の読み方がずれたとき（ジョブを見失った
  // とき）に、ファイル全体を「モデル無し」として通さないため。
  if (root.t !== 'm') return { name, error: '最上位が対応表でない' };
  const workflowNodes = [];
  const jobs = [];
  for (const [k, v] of root.pairs) {
    workflowNodes.push(k);
    if (!isKey(k, 'jobs')) { workflowNodes.push(v); continue; }
    if (v.t !== 'm') return { name, error: `jobs の値が対応表でない（${k.line}行）` };
    for (const [jk, jv] of v.pairs) {
      jobs.push({ id: scalarText(jk) ?? `(鍵が文字列でない: ${jk.line}行)`, key: jk, node: jv, line: jk.line, column: jk.col ?? 0 });
    }
  }
  if (!jobs.length) return { name, error: 'jobs にジョブが1つも無い' };
  return { name, root, workflowNodes, workflowText: textOf(workflowNodes), jobs };
}

/**
 * 1つのディレクトリのワークフロー群を読んで、名前で読んでいない箇所（findings）と、
 * ジョブごとのモデルの有無（jobs）を返す。files: [{ name, text }]（text が null なら読めない）。
 * finding: { file, line, form, job, model, kind? }。kind: 'parse' は読めないファイル。
 */
export function inspectWorkflows(files, { ruby } = {}) {
  const texts = files.map((f) => (typeof f.text === 'string' ? f.text.replace(/^\uFEFF/, '') : null));
  const parsed = readYamlEvents(texts.filter((t) => t !== null), { ruby });
  let p = 0;
  const analyzed = new Map(files.map((f, n) => [f.name, analyzeFile(f.name, texts[n], texts[n] === null ? null : parsed[p++])]));

  const modelCache = new Map();
  const callees = (job) => fieldValues(job.node, 'uses').map(({ value }) => scalarText(value) ?? '(文字列でない uses)');
  const jobRunsModel = (file, job, seen = new Set()) => {
    const key = `${file.name}#${job.id}#${job.line}`;
    if (modelCache.has(key)) return modelCache.get(key);
    let result = MODEL_MARKERS.test(`${textOf([job.key, job.node])}\n${file.workflowText}`);
    for (const callee of callees(job)) {
      if (result) break;
      const local = callee.match(LOCAL_WORKFLOW);
      const target = local ? analyzed.get(local[1]) : null;
      // 外のリポジトリ・見つからない・読めない呼び先は中身を確かめられない。動かしうる側に倒す。
      if (!target || target.error) result = true;
      else if (!seen.has(target.name)) result = fileRunsModel(target, new Set([...seen, file.name]));
    }
    modelCache.set(key, result);
    return result;
  };
  const fileRunsModel = (file, seen = new Set()) => file.jobs.some((job) => jobRunsModel(file, job, seen));

  const findings = [];
  const seenFinding = new Set();
  const add = (f) => {
    const key = `${f.file}|${f.job}|${f.line}|${f.form}`;
    if (!seenFinding.has(key)) { seenFinding.add(key); findings.push(f); }
  };
  const scan = (file, nodes, scope) => {
    for (const { node, parentKey } of nodes.flatMap((n) => [...strings(n)])) {
      // `if:` の値は、${{ }} の中と、値を丸ごと式として読んだものの両方を見る（GitHub は ${{ }} だけで
      // 書いた値はその中身を、それ以外は値そのものを条件として読む）。名前1つの読み方の数は、
      // 二重に数えないよう読み方ごとに数えて大きいほうを使う。
      const readings = [templateExpressions(node.v)];
      if (parentKey !== null && parentKey.replace(SPACE_RUN, '').toLowerCase() === 'if') readings.push([{ index: 0, text: node.v }]);
      const named = new Map();
      for (const expressions of readings) {
        const counts = new Map();
        for (const expression of expressions) {
          for (const use of secretUses(expression.text)) {
            if (use.canonical) { counts.set(use.canonical, (counts.get(use.canonical) || 0) + 1); continue; }
            // ブロック（run: |）の中は、式のある行を数える。それ以外は値の始まりの行。
            const line = node.style === 4 ? node.line + 1 + (node.v.slice(0, expression.index + use.index).match(/\n/g) || []).length : node.line;
            add({ file: file.name, line, form: use.form, ...scope });
          }
        }
        for (const [canonical, n] of counts) named.set(canonical, Math.max(named.get(canonical) || 0, n));
      }
      for (const [canonical, n] of named) {
        if (node.aliasOf !== undefined) {
          add({ file: file.name, line: node.line, form: `${canonical}（エイリアス *${node.aliasOf} で持ち込んだ。このジョブの字面に名前が無い）`, ...scope });
        } else if (literalCount(node.raw, canonical) < n) {
          add({ file: file.name, line: node.line, form: `${canonical}（YAML のエスケープ・行継ぎ・'' などで書いてあり、字面に名前がそのまま無い）`, ...scope });
        }
      }
    }
  };

  for (const file of analyzed.values()) {
    if (file.error) {
      add({ file: file.name, line: null, form: `YAML として読めない: ${file.error}`, job: '(file)', model: true, kind: 'parse' });
      continue;
    }
    scan(file, file.workflowNodes, { job: '(workflow)', model: fileRunsModel(file) });
    for (const job of file.jobs) {
      const scope = { job: job.id, model: jobRunsModel(file, job) };
      scan(file, [job.key, job.node], scope);
      // secrets: inherit（値が文字列なら書き方によらず inherit とみなす）。同じディレクトリで
      // モデルを動かさない呼び先だけ通す（呼ばれた側も名前でしか読めない。この検査が見る）。
      for (const { key, value } of fieldValues(job.node, 'secrets')) {
        if (value.t !== 's') continue;
        const targets = callees(job);
        const safe = targets.length > 0 && targets.every((callee) => {
          const local = callee.match(LOCAL_WORKFLOW);
          const target = local ? analyzed.get(local[1]) : null;
          return target && !target.error && !fileRunsModel(target, new Set([file.name]));
        });
        if (!safe) add({ file: file.name, line: key.line, form: `secrets: ${value.v} → ${targets.join(', ') || '(呼び先なし)'}`, ...scope });
      }
    }
  }
  const jobs = [...analyzed.values()].filter((f) => !f.error)
    .flatMap((file) => file.jobs.map((job) => ({ file: file.name, id: job.id, model: jobRunsModel(file, job), line: job.line, column: job.column })));
  return { findings, jobs };
}

export const bulkSecretFindings = (files, options) => inspectWorkflows(files, options).findings;

/**
 * 問題の文言。allow は [{ workflow, job, reason }]（台帳の $bulk_secret_access）。
 * **モデルを動かしうるジョブと、読めないファイルは例外にできない。**理由の無い例外も認めない。
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
    const allowed = entries.some((e) => e && e.workflow === f.file && e.job === f.job && typeof e.reason === 'string' && e.reason.trim());
    if (f.kind === 'parse') {
      problems.push(`${f.file}: ${f.form} — **読めないファイルは検査できないので通さない**（例外にできない）`);
    } else if (f.model) {
      problems.push(`${at}: モデルを動かすジョブが secret を名前で読んでいない「${f.form}」`
        + ' — **全部の secret がモデルに渡るか、名前の検査から見えない。**`secrets.NAME` を字面のまま1つずつ書く（このジョブは例外にできない）');
    } else if (!allowed) {
      problems.push(`${at}: secret を名前で読んでいない「${f.form}」`
        + ' — 名前の検査（台帳・モデルのジョブの検査）をすり抜ける。`secrets.NAME` を字面のまま1つずつ書くか、'
        + 'モデルを動かさないジョブなら data/credential-expiry.json の $bulk_secret_access に理由つきで書く');
    }
  }
  return problems;
}
