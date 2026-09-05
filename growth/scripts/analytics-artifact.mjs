#!/usr/bin/env node
// Local artifact handling. No Google credentials, network calls, or stdout data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unseal } from '../lib/analytics-envelope.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function privateDestination(file) {
  const target = path.resolve(file);
  let ancestor = path.dirname(target);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const real = fs.realpathSync(ancestor);
  // Cover other clones/worktrees as well as the checkout running this script.
  for (let dir = real; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) throw new Error('Private analytics must be outside every Git checkout');
    if (path.dirname(dir) === dir) break;
  }
  const isWithin = (p, base) => p === base || p.startsWith(base + path.sep);
  if (isWithin(target, root) || isWithin(real, fs.realpathSync(root))) {
    throw new Error('Store private analytics and keys outside the public repository');
  }
  return target;
}
function writePrivate(file, text) {
  const target = privateDestination(file);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, text, { flag: 'wx', mode: 0o600 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, a, b, c] = process.argv.slice(2);
    if (mode === 'init-key' && a && !b) {
      const privatePath = privateDestination(path.join(a, 'recipient-private.pem'));
      const publicPath = privateDestination(path.join(a, 'recipient-public.pem'));
      if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) throw new Error('Recipient key already exists');
      const pair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 3072,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      writePrivate(privatePath, pair.privateKey);
      writePrivate(publicPath, pair.publicKey);
      console.log('Recipient key created outside the repository. Only the public key goes to Actions.');
    } else if (mode === 'decrypt' && a && b && c) {
      privateDestination(c);
      const payload = unseal(JSON.parse(fs.readFileSync(a, 'utf8')), fs.readFileSync(b, 'utf8'));
      writePrivate(c, JSON.stringify(payload, null, 2) + '\n');
      console.log(`Decrypted report saved. status=${payload.status}`);
    } else throw new Error('Usage: analytics-artifact.mjs init-key DIR | decrypt ENVELOPE PRIVATE_KEY OUTPUT');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
