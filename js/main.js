// Start-up: apply the theme, load the globe library from the CDN, then start the app.

import { LIBS, THEME } from './config.js';

// THEME (config.js) -> CSS variables, e.g. accent -> --gv-accent
const root = document.documentElement;
for (const [k, v] of Object.entries(THEME)) {
  root.style.setProperty('--gv-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), v);
}

// A setup link (#watch=<key>@<host>) must not stay in the address bar or the
// history: read it and remove it straight away, before anything else loads.
window.__gvHash = location.hash || '';
if (window.__gvHash) history.replaceState(null, '', location.pathname + location.search);

const boot = document.getElementById('boot');
const bootMsg = (t) => { const s = boot && boot.querySelector('span'); if (s) s.textContent = t; };

function loadCss(href) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.prepend(l);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

async function start() {
  // Lookout's screens (Now, Cams, Scanner, News) need no globe: show them first.
  try { (await import('./lookout/shell.js')).initShell(); } catch (e) { console.error('Lookout screens', e); }
  try {
    window.CESIUM_BASE_URL = LIBS.cesiumBase;
    loadCss(LIBS.cesiumBase + 'Widgets/widgets.css');
    bootMsg('loading globe…');
    await loadScript(LIBS.cesiumBase + 'Cesium.js');
    if (!window.Cesium) throw new Error('Globe library did not start');
    const app = await import('./app.js');
    await app.start();
    boot.classList.add('gone');
    setTimeout(() => boot.remove(), 600);
  } catch (e) {
    console.error(e);
    bootMsg('Could not start: ' + (e && e.message ? e.message : e) + '. Check your connection and reload.');
  }
}

start();
