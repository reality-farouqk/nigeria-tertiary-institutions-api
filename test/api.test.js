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

test('GET /api/v1/stats totals agree with the per-type breakdown', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`);
  assert.equal(res.status, 200);
  const body = await res.json();

  // Summed rather than named, so adding a type does not silently leave this
  // assertion checking a subset of the catalogue.
  const summed = Object.values(body.by_type).reduce((a, b) => a + b, 0);
  assert.equal(body.total_institutions, summed);

  for (const [type, count] of Object.entries(body.by_type)) {
    assert.ok(count > 0, `${type} has no institutions`);
  }
});

test('GET /api/v1/types lists every type present in the data', async () => {
  const res = await fetch(`${baseUrl}/api/v1/types`);
  const body = await res.json();
  assert.deepEqual(body.types, [
    'university',
    'polytechnic',
    'college_of_education',
    'college_of_health_science_and_technology',
  ]);

  // Every advertised type must actually be queryable, and every type in the
  // data must be advertised — a type added to one list and not the other is
  // the failure this catches.
  const stats = await (await fetch(`${baseUrl}/api/v1/stats`)).json();
  assert.deepEqual(Object.keys(stats.by_type).sort(), [...body.types].sort());
});

test('a college of health science and technology is served with its sourced structure', async () => {
  const slug = 'islamic-medical-foundation-college-of-health-science-and-technology';

  const res = await fetch(`${baseUrl}/api/v1/institutions/${slug}`);
  assert.equal(res.status, 200);
  const inst = await res.json();
  assert.equal(inst.type, 'college_of_health_science_and_technology');
  assert.equal(inst.category, 'Private');
  assert.equal(inst.state, 'Kaduna State');

  const schools = await (await fetch(`${baseUrl}/api/v1/institutions/${slug}/schools`)).json();
  assert.equal(schools.schools.length, 1);
  assert.equal(schools.schools[0].name, 'School of Health Technology');
  assert.deepEqual(
    schools.schools[0].departments.map((d) => d.name),
    [
      'Community Health Technology',
      'Environmental Health Technology',
      'Health Education and Promotion',
      'Health Information Management',
      'Medical Imaging Technology',
    ],
  );

  // The real regression risk for this row is the trailing provenance note, which
  // is long, comma-heavy and sits after the itemized list. Split on the wrong
  // separator it becomes extra "departments" — the exact failure the parser's
  // note filter exists for, and one a student would see as a programme to pick.
  // Five and only five, with nothing note-shaped among them.
  const names = schools.schools.flatMap((s) => s.departments.map((d) => d.name));
  assert.equal(names.length, 5);
  for (const name of names) {
    assert.ok(!/Musawa|Kaduna|nextschool|Wikidata|NUC|NBTE|NCCE|confirmed|\d{4}/i.test(name),
      `"${name}" looks like provenance text parsed as a department`);
  }

  const filtered = await (await fetch(
    `${baseUrl}/api/v1/institutions?type=college_of_health_science_and_technology`,
  )).json();
  assert.ok(filtered.results.some((i) => i.slug === slug));
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
  assert.ok(body.results.every((r) => r.name.toLowerCase().includes('engineering')));
});

test('GET /api/v1/institutions/:slug/departments lists departments with their school', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions/bayero-university-kano/departments`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0);
  const withDepts = body.departments.find((d) => d.school.name === 'College of Health Sciences');
  assert.ok(withDepts);
  assert.ok(withDepts.school.id);
});

test('GET /api/v1/departments requires nothing but supports q/type/category/state filters', async () => {
  const res = await fetch(`${baseUrl}/api/v1/departments?q=Computer&limit=5`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0);
  assert.ok(body.results.every((r) => r.name.toLowerCase().includes('computer')));
  assert.ok(body.results[0].institution.slug);
  assert.ok(body.results[0].school.name);
});

test('GET /api/v1/departments/:id returns a single department', async () => {
  const listRes = await fetch(`${baseUrl}/api/v1/departments?q=Computer&limit=1`);
  const listBody = await listRes.json();
  const id = listBody.results[0].id;

  const res = await fetch(`${baseUrl}/api/v1/departments/${id}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, id);
  assert.ok(body.school.name);
  assert.ok(body.institution.slug);
});

test('GET /api/v1/departments/:id 404s for an unknown id', async () => {
  const res = await fetch(`${baseUrl}/api/v1/departments/999999999`);
  assert.equal(res.status, 404);
});

test('GET /api/v1/schools/:id returns a single school with its departments', async () => {
  const listRes = await fetch(`${baseUrl}/api/v1/schools?q=Engineering&limit=1`);
  const listBody = await listRes.json();
  const id = listBody.results[0].id;

  const res = await fetch(`${baseUrl}/api/v1/schools/${id}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, id);
  assert.ok(Array.isArray(body.departments));
  assert.ok(body.institution.slug);
});

