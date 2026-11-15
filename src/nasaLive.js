// ORBITAL — live NASA data for the Jukebox records and the Science Lab.
//
// Each record is fed from a real NASA API at run time:
//   NASA EONET v3  (https://eonet.gsfc.nasa.gov/api/v3)        -> rec_fire, rec_storm, rec_land, rec_ice (event counts)
//   NASA POWER     (https://power.larc.nasa.gov/api/temporal)  -> rec_ocean, rec_air, rec_ice, rec_temperature
//
// HONESTY RULES
//  * A record becomes status 'live' only when every number on screen came from a successful API response in THIS session.
//  * The record's variable/unit/explanation/source are rewritten to say what the API really measures (e.g. wildfire EVENTS from EONET,
//    not FIRMS pixel detections; POWER 2 m AIR temperature, not chlorophyll). Nothing is relabelled as an unrelated NASA product.
//  * If the network or API fails, the caller falls back to the existing loader (illustrative / provisional data with its warning).
//  * Live API data is NOT 'observed' (source-verified against an official table): it is labelled LIVE — NASA API.

const EONET = 'https://eonet.gsfc.nasa.gov/api/v3';
const POWER = 'https://power.larc.nasa.gov/api/temporal/monthly/point';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const r2 = v => Math.round(v * 100) / 100;
const DAY = 864e5;

// ---------- fetch with timeout + per-session cache (several records share requests) ----------
const cache = new Map();
export function resetLiveCache() { cache.clear(); }
function getJSON(url, ms = 20000) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
      return await r.json();
    } finally { if (t) clearTimeout(t); }
  })();
  cache.set(url, p); p.catch(() => cache.delete(url));   // failures are never cached
  return p;
}

// ---------- shared helpers ----------
const iso = d => d.toISOString().slice(0, 10);
const monthIndex = (y, m) => y * 12 + m;                       // m = 0..11
const labelOf = idx => `${MONTHS[idx % 12]} ${Math.floor(idx / 12)}`;

// the 12 months ending with the current (UTC) month, as absolute month indexes
function rolling12(now = new Date()) {
  const end = monthIndex(now.getUTCFullYear(), now.getUTCMonth());
  return Array.from({ length: 12 }, (_, i) => end - 11 + i);
}

// ---------- EONET ----------
// Event start = its earliest geometry date. EONET geometries are Points or Polygons (coordinates [lon, lat] / rings).
function eventStart(ev) {
  const ds = (ev.geometry || []).map(g => Date.parse(g.date)).filter(Number.isFinite);
  return ds.length ? Math.min(...ds) : NaN;
}
function lonLat(g) {
  if (!g || !g.coordinates) return null;
  let c = g.coordinates;
  if (g.type === 'Polygon') { const ring = c[0] || []; if (!ring.length) return null; c = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]; }
  else if (g.type !== 'Point') return null;
  return Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null;
}
function eonetUrl(category, params) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return category ? `${EONET}/categories/${category}?${q}` : `${EONET}/events?${q}`;
}
// events that STARTED in each of the 12 months of a window ending at `endIdx`
async function eventsPerMonth(category, monthsB, yearsBack) {
  const first = monthsB[0] - 12 * yearsBack, last = monthsB[11] - 12 * yearsBack;
  const start = new Date(Date.UTC(Math.floor(first / 12), first % 12, 1)), end = new Date(Date.UTC(Math.floor(last / 12), last % 12 + 1, 0));
  const limit = 1000;
  const j = await getJSON(eonetUrl(category, { status: 'all', start: iso(start), end: iso(end), limit }));
  if (!j || !Array.isArray(j.events)) throw new Error('EONET returned no events array');
  const counts = Array(12).fill(0);
  j.events.forEach(ev => { const t = eventStart(ev); if (!Number.isFinite(t)) return; const d = new Date(t); const idx = monthIndex(d.getUTCFullYear(), d.getUTCMonth()) - first; if (idx >= 0 && idx < 12) counts[idx]++; });
  return { counts, truncated: j.events.length >= limit, total: j.events.length };
}
// map points: where the OPEN events are now (latest known position)
async function openEventPoints(category, max = 60) {
  const j = await getJSON(eonetUrl(category, { status: 'open', limit: max }));
  if (!j || !Array.isArray(j.events)) throw new Error('EONET returned no open-events array');
  const pts = [];
  j.events.forEach(ev => {
    const g = (ev.geometry || []).slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).pop(), ll = lonLat(g);
    if (ll) pts.push({ lat: ll[1], lon: ll[0], mag: Number.isFinite(g.magnitudeValue) ? g.magnitudeValue : null });
  });
  const mags = pts.map(p => p.mag).filter(v => v !== null), hi = mags.length ? Math.max(...mags) : 0;
  return { points: pts.map(p => [r2(p.lat), r2(p.lon), hi > 0 && p.mag !== null ? Math.max(0.25, Math.min(1, p.mag / hi)) : 0.6]), count: j.events.length };
}

