// Live NASA data loader (EONET + POWER). fetch is mocked with the real API response shapes: this checks parsing, binning,
// honest labelling and fallback behaviour, not NASA's servers.
const { test, summary, assert } = await import('./helpers.mjs');
const { RECORDS, getRecord, loadRecordData, statusLabel } = await import('../src/records.js');
const { loadRecordLive, resetLiveCache, LIVE_RECORD_IDS, restoreOriginalText } = await import('../src/nasaLive.js');
console.log('Live NASA data');

const NOW = new Date(); const y = NOW.getUTCFullYear(), m = NOW.getUTCMonth();
const dateIn = (monthsAgo, day = 10) => new Date(Date.UTC(y, m - monthsAgo, day)).toISOString();
const ev = (id, monthsAgo, lon, lat, type = 'Point') => ({ id, title: id, categories: [], geometry: [{ date: dateIn(monthsAgo), type, coordinates: type === 'Point' ? [lon, lat] : [[[lon, lat], [lon + 1, lat], [lon + 1, lat + 1], [lon, lat]]], magnitudeValue: 10 }] });
function powerBody(par, base) {
  const o = {}; for (let yy = y - 2; yy <= y; yy++) for (let mm = 1; mm <= 12; mm++) { if (yy === y && mm > m) o[`${yy}${String(mm).padStart(2, '0')}`] = -999; else o[`${yy}${String(mm).padStart(2, '0')}`] = base + mm; o[`${yy}13`] = 99; }
  return { properties: { parameter: { [par]: o } } };
}
function clim() { const o = {}; for (let yy = 1991; yy <= 2020; yy++) for (let mm = 1; mm <= 12; mm++) o[`${yy}${String(mm).padStart(2, '0')}`] = 20 + mm; return { properties: { parameter: { T2M: o } } }; }
let calls = [];
function mock(fail) {
  globalThis.fetch = async url => {
    calls.push(url); if (fail) throw new Error('network down');
    const ok = b => ({ ok: true, status: 200, json: async () => b });
    if (url.includes('eonet')) {
      if (url.includes('status=open')) return ok({ events: [ev('o1', 0, 10, 20), ev('o2', 1, -50, -10, 'Polygon')] });
      return ok({ events: [ev('a', 0, 1, 1), ev('b', 0, 1, 1), ev('c', 3, 1, 1), ev('d', 14, 1, 1)] });
    }
    if (url.includes('1991')) return ok(clim());
    return ok(powerBody(url.includes('ALLSKY') ? 'ALLSKY_SFC_SW_DWN' : 'T2M', 10));
  };
}

test('EONET records: event counts per month, live status, honest text', async () => {
  resetLiveCache(); mock(false); const rec = getRecord('rec_fire'); const d = await loadRecordLive(rec, loadRecordData);
  assert.equal(d.status, 'live'); assert.match(statusLabel(d).text, /LIVE/); assert.equal(d.labels.length, 12);
  assert.equal(d.series.B.values[11], 2, 'two events started this month'); assert.equal(d.series.B.values[8], 1, 'one event 3 months ago');
  assert.equal(d.series.B.values.reduce((a, b) => a + b, 0), 3); assert.ok(d.series.A.values.reduce((a, b) => a + b, 0) >= 1, 'previous-year window used');
  assert.equal(d.points.length, 2, 'open events become map points (Point + Polygon centroid)');
  assert.match(rec.variable, /EONET/); assert.doesNotMatch(d.note, /ILLUSTRATIVE/); assert.match(d.note, /not a satellite measurement/);
  restoreOriginalText(rec); assert.match(rec.variable, /detection/i);
});
test('POWER records: latest 12 valid months, fill values and annual key ignored', async () => {
  resetLiveCache(); mock(false);
  for (const id of ['rec_ocean', 'rec_air', 'rec_ice']) {
    const rec = getRecord(id), d = await loadRecordLive(rec, loadRecordData);
    assert.equal(d.status, 'live', id); assert.equal(d.labels.length, 12); assert.ok([...d.series.A.values, ...d.series.B.values].every(v => v > 0 && v < 30), 'no -999 / annual 99');
    assert.equal(d.points.length, 1); restoreOriginalText(rec);
  }
});
test('temperature record: anomaly against the 1991–2020 monthly mean, zero reference series', async () => {
  resetLiveCache(); mock(false); const rec = getRecord('rec_temperature'), d = await loadRecordLive(rec, loadRecordData);
  assert.equal(d.status, 'live'); assert.ok(d.series.B.values.every(v => Math.abs(v - (-10)) < 1e-9), '10+m − (20+m) = −10'); assert.ok(d.series.A.values.every(v => v === 0)); assert.equal(d.series.A.reference, true);
  assert.match(d.units, /1991–2020/); restoreOriginalText(rec);
});
test('API failure falls back to the labelled offline data and says why', async () => {
  resetLiveCache(); mock(true); const rec = getRecord('rec_storm'), d = await loadRecordLive(rec, loadRecordData);
  assert.notEqual(d.status, 'live'); assert.match(d.note, /LIVE API UNAVAILABLE/); assert.match(d.liveError, /network down/); assert.match(statusLabel(d).text, /ILLUSTRATIVE/);
  assert.match(rec.variable, /precip/i, 'record text restored to the original product');
});
test('every Jukebox record has a live feed', () => { assert.deepEqual(LIVE_RECORD_IDS.sort(), RECORDS.map(r => r.id).sort()); });
const r = await summary('Live NASA data'); process.exit(r.failed ? 1 : 0);
