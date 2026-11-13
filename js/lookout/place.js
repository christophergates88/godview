// The place the Lookout screens show: where you are, or a place you picked.
//
// Order at start: the place you picked last time (it stays until you change
// it) > your location, read quietly only if you already allowed it (the
// iPhone app asks for location again on every launch, so it is never asked
// here unprompted) > your location from last time > your first Watch place >
// GodView's start point. "Use my location" in the place picker asks for it.

import { getData, fillUrl } from './common.js';
import { settings } from '../core/settings.js';
import { ENDPOINTS } from '../config.js';

const KEY = 'godview.lookout.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...o })); } catch { /* storage blocked */ } };
export const prefs = { get: (k) => read()[k], set: (k, v) => write({ [k]: v }), clear: () => { try { localStorage.removeItem(KEY); } catch { /* */ } } };

let place = null;
const subs = new Set();
export const getPlace = () => place;
export function onPlace(fn) { subs.add(fn); return () => subs.delete(fn); }

function label() {
  const el = document.getElementById('lk-place-name');
  if (!el || !place) return;
  el.textContent = [place.name, place.state].filter(Boolean).join(', ');
  const btn = document.getElementById('lk-place');
  if (btn) btn.dataset.source = place.source || '';
}

function set(p) {
  place = { ...p, at: Date.now() };
  prefs.set('place', place);
  label();
  subs.forEach((fn) => { try { fn(place); } catch (e) { console.error(e); } });
}

// Town, county and state for a point (BigDataCloud's free client lookup: no key).
export async function describe(lat, lon) {
  const j = await getData(fillUrl(ENDPOINTS.reverseGeocode, { lat: lat.toFixed(4), lon: lon.toFixed(4) }), { timeoutMs: 8000 });
  const admin = (j.localityInfo && j.localityInfo.administrative) || [];
  const county = admin.find((a) => /county|parish|borough/i.test(a.name || '')) || admin.find((a) => a.adminLevel === 6);
  return {
    city: j.city || j.locality || '',
    state: String(j.principalSubdivisionCode || '').replace(/^US-/, ''),
    stateName: j.principalSubdivision || '',
    county: county ? county.name : '',
    country: j.countryCode || '',
  };
}

async function permState() {
  try { const p = navigator.permissions && await navigator.permissions.query({ name: 'geolocation' }); return p ? p.state : 'unknown'; } catch { return 'unknown'; }
}

function position() {
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 }));
}

// Your location. prompt=false: only if already allowed (never shows a question).
export async function useMyLocation({ prompt = true } = {}) {
  if (!('geolocation' in navigator)) throw new Error('Location is not available here');
  if (!prompt && await permState() !== 'granted') return false;
  let pos;
  try { pos = await position(); } catch (e) {
    throw new Error(e && e.code === 1 ? 'Location is turned off for GodView. On iPhone: Settings > GodView (or Safari) > Location.' : 'Could not get your location. Try again.');
  }
  const lat = pos.coords.latitude; const lon = pos.coords.longitude;
  let d = {};
  try { d = await describe(lat, lon); } catch { /* name stays generic */ }
  set({ lat, lon, ...d, name: d.city || 'Your location', source: 'gps' });
  prefs.set('lastGps', { lat, lon, ...d, at: Date.now() });
  return true;
}

export async function pick({ lat, lon, name }) {
  let d = {};
  try { d = await describe(lat, lon); } catch { /* keep the given name */ }
  set({ lat, lon, ...d, name: name || d.city || 'Chosen place', source: 'picked' });
}

export async function initPlace() {
  const saved = prefs.get('place');
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) { place = saved; label(); subs.forEach((fn) => fn(place)); }
  if (saved && saved.source === 'picked') return place;
  try { if (await useMyLocation({ prompt: false })) return place; } catch { /* fall back */ }
  if (place) return place;
  const s = settings.get('start') || {};
  let d = {};
  try { d = await describe(Number(s.lat), Number(s.lon)); } catch { /* */ }
  set({ lat: Number(s.lat), lon: Number(s.lon), ...d, name: d.city || s.name || 'Start', source: 'start' });
  return place;
}

// Once Watch is available: if all we have is GodView's start point, use your first Watch place.
export async function preferWatchPlace(listPlaces) {
  if (!place || place.source !== 'start') return;
  try {
    const p = (await listPlaces())[0];
    if (p && Number.isFinite(p.lat)) {
      let d = {};
      try { d = await describe(p.lat, p.lon); } catch { /* */ }
      set({ lat: p.lat, lon: p.lon, ...d, name: p.name || d.city, source: 'watch' });
    }
  } catch { /* not connected */ }
}
