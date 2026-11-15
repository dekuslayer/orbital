# ORBITAL — Scientific data inventory, provenance and integration rules

## Read this before interpreting a chart

A NASA/NSIDC product name or source URL is a **scientific source reference**, not proof that the chart currently contains measurements from that product. The status of the values actually loaded is shown in the Jukebox record badge and in **Science Lab → Source**.

This ZIP contains:

- `data/index.json`: currently lists only `rec_temperature`.
- `data/rec_temperature.json`: a 12-month candidate series for **October 2025–September 2026**, copied from a secondary tracker that attributes it to NASA GISTEMP v4. It has **not** been compared value-by-value with the official GISTEMP CSV in this build, so its status is **PROVISIONAL**, not source-verified.
- No separate historical CSV/JSON observation files for `rec_fire`, `rec_ocean`, `rec_storm`, `rec_air`, `rec_land` or `rec_ice` are bundled in this ZIP. Their built-in chart values and map locations are deterministic **ILLUSTRATIVE** demonstrations only.

The team-provided chat excerpts for Fire Frequency, Arctic Ice, Ocean & Solar Telemetry and Fever Chart were partial HTML snippets. They are not the underlying historical CSV/JSON measurements. The complete Live pages that are present in the project make their own API requests, but those Live requests do **not** populate or verify the historical Jukebox records.

## Current record-by-record inventory

| Record | Intended scientific product | Current Jukebox values in this ZIP | Related Live page (a different product) |
|---|---|---|---|
| `rec_fire` | NASA FIRMS MODIS active-fire detections (MCD14DL product family) | Illustrative monthly index and illustrative map points; no FIRMS observation file bundled | `live/fire.html`: open wildfire **event records** from NASA EONET, not FIRMS satellite fire-pixel detections |
| `rec_ocean` | Aqua-MODIS Ocean Color Level-3 chlorophyll-a (`chlor_a`); exact composite/resolution/reprocessing version still needs selection | Illustrative chlorophyll-shaped curves and illustrative ocean points; no OB.DAAC file bundled | `live/ocean.html`: NASA POWER daily 2 m **air temperature** at the Alexandria grid point, not water temperature or chlorophyll |
| `rec_storm` | NASA GPM IMERG precipitation; exact monthly V07B Final file/variable must be recorded | Illustrative precipitation-rate curves and illustrative points; no IMERG file bundled | `live/storm.html`: open severe-storm event records from NASA EONET, not GPM rainfall measurements |
| `rec_air` | NASA MERRA-2 `M2TMNXAER` monthly aerosol diagnostics, including total aerosol optical thickness at 550 nm | Illustrative AOT-shaped curves and illustrative points; no MERRA-2 file bundled | `live/air.html`: NASA POWER surface solar irradiance over Cairo, not aerosol optical thickness or an air-quality measurement |
| `rec_land` | Aqua-MODIS vegetation indices monthly L3 global 0.05° CMG, candidate `MYD13C2.061` NDVI | Illustrative NDVI-shaped curves and illustrative points; no MODIS file bundled | `live/earth.html`: open natural-event records from NASA EONET, not MODIS NDVI |
| `rec_ice` | NSIDC Sea Ice Index `G02135`, Version 4, monthly Arctic extent | Illustrative extent curves and illustrative polar points; no NSIDC file bundled | `live/arctic.html`: NASA POWER point air temperature plus EONET sea/lake-ice event records, not NSIDC sea-ice extent |
| `rec_temperature` | NASA GISTEMP v4 global monthly Land-Ocean Temperature Index (LOTI) anomaly | Provisional secondary-tracker snapshot, October 2025–September 2026; not matched against the official NASA CSV | `live/fever.html`: NASA POWER 2 m air-temperature anomaly at one grid point (0°N, 0°E), not global GISTEMP |

The record source metadata identifies intended products and known processing requirements. For any product whose exact file/version/parameter is not selected, that uncertainty is stated in the record's Source panel. Do not turn a candidate product citation into a claim that its data are already integrated.

## Live API experiences currently implemented

These pages make separate requests at run time when the network is available:

