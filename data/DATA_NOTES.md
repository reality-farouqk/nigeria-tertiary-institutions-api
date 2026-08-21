# Data notes & methodology

This directory holds the three source-of-truth CSV files the API is built from. This
document explains where each came from, how it was compiled, and its known
limitations, so you can judge how much to trust any given row.

## Files

| File | Rows | What it covers |
|---|---|---|
| `nigerian_universities_faculties.csv` | 312 | Every NUC-recognized Nigerian university (Federal/State/Private), with faculties/colleges and a website where known. |
| `nigerian_polytechnics_schools.csv` | 200 | Every NBTE-accredited polytechnic per the NBTE 25th Edition Directory (June 2025), with schools/departments where published. |
| `nigerian_colleges_of_education_schools.csv` | 240 | Every NCCE-accredited college of education (Federal/State/Private) per the live NCCE accredited-colleges register, with schools/departments where published. |

All three share a compatible shape: `S/N`, a name column, `Category`
(Federal/State/Private), a location column, `Year Established` (blank where not
confirmed), and a free-text structure column (`Faculties` or `Schools/Departments`).

## How the structure column was compiled

For each institution, researchers (LLM agents doing live web search) looked for a
published breakdown of the institution's faculties/schools/colleges and, where
available, the departments under each. The cell is a semicolon-separated list of
`School/Faculty/College of X (Dept A, Dept B, ...)` entries followed by a short
trailing note (ownership, year established, campus/location).

