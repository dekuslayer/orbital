// Regression tests for the autopilot repair: mid-flight takeover, no repeated log lines, fuel budgeting, Manual<->Auto switching, audio race.
import { test, summary, assert, Flight, Autopilot, getMission, WORLD, simulateAssisted } from './helpers.mjs';
import { PARTS } from '../src/parts.js';
import { verifiedBuild } from '../src/advisor.js';
import { Sonifier } from '../src/audio.js';
console.log('Autopilot: takeover, logging, fuel budget, switching');
const ALL = Object.values(PARTS).flat().map(p => p.id);
const build = id => verifiedBuild(ALL, getMission(id), { tries: 80 }).loadout;
const drive = (f, ap, until = () => false) => { let n = 0; while (n++ < 500000 && !f.outcome && !(ap && ap.done) && !until(f)) { if (ap) ap.update(); let h = f.dtHint(); if (ap && ap.maxStep) h = Math.min(h, ap.maxStep); f.step(h); } };
const pilot = (f, P = { turnAlt: 80000, turnExp: 0.5 }) => { if (f.canSeparateBoosters() && f.fuelB <= 1 && f.boostersAttached) f.separateBoosters(); if (f.stage === 'core' && f.canSeparateStage() && f.fuelCore <= 1 && f.fuelUp > 1 && (!f.boostersAttached || f.fuelB <= 1)) f.separateStage(); const o = f.orbit(); if (o.ap >= 200000) { f.setThrottle(0); return; } f.setThrottle(f.q > 0.6 * f.qLimit() ? 0.6 : 1); const a = f.alt; f.setPitch(a < 1000 ? 90 : Math.max(4, 90 - 86 * Math.pow(Math.min(1, (a - 1000) / P.turnAlt), P.turnExp))); };
const flyManual = (f, until) => { let n = 0; while (n++ < 200000 && !f.outcome && !until(f)) { pilot(f); f.step(f.dtHint()); } };
const repeats = f => { const m = f.events.map(e => e.msg); return m.length - new Set(m).size; };

test('Sounding: the engine-cut message is logged once, not once per update tick (was 461 times)', () => {
  const { f } = simulateAssisted(build('sounding'), getMission('sounding')); assert.ok(f.outcome.success); assert.equal(repeats(f), 0, 'no repeated log lines');
  assert.ok(f.events.length < 15, 'event log stays small: ' + f.events.length);
});
test('takeover above 3 km now PLANS from the real state (the old altitude < 3000 condition skipped planning)', () => {
  const B = build('leo'), m = getMission('leo'); const f = new Flight(B, m); f.ignite(); flyManual(f, ff => ff.alt >= 20000);
  const ap = new Autopilot(f); assert.ok(ap.planned && ap.planned.turnAlt, 'a pitch programme was chosen from the current state'); assert.equal(ap.startState, 'climb');
  drive(f, ap); assert.ok(f.outcome && f.outcome.success, f.outcome && f.outcome.cause);
});
test('takeover in every flight state of the lunar mission is recognised and completes (orbit / window / cruise)', () => {
  for (const st of ['orbit', 'window', 'cruise']) {
    const m = getMission('lunar-orbit'), f = new Flight(build('lunar-orbit'), m); f.ignite(); f.setThrottle(1); const a0 = new Autopilot(f); drive(f, a0, () => a0.state === st); assert.ok(!f.outcome, st);
    a0.stop('manual'); const ap = new Autopilot(f); assert.ok(['orbit', 'window', 'cruise'].includes(ap.startState), st + ' -> ' + ap.startState); drive(f, ap); assert.ok(f.outcome && f.outcome.success, st + ': ' + (f.outcome && f.outcome.cause));
  }
});
test('cruise-state takeover never fires a second transfer burn', () => {
  const m = getMission('lunar-orbit'), f = new Flight(build('lunar-orbit'), m); f.ignite(); f.setThrottle(1); const a0 = new Autopilot(f); drive(f, a0, () => a0.state === 'cruise'); a0.stop('x');
  const ap = new Autopilot(f); assert.equal(ap.startState, 'cruise'); const fuel0 = f.fuelCore + f.fuelUp; for (let i = 0; i < 200 && !f.outcome; i++) { ap.update(); f.step(f.dtHint()); } assert.ok(Math.abs(f.fuelCore + f.fuelUp - fuel0) < 1, 'no propellant burned while coasting to the Moon');
});
test('Manual → Auto → Manual → Auto keeps a valid state and finishes the mission', () => {
  const m = getMission('transfer'), f = new Flight(build('transfer'), m); f.ignite(); flyManual(f, ff => ff.alt >= 3000);
  const a1 = new Autopilot(f); drive(f, a1, ff => ff.alt >= 25000); a1.stop('Autopilot off: you have control'); assert.ok(!f.outcome);
  flyManual(f, ff => ff.alt >= 50000 || ff.outcome); assert.ok(!f.outcome, 'manual leg survives');
  const a2 = new Autopilot(f); drive(f, a2); assert.ok(f.outcome && f.outcome.success, f.outcome && f.outcome.cause);
  for (const k of ['x', 'y', 'vx', 'vy', 'fuelCore', 'fuelUp', 'fuelB']) assert.ok(Number.isFinite(f[k]), k + ' finite');
});
test('infeasible low-fuel takeover is declined without changing manual flight controls', () => {
  const m = getMission('leo'), f = new Flight(build('leo'), m); f.ignite(); let n = 0;
  while (n++ < 100000 && !f.outcome && f.fuelPercent() > 0.3) { f.setThrottle(1); f.setPitch(90); f.step(f.dtHint()); }
  assert.ok(!f.outcome, 'test reaches the handover point before flight termination');
  const before = [f.x, f.y, f.vx, f.vy, f.pitch, f.targetPitch, f.throttle, f.fuelCore, f.fuelUp, f.fuelB, f.stage];
  const ap = new Autopilot(f);
  assert.ok(ap.infeasible, 'planner identifies that no candidate ascent is feasible');
  assert.equal(ap.done, true, 'autopilot declines takeover instead of flying a default programme');
  assert.match(ap.status, /declined takeover.*manual control remains active/i);
  assert.equal(f.usedAutopilot, false, 'a refused takeover does not mark the flight as assisted');
  assert.deepEqual([f.x, f.y, f.vx, f.vy, f.pitch, f.targetPitch, f.throttle, f.fuelCore, f.fuelUp, f.fuelB, f.stage], before,
    'the refused takeover leaves trajectory, throttle, pitch and fuel unchanged');
  assert.ok(Number.isFinite(f.x) && Number.isFinite(f.vx));
});

