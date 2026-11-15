// ORBITAL — procedural 3D rocket built from the installed components. Units: metres. Origin: bottom of the engine bell.
// Every installed part changes real geometry (engine bell, tank proportions, boosters, upper stage, payload, fairing).
import * as THREE from 'three';
import { resolveLoadout, hasExtra } from './vehicle.js';

const mats = {};
function M(name, opts) { if (!mats[name]) mats[name] = new THREE.MeshStandardMaterial(opts); return mats[name]; }
function materials() {
  return {
    hull: M('hull', { color: 0xdfe6ee, metalness: 0.65, roughness: 0.32 }),
    hullDark: M('hullDark', { color: 0x2a3140, metalness: 0.8, roughness: 0.4 }),
    accent: M('accent', { color: 0x19d3ff, metalness: 0.4, roughness: 0.35, emissive: 0x06303a, emissiveIntensity: 0.6 }),
    magenta: M('magenta', { color: 0xff3fb4, metalness: 0.4, roughness: 0.4, emissive: 0x3a0828, emissiveIntensity: 0.5 }),
    bell: M('bell', { color: 0x8c8f99, metalness: 0.9, roughness: 0.28 }),
    gold: M('gold', { color: 0xd6a73d, metalness: 0.95, roughness: 0.3 }),
    solar: M('solar', { color: 0x14307a, metalness: 0.6, roughness: 0.25, emissive: 0x050d26, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    alu: M('alu', { color: 0xc9d1da, metalness: 0.7, roughness: 0.38 }),
    comp: M('comp', { color: 0x1c2026, metalness: 0.45, roughness: 0.5 }),
    ti: M('ti', { color: 0x9aa3b0, metalness: 0.95, roughness: 0.22 }),
    solidBooster: M('solidBooster', { color: 0xf4f1ea, metalness: 0.3, roughness: 0.5 }),
  };
}

function cyl(rTop, rBot, h, seg, mat, y) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat); m.position.y = y + h / 2; m.castShadow = true; m.receiveShadow = true; return m;
}
function ring(r, y, mat, h = 0.12) { return cyl(r * 1.015, r * 1.015, h, 40, mat, y); }

function engineBell(engine, mt) {
  const g = new THREE.Group(); g.name = 'engine';
  const scale = Math.cbrt(engine.thrust / 180000);       // bigger thrust -> bigger bell (cube-root scaling, visual only)
  const h = 1.1 * scale + 0.4, rExit = 0.38 * scale + 0.12;
  const pts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.12 + (rExit - 0.12) * Math.pow(1 - t, 1.7), t * h)); }  // exit at y=0, throat at y=h
  const bellMat = mt.bell.clone(); bellMat.side = THREE.DoubleSide;
  const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), bellMat); bell.castShadow = true;
  const cluster = engine.thrust > 600000 ? 3 : 1;      // heavy engine = triple-bell cluster
  if (cluster === 3) { for (let k = 0; k < 3; k++) { const b = bell.clone(); b.scale.setScalar(0.62); const a = k / 3 * Math.PI * 2; b.position.set(Math.cos(a) * rExit * 0.7, 0, Math.sin(a) * rExit * 0.7); g.add(b); } }
  else g.add(bell);
  g.userData = { height: h, exitRadius: rExit * (cluster === 3 ? 1.5 : 1) };
  return g;
}

