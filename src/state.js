// ORBITAL — game state, economy and persistence. No rendering code here.
import { PARTS, findPart, defaultOwned, defaultLoadout, SLOT_ORDER } from './parts.js';
import { MISSIONS, getMission, isUnlocked, START_CREDITS, START_GEMS } from './missions.js';
import { analyse, launchFee } from './vehicle.js';

const KEY = 'orbital.save.v1';
const MIN_STIPEND_FLOOR = 300; // agency recovery rule: see README

function fresh() {
  return {
    v: 1, credits: START_CREDITS, gems: START_GEMS,
    owned: defaultOwned(), loadout: defaultLoadout(),
    completed: [], bestEfficiency: {}, gemsAwardedFor: [], gemBonusFor: [],
    records: ['rec_fire'], discoveries: [],            // records unlocked; discovery questions solved
    reports: [], rewardedFlights: [], selectedMission: 'sounding', tutorialDone: false,
    achievements: {}, explorer: { recordDates: {}, discoveryDates: {}, played: [], last: null },   // badges (id → ISO date) and the Explorer Log; local to this browser
  };
}

// ---- Achievements: cosmetic titles only (no credits or gems). Each one is earned from a real event recorded in the state. ----
const solved = (s, id) => s.discoveries.includes(id);
export const BADGES = [
  { id: 'first_launch', name: 'First Launch', desc: 'Fly your first mission (any result).', test: s => s.reports.length > 0 },
  { id: 'orbit', name: 'Orbit Achieved', desc: 'Complete Low Earth Orbit.', test: s => s.completed.includes('leo') },
  { id: 'moon', name: 'Moon Visitor', desc: 'Complete Lunar Orbit or Lunar Landing.', test: s => s.completed.includes('lunar-orbit') || s.completed.includes('lunar-land') },
  { id: 'deep', name: 'Deep Space Pioneer', desc: 'Complete the Deep-Space Probe mission.', test: s => s.completed.includes('deep') },
  { id: 'first_data', name: 'First Data Record', desc: 'Play a Jukebox record.', test: s => s.explorer.played.length > 0 },
  { id: 'ocean', name: 'Ocean Explorer', desc: 'Solve the Ocean Symphony discovery question.', test: s => solved(s, 'rec_ocean') },
  { id: 'air', name: 'Atmosphere Analyst', desc: 'Solve the Atmosphere in Motion discovery question.', test: s => solved(s, 'rec_air') },
  { id: 'ice', name: 'Ice Observer', desc: 'Solve the Ice Memory discovery question.', test: s => solved(s, 'rec_ice') },
  { id: 'detective', name: 'Data Detective', desc: 'Solve three discovery questions.', test: s => s.discoveries.length >= 3 },
  { id: 'efficient', name: 'Efficient Engineer', desc: 'Finish a successful mission with the efficiency bonus (≥15% propellant left).', test: s => s.reports.some(r => r.success && r.rewards && (r.rewards.lines || []).some(l => /Efficiency bonus/.test(l))) },
];
let newBadges = [];
function awardBadges() { const now = new Date().toISOString(); for (const b of BADGES) if (!state.achievements[b.id] && b.test(state)) { state.achievements[b.id] = now; newBadges.push(b); } }

