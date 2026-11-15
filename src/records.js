// ORBITAL — Earth Information Jukebox record catalogue.
//
// DATA HONESTY NOTICE
// The source entries below identify the real scientific products intended for each record.
// This archive does not contain the original monthly observation files for the six non-temperature records.
// Those six built-in chart series and their map points are deterministic ILLUSTRATIVE demonstrations only.
// rec_temperature is a PROVISIONAL 12-month snapshot copied via a secondary tracker; it is not checked against
// the official GISTEMP CSV in this build. None of these built-in values is source-verified NASA/NSIDC data.
// A record JSON is loaded only when its ID is listed in data/index.json and the file passes structure + unit
// validation. A valid file is not automatically OBSERVED; see sourceVerified() and data/README.md.

// DATA STATES (see statusLabel): observed (source-verified) | provisional (valid file, NOT diff-checked against the official source,
// or user-supplied) | illustrative (built-in demonstration curves) | rejected (a data file was found but failed validation; the
// illustrative curves are shown instead together with the reasons). Structure validity, unit validity and source verification are
// three separate checks: a well-formed JSON file never becomes "observed" by itself.

import { surfaceAt } from './landmask.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const yrs = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const sine = (i, n, phase = 0) => Math.sin(((i / n) * 2 * Math.PI) + phase);
const r1 = v => Math.round(v * 10) / 10;


// ---- Global temperature anomaly snapshot (PROVISIONAL). Copied without adjustment from a secondary tracker that names NASA GISTEMP v4 as its
// source; NOT diff-checked against https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv (unreachable from the build environment).
// The same numbers live in data/rec_temperature.json; a test keeps the two identical.
const TEMP_LABELS = ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'];
const TEMP_A = TEMP_LABELS.map(() => 0);
const TEMP_B = [1.18, 1.21, 1.05, 1.08, 1.23, 1.3, 1.16, 1.13, 1.17, 1.24, 1.42, 1.38];
const TEMP_PROVENANCE = {
  producer: 'NASA Goddard Institute for Space Studies (GISS) — original producer; values here come via a secondary tracker',
  dataset: 'GISTEMP v4 Land-Ocean Temperature Index (LOTI), global monthly mean anomalies, Oct 2025 – Sep 2026',
  sourceUrl: 'https://data.giss.nasa.gov/gistemp/data_v4.html',
  retrieved: '2026-10-26',
  periodA: '1951–1980 reference baseline (0.00 °C by definition; a reference line, not a measured series)',
  periodB: '2025-10 through 2026-09, monthly global land-ocean surface temperature anomalies',
  units: '°C anomaly relative to the corresponding 1951–1980 monthly mean',
  verification: { status: 'provisional', note: 'Not compared with the official GISTEMP CSV. Official file: https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv' },
};

function monthly(base, amp, phase, f2 = 0) { return MONTHS.map((_, i) => r1(Math.max(0, base + amp * sine(i, 12, phase) + f2 * sine(i, 12, phase * 2 + 1)))); }

