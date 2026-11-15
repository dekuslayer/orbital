// ORBITAL — optional flight assistant ("autopilot"). Pure logic, no rendering; drives the same Flight API a player uses.
// It exists so that players who cannot yet fly the gravity turn by hand can still complete missions and learn from watching.
// Assisted flights are marked in the report and do not earn the manual-pilot bonus.
import { WORLD } from './missions.js';
import { G0 } from './parts.js';
import { Flight } from './flight.js';

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const km = v => Math.round(v / 1000).toLocaleString('en-US') + ' km';

export class Autopilot {
  constructor(flight, opts = {}) {
    this.f = flight; this.turnAlt = opts.turnAlt; this.turnExp = opts.turnExp; this.done = false; this.status = 'Autopilot engaged'; this.maxStep = undefined; this.warp = undefined;
    this.targetAlt = 200000; this.prevE = null; this.tliDv = 0; this.lastPredict = -1e9; this.note = ''; this.tliBias = 0; this.eTrigger = undefined;
    this._lastSay = null; this._cut = false; this.corrections = 0;
    // The autopilot never assumes the rocket is on the pad: it classifies the ACTUAL current flight state first
    // (altitude, velocity, fuel, stage, engine, orbit, phase), so it can take over at any moment of any mission.
    this.state = flight.phase === 'ready' ? 'climb' : this.assess();
    this.startState = this.state;
    if (opts.plan !== false && flight.mission.id !== 'sounding') this.planFromState();
    // A refused takeover is not an assisted flight: preserve manual control and its normal reward eligibility.
    if (!this.infeasible) flight.usedAutopilot = true;
  }
  // Decide which mission phase matches the vehicle's real situation right now.
  assess() {
    const f = this.f, o = f.orbit(), alt = f.alt, id = f.mission.id, R = WORLD.R;
    if (f.phase.startsWith('lunar') || f.phase === 'landed') return 'lunar';
    if (id === 'sounding') return 'climb';
    if (f.mission.captureDv) {
      // Already on the way to the Moon (transfer ellipse reaching lunar distance): coast, never burn again.
      if (alt > 100000 && (!o.bound || o.ap + R >= WORLD.moonDist * 0.99)) return 'cruise';
    }
    if (id === 'deep' && !o.bound && o.vinf >= 1300 && alt > 100000) return 'cruise';
    if (id === 'transfer' && o.bound && o.pe >= 150000 && o.ap >= 8.8e6) return 'raise';
    if (o.bound && o.pe >= 150000 && alt > 100000) return 'orbit';
    // Suborbital arc above the atmosphere whose apoapsis already reaches the target: do not burn more, coast to apoapsis.
    if (alt > 120000 && o.ap >= this.targetAlt) return f.vUp <= 5 ? 'circ' : 'coast';
    return 'climb';
  }
  // Plan from the current state: clone the real flight and simulate several pitch programmes forward; keep the best one.
  planFromState() {
    const f = this.f, st = this.state;
    if (st === 'lunar') return;
    if (st === 'climb') return this.planAscent();
    if (f.mission.captureDv && (st === 'coast' || st === 'circ' || st === 'orbit' || st === 'window')) { this.tliBias = this.measureTliBias(null); }
    this.planned = { fromState: st };
    f.log(f.t, `Autopilot takeover at ${(f.alt / 1000).toFixed(0)} km: flight state recognised as "${st}"; continuing from there.`, 'info');
  }
  // Simulate the rest of the ascent headlessly (on a clone of the CURRENT state) with several pitch programmes and keep
  // the one that reaches orbit with the most delta-v left. Works from the pad and from any altitude after a takeover.
  planAscent() {
    const f = this.f; let best = null;
    const base = f.clone(); if (base.phase === 'ready') base.ignite();
    const tier1 = [[60000, 0.5], [80000, 0.5], [80000, 0.8], [100000, 0.65], [100000, 1.0], [70000, 1.3], [40000, 0.4], [30000, 0.35]];
    const tier2 = [[50000, 0.5], [50000, 0.8], [60000, 0.8], [90000, 0.5], [120000, 0.8], [120000, 1.2], [45000, 0.6], [35000, 0.5], [25000, 0.5], [70000, 0.65], [150000, 1.0], [20000, 0.4]];
    const tryProgrammes = list => {
      for (const [turnAlt, turnExp] of list) {
        const c = base.clone(); c.setThrottle(1);
        const a = new Autopilot(c, { plan: false, turnAlt, turnExp }); let n = 0;
        while (n++ < 60000 && !c.outcome && !a.done && a.state !== 'orbit' && a.state !== 'window') {
          a.update(); let h = c.dtHint(); if (a.maxStep) h = Math.min(h, a.maxStep); c.step(h);
        }
        const o = c.orbit(); const ok = !c.outcome && (a.state === 'orbit' || a.state === 'window') && o.bound && o.pe >= 150000 && (c.mission.id !== 'leo' || o.ap <= 480000);   // LEO must also end up near-circular
        const score = ok ? c.dvRemaining() : -1;
        if (!best || score > best.score) best = { turnAlt, turnExp, score };
      }
    };
    tryProgrammes(tier1);
    if (!(best && best.score >= 0) && f.alt > 3000) tryProgrammes(tier2);    // a takeover may need a wider search: the pad programmes were tuned for lift-off
    const from = f.alt > 3000 ? ` from ${(f.alt / 1000).toFixed(0)} km` : '';
    if (best && best.score >= 0 && f.mission.captureDv) this.tliBias = this.measureTliBias(best);
    if (best && best.score >= 0) { this.turnAlt = best.turnAlt; this.turnExp = best.turnExp; this.planned = best; this.f.log(f.t, `Autopilot plan${from}: pitch programme chosen by simulation (reaches orbit with ≈${Math.round(best.score)} m/s of delta-v to spare).`, 'info'); }
    else {
      this.planned = best;
      this.infeasible = true;
      // Never apply a default pitch programme after the planner has failed to find a feasible one.
      // That would turn a rejected takeover into uncontrolled best-effort flight and can waste the remaining propellant.
      this.done = true;
      this.maxStep = undefined;
      this.warp = undefined;
      this.status = 'Autopilot declined takeover: no feasible ascent plan was found from the current flight state. Manual control remains active.';
      this.f.log(f.t, `Autopilot plan${from}: no feasible ascent programme was found from the current state (about ${Math.round(f.dvRemaining())} m/s of delta-v available). Takeover declined; manual control remains active.`, 'warn');
    }
  }
  // Direction (angle in the orbital plane) of the apoapsis of the current orbit, from the eccentricity vector.
  apseAngle() {
    const f = this.f, mu = WORLD.mu, r = Math.hypot(f.x, f.y), v2 = f.vx * f.vx + f.vy * f.vy, rv = f.x * f.vx + f.y * f.vy;
    const ex = ((v2 - mu / r) * f.x - rv * f.vx) / mu, ey = ((v2 - mu / r) * f.y - rv * f.vy) / mu;
    return Math.atan2(-ey, -ex);
  }
  // Fly the same ascent + transfer burn on a clone and measure how far (rad) the real apoapsis ends up from the one the simple
  // 'burn centred opposite the Moon' rule predicts. Long burns, staging and gravity losses make that rule slightly off; the bias corrects it.
  measureTliBias(best) {
    const f = this.f; const c = f.clone(); if (c.phase === 'ready') c.ignite(); c.setThrottle(1);
    const a = new Autopilot(c, { plan: false, turnAlt: best ? best.turnAlt : this.turnAlt, turnExp: best ? best.turnExp : this.turnExp }); let n = 0;
    while (n++ < 300000 && !c.outcome && !a.done && a.state !== 'cruise') { a.update(); let h = c.dtHint(); if (a.maxStep) h = Math.min(h, a.maxStep); c.step(h); }
    if (a.state !== 'cruise' || a.eTrigger === undefined) return 0;
    return wrap(wrap(a.apseAngle() - WORLD.moonAngle) - a.eTrigger);
  }
  // Each distinct message is logged once per state transition (never once per update tick); the HUD status always follows.
  say(msg, type = 'info') {
    this.status = msg;
    const full = 'Autopilot: ' + msg;
    // A new Autopilot instance may be created during a manual/automatic handover.
    // De-duplicate against the flight-wide event history, not only this instance.
    if (msg === this._lastSay || this.f.events.some(e => e.msg === full)) return;
    this._lastSay = msg;
    this.f.log(this.f.t, full, type);
  }
  stop(reason) { this.done = true; this.maxStep = undefined; this.warp = undefined; this.status = reason || 'Autopilot off'; }

