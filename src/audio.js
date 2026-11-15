// ORBITAL — data sonification engine (Web Audio API).
// Output is GENERATED SOUND derived from the displayed series. It is not a NASA recording.
// Safety: master gain is capped (MAX_GAIN), every voice has attack/release envelopes, a limiter-style compressor
// is on the output, and Stop applies a short fade before closing voices.

const MAX_GAIN = 0.55;
const PENTA = [0, 2, 4, 7, 9];            // major pentatonic
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

let transpose = 0;   // semitones, set by Sonifier.setPitch (user pitch control, -12..+12)
const midi = n => 440 * Math.pow(2, (n + transpose - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function scaleNote(norm, root, scale, octaves) {
  const steps = scale.length * octaves; const k = Math.round(clamp(norm, 0, 1) * (steps - 1));
  return root + Math.floor(k / scale.length) * 12 + scale[k % scale.length];
}

export class Sonifier {
  constructor() {
    this.ctx = null; this.master = null; this.comp = null;
    this.volume = 0.6; this.muted = false; this.speed = 1; this.voices = 'both';
    this.state = 'stopped'; // stopped | playing | paused
    this.step = 0; this.timer = null; this.nextTime = 0; this.listeners = new Set(); this.active = new Set();
    this.rec = null; this.data = null; this.scheduledCbs = []; this.playTok = 0;
  }

  supported() { return !!(window.AudioContext || window.webkitAudioContext); }
  onStep(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  ensureContext() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC();
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.ratio.value = 6; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master = this.ctx.createGain(); this.master.gain.value = 0;
    this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
    return true;
  }

  load(rec, data) { this.stop(true); this.rec = rec; this.data = data; this.step = 0; }
  level() { return this.muted ? 0 : this.volume * MAX_GAIN; }
  setMuted(m) { this.muted = !!m; if (this.master && this.ctx && this.state === 'playing') this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.04); }
  setVolume(v) { this.volume = clamp(v, 0, 1); if (this.master && this.state === 'playing') this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05); }
  setPitch(semitones) { transpose = clamp(Math.round(+semitones || 0), -12, 12); }
  get pitch() { return transpose; }
  setSpeed(s) { this.speed = clamp(s, 0.5, 2); }
  setVoices(v) { this.voices = v; }
  seek(i) { this.step = clamp(i, 0, (this.data?.labels.length || 12) - 1); if (this.state === 'playing') { this.nextTime = this.ctx.currentTime + 0.05; } this.emit(this.step); }
  emit(i) { this.listeners.forEach(fn => { try { fn(i, this.state); } catch (e) { console.error(e); } }); }

  async play() {
    if (!this.rec) return false;
    if (!this.ensureContext()) return false;
    const tok = ++this.playTok, rec = this.rec;                 // stop()/load()/pause() bump the token: a play() still waiting for the AudioContext must not start afterwards
    try { await this.ctx.resume(); } catch (e) { return false; }
    if (tok !== this.playTok || rec !== this.rec || !this.data) return false;
    if (this.state === 'playing') return true;
    this.state = 'playing';
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(this.level(), this.ctx.currentTime + 0.6);   // gentle fade-in
    this.nextTime = this.ctx.currentTime + 0.12;
    this.tick();
    this.timer = setInterval(() => this.tick(), 90);
    return true;
  }

  pause() {
    this.playTok++;
    if (this.state !== 'playing') return;
    this.state = 'paused'; clearInterval(this.timer); this.timer = null;
    const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(0, t + 0.2);
    this.clearCallbacks(); this.emit(this.step);
  }
  async resume() { if (this.state === 'paused') return this.play(); return false; }

  stop(silent) {
    this.playTok++;
    clearInterval(this.timer); this.timer = null; this.clearCallbacks();
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(0, t + 0.15);
      const toStop = [...this.active]; setTimeout(() => toStop.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } }), 200);
      this.active.clear();
    }
    this.state = 'stopped'; this.step = 0; if (!silent) this.emit(0);
  }
  // Play a single month once (used when the player clicks the chart while stopped or paused).
  async audition(i) {
    if (!this.rec || this.state === 'playing') return;
    if (!this.ensureContext()) return; try { await this.ctx.resume(); } catch (e) { return; }
    const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(0, t); this.master.gain.linearRampToValueAtTime(this.level(), t + 0.05);
    this.playStep(i, t + 0.02, 1.25 / this.speed);
    this.master.gain.setValueAtTime(this.level(), t + 1.2); this.master.gain.linearRampToValueAtTime(0, t + 1.7);
  }
  clearCallbacks() { this.scheduledCbs.forEach(clearTimeout); this.scheduledCbs = []; }

  dispose() { this.stop(true); if (this.ctx) { try { this.ctx.close(); } catch (e) { /* ignore */ } this.ctx = null; } }

  // ---- scheduler ----
  tick() {
    if (this.state !== 'playing') return;
    const n = this.data.labels.length; const beat = 1.25 / this.speed;
    while (this.nextTime < this.ctx.currentTime + 0.35) {
      const i = this.step; const when = this.nextTime;
      this.playStep(i, when, beat);
      const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
      const idx = i; this.scheduledCbs.push(setTimeout(() => { if (this.state === 'playing') this.emit(idx); }, delay));
      this.step = (this.step + 1) % n; this.nextTime += beat;
    }
  }

  allValues() { const A = this.data.series.A.values, B = this.data.series.B.values; const all = [...A, ...B]; return { min: Math.min(...all), max: Math.max(...all) }; }
  norm(v) { const { min, max } = this.allValues(); return max === min ? 0.5 : (v - min) / (max - min); }

  playStep(i, t, beat) {
    const A = this.data.series.A.values[i], B = this.data.series.B.values[i];
    const variant = this.rec.variant;
    // A single global series (e.g. temperature anomaly) plays ONLY series B, centred; series A is a silent reference line.
    const voices = this.rec.singleSeries ? [[B, 1, 0]] : this.voices === 'A' ? [[A, 0, -0.35]] : this.voices === 'B' ? [[B, 1, 0.35]] : [[A, 0, -0.35], [B, 1, 0.35]];
    const pts = (this.data && Array.isArray(this.data.points)) ? this.data.points : [];   // only the points that belong to the LOADED data
    for (const [v, idx, pan] of voices) {
      const nrm = this.norm(v);
      // Stereo placement is a sound-design choice. It follows a longitude only when the loaded data really carries locations.
      const lonPan = pts.length ? clamp((pts[i % pts.length][1]) / 180, -1, 1) * 0.6 : pan;
      switch (variant) {
        case 'fire': this.vFire(t, beat, nrm, idx, pan); break;
        case 'ocean': this.vOcean(t, beat, nrm, idx, lonPan); break;
        case 'storm': this.vStorm(t, beat, nrm, idx, pan); break;
        case 'air': this.vAir(t, beat, nrm, idx, pan, i); break;
        case 'land': this.vLand(t, beat, nrm, idx, pan); break;
        case 'ice': this.vIce(t, beat, nrm, idx, pan); break;
        case 'temperature': this.vTemperature(t, beat, nrm, v, pan); break;
        default: this.tone(midi(scaleNote(nrm, 55, PENTA, 3)), t, beat * 0.8, 'sine', 0.2, pan);
      }
    }
  }

  // ---- primitives ----
  panner(pan) { if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(this.master); return p; } return this.master; }
  tone(freq, t, dur, type, gain, pan, attack = 0.02, detune = 0) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.panner(pan)); o.start(t); o.stop(t + dur + 0.05); this.track(o); return { o, g };
  }
  noise(t, dur, f, q, gain, pan, type = 'bandpass') {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur)); const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0); let s = 1; for (let k = 0; k < len; k++) { s = (s * 16807) % 2147483647; d[k] = (s / 2147483647) * 2 - 1; } // deterministic noise
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(this.panner(pan)); src.start(t); this.track(src);
  }
  track(node) { this.active.add(node); node.onended = () => this.active.delete(node); }

  // ---- record voices (value normalised 0..1 over both series) ----
  vFire(t, beat, n, idx, pan) {
    const count = 2 + Math.round(n * 14);                                  // event density ← detection index
    for (let k = 0; k < count; k++) this.noise(t + (k / count) * beat * 0.95, 0.05 + 0.04 * n, 2200 + 1800 * ((k * 7) % 5) / 5, 6, 0.05 + 0.05 * n, pan);
    this.tone(midi(scaleNote(n, 62, PENTA, 3) + (idx ? 7 : 0)), t, beat * 0.9, 'triangle', 0.12 + 0.08 * n, pan, 0.005);
  }
  vOcean(t, beat, n, idx, pan) {
    const f = midi(scaleNote(n, 48 + (idx ? 7 : 0), MAJOR, 3));
    this.tone(f, t, beat * 1.15, 'sine', 0.16, pan, beat * 0.45);
    this.tone(f * 2.003, t, beat * 1.0, 'sine', 0.05, pan, beat * 0.5);
    this.noise(t, beat, 500 + 900 * n, 0.7, 0.02, pan, 'lowpass');
  }
  vStorm(t, beat, n, idx, pan) {
    const rate = 3 + Math.round(n * 18);                                    // pulses per step ← rain rate
    for (let k = 0; k < rate; k++) this.noise(t + (k / rate) * beat, 0.035, 3500 + 2000 * n, 1.2, 0.04 + 0.03 * n, pan + ((k % 3) - 1) * 0.15, 'highpass');
    this.tone(midi(scaleNote(n, 40 + (idx ? 5 : 0), PENTA, 2)), t, beat * 0.9, 'sine', 0.12, pan, 0.03);
  }
  vAir(t, beat, n, idx, pan, i) {
    const o = this.ctx.createOscillator(), flt = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = midi(scaleNote(n, 41 + (idx ? 7 : 0), PENTA, 2));
    flt.type = 'lowpass'; flt.frequency.value = 300 + 2600 * n; flt.Q.value = 2;                // brightness ← AOT
    const arr = this.data.series[idx ? 'B' : 'A'].values; const prev = arr[(i - 1 + arr.length) % arr.length]; const delta = Math.abs(this.norm(arr[i]) - this.norm(prev));
    lfo.frequency.value = 4.5; lg.gain.value = 0.02 + 0.2 * delta;                              // tremolo depth ← month-to-month change
    lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + beat * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.1);
    o.connect(flt); flt.connect(g); g.connect(this.panner(pan)); o.start(t); lfo.start(t); o.stop(t + beat * 1.15); lfo.stop(t + beat * 1.15); this.track(o); this.track(lfo);
  }
  vLand(t, beat, n, idx, pan) {
    if (n < 0.04) return;                                                    // silence at near-zero greenness
    const f = midi(scaleNote(n, 60 + (idx ? 12 : 0), MAJOR, 2));
    this.tone(f, t, 0.25 + n * beat, 'triangle', 0.2, pan, 0.004);
    this.tone(f * 3, t, 0.12, 'sine', 0.05, pan, 0.002);
  }
  // Temperature anomaly: pitch and brightness rise with the anomaly. The lowest note is the series minimum (the data decide the range);
  // a soft low drone marks the zero line (the 1951–1980 mean) whenever the value is above zero, so the listener hears the distance from it.
  vTemperature(t, beat, n, rawValue, pan) {
    const f = midi(scaleNote(n, 48, MAJOR, 3));
    const flt = this.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 500 + 3000 * n; flt.Q.value = 0.8;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + beat * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 1.05);
    o.connect(flt); flt.connect(g); g.connect(this.panner(pan)); o.start(t); o.stop(t + beat * 1.1); this.track(o);
    if (rawValue > 0) this.tone(midi(36), t, beat * 0.9, 'sine', 0.05 + 0.03 * Math.min(1, rawValue), pan, beat * 0.2);   // zero-line drone
  }
  vIce(t, beat, n, idx, pan) {
    const inv = 1 - n;                                                       // more ice → lower pitch
    const f = midi(scaleNote(inv, 52 + (idx ? 12 : 0), MAJOR, 3));
    this.tone(f, t, beat * 1.1, 'sine', 0.13, pan, beat * 0.35, -6);
    this.tone(f, t, beat * 1.1, 'sine', 0.13, pan, beat * 0.35, 6);
  }
}
