// Settings saved in this browser only (localStorage). Every access is wrapped
// in try/catch because private browsing or a full disk can make storage fail.

import { DEFAULT_START, INTERVALS } from '../config.js';

const KEY = 'godview.settings.v1';
const KEYS_KEY = 'godview.apikeys.v1';

const defaults = () => ({
  units: 'imperial',          // 'imperial' or 'metric'
  basemap: 'satellite',
  viewStyle: 'normal',
  start: { ...DEFAULT_START },
  intervals: Object.fromEntries(Object.entries(INTERVALS).map(([k, v]) => [k, v.def])),
  enabled: { flights: true, satellites: true, earthquakes: true, events: true, radar: false, alerts: false },
  satGroup: 'visual',
  quakeFeed: '2.5_day',
  eventDays: 30,
  smoothMotion: true,
  flightRelay: 'https://godview-flights.christophergates-cg.workers.dev/?url=',  // the owner's Cloudflare relay (extras/flight-relay-worker.js)
});

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

let state = merge(defaults(), read(KEY) || {});
const listeners = new Set();

function merge(base, saved) {
  const out = { ...base, ...saved };
  if (!out.flightRelay) out.flightRelay = base.flightRelay; // a blank saved value falls back to the built-in relay
  for (const k of ['start', 'intervals', 'enabled']) out[k] = { ...base[k], ...(saved[k] || {}) };
  return out;
}

export const settings = {
  get: (k) => state[k],
  all: () => state,
  set(k, v) {
    state = { ...state, [k]: v };
    const ok = write(KEY, state);
    listeners.forEach((fn) => fn(k, v));
    return ok;
  },
  setIn(group, k, v) { this.set(group, { ...state[group], [k]: v }); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset() {
    state = defaults();
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    listeners.forEach((fn) => fn('*'));
  },
  interval(layerId) {
    const lim = INTERVALS[layerId];
    const v = Number(state.intervals[layerId]);
    if (!lim) return v || 0;
    return Math.max(lim.min, Number.isFinite(v) && v > 0 ? v : lim.def);
  },
};

// Optional API keys for future layers. Stored only in this browser.
export const apiKeys = {
  all: () => read(KEYS_KEY) || {},
  get: (name) => (read(KEYS_KEY) || {})[name] || '',
  set(name, value) {
    const all = read(KEYS_KEY) || {};
    if (value) all[name] = value; else delete all[name];
    return write(KEYS_KEY, all);
  },
  clear() { try { localStorage.removeItem(KEYS_KEY); } catch { /* ignore */ } },
};
