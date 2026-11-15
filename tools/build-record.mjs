// Build data/<record>.json from a CSV you downloaded yourself from the dataset named in the record's Source panel.
// Nothing is downloaded or invented here. Usage (PowerShell or any shell):
//   node tools/build-record.mjs --record rec_ice --csv my_monthly.csv --label-col month --value-col value --period-col year ^
//        --a 1981-2010 --b 2015-2024 --producer "NSIDC" --dataset "Sea Ice Index" --source-url https://nsidc.org/data/g02135 ^
//        --retrieved 2026-10-26 --units "million km2"
// The CSV needs one row per (period-column value, month) with a numeric value. Periods are inclusive year ranges; each month's value is the mean over the years.
//
// Official NASA GISTEMP table (one row per year, columns Jan..Dec, "***" = missing) -> rec_temperature:
//   node tools/build-record.mjs --gistemp GLB.Ts+dSST.csv --from 2025-10 --to 2026-09 --retrieved 2026-10-26
//        [--attest-official]   # only if YOU downloaded the file from https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv
// Months that are missing ("***") make the tool refuse to write. Without --attest-official the file is written as USER-SUPPLIED (not verified).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseGistempCsv, windowSeries } from './gistemp.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => x.startsWith('--') ? [...a, [x.slice(2), (arr[i + 1] === undefined || arr[i + 1].startsWith('--')) ? true : arr[i + 1]]] : a, []));   // a flag with no value is true
const OFFICIAL = 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv';
if (args.gistemp) {
  const miss0 = ['from', 'to', 'retrieved'].filter(k => !args[k]); if (miss0.length) { console.error('Missing: --' + miss0.join(' --')); process.exit(2); }
  const { validateRecordData, getRecord } = await import('../src/records.js');
  let parsed; try { parsed = parseGistempCsv(readFileSync(args.gistemp, 'utf8')); } catch (e) { console.error('Cannot read the GISTEMP table: ' + e.message); process.exit(1); }
  let w; try { w = windowSeries(parsed, args.from, args.to); } catch (e) { console.error(e.message); process.exit(1); }
  if (w.missing.length) { console.error('Refusing to write: these months have no value in the table (***, or not published yet): ' + w.missing.join(', ')); process.exit(1); }
  const rec = getRecord('rec_temperature');
  const out = { provenance: { producer: 'NASA Goddard Institute for Space Studies (GISS)', dataset: 'GISTEMP v4 Land-Ocean Temperature Index (LOTI), global monthly mean anomalies, ' + w.labels[0] + ' – ' + w.labels[w.labels.length - 1], sourceUrl: 'https://data.giss.nasa.gov/gistemp/data_v4.html', retrieved: args.retrieved, periodA: '1951–1980 reference baseline (0.00 °C by definition; a reference line, not a measured series)', periodB: `${args.from} through ${args.to}, monthly global land-ocean surface temperature anomalies`, units: rec.expectedUnits,
    verification: args['attest-official'] ? { status: 'verified', method: 'values parsed directly from the official GISTEMP CSV by tools/gistemp.mjs (no manual transcription)', comparedWith: OFFICIAL, comparedOn: args.retrieved, allValuesMatched: true, attestedBy: 'the person who ran the tool states they downloaded the CSV from the official URL' } : { status: 'provisional', note: 'Parsed from a CSV supplied by the user; the tool cannot prove the file came from NASA. Re-run with --attest-official if you downloaded it from the official URL.' } },
    labels: w.labels, series: { A: { name: '1951–1980 reference (0.00 °C by definition)', values: w.labels.map(() => 0) }, B: { name: 'Global anomaly, GISTEMP v4', values: w.values } }, points: [] };
  const v = validateRecordData(out, rec); if (!v.ok) { console.error('Refusing to write an invalid record:\n - ' + v.errors.join('\n - ')); process.exit(1); }
  writeFileSync('data/rec_temperature.json', JSON.stringify(out, null, 1));
  const idx0 = existsSync('data/index.json') ? JSON.parse(readFileSync('data/index.json', 'utf8')) : { records: [] }; if (!idx0.records.includes('rec_temperature')) idx0.records.push('rec_temperature'); writeFileSync('data/index.json', JSON.stringify(idx0, null, 1));
  console.log(`Wrote data/rec_temperature.json (${w.labels.length} months, ${args['attest-official'] ? 'marked source-verified by your attestation' : 'marked user-supplied / not verified'})`); process.exit(0);
}
const need = ['record', 'csv', 'a', 'b', 'producer', 'dataset', 'source-url', 'retrieved', 'units'];
const miss = need.filter(k => !args[k]); if (miss.length) { console.error('Missing: --' + miss.join(' --')); process.exit(2); }
const { validateRecordData } = await import('../src/records.js');
const rows = readFileSync(args.csv, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split(',').map(x => x.trim()));
const head = rows[0].map(h => h.toLowerCase()), col = n => head.indexOf(String(n || '').toLowerCase());
const mc = col(args['label-col'] || 'month'), vc = col(args['value-col'] || 'value'), yc = col(args['period-col'] || 'year');
if ([mc, vc, yc].some(i => i < 0)) { console.error('CSV header must contain the month, value and year columns:', head.join(',')); process.exit(2); }
const range = s => s.split('-').map(Number); const [a0, a1] = range(args.a), [b0, b1] = range(args.b);
const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const acc = k => names.map((_, m) => { const [y0, y1] = k === 'A' ? [a0, a1] : [b0, b1]; const v = rows.slice(1).filter(r => +r[mc] === m + 1 && +r[yc] >= y0 && +r[yc] <= y1 && Number.isFinite(+r[vc])).map(r => +r[vc]); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 1000) / 1000 : NaN; });
const out = { provenance: { producer: args.producer, dataset: args.dataset, sourceUrl: args['source-url'], retrieved: args.retrieved, periodA: args.a, periodB: args.b, units: args.units }, labels: names,
  series: { A: { name: `Mean ${args.a}`, values: acc('A') }, B: { name: `Mean ${args.b}`, values: acc('B') } } };
const v = validateRecordData(out, (await import('../src/records.js')).getRecord(args.record)); if (!v.ok) { console.error('Refusing to write an invalid record:\n - ' + v.errors.join('\n - ')); process.exit(1); }
writeFileSync(`data/${args.record}.json`, JSON.stringify(out, null, 1));
const idx = existsSync('data/index.json') ? JSON.parse(readFileSync('data/index.json', 'utf8')) : { records: [] }; if (!idx.records.includes(args.record)) idx.records.push(args.record); writeFileSync('data/index.json', JSON.stringify(idx, null, 1));
console.log(`Wrote data/${args.record}.json and registered it in data/index.json`);
