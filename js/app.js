// The app itself: builds the globe, starts the layers and the controls.

import { LAYERS } from './layers/index.js';
import { LayerManager } from './core/layer-manager.js';
import { settings, apiKeys, firstRun } from './core/settings.js';
import { applyMode } from './modes.js';
import * as globe from './globe.js';
import { initUI } from './ui.js';
import { watchSelfTest } from './watch.js';
import { AIRCRAFT_INFO } from './config.js';
import { fetchJSON } from './core/net.js';

// Self-test rows for the plane-card sources (adsbdb, planespotters): one real
// lookup of a random aircraft each. Same row shape as the layer rows.
async function aircraftInfoTest() {
  const row = async (id, name, fn) => {
    const t0 = performance.now();
    try { const count = await fn(); return { id, name, ok: true, count, ms: Math.round(performance.now() - t0), via: 'direct', error: null }; } catch (e) { return { id, name, ok: false, count: null, ms: Math.round(performance.now() - t0), via: null, error: e.message }; }
  };
  let hex = 'A0F1BB';
  const a = await row('aircraftInfo', 'Plane details (adsbdb)', async () => {
    const j = await fetchJSON(AIRCRAFT_INFO.adsbdb.replace('{hex}', 'random').replace('?callsign={callsign}', ''), { timeoutMs: 15000 });
    if (!j?.response?.aircraft) throw new Error('no aircraft in answer');
    hex = j.response.aircraft.mode_s || hex;
    return 1;
  });
  const r = await row('aircraftRoute', 'Flight routes (adsbdb)', async () => {
    const j = await fetchJSON(AIRCRAFT_INFO.adsbdbCallsign.replace('{callsign}', 'random'), { timeoutMs: 15000 });
    if (!j?.response?.flightroute) throw new Error('no route in answer');
    return 1;
  });
  const p = await row('aircraftPhoto', 'Plane photos (planespotters)', async () => {
    const j = await fetchJSON(AIRCRAFT_INFO.photo.replace('{hex}', hex), { timeoutMs: 15000 });
    return (j.photos || []).length;
  });
  return [a, r, p];
}

export async function start() {
  const viewer = globe.createGlobe('globe', 'credits');
  globe.setBasemap(settings.get('basemap'));
  globe.setViewStyle(settings.get('viewStyle'));

  const s = settings.get('start');
  globe.jumpTo(Number(s.lat), Number(s.lon), Number(s.heightKm) || 900);

  const manager = new LayerManager(viewer, LAYERS);
  initUI({ viewer, manager, layers: LAYERS });

  // Turn on the layers that were on last time (or each layer's default the
  // first time), a quarter-second apart so they do not all fetch at once.
  // A first visit starts in the "Around me" mode; returning visitors get back
  // exactly what they had (their mode, or their own mix).
  if (firstRun) applyMode(manager, LAYERS, settings, apiKeys, 'around');
  else {
    if (!settings.get('mode')) settings.set('mode', 'custom');
    const enabled = settings.get('enabled');
    LAYERS.filter((l) => enabled[l.id] ?? l.defaultOn)
      .forEach((l, i) => setTimeout(() => manager.enable(l.id, true), i * 250));
  }

  // Layers that depend on where you are looking (flights) reload when the camera stops.
  let t = null;
  globe.onCameraIdle(() => { clearTimeout(t); t = setTimeout(() => manager.viewChanged(), 600); });

  // Handy for debugging in the browser console: GodView.manager.state
  // GodView.selfTest() checks every data source once (see README).
  window.GodView = { viewer, manager, settings, layers: LAYERS, globe, selfTest: async (opts) => [...await manager.selfTest(opts), ...await aircraftInfoTest()], watchSelfTest };
}
