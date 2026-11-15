import { checkFeasibility, analyse } from '../src/vehicle.js';
import { test, summary, assert, Flight, Autopilot, defaultLoadout, getMission, WORLD, simulateAssisted, B, runFor } from './helpers.mjs';
console.log('Physics & flight');

test('1. fuel exhaustion → thrust 0, engine auto-off, vehicle keeps moving (no teleport / freeze)', () => {
  const f = new Flight(defaultLoadout(), getMission('sounding')); f.ignite(); f.setThrottle(1);
  let guard = 0; while (f.usableFuel() > 0.5 && guard++ < 1e5) f.step(0.05);
  f.step(0.05);
  assert.equal(f.thrustNow, 0, 'thrust must be exactly 0 once there is no usable propellant');
  assert.equal(f.engineOn, false, 'engine must switch itself off');
  assert.ok(f.fuelPercent() >= 0 && f.fuelPercent() < 0.01, 'fuel fraction clamped and ~0');
  assert.match(f.status, /COASTING — NO THRUST/);
  const v0 = f.speed, y0 = f.r; f.step(1);
  assert.ok(f.speed > 0 && Math.abs(f.speed - v0) < 15, `speed continues (changed ${Math.abs(f.speed - v0).toFixed(2)} m/s in 1 s)`);
  assert.notEqual(f.r, y0, 'position keeps changing under inertia');
});

test('2. no free thrust without fuel: setThrottle cannot relight an empty vehicle', () => {
  const f = new Flight(defaultLoadout(), getMission('sounding')); f.ignite(); f.setThrottle(1);
  let g = 0; while (f.usableFuel() > 0.5 && g++ < 1e5) f.step(0.05);
  f.setThrottle(1); f.step(0.05); assert.equal(f.engineOn, false); assert.equal(f.thrustNow, 0);
});

test('3. staging: discarded core propellant is not usable and mass drops', () => {
  const L = B({ engines: 'eng_ember', tanks: 'tank_m', upperStages: 'up_small', payloads: 'pl_probe' });
  const f = new Flight(L, getMission('lunar-orbit')); f.ignite(); f.setThrottle(1);
  runFor(f, 20); const fuelUp0 = f.fuelUp, m0 = f.mass(), core0 = f.fuelCore;
  assert.ok(core0 > 10, 'core still has propellant');
  assert.equal(f.separateStage(), true);
  assert.equal(f.fuelCore, 0, 'core propellant discarded with the stage');
  assert.ok(f.mass() < m0 - core0 * 0.9, 'mass removed (dry + propellant)');
  assert.equal(f.fuelUp, fuelUp0); assert.equal(f.separateStage(), false, 'second separation refused');
  assert.ok(f.usableFuel() <= fuelUp0 + 1e-6, 'usable fuel is only the upper stage');
  f.step(0.05); assert.ok(f.engineOn && f.thrustNow > 0, 'upper engine lights');
});

test('4. throttle zero: engine armed but thrust is exactly 0 and status says COASTING', () => {
  const f = new Flight(defaultLoadout(), getMission('sounding')); f.ignite(); f.setThrottle(1); runFor(f, 10); f.setThrottle(0); f.step(0.05);
  assert.equal(f.thrustNow, 0); assert.match(f.status, /THROTTLE 0/);
  const fuel = f.fuelCore; runFor(f, 5); assert.equal(f.fuelCore, fuel, 'no propellant burned at throttle 0');
  f.setThrottle(0.5); f.step(0.05); assert.ok(f.thrustNow > 0, 'can relight when propellant remains');
});

test('5. high time-warp step sizes stay numerically stable (orbit energy conserved)', () => {
  const run = dtMax => { const f = new Flight(defaultLoadout(), getMission('leo')); f.phase = 'coast'; f.launched = true; f.engineOn = false; const r = WORLD.R + 300000, v = Math.sqrt(WORLD.mu / r); f.x = 0; f.y = r; f.vx = v * 1.05; f.vy = 0;
    const e0 = f.speed ** 2 / 2 - WORLD.mu / f.r; let t = 0; while (t < 20000) { const h = Math.min(f.dtHint(), dtMax); f.step(h); t += h; } const e1 = f.speed ** 2 / 2 - WORLD.mu / f.r; return Math.abs((e1 - e0) / e0); };
  assert.ok(run(40) < 1e-3, 'energy drift with the coarsest coast step is below 0.1%');
  assert.ok(run(1) < 1e-4);
});

test('6. training launch succeeds with the free starter rocket (Kármán Sounding)', () => {
  const { f } = simulateAssisted(defaultLoadout(), getMission('sounding'));
  assert.ok(f.outcome && f.outcome.success, f.outcome && f.outcome.cause);
});

