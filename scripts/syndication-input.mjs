// Import model output as data into a fresh, model-free job. Never execute it or
// extract a model-controlled tree over the trusted checkout.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_ARTICLE_BYTES = 256 * 1024;
const KEYS = new Set(['platform', 'title', 'description', 'tags', 'series', 'basis', 'sources', 'body_markdown', 'skip', 'reason']);
export function importArticle(input, output) {
  const fd = fs.openSync(input, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let bytes;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_ARTICLE_BYTES) throw new Error('Article must be a bounded regular JSON file');
    bytes = fs.readFileSync(fd);
    if (bytes.length > MAX_ARTICLE_BYTES) throw new Error('Article exceeds size limit');
  } finally { fs.closeSync(fd); }
  const article = JSON.parse(bytes.toString('utf8'));
  if (!article || Array.isArray(article) || typeof article !== 'object') throw new Error('Article must be a JSON object');
  for (const key of Object.keys(article)) {
    if (!KEYS.has(key)) throw new Error('Unexpected article field');
    const value = article[key];
    if (['tags', 'sources'].includes(key)) {
      if (!Array.isArray(value) || value.length > 8 || value.some((v) => typeof v !== 'string')) throw new Error('Invalid article list');
    } else if (key === 'skip') {
      if (typeof value !== 'boolean') throw new Error('Invalid skip flag');
    } else if (key === 'series' && value === null) {
      continue;
    } else if (typeof value !== 'string') throw new Error('Invalid article text');
  }
  // Existing semantic/identity/stop/interval checks still run after this import.
  fs.writeFileSync(output, JSON.stringify(article) + '\n', { flag: 'wx', mode: 0o600 });
  return article;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { importArticle(process.argv[2], process.argv[3]); }
  catch { console.error('Untrusted article rejected'); process.exitCode = 1; }
}
