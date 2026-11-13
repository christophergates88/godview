// Modes: one tap switches the whole set of layers for a purpose.
// "My mix" restores whatever you last switched on by hand.
// To change what a mode shows, edit its `layers` list (layer ids from layers/index.js).

const I = (d) => `<svg viewBox="0 0 24 24"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const MODES = [
  { id: 'around', name: 'Around me', color: '#3ee6c4', fly: true, icon: I('M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'),
    layers: ['flights', 'alerts', 'radar', 'earthquakes', 'fireIncidents', 'rivers', 'satStations', 'daynight', 'ga511Events'] },
  { id: 'sky', name: 'Sky', color: '#6fb7ff', icon: I('M2.5 12.5l8-2 6-7 2 1-3 7 5 1.5 1-1 1 1-1 3-3-1-2 1-1-1 1-1.5-6-1.5-6 2z'),
    layers: ['flights', 'military', 'emergency', 'satStations', 'satellites', 'launches', 'aurora', 'daynight'] },
  { id: 'storm', name: 'Storm', color: '#ffb020', icon: I('M7 15a5 5 0 1 1 9.6-2A3.5 3.5 0 1 1 17 20H8a4 4 0 0 1-1-5zM12 13l-2 4h3l-2 4'),
    layers: ['radar', 'alerts', 'spcReports', 'spcOutlook', 'hurricanes', 'tempGrid', 'rivers'] },
  { id: 'hazards', name: 'Hazards', color: '#ff4d5e', icon: I('M12 3l10 18H2L12 3zM12 10v5M12 18v.01'),
    layers: ['earthquakes', 'events', 'firePerimeters', 'fireIncidents', 'firms', 'volcanoes', 'rivers', 'alerts', 'airQuality'] },
  { id: 'roads', name: 'Roads', color: '#c6ff4a', icon: I('M8 3L4 21M16 3l4 18M12 4v3M12 10v3M12 16v4'),
    layers: ['ga511Cameras', 'ga511Events', 'caltrans', 'amtrak', 'bikeshare', 'alerts'] },
  { id: 'night', name: 'Night', color: '#b18cff', icon: I('M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'),
    layers: ['gibsNight', 'satStations', 'satellites', 'aurora', 'daynight', 'launches'] },
  { id: 'everything', name: 'Everything', color: '#e8edf2', icon: I('M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5'), layers: '*' },
  { id: 'custom', name: 'My mix', color: '#8b97a5', icon: I('M4 7h10M18 7h2M4 17h2M10 17h10M16 4.5v5M8 14.5v5'), layers: 'custom' },
];

// Group colours, used in the full layer list.
export const GROUP_COLORS = { air: '#6fb7ff', space: '#b18cff', sea: '#3ee6c4', weather: '#ffb020', hazards: '#ff4d5e', ground: '#c6ff4a', signals: '#ff7ad9' };

// Which layer ids a mode turns on (only layers that exist and have their key).
export function modeLayers(mode, layers, settings, apiKeys) {
  const have = (l) => !l.needsKey || apiKeys.get(l.needsKey);
  if (mode.layers === '*') return layers.filter(have).map((l) => l.id);
  if (mode.layers === 'custom') {
    const c = settings.get('customEnabled') || settings.get('enabled') || {};
    return layers.filter((l) => c[l.id] && have(l)).map((l) => l.id);
  }
  const ids = new Set(mode.layers);
  return layers.filter((l) => ids.has(l.id) && have(l)).map((l) => l.id);
}

// Switch layers: turn off what the mode does not use, then turn on the rest a
// quarter-second apart so they do not all fetch at once.
export function applyMode(manager, layers, settings, apiKeys, id) {
  const mode = MODES.find((m) => m.id === id) || MODES[0];
  const want = new Set(modeLayers(mode, layers, settings, apiKeys));
  if (mode.id !== 'custom' && settings.get('mode') === 'custom') settings.set('customEnabled', { ...settings.get('enabled') });
  for (const l of layers) if (!want.has(l.id) && manager.state[l.id].enabled) manager.enable(l.id, false);
  [...want].filter((idx) => !manager.state[idx].enabled).forEach((idx, i) => setTimeout(() => manager.enable(idx, true), i * 250));
  settings.set('mode', mode.id);
  return mode;
}