test('7. low Earth orbit reached to the mission requirements', () => {
  const { f } = simulateAssisted(B({ engines: 'eng_ember', tanks: 'tank_l' }), getMission('leo'));
  assert.ok(f.outcome && f.outcome.success, f.outcome && f.outcome.cause);
  const o = f.orbit(); assert.ok(o.pe >= 150000 && o.ap <= 500000, `orbit ${Math.round(o.pe / 1000)}×${Math.round(o.ap / 1000)} km`);
});

test('7b. LEO with an apoapsis above the limit ends with a definite FAIL (never null)', () => {
  const f = new Flight(B({ engines: 'eng_ember', tanks: 'tank_l', payloads: 'pl_sat' }), getMission('leo')); f.ignite(); f.setThrottle(1);
  let g = 0; while (!f.outcome && g++ < 4e5) { if (f.alt < 1000) f.setPitch(90); else if (!f.prograde) { f.setPitch(80); f.setPrograde(true); } f.step(f.dtHint()); }
  assert.ok(f.outcome, 'a flight that ran out of propellant in an invalid orbit must end with an outcome');
  assert.equal(f.outcome.success, false); assert.ok(f.outcome.cause.length > 20, f.outcome.cause);
});

test('8/9. Moon trip is continuous (no position jump) and ends in lunar orbit', () => {
  const m = getMission('lunar-orbit'); const L = B({ engines: 'eng_aurora', tanks: 'tank_l', upperStages: 'up_none', payloads: 'pl_probe', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] });
  const f = new Flight(L, m); f.ignite(); f.setThrottle(1); const ap = new Autopilot(f); let n = 0, maxJump = 0, px = f.x, py = f.y, pv = 0;
  while (n++ < 4e5 && !f.outcome) { ap.update(); let h = f.dtHint(); if (ap.maxStep) h = Math.min(h, ap.maxStep); f.step(h);
    const jump = Math.hypot(f.x - px, f.y - py); const allowed = (Math.max(pv, f.speed) + 50) * h * 1.2 + 1; if (jump > allowed) maxJump = Math.max(maxJump, jump - allowed); px = f.x; py = f.y; pv = f.speed; if (ap.done) break; }
  assert.equal(maxJump, 0, `position must change only by velocity × dt (excess jump ${maxJump} m)`);
  assert.ok(f.moonReached, 'entered the encounter zone by real distance'); assert.ok(f.minMoonD <= WORLD.moonSOI);
  assert.ok(f.outcome && f.outcome.success, f.outcome && f.outcome.cause); assert.equal(f.phase, 'complete');
});

test('9b. a transfer that misses the Moon fails honestly with the miss distance', () => {
  const m = getMission('lunar-orbit'); const L = B({ engines: 'eng_aurora', tanks: 'tank_l', payloads: 'pl_probe', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] });
  const f = new Flight(L, m); f.ignite(); f.setThrottle(1); const ap = new Autopilot(f); ap.update(); let n = 0;
  while (n++ < 4e5 && !f.outcome) { ap.update(); if (ap.state === 'window') { ap.state = 'hold'; } let h = f.dtHint(); f.step(h); if (ap.state === 'hold' && f.phase === 'coast' && f.alt > 150000) break; }
  // now fly a deliberately wrong-phase transfer: burn immediately (wrong window) until apoapsis reaches the Moon distance
  f.setPrograde(true); f.setThrottle(1); let g = 0; while (!f.outcome && g++ < 2e6) { if (f.orbit().ap + WORLD.R >= WORLD.moonDist * 1.0 && f.throttle > 0) f.setThrottle(0); f.step(f.dtHint()); if (f.t > 4e5) break; }
  assert.ok(f.outcome, 'ends with a definite result'); if (!f.moonReached) { assert.equal(f.outcome.success, false); assert.match(f.outcome.cause, /Moon|propellant/i); }
});

test('10a. landing succeeds with a build that has the delta-v', () => {
  const { f } = simulateAssisted(B({ engines: 'eng_ember', tanks: 'tank_l', boosters: 'bst_pair', upperStages: 'up_large', payloads: 'pl_lander', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] }), getMission('lunar-land'));
  assert.ok(f.outcome && f.outcome.success, f.outcome && f.outcome.cause); assert.equal(f.phase, 'complete');
});

test('10b. landing fails honestly when propellant for the descent is missing', () => {
  const m = getMission('lunar-land'); const f = new Flight(B({ engines: 'eng_ember', tanks: 'tank_l', boosters: 'bst_pair', upperStages: 'up_large', payloads: 'pl_lander', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] }), m);
  f.ignite(); f.setThrottle(1); const ap = new Autopilot(f); let n = 0;
  while (n++ < 4e5 && !f.outcome && f.phase !== 'lunar-orbit') { ap.update(); let h = f.dtHint(); if (ap.maxStep) h = Math.min(h, ap.maxStep); f.step(h); }
  assert.equal(f.phase, 'lunar-orbit'); if (f.stage === 'core' && f.canSeparateStage()) f.separateStage();
  f.fuelUp = 5; f.fuelCore = 0;           // almost no propellant left for the descent
  f.startDescent(); assert.ok(f.outcome && f.outcome.success === false, 'descent with no propellant must fail'); assert.match(f.outcome.cause, /propellant|delta-v/i);
});

