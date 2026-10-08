// Generated translations retain the source page's measured App Store links.
// This does not claim that the destination CPP has assets in the new language.
const fs = require('fs');
const path = require('path');

function generatedSources(registry) {
  const routes = new Map();
  const url = (file) => '/' + (file.endsWith('index.html') ? file.slice(0, -10) : file.slice(0, -5));
  for (const group of registry.pages) {
    for (const [locale, file] of Object.entries(group.pages)) {
      if (!Object.hasOwn(group.existing, locale)) routes.set(url(file), url(group.source));
    }
  }
  return routes;
}

const registryPath = path.resolve(__dirname, '../../data/i18n/pages.json');
const registry = fs.existsSync(registryPath)
  ? JSON.parse(fs.readFileSync(registryPath, 'utf8')) : {pages: []};
const sources = generatedSources(registry);
const sourceFiles = new Map(registry.pages.map((group) => [
  '/' + (group.source.endsWith('index.html') ? group.source.slice(0, -10) : group.source.slice(0, -5)), group.source,
]));
const sourceRouteOf = (urlPath) => sources.get(urlPath) || urlPath;
const generatedSourceFileOf = (urlPath) => sources.has(urlPath) ? sourceFiles.get(sources.get(urlPath)) : null;

module.exports = { generatedSources, sourceRouteOf, generatedSourceFileOf };
