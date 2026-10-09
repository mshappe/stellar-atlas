# Stellar Atlas

An interactive browser viewer for Gaia DR3 astrometry. The bundled prototype is centered on TRAPPIST-1 and displays an exact 300-light-year TRAPPIST-1-centered volume. It does not synthesize stars, names, coordinates, distances, evidence, or ephemerides.

## Run

```sh
npm install
npm run dev
```

`npm run dev` starts the Vite UI and API service together. Vite proxies `/api` to the API service, so browser requests retain the configured public origin. Set the required local values in `.env` before using the API; generate independent high-entropy values for `SESSION_SIGNING_SECRET` and `OAUTH_STATE_SECRET`. For development, `PUBLIC_ORIGIN` must match Vite's displayed URL (normally `http://localhost:5173`) while `PORT` remains the API listener port (normally `3000`).

For production, build the Vue UI and serve it and the API from the same process:

```sh
npm run build
npm run start
```

Configure the GitHub OAuth application's callback URL as `${PUBLIC_ORIGIN}/api/auth/github/callback`. Production `PUBLIC_ORIGIN` must use HTTPS because session and OAuth-state cookies are `Secure`.

## Application architecture

The browser UI is a Vue 3 application. `src/App.vue` owns catalog loading, CSV validation, user-visible status, and the `useAtlasState` composable. The composable uses shallow reactive root state so the full Gaia catalog is retained as raw row data rather than recursively proxied.

`src/components/AtlasScene.vue` is the imperative Three.js boundary. It receives the raw active catalog, origin, label IDs, and route endpoints as props; it emits selection, focus, and route-pop intents. It owns WebGL/CSS2D renderer lifecycle, point geometry, labels, picking, the SVG route overlay, resizing, and resource disposal. Sidebar components render the declarative catalog controls, search, selection, route, and reference-frame panels. The astronomy calculations, radius filtering, catalog search, label behavior, and route arithmetic remain in the test-covered `src/catalog.ts` utility module.

Permanent labels are loaded and validated from the evidence records in [`public/prominent-star-labels.provenance.json`](public/prominent-star-labels.provenance.json), not embedded in application source. They are curated-only: the browser does not create, persist, or represent new permanent labels as evidence-backed data. Search-result labels remain temporary and visually distinct.

## Permanent-label source index

The self-hosted label service uses a generated SQLite index to verify every source before it can receive a dynamically persistent label. Build the deployment artifact from the bundled Gaia/NASA catalogs:

```sh
python3 scripts/build_label_source_index.py
```

This creates the untracked `data/label-source-index.sqlite` artifact. Its metadata records SHA-256 hashes of both input catalogs and the source count, making the deployed index reproducible. The index only offers a NASA Exoplanet Archive `host_names` identifier for NASA-enriched sources, or the exact `Gaia DR3 <source_id>` designation for all other bundled sources. It does not generate names or aliases from positions, photometry, or inference.

Run the project checks with:

```sh
npm run check
```

`npm run check` includes CodeQL CLI 2.27.2 with the same JavaScript/TypeScript bundle used in CI. On first use on Linux x64, it downloads the official bundle into `~/.cache/stellar-atlas/codeql`, verifies GitHub's published SHA-256 digest, and fails when CodeQL produces any alert.

## Bundled confirmed-exoplanet host prototype

`public/gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.csv` contains 1,000 Gaia DR3 stars: 999 are joined by `gaia_dr3_id` to at least one record in the NASA Exoplanet Archive's Planetary Systems Composite Parameters (`PSCompPars`) table, which contains confirmed planets and published default parameter sets; Unukalhai is one explicitly marked named reference star. The selected-source panel identifies each row's catalog category and reports host/planet details only where they are present.

Sol is an explicit, selectable star object—not a Gaia DR3 source row. Its position is an ICRS-barycentric J2016.0 state from JPL Horizons, recorded in [`public/atlas-reference-objects.provenance.json`](public/atlas-reference-objects.provenance.json). Gaia’s survey geometry does not observe the Sun, so the Sol panel deliberately has no Gaia source ID, parallax, or Gaia photometry. The initial selected origin is TRAPPIST-1 (Gaia DR3 `2635476908753563008`), which places it at displayed `(0, 0, 0)` pc; that displayed coordinate is derived from the active origin and is not TRAPPIST-1's stored position. The cyan wire sphere is the exact 300-light-year (91.98041813566518 pc) TRAPPIST-1-centered selection boundary. The exact Gaia/NASA source queries, retrieval timestamps, conversion, join method, row counts, and limitations are recorded in [`public/gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.provenance.json`](public/gaia-dr3-confirmed-exoplanet-hosts-trappist-1-300ly.provenance.json).

The Gaia retrieval uses the preliminary containment cutoff `parallax >= 9.574203430085845 mas`, then performs the final membership test in Cartesian ICRS coordinates: a source is included only when its reciprocal-parallax position is at most 91.98041813566518 pc from TRAPPIST-1. The preliminary cutoff is not the final selection rule. NASA's `sy_dist` likewise only bounds a broad containment retrieval; the exact Gaia Cartesian test decides final membership. This is not equivalent to an uncertainty-aware claim that every source is definitively within 300 ly.

No debris-belt-only systems are currently included. A belt catalogue must supply a citable detection and an unambiguous Gaia DR3 crossmatch before it is added; candidate classifications and positional guesses are excluded.

## Point color and size

When present, point color is a visual interpolation of Gaia DR3's measured `bp_rp` color index (BP−RP). It is not a spectral-type assignment. Point size is derived from the star's extinction-unadjusted absolute Gaia G magnitude, calculated from `phot_g_mean_mag` and the geometric reciprocal-parallax distance. It is a G-band flux/luminosity proxy for visualization, not a physical stellar-radius measurement. Sources lacking either field use a neutral color or baseline point size.

