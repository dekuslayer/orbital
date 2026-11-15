# ORBITAL v8 repair — implemented changes and verification record

## Rocket / physics (src/flight.js)
- `clone()`: independent copy of the full flight state (the autopilot plans from the REAL current state).
- `upperStackMass()`: `dvRemaining()` omitted the spacecraft-bus mass (solar wings, antenna) that `mass()` includes -> delta-v was slightly overestimated. Now one mass source.
- NaN/Infinity safety net at the end of `step()` (flight ends with a clear message instead of corrupting HUD/report).

## Autopilot (src/autopilot.js)
- Removed the `flight.alt < 3000` planning condition. `assess()` classifies the actual state (climb / coast / circ / orbit / window / raise / cruise / lunar); `planFromState()` simulates pitch programmes on a clone of the current state (second, wider search if the first fails).
- Takeover during the Moon cruise no longer risks a second transfer burn; takeover in orbit/window re-measures the transfer-window bias from the current state.
- Fuel budget `lunarBudget()`: transfer + capture + descent, and descent-engine thrust >= 1.2 x lunar weight, checked BEFORE the transfer burn and again before capture.
- Staging: boosters/core separate only when empty and no booster still burns; the lander keeps the core stage if it alone can still land.
- LEO: circularisation stops before the apoapsis ceiling; a corrective burn at apoapsis only when physically possible (periapsis low, apoapsis valid, fuel left). Never reports success outside 150-500 km.
- Duplicate log lines: `say()` logs each distinct message once; Sounding engine cut was logged 461 times in one flight.
- UI: handing control back resets time warp to 1x. 2D profile view now draws the rocket along the thrust direction (pitch), like the 3D view and the physics.

## Jukebox (src/scenes/jukeboxScene.js, src/audio.js, src/chart.js, src/main.js)
- Interrupted insertion animation resolves its promise (false) instead of hanging forever.
- Removing a loaded disc now disposes its materials and 1024px texture (leaked one per insertion).
- `eject()`: switching discs clears old disc, data, hologram theme, spikes and sound before the new record loads (previously Play during loading could play the old record under the new selection).
- Sonifier: a `play()` waiting for the AudioContext can no longer start sound after Stop / disc switch.
- Chart: guard for single-label data.
- "Open live NASA data for this record" -> "Related live NASA page" + a line saying exactly what the page shows (EONET events / NASA POWER temperature are NOT FIRMS, chlorophyll, IMERG, MERRA-2, NDVI or NSIDC).