function payloadMesh(pl, mt) {
  const g = new THREE.Group(); g.name = 'payload';
  switch (pl.id) {
    case 'pl_cube': for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), i % 2 ? mt.accent : mt.gold); b.position.set((i - 1) * 0.4, 0.2, 0); b.castShadow = true; g.add(b); } g.userData.height = 0.5; g.userData.radius = 0.7; break;
    case 'pl_sat': { const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.9), mt.gold); body.position.y = 0.6; body.castShadow = true; g.add(body); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, 0.7), mt.solar); p.position.set(s * 1.2, 0.6, 0); g.add(p); } const dish = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.18, 24, 1, true), mt.hull); dish.position.y = 1.35; dish.material = mt.hull.clone(); dish.material.side = THREE.DoubleSide; g.add(dish); g.userData.height = 1.5; g.userData.radius = 1.9; break; }
    case 'pl_probe': { const body = cyl(0.55, 0.65, 1.1, 12, mt.gold, 0); g.add(body); const mast = cyl(0.04, 0.04, 1.2, 8, mt.hull, 1.1); g.add(mast); const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), mt.hull); dish.material = mt.hull.clone(); dish.material.side = THREE.DoubleSide; dish.position.y = 1.9; g.add(dish); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.6), mt.solar); p.position.set(s * 1.25, 0.55, 0); g.add(p); } g.userData.height = 2.2; g.userData.radius = 1.9; break; }
    case 'pl_lander': { const body = cyl(0.9, 1.1, 1.0, 8, mt.gold, 0.5); g.add(body); const top = cyl(0.5, 0.9, 0.5, 8, mt.hull, 1.5); g.add(top); for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), mt.hullDark); leg.position.set(Math.cos(a) * 1.15, 0.25, Math.sin(a) * 1.15); leg.rotation.z = Math.cos(a) * 0.4; leg.rotation.x = -Math.sin(a) * 0.4; g.add(leg); const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), mt.hull); foot.position.set(Math.cos(a) * 1.5, -0.38, Math.sin(a) * 1.5); g.add(foot); } g.userData.height = 2.0; g.userData.radius = 1.6; break; }
    case 'pl_deep': { const body = cyl(0.5, 0.5, 0.9, 6, mt.hull, 0); g.add(body); const dish = new THREE.Mesh(new THREE.SphereGeometry(0.95, 28, 10, 0, Math.PI * 2, 0, Math.PI / 3), mt.hull); dish.material = mt.hull.clone(); dish.material.side = THREE.DoubleSide; dish.position.y = 1.15; dish.rotation.x = Math.PI; dish.position.y = 1.6; g.add(dish); const boom = cyl(0.03, 0.03, 1.6, 6, mt.hullDark, 1.0); boom.position.x = 0.6; g.add(boom); g.userData.height = 2.4; g.userData.radius = 1.0; break; }
    default: { const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mt.gold); b.position.y = 0.4; g.add(b); g.userData.height = 0.8; g.userData.radius = 0.6; }
  }
  return g;
}

function boosterSet(b, coreRadius, coreLen, baseY, mt) {
  const g = new THREE.Group(); g.name = 'boosters';
  const len = 2.8 + Math.sqrt(b.propellant / 1000) * 1.1; const r = 0.28 + b.count * 0.03;
  for (let i = 0; i < b.count; i++) {
    const a = (i / b.count) * Math.PI * 2 + Math.PI / b.count;
    const bg = new THREE.Group(); bg.name = 'booster' + i;
    bg.add(cyl(r, r, len, 20, mt.solidBooster, 0.35));
    const nose = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.2, 20), mt.magenta); nose.position.y = 0.35 + len + r * 1.1; nose.castShadow = true; bg.add(nose);
    bg.add(cyl(r * 0.75, r * 0.95, 0.35, 20, mt.bell, 0));
    bg.add(ring(r, 0.35 + len * 0.5, mt.hullDark, 0.1));
    const off = coreRadius + r + 0.06; bg.position.set(Math.cos(a) * off, baseY, Math.sin(a) * off);
    bg.userData = { nozzleY: baseY, radius: r };
    g.add(bg);
  }
  g.userData = { length: len, radius: r };
  return g;
}

