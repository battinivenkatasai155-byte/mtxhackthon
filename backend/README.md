# CPGRAMS Grievance Routing Backend

Modular Node.js/Express API for grievance intake, department routing, status tracking, explainable classification, suspected root-cause clustering, and administrative review. It stores application data in PostgreSQL and keeps evidence uploads private.

## Architecture

- `src/app.js` composes security middleware and versioned routes; `src/server.js` owns listening and graceful shutdown.
- `src/config/` validates environment settings, creates the PostgreSQL pool, and configures structured Pino logs.
- `src/routes/`, `src/controllers/`, and `src/services/` separate HTTP routing, response handling, and business logic.
- `src/middleware/` contains authentication, role checks, validation, rate limiting, request IDs, and upload validation.
- `database/migrations/` contains ordered, transaction-applied schema migrations. `database/seeds/` contains idempotent fictional departments.
- `src/jobs/` contains the overdue-grievance escalation scheduler.
- `tests/` contains isolated Jest/Supertest and service tests.

## Requirements and local setup

Requires Node.js 20 or newer and PostgreSQL 13 or newer. From this directory:

```powershell
npm ci
Copy-Item .env.example .env
```

Set `JWT_SECRET` in `.env` to a newly generated random value (at least 32 characters). Configure either:

- `DATABASE_URL=postgres://...`, or
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE`.

Do not leave the example JWT value in a deployed environment. `.env` is ignored by Git. Do not put production credentials in source control.

Create an empty database and database user in PostgreSQL, then set the connection settings in `.env`. Apply the schema and fictional department seed:

```powershell
npm run db:migrate
npm run db:seed
```

Migrations are recorded in `schema_migrations`, run in order, and do not drop data. Seeds are safe to re-run. No production data or example citizen accounts are seeded.

Create the first administrator once using the bootstrap CLI after migrations and seeds. Supply `ADMIN_FULL_NAME`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD` through a secure process environment; the password is bcrypt-hashed and never printed. The command refuses to create a second bootstrap administrator. Administrators can provision department officers through the protected API.

Run the API:

```powershell
npm run dev
# or
npm start
```

The API listens on `http://localhost:4000` by default. `GET /api/v1/health` reports process liveness without requiring PostgreSQL. `GET /api/v1/ready` executes a real database query and returns `503` if the database is unconfigured or unavailable. `npm run db:migrate` and `npm run db:seed` require a configured, reachable database.

`CORS_ORIGINS` is a comma-separated exact origin allowlist. Configure it for the frontend deployment; do not use `*` for an authenticated deployment. `PORT`, `LOG_LEVEL`, and `PG_POOL_MAX` are configurable.

## API and authentication

Swagger UI: `http://localhost:4000/api/docs`

All application endpoints use the `/api/v1` prefix.

| Area | Endpoints |
| --- | --- |
| Health | `GET /health`, `GET /ready` |
| Authentication | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Grievances | `POST /grievances`, `GET /grievances`, `GET /grievances/:id`, `PATCH /grievances/:id`, `PATCH /grievances/:id/status`, `GET /grievances/:id/history`, `GET /grievances/track/:trackingId` |
| Classification and routing | `POST /grievances/:id/classify`, `POST /grievances/:id/route`, `GET /grievances/:id/routing`, `POST /grievances/:id/reassign` |
| Departments | `GET /departments`, `GET /departments/:id`, `GET /departments/:id/grievances`, `GET /departments/:id/statistics` |
| Clusters | `GET /clusters`, `GET /clusters/:id`, `POST /clusters/analyze`, `POST /clusters/:id/review`, `GET/POST /clusters/:id/grievances`, `DELETE /clusters/:id/grievances/:grievanceId` |
| Administration | `GET /admin/dashboard`, `GET /admin/statistics`, `GET /admin/audit-logs`, `PATCH /admin/grievances/:id/priority`, `POST /admin/grievances/:id/priority/calculate`, `PATCH /admin/grievances/:id/status`, `POST /admin/users/officers`, `POST /admin/departments`, `PATCH /admin/departments/:id` |

Registering creates a citizen account only:

```powershell
curl.exe -X POST http://localhost:4000/api/v1/auth/register `
  -H "Content-Type: application/json" `
  -d "{\"fullName\":\"Example Citizen\",\"email\":\"citizen@example.test\",\"password\":\"replace-with-a-long-password\"}"
```

Send the returned token as `Authorization: Bearer <token>`. Roles and department access are reloaded from PostgreSQL on every authenticated request; a role claim supplied by the client is never trusted. Department officers and administrators must be provisioned by an administrator or through an authorized database process.

Citizens see only their own grievances. Officers see grievances actively assigned to their departments. Public tracking uses a cryptographically random tracking ID and returns only status, priority, dates, and progress events—not grievance contents or citizen identity.

