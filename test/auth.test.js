'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.API_KEY = 'test-key-1,test-key-2';
// eslint-disable-next-line global-require
const app = require('../src/app');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  delete process.env.API_KEY;
  await new Promise((resolve) => server.close(resolve));
});

test('GET /healthz stays open even when API_KEY is set', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
});

test('GET /api/v1/stats rejects a request with no key', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.ok(body.error);
});

test('GET /api/v1/stats rejects a request with a wrong key', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`, {
    headers: { 'X-API-Key': 'not-a-real-key' },
  });
  assert.equal(res.status, 401);
});

test('GET /api/v1/stats accepts a valid key via X-API-Key', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`, {
    headers: { 'X-API-Key': 'test-key-1' },
  });
  assert.equal(res.status, 200);
});

test('GET /api/v1/stats accepts a valid key via Authorization: Bearer', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`, {
    headers: { Authorization: 'Bearer test-key-2' },
  });
  assert.equal(res.status, 200);
});

test('a second configured key can be used independently (per-consumer revocation)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions?limit=1`, {
    headers: { 'X-API-Key': 'test-key-2' },
  });
  assert.equal(res.status, 200);
});
