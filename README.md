# Nigeria Tertiary Institutions API

A free, open REST API and dataset covering every Nigerian **university**,
**polytechnic**, and **college of education**, plus **colleges of health
science and technology** — 753 institutions in total — including their
faculties/schools/departments where publicly available.

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
| Colleges of health science and technology | 1 | 0 | 0 | 1 |
| **Total** | **753** | | | |

The first three rows are complete registers. The fourth is not: health-sciences
colleges are accredited outside the NUC, NBTE and NCCE registers this dataset is
built from, so there is no single list to work through, and the one row present
was contributed rather than swept. Treat that type as open, not as coverage.

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

## Hosting it

This is deliberately a **stateless app + a build-time SQLite file** — there's
no database server to provision, no migrations to run in production, and no
secrets to configure. That makes it cheap (often free) to host anywhere that
runs a Node process. A few options, roughly in order of "least effort":

### Option A — Render (free tier, easiest)
1. Push this repo to GitHub.
2. On [render.com](https://render.com): New → Web Service → connect the repo.
3. Build command: `npm install && npm run build-db`
   Start command: `npm start`
4. Render gives you a public `https://your-app.onrender.com` URL. Done — no
   Dockerfile needed. (Free tier sleeps after 15 min idle; the next request
   just takes a few seconds to wake it up.)

### Option B — Railway / Fly.io
Same idea as Render: connect the GitHub repo, set the build command to
`npm install && npm run build-db` and start command to `npm start`. Fly.io
needs a `fly launch` + `fly deploy` from the CLI; Railway auto-detects Node
projects with almost no config.

### Option C — Docker (portable to any VPS / cloud run service)
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build-db
EXPOSE 3000
CMD ["npm", "start"]
```
Build and run: `docker build -t nigeria-tertiary-api . && docker run -p 3000:3000 nigeria-tertiary-api`.
This same image works on Fly.io, Google Cloud Run, AWS App Runner, a
DigitalOcean droplet, etc.

### Option D — Plain VPS (systemd)
```bash
git clone <your-repo> && cd nigeria-tertiary-institutions-api
npm ci && npm run build-db
PORT=3000 npm start   # or wrap this in a systemd service / pm2
```
Put nginx or Caddy in front for TLS + a real domain.

**Whichever host you pick**, remember the `prestart` npm script rebuilds
`db/institutions.sqlite` from the CSVs automatically — you never need to
commit or manually copy the `.sqlite` file. `PORT` is read from the
environment (defaults to `3000`); most PaaS hosts set this for you
automatically.

### Requiring an API key

By default the API is open — no key needed. To lock it down, set an `API_KEY`
environment variable to a secret value; every request under `/api/v1/*` will
then need to send it back, or get a `401`. `/healthz` always stays open (so
your host's health checks don't need to know the key).

On Render: open your service → **Environment** tab → **Add Environment
Variable** → key `API_KEY`, value a long random string (e.g. generate one
with `openssl rand -hex 32`). Save, and Render redeploys automatically. The
same works on Railway/Fly.io (their dashboards have an equivalent
"Environment"/"Secrets" tab) or as `-e API_KEY=...` on `docker run`.

To issue separate keys per consumer (so you can revoke one without rotating
everyone else), set `API_KEY` to a comma-separated list:

```
API_KEY=key-for-my-frontend,key-for-partner-x,key-for-internal-script
```

Callers send their key as either header:

```js
fetch('https://your-app.onrender.com/api/v1/institutions', {
  headers: { 'X-API-Key': 'key-for-my-frontend' },
});
```

```js
fetch('https://your-app.onrender.com/api/v1/institutions', {
  headers: { Authorization: 'Bearer key-for-my-frontend' },
});
```

A request without a valid key gets:

```json
{ "error": "Missing or invalid API key. Pass it via the X-API-Key header (or Authorization: Bearer <key>)." }
```

This is a shared-secret check, not per-user auth or rate limiting — anyone
holding a valid key has full read access. It's meant to stop anonymous
scraping/abuse of a public deployment, not to gate access per end-user. If
you need real user accounts, quotas, or per-key rate limits, put a gateway
(Cloudflare, Kong, a small API-gateway service) in front instead of extending
this middleware.

### Using it from your own projects

Once it's hosted, it's just a normal REST API — call it from anywhere with
`fetch`/`axios`/whatever your stack uses, no SDK required (add the
`X-API-Key` header shown above if you've set `API_KEY`):

```js
const res = await fetch('https://your-app.onrender.com/api/v1/institutions?type=university&state=Lagos');
const { results } = await res.json();
```

```js
// every department matching "Computer Science", anywhere in the country
const res = await fetch('https://your-app.onrender.com/api/v1/departments?q=Computer%20Science');
```

If you're calling it from a browser app, CORS is already wide open (`cors()`
with no origin restriction) — lock that down in `src/app.js` if you're
running a public instance and want to restrict who can call it. Note that an
API key alone doesn't hide the key from a browser's network tab, so if you
also need to keep the key secret, call the API from your backend rather than
directly from client-side JS. If you expect real traffic, put a CDN/
reverse-proxy cache (Cloudflare, etc.) in front — the data only changes when
you redeploy, so aggressive caching is safe and will save you hosting cost.

## API reference

Base URL: `/api/v1`. All responses are JSON. No authentication is required
unless you've set `API_KEY` (see "Requiring an API key" above), and there's
no rate limiting on self-hosted instances — add your own if you're running this
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
| `type` | `type=polytechnic` | One of `university`, `polytechnic`, `college_of_education`, `college_of_health_science_and_technology`. `GET /api/v1/types` returns the current list — treat it as open, not fixed. |
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
below), each school with its own `departments: [{ id, name }]`. 404s if the
slug doesn't exist.

### `GET /api/v1/institutions/:slug/schools`
Just the parsed schools/faculties (each with its departments nested inside)
for one institution.

### `GET /api/v1/institutions/:slug/departments`
A **flat** list of every department at one institution, across all its
schools/faculties — each entry tells you which school it belongs to. Useful
when you don't care about the school grouping and just want "every department
at University X".

### `GET /api/v1/schools?q=`
Search for a school/faculty by name **across every institution** — e.g. find
every "School of Engineering" in the country. Same pagination params as
`/institutions`. `q` is required. Each result includes its `departments`.

### `GET /api/v1/schools/:id`
A single school/faculty by its numeric id, with its departments and parent
institution.

### `GET /api/v1/departments?q=&type=&category=&state=&page=&limit=`
Search/list **departments across every institution** — e.g. every "Computer
Science" department in the country, optionally filtered to `type=university`
or `state=Lagos`. Same pagination shape as `/institutions`. `q` is optional
here (omit it to browse/filter without a name search).

### `GET /api/v1/departments/:id`
A single department by its numeric id, with its parent school and
institution, and a `courses_available` flag. This is the stable,
directly-retrievable identifier for a department — link to or cache
`/api/v1/departments/123` rather than re-deriving it from a name search.

### `GET /api/v1/departments/:id/courses`
The course-of-study (programme) + section tree for one department: courses
that sit directly under the department, plus any named sections, each with
their own courses. **Generated, not individually verified** — see below.

### `GET /api/v1/courses?q=&qualification=&department_id=&institution_slug=&page=&limit=`
Search/list courses of study across every institution. `q` matches against
the programme title; `qualification` filters to an exact degree type (e.g.
`qualification=HND`). Each result includes its `section` (`null` if the
course isn't under a named specialization), `department`, and `institution`.
**Generated, not individually verified** — see below.

### `GET /api/v1/courses/:id`
A single course of study by its numeric id, with its
section/department/institution context.

## Data hierarchy

```
Institution (university | polytechnic | college_of_education)
  └─ School / Faculty / College        e.g. "Faculty of Engineering"
       └─ Department                   e.g. "Computer Engineering"
            ├─ Course of study         e.g. "B.Eng. Computer Engineering"  (generated)
            └─ Section (specialization/option, if the dept has one)
                 └─ Course of study                                       (generated)
```

Every institution's faculties/schools/departments were compiled from public
sources into one free-text field (`structure_raw`) — it's the ground truth.
Because that text isn't uniformly formatted across 752 institutions (and a
large share of smaller institutions simply haven't published a formal
structure at all), the API also ships a **best-effort parser**
(`src/parse.js`) that turns it into real, individually-retrievable `schools`
and `departments` rows (own `id`, own endpoint, joinable by `school_id` /
`institution_id`) at build time.

An empty `schools`/`departments` array does **not** mean "no data" — it means
the source text wasn't a clean itemized list. Always fall back to
`structure_raw` if you need the complete picture. `schools_parsed: true/false`
on the detail endpoint tells you which case you're in.

### Course-of-study data is generated, not individually verified

"Course" here means **course of study** — the named degree/programme a
student enrolls in (e.g. *B.Sc. Computer Science*, *HND Electrical/Electronic
Engineering*, *NCE Mathematics/Physics*) — not an individual class/module
(there's no "CSC301 — Data Structures" level of detail here).

Institution → school → department was compiled from live web research, one
institution at a time. Course-of-study data was **not** — doing that would
mean researching a confirmed programme list for every one of 1,700+
departments, and most institutions simply don't publish one anywhere
indexable. Instead, every department's course-of-study row(s) are
**generated** from a disclosed, documented naming convention based on
Nigeria's well-established qualification patterns by institution type and
subject area — e.g. a university "Computer Science" department → *B.Sc.
Computer Science*; a polytechnic department → both *ND* and *HND* on the
standard ladder; a college-of-education department → *NCE*. Every generated
row is tagged `source: "inferred"` in the API response so you can always tell
it apart from anything individually verified in the future.

This means course-of-study data exists for effectively every parsed
department across all 752 institutions — but it's a naming-convention
derivation, not a fact independently confirmed for that specific institution.
Check `qualification` and `source` on any course, and
`GET /api/v1/stats.course_data_coverage` for aggregate numbers. See
`data/DATA_NOTES.md` for the full rule set and its known limitations (subject
keyword matching is imperfect, not every private polytechnic necessarily runs
an HND-accredited programme yet, degree-type conventions vary by university,
etc.) before relying on this for anything admissions-critical.

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
