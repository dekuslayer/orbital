// ORBITAL — application shell: navigation, UI, and wiring between simulation, 3D views and the jukebox.
import { store, describeLoadout, BADGES } from './state.js';
import { PARTS, SLOT_ORDER, SLOT_LABEL, findPart, defaultLoadout } from './parts.js';
import { MISSIONS, getMission, isUnlocked, WORLD } from './missions.js';
import { analyse, checkFeasibility, launchFee, ADVISOR_MARGIN } from './vehicle.js';
import { verifiedBuild } from './advisor.js';
import { Autopilot, transferWindow } from './autopilot.js';
import { Flight } from './flight.js';
import { beginLaunch } from './launch.js';
import { RECORDS, getRecord, loadRecordData as loadRecordDataStatic, discoveryFor, statusLabel } from './records.js';
import { loadRecordLive } from './nasaLive.js';
// Jukebox + Science Lab read live NASA EONET/POWER data first; the static loader is only the labelled offline fallback.
const loadRecordData = rec => loadRecordLive(rec, loadRecordDataStatic);
import { Sonifier } from './audio.js';
import { drawChart } from './chart.js';
import { FlightView } from './scenes/flightScene.js';
import { FlightView2D } from './scenes/flightScene2d.js';
import { LabView } from './scenes/labScene.js';
import { JukeboxView } from './scenes/jukeboxScene.js';
import { Landing } from './landing.js';
import { TOUR, HELP_TOPICS, helpHtml } from './guide.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NAV = [['home', 'Start'], ['control', 'Mission Control'], ['lab', 'Engineering Lab'], ['flight', 'Flight'], ['map', 'Mission Map'], ['juke', 'Earth Jukebox'], ['science', 'Science Lab'], ['reports', 'Reports']];

const S = { jukeClean: (() => { try { return localStorage.getItem('orbital.jukeclean') === '1'; } catch (e) { return false; } })(), view: null, lab: null, fview: null, juke: null, sonifier: null, fc: null, warp: 1, labTab: 'engines', jukeSel: null, jukeToken: 0, jukeData: null, jukeLoaded: null, voices: 'both', last: 0, glFail: {} };
const fmtN = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '∞';
const fmtLen = m => !Number.isFinite(m) ? '∞' : Math.abs(m) >= 10000 ? fmtN(m / 1000, 1) + ' km' : fmtN(m, 0) + ' m';
const fmtT = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 4800); }
function modal(html, onClose) { const m = $('#modal'); $('#modalBody').innerHTML = html; m.classList.add('on'); m._onClose = onClose; const f = m.querySelector('[data-close]'); if (f) f.focus(); }
function closeModal() { const m = $('#modal'); m.classList.remove('on'); const cb = m._onClose; m._onClose = null; if (cb) cb(); }
function confirmBox(title, text, yes, cb) { modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn danger" id="cbY">${esc(yes)}</button><button class="btn" data-close>Cancel</button></div>`); $('#cbY').onclick = () => { closeModal(); cb(); }; }
document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').classList.contains('on')) closeModal(); });

function noGL(canvas, err) { console.error(err); const d = document.createElement('div'); d.className = 'nogl'; d.innerHTML = `<div><h3>3D graphics are unavailable</h3><p>${esc(err && err.message || err)}</p><p>Enable WebGL / hardware acceleration in your browser. All game logic still works.</p></div>`; canvas.parentElement.appendChild(d); S.glFail[canvas.id] = true; }

// ====================== wallet ======================
let lastWallet = { c: null, g: null };
function updateWallet() { updateCoach(); const s = store.get(); $('#vCr').textContent = fmtN(Math.floor(s.credits)); $('#vGm').textContent = fmtN(s.gems); if (lastWallet.c !== null && lastWallet.c !== Math.floor(s.credits)) bump('#chipCr'); if (lastWallet.g !== null && lastWallet.g !== s.gems) bump('#chipGm'); lastWallet = { c: Math.floor(s.credits), g: s.gems }; }
function bump(sel) { const e = $(sel); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }

// ====================== navigation ======================
const NAV_ICON = {
  home: '<path d="M3 11.5 12 4l9 7.5M6 10v10h4.5v-6h3v6H18V10"/>', control: '<rect x="3.5" y="4" width="17" height="13" rx="1.5"/><path d="M8 21h8M12 17v4M7 9l3 3 2-2 4 4"/>',
  lab: '<path d="M12 3c2.5 2.5 3.5 6 3.5 9.5L12 21l-3.5-8.5C8.5 9 9.5 5.5 12 3Z"/><circle cx="12" cy="10" r="1.6"/><path d="M8.5 15 5 18l2.5.5M15.5 15 19 18l-2.5.5"/>',
  flight: '<path d="M4 20 20 4M20 4h-8M20 4v8"/><path d="M4 14l4 2M10 20l-2-4"/>', map: '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.6" ry="8.5"/><path d="M3.5 12h17"/>',
  juke: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 3.5v3M20.5 12h-3"/>', science: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7.5 15h9"/>',
  reports: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>' };
function buildNav() { $('#rail').innerHTML = NAV.map(([id, t], i) => `<button data-nav="${id}" aria-label="${t}"><svg class="ni" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICON[id] || ''}</svg><span class="t">${t}</span></button>`).join(''); $('#rail').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) show(b.dataset.nav); }); }
function show(view) {
  const prev = S.view; if (prev === view) return;
  if (prev === 'juke') stopJuke(true);
  if (prev === 'home' && S.landing) S.landing.stop();
  S.view = view; document.body.dataset.view = view; clearTourHl();
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  document.querySelectorAll('#rail button').forEach(b => b.setAttribute('aria-current', b.dataset.nav === view ? 'page' : 'false'));
  if (view === 'home') renderHome(); if (view === 'control') renderControl(); if (view === 'map') renderMap(); if (view === 'science') renderScience(); if (view === 'reports') renderReports();
  if (view === 'lab') { ensureLab(); renderLab(); } if (view === 'flight') { ensureFlightView(); renderFlightIdle(); } if (view === 'juke') { ensureJuke(); renderJukeSide(); renderDeck(); }
  updateCoach(); requestAnimationFrame(resizeAll);
}
function resizeAll() { S.landing && S.landing.resize(); S.lab && S.lab.resize(); S.fview && S.fview.resize(); S.juke && S.juke.resize(); }
window.addEventListener('resize', () => { resizeAll(); updateSafe(true); });


// ====================== HOME (landing page) ======================
function renderHome() {
  const s = store.get(), first = s.reports.length === 0;
  $('#v-home').innerHTML = `
  <section class="hero2"><canvas id="heroCanvas" aria-hidden="true"></canvas>
    <div class="copy"><div class="eyebrow">An independent space-science game</div>
      <h1>Engineer the rocket.<br><em>Spin the planet.</em></h1>
      <p class="lead">Design a 3D rocket from real engineering trade-offs, fly it from the launchpad to the Moon, then spend what you earn on vinyl records that project a living hologram of Earth, shaped by Earth-science data and played back as sound.</p>
      <div class="cta-row" id="heroCtas"><button class="btn go xl" data-home="launch">▶ ${first ? 'Fly your first mission' : 'Continue the campaign'}</button><button class="btn primary xl" data-home="juke">♫ Play an Earth record</button><button class="btn ghost xl ${s.tutorialDone ? '' : 'pulse'}" data-home="tour">New here? 60-second tour</button></div>
      <p class="dim" style="margin-top:16px;font-size:12.5px">No shopping needed to start: your free starter rocket can fly the first mission.</p></div>
    <div class="ticker"><div><b>${fmtN(Math.floor(s.credits))}</b><span>Credits</span></div><div><b>${fmtN(s.gems)}</b><span>Science Gems</span></div><div><b>${s.completed.length} / ${MISSIONS.length}</b><span>Missions complete</span></div><div><b>${s.records.length} / ${RECORDS.length}</b><span>Records unlocked</span></div></div></section>
  <section class="sec"><h2 class="big">TWO WORLDS · ONE ACCOUNT</h2><h3 class="xl">Missions earn the gems. Gems unlock the Earth.</h3>
    <div class="worlds"><div class="world a"><div class="num">WORLD 01 · SPACE MISSION DESIGN</div><h4>Build it. Check it. Launch it.</h4><p class="dim">You are the chief engineer. Every part has a price, a mass and a purpose, and the numbers are computed with the real rocket equation.</p>
        <ul><li>3D rocket that visibly changes with every part</li><li>Continuous launch: pad → clouds → space → Moon</li><li>Throttle, pitch, staging, payload release, time warp</li><li>Honest failures with a mission report that says why</li></ul><div class="row"><button class="btn primary" data-home="lab">Open the Engineering Lab</button><button class="btn" data-home="map">See the campaign</button></div></div>
      <div class="world b"><div class="num">WORLD 02 · EARTH INFORMATION JUKEBOX</div><h4>Drop the needle on a planet.</h4><p class="dim">Six 3D vinyl records, each about a part of Earth's system. A hologram of Earth rises from the record and changes with its data.</p>
        <ul><li>Fire, ocean, storms, air, land and ice records</li><li>Hologram, chart and sound all driven by the same numbers</li><li>Click any month to hear it; answer discovery questions</li><li>Sources and honesty labels for every dataset</li></ul><div class="row"><button class="btn primary" data-home="juke">Open the Jukebox</button><button class="btn" data-home="science">Read the sources</button></div></div></div></section>
  <section class="sec"><h2 class="big">HOW IT WORKS</h2><h3 class="xl">Five steps, always the same loop</h3>
    <div class="flow"><div><b>Pick</b><span>Choose a mission. Missions unlock in order, each harder than the last.</span></div><div><b>Build</b><span>Buy and install parts. The pre-launch check tells you exactly what is missing.</span></div><div><b>Fly</b><span>Countdown, liftoff, gravity turn, staging, deploy. Your decisions matter.</span></div><div><b>Earn</b><span>Credits buy parts. Science Gems come from first completions and discoveries.</span></div><div><b>Listen</b><span>Spend gems on records and explore Earth's data as light and sound.</span></div></div></section>
  <section class="sec"><h2 class="big">MONEY, EXPLAINED</h2><h3 class="xl">You can never get stuck</h3>
    <div class="money3"><div class="panel"><h2>Credits</h2><div class="big" style="color:var(--amber)">Parts + launch fee</div><p class="dim">Earned from missions. Parts are bought once and kept. Every launch costs a fee (starter rocket: ${launchFee(defaultLoadout())} credits).</p></div>
      <div class="panel"><h2>Science Gems</h2><div class="big" style="color:var(--cyan)">Unlock records</div><p class="dim">Earned from first mission completions, frugal flights and discovery questions. Enough exist to unlock every record.</p></div>
      <div class="panel"><h2>Safety nets</h2><div class="big" style="color:var(--green)">Always a way forward</div><p class="dim">Purchases that would strand you are blocked, parts sell back for 80%, starter parts are free forever, missions can be replayed.</p></div></div>
    <div class="cta-row" style="margin:18px 0 40px"><button class="btn primary" data-home="help">Read the full money guide</button><button class="btn" data-home="control">Go to Mission Control</button></div>
    <p class="dim" style="font-size:12px;padding-bottom:30px">ORBITAL is an independent educational project and is not affiliated with or endorsed by NASA.</p></section>`;
  $('#v-home').onclick = e => { const b = e.target.closest('[data-home]'); if (!b) return; const a = b.dataset.home; if (a === 'launch') goToPad(); else if (a === 'tour') startTour(); else if (a === 'help') openHelp('money'); else show(a); };
  if (S.landing) S.landing.stop(); S.landing = new Landing($('#heroCanvas'), REDUCED); S.landing.start();
}

// ====================== COACH BAR (always tells the user the next useful step) ======================
// Flight-tested build advice is computed lazily (it simulates candidate rockets) and cached per mission + owned parts.
const ADV = new Map();
function getAdvice(m) {
  const k = m.id + '|' + store.get().owned.slice().sort().join(',');
  if (ADV.has(k)) return ADV.get(k);
  ADV.set(k, 'pending');
  setTimeout(() => { try { ADV.set(k, verifiedBuild(store.get().owned, m)); } catch (e) { console.error(e); ADV.set(k, null); } if (S.view === 'lab') renderLab(); else if (S.view === 'control') renderControl(); }, 40);
  return 'pending';
}
function coachMsg() {
  const s = store.get(), m = getMission(s.selectedMission), chk = checkFeasibility(s.loadout, m, s.credits);
  const locked = RECORDS.filter(r => !s.records.includes(r.id)).sort((a, b) => a.cost - b.cost)[0];
  const nextM = MISSIONS.find(x => !s.completed.includes(x.id));
  if (!s.reports.length) return { t: 'Your free starter rocket can already fly <b>Kármán Sounding</b>. No shopping needed.', btn: 'Launch it', act: 'launch' };
  if (locked && s.gems >= locked.cost) return { t: `You have <b>${s.gems} Science Gems</b>: enough to unlock <b>${esc(locked.title)}</b> in the Jukebox.`, btn: 'Open Jukebox', act: 'juke' };
  if (!nextM) return { t: locked ? `Campaign complete! Earn ${locked.cost - s.gems} more gems (discovery questions) for the next record.` : 'Campaign complete and every record unlocked. Replay missions or read the sources.', btn: locked ? 'Open Jukebox' : 'Science Lab', act: locked ? 'juke' : 'science' };
  if (s.selectedMission !== nextM.id && isUnlocked(nextM, s.completed)) return { t: `Next objective: <b>${esc(nextM.name)}</b>. Select it to see what it needs.`, btn: 'Select mission', act: 'select:' + nextM.id };
  if (!chk.canLaunch) return { t: `Your rocket cannot fly <b>${esc(m.name)}</b> yet. The Build Advisor lists the cheapest fix.`, btn: 'Open Lab', act: 'lab' };
  return { t: `Your rocket is ready for <b>${esc(m.name)}</b>.`, btn: 'Launch', act: 'launch' };
}
function updateCoach() {
  const el = $('#coach'), main = document.querySelector('main'); if (!el) return;
  // Only on the text-style screens; never over the 3D scenes (lab, flight, jukebox) or the landing page.
  const hide = ['home', 'flight', 'juke', 'lab'].includes(S.view) || !S.view;
  if (hide) { el.hidden = true; main.classList.remove('coach-on'); return; }
  const c = coachMsg(); el.hidden = false; main.classList.toggle('coach-on', !S.coachMin); el.classList.toggle('min', !!S.coachMin);
  el.innerHTML = S.coachMin ? `<button class="btn sm" data-coachmin="0" aria-label="Show the next-step guide">NEXT STEP ▸</button>` : `<b class="lbl">NEXT STEP</b><span>${c.t}</span><button class="btn sm primary" data-coach="${c.act}">${c.btn}</button><button class="btn sm" data-help="start" aria-label="Open the help center">?</button><button class="btn sm" data-coachmin="1" aria-label="Hide this guide" title="Hide">–</button>`;
}
$('#coach').addEventListener('click', e => { const mn = e.target.closest('[data-coachmin]'); if (mn) { S.coachMin = mn.dataset.coachmin === '1'; updateCoach(); return; } const b = e.target.closest('[data-coach]'); if (!b) return; const a = b.dataset.coach; if (a === 'launch') goToPad(); else if (a.startsWith('select:')) { store.selectMission(a.slice(7)); show('control'); renderControl(); } else show(a); });

// ====================== GUIDED TOUR + HELP CENTER ======================
let tourI = -1;
function clearTourHl() { document.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl')); }
function startTour() { closeModal(); tourI = 0; renderTour(); }
function endTour() { tourI = -1; clearTourHl(); const t = $('#tourCard'); if (t) t.remove(); store.markTutorial(); }
function renderTour() {
  const st = TOUR[tourI]; if (!st) return endTour();
  if (S.view !== st.view) show(st.view); clearTourHl();
  let card = $('#tourCard'); if (!card) { card = document.createElement('div'); card.id = 'tourCard'; card.className = 'tour'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Guided tour'); document.body.appendChild(card); }
  card.innerHTML = `<div class="dots">${TOUR.map((_, i) => `<i class="${i <= tourI ? 'on' : ''}"></i>`).join('')}</div><div class="mono dim" style="font-size:10px;letter-spacing:.2em">STEP ${tourI + 1} OF ${TOUR.length}</div><h3>${st.title}</h3><p>${st.text}</p><div class="row"><button class="btn sm" data-tour="back" ${tourI === 0 ? 'disabled' : ''}>◂ Back</button><button class="btn sm primary" data-tour="next">${tourI === TOUR.length - 1 ? 'Finish ✓' : 'Next ▸'}</button><span class="spacer"></span><button class="btn sm" data-tour="skip">Skip tour</button></div>`;
  setTimeout(() => { const el = st.sel && document.querySelector(st.sel); if (el) { el.classList.add('tour-hl'); try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignore */ } } }, 150);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (!b) return; const a = b.dataset.tour; if (a === 'next') { tourI++; renderTour(); } else if (a === 'back') { tourI = Math.max(0, tourI - 1); renderTour(); } else endTour(); });
