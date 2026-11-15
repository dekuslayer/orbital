// ORBITAL — flight simulation (pure logic, no rendering, runs in Node and in the browser).
// 2-D motion in the orbital plane around a scaled Earth. Symplectic integration, constant Isp, simple exponential
// atmosphere, quadratic drag. SIMPLIFICATIONS (documented): the Moon is a fixed point at WORLD.moonPos() and NOT a gravity
// source. A lunar encounter happens when the (Earth-gravity) trajectory passes within WORLD.moonSOI of that point; capture and
// descent are then scripted delta-v budgets. Predictions (predictPath) use the same simplified model.
import { G0 } from './parts.js';
import { WORLD } from './missions.js';
import { analyse } from './vehicle.js';

const DEG = Math.PI / 180;
const FUEL_EPS = 0.5;            // kg: below this a tank counts as empty (avoids tiny residuals / 0% displays)
let FLIGHT_UID = 0;

export class Flight {
  constructor(loadout, mission) {
    this.uid = `${Date.now().toString(36)}-${++FLIGHT_UID}`;
    this.mission = mission;
    this.loadoutSnapshot = JSON.parse(JSON.stringify(loadout));   // frozen at launch: reports never depend on the lab's current build
    this.an = analyse(loadout);
    const c = this.an.components;
    this.c = c;
    this.loadout = loadout;
    // state
    this.t = 0;
    this.x = 0; this.y = WORLD.R; this.vx = 0; this.vy = 0;
    this.fuelCore = c.tank.propellant;
    this.fuelB = c.boosters.propellant || 0;
    this.fuelUp = c.upper.propellant || 0;
    this.boostersAttached = c.boosters.count > 0;
    this.stage = 'core';               // 'core' | 'upper'
    this.fairingAttached = this.an.hasFairing;
    this.payloadAttached = true;
    this.throttle = 0; this.targetPitch = 90; this.pitch = 90;
    this.maxQAssist = true; this.prograde = false;
    this.phase = 'ready';              // ready, ascent, coast, lunar-arrival, lunar-capture, lunar-orbit, lunar-descent, landed, complete, failed
    this.engineOn = false; this.launched = false;
    this.outcome = null;               // {success, cause, ...}
    this.events = []; this.decisions = [];
    this.maxAlt = 0; this.maxSpeed = 0; this.maxQ = 0; this.maxR = WORLD.R; this.heat = 0; this.maxHeat = 0;
    this.thrustNow = 0; this.q = 0;
    this.lunar = { dvDone: 0, descentDone: 0 };
    this.minMoonD = Infinity; this.moonReached = false; this.arriveD = 0; this.usedAutopilot = false; this.coasting = false;
    this.payloadDeployedAt = null;
    this.startM0 = this.mass();
    this.log(0, 'Vehicle on the launchpad. Systems nominal (simulated).', 'info');
  }

  log(t, msg, type = 'info') { this.events.push({ t: +t.toFixed(1), msg, type }); }
  decide(msg) { this.decisions.push({ t: +this.t.toFixed(1), msg }); }

  // ---- mass bookkeeping ----
  mass() {
    const c = this.c; let m = 0;
    if (this.payloadAttached) m += c.payload.mass + this.an.scMass;
    if (this.fairingAttached) m += this.an.fairingMass;     // masses come from the parts catalogue via analyse(): one source of truth
    if (c.upper.propellant) m += c.upper.dry + this.fuelUp;
    if (this.stage === 'core') {
      m += this.coreDryOnly() + this.fuelCore;
    }
    if (this.boostersAttached) m += c.boosters.dry + this.fuelB;
    return m;
  }
  coreDryOnly() {
    const c = this.c;
    return c.engine.mass + c.tank.dry + c.structure.mass + this.an.coreExtraMass;   // gimbal + RCS (catalogue masses)
  }

  // Mass of everything that stays with the upper stage after the core is jettisoned (propellant included).
  // Single source of truth for dvRemaining()/burn-time estimates; it must match mass() once the core has gone
  // (the old estimates left out the spacecraft-bus extras: solar wings and antenna).
  upperStackMass() {
    const c = this.c; let m = c.upper.propellant ? c.upper.dry + this.fuelUp : 0;
    if (this.payloadAttached) m += c.payload.mass + this.an.scMass;
    if (this.fairingAttached) m += this.an.fairingMass;
    return m;
  }
  // Independent copy of the complete flight state, used by the autopilot to plan from the REAL current state
  // (altitude, velocity, pitch, fuel, stage, boosters, payload ...). The immutable catalogue data is shared;
  // everything mutable is copied, and the copy gets its own uid so it can never be mistaken for the real flight.
  clone() {
    const k = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    k.uid = this.uid + '-sim'; k.events = this.events.map(e => ({ ...e })); k.decisions = this.decisions.map(d => ({ ...d }));
    k.lunar = { ...this.lunar }; k.outcome = this.outcome ? { ...this.outcome } : null;
    k.payloadDeployedAt = this.payloadDeployedAt ? { ...this.payloadDeployedAt } : null;
    return k;
  }

