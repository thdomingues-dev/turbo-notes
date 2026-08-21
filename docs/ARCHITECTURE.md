# Architecture

Turbo Notes is a Django/Next.js monolith backed by PostgreSQL. The design favors clear ownership and recoverable writes over additional services or abstractions.

## Runtime shape

```text
Browser
  └── one origin
      ├── Next.js UI
      └── /api/v1 → Django REST Framework
                        └── PostgreSQL
```

Next.js owns rendering and browser interaction. Django owns authentication, authorization, validation, note consistency, and persistence. PostgreSQL is the shared source of truth.

The web app uses TanStack Query for server state and a small typed API module built on generated OpenAPI declarations. Transient form and menu state stays in React components; autosave coordination remains a dedicated note-editor hook because its sequencing rules are domain behavior, not generic global state.

The frontend follows a Next.js-native vertical structure. `src/app` owns routing, metadata, request-time authentication guards, providers, and route-specific behavior. Route groups organize URLs without changing them, and private `_ui` and `_model` folders colocate non-routable code with the route that owns it. Login and signup share `(auth)/_ui/AuthScreen.tsx`; the notes index owns its list/create/delete hooks and screen components; and the dynamic note route owns its editor screen and controls. `page.tsx`, `loading.tsx`, and `error.tsx` contain their App Router responsibilities directly instead of delegating through page barrels or wrapper components.

Reusable behavior remains outside the router: `features` owns authentication and note autosave, `entities/note` owns domain contracts, transport adapters, query keys, paths, and reusable note presentation, and `shared` contains domain-free API infrastructure and UI primitives. Imports flow `app → features → entities → shared`, with layers also allowed to skip directly downward. Same-slice and route-private imports are relative. Genuine reusable slices retain public runtime-aware entry points (`features/auth/index.ts`, `features/auth/index.server.ts`, `features/note-autosave/index.ts`, `entities/note/index.ts`, and `entities/note/index.client.ts`); route code and flat shared modules use explicit paths.

Create, delete, and list orchestration remain private to the notes route because they are not reused or independently complex. This avoids manufacturing a feature for every action while leaving a clear extraction point if the product grows. Responsibility-based segments such as `api`, `model`, and `ui` remain where they communicate real ownership, while small shared modules are flat files such as `shared/ui/Button.tsx` and `shared/api/client.ts`.

## Authentication and ownership

Authentication uses Django’s server-side session cookie. Unsafe requests include a CSRF token, and private API responses are marked `private, no-store`.

Private note routes have two request-time gates before React renders them. Next Proxy immediately rejects requests that have no session cookie, while each page validates any presented cookie against Django before emitting private UI. Login and signup pages perform the inverse Django-backed check. Client-side session handling remains responsible for transitions caused by expiry while an already-rendered notes screen is open; it is not the primary route guard.

Every note query begins with the authenticated owner. Foreign note identifiers therefore resolve as not found rather than being fetched and checked later.

Random Thoughts, School, Personal, and Drama are fixed `TextChoices` values on `Note`. Their display metadata lives only in the frontend catalog; the categories endpoint returns category keys with owner-scoped counts, and note responses return a category key. Invalid ownership states are structurally impossible because categories are values rather than per-user records.

Account creation follows the normal accounts service and needs no cross-feature onboarding. DRF serializers validate request data. Focused note services own creation idempotency and revision-checked autosave, the two write paths with cross-request consistency rules.

## Notes, pagination, and autosave

Creating a note persists a blank record before navigation. The browser disables the create button while the request is in flight and sends a UUID idempotency key that is retained across a manual retry. A durable creation receipt and database uniqueness constraint make concurrent or lost-response retries resolve to the original response even after the note was edited or deleted; reusing the key with different creation input returns a conflict.

Lists are ordered by last edit time and ID and use an opaque cursor containing both values. The UI presents this as **Load more**. Composite keyset traversal keeps response size bounded and avoids offset drift when notes are inserted or removed between pages, including when edit timestamps tie. A note edited across the active cursor can move into the newer result window, so refreshing starts a new traversal of the latest ordering.

Each note has a monotonic revision. The editor sends the last acknowledged revision with a patch; Django updates only that exact revision and returns `409 Conflict` when another write won. Matching current values do not weaken that rule because they cannot prove which writer produced the state. The browser performs one save at a time, coalesces edits made during an in-flight request, and shows saving, saved, error, or conflict state honestly.

For interrupted saves, the current note draft is written to origin-scoped `localStorage`. Keys include the authenticated owner and note ID, values are validated before recovery, and entries expire after seven days. Drafts are removed after acknowledgement and all app-owned draft keys are removed on every signed-out transition, including explicit logout and session expiry. This is a conscious recovery/privacy tradeoff: note text exists on the local browser while it is unsaved, but it is not allowed to cross authenticated sessions.

## API contract

Django generates `apps/api/openapi.yaml`. `openapi-typescript` generates the committed declarations in `apps/web/src/shared/api/generated/schema.ts`; CI checks both artifacts for drift. Small handwritten adapters use those generated types to convert transport names into frontend domain objects. The frontend category catalog owns its domain union and includes a compile-time equality assertion against the generated API enum, preserving the boundary without losing contract-drift detection.

All write serializers reject undeclared fields at runtime. List filters and cursor parameters are validated just as strictly, so typos and malformed cursors return typed `400` responses instead of silently changing query behavior. OpenAPI models the required PATCH revision/body, strict JSON negotiation, and request constraints.

## Operations

`/health/live/` checks only that the process can respond. `/health/ready/` performs a lightweight `SELECT 1`; both probes accept safe methods only and cannot be cached. Compose gates API startup on a successful migration job, while production migrations remain a separate release step. Unexpected API failures return a generic safe body, oversized JSON returns a typed `413`, and malformed API routes retain the JSON error contract. A real production deployment would add a scrubbed error tracker such as Sentry.

Database checks preserve the fixed category catalog, the content bound, and creation-receipt uniqueness even when writes bypass the HTTP serializers. Interactive API docs are enabled for local development with version-pinned assets and disabled under production settings.

The container defaults to one synchronous Gunicorn worker and is intended to scale horizontally. `GUNICORN_CMD_ARGS` is the deployment override for worker count/class and timeout policy; size it from measured CPU, memory, and request latency rather than silently relying on Gunicorn defaults. Run migrations as a separate release step before making new instances ready.

## Quality strategy

- Django API tests cover authentication, CSRF, owner isolation, category counts, validation, pagination, and revision conflicts.
- React tests cover API adaptation, category controls, creation, query pagination, navigation, and autosave recovery.
- Centralized unit tests are intentionally white-box and may import route or slice internals; production modules use slice public APIs and relative route-private imports.
- Playwright runs responsive and accessibility journeys at 320px, 390px, 600px (`sm`), 768px (`md`), 1024px (`lg`), and the 1280px desktop reference viewport.
- A separate focused Playwright journey exercises successful persistence through Next.js, Django sessions/CSRF, and PostgreSQL.
- CI also checks formatting, linting, types, migrations, generated contracts, coverage, and production builds.

A custom JSON body parser and application-managed database pools are not part of the product architecture. Framework/server/platform defaults remain sufficient until measurements justify additional machinery.