// ---------- POWER ----------
const powerUrl = (par, lon, lat, y0, y1) => `${POWER}?parameters=${par}&community=RE&longitude=${lon}&latitude=${lat}&start=${y0}&end=${y1}&format=JSON`;
const validNum = v => typeof v === 'number' && Number.isFinite(v) && v > -900;
function powerMonthly(json, par) {          // -> Map(absMonthIdx -> value), ignoring fill values and the "13" annual key
  const o = json && json.properties && json.properties.parameter && json.properties.parameter[par];
  if (!o) throw new Error('NASA POWER response has no ' + par + ' parameter');
  const m = new Map();
  Object.entries(o).forEach(([k, v]) => { const y = +k.slice(0, 4), mo = +k.slice(4) - 1; if (mo >= 0 && mo < 12 && validNum(v)) m.set(monthIndex(y, mo), v); });
  return m;
}
// the latest 12 consecutive months with data, plus the same months a year earlier
function lastWindowWithData(map) {
  const keys = [...map.keys()].sort((a, b) => a - b); if (!keys.length) throw new Error('NASA POWER returned no valid monthly values');
  for (let e = keys[keys.length - 1]; e - 11 >= keys[0]; e--) {
    const win = Array.from({ length: 12 }, (_, i) => e - 11 + i);
    if (win.every(k => map.has(k))) return win;
  }
  throw new Error('NASA POWER returned fewer than 12 consecutive monthly values');
}
async function powerTwoYears(par, lon, lat) {
  const y = new Date().getUTCFullYear();
  const map = powerMonthly(await getJSON(powerUrl(par, lon, lat, y - 2, y)), par);
  const win = lastWindowWithData(map);
  const prev = win.map(k => k - 12);
  if (!prev.every(k => map.has(k))) throw new Error('NASA POWER lacks the same months of the previous year');
  return { labels: win.map(labelOf), prevLabels: prev.map(labelOf), A: prev.map(k => r2(map.get(k))), B: win.map(k => r2(map.get(k))), win };
}
async function powerAnomaly(lon, lat) {
  const y = new Date().getUTCFullYear();
  const [recent, clim] = await Promise.all([getJSON(powerUrl('T2M', lon, lat, y - 2, y)), getJSON(powerUrl('T2M', lon, lat, 1991, 2020))]);
  const rm = powerMonthly(recent, 'T2M'), cm = powerMonthly(clim, 'T2M');
  const sum = Array(12).fill(0), cnt = Array(12).fill(0);
  cm.forEach((v, k) => { sum[k % 12] += v; cnt[k % 12]++; });
  if (cnt.some(c => c < 20)) throw new Error('NASA POWER climatology (1991–2020) is incomplete');
  const win = lastWindowWithData(rm);
  return { labels: win.map(labelOf), B: win.map(k => r2(rm.get(k) - sum[k % 12] / cnt[k % 12])), win };
}

// ---------- per-record definitions: how each Jukebox record is fed, and how it is described honestly ----------
const eonetSource = (what, cat) => ({
  title: `NASA EONET v3 — ${what}`, org: 'NASA Earth Observatory Natural Event Tracker (EONET), Goddard Space Flight Center', url: 'https://eonet.gsfc.nasa.gov/',
  version: 'EONET API v3 (live request made when this record was opened)', doi: 'No DOI — a live API, not a versioned archive', license: 'NASA open data policy — cite NASA EONET',
  coverage: cat ? `Global; EONET category "${cat}"` : 'Global; all EONET categories', csvUrl: undefined,
});
const powerSource = (what, place) => ({
  title: `NASA POWER monthly point data — ${what}`, org: 'NASA Langley Research Center, Prediction of Worldwide Energy Resources (POWER)', url: 'https://power.larc.nasa.gov/',
  version: 'POWER monthly/point API, community RE (live request made when this record was opened)', doi: 'No DOI — a live API', license: 'NASA open data policy — cite NASA POWER',
  coverage: `One grid point: ${place}`,
});
const eventNote = 'EONET lists natural events reported from many sources; the count of events is not a measure of area, intensity or satellite pixels, and reporting practice changes over time. The most recent months can be incomplete.';