export const RECORDS = [
  {
    id: 'rec_fire', title: 'Fire Frequency', subtitle: 'Wildfire detections through the year', cost: 0,
    palette: { main: '#ff7a1a', accent: '#ffd23f', label: '#3a1203' }, variant: 'fire', surface: 'land',
    variable: 'Active-fire detection count index', unit: 'index (0–100)',
    xLabel: 'Month', labels: MONTHS,
    series: { A: { name: 'Year A', values: monthly(42, 38, -1.9, 6) }, B: { name: 'Year B', values: monthly(50, 41, -1.9, 8) } },
    points: [ // lat, lon, weight (hotspot pattern)
      [-10, -55, 0.9], [-14, -52, 0.8], [-8, -60, 0.7], [8, 20, 0.95], [5, 28, 0.8], [-6, 24, 0.85], [-15, 30, 0.6], [-20, 135, 0.5], [-30, 148, 0.35], [38, -120, 0.4], [60, 100, 0.45], [20, 80, 0.5], [16, 100, 0.55]],
    sound: { instrument: 'crackle-bells', map: 'Pitch ← detection index (low index = low note, high = high note, pentatonic scale). Event density ← index. Each month is one musical bar.' },
    explanation: 'Fire detections follow the dry seasons of each region: in the southern hemisphere tropics the peak comes around the middle of the year, and in the northern tropics earlier. Satellite thermal sensors flag pixels that are much hotter than their surroundings.',
    discovery: { kinds: ['max-B'] },
    source: { title: 'MODIS/Aqua+Terra Thermal Anomalies & Fire locations 1 km, FIRMS (MCD14DL)', org: 'NASA FIRMS / LANCE (Earthdata)', url: 'https://www.earthdata.nasa.gov/learn/find-data/near-real-time/firms/mcd14dl', version: 'MCD14DL product family; capture the exact collection / processing version and NRT-versus-standard status from the downloaded file metadata.', doi: 'Not stated here — see the product page', variable: 'Active-fire detections (thermal anomalies), per pixel with confidence and fire radiative power', units: 'Count of detections; FRP in MW', coverage: 'Global, daily, 1 km. NRT (near-real-time) data are later replaced by science-quality data; which one a future data file uses must be recorded in its provenance (not yet specified).', license: 'NASA open data policy — cite FIRMS/LANCE', processing: 'No FIRMS observation file is bundled. For a future import, preserve raw detections and platform/sensor metadata, distinguish near-real-time from standard science-quality data, apply the selected confidence/quality screen, and aggregate counts by a fixed region and calendar month. If counts are normalised to 0–100, document the formula separately; an index is not a raw detection count.', limitations: 'Detections depend on overpass time and cloud cover; counts are not burned area.' },
  },
  {
    id: 'rec_ocean', title: 'Ocean Symphony', subtitle: 'Chlorophyll bloom seasons', cost: 4,
    palette: { main: '#19c6c6', accent: '#7bffb2', label: '#032a2e' }, variant: 'ocean', surface: 'ocean',
    variable: 'Surface chlorophyll-a concentration', unit: 'mg m⁻³',
    xLabel: 'Month', labels: MONTHS,
    series: { A: { name: 'North Atlantic, year A', values: monthly(0.55, 0.45, -1.2, 0.18).map(v => r1(v * 10) / 10) }, B: { name: 'North Atlantic, year B', values: monthly(0.6, 0.5, -1.0, 0.2).map(v => r1(v * 10) / 10) } },
    points: [[50, -30, 0.9], [58, -20, 0.8], [45, -40, 0.5], [-45, 20, 0.7], [-50, 150, 0.6], [5, -100, 0.55], [0, -20, 0.35], [35, 140, 0.5], [60, 170, 0.7], [-10, 80, 0.2]],
    sound: { instrument: 'wave-pad', map: 'Pitch ← chlorophyll (higher concentration = higher note). Stereo pan ← longitude of the sample. Slow swelling pads, one per month.' },
    explanation: 'In temperate oceans, spring brings a phytoplankton bloom when light increases and nutrients are still available. Ocean-colour sensors estimate chlorophyll from how green the water looks from orbit.',
    discovery: { kinds: ['season-max-B', 'max-B'] },
    source: { title: 'MODIS-Aqua Ocean Color Level-3 chlorophyll-a (OCI algorithm) — exact product file and reprocessing version not yet selected', org: 'NASA Ocean Biology DAAC (OB.DAAC)', url: 'https://oceandata.gsfc.nasa.gov/l3/', version: 'Aqua-MODIS Level-3 mapped chlorophyll product family; select and record the exact temporal composite, resolution, algorithm and reprocessing version before importing values.', doi: 'Not specified for a particular product granule in this build — use the citation supplied with the selected OB.DAAC product.', variable: 'Chlorophyll-a concentration', units: 'mg m⁻³', coverage: 'Global ocean; exact spatial resolution and monthly composite must be taken from the selected OB.DAAC product metadata', license: 'NASA open data policy — cite OB.DAAC', processing: 'No OB.DAAC file is bundled. Before importing, select the exact Aqua-MODIS Level-3 monthly chlor_a product, resolution, algorithm and reprocessing version; apply documented quality flags and invalid-pixel masks, then calculate a fixed-region, area-weighted monthly mean. Do not substitute air temperature or EONET events.', limitations: 'Cloud and sun-glint gaps; coastal waters are optically complex.' },
  },
  {
    id: 'rec_storm', title: 'Storm Signals', subtitle: 'Rainfall intensity and the monsoon pulse', cost: 5,
    palette: { main: '#6a8bff', accent: '#c9d6ff', label: '#0a1236' }, variant: 'storm',
    variable: 'Monthly mean precipitation rate', unit: 'mm day⁻¹',
    xLabel: 'Month', labels: MONTHS,
    series: { A: { name: 'Tropical monsoon region, year A', values: monthly(5.2, 5.0, -2.2, 0.8) }, B: { name: 'Tropical monsoon region, year B', values: monthly(5.6, 5.6, -2.1, 1.0) } },
    points: [[20, 80, 0.9], [15, 100, 0.8], [5, 105, 0.7], [0, -60, 0.8], [-5, 20, 0.6], [10, -85, 0.55], [35, -80, 0.4], [30, 130, 0.5], [-20, 45, 0.4]],
    sound: { instrument: 'rain-pulses', map: 'Pulse rate ← precipitation rate (heavier rain = faster pulses). Pitch ← rate. Low-pass opens with intensity.' },
    explanation: 'Seasonal monsoon rain follows the movement of the tropical rain belt. Space-based radiometers and radar combine into gridded rain estimates in millimetres per day.',
    discovery: { kinds: ['diff-at-peak', 'max-B'] },
    source: { title: 'GPM IMERG Final precipitation product — monthly regional precipitation series', org: 'NASA GPM / GES DISC', url: 'https://gpm.nasa.gov/data/directory', version: 'IMERG V07B is the current algorithm family. The exact monthly product/granule, parameter and unit conversion must be recorded at download; monthly accumulation (mm) must not be confused with mean rate (mm day⁻¹).', doi: 'Use the DOI attached to the exact IMERG collection and version downloaded; not asserted in this build.', variable: 'Precipitation (calibrated)', units: 'mm day⁻¹ (monthly mean rate)', coverage: 'Near-global, monthly IMERG grid (nominal 0.1°); exact product file and selected variable must be recorded', license: 'NASA open data policy — cite GES DISC', processing: 'No IMERG file is bundled. Select and cite the exact V07B Final monthly accumulation product and precipitation variable. If the downloaded monthly value is an accumulation in mm, divide by the exact number of calendar days to obtain mm day⁻¹; if the file already stores a rate, do not divide again. Calculate a documented area-weighted regional mean.', limitations: 'Light and orographic rain are harder to estimate than convective rain.' },
  },
  {
    id: 'rec_air', title: 'Atmosphere in Motion', subtitle: 'Aerosol optical thickness', cost: 6,
    palette: { main: '#c46bff', accent: '#ffc2ff', label: '#220a33' }, variant: 'air',
    variable: 'Aerosol optical thickness (AOT, 550 nm)', unit: 'dimensionless',
    xLabel: 'Month', labels: MONTHS,
    series: { A: { name: 'Dust-affected region, year A', values: monthly(0.32, 0.2, -0.6, 0.05).map(v => Math.round(v * 100) / 100) }, B: { name: 'Dust-affected region, year B', values: monthly(0.38, 0.24, -0.5, 0.06).map(v => Math.round(v * 100) / 100) } },
    points: [[18, -15, 0.95], [20, 10, 0.8], [25, 45, 0.7], [35, 100, 0.55], [25, 80, 0.7], [-25, 20, 0.3], [40, -100, 0.2], [60, 60, 0.25]],
    sound: { instrument: 'drone-shimmer', map: 'Drone brightness (filter cut-off) ← AOT. Pitch ← AOT (higher haze = higher pitch). Tremolo depth ← month-to-month change.' },
    explanation: 'Aerosols such as desert dust and smoke scatter and absorb sunlight. AOT measures how much light is blocked along a vertical column of air; reanalysis products assimilate satellite observations to fill the globe.',
    discovery: { kinds: ['max-A', 'max-B'] },
    source: { title: 'MERRA-2 tavgM_2d_aer_Nx: Monthly mean aerosol diagnostics (M2TMNXAER)', org: 'NASA GES DISC (GMAO MERRA-2)', url: 'https://search.earthdata.nasa.gov/search?q=M2TMNXAER', version: 'M2TMNXAER collection, V5.12.4; monthly mean 2-D aerosol diagnostics. Confirm variable name, granule and reprocessing record in the downloaded metadata.', doi: 'Use the DOI supplied by the selected Earthdata collection/version; not asserted in this build.', variable: 'Total aerosol extinction AOT 550 nm', units: 'dimensionless', coverage: 'Global, monthly, 0.5° × 0.625°, 1980–present', license: 'NASA open data policy — cite GMAO', processing: 'No MERRA-2 file is bundled. Select the exact M2TMNXAER monthly granule and total aerosol extinction AOT 550 nm variable from its metadata; apply missing-value handling and calculate an area-weighted mean over a fixed documented region. This is a reanalysis diagnostic, not a direct surface air-quality measurement.', limitations: 'A reanalysis (model + assimilated observations), not a pure measurement.' },
  },
  {
    id: 'rec_land', title: 'Earth in Motion', subtitle: 'Seasonal greening of the land surface', cost: 6,
    palette: { main: '#8cff4d', accent: '#e8ffb0', label: '#0e2a05' }, variant: 'land', surface: 'land',
    variable: 'Vegetation greenness index (NDVI)', unit: 'dimensionless',
    xLabel: 'Month', labels: MONTHS,
    series: { A: { name: 'Mid-latitude northern grassland, year A', values: monthly(0.42, 0.28, -1.9, 0.03).map(v => Math.round(v * 100) / 100) }, B: { name: 'Same region, year B', values: monthly(0.38, 0.26, -1.9, 0.03).map(v => Math.round(v * 100) / 100) } },
    points: [[45, -100, 0.8], [50, 30, 0.7], [40, 110, 0.6], [-30, -60, 0.5], [-25, 135, 0.3], [5, 20, 0.9], [-5, -65, 0.95], [60, 100, 0.5]],
    sound: { instrument: 'marimba-growth', map: 'Pitch ← NDVI (greener = higher note, major scale). Note length ← greenness; silence at near-zero NDVI.' },
    explanation: 'Plants reflect more near-infrared light than red light. NDVI compares the two and traces the seasonal rise and fall of green vegetation visible from space.',
    discovery: { kinds: ['higher-peak', 'max-B'] },
    source: { title: 'MODIS/Aqua Vegetation Indices Monthly L3 Global 0.05Deg CMG (MYD13C2.061) — candidate product, no measurements bundled', org: 'NASA LP DAAC / NASA GSFC', url: 'https://catalog.data.gov/dataset/modis-aqua-vegetation-indices-monthly-l3-global-0-05deg-cmg-v061', version: 'MYD13C2.061 is a monthly 0.05° global Aqua-MODIS candidate. Confirm the product, NDVI science data set, scale factor, QA filtering and temporal window from the downloaded metadata.', doi: '10.5067/MODIS/MYD13C2.061', variable: 'NDVI', units: 'dimensionless', coverage: 'Global land; monthly 0.05° CMG candidate MYD13C2.061; confirm actual granule metadata', license: 'NASA open data policy', processing: 'No MYD13C2.061 granule is bundled. Read the NDVI science data set, apply the scale factor and QA rules specified by that product version, reject fill values, then calculate an area-weighted monthly mean over a fixed documented region. Preserve the original integer values and QA metadata.', limitations: 'The exact product and version have not been verified during this build.' },
  },
  {
    id: 'rec_ice', title: 'Ice Memory', subtitle: 'Arctic sea-ice extent through the seasons', cost: 7,
    palette: { main: '#9ff0ff', accent: '#ffffff', label: '#06242e' }, variant: 'ice', surface: 'ocean',   // sea ice floats on the ocean
    variable: 'Sea-ice extent', unit: 'million km²',
    xLabel: 'Month', labels: MONTHS,
    series: { A: { name: 'Arctic, early period', values: [15.4, 16.0, 15.9, 14.7, 13.1, 11.3, 8.9, 7.0, 6.6, 8.3, 10.9, 13.5].map(v => r1(v)) }, B: { name: 'Arctic, recent period', values: [14.2, 14.9, 14.8, 13.6, 12.0, 10.0, 7.2, 5.1, 4.6, 6.2, 9.0, 12.2].map(v => r1(v)) } },
    points: [[85, 0, 1], [80, 90, 0.9], [85, -90, 0.9], [76, 150, 0.7], [74, -150, 0.7], [76, 40, 0.6], [74, -66, 0.5], [75, 180, 0.8]],
    sound: { instrument: 'glass-choir', map: 'Pitch ← extent (more ice = lower, deeper note; less ice = higher, thinner). Two voices play the two periods; the gap between them is the difference.' },
    explanation: 'Arctic sea ice reaches its minimum in September and its maximum around March. Comparing an earlier and a recent period shows how much the seasonal minimum has shrunk.',
    discovery: { kinds: ['min-B', 'max-B'] },
    source: { title: 'Sea Ice Index, Version 4 (G02135)', org: 'National Snow and Ice Data Center (NSIDC)', url: 'https://nsidc.org/data/g02135/versions/4', version: 'G02135 Version 4; preserve the version and processing metadata stated in each source file.', doi: '10.7265/a98x-0f50', variable: 'Sea-ice extent (area of ocean with ≥15% ice concentration)', units: 'million km²', coverage: 'Arctic and Antarctic, monthly and daily, 1978–present', license: 'NSIDC data use and citation policy', processing: 'No G02135 file is bundled. Use the NSIDC monthly Arctic extent series for both stated periods, keep Arctic and Antarctic products separate, and preserve the Version 4 citation and source-file metadata. Extent is based on the sea-ice concentration threshold (15%); it is not ice volume or thickness.', limitations: 'Extent is not volume or thickness; passive-microwave resolution is coarse (25 km).' },
  },
  {
    id: 'rec_temperature', title: 'Fever Chart', subtitle: 'Provisional global anomaly snapshot (Oct 2025–Sep 2026)', cost: 3,
    palette: { main: '#ff5a5f', accent: '#ffd2a8', label: '#33060f' }, variant: 'temperature',
    variable: 'Global land-ocean surface temperature anomaly', unit: '°C anomaly (vs 1951–1980 monthly mean)',
    expectedUnits: '°C anomaly relative to the corresponding 1951–1980 monthly mean',
    xLabel: 'Month', labels: TEMP_LABELS, singleSeries: true, spatial: false, refLine: 0,
    series: { A: { name: '1951–1980 reference (0.00 °C by definition)', values: TEMP_A, reference: true }, B: { name: 'Global anomaly, GISTEMP v4 snapshot (provisional)', values: TEMP_B } },
    points: [], // global time series: NO geographic points exist, so none are drawn
    builtinStatus: 'provisional',
    builtinProvenance: TEMP_PROVENANCE,
    sound: { instrument: 'warm-pad', map: 'Pitch ← anomaly (warmer than the 1951–1980 mean = higher note, major scale; the zero line is the lowest note). Brightness (filter) ← anomaly. One note per month. The reference line is not played. Stereo is centred: this is a global number, so there is no location to pan to.' },
    explanation: 'Each value is how much warmer (positive) or cooler (negative) the global average surface was in that month compared with the average of the same calendar month during 1951–1980. It is an anomaly, not the absolute temperature of the Earth. The zero line is that 1951–1980 reference.',
    discovery: { kinds: ['max-B'], q: 'Which month in this 12-month window has the highest global temperature anomaly?' },
    source: { title: 'GISS Surface Temperature Analysis (GISTEMP) v4 — Land-Ocean Temperature Index, global monthly mean', org: 'NASA Goddard Institute for Space Studies (GISS)', url: 'https://data.giss.nasa.gov/gistemp/data_v4.html', version: 'GISTEMP v4; this bundled 12-month candidate is secondary-tracker copied and remains PROVISIONAL until checked against the official CSV.', csvUrl: 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv', doi: 'Not stated here', variable: 'Global mean surface temperature anomaly (land + ocean)', units: '°C, relative to the corresponding 1951–1980 monthly mean', coverage: 'Global mean, monthly (this record: Oct 2025 – Sep 2026; the product starts in 1880)', license: 'NASA open data policy — cite NASA GISS GISTEMP v4', processing: 'Values were copied without adjustment from a secondary tracker that names the official GISTEMP CSV as its source. They have NOT been compared with the official CSV in this build (the official site was unreachable), so this record is PROVISIONAL.', limitations: 'Monthly values can be revised in later GISTEMP updates. A global mean hides regional differences. An anomaly is not an absolute temperature.' },
  },
];


export const getRecord = id => RECORDS.find(r => r.id === id);

// ---------------------------------------------------------------------------------------------------------------------------------
// Discovery questions are COMPUTED from the series that is actually loaded. Nothing assumes 12 values or that index 6 is July.
// ---------------------------------------------------------------------------------------------------------------------------------
const finiteArr = a => Array.isArray(a) && a.length > 0 && a.every(v => typeof v === 'number' && Number.isFinite(v));
const uniqueExtreme = (arr, f) => { const t = f(...arr); const idx = []; arr.forEach((v, i) => { if (v === t) idx.push(i); }); return idx.length === 1 ? idx[0] : -1; };
export const isCalendarMonths = L => Array.isArray(L) && L.length === 12 && L.every((x, i) => typeof x === 'string' && x.slice(0, 3).toLowerCase() === MONTHS[i].toLowerCase());
const SEASONS = ['Winter (Dec–Feb)', 'Spring (Mar–May)', 'Summer (Jun–Aug)', 'Autumn (Sep–Nov)'];
const seasonOf = i => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][i];
// deterministic option list with the correct answer at a data-dependent (not fixed) position
function arrange(correct, distractors, seed) {
  const d = [...new Set(distractors.filter(x => x !== correct))].slice(0, 3); const opts = d.slice(); const pos = Math.abs(Math.round(seed)) % (opts.length + 1); opts.splice(pos, 0, correct); return { options: opts, correct: pos };
}
function spread(L, idx) { const others = L.map((_, i) => i).filter(i => i !== idx); if (!others.length) return []; const k = Math.min(3, others.length); const out = []; for (let j = 0; j < k; j++) out.push(L[others[Math.floor(((j + 0.5) * others.length) / k)]]); return out; }
const shortUnit = u => String(u || '').split(' (')[0].trim();

