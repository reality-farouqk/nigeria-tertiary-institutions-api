'use strict';

/**
 * Structural checks on the source CSVs.
 *
 * These exist because of a failure mode that is completely silent: a structure
 * cell containing departments needs quoting, and if it is missing, the extra
 * commas split the row into additional columns. `build-db` then parses a
 * truncated cell, reports success, and the department count simply does not
 * move. Nothing errors, so the only way to notice is to be watching the number.
 *
 * A row that does not have exactly the expected column count is always a bug,
 * so it is cheap to assert and catches the whole class.
 *
 * Column count alone is not sufficient, though. A row was once mangled so that
 * the name split in two ("Bayero University / Kano") while the website and
 * structure cells merged into one — two errors that cancelled out to leave the
 * count at seven. The name still parsed, so nothing failed until an API test
 * asked for the institution by slug and got a 404. The per-column shape checks
 * below exist for that: a website cell must look like a URL, and a name must
 * not carry the stray quotes that quoting damage leaves behind.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('../scripts/csv');

const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES = [
  { file: 'nigerian_universities_faculties.csv', structureColumn: 'Faculties' },
  { file: 'nigerian_polytechnics_schools.csv', structureColumn: 'Schools/Departments' },
  { file: 'nigerian_colleges_of_education_schools.csv', structureColumn: 'Schools/Departments' },
  {
    file: 'nigerian_colleges_of_health_science_and_technology_schools.csv',
    structureColumn: 'Schools/Departments',
  },
];

for (const { file, structureColumn } of FILES) {
  const rows = parseCsv(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));

  test(`${file}: every row has the same columns as the header`, () => {
    assert.ok(rows.length > 0, 'file parsed to zero rows');

    const expected = Object.keys(rows[0]).length;
    const ragged = rows
      .map((row, i) => ({ row, line: i + 2, count: Object.keys(row).length }))
      .filter((r) => r.count !== expected);

    assert.deepEqual(
      ragged.map((r) => `line ${r.line}: ${r.count} columns (expected ${expected})`),
      [],
      'a row split into the wrong number of columns — usually an unquoted ' +
        'structure cell that had a comma added to it',
    );
  });

  test(`${file}: no structure cell was truncated mid-parenthesis`, () => {
    // "Faculty of Arts (Arabic" is what an unquoted cell looks like after the
    // CSV splits it: an opening bracket with no closing one.
    const broken = rows
      .map((row, i) => ({ value: row[structureColumn] || '', line: i + 2, name: Object.values(row)[1] }))
      .filter(({ value }) => {
        const opens = (value.match(/\(/g) || []).length;
        const closes = (value.match(/\)/g) || []).length;
        return opens !== closes;
      });

    assert.deepEqual(
      broken.map((b) => `line ${b.line} (${b.name}): unbalanced parentheses`),
      [],
      'unbalanced brackets in a structure cell — the row is probably split',
    );
  });

  test(`${file}: no cell shows quoting damage`, () => {
    // Only the name and website columns are checked. The structure column
    // carries research notes that legitimately quote phrases from sources
    // ("newly established", "Institute" rather than "School"), so a quote there
    // proves nothing. In a name or a URL it is always damage.
    const damaged = [];
    const nameColumn = Object.keys(rows[0])[1];

    rows.forEach((row, i) => {
      const line = i + 2;

      const name = row[nameColumn] || '';
      if (name.includes('"')) {
        damaged.push(`line ${line}, ${nameColumn}: stray quote in ${JSON.stringify(name.slice(0, 60))}`);
      }

      // A website cell that swallowed the next column is the other half of the
      // same failure, and it is the one that silently changes an institution's
      // slug. Empty is fine — plenty of institutions publish no site.
      const website = row.Website || '';
      if (website && !/^https?:\/\/[^\s,"]+$/.test(website)) {
        damaged.push(`line ${line}: Website is not a bare URL — ${JSON.stringify(website.slice(0, 60))}`);
      }
    });

    assert.deepEqual(damaged, [], 'a cell was damaged by incorrect CSV quoting');
  });
}
