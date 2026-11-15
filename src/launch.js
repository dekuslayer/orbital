// ORBITAL — the one place that decides whether a launch may start and takes the fee.
// Order matters: feasibility → a flight display must exist → only then the fee is charged. A technical problem
// (no WebGL, no 2D canvas) therefore never costs the player credits.
import { checkFeasibility } from './vehicle.js';
// opts.deferFee: validate only and report the fee; the caller takes it at ignition (so cancelling a countdown never costs anything).
export function beginLaunch(store, mission, ensureDisplay, opts = {}) {
  const s = store.get(); const chk = checkFeasibility(s.loadout, mission, s.credits);
  if (!chk.canLaunch) { const f = chk.findings.find(x => x.sev === 'block'); return { ok: false, why: 'blocked', msg: 'Launch blocked: ' + (f ? f.text : 'the design is not ready.') }; }
  let shown = false; try { shown = !!ensureDisplay(); } catch (e) { shown = false; }
  if (!shown) return { ok: false, why: 'no-display', msg: 'The flight display could not start on this device (neither 3D nor 2D), so nothing was charged and the flight was not started. Try another browser or enable hardware acceleration.' };
  if (opts.deferFee) return { ok: true, fee: chk.analysis.launchCost, deferred: true };
  const pay = store.payLaunchFee(); if (!pay.ok) return { ok: false, why: 'fee', fee: pay.fee, msg: `Launch fee ${pay.fee} credits exceeds your balance.` };
  return { ok: true, fee: pay.fee };
}