  // ---- geometry helpers ----
  get r() { return Math.hypot(this.x, this.y); }
  get alt() { return this.r - WORLD.R; }
  get ux() { return this.x / this.r; } get uy() { return this.y / this.r; }
  get ex() { return this.uy; } get ey() { return -this.ux; }
  get vUp() { return this.vx * this.ux + this.vy * this.uy; }
  get vEast() { return this.vx * this.ex + this.vy * this.ey; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get angle() { return Math.atan2(this.x, this.y); } // angle from launch vertical, increases eastward

  orbit() {
    const mu = WORLD.mu, r = this.r, v2 = this.vx * this.vx + this.vy * this.vy;
    const h = Math.abs(this.x * this.vy - this.y * this.vx);
    const eps = v2 / 2 - mu / r;
    if (eps >= 0) return { bound: false, ap: Infinity, pe: this.periHyper(h, eps), vinf: Math.sqrt(2 * eps) };
    const a = -mu / (2 * eps); const e = Math.sqrt(Math.max(0, 1 + 2 * eps * h * h / (mu * mu)));
    return { bound: true, a, e, ap: a * (1 + e) - WORLD.R, pe: a * (1 - e) - WORLD.R, period: 2 * Math.PI * Math.sqrt(a * a * a / mu) };
  }
  periHyper(h, eps) { const mu = WORLD.mu; const a = mu / (2 * eps); const e = Math.sqrt(1 + 2 * eps * h * h / (mu * mu)); return a * (e - 1) - WORLD.R; }

  density(h) { return h > 150000 ? 0 : WORLD.rho0 * Math.exp(-Math.max(h, 0) / WORLD.H); }
  qLimit() { return WORLD.maxQBase * this.an.durability * (this.fairingAttached ? 1 : 0.9); }

  // ---- player actions ----
  ignite() {
    if (this.phase !== 'ready') return;
    this.phase = 'ascent'; this.engineOn = true; this.launched = true;
    this.log(this.t, 'Engine ignition. Lift-off sequence started.', 'good');
  }
  setThrottle(v) {
    this.throttle = Math.max(0, Math.min(1, v));
    // Re-light the engine if the player asks for thrust again and usable propellant remains.
    if (this.throttle > 0 && this.launched && !this.engineOn && !this.outcome && this.usableFuel() > FUEL_EPS && !this.phase.startsWith('lunar') && this.phase !== 'landed') this.engineOn = true;
  }
  // Propellant that can actually be burned right now: attached stages only. A jettisoned stage's propellant is gone.
  usableFuel() {
    // Core-stage propellant (plus boosters) while on the core; the upper stage's propellant only becomes burnable after separation.
    return (this.stage === 'core' ? this.fuelCore : this.fuelUp) + (this.boostersAttached ? this.fuelB : 0);
  }
  // Moon geometry (fixed point in the orbital plane)
  moonVec() { const M = WORLD.moonPos(); return { x: M.x - this.x, y: M.y - this.y }; }
  get moonD() { const m = this.moonVec(); return Math.hypot(m.x, m.y); }
  get status() {
    if (this.outcome) return this.outcome.success ? 'MISSION COMPLETE' : 'MISSION FAILED';
    if (this.phase === 'ready') return 'ON THE PAD';
    if (this.phase.startsWith('lunar') || this.phase === 'landed') return this.engineOn && this.thrustNow > 0 ? 'BURNING (SCRIPTED LUNAR PHASE)' : 'LUNAR ENCOUNTER';
    if (this.thrustNow > 0) return 'POWERED FLIGHT';
    if (this.usableFuel() <= FUEL_EPS) return this.stage === 'core' && this.fuelUp > FUEL_EPS ? 'COASTING — CORE EMPTY: SEPARATE THE STAGE' : 'COASTING — NO THRUST (NO PROPELLANT)';
    return 'COASTING — NO THRUST (THROTTLE 0)';
  }
  setPitch(deg) { this.targetPitch = Math.max(-10, Math.min(90, deg)); this.prograde = false; }
  setPrograde(on) { this.prograde = !!on; this.decide(on ? 'Enabled prograde hold.' : 'Disabled prograde hold.'); }

  canSeparateBoosters() { return this.boostersAttached && this.phase !== 'ready'; }
  separateBoosters() {
    if (!this.canSeparateBoosters()) return false;
    const spent = this.fuelB <= 1;
    this.boostersAttached = false;
    this.log(this.t, spent ? 'Spent boosters separated.' : 'Boosters separated with propellant remaining (wasted).', spent ? 'good' : 'warn');
    this.decide(spent ? 'Separated boosters after burnout.' : `Separated boosters early with ${Math.round(this.fuelB)} kg of propellant left.`);
    this.fuelB = 0; return true;
  }
  canSeparateStage() { return this.an.hasUpper && this.stage === 'core' && this.phase !== 'ready'; }
  separateStage() {
    if (!this.canSeparateStage()) return false;
    if (this.boostersAttached) this.boostersAttached = false;
    this.stage = 'upper';
    const left = this.fuelCore, leftB = this.fuelB;
    this.fuelCore = 0; this.fuelB = 0;          // the jettisoned stage takes its propellant with it
    if (this.throttle > 0 && this.fuelUp > FUEL_EPS && this.launched) this.engineOn = true;   // upper-stage engine lights
    this.log(this.t, `Stage separation at ${(this.alt / 1000).toFixed(1)} km. Upper stage active.${left > 1 ? ` ${Math.round(left)} kg of core propellant was discarded.` : ''}`, 'good');
    this.decide(`Stage separation with ${Math.round(left)} kg of core propellant remaining.`);
    return true;
  }
  deployPayload() {
    if (!this.payloadAttached || this.phase === 'ready' || this.phase === 'failed' || this.phase === 'complete') return false;
    const check = this.evaluateCriteria();
    this.payloadAttached = false; this.payloadDeployedAt = { t: this.t, alt: this.alt };
    this.decide(`Deployed payload at ${(this.alt / 1000).toFixed(0)} km.`);
    if (check.ok) {
      this.log(this.t, `Payload deployed: ${this.mission.name} objective satisfied.`, 'good');
      this.finish(true, 'Objective satisfied.');
    } else {
      this.log(this.t, `Payload deployed outside the valid window: ${check.reason}`, 'bad');
      this.finish(false, `Payload deployed outside the valid window: ${check.reason}`);
    }
    return true;
  }

  evaluateCriteria() {
    const id = this.mission.id, o = this.orbit(), alt = this.alt;
    if (this.mission.needsComms && !this.an.hasLink) return { ok: false, reason: 'no High-Gain Antenna: the data could not be sent to Earth.' };
    if (this.an.powerReq > this.an.powerAvail) return { ok: false, reason: `power budget exceeded (${this.an.powerReq} W needed, ${this.an.powerAvail} W available).` };
    if (id === 'sounding') return alt >= WORLD.karman ? { ok: true } : { ok: false, reason: `altitude ${(alt / 1000).toFixed(0)} km is below the 100 km Kármán line.` };
    if (id === 'leo') {
      if (!o.bound) return { ok: false, reason: 'trajectory is not a closed orbit.' };
      if (o.pe < 150000) return { ok: false, reason: `periapsis ${(o.pe / 1000).toFixed(0)} km is below 150 km (the orbit would decay into the atmosphere).` };
      if (o.ap > 500000) return { ok: false, reason: `apoapsis ${(o.ap / 1000).toFixed(0)} km exceeds 500 km (not a low orbit).` };
      return { ok: true };
    }
    if (id === 'transfer') {
      if (!o.bound) return { ok: false, reason: 'trajectory is not a closed orbit.' };
      if (o.pe < 150000) return { ok: false, reason: `periapsis ${(o.pe / 1000).toFixed(0)} km is below 150 km.` };
      if (o.ap < 8000000) return { ok: false, reason: `apoapsis ${(o.ap / 1000).toFixed(0)} km is below 8,000 km.` };
      return { ok: true };
    }
    if (id === 'lunar-orbit') return this.phase === 'lunar-orbit' ? { ok: true } : { ok: false, reason: 'the vehicle is not yet in lunar orbit (complete the capture burn first).' };
    if (id === 'lunar-land') return this.phase === 'landed' ? { ok: true } : { ok: false, reason: 'the lander has not touched down yet.' };
    if (id === 'deep') {
      if (o.bound) return { ok: false, reason: 'trajectory is still bound to Earth (no escape).' };
      if (o.vinf < 1200) return { ok: false, reason: `excess speed ${Math.round(o.vinf)} m/s is below 1,200 m/s.` };
      if (alt < 5000000) return { ok: false, reason: 'altitude is below 5,000 km.' };
      return { ok: true };
    }
    return { ok: false, reason: 'unknown mission.' };
  }

  startCapture() {
    if (this.phase !== 'lunar-arrival') return false;
    if (!this.activeFuel()) { this.lunarFail = 'flyby'; this.finish(false, 'No propellant remained for the lunar capture burn: the vehicle flew past the Moon.'); return false; }
    this.phase = 'lunar-capture'; this.log(this.t, 'Lunar capture burn started.', 'info'); this.decide('Started lunar capture burn.'); return true;
  }
  startDescent() {
    if (this.phase !== 'lunar-orbit' || this.mission.id !== 'lunar-land') return false;
    const f = this.activeThrustFull(); const m = this.mass();
    const dvAct = this.activeDv();
    if (dvAct < this.mission.descentDv * 0.98) { const hint = this.an.hasUpper && this.stage === 'core' && this.fuelUp > 1 ? ' (Separate the spent core stage first so the upper stage engine is active.)' : ''; this.log(this.t, `Descent refused: ${Math.round(dvAct)} m/s of delta-v available from the active stage, ${this.mission.descentDv} m/s needed for a soft landing.${hint}`, 'bad'); if (hint) return false; this.lunarFail = 'stranded'; this.finish(false, `Not enough propellant to land: ${Math.round(dvAct)} m/s of delta-v remained but a soft landing needs ${this.mission.descentDv} m/s. The vehicle stays in lunar orbit.`); return false; }
    if (f < 1.2 * m * WORLD.moonG) { this.log(this.t, `Descent aborted: engine thrust ${Math.round(f)} N is below 1.2 × lunar weight (${Math.round(1.2 * m * WORLD.moonG)} N).`, 'bad'); this.lunarFail = 'crash'; this.finish(false, 'The engine cannot hold the vehicle against lunar gravity: thrust is below 1.2 × lunar weight. A stronger stage is required for descent.'); return false; }
    this.phase = 'lunar-descent'; this.log(this.t, 'Powered descent started.', 'info'); this.decide('Started powered descent.'); return true;
  }
  endMission(cause) { if (this.outcome) return; this.engineOn = false; this.throttle = 0; this.decide('Ended the mission manually.'); this.log(this.t, 'Mission ended by the flight director.', 'warn'); this.finish(false, cause || 'The flight director ended the mission before the objective was met.'); }
  abort() { if (this.outcome) return; this.engineOn = false; this.throttle = 0; this.decide('Aborted the mission.'); this.log(this.t, 'Mission aborted by flight director.', 'warn'); this.abortRequested = true; }

  activeFuel() { return this.stage === 'core' ? this.fuelCore : this.fuelUp; }
  activeThrustFull() { return this.stage === 'core' ? this.c.engine.thrust + (this.boostersAttached && this.fuelB > 0 ? this.c.boosters.thrust : 0) : this.c.upper.thrust; }
  activeIsp() { return this.stage === 'core' ? this.c.engine.isp : this.c.upper.isp; }

  finish(success, cause) {
    if (this.outcome) return;
    this.outcome = { success, cause, t: this.t, alt: this.alt, maxAlt: this.maxAlt };
    this.phase = success ? 'complete' : (this.phase === 'failed' ? 'failed' : this.phase);
    if (!success) this.phase = 'failed';
  }

  // ---- integration ----
  accel(thrustVec, m) {
    const mu = WORLD.mu, r = this.r;
    let ax = -mu * this.x / (r * r * r), ay = -mu * this.y / (r * r * r);
    ax += thrustVec.x / m; ay += thrustVec.y / m;
    const h = r - WORLD.R, rho = this.density(h), v = this.speed;
    if (rho > 0 && v > 0) {
      const area = Math.PI * this.c.tank.radius ** 2 + (this.boostersAttached ? this.c.boosters.count * 0.35 : 0);
      const cd = WORLD.dragCd * (this.fairingAttached ? 0.8 : 1);
      const fd = 0.5 * rho * v * v * cd * area;
      ax -= fd / m * this.vx / v; ay -= fd / m * this.vy / v;
    }
    return { ax, ay };
  }

  step(dt) {
    if (this.outcome) return this.coastOnly(dt);
    if (this.phase === 'ready') return;
    if (this.phase === 'lunar-arrival' || this.phase === 'lunar-capture' || this.phase === 'lunar-orbit' || this.phase === 'lunar-descent' || this.phase === 'landed') return this.stepLunar(dt);
    this.t += dt;

    // attitude
    if (this.prograde && this.speed > 40) this.targetPitch = Math.atan2(this.vUp, this.vEast) / DEG;
    const rate = (this.an.hasGimbal ? 6 : 3) * (this.c.engine.thrust > 0 ? 1 : 1);
    const dp = this.targetPitch - this.pitch; this.pitch += Math.sign(dp) * Math.min(Math.abs(dp), rate * dt * (this.engineOn ? 1 : 0.3));

    // forces
    const m = this.mass();
    let F = 0, flow = 0, Fb = 0, flowB = 0;
    let thr = this.throttle, qScale = 1;
    if (this.maxQAssist) {
      const lim = this.qLimit(); const q = this.q;
      if (q > 0.7 * lim) { qScale = Math.max(0.05, (0.95 * lim - q) / (0.25 * lim)); thr = Math.min(thr, qScale); }
    }
    let effThrottle = thr;
    this.effThrottle = effThrottle;
    if (this.engineOn) {
      if (this.stage === 'core' && this.fuelCore > 0) {
        F = this.c.engine.thrust * effThrottle; flow = F / (this.c.engine.isp * G0);
      } else if (this.stage === 'upper' && this.fuelUp > 0) {
        F = this.c.upper.thrust * effThrottle; flow = F / (this.c.upper.isp * G0);
      }
      if (this.boostersAttached && this.fuelB > 0) { Fb = this.c.boosters.thrust * qScale; flowB = Fb / (this.c.boosters.isp * G0); }   // boosters follow the same Max-Q thrust reduction as the core engine
      // thin-air guard for launch: nothing special in this model
    }
    const fuelNeed = flow * dt, fuelNeedB = flowB * dt;
    let fScale = 1;
    const avail = this.stage === 'core' ? this.fuelCore : this.fuelUp;
    if (flow > 0 && fuelNeed > avail) fScale = avail / fuelNeed;
    const bScale = flowB > 0 && fuelNeedB > this.fuelB ? this.fuelB / fuelNeedB : 1;
    const Fs = F * fScale, Fbs = Fb * bScale;
    if (this.stage === 'core') this.fuelCore = Math.max(0, this.fuelCore - flow * dt * fScale); else this.fuelUp = Math.max(0, this.fuelUp - flow * dt * fScale);
    if (this.boostersAttached) this.fuelB = Math.max(0, this.fuelB - flowB * dt * bScale);
    if (this.fuelCore < 0.01) this.fuelCore = 0; if (this.fuelUp < 0.01) this.fuelUp = 0; if (this.fuelB < 0.01) this.fuelB = 0;

    const Ft = Fs + Fbs; this.thrustNow = Ft;
    // No usable propellant: the engine shuts down automatically and the vehicle coasts.
    if (this.engineOn && this.usableFuel() <= FUEL_EPS) {
      this.engineOn = false; this.coasting = true; this.thrustNow = 0;
      this.log(this.t, this.stage === 'core' && this.fuelUp > FUEL_EPS ? 'Core stage empty. Engine shut down: separate the stage to light the upper stage.' : 'Propellant exhausted. Engine shut down: COASTING — NO THRUST.', 'warn');
    }
    const pr = this.pitch * DEG;
    const dirx = Math.cos(pr) * this.ex + Math.sin(pr) * this.ux;
    const diry = Math.cos(pr) * this.ey + Math.sin(pr) * this.uy;
    const thrustVec = { x: Ft * dirx, y: Ft * diry };

    // events: burnout
    if (Fb > 0 && bScale < 1 || (this.boostersAttached && this.fuelB <= 0 && !this._bLogged)) { if (!this._bLogged) { this.log(this.t, 'Booster burnout. Separate the boosters to shed dead mass.', 'warn'); this._bLogged = true; } }

    // symplectic (kick-drift-kick) step
    const m2 = this.mass();
    let a = this.accel(thrustVec, m);
    this.vx += a.ax * dt / 2; this.vy += a.ay * dt / 2;
    this.x += this.vx * dt; this.y += this.vy * dt;
    a = this.accel(thrustVec, m2);
    this.vx += a.ax * dt / 2; this.vy += a.ay * dt / 2;

    // fairing
    if (this.fairingAttached && this.alt > WORLD.fairingJettisonAlt) { this.fairingAttached = false; this.log(this.t, 'Payload fairing jettisoned at 80 km.', 'good'); }

    // environment metrics
    const h = this.alt, rho = this.density(h);
    this.q = 0.5 * rho * this.speed * this.speed;
    this.maxQ = Math.max(this.maxQ, this.q); this.maxAlt = Math.max(this.maxAlt, h); this.maxSpeed = Math.max(this.maxSpeed, this.speed); this.maxR = Math.max(this.maxR, this.r);
    const heatRate = Math.sqrt(rho) * this.speed ** 3 / 3e8;
    this.heatRate = heatRate;
    this.heat = Math.max(0, this.heat + (heatRate - 0.15 * this.heat) * dt); this.maxHeat = Math.max(this.maxHeat, this.heat);

    if (this.q > this.qLimit() && !this.outcome) { this.log(this.t, `Structural failure: dynamic pressure ${(this.q / 1000).toFixed(0)} kPa exceeded the ${(this.qLimit() / 1000).toFixed(0)} kPa limit.`, 'bad'); this.breakup = 'maxq'; this.engineOn = false; this.finish(false, `Structural failure at maximum dynamic pressure (${(this.q / 1000).toFixed(0)} kPa vs ${(this.qLimit() / 1000).toFixed(0)} kPa limit). Throttle down through Max-Q, enable the Max-Q limiter, or use a stronger structure.`); }
    if (this.heat > 30 && !this.outcome && this.vUp < 0) { this.log(this.t, 'Thermal protection exceeded during re-entry. Vehicle lost.', 'bad'); this.breakup = 'heat'; this.finish(false, 'The vehicle fell back into the atmosphere at high speed and was lost to re-entry heating.'); }

    // ground interaction
    if (this.r <= WORLD.R) {
      const upAccel = (Ft / m2) - WORLD.g0;
      if (!this.launchedOff && (upAccel <= 0 || this.vUp >= 0) && this.t < 30 && this.vUp > -1) {
        // still resting on the pad
        const r = WORLD.R; this.x *= r / this.r; this.y *= r / this.r; if (this.vUp < 0) { this.vx = 0; this.vy = 0; }
        if (Ft / m2 <= WORLD.g0) { this.vx = 0; this.vy = 0; }
      } else {
        this.impact();
      }
    } else if (this.alt > 20) this.launchedOff = true;

    // lunar encounter: by real distance to the Moon, not by a fixed fraction of the trip
    if (this.mission.captureDv && !this.outcome) {
      const md = this.moonD; this.minMoonD = Math.min(this.minMoonD, md);
      if (md <= WORLD.moonSOI) {
        this.moonReached = true; this.arriveD = md;
        this.phase = 'lunar-arrival'; this.log(this.t, `Entered the Moon's encounter zone (${Math.round(md / 1000).toLocaleString('en-US')} km from the Moon). Fire the capture burn.`, 'good');
        this.engineOn = false; this.throttle = 0; this.thrustNow = 0; return;
      }
      // passed the Moon without entering the zone: moving away after having come close to lunar distance
      const mv = this.moonVec();
      if (this.maxR > 0.8 * WORLD.moonDist && (mv.x * this.vx + mv.y * this.vy) < 0 && md > WORLD.moonSOI && this.r > 0.5 * WORLD.moonDist) {
        this.missed = true; this.log(this.t, `The vehicle passed the Moon at ${Math.round(this.minMoonD / 1000).toLocaleString('en-US')} km (encounter zone: ${Math.round(WORLD.moonSOI / 1000).toLocaleString('en-US')} km) and is moving away.`, 'bad');
        this.finish(false, `The trajectory missed the Moon: closest approach ${Math.round(this.minMoonD / 1000).toLocaleString('en-US')} km, but the capture zone is ${Math.round(WORLD.moonSOI / 1000).toLocaleString('en-US')} km. Aim the transfer burn so the path ends at the Moon marker (see the predicted path and the Moon-intercept readout).`);
        return;
      }
    }

    // numerical safety net: a non-finite state must never propagate (NaN/Infinity would corrupt the HUD, the report and the 3D scene)
    if (![this.x, this.y, this.vx, this.vy, this.fuelCore, this.fuelUp, this.fuelB].every(Number.isFinite)) { this.numericalFailure(); return; }
    // phase labels and end detection
    if (this.phase === 'ascent' && this.alt > WORLD.atmoTop && this.thrustNow === 0) this.phase = 'coast';
    if (this.phase === 'coast' && this.thrustNow > 0) this.phase = 'ascent';

    if (!this.outcome && this.abortRequested && this.r <= WORLD.R + 5) this.finish(false, 'Mission aborted by the flight director.');
    if (!this.outcome && this.thrustNow === 0 && (this._hopeT = (this._hopeT || 0) + dt) > 1) { this._hopeT = 0; if (this.hopeless()) { this.log(this.t, `Flight can no longer meet the objective: ${this.hopelessReason}`, 'bad'); this.finish(false, `Mission impossible from here: ${this.hopelessReason}`); } }
  }

  numericalFailure() {
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) { this.x = 0; this.y = WORLD.R; }
    if (!Number.isFinite(this.vx) || !Number.isFinite(this.vy)) { this.vx = 0; this.vy = 0; }
    for (const k of ['fuelCore', 'fuelUp', 'fuelB']) if (!Number.isFinite(this[k]) || this[k] < 0) this[k] = 0;
    this.engineOn = false; this.throttle = 0; this.thrustNow = 0;
    this.log(this.t, 'Numerical error detected in the simulation; flight terminated safely.', 'bad');
    this.finish(false, 'Numerical error in the flight simulation (a value became non-finite). The flight was stopped safely.');
  }

