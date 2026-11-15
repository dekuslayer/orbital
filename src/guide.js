// ORBITAL — onboarding content: guided tour steps and the Help Center. Numbers are computed from the real game data so the
// explanations can never drift away from the rules the game actually uses.
import { PARTS } from './parts.js';
import { MISSIONS } from './missions.js';
import { RECORDS } from './records.js';
import { launchFee } from './vehicle.js';
import { defaultLoadout } from './parts.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const n = v => v.toLocaleString('en-US');

export const TOUR = [
  { view: 'home', sel: '#heroCtas', title: 'Welcome to ORBITAL', text: 'This game has two halves that feed each other. <b>Space missions</b> make money and Science Gems. <b>The Earth Jukebox</b> spends the gems on records that project a hologram of Earth. This 60-second tour shows where everything is. You can leave any time and reopen it from the <b>Tour</b> button at the top.' },
  { view: 'home', sel: '#wallet', title: 'Your two currencies', text: '<b>Credits</b> (amber) buy rocket parts and pay for each launch. <b>Science Gems</b> (cyan) unlock Earth-science records. You start with 3,000 credits and 0 gems. The <b>Help → Money</b> page explains every way to earn and spend them.' },
  { view: 'control', sel: '#rail', title: 'The seven sections', text: 'The left rail is your menu. A good order is: <b>Mission Control</b> (pick a mission) → <b>Engineering Lab</b> (build) → <b>Flight</b> (launch) → <b>Earth Jukebox</b> (spend gems). <b>Mission Map</b>, <b>Science Lab</b> and <b>Reports</b> are for planning, learning and history.' },
  { view: 'control', sel: '.hero .panel', title: 'Mission Control', text: 'Here you see the selected mission, what it needs, what it pays, and whether your current rocket is <b>cleared for launch</b>. Your free starter rocket can already fly the first mission, so you can launch right now without buying anything.' },
  { view: 'lab', sel: '#labSide', title: 'Engineering Lab: how buying works', text: 'Right side = parts. Each card shows its stats and price. <b>Buy</b> opens a confirmation that shows what the part does to your rocket and what you will have left. Parts are bought <b>once</b> and kept forever. You can swap owned parts for free, and <b>sell</b> any part back for 80%. The game blocks purchases that would leave you unable to launch.' },
  { view: 'lab', sel: '#labSide', title: 'The Build Advisor', text: 'Not sure what to buy? The <b>Build Advisor</b> in the Lab searches every combination and tells you the <b>cheapest set of purchases</b> that passes the pre-launch check for your mission, and whether you can afford it today.' },
  { view: 'flight', sel: '#v-flight', title: 'Flight', text: 'Press <b>Start countdown</b>. After liftoff you control <b>throttle</b> and <b>pitch</b>, separate boosters and stages, and deploy the payload. The right panel lists your objectives with live ticks, and a blue hint tells you what to do next. Time warp (1×–10,000×) is for coasting between burns.' },
  { view: 'map', sel: '.campaign', title: 'Mission Map', text: 'Six destinations unlock one after another: space edge → low orbit → high orbit → lunar orbit → lunar landing → deep space. Each is harder and pays more. You can replay any completed mission (for 40% of the reward) if you need extra credits.' },
  { view: 'juke', sel: '#jukeCanvas', title: 'Earth Information Jukebox', text: 'Click a record sleeve on the rack. The disc flies to the turntable. Press <b>Play</b>: the hologram of Earth rises from the record and <b>changes with the data</b> while the same numbers become sound. The first record is free. Others cost Science Gems.' },
  { view: 'science', sel: '#v-science', title: 'Science Lab and Reports', text: '<b>Science Lab</b> lists the source of every dataset and how the simulation works. <b>Reports</b> keeps every flight report and has the <b>reset</b> button. Progress saves automatically in your browser.' },
];

