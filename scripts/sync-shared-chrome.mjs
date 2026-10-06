#!/usr/bin/env node
// Adapter for the Node generator ledger; the HTML transformer uses Python's parser.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (!process.argv.includes('--write')) throw new Error('Expected --write');
  execFileSync('python3', ['scripts/sync_shared_chrome.py', '--write'], { cwd: root, stdio: 'inherit' });
}
