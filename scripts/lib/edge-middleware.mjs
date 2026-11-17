// functions/_middleware.js（エッジの URL 正規化）をロードして駆動する共通ヘルパ。
// check-url-normalization.mjs と check-internal-redirects.mjs が共用する。
//
// ミドルウェアは素の ESM で、このリポジトリには package.json（`"type":
// "module"`）が無い。以前は .js を CommonJS と読まれるのを避けるため
// data: URL 経由で import していたが、2026-11-16 からミドルウェアが
// ./lib/ga-geo.js を import するようになり、data: URL では相対 import を
// 解決できない。ファイルの URL で import する。Node 22.7 以降（CI は 24）は
// ESM の構文を検出して .js をモジュールとして読む。scripts/lib/pages-functions.mjs
// （cache-contract の検査）も同じ読み方をしている。

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A real Response lets source audits exercise middleware that adjusts headers
// after context.next(), while this marker still identifies the synthetic asset.
const PASSTHROUGH_HEADER = "X-Edge-Test-Passthrough";
export const PASSTHROUGH = new Response(null, { headers: { [PASSTHROUGH_HEADER]: "1" } });

export async function loadEdgeMiddleware(root = ROOT) {
  const { onRequest } = await import(
    pathToFileURL(path.join(root, "functions/_middleware.js")).href
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
  if (res === PASSTHROUGH || res.headers.get(PASSTHROUGH_HEADER) === "1") return { kind: "pass" };
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