  // Coast-only prediction (Earth gravity only, no thrust/drag above the atmosphere) used for guidance, the path line and 'hopeless' checks.
  predictPath(maxPts = 360) {
    const mu = WORLD.mu, R = WORLD.R, M = WORLD.moonPos(), moonDist = WORLD.moonDist;
    let x = this.x, y = this.y, vx = this.vx, vy = this.vy, t = 0, steps = 0, swept = 0;
    let minD = Infinity, tMin = 0, maxR = Math.hypot(x, y), impact = false, atmo = false, lastTh = Math.atan2(y, x);
    const all = [x, y];
    while (steps++ < 9000 && t < 1.5e6) {
      const r = Math.hypot(x, y), v = Math.hypot(vx, vy);
      if (r <= R) { impact = true; break; }
      if (steps > 3 && r - R < 100000 && (x * vx + y * vy) < 0) { atmo = true; break; }
      const dt = Math.min(200, Math.max(2, 0.03 * r / Math.max(v, 1)));
      const ax = -mu * x / (r * r * r), ay = -mu * y / (r * r * r);
      vx += ax * dt / 2; vy += ay * dt / 2; x += vx * dt; y += vy * dt;
      const r2 = Math.hypot(x, y); const a2x = -mu * x / (r2 * r2 * r2), a2y = -mu * y / (r2 * r2 * r2); vx += a2x * dt / 2; vy += a2y * dt / 2;
      t += dt; maxR = Math.max(maxR, r2);
      const d = Math.hypot(x - M.x, y - M.y); if (d < minD) { minD = d; tMin = t; }
      if (steps % 4 === 0) all.push(x, y);
      const th = Math.atan2(y, x); let dth = th - lastTh; if (dth > Math.PI) dth -= 2 * Math.PI; if (dth < -Math.PI) dth += 2 * Math.PI; swept += Math.abs(dth); lastTh = th;
      if (swept > 2 * Math.PI * 1.02) break;                       // one full revolution of a closed orbit
      if (minD < WORLD.moonSOI && d > minD + 1.5e6) break;          // already through the encounter zone
      if (r2 > 1.6 * moonDist) break;
    }
    // decimate to maxPts
    const n = all.length / 2, pts = []; const stride = Math.max(1, Math.ceil(n / maxPts));
    for (let i = 0; i < n; i += stride) pts.push(all[2 * i], all[2 * i + 1]);
    pts.push(all[all.length - 2], all[all.length - 1]);
    return { pts, minD, tMin, maxAlt: maxR - R, hit: minD <= WORLD.moonSOI, impact: impact || atmo };
  }

