// Sample responses for the test harness. Hand-made to match each provider's
// documented response format (field names and structure). NOT real data.
// Times are generated relative to "now" so the app treats them as current.

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

export const usgs = () => ({
  type: 'FeatureCollection',
  metadata: { generated: now, title: 'USGS Magnitude 2.5+ Earthquakes, Past Day', status: 200, count: 3 },
  features: [
    { type: 'Feature', id: 'us7000test1', properties: { mag: 4.6, place: '12 km SW of Sampletown, Georgia', time: now - 20 * 60e3, updated: now, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test1', felt: 31, alert: 'green', status: 'reviewed', tsunami: 0, magType: 'mb', type: 'earthquake' }, geometry: { type: 'Point', coordinates: [-83.6, 33.3, 8.2] } },
    { type: 'Feature', id: 'ak0000test2', properties: { mag: 2.9, place: '40 km N of Example, Alaska', time: now - 5 * 3600e3, url: 'https://earthquake.usgs.gov/', status: 'automatic', tsunami: 0, magType: 'ml' }, geometry: { type: 'Point', coordinates: [-150.1, 61.9, 35.0] } },
    { type: 'Feature', id: 'us7000test3', properties: { mag: 6.1, place: 'Off the coast of Testland', time: now - 30 * 3600e3, url: 'https://earthquake.usgs.gov/', status: 'reviewed', tsunami: 1, magType: 'mww' }, geometry: { type: 'Point', coordinates: [142.3, 38.1, 24.0] } },
  ],
});

// CelesTrak OMM JSON (FORMAT=JSON). EPOCH has no "Z", like the real feed.
const epoch = iso(now - 3 * 3600e3).replace('Z', '').replace(/\.(\d{3})$/, '.$1000');
const omm = (name, id, objId, mm, inc, raan, ecc, argp, ma, bstar) => ({
  OBJECT_NAME: name, OBJECT_ID: objId, EPOCH: epoch, MEAN_MOTION: mm, ECCENTRICITY: ecc, INCLINATION: inc,
  RA_OF_ASC_NODE: raan, ARG_OF_PERICENTER: argp, MEAN_ANOMALY: ma, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: id, ELEMENT_SET_NO: 999, REV_AT_EPOCH: 50000, BSTAR: bstar, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0,
});
export const celestrak = () => [
  omm('ISS (ZARYA)', 25544, '1998-067A', 15.50103472, 51.6393, 120.5, 0.0004964, 85.3, 274.9, 0.00021),
  omm('HST', 20580, '1990-037B', 15.29, 28.47, 200.1, 0.00023, 40.0, 320.0, 0.00003),
  omm('NOAA 19', 33591, '2009-005A', 14.1288, 99.19, 150.0, 0.0013, 100.0, 260.0, 0.00009),
  omm('GPS BIIR-2  (PRN 13)', 24876, '1997-035A', 2.00563, 55.6, 60.0, 0.0048, 50.0, 310.0, 0),
];

export const eonet = () => ({
  title: 'EONET Events',
  events: [
    { id: 'EONET_9001', title: 'Sample Wildfire, Georgia', description: null, link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_9001', closed: null,
      categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [{ id: 'IRWIN', url: 'https://irwin.doi.gov/observer/' }],
      geometry: [{ magnitudeValue: 1200, magnitudeUnit: 'acres', date: iso(now - 2 * 86400e3), type: 'Point', coordinates: [-83.2, 33.8] },
        { magnitudeValue: 1500, magnitudeUnit: 'acres', date: iso(now - 86400e3), type: 'Point', coordinates: [-83.21, 33.81] }] },
    { id: 'EONET_9002', title: 'Tropical Storm Sample', description: null, link: 'https://eonet.gsfc.nasa.gov/', closed: null,
      categories: [{ id: 'severeStorms', title: 'Severe Storms' }], sources: [{ id: 'JTWC', url: 'https://www.metoc.navy.mil/jtwc/jtwc.html' }],
      geometry: [{ magnitudeValue: 45, magnitudeUnit: 'kts', date: iso(now - 6 * 3600e3), type: 'Point', coordinates: [-70.5, 25.2] }] },
    { id: 'EONET_9003', title: 'Sample Volcano', description: null, link: 'https://eonet.gsfc.nasa.gov/', closed: null,
      categories: [{ id: 'volcanoes', title: 'Volcanoes' }], sources: [{ id: 'SIVolcano', url: 'https://volcano.si.edu/' }],
      geometry: [{ magnitudeValue: null, magnitudeUnit: null, date: iso(now - 10 * 86400e3), type: 'Polygon', coordinates: [[[14.9, 37.7], [15.1, 37.7], [15.1, 37.8], [14.9, 37.8], [14.9, 37.7]]] }] },
  ],
});

export const nws = () => ({
  type: 'FeatureCollection',
  title: 'Current watches, warnings, and advisories',
  features: [
    { id: 'https://api.weather.gov/alerts/urn:oid:test.1', type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[-84.0, 33.0], [-83.0, 33.0], [-83.0, 33.6], [-84.0, 33.6], [-84.0, 33.0]]] },
      properties: { id: 'urn:oid:test.1', areaDesc: 'Putnam; Baldwin', sent: iso(now), effective: iso(now - 3600e3), onset: iso(now - 3600e3), expires: iso(now + 3 * 3600e3), ends: iso(now + 3 * 3600e3), status: 'Actual', messageType: 'Alert', severity: 'Severe', certainty: 'Observed', urgency: 'Immediate', event: 'Severe Thunderstorm Warning', senderName: 'NWS Peachtree City GA', headline: 'Severe Thunderstorm Warning issued (sample)', description: 'SAMPLE TEXT. At 405 PM EST, a severe thunderstorm was located ...' } },
    { id: 'https://api.weather.gov/alerts/urn:oid:test.2', type: 'Feature', geometry: null,
      properties: { id: 'urn:oid:test.2', areaDesc: 'Coastal zone sample', effective: iso(now), expires: iso(now + 86400e3), severity: 'Minor', certainty: 'Likely', urgency: 'Expected', event: 'Small Craft Advisory', senderName: 'NWS Sample', headline: 'Sample advisory' } },
  ],
});

