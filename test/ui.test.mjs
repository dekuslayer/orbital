// Display-layer logic that can run without a browser: the 2D flight fallback and the "no fee before the display exists" rule.
const { test, summary, assert, Flight, Autopilot, defaultLoadout, getMission, B } = await import('./helpers.mjs');
console.log('UI logic (2D fallback, safe launch)');
const fakeCtx = () => new Proxy({}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const fakeCanvas = () => { const ctx = fakeCtx(); return { clientWidth: 800, clientHeight: 450, width: 0, height: 0, getContext: () => ctx }; };
globalThis.window = globalThis; globalThis.devicePixelRatio = 1;
const { FlightView2D } = await import('../src/scenes/flightScene2d.js');
const { store } = await import('../src/state.js');

test('2D fallback draws a real Moon mission end-to-end without throwing and keeps the same interface', () => {
  const m = getMission('lunar-orbit'); const lo = B({ engines: 'eng_aurora', tanks: 'tank_l', payloads: 'pl_probe', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] });
  const f = new Flight(lo, m); const v = new FlightView2D(fakeCanvas()); v.setFlight(f); v.update(0.016, f);
  assert.equal(v.is2D, true); f.ignite(); f.setThrottle(1); const ap = new Autopilot(f); let t = 0, frames = 0, maxTrail = 0;
  while (!f.outcome && t < 2e6) { ap.update(); const h = Math.min(f.dtHint(), ap.maxStep || 1e9); f.step(h); t += h; if (++frames % 200 === 0) { v.update(0.016, f); maxTrail = Math.max(maxTrail, v.trail.length); v.mapView = (frames % 400 === 0); } }
  v.update(0.016, f); assert.ok(f.outcome, 'the flight ended'); assert.ok(maxTrail > 5, 'the trail was recorded');
  v.mapView = true; v.update(0.016, f); const sp = v.screenOf(0, 0); assert.ok(Number.isFinite(sp.x) && Number.isFinite(sp.y) && sp.behind === false);
  v.setFlight(new Flight(lo, m)); assert.equal(v.trail.length, 0); assert.equal(v.pathInfo, null); v.dispose();
});

test('2D fallback also handles the pad, a failed flight and a landing mission', () => {
  const v = new FlightView2D(fakeCanvas()); const f = new Flight(B({}), getMission('sounding')); v.setFlight(f); v.update(0.016, f);
  f.ignite(); f.setThrottle(1); let n = 0; while (!f.outcome && n++ < 400000) { f.step(Math.min(f.dtHint(), 1)); if (n % 50 === 0) v.update(0.016, f); }
  for (let i = 0; i < 40; i++) v.update(0.1, f); assert.ok(f.outcome);
  const g = new Flight(B({ engines: 'eng_ember', tanks: 'tank_l' }), getMission('lunar-land')); v.setFlight(g); v.update(0.016, g); g.phase = 'lunar-descent'; v.update(0.016, g); g.phase = 'landed'; v.update(0.016, g);
});

test('launch fee is never taken when no flight display can start; taken exactly once when it can', async () => {
  const { beginLaunch } = await import('../src/launch.js'); const m = getMission('sounding');
  const before = store.get().credits;
  const r1 = beginLaunch(store, m, () => false); assert.equal(r1.ok, false); assert.equal(r1.why, 'no-display'); assert.equal(store.get().credits, before, 'no display → no charge');
  const r2 = beginLaunch(store, m, () => { throw new Error('WebGL context lost'); }); assert.equal(r2.ok, false); assert.equal(store.get().credits, before, 'a throwing display start → no charge');
  const r3 = beginLaunch(store, m, () => true); assert.equal(r3.ok, true); assert.equal(store.get().credits, before - r3.fee); assert.ok(r3.fee > 0);
});

test('launch is refused (no charge) when the design is not cleared or the balance is too low', async () => {
  const { beginLaunch } = await import('../src/launch.js'); const m = getMission('lunar-land');
  const before = store.get().credits; const r = beginLaunch(store, m, () => true); assert.equal(r.ok, false); assert.equal(r.why, 'blocked'); assert.equal(store.get().credits, before);
});

const r = await summary('ui'); process.exit(r.failed ? 1 : 0);
