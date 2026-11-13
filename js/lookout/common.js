// Shared helpers for the Lookout screens (Now, Cams, Scanner, News).
// These screens load before the globe, so nothing here needs CesiumJS.

import { get, FeedError, fillUrl } from '../core/net.js';
import { settings } from '../core/settings.js';
import { escapeHtml } from '../core/units.js';
import { distKm } from '../layers/lib/geo.js';

export const $ = (id) => document.getElementById(id);
export const h = escapeHtml;
export { distKm, fillUrl };

// Data only (direct, or through the data relay for hosts listed in config RELAY_HOSTS).
export const getData = async (url, opts = {}) => (await get(url, opts)).data;
// The small "ctx" the layer helpers expect (lib/ga511.js).
export const netCtx = { net: { get: getData, FeedError, fillUrl } };

export const imperial = () => settings.get('units') !== 'metric';

export function bearing(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg) => (Number.isFinite(deg) ? COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] : '');

// 2.3 mi / 14 mi (or km)
export function dist(km) {
  if (!Number.isFinite(km)) return '';
  const v = imperial() ? km * 0.621371 : km;
  const u = imperial() ? 'mi' : 'km';
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u}`;
}
// "2.3 mi NE" from a place to a point
export const away = (p, lat, lon) => `${dist(distKm(p.lat, p.lon, lat, lon))} ${compass(bearing(p.lat, p.lon, lat, lon))}`;

export function ago(t) {
  const ms = typeof t === 'number' ? t : Date.parse(t || '');
  if (!Number.isFinite(ms)) return '';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  return hr < 36 ? `${hr} h ago` : `${Math.round(hr / 24)} days ago`;
}
export const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// Remembered results so switching tabs does not refetch (key -> { t, promise }).
const memo = new Map();
export function remember(key, maxMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.t < maxMs) return hit.promise;
  const promise = fn();
  memo.set(key, { t: Date.now(), promise });
  promise.catch(() => memo.delete(key));
  return promise;
}
export function forget(prefix = '') { for (const k of [...memo.keys()]) if (k.startsWith(prefix)) memo.delete(k); }

export const ICON = {
  pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2.1"/><circle cx="12" cy="10" r="2.5" fill="currentColor"/></svg>',
  road: '<svg viewBox="0 0 24 24"><path d="M8 3L4 21M16 3l4 18M12 4v3M12 10v3M12 16v4" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  crash: '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3zM12 10v5M12 18v.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cone: '<svg viewBox="0 0 24 24"><path d="M9 3h6l4 16H5L9 3zM7 11h10M6 15h12M3 21h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="12.5" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M15.5 10.5l5-3v9l-5-3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><rect x="6.5" y="7" width="11" height="14.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M10 7V2.5M9.5 12h5M9.5 15.5h5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-2-2-2-4-2 2-3 5-3 9 0 4 3 7 7 7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  news: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5.5" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M5 16h14M6.5 16l1.5-6h8l1.5 6M5 16v3M19 16v3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="16.5" r="1.2" fill="currentColor"/><circle cx="16" cy="16.5" r="1.2" fill="currentColor"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3z M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"/></svg>',
  plane: '<svg viewBox="0 0 24 24"><path d="M2.5 12.5l8-2 6-7 2 1-3 7 5 1.5 1-1 1 1-1 3-3-1-2 1-1-1 1-1.5-6-1.5-6 2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  water: '<svg viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" fill="none" stroke="currentColor" stroke-width="2.1"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/></svg>',
};

// One tappable row. With href it opens the site (in Safari from the iPhone app).
export function row({ icon = 'pin', title, sub = '', href = '', right = '', cls = '', data = {} }) {
  const attrs = Object.entries(data).map(([k, v]) => ` data-${k}="${h(v)}"`).join('');
  const inner = `<span class="ic">${ICON[icon] || ''}</span><span class="t"><b>${h(title)}</b>${sub ? `<small>${h(sub)}</small>` : ''}</span>${right ? `<span class="km">${h(right)}</span>` : ''}${href ? '<span class="go">↗</span>' : ''}`;
  return href
    ? `<a class="lk-row ${cls}" href="${h(href)}" target="_blank" rel="noopener"${attrs}>${inner}</a>`
    : `<button class="lk-row ${cls}" type="button"${attrs}>${inner}</button>`;
}

export const section = (title, extra = '') => `<div class="lk-sec"><h2>${h(title)}</h2>${extra}</div>`;

// US state codes -> names (links, news, scanner)
export const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
