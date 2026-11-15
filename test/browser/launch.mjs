import { launch, ok } from './lib.mjs';
const { b, p, logs } = await launch();
const S = () => p.evaluate(() => { const { S, store } = window.__ORBITAL; const s = store.get(); return { view: S.view, credits: Math.floor(s.credits), fc: S.fc ? { state: S.fc.state, fee: S.fc.fee, phase: S.fc.flight.phase, engine: S.fc.flight.engineOn, fuel: S.fc.flight.fuelCore, maxq: S.fc.flight.maxQAssist, alt: S.fc.flight.alt, vis: S.fview && S.fview.rocketRoot && S.fview.rocketRoot.visible } : null }; });
await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForFunction(() => document.getElementById('boot').classList.contains('hide'), null, { timeout: 60000 });
const c0 = (await S()).credits;
// home CTA must NOT launch
await p.click('[data-home="launch"]'); await p.waitForTimeout(800);
let s = await S(); ok(s.view === 'flight' && s.fc === null && s.credits === c0, `home CTA goes to pad, no flight, no charge (${JSON.stringify(s)})`);
// Lab "Go to launchpad" must not launch
await p.click('[data-nav="lab"]'); await p.waitForTimeout(800); await p.click('#btnToLaunch'); await p.waitForTimeout(800);
s = await S(); ok(s.view === 'flight' && s.fc === null && s.credits === c0, 'lab Go-to-launchpad does not launch or charge');
// start countdown, hammer Max-Q during countdown
await p.click('#btnLaunchNow'); await p.waitForTimeout(500);
s = await S(); ok(s.fc && s.fc.state === 'countdown' && s.credits === c0, 'countdown running, nothing charged yet');
for (let i = 0; i < 6; i++) await p.click('#bMaxq');
await p.keyboard.press('m'); await p.keyboard.press('m');
s = await S(); ok(s.fc.state === 'countdown' && !s.fc.engine && s.credits === c0, 'Max-Q toggles during countdown never ignite (state=' + s.fc.state + ')');
// abort
await p.click('#bAbort'); await p.waitForTimeout(500); s = await S(); ok(s.fc === null && s.credits === c0, 'abort countdown: no flight, no charge');
// real launch, double click on Start
await p.click('#btnLaunchNow'); await p.click('#btnLaunchNow', { timeout: 1500 }).catch(() => {});
await p.evaluate(() => { window.__ORBITAL.S.fc.cd = 0.05; });
await p.waitForFunction(() => window.__ORBITAL.S.fc && window.__ORBITAL.S.fc.state === 'flying', null, { timeout: 60000 });
s = await S(); const fee = c0 - s.credits; ok(fee > 0 && fee < 100, 'fee charged exactly once at ignition: ' + fee);
for (let i = 0; i < 5; i++) await p.click('#bMaxq'); await p.keyboard.press('m'); await p.keyboard.press(' '); await p.keyboard.press(' ');
await p.waitForTimeout(1500); s = await S();
ok(s.fc.state === 'flying' && s.fc.vis !== false && s.credits === c0 - fee, 'after Max-Q toggles: still one flight, rocket visible, balance unchanged ' + JSON.stringify(s.fc));
// try to start another launch mid-flight through the home CTA
await p.click('[data-nav="home"]'); await p.click('[data-home="launch"]'); await p.waitForTimeout(500); s = await S(); ok(s.credits === c0 - fee && s.fc.state === 'flying', 'launch CTA mid-flight does not charge or restart');
console.log(logs.join('\n') || 'no console errors'); await b.close();
