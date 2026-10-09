#!/usr/bin/env python3
"""Derive a smaller exact TRAPPIST-1-centered catalog from a larger one."""

import csv
import json
import sys
from pathlib import Path

from build_trappist_centered_catalogs import (
    RADIUS_LIGHT_YEARS,
    RADIUS_PARSECS,
    TRAPPIST_SOURCE_ID,
    in_volume,
    position_parsecs,
)


def read_rows(path):
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise SystemExit(f"{path} has no header.")
        return reader.fieldnames, list(reader)


def write_rows(path, fieldnames, rows):
    with path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main(all_input_path, focused_input_path, all_output_path, focused_output_path):
    all_fieldnames, all_rows = read_rows(all_input_path)
    center_row = next((row for row in all_rows if row["source_id"] == TRAPPIST_SOURCE_ID), None)
    center = position_parsecs(center_row) if center_row else None
    if center is None:
        raise SystemExit(f"TRAPPIST-1 Gaia DR3 source {TRAPPIST_SOURCE_ID} is absent or invalid.")

    filtered_all_rows = [
        row for row in all_rows
        if (position := position_parsecs(row)) is not None and in_volume(position, center)
    ]
    source_ids = {row["source_id"] for row in filtered_all_rows}
    focused_fieldnames, focused_rows = read_rows(focused_input_path)
    filtered_focused_rows = [row for row in focused_rows if row["source_id"] in source_ids]

    write_rows(all_output_path, all_fieldnames, filtered_all_rows)
    write_rows(focused_output_path, focused_fieldnames, filtered_focused_rows)
    print(json.dumps({
        "trappist_source_id": TRAPPIST_SOURCE_ID,
        "radius_light_years": RADIUS_LIGHT_YEARS,
        "radius_parsecs": RADIUS_PARSECS,
        "all_catalog_rows": len(filtered_all_rows),
        "focused_catalog_rows": len(filtered_focused_rows),
    }, indent=2))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(
            f"Usage: {Path(sys.argv[0]).name} ALL_INPUT_CSV FOCUSED_INPUT_CSV ALL_OUTPUT_CSV FOCUSED_OUTPUT_CSV"
        )
    main(*(Path(argument) for argument in sys.argv[1:]))
