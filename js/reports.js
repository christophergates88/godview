// Conditions reports in the app: what verifiably happened at a place in a time
// window, as a clean one-page document you can print, save as PDF or share.
// The same code that runs in the Watch service builds it (server/watch/worker.js),
// so a report made here and one made by the service match line for line.
// With the Watch service connected, reports are also stored there so their
// SHA-256 fingerprint can be checked later.

import { buildReport, canonical, sha256Hex } from '../server/watch/worker.js';
import { REPORT_SOURCES } from './config.js';
import { relayUrl, relayMode } from './core/net.js';
import { escapeHtml } from './core/units.js';
import { crumb } from './core/crashlog.js';

const $ = (id) => document.getElementById(id);
let preset = null; // { lat, lon, name } from What's here

export function presetPoint(p) { preset = p; }

// Browser fetch for the shared report code: no custom User-Agent (that would
// force a pre-flight), and through the data relay for hosts that need it.
async function browserFetch(url, init = {}) {
  const headers = { ...(init.headers || {}) };
  delete headers['User-Agent'];
  delete headers.Accept;
  try {
    return await fetch(url, { ...init, headers });
  } catch (e) {
    const r = relayMode(url) ? relayUrl(url) : null;
    if (r) return fetch(r, { ...init, headers });
    throw e;
  }
}

