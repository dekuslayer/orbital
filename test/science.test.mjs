// Jukebox data integrity and audio lifecycle (Web Audio is faked: this checks our scheduling/cleanup logic, not what you hear)
function fakeNode() { const store = {}; const PARAMS = new Set(['gain', 'frequency', 'detune', 'pan', 'threshold', 'ratio', 'attack', 'release', 'Q', 'knee']); const p = new Proxy(function () {}, { get(t, k) { if (k === 'then') return undefined; if (k in store) return store[k]; if (PARAMS.has(k)) return (store[k] = fakeNode()); if (k === 'value' || k === 'currentTime') return 0; return (...a) => { if (k === 'start') fakeAudio.started++; if (k === 'stop') fakeAudio.stopped++; return typeof k === 'string' && k.startsWith('create') ? fakeNode() : p; }; }, set(t, k, v) { store[k] = v; return true; } }); return p; }
const fakeAudio = { started: 0, stopped: 0, contexts: 0 };
globalThis.window = globalThis; globalThis.AudioContext = class { constructor() { fakeAudio.contexts++; this.currentTime = 0; this.destination = fakeNode(); this.state = 'running'; return new Proxy(this, { get: (t, k) => k in t ? t[k] : (k === 'resume' || k === 'close' ? () => Promise.resolve() : (...a) => fakeNode()) }); } };
const { test, summary, assert } = await import('./helpers.mjs');
const { RECORDS, getRecord, validateRecordData, discoveryFor, loadRecordData, builtinData, normalisePoints, statusLabel, resetManifestCache, sourceVerified } = await import('../src/records.js');
const { parseGistempCsv, windowSeries, splitCsvLine } = await import('../tools/gistemp.mjs');
import { readFileSync } from 'node:fs';
const { Sonifier } = await import('../src/audio.js');
console.log('Science data & audio');

const good = () => ({ provenance: { producer: 'P', dataset: 'D', sourceUrl: 'https://example.org/d', retrieved: '2026-10-26', periodA: '2000-2009', periodB: '2010-2019', units: 'u' }, labels: ['a', 'b', 'c'], series: { A: { name: 'A', values: [1, 2, 3] }, B: { name: 'B', values: [2, 3, 4] } } });

test('13. invalid scientific records are rejected', () => {
  assert.ok(validateRecordData(good()).ok);
  const bad = [d => { d.series.A.values[1] = NaN; }, d => { d.series.B.values[0] = Infinity; }, d => { d.series.A.values[0] = '3'; }, d => { d.series.A.values.pop(); }, d => { d.labels = ['a', 'a', 'c']; }, d => { delete d.provenance.sourceUrl; }, d => { d.provenance.sourceUrl = 'http://x'; }, d => { d.provenance.retrieved = 'yesterday'; }, d => { d.provenance = 'trust me'; }, d => { d.points = [[100, 0]]; }, d => { delete d.series.B; }];
  bad.forEach((mut, i) => { const d = good(); mut(d); const r = validateRecordData(d); assert.equal(r.ok, false, 'case ' + i + ' must be rejected'); assert.ok(r.errors.length > 0); });
});

test('14. built-in records are structurally valid but never labelled as observed NASA data', () => {
  for (const rec of RECORDS) {
    assert.ok(rec.source.url.startsWith('https://') && rec.source.title && rec.source.org, rec.id + ' has a named source');
    assert.equal(rec.series.A.values.length, rec.labels.length); assert.equal(rec.series.B.values.length, rec.labels.length);
    for (const v of [...rec.series.A.values, ...rec.series.B.values]) assert.ok(Number.isFinite(v), rec.id + ' finite values');
    const b = builtinData(rec);
    assert.notEqual(b.status, 'observed', rec.id + ' built-in data must never be OBSERVED');
    if (rec.id === 'rec_temperature') { assert.equal(b.status, 'provisional'); assert.equal(b.points.length, 0, 'global series has no geographic points'); assert.match(statusLabel(b).text, /NOT INDEPENDENTLY VERIFIED/); }
    else { assert.equal(b.status, 'illustrative'); assert.match(statusLabel(b).text, /ILLUSTRATIVE/); }
  }
});