const DEFS = {
  rec_fire: {
    kind: 'eonet', category: 'wildfires', surface: 'land',
    variable: 'Wildfire events started per month (NASA EONET)', unit: 'events / month', units: 'events started per month (count)', subtitle: 'Wildfire events per month (NASA EONET, live)',
    nameA: 'Same 12 months, one year earlier', nameB: 'Latest 12 months',
    explanation: 'Each value is the number of wildfire events that NASA EONET lists as having started in that month. Wildfires follow dry seasons, so counts rise and fall through the year. This is an event count, not the number of satellite fire pixels (FIRMS) and not burned area.',
    soundMap: 'Pitch ← events started in the month (more events = higher note, pentatonic scale). Event density ← the same count. Each month is one bar.',
    source: { ...eonetSource('wildfire events', 'Wildfires'), processing: 'Request: /categories/wildfires?status=all&start=…&end=…&limit=1000 for two 12-month windows. Each event is counted in the month of its earliest geometry date. Map spikes are the latest positions of currently OPEN wildfire events (status=open).', limitations: eventNote },
    points: true,
  },
  rec_storm: {
    kind: 'eonet', category: 'severeStorms', surface: 'any',
    variable: 'Severe-storm events started per month (NASA EONET)', unit: 'events / month', units: 'events started per month (count)', subtitle: 'Severe-storm events per month (NASA EONET, live)',
    nameA: 'Same 12 months, one year earlier', nameB: 'Latest 12 months',
    explanation: 'Each value is the number of severe-storm events (cyclones, major storm systems) that NASA EONET lists as starting in that month. Storm seasons differ by ocean basin, so the pattern follows them. This is an event count, not rainfall (GPM IMERG).',
    soundMap: 'Pitch ← storm events started in the month (more storms = higher note). Event density ← the same count. Each month is one bar.',
    source: { ...eonetSource('severe-storm events', 'Severe Storms'), processing: 'Request: /categories/severeStorms?status=all&start=…&end=…&limit=1000 for two 12-month windows; each event counted in the month of its earliest geometry date. Map spikes are the latest positions of currently OPEN severe-storm events.', limitations: eventNote },
    points: true,
  },
  rec_land: {
    kind: 'eonet', category: null, surface: 'any',
    variable: 'Natural events started per month, all categories (NASA EONET)', unit: 'events / month', units: 'events started per month (count)', subtitle: 'All natural events per month (NASA EONET, live)',
    nameA: 'Same 12 months, one year earlier', nameB: 'Latest 12 months',
    explanation: 'Each value is the number of natural events of any kind (wildfires, storms, volcanoes, floods, sea ice and more) that NASA EONET lists as starting in that month: a pulse of what Earth is doing. This is an event catalogue, not vegetation greenness (NDVI).',
    soundMap: 'Pitch ← all natural events started in the month (more events = higher note). Each month is one bar.',
    source: { ...eonetSource('all natural events', null), processing: 'Request: /events?status=all&start=…&end=…&limit=1000 for two 12-month windows; each event counted in the month of its earliest geometry date. If a window reaches the 1000-event limit it is flagged as truncated in the status note. Map spikes are the latest positions of currently OPEN events.', limitations: eventNote },
    points: true, openCategory: null,
  },
  rec_ice: {
    kind: 'power', par: 'T2M', lon: 15, lat: 78, surface: 'any',
    variable: 'Monthly mean 2 m air temperature at 78°N 15°E, Svalbard region (NASA POWER)', unit: '°C', units: '°C (monthly mean 2 m air temperature)', subtitle: 'Arctic air temperature, 78°N (NASA POWER, live)',
    nameA: 'Same 12 months, one year earlier', nameB: 'Latest 12 months',
    explanation: 'Sea ice forms and melts with the Arctic cold. Each value is the monthly mean 2 m air temperature at one Arctic grid point (78°N 15°E) from NASA POWER. It is air temperature at a single point, not sea-ice extent (NSIDC).',
    soundMap: 'Pitch ← temperature (warmer = higher note). Each month is one note. Stereo is centred on the single Arctic point.',
    source: { ...powerSource('T2M air temperature', '78°N, 15°E (Arctic, Svalbard region)'), processing: 'Request: monthly/point?parameters=T2M for the last two calendar years. The latest 12 consecutive months with valid data are series B; the same months a year earlier are series A. Fill values (−999) are rejected.', limitations: 'One 0.5° × 0.625° reanalysis-based grid cell, not an observation at a station; POWER lags real time by weeks.' },
    points: [[78, 15, 0.9]],
  },
  rec_ocean: {
    kind: 'power', par: 'T2M', lon: 29.91, lat: 31.2, surface: 'any',
    variable: 'Monthly mean 2 m air temperature at coastal Alexandria, 31.2°N 29.9°E (NASA POWER)', unit: '°C', units: '°C (monthly mean 2 m air temperature)', subtitle: 'Coastal air temperature, Alexandria (NASA POWER, live)',
    nameA: 'Same 12 months, one year earlier', nameB: 'Latest 12 months',
    explanation: 'The Mediterranean coast sets the seasons for the sea and its plankton. Each value is the monthly mean 2 m AIR temperature at the Alexandria grid point from NASA POWER. It is not sea temperature and not chlorophyll.',
    soundMap: 'Pitch ← air temperature (warmer = higher note). Stereo pan ← longitude of the grid point. Slow swelling pads, one per month.',
    source: { ...powerSource('T2M air temperature', '31.20°N, 29.91°E (Alexandria, Egypt)'), processing: 'Request: monthly/point?parameters=T2M for the last two calendar years. The latest 12 consecutive months with valid data are series B; the same months a year earlier are series A.', limitations: 'One grid cell; air temperature, not water temperature; POWER lags real time by weeks.' },
    points: [[31.2, 29.91, 0.9]],
  },
  rec_air: {
    kind: 'power', par: 'ALLSKY_SFC_SW_DWN', lon: 31.23, lat: 30.04, surface: 'any',
    variable: 'Monthly mean all-sky surface shortwave irradiance at Cairo, 30.0°N 31.2°E (NASA POWER)', unit: 'kWh m⁻² day⁻¹', units: 'kWh m⁻² day⁻¹ (monthly mean all-sky surface shortwave downward irradiance)', subtitle: 'Surface sunlight over Cairo (NASA POWER, live)',
    nameA: 'Same 12 months, one year earlier', nameB: 'Latest 12 months',
    explanation: 'Haze, dust and cloud dim the sunlight that reaches the ground. Each value is the monthly mean sunlight reaching the surface at the Cairo grid point (NASA POWER ALLSKY_SFC_SW_DWN). It is surface solar irradiance, not aerosol optical thickness or an air-quality reading.',
    soundMap: 'Pitch ← surface sunlight (brighter = higher note). Haze layer in the hologram thickens as sunlight drops. One note per month.',
    source: { ...powerSource('ALLSKY_SFC_SW_DWN surface irradiance', '30.04°N, 31.23°E (Cairo, Egypt)'), processing: 'Request: monthly/point?parameters=ALLSKY_SFC_SW_DWN for the last two calendar years; latest 12 consecutive valid months = B, same months a year earlier = A.', limitations: 'One grid cell; a modelled irradiance product; cloud and aerosol effects are mixed together.' },
    points: [[30.04, 31.23, 0.9]],
  },
  rec_temperature: {
    kind: 'anomaly', lon: 0, lat: 0, surface: 'any',
    variable: 'Monthly 2 m air-temperature anomaly at 0°N 0°E vs 1991–2020 (NASA POWER)', unit: '°C anomaly (vs 1991–2020 monthly mean)', units: '°C anomaly relative to the 1991–2020 mean of the same calendar month', subtitle: 'Temperature anomaly at one point (NASA POWER, live)',
    nameA: '1991–2020 reference (0.00 °C by definition)', nameB: 'Monthly anomaly at 0°N 0°E (NASA POWER)',
    explanation: 'Each value is how much warmer (positive) or cooler (negative) the monthly mean 2 m air temperature at one grid point (0°N, 0°E) was than the 1991–2020 average of the same calendar month (NASA POWER). It is a single point, NOT the global GISTEMP anomaly, and the zero line is the 1991–2020 reference.',
    soundMap: 'Pitch ← anomaly (warmer than the 1991–2020 mean = higher note; the zero line is the lowest note). One note per month. The reference line is not played.',
    source: { ...powerSource('T2M anomaly', '0°N, 0°E (Gulf of Guinea)'), processing: 'Requests: monthly/point T2M for the last two calendar years and for 1991–2020. Anomaly = month value − mean of the same calendar month over 1991–2020. Latest 12 consecutive valid months shown.', limitations: 'A single grid point, not a global mean; the baseline here (1991–2020) differs from the GISTEMP baseline (1951–1980).' },
    points: [[0, 0, 0.7]],
  },
};
export const LIVE_RECORD_IDS = Object.keys(DEFS);

