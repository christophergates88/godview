// OPTIONAL. Not part of the app and not needed for anything except live flights.
//
// Free flight-data sources do not let web pages call them directly (the browser
// "CORS" rule). This tiny Cloudflare Worker (free plan is enough) fetches the
// data for GodView and adds the header that lets the browser read it.
//
// Deploy: Cloudflare dashboard > Workers & Pages > Create > "Hello World" worker,
// replace its code with this file, Deploy. Then in GodView Settings, set
// "Relay URL" to:  https://<your-worker>.workers.dev/?url=
//
// It only forwards to the flight hosts listed below, so it cannot be abused as
// a general proxy. Put your GitHub Pages address in ALLOWED_ORIGIN.

const ALLOWED_HOSTS = ['opensky-network.org', 'api.airplanes.live'];
const ALLOWED_ORIGIN = 'https://YOUR-USERNAME.github.io';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
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
