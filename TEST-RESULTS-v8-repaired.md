# ORBITAL v8 repaired — repeatable test results

Date: 2026-11-15

## Automated project tests

Command: `npm test`

- Autopilot: 14 passed, 0 failed
- Physics & flight: 18 passed, 0 failed
- Science data & audio: 13 passed, 0 failed
- Requirements / Max-Q / exploded view: 9 passed, 0 failed
- State / economy / reports: 11 passed, 0 failed
- UI logic / 2D fallback / safe launch: 4 passed, 0 failed

**Total: 69 passed, 0 failed across 6 suites.**

## Deterministic flight audit

Command: `node tools/audit.mjs`

- 85 completed mission scenarios succeeded.
- 6 manual-ascent checkpoints passed; these are checkpoints, not completed missions.
- 5 infeasible-takeover checks were safely refused without changing manual flight controls.
- 0 failed completed mission outcomes.
- 0 incomplete mission outcomes.
- 0 non-finite states.
- 0 repeated log-message cases.

## Syntax checks

- All JavaScript and MJS files under `src/`, `tools/`, and `test/` passed `node --check`.
- Inline JavaScript in all 8 Live HTML pages passed `node --check`.

## Not certified by these tests

- No full browser/WebGL visual sign-off was completed in this environment.
- Live NASA server responses were not independently confirmed during the repair; API behavior is covered by code inspection and fallback-handling logic, not by a successful live-data capture.
- The six historical Jukebox datasets (FIRMS, MODIS ocean color, GPM IMERG, MERRA-2, MODIS NDVI, NSIDC Sea Ice Index) were not present as observation files in the supplied archive. Those built-in series remain visibly illustrative. The Fever Chart bundled snapshot remains provisional until compared value-by-value with the official NASA GISTEMP file.

A passing test suite is evidence of the tested logic, not a guarantee that every browser, device, or network condition is error-free.