const listeners = new Set();
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return fresh();
    return sanitize({ ...fresh(), ...s });
  } catch (e) { return fresh(); }       // unreadable save: start fresh instead of crashing
}
// Repair partially corrupt saves field by field so valid progress is kept and nothing crashes.
function sanitize(s) {
  const f = fresh(), isNum = v => typeof v === 'number' && Number.isFinite(v), arr = v => Array.isArray(v) ? v : [];
  const knownPart = id => !!findPart(id), knownMission = id => MISSIONS.some(m => m.id === id);
  s.credits = isNum(s.credits) && s.credits >= 0 ? s.credits : f.credits; s.gems = isNum(s.gems) && s.gems >= 0 ? Math.floor(s.gems) : f.gems;
  s.owned = [...new Set([...f.owned, ...arr(s.owned).filter(x => typeof x === 'string' && knownPart(x))])];
  const L = s.loadout && typeof s.loadout === 'object' ? s.loadout : {}, D = defaultLoadout();
  const slotOk = (slot, id) => typeof id === 'string' && findPart(id) && findPart(id).slot === slot && s.owned.includes(id);
  s.loadout = { engines: slotOk('engines', L.engines) ? L.engines : D.engines, tanks: slotOk('tanks', L.tanks) ? L.tanks : D.tanks, structures: slotOk('structures', L.structures) ? L.structures : D.structures, boosters: slotOk('boosters', L.boosters) ? L.boosters : D.boosters, upperStages: slotOk('upperStages', L.upperStages) ? L.upperStages : D.upperStages, payloads: slotOk('payloads', L.payloads) ? L.payloads : D.payloads, extras: arr(L.extras).filter(id => slotOk('extras', id)) };
  s.completed = [...new Set(arr(s.completed).filter(knownMission))]; s.gemsAwardedFor = arr(s.gemsAwardedFor); s.gemBonusFor = arr(s.gemBonusFor);
  s.records = [...new Set(['rec_fire', ...arr(s.records).filter(x => typeof x === 'string')])]; s.discoveries = arr(s.discoveries).filter(x => typeof x === 'string');
  s.reports = arr(s.reports).filter(r => r && typeof r === 'object' && typeof r.mission === 'string').slice(0, 25);
  s.rewardedFlights = arr(s.rewardedFlights).filter(x => typeof x === 'string').slice(0, 100);
  s.bestEfficiency = s.bestEfficiency && typeof s.bestEfficiency === 'object' ? s.bestEfficiency : {};
  s.selectedMission = knownMission(s.selectedMission) && isUnlocked(getMission(s.selectedMission), s.completed) ? s.selectedMission : 'sounding';
  const isoOk = v => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  const A = s.achievements && typeof s.achievements === 'object' ? s.achievements : {}; s.achievements = {}; for (const b of BADGES) if (isoOk(A[b.id])) s.achievements[b.id] = A[b.id];
  const E = s.explorer && typeof s.explorer === 'object' ? s.explorer : {}; const dateMap = o => { const r = {}; if (o && typeof o === 'object') for (const k of Object.keys(o)) if (typeof k === 'string' && isoOk(o[k])) r[k] = o[k]; return r; };
  s.explorer = { recordDates: dateMap(E.recordDates), discoveryDates: dateMap(E.discoveryDates), played: arr(E.played).filter(x => typeof x === 'string').slice(0, 20), last: E.last && typeof E.last === 'object' && typeof E.last.id === 'string' && isoOk(E.last.at) ? { id: E.last.id, step: Number.isInteger(E.last.step) ? E.last.step : 0, label: String(E.last.label || '').slice(0, 40), at: E.last.at } : null };
  s.tutorialDone = !!s.tutorialDone; return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable: progress is session-only */ } }