export async function localReport(params) {
  const ctx = { now: new Date(), fetch: browserFetch, test: true, sub: 0, budget: 40, memo: new Map(), settings: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' }, state: {} };
  return buildReport(ctx, params);
}

// Self-test rows for the report sources (Macon, last 24 hours).
export async function reportSourcesTest() {
  const t0 = performance.now();
  try {
    const now = Date.now();
    const r = await localReport({ lat: 32.84, lon: -83.63, name: 'Macon (self-test)', start: new Date(now - 86400e3).toISOString(), end: new Date(now).toISOString() });
    return r.report.sources.map((s) => ({ id: `report:${s.name.split(' (')[0]}`, name: s.name, ok: s.ok, count: s.ok ? r.report.items.length : null, ms: Math.round(performance.now() - t0), via: 'direct', error: s.error || null }));
  } catch (e) {
    return [{ id: 'report', name: 'Conditions report', ok: false, count: null, ms: Math.round(performance.now() - t0), via: null, error: e.message }];
  }
}
void REPORT_SOURCES;

const toLocalInput = (ms) => { const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

// The Reports tab. api/places come from the Watch screen when connected.
export function renderReportsTab(box, { connected, api, places, toast }) {
  const now = Date.now();
  const opts = [
    ...(preset ? [{ v: 'preset', t: preset.name || 'The point you chose' }] : []),
    ...(places || []).map((p) => ({ v: `place:${p.id}`, t: p.name })),
    { v: 'view', t: 'Map centre' },
  ];
  box.innerHTML = `
    <div class="w-form">
      <h3>Conditions report</h3>
      <p class="muted small">What the weather and hazard records show for one spot and time. Every line names its source. Print it or save it as a PDF.</p>
      <select id="rp-where">${opts.map((o) => `<option value="${escapeHtml(o.v)}">${escapeHtml(o.t)}</option>`).join('')}</select>
      <label class="w-range">From<input id="rp-start" type="datetime-local" value="${toLocalInput(now - 86400e3)}"></label>
      <label class="w-range">To<input id="rp-end" type="datetime-local" value="${toLocalInput(now)}"></label>
      <div class="seg" id="rp-r"><button data-r="8">5 mi</button><button data-r="16" class="on">10 mi</button><button data-r="32">20 mi</button></div>
      <button class="btn primary" id="rp-go">Make report</button>
      <div id="rp-status" class="muted small"></div>
      ${connected ? '<h4 class="sec-title">Saved reports</h4><div id="rp-list" class="events"><p class="muted">Loading…</p></div>' : '<p class="muted small">Connect the Watch service to save reports and check them later by fingerprint.</p>'}
    </div>`;
  let r = 16;
  for (const b of box.querySelectorAll('#rp-r button')) b.addEventListener('click', () => { r = Number(b.dataset.r); box.querySelectorAll('#rp-r button').forEach((x) => x.classList.toggle('on', x === b)); });
  $('rp-go').addEventListener('click', async () => {
    const sel = $('rp-where').value;
    let pt;
    if (sel === 'preset' && preset) pt = preset;
    else if (sel.startsWith('place:')) pt = (places || []).find((p) => p.id === sel.slice(6));
    else { const v = window.GodView.globe.getView(); pt = { lat: v.lat, lon: v.lon, name: 'Map centre' }; }
    const s0 = new Date($('rp-start').value); const e0 = new Date($('rp-end').value);
    if (!Number.isFinite(s0.getTime()) || !Number.isFinite(e0.getTime()) || e0 <= s0) { $('rp-status').textContent = 'Pick a start and an end time (the end after the start).'; return; }
    const start = s0.toISOString();
    const end = e0.toISOString();
    $('rp-status').textContent = 'Gathering records…';
    crumb(`report: making (${connected ? 'Watch' : 'here'})`);
    try {
      let out;
      if (connected) {
        const q = new URLSearchParams({ start, end, r: String(r), ...(sel.startsWith('place:') ? { place: sel.slice(6) } : { lat: pt.lat.toFixed(5), lon: pt.lon.toFixed(5), name: pt.name || '' }) });
        out = await api(`/report?${q}`, { timeoutMs: 60000 });
      } else {
        out = await localReport({ lat: pt.lat, lon: pt.lon, name: pt.name, start, end, radiusKm: r });
      }
      $('rp-status').textContent = '';
      openReport(out);
    } catch (e) { $('rp-status').textContent = `Could not make the report: ${e.message}`; }
  });
  if (connected) {
    api('/reports').then((j) => {
      const list = j.reports || [];
      $('rp-list').innerHTML = list.length ? list.slice(0, 30).map((x) => `<button class="w-pick" data-h="${x.sha256}"><b>${escapeHtml(x.name)}</b><br><span class="muted small">${escapeHtml(new Date(x.start).toLocaleString())} – ${escapeHtml(new Date(x.end).toLocaleString())}</span></button>`).join('') : '<p class="muted">None yet.</p>';
      for (const b of box.querySelectorAll('[data-h]')) {
        b.addEventListener('click', async () => {
          try { const v = await api(`/report/${b.dataset.h}`); openReport({ report: v.report, json: v.json, sha256: v.sha256, stored: true, verified: v.verified }); } catch (e) { toast(`Could not open: ${e.message}`); }
        });
      }
    }).catch(() => { $('rp-list').innerHTML = '<p class="muted">Could not load saved reports.</p>'; });
  }
}

const KIND = { official: 'Official', reported: 'Reported', measured: 'Measured', estimated: 'Estimated' };
const SECTIONS = [['warnings', 'Warnings in effect at this point'], ['reports', 'Storm reports nearby'], ['rain', 'Rainfall'], ['quakes', 'Earthquakes within 300 km'], ['fires', 'Wildfires'], ['rivers', 'Rivers']];

export async function openReport(out) {
  crumb('report: shown');
  const { report } = out;
  const recheck = await sha256Hex(canonical(report));
  const ok = recheck === out.sha256;
  const tz = report.window.timeZone;
  const t = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const s = report.summary;
  const tiles = [
    ['Warnings at this point', String(s.warnings)],
    ['Largest hail reported', s.maxReportedHailIn ? `${s.maxReportedHailIn} in` : 'none'],
    ['Largest hail warned', s.maxWarnedHailIn ? `${s.maxWarnedHailIn} in` : 'none'],
    ['Strongest wind reported', s.maxReportedWindMph ? `${s.maxReportedWindMph} mph` : 'none'],
  ];
  const el = $('report');
  el.innerHTML = `
    <div class="rp-bar no-print">
      <button class="btn primary" id="rp-print">Print / PDF</button>
      <button class="btn" id="rp-share">Share</button>
      <button class="btn" id="rp-json">JSON</button>
      <button class="btn" id="rp-close">Close</button>
    </div>
    <article class="paper">
      <header>
        <div class="rp-brand">GODVIEW · CONDITIONS REPORT</div>
        <h1>${escapeHtml(report.subject.name)}</h1>
        <div class="rp-meta">${report.subject.lat.toFixed(5)}, ${report.subject.lon.toFixed(5)} · within ${Math.round(report.subject.radiusKm * 0.621)} mi<br>
        ${escapeHtml(t(report.window.start))} to ${escapeHtml(t(report.window.end))}</div>
      </header>
      <section class="rp-tiles">${tiles.map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join('')}</section>
      ${SECTIONS.map(([id, name]) => {
        const rows = report.items.filter((i) => i.section === id);
        if (!rows.length) return '';
        return `<section><h2>${escapeHtml(name)}</h2><table>${rows.map((i) => `<tr><td class="k ${i.kind}">${KIND[i.kind] || i.kind}</td><td>${escapeHtml(i.text)}<div class="src">${escapeHtml(i.source)} · ${escapeHtml(t(i.time))}${i.sourceUrl ? ` · <a href="${escapeHtml(i.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(i.sourceUrl.replace(/^https:\/\//, '').slice(0, 60))}</a>` : ''}</div></td></tr>`).join('')}</table></section>`;
      }).join('')}
      ${report.items.length ? '' : '<section><h2>Findings</h2><p>No warnings, storm reports or other listed events were found for this point and time.</p></section>'}
      <section><h2>Sources checked</h2><ul class="rp-src">${report.sources.map((x) => `<li>${x.ok ? '✓' : '✗'} ${escapeHtml(x.name)}${x.ok ? '' : ` — could not be reached (${escapeHtml(x.error || '')}); this report may be incomplete`}</li>`).join('')}</ul></section>
      <section class="rp-notes">${report.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}</section>
      <footer>
        <div>Generated ${escapeHtml(t(report.generatedAt))} · schema ${escapeHtml(report.schema)}</div>
        <div class="hash">SHA-256 ${escapeHtml(out.sha256)} ${ok ? '(fingerprint checks out)' : '(FINGERPRINT DOES NOT MATCH)'}${out.stored ? ' · stored for verification' : ''}</div>
      </footer>
    </article>`;
  el.hidden = false;
  document.body.classList.add('report-open');
  $('rp-close').addEventListener('click', () => { el.hidden = true; document.body.classList.remove('report-open'); });
  $('rp-print').addEventListener('click', () => window.print());
  $('rp-json').addEventListener('click', async () => {
    const name = `conditions-report-${out.sha256.slice(0, 12)}.json`;
    // On a phone (and in the GodView app) hand the file to the share sheet (Save to Files, Mail...);
    // opening it as a download there would replace GodView with the raw file.
    try {
      const file = new File([out.json], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Conditions report (data)' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out.json], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  });
  $('rp-share').addEventListener('click', async () => {
    const text = `Conditions report: ${report.subject.name}, ${t(report.window.start)} to ${t(report.window.end)}. Warnings: ${s.warnings}; largest hail reported: ${s.maxReportedHailIn || 'none'}; strongest wind reported: ${s.maxReportedWindMph || 'none'}. SHA-256 ${out.sha256}`;
    try { if (navigator.share) await navigator.share({ title: 'Conditions report', text }); else { await navigator.clipboard.writeText(text); } } catch { /* cancelled */ }
  });
  return { verified: ok };
}