test('an unrecoverable lunar wrong-pitch takeover is rejected and leaves manual control intact', () => {
  const m = getMission('lunar-orbit'), f = new Flight(build('lunar-orbit'), m); f.ignite();
  let n = 0;
  while (n++ < 100000 && !f.outcome && f.alt < 45000) {
    const a = f.alt;
    f.setThrottle(f.q > 0.6 * f.qLimit() ? 0.6 : 1);
    if (a > 15000 && a < 60000) f.setPitch(55);
    else f.setPitch(a < 1000 ? 90 : Math.max(4, 90 - 86 * Math.pow(Math.min(1, (a - 1000) / 80000), 0.5)));
    f.step(f.dtHint());
  }
  assert.ok(!f.outcome && f.alt >= 45000, 'reaches the intentionally poor handover state');
  assert.equal(Math.round(f.targetPitch), 55, 'the incorrect 55-degree command is still active');
  const before = [f.x, f.y, f.vx, f.vy, f.pitch, f.targetPitch, f.throttle, f.fuelCore, f.fuelUp, f.fuelB, f.stage];
  const ap = new Autopilot(f);
  assert.ok(ap.infeasible, 'the planner must not pretend this trajectory is recoverable');
  assert.equal(ap.done, true);
  assert.match(ap.status, /declined takeover.*manual control remains active/i);
  assert.deepEqual([f.x, f.y, f.vx, f.vy, f.pitch, f.targetPitch, f.throttle, f.fuelCore, f.fuelUp, f.fuelB, f.stage], before);
  assert.equal(f.usedAutopilot, false);
});