// ---------- build one record's live data ----------
export async function buildLiveData(rec, now = new Date()) {
  const def = DEFS[rec.id]; if (!def) throw new Error('no live NASA feed is defined for ' + rec.id);
  let labels, A, B, extra = '', pts = [], seriesAName = def.nameA;
  const retrieved = iso(now);
  if (def.kind === 'eonet') {
    const months = rolling12(now);
    const [prev, cur, open] = await Promise.all([eventsPerMonth(def.category, months, 1), eventsPerMonth(def.category, months, 0), openEventPoints(def.category)]);
    labels = months.map(labelOf); A = prev.counts; B = cur.counts; pts = open.points;
    if (prev.truncated || cur.truncated) extra = ' A request reached the 1000-event limit, so some months may be under-counted.';
    extra += ` Map spikes: ${open.count} currently open event(s).`;
  } else if (def.kind === 'power') {
    const r = await powerTwoYears(def.par, def.lon, def.lat); labels = r.labels; A = r.A; B = r.B; pts = def.points;
  } else {
    const r = await powerAnomaly(def.lon, def.lat); labels = r.labels; B = r.B; A = labels.map(() => 0); pts = def.points;
  }
  if ([...A, ...B].some(v => !Number.isFinite(v)) || A.length !== labels.length || B.length !== labels.length) throw new Error('live series is incomplete');
  const period = a => `${labels[0]} – ${labels[11]}`;
  const pv = {
    producer: def.source.org, dataset: def.source.title, sourceUrl: def.source.url, retrieved,
    periodA: def.kind === 'anomaly' ? def.nameA : `Same months one year earlier (${labelOf(monthFromLabel(labels[0]) - 12)} – ${labelOf(monthFromLabel(labels[11]) - 12)})`,
    periodB: `${period()} (latest 12 ${def.kind === 'eonet' ? 'months to date' : 'complete months available'})`, units: def.units,
  };
  const series = { A: { name: def.nameA, ...(def.kind === 'anomaly' ? { reference: true } : {}), values: A }, B: { name: def.nameB, values: B } };
  const note = `LIVE NASA API DATA retrieved ${retrieved} in this session from ${def.source.url}. ${def.variable}. These values were just returned by the NASA API; they are not a source-verified archive table.${extra} ${def.kind === 'eonet' ? 'This is a count of listed events, not a satellite measurement.' : 'This is the quantity the API provides (see Variable), not the record’s original scientific product.'}`;
  return {
    labels, series, points: pts.map(p => [p[0], p[1], Number.isFinite(p[2]) ? p[2] : 0.5]), frames: [], status: 'live', units: def.units, provenance: pv, note,
    structureValid: true, unitsValid: true, sourceVerified: false, pointsAreIllustrative: false, live: true,
  };
}
function monthFromLabel(l) { const [m, y] = l.split(' '); return monthIndex(+y, MONTHS.indexOf(m)); }

