// Node には Workers の HTMLRewriter（lol-html）が無い。検査で functions/lib/ga-geo.js の
// 書き換えを動かすための、"script" セレクタだけの模型。
//
// 写しているもの（lol-html の公開されている挙動）:
//   - element ハンドラは開始タグで呼ばれ、remove() で要素を中身ごと消す。
//   - text ハンドラは中身を小分け（chunk）で受け取り、最後の chunk だけ
//     lastInTextNode が true。最後の chunk は空文字のことがある（trailingEmptyChunk）。
//   - chunk.remove() で消し、chunk.replace(s, { html: true }) で s をそのまま入れる。
//     html: true が無ければ、< > & " を実体参照にする（lol-html と同じく文字として入れる）。
//   - HTML のコメントの中の <script> は要素ではない。
// 写していないもの: script 以外のセレクタ、属性の書き換え、before/after、
// script の中の "<!--" による脱出状態。使うなら模型を足すこと。
//
// 本物との突き合わせ（手元・CI 外）: 2026-11-16 に workerd 1.20261101.1（miniflare
// 5.20261101.0-beta）の HTMLRewriter に functions/lib/ga-geo.js の handlers を当て、
// リポジトリの全 HTML 2,535 件で、この模型（小分け 16・1・分けない の 3 通り）と
// 出力が 1 バイト残らず一致することを確かめた。最初の突き合わせでは tr/ の 21 件が
// ずれた（toLowerCase() が İ を 2 文字にして位置がずれた。下で直した）。

const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const decodeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function attributes(startTag) {
  const attrs = new Map();
  const inner = startTag.replace(/^<script\b/i, "").replace(/\/?>$/, "");
  for (const m of inner.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeAttr(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return attrs;
}

function chunksOf(text, size) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** handlers（{ element, text } の配列）を HTML 文字列に当てた結果。 */
export function rewriteScripts(html, handlerList, { chunkSize = 16, trailingEmptyChunk = true } = {}) {
  let out = "";
  let i = 0;
  // ASCII だけを小文字にする。toLowerCase() はトルコ語の İ（U+0130）を 2 文字に
  // するので、位置が html とずれる（tr/ のページで実際にずれた）。
  const lower = html.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (;;) {
    const comment = lower.indexOf("<!--", i);
    let script = -1;
    for (let from = i; ;) {
      script = lower.indexOf("<script", from);
      if (script === -1 || /[\s>\/]/.test(lower[script + 7] ?? "")) break;
      from = script + 7;
    }
    if (script === -1) { out += html.slice(i); return out; }
    if (comment !== -1 && comment < script) {
      const end = lower.indexOf("-->", comment + 4);
      const stop = end === -1 ? html.length : end + 3;
      out += html.slice(i, stop);
      i = stop;
      continue;
    }
    out += html.slice(i, script);
    const tagEnd = html.indexOf(">", script);
    if (tagEnd === -1) { out += html.slice(script); return out; }
    const startTag = html.slice(script, tagEnd + 1);
    let close = tagEnd + 1;
    for (;;) {
      close = lower.indexOf("</script", close);
      if (close === -1 || /[\s>\/]/.test(lower[close + 8] ?? "")) break;
      close += 8;
    }
    if (close === -1) { out += html.slice(script); return out; }
    const closeEnd = html.indexOf(">", close);
    const endTag = html.slice(close, closeEnd === -1 ? html.length : closeEnd + 1);
    const content = html.slice(tagEnd + 1, close);
    i = closeEnd === -1 ? html.length : closeEnd + 1;

    const attrs = attributes(startTag);
    let removed = false;
    const element = {
      tagName: "script",
      getAttribute: (name) => (attrs.has(name.toLowerCase()) ? attrs.get(name.toLowerCase()) : null),
      hasAttribute: (name) => attrs.has(name.toLowerCase()),
      remove() { removed = true; },
    };
    for (const h of handlerList) if (!removed && h.element) h.element(element);
    if (removed) continue;

    const pieces = chunksOf(content, chunkSize);
    if (trailingEmptyChunk || pieces.length === 0) pieces.push("");
    if (content.length === 0 && !trailingEmptyChunk) pieces.length = 0;
    let body = "";
    pieces.forEach((text, n) => {
      const chunk = {
        text,
        lastInTextNode: n === pieces.length - 1,
        removed: false,
        replacement: null,
        remove() { this.removed = true; },
        replace(content, options) { this.replacement = options && options.html ? content : escapeText(content); },
      };
      for (const h of handlerList) if (h.text) h.text(chunk);
      body += chunk.replacement !== null ? chunk.replacement : chunk.removed ? "" : chunk.text;
    });
    out += startTag + body + endTag;
  }
}

/** `new HTMLRewriter().on("script", handlers).transform(response)` の模型。 */
export function scriptRewriterModel(options = {}) {
  return class ScriptRewriterModel {
    constructor() { this.handlers = []; }
    on(selector, handlers) {
      if (selector !== "script") throw new Error(`the HTMLRewriter model supports only "script", got "${selector}"`);
      this.handlers.push(handlers);
      return this;
    }
    onDocument() { throw new Error("the HTMLRewriter model does not support onDocument()"); }
    transform(response) {
      const handlers = this.handlers;
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      const body = response.body === null ? null : new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(rewriteScripts(await response.text(), handlers, options)));
          controller.close();
        },
      });
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    }
  };
}
