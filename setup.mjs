// Copies Three.js (pinned 0.160.0) from node_modules into ./vendor so the project runs fully offline.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
const src = 'node_modules/three';
if (!existsSync(src)) { console.error('Run "npm install" first (needs internet once).'); process.exit(1); }
mkdirSync('vendor/addons/controls', { recursive: true }); mkdirSync('vendor/addons/environments', { recursive: true });
cpSync(`${src}/build/three.module.js`, 'vendor/three.module.js');
cpSync(`${src}/examples/jsm/controls/OrbitControls.js`, 'vendor/addons/controls/OrbitControls.js');
cpSync(`${src}/examples/jsm/environments/RoomEnvironment.js`, 'vendor/addons/environments/RoomEnvironment.js');
console.log('Three.js copied to ./vendor — open the project via a local web server.');
