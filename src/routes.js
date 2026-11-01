'use strict';

const express = require('express');
const db = require('./db');
const { serializeInstitution } = require('./serialize');

const VALID_TYPES = [
  'university',
  'polytechnic',
  'college_of_education',
  'college_of_health_science_and_technology',
];
const VALID_CATEGORIES = ['Federal', 'State', 'Private'];
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

const router = express.Router();

function clampInt(value, fallback, { min, max } = {}) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  let out = n;
  if (min !== undefined) out = Math.max(min, out);
  if (max !== undefined) out = Math.min(max, out);
  return out;
}

const courseCountStmt = db.prepare('SELECT COUNT(*) c FROM courses WHERE department_id = ?');

function withCourseCount(dept) {
  return { ...dept, courses_available: courseCountStmt.get(dept.id).c > 0 };
}

function getSchoolsWithDepartmentsFor(institutionId) {
  const schools = db
    .prepare('SELECT id, name FROM schools WHERE institution_id = ? ORDER BY position')
    .all(institutionId);
  const deptStmt = db.prepare('SELECT id, name FROM departments WHERE school_id = ? ORDER BY position');
  return schools.map((s) => ({ ...s, departments: deptStmt.all(s.id).map(withCourseCount) }));
}

router.get('/', (req, res) => {
  res.json({
    name: 'Nigeria Tertiary Institutions API',
    version: 'v1',
    description:
      'Every Nigerian university, polytechnic, and college of education, with faculties/schools/departments where published.',
    endpoints: {
      stats: '/api/v1/stats',
      types: '/api/v1/types',
      states: '/api/v1/states',
      institutions: '/api/v1/institutions?type=&category=&state=&q=&page=&limit=',
      institution_detail: '/api/v1/institutions/:slug',
      institution_schools: '/api/v1/institutions/:slug/schools',
      institution_departments: '/api/v1/institutions/:slug/departments',
      schools_search: '/api/v1/schools?q=',
      school_detail: '/api/v1/schools/:id',
      departments_search: '/api/v1/departments?q=&type=&category=&state=&page=&limit=',
      department_detail: '/api/v1/departments/:id',
      department_courses: '/api/v1/departments/:id/courses',
      courses_search: '/api/v1/courses?q=&qualification=&department_id=&institution_slug=&page=&limit=',
      course_detail: '/api/v1/courses/:id',
    },
    docs: 'https://github.com/reality-farouqk/nigeria-tertiary-institutions-api#readme',
  });
});

router.get('/stats', (req, res) => {
  const totalRow = db.prepare('SELECT COUNT(*) c FROM institutions').get();
  const byType = db
    .prepare('SELECT type, COUNT(*) count FROM institutions GROUP BY type')
    .all();
  const byCategory = db
    .prepare('SELECT category, COUNT(*) count FROM institutions GROUP BY category')
    .all();
  const byTypeCategory = db
    .prepare(
      'SELECT type, category, COUNT(*) count FROM institutions GROUP BY type, category ORDER BY type, category'
    )
    .all();
  const schoolsTotal = db.prepare('SELECT COUNT(*) c FROM schools').get();
  const departmentsTotal = db.prepare('SELECT COUNT(*) c FROM departments').get();
  const withParsedSchools = db
    .prepare('SELECT COUNT(DISTINCT institution_id) c FROM schools')
    .get();
  const sectionsTotal = db.prepare('SELECT COUNT(*) c FROM sections').get();
  const coursesTotal = db.prepare('SELECT COUNT(*) c FROM courses').get();
  const institutionsWithCourses = db
    .prepare(
      `SELECT COUNT(DISTINCT i.id) c
       FROM courses c
       JOIN departments d ON d.id = c.department_id
       JOIN institutions i ON i.id = d.institution_id`
    )
    .get();
  const byQualification = db
    .prepare('SELECT qualification, COUNT(*) count FROM courses GROUP BY qualification ORDER BY count DESC')
    .all();
  const bySource = db
    .prepare('SELECT source, COUNT(*) count FROM courses GROUP BY source')
    .all();

  res.json({
    total_institutions: totalRow.c,
    by_type: Object.fromEntries(byType.map((r) => [r.type, r.count])),
    by_category: Object.fromEntries(byCategory.map((r) => [r.category, r.count])),
    by_type_and_category: byTypeCategory,
    total_parsed_schools_faculties: schoolsTotal.c,
    total_parsed_departments: departmentsTotal.c,
    institutions_with_parsed_structure: withParsedSchools.c,
    total_sections: sectionsTotal.c,
    total_courses: coursesTotal.c,
    course_data_coverage: {
      note:
        "Course-of-study (programme) rows are generated for every parsed department from a disclosed naming convention (e.g. university department 'Computer Science' -> 'B.Sc. Computer Science'), not individually verified per institution. Every row is tagged source: 'inferred' -- see data/DATA_NOTES.md for the full rule set and known limitations.",
      institutions_with_course_data: institutionsWithCourses.c,
      by_qualification: Object.fromEntries(byQualification.map((r) => [r.qualification, r.count])),
      by_source: Object.fromEntries(bySource.map((r) => [r.source, r.count])),
    },
  });
});