test('discovery questions are answerable from the displayed data', () => {
  for (const rec of RECORDS) { const q = discoveryFor(rec, builtinData(rec)); assert.ok(!q.unavailable, rec.id + ' has an answerable question'); assert.ok(q.options.length >= 3); assert.ok(q.correct >= 0 && q.correct < q.options.length, rec.id); }
});

test('15. audio: play → stop silences everything; changing record leaves no old sound playing', async () => {
  const s = new Sonifier(), rec = RECORDS[0], data = { labels: rec.labels, series: rec.series, points: rec.points, status: 'illustrative' };
  s.load(rec, data); assert.equal(s.state, 'stopped'); assert.equal(await s.play(), true); assert.equal(s.state, 'playing'); assert.ok(s.timer, 'scheduler running');
  s.pause(); assert.equal(s.state, 'paused'); assert.equal(s.timer, null); assert.equal(s.scheduledCbs.length, 0);
  await s.resume(); assert.equal(s.state, 'playing');
  s.stop(); assert.equal(s.state, 'stopped'); assert.equal(s.timer, null); assert.equal(s.active.size, 0, 'all active nodes released'); assert.equal(s.scheduledCbs.length, 0);
  await s.play(); const rec2 = RECORDS[1]; s.load(rec2, { labels: rec2.labels, series: rec2.series, points: rec2.points, status: 'illustrative' });
  assert.equal(s.state, 'stopped', 'loading a new record stops the old one'); assert.equal(s.timer, null); assert.equal(s.rec.id, rec2.id);
  s.setVolume(5); assert.ok(s.volume <= 1); s.setSpeed(99); assert.ok(s.speed <= 2); s.dispose(); assert.equal(s.ctx, null);
});


// ---------- new: data states, provenance, discovery, GISTEMP ----------
const withFetch = async (files, fn) => {
  const saved = globalThis.fetch; resetManifestCache();
  globalThis.fetch = async url => { const u = String(url); if (u.endsWith('data/index.json')) return { ok: true, json: async () => ({ records: Object.keys(files) }) }; const id = Object.keys(files).find(k => u.endsWith(`data/${k}.json`)); if (!id || files[id] === '__404') return { ok: false, status: 404 }; const f = files[id]; return { ok: true, status: 200, json: async () => { if (f === '__badjson') throw new SyntaxError('Unexpected token'); return JSON.parse(JSON.stringify(f)); } }; };
  try { return await fn(); } finally { globalThis.fetch = saved; resetManifestCache(); }
};
const ice = getRecord('rec_ice');
const iceFile = (mut) => { const d = { provenance: { producer: 'NSIDC', dataset: 'Sea Ice Index V4', sourceUrl: 'https://nsidc.org/data/g02135', retrieved: '2026-10-26', periodA: '1981-2010', periodB: '2015-2024', units: 'million km2' }, labels: ice.labels.slice(), series: { A: { name: 'A', values: ice.series.A.values.slice() }, B: { name: 'B', values: ice.series.B.values.slice() } } }; mut && mut(d); return d; };

test('a well-formed JSON file that is not verified is never OBSERVED', async () => {
  const d = await withFetch({ rec_ice: iceFile() }, () => loadRecordData(ice));
  assert.equal(d.status, 'provisional'); assert.equal(d.userSupplied, true); assert.equal(d.sourceVerified, false); assert.equal(d.structureValid, true);
  assert.match(statusLabel(d).text, /USER-SUPPLIED/);
  const d2 = await withFetch({ rec_ice: iceFile(x => { x.provenance.verification = { status: 'provisional', note: 'transcribed' }; }) }, () => loadRecordData(ice));
  assert.equal(d2.status, 'provisional'); assert.match(statusLabel(d2).text, /NOT INDEPENDENTLY VERIFIED/);
  const d3 = await withFetch({ rec_ice: iceFile(x => { x.provenance.verification = { status: 'verified' }; }) }, () => loadRecordData(ice));
  assert.equal(d3.status, 'provisional', 'a bare "verified" claim without comparedWith/comparedOn/allValuesMatched is not enough');
  const full = { status: 'verified', method: 'Value-by-value comparison against the official monthly source table', comparedWith: 'https://nsidc.org/data/g02135', comparedOn: '2026-10-26', allValuesMatched: true };
  const d4 = await withFetch({ rec_ice: iceFile(x => { x.provenance.verification = full; }) }, () => loadRecordData(ice));
  assert.equal(d4.status, 'observed'); assert.ok(sourceVerified(d4.provenance));
  const noMethod = await withFetch({ rec_ice: iceFile(x => { x.provenance.verification = { ...full, method: '' }; }) }, () => loadRecordData(ice));
  assert.equal(noMethod.status, 'provisional', 'a verification claim without a reproducible method is not OBSERVED');
  const badDate = await withFetch({ rec_ice: iceFile(x => { x.provenance.verification = { ...full, comparedOn: '2026-02-31' }; }) }, () => loadRecordData(ice));
  assert.equal(badDate.status, 'provisional', 'an impossible comparison date is not OBSERVED');
});

