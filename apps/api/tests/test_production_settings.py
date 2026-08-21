import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STRONG_SECRET = "production-check-only-8d4f5c7b2a9e6d1f3c0b7a4e9d2f6c8b1a5e7d9c"


def production_environment(**overrides: str) -> dict[str, str]:
    environment = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings.production",
        "DJANGO_SECRET_KEY": STRONG_SECRET,
        "DJANGO_ALLOWED_HOSTS": "notes.example.test",
        "DATABASE_URL": "postgresql://turbo_ai:turbo_ai@127.0.0.1:5432/turbo_ai",
    }
    environment.update(overrides)
    return environment


def run_settings_probe(
    environment: dict[str, str], expression: str
) -> subprocess.CompletedProcess[str]:
    # The executable and expression are fixed test inputs, never user-controlled values.
    return subprocess.run(  # noqa: S603
        [
            sys.executable,
            "-c",
            f"from django.conf import settings; print({expression})",
        ],
        cwd=PROJECT_ROOT,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


def test_production_rejects_a_weak_secret_key():
    result = run_settings_probe(
        production_environment(DJANGO_SECRET_KEY="short"),
        "settings.SECRET_KEY",
    )

    assert result.returncode != 0
    assert "at least 50 characters and 5 unique characters" in result.stderr


def test_production_accepts_render_generated_hostname():
    environment = production_environment(
        RENDER_EXTERNAL_HOSTNAME="turbo-notes-api.onrender.com",
    )
    environment.pop("DJANGO_ALLOWED_HOSTS")

    result = run_settings_probe(
        environment,
        "(settings.ALLOWED_HOSTS, settings.CSRF_TRUSTED_ORIGINS)",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == (
        "(['turbo-notes-api.onrender.com'], ['https://turbo-notes-api.onrender.com'])"
    )


def test_production_rejects_a_wildcard_allowed_host():
    result = run_settings_probe(
        production_environment(DJANGO_ALLOWED_HOSTS="*"),
        "settings.ALLOWED_HOSTS",
    )

    assert result.returncode != 0
    assert "cannot contain '*'" in result.stderr


def test_production_rejects_a_non_postgresql_database_url():
    result = run_settings_probe(
        production_environment(DATABASE_URL="sqlite://:memory:"),
        "settings.DATABASES['default']['ENGINE']",
    )

    assert result.returncode != 0
    assert "DATABASE_URL must use PostgreSQL in production" in result.stderr


def test_production_accepts_the_postgresql_database_backend():
    result = run_settings_probe(
        production_environment(),
        "settings.DATABASES['default']['ENGINE']",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "django.db.backends.postgresql"


def test_production_cookie_policy_is_secure_and_session_cookie_is_http_only():
    result = run_settings_probe(
        production_environment(),
        "(settings.SESSION_COOKIE_SECURE, settings.SESSION_COOKIE_HTTPONLY, "
        "settings.SESSION_COOKIE_SAMESITE, settings.CSRF_COOKIE_SECURE, "
        "settings.CSRF_COOKIE_HTTPONLY, settings.CSRF_COOKIE_SAMESITE)",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "(True, True, 'Lax', True, False, 'Lax')"


def test_production_proxy_trust_is_explicit_and_interactive_docs_stay_disabled():
    result = run_settings_probe(
        production_environment(
            DJANGO_TRUST_X_FORWARDED_PROTO="true",
            DJANGO_API_DOCS_ENABLED="true",
        ),
        "(settings.SECURE_PROXY_SSL_HEADER, settings.API_DOCS_ENABLED)",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "(('HTTP_X_FORWARDED_PROTO', 'https'), False)"
