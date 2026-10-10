#!/usr/bin/env python3
"""Record exact Gaia DR3 NSS table membership for a focused source catalog."""

import csv
import hashlib
import io
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


TAP_SYNC_ENDPOINT = "https://gea.esac.esa.int/tap-server/tap/sync"
NSS_TABLES = (
    "gaiadr3.nss_acceleration_astro",
    "gaiadr3.nss_non_linear_spectro",
    "gaiadr3.nss_two_body_orbit",
    "gaiadr3.nss_vim_fl",
)


def main(catalog_path: Path, output_path: Path) -> None:
    catalog_bytes = catalog_path.read_bytes()
    source_ids = read_source_ids(catalog_bytes)
    source_id_clause = ", ".join(f"'{source_id}'" for source_id in source_ids)
    memberships: defaultdict[str, list[str]] = defaultdict(list)
    queries = []

    for table in NSS_TABLES:
        query = f"SELECT source_id FROM {table} WHERE source_id IN ({source_id_clause})"
        response = run_query(query)
        queries.append({"table": table, "adql": query, "returned_rows": len(response)})
        for source_id in response:
            if source_id not in source_ids:
                raise RuntimeError(f"{table} returned source ID {source_id}, which is absent from the input catalog.")
            memberships[source_id].append(table)

    records = [
        {
            "gaia_dr3_source_id": source_id,
            "tables": list(dict.fromkeys(memberships[source_id])),
        }
        for source_id in sorted(memberships, key=int)
    ]
    output = {
        "purpose": "Gaia DR3 non-single-star table membership for focused catalog sources.",
        "catalog": "Gaia DR3",
        "tap_endpoint": TAP_SYNC_ENDPOINT,
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source_input": {
            "path": str(catalog_path),
            "sha256": hashlib.sha256(catalog_bytes).hexdigest(),
            "source_id_count": len(source_ids),
            "selection": "Every exact source_id from the input focused catalog was queried.",
        },
        "request": {
            "method": "POST",
            "parameters": {
                "REQUEST": "doQuery",
                "LANG": "ADQL",
                "FORMAT": "csv",
            },
            "queries": queries,
        },
        "selection": "Exact source_id membership in the queried Gaia DR3 NSS tables for the focused catalog audit.",
        "records": records,
    }
    output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")


def read_source_ids(catalog_bytes: bytes) -> list[str]:
    rows = csv.DictReader(io.StringIO(catalog_bytes.decode("utf-8-sig")))
    if not rows.fieldnames or "source_id" not in rows.fieldnames:
        raise RuntimeError("The focused catalog must contain a source_id column.")
    source_ids = [row["source_id"].strip() for row in rows if row["source_id"] and row["source_id"].strip()]
    if not source_ids:
        raise RuntimeError("The focused catalog contains no source IDs.")
    if len(source_ids) != len(set(source_ids)):
        raise RuntimeError("The focused catalog contains duplicate source IDs.")
    return source_ids


def run_query(query: str) -> list[str]:
    request = urlencode({
        "REQUEST": "doQuery",
        "LANG": "ADQL",
        "FORMAT": "csv",
        "QUERY": query,
    }).encode()
    with urlopen(TAP_SYNC_ENDPOINT, data=request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"Gaia TAP returned HTTP {response.status}.")
        rows = csv.DictReader(io.StringIO(response.read().decode("utf-8-sig")))
    if not rows.fieldnames or "source_id" not in rows.fieldnames:
        raise RuntimeError("Gaia TAP did not return a source_id CSV column.")
    return [row["source_id"].strip() for row in rows if row["source_id"] and row["source_id"].strip()]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(f"Usage: {Path(sys.argv[0]).name} FOCUSED_CATALOG_CSV OUTPUT_JSON")
    main(*(Path(argument) for argument in sys.argv[1:]))
