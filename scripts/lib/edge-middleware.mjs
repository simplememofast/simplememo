// functions/_middleware.js（エッジの URL 正規化）をロードして駆動する共通ヘルパ。
// check-url-normalization.mjs と check-internal-redirects.mjs が共用する。
//
// ミドルウェアは素の ESM だが、このリポジトリには package.json（`"type":
// "module"`）が無いため、.js ファイルの bare import は CommonJS として
// 解釈されて失敗する。data: URL 経由の import は常にモジュールスコープ
// なので、それで回避する。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PASSTHROUGH = Symbol("passthrough");

export async function loadEdgeMiddleware(root = ROOT) {
  const src = readFileSync(path.join(root, "functions/_middleware.js"), "utf8");
  const { onRequest } = await import(
    "data:text/javascript," + encodeURIComponent(src)
  );
  return onRequest;
}

/**
 * ミドルウェアに absoluteUrl を1回通し、結果を分類して返す。
 *   { kind: "pass" }                          … context.next() まで到達
 *   { kind: "redirect", status, to }          … 3xx（to は origin 相対に畳む）
 *   { kind: "status", status }                … それ以外（404 / 410 など）
 */
export async function edgeResult(onRequest, absoluteUrl, origin) {
  const res = await onRequest({
    request: new Request(absoluteUrl),
    next: async () => PASSTHROUGH,
  });
  if (res === PASSTHROUGH) return { kind: "pass" };
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    return {
      kind: "redirect",
      status: res.status,
      to: loc.startsWith(origin) ? loc.slice(origin.length) : loc,
    };
  }
  return { kind: "status", status: res.status };
}
