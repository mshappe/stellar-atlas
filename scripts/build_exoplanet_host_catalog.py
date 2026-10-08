#!/usr/bin/env python3
"""Join a Gaia volume CSV to NASA confirmed exoplanet host records by Gaia DR3 ID."""

import csv
import math
import sys
from collections import defaultdict
from pathlib import Path


GAIA_PREFIX = "Gaia DR3 "
GAIA_COLUMNS = (
    "source_id",
    "ra",
    "dec",
    "parallax",
    "parallax_error",
    "phot_g_mean_mag",
    "bp_rp",
)
OUTPUT_COLUMNS = (
    *GAIA_COLUMNS,
    "source_category",
    "host_names",
    "planet_count",
    "planet_names",
    "discovery_methods",
    "evidence",
    "known_system_diameter_au",
    "known_system_diameter_light_seconds",
)
AU_LIGHT_SECONDS = 499.0047838361564
NAMED_REFERENCE_STARS = {
    "4429785739602747392": {
        "evidence": "Named reference star: Unukalhai / Alpha Serpentis; Gaia DR2-to-DR3 crossmatch recorded in prominent-star-labels.provenance.json",
    },
}


def nonempty(values):
    return sorted({value.strip() for value in values if value and value.strip()})


def finite_float(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def known_system_diameter(planets):
    apastra = []
    for planet in planets:
        semi_major_axis = finite_float(planet["pl_orbsmax"])
        eccentricity = finite_float(planet["pl_orbeccen"])
        if semi_major_axis is None or eccentricity is None:
            continue
        if semi_major_axis <= 0 or not 0 <= eccentricity < 1:
            continue
        apastra.append(semi_major_axis * (1 + eccentricity))
    if not apastra:
        return "", ""
    diameter_au = 2 * max(apastra)
    return f"{diameter_au:.12g}", f"{diameter_au * AU_LIGHT_SECONDS:.12g}"


def main(gaia_path: Path, planets_path: Path, output_path: Path) -> None:
    hosts_by_source = defaultdict(list)
    with planets_path.open(newline="", encoding="utf-8") as source:
        for planet in csv.DictReader(source):
            gaia_id = planet["gaia_dr3_id"].removeprefix(GAIA_PREFIX).strip()
            if gaia_id:
                hosts_by_source[gaia_id].append(planet)

    rows = []
    with gaia_path.open(newline="", encoding="utf-8") as source:
        for gaia in csv.DictReader(source):
            planets = hosts_by_source.get(gaia["source_id"])
            reference = NAMED_REFERENCE_STARS.get(gaia["source_id"])
            if not planets and not reference:
                continue
            if not planets:
                rows.append({
                    **{column: gaia[column] for column in GAIA_COLUMNS},
                    "source_category": "Named reference star",
                    "host_names": "",
                    "planet_count": "",
                    "planet_names": "",
                    "discovery_methods": "",
                    "evidence": reference["evidence"],
                    "known_system_diameter_au": "",
                    "known_system_diameter_light_seconds": "",
                })
                continue
            diameter_au, diameter_light_seconds = known_system_diameter(planets)
            rows.append({
                **{column: gaia[column] for column in GAIA_COLUMNS},
                "source_category": "Confirmed exoplanet host",
                "host_names": "; ".join(nonempty(planet["hostname"] for planet in planets)),
                "planet_count": str(len(nonempty(planet["pl_name"] for planet in planets))),
                "planet_names": "; ".join(nonempty(planet["pl_name"] for planet in planets)),
                "discovery_methods": "; ".join(nonempty(planet["discoverymethod"] for planet in planets)),
                "evidence": "NASA Exoplanet Archive confirmed planets (PSCompPars)",
                "known_system_diameter_au": diameter_au,
                "known_system_diameter_light_seconds": diameter_light_seconds,
            })

    rows.sort(key=lambda row: int(row["source_id"]))
    with output_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {len(rows)} focused Gaia DR3 stars to {output_path}.")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit(f"Usage: {Path(sys.argv[0]).name} GAIA_CSV PLANETS_CSV OUTPUT_CSV")
    main(*(Path(argument) for argument in sys.argv[1:]))
