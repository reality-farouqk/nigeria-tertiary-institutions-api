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
}
