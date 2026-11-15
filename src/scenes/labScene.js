// ORBITAL — Rocket Engineering Lab 3D view: a turntable platform in a hangar-like space with an orbit-controlled camera.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRocket, disposeObject, applyExplode } from '../rocketModel.js';

export class LabView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.reduceMotion = !!opts.reduceMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x050914); this.scene.fog = new THREE.Fog(0x050914, 40, 120);
    const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400); this.camera.position.set(16, 9, 20);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = true; this.controls.target.set(0, 6, 0); this.controls.autoRotate = !this.reduceMotion; this.controls.autoRotateSpeed = 0.7; this.controls.minDistance = 8; this.controls.maxDistance = 90; this.controls.maxPolarAngle = Math.PI * 0.52;
    // platform
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.6, 64), new THREE.MeshStandardMaterial({ color: 0x1a2233, metalness: 0.85, roughness: 0.35 })); plat.position.y = -0.3; plat.receiveShadow = true; this.scene.add(plat);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.07, 12, 96), new THREE.MeshBasicMaterial({ color: 0x35e0ff })); glow.rotation.x = Math.PI / 2; glow.position.y = 0.02; this.scene.add(glow);
    const glow2 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.04, 12, 96), new THREE.MeshBasicMaterial({ color: 0xff3fb4 })); glow2.rotation.x = Math.PI / 2; glow2.position.y = 0.02; this.scene.add(glow2);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ color: 0x080d1a, metalness: 0.9, roughness: 0.55 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.62; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(120, 60, 0x15324a, 0x0c1a2c); grid.position.y = -0.6; this.scene.add(grid);
    // pylons for a laboratory feel
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 14 + (i % 2) * 4, 0.6), new THREE.MeshStandardMaterial({ color: 0x141c2e, metalness: 0.8, roughness: 0.4, emissive: 0x04202a })); p.position.set(Math.cos(a) * 30, 7, Math.sin(a) * 30); this.scene.add(p); const l = new THREE.PointLight(i % 2 ? 0xff3fb4 : 0x35e0ff, 80, 40); l.position.set(Math.cos(a) * 26, 11, Math.sin(a) * 26); this.scene.add(l); }
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(10, 22, 12); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 24; sc.bottom = -4; sc.near = 1; sc.far = 80; key.shadow.bias = -0.0003; this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0x6fa8ff, 0x101420, 0.5));
    this.holder = new THREE.Group(); this.scene.add(this.holder); this.explodeOn = false; this.anim = 1; this.spin = true; this.rocket = null;
    this.resize();
  }
  setLoadout(loadout, animate = true) {
    if (this.rocket) { this.holder.remove(this.rocket.group); disposeObject(this.rocket.group); }
    this.rocket = buildRocket(loadout); this.holder.add(this.rocket.group);
    this.height = this.rocket.height; this.controls.target.set(0, Math.max(5, this.height * 0.45), 0);
    this.anim = animate && !this.reduceMotion ? 0 : 1; this._ex = this.explodeOn ? 1 : 0; this._dirty = true; this.extent = 0; this._frameEx = 0;
  }
  setExplode(on) { this.explodeOn = !!on; }
  applyExplode(instant) { this._ex = instant ? (this.explodeOn ? 1 : 0) : (this._ex ?? 0); if (this.rocket) this.extent = applyExplode(this.rocket.components, this._ex); }
  resize() { const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 500; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // Which installed component is under the pointer? (x, y in -1..1 NDC). Works in the assembled and the exploded view.
  pick(ndcX, ndcY) {
    if (!this.rocket) return null;
    this._ray = this._ray || new THREE.Raycaster(); this._ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this._ray.intersectObject(this.rocket.group, true);
    for (const h of hits) { let o = h.object; while (o) { if (o.userData && o.userData.compKey) { return this.rocket.components.find(c => c.key === o.userData.compKey) || null; } o = o.parent; } }
    return null;
  }
  // Selection outline: a box helper around the chosen component (no shared material is touched).
  highlight(key) { this.selectedKey = key || null; if (!this.selBox) { this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0x35e0ff); this.selBox.visible = false; this.scene.add(this.selBox); } if (!key) this.selBox.visible = false; }
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.rocket) {
      if (this.anim < 1) { this.anim = Math.min(1, this.anim + dt * 1.6); const k = 1 - Math.pow(1 - this.anim, 3); this.rocket.group.position.y = (1 - k) * 6; this.rocket.group.scale.setScalar(0.85 + 0.15 * k); } else { this.rocket.group.position.y = 0; this.rocket.group.scale.setScalar(1); }
      const target = this.explodeOn ? 1 : 0; const cur = this._ex ?? 0;
      if (Math.abs(target - cur) > 0.0005) this._ex = cur + (target - cur) * Math.min(1, dt * 4); else this._ex = target;
      // idempotent: positions are recomputed from the stored assembled positions every frame (nothing accumulates, nothing is lost)
      if (this._lastEx !== this._ex || this._dirty) { this.extent = applyExplode(this.rocket.components, this._ex); this._lastEx = this._ex; this._dirty = false; }
      const ty = Math.max(5, this.height * 0.45) + (this.extent || 0) * 0.5; this.controls.target.y += (ty - this.controls.target.y) * Math.min(1, dt * 4);
      // keep the whole (exploded) stack framed: move the camera back by the extra height, preserving the user's own zoom/orbit
      const dEx = (this.extent || 0) - (this._frameEx || 0); if (Math.abs(dEx) > 1e-4) { const dir = this.camera.position.clone().sub(this.controls.target).normalize(); this.camera.position.addScaledVector(dir, dEx * 2.0); this._frameEx = this.extent || 0; }
    }
    if (this.selBox) { const cp = this.selectedKey && this.rocket ? this.rocket.components.find(c => c.key === this.selectedKey) : null; this.selBox.visible = !!cp; if (cp) { this.rocket.group.updateMatrixWorld(true); this.selBox.box.setFromObject(cp.obj); } }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  dispose() { this.controls.dispose(); this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); } }); this.renderer.dispose(); }
}