  // Hohmann-style delta-v from a (near-)circular orbit at radius r to an apoapsis at the Moon's distance.
  tliDeltaV(r) { const mu = WORLD.mu, ra = WORLD.moonDist; return Math.sqrt(mu / r) * (Math.sqrt(2 * ra / (r + ra)) - 1); }
  // Time to deliver dv. If the core stage runs dry part-way and an upper stage takes over, the burn is split in two phases
  // (the old single-stage estimate put the transfer burn up to ~13 degrees off, so the vehicle missed the Moon).
  burnTime(dv) {
    const f = this.f, c = f.c; const F = f.activeThrustFull(); if (F <= 0) return Infinity;
    const isp = f.activeIsp(), m = f.mass();
    if (f.stage === 'core' && f.an.hasUpper && f.fuelUp > 1 && f.fuelCore > 0) {
      const prop = f.fuelCore + (f.boostersAttached ? f.fuelB : 0), dv1 = m - prop > 0 ? isp * G0 * Math.log(m / (m - prop)) : 0;
      if (dv > dv1) {
        const t1 = prop / (F / (isp * G0)), mu = c.upper.dry + f.fuelUp + (f.payloadAttached ? c.payload.mass : 0) + (f.fairingAttached ? f.an.fairingMass : 0);
        const Fu = c.upper.thrust, iu = c.upper.isp, rest = dv - dv1;
        return t1 + mu * iu * G0 * (1 - Math.exp(-rest / (iu * G0))) / Fu;
      }
    }
    return m * isp * G0 * (1 - Math.exp(-dv / (isp * G0))) / F;
  }

