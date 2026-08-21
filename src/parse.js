'use strict';

/**
 * Best-effort parser that turns the free-text "Faculties" / "Schools/Departments"
 * cell (written by hand/research, not machine-generated) into a structured list
 * of { name, departments } entries.
 *
 * The source cells are NOT uniformly formatted -- they range from a clean
 * semicolon-separated list of "School of X (Dept A, Dept B)" entries to a
 * plain-English note like "Faculty/school structure not clearly itemized in
 * public sources; known programme areas include X, Y, Z". This parser only
 * extracts entries that look like a genuine School/Faculty/College/Institute
 * heading -- everything else is left out of the structured `schools` array,
 * but the full original text always survives untouched in `structure_raw`.
 *
 * This is intentionally conservative: an empty `schools` array does not mean
 * "no data", it means "the source text wasn't a clean itemized list -- read
 * structure_raw instead".
 */

const HEADING_RE = /^(school|faculty|college|institute|department)\s+of\b/i;

function splitTopLevel(text, delimiter) {
  // Split on `delimiter` but only at paren-depth 0, so we don't break up
  // "School of X (A, B; C)" on the inner semicolon.
  const parts = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && text.startsWith(delimiter, i)) {
      parts.push(current);
      current = '';
      i += delimiter.length - 1;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function stripTrailingNote(cell) {
  // Many cells end with " - <trailing note about ownership/year/location>"
  // after the itemized list. Split on the LAST top-level " - " so we don't
  // cut inside a parenthetical.
  const idx = lastTopLevelDashIndex(cell);
  if (idx === -1) return cell;
  return cell.slice(0, idx).trim();
}

function lastTopLevelDashIndex(text) {
  let depth = 0;
  let lastIdx = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && text.startsWith(' - ', i)) lastIdx = i;
  }
  return lastIdx;
}

function parseSegment(segment) {
  // "School of Engineering (Civil, Mechanical, Electrical)" ->
  //   { name: "School of Engineering", departments: ["Civil", "Mechanical", "Electrical"] }
  const parenMatch = segment.match(/^(.*?)\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/);
  if (parenMatch) {
    const name = parenMatch[1].trim().replace(/[;,]$/, '');
    const inside = parenMatch[2].trim();
    const departments = inside
      ? splitTopLevel(inside, ',').map((d) => d.trim()).filter(Boolean)
      : [];
    return { name, departments };
  }
  return { name: segment.trim(), departments: [] };
}

function parseStructure(cell) {
  if (!cell || !cell.trim()) return [];
  const withoutNote = stripTrailingNote(cell);
  const segments = splitTopLevel(withoutNote, '; ');
  const schools = [];
  for (const seg of segments) {
    if (!HEADING_RE.test(seg)) continue;
    const { name, departments } = parseSegment(seg);
    if (name) schools.push({ name, departments });
  }
  return schools;
}

module.exports = { parseStructure };
