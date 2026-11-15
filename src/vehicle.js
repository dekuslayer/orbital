// ORBITAL — vehicle engineering model.
// Documented assumptions (see README): constant Isp per engine, sea-level thrust = vacuum thrust,
// ideal delta-v from the Tsiolkovsky rocket equation  dv = Isp * g0 * ln(m_start / m_end), summed over burn phases.
import { PARTS, G0, findPart } from './parts.js';

const get = (slot, id) => PARTS[slot].find(p => p.id === id);

export function resolveLoadout(l) {
  return {
    engine: get('engines', l.engines),
    tank: get('tanks', l.tanks),
    structure: get('structures', l.structures),
    boosters: get('boosters', l.boosters),
    upper: get('upperStages', l.upperStages),
    payload: get('payloads', l.payloads),
    extras: (l.extras || []).map(id => get('extras', id)),
  };
}

export function hasExtra(l, id) { return (l.extras || []).includes(id); }

// Static design analysis used by the Engineering Lab and the pre-launch check.
export function analyse(loadout) {
  const c = resolveLoadout(loadout);
  const extrasMass = c.extras.reduce((a, e) => a + e.mass, 0);
  const fairing = hasExtra(loadout, 'ex_fairing');
  const fairingMass = fairing ? get('extras', 'ex_fairing').mass : 0;
  const scMass = c.extras.filter(e => e.spacecraft).reduce((a, e) => a + e.mass, 0);          // solar wings / antenna ride with the payload
  const coreExtras = extrasMass - fairingMass - scMass;
  const busPower = 250, powerAvail = busPower + c.extras.reduce((a, e) => a + (e.powerW || 0), 0), hasLink = c.extras.some(e => e.link);

  const coreDry = c.engine.mass + c.tank.dry + c.structure.mass + coreExtras;
  const coreProp = c.tank.propellant;
  const upperStack = (c.upper.propellant ? c.upper.dry + c.upper.propellant : 0) + c.payload.mass + fairingMass + scMass;
  const bDry = c.boosters.dry, bProp = c.boosters.propellant;

  const m0 = coreDry + coreProp + bDry + bProp + upperStack;
  const dryMass = m0 - coreProp - bProp - (c.upper.propellant || 0);
  const propMass = coreProp + bProp + (c.upper.propellant || 0);
  const thrust0 = c.engine.thrust + c.boosters.thrust;
  const twr = thrust0 / (m0 * G0);

  // Phase A: boosters + core engine in parallel
  let dv = 0, mCur = m0, phases = [];
  let coreLeft = coreProp;
  if (bProp > 0) {
    const flowB = c.boosters.thrust / (c.boosters.isp * G0);
    const flowC = c.engine.thrust / (c.engine.isp * G0);
    const tA = bProp / flowB;
    const coreUsed = Math.min(coreLeft, flowC * tA);
    const mEnd = mCur - bProp - coreUsed;
    const flow = flowB + flowC;
    const ispEff = (c.boosters.thrust + c.engine.thrust) / (flow * G0);
    const d = ispEff * G0 * Math.log(mCur / mEnd);
    dv += d; phases.push({ name: 'Boosters + core', dv: d, burn: tA });
    mCur = mEnd - bDry; coreLeft -= coreUsed;
  }
  if (coreLeft > 0) {
    const mEnd = mCur - coreLeft;
    const d = c.engine.isp * G0 * Math.log(mCur / mEnd);
    const t = coreLeft / (c.engine.thrust / (c.engine.isp * G0));
    dv += d; phases.push({ name: 'Core stage', dv: d, burn: t });
    mCur = mEnd;
  }
  if (c.upper.propellant) {
    // core stage (engine, tank, structure, extras) is jettisoned before the upper stage burn
    const mStart = upperStack;
    const mEnd = mStart - c.upper.propellant;
    const d = c.upper.isp * G0 * Math.log(mStart / mEnd);
    const t = c.upper.propellant / (c.upper.thrust / (c.upper.isp * G0));
    dv += d; phases.push({ name: 'Upper stage', dv: d, burn: t });
  }

  // Once the boosters are spent the core engine must still be able to carry the rest of the stack (otherwise the vehicle stalls and falls back).
  const mAfterBoost = bProp > 0 ? m0 - bProp - bDry - Math.min(coreProp, c.engine.thrust / (c.engine.isp * G0) * (bProp / (c.boosters.thrust / (c.boosters.isp * G0)))) : m0;
  const twrCore = c.engine.thrust / (mAfterBoost * G0);

  const launchCost = launchFee(loadout);
  const partsValue = [c.engine, c.tank, c.structure, c.boosters, c.upper, c.payload, ...c.extras].reduce((a, p) => a + (p.cost || 0), 0);
  const totalBurn = phases.reduce((a, p) => a + p.burn, 0);
  return {
    scMass, fairingMass, coreExtraMass: coreExtras, powerAvail, powerReq: c.payload.power || 0, hasLink,
    components: c, m0, dryMass, propMass, thrust0, twr, twrCore, dv, phases, totalBurn,
    coreProp, upperProp: c.upper.propellant || 0, boosterProp: bProp, partsValue, launchCost,
    hasFairing: fairing, hasRcs: hasExtra(loadout, 'ex_rcs'), hasGimbal: hasExtra(loadout, 'ex_gimbal'),
    hasUpper: !!c.upper.propellant, hasBoosters: c.boosters.count > 0,
    durability: c.structure.durability,
  };
}

