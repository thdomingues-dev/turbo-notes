# Turbo Notes

Full-stack notes app with authentication, categories, filtering, and autosave.

**Live demo:** [turbo-notes-web.onrender.com](https://turbo-notes-web.onrender.com/)

> The demo uses Render's free tier and may take about a minute to start after inactivity.

![Turbo Notes](docs/evidence/web-notes-1280x832.png)

## Features

- Account signup, login, and logout
- Four note categories with counts and filtering
- Conflict-safe autosave and local draft recovery
- Cursor pagination and responsive layouts

## Stack

- `apps/api`: Django 5.2, Django REST Framework, and PostgreSQL
- `apps/web`: Next.js 16, React 19, and TanStack Query

## Process

Development followed four steps: define the core notes workflow and API contract; build authenticated, owner-scoped Django endpoints; connect the responsive Next.js interface with autosave and draft recovery; then validate the complete flow with backend, frontend, responsive, and full-stack tests before deploying to Render.

## Key design and technical decisions

- Next.js proxies `/api/v1` to Django so authentication uses same-origin `HttpOnly` session cookies and CSRF protection. Server-side guards redirect guests to login and keep signed-in users out of authentication pages.
- Owner-scoped queries, idempotent creation, and revision checks prevent data leaks, duplicate notes, and stale overwrites.
- The committed OpenAPI schema generates TypeScript types for the frontend API layer.
- Opaque cursor pagination keeps list responses bounded; browser-local drafts recover interrupted edits.
- UX additions beyond the initial scope include confirmed note deletion and explicit loading, empty, error, save, and delete states.
- TanStack Query caches server data, limits retries, and invalidates affected note lists and details after mutations.

More detail is available in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run locally

Requires Docker, Python 3.13, `uv`, Node.js 24, pnpm 10.34, and Make.

```bash
cp apps/api/.env.example apps/api/.env
make bootstrap
make dev-db
make api-migrate
make api-dev
```

In another terminal:

```bash
make web-dev
```

Open [localhost:3000](http://localhost:3000).

## Verify

```bash
make ci
```

Use `make check` for fast checks, `make test` for tests, and `make schema` after an API contract change.

## Deploy

Create a Render Blueprint from this repository and apply `render.yaml`. It provisions the web app, API, and PostgreSQL database.

## AI usage

OpenAI Codex assisted with architecture exploration, backend and frontend implementation, test development, and accessibility and security reviews. Its output was reviewed by the maintainer and validated through code inspection, automated tests, and the running application.
