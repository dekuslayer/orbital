// Economy, persistence, reports (localStorage is stubbed: these run in plain Node)
const mem = new Map(); globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const { test, summary, assert, Flight, defaultLoadout, getMission, B, simulateAssisted } = await import('./helpers.mjs');
console.log('State, economy & reports');
const { store } = await import('../src/state.js');
const { verifiedBuild } = await import('../src/advisor.js');
const { MISSIONS } = await import('../src/missions.js');
const { launchFee } = await import('../src/vehicle.js');

test('starting launch fee is low and affordable many times over', () => { const fee = launchFee(defaultLoadout()); assert.ok(fee <= 60, 'fee ' + fee); assert.ok(store.get().credits / fee > 20); });

test('11. rewards are paid once per flight (double call / page reload cannot repeat them)', () => {
  store.reset(); const { f } = simulateAssisted(defaultLoadout(), getMission('sounding')); assert.ok(f.outcome.success);
  const c0 = store.get().credits, g0 = store.get().gems; const r1 = store.recordFlight(f, { fee: 40 }); const c1 = store.get().credits, g1 = store.get().gems;
  assert.ok(c1 > c0 && g1 > g0, 'first call pays');
  const r2 = store.recordFlight(f, { fee: 40 }); assert.equal(store.get().credits, c1); assert.equal(store.get().gems, g1); assert.equal(store.get().reports.length, 1); assert.equal(r1.flightUid, r2.flightUid);
  // simulate reload: state is re-read from storage; the same flight still cannot pay again
  const saved = localStorage.getItem('orbital.save.v1'); assert.ok(saved); assert.ok(JSON.parse(saved).rewardedFlights.includes(f.uid));
});

test('12. report keeps the REAL vehicle configuration even if the lab loadout changes later', () => {
  store.reset(); const L = defaultLoadout(); const { f } = simulateAssisted(L, getMission('sounding')); store.recordFlight(f, { fee: 40 });
  const rep = store.get().reports[0]; const engine0 = rep.vehicle.Engine; assert.ok(engine0 && engine0.length > 2);
  store.get().owned.push('eng_ember'); store.install('eng_ember'); assert.equal(store.get().reports[0].vehicle.Engine, engine0, 'old report unchanged'); assert.deepEqual(store.get().reports[0].loadoutSnapshot, L);
  const f2 = new Flight({ ...L, engines: 'eng_ember' }, getMission('sounding')); f2.ignite(); f2.setThrottle(1); f2.finish(false, 'test'); store.recordFlight(f2, { fee: 1 }); assert.notEqual(store.get().reports[0].vehicle.Engine, engine0, 'new report shows the engine actually flown');
});

test('corrupt or partial localStorage never crashes and valid parts survive', async () => {
  mem.set('orbital.save.v1', '{not json'); const m1 = await import('../src/state.js?bad1'); assert.ok(m1.store.get().credits > 0);
  mem.set('orbital.save.v1', JSON.stringify({ v: 1, credits: 'lots', gems: -5, owned: ['nope', 'eng_ember'], loadout: { engines: 'eng_titan' }, completed: ['sounding', 'bogus'], records: 7, reports: [null, 3] }));
  const m2 = await import('../src/state.js?bad2'); const s = m2.store.get();
  assert.ok(Number.isFinite(s.credits) && s.credits >= 0); assert.ok(s.gems >= 0); assert.ok(s.owned.includes('eng_ember') && !s.owned.includes('nope')); assert.equal(s.loadout.engines, defaultLoadout().engines, 'unowned part in loadout is replaced'); assert.deepEqual(s.completed, ['sounding']); assert.ok(s.records.includes('rec_fire')); assert.equal(s.reports.length, 0);
});

test('purchases that would strand the player are blocked; sell-back is 80%', () => {
  store.reset(); const s0 = store.get().credits; const r = store.buy('eng_titan'); assert.equal(r.ok, false); assert.equal(store.get().credits, s0);
  assert.equal(store.buy('tank_m').ok, true); assert.equal(store.buy('tank_m').ok, false, 'no double purchase'); const before = store.get().credits; const sold = store.sell('tank_m'); assert.equal(sold.refund, Math.round(1400 * 0.8)); assert.ok(store.get().credits > before);
});

test('locked missions cannot be selected before they are unlocked', () => { store.reset(); assert.equal(store.selectMission('lunar-land'), false); assert.equal(store.selectMission('sounding'), true); });

test('gems and credits are separate: buying parts never touches gems, unlocking records never touches credits', () => {
  store.reset(); const s = store.get(); s.gems = 10; const c = s.credits; store.buyRecord('rec_ocean', 4); assert.equal(store.get().credits, c); assert.equal(store.get().gems, 6); const g = store.get().gems; store.buy('tank_m'); assert.equal(store.get().gems, g);
});

