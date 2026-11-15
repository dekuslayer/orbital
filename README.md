# ORBITAL — Space Mission Design Game + Earth Information Jukebox

An independent 3D web project made for the NASA Space Apps Challenge (Task 13 — Space Mission Design Game, Task 14 — Earth Information Jukebox).
**It is not an official NASA product.** Rocket telemetry is simulated. Earth-data records display their actual status: in this bundle six built-in records are **ILLUSTRATIVE** and Fever Chart is **PROVISIONAL** until independently matched to the official GISTEMP table (see "Data honesty").

## Flight fixes (v8)

- **Max-Q limiter now throttles the boosters too** (before, every build with boosters broke up at ~20 s even with the limiter on).
- **Capture / descent burns auto-stage:** when the core stage runs dry and the upper stage still has propellant, it separates by itself (before: "propellant ran out short of capture" with thousands of m/s unused).
- **Transfer-burn timing:** the burn time accounts for staging, and the autopilot calibrates the burn start on a headless clone, so transfers no longer miss the Moon by 10,000+ km.
- **No endless orbit:** if the delta-v in orbit cannot cover transfer + capture, or a LEO orbit is not valid, the autopilot ends the flight with a clear reason (before: it stopped silently and the rocket circled the Earth forever, and LEO even printed "payload deployed").
- **Lab checks:** new block/warning for thrust-to-weight after booster burnout, and a warning for very high lift-off TWR with boosters.

## Live NASA pages (new)

`live/` holds seven standalone pages that make run-time requests to NASA EONET and NASA POWER: Fire Frequency, Arctic Ice, Ocean & Climate, Atmosphere, Earth in Motion, Storm Signals and Fever Chart. These are separate live-data experiences, not the historical datasets plotted by the seven Jukebox records. For example, the Ocean page uses NASA POWER 2 m air temperature at Alexandria; it is not MODIS chlorophyll. If a request fails, the page labels its fallback as an illustrative sample, and its sound narration also distinguishes live responses from fallback samples. Hub: `/live/index.html`. The Jukebox uses a **Related live NASA page** link whose label explains the different product; a Live API response never upgrades a Jukebox record's data status.

## Install and run (Windows 10/11 PowerShell, macOS, Linux)

Requires Node.js 18+. **No `npm install` is needed to play**: three.js r160 is bundled in `vendor/`.

```bash
cd orbital
npm start          # starts http://localhost:8080
npm test           # runs all test suites (Node only, no browser)
```

Open http://localhost:8080 in a browser (do not open index.html by double-click: ES modules need a server).
Use another port: `PORT=9000 npm start` (PowerShell: `$env:PORT=9000; npm start`).
`npm install && npm run setup` only refreshes `vendor/` from the npm package. If `vendor/` is missing the game falls back to the jsDelivr CDN.

## What changed in this revision

- **Panels you can hide:** in the flight view the buttons at the top (Telemetry, Mission & log, Controls, Hide all, key **H**) show or hide the text panels, so the rocket is never covered. The choice is remembered. The 2D display draws inside the free area, so the rocket is always visible. In the Jukebox, **Hide text** removes the text on top of the 3D scene.
- **Flight safety:** a failed flight is never fast-forwarded any more (it used to jump at 600× and throw the vehicle far away), a wreck stays on the ground instead of sinking through it, and switching the Max-Q limiter explains what it does (with it OFF a full-throttle ascent breaks up at maximum dynamic pressure).
- **Engineering Lab:** every installed part is a named component; the exploded view moves all of them and restores exactly; click a part (or the list) for its data-driven details.
- **Launch safety:** only the launchpad button starts a countdown; the fee is charged once at ignition; abort (button or Esc) is free.
- **Flight view:** choose 3D or 2D at any time (button in the flight bar, remembered); both show the same simulation, so rewards are unaffected. The Earth and Moon use real imagery (see `assets/earth/README.md` for the unverified provenance).
- **Jukebox:** the hologram uses a real land/sea mask, the big screen behind it is gone, the rack fades while a record plays, sleeves show only a title, the side panel is split into tabs (Data / How it works / Source / Quiz), and there is a pitch control next to speed and volume. Spikes may only sit on the surface they claim (land or ocean).
- **Layout:** the home page buttons are no longer hidden behind the statistics bar on wide screens; the navigation rail has icons and readable labels.
- **Tests:** `test/spec.test.mjs` covers mass consistency, the scaled world, fuel cutoff, Max-Q, exploded view, wreck-on-ground and Jukebox geography. `test/browser/*.mjs` are optional real-browser checks (need Playwright).

## Camera fix (this revision)

