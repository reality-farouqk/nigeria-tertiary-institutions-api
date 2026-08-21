# Nigeria Tertiary Institutions API

A free, open REST API and dataset covering every Nigerian **university**,
**polytechnic**, and **college of education** — 752 institutions in total —
including their faculties/schools/departments where publicly available.

As far as we could find, there wasn't an existing open API for this — most
"list of Nigerian universities" resources are static blog posts or PDFs that go
stale within a year. This project exists to be the thing that's missing:
current, structured, versioned, and free to self-host or build on.

```
GET /api/v1/institutions?type=university&state=Lagos
GET /api/v1/institutions/ahmadu-bello-university-zaria
GET /api/v1/schools?q=Engineering
```

## Coverage

| Type | Count | Federal | State | Private |
|---|---|---|---|---|
| Universities | 312 | 77 | 67 | 168 |
| Polytechnics | 200 | 41 | 61 | 98 |
| Colleges of education | 240 | 30 | 43 | 167 |
| **Total** | **752** | | | |

See [`data/DATA_NOTES.md`](data/DATA_NOTES.md) for full sourcing, methodology,
and known limitations (which institutions publish a formal faculty/school
structure vs. which don't, why a handful of colleges of education were
excluded, etc.) — read this before relying on the data for anything important.

## Quick start

Requires Node.js 18+.

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/nigeria-tertiary-institutions-api.git
cd nigeria-tertiary-institutions-api
npm install
npm start        # builds db/institutions.sqlite from data/*.csv, then starts the API
```

The API is now running at `http://localhost:3000`. No external database, no
API keys, no config — the whole thing is a ~2 MB SQLite file built from the
CSVs at startup.

```bash
curl http://localhost:3000/api/v1/stats
```

### Development

```bash
npm run build-db   # rebuild db/institutions.sqlite from data/*.csv
npm run dev        # start with --watch (auto-restart on file changes)
npm test           # rebuild the db, then run the test suite
```

## API reference

Base URL: `/api/v1`. All responses are JSON. There is no authentication and no
rate limiting on self-hosted instances — add your own if you're running this
publicly at scale.

### `GET /api/v1`
Index of available endpoints.

### `GET /api/v1/stats`
Aggregate counts by type and category.

### `GET /api/v1/types`
The valid `type` values (`university`, `polytechnic`, `college_of_education`)
and `category` values (`Federal`, `State`, `Private`).

### `GET /api/v1/states`
Every state with an institution count, e.g. `{ "state": "Lagos State", "count": 41 }`.

### `GET /api/v1/institutions`
List/search institutions. Query params (all optional, all combinable):

| Param | Example | Description |
|---|---|---|
| `type` | `type=polytechnic` | One of `university`, `polytechnic`, `college_of_education` |
| `category` | `category=Federal` | One of `Federal`, `State`, `Private` |
| `state` | `state=Kano` | Substring match against the state/location field |
| `q` | `q=Zaria` | Substring match against the institution name |
| `page` | `page=2` | 1-indexed, default `1` |
| `limit` | `limit=50` | Default `25`, max `100` |

Response:
```json
{
  "page": 1,
  "limit": 25,
  "total": 200,
  "total_pages": 8,
  "results": [
    {
      "id": 341,
      "type": "polytechnic",
      "name": "Coastal Polytechnic, Badagry, Lagos",
      "slug": "coastal-polytechnic-badagry-lagos",
      "category": "Private",
      "state": "Lagos State",
      "year_established": 2020,
      "website": null,
      "structure_raw": "School of Business Administration and Management; ..."
    }
  ]
}
```

### `GET /api/v1/institutions/:slug`
A single institution, including the best-effort parsed `schools` array (see
below). 404s if the slug doesn't exist.

### `GET /api/v1/institutions/:slug/schools`
Just the parsed schools/faculties + departments for one institution.

### `GET /api/v1/schools?q=`
Search for a school/faculty by name **across every institution** — e.g. find
every "School of Engineering" in the country. Same pagination params as
`/institutions`. `q` is required.

## About `structure_raw` vs. the parsed `schools` array

Every institution's faculties/schools/departments were compiled from public
sources into one free-text field (`structure_raw`) — it's the ground truth.
Because that text isn't uniformly formatted across 752 institutions (and a
large share of smaller institutions simply haven't published a formal
structure at all), the API also ships a **best-effort parser**
(`src/parse.js`) that extracts a `schools: [{ name, departments }]` array from
cells that look like a clean itemized list.

An empty `schools` array does **not** mean "no data" — it means the source
text wasn't a clean itemized list. Always fall back to `structure_raw` if you
need the complete picture. `schools_parsed: true/false` on the detail endpoint
tells you which case you're in.

## Data license

- **Code**: MIT (see [`LICENSE`](LICENSE)).
- **Data** (the CSVs in `data/`): CC0 / public domain (see
  [`data/LICENSE`](data/LICENSE)) — it's compiled from public government
  directories and institutions' own published materials.

## Contributing

Corrections, additions, and PRs are very welcome — this dataset will drift out
of date the moment an institution renames, merges, or gets upgraded to
university status, which happens a few times a year in Nigeria. See
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Disclaimer

This is an independent, community-maintained project — it is not affiliated
with or endorsed by the NUC, NBTE, NCCE, or the Federal Government of Nigeria.
Data accuracy is best-effort; see `data/DATA_NOTES.md` for specifics. Please
verify anything admissions- or accreditation-critical directly with the
relevant regulator or institution.