test('GET /api/v1/stats reports course-of-study coverage', async () => {
  const res = await fetch(`${baseUrl}/api/v1/stats`);
  const body = await res.json();
  assert.ok(body.total_courses > 0);
  assert.ok(body.course_data_coverage.institutions_with_course_data > 0);
  assert.ok(body.course_data_coverage.by_qualification.ND > 0);
  assert.ok(body.course_data_coverage.by_qualification.HND > 0);
  assert.ok(body.course_data_coverage.by_qualification.NCE > 0);
  assert.ok(body.course_data_coverage.by_source.inferred > 0);
});

test('institution detail flags departments with course-of-study data', async () => {
  const res = await fetch(`${baseUrl}/api/v1/institutions/bayero-university-kano`);
  const body = await res.json();
  const departments = body.schools.flatMap((s) => s.departments);
  assert.ok(departments.length > 0);
  assert.ok(departments.every((d) => d.courses_available === true));
});

test('GET /api/v1/departments/:id/courses returns qualification-tagged course-of-study rows', async () => {
  const deptRes = await fetch(`${baseUrl}/api/v1/institutions/bayero-university-kano/departments`);
  const deptBody = await deptRes.json();
  const target = deptBody.departments[0];
  assert.ok(target);

  const res = await fetch(`${baseUrl}/api/v1/departments/${target.id}/courses`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.courses_available, true);
  assert.ok(body.courses.length > 0);
  assert.ok(body.courses[0].title);
  assert.ok(body.courses[0].qualification);
  assert.equal(body.courses[0].source, 'inferred');
});

test('GET /api/v1/departments/:id/courses 404s for an unknown department', async () => {
  const res = await fetch(`${baseUrl}/api/v1/departments/999999999/courses`);
  assert.equal(res.status, 404);
});

test('polytechnic departments generate both ND and HND course-of-study rows', async () => {
  const deptRes = await fetch(`${baseUrl}/api/v1/departments?type=polytechnic&limit=1`);
  const deptBody = await deptRes.json();
  assert.ok(deptBody.results.length > 0, 'expected at least one polytechnic department');
  const id = deptBody.results[0].id;

  const res = await fetch(`${baseUrl}/api/v1/departments/${id}/courses`);
  const body = await res.json();
  const quals = body.courses.map((c) => c.qualification).sort();
  assert.deepEqual(quals, ['HND', 'ND']);
});

test('college of education departments generate a single NCE course-of-study row', async () => {
  const deptRes = await fetch(`${baseUrl}/api/v1/departments?type=college_of_education&limit=1`);
  const deptBody = await deptRes.json();
  assert.ok(deptBody.results.length > 0, 'expected at least one college of education department');
  const id = deptBody.results[0].id;

  const res = await fetch(`${baseUrl}/api/v1/departments/${id}/courses`);
  const body = await res.json();
  assert.equal(body.courses.length, 1);
  assert.equal(body.courses[0].qualification, 'NCE');
});

test('GET /api/v1/courses searches by title across institutions', async () => {
  const res = await fetch(`${baseUrl}/api/v1/courses?q=Science&limit=5`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0);
  assert.ok(body.results[0].qualification);
  assert.ok(body.results[0].department.name);
  assert.ok(body.results[0].institution.slug);
});

test('GET /api/v1/courses filters by qualification', async () => {
  const res = await fetch(`${baseUrl}/api/v1/courses?qualification=HND&limit=25`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0);
  assert.ok(body.results.every((r) => r.qualification === 'HND'));
});

test('GET /api/v1/courses filters by institution_slug', async () => {
  const res = await fetch(`${baseUrl}/api/v1/courses?institution_slug=bayero-university-kano&limit=100`);
  const body = await res.json();
  assert.ok(body.total > 0);
  assert.ok(body.results.every((r) => r.institution.slug === 'bayero-university-kano'));
});

test('GET /api/v1/courses/:id returns a single course of study with full context', async () => {
  const listRes = await fetch(`${baseUrl}/api/v1/courses?limit=1`);
  const listBody = await listRes.json();
  const id = listBody.results[0].id;

  const res = await fetch(`${baseUrl}/api/v1/courses/${id}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.id, id);
  assert.ok(body.title);
  assert.ok(body.qualification);
  assert.equal(body.source, 'inferred');
  assert.equal(body.section, null);
  assert.ok(body.department.name);
  assert.ok(body.institution.slug);
});

test('GET /api/v1/courses/:id 404s for an unknown id', async () => {
  const res = await fetch(`${baseUrl}/api/v1/courses/999999999`);
  assert.equal(res.status, 404);
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
