// ORBITAL mission audit: measured Flight + Autopilot scenarios (no invented results).
// Usage: node tools/audit.mjs [--json]
import { Flight } from '../src/flight.js';
import { Autopilot } from '../src/autopilot.js';
import { MISSIONS } from '../src/missions.js';
import { PARTS } from '../src/parts.js';
import { verifiedBuild } from '../src/advisor.js';

const ALL = Object.values(PARTS).flat().map(p => p.id);
const finite = f => [f.x, f.y, f.vx, f.vy, f.fuelCore, f.fuelUp, f.fuelB, f.pitch, f.targetPitch, f.thrustNow].every(Number.isFinite)
  && f.fuelCore >= 0 && f.fuelUp >= 0 && f.fuelB >= 0;

function run(f, ap, { until = () => false, maxSim = 1.2e6, onTick } = {}) {
  let n = 0, simT = 0, bad = false, lastPitch = f.pitch, maxPitchRate = 0;
  while (n++ < 500000 && !f.outcome && simT < maxSim && !(ap && ap.done && f.phase !== 'ready') && !until(f)) {
    if (ap) ap.update();
    if (onTick) onTick(f);
    let h = f.dtHint();
    if (ap && ap.maxStep) h = Math.min(h, ap.maxStep);
    f.step(h); simT += h;
    if (!finite(f)) { bad = true; break; }
    const dp = Math.abs(f.pitch - lastPitch);
    if (dp / Math.max(h, 1e-9) > maxPitchRate) maxPitchRate = dp / Math.max(h, 1e-9);
    lastPitch = f.pitch;
  }
  return { bad, simT, maxPitchRate };
}

// A scripted pilot for repeatable test fixtures; this is not counted as a completed mission unless its objective is met.
function pilot(params, opts = {}) {
  return f => {
    const a = f.alt, o = f.orbit();
    if (f.canSeparateBoosters() && f.fuelB <= 1 && f.boostersAttached) f.separateBoosters();
    if (f.stage === 'core' && f.canSeparateStage() && f.fuelCore <= 1 && f.fuelUp > 1 && (!f.boostersAttached || f.fuelB <= 1)) f.separateStage();
    if (opts.cutAp && o.ap >= opts.cutAp) { f.setThrottle(0); return; }
    f.setThrottle(f.q > 0.6 * f.qLimit() ? 0.6 : 1);
    if (opts.pitch !== undefined && a > 15000 && a < 60000) { f.setPitch(opts.pitch); return; }
    f.setPitch(a < 1000 ? 90 : Math.max(4, 90 - 86 * Math.pow(Math.min(1, (a - 1000) / params.turnAlt), params.turnExp)));
  };
}
function planned(build, m) {
  const f = new Flight(build, m); f.ignite(); f.setThrottle(1);
  const ap = new Autopilot(f);
  return ap.planned && ap.planned.turnAlt ? ap.planned : { turnAlt: 80000, turnExp: 0.5 };
}
function handoverSnapshot(f) {
  const o = f.orbit();
  return {
    altitudeM: Math.round(f.alt), pitchDeg: +f.pitch.toFixed(2), commandedPitchDeg: +f.targetPitch.toFixed(2),
    verticalSpeedMps: Math.round(f.vUp), horizontalSpeedMps: Math.round(f.vEast),
    apoapsisM: Number.isFinite(o.ap) ? Math.round(o.ap) : null,
    periapsisM: Number.isFinite(o.pe) ? Math.round(o.pe) : null,
    fuelPercent: +(f.fuelPercent() * 100).toFixed(1), stage: f.stage, phase: f.phase
  };
}
function summarize(label, f, ap, r, extra = '', meta = {}) {
  const logs = f.events.map(e => e.msg), dup = logs.length - new Set(logs).size;
  const refused = !!(ap && ap.infeasible && ap.done && !f.outcome);
  const success = f.outcome ? !!f.outcome.success : null;
  return {
    scenario: label,
    category: refused ? 'takeover-check' : 'mission',
    status: refused ? 'autopilot-refused-safely' : (f.outcome ? (f.outcome.success ? 'mission-succeeded' : 'mission-failed') : 'not-completed'),
    success,
    checkPassed: refused ? true : null,
    result: (f.outcome ? f.outcome.cause : (ap && ap.status) || 'no mission outcome').slice(0, 150),
    tSim: Math.round(f.t), finiteState: !r.bad, dupLogMsgs: dup, events: logs.length, extra, ...meta
  };
}

const results = [];
const add = x => results.push(x);