router.get('/types', (req, res) => {
  res.json({ types: VALID_TYPES, categories: VALID_CATEGORIES });
});

router.get('/states', (req, res) => {
  const rows = db
    .prepare(
      'SELECT state, COUNT(*) count FROM institutions WHERE state IS NOT NULL GROUP BY state ORDER BY state'
    )
    .all();
  res.json({ states: rows });
});

router.get('/institutions', (req, res) => {
  const { type, category, state, q } = req.query;

  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Invalid type '${type}'. Must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `Invalid category '${category}'. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
  }

  const page = clampInt(req.query.page, 1, { min: 1 });
  const limit = clampInt(req.query.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
  const offset = (page - 1) * limit;

  const where = [];
  const params = {};
  if (type) {
    where.push('type = @type');
    params.type = type;
  }
  if (category) {
    where.push('category = @category');
    params.category = category;
  }
  if (state) {
    where.push('state LIKE @state');
    params.state = `%${state}%`;
  }
  if (q) {
    where.push('name LIKE @q');
    params.q = `%${q}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) c FROM institutions ${whereSql}`)
    .get(params).c;

  const rows = db
    .prepare(
      `SELECT * FROM institutions ${whereSql} ORDER BY name COLLATE NOCASE LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  res.json({
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    results: rows.map((r) => serializeInstitution(r)),
  });
});

router.get('/institutions/:slug', (req, res) => {
  const row = db.prepare('SELECT * FROM institutions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Institution not found' });
  const schools = getSchoolsWithDepartmentsFor(row.id);
  res.json(serializeInstitution(row, { withSchools: true, schools }));
});

router.get('/institutions/:slug/schools', (req, res) => {
  const row = db.prepare('SELECT id, name, slug FROM institutions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Institution not found' });
  const schools = getSchoolsWithDepartmentsFor(row.id);
  res.json({
    institution: { id: row.id, name: row.name, slug: row.slug },
    schools_parsed: schools.length > 0,
    schools: schools.map((s) => ({
      id: s.id,
      name: s.name,
      departments: s.departments,
    })),
  });
});

router.get('/institutions/:slug/departments', (req, res) => {
  const row = db.prepare('SELECT id, name, slug FROM institutions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Institution not found' });

  const departments = db
    .prepare(
      `SELECT d.id, d.name, s.id AS school_id, s.name AS school_name
       FROM departments d
       JOIN schools s ON s.id = d.school_id
       WHERE d.institution_id = ?
       ORDER BY s.position, d.position`
    )
    .all(row.id);

  res.json({
    institution: { id: row.id, name: row.name, slug: row.slug },
    total: departments.length,
    departments: departments.map((d) => ({
      id: d.id,
      name: d.name,
      courses_available: courseCountStmt.get(d.id).c > 0,
      school: { id: d.school_id, name: d.school_name },
    })),
  });
});

router.get('/schools', (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ error: "Query param 'q' is required, e.g. /api/v1/schools?q=Engineering" });
  }
  const limit = clampInt(req.query.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
  const page = clampInt(req.query.page, 1, { min: 1 });
  const offset = (page - 1) * limit;

  const total = db
    .prepare('SELECT COUNT(*) c FROM schools WHERE name LIKE ?')
    .get(`%${q}%`).c;

  const rows = db
    .prepare(
      `SELECT s.id AS school_id, s.name AS school_name, i.id, i.type, i.name, i.slug, i.category, i.state
       FROM schools s
       JOIN institutions i ON i.id = s.institution_id
       WHERE s.name LIKE ?
       ORDER BY i.name COLLATE NOCASE
       LIMIT ? OFFSET ?`
    )
    .all(`%${q}%`, limit, offset);

  const deptStmt = db.prepare('SELECT id, name FROM departments WHERE school_id = ? ORDER BY position');

  res.json({
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    results: rows.map((r) => ({
      id: r.school_id,
      name: r.school_name,
      departments: deptStmt.all(r.school_id).map(withCourseCount),
      institution: { id: r.id, type: r.type, name: r.name, slug: r.slug, category: r.category, state: r.state },
    })),
  });
});

