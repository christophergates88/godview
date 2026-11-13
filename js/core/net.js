// Small network helpers: timeouts, readable error messages, and a tiny cache.

import { NET, RELAY_HOSTS } from '../config.js';
import { settings } from './settings.js';

export class FeedError extends Error {
  constructor(message, { status = 0, retryAfter = 0, kind = 'error' } = {}) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter; // seconds
    this.kind = kind; // 'error' | 'ratelimit' | 'blocked' | 'timeout'
  }
}

export function fillUrl(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(params[k] ?? ''));
}

export async function fetchJSON(url, opts = {}) {
  return fetchRaw(url, { ...opts, type: 'json' });
}

export async function fetchText(url, opts = {}) {
  return fetchRaw(url, { ...opts, type: 'text' });
}

async function fetchRaw(url, { timeoutMs = NET.timeoutMs, headers, type = 'json' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers, cache: 'no-store' });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new FeedError('Timed out', { kind: 'timeout' });
    // A TypeError here usually means the browser blocked it (CORS) or we are offline.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new FeedError(offline ? 'Offline' : 'Blocked by browser or unreachable', { kind: 'blocked' });
  }
  clearTimeout(timer);
  if (res.status === 429) {
    const ra = Number(res.headers.get('Retry-After')) || 0;
    throw new FeedError('Rate limited by provider', { status: 429, retryAfter: ra, kind: 'ratelimit' });
  }
  if (!res.ok) throw new FeedError(`Provider error ${res.status}`, { status: res.status });
  try {
    return type === 'text' ? await res.text() : await res.json();
  } catch {
    throw new FeedError('Bad data from provider');
  }
}

// ---- Data relay ----
// Some public feeds do not allow web pages to read them (CORS). For hosts listed
// in config RELAY_HOSTS the request can go through the user's own relay
// (Settings > Data relay), which only forwards to an allow-list of hosts.
export function relayUrl(url) {
  const relay = (settings.get('dataRelay') || '').trim();
  if (!relay) return null;
  return relay.includes('{url}') ? relay.replace('{url}', encodeURIComponent(url)) : relay + encodeURIComponent(url);
}

export function relayMode(url) {
  try { return RELAY_HOSTS[new URL(url).hostname] || null; } catch { return null; }
}

// get(url, { type: 'json'|'text' }) -> { data, via: 'direct'|'relay' }
// Picks direct or relay automatically from RELAY_HOSTS.
export async function get(url, opts = {}) {
  const mode = relayMode(url);
  const r = mode ? relayUrl(url) : null;
  if (mode === 'only') {
    if (!r) throw new FeedError('Needs the data relay (Settings > Data relay)', { kind: 'blocked' });
    return { data: await fetchRaw(r, opts), via: 'relay' };
  }
  try {
    return { data: await fetchRaw(url, opts), via: 'direct' };
  } catch (e) {
    if (mode === 'fallback' && r && e.kind === 'blocked') return { data: await fetchRaw(r, opts), via: 'relay' };
    throw e;
  }
}

// Cache in localStorage with an age limit (falls back to memory if storage fails).
const mem = new Map();
export const cache = {
  get(key, maxAgeSec) {
    let rec = mem.get(key);
    if (!rec) { try { rec = JSON.parse(localStorage.getItem('godview.cache.' + key) || 'null'); } catch { rec = null; } }
    if (!rec) return null;
    if (maxAgeSec && (Date.now() - rec.t) / 1000 > maxAgeSec) return null;
    return rec;
  },
  set(key, data) {
    const rec = { t: Date.now(), data };
    mem.set(key, rec);
    try { localStorage.setItem('godview.cache.' + key, JSON.stringify(rec)); } catch { /* too big or blocked: memory only */ }
    return rec;
  },
};