  // Staging that every phase needs. Boosters go when empty; the core goes only when it is empty AND no booster is still burning
  // (separating earlier would throw away propellant that is still producing thrust).
  autoStage() {
    const f = this.f;
    if (f.canSeparateBoosters() && f.fuelB <= 1 && f.boostersAttached) f.separateBoosters();
    if (f.stage === 'core' && f.canSeparateStage() && f.fuelCore <= 1 && f.fuelUp > 1 && (!f.boostersAttached || f.fuelB <= 1)) f.separateStage();
  }

  // Remaining delta-v required for the phases that still lie ahead, versus what the stages still attached can deliver.
  // Includes the transfer burn, lunar capture and (for the lander) the powered descent, and checks that the descent engine can hold the vehicle up.
  lunarBudget(fromOrbit = true) {
    const f = this.f, m = f.mission, c = f.c; if (!m.captureDv) return { ok: true, need: 0, have: f.dvRemaining() };
    const tli = fromOrbit ? this.tliDeltaV(f.r) : 0;
    const need = tli + m.captureDv + (m.descentDv || 0), have = f.dvRemaining();
    let thrustOk = true, thrustWhy = '';
    if (m.descentDv) {
      const F = f.an.hasUpper ? c.upper.thrust : c.engine.thrust, mass = f.an.hasUpper ? f.upperStackMass() : f.mass();
      if (F < 1.2 * mass * WORLD.moonG) { thrustOk = false; thrustWhy = `the descent engine (${Math.round(F)} N) cannot hold the lander (needs ≥ ${Math.round(1.2 * mass * WORLD.moonG)} N).`; }
    }
    const ok = have >= need && thrustOk;
    const reason = !thrustOk ? 'Not enough thrust for a soft landing: ' + thrustWhy : `Not enough delta-v for the whole lunar mission: ${Math.round(have)} m/s left, about ${Math.round(need)} m/s needed (${fromOrbit ? 'transfer burn ' + Math.round(tli) + ' + ' : ''}capture ${m.captureDv}${m.descentDv ? ' + descent ' + m.descentDv : ''}).`;
    return { ok, need, have, reason };
  }

