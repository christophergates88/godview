// GodView DATA RELAY (Cloudflare Worker). Not loaded by the app.
//
// Some public, keyless feeds do not let web pages read them directly (the
// browser "CORS" rule). This tiny worker fetches them for GodView and adds the
// header that lets the browser read the answer. It is NOT an open proxy:
//   - GET only
//   - only https URLs on the hosts in ALLOWED_HOSTS
//   - only answers pages from ALLOWED_ORIGIN
// Keep ALLOWED_HOSTS in step with RELAY_HOSTS in js/config.js.
//
// Deploy: Cloudflare dashboard > Workers & Pages > your worker > Edit code,
// paste this file, Deploy. GodView Settings > Data relay = https://<worker>.workers.dev/?url=

const ALLOWED_HOSTS = [
  // flights
  'api.adsb.lol', 'opensky-network.org', 'api.airplanes.live', 'opendata.adsb.fi',
  // added in GodView v2
  'nasstatus.faa.gov',            // FAA airport delays
  'www.ndbc.noaa.gov',            // ocean buoys
  'www.nhc.noaa.gov',             // hurricanes
  'droughtmonitor.unl.edu',       // drought map
  'www.submarinecablemap.com',    // submarine cables
  '511ga.org',                    // Georgia 511 (owner's key passes through in the URL)
  'services3.arcgis.com',         // NIFC wildfires (fallback only)
  'firms.modaps.eosdis.nasa.gov', // NASA FIRMS (fallback only)
  'overpass-api.de',              // OpenStreetMap Overpass (fallback only)
  // People & records
  'www.missingkids.org',          // NCMEC missing-children posters
  'tigerweb.geo.census.gov', 'api.census.gov', 'data.openstates.org', 'v3.openstates.org', 'api.open.fec.gov',
  'echodata.epa.gov', 'data.cms.gov', 'api.fdic.gov', 'www.fema.gov', // fallbacks only
];
const ALLOWED_ORIGIN = 'https://christophergates88.github.io';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });
    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
      return new Response('Host not allowed', { status: 403, headers: cors });
    }
    const upstream = await fetch(url.toString(), { headers: { 'User-Agent': 'GodView personal relay' }, cf: { cacheTtl: 10 } });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'max-age=10' },
    });
  },
};
