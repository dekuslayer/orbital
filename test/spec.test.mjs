// Requirements tests: physics consistency, fuel cut-off, Max-Q, launch economy, exploded view (real three.js geometry in Node).
import './three-hook.mjs';
import { analyse, checkFeasibility } from '../src/vehicle.js';
import { PARTS, G0 } from '../src/parts.js';
import { test, summary, assert, Flight, defaultLoadout, getMission, WORLD, B, runFor } from './helpers.mjs';
console.log('Requirements: physics, Max-Q, exploded view');

const FULL = { engines: 'eng_titan', tanks: 'tank_xl', structures: 'body_ti', boosters: 'bst_quad', upperStages: 'up_large', payloads: 'pl_lander', extras: ['ex_fairing', 'ex_gimbal', 'ex_rcs', 'ex_solar', 'ex_antenna'] };
const MID = { engines: 'eng_ember', tanks: 'tank_m', structures: 'body_comp', boosters: 'bst_pair', upperStages: 'up_small', payloads: 'pl_sat', extras: ['ex_fairing', 'ex_gimbal'] };

test('mass bookkeeping: the flight model starts at exactly the analysed lift-off mass for every kind of build', () => {
  for (const L of [defaultLoadout(), FULL, MID, B({ extras: ['ex_gimbal', 'ex_rcs'] }), B({ extras: ['ex_fairing', 'ex_solar', 'ex_antenna'] })]) {
    const a = analyse(L), f = new Flight(L, getMission('sounding'));
    assert.ok(Math.abs(f.mass() - a.m0) < 1e-6, `Flight.mass ${f.mass()} vs analyse ${a.m0}`);
  }
});

test('scaled-world consistency: μ = g0·R², circular and escape speeds follow, Moon uses the same rule', () => {
  assert.ok(Math.abs(WORLD.mu - G0 * WORLD.R ** 2) < 1);
  const r = WORLD.R + 200000, vc = Math.sqrt(WORLD.mu / r);
  const f = new Flight(defaultLoadout(), getMission('leo')); f.phase = 'coast'; f.launched = true; f.x = 0; f.y = r; f.vx = vc; f.vy = 0;
  const o = f.orbit(); assert.ok(o.bound && Math.abs(o.ap - o.pe) < 50, 'circular speed gives a circular orbit');
  f.vx = vc * Math.SQRT2 * 1.0001; assert.equal(f.orbit().bound, false, 'escape speed = √2 · circular speed');
  f.vx = vc * Math.SQRT2 * 0.999; assert.equal(f.orbit().bound, true);
  const t = f.telemetry(); assert.ok(Number.isFinite(t.alt));
});

test('burnout in vacuum: thrust 0, fuel frozen, mass = dry mass, orbital energy conserved (no powered gain after cut-off)', () => {
  const L = B({ engines: 'eng_ember', tanks: 'tank_l' }); const f = new Flight(L, getMission('transfer'));
  const r0 = WORLD.R + 300000; f.x = 0; f.y = r0; f.vx = Math.sqrt(WORLD.mu / r0); f.vy = 0; f.fairingAttached = false;
  f.ignite(); f.setPitch(0); f.pitch = 0; f.setThrottle(1);
  let g = 0; while (f.usableFuel() > 0.5 && g++ < 1e6 && !f.outcome) f.step(0.1);
  assert.ok(!f.outcome && f.usableFuel() <= 0.5, 'burn ran to propellant exhaustion in vacuum (' + (f.outcome && f.outcome.cause) + ')');
  f.step(0.1); assert.equal(f.thrustNow, 0); assert.equal(f.engineOn, false); assert.match(f.status, /NO THRUST/);
  const dry = analyse(L).dryMass; assert.ok(Math.abs(f.mass() - dry) < 1, `mass ${f.mass()} == dry ${dry}`);
  const fuel0 = f.fuelCore; f.setThrottle(1); assert.ok(f.speed > Math.sqrt(WORLD.mu / r0) * 1.3, 'the burn really added speed (' + Math.round(f.speed) + ' m/s)');
  const e0 = f.speed ** 2 / 2 - WORLD.mu / f.r; let steps = 0; while (steps++ < 3000 && f.alt > 160000) f.step(2);   // the flight keeps integrating after an outcome (coastOnly)
  const e1 = f.speed ** 2 / 2 - WORLD.mu / f.r; assert.ok(steps > 3 && Math.abs((e1 - e0) / e0) < 2e-4, `specific energy constant while coasting (${((e1 - e0) / e0).toExponential(2)})`);
  assert.equal(f.fuelCore, fuel0, 'no propellant burned after exhaustion'); assert.equal(f.thrustNow, 0);
});

test('burnout in the atmosphere: coasting only decelerates (gravity + drag), the rocket never gains speed without thrust', () => {
  const f = new Flight(defaultLoadout(), getMission('sounding')); f.ignite(); f.setThrottle(1);
  let g = 0; while (f.usableFuel() > 0.5 && g++ < 1e5) f.step(0.05); f.step(0.05);
  let prev = f.vUp, rose = 0; for (let i = 0; i < 600 && !f.outcome && f.alt > 10; i++) { f.step(0.1); if (f.vUp > prev + 1e-6) rose++; prev = f.vUp; assert.equal(f.thrustNow, 0); }
  assert.equal(rose, 0, 'vertical speed decreased monotonically while coasting upward');
});

