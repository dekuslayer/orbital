import assert from 'node:assert/strict';
import { Flight } from '../src/flight.js';
import { Autopilot } from '../src/autopilot.js';
import { defaultLoadout } from '../src/parts.js';
import { getMission, WORLD } from '../src/missions.js';
import { simulateAssisted } from '../src/advisor.js';
export { assert, Flight, Autopilot, defaultLoadout, getMission, WORLD, simulateAssisted };
export const B = o => ({ ...defaultLoadout(), ...o });
let passed = 0, failed = 0; const failures = [];
// Tests run one after another; an async test is AWAITED (a rejected promise is a failure, never silently ignored).
let chain = Promise.resolve();
export function test(name, fn) {
  chain = chain.then(async () => {
    try { await fn(); passed++; console.log('  ✔', name); }
    catch (e) { failed++; failures.push(name); console.log('  ✘', name, '\n     ', (e && e.message || e).toString().split('\n').slice(0, 4).join('\n      ')); }
  });
}
export async function summary(label) { await chain; console.log(`${label}: ${passed} passed, ${failed} failed`); return { passed, failed, failures }; }
export function runFor(f, seconds, stepper) { let t = 0; while (t < seconds && !f.outcome) { stepper && stepper(f); const h = Math.min(f.dtHint(), seconds - t); f.step(h); t += h; } return t; }