  update() {
    const f = this.f; if (this.done) return;
    if (f.outcome) return this.stop('Flight ended');
    this.maxStep = undefined; this.warp = undefined;
    const id = f.mission.id, o = f.orbit(), alt = f.alt;
    // staging housekeeping that every phase needs
    this.autoStage();
    if (f.phase === 'lunar-arrival' || f.phase === 'lunar-capture' || f.phase === 'lunar-orbit' || f.phase === 'lunar-descent' || f.phase === 'landed') return this.lunarPhase();
    if (f.phase === 'ready') return;
    if (this.state === 'lunar') this.state = this.assess();       // took over before the lunar phases ended: re-evaluate
    if (f.payloadAttached && this.autoDeployOk()) { f.deployPayload(); return this.stop('Objective satisfied: payload deployed'); }

    switch (this.state) {
      case 'init': this.state = this.assess(); return;
      case 'lunar': this.state = this.assess(); return;
      case 'climb': return this.climb(o, alt, id);
      case 'coast': return this.coastToApo(o, alt, id);
      case 'circ': return this.circularize(o, alt);
      case 'orbit': return this.afterOrbit(o, alt, id);
      case 'window': return this.window(o, alt);
      case 'tli': return this.tli(o);
      case 'raise': return this.raise(o, alt, id);
      case 'cruise': return this.cruise();
      case 'hold': return;
    }
  }

  autoDeployOk() {
    const f = this.f, id = f.mission.id;
    if (f.mission.captureDv) return false;                         // lunar payloads are deployed by the player (or lunarPhase) after arrival
    if (id === 'sounding') return f.alt >= WORLD.karman;
    if (this.state === 'climb' || this.state === 'coast' || this.state === 'circ') return false;
    return f.evaluateCriteria().ok;
  }

