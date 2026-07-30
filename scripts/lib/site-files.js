/**
 * Shared page-walking helpers for the scripts/ build + validation tools.
 *
 * Five scripts had each grown their own copy of the same recursive HTML
 * walker, and the copies had quietly drifted apart in three dimensions:
 *
 *   - skip list      seo-check / add-hreflang read a SKIP_FILES const,
 *                    generate-og-images / indexnow-notify hardcoded
 *                    '404.html', annotate-lang-parts skipped nothing.
 *   - skip dirs      every script scans a different subset (generate-og-images
 *                    also skips 'en', seo-check keeps 'admin' and 'tiktok').
 *   - read errors    three copies wrapped readdirSync in try/catch, two did
 *                    not (and would therefore throw on an unreadable dir).
 *
 * Those differences are real and each one is load-bearing for its script, so
 * they are preserved here as explicit options rather than flattened. The
 * point of this module is that the differences are now *visible as
 * configuration* at each call site instead of hidden in copy-pasted bodies.
 */

const fs = require('fs');
const path = require('path');

/**
 * Recursively collect .html files under `dir`.
 *
 * @param {string} dir                      directory to walk
 * @param {object} [options]
 * @param {string[]} [options.skipDirs]     directory names to skip entirely
 * @param {string[]} [options.skipFiles]    file names to omit from the result
 * @param {boolean} [options.tolerateReadErrors]
 *        When true an unreadable directory is skipped silently; when false the
 *        underlying fs error propagates. Defaults to true — pass false to keep
 *        the fail-loud behaviour of the callers that never had a try/catch.
 * @returns {string[]} absolute paths, in readdir order, parents before children
 */
function collectHtmlFiles(dir, options) {
  const opts = options || {};
  const skipDirs = opts.skipDirs || [];
  const skipFiles = opts.skipFiles || [];
  const tolerateReadErrors = opts.tolerateReadErrors !== false;

  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (tolerateReadErrors) return results;
    throw e;
  }

  for (const entry of entries) {
    if (skipDirs.includes(entry.name) || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectHtmlFiles(fullPath, opts));
    } else if (entry.name.endsWith('.html') && !skipFiles.includes(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Site-root-relative URL path for a page file: '/vs/notion/index.html' → '/vs/notion/',
 * '/faq.html' → '/faq'. Windows separators are normalised to '/'.
 *
 * Uses String.replace with a plain string needle (not an anchored regex) to
 * stay byte-for-byte identical to the four call sites this replaces.
 *
 * @param {string} rootDir  site root the path should be relative to
 * @param {string} filePath absolute path to the .html file
 * @returns {string} path beginning with '/' — prepend SITE_URL for an absolute URL
 */
function toUrlPath(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath).replace(/\\/g, '/');
  let url = '/' + relative;
  if (url.endsWith('/index.html')) url = url.replace('/index.html', '/');
  else if (url.endsWith('.html')) url = url.replace('.html', '');
  return url;
}

module.exports = { collectHtmlFiles, toUrlPath };
