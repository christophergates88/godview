// Small network helpers: timeouts, readable error messages, and a tiny cache.

import { NET } from '../config.js';

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

export async function fetchJSON(url, { timeoutMs = NET.timeoutMs, headers } = {}) {
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
    return await res.json();
  } catch {
    throw new FeedError('Bad data from provider');
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
