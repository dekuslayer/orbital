// ORBITAL — small canvas chart renderer shared by the DOM panel and the in-scene 3D screen.
// Draws two series with labelled axes and units, plus a moving playhead.
export function drawChart(canvas, rec, data, step, opts = {}) {
  const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height; const dark = opts.dark !== false;
  const pad = { l: Math.round(W * 0.12), r: Math.round(W * 0.04), t: Math.round(H * 0.16), b: Math.round(H * 0.22) };
  const fs = Math.max(10, Math.round(H * 0.055));
  ctx.clearRect(0, 0, W, H);
  if (opts.background) { ctx.fillStyle = opts.background; ctx.fillRect(0, 0, W, H); }
  const A = data.series.A.values, B = data.series.B.values, L = data.labels;
  const all = [...A, ...B]; let mn = Math.min(...all), mx = Math.max(...all); const span = mx - mn || 1; mn -= span * 0.08; mx += span * 0.08;
  const X = i => pad.l + (W - pad.l - pad.r) * (i / Math.max(1, L.length - 1)); const Y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - mn) / (mx - mn));
  const txt = dark ? 'rgba(220,235,255,0.92)' : '#10203a', grid = dark ? 'rgba(160,200,255,0.16)' : 'rgba(0,0,0,0.12)';
  ctx.font = `${fs}px system-ui, sans-serif`; ctx.fillStyle = txt; ctx.strokeStyle = grid; ctx.lineWidth = 1;
  // y grid + labels
  for (let k = 0; k <= 4; k++) { const v = mn + (mx - mn) * k / 4; const y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2).replace(/0$/, ''), pad.l - 6, y + fs * 0.35); }
  // x labels
  ctx.textAlign = 'center'; for (let i = 0; i < L.length; i++) { if (L.length > 8 && i % 2 === 1 && W < 700) continue; ctx.fillText(L[i], X(i), H - pad.b + fs * 1.25); }
  ctx.fillText(rec.xLabel, pad.l + (W - pad.l - pad.r) / 2, H - fs * 0.35);
  ctx.save(); ctx.translate(fs * 0.9, pad.t + (H - pad.t - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(rec.unit, 0, 0); ctx.restore();
  // series
  const line = (arr, color, dash) => { ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, H * 0.012); ctx.setLineDash(dash || []); ctx.beginPath(); arr.forEach((v, i) => i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))); ctx.stroke(); ctx.setLineDash([]); arr.forEach((v, i) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(i), Y(v), H * (i === step ? 0.022 : 0.011), 0, 7); ctx.fill(); }); };
  if (rec.singleSeries) {   // one real series + a labelled zero reference line
    const y0 = Y(rec.refLine || 0); ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(pad.l, y0); ctx.lineTo(W - pad.r, y0); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'right'; ctx.fillText('0 = 1951–1980 mean', W - pad.r - 4, y0 - fs * 0.35); ctx.restore();
    line(B, rec.palette.main);
  } else { line(A, rec.palette.main); line(B, rec.palette.accent, [H * 0.03, H * 0.02]); }
  // playhead
  if (step != null && step >= 0) { ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(step), pad.t); ctx.lineTo(X(step), H - pad.b); ctx.stroke(); }
  // legend
  ctx.textAlign = 'left'; const lg = (c, n, x, dash) => { ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.setLineDash(dash ? [6, 4] : []); ctx.beginPath(); ctx.moveTo(x, pad.t * 0.5); ctx.lineTo(x + fs * 1.6, pad.t * 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = txt; ctx.fillText(n, x + fs * 2, pad.t * 0.5 + fs * 0.35); };
  const nA = data.series.A.name, nB = data.series.B.name; if (rec.singleSeries) lg(rec.palette.main, nB, pad.l, false); else { lg(rec.palette.main, nA, pad.l, false); lg(rec.palette.accent, nB, pad.l + Math.min(W * 0.46, ctx.measureText(nA).width + fs * 3.5), true); }
}