## Labels

The map displays twelve deliberately limited, evidence-backed labels: Tau Ceti, Proxima Centauri, Epsilon Eridani, Barnard's Star, TRAPPIST-1, 55 Cancri, 51 Pegasi, Gliese 581, Ross 508, LHS 1140, Kapteyn's Star, and Unukalhai (Serpent's Head). Each is an exact Gaia DR3 source ID in the bundled 300-ly volume. The matched NASA Archive host identifier, alias resolution, and the Gaia DR2→DR3 crossmatch used for the one non-host label are recorded in [`public/prominent-star-labels.provenance.json`](public/prominent-star-labels.provenance.json). No position-based name guessing is used. The **Hide unlabeled stars** control filters the active catalog to permanent labels plus any current temporary search labels.

Selected-source and measurement display names expand standard Bayer and Flamsteed designations: for example, the NASA host identifier `47 UMa` is displayed as **47 Ursae Majoris**. The original NASA identifier remains visible in the selected-source details.

## Search

**Find a star** performs a case-insensitive partial search across Gaia DR3 source IDs, NASA host identifiers, confirmed planet identifiers, and configured evidence-backed labels. Identifiers learned from the focused NASA/Gaia catalog remain searchable after switching to the complete Gaia layer, so `1069`, for example, finds Wolf 1069 there. Results prioritize named catalog identifiers over a bare Gaia-ID substring match and are capped at 25 entries. Search matches receive temporary gold labels; selecting one from either the result list or its temporary map label retains that one label and removes the other temporary labels. The permanent evidence-backed labels always remain. Selecting a result focuses it without adding a route stop.

## Known planetary-system diameter

When NASA's `PSCompPars` table reports both semi-major axis `a` and eccentricity `e` for at least one confirmed planet, the selected-source panel shows a known planetary-system diameter in AU and light-seconds:

```text
diameter = 2 × max[a × (1 + e)]
```

This is the diameter of the largest **known planetary orbit** by apoastron, not a claim about the full physical system. It excludes stellar companions, debris disks, unreported planets, and planets without both required orbital elements. The generated host catalog contains values for 815 systems; the query and exact conversion are recorded in the host-catalog provenance.

## Point-to-point distances

Select distinct stars or Sol to construct an ordered route. The compact panel displays the overall travel distance in light-years, light-megaseconds, and parsecs; expand **Show individual hops** to inspect each consecutive leg. Right-click anywhere in the map to remove the most recently selected endpoint. A light-megasecond is the distance light travels in one million seconds; the conversion uses 31.5576 light-megaseconds per Julian light-year. Routes use the same ICRS Cartesian coordinates rendered by the map: Gaia RA, Dec, and the geometric reciprocal-parallax display distance at J2016.0 for Gaia sources, and Sol's JPL Horizons barycentric J2016.0 position. This is not an uncertainty-aware separation estimate and is not propagated to a common modern epoch.

## Complete Gaia comparison layer

The **All Gaia DR3 sources** selector loads `public/gaia-dr3-trappist-1-300ly.csv`, the full 443,660-source exact 300-ly TRAPPIST-1-centered volume. Keep this layer when identifying non-host candidates, comparing locations between named systems, or requesting a star that is not an exoplanet host. Its query, retrieval timestamp, conversion, and limits are recorded in [`public/gaia-dr3-trappist-1-300ly.provenance.json`](public/gaia-dr3-trappist-1-300ly.provenance.json).

## Loading a replacement Gaia DR3 data set

Export a CSV from the [Gaia Archive](https://gea.esac.esa.int/archive/) with these required `gaiadr3.gaia_source` columns:

```sql
source_id, ra, dec, parallax
```

Optional columns shown when present are `ra_error`, `dec_error`, `parallax_error`, and `phot_g_mean_mag`. The viewer excludes points beyond the fixed 300-ly radius, even when a replacement file contains them. Record the exact ADQL query and retrieval date with every data file used in a project.

## Coordinate and distance policy

Gaia DR3 astrometry is stored as ICRS-barycentric Cartesian coordinates at the catalog reference epoch **J2016.0**:

```text
d_pc = 1000 / parallax_mas
x = d_pc cos(dec) cos(ra)
y = d_pc cos(dec) sin(ra)
z = d_pc sin(dec)
```

The displayed coordinate is then translated by subtracting the selected origin’s stored ICRS-barycentric position. The initial origin is TRAPPIST-1, but all stars—including Sol—retain their own stored positions and move when that setting changes.

The viewer rejects non-finite or non-positive parallaxes. The reciprocal-parallax value is used only to place a point in this geometric view. It is **not** a Bayesian or otherwise uncertainty-aware distance estimate. `parallax_error` is retained and displayed for selected sources so that interpretation does not hide its precision. Proper-motion and radial-velocity propagation are intentionally not implemented yet; the displayed epoch remains the Gaia DR3 catalog epoch rather than claiming a current ephemeris.

## Sources

- [ESA Gaia DR3 overview](https://www.cosmos.esa.int/web/gaia/dr3)
- [Gaia Archive](https://gea.esac.esa.int/archive/)
- [NASA Exoplanet Archive TAP service](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html)
- [JPL Horizons system](https://ssd.jpl.nasa.gov/horizons/)

Gaia DR3 was released 13 June 2022. Cite the specific Gaia release, NASA Exoplanet Archive data, source IDs, queries, and retrieval dates for every published visualization.
