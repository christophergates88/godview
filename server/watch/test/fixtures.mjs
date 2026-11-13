// Sample responses for the watch worker tests, hand-made in each source's
// documented format. NOT live data. Places are public landmarks only.

export const PLACES = [
  { id: 'home', name: 'Test Home', lat: 33.8053, lon: -84.1455, radiusKm: 40, kind: 'home' },      // Stone Mountain Park (public)
  { id: 'mom', name: 'Test Family', lat: 32.0809, lon: -81.0912, radiusKm: 30, kind: 'family' },  // Savannah City Hall (public)
];

const iso = (ms) => new Date(ms).toISOString();

export function nws(now, { tornado = true } = {}) {
  return {
    type: 'FeatureCollection',
    features: tornado ? [
      { id: 'https://api.weather.gov/alerts/urn:oid:t1', properties: { id: 'urn:oid:t1', event: 'Tornado Warning', severity: 'Extreme', messageType: 'Alert', headline: 'Tornado Warning (sample)', expires: iso(now + 3600e3), ends: iso(now + 2700e3), instruction: 'TAKE COVER NOW! Move to a basement or an interior room on the lowest floor. Avoid windows.' } },
      { id: 'https://api.weather.gov/alerts/urn:oid:w1', properties: { id: 'urn:oid:w1', event: 'Wind Advisory', severity: 'Moderate', messageType: 'Alert', expires: iso(now + 6 * 3600e3) } },
    ] : [],
  };
}
export const spcCsv = `Time,F_Scale,Location,County,State,Lat,Lon,Comments
1905,UNK,2 N Sample,DeKalb,GA,33.83,-84.12,Brief tornado (sample).
Time,Speed,Location,County,State,Lat,Lon,Comments
1910,UNK,Sample,Gwinnett,GA,33.90,-84.00,Trees down (sample).
Time,Size,Location,County,State,Lat,Lon,Comments
1920,175,Sample,Rockdale,GA,33.66,-84.02,Golf ball hail (sample).
1925,075,Far Away,Cobb,KS,38.0,-98.0,Not near (sample).
`;
export const spcOutlook = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { LABEL: 'SLGT' }, geometry: { type: 'Polygon', coordinates: [[[-86, 32], [-82, 32], [-82, 35], [-86, 35], [-86, 32]]] } }] };
export const usgs = { type: 'FeatureCollection', features: [
  { id: 'q1', properties: { mag: 3.1, place: '5 km E of Sample, GA' }, geometry: { type: 'Point', coordinates: [-84.10, 33.80, 5] } },
  { id: 'q2', properties: { mag: 5.2, place: 'Far away' }, geometry: { type: 'Point', coordinates: [140, 35, 10] } },
] };
export function fireIncidents(km = 20) {
  // A fire due east of Test Home at `km`.
  const lon = -84.1455 + km / (111 * Math.cos(33.8053 * Math.PI / 180));
  return { type: 'FeatureCollection', features: [{ type: 'Feature', id: 5, properties: { IncidentName: 'Sample Ridge', IncidentSize: 900, PercentContained: 10, UniqueFireIdentifier: '2026-GASAMP-000001' }, geometry: { type: 'Point', coordinates: [lon, 33.8053] } }] };
}
export const firePerimeters = { type: 'FeatureCollection', features: [] };
export function gauges(cat = 'minor') {
  return { gauges: [
    { lid: 'SMPG1', name: 'Sample Creek near Sample', latitude: 33.78, longitude: -84.10, status: { observed: { primary: 14.2, primaryUnit: 'ft', floodCategory: cat, validTime: '2026-11-12T20:00:00Z' } } },
    { lid: 'FARG1', name: 'Far Creek', latitude: 33.95, longitude: -84.40, status: { observed: { primary: 3, primaryUnit: 'ft', floodCategory: 'no_flooding' } } },
  ] };
}
export const sqk = (code) => ({ ac: code === '7700' ? [{ hex: 'a1b2c3', flight: 'DAL99  ', lat: 33.85, lon: -84.20, alt_baro: 6000 }] : [], now: Date.now() });
export const aircraft = { ac: [
  { hex: 'ae0001', flight: 'ARMY12 ', t: 'H60', dbFlags: 1, lat: 33.81, lon: -84.15, alt_baro: 1500 },
  { hex: 'abc123', flight: 'N123AB ', t: 'C172', lat: 33.80, lon: -84.14, alt_baro: 1200 },
  { hex: 'def456', flight: 'DAL2   ', t: 'A321', lat: 33.90, lon: -84.30, alt_baro: 22000 },
] };
export const nhcStorms = { activeStorms: [{ id: 'al192026', binNumber: 'AT4', name: 'Sample', classification: 'HU', latitudeNumeric: 28.0, longitudeNumeric: -78.0, publicAdvisory: { advNum: '12' } }] };
export const nhcMap = { layers: [{ id: 6, name: 'AT4 Forecast Cone' }, { id: 7, name: 'AT4 Forecast Points' }, { id: 32, name: 'AT5 Forecast Cone' }] };
export const coneHit = { count: 1 };
export const air = (aqi) => ({ current: { us_aqi: aqi, pm2_5: 60 } });
export const ovation = { coordinates: [[276, 34, 5], [276, 38, 35], [276, 60, 80], [120, 40, 90]] };
// ISS-like elements (realistic numbers, sample epoch set by the test).
export function issOmm(epochMs) {
  return [{ OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544, EPOCH: new Date(epochMs).toISOString().replace('Z', ''), MEAN_MOTION: 15.50103472, ECCENTRICITY: 0.0004964, INCLINATION: 51.6393, RA_OF_ASC_NODE: 120.5, ARG_OF_PERICENTER: 85.3, MEAN_ANOMALY: 274.9, BSTAR: 0.00021, MEAN_MOTION_DOT: 0.0001, MEAN_MOTION_DDOT: 0, EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', ELEMENT_SET_NO: 999, REV_AT_EPOCH: 50000, OBJECT_ID: '1998-067A' }];
}
export function launches(now) {
  return { results: [
    { id: 'L1', name: 'Falcon 9 | Sample', net: iso(now + 5 * 3600e3), status: { abbrev: 'Go' }, pad: { name: 'SLC-40', latitude: '28.562', longitude: '-80.577', location: { name: 'Cape Canaveral SFS, FL' } } },
    { id: 'L2', name: 'Electron | Far', net: iso(now + 3 * 3600e3), pad: { latitude: '-39.26', longitude: '177.86' } },
  ] };
}
export const forecast = { daily: { temperature_2m_max: [61], temperature_2m_min: [30], precipitation_probability_max: [70], wind_gusts_10m_max: [44], weather_code: [63], sunrise: ['2026-11-13T06:59'], sunset: ['2026-11-13T17:34'], uv_index_max: [3] } };