test('recreating Auto Drive during the lunar transfer window does not duplicate its status event', () => {
  const m = getMission('lunar-orbit'), f = new Flight(build('lunar-orbit'), m); f.ignite(); f.setThrottle(1);
  const first = new Autopilot(f);
  drive(f, first, () => first.state === 'window');
  assert.equal(first.state, 'window');
  const message = 'Autopilot: Waiting for the transfer window';
  assert.equal(f.events.filter(e => e.msg.startsWith(message)).length, 1);
  first.stop('Manual control');
  const second = new Autopilot(f);
  second.update();
  assert.equal(f.events.filter(e => e.msg.startsWith(message)).length, 1,
    'the same transfer-window status is not logged again after handover');
});
test('lunar landing: the fuel budget includes the descent burn and the descent-engine thrust, and refuses before burning', () => {
  const m = getMission('lunar-land'), f = new Flight(build('lunar-land'), m); const ap = new Autopilot(f, { plan: false });
  const ok = ap.lunarBudget(true); assert.ok(ok.need >= m.captureDv + m.descentDv, 'need counts capture + descent (+ transfer)'); assert.ok(ok.ok);
  f.fuelCore = 0; f.fuelB = 0; f.fuelUp = 600; const low = ap.lunarBudget(true); assert.equal(low.ok, false); assert.match(low.reason, /delta-v/);
});
test('LEO is never declared successful with an apoapsis above 500 km', () => {
  const m = getMission('leo'), f = new Flight(build('leo'), m); f.ignite(); f.x = 0; f.y = WORLD.R + 900000; const v = Math.sqrt(WORLD.mu / (WORLD.R + 900000)); f.vx = v; f.vy = 0; f.step(0.05);
  assert.equal(f.evaluateCriteria().ok, false); assert.match(f.evaluateCriteria().reason, /exceeds 500 km/);
});
test('clone() is an independent copy: simulating it never changes the real flight', () => {
  const m = getMission('leo'), f = new Flight(build('leo'), m); f.ignite(); f.setThrottle(1); for (let i = 0; i < 400; i++) f.step(0.05); const snap = JSON.stringify([f.x, f.y, f.vx, f.vy, f.fuelCore, f.t, f.events.length]);
  const c = f.clone(); for (let i = 0; i < 2000; i++) c.step(0.05); c.log(c.t, 'sim only'); assert.equal(JSON.stringify([f.x, f.y, f.vx, f.vy, f.fuelCore, f.t, f.events.length]), snap); assert.notEqual(c.uid, f.uid);
});
test('dvRemaining counts the spacecraft-bus mass (solar wings/antenna) like mass() does', () => {
  const m = getMission('lunar-orbit'), f = new Flight(build('lunar-orbit'), m); f.stage = 'upper'; f.fuelCore = 0; f.boostersAttached = false;
  const viaMass = f.activeIsp() * 9.80665 * Math.log(f.mass() / (f.mass() - f.fuelUp)); assert.ok(Math.abs(f.dvRemaining() - viaMass) < 1e-6, `${f.dvRemaining()} vs ${viaMass}`);
});
test('non-finite state is caught: the flight ends safely instead of propagating NaN', () => {
  const f = new Flight(build('sounding'), getMission('sounding')); f.ignite(); f.setThrottle(1); for (let i = 0; i < 20; i++) f.step(0.05); f.vx = NaN; f.step(0.05);
  assert.ok(f.outcome && !f.outcome.success && /Numerical/.test(f.outcome.cause)); assert.ok(Number.isFinite(f.vx));
});
test('Sonifier: a play() still waiting for the AudioContext cannot start sound after Stop (no sound from a discarded record)', async () => {
  const mk = () => ({ currentTime: 0, sampleRate: 8000, destination: {}, state: 'suspended', resume() { return new Promise(r => setTimeout(r, 30)); }, close() {},
    createDynamicsCompressor() { return { threshold: {}, ratio: {}, attack: {}, release: {}, connect() {} }; },
    createGain() { const g = { value: 0, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} }; return { gain: g, connect() {} }; },
    createOscillator() { return { frequency: {}, detune: {}, connect() {}, start() {}, stop() {} }; } });
  globalThis.window = { AudioContext: function () { return mk(); } };
  const rec = { id: 'rec_x', variant: 'ocean', singleSeries: false }, data = { labels: ['a', 'b'], series: { A: { values: [1, 2] }, B: { values: [2, 3] } }, points: [] };
  const s = new Sonifier(); s.load(rec, data); const p = s.play(); s.stop(true); const ok = await p;
  assert.equal(ok, false); assert.equal(s.state, 'stopped'); assert.equal(s.timer, null, 'no scheduler timer was started');
  s.load(rec, data); const p2 = s.play(); s.load({ ...rec, id: 'rec_y' }, data); assert.equal(await p2, false, 'switching disc while waiting also cancels'); assert.equal(s.timer, null); delete globalThis.window;
});
const r = await summary('autopilot'); process.exit(r.failed ? 1 : 0);