  climb(o, alt, id) {
    const f = this.f;
    if (id === 'sounding') {
      const cut = f.alt > 40000 && f.predictPath(40).maxAlt >= WORLD.karman + 6000;
      f.setThrottle(cut ? 0 : 1);
      if (cut && !this._cut) { this._cut = true; this.say('Engine cut: the coast will carry the vehicle above 100 km.'); }
      else if (!cut && this._cut) { this._cut = false; this._lastSay = null; this.say('Prediction fell short of 100 km: engine relit.', 'warn'); }
      return;
    }
    f.setThrottle(1);
    // Altitude-based gravity-turn programme: vertical to 1 km, then pitch over smoothly towards the horizon by ~80 km.
    if (alt < 1000) f.setPitch(90);
    else { const k = Math.min(1, (alt - 1000) / (this.turnAlt || 80000)); f.setPitch(Math.max(4, 90 - 86 * Math.pow(k, this.turnExp || 0.5))); }
    if (f.usableFuel() <= 0.5 && f.fuelUp <= 0.5) { this.stop('Out of propellant before reaching orbit'); return; }
    if (o.ap >= this.targetAlt) { f.setThrottle(0); this.state = 'coast'; this.say(`Ascent burn complete: apoapsis ${km(o.ap)}. Coasting to apoapsis.`); }
  }
  coastToApo(o, alt) {
    const f = this.f; f.setThrottle(0); if (f.prograde) f.setPrograde(false); f.setPitch(0);
    this.autoStage();
    this.warp = alt > 90000 ? 10 : 1;
    if (alt < 70000) { this.warp = 1; return; }
    if (f.vUp <= 5 && alt > 120000) { this.state = 'circ'; this.say('At apoapsis: circularization burn.'); this.warp = 1; }
    else if (f.vUp < 400) { this.warp = 1; this.maxStep = 1; }
  }
  circularize(o, alt) {
    const f = this.f; f.setPitch(0); f.setThrottle(1);
    this.autoStage();
    if (f.usableFuel() <= 0.5) { this.state = 'orbit'; return; }
    // LEO has a ceiling: burning on after the apoapsis has grown past it can only make the orbit invalid (no retrograde burn exists).
    if (f.mission.id === 'leo' && o.ap >= 495000) { f.setThrottle(0); this.state = 'orbit'; return; }
    if (o.bound && o.pe >= this.targetAlt * 0.93) { f.setThrottle(0); this.state = 'orbit'; this.say(`Orbit reached: ${km(o.pe)} × ${km(o.ap)}.`, 'good'); }
  }
  afterOrbit(o, alt, id) {
    const f = this.f; f.setThrottle(0);
    if (id === 'leo') {
      const crit = f.evaluateCriteria();
      if (f.payloadAttached && crit.ok) { f.deployPayload(); return this.stop('Orbit reached and payload deployed'); }
      // Corrective manoeuvre ONLY when physically possible: periapsis too low with an acceptable apoapsis and propellant left -> raise it at apoapsis.
      if (this.corrections < 2 && o.bound && o.pe < 150000 && o.ap >= 150000 && o.ap <= 480000 && (f.usableFuel() > 0.5 || (f.stage === 'core' && f.fuelUp > 1))) { this.corrections++; this.state = 'coast'; this.say(`Orbit not valid yet (${crit.reason}) — correcting at apoapsis.`, 'warn'); return; }
      const why = `The orbit is not valid for this mission (${crit.reason}). The vehicle has no retrograde burn to lower it, so it would circle the Earth forever.`;
      this.stop(why); this.f.log(f.t, why, 'bad'); f.endMission(why); return;
    }
    if (id === 'transfer' || id === 'deep') { this.state = 'raise'; this.say('Raising the orbit.'); return; }
    if (f.mission.captureDv) {
      const r = f.r; this.tliDv = this.tliDeltaV(r);
      const bud = this.lunarBudget(true), need = bud.need;
      if (!bud.ok) { const why = `${bud.reason} The vehicle can only circle the Earth, so the mission cannot be completed (no phase was started that could not be finished).`; this.stop(why); this.f.log(f.t, why, 'bad'); f.endMission(why); return; }
      this.state = 'window'; this.prevE = null; this.say(`Waiting for the transfer window (burn ≈ ${Math.round(this.tliDv)} m/s). Need ${Math.round(need)} m/s in total.`); return;
    }
    this.stop('Orbit reached');
  }
  raise(o, alt, id) {
    const f = this.f; f.setThrottle(1); if (!f.prograde) f.setPrograde(true);
    if (id === 'transfer' && o.ap >= 8.8e6) { f.setThrottle(0); this.say('Apoapsis raised above 8,800 km.'); this.state = 'hold'; if (f.evaluateCriteria().ok && f.payloadAttached) { f.deployPayload(); this.stop('Transfer orbit reached and payload deployed'); } return; }
    if (id === 'deep') {
      if (!o.bound && o.vinf >= 1300) { f.setThrottle(0); this.state = 'cruise'; this.say('Escape trajectory established. Coasting out to 5,000 km.'); return; }
    }
    if (f.usableFuel() <= 0.5 && f.fuelUp <= 0.5) this.stop('Out of propellant');
  }
  // Wait until a burn centred on the orbit point opposite the Moon will put apoapsis at the Moon's direction.
  window(o, alt) {
    const f = this.f; f.setThrottle(0); if (!f.prograde) f.setPrograde(true);
    const r = f.r, v = f.speed, omega = v / r, dir = (f.x * f.vy - f.y * f.vx) >= 0 ? 1 : -1;
    const tb = this.burnTime(this.tliDeltaV(r));
    const th = Math.atan2(f.y, f.x);
    // angle of the burn centre; after a prograde burn the apoapsis lies 180 degrees further along
    const e = wrap(th + dir * (omega * tb / 2) + dir * Math.PI - WORLD.moonAngle + this.tliBias);
    const ae = Math.abs(e);
    this.warp = ae > 1.0 ? 100 : ae > 0.25 ? 10 : 1;
    this.maxStep = Math.min(30, Math.max(1, ae / omega / 4));
    const crossed = this.prevE !== null && Math.sign(e) !== Math.sign(this.prevE) && Math.abs(e - this.prevE) < 1;
    this.prevE = e;
    if (ae < 0.004 || crossed) { this.eTrigger = e - this.tliBias; this.state = 'tli'; this.f.setThrottle(1); this.warp = 1; this.say(`Transfer burn started (window error ${(ae * 180 / Math.PI).toFixed(2)}°).`); }
  }
  tli(o) {
    const f = this.f; f.setThrottle(1); if (!f.prograde) f.setPrograde(true); this.warp = 1;
    this.autoStage();
    if (f.usableFuel() <= 0.5 && !(f.stage === 'core' && f.fuelUp > 1)) { this.stop('Out of propellant during the transfer burn'); return; }
    if (o.ap + WORLD.R >= WORLD.moonDist * 0.996) {
      f.setThrottle(0); this.state = 'cruise';
      const p = f.predictPath(60);
      this.say(p.hit ? `Transfer burn complete. Predicted closest approach to the Moon: ${km(p.minD)}. Coasting to the Moon.` : `Transfer burn complete but the path misses the Moon by ${km(p.minD)}. Coasting; you can end the mission and replan.`, p.hit ? 'good' : 'warn');
    }
  }
  cruise() {
    const f = this.f; f.setThrottle(0); this.maxStep = undefined;
    if (f.mission.captureDv) { const d = f.moonD; this.warp = d > 30e6 ? 1000 : d > 15e6 ? 300 : d > 9e6 ? 100 : d > 6.5e6 ? 20 : 4; }
    else { this.warp = 1000; if (f.alt >= 5e6 && f.payloadAttached && f.evaluateCriteria().ok) { f.deployPayload(); this.stop('Escape trajectory reached and probe deployed'); } }
  }
  lunarPhase() {
    const f = this.f; this.warp = 1;
    if (f.phase === 'lunar-arrival') {
      const bud = this.lunarBudget(false);       // what is still needed from here: capture (+ descent)
      if (!bud.ok) { const why = `${bud.reason} The capture burn was not started because the mandatory next phase could not be completed.`; this.stop(why); f.log(f.t, why, 'bad'); f.endMission(why); return; }
      if (f.startCapture()) { f.setThrottle(1); this.say('Capture burn started.'); } return;
    }
    if (f.phase === 'lunar-capture') { f.setThrottle(1); if (f.stage === 'core' && f.canSeparateStage() && f.fuelCore <= 1) f.separateStage(); return; }
    if (f.phase === 'lunar-orbit') {
      if (f.mission.id === 'lunar-land') {
        // Keep the core stage while it alone can still land the vehicle; otherwise drop it so the (lighter) upper stage can burn.
        if (f.stage === 'core' && f.canSeparateStage()) {
          const coreEnough = f.fuelCore > 1 && f.activeDv() >= f.mission.descentDv * 0.98 && f.activeThrustFull() >= 1.2 * f.mass() * WORLD.moonG;
          if (!coreEnough) f.separateStage();
        }
        if (f.startDescent()) { f.setThrottle(1); this.say('Powered descent started.'); } else if (!f.outcome) this.stop('Descent not possible'); return;
      }
      if (f.payloadAttached) { f.deployPayload(); } return this.stop('Lunar orbit reached');
    }
    if (f.phase === 'lunar-descent') { f.setThrottle(1); return; }
    if (f.phase === 'landed') { if (f.payloadAttached) f.deployPayload(); this.stop('Landed'); }
  }
}

// Where is the transfer window? Used by the HUD hint so manual pilots can time the burn too.
export function transferWindow(f) {
  const r = f.r, mu = WORLD.mu, omega = f.speed / r, dir = (f.x * f.vy - f.y * f.vx) >= 0 ? 1 : -1;
  const dv = Math.sqrt(mu / r) * (Math.sqrt(2 * WORLD.moonDist / (r + WORLD.moonDist)) - 1);
  const F = f.activeThrustFull(), isp = f.activeIsp(), m = f.mass();
  const burnS = F > 0 ? m * isp * G0 * (1 - Math.exp(-dv / (isp * G0))) / F : Infinity;
  const e = wrap(Math.atan2(f.y, f.x) + dir * (omega * (isFinite(burnS) ? burnS : 0) / 2) + dir * Math.PI - WORLD.moonAngle);
  const tau = (((-e * dir) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { dv, burnS, errDeg: e * 180 / Math.PI, etaS: tau / omega };
}
