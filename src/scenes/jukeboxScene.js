// ORBITAL — Earth Information Jukebox 3D machine.
// Physical sequence: browse rack -> select -> disc slides out and is inserted onto the platter (3D animation) -> Play ->
// platter spins, tonearm lowers, a light beam appears and a holographic Earth EMERGES from the record label and grows.
// Nothing hologram-related exists before Play (the hologram group is invisible at scale 0).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { drawChart } from '../chart.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = x => Math.min(1, Math.max(0, x));
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function latLon(lat, lon, r) { const phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180; return V(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)); }

// Real geography: starts from the coarse 2-degree land grid shipped in src/landmask.js (works offline, no network),
// then upgrades to the 1024px land/sea mask image in assets/earth/ when it loads. No random blobs.
function earthMask(onNote) {
  const W = 360, H = 180, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const lat = 90 - (y + 0.5) * 180 / H, lon = -180 + (x + 0.5) * 360 / W; const v = isLand(lat, lon) ? 255 : 0; const k = (y * W + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
  try {
    new THREE.TextureLoader().load(new URL('../../assets/earth/earth_landmask_1024.png', import.meta.url).href, tex => { t.image = tex.image; t.needsUpdate = true; if (onNote) onNote('hi-res'); }, undefined, () => { if (onNote) onNote('coarse'); });
  } catch (e) { if (onNote) onNote('coarse'); }
  return t;
}

function vinylTexture(rec, locked) {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const cx = S / 2;
  g.fillStyle = '#0b0b0e'; g.fillRect(0, 0, S, S);
  // grooves: many concentric rings with varying alpha (simulates track spacing and light catching)
  const rnd = mulberry(rec.id.length * 31 + 5);
  for (let r = S * 0.19; r < S * 0.495; r += 1.6) { const a = 0.05 + rnd() * 0.12; g.strokeStyle = `rgba(190,200,215,${a})`; g.lineWidth = 0.7; g.beginPath(); g.arc(cx, cx, r, 0, 7); g.stroke(); }
  // track gaps
  for (let k = 0; k < 5; k++) { const r = S * (0.23 + k * 0.05); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2.2; g.beginPath(); g.arc(cx, cx, r, 0, 7); g.stroke(); }
  // anisotropic highlight wedges
  for (let k = 0; k < 2; k++) { const grd = g.createConicGradient(k * Math.PI + 0.6, cx, cx); grd.addColorStop(0, 'rgba(255,255,255,0.0)'); grd.addColorStop(0.04, 'rgba(255,255,255,0.20)'); grd.addColorStop(0.09, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.beginPath(); g.arc(cx, cx, S * 0.495, 0, 7); g.arc(cx, cx, S * 0.19, 0, 7, true); g.fill('evenodd'); }
  // label
  const lr = S * 0.18; const lg = g.createRadialGradient(cx, cx, lr * 0.1, cx, cx, lr); lg.addColorStop(0, rec.palette.accent); lg.addColorStop(1, rec.palette.main); g.fillStyle = lg; g.beginPath(); g.arc(cx, cx, lr, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, lr * 0.97, 0, 7); g.stroke();
  g.fillStyle = rec.palette.label; g.font = `bold ${S * 0.034}px system-ui, sans-serif`; g.textAlign = 'center'; g.fillText(rec.title.toUpperCase(), cx, cx - lr * 0.35); g.font = `${S * 0.022}px system-ui, sans-serif`; g.fillText('EARTH INFORMATION', cx, cx + lr * 0.1); g.fillText(rec.variant.toUpperCase() + ' · 33⅓ RPM', cx, cx + lr * 0.34);
  g.fillStyle = '#111'; g.beginPath(); g.arc(cx, cx, S * 0.012, 0, 7); g.fill();
  if (locked) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(cx, cx, S * 0.495, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function sleeveTexture(rec, locked, selected) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, S, S); bg.addColorStop(0, '#0a0f1c'); bg.addColorStop(1, rec.palette.label); g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const rnd = mulberry(rec.id.length * 13 + 2); g.globalAlpha = 0.9;
  // cover art differs per record: variant-specific motif
  const col = rec.palette.main; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3;
  if (rec.variant === 'fire') { for (let i = 0; i < 30; i++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.beginPath(); const x = 60 + rnd() * 390, y = 460 - rnd() * 280; g.moveTo(x, 470); g.quadraticCurveTo(x + (rnd() - 0.5) * 80, y + 90, x + (rnd() - 0.5) * 30, y); g.stroke(); } }
  else if (rec.variant === 'ocean') { for (let i = 0; i < 12; i++) { g.globalAlpha = 0.2 + i * 0.05; g.beginPath(); for (let x = 0; x <= S; x += 8) g.lineTo(x, 200 + i * 22 + Math.sin(x * 0.03 + i) * 16); g.stroke(); } }
  else if (rec.variant === 'storm') { for (let i = 0; i < 40; i++) { g.globalAlpha = 0.25 + rnd() * 0.5; const x = rnd() * S, y = 140 + rnd() * 320; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 16, y + 46); g.stroke(); } g.globalAlpha = 0.9; g.beginPath(); g.moveTo(300, 120); g.lineTo(260, 220); g.lineTo(300, 220); g.lineTo(250, 330); g.stroke(); }
  else if (rec.variant === 'air') { for (let i = 0; i < 160; i++) { g.globalAlpha = 0.15 + rnd() * 0.5; g.beginPath(); g.arc(40 + rnd() * 430, 150 + rnd() * 320, 2 + rnd() * 5, 0, 7); g.fill(); } }
  else if (rec.variant === 'land') { for (let i = 0; i < 9; i++) { g.globalAlpha = 0.3 + rnd() * 0.5; const x = 60 + i * 48; g.beginPath(); g.moveTo(x, 470); g.lineTo(x, 470 - 70 - rnd() * 180); g.stroke(); g.beginPath(); g.arc(x, 470 - 90 - rnd() * 170, 14 + rnd() * 12, 0, 7); g.fill(); } }
  else if (rec.variant === 'temperature') { for (let i = 0; i < 12; i++) { g.globalAlpha = 0.45 + i * 0.04; g.fillStyle = i < 4 ? rec.palette.accent : rec.palette.main; const h = 70 + i * 22 + (i % 3) * 14; g.fillRect(50 + i * 36, 480 - h, 26, h); } g.globalAlpha = 0.8; g.strokeStyle = '#fff'; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(40, 400); g.lineTo(480, 400); g.stroke(); g.setLineDash([]); }   // rising bars + dashed zero line
  else { for (let i = 0; i < 14; i++) { g.globalAlpha = 0.25 + rnd() * 0.6; g.beginPath(); const x = 80 + rnd() * 350, y = 200 + rnd() * 250; g.moveTo(x, y - 40); g.lineTo(x + 24, y); g.lineTo(x, y + 40); g.lineTo(x - 24, y); g.closePath(); g.stroke(); } }
  g.globalAlpha = 1; g.fillStyle = '#fff'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText(rec.title, 28, 64);
  g.strokeStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.25)'; g.lineWidth = selected ? 8 : 3; g.strokeRect(4, 4, S - 8, S - 8);
  if (locked) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff'; g.font = 'bold 120px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('🔒', S / 2, S / 2 + 30); g.font = 'bold 46px system-ui, sans-serif'; g.fillText(`${rec.cost} gems`, S / 2, S / 2 + 96); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const HOLO_VS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const HOLO_FS = `varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vPos; uniform sampler2D uMask; uniform vec3 uColor; uniform vec3 uAccent; uniform float uTime; uniform float uData; uniform float uVariant; uniform float uOpacity;
void main(){
  float land = texture2D(uMask, vUv).r;
  float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.2);
  float scan = 0.82 + 0.18 * sin(vPos.y * 90.0 - uTime * 3.0);
  vec3 col = mix(uColor * 0.25, uColor, land) * 0.9 + uAccent * fres * 1.3;
  // subject-specific surface treatment driven by the data value uData (0..1)
  if (uVariant < 0.5) { float h = smoothstep(0.55, 1.0, land) * (0.5 + 0.5*sin(uTime*5.0 + vPos.x*20.0+vPos.z*17.0)); col += vec3(1.0,0.35,0.05) * h * uData * 0.9; }                 // fire: ember glow on land
  else if (uVariant < 1.5) { float w = 0.5 + 0.5*sin(length(vPos.xz)*28.0 - uTime*3.0*(0.6+uData)); col += uAccent * (1.0-land) * w * (0.25 + 0.5*uData); }                  // ocean: ripples on water
  else if (uVariant < 2.5) { float s = 0.5 + 0.5*sin(vUv.x*50.0 + vUv.y*30.0 - uTime*(2.0+6.0*uData)); col += uAccent * s * 0.25 * (0.3+uData); }                                  // storm: swirling bands
  else if (uVariant < 3.5) { float n = 0.5 + 0.5*sin(vPos.x*40.0+uTime*1.3)*sin(vPos.z*37.0-uTime*1.1); col = mix(col, uAccent*0.9, n*uData*0.65); }                             // air: haze
  else if (uVariant < 4.5) { float g = smoothstep(0.4,1.0,land) * (0.4 + 0.6*uData); col = mix(col, vec3(0.45,1.0,0.3), g*0.6); }                                                   // land: greening
  else if (uVariant < 5.5) { float cap = smoothstep(0.75 - 0.25*uData, 0.95, abs(vPos.y)/max(length(vPos),0.001)); col = mix(col, vec3(0.95,1.0,1.0), cap * 0.95); }                  // ice: polar cap follows extent
  else { col = mix(col, uAccent, 0.12 + 0.30*uData); col += vec3(1.0,0.22,0.12) * fres * uData * 1.4; }                                                                          // temperature: GLOBAL warm tint + rim glow (no location is implied)
  gl_FragColor = vec4(col * scan, (0.35 + 0.5 * land + 0.5 * fres) * uOpacity);
}`;

const VARIANT_IDX = { fire: 0, ocean: 1, storm: 2, air: 3, land: 4, ice: 5, temperature: 6 };

import { statusLabel } from '../records.js';
import { isLand } from '../landmask.js';

export class JukeboxView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.reduceMotion = !!opts.reduceMotion; this.time = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x03060f); this.scene.fog = new THREE.Fog(0x03060f, 18, 50);
    const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200); this.camHome = V(0, 4.3, 9.6); this.camLook = V(0, 2.1, 0); this.camera.position.copy(this.camHome);
    this.camGoal = this.camHome.clone(); this.lookGoal = this.camLook.clone(); this.pointer = { x: 0, y: 0 };
    this.build();
    this.state = 'idle';       // idle | inserting | loaded | playing | paused
    this.spinSpeed = 0; this.holoK = 0; this.holoTarget = 0; this.armK = 0; this.armTarget = 0; this.recordAnim = null; this.dataNorm = 0; this.dataPulse = 0;
    this.resize();
  }

  build() {
    const s = this.scene;
    // room: floor, back wall, side light bars
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0a101c, metalness: 0.92, roughness: 0.32 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshStandardMaterial({ color: 0x060a14, metalness: 0.4, roughness: 0.8 })); wall.position.set(0, 13, -9); s.add(wall);
    for (const x of [-9, 9]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 14, 0.15), new THREE.MeshBasicMaterial({ color: x < 0 ? 0x35e0ff : 0xff3fb4 })); bar.position.set(x, 7, -8.5); s.add(bar); const pl = new THREE.PointLight(x < 0 ? 0x35e0ff : 0xff3fb4, 120, 30); pl.position.set(x * 0.8, 6, -5); s.add(pl); }
    // cabinet
    const metal = new THREE.MeshStandardMaterial({ color: 0x151b2b, metalness: 0.85, roughness: 0.32 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 1, roughness: 0.12 });
    const cab = new THREE.Group(); s.add(cab); this.cab = cab;
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.5, 3.4), metal); body.position.y = 0.75; body.castShadow = true; body.receiveShadow = true; cab.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 3.6), chrome); top.position.y = 1.56; top.castShadow = true; cab.add(top);
    const neon = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.04, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: 0x35e0ff })); neon.position.set(0, 1.5, 1.72); neon.visible = false; this.neon = neon;  // decorative arch removed: it covered the hologram
    for (const x of [-2.6, 2.6]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 12), chrome); leg.position.set(x, 0.0, 1.4); cab.add(leg); const leg2 = leg.clone(); leg2.position.z = -1.4; cab.add(leg2); }
    // control strip with buttons
    this.buttons = [];
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0x222a3d, emissive: 0x000000, metalness: 0.5, roughness: 0.4 })); b.rotation.x = Math.PI / 2; b.position.set(-2.0 + i * 0.5, 0.95, 1.72); cab.add(b); this.buttons.push(b); }
    // platter (turntable)
    this.platterRoot = new THREE.Group(); this.platterRoot.position.set(0, 1.64, 0.2); cab.add(this.platterRoot);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.4, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0x0d121e, metalness: 0.9, roughness: 0.3 })); plinth.position.y = 0.09; plinth.castShadow = true; this.platterRoot.add(plinth);
    this.platter = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 64), new THREE.MeshStandardMaterial({ color: 0x9ea6b6, metalness: 1, roughness: 0.18 })); this.platter.position.y = 0.22; this.platter.castShadow = true; this.platterRoot.add(this.platter);
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 12), chrome); spindle.position.y = 0.34; this.platterRoot.add(spindle);
    const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.02, 8, 80), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.0 })); ringGlow.rotation.x = Math.PI / 2; ringGlow.position.y = 0.2; ringGlow.visible = false; this.ringGlow = ringGlow;  // removed: no bright rings around the platter
    // tonearm
    const arm = new THREE.Group(); arm.position.set(1.7, 0.4, -0.9); this.platterRoot.add(arm); this.arm = arm;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 16), chrome); post.position.y = 0.05; arm.add(post);
    const pivot = new THREE.Group(); pivot.position.y = 0.22; arm.add(pivot); this.armPivot = pivot;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 10), chrome); tube.rotation.z = Math.PI / 2; tube.position.set(-1.0, 0, 0); pivot.add(tube);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.14), new THREE.MeshStandardMaterial({ color: 0x151b2b, metalness: 0.8, roughness: 0.3 })); head.position.set(-2.1, -0.02, 0); pivot.add(head);
    // record rack (back shelf)
    this.rack = new THREE.Group(); this.rack.position.set(0, 0, -3.2); s.add(this.rack);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.18, 1.2), metal); shelf.position.set(0, 0.9, 0); shelf.castShadow = true; shelf.receiveShadow = true; this.rack.add(shelf);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(9.2, 1.8, 0.2), metal); stand.position.set(0, 0.0, -0.5); this.rack.add(stand);
    this.slots = [];
    // hologram stack (invisible until Play)
    this.holo = new THREE.Group(); this.holo.visible = false; this.holo.position.set(0, 1.64 + 0.36, 0.2); s.add(this.holo);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.55, 1, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); this.beam.visible = false; s.add(this.beam);
    this.holoLight = new THREE.PointLight(0x35e0ff, 0, 18); this.holoLight.position.set(0, 3.8, 0.2); s.add(this.holoLight);
    this.earthGroup = new THREE.Group(); this.holo.add(this.earthGroup);
    this.holoUniforms = { uMask: { value: earthMask() }, uColor: { value: new THREE.Color(0x35e0ff) }, uAccent: { value: new THREE.Color(0xffffff) }, uTime: { value: 0 }, uData: { value: 0.5 }, uVariant: { value: 0 }, uOpacity: { value: 1 } };
    this.globe = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.ShaderMaterial({ vertexShader: HOLO_VS, fragmentShader: HOLO_FS, uniforms: this.holoUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide })); this.earthGroup.add(this.globe);
    // wire grid + atmosphere shells + equatorial ring
    this.grid = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1.02, 24, 16)), new THREE.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })); this.earthGroup.add(this.grid);
    this.shell1 = new THREE.Mesh(new THREE.SphereGeometry(1.1, 40, 24), new THREE.MeshBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })); this.earthGroup.add(this.shell1);
    this.shell2 = new THREE.Mesh(new THREE.SphereGeometry(1.22, 40, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide })); this.earthGroup.add(this.shell2);
    this.spikes = new THREE.Group(); this.earthGroup.add(this.spikes);
    // particles: embers/rain/dust/etc. (shape and behaviour set per record)
    const N = 260; this.pN = N; this.pGeo = new THREE.BufferGeometry(); this.pPos = new Float32Array(N * 3); this.pVel = new Float32Array(N * 3); this.pAge = new Float32Array(N);
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); this.pMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.045, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.parts = new THREE.Points(this.pGeo, this.pMat); this.parts.frustumCulled = false; this.holo.add(this.parts);
    // (the large in-scene data screen was removed: the chart lives in the side panel so the globe stays the focus)
    // lights
    const key = new THREE.SpotLight(0xffffff, 380, 40, 0.5, 0.5, 1.6); key.position.set(3, 11, 7); key.target.position.set(0, 1.5, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; s.add(key); s.add(key.target);
    s.add(new THREE.HemisphereLight(0x5e8cff, 0x0a0e1a, 0.55));
    const fill = new THREE.PointLight(0x7a5cff, 60, 25); fill.position.set(-5, 3, 5); s.add(fill);
  }

  // ----- collection -----
  setRecords(list, ownedIds, selectedId) {
    this.list = list; this.owned = ownedIds;
    this.slots.forEach(sl => { this.rack.remove(sl.group); sl.group.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); if (o.geometry) o.geometry.dispose(); }); });   // FIX: a mesh can hold an ARRAY of materials (sleeve, disc): the old code called .map.dispose() on the array and crashed, so the rack never rebuilt after buying
    this.slots = [];
    list.forEach((rec, i) => {
      const locked = !ownedIds.includes(rec.id); const g = new THREE.Group(); const x = (i - (list.length - 1) / 2) * (list.length > 6 ? 1.42 : 1.5); g.position.set(x, 1.0 + 0.78, 0); g.rotation.x = -0.12; this.rack.add(g);
      const disc = this.makeDisc(rec, locked); disc.rotation.x = Math.PI / 2; disc.position.set(0, 0.22, -0.04); g.add(disc);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.36, 0.04), [new THREE.MeshStandardMaterial({ color: 0x0a0f1c }), new THREE.MeshStandardMaterial({ color: 0x0a0f1c }), new THREE.MeshStandardMaterial({ color: 0x0a0f1c }), new THREE.MeshStandardMaterial({ color: 0x0a0f1c }), new THREE.MeshStandardMaterial({ map: sleeveTexture(rec, locked, rec.id === selectedId), roughness: 0.55 }), new THREE.MeshStandardMaterial({ color: 0x0a0f1c })]);
      sleeve.position.set(0, -0.0, 0.03); sleeve.castShadow = true; g.add(sleeve);
      g.userData = { rec, index: i, home: g.position.clone(), disc, sleeve }; this.slots.push({ group: g, rec, disc, sleeve, locked });
    });
  }
  makeDisc(rec, locked) {
    const m = new THREE.MeshPhysicalMaterial({ map: vinylTexture(rec, locked), roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 1.4 });
    const side = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.4, metalness: 0.5 });
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.028, 96), [side, m, m]); d.castShadow = true; d.receiveShadow = true; return d;
  }
  pickables() { return this.slots.map(s => s.group); }
  slotAt(ndcX, ndcY) { const ray = new THREE.Raycaster(); ray.setFromCamera({ x: ndcX, y: ndcY }, this.camera); const hit = ray.intersectObjects(this.slots.map(s => s.sleeve), false)[0]; if (!hit) return null; return this.slots.find(s => s.sleeve === hit.object) || null; }
  highlight(recId) { this.slots.forEach(sl => { const sel = sl.rec.id === recId; sl.group.userData.target = sel ? 0.25 : 0; }); this.selectedId = recId; }

  // ----- insert animation: a REAL 3D disc is carried from the rack to the platter and set down on the spindle -----
  insert(recId) {
    return new Promise(resolve => {
      if (this.state === 'playing' || this.state === 'paused') this.stop(true);
      this.cancelInsert();                                      // an interrupted insertion must resolve (false), never stay pending
      this.removeLoaded();
      const slot = this.slots.find(s => s.rec.id === recId); if (!slot) return resolve(false);
      this.loadedRec = slot.rec; this.state = 'inserting';
      const disc = this.makeDisc(slot.rec, false); disc.name = 'loadedDisc'; this.scene.add(disc); this.loaded = disc;
      slot.disc.visible = false;                                   // the rack copy slides out of its sleeve
      const start = new THREE.Vector3(); slot.disc.getWorldPosition(start); start.y += 0.1; disc.position.copy(start); disc.rotation.set(Math.PI / 2 - 0.12, 0, 0);
      const platterTop = new THREE.Vector3(); this.platterRoot.getWorldPosition(platterTop); platterTop.y += 0.274;
      this.recordAnim = { t: 0, dur: this.reduceMotion ? 0.6 : 3.0, start, hover: platterTop.clone().add(V(0, 1.8, 0.2)), end: platterTop, resolve, slot };
      this.camGoal.set(0, 4.6, 8.0);
    });
  }
  cancelInsert() { const a = this.recordAnim; if (a) { this.recordAnim = null; try { a.resolve(false); } catch (e) { /* already settled */ } } }
  // Free the GPU resources of a disc built by makeDisc(): geometry, both materials and the label/groove texture. Each disc owns its own copies.
  disposeDisc(d) { if (!d) return; d.geometry.dispose(); const seen = new Set(); (Array.isArray(d.material) ? d.material : [d.material]).forEach(m => { if (seen.has(m)) return; seen.add(m); if (m.map) m.map.dispose(); m.dispose(); }); }
  removeLoaded() { this.cancelInsert(); if (this.loaded) { this.scene.remove(this.loaded); this.disposeDisc(this.loaded); this.loaded = null; } this.slots.forEach(s => s.disc.visible = true); }
  // Take the record off the turntable and forget everything about it (hologram, theme, step markers): nothing of the old record survives a switch.
  eject() {
    this.stop(true); this.removeLoaded(); this.state = 'idle'; this.rec = null; this.data = null; this.stepNorms = null; this.step = null; this.dataNorm = 0; this.dataPulse = 0;
    while (this.spikes.children.length) { const c = this.spikes.children[this.spikes.children.length - 1]; this.spikes.remove(c); c.geometry.dispose(); c.material.dispose(); }
    this.resetParticles(); this.holoK = 0; this.holo.visible = false; this.beam.visible = false;
  }

  // ----- playback visuals -----
  setRecordTheme(rec, data) {
    this.rec = rec; this.data = data; const U = this.holoUniforms; U.uColor.value.set(rec.palette.main); U.uAccent.value.set(rec.palette.accent); U.uVariant.value = VARIANT_IDX[rec.variant] ?? 0;
    this.grid.material.color.set(rec.palette.main); this.shell1.material.color.set(rec.palette.main); this.shell2.material.color.set(rec.palette.accent); this.beam.material.color.set(rec.palette.main); this.holoLight.color.set(rec.palette.main); this.neon.material.color.set(rec.palette.main); this.ringGlow.material.color.set(rec.palette.main); this.pMat.color.set(rec.palette.accent);
    // data spikes at each observation location
    while (this.spikes.children.length) { const c = this.spikes.children[this.spikes.children.length - 1]; this.spikes.remove(c); c.geometry.dispose(); c.material.dispose(); }
    (data.points || []).forEach((p, idx) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.016, 1, 6), new THREE.MeshBasicMaterial({ color: rec.palette.accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); const pos = latLon(p[0], p[1], 1.0); m.position.copy(pos); m.quaternion.setFromUnitVectors(V(0, 1, 0), pos.clone().normalize()); m.userData = { w: Number.isFinite(p[2]) ? p[2] : 0.5, base: pos.clone() }; this.spikes.add(m); });
    this.drawScreen(0);
    this.resetParticles();
  }
  resetParticles() { for (let i = 0; i < this.pN; i++) { this.pAge[i] = 999; this.pPos[i * 3 + 1] = -99; } }
  drawScreen() {}
  // called by the sonifier for each musical step so that visuals follow the exact data point that is sounding
  setStep(step, normA, normB) { this.step = step; this.dataNorm = (this.rec && this.rec.singleSeries) ? normB : (normA + normB) / 2; this.dataPulse = 1; this.holoUniforms.uData.value = this.dataNorm; this.drawScreen(step); this.stepNorms = [normA, normB]; }

  play() {
    if (!this.loaded || this.state === 'inserting') return false;
    this.state = 'playing'; this.armTarget = 1; this.holoTarget = 1; this.holo.visible = true; this.beam.visible = true; this.camGoal.set(0, 3.7, 8.6); this.lookGoal.set(0, 2.6, 0); return true;
  }
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.armTarget = 0.35; }
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.armTarget = 1; }
  stop(instant) { if (this.state === 'idle') return; this.state = this.loaded ? 'loaded' : 'idle'; this.armTarget = 0; this.holoTarget = 0; if (instant) { this.holoK = 0; this.holo.visible = false; this.beam.visible = false; this.spinSpeed = 0; } this.camGoal.copy(this.camHome); this.lookGoal.copy(this.camLook); }
  isHologramVisible() { return this.holo.visible && this.holoK > 0.02; }

  resize() { const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 520; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  // ----- user view control of the hologram (drag = rotate the globe, wheel/pinch = limited zoom) -----
  get viewing() { return this.state === 'playing' || this.state === 'paused'; }
  dragBy(dx, dy) { if (!this.viewing) return; this.earthGroup.rotation.y += dx * 0.008; this.earthGroup.rotation.x = Math.max(-0.9, Math.min(0.9, this.earthGroup.rotation.x + dy * 0.006)); }
  zoomBy(f) { if (!this.viewing) return; this.zoomK = Math.max(0.75, Math.min(1.25, (this.zoomK || 1) * f)); this.camGoal.copy(this.lookGoal).addScaledVector(V(0, 3.7, 8.6).sub(this.lookGoal), this.zoomK); }
  resetView() { this.zoomK = 1; this.earthGroup.rotation.x = 0; this.camGoal.copy(this.viewing ? V(0, 3.7, 8.6) : this.camHome); }
  setPointer(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; }

  update(dt) {
    dt = Math.min(dt, 0.1); this.time += dt; this.holoUniforms.uTime.value = this.time;
    // while a record plays the hologram is the star: the rack sleeves fade out so nothing covers the globe
    { const want = this.viewing ? 0.08 : 1; this.rackA = (this.rackA ?? 1); if (Math.abs(this.rackA - want) > 0.004) { this.rackA += (want - this.rackA) * Math.min(1, dt * 3); this.rack.visible = this.rackA > 0.02; this.rack.traverse(o => { if (o.isMesh && o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.transparent = true; m.opacity = this.rackA; m.depthWrite = this.rackA > 0.9; }); } }); } }
    // rack slots ease
    this.slots.forEach(sl => { const tgt = sl.group.userData.target || 0; sl.group.position.y += ((sl.group.userData.home.y + tgt) - sl.group.position.y) * Math.min(1, dt * 8); });
    // insert animation
    const a = this.recordAnim;
    if (a) {
      a.t += dt; const k = clamp01(a.t / a.dur); const d = this.loaded;
      if (k < 0.45) { const u = ease(k / 0.45); d.position.lerpVectors(a.start, a.hover, u); d.position.y += Math.sin(u * Math.PI) * 0.9; d.rotation.x = (Math.PI / 2 - 0.12) * (1 - u); d.rotation.z = 0.15 * Math.sin(u * Math.PI); }
      else if (k < 0.78) { const u = ease((k - 0.45) / 0.33); d.position.copy(a.hover); d.position.y += Math.sin(this.time * 3) * 0.02 * (1 - u); d.rotation.x = 0; d.rotation.z = 0; d.position.x += (a.end.x - a.hover.x) * u * 0.0; }
      else { const u = ease((k - 0.78) / 0.22); d.position.lerpVectors(a.hover, a.end, u); d.rotation.set(0, d.rotation.y, 0); }
      if (k >= 1) { this.recordAnim = null; this.state = 'loaded'; this.loadedDiscParentToPlatter(); a.resolve(true); }
    }
    // platter + loaded disc rotation
    const targetSpin = this.state === 'playing' ? 3.49 : 0; this.spinSpeed += (targetSpin - this.spinSpeed) * Math.min(1, dt * (targetSpin ? 1.4 : 0.9));
    this.platter.rotation.y += this.spinSpeed * dt; if (this.loaded && !this.recordAnim) this.loaded.rotation.y += this.spinSpeed * dt;
    this.ringGlow.material.opacity += ((this.state === 'playing' ? 0.9 : 0) - this.ringGlow.material.opacity) * Math.min(1, dt * 3);
    this.buttons.forEach((b, i) => { const on = (this.state === 'playing' && i === 2) || (this.state === 'paused' && i === 3) || (this.state === 'loaded' && i === 1); b.material.emissive.set(on ? 0x35e0ff : 0x000000); b.material.emissiveIntensity = on ? 1.6 : 0; });
    // tonearm
    this.armK += (this.armTarget - this.armK) * Math.min(1, dt * 1.6); this.armPivot.rotation.y = -0.15 - this.armK * 0.55; this.armPivot.rotation.z = 0.04 - this.armK * 0.04;
    // hologram emergence: rises out of the record label and grows
    this.holoK += (this.holoTarget - this.holoK) * Math.min(1, dt * (this.holoTarget ? 0.9 : 2.2)); const k = this.holoK; if (k < 0.004 && this.holoTarget === 0) { this.holo.visible = false; this.beam.visible = false; }
    const e = ease(clamp01(k)); const radius = 0.08 + 1.35 * e; const h = 0.15 + 1.9 * e; this.holo.position.y = 1.64 + 0.36 + h; this.earthGroup.scale.setScalar(Math.max(0.001, radius)); this.earthGroup.rotation.y += dt * (this.state === 'paused' ? 0.0 : 0.35);
    this.holoUniforms.uOpacity.value = clamp01(k * 1.6) * (this.state === 'paused' ? 0.55 : 1);
    const beamLen = Math.max(0.01, h + 0.06 - radius * 1.04); this.beam.scale.set(1.0, beamLen, 1.0); this.beam.position.set(0, 1.64 + 0.3 + beamLen / 2, 0.2); this.beam.material.opacity = 0.16 * (1 - e * 0.6) * clamp01(k * 3) * (this.state === 'paused' ? 0.4 : 1);
    this.holoLight.intensity = 90 * e * (this.state === 'paused' ? 0.5 : 1); this.holoLight.position.y = 1.64 + 0.36 + h;
    this.shell1.scale.setScalar(1 + 0.012 * Math.sin(this.time * 2)); this.dataPulse = Math.max(0, this.dataPulse - dt * 2.2);
    // data spikes: height ← the sounding data point (series A and B), pulsing on each step
    const nA = this.stepNorms ? this.stepNorms[0] : 0.5, nB = this.stepNorms ? this.stepNorms[1] : 0.5;
    this.spikes.children.forEach((m, i) => { const w = m.userData.w; const val = (i % 2 ? nB : nA); const len = 0.04 + w * (0.1 + 0.55 * val) * (1 + 0.5 * this.dataPulse); m.scale.set(1, len, 1); m.position.copy(m.userData.base).multiplyScalar(1 + len * 0.5 / 1.0); m.material.opacity = 0.5 + 0.5 * Math.min(1, w + this.dataPulse * 0.4); });
    this.updateParticles(dt, e);
    // camera drift + pointer parallax
    this.camera.position.lerp(this.camGoal.clone().add(V(this.pointer.x * 0.6, -this.pointer.y * 0.3, 0)), Math.min(1, dt * 1.6)); this.lookCur ??= this.camLook.clone(); this.lookCur.lerp(this.lookGoal, Math.min(1, dt * 2.2)); this.camera.lookAt(this.lookCur);
    this.neon.material.color.offsetHSL(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }
  loadedDiscParentToPlatter() { /* the disc stays in scene space; it spins in place on the spindle */ }

  updateParticles(dt, e) {
    if (!this.rec || e < 0.05) return; const v = this.rec.variant; const r = 1.3 * e; const rnd = Math.random;
    for (let i = 0; i < this.pN; i++) {
      this.pAge[i] += dt;
      const dead = this.pAge[i] > 3 || this.pPos[i * 3 + 1] < -50;
      if (dead && rnd() < 0.2 + 0.6 * this.dataNorm) {
        this.pAge[i] = 0; const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1);
        const p = V(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)).multiplyScalar(r * 1.02);
        this.pPos.set([p.x, p.y, p.z], i * 3);
        if (v === 'fire') this.pVel.set([(rnd() - 0.5) * 0.2, 0.5 + rnd() * 0.8, (rnd() - 0.5) * 0.2], i * 3);
        else if (v === 'storm') { p.set((rnd() - 0.5) * r * 2, r * (0.9 + rnd() * 0.6), (rnd() - 0.5) * r * 2); this.pPos.set([p.x, p.y, p.z], i * 3); this.pVel.set([0, -2.2 - rnd() * 1.5, 0], i * 3); }
        else if (v === 'air') this.pVel.set([-p.z * 0.6, (rnd() - 0.5) * 0.1, p.x * 0.6], i * 3);
        else if (v === 'ocean') this.pVel.set([p.x * 0.18, p.y * 0.18, p.z * 0.18], i * 3);
        else if (v === 'land') this.pVel.set([(rnd() - 0.5) * 0.05, 0.35 + rnd() * 0.3, (rnd() - 0.5) * 0.05], i * 3);
        else if (v === 'temperature') this.pVel.set([p.x * 0.22, 0.12 + rnd() * 0.25, p.z * 0.22], i * 3);   // warm shimmer drifting off the whole globe
        else this.pVel.set([p.x * 0.05, -0.1 - rnd() * 0.2, p.z * 0.05], i * 3);
      }
      this.pPos[i * 3] += this.pVel[i * 3] * dt; this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt; this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt;
      if (v === 'air') { const x = this.pPos[i * 3], z = this.pPos[i * 3 + 2]; this.pVel[i * 3] = -z * 0.6; this.pVel[i * 3 + 2] = x * 0.6; }
    }
    this.pGeo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.cancelInsert();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose && m.dispose(); }); } });
    this.renderer.dispose();
  }
}
