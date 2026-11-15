// ORBITAL — continuous flight scene (pad -> atmosphere -> space -> Moon).
// One coordinate system: simulation metres, planet centre at the origin, +Y through the launchpad.
// Floating origin: the camera/rocket stay near (0,0,0) and the "world" groups are translated by -rocketPosition,
// which keeps float precision good. Two render passes (far: sky/planet/Moon, near: pad/rocket/clouds/smoke) share one camera
// pose, so there is never a scene switch: everything is the same continuous world.
import * as THREE from 'three';
import { buildRocket, disposeObject } from '../rocketModel.js';
import { WORLD } from '../missions.js';

const R = WORLD.R, MU = WORLD.mu;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function softTexture(inner = 0.0, color = '255,255,255') {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 64 * inner, 64, 64, 64); gr.addColorStop(0, `rgba(${color},1)`); gr.addColorStop(0.5, `rgba(${color},0.45)`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}

// Texture shift (fraction of the map width) that puts the launch pad over the Atlantic coast of equatorial South America (about 52 W), so the pad sits on real land.
const PAD_TEX_OFFSET = -0.394;
function planetTexture() {
  const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#0b3a73'; g.fillRect(0, 0, W, H);
  const rnd = mulberry(7);
  // continents: many overlapping blobs; one large launch-site landmass centred at u=0.75,v=0.5 (where the pad sits)
  const blobs = [[0.75, 0.5, 0.11], [0.2, 0.4, 0.1], [0.45, 0.3, 0.07], [0.55, 0.6, 0.06], [0.9, 0.3, 0.05], [0.1, 0.7, 0.05], [0.35, 0.55, 0.05]];
  for (const [u, v, s] of blobs) for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), 0.6) * s; const x = (u + Math.cos(a) * d * 1.0) * W, y = (v + Math.sin(a) * d * 1.9) * H, rad = (0.02 + rnd() * 0.035) * W * s * 5;
    const lat = Math.abs(v - 0.5); g.fillStyle = lat > 0.32 ? '#d9e4ea' : rnd() < 0.3 ? '#b49e63' : rnd() < 0.5 ? '#3f7d3a' : '#2f6b34'; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 0, W, H * 0.05); g.fillRect(0, H * 0.95, W, H * 0.05);
  // light cloud swirls
  g.globalAlpha = 0.35; for (let i = 0; i < 220; i++) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 90, 4 + rnd() * 14, rnd() * 3, 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FS = `
varying vec3 vDir; uniform vec3 uUp; uniform vec3 uSun; uniform float uAtmo; uniform float uAlt;
void main(){
  vec3 d = normalize(vDir); float h = dot(d, uUp); float sunDot = max(dot(d, normalize(uSun)), 0.0);
  vec3 zenith = vec3(0.10, 0.30, 0.78); vec3 horizon = vec3(0.62, 0.78, 0.95);
  float t = smoothstep(-0.05, 0.6, h);
  vec3 sky = mix(horizon, zenith, t);
  sky += vec3(1.0,0.85,0.6) * pow(sunDot, 12.0) * 0.35;
  vec3 space = vec3(0.004, 0.006, 0.016);
  // thin limb glow remains visible in space near the horizon
  float limb = exp(-abs(h + 0.12) * 14.0) * (1.0 - uAtmo) * smoothstep(0.0, 1.0, uAlt) * 0.35;
  vec3 col = mix(space, sky, uAtmo) + vec3(0.2,0.45,1.0) * limb * 0.0;
  float sun = smoothstep(0.9993, 0.9998, sunDot);
  col += vec3(1.0,0.95,0.8) * sun * 3.0;
  gl_FragColor = vec4(col, 1.0);
}`;
const ATMO_VS = `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ATMO_FS = `varying vec3 vN; varying vec3 vP; uniform vec3 uCam; uniform vec3 uSun;
void main(){ vec3 v = normalize(uCam - vP); float f = pow(1.0 - max(dot(normalize(vN), v), 0.0), 3.2); float lit = clamp(dot(normalize(vN), normalize(uSun)) * 0.8 + 0.35, 0.05, 1.0);
  gl_FragColor = vec4(vec3(0.25,0.55,1.0) * f * lit * 1.6, f * lit); }`;
const PARTICLE_VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FS = `uniform sampler2D uMap; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.003) discard; }`;

const REDUCED_PARTICLES = v => !!v.reduceMotion;

export class FlightView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.reduceMotion = !!opts.reduceMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    this.renderer.autoClear = false; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.far = new THREE.Scene(); this.near = new THREE.Scene();
    this.camFar = new THREE.PerspectiveCamera(50, 1, 20, 3e8); this.camNear = new THREE.PerspectiveCamera(50, 1, 0.25, 4e5);
    this.worldFar = new THREE.Group(); this.worldNear = new THREE.Group(); this.far.add(this.worldFar); this.near.add(this.worldNear);
    this.sun = V(0.75, 0.55, 0.45).normalize();
    this.viewUp = V(0, 1, 0); this.camDist = 40; this.farView = false; this.rng = mulberry(11);
    this.debris = []; this.particles = null; this.rocket = null; this.flameObjs = []; this.prev = {}; this.shake = 0; this.flash = 0;
    this.buildFar(); this.buildNear(); this.buildParticles();
    this.resize();
  }

  buildFar() {
    const f = this.far;
    // sky dome follows camera
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: { uUp: { value: V(0, 1, 0) }, uSun: { value: this.sun.clone() }, uAtmo: { value: 1 }, uAlt: { value: 0 } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1e7, 32, 16), this.skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; f.add(this.sky);
    // stars
    const n = 3500, pos = new Float32Array(n * 3), rnd = mulberry(3);
    for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); pos.set([s * Math.cos(a) * 6e7, u * 6e7, s * Math.sin(a) * 6e7], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // Stars must respect the planet's depth buffer. With depthTest disabled they are drawn over Earth,
    // making the globe look transparent even though its material is opaque.
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: true });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; this.stars.renderOrder = -9; f.add(this.stars);
    this.buildDeepSpace(f);
    // lights
    this.sunFar = new THREE.DirectionalLight(0xfff2dd, 3.1); this.sunFar.position.copy(this.sun); f.add(this.sunFar);
    f.add(new THREE.AmbientLight(0x1a2a50, 0.55));
    // planet
    // Use the surface texture as a subtle emissive fill as well as a diffuse map. This
    // keeps the night-side oceans and continents legible instead of turning nearly black
    // when the camera happens to face away from the simulated Sun.
    const earthFallback = planetTexture();
    const planetMat = new THREE.MeshStandardMaterial({
      map: earthFallback, emissiveMap: earthFallback, emissive: 0xffffff,
      // A stronger low-level fill keeps the night-facing hemisphere colourful rather than nearly black.
      emissiveIntensity: 0.9, roughness: 0.95, metalness: 0,
      transparent: false, opacity: 1, depthWrite: true
    });
    // The brighter, colour-corrected map is still real surface imagery, but keeps oceans and land legible in space.
    this._loadReal(planetMat, 'earth_color_2048_vivid.jpg', PAD_TEX_OFFSET);
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(R, 360, 180), planetMat); this.planet.rotation.x = Math.PI / 2; this.planet.renderOrder = 0; this.worldFar.add(this.planet);
    // A thin, translucent cloud shell adds depth and a recognizably terrestrial look without hiding the surface.
    this._loadEarthCloudLayer();
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(R + 70000, 96, 48), new THREE.ShaderMaterial({ vertexShader: ATMO_VS, fragmentShader: ATMO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCam: { value: V(0, 0, 0) }, uSun: { value: this.sun.clone() } } }));
    this.atmo.renderOrder = 2; this.worldFar.add(this.atmo);
    // moon
    const mc = document.createElement('canvas'); mc.width = 512; mc.height = 256; const g = mc.getContext('2d'); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 512, 256); const mr = mulberry(21);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${60 + mr() * 70},${60 + mr() * 70},${60 + mr() * 70},0.45)`; g.beginPath(); g.arc(mr() * 512, mr() * 256, 2 + mr() * 18, 0, 7); g.fill(); }
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    const moonMat = new THREE.MeshStandardMaterial({ map: mt, roughness: 1, metalness: 0 }); this._loadReal(moonMat, 'moon_1024.jpg', 0);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(WORLD.moonR, 64, 32), moonMat);
    const MP = WORLD.moonPos(); this.moon.position.set(MP.x, MP.y, 0); this.worldFar.add(this.moon);   // fixed simulation position: the same point the flight model targets
    // encounter zone ring (the vehicle must pass inside this circle) and a soft glow so the Moon is findable from far away
    { const seg = 160, pp = new Float32Array(seg * 3); for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2; pp.set([MP.x + Math.cos(a) * WORLD.moonSOI, MP.y + Math.sin(a) * WORLD.moonSOI, 0], i * 3); }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(pp, 3));
      this.soiRing = new THREE.LineLoop(g2, new THREE.LineBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.5, depthTest: false })); this.soiRing.renderOrder = 4; this.soiRing.frustumCulled = false; this.worldFar.add(this.soiRing); }
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, '210,225,255'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.0 })); this.moonGlow.position.copy(this.moon.position); this.moonGlow.scale.set(2.4e6, 2.4e6, 1); this.moonGlow.renderOrder = 6; this.worldFar.add(this.moonGlow);
    this.earthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, '90,160,255'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.0 })); this.earthGlow.scale.set(5e6, 5e6, 1); this.earthGlow.renderOrder = 6; this.worldFar.add(this.earthGlow);
    { const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)); this.marker = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0xffc24a, size: 13, sizeAttenuation: false, depthTest: false, transparent: true })); this.marker.frustumCulled = false; this.marker.renderOrder = 8; this.marker.visible = false; this.worldFar.add(this.marker); }
    this.mapView = false; this.predT = 99; this.pathInfo = null;
    // trajectory
    this.orbitGeo = new THREE.BufferGeometry(); this.orbitGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(420 * 3), 3));
    this.orbitLine = new THREE.Line(this.orbitGeo, new THREE.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.85, depthTest: false })); this.orbitLine.visible = false; this.orbitLine.frustumCulled = false; this.orbitLine.renderOrder = 5; this.worldFar.add(this.orbitLine);
  }

  // ---- deep-space scenery (added): a galaxy/nebula sky, distant planets and rare shooting stars, all visible only once you are in space ----
  buildDeepSpace(f) {
    const rnd = mulberry(77); this.deep = [];
    // (a) sky map: a Milky-Way style band, glowing nebulae and a few spiral galaxies painted on one big inside-out sphere
    const W = 2048, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.globalCompositeOperation = 'lighter';
    const blob = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (let i = 0; i < 700; i++) { const x = rnd() * W, y = H * 0.5 + Math.sin(x / W * Math.PI * 2 + 0.6) * H * 0.16 + (rnd() + rnd() + rnd() - 1.5) * H * 0.07; blob(x, y, 18 + rnd() * 46, rnd() < 0.7 ? '150,170,230' : '230,190,150', 0.035 + rnd() * 0.04); }
    for (let i = 0; i < 9; i++) blob(rnd() * W, rnd() * H, 90 + rnd() * 160, ['190,60,170', '40,160,200', '110,70,210', '220,110,60'][i % 4], 0.07 + rnd() * 0.06);
    const galaxy = (x, y, r, rot, col) => { blob(x, y, r * 0.55, '255,240,210', 0.55); for (let arm = 0; arm < 2; arm++) for (let k = 0; k < 90; k++) { const t = k / 90, ang = rot + arm * Math.PI + t * 4.2, rad = r * (0.12 + t * 0.9); blob(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.55, r * 0.22 * (1 - t * 0.5), col, 0.10 * (1 - t * 0.7)); } };
    galaxy(W * 0.30, H * 0.26, 70, 0.4, '150,190,255'); galaxy(W * 0.72, H * 0.70, 55, 2.1, '255,200,160'); galaxy(W * 0.10, H * 0.68, 40, 1.2, '190,170,255'); galaxy(W * 0.86, H * 0.22, 34, 0.2, '170,220,255'); galaxy(W * 0.50, H * 0.82, 30, 3.0, '255,190,200');
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.4, 1 + rnd() * 1.4); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.skyMapMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false, toneMapped: false });
    this.skyMap = new THREE.Mesh(new THREE.SphereGeometry(5.5e7, 64, 32), this.skyMapMat); this.skyMap.rotation.set(0.5, 1.1, 0.3); this.skyMap.renderOrder = -9; this.skyMap.frustumCulled = false; this.deepG = new THREE.Group(); f.add(this.deepG); this.deepG.add(this.skyMap);
    // (b) distant planets (painted sprites). They sit "at infinity", so they only slide as the camera drifts around the rocket.
    const planet = (kind) => {
      const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d'), cx = S / 2, R = kind === 'ringed' ? 120 : 170;
      const ring = (front) => { x.save(); x.translate(cx, cx); x.rotate(-0.35); x.scale(1, 0.28); x.lineWidth = 7; for (let i = 0; i < 9; i++) { const rr = R * (1.35 + i * 0.11); x.strokeStyle = `rgba(${225 - i * 8},${200 - i * 10},${150 - i * 9},${0.55 - i * 0.04})`; x.beginPath(); if (front) x.arc(0, 0, rr, 0, Math.PI); else x.arc(0, 0, rr, Math.PI, Math.PI * 2); x.stroke(); } x.restore(); };
      if (kind === 'ringed') ring(false);
      x.save(); x.beginPath(); x.arc(cx, cx, R, 0, 7); x.clip();
      const cols = kind === 'ringed' ? ['#e8c98a', '#c99a5a', '#f1dcae', '#b98650', '#e3bd7c'] : ['#8a3b2a', '#b5573a', '#7a2f22', '#c86b45', '#9a4630'];
      for (let i = 0; i < 14; i++) { x.fillStyle = cols[i % cols.length]; x.globalAlpha = 0.9; x.fillRect(cx - R, cx - R + i * (R * 2 / 14), R * 2, R * 2 / 14 + 1); } x.globalAlpha = 1;
      if (kind !== 'ringed') for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${40 + rnd() * 80},${10 + rnd() * 30},10,0.25)`; x.beginPath(); x.arc(cx + (rnd() - 0.5) * R * 1.6, cx + (rnd() - 0.5) * R * 1.6, 6 + rnd() * 24, 0, 7); x.fill(); }
      const sh = x.createRadialGradient(cx - R * 0.45, cx - R * 0.4, R * 0.15, cx, cx, R * 1.05); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,10,0.88)'); x.fillStyle = sh; x.fillRect(0, 0, S, S); x.restore();
      if (kind === 'ringed') ring(true);
      const glow = x.createRadialGradient(cx, cx, R * 0.95, cx, cx, R * 1.25); glow.addColorStop(0, kind === 'ringed' ? 'rgba(255,225,170,0.30)' : 'rgba(255,140,100,0.30)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); x.globalCompositeOperation = 'lighter'; x.fillStyle = glow; x.fillRect(0, 0, S, S);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const add = (kind, dir, size) => { const m = new THREE.SpriteMaterial({ map: planet(kind), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }); const sp = new THREE.Sprite(m); sp.position.copy(dir.normalize().multiplyScalar(5.8e7)); sp.scale.set(size, size, 1); sp.renderOrder = -8; this.deepG.add(sp); this.deep.push(sp); };
    // positions are in CAMERA space (x right, y up, -z forward): they sit in the strip of sky above the Earth's limb
    add('ringed', V(0.52, 0.33, -1), 1.0e7); add('rust', V(-0.62, 0.30, -1), 4.2e6); add('ringed', V(0.02, 0.37, -1), 3.2e6);
    // (c) a rare shooting star, replaced every few seconds, so space feels alive without turning into rain
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
    this.meteorMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.meteor = new THREE.Line(mg, this.meteorMat); this.meteor.frustumCulled = false; this.meteor.renderOrder = -7; f.add(this.meteor); this.meteorT = 3; this.meteorLife = 0;
  }
  updateDeepSpace(dt, altE, active) {
    const k = active ? smooth(30000, 110000, altE) : 0;
    // normal view: glue the scenery to the camera orientation (plus a tiny slow sway); map view: leave it fixed in the world
    if (this.mapView) this.deepG.quaternion.set(0, 0, 0, 1);
    else { this.deepG.quaternion.copy(this.camFar.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(performance.now() * 0.00007) * 0.06, 0))); }
    this.skyMapMat.opacity = k * 0.85; this.skyMap.visible = k > 0.01; this.deep.forEach(sp => { sp.material.opacity = k; sp.visible = k > 0.01; });
    if (k < 0.5) { this.meteorMat.opacity = 0; return; }
    this.meteorT -= dt;
    if (this.meteorT <= 0 && this.meteorLife <= 0) {   // launch a new one in the part of the sky the camera is looking at
      const fwd = V(0, 0, -1).applyQuaternion(this.camFar.quaternion), upv = V(0, 1, 0).applyQuaternion(this.camFar.quaternion), rt = V(1, 0, 0).applyQuaternion(this.camFar.quaternion);
      const c0 = fwd.clone().addScaledVector(upv, 0.15 + Math.random() * 0.35).addScaledVector(rt, (Math.random() - 0.5) * 0.9).normalize(), d = rt.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1).addScaledVector(upv, -0.25 - Math.random() * 0.3).normalize();
      const a = c0.clone().multiplyScalar(5e7), b = a.clone().addScaledVector(d, 5e6 + Math.random() * 4e6); const pa = this.meteor.geometry.attributes.position; pa.setXYZ(0, b.x, b.y, b.z); pa.setXYZ(1, a.x, a.y, a.z); pa.needsUpdate = true;
      this.meteorLife = 0.7; this.meteorT = 7 + Math.random() * 9;
    }
    if (this.meteorLife > 0) { this.meteorLife -= dt; this.meteorMat.opacity = Math.max(0, Math.sin(Math.max(0, this.meteorLife) / 0.7 * Math.PI)) * 0.9; } else this.meteorMat.opacity = 0;
  }

  buildNear() {
    const n = this.near;
    this.sunNear = new THREE.DirectionalLight(0xfff1dc, 3.4); this.sunNear.castShadow = true; this.sunNear.shadow.mapSize.set(2048, 2048);
    const sc = this.sunNear.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400; this.sunNear.shadow.bias = -0.0004;
    n.add(this.sunNear); n.add(this.sunNear.target);
    this.hemi = new THREE.HemisphereLight(0x9fc8ff, 0x35402c, 0.7); n.add(this.hemi);
    n.fog = new THREE.Fog(0xa9c8ee, 4000, 70000);
    // launch complex at the pad (world coords (0,R,0))
    const pad = new THREE.Group(); pad.position.set(0, R, 0); this.worldNear.add(pad); this.pad = pad;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 1.2, 48), concrete); slab.position.y = -0.6; slab.receiveShadow = true; pad.add(slab);
    const trench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 30), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 1 })); trench.position.set(0, 0.01, 0); pad.add(trench);
    const grassGeo = new THREE.CircleGeometry(900, 96, 0, Math.PI * 2); grassGeo.rotateX(-Math.PI / 2); { const gp = grassGeo.attributes.position; for (let i = 0; i < gp.count; i++) { const gx = gp.getX(i), gz = gp.getZ(i); gp.setY(i, -(gx * gx + gz * gz) / (2 * R)); } gp.needsUpdate = true; grassGeo.computeVertexNormals(); }
    const grass = new THREE.Mesh(grassGeo, new THREE.MeshStandardMaterial({ color: 0x3c6a35, roughness: 1 })); grass.position.y = -0.7; grass.receiveShadow = true; pad.add(grass);
    // service tower (truss look from boxes)
    const steel = new THREE.MeshStandardMaterial({ color: 0xb23a2e, metalness: 0.5, roughness: 0.5 });
    const tower = new THREE.Group(); tower.position.set(11, 0, 0);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 70, 0.4), steel); leg.position.set(dx * 1.8, 35, dz * 1.8); leg.castShadow = true; tower.add(leg); }
    for (let i = 1; i < 14; i++) { const br = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.25, 0.25), steel); br.position.set(0, i * 5, 1.8); tower.add(br); const br2 = br.clone(); br2.position.z = -1.8; tower.add(br2); }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 1), steel); arm.position.set(-4, 40, 0); tower.add(arm); pad.add(tower);
    // hangar and lights for scale
    const hangar = new THREE.Mesh(new THREE.BoxGeometry(60, 35, 40), new THREE.MeshStandardMaterial({ color: 0xcfd5db, roughness: 0.8 })); hangar.position.set(-260, 17.5, -150); hangar.castShadow = true; hangar.receiveShadow = true; pad.add(hangar);
    for (let i = 0; i < 4; i++) { const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 24, 8), steel); const a = i / 4 * Math.PI * 2 + 0.7; lamp.position.set(Math.cos(a) * 36, 12, Math.sin(a) * 36); lamp.castShadow = true; pad.add(lamp); }
    // clouds: sprites placed around the pad between 1.2 km and 7 km, fixed in the world
    const ct = document.createElement('canvas'); ct.width = ct.height = 256; const cg = ct.getContext('2d'); const cr = mulberry(5);
    for (let i = 0; i < 26; i++) { const x = 60 + cr() * 136, y = 100 + cr() * 60, r = 28 + cr() * 38; const gr = cg.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cg.fillStyle = gr; cg.beginPath(); cg.arc(x, y, r, 0, 7); cg.fill(); }
    const ctex = new THREE.CanvasTexture(ct); this.clouds = [];
    const rr = mulberry(99);
    for (let i = 0; i < 170; i++) {
      const mat = new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0.55 + rr() * 0.35, color: 0xffffff });
      const s = new THREE.Sprite(mat); const ang = rr() * Math.PI * 2, dist = 300 + Math.pow(rr(), 0.7) * 16000; const alt = 1200 + rr() * 5800; const size = 700 + rr() * 2200;
      s.position.set(Math.cos(ang) * dist, R + alt, Math.sin(ang) * dist); s.scale.set(size, size * 0.55, 1); this.worldNear.add(s); this.clouds.push(s);
    }
    // a large thin cloud deck at 3.2 km with gaps, to give a strong "passing through clouds" cue
    for (let i = 0; i < 60; i++) { const mat = new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0.7 }); const s = new THREE.Sprite(mat); const ang = rr() * Math.PI * 2, dist = 150 + rr() * 5000; s.position.set(Math.cos(ang) * dist, R + 3000 + rr() * 500, Math.sin(ang) * dist); s.scale.set(1800 + rr() * 1800, 900, 1); this.worldNear.add(s); this.clouds.push(s); }
  }

  buildParticles() {
    const N = 2200; this.N = N; this.pi = 0;
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3); this.pSize = new Float32Array(N); this.pAlpha = new Float32Array(N); this.pCol = new Float32Array(N * 3);
    this.pVel = new Float32Array(N * 3); this.pAge = new Float32Array(N).fill(1e9); this.pLife = new Float32Array(N).fill(1); this.pGrow = new Float32Array(N); this.pBase = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1)); geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1)); geo.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3));
    this.pMat = new THREE.ShaderMaterial({ vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false, uniforms: { uMap: { value: softTexture() }, uScale: { value: 600 } } });
    this.points = new THREE.Points(geo, this.pMat); this.points.frustumCulled = false; this.worldNear.add(this.points);
  }

  emit(pos, vel, size, life, color, alpha, grow) {
    const i = this.pi; this.pi = (this.pi + 1) % this.N;
    this.pPos.set([pos.x, pos.y, pos.z], i * 3); this.pVel.set([vel.x, vel.y, vel.z], i * 3); this.pBase[i] = size; this.pSize[i] = size; this.pAge[i] = 0; this.pLife[i] = life; this.pCol.set(color, i * 3); this.pAlpha[i] = alpha; this.pGrow[i] = grow;
  }

  updateParticles(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.pAge[i] > this.pLife[i]) { this.pAlpha[i] = 0; continue; }
      this.pAge[i] += dt; const k = this.pAge[i] / this.pLife[i];
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      this.pSize[i] = this.pBase[i] * (1 + this.pGrow[i] * k); this.pAlpha[i] = Math.max(0, (1 - k)) * 0.5 * (k < 0.08 ? k / 0.08 : 1);
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
  }

  // ---- (re)build the vehicle for a flight ----
  _loadEarthCloudLayer() {
    try {
      new THREE.TextureLoader().load(new URL('../../assets/earth/earth_clouds_1024.png', import.meta.url).href, tex => {
        if (this._disposed) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.offset.x = PAD_TEX_OFFSET; tex.anisotropy = 4;
        const mat = new THREE.MeshStandardMaterial({
          map: tex, color: 0xf2f8ff, emissive: 0x263b55, emissiveIntensity: 0.2,
          transparent: true, opacity: 0.46, alphaTest: 0.015, depthWrite: false,
          roughness: 1, metalness: 0
        });
        this.cloudLayer = new THREE.Mesh(new THREE.SphereGeometry(R + 1800, 192, 96), mat);
        this.cloudLayer.rotation.x = Math.PI / 2;
        this.cloudLayer.renderOrder = 1;
        this.cloudLayer.frustumCulled = false;
        this.worldFar.add(this.cloudLayer);
      }, undefined, () => console.warn('Earth cloud texture not available; keeping the clear surface.'));
    } catch (e) { console.warn(e); }
  }

  _loadReal(mat, file, offsetU) {
    try {
      new THREE.TextureLoader().load(new URL('../../assets/earth/' + file, import.meta.url).href, tex => {
        if (this._disposed) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.offset.x = offsetU; tex.anisotropy = 4;
        if (mat.map) mat.map.dispose(); mat.map = tex;
        // For Earth only, reuse the real surface image as a restrained fill light. This
        // makes the blue oceans and green/brown land readable on the shadowed hemisphere.
        if (file === 'earth_color_2048.jpg' || file === 'earth_color_2048_vivid.jpg') {
          mat.emissiveMap = tex;
          mat.emissive.set(0xffffff);
          mat.emissiveIntensity = 0.9;
          mat.transparent = false; mat.opacity = 1; mat.depthWrite = true;
        }
        mat.needsUpdate = true;
      }, undefined, () => console.warn('Real texture not available (' + file + '); keeping the procedural placeholder.'));
    } catch (e) { console.warn(e); }
  }
  setFlight(flight) {
    this.flight = flight;
    if (this.rocket) { this.near.remove(this.rocketRoot); disposeObject(this.rocketRoot); }
    this.rocketRoot = new THREE.Group(); this.near.add(this.rocketRoot);
    this.rocket = buildRocket(flight.loadout); this.rocketRoot.add(this.rocket.group);
    this.rocketRoot.userData.height = this.rocket.height;
    // flames
    this.flames = [];
    const mkFlame = (parent, r, pos) => {
      const outer = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const inner = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const g = new THREE.Group(); outer.rotation.x = Math.PI; inner.rotation.x = Math.PI; outer.position.y = -0.5; inner.position.y = -0.5; g.add(outer, inner); g.position.copy(pos); g.userData = { r, outer, inner }; parent.add(g); this.flames.push(g); return g;
    };
    this.coreFlame = mkFlame(this.rocket.parts.core, this.rocket.exitRadius, V(0, 0.05, 0));
    this.upperFlame = mkFlame(this.rocket.group, 0.4, V(0, this.rocket.parts.upper ? this.rocket.parts.upper.position.y : 0, 0)); this.upperFlame.visible = false;
    this.boosterFlames = [];
    if (this.rocket.parts.boosters) this.rocket.parts.boosters.children.forEach(b => this.boosterFlames.push(mkFlame(b, b.userData.radius, V(0, 0, 0))));
    this.prev = { boosters: flight.boostersAttached, stage: flight.stage, fairing: flight.fairingAttached, payload: flight.payloadAttached, grounded: false, broke: false };
    // FIX: setFlight() rebuilds a brand-new, complete rocket (it also runs when the player switches 2D <-> 3D).
    // Parts that already separated in flight must stay gone, otherwise the booster / first stage / fairing seem to "grow back".
    if (flight.launched) {
      const pt = this.rocket.parts;
      if (!flight.boostersAttached && pt.boosters) pt.boosters.visible = false;
      if (flight.stage === 'upper') { if (pt.core) pt.core.visible = false; if (pt.boosters) pt.boosters.visible = false; }
      if (!flight.fairingAttached && pt.fairing) pt.fairing.visible = false;
      if (!flight.payloadAttached && pt.payload) pt.payload.visible = false;
    }
    this.debris.forEach(d => { this.worldNear.remove(d.obj); disposeObject(d.obj); }); this.debris = [];
    this.camDist = 40 + this.rocket.height * 0.3; this.viewUp.set(0, 1, 0); this.predT = 99; this.pathInfo = null; this.mapView = false;
    this.rocketRoot.visible = true; this.exploded = false; this.flash = 0;
    if (!this.boom) { this.boom = new THREE.PointLight(0xffa040, 0, 500); this.near.add(this.boom); }
    this.heatLight = new THREE.PointLight(0xff6a1a, 0, 70); this.rocketRoot.add(this.heatLight);
    this.fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTexture(0, '255,140,40'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); this.rocketRoot.add(this.fireGlow);
    this.tumbleT = 0; (this.shocks || []).forEach(sh => { this.worldNear.remove(sh.mesh); }); this.shocks = []; this.lunarDisp = null; this.lunarT0 = undefined; this.lastLunar = null; this.lunarCrashed = false;
  }

  resize() {
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 450; this.renderer.setSize(w, h, false);
    for (const c of [this.camFar, this.camNear]) { c.aspect = w / h; c.updateProjectionMatrix(); }
    this.pMat.uniforms.uScale.value = h * 0.8;
  }

  // ---- debris ----
  spawnDebris(clone, offset, impulse, spin, life = 90) {
    const f = this.flight; const obj = clone; obj.position.set(f.x + offset.x, f.y + offset.y, offset.z || 0);
    this.worldNear.add(obj);
    this.debris.push({ obj, vel: V(f.vx + impulse.x, f.vy + impulse.y, impulse.z || 0), spin, age: 0, life });
  }
  localDir() { const f = this.flight; const pr = f.pitch * Math.PI / 180; const e = V(f.ex, f.ey), u = V(f.ux, f.uy); return e.multiplyScalar(Math.cos(pr)).add(u.multiplyScalar(Math.sin(pr))).normalize(); }

  handleEvents(dt) {
    const f = this.flight, p = this.prev, parts = this.rocket.parts; const dir = this.localDir(); const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
    const side = V(0, 0, 1);
    if (p.boosters && !f.boostersAttached && parts.boosters) {
      parts.boosters.visible = false; p.boosters = false;
      parts.boosters.children.forEach((b, i) => { const c = b.clone(true); c.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); const off = b.position.clone().applyQuaternion(q); c.quaternion.copy(q); c.position.copy(off); const out = off.clone().normalize().multiplyScalar(6); this.spawnDebris(c, off, out, V(0.3 * (i % 2 ? 1 : -1), 0.1, 0.4)); });
      this.flash = 0.3;
    }
    if (p.stage === 'core' && f.stage === 'upper') {
      p.stage = 'upper'; parts.core.visible = false; if (parts.boosters) parts.boosters.visible = false;
      const c = parts.core.clone(true); c.visible = true; c.quaternion.copy(q); c.position.set(0, 0, 0); this.spawnDebris(c, V(0, 0, 0), dir.clone().multiplyScalar(-9), V(0.25, 0.1, 0.35));
      this.upperFlame.visible = true;
    }
    if (p.fairing && !f.fairingAttached && parts.fairing) {
      parts.fairing.visible = false; p.fairing = false;
      for (const s of [-1, 1]) { const c = parts.fairing.clone(true); c.visible = true; c.quaternion.copy(q); const off = parts.fairing.position.clone().applyQuaternion(q); c.position.copy(off); c.scale.set(1, 1, 1); this.spawnDebris(c, off, V(s * 7, 2, s * 3).applyQuaternion(q), V(0.3 * s, 0.2, 0.5 * s)); }
    }
    if (p.payload && !f.payloadAttached) {
      p.payload = false; const c = parts.payload.clone(true); c.quaternion.copy(q); const off = parts.payload.position.clone().applyQuaternion(q).add(parts.payload.parent.position); c.position.copy(off); parts.payload.visible = false;
      this.spawnDebris(c, off, dir.clone().multiplyScalar(6), V(0.05, 0.12, 0.02), 600); this.deployed = this.debris[this.debris.length - 1];
    }
    if (f.breakup && !p.broke) {
      p.broke = true; this.rocketRoot.visible = false; this.flash = 1;
      const pieces = [parts.core, parts.upper, parts.boosters, parts.payload].filter(Boolean);
      pieces.forEach((pc, i) => { const c = pc.clone(true); c.visible = true; c.quaternion.copy(q); const off = pc.position.clone().applyQuaternion(q); c.position.copy(off); this.spawnDebris(c, off, V((i - 1.5) * 9, 6 + i * 2, (i % 2 ? 1 : -1) * 8), V(0.6 * (i % 2 ? 1 : -1), 0.3, 0.7)); });
    }
    if (f.grounded && !p.grounded) {
      p.grounded = true; this.rocketRoot.visible = false;
      const up = V(f.ux, f.uy, 0), east = V(f.ex, f.ey, 0);
      this.explode(V(f.x, f.y, 0), up, 1);
      // the real vehicle pieces fly apart ballistically
      const pcs = [parts.core, parts.upper, parts.boosters, parts.payload].filter(Boolean);
      pcs.forEach((pc, i) => { if (!pc.visible && pc !== parts.payload) return; const c = pc.clone(true); c.visible = true; c.position.set(0, 0, 0); c.quaternion.copy(this.rocketRoot.quaternion); const imp = up.clone().multiplyScalar(22 + 14 * i).add(east.clone().multiplyScalar((i % 2 ? 1 : -1) * (10 + 8 * i))); imp.z = (i - 1.5) * 9; this.spawnDebris(c, V(0, 1, 0), imp, V(0.9 * (i % 2 ? 1 : -1), 0.5, 1.1), 40); });
    }
  }

  // big ground explosion: fireball, smoke column, dust ring, shockwave, flash and camera shake
  explode(pos, up, big) {
    this.flash = 1.4; this.shake = 1.2 * big;
    const e = V(-up.y, up.x, 0);
    for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2; const dirv = e.clone().multiplyScalar(Math.cos(a) * Math.cos(el)).add(up.clone().multiplyScalar(0.4 + Math.sin(el))).add(V(0, 0, Math.sin(a) * Math.cos(el))); this.emit(pos.clone().add(up.clone().multiplyScalar(2)), dirv.multiplyScalar((12 + Math.random() * 48) * big), (18 + Math.random() * 30) * big, 1.1 + Math.random() * 1.6, [1.0, 0.35 + Math.random() * 0.5, 0.08], 1.0, 2.4); }
    for (let i = 0; i < 60; i++) { const sp = e.clone().multiplyScalar((Math.random() - 0.5) * 18).add(up.clone().multiplyScalar(18 + Math.random() * 38)).add(V(0, 0, (Math.random() - 0.5) * 18)); this.emit(pos.clone().add(up.clone().multiplyScalar(4)), sp, (16 + Math.random() * 26) * big, 6 + Math.random() * 5, [0.1, 0.1, 0.11], 0.9, 4); }
    for (let i = 0; i < 50; i++) { const a = Math.random() * Math.PI * 2; const sp = e.clone().multiplyScalar(Math.cos(a) * (30 + Math.random() * 60)).add(V(0, 0, Math.sin(a) * (30 + Math.random() * 60))); this.emit(pos.clone().add(up.clone().multiplyScalar(0.5)), sp, 14 + Math.random() * 18, 4 + Math.random() * 3, [0.45, 0.38, 0.3], 0.8, 3); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 72), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.copy(pos).add(up.clone().multiplyScalar(0.6)); ring.quaternion.setFromUnitVectors(V(0, 0, 1), up); this.worldNear.add(ring); this.shocks.push({ mesh: ring, t: 0, big });
    if (this.boom) { this.boom.position.copy(pos).add(up.clone().multiplyScalar(14)); this.boom.intensity = 14000 * big; }
  }

  // ---- per-frame update ----
  update(dt, flight, opts = {}) {
    const f = this.flight || flight; if (!f || !this.rocket) return;
    dt = Math.min(dt, 0.1);
    const lunar = !!this.lunarDisp || f.phase.startsWith('lunar') || f.phase === 'landed';
    let px = f.x, py = f.y, up = V(f.ux, f.uy), dir = this.localDir();
    if (lunar) {
      if (!this.lunarDisp) { this.lunarDisp = { arrivePos: V(f.x, f.y), t0: f.t }; this.lunarT0 = f.t; }   // the Moon stays exactly where it already was: no jump
      const L = this.lunarDisp, M = this.moon.position; const toVeh = L.arrivePos.clone().sub(M); const r0 = toVeh.length(); const a0 = Math.atan2(toVeh.y, toVeh.x);
      const orbitR = WORLD.moonR + 80000;
      const cap = Math.min(1, f.lunar.dvDone / (f.mission.captureDv || 1)), des = f.mission.descentDv ? Math.min(1, f.lunar.descentDone / f.mission.descentDv) : 0;
      let rr = r0, ang = a0; const px0 = M.x + Math.cos(a0) * WORLD.moonR, py0 = M.y + Math.sin(a0) * WORLD.moonR;
      if (f.lunarFail) {
        const st = this.lastLunar || { rr: orbitR, ang: a0 };
        rr = st.rr; ang = st.ang;
        if (f.lunarFail === 'flyby') rr += 40000 * dt; else if (f.lunarFail === 'crash') rr = Math.max(WORLD.moonR, rr - 12000 * dt);
        if (f.lunarFail === 'crash' && rr <= WORLD.moonR && !this.lunarCrashed) { this.lunarCrashed = true; this.rocketRoot.visible = false; this.explode(V(px0, py0, 0), V(Math.cos(ang), Math.sin(ang), 0), 0.6); }
      } else if (f.phase === 'lunar-arrival') { rr = r0; }
      else if (f.phase === 'lunar-capture') { rr = r0 + (orbitR - r0) * smooth(0, 1, cap); ang = a0 + cap * 2.2; }
      else {
        ang = a0 + 2.2 + (f.t - this.lunarT0) * 0.02; rr = orbitR;
        if (f.mission.id === 'lunar-land') rr = orbitR - (orbitR - WORLD.moonR) * smooth(0, 1, f.phase === 'landed' || f.phase === 'complete' ? 1 : des);
      }
      this.lastLunar = { rr, ang };
      px = M.x + Math.cos(ang) * rr; py = M.y + Math.sin(ang) * rr;
      const outward = V(Math.cos(ang), Math.sin(ang)); up = outward.clone();
      dir = f.phase === 'lunar-capture' ? V(Math.sin(ang), -Math.cos(ang)) : outward.clone();
      this.displayLunar = true;
    } else this.displayLunar = false;

    // world translation (floating origin)
    this.worldFar.position.set(-px, -py, 0); this.worldNear.position.set(-px, -py, 0);
    const alt = lunar && this.displayLunar ? Math.max(0, V(px, py).sub(this.moon.position).length() - WORLD.moonR) : f.alt;
    const altE = Math.max(0, Math.hypot(px, py) - R);

    // rocket attitude
    const failing = !!f.outcome && !f.outcome.success && !f.lunarFail && !f.grounded;
    let q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()), turn = 8;
    if (failing && f.speed > 3) {
      // engine dead: the stack loses attitude control, noses over along its velocity, then tumbles and rolls as it falls
      this.tumbleT += dt; const vdir = V(f.vx, f.vy, 0).normalize(); const base = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), vdir);
      const k = Math.min(1, this.tumbleT / 2.5);
      const wob = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (Math.sin(this.tumbleT * 0.9) * 0.7 + this.tumbleT * 0.55) * k);
      const roll = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), this.tumbleT * 1.8);
      q = base.multiply(wob).multiply(roll); turn = 4;
    }
    this.rocketRoot.quaternion.slerp(q, Math.min(1, dt * turn) || 1);
    this.rocketRoot.position.set(0, 0, 0);
    // if on the pad and still: stand exactly vertical
    if (f.phase === 'ready') this.rocketRoot.quaternion.set(0, 0, 0, 1);

    this.handleEvents(dt);

    // flames
    const thr = f.engineOn ? Math.max(0, f.thrustNow) : 0; const full = f.activeThrustFull ? f.activeThrustFull() : 3e5; const frac = Math.min(1, thr / (full || 1));
    const vac = 1 - smooth(5000, 70000, altE); const t = performance.now() * 0.001; const flick = 1 + 0.08 * Math.sin(t * 61) + 0.05 * Math.sin(t * 37 + 1);
    const setFlame = (g, len0, rad0, on) => { if (!g) return; g.visible = on && len0 > 0; if (!g.visible) return; const L = len0 * flick; const W = rad0 * (1 + (1 - vac) * 0); const wid = W * (1 + (1 - vac) * 1.2); g.userData.outer.scale.set(wid, L, wid); g.userData.inner.scale.set(wid * 0.55, L * 0.62, wid * 0.55); g.userData.outer.position.y = -L / 2; g.userData.inner.position.y = -L * 0.31; };
    const scale = Math.cbrt((f.stage === 'core' ? f.c.engine.thrust : f.c.upper.thrust) / 180000);
    const coreLen = (4 + 16 * frac * scale) * (f.stage === 'core' ? 1 : 0);
    setFlame(this.coreFlame, f.stage === 'core' && f.engineOn && f.fuelCore > 0 ? (3 + 13 * Math.max(0.15, f.effThrottle ?? f.throttle)) * scale : 0, this.rocket.exitRadius * 0.95, f.stage === 'core' && f.thrustNow > 0);
    setFlame(this.upperFlame, f.stage === 'upper' && f.engineOn && f.fuelUp > 0 ? (3 + 9 * Math.max(0.15, f.effThrottle ?? f.throttle)) : 0, 0.45, f.stage === 'upper' && f.thrustNow > 0);
    this.boosterFlames.forEach(b => setFlame(b, f.boostersAttached && f.fuelB > 0 && f.engineOn ? 5 + 6 * Math.random() * 0.2 : 0, 0.28, f.boostersAttached && f.fuelB > 0 && f.engineOn));

    // exhaust smoke / sparks while thrusting low and slow; heat glow when re-entering
    const emitPos = V(f.x, f.y, 0).add(dir.clone().multiplyScalar(-1.2));
    if (!this.displayLunar && f.thrustNow > 0 && altE < 45000 && this.rocketRoot.visible) {
      const rate = (f.phase === 'ascent' ? 1 : 0.3) * (1 - altE / 45000); const n = Math.floor(rate * (3 + 5 * frac) + (Math.random() < (rate * (3 + 5 * frac)) % 1 ? 1 : 0));
      for (let i = 0; i < n; i++) { const jitter = V((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3); const v = dir.clone().multiplyScalar(-(20 + Math.random() * 25)).add(jitter); const nearGround = altE < 80 ? 1 : 0; const sz = 6 + Math.random() * 6 + (nearGround ? 10 : 0); this.emit(emitPos.clone(), v.add(nearGround ? V((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60) : V(0, 0, 0)), sz, 5 + Math.random() * 6, nearGround ? [0.85, 0.82, 0.78] : [0.8, 0.8, 0.8], 0.9, 4 + (nearGround ? 3 : 0)); }
    }
    if (f.heatRate > 0.25 && this.rocketRoot.visible && f.vUp < 20) { const pos = V(f.x, f.y, 0).sub(V(f.vx, f.vy, 0).normalize().multiplyScalar(-4)); this.emit(pos, V(f.vx, f.vy, 0).multiplyScalar(-0.02), 10 + Math.random() * 8, 1.5, [1.0, 0.45, 0.12], 1.0, 2.2); }
    // ---- falling vehicle: fire, smoke trail, heat glow, camera shake ----
    const rPos = V(f.x, f.y, 0);
    if (failing && this.rocketRoot.visible) {
      const nf = REDUCED_PARTICLES(this) ? 2 : 5;
      for (let i = 0; i < nf; i++) {
        const j = V((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
        this.emit(rPos.clone().add(j), j.clone().multiplyScalar(2), 5 + Math.random() * 6, 0.7 + Math.random() * 0.6, [1.0, 0.45 + Math.random() * 0.3, 0.12], 1.0, 1.6);
        if (i < 3) this.emit(rPos.clone().add(j.clone().multiplyScalar(2)), V(j.x, j.y + 2, j.z).multiplyScalar(0.8), 5 + Math.random() * 5, 4 + Math.random() * 4, [0.1, 0.1, 0.11], 0.9, 4.5);
      }
      if (altE < 6000 && !this.reduceMotion) this.shake = Math.max(this.shake, 0.18 + 0.25 * (1 - altE / 6000));
    }
    const fireLevel = failing ? 1 : Math.min(1, (f.heatRate || 0) * 2.5);
    if (this.fireGlow) { this.fireGlow.material.opacity = fireLevel * (0.65 + 0.2 * Math.sin(performance.now() * 0.03)); this.fireGlow.visible = fireLevel > 0.02 && this.rocketRoot.visible; const sc = this.rocket.height * 1.9; this.fireGlow.scale.set(sc, sc, 1); this.fireGlow.position.set(0, this.rocket.height * 0.4, 0); this.heatLight.intensity = fireLevel * 900; this.heatLight.position.set(0, this.rocket.height * 0.4, 0); }
    // speed streaks: world-fixed motes that rush past the camera so velocity is visible
    if (!this.displayLunar && f.speed > 60 && altE < 70000 && this.rocketRoot.visible) {
      const vd = V(f.vx, f.vy, 0).normalize(); const ns = Math.min(5, 1 + Math.floor(f.speed / 600));
      for (let i = 0; i < ns; i++) { const o = V((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60).add(vd.clone().multiplyScalar(40 + Math.random() * 60)); this.emit(rPos.clone().add(o), V(0, 0, 0), 0.12 + Math.random() * 0.2, 2.5, [0.9, 0.95, 1.0], 0.55, 0); }
    }
    // glowing exhaust trail above the smoke ceiling (added: gives a sense of speed and thrust in space)
    {
      const cur = V(f.x, f.y, 0), last = this._lastTrail;
      if (!this.displayLunar && !this.mapView && f.thrustNow > 0 && altE >= 45000 && this.rocketRoot.visible) {
        if (last && last.distanceTo(cur) < 6000) {
          const gap = last.distanceTo(cur), n = Math.max(2, Math.min(this.reduceMotion ? 4 : 10, Math.round(gap / 20)));
          for (let j = 0; j < n; j++) {
            const at = last.clone().lerp(cur, (j + 1) / n).add(dir.clone().multiplyScalar(-1.2)); const jit = V((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
            this.emit(at, dir.clone().multiplyScalar(-(10 + Math.random() * 25)).add(jit), (2.5 + Math.random() * 3) * (0.5 + 0.5 * frac), 0.9 + Math.random() * 0.8, [0.45 + Math.random() * 0.2, 0.7, 1.0], 0.8, 2);
          }
        }
        this._lastTrail = cur;
      } else this._lastTrail = null;
    }
    this.updateParticles(dt);
    for (let i = this.shocks.length - 1; i >= 0; i--) { const sh = this.shocks[i]; sh.t += dt; const k = sh.t / 1.6; sh.mesh.scale.setScalar(1 + 260 * sh.big * Math.min(1, k * 1.2)); sh.mesh.material.opacity = Math.max(0, 0.9 * (1 - k)); if (this.boom) this.boom.intensity = Math.max(0, 14000 * sh.big * (1 - sh.t / 0.9)); if (k >= 1) { this.worldNear.remove(sh.mesh); sh.mesh.geometry.dispose(); sh.mesh.material.dispose(); this.shocks.splice(i, 1); if (this.boom) this.boom.intensity = 0; } }

    // debris physics (own gravity; same coordinate system)
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.age += dt; const p = d.obj.position; const r = Math.hypot(p.x, p.y); const g = MU / (r * r);
      d.vel.x -= g * p.x / r * dt; d.vel.y -= g * p.y / r * dt; p.addScaledVector(d.vel, dt); d.obj.rotation.x += d.spin.x * dt; d.obj.rotation.y += d.spin.y * dt; d.obj.rotation.z += d.spin.z * dt;
      if (r <= R) { d.vel.set(0, 0, 0); d.spin.set(0, 0, 0); p.multiplyScalar(R / r); }
      if (d.age > d.life) { this.worldNear.remove(d.obj); disposeObject(d.obj); this.debris.splice(i, 1); }
    }

    // Moon glow fades out as the camera approaches so it never hides the real Moon
    { const camToMoon = Math.hypot(this.moon.position.x - px, this.moon.position.y - py); this.moonGlow.material.opacity = 0.9 * smooth(1.5e6, 1.2e7, camToMoon) * (f.mission.captureDv ? 1 : 0.5); this.earthGlow.visible = this.mapView; this.earthGlow.material.opacity = this.mapView ? 0.55 : 0; }
    this.updateOrbitLine(f, altE, dt);

    // environment: sky, stars, fog, lights follow altitude continuously
    const atmo = Math.exp(-altE / 22000); const dayK = 1;
    this.skyMat.uniforms.uAtmo.value = atmo; this.skyMat.uniforms.uAlt.value = smooth(20000, 120000, altE);
    this.viewUp.lerp(up, Math.min(1, dt * (lunar ? 1.2 : 6))).normalize();
    this.skyMat.uniforms.uUp.value.copy(this.viewUp);
    this.starMat.opacity = smooth(18000, 85000, altE) * 0.95;
    this.updateDeepSpace(dt, altE, true);
    const fogCol = new THREE.Color(0xa9c8ee).lerp(new THREE.Color(0x02030a), 1 - atmo); this.near.fog.color.copy(fogCol); this.near.fog.near = 3000 + altE * 0.5; this.near.fog.far = 70000 + altE * 4;
    this.hemi.intensity = 0.15 + 0.6 * atmo; this.sunNear.intensity = 3.4;
    // clouds only matter in the lower atmosphere
    const cloudVis = altE < 14000; this.clouds.forEach(c => c.visible = cloudVis);

    // camera (smooth distance by altitude and rocket size; far view toggle)
    // Camera distance follows the rocket's own size (and a little the LOCAL altitude: Earth or Moon), never the Earth altitude while at the Moon.
    // Before: 0.0016 × altitude added up to 240 m, so in space a 14 m rocket was a ~15 px sliver (and at the Moon too, because Earth altitude was used).
    const H = this.rocket.height; const altLocal = this.displayLunar ? Math.max(0, V(px, py).sub(this.moon.position).length() - WORLD.moonR) : altE;
    const targetDist = (this.farView ? 5 : 1) * (22 + H * 1.15 + Math.min(altLocal, 150000) * 0.00015);
    this.camDist += (targetDist - this.camDist) * Math.min(1, dt * 1.5);
    const e = V(-this.viewUp.y, this.viewUp.x, 0).multiplyScalar(-1);   // local east
    const target = this.viewUp.clone().multiplyScalar(H * 0.45);
    // As the vehicle climbs the camera rises above it and looks DOWN, so Earth stays in view behind the rocket instead of dropping out of frame.
    const altRef = this.displayLunar ? alt : altE; const tilt = smooth(20000, 240000, altRef);
    let camOff;
    {
      // Keep the planet/Moon inside the frame: when the body is small (far away) the camera must look more steeply down at it,
      // otherwise the view axis ends up > 25° away from it and it drops out of the picture (the Moon was never visible during capture).
      const bodyR = this.displayLunar ? WORLD.moonR : R, bodyAlt = Math.max(0, altLocal);
      const rhoDeg = Math.asin(Math.min(1, bodyR / (bodyR + bodyAlt))) * 180 / Math.PI;
      const phiDeg = Math.min(82, Math.max(3 + 52 * tilt, tilt > 0 ? 85 - rhoDeg : 0));
      const phi = phiDeg * Math.PI / 180;
      camOff = V(0, 0, Math.cos(phi) * 0.93).add(this.viewUp.clone().multiplyScalar(Math.sin(phi) + (f.phase === 'ready' ? 0.12 : 0.05) * (1 - tilt))).add(e.clone().multiplyScalar(-0.3 * (1 - tilt)));
    }
    // slow cinematic drift around the vehicle in space: the Earth, the dust and the trail then slide past, so the picture is never frozen
    if (!this.reduceMotion && !this.displayLunar) { const driftK = smooth(40000, 120000, altE); if (driftK > 0) camOff.applyAxisAngle(this.viewUp, Math.sin(performance.now() * 0.00012) * 0.35 * driftK); }
    const camPos = target.clone().add(camOff.multiplyScalar(this.camDist));
    if (this.shake > 0 && !this.reduceMotion) { const s = this.shake * 0.8; camPos.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)); this.shake = Math.max(0, this.shake - dt * 0.7); }
    if (f.thrustNow > 0 && altE < 3000 && !this.reduceMotion) { const s = 0.12 * Math.min(1, frac) * (1 - altE / 3000); camPos.add(V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0)); }
    this.marker.visible = this.mapView;
    if (this.mapView) {
      // Map view: top-down view of the Earth–Moon plane framing Earth, the vehicle and (on lunar missions) the Moon.
      const pts = [[0, 0], [px, py]]; if (f.mission.captureDv) { pts.push([this.moon.position.x, this.moon.position.y]); }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [qx, qy] of pts) { x0 = Math.min(x0, qx); x1 = Math.max(x1, qx); y0 = Math.min(y0, qy); y1 = Math.max(y1, qy); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(2.4e6, (x1 - x0) / 2 * 1.3 + 1.5e6), hh = Math.max(2.4e6, (y1 - y0) / 2 * 1.3 + 1.5e6);
      const tanH = Math.tan(this.camFar.fov * Math.PI / 360), asp = this.camFar.aspect; const Z = Math.max(hh / tanH, hw / (tanH * asp));
      this.mapZ = this.mapZ === undefined ? Z : this.mapZ + (Z - this.mapZ) * Math.min(1, dt * 3); this.mapC = this.mapC || { x: cx, y: cy }; this.mapC.x += (cx - this.mapC.x) * Math.min(1, dt * 3); this.mapC.y += (cy - this.mapC.y) * Math.min(1, dt * 3);
      this.worldFar.position.set(-this.mapC.x, -this.mapC.y, 0); this.worldNear.position.set(-this.mapC.x, -this.mapC.y, 0);
      this.marker.geometry.attributes.position.setXYZ(0, px, py, 0); this.marker.geometry.attributes.position.needsUpdate = true; this.marker.geometry.computeBoundingSphere();
      this.earthGlow.scale.setScalar(Math.max(4e6, this.mapZ * 0.12));
      const mp = V(0, 0, this.mapZ); camPos.copy(mp); this.camFar.position.copy(mp); this.camFar.up.set(0, 1, 0); this.camFar.lookAt(V(0, 0, 0)); this.camFar.updateMatrixWorld(); this.camNear.position.copy(mp); this.camNear.updateMatrixWorld();
      this.atmo.material.uniforms.uCam.value.copy(mp); this.sky.position.copy(mp);
      this.render(); return;
    } else { this.mapZ = undefined; this.mapC = null; }
    for (const c of [this.camFar, this.camNear]) { c.position.copy(camPos); c.up.copy(this.viewUp); c.lookAt(target); c.updateMatrixWorld(); }
    this.atmo.material.uniforms.uCam.value.copy(camPos);
    this.sky.position.copy(camPos); this.skyMat.uniforms.uSun.value.copy(this.sun);
    this.sunNear.position.copy(this.sun.clone().multiplyScalar(200)); this.sunNear.target.position.set(0, 0, 0); this.sunNear.target.updateMatrixWorld();
    this.sunNear.intensity = 3.4;
    // lens flash on events
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 1.2); }
    this.render();
  }

  // Predicted coast path (Earth gravity only) from the flight model. It ends where the vehicle would meet the Moon's encounter zone,
  // so the line on screen is exactly what the simulation will do if the engine is cut now.
  updateOrbitLine(f, altE, dt) {
    const show = altE > 12000 && !f.outcome && f.phase !== 'ready' && !f.phase.startsWith('lunar') && f.phase !== 'landed';
    // Keep predicting the coast path for mission guidance/objectives, but hide its
    // bright cyan overlay in the 3D flight view so it does not cross the Earth.
    this.orbitLine.visible = false;
    this.soiRing.visible = !!f.mission.captureDv && !this.displayLunar;   // seen edge-on from inside the Moon frame it was a stray line across the screen
    if (!show) { this.pathInfo = null; return; }
    this.predT += dt; if (this.predT < 0.4 && this.pathInfo) return; this.predT = 0;
    const p = f.predictPath(400); this.pathInfo = { hit: p.hit, minD: p.minD, impact: p.impact, maxAlt: p.maxAlt };
    const pos = this.orbitGeo.attributes.position; const n = Math.min(420, p.pts.length / 2);
    for (let i = 0; i < n; i++) pos.setXYZ(i, p.pts[2 * i], p.pts[2 * i + 1], 0);
    this.orbitGeo.setDrawRange(0, n); pos.needsUpdate = true; this.orbitGeo.computeBoundingSphere();
    this.orbitLine.material.color.set(f.mission.captureDv ? (p.hit ? 0x4dff9a : 0x35e0ff) : 0x35e0ff);
  }
  // Project a world point (simulation metres) to canvas pixels using the current far camera.
  screenOf(wx, wy) {
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 450;
    const v = V(wx + this.worldFar.position.x, wy + this.worldFar.position.y, 0); const cp = v.clone().applyMatrix4(this.camFar.matrixWorldInverse); const behind = cp.z > 0;
    v.project(this.camFar); return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind, w, h };
  }

  render() {
    this.renderer.clear(true, true, true);
    this.renderer.render(this.far, this.camFar);
    if (this.mapView) return;
    this.renderer.clearDepth();
    this.renderer.render(this.near, this.camNear);
  }

  dispose() {
    this._disposed = true;
    this.debris.forEach(d => disposeObject(d.obj));
    [this.far, this.near].forEach(s => s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach(x => { if (x.map) x.map.dispose(); x.dispose(); }); } }));
    this.renderer.dispose();
  }
}