test('economy: the whole campaign is winnable using only earned credits and the advisor’s flight-tested builds', () => {
  store.reset(); let guard = 0, replaysTotal = 0;
  while (store.get().completed.length < MISSIONS.length && guard++ < 40) {
    const s = store.get(); const m = MISSIONS.find(x => !s.completed.includes(x.id)); store.selectMission(m.id);
    const rec = verifiedBuild(s.owned, m); assert.ok(rec, 'a flight-tested build exists for ' + m.id);
    let replays = 0;
    // Short of credits? Replay the latest completed mission with the starter-compatible current rocket (40% rewards) until affordable.
    while (store.get().credits < rec.buy + rec.fee + 60) {
      assert.ok(replays++ < 60, `needed too many replays to afford ${m.id}`); replaysTotal++;
      const own = store.get(), rm = MISSIONS.filter(x => own.completed.includes(x.id)).pop(); assert.ok(rm, 'nothing to replay');
      const fee = launchFee(own.loadout); assert.ok(store.payLaunchFee().ok, 'replay fee affordable');
      const { f } = simulateAssisted(own.loadout, rm); assert.ok(f.outcome.success, 'replay of ' + rm.id + ' with the installed rocket: ' + f.outcome.cause); store.recordFlight(f, { fee });
    }
    for (const p of rec.parts) { const b = store.buy(p.id); assert.ok(b.ok, b.msg); } assert.ok(store.setLoadout(rec.loadout).ok);
    const fee = launchFee(rec.loadout); assert.ok(store.payLaunchFee().ok, 'can pay the launch fee for ' + m.id);
    const { f } = simulateAssisted(rec.loadout, m); assert.ok(f.outcome.success, m.id + ': ' + f.outcome.cause); store.recordFlight(f, { fee });
  }
  assert.equal(store.get().completed.length, MISSIONS.length); console.log('     (campaign needed', replaysTotal, 'replay flights; final credits', Math.floor(store.get().credits) + ')');
});

const { BADGES } = await import('../src/state.js');
test('achievements are earned only from real events, once, cosmetic only', () => {
  store.reset(); assert.deepEqual(Object.keys(store.get().achievements), [], 'a fresh game has no badges');
  const c0 = store.get().credits, g0 = store.get().gems;
  store.noteExamined('rec_fire', 2, 'Mar'); assert.equal(store.get().achievements.first_data, undefined, 'examining is not playing');
  store.noteRecordPlayed('rec_fire', 0, 'Jan'); assert.ok(store.get().achievements.first_data, 'playing a record earns First Data Record');
  const when = store.get().achievements.first_data; store.noteRecordPlayed('rec_fire', 1, 'Feb'); assert.equal(store.get().achievements.first_data, when, 'earned once, date does not change');
  assert.equal(store.takeNewBadges().length, 1); assert.equal(store.takeNewBadges().length, 0, 'new-badge queue is drained');
  assert.equal(store.get().credits, c0); assert.equal(store.get().gems, g0, 'badges never pay credits or gems');
  assert.equal(store.get().achievements.moon, undefined); assert.equal(store.get().achievements.first_launch, undefined);
  const { f } = simulateAssisted(defaultLoadout(), getMission('sounding')); store.recordFlight(f, { fee: 40 }); assert.ok(store.get().achievements.first_launch);
  store.get().gems = 20; store.buyRecord('rec_ocean', 4); store.solveDiscovery('rec_ocean'); assert.ok(store.get().achievements.ocean); assert.ok(store.get().explorer.discoveryDates.rec_ocean && store.get().explorer.recordDates.rec_ocean);
  const g1 = store.get().gems; store.solveDiscovery('rec_ocean'); assert.equal(store.get().gems, g1, 'a discovery pays only once');
  assert.equal(store.buyRecord('rec_ocean', 4).ok, false, 'a record cannot be bought twice');
});

test('explorer log and badges survive a reload; a corrupt log never crashes', () => {
  const raw = JSON.parse(mem.get('orbital.save.v1')); assert.ok(raw.achievements.first_data && raw.explorer.last);
  raw.explorer = 'garbage'; raw.achievements = { first_launch: 'not-a-date', fake_badge: new Date().toISOString() }; mem.set('orbital.save.v1', JSON.stringify(raw));
  return import('../src/state.js?reload=' + Date.now()).then(m => { const st = m.store.get(); assert.deepEqual(st.explorer.played, []); assert.equal(st.achievements.fake_badge, undefined, 'unknown badge ids are dropped'); assert.equal(st.achievements.first_launch, undefined, 'invalid dates are dropped'); });
});

test('zero balance: the recovery stipend and the free starter keep the game playable', () => {
  store.reset(); const s = store.get(); s.credits = 0; const { f } = simulateAssisted(defaultLoadout(), getMission('sounding')); store.recordFlight(f, { fee: 0 });
  assert.ok(store.get().credits >= launchFee(defaultLoadout()), 'after any flight the player can afford the starter launch');
  assert.equal(store.sell('eng_spark').ok, false, 'free parts cannot be sold'); assert.equal(store.get().owned.includes('eng_spark'), true);
});

const r = await summary('state'); process.exit(r.failed ? 1 : 0);
