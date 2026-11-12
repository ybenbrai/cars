import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../server.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let server;
let port;

before(async () => {
  server = createStaticServer({ root: projectRoot });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((resolveClose) => server.close(resolveClose));
});

function request(path, method = 'GET') {
  return new Promise((resolveRequest, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolveRequest({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the game shell', async () => {
  const res = await request('/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^text\/html/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(res.body, /Sunset Drift/);
  assert.match(res.body, /js\/main\.js/);
});

test('serves JavaScript with the correct MIME type', async () => {
  const res = await request('/js/main.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^text\/javascript/);
  assert.match(res.body, /createTrack/);
});

test('serves the web app manifest', async () => {
  const res = await request('/manifest.webmanifest');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^application\/manifest\+json/);
  assert.equal(JSON.parse(res.body).name, 'Sunset Drift');
});

test('serves the social preview image', async () => {
  const res = await request('/assets/og-image.jpg');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /^image\/jpeg/);
  assert.ok(Number(res.headers['content-length']) > 10_000);
});

test('supports HEAD requests without a body', async () => {
  const res = await request('/', 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(res.body, '');
});

test('rejects unsupported methods', async () => {
  const res = await request('/', 'POST');
  assert.equal(res.status, 405);
  assert.equal(res.headers.allow, 'GET, HEAD');
});

test('returns 404 for unknown files', async () => {
  const res = await request('/does-not-exist');
  assert.equal(res.status, 404);
});

test('blocks path traversal attempts', async () => {
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/js/../../package.json']) {
    const res = await request(path);
    assert.equal(res.status, 403, path);
  }
});

test('rejects malformed percent-encoding', async () => {
  const res = await request('/%E0%A4%A');
  assert.equal(res.status, 400);
});

test('players can delete their own account with their password', async () => {
  const { createStaticServer } = await import('../server.mjs');
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dataDir = await mkdtemp(join(tmpdir(), 'sd-del-'));
  const server = createStaticServer({ dataDir });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  const reg = await post('/api/auth/register', { username: 'deleteme', email: 'd@example.com', password: 'longpassword1' });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/auth/delete', { password: 'wrong-password' }, cookie)).status, 401);
  assert.equal((await post('/api/auth/delete', { password: 'longpassword1' }, cookie)).status, 200);
  assert.equal((await post('/api/auth/login', { email: 'd@example.com', password: 'longpassword1' })).status, 401);
  const again = await post('/api/auth/register', { username: 'deleteme', email: 'd@example.com', password: 'longpassword1' });
  assert.equal(again.status, 201, 'name and email are free again');
  await new Promise((r) => server.close(r));
});
