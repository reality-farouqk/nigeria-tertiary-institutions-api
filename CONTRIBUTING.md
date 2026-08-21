# Contributing

Thanks for helping keep this dataset and API accurate — Nigerian tertiary
institutions get renamed, merged, relocated, or upgraded to university status
often enough that this will always need upkeep.

## Reporting a data issue

Most contributions will be data corrections. Please open an issue (or a PR
directly, if you're comfortable) with:

1. The institution's exact name as it appears in the relevant CSV.
2. What's wrong (wrong year, outdated name, missing/incorrect school list,
   institution has closed/merged/converted to a university, etc).
3. A source — a link to the institution's official site, a NUC/NBTE/NCCE
   listing, or a credible news article. We can't merge unsourced corrections.

## Editing the data directly

The three CSVs in `data/` are the source of truth:

- `data/nigerian_universities_faculties.csv`
- `data/nigerian_polytechnics_schools.csv`
- `data/nigerian_colleges_of_education_schools.csv`

Please keep the existing style when editing a "structure" cell (`Faculties` /
`Schools/Departments`):

- Semicolon-separated `School of X (Dept A, Dept B)` entries where a formal
  structure is published.
- If no formal structure is published, say so honestly rather than inventing
  one — e.g. *"Faculty/school structure not clearly itemized in public
  sources; known programme areas include X, Y, Z"*. See `data/DATA_NOTES.md`
  for the full rationale.
- No markdown inside cells — plain text only, comma-safe (rely on standard CSV
  quoting for embedded commas).

After editing a CSV, run `npm run build-db` and `npm test` before opening a PR
— the test suite will catch a surprising number of accidental issues.

## Adding a missing institution

If NUC/NBTE/NCCE has accredited a new institution that isn't in the dataset
yet, add a new row with the next `S/N`, cite your source in the PR
description, and leave `Year Established` / the structure column honestly
blank/thin if you can't find that detail yet.

## Code contributions

The API is a small, dependency-light Express + better-sqlite3 app:

- `scripts/build-db.js` + `scripts/csv.js` — CSV → SQLite ETL.
- `src/parse.js` — the best-effort free-text → structured-schools parser.
- `src/app.js`, `src/routes.js`, `src/serialize.js`, `src/db.js` — the API itself.
- `test/api.test.js` — integration tests using Node's built-in test runner.

Run `npm test` before opening a PR. Please keep new dependencies to an
absolute minimum — part of the point of this project is that anyone can
`git clone && npm install && npm start` it with no external services.

## Code of conduct

Be kind, assume good faith, and keep discussion focused on making the data and
API more accurate and useful.