function emit() { awardBadges(); save(); listeners.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  isOwned: id => state.owned.includes(id),
  isInstalled(id) {
    const f = findPart(id); if (!f) return false;
    if (f.slot === 'extras') return state.loadout.extras.includes(id);
    return state.loadout[f.slot] === id;
  },

  // Purchase a part with credits. Returns {ok, msg}.
  buy(id) {
    const f = findPart(id); if (!f) return { ok: false, msg: 'Unknown part.' };
    if (state.owned.includes(id)) return { ok: false, msg: `${f.part.name} is already owned.` };
    if (state.credits < f.part.cost) return { ok: false, msg: `Insufficient credits: ${f.part.name} costs ${f.part.cost}, you have ${Math.floor(state.credits)}.` };
    const reserve = launchFee(defaultLoadout());       // never let a purchase strand the player: the free starter rocket must stay launchable
    if (state.credits - f.part.cost < reserve) return { ok: false, msg: `Blocked: after buying ${f.part.name} you would have ${Math.floor(state.credits - f.part.cost)} credits, below the ${reserve} credits needed to launch even the free starter rocket. Earn more credits first.` };
    state.credits -= f.part.cost; state.owned.push(id);
    emit(); return { ok: true, msg: `Purchased ${f.part.name} for ${f.part.cost} credits.` };
  },
  // Install an owned part (extras toggle). Replaces the part in the same slot.
  install(id) {
    const f = findPart(id); if (!f) return { ok: false, msg: 'Unknown part.' };
    if (!state.owned.includes(id)) return { ok: false, msg: 'Purchase this part first.' };
    if (f.slot === 'extras') {
      const i = state.loadout.extras.indexOf(id);
      if (i >= 0) state.loadout.extras.splice(i, 1); else state.loadout.extras.push(id);
      emit(); return { ok: true, msg: i >= 0 ? `Removed ${f.part.name}.` : `Installed ${f.part.name}.` };
    }
    state.loadout[f.slot] = id; emit(); return { ok: true, msg: `Installed ${f.part.name}.` };
  },
  // Sell back an owned, non-starter part for 80% of its price. If it is installed, the free starter part of that slot takes its place.
  sell(id) {
    const f = findPart(id); if (!f) return { ok: false, msg: 'Unknown part.' };
    if (!state.owned.includes(id)) return { ok: false, msg: 'You do not own this part.' };
    if (f.part.owned || !f.part.cost) return { ok: false, msg: 'Starter parts are free and cannot be sold.' };
    const refund = Math.round(f.part.cost * 0.8);
    if (f.slot === 'extras') state.loadout.extras = state.loadout.extras.filter(x => x !== id);
    else if (state.loadout[f.slot] === id) state.loadout[f.slot] = defaultLoadout()[f.slot];
    state.owned = state.owned.filter(x => x !== id); state.credits += refund; emit();
    return { ok: true, msg: `Sold ${f.part.name} for ${refund} credits (80% of ${f.part.cost}).`, refund };
  },
  // Apply a whole loadout at once (only owned parts are accepted). Used by the Build Advisor.
  setLoadout(l) {
    const ids = [l.engines, l.tanks, l.structures, l.boosters, l.upperStages, l.payloads, ...(l.extras || [])];
    if (ids.some(id => !state.owned.includes(id))) return { ok: false, msg: 'Some parts of this build are not owned yet.' };
    state.loadout = { engines: l.engines, tanks: l.tanks, structures: l.structures, boosters: l.boosters, upperStages: l.upperStages, payloads: l.payloads, extras: [...(l.extras || [])] }; emit(); return { ok: true, msg: 'Build installed.' };
  },
  selectMission(id) { const m = getMission(id); if (m && isUnlocked(m, state.completed)) { state.selectedMission = id; emit(); return true; } return false; },

  // Launch fee is paid when the countdown starts. Returns false if unaffordable.
  payLaunchFee() {
    const fee = analyse(state.loadout).launchCost;
    if (state.credits < fee) return { ok: false, fee };
    state.credits -= fee; emit(); return { ok: true, fee };
  },

  // Finalise a flight: compute rewards ONLY from the real outcome.
  recordFlight(flight, extra) {
    // Rewards and reports are created exactly once per flight, whatever the UI does (reload, re-open, double call).
    if (flight.uid && state.rewardedFlights.includes(flight.uid)) { const prev = state.reports.find(r => r.flightUid === flight.uid); if (prev) return prev; }
    const m = flight.mission, out = flight.outcome || { success: false, cause: 'Mission ended.' };
    const a = flight.an;
    const before = { credits: state.credits, gems: state.gems };
    const rewards = { credits: 0, gems: 0, lines: [] };
    if (out.success) {
      const first = !state.completed.includes(m.id);
      const base = first ? m.reward.credits : Math.round(m.reward.credits * 0.4);
      rewards.credits += base; rewards.lines.push(first ? `Mission reward (first completion): +${base} credits` : `Repeat mission reward (40%): +${base} credits`);
      if (!flight.usedAutopilot) { const mb = Math.round(base * 0.10); rewards.credits += mb; rewards.lines.push(`Manual-pilot bonus (no autopilot used): +${mb} credits`); }
      const eff = flight.fuelPercent();
      if (eff >= 0.15) { const b = Math.round(base * 0.15); rewards.credits += b; rewards.lines.push(`Efficiency bonus (≥15% propellant remaining): +${b} credits`); }
      if (first) { rewards.gems += m.reward.gems; rewards.lines.push(`First-completion science gems: +${m.reward.gems}`); state.completed.push(m.id); }
      if (eff >= 0.25 && !state.gemBonusFor.includes(m.id) && m.difficulty >= 3) { state.gemBonusFor.push(m.id); rewards.gems += 1; rewards.lines.push('Frugal flight (≥25% propellant left on a difficulty 3+ mission): +1 science gem'); }
    } else rewards.lines.push('No reward: the objective was not completed.');
    state.credits += rewards.credits; state.gems += rewards.gems;
    // Documented recovery rule: never leave the player unable to pay the cheapest launch fee.
    if (state.credits < MIN_STIPEND_FLOOR) { const s = MIN_STIPEND_FLOOR - state.credits; state.credits += s; rewards.credits += s; rewards.lines.push(`Agency recovery stipend: +${Math.round(s)} credits (guarantees you can always afford a launch)`); }
    const report = {
      id: Date.now(), at: new Date().toISOString(), mission: m.id, missionName: m.name, objective: m.objective,
      success: out.success, cause: out.cause, duration: flight.t, maxAlt: flight.maxAlt, maxSpeed: flight.maxSpeed, maxQ: flight.maxQ,
      flightUid: flight.uid, assisted: !!flight.usedAutopilot, loadoutSnapshot: flight.loadoutSnapshot ? JSON.parse(JSON.stringify(flight.loadoutSnapshot)) : undefined,
      missionConfig: { requiredDv: m.requiredDv, captureDv: m.captureDv, descentDv: m.descentDv, difficulty: m.difficulty },
      vehicle: describeLoadout(flight.loadoutSnapshot || state.loadout), analysis: { m0: a.m0, thrust0: a.thrust0, twr: a.twr, dv: a.dv },
      resourcesBefore: { credits: before.credits + (extra?.fee || 0), gems: before.gems }, fee: extra?.fee || 0,
      resourcesAfter: { credits: state.credits, gems: state.gems }, rewards,
      fuelRemainingPct: flight.fuelPercent() * 100, decisions: flight.decisions.slice(0, 40), events: flight.events.slice(-40),
      recommendations: recommend(flight, out),
    };
    if (flight.uid) { state.rewardedFlights.unshift(flight.uid); state.rewardedFlights = state.rewardedFlights.slice(0, 100); }
    state.reports.unshift(report); state.reports = state.reports.slice(0, 25);
    emit(); return report;
  },

  buyRecord(id, cost) {
    if (state.records.includes(id)) return { ok: false, msg: 'Record already unlocked.' };
    if (state.gems < cost) return { ok: false, msg: `Not enough Science Gems: this record costs ${cost}, you have ${state.gems}.` };
    state.gems -= cost; state.records.push(id); state.explorer.recordDates[id] = new Date().toISOString(); emit(); return { ok: true, msg: `Record unlocked for ${cost} Science Gems.` };
  },
  solveDiscovery(id) {
    if (state.discoveries.includes(id)) return { ok: true, gems: 0 };
    state.discoveries.push(id); state.explorer.discoveryDates[id] = new Date().toISOString(); state.gems += 1; emit(); return { ok: true, gems: 1 };
  },
  // Explorer Log: which record was played / last examined, and at which time step (local to this browser).
  noteRecordPlayed(id, step, label) { if (!state.explorer.played.includes(id)) state.explorer.played.push(id); state.explorer.last = { id, step: Number.isInteger(step) ? step : 0, label: String(label || '').slice(0, 40), at: new Date().toISOString() }; emit(); },
  noteExamined(id, step, label) { state.explorer.last = { id, step: Number.isInteger(step) ? step : 0, label: String(label || '').slice(0, 40), at: new Date().toISOString() }; save(); },
  takeNewBadges() { const r = newBadges; newBadges = []; return r; },
  markTutorial() { state.tutorialDone = true; emit(); },
  reset() { state = fresh(); newBadges = []; emit(); },
};

