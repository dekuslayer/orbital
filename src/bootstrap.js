// Loads the app and shows a readable error instead of a blank page if the 3D library or any module fails.
const boot = document.getElementById('boot');
try {
  const mod = await import('./main.js');
  await mod.start();
  boot.classList.add('hide');
} catch (e) {
  console.error(e);
  boot.innerHTML = `<div class="err"><h3>ORBITAL could not start</h3>
    <p>${String(e && e.message || e).replace(/</g, '&lt;')}</p>
    <p>Three.js was loaded from the <b>${window.__threeSource}</b>. Most common fixes:</p>
    <ol><li>Run the project through a local web server (<code>npm start</code> or the VS Code "Live Server" extension). Opening <code>index.html</code> directly with <code>file://</code> blocks ES modules.</li>
    <li>Run <code>npm install</code> then <code>npm run setup</code> once to copy Three.js into <code>vendor/</code> (needed for offline use), or allow access to cdn.jsdelivr.net.</li>
    <li>Use a browser with WebGL enabled (current Chrome, Edge, Firefox or Safari).</li></ol></div>`;
}
