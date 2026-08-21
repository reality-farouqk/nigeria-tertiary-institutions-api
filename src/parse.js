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

// Many source cells end with a trailing institutional note (ownership, year
// established, renaming history, sourcing caveat, campus/location) that's
// SUPPOSED to be separated from the itemized school/department list by
// " - " (see stripTrailingNote). When a researcher forgot that separator,
// the note ends up glued directly onto the last school heading's own
// parentheses instead -- e.g. "Faculty of Science (7-8 faculties per
// recruitment notice; est. 2023, temporary site at FUNAAB)" -- and without
// this check it gets misparsed as that school's department list. This
// signals "this looks like an institutional note, not a department name".
const NOTE_SIGNAL_RE = new RegExp(
  [
    '\\b(19|20)\\d{2}\\b', // any 4-digit year
    '^\\d', // starts with a digit/count, e.g. "7-8 faculties per..."
    '\\best\\.?\\b',
    'established',
    'renamed',
    'affiliated',
    'founder',
    'founded',
    'per (official|recruitment|admission|matriculation|the\\b|wikipedia|aggregator|zoominfo|pioneer|whed)',
    'approved by',
    'conversion of',
    'restructuring',
    'accredited',
    'course listing',
    'fees schedule',
    'site at',
    'temporary site',
    '-owned',
    'private university',
    'federal[- ]owned',
    'upgraded',
    'licensed',
    'grown from',
    'grew from',
    'spun off',
    'merger of',
    'evolved from',
    'not itemized',
    'not confirmed',
    'not found',
    'ownership confirmed',
    'status\\s*\\d',
    'state-owned',
    'decree no',
    'opened (to students|sept|nov)',
    'named after',
    'network since',
    'reportedly',
    'first (private|community|specialized|open)',
    'plans for',
    'planned but not yet',
    'no (law|nursing|medicine)',
    '^note:',
    'individual (department|school|college)s?',
  ].join('|'),
  'i'
);

function looksLikeInstitutionNote(item) {
  return NOTE_SIGNAL_RE.test(item);
}

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
  segments.forEach((seg) => {
    if (!HEADING_RE.test(seg)) return;
    const { name, departments } = parseSegment(seg);
    if (!name) return;
    // A researcher's closing remark about THIS school (e.g. "(added MBBS
    // 2022)", "(3 departments)", "(individual departments not itemized)")
    // can end up glued directly onto that school's own parentheses instead
    // of using the " - " separator stripTrailingNote expects. If any item
    // in the parsed department list looks like that kind of note rather
    // than an actual department name, the whole list is a note, not a
    // department roster -- keep the school name, drop the fabricated list.
    const departmentsAreActuallyANote =
      departments.length > 0 && departments.some(looksLikeInstitutionNote);
    schools.push({ name, departments: departmentsAreActuallyANote ? [] : departments });
  });
  return schools;
}

module.exports = { parseStructure, looksLikeInstitutionNote };