  // The vehicle keeps flying physically after an outcome (a failed ship keeps falling).
  coastOnly(dt) {
    this.t += dt;
    if (this.grounded) { this.vx = 0; this.vy = 0; this.thrustNow = 0; this.engineOn = false; return; }   // a wreck stays on the surface (it must never sink through the ground)
    if (this.lunarFail) { this.thrustNow = 0; this.engineOn = false; return; }
    const m = this.mass(); const a0 = this.accel({ x: 0, y: 0 }, m);
    this.vx += a0.ax * dt / 2; this.vy += a0.ay * dt / 2; this.x += this.vx * dt; this.y += this.vy * dt;
    const a1 = this.accel({ x: 0, y: 0 }, m); this.vx += a1.ax * dt / 2; this.vy += a1.ay * dt / 2;
    this.thrustNow = 0; this.engineOn = false;
    const rho = this.density(this.alt); this.q = 0.5 * rho * this.speed ** 2;
    this.heatRate = Math.sqrt(rho) * this.speed ** 3 / 3e8; this.heat = Math.max(0, this.heat + (this.heatRate - 0.15 * this.heat) * dt);
    if (this.r <= WORLD.R) this.impact(true);
  }

  impact(post) {
    if (this.grounded) return;
    this.grounded = true;
    const v = this.speed; this.x *= WORLD.R / this.r; this.y *= WORLD.R / this.r;
    this.impactSpeed = v; this.vx = 0; this.vy = 0; this.thrustNow = 0; this.engineOn = false;
    if (!this.outcome) {
      this.log(this.t, v > 15 ? `Impact at ${Math.round(v)} m/s. Vehicle lost.` : 'Vehicle returned to the surface.', 'bad');
      this.finish(false, this.failureReason());
    } else this.log(this.t, `Vehicle impacted the surface at ${Math.round(this.impactSpeed || v)} m/s.`, 'bad');
  }