## Not changed on purpose
All NASA live pages (live/*), data/rec_temperature.json (GISTEMP snapshot, stays PROVISIONAL), records.js, scaled-world constants and every physics equation other than the mass fix above.


## Additional independent fixes (2026-11-15)
- **Infeasible Auto Drive takeover now declines safely.** If the current-state ascent search finds no feasible pitch programme, Auto Drive no longer applies an arbitrary default pitch programme as best effort. It disengages immediately, clearly reports that manual control remains active, leaves throttle/pitch/trajectory/fuel unchanged, and does not mark the flight as assisted.
- **UI feedback for a refused takeover.** The refusal is shown as a warning, warp returns to 1×, and the same warning is not toasted twice.
- **Flight-wide event de-duplication.** Recreating Auto Drive during a manual/automatic handover no longer repeats an already logged transfer-window message.
- **Audit classifications corrected.** Partial manual ascent checkpoints are no longer counted as failed completed missions; upper-stage separation is only labelled as such when the stage really is `upper`; takeover snapshots capture pitch and commanded pitch at the actual handover point; impossible takeovers are reported as successful safety refusals when no controls are changed.
- Added regression tests for low-fuel refusal, an unrecoverable lunar wrong-pitch takeover, and transfer-window message de-duplication.

### Independent verification after these changes
- `npm test`: all 6 suites passed (69 assertions total).
- `node tools/audit.mjs`: 96 scenarios classified as 85 completed mission successes, 6 manual-ascent checkpoints passed (not full missions), and 5 safe Auto Drive refusals. No failed completed mission outcomes, non-finite states, or repeated log-message cases in this audit run.
- Browser/WebGL visual verification was not completed in this environment: the available Chromium browser blocked local app URLs under its environment policy, and Playwright is not installed. Do not interpret the simulation audit as visual browser sign-off.


## Additional data-integrity and Live-page repairs (2026-11-15)

- **Data status is visible again.** The selected Jukebox record displays its actual data badge; Science Lab displays all seven record statuses and a roll-up count. The Jukebox record list carries a persistent note explaining that the six built-in non-temperature series are illustrative, Fever Chart is provisional, and related Live pages are separate products.
- **Source panel expanded.** Added product DOI (when known), licence/citation guidance, product/version, processing description, data periods and a separate clickable secondary-copy source for Fever Chart. The status note includes the secondary tracker and makes clear that it is not NASA's original source.
- **Verification gate tightened.** A record cannot be labelled `OBSERVED` unless its verification statement has an official HTTPS comparison URL, a real calendar date, `allValuesMatched: true`, and a non-empty reproducible method. Added tests that reject missing methods and impossible dates.
- **Scientific product metadata clarified.** Documented the actual product family and import requirements for FIRMS, Aqua-MODIS chlorophyll, GPM IMERG, MERRA-2 AOT, MODIS NDVI, NSIDC Sea Ice Index and GISTEMP. IMERG monthly accumulation (mm) is explicitly distinguished from mean rate (mm/day); MODIS QA/scaling and regional averaging requirements are documented.
- **Live-page distinction fixed.** The Live hub says “Related Jukebox theme (separate dataset)”. Each record link and Source panel explains the actual Live variable so EONET event counts are not confused with FIRMS, EONET severe-storm events are not confused with GPM rainfall, POWER air temperature is not confused with chlorophyll, POWER solar irradiance is not confused with MERRA-2 AOT, and POWER point anomalies are not confused with global GISTEMP.
- **Offline narration is truthful.** Live Fire, Storm, Earth, Ocean, Atmosphere, Arctic and Fever pages distinguish live API results from illustrative fallback samples in their spoken narration. Controls remain disabled until the live response or explicit fallback is ready. EONET payloads are checked for an events array; malformed responses go to the labelled fallback path.
- **Fever live window improved.** The NASA POWER monthly series uses the latest 12 complete calendar months and excludes the current incomplete month and POWER's `YYYY13` annual mean entry.
- **Documentation corrected.** Root README and `data/README.md` now give a seven-record inventory, describe what is and is not present in the archive, and explicitly separate Live API experiences from historical Jukebox record data.

### Current data status — do not overstate it

- `data/index.json` still lists only `rec_temperature`.
- `data/rec_temperature.json` is a **PROVISIONAL** October 2025–September 2026 snapshot copied through a secondary tracker. It has not been value-by-value compared with the official NASA GISTEMP CSV.
- The six other Jukebox records still use clearly labelled **ILLUSTRATIVE** built-in series and map points. No original FIRMS, OB.DAAC, IMERG, MERRA-2, MYD13C2 or NSIDC observation file was present in the supplied ZIP. The partial HTML chat snippets are not those historical observation files.
- No historical measurement file has been fabricated or substituted. The Live pages call their own EONET/POWER APIs when opened online; they do not automatically turn the Jukebox's historical series into those datasets.

### Final verification after data changes

- `npm test`: all 6 suites passed — 69 automated test cases.
- `node tools/audit.mjs`: 96 scenarios: 85 completed mission successes, 6 passed manual-ascent checkpoints (not full missions), and 5 safe refusals of infeasible Auto Drive takeovers. No failed completed mission outcomes, non-finite states, or repeated log-message cases in this audit.
- `node --check` completed for all project `.js`/`.mjs` files; inline JavaScript in all eight Live HTML pages also passed syntax checks.
- Real WebGL/browser visual sign-off was not completed. Playwright is not installed, and the Chromium environment blocks local app URLs; the deterministic simulator audit is not a substitute for visual 3D verification.
