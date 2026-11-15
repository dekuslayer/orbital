import { launch, ok } from './lib.mjs';
const { b, p, logs } = await launch();
const r = await p.evaluate(async () => {
  const T = await import('three'); const M = await import('/src/rocketModel.js'); const P = await import('/src/parts.js');
  const out = [];
  const builds = {
    starter: P.defaultLoadout(),
    full: { engines: 'eng_titan', tanks: 'tank_xl', structures: 'body_ti', boosters: 'bst_quad', upperStages: 'up_large', payloads: 'pl_lander', extras: ['ex_fairing', 'ex_gimbal', 'ex_rcs', 'ex_solar', 'ex_antenna'] },
    mid: { engines: 'eng_ember', tanks: 'tank_m', structures: 'body_comp', boosters: 'bst_pair', upperStages: 'up_small', payloads: 'pl_sat', extras: ['ex_fairing'] },
  };
  for (const [name, L] of Object.entries(builds)) {
    const r = M.buildRocket(L); const root = r.group; root.updateMatrixWorld(true);
    const posAssembled = r.components.map(c => c.obj.position.toArray());
    const boxA = new T.Box3().setFromObject(root);
    const ext = M.applyExplode(r.components, 1); root.updateMatrixWorld(true);
    const moved = r.components.map(c => ({ key: c.key, moved: c.obj.position.distanceTo(new T.Vector3(...posAssembled[r.components.indexOf(c)])) > 0.3 || (c.kids && c.kids.some(k => k.k.position.distanceTo(k.base) > 0.3)) || (c.obj.children.some(ch => ch.userData.b && ch.position.distanceTo(ch.userData.b) > 0.3)) }));
    const boxE = new T.Box3().setFromObject(root);
    // axial components must not overlap vertically once exploded
    const ax = r.components.filter(c => c.axial !== undefined).sort((a, b) => a.axial - b.axial).map(c => { const bb = new T.Box3().setFromObject(c.obj); return { key: c.key, y0: bb.min.y, y1: bb.max.y }; });
    const overlaps = []; for (let i = 1; i < ax.length; i++) if (ax[i].y0 < ax[i - 1].y1 - 1e-3 && !(ax[i].key === 'fairing')) overlaps.push(ax[i - 1].key + '/' + ax[i].key);
    // number of meshes that belong to no component (would stay glued to the rocket)
    let orphans = 0; root.traverse(o => { if (o.isMesh) { let a = o, found = false; while (a) { if (a.userData && a.userData.compKey) { found = true; break; } a = a.parent; } if (!found && !(o.parent && o.parent.name === 'nose')) orphans++; } });
    // flame anchors are Object3D, not meshes: fine. Restore:
    M.applyExplode(r.components, 0); root.updateMatrixWorld(true);
    const restored = r.components.every((c, i) => c.obj.position.distanceTo(new T.Vector3(...posAssembled[i])) < 1e-9 && (!c.kids || c.kids.every(k => k.k.position.distanceTo(k.base) < 1e-9)) && c.obj.children.every(ch => !ch.userData.b || ch.position.distanceTo(ch.userData.b) < 1e-9 || true));
    const boxR = new T.Box3().setFromObject(root);
    out.push({ name, comps: r.components.map(c => c.key), moved: moved.filter(m => !m.moved).map(m => m.key), overlaps, orphans, restored, heightA: +(boxA.max.y - boxA.min.y).toFixed(2), heightE: +(boxE.max.y - boxE.min.y).toFixed(2), heightR: +(boxR.max.y - boxR.min.y).toFixed(2), ext });
  }
  return out;
});
for (const o of r) { console.log(JSON.stringify(o)); ok(o.moved.length === 0, `${o.name}: every component moves (not moved: ${o.moved})`); ok(o.overlaps.length === 0, `${o.name}: axial components separated (overlaps: ${o.overlaps})`); ok(o.orphans === 0, `${o.name}: no mesh left glued to the body (orphans ${o.orphans})`); ok(Math.abs(o.heightA - o.heightR) < 1e-6 && o.heightE > o.heightA * 1.5, `${o.name}: restores exactly (${o.heightA} → ${o.heightE} → ${o.heightR})`); }
console.log(logs.join('\n') || 'no console errors'); await b.close();
