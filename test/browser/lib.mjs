// Real-browser checks (optional, NOT part of `npm test`). Needs Playwright + Chromium:  npm i -D playwright && npx playwright install chromium
// Usage: node test/browser/launch.mjs   (starts the game server itself if nothing listens on :8080)
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
export async function launch(w = 1000, h = 640) {
  try { execSync('curl -s -o /dev/null localhost:8080'); } catch { spawn('node', ['server.mjs'], { cwd: root, detached: true, stdio: 'ignore', env: { ...process.env, PORT: '8080' } }).unref(); await new Promise(r => setTimeout(r, 1200)); }
  // software WebGL flags make this work on machines without a GPU (slow, but correct)
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const logs = []; p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(m.type() + ': ' + m.text()); }); p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:8080', { waitUntil: 'load' }); await p.waitForFunction(() => document.getElementById('boot').classList.contains('hide'), null, { timeout: 60000 });
  return { b, p, logs };
}
export const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