for (const m of MISSIONS) {
  const rec = verifiedBuild(ALL, m, { tries: 80 });
  if (!rec) { add({ scenario: m.id + ' (no build)', category: 'setup', status: 'no-build', success: null }); continue; }
  const B = rec.loadout, P = planned(B, m);

  // 1. Auto Drive from launch, repeated three times.
  for (let k = 1; k <= 3; k++) {
    const f = new Flight(B, m); f.ignite(); f.setThrottle(1);
    const ap = new Autopilot(f), r = run(f, ap);
    add(summarize(`${m.id} auto@launch #${k}`, f, ap, r));
  }

  // 2. Manual ascent is a checkpoint-only scenario, not a completed mission.
  {
    const f = new Flight(B, m); f.ignite();
    const pl = pilot(P, { cutAp: 200000 });
    const r = run(f, null, { onTick: pl, maxSim: 4000, until: ff => ff.alt > 190000 && ff.throttle === 0 });
    const checkpointPassed = !f.outcome && f.alt > 190000 && f.throttle === 0 && f.orbit().ap >= 190000 && !r.bad;
    add({
      scenario: `${m.id} manual ascent checkpoint (coast near 200 km apoapsis)`,
      category: 'checkpoint', status: checkpointPassed ? 'checkpoint-passed-not-full-mission' : 'checkpoint-not-reached',
      success: null, checkPassed: checkpointPassed,
      result: f.outcome ? f.outcome.cause : `manual ascent checkpoint; apoapsis=${Math.round(f.orbit().ap / 1000)} km`,
      tSim: Math.round(f.t), finiteState: !r.bad, dupLogMsgs: 0, events: f.events.length
    });
  }

  // 3. Good-pilot handover at a range of altitudes.
  for (const h of [1500, 5000, 20000, 40000, 60000, 90000, 150000]) {
    const f = new Flight(B, m); f.ignite();
    const pl = pilot(P, { cutAp: 200000 });
    run(f, null, { onTick: pl, maxSim: 3000, until: ff => ff.alt >= h });
    if (f.outcome || f.alt < h) {
      add({ scenario: `${m.id} handover@${h / 1000}km`, category: 'setup', status: 'handover-point-not-reached', success: null,
        result: f.outcome ? f.outcome.cause.slice(0, 100) : 'altitude not reached', tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length });
      continue;
    }
    const snapshot = handoverSnapshot(f), ap = new Autopilot(f), r = run(f, ap);
    add(summarize(`${m.id} handover@${h / 1000}km`, f, ap, r,
      `plan=${ap.infeasible ? 'refused' : (ap.planned && ap.planned.turnAlt ? 'yes' : (ap.planned && ap.planned.fromState) || 'state-plan')}`,
      { takeover: snapshot }));
  }

  // 4a. True stage-separation handover only when an upper stage exists; otherwise report a different checkpoint.
  {
    const f = new Flight(B, m); f.ignite();
    const hasUpper = !!f.an.hasUpper, pl = pilot(P, { cutAp: 200000 });
    run(f, null, { onTick: pl, maxSim: 3000, until: ff => hasUpper ? ff.stage === 'upper' : ff.alt > 120000 });
    const reached = hasUpper ? f.stage === 'upper' : f.alt > 120000;
    if (reached && !f.outcome) {
      const label = hasUpper ? `${m.id} takeover after confirmed upper-stage separation` : `${m.id} post-ascent takeover (single-stage/no upper stage)`;
      const snapshot = handoverSnapshot(f), ap = new Autopilot(f), r = run(f, ap);
      add(summarize(label, f, ap, r, `stage=${snapshot.stage}; hasUpper=${hasUpper}`, { takeover: snapshot }));
    } else {
      add({ scenario: `${m.id} upper-stage separation checkpoint`, category: 'setup', status: 'separation-not-reached', success: null,
        result: f.outcome ? f.outcome.cause : `upper-stage separation not reached; current stage=${f.stage}`, tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length });
    }
  }

  // 4b. Deliberately bad pitch: capture the ACTUAL takeover state before creating Auto Drive.
  {
    const f = new Flight(B, m); f.ignite();
    const pl = pilot(P, { cutAp: 200000, pitch: 55 });
    run(f, null, { onTick: pl, maxSim: 3000, until: ff => ff.alt >= 45000 });
    if (!f.outcome && f.alt >= 45000) {
      const snapshot = handoverSnapshot(f), ap = new Autopilot(f);
      if (ap.infeasible && ap.done) {
        add({ scenario: `${m.id} wrong-pitch handover check`, category: 'takeover-check', status: 'autopilot-refused-safely', success: null, checkPassed: true,
          result: ap.status, tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length, takeover: snapshot });
      } else {
        const r = run(f, ap);
        add(summarize(`${m.id} wrong-pitch handover`, f, ap, r, '', { takeover: snapshot }));
      }
    } else {
      add({ scenario: `${m.id} wrong-pitch handover`, category: 'setup', status: 'handover-point-not-reached', success: null,
        result: f.outcome ? f.outcome.cause : '45 km not reached', tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length });
    }
  }

  // 4c. Low-fuel handover: the test passes when the planner refuses safely without altering flight controls.
  {
    const f = new Flight(B, m); f.ignite();
    const pl = pilot({ turnAlt: 200000, turnExp: 2 }, {});
    run(f, null, { onTick: pl, maxSim: 3000, until: ff => ff.fuelPercent() < 0.35 });
    if (!f.outcome) {
      const snapshot = handoverSnapshot(f), controls = [f.x, f.y, f.vx, f.vy, f.pitch, f.targetPitch, f.throttle, f.fuelCore, f.fuelUp, f.fuelB, f.stage];
      const ap = new Autopilot(f);
      if (ap.infeasible && ap.done) {
        const after = [f.x, f.y, f.vx, f.vy, f.pitch, f.targetPitch, f.throttle, f.fuelCore, f.fuelUp, f.fuelB, f.stage];
        const unchanged = controls.every((v, i) => v === after[i]);
        add({ scenario: `${m.id} low-fuel takeover check`, category: 'takeover-check', status: unchanged ? 'autopilot-refused-safely' : 'state-mutated-on-refusal', success: null,
          checkPassed: unchanged, result: ap.status, tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length, takeover: snapshot });
      } else {
        const r = run(f, ap);
        add(summarize(`${m.id} low-fuel takeover`, f, ap, r, '', { takeover: snapshot }));
      }
    } else {
      add({ scenario: `${m.id} low-fuel takeover`, category: 'setup', status: 'low-fuel-point-not-reached', success: null,
        result: f.outcome.cause, tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length });
    }
  }

  // 5. Manual -> Auto -> Manual -> Auto.
  {
    const f = new Flight(B, m); f.ignite();
    const pl = pilot(P, { cutAp: 200000 });
    run(f, null, { onTick: pl, maxSim: 3000, until: ff => ff.alt >= 3000 });
    const ap1 = new Autopilot(f);
    run(f, ap1, { until: ff => ff.alt >= 25000 || ff.outcome || ap1.done });
    ap1.stop('Autopilot off: you have control');
    run(f, null, { onTick: pl, maxSim: 3000, until: ff => ff.alt >= 50000 || ff.outcome });
    if (!f.outcome) {
      const ap2 = new Autopilot(f), snapshot = handoverSnapshot(f), r = run(f, ap2);
      add(summarize(`${m.id} manual→auto→manual→auto`, f, ap2, r, '', { takeover: snapshot }));
    } else {
      add({ scenario: `${m.id} manual→auto→manual→auto`, category: 'mission', status: 'mission-failed', success: false,
        result: 'failed in manual leg: ' + f.outcome.cause.slice(0, 100), tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length });
    }
  }

  // 6. Handover during later lunar-mission states.
  if (m.captureDv) for (const st of ['orbit', 'window', 'cruise']) {
    const f = new Flight(B, m); f.ignite(); f.setThrottle(1);
    const first = new Autopilot(f);
    run(f, first, { until: ff => first.state === st });
    if (f.outcome || first.state !== st) {
      add({ scenario: `${m.id} takeover in state ${st}`, category: 'setup', status: 'state-not-reached', success: null,
        result: 'state not reached', tSim: Math.round(f.t), finiteState: finite(f), dupLogMsgs: 0, events: f.events.length });
      continue;
    }
    first.stop('Manual control');
    const snapshot = handoverSnapshot(f), ap = new Autopilot(f), r = run(f, ap);
    add(summarize(`${m.id} takeover in state ${st}`, f, ap, r, `recognised=${ap.startState}`, { takeover: snapshot }));
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.table(results.map(r => ({ scenario: r.scenario, category: r.category, status: r.status, success: r.success, check: r.checkPassed, result: r.result?.slice(0, 80), t: r.tSim, finite: r.finiteState, dup: r.dupLogMsgs })));
  const missions = results.filter(r => r.category === 'mission');
  const checkpoints = results.filter(r => r.category === 'checkpoint');
  const checks = results.filter(r => r.category === 'takeover-check');
  const setup = results.filter(r => r.category === 'setup');
  console.log(`\nMISSION OUTCOMES: ${missions.filter(r => r.success).length} succeeded, ${missions.filter(r => r.success === false).length} failed, ${missions.filter(r => r.success === null).length} incomplete.`);
  console.log(`CHECKPOINTS: ${checkpoints.filter(r => r.checkPassed).length}/${checkpoints.length} passed.`);
  console.log(`TAKEOVER SAFETY CHECKS: ${checks.filter(r => r.checkPassed).length}/${checks.length} passed.`);
  console.log(`SETUP / NOT-REACHED: ${setup.length}.`);
  console.log(`NON-FINITE STATES: ${results.filter(r => r.finiteState === false).length}; repeated log-message cases: ${results.filter(r => r.dupLogMsgs > 0).length}.`);
}