// Returns { group, parts, height, dims } — parts exposes detachable sub-assemblies for the flight scene.
export function buildRocket(loadout) {
  const mt = materials(); const c = resolveLoadout(loadout);
  const root = new THREE.Group(); root.name = 'rocket';
  const core = new THREE.Group(); core.name = 'coreStage'; root.add(core);
  let y = 0;

  const engine = engineBell(c.engine, mt); core.add(engine); y += engine.userData.height * 0.82;
  // Every installed component gets its own named group (comp.*) so the Lab's exploded view can move ALL of them and clicks can identify them.
  const grp = name => { const g = new THREE.Group(); g.name = name; g.userData.comp = true; return g; };
  const skirtMat = c.structure.id === 'body_ti' ? mt.ti : c.structure.id === 'body_comp' ? mt.comp : mt.alu;
  const R = c.tank.radius;
  const skirtG = grp('skirt'); skirtG.add(cyl(R * 0.82, R, 0.7, 40, skirtMat, y)); core.add(skirtG); y += 0.7;
  const tankStart = y;
  const tankG = grp('tank'); core.add(tankG);
  const tank = cyl(R, R, c.tank.length, 48, c.structure.id === 'body_comp' ? mt.comp : mt.hull, y); tank.name = 'tank'; tankG.add(tank); y += c.tank.length;
  for (let k = 1; k < Math.round(c.tank.length / 1.4); k++) tankG.add(ring(R, tankStart + k * 1.4, mt.hullDark, 0.05));
  tankG.add(ring(R, tankStart + 0.3, mt.accent, 0.12));
  if (c.structure.id === 'body_ti') for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, c.tank.length * 0.9, 0.18), mt.ti); f.position.set(Math.cos(a) * (R + 0.02), tankStart + c.tank.length / 2, Math.sin(a) * (R + 0.02)); f.rotation.y = -a; tankG.add(f); }
  let gimbalG = null;
  if (hasExtra(loadout, 'ex_gimbal')) { gimbalG = grp('gimbal'); const gg = cyl(R * 0.55, R * 0.7, 0.35, 24, mt.hullDark, tankStart - 0.1); gg.name = 'gimbal'; gimbalG.add(gg); core.add(gimbalG); }
  const interstageG = grp('interstage'); interstageG.add(cyl(R * 0.85, R, 0.55, 40, skirtMat, y)); core.add(interstageG); y += 0.55;
  const coreTop = y;

  // fins for starter / light structures
  let finsG = null;
  if (c.structure.id !== 'body_ti') { finsG = grp('fins'); for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.8), mt.accent); fin.position.set(Math.cos(a) * (R + 0.35), engine.userData.height * 0.82 + 0.65, Math.sin(a) * (R + 0.35)); fin.rotation.y = -a; fin.castShadow = true; finsG.add(fin); } core.add(finsG); }

  // boosters (attached to the core, separate group so they can be jettisoned)
  let boosters = null;
  if (c.boosters.count > 0) { boosters = boosterSet(c.boosters, R, c.tank.length, engine.userData.height * 0.6, mt); boosters.userData.comp = true; root.add(boosters); }

  // upper stage
  let upper = null;
  if (c.upper.propellant) {
    upper = new THREE.Group(); upper.name = 'upperStage';
    const uR = Math.min(R * 0.78, 0.9); const uLen = 1.2 + Math.sqrt(c.upper.propellant / 1000) * 0.9;
    upper.add(cyl(uR * 0.45, uR * 0.62, 0.55, 24, mt.bell, 0)); upper.add(cyl(uR, uR, uLen, 40, mt.hull, 0.5)); upper.add(ring(uR, 0.5 + uLen * 0.5, mt.magenta, 0.12));
    upper.userData.comp = true; upper.position.y = y; root.add(upper); y += 0.5 + uLen;
    upper.userData = { radius: uR };
  }

  // payload + fairing
  const pl = payloadMesh(c.payload, mt); pl.userData.comp = true; pl.position.y = y + 0.05; root.add(pl); const plTop = y + pl.userData.height;
  // spacecraft extras ride on the payload so they separate with it
  const plR = pl.userData.radius || 0.5, plH = pl.userData.height || 1;
  if (hasExtra(loadout, 'ex_solar')) { const pm = new THREE.MeshStandardMaterial({ color: 0x1b3d82, metalness: 0.6, roughness: 0.35, emissive: 0x081a44 }); for (const sg of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.06, plH * 0.95, 0.6), pm); w.position.set(sg * (plR + 0.07), plH * 0.5, 0); w.name = 'solar'; pl.add(w); } }
  if (hasExtra(loadout, 'ex_antenna')) { const dm = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })); dm.rotation.z = -0.9; dm.position.set(0, plH * 0.95, plR * 0.9); dm.name = 'antenna'; pl.add(dm); }
  let fairing = null;
  const topR = upper ? upper.userData.radius : R;
  if (hasExtra(loadout, 'ex_fairing')) {
    fairing = new THREE.Group(); fairing.name = 'fairing';
    const h = Math.max(pl.userData.height + 0.4, 2.0), fr = Math.max(topR, Math.min(pl.userData.radius, topR * 1.2));
    const pts = [new THREE.Vector2(fr, 0), new THREE.Vector2(fr, h * 0.35), new THREE.Vector2(fr * 0.9, h * 0.62), new THREE.Vector2(fr * 0.55, h * 0.86), new THREE.Vector2(0.02, h + fr * 0.2)];
    const lm = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mt.hull.clone()); lm.material.side = THREE.DoubleSide; lm.castShadow = true; lm.receiveShadow = true; fairing.add(lm);
    fairing.userData.comp = true; fairing.userData.height = h; fairing.position.y = y; root.add(fairing); pl.visible = true;
  } else {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(Math.min(0.5, topR * 0.5), 0.9, 24), mt.accent); nose.position.set(0, 0, 0); // small nav cap on top of payload for the open-payload case
    nose.name = 'nose'; nose.position.y = pl.userData.height + 0.4; pl.add(nose);   // rides with the payload so it is part of that component
  }
  let rcsG = null;
  if (hasExtra(loadout, 'ex_rcs')) { rcsG = new THREE.Group(); rcsG.name = 'rcs'; rcsG.userData.comp = true; for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; const q = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), mt.hullDark); q.position.set(Math.cos(a) * (topR + 0.05), y - 0.4, Math.sin(a) * (topR + 0.05)); rcsG.add(q); } root.add(rcsG); }

  const height = plTop + (fairing ? 0.6 : 1.0);
  // anchor points for flames (in rocket-local space)
  const flameAnchor = new THREE.Object3D(); flameAnchor.position.set(0, 0.05, 0); core.add(flameAnchor);
  const upperAnchor = new THREE.Object3D(); upperAnchor.position.set(0, upper ? upper.position.y : 0, 0); root.add(upperAnchor);
  const boosterAnchors = boosters ? boosters.children.map(b => b.position.clone().setY(b.position.y)) : [];

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  engine.userData.comp = true;
  const components = buildComponentList({ engine, skirt: skirtG, gimbal: gimbalG, tank: tankG, interstage: interstageG, fins: finsG, boosters, upper, fairing, payload: pl, rcs: rcsG }, c, loadout, pl);
  return { group: root, parts: { core, boosters, upper, fairing, payload: pl, engine, flameAnchor, upperAnchor }, components, height, coreRadius: R, exitRadius: engine.userData.exitRadius, boosterAnchors, upperRadius: upper ? upper.userData.radius : 0 };
}

