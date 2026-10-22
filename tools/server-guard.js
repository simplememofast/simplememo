/**
 * Request and path guards for the local slide-builder server (server.js).
 *
 * The server has no login, so it must only ever be reachable by this
 * machine's own browser and tools:
 *  - isLocalRequest() accepts a request only when its Host header names the
 *    loopback listener (so a web page that rebinds its DNS name to 127.0.0.1
 *    is refused) and any Origin header is that same local origin (so a
 *    cross-site page cannot POST to the API).
 *  - resolveOutDir() accepts a client-supplied output directory only when it
 *    is a plain directory name that resolves to a direct child of the output
 *    root, so "..", separators and absolute paths can never reach the
 *    filesystem outside tools/out.
 *
 * Pure functions with no dependencies, so `node --test` can exercise them
 * without the server's npm packages.
 */

import path from "node:path";
import fs from "node:fs";

function localAuthorities(port) {
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
}

export function isLocalRequest(headers, port) {
  const host = headers?.host;
  if (typeof host !== "string") return false;
  const authority = host.toLowerCase();
  if (!localAuthorities(port).includes(authority)) return false;

  const origin = headers.origin;
  if (origin === undefined) return true; // curl, navigations, same-origin GET: no Origin sent
  if (typeof origin !== "string") return false;
  return origin.toLowerCase() === `http://${authority}`;
}

const DIR_NAME = /^[A-Za-z0-9_-]+$/;

export function resolveOutDir(outRoot, dir) {
  if (typeof dir !== "string" || !DIR_NAME.test(dir)) return null;
  const root = path.resolve(outRoot);
  const resolved = path.resolve(root, dir);
  if (path.dirname(resolved) !== root) return null;
  return resolved;
}

// Check real paths as well as lexical paths. A child symlink must not turn an
// otherwise valid name into a read/write outside the permitted root.
export function existingPathInside(root, rel) {
  if (typeof rel !== 'string' || path.isAbsolute(rel)) return null;
  try {
    const base = fs.realpathSync(root);
    const target = fs.realpathSync(path.resolve(root, rel));
    return target.startsWith(base + path.sep) ? target : null;
  } catch { return null; }
}
