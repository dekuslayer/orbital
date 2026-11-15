// Parser for the OFFICIAL NASA GISS GISTEMP v4 monthly table (GLB.Ts+dSST.csv), which has ONE ROW PER YEAR and one column per month:
//   Land-Ocean: Global Means (Deviations from corresponding means for 1951-1980 in °C)      <- title line(s) before the header
//   Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON
//   2024,1.23,1.45,...,***,...
// "***" means "no value yet" and is NEVER read as a number. Header lines repeat in some NASA tables; they are skipped.
// Nothing here downloads anything: you pass in the text of a file you downloaded yourself.
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// minimal RFC-4180 style splitter: handles quoted fields, commas inside quotes and doubled quotes
export function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim()); return out;
}

// returns { title, years: { "2025": [12 x number|null] }, header }
export function parseGistempCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let header = null, title = ''; const years = {};
  for (const line of lines) {
    const f = splitCsvLine(line);
    if (f[0].toLowerCase() === 'year') { header = f; continue; }
    if (!header) { title += (title ? ' ' : '') + line; continue; }
    if (!/^\d{4}$/.test(f[0])) continue;
    const col = m => header.findIndex(h => h.toLowerCase() === m.toLowerCase());
    years[f[0]] = MONTH_NAMES.map(m => { const i = col(m); if (i < 0) return null; const s = (f[i] || '').trim(); if (s === '' || /^\*+$/.test(s)) return null; const v = Number(s); return Number.isFinite(v) ? v : null; });
  }
  if (!header) throw new Error('No "Year,Jan,Feb,..." header row found: this is not a GISTEMP monthly table');
  for (const m of MONTH_NAMES) if (!header.some(h => h.toLowerCase() === m.toLowerCase())) throw new Error('Header is missing the month column ' + m);
  if (!Object.keys(years).length) throw new Error('No year rows found');
  return { title, header, years };
}

// Take an inclusive window "YYYY-MM" .. "YYYY-MM". Returns { labels, values, missing } — missing months are reported, never filled.
export function windowSeries(parsed, from, to) {
  const re = /^(\d{4})-(\d{2})$/; const a = re.exec(from), b = re.exec(to);
  if (!a || !b) throw new Error('--from/--to must look like 2025-10');
  let y = +a[1], m = +a[2] - 1; const y1 = +b[1], m1 = +b[2] - 1; if (m < 0 || m > 11 || m1 < 0 || m1 > 11) throw new Error('month must be 01..12');
  const labels = [], values = [], missing = [];
  while (y < y1 || (y === y1 && m <= m1)) {
    const row = parsed.years[String(y)]; const v = row ? row[m] : null; const label = `${MONTH_NAMES[m]} ${y}`;
    labels.push(label); values.push(v);
    if (v === null) missing.push(label);
    if (++m === 12) { m = 0; y++; }
    if (labels.length > 600) throw new Error('window too long');
  }
  if (labels.length < 2) throw new Error('window must contain at least 2 months');
  return { labels, values, missing };
}