function openHelp(topic = 'start') {
  modal(`<div class="row" style="justify-content:space-between"><h1 style="margin:0">Help Center</h1><button class="btn" data-close>Close</button></div><div class="helpnav" role="tablist">${HELP_TOPICS.map(([k, t]) => `<button class="btn sm ${k === topic ? 'on' : ''}" role="tab" aria-selected="${k === topic}" data-helptab="${k}">${t}</button>`).join('')}<button class="btn sm primary" data-tour="restart">▶ Guided tour</button></div>${helpHtml(topic)}`);
  $('#modal').querySelector('.panel').scrollTop = 0;
}
document.addEventListener('click', e => { const h = e.target.closest('[data-help]'); if (h) { openHelp(h.dataset.help === 'start' ? 'start' : h.dataset.help); return; } const t = e.target.closest('[data-helptab]'); if (t) openHelp(t.dataset.helptab); const r = e.target.closest('[data-tour="restart"]'); if (r) startTour(); });
$('#btnHelp').onclick = () => openHelp('start'); $('#btnTour').onclick = () => startTour();

// ====================== PURCHASE FLOW (every purchase is explained first) ======================
const cmp = (label, a, b, fmt, higherBetter) => { const d = b - a; const cls = Math.abs(d) < 1e-9 ? '' : ((d > 0) === higherBetter ? 'good-t' : 'bad-t'); return `<tr><td>${label}</td><td class="num">${fmt(a)}</td><td class="num ${cls}">${fmt(b)}</td></tr>`; };
function askBuy(id) {
  const s = store.get(), f = findPart(id), p = f.part, m = getMission(s.selectedMission), reserve = launchFee(defaultLoadout()), after = s.credits - p.cost;
  const L = JSON.parse(JSON.stringify(s.loadout)); if (f.slot === 'extras') { if (!L.extras.includes(id)) L.extras.push(id); } else L[f.slot] = id;
  const A0 = analyse(s.loadout), A1 = analyse(L), C0 = checkFeasibility(s.loadout, m), C1 = checkFeasibility(L, m);
  const b0 = C0.findings.filter(x => x.sev === 'block').length, b1 = C1.findings.filter(x => x.sev === 'block').length;
  const rec0a = getAdvice(m), rec = rec0a === 'pending' ? null : rec0a, inRec = rec && rec.parts.some(x => x.id === id), blocked = after < reserve, cantFly = !blocked && after < A1.launchCost;
  const notes = [];
  if (blocked) notes.push(['block', `BLOCKED: you would have ${fmtN(Math.floor(after))} credits left, less than the ${reserve} credits needed to launch even the free starter rocket. Earn more credits first (fly a mission) or choose a cheaper part.`]);
  if (cantFly) notes.push(['warn', `After this purchase you could not pay the ${fmtN(A1.launchCost)}-credit launch fee of the upgraded rocket. You can still fly the free starter parts and earn more first.`]);
  if (inRec) notes.push(['ok', `Recommended: the Build Advisor includes this part in the cheapest route to "${m.name}".`]);
  else if (rec && rec.buy > 0) notes.push(['warn', `Not part of the cheapest route for "${m.name}". The advisor would buy: ${rec.parts.map(x => x.name).join(', ')} (${fmtN(rec.buy)} credits).`]);
  if (A1.dv < A0.dv - 1) notes.push(['warn', 'This part lowers your estimated delta-v (it adds weight without adding propellant or efficiency).']);
  if (f.slot === 'payloads' && p.capability !== m.requiredPayload) notes.push(['warn', `The "${m.name}" mission needs the "${m.requiredPayloadName}" payload; this one is for a different mission.`]);
  modal(`<div class="row" style="justify-content:space-between"><h2 style="margin:0">Buy ${esc(p.name)}?</h2><button class="btn" data-close>Cancel</button></div><p class="dim">${esc(p.desc)}</p>
    <table class="compare"><tr><th></th><th>Now</th><th>After</th></tr><tr><td>Your credits</td><td class="num">${fmtN(Math.floor(s.credits))}</td><td class="num ${after < reserve ? 'bad-t' : ''}">${fmtN(Math.floor(after))}</td></tr><tr><td>Price</td><td></td><td class="num warn-t">−${fmtN(p.cost)}</td></tr></table>
    <h2 style="margin-top:14px">Effect on your rocket if installed (mission: ${esc(m.name)})</h2><table class="compare"><tr><th></th><th>Now</th><th>With this part</th></tr>${cmp('Liftoff mass (kg)', A0.m0, A1.m0, fmtN, false)}${cmp('Thrust / weight', A0.twr, A1.twr, v => v.toFixed(2), true)}${cmp('Delta-v (m/s)', A0.dv, A1.dv, fmtN, true)}${cmp('Launch fee (credits)', A0.launchCost, A1.launchCost, fmtN, false)}${cmp('Blocking issues', b0, b1, fmtN, false)}</table>
    ${notes.map(([k, t]) => `<div class="finding ${k}" style="margin-top:8px"><b>${k === 'block' ? 'BLOCKED' : k === 'warn' ? 'NOTE' : 'GOOD'}</b>${esc(t)}</div>`).join('')}
    <p class="dim" style="font-size:12.5px;margin-top:10px">Parts are bought once and kept forever. You can swap owned parts for free and sell this one back later for ${fmtN(Math.round(p.cost * 0.8))} credits (80%).</p>
    <div class="row" style="margin-top:12px"><button class="btn primary" id="bxInst" ${blocked ? 'disabled' : ''}>Buy &amp; install</button><button class="btn" id="bxOnly" ${blocked ? 'disabled' : ''}>Buy only (keep in storage)</button><button class="btn" data-close>Cancel</button></div>`);
  const done = inst => { const r = store.buy(id); toast(r.msg, r.ok ? 'good' : 'bad'); if (r.ok && inst) { const ri = store.install(id); if (ri.ok) toast(ri.msg, 'good'); } closeModal(); if (S.lab) { S.lab.setLoadout(store.get().loadout, true); S.lab.highlight(S.selComp); } renderLab(); };
  if (!blocked) { $('#bxInst').onclick = () => done(true); $('#bxOnly').onclick = () => done(false); }
}
function askSell(id) {
  const f = findPart(id), p = f.part, refund = Math.round(p.cost * 0.8), inst = store.isInstalled(id);
  modal(`<h2>Sell ${esc(p.name)}?</h2><p>You get <b class="warn-t">+${fmtN(refund)} credits</b> (80% of ${fmtN(p.cost)}). You will have to buy it again if you want it back.${inst ? ' It is installed, so the free starter part for that slot is installed instead.' : ''}</p><div class="row"><button class="btn danger" id="bsY">Sell for ${fmtN(refund)}</button><button class="btn" data-close>Keep it</button></div>`);
  $('#bsY').onclick = () => { const r = store.sell(id); toast(r.msg, r.ok ? 'good' : 'bad'); closeModal(); if (S.lab) { S.lab.setLoadout(store.get().loadout, true); S.lab.highlight(S.selComp); } renderLab(); };
}
function advisorHtml(m) {
  const s = store.get(), chk = checkFeasibility(s.loadout, m, s.credits), rec = getAdvice(m);
  if (rec === 'pending') return '<p class="dim">Flight-testing candidate builds in the simulator…</p>';
  if (!rec) return '<p class="dim">The advisor could not find a catalogue build that completes this mission with the assist autopilot. You can still try your own design.</p>';
  const margin = chk.analysis.dv / m.requiredDv;
  if (chk.canLaunch && margin >= ADVISOR_MARGIN) return `<div class="finding ok"><b>READY</b>Your current rocket passes every blocking check for "${esc(m.name)}" with a healthy delta-v margin (${Math.round((margin - 1) * 100)}%). You do not need to buy anything.</div>`;
  const aff = s.credits - rec.buy >= rec.fee, short = Math.ceil(rec.buy + rec.fee - s.credits);
  const lead = chk.canLaunch ? `<div class="finding warn"><b>THIN MARGIN</b>Your rocket passes the checks but only has ${Math.round((margin - 1) * 100)}% delta-v margin; real flights lose delta-v to gravity and drag.</div>` : '';
  return `${lead}<p style="font-size:13px">Cheapest <b>flight-tested</b> way to fly <b>${esc(m.name)}</b> with what you own (the advisor flew this build in the simulator and it completed the mission):</p><table><tr><th>Buy</th><th></th></tr>${rec.parts.length ? rec.parts.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${fmtN(x.cost)}</td></tr>`).join('') : '<tr><td colspan="2">Nothing: you own every part of this build already.</td></tr>'}<tr><td><b>Total</b></td><td class="num warn-t"><b>${fmtN(rec.buy)}</b></td></tr><tr><td>Launch fee for that rocket</td><td class="num">${fmtN(rec.fee)}</td></tr><tr><td>Credits left after buying and launching</td><td class="num ${aff ? 'good-t' : 'bad-t'}">${fmtN(Math.floor(s.credits - rec.buy - rec.fee))}</td></tr></table>
    ${aff ? `<button class="btn primary" data-act="advise" style="margin-top:8px">Buy &amp; install this build</button>` : `<div class="finding warn" style="margin-top:8px"><b>NOT YET</b>You are ${fmtN(short)} credits short. Replay an earlier mission (40% reward, plus a bonus for saving propellant) or buy the parts in smaller steps. Nothing is lost by waiting.</div>`}`;
}

// ====================== MISSION CONTROL ======================
function renderControl() {
  const s = store.get(), m = getMission(s.selectedMission), a = analyse(s.loadout), chk = checkFeasibility(s.loadout, m, s.credits);
  const done = s.completed.length;
  $('#v-control').innerHTML = `
  <div class="row" style="justify-content:space-between"><h1>Mission Control</h1><button class="btn sm" data-help="start">? How the game works</button></div><p class="sub">You are the chief engineer. Design a vehicle, check it against the mission requirements, launch it, and make decisions during flight. Every number comes from the simulation model described in the Science Lab.</p>
  <div class="hero">
    <div class="panel"><h2>Selected mission · ${esc(m.tag)}</h2><h1 style="font-size:30px">${esc(m.name)}</h1><div class="dim mono" style="margin-bottom:8px">${esc(m.destination)} · difficulty ${'●'.repeat(m.difficulty)}${'○'.repeat(5 - m.difficulty)}</div>
      <p>${esc(m.brief)}</p><p class="dim"><b>Why it matters:</b> ${esc(m.why)}</p>
      <h2 style="margin-top:12px">Objective</h2><p>${esc(m.objective)}</p>
      <ul style="margin:0 0 10px;padding-left:18px">${m.criteria.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <dl class="kv"><dt>Required Δv (model)</dt><dd>${fmtN(m.requiredDv)} m/s</dd><dt>Required payload</dt><dd>${esc(m.requiredPayloadName)}</dd><dt>Reward (first time)</dt><dd>${fmtN(m.reward.credits)} credits · ${m.reward.gems} gems</dd><dt>Launch fee (current vehicle)</dt><dd>${fmtN(a.launchCost)} credits</dd></dl>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-go="lab">Open Engineering Lab</button><button class="btn go" data-go="launch" ${chk.canLaunch ? '' : 'title="Resolve blocking issues in the Lab first"'}>Launch sequence ▸</button><button class="btn" data-go="map">Campaign map</button></div></div>
    <div class="panel"><h2>Current vehicle</h2><dl class="kv">${Object.entries(describeLoadout(s.loadout)).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <h2 style="margin-top:14px">Performance (model)</h2><div class="stat-grid">
      <div class="stat"><span>Liftoff mass</span><b>${fmtN(a.m0)}<small> kg</small></b></div><div class="stat ${a.twr < 1.15 ? 'bad' : a.twr < 1.4 ? 'warn' : 'good'}"><span>Thrust / weight</span><b>${a.twr.toFixed(2)}</b></div>
      <div class="stat ${a.dv < m.requiredDv ? 'bad' : 'good'}"><span>Estimated Δv</span><b>${fmtN(a.dv)}<small> m/s</small></b></div><div class="stat"><span>Burn time</span><b>${fmtN(a.totalBurn)}<small> s</small></b></div></div>
      <p class="${chk.canLaunch ? 'tag ok' : 'tag bad'}" style="margin-top:10px;display:inline-block">${chk.canLaunch ? 'Cleared for launch' : 'Not cleared: ' + chk.findings.filter(f => f.sev === 'block').length + ' blocking issue(s)'}</p></div>
  </div>
  <div class="panel" style="margin-bottom:16px"><h2>Shopping planner: what each mission costs you from here</h2><table><tr><th>Mission</th><th>Status</th><th>Cheapest upgrades</th><th>Cost</th><th>Affordable now?</th></tr>${MISSIONS.map(x => { const un = isUnlocked(x, s.completed), r0 = getAdvice(x), r = r0 === 'pending' ? undefined : r0; const aff = r && s.credits - r.buy >= r.fee; return `<tr><td>${esc(x.name)}</td><td>${s.completed.includes(x.id) ? '<span class="tag ok">done</span>' : un ? '<span class="tag">open</span>' : '<span class="tag lock">locked</span>'}</td><td style="font-size:12px">${r0 === 'pending' ? 'flight-testing builds…' : r ? (r.parts.length ? r.parts.map(y => esc(y.name)).join(', ') : 'nothing: your current parts are enough') : '—'}</td><td class="num">${r ? fmtN(r.buy) : '—'}</td><td>${r ? (aff ? '<span class="good-t">yes</span>' : '<span class="warn-t">not yet (' + fmtN(Math.ceil(r.buy + r.fee - s.credits)) + ' short)</span>') : '—'}</td></tr>`; }).join('')}</table><p class="dim" style="font-size:12px;margin:8px 0 0">Launch fees are included in the affordability check. Costs shrink as you buy parts, because owned parts are free to reuse.</p></div>
  <div class="grid2"><div class="panel"><h2>How a mission works</h2><ol style="margin:0;padding-left:20px"><li>Read the briefing and requirements.</li><li>Buy and install parts in the <b>Engineering Lab</b> (credits are deducted immediately).</li><li>Fix every blocking item in the feasibility check.</li><li>Launch. Control throttle and pitch, separate boosters/stages, deploy the payload at the right moment.</li><li>Read the mission report, collect rewards, and unlock the next destination.</li><li>Spend <b>Science Gems</b> on new records in the <b>Earth Jukebox</b>.</li></ol></div>
  <div class="panel"><h2>Progress</h2><dl class="kv"><dt>Missions completed</dt><dd>${done} / ${MISSIONS.length}</dd><dt>Records unlocked</dt><dd>${s.records.length} / ${RECORDS.length}</dd><dt>Discoveries solved</dt><dd>${s.discoveries.length} / ${RECORDS.length}</dd><dt>Flights logged</dt><dd>${s.reports.length}</dd></dl><p class="dim" style="font-size:12px;margin-top:10px">ORBITAL is an independent educational project. The rocket simulation is a simplified game model on a scaled-down Earth–Moon system. It is not a NASA product and not flight-planning software.</p></div></div>`;
  $('#v-control').onclick = e => { const b = e.target.closest('[data-go]'); if (!b) return; const g = b.dataset.go; if (g === 'launch') { goToPad(); } else show(g); };
}

// ====================== MISSION MAP ======================
function renderMap() {
  const s = store.get();
  const svg = `<svg viewBox="0 0 900 260" width="100%" role="img" aria-label="Schematic of the campaign: Earth, low orbit, high orbit, the Moon and the escape trajectory" style="background:#050a16;border:1px solid var(--rule)">
  <defs><radialGradient id="eg" cx="40%" cy="35%"><stop offset="0" stop-color="#5cc8ff"/><stop offset="1" stop-color="#0b3a73"/></radialGradient></defs>
  <circle cx="120" cy="130" r="48" fill="url(#eg)"/><circle cx="120" cy="130" r="58" fill="none" stroke="#3be3ff" stroke-opacity=".25"/>
  ${[['sounding', 78, 'Sounding'], ['leo', 98, 'LEO'], ['transfer', 150, 'High orbit']].map(([id, r, t]) => `<circle cx="120" cy="130" r="${r}" fill="none" stroke="${s.completed.includes(id) ? '#5dffa8' : '#2a4170'}" stroke-dasharray="${id === 'sounding' ? '3 5' : '0'}"/><text x="${120 + r * .72}" y="${130 - r * .72}" fill="#8fa4cc" font-size="11" font-family="monospace">${t}</text>`).join('')}
  <path d="M170 128 C 350 40, 560 40, 770 128" fill="none" stroke="${s.completed.includes('lunar-orbit') ? '#5dffa8' : '#3be3ff'}" stroke-width="2" stroke-dasharray="6 5"/>
  <circle cx="790" cy="130" r="22" fill="#9a9a9a"/><circle cx="790" cy="130" r="34" fill="none" stroke="${s.completed.includes('lunar-land') ? '#5dffa8' : '#2a4170'}"/><text x="760" y="190" fill="#8fa4cc" font-size="11" font-family="monospace">Moon (scaled)</text>
  <path d="M190 100 C 420 20, 700 20, 880 20" fill="none" stroke="${s.completed.includes('deep') ? '#5dffa8' : '#ff3fb4'}" stroke-dasharray="2 6"/><text x="700" y="14" fill="#ff7fd0" font-size="11" font-family="monospace">Escape trajectory → deep space</text></svg>`;
  $('#v-map').innerHTML = `<div class="row" style="justify-content:space-between"><h1>Mission Map</h1><button class="btn sm" data-help="flight">? How flights work</button></div><p class="sub">Each destination unlocks only after the previous one is completed. Later missions need larger vehicles and specific payloads, so a starter rocket cannot reach the Moon.</p>
  <div class="panel">${svg}<div class="campaign" style="margin-top:14px">${MISSIONS.map((m, i) => { const un = isUnlocked(m, s.completed), dn = s.completed.includes(m.id); return `<button class="node ${dn ? 'done' : ''} ${s.selectedMission === m.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-m="${m.id}" aria-label="${esc(m.name)} ${dn ? 'completed' : un ? 'available' : 'locked'}"><span class="dot">${dn ? '✓' : un ? i + 1 : '🔒'}</span><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.tag)}</div></button>`; }).join('')}</div></div>
  <div class="grid3" style="margin-top:14px">${MISSIONS.map(m => { const un = isUnlocked(m, s.completed), dn = s.completed.includes(m.id); const prev = m.unlock ? getMission(m.unlock.mission).name : null; return `<div class="panel"><div class="row" style="justify-content:space-between"><h3>${esc(m.name)}</h3><span class="tag ${dn ? 'ok' : un ? '' : 'lock'}">${dn ? 'completed' : un ? 'available' : 'locked'}</span></div><p class="dim" style="font-size:13px">${esc(m.destination)}</p><dl class="kv"><dt>Δv needed</dt><dd>${fmtN(m.requiredDv)} m/s</dd><dt>Payload</dt><dd>${esc(m.requiredPayloadName)}</dd><dt>Reward</dt><dd>${fmtN(m.reward.credits)} cr · ${m.reward.gems} gems</dd><dt>Unlock</dt><dd>${prev ? 'Complete ' + esc(prev) : 'Open from the start'}</dd></dl>${un ? `<div class="row" style="margin-top:10px"><button class="btn sm primary" data-m="${m.id}">${s.selectedMission === m.id ? 'Selected' : 'Select mission'}</button></div>` : ''}</div>`; }).join('')}</div>`;
  $('#v-map').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; const m = getMission(b.dataset.m); if (!isUnlocked(m, store.get().completed)) return toast(`Locked: complete ${getMission(m.unlock.mission).name} first.`, 'bad'); store.selectMission(m.id); renderMap(); toast(`Mission selected: ${m.name}`); };
}

// ====================== ENGINEERING LAB ======================
function ensureLab() { if (S.lab || S.glFail.labCanvas) return; try { S.lab = new LabView($('#labCanvas'), { reduceMotion: REDUCED }); S.lab.setLoadout(store.get().loadout, false); } catch (e) { noGL($('#labCanvas'), e); } }
const kN = n => fmtN(n / 1000) + ' kN';
function specLine(slot, p) {
  const o = [];
  if (slot === 'engines') o.push('Thrust ' + kN(p.thrust), 'Isp ' + p.isp + ' s', 'Mass ' + fmtN(p.mass) + ' kg');
  if (slot === 'tanks') o.push('Propellant ' + fmtN(p.propellant) + ' kg', 'Dry ' + fmtN(p.dry) + ' kg');
  if (slot === 'structures') o.push('Mass ' + fmtN(p.mass) + ' kg', 'Durability ×' + p.durability.toFixed(2));
  if (slot === 'boosters' && p.count) o.push(p.count + ' boosters', 'Thrust ' + kN(p.thrust), 'Propellant ' + fmtN(p.propellant) + ' kg', 'Dry ' + fmtN(p.dry) + ' kg');
  if (slot === 'upperStages' && p.propellant) o.push('Propellant ' + fmtN(p.propellant) + ' kg', 'Thrust ' + kN(p.thrust), 'Isp ' + p.isp + ' s', 'Dry ' + fmtN(p.dry) + ' kg');
  if (slot === 'payloads') o.push('Mass ' + fmtN(p.mass) + ' kg', 'Class: ' + p.capability);
  if (slot === 'extras') o.push('Mass ' + fmtN(p.mass) + ' kg');
  return o.map(x => `<span>${x}</span>`).join('');
}
// Installed components of the rocket on the turntable (same list the exploded view moves). Clicking one in the list or on the 3D model inspects it.
function compPanel() {
  if (!S.lab || !S.lab.rocket) return '';
  const comps = S.lab.rocket.components, sel = comps.find(c => c.key === S.selComp) || null;
  let detail = '<p class="dim" style="font-size:12.5px;margin:6px 0 0">Click a part on the 3D model, or in this list, to inspect it. Use <b>Exploded view</b> to pull every component apart.</p>';
  if (sel) { const f = findPart(sel.partId); const p = f && f.part; detail = `<div class="finding ok" style="margin-top:8px"><b>${esc(sel.label)}</b>${p ? esc(p.desc) + '<div class="specs" style="margin-top:4px">' + specLine(sel.slot, p) + `<span>Cost ${fmtN(p.cost)} cr</span></div>` : ''}<button class="btn sm" data-tab-goto="${sel.slot}" style="margin-top:6px">Show in Parts workshop</button></div>`; }
  return `<div class="panel" style="margin-bottom:12px"><h2>Installed components (${comps.length})</h2><div class="comp-list">${comps.map(c => `<button class="btn sm ${c.key === S.selComp ? 'on' : ''}" data-comp="${c.key}" aria-pressed="${c.key === S.selComp}">${esc(c.label)}</button>`).join('')}</div>${detail}</div>`;
}
function selectComp(key) { S.selComp = key; if (S.lab) S.lab.highlight(key); renderLab(); }
function renderLab() {
  const s = store.get(), m = getMission(s.selectedMission), chk = checkFeasibility(s.loadout, m, s.credits), a = chk.analysis;
  const slots = [...SLOT_ORDER, 'extras'];
  const list = PARTS[S.labTab].map(p => {
    const owned = s.owned.includes(p.id), inst = store.isInstalled(p.id), afford = s.credits >= p.cost;
    const btn = inst ? (S.labTab === 'extras' ? `<button class="btn sm" data-act="inst" data-id="${p.id}">Remove</button>` : `<span class="tag ok">Installed</span>`) : owned ? `<button class="btn sm primary" data-act="inst" data-id="${p.id}">Install</button>` : `<button class="btn sm ${afford ? 'warn' : ''}" data-act="buy" data-id="${p.id}" aria-label="Buy ${esc(p.name)} for ${p.cost} credits">Buy · ${fmtN(p.cost)}</button>`;
    const sell = owned && p.cost > 0 ? `<button class="btn sm" data-act="sell" data-id="${p.id}" title="Sell back for 80%">Sell +${fmtN(Math.round(p.cost * 0.8))}</button>` : '';
    const rec0 = getAdvice(m), isRec = !owned && rec0 && rec0 !== 'pending' && rec0.parts.some(x => x.id === p.id);
    return `<div class="part ${inst ? 'inst' : ''} ${!owned && !afford ? 'cant' : ''}"><div><b>${esc(p.name)}</b> ${owned && !inst ? '<span class="tag ok">Owned</span>' : ''}${!owned ? `<span class="tag lock">Not purchased</span>` : ''} ${isRec ? '<span class="badge-rec">ADVISOR PICK</span>' : ''}</div><div class="row">${sell}${btn}</div><div class="specs">${specLine(S.labTab, p)}</div><div class="d">${esc(p.desc)}</div></div>`;
  }).join('');
  $('#labSide').innerHTML = `
  <div class="row" style="justify-content:space-between"><h2 style="margin:0">Target mission</h2></div>
  <select id="labMission" style="width:100%;margin:6px 0 12px;padding:7px;background:#0a1328;border:1px solid var(--rule2)" aria-label="Target mission">${MISSIONS.filter(x => isUnlocked(x, s.completed)).map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.name)} — needs ${fmtN(x.requiredDv)} m/s</option>`).join('')}</select>
  <div class="panel" style="margin-bottom:12px"><h2>Vehicle analysis (model)</h2><div class="stat-grid">
    <div class="stat"><span>Total mass</span><b>${fmtN(a.m0)}<small> kg</small></b></div><div class="stat"><span>Dry mass</span><b>${fmtN(a.dryMass)}<small> kg</small></b></div>
    <div class="stat"><span>Propellant</span><b>${fmtN(a.propMass)}<small> kg</small></b></div><div class="stat"><span>Liftoff thrust</span><b>${fmtN(a.thrust0 / 1000)}<small> kN</small></b></div>
    <div class="stat ${a.twr < 1.15 ? 'bad' : a.twr < 1.4 ? 'warn' : 'good'}"><span>Thrust / weight</span><b>${a.twr.toFixed(2)}</b></div><div class="stat"><span>Burn duration</span><b>${fmtN(a.totalBurn)}<small> s</small></b></div>
    <div class="stat ${a.dv < m.requiredDv ? 'bad' : a.dv < m.requiredDv * 1.08 ? 'warn' : 'good'}"><span>Est. Δv (ideal)</span><b>${fmtN(a.dv)}<small> m/s</small></b></div><div class="stat"><span>Launch fee</span><b>${fmtN(a.launchCost)}<small> cr</small></b></div></div>
    <details style="margin-top:8px"><summary class="dim" style="cursor:pointer;font-size:12px">Δv by burn phase · Δv = Isp · g₀ · ln(m₀ / m₁)</summary><table><tr><th>Phase</th><th>Δv m/s</th><th>Burn s</th></tr>${a.phases.map(p => `<tr><td>${p.name}</td><td class="num">${fmtN(p.dv)}</td><td class="num">${fmtN(p.burn)}</td></tr>`).join('')}</table></details></div>
  <details class="help"><summary>How buying works (read this first)</summary><ol class="steps" style="font-size:13px"><li>Every part has a price. <b>Buy</b> opens a confirmation showing what you will have left and how the part changes your rocket.</li><li>Parts are bought <b>once</b> and kept. Owned parts show <b>Install</b> and swapping is free.</li><li><b>Sell</b> returns 80%, so a wrong purchase is never a dead end.</li><li>Purchases that would leave you unable to launch even the free starter rocket are <b>blocked</b>.</li></ol><button class="btn sm" data-help="money">Full money guide</button></details>
  <div class="panel" style="margin-bottom:12px"><h2>Build Advisor</h2>${advisorHtml(m)}</div>
  <div class="panel" style="margin-bottom:12px"><h2>Pre-launch check</h2>${chk.findings.map(f => `<div class="finding ${f.sev}"><b>${f.sev === 'block' ? 'BLOCKED' : f.sev === 'warn' ? 'WARNING' : 'OK'}</b>${esc(f.text)}</div>`).join('')}</div>
  ${compPanel()}
  <h2>Parts workshop</h2><div class="tabs" role="tablist">${slots.map(k => `<button role="tab" aria-selected="${k === S.labTab}" data-tab="${k}">${SLOT_LABEL[k]}</button>`).join('')}</div>${list}`;
}
$('#labSide').addEventListener('click', e => {
  const cb = e.target.closest('[data-comp]'); if (cb) return selectComp(S.selComp === cb.dataset.comp ? null : cb.dataset.comp);
  const gt = e.target.closest('[data-tab-goto]'); if (gt) { S.labTab = gt.dataset.tabGoto; return renderLab(); }
  const t = e.target.closest('[data-tab]'); if (t) { S.labTab = t.dataset.tab; return renderLab(); }
  const b = e.target.closest('[data-act]'); if (!b) return; const id = b.dataset.id;
  if (b.dataset.act === 'buy') return askBuy(id);
  if (b.dataset.act === 'sell') return askSell(id);
  if (b.dataset.act === 'advise') { const m = getMission(store.get().selectedMission), r = getAdvice(m); if (!r || r === 'pending') return; let ok = true; for (const x of r.parts) { const rb = store.buy(x.id); if (!rb.ok) { toast(rb.msg, 'bad'); ok = false; break; } } if (ok) { const rs = store.setLoadout(r.loadout); toast(rs.ok ? `Bought and installed the recommended build for ${m.name}.` : rs.msg, rs.ok ? 'good' : 'bad'); } }
  else { const r = store.install(id); toast(r.msg, r.ok ? 'good' : 'bad'); }
  if (S.lab) { S.lab.setLoadout(store.get().loadout, true); S.lab.highlight(S.selComp); } renderLab();
});
$('#labSide').addEventListener('change', e => { if (e.target.id === 'labMission') { store.selectMission(e.target.value); renderLab(); } });
$('#btnExplode').onclick = e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.classList.toggle('on', on); S.lab && S.lab.setExplode(on); };
$('#btnToLaunch').onclick = () => goToPad();
$('#labCanvas').addEventListener('click', e => { if (!S.lab || S._labDrag) return; const r = e.currentTarget.getBoundingClientRect(); const cp = S.lab.pick(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)); selectComp(cp ? cp.key : null); });
{ let d0 = null; const cv = $('#labCanvas'); cv.addEventListener('pointerdown', e => { d0 = [e.clientX, e.clientY]; S._labDrag = false; }); cv.addEventListener('pointermove', e => { if (d0 && Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 5) S._labDrag = true; }); cv.addEventListener('pointerup', () => { d0 = null; setTimeout(() => { S._labDrag = false; }, 0); }); }

