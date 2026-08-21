'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
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
  await new Promise((resolve) => server.close(resolve));
});

test('GET /api/v1 returns an index of endpoints', async () => {
  const res = await fetch(`${baseUrl}/api/v1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.endpoints);
  assert.ok(body.endpoints.institutions);
});

test('GET /healthz returns ok', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/v1/stats returns totals for all three institution types', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total_institutions, body.by_type.university + body.by_type.polytechnic + body.by_type.college_of_education);
  assert.ok(body.by_type.university > 0);
  assert.ok(body.by_type.polytechnic > 0);
  assert.ok(body.by_type.college_of_education > 0);
});

test('GET /api/v1/types lists the three valid types', async () => {
  const res = await fetch(`${baseUrl}/api/v1/types`);
  const body = await res.json();
  assert.deepEqual(body.types, ['university', 'polytechnic', 'college_of_education']);
});

test('GET /api/v1/institutions supports pagination', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions?limit=5&page=2`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.results.length, 5);
  assert.equal(body.page, 2);
  assert.equal(body.limit, 5);
});

test('GET /api/v1/institutions filters by type', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions?type=university&limit=100`);
  const body = await res.json();
  assert.ok(body.results.every((r) => r.type === 'university'));
});

test('GET /api/v1/institutions filters by category', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions?category=Federal&limit=100`);
  const body = await res.json();
  assert.ok(body.results.every((r) => r.category === 'Federal'));
});

test('GET /api/v1/institutions filters by state substring', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions?state=Lagos&limit=100`);
  const body = await res.json();
  assert.ok(body.results.length > 0);
  assert.ok(body.results.every((r) => r.state && r.state.includes('Lagos')));
});

test('GET /api/v1/institutions rejects an invalid type', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions?type=nonsense`);
  assert.equal(res.status, 400);
});

test('GET /api/v1/institutions/:slug returns a single institution with schools', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions/ahmadu-bello-university-zaria`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.name, 'Ahmadu Bello University, Zaria');
  assert.ok(Array.isArray(body.schools));
  assert.ok(body.schools.length > 0);
});

test('GET /api/v1/institutions/:slug 404s for an unknown slug', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions/does-not-exist-anywhere`);
  assert.equal(res.status, 404);
});

test('GET /api/v1/institutions/:slug/schools returns the schools list', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions/ahmadu-bello-university-zaria/schools`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.schools.some((s) => s.name === 'Faculty of Engineering'));
});

test('GET /api/v1/schools requires a q param', async () => {
  const res = await fetch(`${baseUrl}/api/v1/schools`);
  assert.equal(res.status, 400);
});

test('GET /api/v1/schools searches across institutions', async () => {
  const res = await fetch(`${baseUrl}/api/v1/schools?q=Engineering&limit=5`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0);
  assert.ok(body.results.every((r) => r.school_name.toLowerCase().includes('engineering')));
});

test('GET /api/v1/states lists states with counts', async () => {
  const res = await fetch(`${baseUrl}/api/v1/states`);
  const body = await res.json();
  assert.ok(body.states.length > 0);
  assert.ok(body.states[0].count > 0);
});

test('unknown route returns 404 JSON', async () => {
  const res = await fetch(`${baseUrl}/nope`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'Not found');
});
