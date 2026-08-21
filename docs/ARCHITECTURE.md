# Architecture

Turbo Notes is a full-stack monorepo containing a Next.js web app and a Django API, backed by PostgreSQL. The web app and API are separate processes and deployable services even though their source code lives in the same repository. The design favors clear ownership, recoverable writes, and explicit failure handling over additional services or abstractions.

## Runtime shape

```text
Browser
  └── same-origin requests
      └── Next.js web service
          ├── UI and Server Components
          ├── /api/v1 rewrite ──┐
          └── session checks ───┴──> Django API service ──> PostgreSQL
```

The browser uses one origin for pages and `/api/v1`. Next.js forwards API requests to Django, so the browser never needs the API service origin directly. Next.js owns rendering and browser interaction; Django owns authentication, authorization, validation, note consistency, and persistence; PostgreSQL is the authoritative persistent store.

The web app uses TanStack Query for server state and a typed API layer built on generated OpenAPI declarations. Private note query keys include the authenticated owner ID so cached data cannot cross accounts. Route mutations reconcile or invalidate the affected cache entries. Transient form and menu state stays in React components, while autosave remains a dedicated note-editor hook because its sequencing rules are domain behavior.

The frontend follows a Next.js-native vertical structure. `src/app` owns routing, metadata, request-time authentication guards, providers, and route-specific behavior. Route groups organize URLs without changing them, and private `_ui` and `_model` folders colocate non-routable code with the route that owns it. Login and signup share `(auth)/_ui/AuthScreen.tsx`; the notes index owns its list, create, and delete behavior; and the dynamic note route owns its editor.

Reusable behavior remains outside the router: `features` owns authentication and note autosave, `entities/note` owns domain contracts and reusable note behavior, and `shared` contains domain-free API infrastructure and UI primitives. Imports flow `app → features → entities → shared`, with layers allowed to skip directly downward. Reusable slices expose runtime-aware entry points. Modules within a route import one another relatively and reach lower layers through slice entry points or explicit paths. List, create, and delete orchestration stays private to the notes route until reuse justifies extraction.

## Authentication and ownership

Authentication uses Django's server-side session cookie. Unsafe requests include a CSRF token, and API responses are marked `private, no-store`.

Private note routes fail closed through two request-time gates. Next Proxy redirects requests with no session cookie, and each page validates any presented cookie with Django before rendering private UI. Django remains the authorization boundary for every API request.

Public login and signup routes avoid making API availability a rendering dependency. A browser with no session cookie receives the auth page without a Django request. When a cookie exists, Next.js verifies it and redirects confirmed users to `/notes`; if verification is temporarily unavailable, the failure is logged and the auth page still renders. This fallback exposes no private data and does not bypass Django authorization.

After private UI renders, TanStack Query refreshes the session on focus. A confirmed unauthenticated response clears private query state and recoverable drafts before redirecting to login. A transient refresh failure preserves the current screen and shows a retry warning. Authentication changes are broadcast across tabs; receiving tabs clear drafts, cancel active queries, and reload to reset in-memory state.

Every note query begins with the authenticated owner. Foreign note identifiers therefore resolve as not found rather than being fetched and checked later.

Random Thoughts, School, Personal, and Drama are fixed `TextChoices` values on `Note`. Django defines the persisted keys and model labels. The API exposes category keys and owner-scoped counts, while the frontend catalog owns UI labels, presentation order, and styles. Categories are values rather than per-user records, so category ownership mismatches cannot occur.

Account creation uses the accounts service and needs no cross-feature onboarding. DRF serializers validate request data. Focused note services own creation idempotency and revision-checked updates, the two write paths with cross-request consistency rules.

## Notes, pagination, autosave, and deletion

Creating a note persists a blank record before navigation. The browser prevents another creation while a request is in flight or a failed creation awaits retry or cancellation. It sends a UUID idempotency key retained across manual retry. A durable creation receipt and database uniqueness constraint make concurrent or lost-response retries resolve to the original response even after the note was edited or deleted. Reusing the key with different creation input returns a conflict.

Lists are ordered by last edit time and ID and use an opaque cursor containing both values. The UI presents the next-page action as **Load more notes**. Composite keyset traversal keeps responses bounded and avoids offset drift when notes are inserted or removed between pages, including when edit timestamps tie. Refreshing starts a new traversal of the latest ordering.

