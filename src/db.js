'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'db', 'institutions.sqlite');

if (!fs.existsSync(DB_PATH)) {
  // eslint-disable-next-line no-console
  console.error(
    `Database not found at ${DB_PATH}.\n` +
      "Run 'npm run build-db' first to generate it from the CSV data in data/."
  );
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma('query_only = true');

module.exports = db;