export function describeLoadout(l) {
  const n = (slot, id) => PARTS[slot].find(p => p.id === id)?.name;
  return {
    Engine: n('engines', l.engines), Tank: n('tanks', l.tanks), Structure: n('structures', l.structures),
    Boosters: n('boosters', l.boosters), 'Upper stage': n('upperStages', l.upperStages), Payload: n('payloads', l.payloads),
    Extras: (l.extras || []).map(id => n('extras', id)).join(', ') || 'None',
  };
}

function recommend(flight, out) {
  const r = [], a = flight.an, m = flight.mission;
  if (out.success) {
    if (flight.fuelPercent() < 0.1) r.push('The margin was very thin. A larger tank or a more efficient engine would make this mission more repeatable.');
    const next = MISSIONS[m.index + 1]; if (next) r.push(`Next objective: ${next.name}. Review its payload and delta-v requirement (${next.requiredDv} m/s) in the Engineering Lab before buying parts.`);
    r.push('Try an Earth-science record in the Jukebox: Earth-observation missions exist to produce datasets like these.');
    return r;
  }
  if (a.twr < 1.3) r.push('Increase thrust-to-weight ratio: a stronger engine or boosters give faster, safer lift-off.');
  if (a.dv < m.requiredDv) r.push(`Raise estimated delta-v from ${Math.round(a.dv)} m/s towards ${m.requiredDv} m/s: add propellant capacity, a more efficient engine, or an upper stage.`);
  if (flight.breakup === 'maxq') r.push('Reduce throttle between roughly 8 and 14 km (high dynamic pressure), keep the Max-Q limiter enabled, or use a stronger structure.');
  if (a.hasBoosters && flight.boostersAttached) r.push('Separate spent boosters promptly: they are dead mass once empty.');
  if (a.hasUpper && flight.stage === 'core') r.push('Separate the core stage when it is empty so the upper stage does not carry dead mass.');
  if (m.id !== 'sounding') r.push('Start the pitch-over at about 1 km altitude and use prograde hold. Burn horizontally to raise periapsis above 150 km.');
  r.push('Check the pre-launch analysis panel: every blocking item must be cleared and warnings reviewed.');
  return r;
}
