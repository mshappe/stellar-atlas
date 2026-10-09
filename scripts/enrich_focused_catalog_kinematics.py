#!/usr/bin/env python3
"""Attach Gaia DR3 kinematics and quality evidence to a focused catalog."""

import csv
import sys
from pathlib import Path


KINEMATIC_COLUMNS = (
    "astrometric_params_solved",
    "pmra",
    "pmra_error",
    "pmdec",
    "pmdec_error",
    "radial_velocity",
    "radial_velocity_error",
    "ruwe",
    "duplicated_source",
    "ra_dec_corr",
    "ra_parallax_corr",
    "ra_pmra_corr",
    "ra_pmdec_corr",
    "dec_parallax_corr",
    "dec_pmra_corr",
    "dec_pmdec_corr",
    "parallax_pmra_corr",
    "parallax_pmdec_corr",
    "pmra_pmdec_corr",
)


def main(catalog_path: Path, kinematics_path: Path, output_path: Path) -> None:
    with kinematics_path.open(newline="", encoding="utf-8") as source:
        kinematics = {row["source_id"]: row for row in csv.DictReader(source)}

    with catalog_path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise SystemExit("The focused catalog has no header.")
        rows = list(reader)

    missing = [row["source_id"] for row in rows if row["source_id"] not in kinematics]
    if missing:
        raise SystemExit(f"Gaia kinematics are missing for {len(missing)} focused source IDs.")

    fieldnames = [*reader.fieldnames, *KINEMATIC_COLUMNS]
    with output_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                **row,
                **{column: kinematics[row["source_id"]][column] for column in KINEMATIC_COLUMNS},
            })


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(
            f"Usage: {Path(sys.argv[0]).name} FOCUSED_CATALOG_CSV GAIA_KINEMATICS_CSV OUTPUT_CSV"
        )
    main(*(Path(argument) for argument in sys.argv[1:]))
