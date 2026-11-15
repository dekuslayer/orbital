// ORBITAL — scaled simulation world and campaign definition.
// IMPORTANT: ORBITAL uses a SCALED-DOWN Earth–Moon system (all lengths 1:10, surface gravity kept at 9.80665 m/s^2)
// so that game-sized rockets can reach every destination. It is a game model, not flight-planning software.
import { G0 } from './parts.js';

export const WORLD = {
  R: 637100,                       // m, scaled Earth radius (real / 10)
  g0: G0,
  get mu() { return G0 * this.R * this.R; },   // m^3/s^2
  atmoTop: 70000,                  // m, altitude above which drag is negligible
  rho0: 1.225,                     // kg/m^3 sea-level density
  H: 8500,                         // m, density scale height
  moonDist: 38440000,              // m, scaled Earth–Moon distance (real / 10)
  moonR: 173700,                   // m, scaled Moon radius
  moonG: 1.62,                     // m/s^2
  moonAngle: -30 * Math.PI / 180,  // rad: fixed Moon direction in the orbital plane (pad is at +90 deg, launches travel clockwise)
  moonSOI: 5000000,                // m: encounter radius. The vehicle must pass within this distance of the Moon (scaled game model)
  moonOrbitAlt: 80000,             // m: scripted circular lunar orbit altitude
  moonPos() { return { x: Math.cos(this.moonAngle) * this.moonDist, y: Math.sin(this.moonAngle) * this.moonDist }; },
  karman: 100000,                  // m
  fairingJettisonAlt: 80000,       // m
  maxQBase: 42000,                 // Pa, structural dynamic-pressure limit for durability 1.0 (game value)
  dragCd: 0.28,
};