// ====================== FLIGHT ======================
// The 3D flight view is preferred. If WebGL cannot start, a real 2D display (same simulation) takes over, so the player can still fly.
const VIEW_KEY = 'orbital.flightview';
const viewPref = () => { try { return localStorage.getItem(VIEW_KEY) === '2d' ? '2d' : '3d'; } catch (e) { return '3d'; } };
function makeFlightView(mode, fallback) {   // always on a FRESH canvas: a canvas that has a WebGL context can never give a 2D context (and vice versa)
  const old = $('#flightCanvas'), fresh = old.cloneNode(false); old.replaceWith(fresh);
  const v = mode === '2d' ? new FlightView2D(fresh, { reduceMotion: REDUCED, fallback: !!fallback }) : new FlightView(fresh, { reduceMotion: REDUCED });
  return v;
}
// The 3D flight view is the default; the player can choose the 2D view at any time (same Flight object, same rewards).
// If WebGL cannot start, the 2D view takes over automatically.
function ensureFlightView() {
  if (S.fview) return;
  if (viewPref() === '3d') { try { S.fview = makeFlightView('3d'); S.fview2d = false; syncViewButton(); return; } catch (e) { console.error(e); S.glFail.flightCanvas = true; S.glReason = e && e.message || String(e); } }
  try { S.fview = makeFlightView('2d', viewPref() === '3d'); S.fview2d = true; if (viewPref() === '3d') toast('WebGL is unavailable, so the flight is shown in 2D. The simulation and rewards are the same.', 'bad'); syncViewButton(); }
  catch (e2) { noGL($('#flightCanvas'), e2); }
}
function syncViewButton() { const b = $('#bView'); if (!b) return; b.textContent = S.fview2d ? 'Switch to 3D view' : 'Switch to 2D view'; b.setAttribute('aria-pressed', !!S.fview2d); }
function switchFlightView(mode) {
  if (!S.fview || (mode === '2d') === !!S.fview2d) return;
  const flight = (S.fc && S.fc.flight) || S.padFlight || null, { mapView, farView } = S.fview;
  let next; const prev = S.fview;
  try { try { prev.dispose && prev.dispose(); } catch (e) { console.error(e); } S.fview = null; next = makeFlightView(mode); }
  catch (e) { console.error(e); toast(mode === '3d' ? 'The 3D view could not start on this device, staying in 2D.' : 'Could not switch the view.', 'bad'); try { next = makeFlightView('2d'); mode = '2d'; } catch (e2) { noGL($('#flightCanvas'), e2); return; } }
  S.fview = next; S.fview2d = mode === '2d'; next.mapView = mapView; next.farView = farView;
  if (flight) next.setFlight(flight);
  try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* preference is optional */ }
  next.resize(); syncViewButton(); updateSafe(true);
}
// ---- show / hide flight panels: the player decides how much text is on screen (state is remembered) ----
const HUD_KEY = 'orbital.hud';
const HUD_PARTS = [['tel', 'Telemetry'], ['info', 'Mission & log'], ['bar', 'Controls']];
function hudLoad() { try { const j = JSON.parse(localStorage.getItem(HUD_KEY) || 'null'); if (j && typeof j === 'object') return { tel: !!j.tel, info: !!j.info, bar: !!j.bar }; } catch (e) { /* optional */ } return { tel: false, info: window.innerHeight < 700 || window.innerWidth < 1300, bar: false }; }
function hudApply() {
  const v = $('#v-flight'), h = S.hud || (S.hud = hudLoad()); if (!v) return;
  HUD_PARTS.forEach(([k]) => v.classList.toggle('hide-' + k, !!h[k]));
  const all = HUD_PARTS.every(([k]) => h[k]);
  $('#hudToggle').innerHTML = HUD_PARTS.map(([k, t]) => `<button class="btn sm" data-hud="${k}" aria-pressed="${!h[k]}" title="Show or hide the ${t.toLowerCase()} panel">${h[k] ? 'Show' : 'Hide'} ${t}</button>`).join('') + `<button class="btn sm" data-hud="all" title="Show or hide every panel (H)">${all ? 'Show all' : 'Hide all'}</button>`;
  try { localStorage.setItem(HUD_KEY, JSON.stringify(h)); } catch (e) { /* optional */ }
  requestAnimationFrame(() => { const fb = $('#flightbar'); v.style.setProperty('--fb', (fb && fb.offsetHeight ? fb.offsetHeight : 0) + 'px'); document.documentElement.style.setProperty('--fbg', (fb && fb.offsetHeight ? fb.offsetHeight : 0) + 'px'); updateSafe(true); });
}
let safeT = 0;
function updateSafe(force) {   // tell the 2D display which part of the screen is free of HUD panels
  const v = S.fview; if (!v || !v.setSafe) return; const now = performance.now(); if (!force && now - safeT < 300) return; safeT = now;
  const st = $('#v-flight .stage'); if (!st) return; const R = st.getBoundingClientRect(); const vis = el => (el && el.offsetParent !== null) ? el.getBoundingClientRect() : null;
  let l = 8, t = 44, r = 8, b = 8; const tel = vis($('.hud-left')), info = vis($('.hud-right')), bar = vis($('#flightbar'));
  if (tel) l = tel.right - R.left + 12; if (info) r = R.right - info.left + 12; if (bar) b = R.bottom - bar.top + 8;
  v.setSafe(l, t, r, b);
}
function hudToggle(k) { const h = S.hud || (S.hud = hudLoad()); if (k === 'all') { const all = HUD_PARTS.every(([x]) => h[x]); HUD_PARTS.forEach(([x]) => { h[x] = !all; }); } else h[k] = !h[k]; hudApply(); }
function initHud() {
  $('#hudToggle').addEventListener('click', e => { const b = e.target.closest('[data-hud]'); if (b) { hudToggle(b.dataset.hud); b.blur(); } });
  hudApply();
  if (window.ResizeObserver) new ResizeObserver(() => { const fb = $('#flightbar'), v = $('#v-flight'); if (fb && v) { v.style.setProperty('--fb', (fb.offsetHeight || 0) + 'px'); document.documentElement.style.setProperty('--fbg', (fb.offsetHeight || 0) + 'px'); } }).observe($('#flightbar'));
}
function buildHud() {
  $('#hud').innerHTML = `
  <div class="hud-left"><div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin-bottom:6px">Telemetry <span class="faint">(simulated)</span></h2><button class="btn sm" data-help="flight" title="Controls and keys">?</button></div>
    <div class="statusline" id="tStatus">—</div>
    <div class="big" id="tAlt">0 <small>m</small></div><div class="dim mono" style="font-size:11px" id="tAltLbl">ALTITUDE</div>
    <div class="readout" style="margin-top:8px"><span>Speed</span><b id="tSpd">0</b><span>Vertical</span><b id="tVs">0</b><span>Horizontal</span><b id="tHs">0</b><span>Apoapsis</span><b id="tAp">—</b><span>Periapsis</span><b id="tPe">—</b><span>Mission time</span><b id="tT">T-0</b></div><div class="readout" id="moonRows" style="margin-top:6px" hidden><span>Moon distance</span><b id="tMoon">—</b><span>Moon intercept</span><b id="tTraj">—</b></div></div>
    <div class="panel"><div class="readout"><span>Propellant</span><b id="tFuel">100%</b></div><div class="bar fuel"><i id="bFuel" style="width:100%"></i></div>
    <div class="readout" style="margin-top:8px"><span>Thrust</span><b id="tThr">0 kN</b><span>TWR</span><b id="tTwr">0</b><span>Mass</span><b id="tMass">0</b><span>Δv left</span><b id="tDv">0</b></div>
    <div class="readout" style="margin-top:8px"><span>Dyn. pressure</span><b id="tQ">0 kPa</b></div><div class="bar q"><i id="bQ" style="width:0"></i></div>
    <div class="readout" style="margin-top:8px"><span>Phase</span><b id="tPh">—</b><span>Stage</span><b id="tSt">—</b><span>Heat load</span><b id="tHeat">0</b></div></div></div>
  <div class="hud-right"><div class="panel"><h2>${'Objective'}</h2><div id="objName" style="font-weight:600"></div><div id="objList" style="margin:6px 0"></div><div class="hint" id="hint"></div><div class="alert" id="burnout" style="margin-top:8px" hidden></div></div>
    <div class="panel"><h2>Flight log</h2><div class="events" id="evLog"></div></div></div>`;
  $('#flightbar').innerHTML = `
  <div class="ctl"><label for="slThr">Throttle <b id="lblThr">0%</b> <span class="faint">(Z full · X cut · Shift/Ctrl ±)</span></label><input type="range" id="slThr" min="0" max="100" value="0"></div>
  <div class="ctl"><label for="slPitch">Pitch <b id="lblPitch">90°</b> <span class="faint">(↑ ↓ · 90° = up, 0° = horizon)</span></label><input type="range" id="slPitch" min="-10" max="90" value="90"></div>
  <div class="row"><button class="btn sm" id="bPro" aria-pressed="false" title="G">Prograde hold</button><button class="btn sm on" id="bMaxq" aria-pressed="true" title="M — setting only: never starts or stops a flight">Max-Q limiter</button><span class="mono maxq-state" id="maxqState" role="status" aria-live="polite"></span>
    <button class="btn sm warn" id="bBoost" title="B">Separate boosters</button><button class="btn sm warn" id="bStage" title="N">Separate stage</button><button class="btn sm primary" id="bPay" title="P">Deploy payload</button>
    <button class="btn sm primary" id="bCap" title="C" hidden>Start capture burn</button><button class="btn sm primary" id="bDes" hidden>Start powered descent</button><button class="btn sm danger" id="bEnd">End mission</button><button class="btn sm danger" id="bAbort" hidden title="Esc">Abort countdown (free)</button></div>
  <div class="row"><span class="dim" style="font-size:11px;letter-spacing:.14em">TIME WARP</span>${[1, 10, 100, 1000, 10000].map(w => `<button class="btn sm ${w === 1 ? 'on' : ''}" data-warp="${w}">${w}×</button>`).join('')}<b class="mono" id="warpInfo" style="font-size:11px"></b><button class="btn sm" id="bPause" aria-pressed="false" title="Space">❚❚ Pause</button><button class="btn sm" id="bMap" aria-pressed="false" title="V">Map view</button><button class="btn sm" id="bCam" aria-pressed="false">Wide camera</button><button class="btn sm" id="bView" aria-pressed="false" title="Choose the 3D or the 2D flight display. Both show the same simulation.">Switch to 2D view</button></div>
  <div class="row apbar"><button class="btn sm primary" id="bAP" title="Let the flight assistant fly (ascent, transfer window, capture). Assisted flights do not earn the manual-pilot bonus.">🤖 Autopilot</button><span class="dim" id="apStatus" style="font-size:12px">Manual flight (earns +10% manual-pilot bonus on success)</span></div>`;
  $('#hud').insertAdjacentHTML('beforeend', '<div class="tag3d" id="tagMoon" hidden></div><div class="tag3d" id="tagEarth" hidden></div><div class="tag3d you" id="tagYou" hidden></div>');
  const f = () => S.fc && S.fc.flight;
  $('#slThr').oninput = e => { const fl = f(); if (fl) { fl.setThrottle(e.target.value / 100); fl.decide('Throttle set to ' + e.target.value + '%'); } };
  $('#slPitch').oninput = e => { const fl = f(); if (fl) { fl.setPitch(+e.target.value); $('#bPro').setAttribute('aria-pressed', 'false'); $('#bPro').classList.remove('on'); } };
  $('#bPro').onclick = () => { const fl = f(); if (!fl) return; fl.setPrograde(!fl.prograde); $('#bPro').classList.toggle('on', fl.prograde); $('#bPro').setAttribute('aria-pressed', fl.prograde); };
  $('#bMaxq').onclick = () => { const fl = f(); if (!fl) return; fl.maxQAssist = !fl.maxQAssist; fl.decide('Max-Q limiter ' + (fl.maxQAssist ? 'enabled' : 'disabled')); toast(fl.maxQAssist ? 'Max-Q limiter ON: engine thrust is reduced automatically when air pressure gets dangerous.' : 'Max-Q limiter OFF: at full throttle the vehicle can break up when air pressure passes its limit.', fl.maxQAssist ? 'good' : 'bad'); $('#bMaxq').classList.toggle('on', fl.maxQAssist); $('#bMaxq').setAttribute('aria-pressed', fl.maxQAssist); };
  $('#bBoost').onclick = () => { const fl = f(); fl && fl.separateBoosters(); };
  $('#bStage').onclick = () => { const fl = f(); fl && fl.separateStage(); };
  $('#bPay').onclick = () => { const fl = f(); fl && fl.deployPayload(); };
  $('#bCap').onclick = () => { const fl = f(); if (fl && fl.startCapture()) { fl.setThrottle(1); $('#slThr').value = 100; setWarp(1); } };
  $('#bDes').onclick = () => { const fl = f(); if (fl && fl.startDescent()) { fl.setThrottle(1); $('#slThr').value = 100; setWarp(1); } };
  $('#bEnd').onclick = () => { const fl = f(); if (fl && S.fc.state === 'flying') confirmBox('End mission?', 'The flight will be scored as a failure and the vehicle is lost. Continue?', 'End mission', () => fl.endMission()); };
  $('#bAbort').onclick = () => abortCountdown();
  $('#bPause').onclick = () => togglePause();
  $('#bView').onclick = () => switchFlightView(S.fview2d ? '3d' : '2d'); syncViewButton();
  $('#bMap').onclick = () => toggleMap();
  $('#bAP').onclick = () => toggleAutopilot();
  $('#bCam').onclick = e => { if (!S.fview) return; S.fview.farView = !S.fview.farView; e.currentTarget.setAttribute('aria-pressed', S.fview.farView); e.currentTarget.classList.toggle('on', S.fview.farView); };
  $('#flightbar').addEventListener('click', e => { const w = e.target.closest('[data-warp]'); if (w) setWarp(+w.dataset.warp); });
}
function togglePause() { if (!S.fc || S.fc.state === 'done') return; S.paused = !S.paused; const b = $('#bPause'); if (b) { b.classList.toggle('on', S.paused); b.setAttribute('aria-pressed', S.paused); b.textContent = S.paused ? '▶ Resume' : '❚❚ Pause'; } }
function toggleMap() { if (!S.fview) return; S.fview.mapView = !S.fview.mapView; const b = $('#bMap'); if (b) { b.classList.toggle('on', S.fview.mapView); b.setAttribute('aria-pressed', S.fview.mapView); } }
function toggleAutopilot() {
  const c = S.fc; if (!c || c.state !== 'flying' || c.flight.outcome) return;
  if (S.ap && !S.ap.done) { S.ap.stop('Autopilot off: you have control'); S.ap = null; setWarp(1); toast('Autopilot off. You have control.'); return; }   // back to 1× so the hand-over is never at an autopilot-chosen warp
  S.ap = new Autopilot(c.flight); c.apNoted = false;
  if (S.ap.infeasible) { c.apNoted = true; setWarp(1); toast(S.ap.status, 'bad'); }
  else toast('Autopilot engaged. Press the button again to take over.', 'good');
}
function setWarp(w) { S.warp = w; document.querySelectorAll('[data-warp]').forEach(b => b.classList.toggle('on', +b.dataset.warp === w)); }
function renderFlightIdle() {
  if (S.fc && S.fc.state !== 'done') return;
  const s = store.get(), m = getMission(s.selectedMission);
  $('#hud').innerHTML = `<div class="hud-left keep" style="width:min(360px, calc(100% - 28px))"><div class="panel"><h2>Launchpad</h2><p>Mission: <b>${esc(m.name)}</b></p><p class="dim">Your rocket is waiting on the pad. Press the button to pay the launch fee (${fmtN(launchFee(s.loadout))} credits) and start the countdown.</p><div class="row"><button class="btn go" id="btnLaunchNow">Start countdown</button><button class="btn primary" id="btnLaunchAssist" title="The flight assistant flies the whole mission for you (no manual-pilot bonus)">Countdown + 🤖 Autopilot</button><button class="btn" data-nav-lab>Back to Lab</button></div></div></div>`;
  $('#flightbar').innerHTML = '';
  $('#hud').onclick = e => { if (e.target.id === 'btnLaunchNow') startLaunch(false); if (e.target.id === 'btnLaunchAssist') startLaunch(true); if (e.target.closest('[data-nav-lab]')) show('lab'); };
  if (S.fview) { const fl = new Flight(s.loadout, m); S.fview.setFlight(fl); S.padFlight = fl; }
}
// ---- Launch state machine -------------------------------------------------------------------------------------------
// idle (pad) --startLaunch()--> countdown --T-0--> flying --outcome--> done.   The fee is taken at ignition (T-0), never earlier.
// Only the pad buttons call startLaunch(); every other "Launch" control just goes to the pad (goToPad) and charges nothing.
// Settings (Max-Q limiter, prograde hold, time warp) never touch this state machine.
function flightBusy() { return !!(S.fc && S.fc.state !== 'done'); }
function goToPad() {
  const s = store.get(), m = getMission(s.selectedMission);
  if (flightBusy()) { show('flight'); return toast('A flight is already in progress.'); }
  const chk = checkFeasibility(s.loadout, m, s.credits);
  if (!chk.canLaunch) { const b = chk.findings.find(f => f.sev === 'block'); toast('Not cleared for launch: ' + b.text, 'bad'); show('lab'); return; }
  show('flight');
}
function startLaunch(assist = false) {
  if (S.launchLock || flightBusy()) return;            // double clicks, repeated key presses or stale handlers can never start a second flight
  if (S.view !== 'flight') return goToPad();
  S.launchLock = true;
  try {
    const s = store.get(), m = getMission(s.selectedMission);
    const r = beginLaunch(store, m, () => { ensureFlightView(); return !!S.fview; }, { deferFee: true });   // display must exist BEFORE anything is charged
    if (!r.ok) { toast(r.msg, 'bad'); if (r.why === 'blocked') show('lab'); return; }
    const flight = new Flight(s.loadout, m); S.fview.setFlight(flight); S.fview.farView = false;
    S.ap = null; S.paused = false; S.effWarp = 1; S.warpWhy = ''; S.padFlight = null;
    S.fc = { flight, mission: m, fee: 0, plannedFee: r.fee, state: 'countdown', cd: 6.0, endAt: null, reported: false, lastEv: 0, arrived: false, assist };
    setWarp(1); buildHud(); $('#countdown').hidden = false; $('#objName').textContent = m.name;
    toast(`Countdown started. The ${fmtN(r.fee)}-credit launch fee is charged at ignition; abort any time before then at no cost.`);
  } finally { S.launchLock = false; }
}
function abortCountdown() {
  const c = S.fc; if (!c || c.state !== 'countdown') return;
  S.fc = null; $('#countdown').hidden = true; $('#countdown').innerHTML = ''; toast('Countdown aborted. Nothing was charged.');
  renderFlightIdle();
}
// Ignition at T-0: take the fee exactly once, then light the engine. If the fee can no longer be paid the launch is scrubbed.
function ignitionNow(c) {
  const f = c.flight; const pay = store.payLaunchFee();
  if (!pay.ok) { toast(`Launch scrubbed: the ${fmtN(pay.fee)}-credit launch fee can no longer be paid.`, 'bad'); S.fc = null; $('#countdown').hidden = true; renderFlightIdle(); return; }
  c.fee = pay.fee; f.ignite(); f.setThrottle(1); c.state = 'flying'; $('#countdown').hidden = true;
  toast(`Ignition. Liftoff! Launch fee paid: ${fmtN(pay.fee)} credits.`, 'good'); if (c.assist) S.ap = new Autopilot(f);
}
function liveCriteria(f) {
  const m = f.mission, o = f.orbit(), alt = f.alt, km = v => fmtN(v / 1000) + ' km';
  const C = (ok, t) => ({ ok, t });
  switch (m.id) {
    case 'sounding': return [C(f.maxAlt >= WORLD.karman, `Reach 100 km (max ${km(f.maxAlt)})`), C(!f.payloadAttached && !!f.outcome?.success, 'Deploy payload above 100 km')];
    case 'leo': return [C(o.bound && o.pe >= 150000, `Periapsis ≥ 150 km (now ${o.bound ? km(o.pe) : '—'})`), C(o.bound && o.ap <= 500000, `Apoapsis ≤ 500 km (now ${o.bound ? km(o.ap) : '—'})`), C(!f.payloadAttached, 'Deploy payload in orbit')];
    case 'transfer': return [C(o.bound && o.pe >= 150000, `Periapsis ≥ 150 km (now ${o.bound ? km(o.pe) : '—'})`), C(o.bound && o.ap >= 8e6, `Apoapsis ≥ 8,000 km (now ${o.bound ? km(o.ap) : '—'})`), C(!f.payloadAttached, 'Deploy payload')];
    case 'lunar-orbit': return [C(f.moonReached, `Enter the Moon’s encounter zone (≤ ${fmtN(WORLD.moonSOI / 1000)} km; closest so far ${Number.isFinite(f.minMoonD) ? fmtN(f.minMoonD / 1000) + ' km' : '—'})`), C(f.lunar.dvDone >= m.captureDv, `Capture burn ${fmtN(f.lunar.dvDone)} / ${m.captureDv} m/s`), C(!f.payloadAttached, 'Deploy orbiter')];
    case 'lunar-land': return [C(f.moonReached, `Enter the Moon’s encounter zone (≤ ${fmtN(WORLD.moonSOI / 1000)} km; closest so far ${Number.isFinite(f.minMoonD) ? fmtN(f.minMoonD / 1000) + ' km' : '—'})`), C(f.lunar.dvDone >= m.captureDv, `Capture burn ${fmtN(f.lunar.dvDone)} / ${m.captureDv} m/s`), C(f.phase === 'landed' || f.phase === 'complete', `Powered descent ${fmtN(f.lunar.descentDone)} / ${m.descentDv} m/s`), C(!f.payloadAttached, 'Deploy lander')];
    case 'deep': return [C(!o.bound, 'Escape trajectory'), C(!o.bound && o.vinf >= 1200, `Excess speed ≥ 1,200 m/s (now ${o.bound ? '—' : fmtN(o.vinf)})`), C(alt >= 5e6, `Altitude ≥ 5,000 km (now ${km(alt)})`), C(!f.payloadAttached, 'Deploy probe')];
  }
  return [];
}
function hintFor(f, c) {
  const id = f.mission.id, o = f.orbit(), alt = f.alt;
  if (c.state === 'countdown') return 'Systems check. Throttle is set to full automatically at ignition.';
  if (f.outcome) return f.outcome.success ? 'Objective satisfied. Compiling the mission report…' : 'Flight failed. The mission report opens in a few seconds.';
  if (f.phase === 'lunar-arrival') return 'Inside the Moon’s encounter zone. Start the capture burn now; it needs ' + f.mission.captureDv + ' m/s of delta-v.';
  if (f.phase === 'lunar-capture') return 'Capture burn in progress. If propellant runs out first you will fly past the Moon. Separate an empty core stage if you have an upper stage.';
  if (f.phase === 'lunar-orbit') return id === 'lunar-land' ? 'In lunar orbit. Separate the empty core stage, then start the powered descent. The engine must out-thrust lunar weight.' : 'In lunar orbit. Deploy the orbiter.';
  if (f.phase === 'landed') return 'Touchdown! Deploy the lander.';
  if (f.boostersAttached && f.fuelB <= 1) return 'Boosters are empty: separate them to shed dead mass.';
  if (f.stage === 'core' && f.an.hasUpper && f.fuelCore <= 1) return 'Core stage empty: separate the stage so the upper stage can fire.';
  if (alt < 1000 && id !== 'sounding') return 'Climb straight up to about 1 km, then tilt the pitch to ~80° and switch on Prograde hold to start the gravity turn.';
  if (id === 'sounding') return alt < 100000 ? 'Keep thrusting straight up. Deploy the payload once altitude is above 100 km.' : 'Above the Kármán line: deploy the payload now.';
  if (alt < 70000 && f.q > 0.8 * f.qLimit()) return 'High dynamic pressure (Max-Q)! The limiter will throttle down; you can also ease the throttle yourself.';
  if (id === 'leo') return o.bound && o.pe >= 150000 ? (o.ap <= 500000 ? 'Orbit achieved. Cut the throttle and deploy the payload.' : 'Apoapsis too high for LEO: you overshot. Burn retrograde is not modelled—plan a smaller apoapsis next time.') : (o.ap < 180000 ? 'Keep burning prograde until apoapsis is around 200 km, then cut throttle and coast.' : 'Coast to apoapsis (vertical speed near 0), set pitch to 0° and burn until periapsis passes 150 km.');
  if (id === 'transfer') return o.ap < 8e6 ? 'Burn until apoapsis exceeds 8,000 km while periapsis stays above 150 km (raise periapsis first with a horizontal burn).' : 'Apoapsis is high enough. Make sure periapsis ≥ 150 km, then deploy.';
  if (id === 'deep') return o.bound ? 'Keep burning prograde until the trajectory becomes unbound (apoapsis shows ∞) with ≥ 1,200 m/s excess speed.' : 'Escape trajectory. Check excess speed and altitude, then deploy.';
  if (f.mission.captureDv) {
    if (S.ap && !S.ap.done) return 'Autopilot is flying: ' + S.ap.status;
    if (!(o.bound && o.pe >= 150000)) return 'First reach a low circular orbit (about 200 km): gravity turn, cut the engine at apoapsis ~200 km, coast to apoapsis, then burn horizontally (pitch 0°). Or press Autopilot.';
    if (o.ap + WORLD.R < 0.95 * WORLD.moonDist) { const w = transferWindow(f); return `You are in orbit. The transfer burn must be centred ${w.errDeg > 0 ? '' : ''}on the point of your orbit OPPOSITE the Moon. Burn prograde for about ${Math.round(w.dv)} m/s (≈ ${Number.isFinite(w.burnS) ? Math.round(w.burnS) + ' s' : '—'}) starting in about ${fmtT(Math.max(0, w.etaS - (Number.isFinite(w.burnS) ? w.burnS / 2 : 0)))}; stop when Apoapsis shows ${fmtN(WORLD.moonDist / 1000 - WORLD.R / 1000)} km. Time warp up to wait.`; }
    return 'Transfer orbit set: check “Moon intercept” (it must say ✔). Cut the engine and coast with time warp; the game slows time automatically near the Moon. Keep propellant for the capture burn.';
  }
  return 'Burn prograde to raise apoapsis, then coast using time warp.';
}
function tickFlight(dt) {
  const c = S.fc; if (!c || !S.fview || c.state === 'done') return; const f = c.flight;
  if (S.paused) { S.fview.update(0, f); updateHud(f, c); return; }
  if (c.state === 'countdown') {
    c.cd -= dt; const n = Math.ceil(c.cd); const el = $('#countdown');
    el.innerHTML = c.cd > 0 ? `${n}<small>${n > 2 ? 'FINAL SYSTEMS CHECK' : n > 0 ? 'ENGINE START SEQUENCE' : ''}</small>` : '';
    if (c.cd <= 0) ignitionNow(c);
  } else {
    // Effective time warp: what the player asked for, limited for safety. Every limit is shown to the player with its reason.
    let eff = S.warp, why = '';
    if (S.ap && !S.ap.done && S.ap.warp !== undefined) { eff = S.ap.warp; if (S.warp !== eff) setWarp(eff); }
    const thrusting = f.thrustNow > 0 || (f.engineOn && f.throttle > 0);
    if (!f.outcome) {
      if (thrusting && f.alt < 100000 && eff > 4) { eff = 4; why = 'limited to 4× while thrusting in the atmosphere'; }
      if (f.mission.captureDv && !f.moonReached && f.maxR > 0.3 * WORLD.moonDist) {
        const lim = Math.max(1, (f.moonD - WORLD.moonSOI) / (Math.max(f.speed, 100) * 8));        // keep at least ~8 real seconds before the encounter zone
        if (eff > lim) { eff = Math.max(1, Math.floor(lim)); why = 'reduced: approaching the Moon'; }
      }
      if (f.alt < 100000 && !thrusting && f.vUp < 0 && eff > 10) { eff = 10; why = 'limited to 10× on descent'; }
      if (f.phase === 'ready') eff = 1;
    } else if (!f.lunarFail) { eff = f.missed ? 20 : (f.outcome.success ? (f.alt > 300000 ? 100 : 10) : (f.alt > 100000 ? 1 : 3)); }   // never fast-forward a failure: the player must see what happened, not be flung away
    S.effWarp = eff; S.warpWhy = why;
    let budget = dt * eff, n = 0;
    while (budget > 1e-6 && n++ < 3000) {
      if (S.ap && !S.ap.done) S.ap.update();
      let h = f.dtHint(); if (S.ap && !S.ap.done && S.ap.maxStep) h = Math.min(h, S.ap.maxStep);
      h = Math.min(h, budget); f.step(h); budget -= h;
      if (f.phase === 'lunar-arrival' && !c.arrived) { c.arrived = true; if (!(S.ap && !S.ap.done)) setWarp(1); toast('Entered the Moon’s encounter zone.', 'good'); if (!(S.ap && !S.ap.done)) break; }
      if (f.outcome && !c.endAt) { c.endAt = performance.now(); setWarp(1); break; }
      if (S.ap && S.ap.done && !c.apNoted) { c.apNoted = true; toast('Autopilot: ' + S.ap.status, S.ap.infeasible ? 'bad' : 'good'); }
    }
    if (f.events.length > c.lastEv) { for (let i = c.lastEv; i < f.events.length; i++) if (f.events[i].type === 'bad' || f.events[i].type === 'warn') toast(f.events[i].msg, f.events[i].type === 'bad' ? 'bad' : ''); c.lastEv = f.events.length; if (S.warp > 10 && f.events.slice(-1)[0].type !== 'info') setWarp(10); }
    if (c.endAt && !c.reported) {
      const since = (performance.now() - c.endAt) / 1000; const settled = f.grounded || f.lunarCrashed || (S.fview && S.fview.lunarCrashed);
      const limit = f.outcome.success ? 5 : f.lunarFail ? 8 : f.missed ? 10 : (settled ? 3 : (f.alt > 100000 ? 4 : 12));
      if (since > limit) { c.reported = true; finalizeFlight(); }
    }
  }
  updateSafe(); S.fview.update(dt, f);
  updateHud(f, c);
}
function updateHud(f, c) {
  if (!$('#tAlt')) return; const t = f.telemetry(), g = id => $(id); const moonFrame = t.ref === 'Moon';
  const alt = Math.max(0, t.alt); g('#tAlt').innerHTML = (alt >= 10000 ? fmtN(alt / 1000, 1) + ' <small>km</small>' : fmtN(alt) + ' <small>m</small>');
  g('#tAltLbl').textContent = moonFrame ? 'ALTITUDE ABOVE THE LUNAR SURFACE' : 'ALTITUDE ABOVE EARTH’S SURFACE';
  g('#tSpd').textContent = fmtN(t.speed) + ' m/s'; g('#tVs').textContent = moonFrame ? '—' : fmtN(t.vUp) + ' m/s'; g('#tHs').textContent = moonFrame ? fmtN(t.vEast) + ' m/s' : fmtN(t.vEast) + ' m/s';
  const fl2 = v => Number.isFinite(v) ? fmtLen(v) : '—';
  g('#tAp').textContent = moonFrame ? (t.bound ? fl2(t.ap) : '—') : (t.bound ? fmtLen(t.ap) : t.vinf !== undefined ? '∞ (escape)' : '—'); g('#tPe').textContent = fl2(t.pe);
  g('#tT').textContent = c.state === 'countdown' ? 'T-' + Math.ceil(c.cd) : 'T+' + fmtT(t.t);
  const pct = t.fuelPct * 100; g('#tFuel').textContent = pct <= 0 ? '0%' : pct < 1 ? '<1%' : fmtN(pct) + '%'; g('#bFuel').style.width = Math.max(0, Math.min(100, pct)) + '%';
  g('#tThr').textContent = fmtN(t.thrust / 1000) + ' kN'; g('#tTwr').textContent = t.twr.toFixed(2); g('#tMass').textContent = fmtN(t.mass) + ' kg'; g('#tDv').textContent = fmtN(t.dvRemaining) + ' m/s';
  g('#tQ').textContent = fmtN(t.q / 1000, 1) + ' / ' + fmtN(t.qLimit / 1000) + ' kPa'; g('#bQ').style.width = Math.min(100, t.q / t.qLimit * 100) + '%';
  g('#tPh').textContent = t.phase; g('#tSt').textContent = t.stage === 'core' ? 'Core' + (t.boosters ? ' + boosters' : '') : 'Upper'; g('#tHeat').textContent = fmtN(t.heat, 1);
  const st = g('#tStatus'); st.textContent = t.status; st.className = 'statusline ' + (t.status.startsWith('POWERED') || t.status.startsWith('BURNING') ? 'on' : t.status.startsWith('COASTING') ? 'coast' : t.status.includes('FAILED') ? 'bad' : '');
  g('#lblThr').textContent = Math.round(t.throttle * 100) + '%'; g('#lblPitch').textContent = Math.round(t.pitch) + '°'; if (document.activeElement !== g('#slPitch')) g('#slPitch').value = Math.max(-10, Math.min(90, f.prograde ? t.pitch : f.targetPitch));
  const fl = c.state === 'flying' && !f.outcome, apOn = !!(S.ap && !S.ap.done);
  g('#bBoost').hidden = !f.an.hasBoosters || !f.boostersAttached; g('#bBoost').disabled = !fl; g('#bStage').hidden = !f.an.hasUpper || f.stage !== 'core'; g('#bStage').disabled = !fl;
  g('#bPay').disabled = !fl || !f.payloadAttached; g('#bCap').hidden = !(f.mission.captureDv && f.phase === 'lunar-arrival'); g('#bDes').hidden = !(f.mission.id === 'lunar-land' && f.phase === 'lunar-orbit'); g('#bEnd').disabled = !fl;
  g('#slThr').disabled = !fl || apOn; g('#slPitch').disabled = !fl || apOn; if (document.activeElement !== g('#slThr')) g('#slThr').value = Math.round(t.throttle * 100);
  g('#bAbort').hidden = c.state !== 'countdown'; g('#bEnd').hidden = c.state === 'countdown';
  { const mq = g('#maxqState'), lim = t.qLimit, active = fl && f.maxQAssist && t.effThrottle < t.throttle - 0.005 && t.q > 0.6 * lim; const solid = f.boostersAttached && f.fuelB > 0;
    mq.textContent = !f.maxQAssist ? 'LIMITER OFF' : active ? `LIMITING THRUST ${Math.round(t.effThrottle * 100)}% of ${Math.round(t.throttle * 100)}%` : 'LIMITER ARMED'; mq.className = 'mono maxq-state ' + (!f.maxQAssist ? 'off' : active ? 'act' : 'arm');
    mq.title = 'The limiter reduces core/upper-stage throttle when dynamic pressure nears the structural limit. It cannot throttle solid boosters' + (solid ? ' (attached now)' : '') + ' and cannot protect against excess speed in dense air.'; }
  const ab = g('#bAP'); ab.disabled = !fl; ab.textContent = apOn ? '🤖 Autopilot ON — click to take over' : '🤖 Autopilot'; ab.classList.toggle('on', apOn);
  g('#apStatus').textContent = S.ap ? (apOn ? S.ap.status : 'Autopilot finished: ' + S.ap.status) : (f.usedAutopilot ? 'Assisted flight (no manual-pilot bonus)' : 'Manual flight (earns +10% manual-pilot bonus on success)');
  g('#warpInfo').textContent = S.paused ? 'PAUSED' : `${fmtN(S.effWarp || 1)}×${S.warpWhy ? ' · ' + S.warpWhy : ''}`;
  g('#objList').innerHTML = liveCriteria(f).map(x => `<div class="check ${x.ok ? 'ok' : ''}"><i>${x.ok ? '✔' : '○'}</i><span>${esc(x.t)}</span></div>`).join('');
  g('#hint').textContent = hintFor(f, c);
  const burnable = f.usableFuel(), empty = burnable <= 0.5 && f.phase !== 'ready' && !f.outcome && !moonFrame, bo = g('#burnout'); bo.hidden = !empty;
  if (empty) bo.innerHTML = f.stage === 'core' && f.fuelUp > 1 ? '<b>CORE STAGE EMPTY: engine off.</b> Press <b>Separate stage</b> to light the upper-stage engine.' : '<b>COASTING — NO THRUST.</b> No propellant is left, so the engine is off and throttle does nothing. The vehicle keeps moving with the speed it has, pulled only by gravity. Watch the path line; if it cannot reach the goal the mission will end with a report.';
  const lunarM = !!f.mission.captureDv && !moonFrame && !f.outcome; g('#moonRows').hidden = !lunarM;
  const pi = S.fview && S.fview.pathInfo;
  if (lunarM) { g('#tMoon').textContent = fmtLen(t.moonAlt); g('#tTraj').innerHTML = !pi ? '<span class="dim">—</span>' : pi.hit ? `<span class="good-t">✔ passes ${fmtLen(pi.minD)} from Moon</span>` : `<span class="warn-t">✖ misses by ${fmtLen(Math.max(0, pi.minD - WORLD.moonSOI))}</span>`; }
  // on-screen tags: Moon (always on lunar missions), plus Earth and vehicle in the map view
  const tag = (id, txt, wx, wy, clamp = true) => { const el = g(id); if (!el || !S.fview) return; const sp = S.fview.screenOf(wx, wy); let x = sp.x, y = sp.y, off = false; if (sp.behind) { x = sp.w / 2; y = sp.h - 60; off = true; } const m = 46; if (x < m || x > sp.w - m || y < m || y > sp.h - m) { off = true; x = Math.max(m, Math.min(sp.w - m, x)); y = Math.max(m + 40, Math.min(sp.h - 110, y)); } el.hidden = false; el.style.left = x + 'px'; el.style.top = y + 'px'; el.textContent = (off ? '◂ ' : '') + txt; el.classList.toggle('off', off); };
  const MP = WORLD.moonPos();
  if (f.mission.captureDv && !moonFrame) tag('#tagMoon', `MOON · ${fmtLen(t.moonAlt)}`, MP.x, MP.y); else g('#tagMoon').hidden = true;
  if (S.fview && S.fview.mapView) { tag('#tagEarth', 'EARTH', 0, 0); tag('#tagYou', 'YOU', f.x, f.y); } else { g('#tagEarth').hidden = true; g('#tagYou').hidden = true; }
  const ev = g('#evLog'); if (ev.dataset.n != f.events.length) { ev.dataset.n = f.events.length; ev.innerHTML = f.events.slice(-14).reverse().map(e => `<div class="${e.type}">T+${fmtT(e.t)} ${esc(e.msg)}</div>`).join(''); }
}
function finalizeFlight() {
  const c = S.fc; const rep = store.recordFlight(c.flight, { fee: c.fee }); c.state = 'done'; $('#hud').innerHTML = ''; $('#flightbar').innerHTML = '';
  showReport(rep, true);
}
function reportHtml(r) {
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `<div class="row" style="justify-content:space-between"><div><div class="result ${r.success ? 'ok' : 'fail'}">${r.success ? 'MISSION SUCCESS' : 'MISSION FAILED'}</div><div class="dim">${esc(r.missionName)} · ${new Date(r.at).toLocaleString()}</div></div><button class="btn" data-close>Close</button></div>
  <p style="margin-top:10px"><b>${r.success ? 'Outcome' : 'Cause'}:</b> ${esc(r.cause)}</p>${r.assisted ? '<p class="dim"><b>Assisted flight:</b> the autopilot flew part or all of this mission.</p>' : ''}<p class="dim"><b>Objective:</b> ${esc(r.objective)}</p>
  <div class="grid2" style="margin-top:8px"><div><h2>Key telemetry (simulated)</h2><dl class="kv">${row('Flight duration', fmtT(r.duration))}${row('Max altitude (above Earth)', fmtLen(r.maxAlt))}${row('Max speed', fmtN(r.maxSpeed) + ' m/s')}${row('Max dynamic pressure', fmtN(r.maxQ / 1000, 1) + ' kPa')}${row('Propellant remaining', fmtN(r.fuelRemainingPct) + '%')}${row('Liftoff mass', fmtN(r.analysis.m0) + ' kg')}${row('Liftoff TWR', r.analysis.twr.toFixed(2))}${row('Estimated Δv', fmtN(r.analysis.dv) + ' m/s')}</dl>
    <h2 style="margin-top:12px">Vehicle configuration</h2><dl class="kv">${Object.entries(r.vehicle).map(([k, v]) => row(k, esc(v))).join('')}</dl></div>
  <div><h2>Resources</h2><dl class="kv">${row('Credits before launch', fmtN(r.resourcesBefore.credits))}${row('Launch fee', '−' + fmtN(r.fee))}${row('Credits now', fmtN(r.resourcesAfter.credits))}${row('Science Gems before', fmtN(r.resourcesBefore.gems))}${row('Science Gems now', fmtN(r.resourcesAfter.gems))}</dl>
    <h2 style="margin-top:12px">Rewards earned</h2>${r.rewards.lines.map(l => `<div class="finding ${r.success ? 'ok' : 'warn'}">${esc(l)}</div>`).join('')}</div></div>
  <h2 style="margin-top:12px">Your decisions</h2><div class="events">${r.decisions.length ? r.decisions.map(d => `<div>T+${fmtT(d.t)} ${esc(d.msg)}</div>`).join('') : '<div class="dim">No manual decisions were recorded.</div>'}</div>
  <h2 style="margin-top:12px">Flight events</h2><div class="events">${r.events.map(e => `<div class="${e.type}">T+${fmtT(e.t)} ${esc(e.msg)}</div>`).join('')}</div>
  <h2 style="margin-top:12px">Recommendations</h2>${r.recommendations.map(x => `<div class="finding">${esc(x)}</div>`).join('')}`;
}
function showReport(r, withActions) {
  modal(reportHtml(r) + (withActions ? `<div class="row" style="margin-top:14px"><button class="btn primary" id="rpLab">Improve vehicle (Lab)</button><button class="btn" id="rpCtl">Mission Control</button><button class="btn" id="rpMap">Campaign map</button>${r.success && r.rewards.gems ? '<button class="btn" id="rpJuke">Spend gems in the Jukebox</button>' : ''}</div>` : ''), () => { if (withActions) { S.fc = null; renderFlightIdle(); } });
  if (withActions) { $('#rpLab').onclick = () => { closeModal(); show('lab'); }; $('#rpCtl').onclick = () => { closeModal(); show('control'); }; $('#rpMap').onclick = () => { closeModal(); show('map'); }; const j = $('#rpJuke'); if (j) j.onclick = () => { closeModal(); show('juke'); }; }
  updateWallet();
}
document.addEventListener('click', e => { const b = e.target.closest('#flightbar button, #hud button'); if (b && e.detail > 0) b.blur(); });   // mouse clicks must not leave focus on a button that Space/Enter would trigger again
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.view === 'flight' && S.fc && S.fc.state === 'countdown' && !$('#modal').classList.contains('on')) { abortCountdown(); return; }
  if (S.view !== 'flight' || !S.fc || S.fc.state !== 'flying' || e.target.tagName === 'SELECT' || e.repeat && !['ArrowUp', 'ArrowDown', 'Shift', 'Control'].includes(e.key)) return;
  if ((e.key === ' ' || e.key === 'Enter') && /^(BUTTON|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;   // a focused control handles its own activation
  const f = S.fc.flight; if (f.outcome) return;
  const k = e.key.toLowerCase(), thr = f.throttle, sl = $('#slThr');
  if (k === 'z') f.setThrottle(1); else if (k === 'x') f.setThrottle(0); else if (e.key === 'Shift') f.setThrottle(thr + 0.1); else if (e.key === 'Control') f.setThrottle(thr - 0.1);
  else if (e.key === 'ArrowUp') { f.setPitch(f.targetPitch + 2); e.preventDefault(); } else if (e.key === 'ArrowDown') { f.setPitch(f.targetPitch - 2); e.preventDefault(); }
  else if (k === 'h') hudToggle('all'); else if (k === 'g') $('#bPro').click(); else if (k === 'm') $('#bMaxq').click(); else if (k === 'b') $('#bBoost').click(); else if (k === 'n') $('#bStage').click(); else if (k === 'p') $('#bPay').click(); else if (k === 'c') $('#bCap').click();
  else if (k === 'v') toggleMap(); else if (e.key === ' ') { togglePause(); e.preventDefault(); } else if (k === 'o') toggleAutopilot();
  else if (k === ',') setWarp([1, 10, 100, 1000, 10000][Math.max(0, [1, 10, 100, 1000, 10000].indexOf(S.warp) - 1)]); else if (k === '.') setWarp([1, 10, 100, 1000, 10000][Math.min(4, [1, 10, 100, 1000, 10000].indexOf(S.warp) + 1)]);
});