// Propellant has a price: every launch costs credits whether or not it succeeds.
export function launchFee(loadout) {
  const c = resolveLoadout(loadout);
  const prop = c.tank.propellant + (c.boosters.propellant || 0) + (c.upper.propellant || 0);
  return Math.round(25 + prop * 0.005);
}

// Pre-launch feasibility check. Returns a list of findings with severity: 'block' | 'warn' | 'ok'.
export function checkFeasibility(loadout, mission, credits) {
  const a = analyse(loadout);
  const out = [];
  const push = (sev, text) => out.push({ sev, text });
  const lp = a.components.payload;

  if (a.twr < 1.15) push('block', `Thrust-to-weight ratio at lift-off is ${a.twr.toFixed(2)}. The vehicle must exceed about 1.15 to leave the pad safely. Add thrust (a stronger engine or boosters) or remove mass.`);
  else if (a.twr < 1.4) push('warn', `Thrust-to-weight ratio is only ${a.twr.toFixed(2)}: lift-off is slow and gravity losses will be high.`);
  else push('ok', `Lift-off thrust-to-weight ratio ${a.twr.toFixed(2)} is adequate.`);

  if (a.hasBoosters && a.twrCore < 0.8) push('block', `After the boosters burn out the core engine only has a thrust-to-weight ratio of ${a.twrCore.toFixed(2)}, so the vehicle stalls and falls back before reaching orbit. Use a stronger core engine, a smaller tank or fewer/lighter stages.`);
  else if (a.hasBoosters && a.twrCore < 1.0) push('warn', `After the boosters burn out the core engine only has a thrust-to-weight ratio of ${a.twrCore.toFixed(2)}: the climb will stall unless you keep the pitch low.`);
  if (a.dv < mission.requiredDv) push('block', `Estimated ideal delta-v is ${Math.round(a.dv)} m/s but this mission needs about ${mission.requiredDv} m/s. Add propellant (a larger tank, boosters or an upper stage), a more efficient engine, or reduce payload and structure mass.`);
  else if (a.dv < mission.requiredDv * 1.08) push('warn', `Delta-v margin is thin (${Math.round(a.dv)} m/s vs ${mission.requiredDv} m/s required). Imperfect piloting could cause failure.`);
  else push('ok', `Delta-v ${Math.round(a.dv)} m/s covers the ${mission.requiredDv} m/s requirement.`);

  const need = mission.payloadClass;
  const rank = { 'leo': 0, 'orbit': 1, 'lunar-orbit': 2, 'lunar-land': 3, 'deep': 4 };
  const mrank = { sounding: -1, leo: 0, transfer: 1, 'lunar-orbit': 2, 'lunar-land': 3, deep: 4 };
  if (mission.requiredPayload && lp.capability !== mission.requiredPayload) {
    push('block', `This mission requires the "${mission.requiredPayloadName}" payload. The installed payload is "${lp.name}".`);
  } else if (mission.requiredPayload) push('ok', `Payload "${lp.name}" matches the mission.`);

  if (mission.needsComms && !a.hasLink) push('block', 'This mission needs a High-Gain Antenna: without a data link to Earth the science data cannot be returned.');
  else if (mission.needsComms) push('ok', 'Data link to Earth: High-Gain Antenna installed.');
  if (a.powerReq > a.powerAvail) push('block', `Power budget: the ${lp.name} needs ${a.powerReq} W but the spacecraft only supplies ${a.powerAvail} W. Add Solar Array Wings (+700 W).`);
  else if (a.powerReq > 0.8 * a.powerAvail) push('warn', `Power budget is tight: ${a.powerReq} W needed of ${a.powerAvail} W available.`);
  else push('ok', `Power budget: ${a.powerReq} W needed, ${a.powerAvail} W available.`);
  if (mission.needsRcs && !a.hasRcs) push('block', 'This mission needs an RCS Thruster Ring for precise insertion or landing corrections.');
  if (mission.needsUpperStage && !a.hasUpper) push('warn', 'Missions of this class are very hard without a separable upper stage: dead mass of the core stage must be dropped.');
  if (a.hasBoosters && a.twr > 4) push('warn', `Very high lift-off thrust-to-weight ratio (${a.twr.toFixed(2)}): boosters cannot be shut down, and a steep, fast ascent wastes a lot of propellant (gravity and drag losses). Much of the ideal delta-v will be lost, so keep a bigger margin or use a larger tank/upper stage.`);
  if (a.hasBoosters && a.twr > 2.6 && a.durability < 1.3) push('warn', 'High thrust-to-weight with a light structure: throttle down through maximum dynamic pressure (Max-Q) or the structure may fail.');
  if (!a.hasFairing && mission.id !== 'sounding') push('warn', 'No payload fairing: higher drag losses and payload exposed to atmospheric loads.');
  if (credits !== undefined && credits < a.launchCost) push('block', `Launch fee is ${a.launchCost} credits (propellant and operations) but only ${Math.floor(credits)} are available.`);
  else push('ok', `Launch fee ${a.launchCost} credits (propellant and operations).`);
  return { analysis: a, findings: out, canLaunch: !out.some(f => f.sev === 'block') };
}