const BUILDERS = {
  'max-B': (rec, A, B, L) => { const i = uniqueExtreme(B, Math.max); if (i < 0 || L.length < 3) return null; const r = arrange(L[i], spread(L, i), i * 5 + 1); return { q: rec.discovery.q || `Which time step has the highest value in "${rec.series.B.name}"?`, ...r }; },
  'min-B': (rec, A, B, L) => { const i = uniqueExtreme(B, Math.min); if (i < 0 || L.length < 3) return null; const r = arrange(L[i], spread(L, i), i * 5 + 2); return { q: `Which time step has the lowest value in "${rec.series.B.name}"?`, ...r }; },
  'max-A': (rec, A, B, L) => { const i = uniqueExtreme(A, Math.max); if (i < 0 || L.length < 3) return null; const r = arrange(L[i], spread(L, i), i * 5 + 3); return { q: `Which time step has the highest value in "${rec.series.A.name}"?`, ...r }; },
  'higher-peak': (rec, A, B) => { const a = Math.max(...A), b = Math.max(...B); const nA = rec.series.A.name, nB = rec.series.B.name; const opts = [nA, nB, 'They are equal']; return { q: 'Which series reaches the higher peak?', options: opts, correct: a > b ? 0 : b > a ? 1 : 2 }; },
  'season-max-B': (rec, A, B, L) => { if (!isCalendarMonths(L)) return null; const i = uniqueExtreme(B, Math.max); if (i < 0) return null; const s = seasonOf(i); return { q: `In which (northern-hemisphere) season does "${rec.series.B.name}" peak?`, options: SEASONS.slice(), correct: s }; },
  'diff-at-peak': (rec, A, B, L) => { const i = uniqueExtreme(B, Math.max); if (i < 0) return null; const u = shortUnit(rec.unit.replace(/\(illustrative\)/i, '')), diff = Math.round((B[i] - A[i]) * 100) / 100; const step = Math.max(0.1, Math.round(Math.abs(diff) * 40) / 100); const f = v => `${(Math.round(v * 100) / 100).toFixed(2)} ${u}`; const r = arrange(f(diff), [f(diff + step), f(diff - step), f(diff + 2 * step)], i + 4); return { q: `At ${L[i]} (the peak of series B), what is B − A?`, ...r }; },
};