// ====================== EARTH JUKEBOX ======================
function ensureJuke() {
  if (S.juke || S.glFail.jukeCanvas) return;
  try {
    const cv = $('#jukeCanvas'); S.juke = new JukeboxView(cv, { reduceMotion: REDUCED }); S.sonifier = new Sonifier();
    const st = store.get(); S.juke.setRecords(RECORDS, st.records, S.jukeSel);
    { let drag = null; const dist = () => drag ? Math.hypot(drag.dx, drag.dy) : 0;
      cv.addEventListener('pointerdown', e => { if (S.juke && S.juke.viewing) { drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } } });
      cv.addEventListener('pointermove', e => { if (drag) { const mx = e.clientX - drag.x, my = e.clientY - drag.y; S.juke.dragBy(mx - drag.dx, my - drag.dy); drag.dx = mx; drag.dy = my; } });
      const end = () => { if (drag) { S._dragMoved = dist() > 4; drag = null; setTimeout(() => { S._dragMoved = false; }, 0); } };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
      cv.addEventListener('wheel', e => { if (S.juke && S.juke.viewing) { e.preventDefault(); S.juke.zoomBy(e.deltaY > 0 ? 1.06 : 0.94); } }, { passive: false }); }
    cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); S.juke.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1); });
    cv.addEventListener('click', e => { if (S._dragMoved) return; const r = cv.getBoundingClientRect(); const sl = S.juke.slotAt(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)); if (sl) selectRecord(sl.rec.id); });
    S.sonifier.onStep((i, state) => { if (!S.jukeData) return; const A = S.jukeData.series.A.values[i], B = S.jukeData.series.B.values[i]; S.juke.setStep(i, S.sonifier.norm(A), S.sonifier.norm(B)); updateStepReadout(i); });
  } catch (e) { noGL($('#jukeCanvas'), e); }
}
function stopJuke(instant) { if (S.sonifier) S.sonifier.stop(true); if (S.juke) S.juke.stop(instant); S.jukeToken++; renderDeck(); }
function jukeState() { return S.juke ? S.juke.state : 'idle'; }
async function selectRecord(id) {
  const rec = getRecord(id), owned = store.get().records.includes(id); S.jukeSel = id; S.jukeToken++;
  // Switching discs: stop the sound, take the old record off the turntable and forget its data BEFORE anything new loads,
  // so the old chart/hologram/audio can never be played under the new selection (e.g. Play pressed while the new data is still loading).
  if (S.sonifier) S.sonifier.stop(true); if (S.juke) { S.juke.eject(); S.juke.highlight(id); }
  S.jukeData = null; S.jukeLoaded = null;
  if (!owned) { setStatus(`"${rec.title}" is locked. Unlock it for ${rec.cost} Science Gems.`); renderJukeSide(); renderDeck(); return; }
  await insertSelected();
}
async function insertSelected() {
  const rec = getRecord(S.jukeSel); if (!rec || !S.juke) return; const tok = ++S.jukeToken;
  setStatus(`Loading "${rec.title}"…`); renderDeck();
  const data = await loadRecordData(rec); if (tok !== S.jukeToken) return;
  S.jukeData = data; S.sonifier.load(rec, data); S.sonifier.setVoices(S.voices); S.juke.setRecordTheme(rec, data);
  setStatus(`Inserting "${rec.title}" onto the turntable…`); renderJukeSide(); renderDeck();
  const ok = await S.juke.insert(rec.id); if (tok !== S.jukeToken || !ok) return;
  S.jukeLoaded = rec.id; setStatus(`"${rec.title}" is on the turntable. Press Play to project the Earth hologram.`); renderDeck(); renderJukeSide();
}
function jukePlay() {
  const st = jukeState(); if (!S.juke || !S.sonifier) return;
  if (!S.sonifier.supported()) toast('Web Audio is not available in this browser; the visuals will still play.', 'bad');
  if (st === 'loaded') { if (S.juke.play()) { { const rr = getRecord(S.jukeSel); if (rr && S.jukeData) store.noteRecordPlayed(rr.id, Math.max(0, S.sonifier.step), S.jukeData.labels[Math.max(0, S.sonifier.step)]); } S.sonifier.play().then(ok => { if (!ok) toast('Audio could not start. Click Play again.', 'bad'); }); setStatus('Playing: the data drives the hologram and the sound.'); } }
  else if (st === 'paused') { S.juke.resume(); S.sonifier.resume(); setStatus('Playing.'); }
  renderDeck();
}
function jukePause() { if (jukeState() !== 'playing') return; S.juke.pause(); S.sonifier.pause(); setStatus('Paused.'); renderDeck(); }
function jukeStop() { if (!S.juke) return; S.sonifier.stop(); S.juke.stop(false); setStatus('Stopped. The record stays on the turntable.'); S.juke.drawScreen(0); renderDeck(); }
function setStatus(t) { const e = $('#jukeStatus'); if (e) e.textContent = t; }
function renderDeck() {
  const d = $('#deck'); if (!d) return; const st = jukeState(), rec = S.jukeSel ? getRecord(S.jukeSel) : null, owned = rec && store.get().records.includes(rec.id), gems = store.get().gems;
  const can = owned && (st === 'loaded' || st === 'paused' || st === 'playing');
  d.innerHTML = `<div class="transport"><button class="btn primary" id="dPlay" ${st === 'loaded' || st === 'paused' ? '' : 'disabled'}>${st === 'paused' ? '▶ Resume' : '▶ Play'}</button><button class="btn" id="dPause" ${st === 'playing' ? '' : 'disabled'}>❚❚ Pause</button><button class="btn" id="dStop" ${st === 'playing' || st === 'paused' ? '' : 'disabled'}>■ Stop</button></div>
  <div class="ctl" style="min-width:130px"><label for="dVol">Volume (capped)</label><input type="range" id="dVol" min="0" max="100" value="${Math.round((S.sonifier ? S.sonifier.volume : 0.6) * 100)}"></div>
  <button class="btn sm ${S.sonifier && S.sonifier.muted ? 'on' : ''}" id="dMute" aria-pressed="${!!(S.sonifier && S.sonifier.muted)}" title="Mute or unmute the sonification">${S.sonifier && S.sonifier.muted ? '🔇 Muted' : '🔊 Mute'}</button><button class="btn sm" id="dReset" title="Reset the camera and the globe angle">⟲ Reset view</button><button class="btn sm ${S.jukeClean ? 'on' : ''}" id="dClean" aria-pressed="${!!S.jukeClean}" title="Hide or show the text on top of the 3D scene">${S.jukeClean ? 'Show text' : 'Hide text'}</button>
  <div class="ctl" style="min-width:110px"><label for="dSpd">Speed</label><select id="dSpd" style="background:#0a1328;border:1px solid var(--rule2);padding:5px">${[0.5, 0.75, 1, 1.5, 2].map(v => `<option value="${v}" ${S.sonifier && S.sonifier.speed === v ? 'selected' : v === 1 && !S.sonifier ? 'selected' : ''}>${v}×</option>`).join('')}</select></div>
  <div class="ctl" style="min-width:110px"><label for="dPitch">Pitch (semitones)</label><select id="dPitch" style="background:#0a1328;border:1px solid var(--rule2);padding:5px">${[-12, -7, -5, 0, 5, 7, 12].map(v => `<option value="${v}" ${(S.sonifier ? S.sonifier.pitch : 0) === v ? 'selected' : ''}>${v > 0 ? '+' : ''}${v}</option>`).join('')}</select></div>
  ${rec && !owned ? `<button class="btn go" id="dBuy" ${gems >= rec.cost ? '' : ''}>Unlock · ${rec.cost} gems</button>` : ''}${rec && owned && st === 'idle' ? '<button class="btn" id="dIns">Insert record</button>' : ''}`;
  $('#dClean').onclick = () => { S.jukeClean = !S.jukeClean; try { localStorage.setItem('orbital.jukeclean', S.jukeClean ? '1' : '0'); } catch (e) { /* optional */ } renderDeck(); }; { const jv = $('#v-juke'); jv.classList.toggle('playing', st === 'playing' || st === 'paused'); jv.classList.toggle('clean', !!S.jukeClean); } $('#dPlay').onclick = jukePlay; $('#dPause').onclick = jukePause; $('#dStop').onclick = jukeStop;
  $('#dVol').oninput = e => S.sonifier && S.sonifier.setVolume(e.target.value / 100); $('#dMute').onclick = () => { if (!S.sonifier) return; S.sonifier.setMuted(!S.sonifier.muted); renderDeck(); }; $('#dReset').onclick = () => S.juke && S.juke.resetView();
  { const h = $('#holoReadout'); if (h && !(st === 'playing' || st === 'paused')) h.hidden = true; } $('#dSpd').onchange = e => S.sonifier && S.sonifier.setSpeed(+e.target.value); $('#dPitch').onchange = e => S.sonifier && S.sonifier.setPitch(+e.target.value);
  const b = $('#dBuy'); if (b) b.onclick = () => buyRecord(rec); const i = $('#dIns'); if (i) i.onclick = insertSelected;
}
function buyRecord(rec) {
  const g = store.get().gems, after = g - rec.cost;
  if (after < 0) { modal(`<h2>Not enough Science Gems</h2><p><b>${esc(rec.title)}</b> costs <b class="good-t">${rec.cost} gems</b> and you have <b>${g}</b>. You need ${-after} more.</p><p class="dim">Gems come from: the <b>first completion</b> of each mission (1–6 gems), flying a hard mission with 25%+ propellant left (+1), and solving each record's discovery question (+1). There are enough gems in the game to unlock every record, in any order.</p><div class="row"><button class="btn primary" id="gmCtl">Go to Mission Control</button><button class="btn" data-close>Close</button></div>`); $('#gmCtl').onclick = () => { closeModal(); show('control'); }; return; }
  modal(`<h2>Unlock ${esc(rec.title)}?</h2><p>${esc(rec.subtitle)}. Dataset: ${esc(rec.source.title)}.</p><table class="compare"><tr><th></th><th>Now</th><th>After</th></tr><tr><td>Science Gems</td><td class="num">${g}</td><td class="num">${after}</td></tr></table><p class="dim" style="font-size:12.5px">The record is unlocked permanently and stays unlocked after you reload the page. You can unlock the others later in any order.</p><div class="row"><button class="btn primary" id="gmY">Unlock for ${rec.cost} gems</button><button class="btn" data-close>Not now</button></div>`);
  $('#gmY').onclick = () => { closeModal(); const r = store.buyRecord(rec.id, rec.cost); toast(r.msg, r.ok ? 'good' : 'bad'); if (r.ok) { if (S.juke) S.juke.setRecords(RECORDS, store.get().records, S.jukeSel); selectRecord(rec.id); } };
}
function recStateTag(rec) { const st = jukeState(), owned = store.get().records.includes(rec.id); if (!owned) return `<span class="tag lock" title="Locked: costs ${rec.cost} Science Gems">🔒 ${rec.cost} gems</span>`; if (S.jukeSel === rec.id && st === 'playing') return '<span class="tag ok">playing</span>'; if (S.jukeSel === rec.id && (st === 'loaded' || st === 'paused')) return '<span class="tag ok">inserted</span>'; if (S.jukeSel === rec.id) return '<span class="tag">selected</span>'; return '<span class="tag ok">owned</span>'; }
function badge(d) {
  const st = statusLabel(d);
  return `<span class="badge-data ${st.cls}" title="${esc(d.note || st.text)}">${esc(st.text)}</span>`;
}
// Each Jukebox record that has a live NASA page (see /live) gets a link to it.
// Each Jukebox record has a RELATED live NASA page (see /live). The live page is a different, real-time NASA API product from the record's own
// dataset (which is illustrative or provisional); the link says exactly what the page shows so the two are never confused.
const LIVE_PAGES = {
  rec_fire: { url: 'live/fire.html', what: 'open wildfire EVENTS from NASA EONET (event count, not FIRMS active-fire detections)' },
  rec_ice: { url: 'live/arctic.html', what: 'Arctic air temperature (NASA POWER) and sea-ice EVENTS (NASA EONET), not the NSIDC Sea Ice Index' },
  rec_ocean: { url: 'live/ocean.html', what: 'coastal AIR temperature at Alexandria (NASA POWER), not MODIS-Aqua chlorophyll' },
  rec_air: { url: 'live/air.html', what: 'surface solar irradiance over Cairo (NASA POWER), not MERRA-2 aerosol optical thickness' },
  rec_land: { url: 'live/earth.html', what: 'all open natural EVENTS on Earth (NASA EONET), not MODIS NDVI greenness' },
  rec_storm: { url: 'live/storm.html', what: 'active severe-storm EVENTS (NASA EONET), not GPM IMERG rainfall' },
  rec_temperature: { url: 'live/fever.html', what: 'a 12-month temperature series at one point from NASA POWER, not the GISTEMP global anomaly' },
};
function liveLink(rec) { const l = LIVE_PAGES[rec.id]; if (l && S.jukeData && S.jukeData.live) return `<p style="margin:10px 0 0"><a class="btn sm go" href="${l.url}" target="_blank" rel="noopener">🛰 Open the full live NASA page</a></p>`; return l ? `<p style="margin:10px 0 0"><a class="btn sm go" href="${l.url}" target="_blank" rel="noopener" title="Opens a related live NASA page in a new tab. It is a different product from this record's own dataset.">🛰 Related live NASA page</a></p><p class="dim" style="font-size:11.5px;margin:4px 0 0">The live page shows ${esc(l.what)}. It is a different product from this record's data.</p>` : ''; }
// provenance / source / status panel. Which text appears depends ONLY on the status of the data that is really loaded.
function sourcePanel(rec, d) {
  const src = rec.source, pv = d.provenance, st = statusLabel(d);
  const statusClass = (st.short === 'observed' || st.short === 'live') ? 'ok' : st.short === 'rejected' ? 'block' : 'warn';
  const statusBox = `<div class="finding ${statusClass}"><b>${esc(st.text)}</b><div>${esc(d.note || 'No additional data-status notes are available.')}</div></div>`;
  const rejected = d.status === 'rejected' ? `<div class="finding block"><b>DATA FILE REJECTED</b><ul style="margin:4px 0 0;padding-left:18px">${(d.rejected || []).slice(0, 6).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : '';
  const load = d.loadError ? `<div class="finding warn"><b>DATA FILE PROBLEM</b>${esc(d.loadError)}</div>` : '';
  const rows = [['Data status', st.text], ['Dataset', pv ? pv.dataset : src.title], ['Producer', pv ? pv.producer : src.org], ['Product / version', src.version || 'not specified / not selected'], ['DOI', src.doi || 'No product-specific DOI recorded'], ['License / citation', src.license || 'See producer data-use and citation policy'], ['Variable', rec.variable], ['Units', d.units || rec.unit], ['Region / coverage', src.coverage], ['Processing / aggregation', src.processing], ['Period A', pv ? pv.periodA : '—'], ['Period B', pv ? pv.periodB : '—'], ['Copy retrieved', pv ? pv.retrieved : '—'], ['Limitations', src.limitations]];
  const mirrorInfo = pv && pv.mirrorUrl ? `<p class="finding warn"><b>Secondary copy source</b><br><a href="${esc(pv.mirrorUrl)}" target="_blank" rel="noopener">${esc(pv.mirrorUrl)}</a><br>${esc(pv.mirrorNote || 'The secondary copy has not been independently verified against the official source.')}</p>` : '';
  return `<h2>Source</h2><p style="font-size:12.5px"><b>${esc(src.title)}</b><br>${esc(src.org)}<br><a href="${src.url}" target="_blank" rel="noopener">${esc(src.url)}</a>${src.csvUrl ? `<br>Official table: <a href="${src.csvUrl}" target="_blank" rel="noopener">${esc(src.csvUrl)}</a>` : ''}</p>${statusBox}${rejected}${load}${mirrorInfo}<dl class="kv" style="font-size:12.5px">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="dim" style="font-size:12px">The chart, hologram and sound use the same loaded record values. A related Live NASA page, when present, is a separate data product and is described separately. Both series cover the same ${d.labels.length} time steps${rec.refLine !== undefined ? ' (series A is the zero reference line, not a measurement)' : ''}. Full methodology: Science Lab.</p>`;
}
function legendPanel(rec, d) {
  const all = [...d.series.A.values, ...d.series.B.values], mn = Math.min(...all), mx = Math.max(...all), u = esc(d.units || rec.unit);
  const fmt = v => (Math.round(v * 1000) / 1000).toString();
  return `<details class="legend"><summary>Colour &amp; scale legend</summary><div style="font-size:12.5px;line-height:1.6"><span class="sw2" style="background:${rec.palette.main}"></span> main colour · <span class="sw2" style="background:${rec.palette.accent}"></span> accent colour<br>Range shown: <b>${fmt(mn)}</b> to <b>${fmt(mx)}</b> (${u}).<br>Normalisation: each value is scaled <code>(v − min) / (max − min)</code> over the range above; that 0–1 number drives the glow, the pitch and the chart marker, so all three always use the same time step.${rec.refLine !== undefined ? `<br><b>Zero line</b> = the ${d.live ? '1991–2020' : '1951–1980'} average for the same calendar month. Above the line = warmer than that average. It is a reference, not a measured series.` : ''}<br>${d.points && d.points.length ? (d.pointsAreIllustrative ? 'Spikes on the globe mark locations of interest for this record.' : 'Spikes on the globe mark the locations in the data file.') : 'This is a global series: there are no locations, so no spikes or hot-spots are drawn. The whole globe glows with the value.'}</div></details>`;
}
function renderJukeSide() {
  const side = $('#jukeSide'); if (!side) return; const rec = S.jukeSel ? getRecord(S.jukeSel) : null;
  const lockedNext = RECORDS.filter(r => !store.get().records.includes(r.id)).sort((a, b) => a.cost - b.cost)[0];
  const gemPanel = `<div class="gembar"><span>Science Gems <b>${store.get().gems}</b>${lockedNext ? ` <span class="dim">· next: ${esc(lockedNext.title)} (${lockedNext.cost})</span>` : ''}</span><button class="btn sm" data-help="money" aria-label="How gems work" title="How gems work">?</button></div>`;
  const dataNote = `<div class="finding warn" style="margin:8px 0"><b>Live NASA data</b><div>Records load live from NASA EONET (natural-event counts) and NASA POWER (point climate data) when you open them. Each badge and Science Lab → Source says exactly which API quantity is plotted. If NASA cannot be reached, the record falls back to clearly labelled illustrative or provisional values.</div></div>`; const list = gemPanel + dataNote + `<p style="margin:0 0 8px"><a class="btn sm" href="live/index.html" target="_blank" rel="noopener">🛰 All live NASA pages</a></p><div class="reclist">${RECORDS.map(r => `<button class="rec ${r.id === S.jukeSel ? 'sel' : ''}" data-rec="${r.id}" aria-label="${esc(r.title)}, ${store.get().records.includes(r.id) ? 'owned' : 'locked, ' + r.cost + ' gems'}"><span class="sw" style="background:radial-gradient(circle at 50% 50%, ${r.palette.main} 0 22%, #0b0b0e 24%)"></span><span><span><b>${esc(r.title)}</b><small>${esc(r.subtitle)}</small></span>${recStateTag(r)}</span></button>`).join('')}</div>`;
  let detail = '<p class="dim">Click a record sleeve on the 3D rack (or choose one above). Unlocked records slide out of the sleeve, fly to the turntable and settle on the spindle. Press Play to project the Earth hologram.</p>';
  if (rec) {
    const owned = store.get().records.includes(rec.id), d = S.jukeData && S.jukeData.series ? S.jukeData : null, n = d ? d.labels.length : 0;
    const tab = S.jukeTab || 'data';
    detail = `${owned && d ? `<div class="jtabs" role="tablist" aria-label="Record details">${[['data', 'Data'], ['explain', 'How it works'], ['source', 'Source'], ['quiz', 'Quiz']].map(([k, t]) => `<button role="tab" data-jt="${k}" aria-selected="${tab === k}">${t}</button>`).join('')}</div>` : ''}<div class="jt" data-t="data"><div class="panel"><div class="row" style="justify-content:space-between"><h3>${esc(rec.title)}</h3>${d && owned ? badge(d) : ''}</div><div class="dim">${esc(rec.subtitle)}</div>
    ${owned && d ? `<canvas class="chart" id="jChart" width="760" height="360" role="img" aria-label="Chart of ${esc(rec.variable)} over ${n} time steps${rec.singleSeries ? ' with a zero reference line' : ' for two periods'}"></canvas>
      <div class="row" style="margin-top:8px;align-items:center"><label for="jTime" class="dim" style="font-size:12px">Time step</label><input type="range" id="jTime" min="0" max="${n - 1}" step="1" value="${Math.max(0, S.sonifier.step)}" style="flex:1;min-width:120px" aria-label="Time step slider: moves chart, readout, globe and sound to the same step"><button class="btn sm" id="jTimePlay" title="Play the timeline from the current step">▶ Timeline</button></div>
      <div class="row" style="margin-top:6px"><span class="dim" style="font-size:12px">Click the chart or drag the slider to hear that step. ${rec.singleSeries ? 'Series A is the silent zero reference.' : 'Sonify:'}</span>${rec.singleSeries ? '' : ['both', 'A', 'B'].map(v => `<button class="btn sm ${S.voices === v ? 'on' : ''}" data-voice="${v}">${v === 'both' ? 'Both series' : 'Series ' + v}</button>`).join('')}</div>
      <div class="mono" id="jRead" style="margin-top:8px;font-size:12.5px" aria-live="off"></div>${legendPanel(rec, d)}${liveLink(rec)}` : `<p>This record is <b>locked</b>. Unlocking costs <b>${rec.cost} Science Gems</b> (you have ${store.get().gems}). Earn gems by completing campaign missions and solving discovery questions.</p>`}</div></div>
    ${owned && d ? `<div class="jt" data-t="explain"><div class="panel"><h2>What you are seeing</h2><p>${esc(rec.explanation)}</p><p class="dim" style="font-size:12.5px"><b>Hologram:</b> ${hologramNote(rec, d)}</p></div>
<div class="panel" style="margin-top:10px"><h2>How the data becomes sound</h2><p style="font-size:13px">${esc(rec.sound.map)}</p><p class="dim" style="font-size:12px">Variable: ${esc(rec.variable)} (${esc(rec.unit)}).</p></div></div>
    <div class="jt" data-t="source"><div class="panel" id="eicBox"></div><div class="panel" style="margin-top:10px">${liveLink(rec)}${sourcePanel(rec, d)}</div></div>
    <div class="jt" data-t="quiz"><div class="panel quiz" id="quizBox"></div></div>` : ''}`;
  }
  side.innerHTML = list + detail; side.dataset.jt = (rec && store.get().records.includes(rec.id)) ? (S.jukeTab || 'data') : 'data';
  const c = $('#jChart'); if (c && S.jukeData) {
    drawChart(c, rec, S.jukeData, S.sonifier.step >= 0 ? S.sonifier.step : 0);
    c.onclick = e => { const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * c.width; const pad = c.width * 0.12; const n = S.jukeData.labels.length; const i = Math.round(((x - pad) / (c.width - pad - c.width * 0.04)) * (n - 1)); seekAll(Math.max(0, Math.min(n - 1, i)), true); };
    const sl = $('#jTime'); if (sl) sl.oninput = () => seekAll(+sl.value, true);
    const tp = $('#jTimePlay'); if (tp) tp.onclick = () => { const st = jukeState(); if (st === 'loaded' || st === 'paused') jukePlay(); else if (st === 'playing') toast('The timeline is already playing.'); else toast('Insert the record first.', 'bad'); };
    updateStepReadout(Math.max(0, S.sonifier.step)); renderQuiz();
  }
}
// ONE function moves chart, readout, globe, screen and sound to the same index.
function seekAll(idx, audition) {
  const d = S.jukeData; if (!d || !S.sonifier) return; S.sonifier.seek(idx);   // seek() emits the step to every listener (globe + readout)
  if (audition) S.sonifier.audition(idx);
  const rr = getRecord(S.jukeSel); if (rr) store.noteExamined(rr.id, idx, d.labels[idx]);
}
// EIC / visual-frame panel: states plainly whether any NASA Earth Information Center frame is integrated.
function eicPanel(d, i) {
  const box = $('#eicBox'); if (!box) return; const fr = (d.frames || []);
  if (!fr.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const best = fr.filter(f => f.labelIndex <= i).sort((a, b) => b.labelIndex - a.labelIndex)[0] || fr[0]; const exact = best.labelIndex === i, isEic = best.origin === 'NASA-EIC';
  box.innerHTML = `<h2>${isEic ? 'NASA Earth Information Center frame' : 'Visual frame (not labelled as NASA EIC)'}</h2><figure style="margin:0"><img src="${esc(best.src)}" alt="${esc(best.title)}" style="max-width:100%;border-radius:8px" loading="lazy"><figcaption class="dim" style="font-size:12px"><b>${esc(best.title)}</b> · ${esc(best.date)}${exact ? '' : ` · nearest frame at or before ${esc(d.labels[i])} (${esc(d.labels[best.labelIndex])})`}<br>Credit: ${esc(best.credit)} · <a href="${esc(best.sourceUrl)}" target="_blank" rel="noopener">original asset</a></figcaption></figure>`;
}
const HOLO_NOTES = { fire: 'Ember glow on land and rising sparks scale with the fire-detection value', ocean: 'Ripples across the ocean surface speed up with chlorophyll; blue-green pulses and inward-drifting plankton particles', storm: 'Swirling cloud bands and falling rain particles speed up with the precipitation rate', air: 'A haze layer thickens with aerosol optical thickness while particles orbit the globe', land: 'Land turns green in proportion to the vegetation index and spores rise from the surface', ice: 'White polar caps grow and shrink with the sea-ice extent, with drifting ice crystals', temperature: 'The WHOLE globe warms in tint and its rim glows red-orange as the global anomaly rises. It is a global number, so no location, hot-spot or region is shown' };
function hologramNote(rec, d) {
  const base = HOLO_NOTES[rec.variant] || '';
  if (!d) return base + (rec.spatial === false ? '.' : '; spikes mark locations if the data file contains any.');
  if (!d.points || !d.points.length) return base + (rec.spatial === false ? '.' : '. This data has no locations, so no spikes are drawn.');
  if (d.live) return base + '; spikes mark ' + (rec.id === 'rec_fire' || rec.id === 'rec_storm' || rec.id === 'rec_land' ? 'the latest positions of currently open NASA EONET events.' : 'the single NASA POWER grid point used for this record.');
  return base + (d.pointsAreIllustrative ? '; the spikes mark locations of interest for this record.' : '; spikes mark the observation locations in the data file.');
}
const shortUnit = u => String(u || '').split(' (')[0].replace(/ relative to the .*/, ' vs reference mean');
const shortSeries = d => d.series.B.name.replace(/\s*\(.*\)\s*$/, '');
function updateStepReadout(i) {
  const d = S.jukeData, rec = getRecord(S.jukeSel); if (!d || !rec) return; const c = $('#jChart'); if (c) drawChart(c, rec, d, i); const sl = $('#jTime'); if (sl && +sl.value !== i) sl.value = i;
  const A = d.series.A.values[i], B = d.series.B.values[i], diff = Math.round((B - A) * 100) / 100, u = esc(shortUnit(d.units || rec.unit));
  const r = $('#jRead'); if (r) r.innerHTML = rec.singleSeries ? `${esc(d.labels[i])}: <span style="color:${rec.palette.accent}">${esc(shortSeries(d))} = ${B > 0 ? '+' : ''}${B} ${u}</span> · zero line = ${d.live ? '1991–2020' : '1951–1980'} mean` : `${esc(d.labels[i])}: <span style="color:${rec.palette.main}">A = ${A}</span> · <span style="color:${rec.palette.accent}">B = ${B}</span> ${u} · B − A = ${diff > 0 ? '+' : ''}${diff}`;
  const h = $('#holoReadout'); if (h) { h.hidden = !(S.juke && (S.juke.state === 'playing' || S.juke.state === 'paused')); h.innerHTML = `<div class="t">${esc(d.labels[i])}</div>${rec.singleSeries ? `${B > 0 ? '+' : ''}${B}` : `A ${A} · B ${B}`} ${u}`; }
  eicPanel(d, i);
}
function renderQuiz() {
  const box = $('#quizBox'), rec = getRecord(S.jukeSel); if (!box || !S.jukeData) return; const q = discoveryFor(rec, S.jukeData), solved = store.get().discoveries.includes(rec.id);
  if (q.unavailable) { box.innerHTML = `<h2>Discovery question</h2><p class="dim">${esc(q.q)}</p>`; box.onclick = null; return; }
  box.innerHTML = `<h2>Discovery question ${solved ? '<span class="tag ok">solved</span>' : '<span class="tag">+1 gem</span>'}</h2><p>${esc(q.q)}</p>${q.options.map((o, i) => `<button class="btn" data-q="${i}">${esc(o)}</button>`).join('')}<div id="qFb" class="dim" style="font-size:12.5px"></div><div class="dim" style="font-size:11.5px">The answer is computed from the series shown in the chart.</div>`;
  box.onclick = e => { const b = e.target.closest('[data-q]'); if (!b) return; const ok = +b.dataset.q === q.correct; b.classList.add(ok ? 'right' : 'wrong'); $('#qFb').textContent = ok ? (solved ? 'Correct.' : 'Correct! You earned 1 Science Gem.') : 'Not quite — check the chart and try again.'; if (ok && !solved) { store.solveDiscovery(rec.id); toast('Discovery solved: +1 Science Gem', 'good'); setTimeout(renderQuiz, 900); } };
}
$('#jukeSide').addEventListener('click', e => { const jt = e.target.closest('[data-jt]'); if (jt && jt.tagName === 'BUTTON') { S.jukeTab = jt.dataset.jt; $('#jukeSide').dataset.jt = S.jukeTab; $('#jukeSide').querySelectorAll('.jtabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.jt === S.jukeTab)); return; } const r = e.target.closest('[data-rec]'); if (r) return selectRecord(r.dataset.rec); const v = e.target.closest('[data-voice]'); if (v) { S.voices = v.dataset.voice; S.sonifier && S.sonifier.setVoices(S.voices); renderJukeSide(); } });

// ====================== SCIENCE LAB ======================
function renderScience() {
  $('#v-science').innerHTML = `<div class="row" style="justify-content:space-between"><h1>Science Discovery Lab</h1><button class="btn sm" data-help="gloss">? Glossary</button></div><p class="sub">Sources, methods and limits. Each record below shows the status of the exact values currently plotted.</p><p id="scienceDataSummary" class="finding warn" aria-live="polite">Checking the data files and source-verification status…</p>
  ${RECORDS.map(r => `<div class="panel" style="margin-bottom:14px" id="sci_${r.id}"><div class="row" style="justify-content:space-between"><h3>${esc(r.title)} — ${esc(r.subtitle)}</h3><span data-badge="${r.id}" class="badge-data">checking…</span></div>
  <div class="grid2"><div><p>${esc(r.explanation)}</p><p><b>Sonification:</b> ${esc(r.sound.map)}</p><p class="dim" style="font-size:12.5px"><b>Hologram:</b> <span data-holo="${r.id}">${esc(HOLO_NOTES[r.variant] || '')}.</span></p>
  <div data-sci="${r.id}" class="dim">Loading data status…</div></div>
  <div><canvas class="chart sci" data-rec="${r.id}" width="760" height="360" role="img" aria-label="Chart for ${esc(r.title)}"></canvas><p class="dim" style="font-size:12px" data-cap="${r.id}"></p></div></div></div>`).join('')}
  <div class="panel"><h2>Rocket simulation model and assumptions</h2><ul style="margin:0;padding-left:18px;line-height:1.7"><li><b>Rocket equation:</b> Δv = Isp · g₀ · ln(m₀/m₁), g₀ = 9.80665 m/s². Boosters and the core stage burn in parallel (effective Isp from thrust-weighted flow); an upper stage fires after the core stage is dropped.</li><li><b>Flight integration:</b> 2-D point-mass motion in the orbital plane, symplectic (kick-drift-kick) steps, gravity μ/r², exponential atmosphere (ρ₀ = 1.225 kg/m³, H = 8.5 km), quadratic drag, dynamic pressure q = ½ρv² with a structural limit (Max-Q).</li><li><b>Scaled world:</b> lengths are 1:10 (Earth radius 637 km, Earth–Moon distance 38,440 km) with Earth surface gravity kept at 9.80665 m/s², so game-sized rockets can reach every destination. Orbital periods are therefore shorter than real ones.</li><li><b>Moon:</b> not a gravity source. When the vehicle comes within 5,000 km of the (fixed-position) Moon the game enters a scripted encounter that requires a 600 m/s capture burn (and 1,100 m/s powered descent for landing) with real propellant consumption.</li><li><b>Simplifications:</b> constant Isp per engine, thrust is the same at sea level and in vacuum, no Earth rotation, no wind, no weather, no structural flex, simple re-entry heating.</li><li><b>Parts:</b> all engines, tanks and costs are fictional game values, not real vehicle specifications.</li></ul></div>
  <div class="panel"><h2>Glossary of data terms</h2><dl class="kv" style="grid-template-columns:200px 1fr;text-align:left"><dt>Anomaly</dt><dd>A difference from a reference average. “+1.2 °C” means 1.2 °C warmer than the reference, not 1.2 °C in absolute terms.</dd><dt>Zero line</dt><dd>The reference level (for GISTEMP: the 1951–1980 average of the same calendar month).</dd><dt>Sonification</dt><dd>Turning numbers into sound (pitch, rhythm, brightness) so they can be heard.</dd></dl></div>`;
  const counts = { observed: 0, live: 0, provisional: 0, illustrative: 0, rejected: 0 }; let pending = RECORDS.length;
  RECORDS.forEach(async r => {
    const d = await loadRecordData(r); const k = statusLabel(d).short; counts[k] = (counts[k] || 0) + 1;
    const root = $('#v-science'), q = sel => root.querySelector(sel);
    if (q(`[data-badge="${r.id}"]`)) {
      const b = q(`[data-badge="${r.id}"]`); const label = statusLabel(d); b.style.display = 'inline-block'; b.className = `badge-data ${label.cls}`; b.textContent = label.text; b.title = d.note || label.text;
      q(`[data-holo="${r.id}"]`).textContent = hologramNote(r, d);
      q(`[data-sci="${r.id}"]`).innerHTML = sourcePanel(r, d).replace('<h2>Source</h2>', '<h4 style="margin:6px 0">Source</h4>');
      q(`[data-cap="${r.id}"]`).textContent = `${r.singleSeries ? 'Monthly values with the zero reference line' : 'Two periods compared on one axis'} (${d.units || r.unit}). ${d.labels.length} time steps.`;
      const cv = q(`canvas[data-rec="${r.id}"]`); if (cv) drawChart(cv, r, d, -1);
    }
    --pending;
    if (pending === 0) {
      const summary = q('#scienceDataSummary');
      if (summary) summary.textContent = `Current data inventory: ${counts.live} record(s) fed live by NASA EONET / NASA POWER right now, ${counts.observed} source-verified, ${counts.provisional} provisional, ${counts.illustrative} illustrative (offline fallback), ${counts.rejected} rejected. Live API values are what NASA returned this session; they are not independently verified archive tables.`;
      if (summary) summary.className = `finding ${(counts.observed + counts.live) === RECORDS.length ? 'ok' : 'warn'}`;
    }
  });
}

// ====================== REPORTS ======================
const fmtDate = iso => { try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } };
function explorerHtml(s) {
  const ex = s.explorer, badge = b => { const at = s.achievements[b.id]; return `<div class="badge-card ${at ? 'on' : ''}" title="${esc(b.desc)}"><b>${at ? '🏅' : '🔒'} ${esc(b.name)}</b><small>${at ? 'Earned ' + esc(fmtDate(at)) : esc(b.desc)}</small></div>`; };
  const missions = s.completed.map(id => { const m = getMission(id); const rep = [...s.reports].reverse().find(r => r.mission === id && r.success); return `<li>${esc(m.name)}${rep ? ` — ${esc(fmtDate(rep.at))}` : ''} ${rep ? `<button class="btn sm" data-rep="${s.reports.indexOf(rep)}">Report</button>` : ''}</li>`; }).join('');
  const recs = s.records.map(id => { const r = getRecord(id); if (!r) return ''; const at = ex.recordDates[id], dq = ex.discoveryDates[id]; return `<li><b>${esc(r.title)}</b> ${at ? `· unlocked ${esc(fmtDate(at))}` : '· free starter record'} ${dq ? `· discovery solved ${esc(fmtDate(dq))}` : ''} <button class="btn sm" data-juke="${esc(id)}">Open in Jukebox</button></li>`; }).join('');
  const last = ex.last && getRecord(ex.last.id) ? `<p>Last data point examined: <b>${esc(getRecord(ex.last.id).title)}</b>${ex.last.label ? ` · ${esc(ex.last.label)}` : ''} · ${esc(fmtDate(ex.last.at))} <button class="btn sm" data-juke="${esc(ex.last.id)}">Go there</button></p>` : '<p class="dim">No record examined yet. Open the Earth Jukebox.</p>';
  return `<h2 style="margin-top:18px">Explorer log &amp; achievements</h2><div class="panel"><div class="badges">${BADGES.map(badge).join('')}</div><p class="dim" style="font-size:12px">Achievements are titles only: they never give credits or gems. The log is stored in this browser (localStorage) and is not synchronised between devices; clearing site data erases it. Times use this device's clock.</p>${last}<div class="grid2"><div><h3>Missions completed</h3><ul style="margin:0;padding-left:18px">${missions || '<li class="dim">None yet.</li>'}</ul></div><div><h3>Records &amp; discoveries</h3><ul style="margin:0;padding-left:18px">${recs}</ul></div></div></div>`;
}
function renderReports() {
  const s = store.get();
  $('#v-reports').innerHTML = `<div class="row" style="justify-content:space-between"><h1>Mission Reports &amp; Progress</h1><button class="btn sm" data-help="start">? Help</button></div><p class="sub">Progress is saved in this browser (localStorage). Clearing site data or resetting removes it.</p>
  <div class="grid3"><div class="panel"><h2>Campaign</h2><div class="big">${s.completed.length}<small> / ${MISSIONS.length} missions</small></div></div><div class="panel"><h2>Records</h2><div class="big">${s.records.length}<small> / ${RECORDS.length} unlocked</small></div></div><div class="panel"><h2>Discoveries</h2><div class="big">${s.discoveries.length}<small> / ${RECORDS.length} solved</small></div></div></div>
  ${explorerHtml(s)}
  <h2 style="margin-top:18px">Flight reports</h2>${s.reports.length ? `<div class="panel"><table><tr><th>Date</th><th>Mission</th><th>Result</th><th>Max alt.</th><th>Rewards</th><th></th></tr>${s.reports.map((r, i) => `<tr><td>${new Date(r.at).toLocaleString()}</td><td>${esc(r.missionName)}</td><td><span class="tag ${r.success ? 'ok' : 'bad'}">${r.success ? 'success' : 'failed'}</span></td><td class="num">${fmtLen(r.maxAlt)}</td><td class="num">+${fmtN(r.rewards.credits)} cr / +${r.rewards.gems} gems</td><td><button class="btn sm" data-rep="${i}">Open</button></td></tr>`).join('')}</table></div>` : '<p class="dim">No flights yet. Launch your first mission from Mission Control.</p>'}
  <div class="row" style="margin-top:18px"><button class="btn danger" id="btnReset">Reset all progress…</button></div>`;
  $('#v-reports').addEventListener('click', e => { const j = e.target.closest('[data-juke]'); if (j) { show('juke'); selectRecord(j.dataset.juke); } });
  $('#v-reports').onclick = e => { const b = e.target.closest('[data-rep]'); if (b) showReport(store.get().reports[+b.dataset.rep], false); if (e.target.id === 'btnReset') confirmBox('Reset all progress?', 'This deletes your credits, gems, parts, unlocked destinations, records and reports. This cannot be undone.', 'Reset everything', () => { S.fc = null; stopJuke(true); store.reset(); S.jukeSel = null; S.jukeData = null; if (S.juke) S.juke.setRecords(RECORDS, store.get().records, null); if (S.lab) S.lab.setLoadout(store.get().loadout, false); toast('Progress reset.'); renderReports(); }); };
}