- **Fire** — NASA EONET open wildfire event records. An EONET event count is not the same thing as a FIRMS count of thermal-anomaly pixels.
- **Arctic** — NASA POWER daily `T2M` (2 m air temperature) at 78°N, 15°E, compared with the same 7-day calendar window in 1981; plus a separate EONET open sea/lake-ice event count. Neither is NSIDC Sea Ice Index extent.
- **Ocean** — NASA POWER daily `T2M` at the Alexandria grid point (31.20°N, 29.91°E). This is 2 m air temperature, not chlorophyll or sea-surface temperature.
- **Atmosphere** — NASA POWER daily `ALLSKY_SFC_SW_DWN` at the Cairo grid point (30.04°N, 31.23°E). This is surface solar irradiance, not MERRA-2 aerosol optical thickness.
- **Storm** — NASA EONET open severe-storm event records, not GPM precipitation.
- **Earth** — NASA EONET open natural-event catalogue records.
- **Fever Chart** — NASA POWER monthly `T2M` at 0°N, 0°E, minus the 1991–2020 average for the matching calendar month. It is a single grid point, not the global GISTEMP anomaly.

If a page cannot fetch its API result, the page labels its displayed fallback values as illustrative samples. A sound-mapping frequency (Hz) is a designed representation of a variable, not a NASA measurement.

## Official product references and import requirements

These are the intended sources to use when the team obtains the original data. The actual granule/file, version, variable, period and processing must be recorded for each imported dataset.

### `rec_fire` — NASA FIRMS / MODIS active fire

Official product information: <https://www.earthdata.nasa.gov/learn/find-data/near-real-time/firms/mcd14dl> and <https://firms.modaps.eosdis.nasa.gov/content/active_fire/>

- Product family: MODIS active-fire thermal anomaly/fire-location data (MCD14DL family).
- Preserve platform/sensor, observation time, coordinates, confidence, fire radiative power (when supplied), and whether the source is near-real-time or standard science-quality data.
- Keep raw detection counts distinct from any normalised 0–100 display index.
- Define the geographic region and monthly aggregation rule before comparing periods.
- Cloud cover and satellite overpass timing affect detections; detections are not burned area.

### `rec_ocean` — NASA Ocean Biology DAAC / Aqua-MODIS chlorophyll-a

Official browser: <https://oceandata.gsfc.nasa.gov/l3/>

- Intended variable: surface chlorophyll-a concentration (`chlor_a`), normally expressed in mg m⁻³.
- Select the exact Aqua-MODIS Level-3 monthly mapped product, spatial resolution, OCI/product algorithm and reprocessing collection before importing.
- Retain quality flags, valid-pixel rules, source granule names, monthly compositing period and the fixed region geometry.
- Exclude land, cloud, invalid and rejected-quality pixels. Use an area-weighted monthly regional mean where appropriate.
- Do not substitute NASA POWER air temperature or EONET event counts.

### `rec_storm` — NASA GPM IMERG

Official overview: <https://gpm.nasa.gov/data/imerg> ; product directory: <https://gpm.nasa.gov/data/directory>

- Use a clearly identified IMERG V07B Final monthly product/parameter and retain the exact file name, version and metadata.
- NASA's monthly IMERG accumulation products store precipitation accumulation in mm; if the Jukebox record is to display mean rate in mm day⁻¹, divide monthly accumulation by the exact number of calendar days. Do not divide again if the selected file already contains a rate.
- Keep accumulation (mm/month), rate (mm/day or mm/hour), and pixel-scale values distinct.
- Define the region and apply documented area weighting; retain missing-data handling and source granules.

### `rec_air` — NASA MERRA-2 aerosol diagnostics

Official collection record: <https://data.nasa.gov/dataset/merra-2-tavgm-2d-aer-nx-2dmonthly-meantime-averagedsingle-levelassimilationaerosol-diagnos-596e4>

- Candidate collection: `M2TMNXAER` (`tavgM_2d_aer_Nx`), monthly mean 2-D aerosol diagnostics.
- Intended variable: total aerosol extinction AOT at 550 nm; verify the exact variable name/metadata in the selected granule.
- Record the product collection and reprocessing version, monthly time stamp, units and grid.
- Calculate a documented area-weighted mean for a fixed region.
- MERRA-2 is a reanalysis using model and assimilated observations, not a pure direct satellite measurement or a surface air-quality sensor reading.

### `rec_land` — Aqua-MODIS NDVI

Official product record: <https://catalog.data.gov/dataset/modis-aqua-vegetation-indices-monthly-l3-global-0-05deg-cmg-v061>

