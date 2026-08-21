#!/usr/bin/env python
import os
import sys
from pathlib import Path


def main() -> None:
    source_directory = Path(__file__).resolve().parent / "src"
    sys.path.insert(0, str(source_directory))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