// ---------------------------------------------------------------------------------------------
// Component list = the single source for the exploded view, click-to-inspect and the Lab legend.
// Each entry: { key, label, slot, partId, obj, axial (stack position, bottom=0) | radial offset }.
// The offsets are applied by applyExplode() on top of the stored assembled position, so the design is never mutated.
// ---------------------------------------------------------------------------------------------
function buildComponentList(o, c, loadout, pl) {
  const list = [];
  const add = (key, label, slot, partId, obj, spec) => { if (obj) list.push({ key, label, slot, partId, obj, ...spec }); };
  add('engine', 'Main engine: ' + c.engine.name, 'engines', c.engine.id, o.engine, { axial: 0 });
  add('gimbal', 'Gimbal package', 'extras', 'ex_gimbal', o.gimbal, { axial: 1 });
  add('skirt', 'Engine skirt (' + c.structure.name + ')', 'structures', c.structure.id, o.skirt, { axial: 2 });
  add('tank', 'Core tank: ' + c.tank.name, 'tanks', c.tank.id, o.tank, { axial: 3 });
  add('interstage', 'Interstage (' + c.structure.name + ')', 'structures', c.structure.id, o.interstage, { axial: 4 });
  add('upper', 'Upper stage: ' + c.upper.name, 'upperStages', c.upper.id, o.upper, { axial: 5 });
  add('payload', 'Payload: ' + c.payload.name, 'payloads', c.payload.id, o.payload, { axial: 6 });
  add('fairing', 'Payload fairing', 'extras', 'ex_fairing', o.fairing, { axial: 7, extraLift: (o.fairing && o.fairing.userData.height || 2) * 1.0 });
  add('fins', 'Stabiliser fins', 'structures', c.structure.id, o.fins, { radial: 1.6 });
  add('boosters', 'Boosters: ' + c.boosters.name, 'boosters', c.boosters.id, o.boosters, { radialChildren: 2.8 });
  add('rcs', 'RCS thruster ring', 'extras', 'ex_rcs', o.rcs, { radial: 1.0, lift: 1.2 });
  // spacecraft extras ride on the payload: move them sideways relative to it
  pl.children.filter(ch => ch.name === 'solar').forEach((ch, i) => add('solar' + i, 'Solar array wing', 'extras', 'ex_solar', ch, { localX: Math.sign(ch.position.x) * 1.6 }));
  pl.children.filter(ch => ch.name === 'antenna').forEach(ch => add('antenna', 'High-gain antenna', 'extras', 'ex_antenna', ch, { localZ: 1.4 }));
  list.forEach(cp => { cp.base = cp.obj.position.clone(); if (cp.key === 'fins' || cp.key === 'rcs') cp.obj.children.forEach(f => { f.userData.b = f.position.clone(); }); if (cp.radialChildren) cp.kids = cp.obj.children.map(k => ({ k, base: k.position.clone() })); cp.obj.userData.compKey = cp.key; });
  return list;
}

