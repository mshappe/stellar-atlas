#!/usr/bin/env python3
"""Attach Gaia DR3 kinematics and quality evidence to a focused catalog."""

import csv
import json
import sys
from pathlib import Path


KINEMATIC_COLUMNS = (
    "astrometric_params_solved",
    "ra_error",
    "dec_error",
    "pmra",
    "pmra_error",
    "pmdec",
    "pmdec_error",
    "radial_velocity",
    "radial_velocity_error",
    "radial_velocity_source",
    "radial_velocity_quality",
    "radial_velocity_bibliography_code",
    "ruwe",
    "duplicated_source",
    "nss_tables",
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

SUPPLEMENT_PATH = Path(__file__).parent.parent / "public" / "focused-radial-velocity-supplements.provenance.json"
NSS_MEMBERSHIP_PATH = Path(__file__).parent.parent / "public" / "focused-nss-membership.provenance.json"


def main(catalog_path: Path, kinematics_path: Path, output_path: Path) -> None:
    supplements = {
        record["gaia_dr3_source_id"]: {
            "radial_velocity": str(record["radial_velocity_km_s"]),
            "radial_velocity_error": str(record["radial_velocity_error_km_s"]),
            "radial_velocity_source": "SIMBAD",
            "radial_velocity_quality": record["quality"],
            "radial_velocity_bibliography_code": record["bibliography_code"],
        }
        for record in json.loads(SUPPLEMENT_PATH.read_text(encoding="utf-8"))["records"]
    }
    nss_membership = {
        record["gaia_dr3_source_id"]: "; ".join(record["tables"])
        for record in json.loads(NSS_MEMBERSHIP_PATH.read_text(encoding="utf-8"))["records"]
    }
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

    fieldnames = [
        *(fieldname for fieldname in reader.fieldnames if fieldname not in KINEMATIC_COLUMNS),
        *KINEMATIC_COLUMNS,
    ]
    with output_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                **{fieldname: row[fieldname] for fieldname in fieldnames if fieldname not in KINEMATIC_COLUMNS},
                **{
                    column: (
                        supplements.get(row["source_id"], {}).get(column)
                        or (
                            "Gaia DR3"
                            if column == "radial_velocity_source"
                            and kinematics[row["source_id"]]["radial_velocity"]
                            and kinematics[row["source_id"]]["radial_velocity_error"]
                            else kinematics[row["source_id"]].get(column, "")
                        )
                        or (
                            nss_membership.get(row["source_id"], "")
                            if column == "nss_tables"
                            else ""
                        )
                    )
                    for column in KINEMATIC_COLUMNS
                },
            })


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(
            f"Usage: {Path(sys.argv[0]).name} FOCUSED_CATALOG_CSV GAIA_KINEMATICS_CSV OUTPUT_CSV"
        )
    main(*(Path(argument) for argument in sys.argv[1:]))