router.get('/schools/:id', (req, res) => {
  const id = clampInt(req.params.id, null, {});
  if (!id) return res.status(400).json({ error: 'Invalid school id' });

  const row = db
    .prepare(
      `SELECT s.id, s.name, i.id AS institution_id, i.type, i.name AS institution_name, i.slug, i.category, i.state
       FROM schools s
       JOIN institutions i ON i.id = s.institution_id
       WHERE s.id = ?`
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'School not found' });

  const departments = db
    .prepare('SELECT id, name FROM departments WHERE school_id = ? ORDER BY position')
    .all(id)
    .map(withCourseCount);

  res.json({
    id: row.id,
    name: row.name,
    departments,
    institution: {
      id: row.institution_id,
      type: row.type,
      name: row.institution_name,
      slug: row.slug,
      category: row.category,
      state: row.state,
    },
  });
});

router.get('/departments', (req, res) => {
  const { q, type, category, state } = req.query;

  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Invalid type '${type}'. Must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }
  if (category && !VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `Invalid category '${category}'. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
    });
  }

  const limit = clampInt(req.query.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
  const page = clampInt(req.query.page, 1, { min: 1 });
  const offset = (page - 1) * limit;

  const where = [];
  const params = {};
  if (q) {
    where.push('d.name LIKE @q');
    params.q = `%${q}%`;
  }
  if (type) {
    where.push('i.type = @type');
    params.type = type;
  }
  if (category) {
    where.push('i.category = @category');
    params.category = category;
  }
  if (state) {
    where.push('i.state LIKE @state');
    params.state = `%${state}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db
    .prepare(
      `SELECT COUNT(*) c FROM departments d JOIN schools s ON s.id = d.school_id JOIN institutions i ON i.id = d.institution_id ${whereSql}`
    )
    .get(params).c;

  const rows = db
    .prepare(
      `SELECT d.id, d.name AS department_name, s.id AS school_id, s.name AS school_name,
              i.id AS institution_id, i.type, i.name AS institution_name, i.slug, i.category, i.state
       FROM departments d
       JOIN schools s ON s.id = d.school_id
       JOIN institutions i ON i.id = d.institution_id
       ${whereSql}
       ORDER BY i.name COLLATE NOCASE, s.position, d.position
       LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset });

  res.json({
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    results: rows.map((r) => ({
      id: r.id,
      name: r.department_name,
      courses_available: courseCountStmt.get(r.id).c > 0,
      school: { id: r.school_id, name: r.school_name },
      institution: {
        id: r.institution_id,
        type: r.type,
        name: r.institution_name,
        slug: r.slug,
        category: r.category,
        state: r.state,
      },
    })),
  });
});

router.get('/departments/:id', (req, res) => {
  const id = clampInt(req.params.id, null, {});
  if (!id) return res.status(400).json({ error: 'Invalid department id' });

  const row = db
    .prepare(
      `SELECT d.id, d.name AS department_name, s.id AS school_id, s.name AS school_name,
              i.id AS institution_id, i.type, i.name AS institution_name, i.slug, i.category, i.state
       FROM departments d
       JOIN schools s ON s.id = d.school_id
       JOIN institutions i ON i.id = d.institution_id
       WHERE d.id = ?`
    )
    .get(id);
  if (!row) return res.status(404).json({ error: 'Department not found' });

  res.json({
    id: row.id,
    name: row.department_name,
    courses_available: courseCountStmt.get(row.id).c > 0,
    school: { id: row.school_id, name: row.school_name },
    institution: {
      id: row.institution_id,
      type: row.type,
      name: row.institution_name,
      slug: row.slug,
      category: row.category,
      state: row.state,
    },
  });
});

// ---------------------------------------------------------------------------
// Courses of study (degree/programmes), and the specialization/option
// "sections" a course can sit under.
//
// GENERATED, NOT INDIVIDUALLY VERIFIED: every department gets its
// course-of-study row(s) generated from a disclosed naming convention (see
// scripts/generate-courses-of-study.js and data/DATA_NOTES.md), not
// per-institution web research. Every row is tagged `source: 'inferred'`.
// `courses_available` on a department will be true for virtually every
// parsed department as a result -- it mainly exists to flag the rare
// department with none (e.g. one added without a resolvable qualification).
// ---------------------------------------------------------------------------

function courseRowToJson(r) {
  return {
    id: r.id,
    qualification: r.qualification,
    title: r.title,
    source: r.source,
    section: r.section_id ? { id: r.section_id, name: r.section_name } : null,
    department: { id: r.department_id, name: r.department_name },
    institution: {
      id: r.institution_id,
      type: r.type,
      name: r.institution_name,
      slug: r.slug,
      category: r.category,
      state: r.state,
    },
  };
}

const COURSE_JOIN = `
  FROM courses c
  JOIN departments d ON d.id = c.department_id
  LEFT JOIN sections sec ON sec.id = c.section_id
  JOIN institutions i ON i.id = d.institution_id
`;
const COURSE_SELECT = `
  SELECT c.id, c.qualification, c.title, c.source, c.section_id, sec.name AS section_name,
         d.id AS department_id, d.name AS department_name,
         i.id AS institution_id, i.type, i.name AS institution_name, i.slug, i.category, i.state
  ${COURSE_JOIN}
`;

router.get('/departments/:id/courses', (req, res) => {
  const id = clampInt(req.params.id, null, {});
  if (!id) return res.status(400).json({ error: 'Invalid department id' });

  const dept = db
    .prepare(
      `SELECT d.id, d.name, i.id AS institution_id, i.name AS institution_name, i.slug
       FROM departments d JOIN institutions i ON i.id = d.institution_id
       WHERE d.id = ?`
    )
    .get(id);
  if (!dept) return res.status(404).json({ error: 'Department not found' });

  const sections = db
    .prepare('SELECT id, name FROM sections WHERE department_id = ? ORDER BY position')
    .all(id);
  const courseStmt = db.prepare(
    'SELECT id, qualification, title, source FROM courses WHERE department_id = ? AND section_id IS ? ORDER BY position'
  );

  res.json({
    department: { id: dept.id, name: dept.name },
    institution: { id: dept.institution_id, name: dept.institution_name, slug: dept.slug },
    courses_available: sections.length > 0 || courseStmt.all(id, null).length > 0,
    courses: courseStmt.all(id, null),
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      courses: db
        .prepare('SELECT id, qualification, title, source FROM courses WHERE section_id = ? ORDER BY position')
        .all(s.id),
    })),
  });
});

router.get('/courses', (req, res) => {
  const {
    q,
    qualification,
    department_id: departmentId,
    institution_slug: institutionSlug,
  } = req.query;

  const limit = clampInt(req.query.limit, DEFAULT_LIMIT, { min: 1, max: MAX_LIMIT });
  const page = clampInt(req.query.page, 1, { min: 1 });
  const offset = (page - 1) * limit;

  const where = [];
  const params = {};
  if (q) {
    where.push('c.title LIKE @q');
    params.q = `%${q}%`;
  }
  if (qualification) {
    where.push('c.qualification = @qualification');
    params.qualification = qualification;
  }
  if (departmentId) {
    const dId = clampInt(departmentId, null, {});
    if (!dId) return res.status(400).json({ error: 'Invalid department_id' });
    where.push('c.department_id = @departmentId');
    params.departmentId = dId;
  }
  if (institutionSlug) {
    where.push('i.slug = @institutionSlug');
    params.institutionSlug = institutionSlug;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c ${COURSE_JOIN} ${whereSql}`).get(params).c;
  const rows = db
    .prepare(`${COURSE_SELECT} ${whereSql} ORDER BY i.name COLLATE NOCASE, c.position LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });

  res.json({
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    results: rows.map(courseRowToJson),
  });
});

router.get('/courses/:id', (req, res) => {
  const id = clampInt(req.params.id, null, {});
  if (!id) return res.status(400).json({ error: 'Invalid course id' });

  const row = db.prepare(`${COURSE_SELECT} WHERE c.id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Course not found' });

  res.json(courseRowToJson(row));
});

module.exports = router;