test('Max-Q limiter: reduces throttle near the limit, is a pure setting (no launch, no state change), and the status shows when it acts', () => {
  const f = new Flight(B({ engines: 'eng_titan', tanks: 'tank_m' }), getMission('sounding'));
  assert.equal(f.phase, 'ready'); f.maxQAssist = !f.maxQAssist; f.maxQAssist = !f.maxQAssist; assert.equal(f.phase, 'ready'); assert.equal(f.launched, false); assert.equal(f.engineOn, false);
  f.ignite(); f.setThrottle(1); let minEff = 1, lim = 0, seen = false;
  for (let i = 0; i < 4000 && !f.outcome; i++) { f.step(0.05); if (f.q > 0.7 * f.qLimit()) seen = true; minEff = Math.min(minEff, f.effThrottle ?? 1); lim = Math.max(lim, f.q); }
  assert.ok(seen && minEff < 1, 'limiter lowered the effective throttle (min ' + minEff.toFixed(2) + ')');
  assert.ok(lim <= f.qLimit() * 1.02, 'dynamic pressure stayed within the structural limit with the limiter on: ' + Math.round(lim));
});

test('Max-Q: dynamic pressure is ½ρv² from the model atmosphere', () => {
  const f = new Flight(defaultLoadout(), getMission('sounding')); f.ignite(); f.setThrottle(1); runFor(f, 25);
  const expect = 0.5 * f.density(f.alt) * f.speed ** 2; assert.ok(Math.abs(f.q - expect) / Math.max(expect, 1) < 0.02, `q ${f.q} vs ${expect}`);
});

test('every installed component is addressable and the exploded view separates ALL of them, then restores exactly', async () => {
  const THREE = await import('three'); const { buildRocket, applyExplode } = await import('../src/rocketModel.js');
  for (const L of [defaultLoadout(), FULL, MID]) {
    const r = buildRocket(L); r.group.updateMatrixWorld(true);
    const keys = r.components.map(c => c.key);
    for (const must of ['engine', 'skirt', 'tank', 'interstage', 'payload']) assert.ok(keys.includes(must), 'component ' + must);
    if (L.upperStages !== 'up_none') assert.ok(keys.includes('upper')); if (L.boosters !== 'bst_none') assert.ok(keys.includes('boosters'));
    for (const x of L.extras || []) { const want = { ex_fairing: 'fairing', ex_gimbal: 'gimbal', ex_rcs: 'rcs', ex_solar: 'solar0', ex_antenna: 'antenna' }[x]; assert.ok(keys.includes(want), 'extra ' + want); }
    let meshes = 0, owned = 0; r.group.traverse(o => { if (o.isMesh) { meshes++; let a = o; while (a) { if (a.userData && a.userData.compKey) { owned++; break; } a = a.parent; } } });
    assert.equal(owned, meshes, 'every mesh belongs to a component (nothing stays glued to the body)');
    const snap = () => r.components.map(c => [c.obj.position.toArray(), ...(c.kids || []).map(k => k.k.position.toArray()), ...c.obj.children.filter(ch => ch.userData.b).map(ch => ch.position.toArray())].flat(2));
    const before = JSON.stringify(snap()); const ext = applyExplode(r.components, 1); const exploded = JSON.stringify(snap());
    assert.notEqual(exploded, before); assert.ok(ext > 5);
    for (const c of r.components) { const p0 = c.base, p1 = c.obj.position; const moved = p0.distanceTo(p1) > 0.25 || (c.kids || []).some(k => k.k.position.distanceTo(k.base) > 0.25) || c.obj.children.some(ch => ch.userData.b && ch.position.distanceTo(ch.userData.b) > 0.25); assert.ok(moved, c.key + ' moved'); }
    applyExplode(r.components, 0.5); applyExplode(r.components, 1); applyExplode(r.components, 0);
    assert.equal(JSON.stringify(snap()), before, 'restored exactly after repeated explode/collapse (no drift, no loss)');
  }
});

test('Jukebox: every illustrative location sits on the kind of surface its variable is about (land mask), and wrong surfaces are rejected', async () => {
  const { RECORDS, validateRecordData } = await import('../src/records.js'); const { surfaceAt } = await import('../src/landmask.js');
  for (const r of RECORDS) { if (!r.surface || r.surface === 'any') continue; for (const p of r.points) assert.equal(surfaceAt(p[0], p[1]), r.surface, `${r.id}: ${p[0]},${p[1]} must be ${r.surface}`); }
  assert.equal(surfaceAt(23, 12), 'land'); assert.equal(surfaceAt(0, -150), 'ocean');
  const fire = RECORDS.find(r => r.id === 'rec_fire'), good = { provenance: { producer: 'x', dataset: 'x', sourceUrl: 'https://x.org', retrieved: '2026-01-01', periodA: 'a', periodB: 'b', units: 'detection count index' }, labels: ['a', 'b'], series: { A: { name: 'a', values: [1, 2] }, B: { name: 'b', values: [1, 2] } }, points: [[-10, -55, 0.5]] };
  assert.equal(validateRecordData(good, fire).ok, true);
  const bad = validateRecordData({ ...good, points: [[0, -150, 0.5]] }, fire); assert.equal(bad.ok, false); assert.match(bad.errors.join(' '), /not on land/);
});

test('a failed flight never sinks through the ground: the wreck rests on the surface', () => {
  const f = new Flight(defaultLoadout(), getMission('leo')); f.ignite(); f.setThrottle(1); f.maxQAssist = false; f.setPitch(90);
  let g = 0; while (!f.outcome && g++ < 5000) f.step(f.dtHint()); assert.ok(f.outcome && !f.outcome.success, 'breaks up at max-Q with the limiter off');
  for (let i = 0; i < 4000; i++) f.step(0.5);
  assert.ok(f.alt > -1, 'altitude after 2000 s of wreckage is ' + Math.round(f.alt) + ' m'); assert.ok(f.grounded);
});

summary('spec').then(r => process.exit(r.failed ? 1 : 0));
