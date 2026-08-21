SHELL := /bin/sh
.DEFAULT_GOAL := help

API_DIR := apps/api
WEB_DIR := apps/web
COMPOSE := docker compose -f $(API_DIR)/compose.yaml
DEFAULT_DATABASE_URL := postgresql://turbo_ai:turbo_ai@127.0.0.1:5432/turbo_ai
CHECK_DATABASE_URL ?= $(if $(DATABASE_URL),$(DATABASE_URL),$(DEFAULT_DATABASE_URL))
PRODUCTION_CHECK_ENV := \
	DATABASE_URL='$(CHECK_DATABASE_URL)' \
	DJANGO_SETTINGS_MODULE=config.settings.production \
	DJANGO_SECRET_KEY=deployment-check-only-8d4f5c7b2a9e6d1f3c0b7a4e9d2f6c8b1a5e7d9c \
	DJANGO_ALLOWED_HOSTS=notes.example.test \
	DJANGO_CSRF_TRUSTED_ORIGINS=https://notes.example.test

.PHONY: help bootstrap api-bootstrap web-bootstrap dev-db api-migrate api-dev web-dev \
	api-test web-test web-e2e fullstack-test test api-static-check api-schema-check \
	compose-check api-production-check api-check schema schema-check web-check check ci

help:
	@echo "Turbo Notes developer commands:"
	@echo "  make bootstrap     Install backend and frontend dependencies"
	@echo "  make dev-db        Start the local PostgreSQL container"
	@echo "  make api-migrate   Apply Django migrations"
	@echo "  make api-dev       Start the Django development server"
	@echo "  make web-dev       Start the Next.js development server"
	@echo "  make api-test      Run backend tests with coverage"
	@echo "  make test          Run backend and frontend test suites"
	@echo "  make web-e2e       Run responsive and accessibility browser tests"
	@echo "  make fullstack-test  Run the real browser, API, and PostgreSQL journey"
	@echo "  make schema        Regenerate OpenAPI and TypeScript declarations"
	@echo "  make schema-check  Detect backend or frontend schema drift"
	@echo "  make api-check     Run the complete backend verification suite"
	@echo "  make web-check     Run the complete frontend verification suite"
	@echo "  make check         Run static, unit, and build checks"
	@echo "  make ci            Reproduce the complete CI verification locally"

bootstrap: api-bootstrap web-bootstrap

api-bootstrap:
	cd $(API_DIR) && uv sync --all-groups --frozen

web-bootstrap:
	cd $(WEB_DIR) && pnpm install --frozen-lockfile

dev-db:
	$(COMPOSE) up -d db

api-migrate:
	cd $(API_DIR) && uv run python manage.py migrate --noinput

api-dev:
	cd $(API_DIR) && uv run python manage.py runserver

web-dev:
	cd $(WEB_DIR) && pnpm dev

api-test:
	cd $(API_DIR) && uv run pytest --cov --cov-report=term-missing --cov-fail-under=85

web-test:
	cd $(WEB_DIR) && pnpm test:coverage

web-e2e:
	cd $(WEB_DIR) && pnpm test:e2e

fullstack-test:
	cd $(WEB_DIR) && pnpm test:fullstack

test:
	@$(MAKE) api-test
	@$(MAKE) web-test

api-static-check:
	cd $(API_DIR) && uv run ruff check .
	cd $(API_DIR) && uv run ruff format --check .
	cd $(API_DIR) && uv run python manage.py makemigrations --check --dry-run

api-schema-check:
	@schema_file=$$(mktemp "$${TMPDIR:-/tmp}/turbo-ai-openapi.XXXXXX"); \
	trap 'rm -f "$$schema_file"' EXIT HUP INT TERM; \
	cd $(API_DIR) && \
	uv run python manage.py spectacular --validate --file "$$schema_file" && \
	if ! cmp -s openapi.yaml "$$schema_file"; then \
		diff -u openapi.yaml "$$schema_file" || true; \
		echo "apps/api/openapi.yaml is out of date; run 'make schema'." >&2; \
		exit 1; \
	fi

compose-check:
	$(COMPOSE) config --quiet

api-production-check:
	cd $(API_DIR) && $(PRODUCTION_CHECK_ENV) uv run python manage.py check --deploy --fail-level WARNING
	cd $(API_DIR) && $(PRODUCTION_CHECK_ENV) uv run python manage.py migrate --check

api-check: compose-check api-static-check api-schema-check api-test api-production-check

schema:
	cd $(API_DIR) && uv run python manage.py spectacular --validate --file openapi.yaml
	cd $(WEB_DIR) && pnpm generate:api

schema-check: api-schema-check
	cd $(WEB_DIR) && pnpm check:api

web-check:
	cd $(WEB_DIR) && pnpm check

check:
	@$(MAKE) api-check
	@$(MAKE) web-check

ci: check web-e2e fullstack-test