export const rainviewer = () => {
  const t = Math.floor(now / 600000) * 600;
  return {
    version: '2.0', generated: Math.floor(now / 1000), host: 'https://tilecache.rainviewer.com',
    radar: { past: [{ time: t - 600, path: `/v2/radar/${t - 600}` }, { time: t, path: `/v2/radar/${t}` }], nowcast: [] },
    satellite: { infrared: [] },
  };
};

export const openMeteo = () => ({
  latitude: 32.75, longitude: -83.45, timezone: 'America/New_York',
  current: { time: '2026-11-12T16:00', interval: 900, temperature_2m: 18.4, relative_humidity_2m: 61, apparent_temperature: 17.9, precipitation: 0.0, weather_code: 2, wind_speed_10m: 12.3, wind_direction_10m: 225, wind_gusts_10m: 25.1, cloud_cover: 40 },
});

export const geocode = () => ({
  results: [
    { id: 4180439, name: 'Atlanta', latitude: 33.749, longitude: -84.38798, feature_code: 'PPLA', country_code: 'US', country: 'United States', admin1: 'Georgia', population: 498715 },
  ],
});

export const nominatim = () => ([
  { place_id: 1, lat: '33.3240', lon: '-83.3880', display_name: '103 Example St, Sampleville, Putnam County, Georgia, 31024, United States', boundingbox: ['33.3239', '33.3241', '-83.3881', '-83.3879'], name: '103 Example St' },
]);

// OpenSky /states/all format: arrays in fixed field order.
export const opensky = () => ({
  time: Math.floor(now / 1000),
  states: [
    ['a1b2c3', 'DAL1234 ', 'United States', Math.floor(now / 1000) - 5, Math.floor(now / 1000) - 2, -83.9, 33.2, 10668, false, 230.5, 45.0, 0.0, null, 10900, '2241', false, 0, 0],
    ['a4d5e6', 'N123AB  ', 'United States', Math.floor(now / 1000) - 8, Math.floor(now / 1000) - 3, -83.3, 32.9, 1524, false, 72.0, 270.0, -3.2, null, 1600, null, false, 0, 0],
    ['abcdef', 'SWA77   ', 'United States', Math.floor(now / 1000) - 4, Math.floor(now / 1000) - 1, -84.43, 33.64, null, true, 5.0, 90.0, null, null, null, null, false, 0, 0],
  ],
});

// airplanes.live /v2/point format (readsb style; altitudes in feet, speed in knots).
export const airplaneslive = () => ({
  ac: [
    { hex: 'a1b2c3', flight: 'DAL1234 ', r: 'N123DL', t: 'A321', desc: 'AIRBUS A-321', alt_baro: 35000, alt_geom: 35600, gs: 448.1, track: 45.2, baro_rate: 0, squawk: '2241', lat: 33.2, lon: -83.9, seen_pos: 1.2, seen: 0.5 },
    { hex: 'abcdef', flight: 'SWA77   ', r: 'N8000S', t: 'B38M', alt_baro: 'ground', gs: 10, track: 90, lat: 33.64, lon: -84.43, seen_pos: 3 },
  ],
  msg: 'No error', now: now, total: 2, ctime: now, ptime: 3,
});