Each note has a monotonic revision. The editor sends the last acknowledged revision with a patch; Django updates only that exact revision and returns `409 Conflict` when another write won. Matching current values do not weaken the check because they cannot identify which writer produced the state. The browser performs one save at a time, coalesces edits made during an in-flight request, and reports unsaved, saving, saved, error, and conflict states explicitly.

For interrupted saves, the current draft is written to origin-scoped `localStorage`. Keys include the authenticated owner and note ID, values are validated before recovery, and entries expire after seven days. Drafts are removed after acknowledgement, after note deletion, and on every signed-out transition. This is a deliberate recovery/privacy tradeoff: unsaved note text exists on the local browser but cannot cross authenticated sessions.

Deletion requires confirmation and remains owner-scoped in Django. The client treats an already-absent note as a completed deletion, removes the note from cached lists and detail data, updates the known category count, clears its recoverable draft, and then invalidates affected list and category queries for server reconciliation.

## API contract

Django generates `apps/api/openapi.yaml`. `openapi-typescript` generates the committed declarations in `apps/web/src/shared/api/generated/schema.ts`; CI checks both artifacts for drift. Small handwritten adapters use those types to convert transport names into frontend domain objects. The frontend category catalog includes a compile-time equality assertion against the generated API enum.

All JSON write-body serializers reject undeclared fields at runtime. List filters and cursor parameters are validated just as strictly, so typos, repeated parameters, and malformed cursors return typed `400` responses instead of silently changing query behavior. OpenAPI models the required PATCH revision and body, strict JSON negotiation, and request constraints.

## Operations

`/health/live/` checks only that the API process can respond. `/health/ready/` performs a lightweight `SELECT 1`; both API probes accept safe methods and disable caching. The web service exposes `/health` as a process-local probe so its rollout does not depend on API availability. Compose starts the API only after a successful migration job.

The Render Blueprint provisions separate free web and API services plus PostgreSQL. The web service reaches the API through its Render-managed HTTPS URL because free web services cannot receive private-network traffic. Automatic deploys wait for repository checks to pass, and the two services can sleep or wake independently. Public auth pages tolerate a sleeping API, but authenticated data operations still require the API to become ready.

The free API runs migrations during startup because Render pre-deploy commands require a paid service. A paid deployment should move migrations to `preDeployCommand` so schema changes complete before new application instances receive traffic.

Production settings require a strong secret, explicit non-wildcard hosts, and PostgreSQL. They enable secure cookies, HTTPS redirection, and HSTS; trusting `X-Forwarded-Proto` remains an explicit deployment choice. Unhandled API-view failures caught by DRF return a generic safe body, oversized JSON returns a typed `413`, and malformed API routes retain the JSON error contract. A production workload should add scrubbed centralized error tracking.

Database constraints preserve the fixed category catalog, content bound, and creation-receipt uniqueness when writes bypass HTTP serializers. Django manages connection reuse and health checks, with a bounded PostgreSQL connection timeout; there is no application-managed pool. Interactive API docs use version-pinned assets in local development and are disabled in production.

The container defaults to one synchronous Gunicorn worker. `GUNICORN_CMD_ARGS` controls worker count, class, and timeout policy; production sizing should follow measured CPU, memory, and latency.

## Quality strategy

- Django tests cover authentication, CSRF, owner isolation, validation, category counts, idempotency and creation replay after deletion, pagination, revision conflicts, concurrency, database invariants, health behavior, and API error/schema contracts.
- Frontend unit and component tests cover API adaptation, server session checks and outages, session-change broadcasting, private-cache isolation, category controls, creation, deletion reconciliation, pagination, navigation, and autosave recovery.
- Centralized unit tests may import route or slice internals; production modules use slice public APIs and relative route-private imports.
- Playwright runs responsive and accessibility journeys at 320px, 390px, 600px (`sm`), 768px (`md`), 1024px (`lg`), and the 1280px desktop reference viewport.
- The PostgreSQL full-stack suite covers anonymous private-route protection, authenticated redirects away from auth pages, and the complete create, autosave, reopen, delete, and logout workflow through Next.js and Django.
- CI checks formatting, linting, types, migrations, generated contracts, coverage, production builds, dependency audits, the production API container build and smoke test, responsive browser behavior, and the real full-stack workflow.

DRF's standard JSON parser and Django-managed database connections remain sufficient. A custom body parser or application-managed connection pool should be introduced only when measured requirements justify it.