test('data without points does not inherit the illustrative points', async () => {
  const fire = getRecord('rec_fire'); assert.ok(fire.points.length > 0);
  const f = { provenance: { producer: 'P', dataset: 'D', sourceUrl: 'https://example.org', retrieved: '2026-10-26', periodA: 'a', periodB: 'b', units: 'detections per month (index)' }, labels: fire.labels.slice(), series: { A: { name: 'A', values: fire.series.A.values.slice() }, B: { name: 'B', values: fire.series.B.values.slice() } } };
  const d = await withFetch({ rec_fire: f }, () => loadRecordData(fire));
  assert.deepEqual(d.points, [], 'accepted file without points → no points'); assert.equal(d.pointsAreIllustrative, undefined);
  const b = builtinData(fire); assert.equal(b.pointsAreIllustrative, true, 'built-in illustrative points stay flagged as illustrative');
});

test('points without a weight get an explicit finite weight (no NaN)', () => {
  const n = normalisePoints([[10, 20], [11, 21, 0.3], [12, 22, undefined]]);
  assert.deepEqual(n.map(p => p[2]), [0.5, 0.3, 0.5]); n.forEach(p => p.forEach(v => assert.ok(Number.isFinite(v))));
  assert.equal(validateRecordData({ ...iceFile(), points: [[10, 20, NaN]] }, ice).ok, false);
});

test('rejected files (units, source, missing values, bad JSON) show a reason and fall back to labelled illustrative data', async () => {
  const cases = [
    ['units', iceFile(x => { x.provenance.units = 'ppm'; }), /units/i],
    ['source', iceFile(x => { x.provenance.sourceUrl = 'http://insecure'; }), /sourceUrl/],
    ['missing value', iceFile(x => { x.series.B.values[3] = null; }), /finite/],
    ['length', iceFile(x => { x.series.A.values.pop(); }), /labels/],
    ['bad json', '__badjson', /not valid JSON/],
  ];
  for (const [name, file, re] of cases) {
    const d = await withFetch({ rec_ice: file }, () => loadRecordData(ice));
    assert.equal(d.status, 'rejected', name); assert.ok(d.rejected.length > 0 && re.test(d.rejected.join(' ')), name + ': ' + d.rejected); assert.match(d.note, /REJECTED/); assert.match(statusLabel(d).text, /REJECTED/);
    assert.equal(d.series.A.values.length, ice.labels.length, 'illustrative curves still shown');
  }
  const missing = await withFetch({ rec_ice: '__404' }, () => loadRecordData(ice));   // listed in the manifest but 404
  assert.equal(missing.status, 'illustrative'); assert.match(missing.loadError, /404/);
});

test('a global (non-spatial) record refuses geographic points', () => {
  const t = getRecord('rec_temperature'); const j = JSON.parse(readFileSync(new URL('../data/rec_temperature.json', import.meta.url), 'utf8'));
  assert.equal(validateRecordData(j, t).ok, true);
  assert.equal(validateRecordData({ ...j, points: [[10, 10, 0.5]] }, t).ok, false);
  assert.equal(validateRecordData({ ...j, provenance: { ...j.provenance, units: 'degrees F' } }, t).ok, false);
});

test('data/rec_temperature.json equals the built-in provisional snapshot and is PROVISIONAL', async () => {
  const t = getRecord('rec_temperature'); const j = JSON.parse(readFileSync(new URL('../data/rec_temperature.json', import.meta.url), 'utf8'));
  assert.deepEqual(j.series.B.values, t.series.B.values); assert.deepEqual(j.labels, t.labels); assert.deepEqual(j.points, []);
  assert.ok(j.series.A.values.every(v => v === 0)); assert.equal(j.labels.length, 12);
  const d = await withFetch({ rec_temperature: j }, () => loadRecordData(t));
  assert.equal(d.status, 'provisional'); assert.match(statusLabel(d).text, /NOT INDEPENDENTLY VERIFIED/); assert.equal(d.points.length, 0);
});

