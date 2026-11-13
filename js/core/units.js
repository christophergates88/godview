// Formatting helpers. Everything is stored in metric internally
// (metres, metres/second, km) and converted only for display.

import { settings } from './settings.js';

const imp = () => settings.get('units') === 'imperial';

export const fmt = {
  altitude(m) {
    if (m == null || !Number.isFinite(m)) return '—';
    return imp() ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`;
  },
  // Large distances / orbit heights
  distanceKm(km) {
    if (km == null || !Number.isFinite(km)) return '—';
    return imp() ? `${Math.round(km * 0.621371).toLocaleString()} mi` : `${Math.round(km).toLocaleString()} km`;
  },
  depthKm(km) {
    if (km == null || !Number.isFinite(km)) return '—';
    return imp() ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`;
  },
  // Aircraft speed: knots are the aviation norm, so show both.
  airspeed(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    const kt = ms * 1.943844;
    return imp() ? `${Math.round(kt)} kt · ${Math.round(ms * 2.23694)} mph` : `${Math.round(kt)} kt · ${Math.round(ms * 3.6)} km/h`;
  },
  speedKmS(kms) {
    if (kms == null || !Number.isFinite(kms)) return '—';
    return imp() ? `${(kms * 2236.94).toLocaleString(undefined, { maximumFractionDigits: 0 })} mph` : `${(kms * 3600).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h`;
  },
  windKmh(kmh) {
    if (kmh == null || !Number.isFinite(kmh)) return '—';
    return imp() ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  },
  tempC(c) {
    if (c == null || !Number.isFinite(c)) return '—';
    return imp() ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
  },
  precipMm(mm) {
    if (mm == null || !Number.isFinite(mm)) return '—';
    return imp() ? `${(mm / 25.4).toFixed(2)} in` : `${mm.toFixed(1)} mm`;
  },
  verticalRate(ms) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    return imp() ? `${Math.round(ms * 196.85)} ft/min` : `${ms.toFixed(1)} m/s`;
  },
  heading(deg) {
    if (deg == null || !Number.isFinite(deg)) return '—';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return `${Math.round(deg)}° ${dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8]}`;
  },
  latlon(lat, lon) {
    return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  },
  time(ms) {
    if (!ms) return '—';
    return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  },
  ago(ms) {
    if (!ms) return '—';
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
  },
};

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
