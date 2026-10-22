// Native-library and HTTP compatibility checks. Only loopback HTTP is used;
// there are no model calls, SNS handlers, or real posts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { composeSlide } from '../tools/compose-slides.js';
const sharp = createRequire(new URL('../tools/package.json', import.meta.url))('sharp');
const root = fileURLToPath(new URL('../tools/', import.meta.url));

function request(urlPath, { host = 'localhost:3456', origin, body, family = 4 } = {}) {
  return new Promise((resolve, reject) => {
    const headers = { Host: host };
    if (origin) headers.Origin = origin;
    if (body) headers['Content-Type'] = 'application/json';
    const req = http.request({ hostname: family === 6 ? '::1' : '127.0.0.1', port: 3456, path: urlPath, method: body ? 'POST' : 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Loopback timeout')));
    req.on('error', reject); if (body) req.write(JSON.stringify(body)); req.end();
  });
}

test('patched sharp renders SVG text into a real slide PNG', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-compat-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const background = path.join(dir, 'background.png');
  await sharp({ create: { width: 1200, height: 2000, channels: 3, background: '#365579' } }).png().toFile(background);
  const slide = await composeSlide(background, ['Security check', 'Safe local render'], 'poster_dark', 'center', 'wide', true, 0);
  const metadata = await sharp(slide).metadata();
  assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1920);
  assert.equal(sharp.versions.sharp, '0.35.5');
  assert.ok(sharp.versions.rsvg);
});

test('real server binds loopback, blocks origin/traversal/symlinks, and serves valid ZIP/static files', { timeout: 15000 }, async (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-private-'));
  fs.writeFileSync(path.join(outside, 'private.txt'), 'must not escape');
  const outRoot = path.join(root, 'out'); const createdRoot = !fs.existsSync(outRoot);
  fs.mkdirSync(outRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(outRoot, 'security_test_'));
  const name = path.basename(dir);
  fs.writeFileSync(path.join(dir, 'slide_1.png'), 'PNG fixture');
  fs.writeFileSync(path.join(dir, 'slide_plan.json'), '{"slides":[]}');
  const link = path.join(outRoot, name + '_link'); fs.symlinkSync(outside, link);
  t.after(() => {
    fs.rmSync(link, { force: true }); fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    if (createdRoot) fs.rmdirSync(outRoot);
  });
  const server = spawn(process.execPath, [path.join(root, 'server.js')], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (server.exitCode === null) { server.kill(); await once(server, 'exit'); } });
  await new Promise((resolve, reject) => {
    let output = '';
    server.on('error', reject); server.on('exit', (code) => reject(new Error('Server exited: ' + code + ' ' + output)));
    server.stderr.on('data', (b) => { output += b; });
    server.stdout.on('data', (b) => { output += b; if (output.includes('http://localhost:3456')) resolve(); });
  });
  assert.equal((await request('/slides/' + name + '/slide_1.png')).status, 200);
  assert.equal((await request('/slides/' + name + '/slide_1.png', { family: 6, host: '[::1]:3456' })).status, 200);
  assert.equal((await request('/slides/' + name + '/slide_1.png', { host: 'attacker.example:3456' })).status, 403);
  assert.equal((await request('/api/generate', { origin: 'https://attacker.example', body: {} })).status, 403);
  assert.equal((await request('/api/regenerate', { body: { dir: '../private', index: 0 } })).status, 400);
  assert.equal((await request('/api/regenerate', { body: { dir: name, index: '0' } })).status, 400);
  assert.equal((await request('/api/zip/..%2f..')).status, 404);
  assert.equal((await request('/api/zip/' + path.basename(link))).status, 404);
  assert.equal((await request('/slides/' + path.basename(link) + '/private.txt')).status, 404);
  const image = await request('/slides/' + name + '/slide_1.png'); assert.equal(image.status, 200);
  assert.equal(image.body.toString(), 'PNG fixture');
  const zip = await request('/api/zip/' + name); assert.equal(zip.status, 200);
  assert.equal(zip.headers['content-type'], 'application/zip'); assert.equal(zip.body.subarray(0, 2).toString(), 'PK');
  fs.symlinkSync(path.join(outside, 'private.txt'), path.join(dir, 'slide_2.png'));
  assert.equal((await request('/api/zip/' + name)).status, 404);
  // Bound sockets must never expose 0.0.0.0 or the host's non-loopback address.
  const lan = Object.values(os.networkInterfaces()).flat().find((x) => !x.internal && x.family === 'IPv4');
  if (lan) await assert.rejects(new Promise((resolve, reject) => {
    const req = http.get({ hostname: lan.address, port: 3456, path: '/slides/' + name + '/slide_1.png', timeout: 1000 }, resolve);
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('connection timeout')));
  }));
});