test('discovery questions follow the loaded values and make no 12-month assumption', () => {
  const rec = getRecord('rec_ice'); const L = ['p1', 'p2', 'p3', 'p4', 'p5']; const mk = (B) => ({ labels: L, series: { A: { name: 'A', values: [1, 1, 1, 1, 1] }, B: { name: 'B', values: B } } });
  const q1 = discoveryFor(rec, mk([5, 4, 3, 2, 6])); assert.equal(q1.options[q1.correct], 'p4');       // min of B
  const q2 = discoveryFor(rec, mk([5, 1, 3, 2, 6])); assert.equal(q2.options[q2.correct], 'p2');       // answer moved with the data
  const q3 = discoveryFor(rec, mk([5, 5, 5, 5, 5])); assert.ok(q3.unavailable, 'ties → no unambiguous question (not a fixed answer)');
  const two = discoveryFor(getRecord('rec_fire'), { labels: ['x', 'y', 'z'], series: { A: { name: 'A', values: [1, 2, 3] }, B: { name: 'B', values: [3, 9, 1] } } }); assert.equal(two.options[two.correct], 'y');
  const ocean = getRecord('rec_ocean'); const od = builtinData(ocean); const qo = discoveryFor(ocean, od); assert.ok(qo.options.length >= 2);
  const odd = discoveryFor(ocean, { labels: ['a', 'b', 'c', 'd'], series: { A: { name: 'A', values: [1, 2, 3, 4] }, B: { name: 'B', values: [1, 8, 3, 4] } } }); assert.ok(!/season/i.test(odd.q), 'no calendar-season question when labels are not 12 calendar months'); assert.equal(odd.options[odd.correct], 'b');
  const t = getRecord('rec_temperature'); const qt = discoveryFor(t, builtinData(t)); assert.equal(qt.options[qt.correct], 'Aug 2026');
});

test('GISTEMP official-format parser: rows per year, *** missing, quotes, repeated headers', () => {
  const txt = 'Land-Ocean: Global Means (Deviations from corresponding means for 1951-1980 in °C)\nYear,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON\n2025,1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,"1.18",1.21,1.05,1.3,1.3,1.1,1.2,1.3,1.4\nYear,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON\n2026,1.08,1.23,1.3,***,1.13,1.17,1.24,1.42,***,***,***,***,***,***,***,***,***,***\n';
  const p = parseGistempCsv(txt); assert.equal(p.years['2025'][9], 1.18); assert.equal(p.years['2026'][3], null, '*** is not a number'); assert.notEqual(p.years['2026'][3], 0);
  const w = windowSeries(p, '2025-10', '2026-03'); assert.deepEqual(w.labels, ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026']); assert.deepEqual(w.values, [1.18, 1.21, 1.05, 1.08, 1.23, 1.3]); assert.deepEqual(w.missing, []);
  const w2 = windowSeries(p, '2026-03', '2026-05'); assert.deepEqual(w2.missing, ['Apr 2026'], 'missing months are reported, never filled');
  assert.throws(() => parseGistempCsv('a,b\n1,2'), /header/); assert.throws(() => windowSeries(p, '2025-13', '2026-01'), /month/);
  assert.deepEqual(splitCsvLine('a,"b,c","d""e",f'), ['a', 'b,c', 'd"e', 'f']);
});

test('sonification of a global series never pans by (non-existent) longitudes and uses only loaded data', async () => {
  const s = new Sonifier(), rec = getRecord('rec_temperature'), data = builtinData(rec);
  s.load(rec, data); assert.equal(await s.play(), true); const pans = []; const orig = s.panner.bind(s); s.panner = p => { pans.push(p); return orig(p); }; s.playStep(3, 0, 1); s.playStep(7, 0, 1);
  assert.ok(pans.length > 0); assert.ok(pans.every(p => Math.abs(p) < 1e-9), 'global series is centred: ' + pans.join(',')); s.stop(); s.dispose();
});

const r = await summary('science'); process.exit(r.failed ? 1 : 0);