const rewardsTable = () => `<table><tr><th>Mission</th><th>Needs (Δv / payload)</th><th>First reward</th><th>Repeat (40%)</th></tr>${MISSIONS.map(m => `<tr><td>${esc(m.name)}</td><td>${n(m.requiredDv)} m/s · ${esc(m.requiredPayloadName)}</td><td class="num">${n(m.reward.credits)} cr + ${m.reward.gems} gems</td><td class="num">${n(Math.round(m.reward.credits * 0.4))} cr</td></tr>`).join('')}</table>`;
const partTable = () => ['engines', 'tanks', 'structures', 'boosters', 'upperStages', 'payloads', 'extras'].map(k => `<tr><th colspan="2" style="padding-top:10px">${{ engines: 'Engines', tanks: 'Tanks', structures: 'Structures', boosters: 'Boosters', upperStages: 'Upper stages', payloads: 'Payloads', extras: 'Extras' }[k]}</th></tr>${PARTS[k].map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.cost ? n(p.cost) + ' cr' : 'free (starter)'}</td></tr>`).join('')}`).join('');
const recordTable = () => `<table><tr><th>Record</th><th>Cost</th></tr>${RECORDS.map(r => `<tr><td>${esc(r.title)}</td><td class="num">${r.cost ? r.cost + ' gems' : 'free'}</td></tr>`).join('')}</table>`;
const totalGemCost = () => RECORDS.reduce((a, r) => a + r.cost, 0);
const totalGemIncome = () => MISSIONS.reduce((a, m) => a + m.reward.gems, 0) + MISSIONS.filter(m => m.difficulty >= 3).length + RECORDS.length;

export const HELP_TOPICS = [['start', 'Start here'], ['money', 'Money: credits & gems'], ['lab', 'Lab & buying'], ['flight', 'Flying'], ['juke', 'Jukebox'], ['gloss', 'Glossary']];

export function helpHtml(topic) {
  const starterFee = launchFee(defaultLoadout());
  const T = {
    start: `<h2>Start here: the whole game in 60 seconds</h2>
      <ol class="steps"><li><b>Pick a mission</b> (Mission Control or Mission Map). The first one needs nothing you don't already own.</li>
      <li><b>Check the rocket</b> in the Engineering Lab. The <i>Pre-launch check</i> lists BLOCKED / WARNING / OK items in plain words.</li>
      <li><b>Buy upgrades only if the check says you need them.</b> The Build Advisor tells you the cheapest purchases.</li>
      <li><b>Launch</b> from the Flight section. Steer, stage, deploy the payload.</li>
      <li><b>Collect rewards</b> in the mission report: credits for parts, Science Gems for records.</li>
      <li><b>Listen to Earth</b> in the Jukebox: spend gems, insert a record, press Play.</li></ol>
      <div class="finding ok"><b>CAN'T GET STUCK</b>The game is built so you always have a way forward: starter parts are free and unlimited, purchases that would strand you are blocked, any part can be sold back for 80%, completed missions can be replayed for credits, and a small recovery stipend tops you up to 300 credits.</div>
      <p class="dim">Tip: the blue <b>Next step</b> bar at the top of every screen always tells you the most useful thing to do now.</p>`,
    money: `<h2>Money: how credits and Science Gems work</h2>
      <h3>Credits (amber) — for rockets</h3>
      <p><b>You earn credits</b> only from real events: completing a mission (table below), replaying a completed mission (40%), a +15% efficiency bonus when you land with 15%+ propellant left, and selling parts back (80%).</p>${rewardsTable()}
      <p><b>You spend credits</b> on two things:</p>
      <ul><li><b>Parts</b> — bought once, kept forever. Buying never removes your starter parts, which stay free and unlimited.</li>
      <li><b>Launch fee</b> — paid every launch, even if the flight fails: <code>25 + 0.005 × total propellant in kg</code>. Your starter rocket costs <b>${starterFee} credits</b> per launch; a big rocket costs several hundred.</li></ul>
      <div class="finding warn"><b>BEFORE YOU BUY</b>Look at "Credits after purchase" in the confirmation. Keep at least the launch fee of the rocket you plan to fly. The game refuses any purchase that would leave you below ${starterFee} credits (the starter launch fee) so you can always fly the free starter rocket and earn money again.</div>
      <h3>Science Gems (cyan) — for records</h3>
      <p><b>You earn gems</b> from: the <i>first</i> completion of each mission (1–6 gems), flying a difficulty-3+ mission with 25%+ propellant left (+1 gem, once per mission), and solving each record's discovery question in the Jukebox (+1 gem, once).</p>
      <p><b>You spend gems</b> only on records (the first record is free):</p>${recordTable()}
      <p>All records together cost <b>${totalGemCost()} gems</b>; the game offers up to <b>${totalGemIncome()} gems</b>, so you can unlock the whole collection and spending gems never blocks your progress. You can buy records in any order.</p>
      <h3>Part price list</h3><table>${partTable()}</table>`,
    lab: `<h2>Engineering Lab and the buying flow</h2>
      <p>The big 3D view shows your actual rocket. Drag to rotate, scroll to zoom, <b>Exploded view</b> separates the stages. The right panel has four blocks:</p>
      <ol class="steps"><li><b>Target mission</b> — which mission the checks below are judged against.</li>
      <li><b>Vehicle analysis</b> — mass, thrust, <i>thrust-to-weight</i> (must be above ~1.15 to lift off), <i>delta-v</i> (the "fuel budget" in m/s; must exceed the mission need), burn time and launch fee.</li>
      <li><b>Pre-launch check</b> — BLOCKED items stop the launch, WARNING items are risks, OK items are fine. Each sentence says what to change.</li>
      <li><b>Build Advisor + Parts workshop</b> — shopping help and the catalogue.</li></ol>
      <h3>What the part slots do</h3>
      <ul><li><b>Engine</b> — thrust (lifts the rocket) and Isp (efficiency: higher = more delta-v from the same propellant).</li><li><b>Tank</b> — propellant. More propellant = more delta-v, but more weight.</li><li><b>Structure</b> — holds everything together; stronger frames survive the high-pressure moment called Max-Q.</li><li><b>Boosters</b> — extra thrust at liftoff; drop them when empty.</li><li><b>Upper stage</b> — a second small rocket; drop the empty first stage to stop carrying dead weight.</li><li><b>Payload</b> — the science instrument. Each mission requires a specific one.</li><li><b>Extras</b> — fairing (less drag), gimbal (better steering), RCS ring (needed for lunar and deep-space precision).</li></ul>
      <h3>The buying flow, step by step</h3>
      <ol class="steps"><li>Press <b>Buy</b> on a part. A confirmation opens.</li><li>It shows the price, <b>your credits after the purchase</b>, and a <b>before/after table</b> of mass, thrust-to-weight, delta-v and launch fee for your current rocket.</li><li>Choose <b>Buy &amp; install</b> (credits are deducted immediately and the 3D rocket changes) or <b>Buy only</b> (keep it in storage).</li><li>Parts you own show <b>Install</b>. Swapping is free. <b>Sell</b> returns 80% of the price.</li></ol>
      <p class="dim">Safety rule: a purchase is blocked if it would leave you with less than the starter launch fee (${starterFee} credits). If it would leave you unable to afford the fee of the <i>upgraded</i> rocket, you get a warning and can still fly the starter rocket for free.</p>`,
    flight: `<h2>Flying a mission</h2>
      <h3>Controls</h3>
      <table><tr><th>Control</th><th>Key</th><th>What it does</th></tr>
      <tr><td>Throttle slider</td><td>Z full · X zero · Shift/Ctrl ±10%</td><td>Engine power. Less thrust = less fuel burned and less air pressure.</td></tr>
      <tr><td>Pitch slider</td><td>↑ ↓</td><td>Direction: 90° = straight up, 0° = along the horizon.</td></tr>
      <tr><td>Prograde hold</td><td>G</td><td>Autopilot: points the nose along your direction of travel (a perfect gravity turn).</td></tr>
      <tr><td>Max-Q limiter</td><td>M</td><td>Automatically eases the throttle when air pressure gets dangerous.</td></tr>
      <tr><td>Separate boosters / stage</td><td>B / N</td><td>Drops empty boosters or the empty first stage.</td></tr>
      <tr><td>Deploy payload</td><td>P</td><td>Releases the instrument. Must be done inside the mission's valid window.</td></tr>
      <tr><td>Time warp</td><td>, and .</td><td>Speeds time up while coasting. Limited to 4× during the climb.</td></tr></table>
      <h3>A standard orbit recipe</h3>
      <ol class="steps"><li>Climb straight up to about <b>1 km</b>.</li><li>Tilt pitch to <b>~80°</b> and switch on <b>Prograde hold</b>. The rocket now curves over by itself.</li><li>Watch <b>Apoapsis</b> (highest point of your path). When it reaches your target, <b>cut the throttle</b>.</li><li><b>Coast</b> up to the apoapsis, set pitch to 0° and burn until <b>Periapsis</b> (lowest point) passes 150 km — now you are in orbit.</li><li><b>Deploy</b> the payload.</li></ol>
      <h3>Autopilot, pause, map and warp</h3>
      <table><tr><th>Control</th><th>Key</th><th>What it does</th></tr>
      <tr><td>🤖 Autopilot</td><td>O</td><td>A flight assistant that flies the ascent, waits for the Moon transfer window, burns, coasts (with automatic time warp) and fires the capture burn. Click again to take over. Assisted flights are marked in the report and do not earn the +10% manual-pilot bonus. Use it to learn: watch what it does.</td></tr>
      <tr><td>Map view</td><td>V</td><td>Top-down view of Earth, you and the Moon with the predicted path.</td></tr>
      <tr><td>Pause</td><td>Space</td><td>Freezes the whole simulation.</td></tr>
      <tr><td>Time warp</td><td>, and .</td><td>The real speed is shown next to the buttons. It is limited to 4× while thrusting in the atmosphere, and reduced automatically when you approach the Moon (the reason is shown).</td></tr></table>
      <h3>Going to the Moon</h3>
      <p>The Moon is a real, fixed target in the game world. Its position is marked on screen (MOON · distance) and the ring around it is the <b>encounter zone</b> (5,000 km): your path must pass inside it. The cyan line is your predicted path with the engine cut now; it turns green and the HUD says <b>✔ passes … from Moon</b> when the path reaches the zone.</p>
      <ol class="steps"><li>Reach a ~200 km circular orbit.</li><li>Wait for the <b>transfer window</b>: the burn must be centred on the point of your orbit opposite the Moon. The hint panel tells you how long to wait and for how many seconds to burn.</li><li>Burn prograde until <b>Apoapsis</b> shows about 38,000 km and the Moon intercept turns ✔. Cut the engine and coast using time warp.</li><li>Inside the zone press <b>Start capture burn</b> (needs 600 m/s of delta-v). For the landing, separate the empty core stage and start the powered descent.</li></ol>
      <p>If the path does not reach the zone you miss the Moon and the mission fails with the miss distance. Lunar missions also need <b>Solar Array Wings</b> (power budget) and a <b>High-Gain Antenna</b> (data link); the Lab check lists both.</p>
      <h3>Why flights fail</h3><ul><li>Not enough delta-v or thrust-to-weight — the Lab check warns you before launch.</li><li>Air pressure too high (Max-Q) with a weak frame.</li><li>Payload deployed outside the valid window.</li><li>Running out of propellant before the objective is reached: the engine goes silent and the vehicle coasts; if it cannot reach its goal it falls back to Earth.</li></ul>`,
    juke: `<h2>The Earth Information Jukebox</h2>
      <ol class="steps"><li><b>Browse</b> the rack (3D) or the list on the right. Padlock = locked, with its gem price.</li><li><b>Unlock</b> with Science Gems (a confirmation shows your gems after the purchase).</li><li><b>Click an unlocked record.</b> The disc slides from its sleeve, flies to the turntable and settles on the spindle.</li><li>Press <b>Play</b>. The platter spins, the tonearm lowers, and a hologram of Earth <b>rises from the record's label</b>.</li><li>The hologram, the chart, the readout and the sound all follow the <b>same data point</b> (one time step at a time; most records have two series A and B, the temperature record has one series plus a zero line). Use the time slider, click the chart, or press ▶ Timeline. Click the chart to hear any month.</li><li>Answer the <b>discovery question</b> for +1 gem.</li></ol>
      <h3>How the hologram changes</h3><ul><li><b>Fire Frequency</b> — embers glow on land and sparks rise with the fire index.</li><li><b>Ocean Symphony</b> — ripples across the sea speed up with chlorophyll.</li><li><b>Storm Signals</b> — swirling cloud bands and falling rain scale with precipitation.</li><li><b>Atmosphere in Motion</b> — a haze layer thickens with aerosols.</li><li><b>Earth in Motion</b> — land greens with the vegetation index.</li><li><b>Ice Memory</b> — polar caps grow and shrink with sea-ice extent.</li><li><b>Fever Chart</b> — the whole globe warms in tint as the global temperature anomaly rises (a global number: no location is shown).</li></ul>
      <p>Spikes appear only when the data really has locations. Drag the globe to rotate it, scroll to zoom a little, ⟲ Reset view to go back, 🔊 Mute to silence the sound.</p>`,
    gloss: `<h2>Glossary</h2><dl class="kv" style="grid-template-columns:170px 1fr;text-align:left">
      ${[['Credits', 'Money for parts and launch fees.'], ['Science Gems', 'Reward currency that unlocks Jukebox records.'], ['Propellant', 'The fuel and oxidiser a rocket burns, measured in kg.'], ['Thrust', 'The force an engine pushes with, in kilonewtons (kN).'], ['TWR', 'Thrust-to-weight ratio. Above 1 the rocket can rise; above ~1.15 is required here.'], ['Isp', 'Specific impulse: engine efficiency in seconds. Higher = more distance per kg of propellant.'], ['Delta-v (Δv)', 'The total "speed change budget" in m/s that your propellant can deliver. Missions have required Δv.'], ['Rocket equation', 'Δv = Isp · g₀ · ln(start mass / end mass). More propellant helps, but with diminishing returns.'], ['Staging', 'Dropping empty parts (boosters, first stage) so the rest is lighter.'], ['Max-Q', 'The moment of maximum air pressure on the rocket, around 8–14 km up.'], ['Apoapsis', 'Highest point of your orbit.'], ['Periapsis', 'Lowest point of your orbit. Must be above the atmosphere (150 km) to stay in orbit.'], ['Gravity turn', 'Gradually tilting from vertical to horizontal so gravity helps bend your path into orbit.'], ['Fairing', 'A nose shell that protects the payload and cuts drag.'], ['RCS', 'Small thrusters for precise steering; required for lunar and deep-space missions.'], ['Sonification', 'Turning data into sound.'], ['NDVI', 'Vegetation greenness index.'], ['AOT', 'Aerosol optical thickness: how much light haze blocks.'], ['Chlorophyll-a', 'Pigment in ocean plankton, used to see blooms from space.'], ['IMERG', 'NASA\'s merged satellite rainfall product.']].map(([a, b]) => `<dt>${a}</dt><dd style="text-align:left;font-family:inherit">${b}</dd>`).join('')}</dl>`,
  };
  return T[topic] || T.start;
}