export { findPart };

// ---------------------------------------------------------------------------------------------
// Build advisor: searches every combination of catalogue parts and returns the CHEAPEST set of
// purchases (given what the player already owns) that clears every blocking pre-launch check.
// ---------------------------------------------------------------------------------------------
const _advisorCache = new Map();
export const ADVISOR_MARGIN = 1.12;

// All catalogue builds that clear every blocking check (with a real-flight delta-v margin), cheapest purchase first.
// `ownedIds` are the parts the player already has (they cost nothing to reuse).
export function feasibleBuilds(ownedIds, mission) {
  const key = 'F|' + mission.id + '|' + [...ownedIds].sort().join(',');
  if (_advisorCache.has(key)) return _advisorCache.get(key);
  const owned = new Set(ownedIds), out = [];
  const price = p => owned.has(p.id) ? 0 : p.cost;
  const ex = PARTS.extras;
  for (const e of PARTS.engines) for (const t of PARTS.tanks) { const c1 = price(e) + price(t);
    for (const s of PARTS.structures) { const c2 = c1 + price(s);
      for (const b of PARTS.boosters) { const c3 = c2 + price(b);
        for (const u of PARTS.upperStages) { const c4 = c3 + price(u);
          for (const p of PARTS.payloads) { const c5 = c4 + price(p);
            for (let mask = 0; mask < (1 << ex.length); mask++) {
              const extras = ex.filter((_, i) => mask & (1 << i)); const buy = c5 + extras.reduce((a, x) => a + price(x), 0);
              const l = { engines: e.id, tanks: t.id, structures: s.id, boosters: b.id, upperStages: u.id, payloads: p.id, extras: extras.map(x => x.id) };
              const r = checkFeasibility(l, mission, undefined); if (!r.canLaunch || r.analysis.dv < mission.requiredDv * ADVISOR_MARGIN) continue;
              out.push({ loadout: l, buy, warns: r.findings.filter(f => f.sev === 'warn').length, fee: r.analysis.launchCost, dv: r.analysis.dv, twr: r.analysis.twr, parts: [e, t, s, b, u, p, ...extras].filter(x => !owned.has(x.id) && x.cost > 0) });
            } } } } } }
  out.sort((a, b) => a.buy - b.buy || a.warns - b.warns || a.fee - b.fee);
  _advisorCache.set(key, out); return out;
}
// Unverified cheapest build (the Build Advisor in the UI uses advisor.js, which also flight-tests candidates).
export function recommendBuild(ownedIds, mission) { return feasibleBuilds(ownedIds, mission)[0] || null; }
