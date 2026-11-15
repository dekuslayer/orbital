// ORBITAL — flight-tested Build Advisor. Candidate builds (cheapest first) are flown headlessly with the assist autopilot,
// and the first one that actually completes the mission is recommended. Results are cached per (mission, owned parts).
import { feasibleBuilds } from './vehicle.js';
import { Flight } from './flight.js';
import { Autopilot } from './autopilot.js';

// Fly a build start-to-finish with the autopilot in a pure simulation. Returns the finished Flight.
export function simulateAssisted(loadout, mission, { maxSim = 1.2e6, plan = true } = {}) {
  const f = new Flight(loadout, mission); f.ignite(); f.setThrottle(1); const ap = new Autopilot(f, { plan }); let n = 0, simT = 0;
  while (n++ < 400000 && !f.outcome && simT < maxSim && !(ap.done && !f.outcome && f.phase !== 'ready')) {
    ap.update();
    let h = f.dtHint(); if (ap.maxStep) h = Math.min(h, ap.maxStep);
    f.step(h); simT += h;
  }
  return { f, ap };
}

const cache = new Map();
export function verifiedBuild(ownedIds, mission, { tries = 40 } = {}) {
  const key = mission.id + '|' + [...ownedIds].sort().join(',');
  if (cache.has(key)) return cache.get(key);
  const list = feasibleBuilds(ownedIds, mission); let found = null, tested = 0;
  for (const cand of list) {
    if (tested++ >= tries) break;
    const { f } = simulateAssisted(cand.loadout, mission);
    if (f.outcome && f.outcome.success) { found = { ...cand, verified: true, fuelLeftPct: f.fuelPercent() * 100, tested }; break; }
  }
  cache.set(key, found); return found;
}
export function clearAdvisorCache() { cache.clear(); }
