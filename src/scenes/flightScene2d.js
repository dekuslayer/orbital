// ORBITAL — 2D flight display: chosen by the player, or used automatically when WebGL is unavailable.
// It shows the REAL simulation state (same Flight object as the 3D view): ascent profile near the ground, an orbital map further out
// (Earth, Moon, predicted path, trail), the Moon-centred view during lunar phases, plus flame / failure markers.
// It has the same small interface as FlightView (setFlight, update, resize, screenOf, mapView, farView, pathInfo, lunarCrashed, dispose).
import { WORLD } from '../missions.js';

export class FlightView2D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); if (!this.ctx) throw new Error('2D canvas is not available either');
    this.flight = null; this.mapView = false; this.farView = false; this.pathInfo = null; this.lunarCrashed = false; this.is2D = true;
    this.trail = []; this.theta0 = null; this.tf = null; this.fallback = !!opts.fallback; this.inset = { l: 8, t: 40, r: 8, b: 8 }; this.pathT = 0; this.reduceMotion = !!opts.reduceMotion; this.time = 0; this.burst = 0;
    this.resize();
  }
  // the part of the canvas NOT covered by HUD panels: everything important is drawn inside it so the rocket is never hidden behind text
  setSafe(l, t, r, b) { this.inset = { l, t, r, b }; }
  safe() { const i = this.inset, x0 = Math.min(i.l, this.w * 0.5), y0 = Math.min(i.t, this.h * 0.4), x1 = Math.max(this.w - i.r, this.w * 0.5 + 40), y1 = Math.max(this.h - i.b, this.h * 0.6); return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; }
  setFlight(f) { this.flight = f; this.trail = []; this.theta0 = null; this.pathInfo = null; this.pathT = 0; this.lunarCrashed = false; this.burst = 0; }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 450;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); }
    this.dpr = dpr; this.w = w; this.h = h;
  }
  screenOf(wx, wy) { if (!this.tf) return { x: this.w / 2, y: this.h / 2, behind: true, w: this.w, h: this.h }; return { x: this.tf.cx + wx * this.tf.s, y: this.tf.cy - wy * this.tf.s, behind: false, w: this.w, h: this.h }; }
  dispose() { this.flight = null; this.trail = []; }

  update(dt, flight) {
    const f = this.flight || flight; if (!f) return; this.flight = f; this.time += dt; this.resize();
    this.pathT -= dt; if (this.pathT <= 0 && f.launched && !f.outcome) { this.pathT = 0.6; try { this.pathInfo = f.predictPath(260); } catch (e) { this.pathInfo = null; } }
    const th = Math.atan2(f.x, f.y); if (this.theta0 === null) this.theta0 = th;
    const last = this.trail[this.trail.length - 1];
    if (f.launched && (!last || Math.hypot(f.x - last[0], f.y - last[1]) > Math.max(300, f.alt * 0.01))) { this.trail.push([f.x, f.y, th]); if (this.trail.length > 2500) this.trail.shift(); }
    if (f.outcome && !f.outcome.success && this.burst === 0) this.burst = 0.001;
    if (this.burst > 0) this.burst += dt;
    this.draw(f);
  }

  draw(f) {
    const g = this.ctx, W = this.w, H = this.h; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); const air = Math.max(0, 1 - f.alt / 100000);
    bg.addColorStop(0, air > 0.05 ? '#0a1a3a' : '#02040c'); bg.addColorStop(1, air > 0.05 ? `rgb(${Math.round(30 + 60 * air)},${Math.round(70 + 90 * air)},${Math.round(140 + 70 * air)})` : '#050a18'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 70; i++) { const x = (i * 97.3) % W, y = (i * 53.7 + 11) % H; if (air < 0.6) g.fillRect(x, y, 1.4, 1.4); }
    const lunar = f.phase.startsWith('lunar') || f.phase === 'landed';
    if (lunar) this.drawMoonView(g, f); else if (this.mapView || f.alt > 150000) this.drawMap(g, f); else this.drawProfile(g, f);
    { const S = this.safe(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '11px ui-monospace,Menlo,Consolas,monospace'; g.textAlign = 'left'; g.fillText(this.fallback ? '2D display (WebGL unavailable) · same simulation as 3D' : '2D display · same simulation as 3D', S.x0 + 8, S.y1 - 4); }
  }

  rocket(g, x, y, ang, f, size) {
    g.save(); g.translate(x, y); g.rotate(ang);
    if (f.thrustNow > 0 && !f.outcome) { const L = size * (1.2 + 0.7 * Math.sin(this.time * 30) * 0.3 + (f.throttle || 0)); const fl = g.createLinearGradient(0, size * 0.5, 0, size * 0.5 + L); fl.addColorStop(0, '#fff3b0'); fl.addColorStop(0.5, '#ff9a2e'); fl.addColorStop(1, 'rgba(255,80,0,0)'); g.fillStyle = fl; g.beginPath(); g.moveTo(-size * 0.25, size * 0.5); g.lineTo(size * 0.25, size * 0.5); g.lineTo(0, size * 0.5 + L); g.closePath(); g.fill(); }
    g.fillStyle = '#e8eefc'; g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.32, size * 0.5); g.lineTo(-size * 0.32, size * 0.5); g.closePath(); g.fill(); g.fillStyle = '#35e0ff'; g.fillRect(-size * 0.32, size * 0.3, size * 0.64, size * 0.2);
    g.restore();
    if (this.burst > 0) { const k = Math.min(1, this.burst / 1.2); g.fillStyle = `rgba(255,${Math.round(180 - 120 * k)},40,${1 - k * 0.7})`; g.beginPath(); g.arc(x, y, size * (1 + 4 * k), 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 14px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('VEHICLE LOST', x, y - size * 4 - 6); }
  }

  // near the ground: altitude (up) against ground distance (right). Not to scale: the two axes use different scales.
  drawProfile(g, f) {
    const W = this.w, H = this.h, S = this.safe(), gy = S.y1 - 26, top = S.y0 + 22; this.tf = null;
    const maxAlt = Math.max(2000, f.maxAlt * 1.25, f.alt * 1.25), down = th => (th - this.theta0) * WORLD.R;
    const maxDown = Math.max(1500, ...this.trail.map(p => Math.abs(down(p[2]))), Math.abs(down(Math.atan2(f.x, f.y)))) * 1.25;
    const X = d => S.x0 + 56 + (S.w - 90) * (d / maxDown), Y = a => gy - (gy - top) * (a / maxAlt);
    g.fillStyle = '#1d3a22'; g.fillRect(0, gy, W, H - gy); g.fillStyle = '#7a8aa8'; g.fillRect(X(0) - 18, gy - 4, 36, 4);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '11px ui-monospace,monospace'; g.textAlign = 'left';
    for (let k = 0; k <= 4; k++) { const a = maxAlt * k / 4, y = Y(a); g.beginPath(); g.moveTo(S.x0 + 40, y); g.lineTo(S.x1 - 10, y); g.stroke(); g.fillText(`${(a / 1000).toFixed(a >= 10000 ? 0 : 1)} km`, S.x0 + 4, y - 2); }
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.beginPath(); this.trail.forEach((p, i) => { const x = X(Math.abs(down(p[2]))), y = Y(Math.max(0, Math.hypot(p[0], p[1]) - WORLD.R)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1;
    const x = X(Math.abs(down(Math.atan2(f.x, f.y)))), y = Y(Math.max(0, f.alt)); // Attitude = the physical thrust direction (pitch above the local horizon), exactly as in the 3D view and in Flight.step(); a failed vehicle with a dead engine noses along its velocity.
    const failing = !!f.outcome && !f.outcome.success && f.speed > 3; const ang = failing ? Math.atan2(f.vEast, Math.max(1, f.vUp)) : (90 - f.pitch) * Math.PI / 180;
    this.rocket(g, x, y, ang, f, Math.max(12, Math.min(24, S.h / 20)));
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.textAlign = 'right'; g.fillText('altitude (up) vs ground distance (right) — not to scale', S.x1 - 8, S.y0 + 12);
  }

  // orbital map: Earth at the origin; the Moon is included when the vehicle is far enough out (or the Moon is the mission target)
  drawMap(g, f) {
    const W = this.w, H = this.h, mp = WORLD.moonPos(); const showMoon = f.alt > 800000 || f.mission.tag === 'Lunar' || f.mission.id === 'deep' || f.mission.id === 'transfer';
    let ext = Math.max(WORLD.R * 1.6, Math.hypot(f.x, f.y) * 1.25); if (showMoon) ext = Math.max(ext, Math.hypot(mp.x, mp.y) * 1.12);
    const SA = this.safe(), s = Math.min(SA.w, SA.h) * 0.45 / ext, cx = SA.cx, cy = SA.cy; this.tf = { cx, cy, s };
    const P = (x, y) => [cx + x * s, cy - y * s];
    const [ex, ey] = P(0, 0); const ge = g.createRadialGradient(ex, ey, 0, ex, ey, WORLD.R * s * 1.3); ge.addColorStop(0, '#2b7bd6'); ge.addColorStop(0.8, '#1a4f9a'); ge.addColorStop(1, 'rgba(80,160,255,0.2)'); g.fillStyle = ge; g.beginPath(); g.arc(ex, ey, Math.max(6, WORLD.R * s), 0, 7); g.fill();
    g.fillStyle = '#9fd0ff'; g.font = '12px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('EARTH', ex, ey + Math.max(6, WORLD.R * s) + 14);
    if (showMoon) { const [mx, my] = P(mp.x, mp.y); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.setLineDash([4, 6]); g.beginPath(); g.arc(mx, my, WORLD.moonSOI * s, 0, 7); g.stroke(); g.setLineDash([]); g.fillStyle = '#cfcfd6'; g.beginPath(); g.arc(mx, my, Math.max(4, WORLD.moonR * s), 0, 7); g.fill(); g.fillStyle = '#e8e8f0'; g.fillText('MOON', mx, my + Math.max(4, WORLD.moonR * s) + 14); }
    const pi = this.pathInfo; if (pi && pi.pts && pi.pts.length) { g.strokeStyle = pi.hit ? '#4dff9a' : '#35e0ff'; g.setLineDash([6, 5]); g.lineWidth = 1.6; g.beginPath(); pi.pts.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); g.lineWidth = 1; }
    g.strokeStyle = '#ffd23f'; g.lineWidth = 1.6; g.beginPath(); this.trail.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1;
    const [vx, vy] = P(f.x, f.y); this.rocket(g, vx, vy, Math.atan2(f.vx, f.vy), f, 10); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('YOU', vx + 12, vy - 8);
  }

  // Moon-centred view for the scripted capture / orbit / descent phases
  drawMoonView(g, f) {
    const W = this.w, H = this.h, SA = this.safe(), cx = SA.cx, cy = SA.cy, R = Math.min(SA.w, SA.h) * 0.2; this.tf = null;
    const gm = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R); gm.addColorStop(0, '#e6e6ee'); gm.addColorStop(1, '#6f7080'); g.fillStyle = gm; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.setLineDash([5, 6]); g.beginPath(); g.arc(cx, cy, R * 1.5, 0, 7); g.stroke(); g.setLineDash([]); g.fillStyle = '#e8e8f0'; g.font = '12px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('MOON', cx, cy + R + 16);
    const cap = Math.min(1, f.lunar.dvDone / ((f.mission.captureDv) || 1)), des = f.mission.descentDv ? Math.min(1, f.lunar.descentDone / f.mission.descentDv) : 0;
    let rr = f.phase === 'lunar-arrival' ? 2.2 - 0.0 : f.phase === 'lunar-capture' ? 2.2 - 0.7 * cap : f.phase === 'lunar-orbit' ? 1.5 : 1.5 - 0.5 * des; if (f.phase === 'landed') rr = 1.02;
    const ang = f.phase === 'lunar-arrival' ? -0.8 : -0.8 + (cap * 2.2) + (f.phase === 'lunar-orbit' ? this.time * 0.35 : 0) + des * 1.2;
    const x = cx + Math.cos(ang) * R * rr, y = cy + Math.sin(ang) * R * rr; this.rocket(g, x, y, ang + Math.PI / 2, f, 9); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText('YOU', x + 12, y - 8);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.textAlign = 'right'; g.fillText('schematic view: the capture / descent phases are scripted in this simulation', SA.x1 - 8, SA.y0 + 12);
  }
}