export function discoveryFor(rec, data) {
  const L = data.labels, A = data.series.A.values, B = data.series.B.values;
  if (!finiteArr(A) || !finiteArr(B) || A.length !== L.length || B.length !== L.length) return { q: 'This record has no usable series, so no question can be asked.', options: ['—', '—'], correct: 0, unavailable: true, basis: 'none' };
  for (const k of rec.discovery.kinds) { const b = BUILDERS[k] && BUILDERS[k](rec, A, B, L); if (b && b.options.length >= 2) return { ...b, kind: k, basis: 'computed from the loaded series' }; }
  return { q: 'No unambiguous question exists for this data (every candidate has a tie), so there is nothing to solve.', options: ['—', '—'], correct: 0, unavailable: true, basis: 'none' };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Validation. Three separate checks are reported: structure, units, source verification. Only all three together can give "observed".
// ---------------------------------------------------------------------------------------------------------------------------------
const PROV_FIELDS = ['producer', 'dataset', 'sourceUrl', 'retrieved', 'periodA', 'periodB', 'units'];
// Accepted unit spellings per record (case-insensitive). A file whose units do not look like the quantity the record is built for is rejected.
const UNIT_PATTERNS = { rec_fire: /detect|count|index|fire/i, rec_ocean: /mg\s*(m|\/\s*m)/i, rec_storm: /mm\s*(day|d\b)|mm\s*\/\s*(day|d\b)/i, rec_air: /dimensionless|unitless|optical|aot/i, rec_land: /dimensionless|unitless|ndvi|index/i, rec_ice: /million\s*km|10\^?6\s*km|km\s*(2|²)/i };
const normUnits = u => String(u || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function validateRecordData(j, rec) {
  const errors = [], unitErrors = [], fin = v => typeof v === 'number' && Number.isFinite(v);
  if (!j || typeof j !== 'object') return { ok: false, structureValid: false, unitsValid: false, errors: ['not an object'], unitErrors: [] };
  const pv = j.provenance;
  if (!pv || typeof pv !== 'object') errors.push('provenance must be an object (producer, dataset, sourceUrl, retrieved, periodA, periodB, units)');
  else {
    for (const k of PROV_FIELDS) if (typeof pv[k] !== 'string' || !pv[k].trim()) errors.push(`provenance.${k} is missing`);
    if (typeof pv.sourceUrl === 'string' && !/^https:\/\//.test(pv.sourceUrl)) errors.push('provenance.sourceUrl must be an https URL');
    if (typeof pv.retrieved === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(pv.retrieved)) errors.push('provenance.retrieved must be YYYY-MM-DD');
    if (pv.verification !== undefined && (typeof pv.verification !== 'object' || !['verified', 'provisional'].includes(pv.verification.status))) errors.push('provenance.verification.status must be "verified" or "provisional"');
  }
  if (!Array.isArray(j.labels) || j.labels.length < 2 || j.labels.some(x => typeof x !== 'string' || !x)) errors.push('labels must be an array of at least 2 non-empty strings');
  else if (new Set(j.labels).size !== j.labels.length) errors.push('labels contain duplicates');
  const n = Array.isArray(j.labels) ? j.labels.length : 0;
  for (const k of ['A', 'B']) {
    const sr = j.series && j.series[k];
    if (!sr || !Array.isArray(sr.values)) { errors.push(`series.${k}.values is missing`); continue; }
    if (sr.values.length !== n) errors.push(`series.${k} has ${sr.values.length} values but there are ${n} labels`);
    sr.values.forEach((v, i) => { if (!fin(v)) errors.push(`series.${k}[${i}] is not a finite number (${String(v)})`); });
    if (typeof sr.name !== 'string' || !sr.name) errors.push(`series.${k}.name is missing`);
  }
  if (j.points !== undefined) {
    if (!Array.isArray(j.points) || j.points.some(p => !Array.isArray(p) || p.length < 2 || !fin(p[0]) || !fin(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180 || (p[2] !== undefined && (!fin(p[2]) || p[2] < 0 || p[2] > 1)))) errors.push('points must be [lat -90..90, lon -180..180, weight 0..1]');
  }
  // A location must sit on the kind of surface the variable is about (fires burn on land, chlorophyll is measured in the ocean, sea ice floats on the ocean).
  if (rec && rec.surface && rec.surface !== 'any' && Array.isArray(j.points) && !errors.length) { const bad = j.points.filter(p => surfaceAt(p[0], p[1]) !== rec.surface); if (bad.length) errors.push(`${bad.length} point(s) are not on ${rec.surface} (for example ${bad[0][0]}°, ${bad[0][1]}°): "${rec.variable}" is only meaningful on ${rec.surface}`); }
  // Optional visual frames (e.g. NASA Earth Information Center images). A frame must say exactly what it is and where it came from.
  if (j.frames !== undefined) {
    if (!Array.isArray(j.frames)) errors.push('frames must be an array');
    else j.frames.forEach((f, k) => {
      const tag = `frames[${k}]`;
      if (!f || typeof f !== 'object') { errors.push(`${tag} must be an object`); return; }
      if (typeof f.src !== 'string' || !/^(data\/[\w./-]+|https:\/\/\S+)$/.test(f.src) || /\.\./.test(f.src)) errors.push(`${tag}.src must be a path under data/ or an https URL`);
      if (!Number.isInteger(f.labelIndex) || f.labelIndex < 0 || f.labelIndex >= n) errors.push(`${tag}.labelIndex must point at one of the ${n} time steps`);
      for (const key of ['title', 'credit', 'date']) if (typeof f[key] !== 'string' || !f[key].trim()) errors.push(`${tag}.${key} is missing`);
      if (typeof f.sourceUrl !== 'string' || !/^https:\/\//.test(f.sourceUrl)) errors.push(`${tag}.sourceUrl must be an https URL of the original asset`);
      if (f.origin !== undefined && !['NASA-EIC', 'other'].includes(f.origin)) errors.push(`${tag}.origin must be "NASA-EIC" or "other"`);
    });
  }
  // units: must match what the record expects (when the record declares it) — a mismatch means the file describes another quantity
  if (rec && UNIT_PATTERNS[rec.id] && pv && typeof pv.units === 'string' && !UNIT_PATTERNS[rec.id].test(pv.units)) unitErrors.push(`units "${pv.units}" do not look like the quantity this record is built for (${rec.unit})`);
  if (rec && rec.expectedUnits && pv && typeof pv.units === 'string' && normUnits(pv.units) !== normUnits(rec.expectedUnits)) unitErrors.push(`units "${pv.units}" do not match the units this record is built for ("${rec.expectedUnits}")`);
  if (rec && rec.spatial === false && Array.isArray(j.points) && j.points.length) unitErrors.push('this record is a global (non-spatial) series, so it must not carry geographic points');
  return { ok: errors.length === 0 && unitErrors.length === 0, structureValid: errors.length === 0, unitsValid: unitErrors.length === 0, errors: [...errors, ...unitErrors], unitErrors };
}
export const normalisePoints = pts => (Array.isArray(pts) ? pts : []).map(p => [p[0], p[1], Number.isFinite(p[2]) ? p[2] : 0.5]);

// Is the file source-verified? Only an explicit, complete verification statement counts. A valid shape or a NASA name/URL never does.
export function sourceVerified(pv) {
  const v = pv && pv.verification;
  if (!v || v.status !== 'verified' || typeof v.comparedWith !== 'string' || !/^https:\/\//.test(v.comparedWith)) return false;
  const date = typeof v.comparedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.comparedOn)
    ? new Date(`${v.comparedOn}T00:00:00Z`) : null;
  const validDate = !!date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v.comparedOn;
  return validDate && v.allValuesMatched === true && typeof v.method === 'string' && v.method.trim().length >= 8;
}

export function statusLabel(d) {
  if (!d) return { text: 'NO DATA', cls: 'rej', short: 'none' };
  switch (d.status) {
    case 'observed': return { text: 'OBSERVED — SOURCE-VERIFIED', cls: 'obs', short: 'observed' };
    case 'provisional': return { text: d.userSupplied ? 'USER-SUPPLIED — NOT VERIFIED' : 'PROVISIONAL — NOT INDEPENDENTLY VERIFIED', cls: 'prov', short: 'provisional' };
    case 'live': return { text: 'LIVE — NASA API DATA (not a verified archive)', cls: 'live', short: 'live' };
    case 'rejected': return { text: 'REJECTED FILE — ILLUSTRATIVE CURVES SHOWN', cls: 'rej', short: 'rejected' };
    default: return { text: 'ILLUSTRATIVE DATA — NOT NASA OBSERVATIONS', cls: '', short: 'illustrative' };
  }
}

function fromValid(rec, j, extra) {
  const pv = j.provenance, ok = sourceVerified(pv);
  const userSupplied = !(pv.verification && pv.verification.status);   // no statement at all = whoever supplied it did not claim a check
  const status = ok ? 'observed' : 'provisional';
  const base = `${pv.dataset} — ${pv.producer}. Source: ${pv.sourceUrl}. Copy retrieved ${pv.retrieved}. Period A: ${pv.periodA}. Period B: ${pv.periodB}. Units: ${pv.units}.${pv.mirrorUrl ? ` Secondary copy source: ${pv.mirrorUrl}. ${pv.mirrorNote || ''}` : ''}`;
  const incompleteClaim = pv.verification && pv.verification.status === 'verified' && !ok;
  const provisionalReason = incompleteClaim ? 'The file claims verification, but its verification record is incomplete or invalid (a valid official HTTPS comparison URL, real comparison date, allValuesMatched=true, and a reproducible method are required). The record is downgraded to PROVISIONAL.' : ((pv.verification && pv.verification.note) || 'the file has not been compared with the official source.');
  const note = ok ? `OBSERVED (source-verified on ${pv.verification.comparedOn} against ${pv.verification.comparedWith}). ${base}` : `${userSupplied ? 'USER-SUPPLIED, NOT VERIFIED' : 'PROVISIONAL, NOT INDEPENDENTLY VERIFIED'}: ${provisionalReason} ${base}`;
  const series = { A: { ...(rec.series.A.reference ? { reference: true } : {}), ...j.series.A }, B: j.series.B };
  return { labels: j.labels, series, points: normalisePoints(j.points), frames: Array.isArray(j.frames) ? j.frames : [], status, userSupplied: !ok && userSupplied, units: pv.units, provenance: pv, note, structureValid: true, unitsValid: true, sourceVerified: ok, ...extra };
}

// Load data for a record: (1) data/<id>.json when listed in data/index.json and valid; (2) the built-in provisional snapshot (temperature);
// (3) otherwise the illustrative curves. A rejected file never silently replaces anything and never lends its points to other data.
let manifestPromise = null;
function loadManifest() { if (!manifestPromise) manifestPromise = fetch('data/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : { records: [] }).catch(() => ({ records: [] })); return manifestPromise; }
export function resetManifestCache() { manifestPromise = null; }
export function builtinData(rec) {
  if (rec.builtinStatus === 'provisional') { const j = { provenance: rec.builtinProvenance, labels: rec.labels, series: rec.series, points: [] }; const v = validateRecordData(j, rec); if (v.ok) return fromValid(rec, j, { builtin: true }); }
  return { labels: rec.labels, series: rec.series, points: normalisePoints(rec.points), pointsAreIllustrative: true, status: 'illustrative', units: rec.unit || '', note: 'VERIFIED DATA NOT AVAILABLE: these curves are ILLUSTRATIVE demonstration values, not NASA observations. Any hot-spot positions are illustrative too.', structureValid: true, unitsValid: true, sourceVerified: false };
}
export async function loadRecordData(rec) {
  const base = builtinData(rec);
  try {
    const man = await loadManifest(); if (!man.records || !man.records.includes(rec.id)) return base;
    let res; try { res = await fetch(`data/${rec.id}.json`, { cache: 'no-cache' }); } catch (e) { return { ...base, loadError: `data/${rec.id}.json could not be fetched (${e && e.message || e}).`, note: base.note + ` (data/${rec.id}.json could not be fetched.)` }; }
    if (!res.ok) return { ...base, loadError: `data/${rec.id}.json returned HTTP ${res.status}.`, note: base.note + ` (data/${rec.id}.json could not be loaded: HTTP ${res.status}.)` };
    let j; try { j = await res.json(); } catch (e) { return rejected(base, rec, [`the file is not valid JSON (${e && e.message || e})`]); }
    const v = validateRecordData(j, rec);
    if (!v.ok) return rejected(base, rec, v.errors, v);
    return fromValid(rec, j);
  } catch (e) { return { ...base, loadError: String(e && e.message || e) }; }
}
function rejected(base, rec, errors, v) {
  const fallback = base.status === 'provisional' ? base : base;   // the built-in data (illustrative or the built-in provisional snapshot) stay on screen, clearly marked
  return { ...fallback, status: base.status === 'provisional' ? 'provisional' : 'rejected', rejected: errors, rejectedFile: true, structureValid: v ? v.structureValid : false, unitsValid: v ? v.unitsValid : true, note: `A data file for this record was found but REJECTED: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}. ${base.status === 'illustrative' ? 'Illustrative curves are shown instead.' : 'The built-in provisional snapshot is shown instead.'}` };
}
