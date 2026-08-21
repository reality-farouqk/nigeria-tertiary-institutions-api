'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { parseCsv } = require('./csv');
const { parseStructure } = require('../src/parse');
const { generateCoursesOfStudy } = require('./generate-courses-of-study');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_DIR = path.join(ROOT, 'db');
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'institutions.sqlite');

const SOURCES = [
  {
    type: 'university',
    file: 'nigerian_universities_faculties.csv',
    nameField: 'University Name',
    stateField: 'Location',
    structureField: 'Faculties',
    hasWebsite: true,
  },
  {
    type: 'polytechnic',
    file: 'nigerian_polytechnics_schools.csv',
    nameField: 'Institution Name',
    stateField: 'State',
    structureField: 'Schools/Departments',
    hasWebsite: false,
  },
  {
    type: 'college_of_education',
    file: 'nigerian_colleges_of_education_schools.csv',
    nameField: 'Institution Name',
    stateField: 'State',
    structureField: 'Schools/Departments',
    hasWebsite: false,
  },
];

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseYear(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? parseInt(m[0], 10) : null;
}

function main() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('university','polytechnic','college_of_education')),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category TEXT,
      state TEXT,
      year_established INTEGER,
      website TEXT,
      structure_raw TEXT,
      source_serial INTEGER
    );

    CREATE TABLE schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER
    );

    CREATE TABLE departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER
    );

    CREATE INDEX idx_institutions_type ON institutions(type);
    CREATE INDEX idx_institutions_state ON institutions(state);
    CREATE INDEX idx_institutions_category ON institutions(category);
    CREATE INDEX idx_institutions_name ON institutions(name COLLATE NOCASE);
    CREATE INDEX idx_schools_institution ON schools(institution_id);
    CREATE INDEX idx_schools_name ON schools(name COLLATE NOCASE);
    CREATE INDEX idx_departments_school ON departments(school_id);
    CREATE INDEX idx_departments_institution ON departments(institution_id);
    CREATE INDEX idx_departments_name ON departments(name COLLATE NOCASE);

    CREATE TABLE sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER
    );

    CREATE TABLE courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
      qualification TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'inferred',
      position INTEGER
    );

    CREATE INDEX idx_sections_department ON sections(department_id);
    CREATE INDEX idx_courses_department ON courses(department_id);
    CREATE INDEX idx_courses_section ON courses(section_id);
    CREATE INDEX idx_courses_title ON courses(title COLLATE NOCASE);
    CREATE INDEX idx_courses_qualification ON courses(qualification COLLATE NOCASE);
  `);

  const insertInstitution = db.prepare(`
    INSERT INTO institutions (type, name, slug, category, state, year_established, website, structure_raw, source_serial)
    VALUES (@type, @name, @slug, @category, @state, @year_established, @website, @structure_raw, @source_serial)
  `);
  const insertSchool = db.prepare(`
    INSERT INTO schools (institution_id, name, position)
    VALUES (@institution_id, @name, @position)
  `);
  const insertDepartment = db.prepare(`
    INSERT INTO departments (school_id, institution_id, name, position)
    VALUES (@school_id, @institution_id, @name, @position)
  `);

  const usedSlugs = new Set();
  const counts = {};
  let schoolRowCount = 0;
  let departmentRowCount = 0;
  let parsedInstitutionsWithSchools = 0;

  const insertAll = db.transaction(() => {
    for (const src of SOURCES) {
      const csvPath = path.join(DATA_DIR, src.file);
      const text = fs.readFileSync(csvPath, 'utf8');
      const rows = parseCsv(text);
      counts[src.type] = rows.length;

      for (const row of rows) {
        const name = (row[src.nameField] || '').trim();
        if (!name) continue;

        let slug = slugify(name);
        if (usedSlugs.has(slug)) {
          let n = 2;
          while (usedSlugs.has(`${slug}-${n}`)) n++;
          slug = `${slug}-${n}`;
        }
        usedSlugs.add(slug);

        const structureRaw = (row[src.structureField] || '').trim();
        const yearRaw = (row['Year Established'] || '').trim();

        const info = insertInstitution.run({
          type: src.type,
          name,
          slug,
          category: (row['Category'] || '').trim() || null,
          state: (row[src.stateField] || '').trim() || null,
          year_established: parseYear(yearRaw),
          website: src.hasWebsite ? (row['Website'] || '').trim() || null : null,
          structure_raw: structureRaw || null,
          source_serial: row['S/N'] ? parseInt(row['S/N'], 10) : null,
        });

        const schools = parseStructure(structureRaw);
        if (schools.length) parsedInstitutionsWithSchools++;
        schools.forEach((school, idx) => {
          const schoolInfo = insertSchool.run({
            institution_id: info.lastInsertRowid,
            name: school.name,
            position: idx,
          });
          schoolRowCount++;

          (school.departments || []).forEach((deptName, dIdx) => {
            insertDepartment.run({
              school_id: schoolInfo.lastInsertRowid,
              institution_id: info.lastInsertRowid,
              name: deptName,
              position: dIdx,
            });
            departmentRowCount++;
          });
        });
      }
    }
  });

  insertAll();

  const courseStats = generateCoursesOfStudy(db);

  db.close();

  console.log('Database built:', DB_PATH);
  console.log('Institutions per source:', counts);
  console.log('Institutions with at least one parsed school/faculty entry:', parsedInstitutionsWithSchools);
  console.log('Total parsed school/faculty rows:', schoolRowCount);
  console.log('Total parsed department rows:', departmentRowCount);
  console.log('Departments processed for course-of-study generation:', courseStats.departmentsProcessed);
  console.log('Course-of-study rows generated (source=inferred):', courseStats.courseCount);
}

main();
