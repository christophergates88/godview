// "EPA-regulated sites": active facilities that hold EPA air, water, waste or
// drinking-water permits near the view centre, with their inspection and
// violation history (EPA ECHO). Red = in violation now, amber = violations in
// the last 3 years, green = none. A site whose name looks like a private person
// or home is shown only as "Private site" with no name or street address.
import { ENDPOINTS } from '../config.js';
import { makePointLayer } from './lib/point-layer.js';
import { recordName } from './lib/privacy.js';
import { money, titleCase, addProbe } from './lib/people.js';

const icon = '<svg viewBox="0 0 24 24"><path d="M3 21V11l5 3V11l5 3V7l8 4v10zM7 18h2M12 18h2M17 18h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PROG = [['AIRFlag', 'Air'], ['NPDESFlag', 'Water discharge'], ['RCRAFlag', 'Hazardous waste'], ['SDWISFlag', 'Drinking water'], ['TRIFlag', 'Toxics release report']];
const yes = (v) => v === 'Y' || v === true;
const n = (v) => (v == null || v === '' ? null : Number(v));

export function parseEcho(j) {
  const R = (j && j.Results) || {};
  if (R.Error) throw new Error(R.Error.ErrorMessage || 'ECHO error');
  return (R.Facilities || []).map((f) => {
    const lat = Number(f.FacLat); const lon = Number(f.FacLong);
    const v = recordName(f.FacName, { mode: 'entity' });
    const qnc = n(f.FacQtrsWithNC) || 0;
    const status = String(f.FacComplianceStatus || '');
    const now = yes(f.CurrVioFlag) || yes(f.FacSNCFlg) || (/violation/i.test(status) && !/no violation/i.test(status));
    const color = now ? '#ff4d5e' : qnc > 0 ? '#ffb020' : '#3ee67a';
    const progs = PROG.filter(([k]) => yes(f[k])).map(([, l]) => l).join(', ');
    const rows = [
      ['Status', f.FacComplianceStatus || '—'],
      ['Permits', progs || '—'],
      ['Inspections (5 years)', f.FacInspectionCount != null ? String(f.FacInspectionCount) : '—'],
      ['Last inspection', f.FacDateLastInspection || '—'],
      ['Quarters with violations (of last 12)', String(qnc)],
      ['Formal enforcement actions (5 years)', f.FacFormalActionCount != null ? String(f.FacFormalActionCount) : '—'],
      ['Penalties (5 years)', n(f.FacTotalPenalties) ? money(n(f.FacTotalPenalties)) : 'None'],
    ];
    if (v.show) rows.unshift(['Address', [titleCase(f.FacStreet), titleCase(f.FacCity), f.FacState].filter(Boolean).join(', ')]);
    else rows.unshift(['Town', [titleCase(f.FacCity), f.FacState].filter(Boolean).join(', ')]);
    return {
      key: String(f.RegistryID || f.SourceID || `${lat},${lon}`), lat, lon, color,
      title: v.show ? titleCase(v.name) : 'Private site', subtitle: v.show ? 'EPA-regulated site' : `EPA-regulated site · ${v.label}`,
      rows,
      link: v.show && f.RegistryID ? { href: `https://echo.epa.gov/detailed-facility-report?fid=${encodeURIComponent(f.RegistryID)}`, text: 'EPA facility report' } : null,
    };
  });
}

export default makePointLayer({
  id: 'peopleEpa',
  name: 'EPA-regulated sites',
  group: 'people',
  color: '#ffb020',
  icon,
  shape: 'point',
  size: 7,
  heightM: 100,
  max: 500,
  view: { maxKm: 400, radiusKm: 25, minGapMs: 10000 },
  attribution: 'EPA-regulated sites: U.S. EPA Enforcement and Compliance History Online (ECHO)',
  fetch: (ctx, q) => ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleEcho, { lat: q.lat.toFixed(4), lon: q.lon.toFixed(4), mi: Math.max(1, Math.min(25, Math.round(q.radiusKm / 1.609))) }), { timeoutMs: 30000 }),
  parse: (j) => parseEcho(j),
  note: (items, j) => (j && j.Results && j.Results.ClusterOutput && !(j.Results.Facilities || []).length ? 'Too many sites here; zoom in' : 'Red: violation now · amber: in last 3 years'),
});

addProbe('EPA ECHO (Eatonton, 3 mi)', async (ctx) => parseEcho(await ctx.net.get(ctx.net.fillUrl(ENDPOINTS.peopleEcho, { lat: '33.3260', lon: '-83.3880', mi: 3 }), { timeoutMs: 30000 })).length);
