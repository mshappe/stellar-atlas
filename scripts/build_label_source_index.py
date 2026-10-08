#!/usr/bin/env python3
"""Build a deterministic SQLite lookup index for permanent-label candidates."""

import argparse
import csv
import hashlib
import os
import sqlite3
import tempfile
from pathlib import Path


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_index(all_sources_path: Path, focused_sources_path: Path, output_path: Path) -> None:
    schema_path = Path(__file__).resolve().parent.parent / "server" / "source-index.sql"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=output_path.parent, suffix=".sqlite", delete=False) as temporary:
        temporary_path = Path(temporary.name)

    try:
        connection = sqlite3.connect(temporary_path)
        try:
            connection.executescript(schema_path.read_text(encoding="utf-8"))
            connection.execute("PRAGMA journal_mode = OFF")
            with all_sources_path.open(newline="", encoding="utf-8") as source:
                reader = csv.DictReader(source)
                rows = ((row["source_id"],) for row in reader)
                connection.executemany(
                    "INSERT INTO catalog_sources (gaia_source_id) VALUES (?)",
                    rows,
                )

            with focused_sources_path.open(newline="", encoding="utf-8") as source:
                reader = csv.DictReader(source)
                rows = (
                    (row["source_id"], row["host_names"].strip() or None)
                    for row in reader
                )
                connection.executemany(
                    """
                    INSERT INTO catalog_sources (gaia_source_id, host_names)
                    VALUES (?, ?)
                    ON CONFLICT(gaia_source_id) DO UPDATE
                    SET host_names = excluded.host_names
                    WHERE excluded.host_names IS NOT NULL
                    """,
                    rows,
                )

            metadata = {
                "all_sources_filename": all_sources_path.name,
                "all_sources_sha256": file_hash(all_sources_path),
                "focused_sources_filename": focused_sources_path.name,
                "focused_sources_sha256": file_hash(focused_sources_path),
                "catalog_source_count": str(
                    connection.execute("SELECT COUNT(*) FROM catalog_sources").fetchone()[0]
                ),
            }
            connection.executemany(
                "INSERT INTO source_index_metadata (key, value) VALUES (?, ?)",
                metadata.items(),
            )
            connection.commit()
        finally:
            connection.close()
        os.replace(temporary_path, output_path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all-sources",
        type=Path,
        default=Path("public/gaia-dr3-trappist-1-300ly.csv"),
    )
    parser.add_argument(
        "--focused-sources",
        type=Path,
        default=Path("public/gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/label-source-index.sqlite"),
    )
    args = parser.parse_args()
    build_index(args.all_sources, args.focused_sources, args.output)


if __name__ == "__main__":
    main()