// Rewrites the record's descriptive fields so every on-screen text matches the live API quantity. The originals are kept for fallback.
export function applyLiveText(rec) {
  const def = DEFS[rec.id]; if (!def) return;
  if (!rec._orig) rec._orig = { subtitle: rec.subtitle, variable: rec.variable, unit: rec.unit, explanation: rec.explanation, sound: rec.sound, source: rec.source, labels: rec.labels, refLine: rec.refLine, expectedUnits: rec.expectedUnits, xLabel: rec.xLabel, spatial: rec.spatial, discovery: rec.discovery, series: rec.series };
  Object.assign(rec, { subtitle: def.subtitle, variable: def.variable, unit: def.unit, explanation: def.explanation, sound: { ...rec.sound, map: def.soundMap }, source: { ...def.source, csvUrl: undefined }, expectedUnits: def.units, xLabel: 'Month' });
  rec.series = { A: { ...rec.series.A, name: def.nameA }, B: { ...rec.series.B, name: def.nameB } };
  if (def.kind === 'anomaly') { rec.spatial = true; rec.refLine = 0; }
  rec.discovery = { kinds: ['max-B', 'min-B'] };   // calendar-season questions assume Jan..Dec labels; the live window is rolling
}
export function restoreOriginalText(rec) {
  if (!rec._orig) return; Object.assign(rec, rec._orig); delete rec._orig;
}

// Public entry point: live NASA data when the API answers, otherwise the caller's fallback (illustrative / provisional) with an explicit reason.
export async function loadRecordLive(rec, fallbackLoader) {
  if (!DEFS[rec.id]) return fallbackLoader(rec);
  try {
    const d = await buildLiveData(rec);
    applyLiveText(rec);
    return d;
  } catch (e) {
    restoreOriginalText(rec);
    const base = await fallbackLoader(rec);
    const why = String((e && e.message) || e);
    return { ...base, liveError: why, note: `NASA LIVE API UNAVAILABLE (${why}). ${base.note}` };
  }
}
