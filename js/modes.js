// Modes: one tap switches the whole set of layers for a purpose.
// "My mix" restores whatever you last switched on by hand.
// To change what a mode shows, edit its `layers` list (layer ids from layers/index.js).

const I = (d) => `<svg viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const MODES = [
  { id: 'around', name: 'Around me', color: '#7aa5ff', fly: true, icon: I('M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
    layers: ['flights', 'alerts', 'radar', 'earthquakes', 'fireIncidents', 'rivers', 'satStations', 'daynight', 'ga511Events'] },
  { id: 'sky', name: 'Sky', color: '#6fb7ff', icon: I('M2.5 12.5l8-2 6-7 2 1-3 7 5 1.5 1-1 1 1-1 3-3-1-2 1-1-1 1-1.5-6-1.5-6 2z'),
    layers: ['flights', 'military', 'emergency', 'satStations', 'satellites', 'launches', 'aurora', 'daynight'] },
  { id: 'storm', name: 'Storm', color: '#ffb020', icon: I('M7 15a5 5 0 1 1 9.6-2A3.5 3.5 0 1 1 17 20H8a4 4 0 0 1-1-5zM12 13l-2 4h3l-2 4'),
    layers: ['radar', 'alerts', 'spcReports', 'spcOutlook', 'hurricanes', 'tempGrid', 'rivers'] },
  { id: 'hazards', name: 'Hazards', color: '#ff4d5e', icon: I('M12 3l10 18H2L12 3zM12 10v5M12 18v.01'),
    layers: ['earthquakes', 'events', 'firePerimeters', 'fireIncidents', 'firms', 'volcanoes', 'rivers', 'alerts', 'airQuality'] },
  { id: 'roads', name: 'Roads', color: '#ff9a4d', icon: I('M8 3L4 21M16 3l4 18M12 4v3M12 10v3M12 16v4'),
    layers: ['ga511Cameras', 'ga511Events', 'caltrans', 'alpr', 'amtrak', 'bikeshare', 'alerts'] },
  { id: 'night', name: 'Night', color: '#b18cff', icon: I('M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'),
    layers: ['gibsNight', 'satStations', 'satellites', 'aurora', 'daynight', 'launches'] },
  { id: 'everything', name: 'Everything', color: '#e8edf2', icon: I('M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5'), layers: '*' },
  { id: 'custom', name: 'My mix', color: '#8b97a5', icon: I('M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5'), layers: 'custom' },
];

// Group colours, used in the full layer list.
export const GROUP_COLORS = { air: '#6fc8ff', space: '#b18cff', sea: '#2fd4c0', weather: '#ffb547', hazards: '#ff5470', ground: '#ff9a4d', signals: '#ff7ad9' };

// Which layer ids a mode turns on (only layers that exist and have their key).
// Layers whose only source is unreliable stay out of every mode (you can still
// turn them on by hand in "All layers"). None since v6.1: plate readers now load
// from the weekly data pack.
export const UNRELIABLE = new Set([]);

export function modeLayers(mode, layers, settings, apiKeys) {
  const have = (l) => !l.needsKey || apiKeys.get(l.needsKey);
  if (mode.layers === '*') return layers.filter((l) => have(l) && !UNRELIABLE.has(l.id)).map((l) => l.id);
  if (mode.layers === 'custom') {
    const c = settings.get('customEnabled') || settings.get('enabled') || {};
    return layers.filter((l) => c[l.id] && have(l)).map((l) => l.id);
  }
  const ids = new Set(mode.layers);
  return layers.filter((l) => ids.has(l.id) && have(l)).map((l) => l.id);
}

// Layers are switched on a quarter-second apart so they do not all fetch at
// once. Every switch goes through here, so a newer action (a mode, Reset, All
// off, Undo) cancels switch-ons still waiting from an older one.
let pending = [];
export function cancelPending() { pending.forEach(clearTimeout); pending = []; }
export function staggerOn(manager, ids, step = 250) {
  ids.filter((id) => manager.state[id] && !manager.state[id].enabled)
    .forEach((id, i) => pending.push(setTimeout(() => manager.enable(id, true), i * step)));
}

// Switch layers: turn off what the mode does not use, then turn on the rest.
export function applyMode(manager, layers, settings, apiKeys, id) {
  const mode = MODES.find((m) => m.id === id) || MODES[0];
  const want = new Set(modeLayers(mode, layers, settings, apiKeys));
  if (mode.id !== 'custom' && settings.get('mode') === 'custom') settings.set('customEnabled', { ...settings.get('enabled') });
  cancelPending();
  for (const l of layers) if (!want.has(l.id) && manager.state[l.id].enabled) manager.enable(l.id, false);
  staggerOn(manager, [...want]);
  settings.set('mode', mode.id);
  return mode;
}

// ---------------------------------------------------------------- reset
// "Reset" puts the layers back to how GodView starts (the Around me set).
// "All off" clears the map. Both can be undone from the message that follows.
export const START_MODE = 'around';

export function snapshot(manager, layers, settings) {
  return { mode: settings.get('mode') || 'custom', on: layers.filter((l) => manager.state[l.id].enabled).map((l) => l.id) };
}
export function restore(manager, layers, settings, snap) {
  cancelPending();
  const want = new Set(snap.on);
  for (const l of layers) if (!want.has(l.id) && manager.state[l.id].enabled) manager.enable(l.id, false);
  staggerOn(manager, snap.on);
  settings.set('mode', snap.mode);
}
export function resetLayers(manager, layers, settings, apiKeys) {
  return applyMode(manager, layers, settings, apiKeys, START_MODE);
}
export function allOff(manager, layers, settings) {
  if (settings.get('mode') === 'custom') settings.set('customEnabled', { ...settings.get('enabled') }); // keep "My mix"
  cancelPending();
  for (const l of layers) if (manager.state[l.id].enabled) manager.enable(l.id, false);
  settings.set('mode', 'none'); // no mode tile lit
}
// True when exactly the starting layers are on.
export function atStart(manager, layers, settings, apiKeys) {
  const want = new Set(modeLayers(MODES.find((m) => m.id === START_MODE), layers, settings, apiKeys));
  return layers.every((l) => !!manager.state[l.id].enabled === want.has(l.id));
}