test('10c. starter rocket cannot reach the Moon and Auto Drive refuses the infeasible launch plan', () => {
  const { f, ap } = simulateAssisted(defaultLoadout(), getMission('lunar-orbit'));
  assert.ok(ap.infeasible && ap.done, 'Auto Drive must clearly refuse a build for which it found no feasible ascent plan');
  assert.equal(f.outcome, null, 'a refused takeover must not fabricate a completed or failed flight');
  assert.match(ap.status, /declined takeover.*manual control remains active/i);
  assert.equal(f.usedAutopilot, false, 'the flight remains eligible for manual control and its normal manual-pilot bonus');
});

test('telemetry switches to the lunar frame (no Earth altitude shown near the Moon)', () => {
  const m = getMission('lunar-orbit'); const f = new Flight(B({ engines: 'eng_aurora', tanks: 'tank_l', payloads: 'pl_probe', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] }), m); f.ignite(); f.setThrottle(1); const ap = new Autopilot(f); let n = 0, seen = null;
  while (n++ < 4e5 && !f.outcome) { ap.update(); let h = f.dtHint(); if (ap.maxStep) h = Math.min(h, ap.maxStep); f.step(h); if (f.phase === 'lunar-orbit') { seen = f.telemetry(); break; } }
  assert.ok(seen, 'reached lunar orbit'); assert.equal(seen.ref, 'Moon'); assert.equal(seen.alt, WORLD.moonOrbitAlt); assert.ok(seen.alt < 1e6, 'lunar altitude, not 35,000 km of Earth altitude'); assert.ok(seen.speed > 300 && seen.speed < 700);
});

test('power and communications budgets change feasibility and mission success (not cosmetic)', () => {
    const m = getMission('lunar-orbit'), base = B({ engines: 'eng_aurora', tanks: 'tank_l', payloads: 'pl_probe', extras: ['ex_rcs'] });
  const noPower = checkFeasibility(base, m); assert.ok(noPower.findings.some(x => x.sev === 'block' && /Power budget/.test(x.text)), 'probe needs solar wings'); assert.ok(noPower.findings.some(x => x.sev === 'block' && /Antenna/.test(x.text)), 'lunar mission needs the antenna');
  const full = { ...base, extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] }; const ok = checkFeasibility(full, m); assert.ok(!ok.findings.some(x => x.sev === 'block' && /Power|Antenna/.test(x.text)));
  assert.ok(analyse(full).m0 > analyse(base).m0 + 100, 'extra hardware adds real mass');
  const f = new Flight(base, m); f.moonReached = true; f.phase = 'lunar-orbit'; assert.equal(f.evaluateCriteria().ok, false, 'even in lunar orbit, no antenna = no mission');
});

// ---- regression tests for the "rocket keeps circling the Earth / fails on the way to the Moon" fixes ----
test('16. Max-Q limiter also throttles boosters (booster builds no longer break up at ~20 s)', () => {
  const L = B({ engines: 'eng_spark', tanks: 'tank_m', structures: 'body_alu', boosters: 'bst_pair', upperStages: 'up_small', payloads: 'pl_probe', extras: ['ex_fairing', 'ex_rcs', 'ex_solar', 'ex_antenna'] });
  const { f } = simulateAssisted(L, getMission('lunar-orbit'));
  assert.ok(!(f.outcome && /Structural failure/.test(f.outcome.cause)), 'no structural failure: ' + (f.outcome && f.outcome.cause));
});
test('17. capture burn switches to the upper stage automatically instead of failing with propellant left', () => {
  const L = B({ engines: 'eng_titan', tanks: 'tank_xl', structures: 'body_comp', boosters: 'bst_quad', upperStages: 'up_small', payloads: 'pl_probe', extras: ['ex_rcs', 'ex_solar', 'ex_antenna'] });
  const { f } = simulateAssisted(L, getMission('lunar-orbit'));
  assert.ok(!(f.outcome && /short of lunar capture/.test(f.outcome.cause)), f.outcome && f.outcome.cause);
});
test('18. an impossible transfer ends with a clear failure instead of circling the Earth forever', () => {
  const L = B({ engines: 'eng_titan', tanks: 'tank_s', structures: 'body_ti', boosters: 'bst_quad', upperStages: 'up_small', payloads: 'pl_probe', extras: ['ex_fairing', 'ex_rcs', 'ex_solar', 'ex_antenna'] });
  const { f } = simulateAssisted(L, getMission('lunar-orbit'));
  assert.ok(f.outcome, 'flight must end (never an endless orbit)');
  if (!f.outcome.success) assert.ok(f.outcome.cause.length > 30);
});

const r = await summary('physics'); process.exit(r.failed ? 1 : 0);
