// ORBITAL live NASA pages — shared helpers: navigation, date windows, audio engine, waveform.
const LIVE_PAGES = [
  { id: 'fire',  href: 'fire.html',   label: '🔥 Fire Frequency',   color: '#ff6d00', rec: 'Fire Frequency',     desc: 'Open wildfire EVENTS from NASA EONET; not FIRMS pixel detections' },
  { id: 'arctic',href: 'arctic.html', label: '🧊 Arctic Ice',       color: '#00bcd4', rec: 'Ice Memory',         desc: '2 m air temperature at one Arctic point (NASA POWER) + open sea/lake-ice events (EONET)' },
  { id: 'ocean', href: 'ocean.html',  label: '🌊 Ocean & Climate',  color: '#00e676', rec: 'Ocean Symphony',     desc: '2 m air temperature at coastal Alexandria (NASA POWER); not ocean temperature or chlorophyll' },
  { id: 'air',   href: 'air.html',    label: '🌫 Atmosphere',       color: '#00bfa5', rec: 'Atmosphere in Motion', desc: 'Surface solar irradiance over Cairo (NASA POWER); not aerosol optical depth or air quality' },
  { id: 'storm', href: 'storm.html',  label: '⛈ Storm Signals',     color: '#42a5f5', rec: 'Storm Signals',      desc: 'Open severe-storm EVENTS (NASA EONET); not GPM precipitation measurements' },
  { id: 'fever', href: 'fever.html',  label: '🌡 Fever Chart',       color: '#ff5252', rec: 'Fever Chart',        desc: '12-month 2 m air-temperature anomaly at one grid point (NASA POWER); not global GISTEMP' },
  { id: 'earth', href: 'earth.html',  label: '🌍 Earth in Motion',  color: '#ab47bc', rec: 'Earth in Motion',    desc: 'All open natural events on Earth right now (NASA EONET)' },
];

// Live-page controls remain disabled until the API result or an explicitly labelled offline fallback is ready.
function setLiveControlsReady(ready) {
  document.querySelectorAll('.btn-group button').forEach(button => { button.disabled = !ready; });
}
setLiveControlsReady(false);

function mountNav(activeId) {
  const nav = document.createElement('nav');
  nav.className = 'livenav'; nav.setAttribute('aria-label', 'Live NASA pages');
  nav.innerHTML = '<a class="back" href="../index.html">← ORBITAL</a><a href="index.html"' + (activeId === 'hub' ? ' class="on"' : '') + '>All live pages</a>' +
    LIVE_PAGES.map(p => '<a href="' + p.href + '"' + (p.id === activeId ? ' class="on"' : '') + '>' + p.label + '</a>').join('');
  document.body.prepend(nav);
}

// ---- NASA POWER date window: data lags a few days, so use a 7-day window that ends 4 days ago (UTC). ----
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
function powerWindow(yearOverride) {
  const end = new Date(Date.now() - 4 * 864e5), start = new Date(end.getTime() - 6 * 864e5);
  let s = ymd(start), e = ymd(end);
  if (yearOverride) { const fix = x => (x.slice(4) === '0229' ? '0228' : x.slice(4)); s = yearOverride + fix(s); e = yearOverride + fix(e); }
  return { start: s, end: e };
}
const powerUrl = (params, lon, lat, win) =>
  'https://power.larc.nasa.gov/api/temporal/daily/point?parameters=' + params + '&community=RE&longitude=' + lon + '&latitude=' + lat + '&start=' + win.start + '&end=' + win.end + '&format=JSON';
async function getJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { const r = await fetch(url, { signal: controller.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(timer); }
}
const validValues = obj => Object.values(obj || {}).filter(v => typeof v === 'number' && Number.isFinite(v) && v > -900);

// ---- Audio engine + oscilloscope ----
let audioCtx = null, analyser = null, strokeColor = '#fff';
const canvas = document.getElementById('visualizer'), canvasCtx = canvas.getContext('2d');
canvas.width = 600; canvas.height = 150;
const setNarrative = t => { document.getElementById('narrative-box').innerText = t; };
const setStatus = t => { document.getElementById('status-msg').innerText = t; };

function initAudio() {
  if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048; analyser.connect(audioCtx.destination); visualize(); }
  else if (audioCtx.state === 'suspended') audioCtx.resume();
}
function speakText(t) { if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } }
// one decaying note: type, frequency (Hz), start time, duration (s), peak gain
function note(type, freq, t, dur, gain) {
  const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g); g.connect(analyser); osc.start(t); osc.stop(t + dur);
}
function visualize() {
  const n = analyser.frequencyBinCount, arr = new Uint8Array(n);
  (function draw() {
    requestAnimationFrame(draw); analyser.getByteTimeDomainData(arr);
    canvasCtx.fillStyle = '#111115'; canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.lineWidth = 3; canvasCtx.strokeStyle = strokeColor; canvasCtx.beginPath();
    const sw = canvas.width / n; let x = 0;
    for (let i = 0; i < n; i++) { const y = (arr[i] / 128) * (canvas.height / 2); i === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y); x += sw; }
    canvasCtx.lineTo(canvas.width, canvas.height / 2); canvasCtx.stroke();
  })();
}
