'use strict';

/**
 * Minimal RFC 4180 CSV parser (no external dependency).
 * Handles quoted fields, embedded commas, embedded newlines, and "" escaped quotes.
 * Returns an array of row objects keyed by the header row.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings so \r\n inside/outside quotes behaves consistently.
  const s = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const next = s[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // last field/row (if file doesn't end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = r[idx] !== undefined ? r[idx] : '';
      });
      return obj;
    });
}

module.exports = { parseCsv };