- The flight camera used to sit ~280 m from a ~14 m rocket in space (and kept doing so at the Moon because it used the *Earth* altitude), so the rocket was a ~15 px sliver. The distance now depends on the rocket's size and the altitude above the *local* body (Earth or Moon), and the camera tilts so the planet/Moon always stays in frame (the Moon was off-screen during the capture burn). "Wide camera" is now 5× instead of 9×. The lunar-encounter ring is hidden inside the Moon view.
- Honest note: the Moon is a real 3D body at a fixed point and the encounter is decided by real distance, but capture, lunar orbit and descent are **scripted** delta-v budgets with a scripted animation (the Moon is not a gravity source). See "Simplifications".

## Testing flight → Moon → landing

1. Lab → choose mission **Lunar landing** (unlock earlier missions first, or use the Advisor button to buy the verified build).
2. Launch. Press **Start countdown**, or **Countdown + 🤖 Autopilot** for an assisted flight.
3. Manual: pitch over gradually, cut engine at apoapsis ~200 km, circularise, wait for the transfer window (shown in the hint), burn prograde until the Moon intercept readout shows a hit (green path in Map view, key **V**).
4. Inside 5,000 km of the Moon the capture, descent and landing phases run; check the landing speed limits in the report.
5. Keys: **V** map, **Space** pause, **O** autopilot on/off. Time warp is limited automatically near the Moon and while thrusting (reason shown).

Assisted flights do not earn the +10% manual-pilot bonus.

## Earth Information Jukebox (Task 14) — what is and is not done

- 7 records (6 original + **Fever Chart**, global temperature anomaly). 3D rack, vinyl, turntable, tonearm and hologram globe; the chart, the readout, the globe and the sound follow the same time step (slider, chart click, ▶ Timeline). Mute, volume cap, speed, Reset view, drag to rotate the globe.
- Every record shows its actual data status (observed / provisional / user-supplied / illustrative / rejected) with provenance, units, region, aggregation, limitations, DOI/citation and rejection reasons. The status is visible in the record and Science Lab. See `data/README.md` for the full seven-record inventory.
- Discovery questions are computed from the loaded series (no fixed answers, no 12-month assumption).
- **Not done:** no NASA Earth Information Center image/video is bundled (no access from the build environment). The Jukebox says so in an "EIC frame" panel and supports real frames through the `frames` field. The temperature values are PROVISIONAL (not compared with the official CSV).

## Rules worth knowing

- When propellant runs out the engine shuts off instantly and status reads `COASTING — NO THRUST`. Staging removes the dropped stage's mass and fuel.
- A flight that can no longer reach its goal (no propellant, trajectory misses) ends as a definite failure.
- Launch fee = 25 + 0.005 × propellant kg. Repeat missions pay 40%. Credits and Science Gems are separate. Rewards are paid once per flight (deduplicated by flight id, survives reload). Corrupt saves are repaired on load.
- Payload power and comms are real constraints: lunar/deep missions need the antenna (`ex_antenna`); big payloads need the solar array (`ex_solar`).

## Simplifications (honest list)

Scale model (Earth radius and Earth-Moon distance 1:10, gravity at the surface kept at g0, real-scale atmosphere, Karman line at 100 km), 2D orbital plane, constant Isp, Moon on a fixed position (not a gravity source), 5,000 km encounter radius, scripted capture/descent/lunar-orbit phases, simple exponential atmosphere.

## Data honesty

No dataset in this project is source-verified. Six records are ILLUSTRATIVE demonstration curves; the temperature record (`data/rec_temperature.json`) is PROVISIONAL (candidate values that were not compared with the official GISTEMP table). A record counts as **OBSERVED** only with a complete `provenance.verification` block that includes an official HTTPS comparison URL, a real comparison date, `allValuesMatched: true` and a reproducible method (see `data/README.md`); a well-formed file alone is shown as USER-SUPPLIED / PROVISIONAL, and an invalid one as REJECTED with the reasons. In this ZIP, only the provisional temperature snapshot is listed in the data manifest; the other six records use illustrative built-in curves and map points. The Live NASA pages are separate products and do not count as source files for those records.
To add real data: download a CSV yourself, then run `node tools/build-record.mjs` (it validates, downloads nothing, registers in `data/index.json`; `--gistemp` reads the official GISTEMP table).

## Tests

`npm test` runs six suites (physics, state, science/audio, requirements/specification, autopilot and UI). In the current repaired revision, 69 automated test cases pass. The 96-scenario flight audit is a separate deterministic simulation run; it recorded 85 completed mission successes, six passed manual-ascent checkpoints (not full missions), and five safe Auto Drive refusals for infeasible takeovers. These are simulation tests, not proof of every real-browser visual state. Real WebGL rendering and the optional `test/browser/` Playwright checks were not re-run in this repair environment; do not treat the 3D view as visually verified by this report.


Without WebGL the flight is shown in a 2D display (same simulation). Features from the extended brief that are **not** implemented: daily mission, secret discoveries, background music/UI sound effects, blueprint overlay, pinch-zoom on the globe, clickable data points (there are no real geographic points to click).
