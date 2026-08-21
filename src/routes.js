'use strict';

const express = require('express');
const db = require('./db');
const { serializeInstitution } = require('./serialize');

const VALID_TYPES = ['university', 'polytechnic', 'college_of_education'];
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

function getSchoolsFor(institutionId) {
  return db
    .prepare('SELECT name, departments FROM schools WHERE institution_id = ? ORDER BY position')
    .all(institutionId);
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
      schools_search: '/api/v1/schools?q=',
    },
    docs: 'https://github.com/YOUR_GITHUB_USERNAME/nigeria-tertiary-institutions-api#readme',
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
  const withParsedSchools = db
    .prepare('SELECT COUNT(DISTINCT institution_id) c FROM schools')
    .get();

  res.json({
    total_institutions: totalRow.c,
    by_type: Object.fromEntries(byType.map((r) => [r.type, r.count])),
    by_category: Object.fromEntries(byCategory.map((r) => [r.category, r.count])),
    by_type_and_category: byTypeCategory,
    total_parsed_schools_faculties: schoolsTotal.c,
    institutions_with_parsed_structure: withParsedSchools.c,
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
  const schools = getSchoolsFor(row.id);
  res.json(serializeInstitution(row, { withSchools: true, schools }));
});

router.get('/institutions/:slug/schools', (req, res) => {
  const row = db.prepare('SELECT id, name, slug FROM institutions WHERE slug = ?').get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Institution not found' });
  const schools = getSchoolsFor(row.id);
  res.json({
    institution: { id: row.id, name: row.name, slug: row.slug },
    schools_parsed: schools.length > 0,
    schools: schools.map((s) => ({
      name: s.name,
      departments: JSON.parse(s.departments || '[]'),
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
      `SELECT s.name AS school_name, s.departments, i.id, i.type, i.name, i.slug, i.category, i.state
       FROM schools s
       JOIN institutions i ON i.id = s.institution_id
       WHERE s.name LIKE ?
       ORDER BY i.name COLLATE NOCASE
       LIMIT ? OFFSET ?`
    )
    .all(`%${q}%`, limit, offset);

  res.json({
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
    results: rows.map((r) => ({
      school_name: r.school_name,
      departments: JSON.parse(r.departments || '[]'),
      institution: { id: r.id, type: r.type, name: r.name, slug: r.slug, category: r.category, state: r.state },
    })),
  });
});

module.exports = router;
