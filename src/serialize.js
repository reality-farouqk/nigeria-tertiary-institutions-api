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
      id: s.id,
      name: s.name,
      departments: (s.departments || []).map((d) => ({
        id: d.id,
        name: d.name,
        courses_available: Boolean(d.courses_available),
      })),
    }));
    out.schools_parsed = out.schools.length > 0;
  }
  return out;
}

module.exports = { serializeInstitution };
