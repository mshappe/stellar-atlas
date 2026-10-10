#!/usr/bin/env python3
"""Configure a new local checkout without committing machine-specific secrets."""

import argparse
import getpass
import os
import secrets
import subprocess
import sys
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PUBLIC_ORIGIN = "http://localhost:5173"
DEFAULT_PORT = "3000"


def required_prompt(label: str, default: str | None = None, secret: bool = False) -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        value = (getpass.getpass if secret else input)(f"{label}{suffix}: ").strip()
        if "\n" in value or "\r" in value:
            print(f"{label} must be a single line.", file=sys.stderr)
            continue
        if value:
            return value
        if default:
            return default
        print(f"{label} is required.", file=sys.stderr)


def write_environment(path: Path, source_index_path: Path) -> None:
    if path.exists():
        raise RuntimeError(f"{path} already exists; refusing to overwrite local configuration.")

    public_origin = required_prompt("Public origin", DEFAULT_PUBLIC_ORIGIN).rstrip("/")
    try:
        if not public_origin.startswith(("http://", "https://")):
            raise ValueError
        from urllib.parse import urlparse
        if not urlparse(public_origin).netloc:
            raise ValueError
    except ValueError:
        raise RuntimeError("Public origin must be an absolute HTTP or HTTPS URL.") from None

    github_client_id = required_prompt("GitHub OAuth client ID")
    github_client_secret = required_prompt("GitHub OAuth client secret", secret=True)
    maintainer_logins = required_prompt("Comma-separated maintainer GitHub login(s)")
    content = "\n".join((
        f"PORT={DEFAULT_PORT}",
        f"PUBLIC_ORIGIN={public_origin}",
        f"SESSION_SIGNING_SECRET={secrets.token_urlsafe(48)}",
        f"OAUTH_STATE_SECRET={secrets.token_urlsafe(48)}",
        f"GITHUB_CLIENT_ID={github_client_id}",
        f"GITHUB_CLIENT_SECRET={github_client_secret}",
        f"MAINTAINER_GITHUB_LOGINS={maintainer_logins}",
        "LABEL_DATABASE_PATH=data/labels.sqlite",
        f"SOURCE_INDEX_PATH={source_index_path}",
        "",
    ))
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
        destination.write(content)


def run(command: list[str]) -> None:
    subprocess.run(command, cwd=REPOSITORY_ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--env-file",
        type=Path,
        default=REPOSITORY_ROOT / ".env",
        help="Local environment file to create (default: repository .env).",
    )
    parser.add_argument(
        "--skip-npm-ci",
        action="store_true",
        help="Do not install the package-lock.json dependency set.",
    )
    parser.add_argument(
        "--source-index-path",
        type=Path,
        default=Path("data/label-source-index.sqlite"),
        help="Source-index SQLite artifact to build (default: data/label-source-index.sqlite).",
    )
    args = parser.parse_args()
    environment_path = args.env_file.resolve()
    source_index_path = args.source_index_path

    write_environment(environment_path, source_index_path)
    try:
        if not args.skip_npm_ci:
            run(["npm", "ci"])
        run([
            sys.executable,
            "scripts/build_label_source_index.py",
            "--output",
            str(source_index_path),
        ])
    except BaseException:
        environment_path.unlink(missing_ok=True)
        raise

    print(f"Created {environment_path} and {source_index_path}.")
    print("Start the local atlas with: npm run dev")


if __name__ == "__main__":
    main()