  // Is the objective impossible from here, with certainty? Only evaluated when no burnable propellant remains
  // (without thrust the trajectory is fixed by gravity, so the outcome is determinable). Returns true and sets hopelessReason.
  hopeless() {
    if (this.outcome || this.phase === 'ready' || this.phase.startsWith('lunar') || this.phase === 'landed') return false;
    const total = this.fuelCore + this.fuelUp + (this.boostersAttached ? this.fuelB : 0);
    if (total > 5) return false;                       // propellant remains somewhere: the player can still act
    const o = this.orbit(), id = this.mission.id; this.hopelessReason = '';
    const km = v => Math.round(v / 1000).toLocaleString('en-US') + ' km';
    if (id === 'sounding') {
      if (this.maxAlt >= WORLD.karman) return false;
      const p = this.predictPath(80); if (p.maxAlt >= WORLD.karman) return false;   // still coasting up past the Kármán line
      this.hopelessReason = `out of propellant; the coast will peak at ${km(Math.max(this.maxAlt, p.maxAlt))}, below the 100 km Kármán line.`; return true;
    }
    if (this.alt < 70000 && this.vUp < 0) { this.hopelessReason = 'out of propellant below the atmosphere top and falling.'; return true; }
    if (this.alt < 70000) return false;                // still climbing through the atmosphere; check again above it
    const crit = this.evaluateCriteria();
    if (id === 'leo' || id === 'transfer') {
      if (crit.ok) return false;                       // orbit is already valid: the player only has to deploy
      this.hopelessReason = `out of propellant, so the orbit can no longer change: ${crit.reason}`; return true;
    }
    if (id === 'deep') {
      if (crit.ok) return false;
      if (!o.bound && o.vinf >= 1200 && this.alt < 5000000) return false;   // still climbing to 5,000 km on an escape path
      this.hopelessReason = o.bound ? 'out of propellant on a trajectory still bound to Earth.' : `out of propellant with only ${Math.round(o.vinf)} m/s excess speed (needs 1,200 m/s).`; return true;
    }
    if (this.mission.captureDv) {                       // lunar missions
      const p = this.predictPath(80);
      if (p.hit) return false;                         // still on course for the Moon: let it coast there
      this.hopelessReason = p.impact ? `out of propellant on a path that falls back to Earth (closest approach to the Moon ${km(p.minD)}).` : `out of propellant on a trajectory that misses the Moon by ${km(p.minD)} (capture zone ${km(WORLD.moonSOI)}).`; return true;
    }
    return false;
  }

