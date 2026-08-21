# syntax=docker/dockerfile:1.7
FROM ghcr.io/astral-sh/uv:0.10.6 AS uv

FROM python:3.13-slim AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    GUNICORN_CMD_ARGS="--workers=1 --worker-class=sync --timeout=30 --graceful-timeout=30 --keep-alive=2 --access-logfile=-"

WORKDIR /app

COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY manage.py ./
COPY src ./src
RUN uv sync --frozen --no-dev && useradd --create-home --uid 10001 appuser

USER appuser
EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--chdir", "src", "--bind", "0.0.0.0:8000", "--error-logfile", "-"]
