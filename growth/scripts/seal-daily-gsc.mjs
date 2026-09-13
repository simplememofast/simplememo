// No query and no plaintext artifact: reuse the collector's exact output bytes.
import fs from 'node:fs';
import path from 'node:path';
import {seal} from '../lib/analytics-envelope.mjs';
import {packDaily} from '../lib/daily-gsc-handoff.mjs';

try {
  const [directory, label, output] = process.argv.slice(2);
  if (!directory || !label || !output || !process.env.ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64) throw new Error('configuration');
  const payload = packDaily({directory, label});
  const envelope = seal(payload, Buffer.from(process.env.ANALYTICS_RECIPIENT_PUBLIC_KEY_BASE64, 'base64').toString('utf8'));
  fs.mkdirSync(path.dirname(output), {recursive: true, mode: 0o700});
  fs.writeFileSync(output, JSON.stringify(envelope) + '\n', {mode: 0o600, flag: 'wx'});
  console.log('Existing daily snapshot encrypted for the existing Company reader; no additional query.');
} catch {
  console.error('Daily snapshot handoff failed validation or configuration; no plaintext output published.');
  process.exitCode = 1;
}
