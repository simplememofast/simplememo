// node --test tools/server-guard.test.js   (Node built-ins only)
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { isLocalRequest, resolveOutDir } from "./server-guard.js";

const PORT = 3456;

test("isLocalRequest accepts the loopback listener addressed by its local names", () => {
  assert.equal(isLocalRequest({ host: "localhost:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "127.0.0.1:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "[::1]:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "LOCALHOST:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "localhost:3456", origin: "http://localhost:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "127.0.0.1:3456", origin: "http://127.0.0.1:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "[::1]:3456", origin: "http://[::1]:3456" }, PORT), true);
  assert.equal(isLocalRequest({ host: "LOCALHOST:3456", origin: "http://localhost:3456" }, PORT), true);
});

test("isLocalRequest refuses DNS-rebinding and LAN Host headers", () => {
  assert.equal(isLocalRequest({ host: "attacker.example:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host: "192.168.1.20:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host: "0.0.0.0:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host: "localhost:3456.attacker.example" }, PORT), false);
  assert.equal(isLocalRequest({ host: "localhost.:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host: "localhost:80" }, PORT), false);
  assert.equal(isLocalRequest({ host: "localhost" }, PORT), false);
  assert.equal(isLocalRequest({ host: "[::1]" }, PORT), false);
  assert.equal(isLocalRequest({ host: "::1:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host: "" }, PORT), false);
  assert.equal(isLocalRequest({ host: ["localhost:3456"] }, PORT), false);
  assert.equal(isLocalRequest({}, PORT), false);
  assert.equal(isLocalRequest(undefined, PORT), false);
});

test("isLocalRequest refuses an Origin that is not this server's own origin", () => {
  const host = "localhost:3456";
  assert.equal(isLocalRequest({ host, origin: "https://attacker.example" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "http://attacker.example:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "http://localhost:3000" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "https://localhost:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "http://127.0.0.1:3456" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "http://localhost:3456/" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "null" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: "" }, PORT), false);
  assert.equal(isLocalRequest({ host, origin: ["http://localhost:3456"] }, PORT), false);
  // Node joins a repeated Origin header with ", "
  assert.equal(isLocalRequest({ host, origin: "http://localhost:3456, https://attacker.example" }, PORT), false);
});

test("resolveOutDir keeps generated directories inside the output root", () => {
  const root = path.resolve("/tmp/slide-builder-out");
  for (const dir of [
    "slides_A_2026-10-19T11-16-27",
    "slides_C_2026-10-19T11-16-27",
    "ab_test_2026-10-19T11-16-27",
    "batch_B_day3_2026-10-19T11-16-27",
  ]) {
    assert.equal(resolveOutDir(root, dir), path.join(root, dir));
  }
  assert.equal(resolveOutDir(root + path.sep, "slides_A_2026-10-19T11-16-27"), path.join(root, "slides_A_2026-10-19T11-16-27"));
});

test("resolveOutDir refuses traversal, separators and non-strings", () => {
  const root = path.resolve("/tmp/slide-builder-out");
  for (const dir of [
    "..",
    ".",
    "../../../../etc/passwd",
    "../..",
    "..%2f..%2fetc",
    "slides_A/../../x",
    "a/b",
    "a\\b",
    "/etc",
    "C:\\Windows",
    "slides.A",
    "slides_A\n",
    "slides\u0000",
    "",
    undefined,
    null,
    0,
    ["slides_A_2026-10-19T11-16-27"],
    { toString: () => "slides_A" },
  ]) {
    assert.equal(resolveOutDir(root, dir), null, `should refuse ${JSON.stringify(dir)}`);
  }
});

// Lexical path validation alone does not contain filesystem symlinks.
import fs from 'node:fs';
import os from 'node:os';
import { existingPathInside } from './server-guard.js';
test('real-path boundary rejects sibling prefixes, traversal and symlink escapes', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-path-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'out');
  fs.mkdirSync(root); fs.mkdirSync(path.join(dir, 'out-other'));
  fs.writeFileSync(path.join(root, 'slide.png'), 'local');
  fs.writeFileSync(path.join(dir, 'out-other', 'secret'), 'outside');
  fs.symlinkSync(path.join(dir, 'out-other'), path.join(root, 'linked'));
  assert.equal(existingPathInside(root, 'slide.png'), path.join(root, 'slide.png'));
  for (const rel of ['../out-other/secret', 'linked/secret', 'linked', '.', 'missing']) assert.equal(existingPathInside(root, rel), null);
});