  failureReason() {
    const m = this.mission, o = this.orbit();
    const fuelLeft = Math.round(this.fuelCore + this.fuelUp + (this.boostersAttached ? this.fuelB : 0));
    if (this.breakup === 'maxq') return 'Structural failure at maximum dynamic pressure.';
    if (m.id === 'sounding') return `The vehicle ran out of performance at ${(this.maxAlt / 1000).toFixed(0)} km, short of the 100 km Kármán line, and fell back. ${fuelLeft < 20 ? 'All propellant was consumed.' : ''}`.trim();
    if (m.captureDv && !this.moonReached) return this.maxR < 0.9 * WORLD.moonDist ? `The trajectory only reached ${(this.maxR / 1000 - WORLD.R / 1000).toFixed(0)} km altitude (the Moon is ${(WORLD.moonDist / 1000).toFixed(0)} km away). The vehicle did not have enough delta-v for trans-lunar injection and fell back to Earth.` : `The trajectory reached lunar distance but passed ${Math.round(this.minMoonD / 1000).toLocaleString('en-US')} km from the Moon (capture zone ${Math.round(WORLD.moonSOI / 1000).toLocaleString('en-US')} km): the transfer was not aimed at the Moon.`;
    if (this.maxSpeed < 2000 && m.id !== 'sounding') return `Orbital insertion was not achieved: peak speed ${Math.round(this.maxSpeed)} m/s is below the ~2,200 m/s needed for low orbit. ${fuelLeft < 20 ? 'Propellant ran out first.' : 'Propellant remained, so the trajectory/pitch program was inefficient.'}`;
    return `The vehicle did not reach a stable trajectory (apoapsis ${isFinite(o.ap) ? (o.ap / 1000).toFixed(0) + ' km' : 'unbound'}, periapsis ${(o.pe / 1000).toFixed(0)} km) and fell back to Earth.`;
  }

