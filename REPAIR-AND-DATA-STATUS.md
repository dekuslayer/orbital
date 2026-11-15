# ORBITAL v8 — Repair and data-status report

## What was repaired

- Auto Drive now plans from the actual live flight state instead of only from the initial launch state. If no feasible current-state plan exists, it declines takeover and leaves the manual controls and trajectory untouched rather than applying a guessed default programme.
- Flight clones are independent for planning; remaining delta-v accounts for the spacecraft bus mass; non-finite flight states are caught.
- Lunar mission fuel planning includes transfer, capture and descent reserves and checks descent-engine thrust. LEO completion checks both periapsis and apoapsis. Stage handling and repeated event logging were improved.
- Jukebox disc switching now resolves interrupted animation promises, disposes record-owned graphics resources, clears old record data/sound on eject, and prevents delayed audio from playing after Stop or switching.
- Live page labels and narration now distinguish API measurements/events from offline samples and from the different historical dataset intended for each Jukebox record.
- The source panels and Science Lab expose each record's actual status, source details, product/version, DOI (when recorded), license/citation guidance, processing, periods, limitations and secondary-copy source where relevant.
- A claimed source verification without a valid date or a reproducible method is downgraded to provisional.

## Data inventory in the supplied archive

| Record | Current in-app data status | What is actually bundled |
|---|---|---|
| Fire Frequency | ILLUSTRATIVE | Generated demonstration curves and illustrative locations; no FIRMS history file |
| Ocean Symphony | ILLUSTRATIVE | Generated demonstration curves and illustrative locations; no OB.DAAC chlorophyll file |
| Storm Signals | ILLUSTRATIVE | Generated demonstration curves and illustrative locations; no GPM IMERG file |
| Atmosphere in Motion | ILLUSTRATIVE | Generated demonstration curves and illustrative locations; no MERRA-2 file |
| Earth in Motion | ILLUSTRATIVE | Generated demonstration curves and illustrative locations; no MODIS NDVI file |
| Ice Memory | ILLUSTRATIVE | Demonstration extent curves and illustrative polar locations; no NSIDC file |
| Fever Chart | PROVISIONAL | Secondary-tracker values for Oct 2025–Sep 2026; not checked against the official GISTEMP CSV |

`data/index.json` currently lists only `rec_temperature`. The project contains seven separate Live pages that call NASA EONET or NASA POWER when opened online. They are related experiences, **not** the missing historical data files for the Jukebox records. The supplied chat snippets from the teammate were incomplete HTML excerpts, not CSV/JSON observation files.

No measurements were fabricated or imported during this repair. This report deliberately does not claim that the six illustrative records are real NASA observations. See `data/README.md` for official intended products, exact source references and the import/verification requirements.

## Test results

- `npm test`: 6 suites passed, 69 automated test cases.
- `node tools/audit.mjs`: 96 deterministic simulation scenarios — 85 completed mission successes, 6 manual-ascent checkpoints passed (not full missions), 5 safe refusals for infeasible Auto Drive takeovers; zero failed completed mission outcomes, zero non-finite states, zero repeated-log cases.
- All project `.js`/`.mjs` files passed `node --check`.
- Inline JavaScript in all eight Live HTML pages passed syntax checks.

## Not verified in this environment

- No real-browser visual sign-off of WebGL, 3D rocket axes, the launch scene, or the animated Jukebox. Playwright was unavailable, and the available Chromium browser blocked local application URLs.
- Live requests to NASA EONET/POWER were inspected in code, but a successful live network response was not verified during this repair.
- No historical product-level observation files were acquired for the six illustrative records, and the provisional GISTEMP values were not compared against NASA's official CSV.

The simulation and Node tests are strong regression evidence, but they are not proof that every real-browser rendering state or every external NASA request will work under competition-day network conditions.