// ====================== loop ======================
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.1, (now - (S.last || now)) / 1000); S.last = now; if (document.hidden) return;
  try {
    if (S.view === 'lab' && S.lab) S.lab.update(dt);
    else if (S.view === 'flight' && S.fview) { if (S.fc && S.fc.state !== 'done') { if (!$('#modal').classList.contains('on')) tickFlight(dt); } else if (S.fc || S.padFlight) S.fview.update(dt, S.fc ? S.fc.flight : S.padFlight); updateSafe(); }
    else if (S.view === 'juke' && S.juke) { S.juke.update(dt); if (S.juke.state !== S._jst) { S._jst = S.juke.state; renderDeck(); } }
  } catch (e) { console.error(e); if (!S._errShown) { S._errShown = true; toast('A rendering error occurred; see the console.', 'bad'); } }
}

export async function start() {
  buildNav(); initHud(); store.subscribe(updateWallet); store.subscribe(() => { for (const b of store.takeNewBadges()) toast('Achievement unlocked: ' + b.name, 'good'); }); updateWallet(); show('home');
  requestAnimationFrame(frame);
}
// No sound or timers outlive the page: pause when the tab is hidden, release the audio context when the page is left.
document.addEventListener('visibilitychange', () => { if (document.hidden && S.juke && jukeState() === 'playing') jukePause(); });
window.addEventListener('pagehide', () => { try { S.sonifier && S.sonifier.dispose(); S.landing && S.landing.stop(); } catch (e) { /* page is closing */ } });
window.__ORBITAL = { S, store };
