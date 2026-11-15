// ORBITAL — parts catalogue.
// All figures are GAME values (fictional, simplified). They are NOT specifications of real rockets.
// Units: mass kg, thrust N, isp s (vacuum-equivalent, single value for simplicity), cost credits.

export const G0 = 9.80665; // m/s^2, standard gravity (used in the rocket equation)

export const PARTS = {
  engines: [
    { id: 'eng_spark',  name: 'Spark-1 Kerolox',   thrust: 180000,  isp: 255, mass: 450,  cost: 0,     owned: true,  desc: 'Starter engine. Low thrust, modest efficiency.' },
    { id: 'eng_ember',  name: 'Ember-2 Kerolox',   thrust: 420000,  isp: 285, mass: 820,  cost: 2200,  desc: 'Balanced upgrade with real lift-off authority.' },
    { id: 'eng_aurora', name: 'Aurora-V Hydrolox', thrust: 300000,  isp: 410, mass: 700,  cost: 4800,  desc: 'High efficiency, lower thrust. Excellent for upper stages.' },
    { id: 'eng_titan',  name: 'Titan-X Heavy',     thrust: 900000,  isp: 300, mass: 1900, cost: 7600,  desc: 'Very high thrust for heavy vehicles.' }
  ],
  tanks: [
    { id: 'tank_s', name: 'Tank S (3 t)',   propellant: 3000,  dry: 280,  cost: 0,    owned: true, radius: 0.55, length: 2.6, desc: 'Starter tank.' },
    { id: 'tank_m', name: 'Tank M (8 t)',   propellant: 8000,  dry: 640,  cost: 1400, radius: 0.7,  length: 3.8, desc: 'Medium tank with a better propellant fraction.' },
    { id: 'tank_l', name: 'Tank L (18 t)',  propellant: 18000, dry: 1250, cost: 3200, radius: 0.9,  length: 5.2, desc: 'Large tank for orbital and transfer missions.' },
    { id: 'tank_xl',name: 'Tank XL (40 t)', propellant: 40000, dry: 2600, cost: 6400, radius: 1.1,  length: 7.2, desc: 'Heavy tank for lunar missions.' }
  ],
  structures: [
    { id: 'body_alu',  name: 'Aluminium Frame', mass: 400,  cost: 0,    owned: true, durability: 1.0, desc: 'Baseline structure.' },
    { id: 'body_comp', name: 'Composite Frame', mass: 280,  cost: 1800, durability: 1.15, desc: 'Lighter but pricier.' },
    { id: 'body_ti',   name: 'Titanium Frame',  mass: 650,  cost: 2600, durability: 1.6,  desc: 'Heavy and strong: survives high dynamic pressure at full throttle.' }
  ],
  boosters: [
    { id: 'bst_none', name: 'No boosters', count: 0, thrust: 0, propellant: 0, dry: 0, cost: 0, owned: true, isp: 0, desc: 'Core stage only.' },
    { id: 'bst_pair', name: 'Twin Solid Boosters', count: 2, thrust: 360000, propellant: 6000, dry: 700, cost: 2400, isp: 240, desc: 'Two jettisonable side boosters. Must be separated after burnout.' },
    { id: 'bst_quad', name: 'Quad Solid Boosters', count: 4, thrust: 760000, propellant: 14000, dry: 1500, cost: 5200, isp: 245, desc: 'Four boosters for heavy lift.' }
  ],
  upperStages: [
    { id: 'up_none', name: 'Single stage', cost: 0, owned: true, desc: 'No upper stage.' },
    { id: 'up_small', name: 'Upper Stage (small)', propellant: 4000, dry: 420, thrust: 70000, isp: 345, cost: 3600, desc: 'Separable upper stage with its own engine.' },
    { id: 'up_large', name: 'Upper Stage (large)', propellant: 12000, dry: 1050, thrust: 160000, isp: 380, cost: 6000, desc: 'Large separable stage for transfer and lunar missions.' }
  ],
  payloads: [
    { id: 'pl_cube',  name: 'CubeSat Pack',        mass: 150, power: 20,  cost: 0, owned: true, capability: 'leo', desc: 'Small research satellites. Enough for low Earth orbit.' },
    { id: 'pl_sat',   name: 'Earth-Observation Sat', mass: 900, power: 300,  cost: 1600, capability: 'orbit', desc: 'Imaging and atmospheric sensors.' },
    { id: 'pl_probe', name: 'Lunar Orbiter Probe',  mass: 1800, power: 450, cost: 3400, capability: 'lunar-orbit', desc: 'Mapping instruments with its own thruster pack.' },
    { id: 'pl_lander',name: 'Lunar Lander',         mass: 3600, power: 600, cost: 5200, capability: 'lunar-land', desc: 'Landing legs and descent engine. Heavy.' },
    { id: 'pl_deep',  name: 'Deep-Space Probe',     mass: 1200, power: 500, cost: 8800, capability: 'deep', desc: 'Long-life probe for deep-space targets.' }
  ],
  extras: [
    { id: 'ex_fairing', name: 'Payload Fairing', mass: 220, cost: 600, desc: 'Protects the payload in the atmosphere; jettisoned above 80 km. Reduces drag losses.' },
    { id: 'ex_gimbal',  name: 'Gimbal Package',  mass: 90,  cost: 900, desc: 'Improves trajectory control authority (steering input is more effective).' },
    { id: 'ex_rcs',     name: 'RCS Thruster Ring', mass: 60, cost: 800, desc: 'Needed for precise orbit insertion and landing corrections.' },
    { id: 'ex_solar',   name: 'Solar Array Wings', mass: 70, cost: 900, spacecraft: true, powerW: 700, desc: 'Adds 700 W of electrical power. The spacecraft bus alone supplies 250 W from batteries; bigger payloads need arrays. Rides with the payload (counted in its mass).' },
    { id: 'ex_antenna', name: 'High-Gain Antenna', mass: 40, cost: 700, spacecraft: true, link: true, desc: 'Data link to Earth. Lunar and deep-space missions are only worth flying if their data can be sent home, so they require it. Rides with the payload.' }
  ]
};

export const SLOT_ORDER = ['engines', 'tanks', 'structures', 'boosters', 'upperStages', 'payloads'];
export const SLOT_LABEL = {
  engines: 'Main Engine', tanks: 'Core Tank', structures: 'Structure', boosters: 'Boosters',
  upperStages: 'Upper Stage', payloads: 'Payload', extras: 'Extras'
};

export function findPart(id) {
  for (const k of Object.keys(PARTS)) {
    const p = PARTS[k].find(x => x.id === id);
    if (p) return { slot: k, part: p };
  }
  return null;
}

export function defaultOwned() {
  const ids = [];
  for (const k of Object.keys(PARTS)) for (const p of PARTS[k]) if (p.owned) ids.push(p.id);
  return ids;
}

export function defaultLoadout() {
  return { engines: 'eng_spark', tanks: 'tank_s', structures: 'body_alu', boosters: 'bst_none', upperStages: 'up_none', payloads: 'pl_cube', extras: [] };
}
