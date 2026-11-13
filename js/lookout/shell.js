// The tab bar: Now, Map, Cams, Scanner, News. Map is the globe; the others are
// Lookout's plain screens, drawn over it. This runs before the globe library
// loads, so Now shows right away; the globe joins when ready (attachApp).
// While another tab is open the globe stops drawing (saves battery).

import { $ } from './common.js';
import { prefs, initPlace, preferWatchPlace } from './place.js';
import { initPicker, openPicker } from './picker.js';
import { setShow, setApp } from './nav.js';
import * as now from './now.js';
import * as cams from './cams.js';
import * as scanner from './scanner.js';
import * as news from './news.js';

export const TABS = ['now', 'map', 'cams', 'scanner', 'news'];
const SCREENS = { now, cams, scanner, news };
let current = null;
let app = null;

export function show(tab, opts = {}) {
  if (!TABS.includes(tab)) tab = 'now';
  const prev = current;
  current = tab;
  const isMap = tab === 'map';
  document.body.classList.toggle('tab-map', isMap);
  document.body.classList.toggle('tab-lk', !isMap);
  $('lk').hidden = isMap;
  $('lk-place').hidden = isMap;
  for (const v of document.querySelectorAll('.lk-view')) v.hidden = v.dataset.view !== tab;
  for (const b of document.querySelectorAll('#tabbar button')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (prev && prev !== tab && SCREENS[prev]) SCREENS[prev].hide();
  if (app) {
    app.viewer.useDefaultRenderLoop = isMap;
    if (isMap) { app.viewer.resize(); app.viewer.scene.requestRender(); }
  }
  if (!isMap) {
    if (prev !== tab) $('lk').scrollTop = 0;
    SCREENS[tab].show(opts);
  }
  prefs.set('last', tab);
}
export const currentTab = () => current;

// Where GodView opens: ?tab=… (links), else your choice in Settings (default: Now).
export function startTab() {
  const q = new URLSearchParams(location.search).get('tab');
  if (TABS.includes(q)) return q;
  const openTo = prefs.get('openTo') || 'now';
  return openTo === 'last' ? (TABS.includes(prefs.get('last')) ? prefs.get('last') : 'now') : (TABS.includes(openTo) ? openTo : 'now');
}

export function initShell() {
  setShow(show);
  for (const b of document.querySelectorAll('#tabbar button')) b.addEventListener('click', () => show(b.dataset.tab));
  $('lk-place').addEventListener('click', () => openPicker());
  initPicker();
  for (const s of Object.values(SCREENS)) s.init();
  show(startTab());
  initPlace().catch((e) => console.warn('place', e));
}

// The globe app has started: { viewer, manager, globe, watch, status, ui }.
export function attachApp(a) {
  app = a;
  app.viewer.useDefaultRenderLoop = current === 'map';
  setApp(a);
  preferWatchPlace(async () => (a.watch.connected() ? (await a.watch.api('/places', { timeoutMs: 8000 })).places || [] : []));
}
