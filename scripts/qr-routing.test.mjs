import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildTargets, cppForQr, qrReferences, storeUrl, matrixFromSvg, toRgba } from './generate-qr-codes.mjs';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const ppid = '1408d7a4-3249-4c87-a079-e13032312579';
const row = { match: ['^/obsidian/'], ppid, asc_state: 'APPROVED', asc_visible: true };
const map = { cpps: [row] };
const html = '<img src="/assets/img/qr-obsidian-ja.svg">';
const definitions = [{ slug: 'obsidian', en: false }];

test('Obsidian QR keeps its campaign and storefront while selecting the visible CPP', () => {
  const [target] = buildTargets([{ pagePath: '/obsidian/', html }], map, definitions);
  assert.equal(target.url, `https://apps.apple.com/jp/app/id6758438948?pt=128498560&ct=obsidian-jp__qr&mt=8&ppid=${ppid}`);
});

test('standalone English pages follow their actual unmapped URL, not the QR slug', () => {
  const defs = [{ slug: 'siri', en: true }];
  const pages = [
    { pagePath: '/siri/', html: '<img src="/assets/img/qr-siri-ja.svg">' },
    { pagePath: '/en/siri/', html: '<img src="/assets/img/qr-siri-en.svg">' },
  ];
  const targets = buildTargets(pages, { cpps: [{ ...row, match: ['^/siri/'] }] }, defs);
  assert.equal(targets[0].ppid, ppid);
  assert.equal(targets[1].ppid, null);
  assert.match(targets[1].url, /\/us\/app\/id6758438948\?pt=128498560&ct=siri-en__qr&mt=8$/);
});

test('bilingual content may keep both storefronts on the same approved route', () => {
  const targets = buildTargets([{ pagePath: '/obsidian/', html: html + '<img src="/assets/img/qr-obsidian-en.svg">' }], map,
    [{ slug: 'obsidian', en: true }]);
  assert.deepEqual(targets.map((t) => t.ppid), [ppid, ppid]);
  assert.match(targets[1].url, /\/us\/app\//);
});

test('disabled or pending CPPs stay on the default page', () => {
  assert.equal(cppForQr('/obsidian/', { cpps: [{ ...row, asc_visible: false }] }), null);
  assert.equal(cppForQr('/obsidian/', { cpps: [{ ...row, ppid: null }] }), null);
  assert.equal(cppForQr('/download/', map), null);
});

test('legacy AI-tags campaign labels survive adding the missing provider token', () => {
  const url = new URL(storeUrl('ai-tags', 'jp', 'qr', null, 'ai-tags-qr-ja'));
  assert.equal(url.searchParams.get('ct'), 'ai-tags-qr-ja');
  assert.equal(url.searchParams.get('pt'), '128498560');
  assert.equal(url.searchParams.get('ppid'), null);
});

test('missing visibility, unapproved state and malformed UUID cannot silently wire a QR', () => {
  for (const change of [{ asc_visible: undefined }, { asc_state: 'PREPARE_FOR_SUBMISSION' }, { ppid: 'bad-id' }]) {
    assert.throws(() => cppForQr('/obsidian/', { cpps: [{ ...row, ...change }] }), /requires/);
  }
});

test('a shared asset cannot mix a mapped and unmapped source page', () => {
  assert.throws(() => buildTargets([{ pagePath: '/obsidian/', html }, { pagePath: '/download/', html }], map, definitions), /conflicting/);
});

test('both orphaned definitions and unmanaged published QR images fail', () => {
  assert.throws(() => buildTargets([], map, definitions), /no referring/);
  assert.throws(() => buildTargets([{ pagePath: '/obsidian/', html: html + '<img src="/assets/img/qr-unmanaged-ja.svg">' }], map, definitions), /missing from generator/);
});

test('only actual local image references determine ownership', () => {
  const refs = qrReferences(`<!-- ${html} --><script>const sample = '${html}'</script>
    <img src='https://other.example/assets/img/qr-wrong.svg'>
    <img src='../assets/img/qr-right-ja.svg?v=2'>`, '/obsidian/');
  assert.deepEqual(refs, ['qr-right-ja.svg']);
});

test('an independent decoder distinguishes the old default destination from a CPP destination', async () => {
  const oldUrl = storeUrl('obsidian', 'jp');
  const newUrl = storeUrl('obsidian', 'jp', 'qr', ppid);
  for (const url of [oldUrl, newUrl]) {
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 264 });
    const { m, size } = matrixFromSvg(svg);
    const { data, w } = toRgba(m, size);
    assert.equal(jsQR(data, w, w)?.data, url);
  }
  assert.notEqual(oldUrl, newUrl);
});
