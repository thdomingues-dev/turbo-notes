import os
import subprocess
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
FILE_SECRET = "loaded-from-local-env-file"
PROCESS_SECRET = "process-environment-wins"
STRONG_SECRET = "production-check-only-8d4f5c7b2a9e6d1f3c0b7a4e9d2f6c8b1a5e7d9c"


def run_settings_script(
    script: str, environment: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603
        [sys.executable, "-c", script],
        cwd=PROJECT_ROOT,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )


@pytest.mark.parametrize("process_secret", [None, PROCESS_SECRET])
def test_local_settings_load_dotenv_before_base_without_overwriting_process_env(process_secret):
    environment = {**os.environ, "DJANGO_SETTINGS_MODULE": "config.settings.local"}
    environment.pop("DJANGO_SECRET_KEY", None)
    if process_secret is not None:
        environment["DJANGO_SECRET_KEY"] = process_secret

    script = f"""
import os
from pathlib import Path
from unittest.mock import patch

def load_local_env(env_file, *, overwrite):
    assert Path(env_file) == Path.cwd() / ".env"
    assert overwrite is False
    os.environ.setdefault("DJANGO_SECRET_KEY", {FILE_SECRET!r})

with patch("environ.Env.read_env", side_effect=load_local_env):
    from config.settings import local
    print(local.SECRET_KEY)
"""
    result = run_settings_script(script, environment)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == (process_secret or FILE_SECRET)


@pytest.mark.parametrize("settings_module", ["config.settings.test", "config.settings.production"])
def test_non_local_settings_never_load_dotenv(settings_module):
    environment = {
        **os.environ,
        "DATABASE_URL": "postgresql://turbo_ai:turbo_ai@127.0.0.1:5432/turbo_ai",
        "DJANGO_ALLOWED_HOSTS": "notes.example.test",
        "DJANGO_SECRET_KEY": STRONG_SECRET,
        "DJANGO_SETTINGS_MODULE": settings_module,
    }
    script = f"""
from unittest.mock import patch

with patch("environ.Env.read_env", side_effect=AssertionError("dotenv must remain local-only")):
    from importlib import import_module
    settings = import_module({settings_module!r})
    print(settings.DEBUG)
"""
    result = run_settings_script(script, environment)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "False"
