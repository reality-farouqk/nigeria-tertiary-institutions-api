'use strict';

function serializeInstitution(row, { withSchools = false, schools = [] } = {}) {
  const out = {
    id: row.id,
    type: row.type,
    name: row.name,
    slug: row.slug,
    category: row.category,
    state: row.state,
    year_established: row.year_established,
    website: row.website,
    structure_raw: row.structure_raw,
  };
  if (withSchools) {
    out.schools = schools.map((s) => ({
      name: s.name,
      departments: safeParseArray(s.departments),
    }));
    out.schools_parsed = out.schools.length > 0;
  }
  return out;
}

function safeParseArray(text) {
  try {
    const val = JSON.parse(text);
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

module.exports = { serializeInstitution };