export const MISSIONS = [
  {
    id: 'sounding', index: 0, name: 'Kármán Sounding', tag: 'Suborbital',
    destination: 'Space edge (100 km)',
    brief: 'Carry a CubeSat science pack above the Kármán line to sample the upper atmosphere. No orbit is needed: climb above 100 km altitude and deploy the payload there.',
    why: 'Sounding flights measure the thin upper atmosphere that satellites like Earth-observation missions later have to fly through.',
    requiredDv: 2100, requiredPayload: 'leo', requiredPayloadName: 'CubeSat Pack',
    reward: { credits: 2000, gems: 1 }, difficulty: 1,
    objective: 'Reach an altitude of at least 100 km, then deploy the payload.',
    criteria: ['Altitude ≥ 100 km at payload deployment'],
    unlock: null,
  },
  {
    id: 'leo', index: 1, name: 'Low Earth Orbit', tag: 'Orbital',
    destination: 'Circular orbit, 150–500 km',
    brief: 'Place a CubeSat pack in a stable low Earth orbit. Climb, pitch over toward the horizon (a gravity turn) and burn until your periapsis is above the atmosphere, then deploy.',
    why: 'Low Earth orbit is where most Earth-observation satellites operate, providing the repeat coverage that fire, ocean, ice and storm datasets rely on.',
    requiredDv: 3300, requiredPayload: 'leo', requiredPayloadName: 'CubeSat Pack',
    reward: { credits: 3600, gems: 2 }, difficulty: 2,
    objective: 'Reach an orbit with periapsis ≥ 150 km and apoapsis ≤ 500 km, then deploy the payload.',
    criteria: ['Periapsis altitude ≥ 150 km', 'Apoapsis altitude ≤ 500 km (near-circular)', 'Payload deployed while in orbit'],
    unlock: { mission: 'sounding' },
  },
  {
    id: 'transfer', index: 2, name: 'High Earth Orbit', tag: 'Transfer',
    destination: 'Elliptical orbit, apoapsis ≥ 8,000 km',
    brief: 'Deliver an Earth-observation satellite to a high elliptical orbit. A bigger vehicle is required: coast to the high point and deploy after a transfer burn.',
    why: 'High orbits give a wide field of view of Earth, useful for monitoring large-scale weather, aerosols and sea-ice change.',
    requiredDv: 4100, requiredPayload: 'orbit', requiredPayloadName: 'Earth-Observation Sat',
    reward: { credits: 6000, gems: 3 }, difficulty: 3,
    objective: 'Reach an orbit with periapsis ≥ 150 km and apoapsis ≥ 8,000 km, then deploy.',
    criteria: ['Periapsis altitude ≥ 150 km', 'Apoapsis altitude ≥ 8,000 km', 'Payload deployed in orbit'],
    unlock: { mission: 'leo' },
  },
  {
    id: 'lunar-orbit', index: 3, name: 'Lunar Orbit', tag: 'Lunar',
    destination: 'Orbit around the Moon (scaled)',
    brief: 'Send a mapping orbiter to the Moon. Perform a trans-lunar injection from Earth orbit, coast to the Moon and fire a capture burn with enough propellant left to be captured.',
    why: 'Lunar orbiters map the surface and complement Earth observations by showing how a whole planet-moon system behaves.',
    requiredDv: 4900, requiredPayload: 'lunar-orbit', requiredPayloadName: 'Lunar Orbiter Probe', needsRcs: true, needsComms: true,
    captureDv: 600,
    reward: { credits: 9000, gems: 4 }, difficulty: 4,
    objective: 'Reach a trajectory that reaches lunar distance, perform the capture burn (600 m/s), then deploy the orbiter.',
    criteria: ['Apoapsis reaches ≥ 97% of the Earth–Moon distance', 'Capture burn of 600 m/s completed', 'Orbiter deployed'],
    unlock: { mission: 'transfer' },
  },
  {
    id: 'lunar-land', index: 4, name: 'Lunar Landing', tag: 'Lunar',
    destination: 'Moon surface (scaled)',
    brief: 'Land a lander on the Moon. After capture you need a further powered descent: your engine must out-thrust lunar gravity and enough propellant must remain for the descent burn.',
    why: 'Landers measure the surface directly — ground truth that satellite observations are compared with.',
    requiredDv: 5900, requiredPayload: 'lunar-land', requiredPayloadName: 'Lunar Lander', needsRcs: true, needsComms: true, needsUpperStage: true,
    captureDv: 600, descentDv: 1100,
    reward: { credits: 13000, gems: 5 }, difficulty: 5,
    objective: 'Perform the lunar capture burn (600 m/s) and a powered descent (1,100 m/s) with a soft touchdown, then deploy the lander.',
    criteria: ['Capture burn of 600 m/s', 'Descent burn of 1,100 m/s', 'Engine thrust ≥ 1.2× lunar weight at descent start'],
    unlock: { mission: 'lunar-orbit' },
  },
  {
    id: 'deep', index: 5, name: 'Deep-Space Probe', tag: 'Deep space',
    destination: 'Earth-escape trajectory',
    brief: 'Launch a deep-space probe on an escape trajectory out of the Earth–Moon system. Reach escape velocity with at least 1,200 m/s of excess speed.',
    why: 'Deep-space probes carry the same style of instruments as Earth-observing missions, pointed outward.',
    requiredDv: 5600, requiredPayload: 'deep', requiredPayloadName: 'Deep-Space Probe', needsRcs: true, needsComms: true,
    reward: { credits: 15000, gems: 6 }, difficulty: 5,
    objective: 'Achieve an escape trajectory (excess speed ≥ 1,200 m/s) beyond 5,000 km altitude, then deploy the probe.',
    criteria: ['Hyperbolic trajectory', 'Excess speed ≥ 1,200 m/s', 'Altitude ≥ 5,000 km at deployment'],
    unlock: { mission: 'lunar-land' },
  },
];

export const getMission = id => MISSIONS.find(m => m.id === id);

export function isUnlocked(mission, completed) {
  if (!mission.unlock) return true;
  return completed.includes(mission.unlock.mission);
}

export const START_CREDITS = 3000;
export const START_GEMS = 0;