const AXIAL_GAP = 1.7;
// e = 0 -> assembled, e = 1 -> fully exploded. Pure function of the stored base positions (idempotent, no accumulated drift).
export function applyExplode(components, e) {
  if (e < 0.0005) e = 0;
  const present = components.filter(cp => cp.axial !== undefined).sort((a, b) => a.axial - b.axial);
  present.forEach((cp, i) => { cp.obj.position.copy(cp.base); cp.obj.position.y += e * (cp.key === 'engine' ? -1.6 : i * AXIAL_GAP + (cp.extraLift || 0)); });
  for (const cp of components) {
    if (cp.axial !== undefined) continue;
    cp.obj.position.copy(cp.base);
    if (cp.key === 'fins') cp.obj.children.forEach(f => { const d = new THREE.Vector3(f.userData.b.x, 0, f.userData.b.z).normalize(); f.position.copy(f.userData.b).addScaledVector(d, e * cp.radial); });
    if (cp.key === 'rcs') cp.obj.children.forEach(f => { const d = new THREE.Vector3(f.userData.b.x, 0, f.userData.b.z).normalize(); f.position.copy(f.userData.b).addScaledVector(d, e * 1.4); f.position.y = f.userData.b.y + e * 4.2; });
    if (cp.kids) cp.kids.forEach(({ k, base }) => { const d = new THREE.Vector3(base.x, 0, base.z).normalize(); k.position.copy(base).addScaledVector(d, e * cp.radialChildren); });
    if (cp.localX !== undefined) cp.obj.position.x += e * cp.localX;
    if (cp.localZ !== undefined) cp.obj.position.z += e * cp.localZ;
  }
  // total vertical extent added by the explosion (lets the Lab keep the camera framed)
  return e * ((present.length - 1) * AXIAL_GAP + 2.5 - 1.6);
}

export function disposeObject(o) {
  o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && !Object.values(mats).includes(n.material)) { (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose && m.dispose()); } });
}
