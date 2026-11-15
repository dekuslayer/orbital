import { launch, ok } from './lib.mjs';
async function run(click) {
  const { b, p, logs } = await launch(1000, 640);
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForFunction(() => document.getElementById('boot').classList.contains('hide'), null, { timeout: 60000 });
  await p.click('[data-home="launch"]'); await p.waitForTimeout(600);
  await p.click('#btnLaunchNow'); await p.evaluate(() => { window.__ORBITAL.S.fc.cd = 0.05; });
  await p.waitForFunction(() => window.__ORBITAL.S.fc && window.__ORBITAL.S.fc.state === 'flying', null, { timeout: 60000 });
  const read = () => p.evaluate(() => { const f = window.__ORBITAL.S.fc.flight; return { t: +f.t.toFixed(1), alt: Math.round(f.alt), v: Math.round(f.speed), thr: f.throttle, eng: f.engineOn, q: Math.round(f.q), mq: f.maxQAssist, ph: f.phase }; });
  const out = [await read()];
  if (click) { await p.click('#bMaxq'); }
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(1500); out.push(await read()); }
  console.log(click ? 'WITH CLICK' : 'CONTROL', JSON.stringify(out)); console.log(logs.join('\n') || 'no console errors'); await b.close();
}
await run(false); await run(true);
