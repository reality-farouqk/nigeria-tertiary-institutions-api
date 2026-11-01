'use strict';

/**
 * Generates "course of study" (degree/programme) rows for every department
 * across all 752 institutions.
 *
 * IMPORTANT: unlike the institutions/schools/departments data (compiled from
 * live web research), this is NOT individually researched or verified per
 * institution. Publishing a full, confirmed course-of-study list per
 * department for 752 institutions would require the same scale of research
 * effort that built the source CSVs in the first place, and most
 * institutions don't publish that list anywhere indexable.
 *
 * Instead, this applies a disclosed, documented naming convention: Nigerian
 * tertiary qualifications follow well-established, regulator-defined
 * patterns by institution type and subject area (e.g. a university
 * "Computer Science" department awards a "B.Sc. Computer Science"; a
 * polytechnic department runs the standard ND -> HND ladder; a college of
 * education department awards "NCE"). Every row produced here is tagged
 * `source: 'inferred'` so API consumers can tell it apart from anything
 * individually verified in the future, and the full rule set is documented
 * in data/DATA_NOTES.md so it can be judged, corrected, or overridden.
 *
 * This deliberately does NOT invent department-level detail that isn't in
 * the source data (no fabricated specializations, no fabricated course
 * codes/syllabi) -- it only reformats a department name we already have
 * evidence for into its conventional qualification/programme name.
 */

// Order matters: first matching rule wins. Keywords are matched as
// case-insensitive word-boundary substrings against the department name.
const UNIVERSITY_RULES = [
  { re: /\blaw\b/i, qualification: 'LL.B.' },
  {
    re: /\b(medicine and surgery|human medicine|clinical medicine)\b/i,
    qualification: 'MBBS',
  },
  { re: /\b(dentistry|dental surgery)\b/i, qualification: 'BDS' },
  { re: /\b(pharmacy|pharmaceutical sciences)\b/i, qualification: 'B.Pharm.' },
  { re: /\bnursing\b/i, qualification: 'B.NSc.' },
  { re: /\bveterinary medicine\b/i, qualification: 'DVM' },
  { re: /\bengineering\b/i, qualification: 'B.Eng.' },
  {
    re: /\b(english|literature|linguistics|history|philosophy|religious studies|theatre arts|creative arts|fine art|foreign languages|french|arabic studies|islamic studies|christian religious studies|music|classics|archaeology)\b/i,
    qualification: 'B.A.',
  },
  { re: /education/i, qualification: 'B.Ed.' },
];
const UNIVERSITY_DEFAULT = 'B.Sc.';

function inferUniversityQualification(deptName) {
  for (const rule of UNIVERSITY_RULES) {
    if (rule.re.test(deptName)) return rule.qualification;
  }
  return UNIVERSITY_DEFAULT;
}

function qualificationsFor(type, deptName) {
  if (type === 'university') return [inferUniversityQualification(deptName)];
  if (type === 'polytechnic') return ['ND', 'HND'];
  if (type === 'college_of_education') return ['NCE'];
  // No convention is asserted for college_of_health_science_and_technology.
  // The other three types each map to an award set taken from the register
  // they are drawn from; these colleges are accredited outside those registers
  // and their award set was not verified, so inventing one here would put
  // unverified programme names in front of students. Returning nothing is not a
  // gap to be filled in later by guessing — it is the honest state until a
  // published programme list is to hand. No row is affected today: the single
  // institution of this type has no departments.
  return [];
}

function generateCoursesOfStudy(db) {
  const departments = db
    .prepare(
      `SELECT d.id, d.name, i.type
       FROM departments d
       JOIN institutions i ON i.id = d.institution_id`
    )
    .all();

  const insertCourse = db.prepare(
    `INSERT INTO courses (department_id, section_id, qualification, title, source, position)
     VALUES (@department_id, NULL, @qualification, @title, 'inferred', @position)`
  );

  let courseCount = 0;
  const insertAll = db.transaction(() => {
    for (const dept of departments) {
      const qualifications = qualificationsFor(dept.type, dept.name);
      qualifications.forEach((qualification, idx) => {
        insertCourse.run({
          department_id: dept.id,
          qualification,
          title: dept.name,
          position: idx,
        });
        courseCount++;
      });
    }
  });
  insertAll();

  return { departmentsProcessed: departments.length, courseCount };
}

module.exports = { generateCoursesOfStudy, inferUniversityQualification };