Responses use JSON. Errors have the form `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Paginated list APIs accept `page` and `limit` (maximum 100); grievance lists also support status, priority, search, `sortBy` (`created_at`, `updated_at`, `priority`), and `sortOrder`.

## Classification, routing, and clustering

Classification has a provider-independent JSON contract. On intake the system classifies every submitted grievance; transparent keyword rules return `method: "rules"`, an explanation, confidence, suggested keywords, and a human-review flag. High-confidence cases are routed automatically; uncertain or potentially urgent cases remain classified but unassigned for human review. The rule-based result is not a legal or emergency determination. Classification and cross-department rules are maintained in `src/config/classificationRules.js`, separate from controllers.

To configure a compatible provider, set `CLASSIFICATION_PROVIDER_URL` and optionally `CLASSIFICATION_PROVIDER_API_KEY`. The backend sends the subject and description as untrusted data, expects the strict JSON shape documented in `src/services/classification.service.js`, validates the response, applies an eight-second timeout, and never logs grievance text or the API key. If the provider fails or returns invalid data, the response is explicitly a rules-based fallback; it is not represented as a successful AI classification. Configure external processing only when permitted by the applicable privacy requirements.

Routing records a reason for each assigned department and each reassignment. The cross-department rules are explainable and currently cover water/pipeline, road/electricity, and sanitation/health combinations. Administrators review and initiate routing; uncertain classification is not silently treated as a confirmed assignment.

Cluster analysis uses weighted Jaccard text overlap, category, district, and a 30-day time window. `CLUSTER_SIMILARITY_THRESHOLD` controls the minimum score. Evidence is stored for review. Clusters start as `suspected`; only an administrator can confirm or reject one. Similar wording is not proof of a shared root cause.

Priority calculation uses transparent severity, public-safety, repeat, affected-people, time-waiting, and ongoing-incident factors. Thresholds are set by `HIGH_PRIORITY_THRESHOLD` and `CRITICAL_PRIORITY_THRESHOLD`. Overdue grievances are escalated at most one priority level per scheduled pass; every change is audited. The scheduler runs in each API process, so deployments with multiple replicas should move it to a single worker or a distributed job scheduler.

## Evidence uploads and privacy

Grievance submissions can use JSON for text-only submissions or multipart form data with up to three `attachments` (PDF, JPEG, PNG), each at most 5 MiB. Optional `affectedPeople` and `ongoingIncident` values are used as explicit priority inputs; they do not cause a legal or emergency determination. MIME type, filename extension, and basic file signatures are checked. Server-generated UUID filenames, restrictive file permissions, hashes, and a private upload directory prevent path traversal and public static access. Downloads require grievance authorization.

Uploads are stored on the local private volume. Production deployments with multiple instances should use private object storage with equivalent authorization and lifecycle controls. Malware scanning is not included; do not treat file-signature checks as a substitute for scanning.

## Testing

```powershell
npm test
```

Tests mock PostgreSQL and exercise HTTP behavior, authentication and role checks, validation, text-only intake, upload content rejection, fallback classification, routing, clustering, priorities, transitions, and health/readiness. Database migrations, seed execution, and real PostgreSQL transaction behavior require a configured disposable PostgreSQL test instance; the test suite does not connect to or modify production data.

## Docker

Copy `.env.example` to `.env`, set a strong random `JWT_SECRET`, and set non-empty `PGUSER` and `PGPASSWORD`. Then run from this directory:

```powershell
docker compose up --build
```

Compose starts PostgreSQL with a persistent named data volume, waits for its health check, builds a non-root Node container, applies migrations and seeds, and then starts the API. The image contains no credentials. Private uploads use a separate named volume. Stop services with `docker compose down`; the named database volume remains. Do not run `docker compose down -v` unless you intend to delete the database volume.

After Compose is healthy, run the initial-administrator CLI once with `ADMIN_FULL_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` supplied to `docker compose exec` via a secure environment, for example `docker compose exec --env ADMIN_FULL_NAME --env ADMIN_EMAIL --env ADMIN_PASSWORD backend npm run admin:create`.

## Deployment notes and limitations

For a hosting provider, deploy the backend container with a managed PostgreSQL instance, inject `JWT_SECRET` and database credentials through the provider's secret manager, configure the exact frontend CORS origin, enable TLS, and verify `/api/v1/ready` against the live database before directing traffic. Use private persistent storage for attachments and a single escalation worker (or a distributed scheduler). The code does not claim any hosting deployment has been performed.

The classifier and clustering baseline are intentionally explainable heuristics; they require operational evaluation before use in real public services. External AI processing is opt-in. Notifications are represented in the schema but delivery integrations are not configured. File malware scanning, email verification/password reset, and distributed scheduling are not included.