- Candidate product: `MYD13C2.061`, monthly global 0.05° CMG; DOI: `10.5067/MODIS/MYD13C2.061`.
- Read the NDVI science data set, not an unrelated field.
- Apply the product's documented scale factor, valid range, fill-value handling and QA screening from the exact version metadata.
- Define the land region, then calculate a documented area-weighted monthly mean.
- Do not substitute EONET event counts for vegetation index values.

### `rec_ice` — NSIDC Sea Ice Index

Official Version 4 page: <https://nsidc.org/data/g02135/versions/4> ; DOI: `10.7265/a98x-0f50` ; data archive: <https://noaadata.apps.nsidc.org/NOAA/G02135/>

- Product: Sea Ice Index `G02135`, Version 4; daily and monthly extent/concentration products are available from 1978 to present.
- Use the monthly **Arctic** extent series for this Arctic-themed record; do not mix Arctic and Antarctic records.
- Preserve the Version 4 citation, selected monthly file, time period and data format.
- NSIDC sea-ice extent is the ocean area with at least 15% sea-ice concentration. It is not ice volume or thickness.
- NSIDC Version 4 has version-specific source and processing details. Preserve the version stated in each downloaded file and do not silently mix Version 3 and Version 4 files.

### `rec_temperature` — NASA GISTEMP v4

Official data page: <https://data.giss.nasa.gov/gistemp/data_v4.html> ; official global LOTI CSV: <https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv>

- The table is global monthly Land-Ocean Temperature Index anomalies relative to the corresponding 1951–1980 monthly means.
- The current bundled October 2025–September 2026 values are copied from a secondary tracker and have not been verified against the official CSV. Keep them PROVISIONAL.
- Before marking OBSERVED, compare every included month with the official table and preserve the source URL, retrieval date, comparison date, parser version and exact comparison method.
- The zero reference line is a baseline, not an observed series. This is a global series; it must have no geographic points.

## Data-file format and acceptance rules

Each record file is named `data/<record-id>.json` and must be listed in `data/index.json`. It must contain:

- `provenance`: producer, dataset, HTTPS source URL, retrieval date, period A, period B, units, and the exact product/collection/version/variable/region and processing information in the descriptive fields.
- `labels`: the time-step labels shared by both series.
- `series.A.values` and `series.B.values`: equal-length finite numeric arrays matching `labels`.
- `points` (optional): only actual sample locations from the data source or an explicitly documented spatial aggregation. Do not reuse the illustrative points.

A file is not OBSERVED merely because it is syntactically valid or points to NASA. The code requires a complete verification statement:

```json
"verification": {
  "status": "verified",
  "comparedWith": "https://official-source.example/data.csv",
  "comparedOn": "YYYY-MM-DD",
  "allValuesMatched": true,
  "method": "Describe the reproducible value-by-value comparison and processing check."
}
```

Only use `status: verified` after the actual comparison. If data are copied/transcribed but not checked, use `status: provisional` and explain that fact. A file without a verification statement is USER-SUPPLIED — NOT VERIFIED. A rejected file must never silently replace the currently displayed values.

## Current code behaviour

- `data/index.json` is the allow-list of historical record files the app attempts to load.
- If an ID is not in the manifest, the app uses the built-in series: six illustrative records and one provisional temperature snapshot.
- If a listed file is malformed or has incompatible units, the app marks it REJECTED and clearly explains that it falls back to the built-in series.
- `sourceVerified()` requires a complete verification record. A NASA name, URL, or complete JSON structure alone never upgrades a series to OBSERVED.
- The selected record's chart, globe/hologram and sonifier all use the same loaded record object. The separate Live NASA pages are not used to update the historical record data.

## Safe data import procedure

1. Preserve the original downloaded source file unchanged.
2. Record the exact official URL, access date, DOI/citation, product version, file/granule name, variable, units, region, period, quality filters and transformations.
3. Create a separate reproducible conversion step; do not edit source values by hand.
4. Validate missing values, fill values, range, dimensions, units, dates, coordinates and quality flags.
5. Compare all output values against the source-derived aggregation using a reproducible script.
6. Add the JSON file to `data/` and its ID to `data/index.json` only after validation.
7. Keep the record PROVISIONAL until the source comparison is complete and documented.
8. Never put Earthdata credentials or API keys in client-side JavaScript. Use authenticated downloads only in a safe local workflow; publish only the resulting permitted data and source attribution.

## Optional visual frames

A data file may include `frames` only when each frame has a valid source asset URL, credit, date, title and correct time-step index. Do not copy images without preserving their original attribution and licence. No data-frame assets are bundled in this ZIP.
