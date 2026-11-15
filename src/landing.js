// ORBITAL — landing page hero animation (2-D canvas, no WebGL needed).
// Left: a rocket climbing an arc over a glowing Earth limb. Right: a spinning vinyl record projecting a holographic globe.
const TAU = Math.PI * 2;
function rnd(seed) { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export class Landing {
  constructor(canvas, reduce) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.reduce = !!reduce; this.t = 0; this.run = false; this.trail = [];
    const r = rnd(42); this.stars = Array.from({ length: 260 }, () => ({ x: r(), y: r(), z: 0.2 + r() * 0.8, p: r() * TAU }));
    this.resize();
  }
  resize() { const d = Math.min(window.devicePixelRatio || 1, 2); const w = this.c.clientWidth || 1000, h = this.c.clientHeight || 600; this.c.width = w * d; this.c.height = h * d; this.d = d; this.w = w; this.h = h; this.g.setTransform(d, 0, 0, d, 0, 0); if (!this.run) this.draw(); }
  start() { if (this.run) return; this.run = true; this.last = performance.now(); const loop = n => { if (!this.run) return; this.t += Math.min(0.05, (n - this.last) / 1000); this.last = n; this.draw(); if (!this.reduce) requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  stop() { this.run = false; }

  draw() {
    const g = this.g, w = this.w, h = this.h, t = this.reduce ? 3 : this.t;
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#02040b'); bg.addColorStop(0.6, '#060d22'); bg.addColorStop(1, '#0b1b44'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // nebula glows
    const glow = (x, y, r, c) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); };
    glow(w * 0.82, h * 0.35, w * 0.4, 'rgba(138,107,255,0.18)'); glow(w * 0.15, h * 0.2, w * 0.35, 'rgba(59,227,255,0.10)'); glow(w * 0.6, h * 0.9, w * 0.5, 'rgba(255,63,180,0.07)');
    // stars (3 parallax depths, slow drift + twinkle)
    for (const s of this.stars) { const x = ((s.x * w - t * 6 * s.z) % w + w) % w, y = s.y * h * 0.85; const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.z + s.p)); g.fillStyle = `rgba(210,230,255,${a * s.z})`; g.fillRect(x, y, s.z * 1.8, s.z * 1.8); }
    // Earth limb at the bottom-left
    const ex = w * 0.28, ey = h * 1.55, er = h * 0.95;
    glow(ex, ey - er, er * 0.55, 'rgba(59,227,255,0.22)');
    const eg = g.createRadialGradient(ex - er * 0.2, ey - er * 0.95, er * 0.2, ex, ey, er); eg.addColorStop(0, '#1d6fbf'); eg.addColorStop(0.55, '#0c3a7a'); eg.addColorStop(1, '#050f26'); g.fillStyle = eg; g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.clip(); const r = rnd(7); g.fillStyle = 'rgba(255,255,255,0.10)'; for (let i = 0; i < 40; i++) { const a = r() * TAU, d = er * (0.75 + r() * 0.24); g.beginPath(); g.ellipse(ex + Math.cos(a) * d + (t * 4) % 40, ey + Math.sin(a) * d, 30 + r() * 120, 5 + r() * 14, a + 1.57, 0, TAU); g.fill(); } g.restore();
    g.strokeStyle = 'rgba(120,220,255,0.75)'; g.lineWidth = 2; g.beginPath(); g.arc(ex, ey, er + 1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = 'rgba(120,220,255,0.25)'; g.lineWidth = 8; g.beginPath(); g.arc(ex, ey, er + 4, Math.PI * 1.12, Math.PI * 1.88); g.stroke();

    // rocket on an arc (looping every 9 s)
    const P = (k) => { const x0 = w * 0.06, y0 = h * 0.86, x1 = w * 0.28, y1 = h * 0.1, x2 = w * 0.62, y2 = h * 0.16; const u = 1 - k; return [u * u * x0 + 2 * u * k * x1 + k * k * x2, u * u * y0 + 2 * u * k * y1 + k * k * y2]; };
    const k = (t % 9) / 9, [rx, ry] = P(Math.min(0.999, k)), [nx, ny] = P(Math.min(1, k + 0.01)); const ang = Math.atan2(ny - ry, nx - rx);
    if (!this.reduce) { this.trail.push([rx, ry, t]); this.trail = this.trail.filter(p => t - p[2] < 2.2 && p[2] <= t); }
    for (const p of this.trail) { const a = 1 - (t - p[2]) / 2.2; glow(p[0], p[1], 10 + 26 * (1 - a), `rgba(255,${150 + 80 * a | 0},80,${0.5 * a})`); }
    if (reduceOK(this, k)) { g.save(); g.translate(rx, ry); g.rotate(ang); g.shadowColor = '#3be3ff'; g.shadowBlur = 18; g.fillStyle = '#e8f0fb'; g.beginPath(); g.moveTo(26, 0); g.lineTo(6, -7); g.lineTo(-18, -7); g.lineTo(-18, 7); g.lineTo(6, 7); g.closePath(); g.fill(); g.fillStyle = '#ff3fb4'; g.beginPath(); g.moveTo(-6, -7); g.lineTo(-18, -15); g.lineTo(-18, -7); g.fill(); g.beginPath(); g.moveTo(-6, 7); g.lineTo(-18, 15); g.lineTo(-18, 7); g.fill(); g.fillStyle = '#3be3ff'; g.fillRect(2, -2, 8, 4); g.shadowBlur = 0; const fl = 18 + 8 * Math.sin(t * 40); g.fillStyle = '#ff9a3a'; g.beginPath(); g.moveTo(-18, -5); g.lineTo(-18 - fl, 0); g.lineTo(-18, 5); g.fill(); g.fillStyle = '#fff0b0'; g.beginPath(); g.moveTo(-18, -2.5); g.lineTo(-18 - fl * 0.6, 0); g.lineTo(-18, 2.5); g.fill(); g.restore(); }

    // vinyl + hologram on the right
    const cx = w * 0.78, cy = h * 0.74, vr = Math.min(w * 0.17, h * 0.34), sq = 0.3;
    glow(cx, cy, vr * 2, 'rgba(59,227,255,0.10)');
    g.save(); g.translate(cx, cy); g.scale(1, sq);
    g.fillStyle = '#0a0b10'; g.beginPath(); g.arc(0, 0, vr * 1.08, 0, TAU); g.fill(); g.fillStyle = '#12141c'; g.beginPath(); g.arc(0, 8 / sq * 0.5, vr, 0, TAU); g.fill();
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(190,205,230,${0.05 + 0.05 * (i % 3)})`; g.lineWidth = 1 / sq * 0.6; g.beginPath(); g.arc(0, 0, vr * (0.34 + i * 0.026), 0, TAU); g.stroke(); }
    for (let k2 = 0; k2 < 2; k2++) { const a0 = t * 1.4 + k2 * Math.PI; const cg = g.createConicGradient ? g.createConicGradient(a0, 0, 0) : null; if (cg) { cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.03, 'rgba(255,255,255,0.28)'); cg.addColorStop(0.08, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = cg; g.beginPath(); g.arc(0, 0, vr, 0, TAU); g.arc(0, 0, vr * 0.3, 0, TAU, true); g.fill('evenodd'); } }
    const lab = g.createRadialGradient(0, 0, 0, 0, 0, vr * 0.3); lab.addColorStop(0, '#ffe08a'); lab.addColorStop(1, '#ff7a1a'); g.fillStyle = lab; g.beginPath(); g.arc(0, 0, vr * 0.3, 0, TAU); g.fill(); g.restore();
    // hologram globe rising from the label
    const rise = reduceRise(this, t); const gr = vr * 0.62 * rise, gy = cy - vr * 0.15 - gr * 1.1;
    if (rise > 0.02) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const beam = g.createLinearGradient(0, cy, 0, gy + gr); beam.addColorStop(0, 'rgba(59,227,255,0.35)'); beam.addColorStop(1, 'rgba(59,227,255,0)'); g.fillStyle = beam; g.beginPath(); g.moveTo(cx - vr * 0.3, cy); g.lineTo(cx + vr * 0.3, cy); g.lineTo(cx + gr * 0.2, gy + gr); g.lineTo(cx - gr * 0.2, gy + gr); g.closePath(); g.fill();
      glow(cx, gy, gr * 1.8, 'rgba(59,227,255,0.22)');
      g.strokeStyle = 'rgba(120,235,255,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, gy, gr, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(120,235,255,0.35)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = t * 0.5 + i * Math.PI / 6; g.beginPath(); g.ellipse(cx, gy, Math.abs(Math.cos(a)) * gr, gr, 0, 0, TAU); g.stroke(); } for (let i = -2; i <= 2; i++) { const yy = gy + i * gr * 0.32, rr = Math.sqrt(Math.max(0, gr * gr - (i * gr * 0.32) ** 2)); g.beginPath(); g.ellipse(cx, yy, rr, rr * 0.18, 0, 0, TAU); g.stroke(); }
      g.fillStyle = 'rgba(93,255,168,0.55)'; const r2 = rnd(3); for (let i = 0; i < 70; i++) { const a = r2() * TAU + t * 0.5, b = r2() * Math.PI; const vx = Math.cos(a) * Math.sin(b), vz = Math.sin(a) * Math.sin(b); if (vz < 0) continue; if (r2() < 0.5) g.fillRect(cx + vx * gr * 0.95, gy - Math.cos(b) * gr * 0.95, 2.4, 2.4); }
      g.fillStyle = 'rgba(255,63,180,0.9)'; for (let i = 0; i < 5; i++) { const a = t * 0.8 + i * 1.3; const px = cx + Math.cos(a) * gr * 0.7, py = gy + Math.sin(i * 2 + t) * gr * 0.5; g.fillRect(px - 1, py - (6 + 8 * Math.abs(Math.sin(t * 2 + i))), 2, 6 + 8 * Math.abs(Math.sin(t * 2 + i))); }
      g.restore();
    }
    // vignette
    const vg = g.createRadialGradient(w * 0.5, h * 0.5, h * 0.3, w * 0.5, h * 0.5, w * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,4,10,0.6)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }
}
function reduceOK(s, k) { return k > 0.01 && k < 0.985; }
function reduceRise(s, t) { const k = (t % 9) / 9; return s.reduce ? 1 : Math.min(1, Math.max(0, (k - 0.05) / 0.25)) * (k > 0.9 ? Math.max(0, 1 - (k - 0.9) / 0.1) : 1); }