**Not every institution publishes this.** Especially among newer or smaller
private polytechnics and colleges of education, there is often no formally
published school structure at all — just a flat list of course/programme areas,
or nothing beyond "est. 20XX, private, [town]". In those cases the cell says so
explicitly (e.g. *"Faculty/school structure not clearly itemized in public
sources; known programme areas include X, Y, Z"*) rather than inventing a
structure that isn't supported by a source. Roughly half of polytechnic rows and
about three-quarters of college-of-education rows fall into this "thin source"
category — this mirrors the actual state of public disclosure by these
institutions, not a gap in the research.

The API's best-effort parser (`src/parse.js`) only turns a cell into structured
`schools`/`departments` when it recognizes an itemized "School of / Faculty of /
College of / Institute of" pattern. Thin-source cells correctly produce an empty
`schools` array — read `structure_raw` for the full text in that case.

**A parsing safeguard filters out institutional notes disguised as
departments.** Some cells append a closing remark about a specific school
directly inside that school's own parentheses instead of using the intended
" - " separator — e.g. `Faculty of Science (7-8 faculties per recruitment
notice; est. 2023, temporary site at FUNAAB)`. Without a check for this, the
note gets split like a department list and produces fabricated-looking
entries (a real example this caught: "renamed Ogbonnaya Onu Polytechnic;
state-owned", "est. 1992", "Aba" being parsed as three separate
"departments"). The parser now recognizes note-like text (years, ownership/
renaming language, sourcing caveats, bare counts like "3 departments") inside
a school's parenthetical and drops it rather than presenting it as a
department — this removed roughly 500 fabricated department rows from an
earlier build of this dataset. `structure_raw` is untouched either way, so
the original text is always available to double-check.

## Colleges of education: source and exclusions

The polytechnics and universities lists were carried forward from an existing,
separately verified dataset. The colleges-of-education list was rebuilt from
scratch against the NCCE's own live accredited-colleges register
(`ncce.gov.ng/AccreditedColleges`) as of August 2026, because older secondary
sources (a Dec 2019 NCCE PDF, and several 2022-2024 listicles) undercounted the
true total — mostly private-college growth that hadn't been reflected yet. The
NCCE register also lists a handful of NBTE polytechnics and NTI/language
institutes that also run NCE-affiliated programmes; those were excluded from
this file since they belong in the polytechnics dataset (or aren't colleges of
education at all).

The following six institutions are still listed as "active" on the NCCE
register at the time of writing, but independent sources confirm they have
since been elevated to full university status and are already present (under
their new name) in `nigerian_universities_faculties.csv`. They were excluded
here to avoid duplicating the same institution under two names across the two
datasets:

- **College of Education, Ikere-Ekiti** (Ekiti) → *Bamidele Olumilua University
  of Science and Technology, Ikere* (Oct 2020)
- **College of Education, Ilorin** (Kwara) → *Kwara State University of
  Education, Ilorin* (Nov 2024)
- **Cross River State College of Education, Akampa** → *Cross River University
  of Education and Entrepreneurship, Akampa* (2025)
- **Niger State College of Education, Minna** → *Niger State University of
  Education*, subsequently renamed *AbdulKadir Kure University, Minna* (2023)
- **Shehu Shagari College of Education, Sokoto** → *Shehu Shagari University of
  Education, Sokoto* (2022)
- **Peaceland College of Education, Enugu** → *PeaceLand University* (2023)

A couple of other institutions carry a genuine ambiguity that a clean exclusion
wasn't warranted for: **Sa'adatu Rimi College of Education, Kumbotso** (Kano)
has reported NUC approval (Feb 2023) to become *Sa'adatu Rimi University of
Education*, but that entity does not yet appear in the universities dataset and
the NCCE register still lists the college as active — it was kept in this file
with a note rather than dropped into a gap between the two datasets. If you spot
other institutions in a similar limbo, please open an issue (see
`CONTRIBUTING.md`).

## Course-of-study data: derivation methodology and limitations

"Course" in this API means **course of study** — the named degree/programme
a student enrolls in (e.g. *B.Sc. Computer Science*, *HND Electrical/
Electronic Engineering*, *NCE Mathematics/Physics*) — not an individual
class/module. This section explains how those rows are produced, since it's
fundamentally different from how the rest of this dataset was built.

### Why this is generated, not researched

Confirming an institution's actual list of course-of-study offerings the same
way the faculty/department structure was researched (live web search, one
institution at a time) isn't practical at this scale: there are over 1,700
parsed departments across 752 institutions, and most institutions don't
publish a clean, indexable list of their conferred qualifications per
department. An earlier version of this project piloted hand-researching
individual class-level course lists for 6 institutions and found coverage was
extremely uneven even among well-known flagship institutions — confirming
that a research-based approach wouldn't scale honestly across all 752 without
years of effort.

Instead, `scripts/generate-courses-of-study.js` derives a course-of-study row
for every department using Nigeria's well-established, regulator-defined
naming conventions by institution type. This is a **disclosed heuristic**,
not a fabrication: every rule is documented below, every generated row is
tagged `source: "inferred"` in the API, and nothing here invents
department-level detail that wasn't already in the researched `structure_raw`
data — it only reformats a department name we have real evidence for into
its conventional qualification name.

### The rules

**Polytechnics** — every department gets two rows: `ND <department name>` and
`HND <department name>`, reflecting the standard NBTE National
Diploma → Higher National Diploma ladder.

**Colleges of education** — every department gets one row: `NCE <department
name>`, the standard first-level teaching qualification.

**Universities** — every department gets one row, with the qualification
chosen by matching keywords in the department name against this table (first
match wins, checked in this order):

| Department name contains | Qualification |
|---|---|
| "law" | LL.B. |
| "medicine and surgery" / "human medicine" / "clinical medicine" | MBBS |
| "dentistry" / "dental surgery" | BDS |
| "pharmacy" / "pharmaceutical sciences" | B.Pharm. |
| "nursing" | B.NSc. |
| "veterinary medicine" | DVM |
| "engineering" | B.Eng. |
| english / literature / linguistics / history / philosophy / religious studies / theatre arts / creative arts / fine art / foreign languages / french / arabic studies / islamic studies / christian religious studies / music / classics / archaeology | B.A. |
| "education" | B.Ed. |
| *(no match)* | B.Sc. (default) |

The exact regular expressions are in
`scripts/generate-courses-of-study.js` if you want to check or extend the
rule set yourself.

### Known limitations

- **Keyword matching is imperfect.** A department like "Educational
  Technology" contains "education" and is tagged B.Ed., even though some
  universities classify it as a B.Sc. programme. A department like
  "Architecture" has no matching rule and falls through to the B.Sc. default,
  even though several universities award a B.Sc. (Architecture) as a first
  degree en route to a professional M.Sc./M.Arch — this is a defensible
  simplification, not a confirmed fact per university.
- **Engineering degree naming varies.** Most Nigerian universities award
  B.Eng., but a handful award B.Tech. for the same subject area — this rule
  set always picks B.Eng.
- **Not every private polytechnic is HND-accredited.** The ND → HND rule
  assumes the standard ladder; some newer or smaller private polytechnics may
  currently be ND-only pending NBTE accreditation for the HND stage. This
  isn't verified per institution.
- **Social-science degree types vary.** Departments like Economics,
  Geography, or Mass Communication are awarded as B.Sc. at most universities
  but B.A. at a few — the default (B.Sc.) won't be right for every case.
- **No department-level detail beyond what's already researched.** This
  process does not add new departments, specializations, or course codes —
  it only assigns a qualification name to departments that were already in
  the researched `structure_raw` data.

### If you have verified, institution-specific programme data

This is exactly the kind of correction this project wants — see
`CONTRIBUTING.md`. A future version could support a `source: "verified"` tier
alongside the generated `"inferred"` rows for anyone willing to confirm a
specific institution's actual conferred qualifications.

## Known limitations

- **Currency**: this snapshot reflects public sources as of August 2026.
  Nigerian tertiary institutions are renamed, merged, relocated, and converted
  to university status fairly often — treat this as a point-in-time dataset,
  not a live feed.
- **"Year Established"** is left blank where no source confirmed it — this is
  more common for very new or very small private institutions.
- **Names**: where a source conflict was found (e.g. a state ministry site says
  one founding year, the institution's own site says another; or ownership type
  is disputed across sources), the cell says so explicitly rather than silently
  picking one.
- **The free-text structure column is the source of truth.** The API's parsed
  `schools` array is a best-effort convenience, not a guarantee — always prefer
  `structure_raw` if you need the complete picture for an institution.

Corrections are very welcome — see `CONTRIBUTING.md`.
