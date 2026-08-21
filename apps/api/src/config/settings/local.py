from pathlib import Path

import environ

LOCAL_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
environ.Env.read_env(LOCAL_ENV_FILE, overwrite=False)

from .base import *  # noqa: E402

DEBUG = env.bool("DJANGO_DEBUG", default=True)
SECRET_KEY = env("DJANGO_SECRET_KEY", default="unsafe-development-key")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("DJANGO_CSRF_TRUSTED_ORIGINS", default=["http://localhost:3000"])
API_DOCS_ENABLED = env.bool("DJANGO_API_DOCS_ENABLED", default=True)
