// Who, from, to and what: aircraft details by transponder hex and callsign.
// Sources: adsbdb.com (aircraft + route) and planespotters.net (photo, with
// the photographer credit shown). Looked up only when a card opens; cached in
// memory for this visit.
//
// Privacy rule: an owner/operator is shown only when it is clearly an airline,
// company or agency, never a private person's name.

import { AIRCRAFT_INFO } from '../../config.js';

const memo = new Map();

const ORG = /\b(AIR|AIRLINES?|AIRWAYS|AVIATION|AERO|JET|JETS|CHARTER|LEASING|LEASE|CAPITAL|FINANCE|LLC|L\.L\.C|INC|CORP|CORPORATION|COMPANY|CO|LTD|LIMITED|LP|PLC|GMBH|TRUST|BANK|N\.?A\.?|UNIVERSITY|COLLEGE|SCHOOL|DEPARTMENT|DEPT|STATE|COUNTY|CITY|POLICE|SHERIFF|PATROL|GOVERNMENT|NAVY|ARMY|FORCE|GUARD|NASA|FEDERAL|SERVICES?|HOLDINGS?|GROUP|PARTNERS|ENTERPRISES|INDUSTRIES|LOGISTICS|EXPRESS|CARGO|HELICOPTERS?|MEDICAL|HOSPITAL|FOUNDATION|ASSOCIATION|CLUB)\b/i;
export function isOrganisation(name, flagCode) {
  if (!name) return false;
  if (flagCode) return true;
  return ORG.test(String(name));
}

export function shortType(manufacturer, type) {
  const t = String(type || '').split(/[-\s]/)[0];
  if (!t) return manufacturer || '';
  const m = String(manufacturer || '').split(/\s/)[0];
  return m && !t.toLowerCase().startsWith(m.toLowerCase()) ? `${m} ${t}` : t;
}

const fill = (t, p) => t.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(p[k] || ''));

export async function aircraftDetails(ctx, hex, callsign) {
  const cs = String(callsign || '').trim();
  const key = `${hex}|${cs}`;
  if (memo.has(key)) return memo.get(key);
  const out = { rows: [] };
  let a = null; let r = null;
  try {
    const j = await ctx.net.get(fill(AIRCRAFT_INFO.adsbdb, { hex, callsign: cs }), { timeoutMs: 8000 });
    a = j?.response?.aircraft || null;
    r = j?.response?.flightroute || null;
  } catch { /* unknown aircraft: try the route alone */ }
  if (!r && cs && /^[A-Z]{3}\d/.test(cs)) {
    try { r = (await ctx.net.get(fill(AIRCRAFT_INFO.adsbdbCallsign, { callsign: cs }), { timeoutMs: 8000 }))?.response?.flightroute || null; } catch { /* no route */ }
  }
  if (r) {
    out.airline = r.airline?.name || null;
    const place = (x) => x && (x.municipality || x.name);
    out.from = place(r.origin); out.to = place(r.destination);
    if (out.from && out.to) out.rows.push(['Route', `${out.from} (${r.origin.iata_code || r.origin.icao_code}) → ${out.to} (${r.destination.iata_code || r.destination.icao_code})`]);
  }
  if (a) {
    out.type = shortType(a.manufacturer, a.type);
    if (a.registration) out.rows.push(['Registration', a.registration]);
    if (isOrganisation(a.registered_owner, a.registered_owner_operator_flag_code)) out.rows.push(['Operator', a.registered_owner]);
  }
  try {
    const p = await ctx.net.get(fill(AIRCRAFT_INFO.photo, { hex }), { timeoutMs: 8000 });
    const ph = p?.photos?.[0];
    if (ph && (ph.thumbnail_large?.src || ph.thumbnail?.src)) {
      out.photo = { src: ph.thumbnail_large?.src || ph.thumbnail.src, credit: `Photo: ${ph.photographer || 'unknown'} / planespotters.net`, link: ph.link };
    }
  } catch { /* no photo */ }
  const credits = [];
  if (r && out.from && out.to) credits.push('Route: adsbdb.com (can be out of date)');
  if (out.photo) credits.push(out.photo.credit);
  out.credit = credits.join(' · ');
  memo.set(key, out);
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  return out;
}