  // ---- lunar encounter (scripted) ----
  stepLunar(dt) {
    this.t += dt;
    if (this.phase === 'lunar-arrival') { if (this.arriveSpeed === undefined) this.arriveSpeed = this.speed; return; }
    const m = this.mass();
    if (this.phase === 'lunar-capture' || this.phase === 'lunar-descent') {
      const need = this.phase === 'lunar-capture' ? this.mission.captureDv : this.mission.descentDv;
      const key = this.phase === 'lunar-capture' ? 'dvDone' : 'descentDone';
      const thr = Math.max(0.2, this.throttle);
      const Fmax = this.stage === 'core' ? this.c.engine.thrust : this.c.upper.thrust;
      const isp = this.activeIsp();
      let fuel = this.activeFuel();
      const flow = Fmax * thr / (isp * G0); const used = Math.min(fuel, flow * dt);
      if (this.stage === 'core') this.fuelCore -= used; else this.fuelUp -= used;
      this.thrustNow = Fmax * thr * (used / (flow * dt || 1));
      const dv = isp * G0 * Math.log(m / (m - used)); this.lunar[key] += dv;
      this.engineOn = true;
      if (this.lunar[key] >= need) {
        this.engineOn = false; this.thrustNow = 0; this.throttle = 0;
        if (this.phase === 'lunar-capture') { this.phase = 'lunar-orbit'; this.log(this.t, 'Capture burn complete. Vehicle is in lunar orbit.', 'good'); }
        else { this.phase = 'landed'; this.log(this.t, 'Touchdown. Lander is stable on the lunar surface.', 'good'); }
      } else if (this.activeFuel() <= 0.5 && this.stage === 'core' && this.canSeparateStage() && this.fuelUp > 1) {
        this.separateStage(); this.log(this.t, 'Core stage empty: upper stage separated automatically so the burn can continue.', 'info');
      } else if (this.activeFuel() <= 0.5) {
        this.engineOn = false; this.thrustNow = 0;
        const stageHint = this.an.hasUpper && this.stage === 'core' ? ' Consider separating the spent core stage so the lighter upper stage can burn.' : '';
        this.lunarFail = this.phase === 'lunar-capture' ? 'flyby' : 'crash';
        this.finish(false, this.phase === 'lunar-capture' ? `Propellant ran out ${Math.round(need - this.lunar[key])} m/s of delta-v short of lunar capture; the vehicle flew past the Moon.${stageHint}` : `Propellant ran out ${Math.round(need - this.lunar[key])} m/s of delta-v short of a soft landing: the lander crashed.${stageHint}`);
      }
    }
  }

