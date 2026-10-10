#!/usr/bin/env python3
"""Build exact TRAPPIST-1-centered Gaia and confirmed-host catalog CSVs."""

import argparse
import csv
import json
import math
from collections import defaultdict
from pathlib import Path


GAIA_PREFIX = "Gaia DR3 "
TRAPPIST_SOURCE_ID = "2635476908753563008"
LIGHT_YEARS_PER_PARSEC = 3.2615637771674333
RADIUS_LIGHT_YEARS = 150
RADIUS_PARSECS = RADIUS_LIGHT_YEARS / LIGHT_YEARS_PER_PARSEC
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


def finite_float(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def position_parsecs(row):
    ra = finite_float(row["ra"])
    dec = finite_float(row["dec"])
    parallax = finite_float(row["parallax"])
    if ra is None or dec is None or parallax is None or parallax <= 0:
        return None
    distance = 1000 / parallax
    right_ascension = math.radians(ra)
    declination = math.radians(dec)
    return (
        distance * math.cos(declination) * math.cos(right_ascension),
        distance * math.cos(declination) * math.sin(right_ascension),
        distance * math.sin(declination),
    )


def in_volume(position, center, radius_parsecs):
    return math.dist(position, center) <= radius_parsecs


def nonempty(values):
    return sorted({value.strip() for value in values if value and value.strip()})


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


def focused_row(gaia, planets):
    reference = NAMED_REFERENCE_STARS.get(gaia["source_id"])
    if not planets and not reference:
        return None
    if not planets:
        return {
            **{column: gaia[column] for column in GAIA_COLUMNS},
            "source_category": "Named reference star",
            "host_names": "",
            "planet_count": "",
            "planet_names": "",
            "discovery_methods": "",
            "evidence": reference["evidence"],
            "known_system_diameter_au": "",
            "known_system_diameter_light_seconds": "",
        }

    diameter_au, diameter_light_seconds = known_system_diameter(planets)
    return {
        **{column: gaia[column] for column in GAIA_COLUMNS},
        "source_category": "Confirmed exoplanet host",
        "host_names": "; ".join(nonempty(planet["hostname"] for planet in planets)),
        "planet_count": str(len(nonempty(planet["pl_name"] for planet in planets))),
        "planet_names": "; ".join(nonempty(planet["pl_name"] for planet in planets)),
        "discovery_methods": "; ".join(nonempty(planet["discoverymethod"] for planet in planets)),
        "evidence": "NASA Exoplanet Archive confirmed planets (PSCompPars)",
        "known_system_diameter_au": diameter_au,
        "known_system_diameter_light_seconds": diameter_light_seconds,
    }


def main(gaia_path, planets_path, all_output_path, focused_output_path, radius_light_years):
    radius_parsecs = radius_light_years / LIGHT_YEARS_PER_PARSEC
    hosts_by_source = defaultdict(list)
    with planets_path.open(newline="", encoding="utf-8") as source:
        for planet in csv.DictReader(source):
            gaia_id = planet["gaia_dr3_id"].removeprefix(GAIA_PREFIX).strip()
            if gaia_id:
                hosts_by_source[gaia_id].append(planet)

    center = None
    with gaia_path.open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            if row["source_id"] == TRAPPIST_SOURCE_ID:
                center = position_parsecs(row)
                break
    if center is None:
        raise SystemExit(f"TRAPPIST-1 Gaia DR3 source {TRAPPIST_SOURCE_ID} is absent or invalid.")

    focused_rows = []
    input_row_count = 0
    output_row_count = 0
    with (
        gaia_path.open(newline="", encoding="utf-8") as source,
        all_output_path.open("w", newline="", encoding="utf-8") as all_destination,
    ):
        reader = csv.DictReader(source)
        writer = csv.DictWriter(all_destination, fieldnames=GAIA_COLUMNS)
        writer.writeheader()
        for row in reader:
            input_row_count += 1
            position = position_parsecs(row)
            if position is None or not in_volume(position, center, radius_parsecs):
                continue
            output_row_count += 1
            writer.writerow({column: row[column] for column in GAIA_COLUMNS})
            row_for_focus = focused_row(row, hosts_by_source.get(row["source_id"]))
            if row_for_focus:
                focused_rows.append(row_for_focus)

    focused_rows.sort(key=lambda row: int(row["source_id"]))
    with focused_output_path.open("w", newline="", encoding="utf-8") as destination:
        writer = csv.DictWriter(destination, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(focused_rows)

    host_count = sum(row["source_category"] == "Confirmed exoplanet host" for row in focused_rows)
    reference_count = len(focused_rows) - host_count
    print(json.dumps({
        "broad_gaia_input_rows": input_row_count,
        "trappist_source_id": TRAPPIST_SOURCE_ID,
        "trappist_position_parsecs": center,
        "radius_parsecs": radius_parsecs,
        "all_catalog_rows": output_row_count,
        "focused_catalog_rows": len(focused_rows),
        "confirmed_exoplanet_hosts": host_count,
        "named_reference_stars": reference_count,
        "nasa_planet_rows": sum(len(planets) for planets in hosts_by_source.values()),
        "nasa_distinct_host_ids": len(hosts_by_source),
    }, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--radius-light-years",
        type=float,
        default=RADIUS_LIGHT_YEARS,
    )
    parser.add_argument("gaia_path", type=Path)
    parser.add_argument("planets_path", type=Path)
    parser.add_argument("all_output_path", type=Path)
    parser.add_argument("focused_output_path", type=Path)
    args = parser.parse_args()
    if not math.isfinite(args.radius_light_years) or args.radius_light_years <= 0:
        parser.error("--radius-light-years must be a positive finite number.")
    main(
        args.gaia_path,
        args.planets_path,
        args.all_output_path,
        args.focused_output_path,
        args.radius_light_years,
    )
