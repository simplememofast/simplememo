import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/lang.js', import.meta.url), 'utf8');

function page({ served = 'ja', stored = null, missingMeta = false } = {}) {
  const values = {
    'meta[name="description"]': 'Original search description',
    'meta[property="og:title"]': 'Original social title',
    'meta[property="og:description"]': 'Original social description',
    'meta[name="twitter:title"]': 'Original Twitter title',
    'meta[name="twitter:description"]': 'Original Twitter description'
  };
  const elements = new Map(Object.entries(missingMeta ? {} : values).map(([selector, content]) => [
    selector, {
      content,
      getAttribute() { return this.content; },
      setAttribute(name, value) { this.content = value; },
      removeAttribute() { this.content = null; }
    }
  ]));
  const templates = Object.fromEntries(['ja', 'en'].map(lang => [lang, {
    querySelector(selector) { return { textContent: `${lang} template ${selector}` }; }
  }]));
  const document = {
    title: 'Original canonical title',
    readyState: 'complete',
    documentElement: { lang: served, getAttribute() { return this.lang; } },
    querySelector(selector) {
      return elements.get(selector) || templates[/data-lang="(ja|en)"/.exec(selector)?.[1]] || null;
    },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const window = { location: { search: '', href: 'https://example.test/article' } };
  const localStorage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  vm.runInNewContext(source, { document, window, localStorage, URL, URLSearchParams });
  return { document, elements, switchTo: window.SimpleMemoLang.switch, values };
}

for (const served of ['ja', 'en']) {
  const other = served === 'ja' ? 'en' : 'ja';
  for (const stored of [served, other]) {
    const fixture = page({ served, stored });
    for (let cycle = 0; cycle < 2; cycle++) {
      fixture.switchTo(other);
      assert.equal(fixture.document.title, `${other} template .meta-title`);
      assert.equal(fixture.elements.get('meta[name="description"]').content, `${other} template .meta-description`);
      fixture.switchTo(served);
      assert.equal(fixture.document.documentElement.lang, served);
      assert.equal(fixture.document.title, 'Original canonical title');
      for (const [selector, original] of Object.entries(fixture.values)) {
        assert.equal(fixture.elements.get(selector).content, original, selector);
      }
    }
  }
}
const sparse = page({ missingMeta: true });
sparse.switchTo('en');
sparse.switchTo('ja');
assert.equal(sparse.document.title, 'Original canonical title');
assert.equal(sparse.elements.size, 0);
console.log('Language metadata: JA/EN return trips, saved preferences, distinct canonical metadata and absent tags passed.');