  // Recommended integration step: fine while thrusting or in the atmosphere, coarser (but still small vs. the orbital period) when coasting.
  dtHint() {
    const thrusting = this.thrustNow > 0 || (this.engineOn && this.throttle > 0);
    if (thrusting || this.alt < 80000 || this.outcome && this.alt < 100000) return 0.05;
    return Math.min(40, Math.max(0.25, 0.02 * this.r / Math.max(this.speed, 50)));
  }
  // ---- reference frame for telemetry: Earth until the lunar encounter, then the Moon (scripted lunar phases) ----
  inLunarFrame() { return this.phase.startsWith('lunar') || this.phase === 'landed' || !!this.lunarFail || (this.outcome && this.moonReached); }
  lunarTelemetry() {
    const Rm = WORLD.moonR, mu = WORLD.moonG * Rm * Rm, vOrb = Math.sqrt(mu / (Rm + WORLD.moonOrbitAlt));
    const sm = k => k * k * (3 - 2 * k);
    const cap = Math.min(1, this.lunar.dvDone / (this.mission.captureDv || 1)), des = this.mission.descentDv ? Math.min(1, this.lunar.descentDone / this.mission.descentDv) : 0;
    const a0 = Math.max(0, this.arriveD - Rm);
    if (this.phase === 'lunar-arrival' || (this.lunarFail === 'flyby' && cap < 1)) return { alt: a0 + (this.lunarFail === 'flyby' ? 0 : 0), speed: this.arriveSpeed ?? this.speed, orbit: false };
    if (this.phase === 'lunar-capture') return { alt: a0 + (WORLD.moonOrbitAlt - a0) * sm(cap), speed: (this.arriveSpeed ?? this.speed) * (1 - cap) + vOrb * cap, orbit: false };
    if (this.phase === 'lunar-orbit') return { alt: WORLD.moonOrbitAlt, speed: vOrb, orbit: true };
    if (this.phase === 'lunar-descent') return { alt: WORLD.moonOrbitAlt * (1 - sm(des)), speed: vOrb * (1 - des) + 2 * des, orbit: false };
    if (this.phase === 'landed' || this.phase === 'complete') return { alt: 0, speed: 0, orbit: false };
    return { alt: WORLD.moonOrbitAlt, speed: vOrb, orbit: true };
  }
  telemetry() {
    const o = this.orbit(); const m = this.mass();
    const lun = this.inLunarFrame() ? this.lunarTelemetry() : null;
    return {
      ref: lun ? 'Moon' : 'Earth', status: this.status, moonD: this.moonD, moonAlt: Math.max(0, this.moonD - WORLD.moonR), minMoonD: this.minMoonD,
      t: this.t, alt: lun ? lun.alt : this.alt, speed: lun ? lun.speed : this.speed, vUp: lun ? 0 : this.vUp, vEast: lun ? lun.speed : this.vEast,
      ap: lun ? (lun.orbit ? WORLD.moonOrbitAlt : NaN) : o.ap, pe: lun ? (lun.orbit ? WORLD.moonOrbitAlt : NaN) : o.pe, bound: lun ? lun.orbit : o.bound, vinf: lun ? undefined : o.vinf,
      fuelCore: this.fuelCore, fuelUp: this.fuelUp, fuelB: this.fuelB,
      fuelPct: this.fuelPercent(),
      thrust: this.thrustNow, mass: m, twr: this.thrustNow / (m * G0),
      q: this.q, qLimit: this.qLimit(), throttle: this.throttle, effThrottle: this.effThrottle ?? 0,
      pitch: this.pitch, phase: this.phase, stage: this.stage, heat: this.heat, heatRate: this.heatRate || 0,
      boosters: this.boostersAttached, fairing: this.fairingAttached,
      dvRemaining: this.dvRemaining(), lunar: this.lunar,
    };
  }
  fuelPercent() {
    const tot = this.an.coreProp + this.an.upperProp + this.an.boosterProp;
    const left = this.fuelCore + this.fuelUp + this.fuelB;
    return tot ? left / tot : 0;
  }
  activeDv() { const m = this.mass(), prop = this.activeFuel(); if (m - prop <= 0 || prop <= 0) return 0; return this.activeIsp() * G0 * Math.log(m / (m - prop)); }
  // Remaining ideal delta-v over the stages still attached (core burn, then the upper stage after separation).
  dvRemaining() {
    const c = this.c, G = G0; let dv = 0;
    if (this.stage === 'core') {
      const m = this.mass(), prop = this.fuelCore + (this.boostersAttached ? this.fuelB : 0);
      if (prop > 0 && m - prop > 0) dv += c.engine.isp * G * Math.log(m / (m - prop));
      if (this.an.hasUpper && this.fuelUp > 0) { const mu = this.upperStackMass(); dv += c.upper.isp * G * Math.log(mu / (mu - this.fuelUp)); }
      return dv;
    }
    return this.activeDv();
  }
}
