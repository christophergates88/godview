// Sample responses for the test harness. Hand-made to match each provider's
// documented response format (field names and structure). NOT real data.
// Times are generated relative to "now" so the app treats them as current.

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

export const usgs = () => ({
  type: 'FeatureCollection',
  metadata: { generated: now, title: 'USGS Magnitude 2.5+ Earthquakes, Past Day', status: 200, count: 3 },
  features: [
    { type: 'Feature', id: 'us7000test1', properties: { mag: 4.6, place: '12 km SW of Sampletown, Georgia', time: now - 20 * 60e3, updated: now, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000test1', felt: 31, alert: 'green', status: 'reviewed', tsunami: 0, magType: 'mb', type: 'earthquake' }, geometry: { type: 'Point', coordinates: [-83.83, 32.84, 8.2] } },
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
      geometry: [{ magnitudeValue: 1200, magnitudeUnit: 'acres', date: iso(now - 2 * 86400e3), type: 'Point', coordinates: [-83.43, 33.34] },
        { magnitudeValue: 1500, magnitudeUnit: 'acres', date: iso(now - 86400e3), type: 'Point', coordinates: [-83.44, 33.35] }] },
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
      geometry: { type: 'Polygon', coordinates: [[[-84.23, 32.54], [-83.23, 32.54], [-83.23, 33.14], [-84.23, 33.14], [-84.23, 32.54]]] },
      properties: { id: 'urn:oid:test.1', areaDesc: 'Sample; Other', sent: iso(now), effective: iso(now - 3600e3), onset: iso(now - 3600e3), expires: iso(now + 3 * 3600e3), ends: iso(now + 3 * 3600e3), status: 'Actual', messageType: 'Alert', severity: 'Severe', certainty: 'Observed', urgency: 'Immediate', event: 'Severe Thunderstorm Warning', senderName: 'NWS Peachtree City GA', headline: 'Severe Thunderstorm Warning issued (sample)', description: 'SAMPLE TEXT. At 405 PM EST, a severe thunderstorm was located ...' } },
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
  latitude: 32.75, longitude: -83.68, timezone: 'America/New_York',
  current: { time: '2026-11-12T16:00', interval: 900, temperature_2m: 18.4, relative_humidity_2m: 61, apparent_temperature: 17.9, precipitation: 0.0, weather_code: 2, wind_speed_10m: 12.3, wind_direction_10m: 225, wind_gusts_10m: 25.1, cloud_cover: 40 },
});

export const geocode = () => ({
  results: [
    { id: 4180439, name: 'Atlanta', latitude: 33.289, longitude: -84.38798, feature_code: 'PPLA', country_code: 'US', country: 'United States', admin1: 'Georgia', population: 498715 },
  ],
});

export const nominatim = () => ([
  { place_id: 1, lat: '32.8640', lon: '-83.6180', display_name: '1 Sample Ave, Sampleville, Sample County, Georgia, 00000, United States', boundingbox: ['32.8639', '32.8641', '-83.6181', '-83.6179'], name: '1 Sample Ave' },
]);

// OpenSky /states/all format: arrays in fixed field order.
export const opensky = () => ({
  time: Math.floor(now / 1000),
  states: [
    ['a1b2c3', 'DAL1234 ', 'United States', Math.floor(now / 1000) - 5, Math.floor(now / 1000) - 2, -84.13, 32.74, 10668, false, 230.5, 45.0, 0.0, null, 10900, '2241', false, 0, 0],
    ['a4d5e6', 'N123AB  ', 'United States', Math.floor(now / 1000) - 8, Math.floor(now / 1000) - 3, -83.53, 32.44, 1524, false, 72.0, 270.0, -3.2, null, 1600, null, false, 0, 0],
    ['abcdef', 'SWA77   ', 'United States', Math.floor(now / 1000) - 4, Math.floor(now / 1000) - 1, -84.43, 33.18, null, true, 5.0, 90.0, null, null, null, null, false, 0, 0],
  ],
});

// airplanes.live /v2/point format (readsb style; altitudes in feet, speed in knots).
export const airplaneslive = () => ({
  ac: [
    { hex: 'a1b2c3', flight: 'DAL1234 ', r: 'N123DL', t: 'A321', desc: 'AIRBUS A-321', alt_baro: 35000, alt_geom: 35600, gs: 448.1, track: 45.2, baro_rate: 0, squawk: '2241', lat: 32.74, lon: -84.13, seen_pos: 1.2, seen: 0.5 },
    { hex: 'abcdef', flight: 'SWA77   ', r: 'N8000S', t: 'B38M', alt_baro: 'ground', gs: 10, track: 90, lat: 33.18, lon: -84.43, seen_pos: 3 },
    // Two helicopters low over Macon: the app should infer "landing or hovering" and "gathered in one spot".
    { hex: 'a0c001', flight: 'LIFE1   ', t: 'EC35', category: 'A7', alt_baro: 700, gs: 15, track: 180, lat: 32.845, lon: -83.632, seen_pos: 1 },
    { hex: 'a0c002', flight: 'N911PD  ', t: 'AS50', category: 'A7', alt_baro: 1200, gs: 35, track: 225, lat: 32.86, lon: -83.62, seen_pos: 1 },
  ],
  msg: 'No error', now: now, total: 2, ctime: now, ptime: 3,
});

// ---------------------------------------------------------------- v2 sources
const ac = (hex, flight, lat, lon, extra = {}) => ({ hex, flight, lat, lon, alt_baro: 20000, alt_geom: 20400, gs: 300, track: 120, seen_pos: 2, ...extra });
export const adsbMil = () => ({ ac: [ac('ae1234', 'RCH123 ', 32.6, -83.83, { t: 'C17', r: '05-5140' }), ac('ae5678', 'TOPCAT1 ', 33.54, -84.5, { t: 'F16' })], now, total: 2 });
export const adsbSqk = (code) => ({ ac: code === '7700' ? [ac('a0f00d', 'UAL99 ', 32.54, -82.0, { squawk: '7700' })] : [], now, total: code === '7700' ? 1 : 0 });

export const faa = () => `<?xml version="1.0" encoding="UTF-8"?>
<AIRPORT_STATUS_INFORMATION><Update_Time>Thu Nov 12 20:00:00 2026 GMT</Update_Time>
<Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List><Program><ARPT>ATL</ARPT><Reason>thunderstorms</Reason><End_Time>8:45 pm EST</End_Time></Program></Ground_Stop_List></Delay_type>
<Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List><Delay><ARPT>EWR</ARPT><Reason>VOL:Volume</Reason><Arrival_Departure Type="Departure"><Min>16 minutes</Min><Max>30 minutes</Max><Trend>Increasing</Trend></Arrival_Departure></Delay><Delay><ARPT>ZZZ</ARPT><Reason>test</Reason></Delay></Arrival_Departure_Delay_List></Delay_type>
</AIRPORT_STATUS_INFORMATION>`;

export const launches = () => ({ count: 2, results: [
  { id: 'aaaa-1', name: 'Falcon 9 Block 5 | Starlink Group 10-1', net: iso(now + 5 * 3600e3), status: { name: 'Go for Launch', abbrev: 'Go' }, launch_service_provider: { name: 'SpaceX' }, rocket: { configuration: { full_name: 'Falcon 9 Block 5' } }, mission: { name: 'Starlink Group 10-1', description: 'Sample mission text.', orbit: { name: 'Low Earth Orbit' } }, pad: { name: 'SLC-40', latitude: '28.56194122', longitude: '-80.57735736', location: { name: 'Cape Canaveral SFS, FL, USA' } }, image: { image_url: 'https://example.invalid/f9.jpg' } },
  { id: 'aaaa-2', name: 'Electron | Sample', net: iso(now + 3 * 86400e3), status: { name: 'To Be Confirmed' }, launch_service_provider: { name: 'Rocket Lab' }, rocket: { configuration: { full_name: 'Electron' } }, mission: null, pad: { name: 'LC-1A', latitude: '-39.262833', longitude: '177.864469', location: { name: 'Mahia Peninsula, New Zealand' } } },
] });

export const ovation = () => ({ 'Observation Time': iso(now), 'Forecast Time': iso(now + 1800e3), 'Data Format': '[Longitude, Latitude, Aurora]',
  coordinates: [[0, 65, 30], [10, 66, 55], [270, 60, 12], [280, 61, 5], [200, -70, 20]] });
export const kp = () => [['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-11-12 18:00:00.000', '3.67', '22', '8']];

export const tideStations = () => ({ count: 2, stations: [{ id: '8670870', name: 'Fort Pulaski', state: 'GA', lat: 32.0367, lng: -80.9017 }, { id: '8720030', name: 'Fernandina Beach', state: 'FL', lat: 30.6714, lng: -81.4658 }] });
export const tideWL = () => ({ metadata: { id: '8670870' }, data: [{ t: '2026-11-12 20:00', v: '1.234', s: '0.01', f: '0,0,0,0', q: 'p' }] });
export const tidePred = () => ({ predictions: [{ t: '2026-11-12 03:12', v: '2.301', type: 'H' }, { t: '2026-11-12 09:30', v: '0.102', type: 'L' }] });

export const ndbc = () => `#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE
#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft
41008   31.400  -80.866  2026 11 12 19 50  40  6.0   7.0  1.1    7  5.2  60 1018.4    MM  20.1  21.5  15.0   MM     MM
FPKG1   32.035  -80.903  2026 11 12 19 54 350  4.1   5.1   MM   MM   MM  MM 1018.9    MM  18.2    MM  12.1   MM     MM
`;

export const spcCsv = () => `Time,F_Scale,Location,County,State,Lat,Lon,Comments
1905,UNK,2 N Sampleville,Sample,GA,32.89,-83.61,Brief tornado reported by spotter. (FFC)
Time,Speed,Location,County,State,Lat,Lon,Comments
1910,UNK,Sampletown,Sample,GA,32.87,-83.62,"Trees down, one on a house. (FFC)"
Time,Size,Location,County,State,Lat,Lon,Comments
1920,100,Macon,Bibb,GA,32.84,-83.86,Quarter size hail. (FFC)
`;
export const spcOutlook = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[-86, 31], [-81, 31], [-81, 35], [-86, 35], [-86, 31]]]] }, properties: { DN: 2, VALID: '202611121200', EXPIRE: '202611131200', ISSUE: '202611121630', LABEL: 'TSTM', LABEL2: 'General Thunderstorms Risk', stroke: '#55BB55', fill: '#C1E9C1' } },
  { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-85, 32], [-82, 32], [-82, 34], [-85, 34], [-85, 32]]] }, properties: { DN: 4, LABEL: 'SLGT', LABEL2: 'Slight Risk', stroke: '#DDAA00', fill: '#FFE066' } },
] });
export const nhc = () => ({ activeStorms: [{ id: 'al192026', binNumber: 'AT4', name: 'Sample', classification: 'TS', intensity: '50', pressure: '998', latitude: '25.1N', longitude: '70.3W', latitudeNumeric: 25.1, longitudeNumeric: -70.3, movementDir: 300, movementSpeed: 12, lastUpdate: iso(now), publicAdvisory: { advNum: '5', url: 'https://www.nhc.noaa.gov/text/refresh/MIATCPAT4+shtml/sample.shtml' } }] });

export const openMeteoGrid = (n) => Array.from({ length: n }, (_, i) => ({ latitude: 32 + i * 0.1, longitude: -84 + i * 0.1, current: { time: '2026-11-12T20:00', temperature_2m: 10 + i, wind_speed_10m: 12, wind_direction_10m: 200, weather_code: 1, us_aqi: 20 + i * 5, pm2_5: 4.1, pm10: 8.3, ozone: 60 } }));

export const perimeters = () => ({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 11, geometry: { type: 'Polygon', coordinates: [[[-83.83, 33.04], [-83.73, 33.04], [-83.73, 33.14], [-83.83, 33.14], [-83.83, 33.04]]] }, properties: { poly_IncidentName: 'Sample Creek', attr_IncidentSize: 812, attr_PercentContained: 40, poly_GISAcres: 805.2, attr_FireDiscoveryDateTime: now - 3 * 86400e3, attr_POOState: 'US-GA' } }] });
export const incidents = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [-83.78, 33.09] }, properties: { IncidentName: 'Sample Creek', IncidentSize: 812, PercentContained: 40, FireDiscoveryDateTime: now - 3 * 86400e3, POOState: 'US-GA', POOCounty: 'Sample', UniqueFireIdentifier: '2026-GAXXX-000123' } },
  { type: 'Feature', id: 2, geometry: { type: 'Point', coordinates: [-120.5, 38.5] }, properties: { IncidentName: 'Sample Ridge', IncidentSize: 50, PercentContained: 0, FireDiscoveryDateTime: now - 86400e3, POOState: 'US-CA', POOCounty: 'El Dorado', UniqueFireIdentifier: '2026-CAXXX-000456' } },
] });
export const firmsCsv = () => `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
32.85,-83.64,330.2,0.39,0.36,2026-11-12,1842,N,VIIRS,n,2.0NRT,290.1,5.4,D
33.06,-83.81,355.0,0.40,0.37,2026-11-12,1842,N,VIIRS,h,2.0NRT,295.3,22.7,D
`;
export const volcanoes = () => ([{ obs_fullname: 'Alaska Volcano Observatory', obs_abbr: 'avo', volcano_name: 'Great Sitkin', vnum: '311120', alert_level: 'WATCH', color_code: 'ORANGE', sent_utc: '2026-11-12 18:00:00', notice_url: 'https://volcanoes.usgs.gov/hans2/view/notice/sample', latitude: 52.076, longitude: -176.13 }]);
export const gauges = () => ({ gauges: [
  { lid: 'OCOG1', name: 'Ocmulgee River at Macon', latitude: 32.63, longitude: -83.44, status: { observed: { primary: 12.3, primaryUnit: 'ft', floodCategory: 'no_flooding', validTime: iso(now - 3600e3) }, forecast: { floodCategory: 'no_flooding' } } },
  { lid: 'ALBG1', name: 'Flint River at Albany', latitude: 31.59, longitude: -84.37, status: { observed: { primary: 22.0, primaryUnit: 'ft', floodCategory: 'minor', validTime: iso(now - 3600e3) }, forecast: { floodCategory: 'action' } } },
] });
export const drought = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', properties: { DM: 0 }, geometry: { type: 'MultiPolygon', coordinates: [[[[-85, 31], [-82, 31], [-82, 33], [-85, 33], [-85, 31]]], [[[-100, 35], [-98, 35], [-98, 36], [-100, 36], [-100, 35]]]] } },
  { type: 'Feature', properties: { DM: 2 }, geometry: { type: 'Polygon', coordinates: [[[-84, 31.5], [-83, 31.5], [-83, 32.5], [-84, 32.5], [-84, 31.5]]] } },
] });
export const ga511Cams = () => ([
  { Id: 186, Source: 'GDOT', SourceId: '186', Roadway: 'SR 44', Direction: 'Northbound', Latitude: 32.87, Longitude: -83.62, Location: 'SR 44 at Sample Rd (Sample)', SortOrder: 0, Name: 'GDOT-SMP-0001', Views: [{ Id: 186, Url: 'https://511ga.org/map/Cctv/186', Status: 'Enabled', Description: 'sample' }] },
  { Id: 187, Source: 'GDOT', Roadway: 'I-75', Direction: 'Southbound', Latitude: 33.29, Longitude: -84.39, Location: 'I-75 at 10th St (Fulton)', Views: [{ Id: 187, Url: 'https://511ga.org/map/Cctv/187', Status: 'Enabled' }] },
]);
export const ga511Events = () => ([{ ID: 'E1', SourceId: 's', Organization: 'GDOT', RoadwayName: 'I-16', DirectionOfTravel: 'Eastbound', Description: 'Crash blocking right lane (sample).', Reported: Math.floor(now / 1000) - 3600, LastUpdated: Math.floor(now / 1000) - 600, StartDate: Math.floor(now / 1000) - 3600, EventType: 'accidentsAndIncidents', Subtype: 'crash', Severity: '2', LanesAffected: 'Right lane', Latitude: 32.8, Longitude: -83.83 }]);
export const caltrans = () => ({ data: [{ cctv: { index: '1', recordTimestamp: {}, location: { district: '7', locationName: 'I-405 at Sample Blvd', nearbyPlace: 'Los Angeles', latitude: '33.59', longitude: '-118.44', route: 'I-405', direction: 'North' }, inService: 'true', imageData: { static: { currentImageURL: 'https://cwwp2.dot.ca.gov/data/d7/cctv/image/sample/sample.jpg' } } } }] });
export const amtrak = () => ({ 19: [{ routeName: 'Crescent', trainNum: '19', trainID: '19-12', lat: 33.29, lon: -84.39, velocity: 54.2, heading: 'SW', trainTimely: 'On Time', trainState: 'Active', origName: 'New York', destName: 'New Orleans', lastValTS: iso(now - 120e3), stations: [{ name: 'Birmingham', status: 'Enroute' }] }] });
export const gbfsInfo = () => ({ data: { stations: [{ station_id: 's1', name: 'Sample St & 1st', lat: 38.90, lon: -77.03, capacity: 15 }, { station_id: 's2', name: 'Sample Ave & 2nd', lat: 38.91, lon: -77.04, capacity: 11 }] } });
export const gbfsStatus = () => ({ data: { stations: [{ station_id: 's1', num_bikes_available: 4, num_ebikes_available: 1, num_docks_available: 11 }, { station_id: 's2', num_bikes_available: 0, num_docks_available: 11 }] } });
export const overpass = (q) => {
  const els = [];
  if (/power/.test(q)) els.push({ type: 'way', id: 101, center: { lat: 32.60, lon: -84.04 }, tags: { power: 'plant', name: 'Plant Sample', 'plant:source': /nuclear/.test(q) ? 'nuclear' : 'coal', operator: 'Sample Power', 'plant:output:electricity': '1000 MW' } });
  if (/ALPR/.test(q)) els.push({ type: 'node', id: 202, lat: 32.86, lon: -83.61, tags: { 'surveillance:type': 'ALPR', manufacturer: 'Flock Safety', direction: '90' } });
  if (/communication/.test(q)) els.push({ type: 'node', id: 303, lat: 32.84, lon: -83.65, tags: { 'tower:type': 'communication', operator: 'Sample Towers' } });
  return { version: 0.6, elements: els };
};
export const cables = () => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'sample-cable', name: 'Sample Atlantic Cable', color: '#3ee6c4' }, geometry: { type: 'MultiLineString', coordinates: [[[-80, 32], [-60, 35], [-10, 45]]] } }] });
export const radio = () => ([
  { stationuuid: 'r1', name: 'Sample FM', url_resolved: 'https://stream.example.invalid/live.mp3', homepage: 'https://example.invalid', tags: 'news,talk', country: 'United States', state: 'Georgia', language: 'english', codec: 'MP3', bitrate: 128, geo_lat: 32.86, geo_long: -83.62 },
  { stationuuid: 'r2', name: 'Old AM', url_resolved: 'http://insecure.example.invalid/live', tags: 'country', country: 'United States', state: 'Georgia', geo_lat: 32.86, geo_long: -83.62 },
]);
export const wikiGeo = () => ({ batchcomplete: '', query: { geosearch: [{ pageid: 123, ns: 0, title: 'Sampletown, Georgia', lat: 32.8668, lon: -83.6185, dist: 3100.5, primary: '' }] } });
export const wikiSummary = () => ({ title: 'Sampletown, Georgia', extract: 'Sampletown is a city in Sample County, Georgia (sample text).', thumbnail: { source: 'https://upload.wikimedia.org/sample.jpg' } });
export const inat = () => ({ total_results: 1, results: [{ id: 999, species_guess: 'Northern Cardinal', taxon: { name: 'Cardinalis cardinalis', preferred_common_name: 'Northern Cardinal', iconic_taxon_name: 'Aves' }, geojson: { type: 'Point', coordinates: [-83.63, 32.84] }, observed_on: '2026-11-10', user: { login: 'sample_user' }, quality_grade: 'research', photos: [{ url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg' }], uri: 'https://www.inaturalist.org/observations/999' }] });

// ---------------------------------------------------------------- v4: a dense sky (650 aircraft over the Southeast)
// Deterministic pseudo-random so screenshots are repeatable. readsb (adsb.lol) format.
export function denseFlights() {
  let s = 42;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ac = [];
  for (let i = 0; i < 650; i++) {
    const lat = 30 + rnd() * 6.5; const lon = -88 + rnd() * 10;
    const alt = rnd() < 0.08 ? 'ground' : Math.round((rnd() < 0.25 ? 1500 + rnd() * 8000 : 18000 + rnd() * 21000) / 100) * 100;
    const al = ['DAL', 'AAL', 'SWA', 'UAL', 'JBU', 'FFT', 'N'][Math.floor(rnd() * 7)];
    ac.push({ hex: (0xa00000 + i).toString(16), flight: al === 'N' ? `N${100 + i}X ` : `${al}${100 + Math.floor(rnd() * 3000)} `, lat, lon, alt_baro: alt, alt_geom: typeof alt === 'number' ? alt + 300 : undefined, gs: 120 + rnd() * 380, track: Math.floor(rnd() * 360), baro_rate: Math.round((rnd() - 0.5) * 3000), t: ['B738', 'A321', 'B739', 'E75L', 'C172', 'CRJ9'][Math.floor(rnd() * 6)], seen_pos: rnd() * 5 });
  }
  ac[10] = { ...ac[10], squawk: '7700', flight: 'UAL99   ' };
  ac[20] = { ...ac[20], dbFlags: 1, flight: 'RCH871  ', t: 'C17' };
  ac[21] = { ...ac[21], dbFlags: 1, flight: 'TOPCAT1 ', t: 'F16' };
  return { ac, now: Date.now(), total: ac.length };
}

// adsbdb aircraft + flight route (documented response shape)
export const adsbdb = (hex, callsign) => ({ response: {
  aircraft: { type: '737-932ER', icao_type: 'B739', manufacturer: 'Boeing', mode_s: hex.toUpperCase(), registration: 'N123DL', registered_owner_country_iso_name: 'US', registered_owner_country_name: 'United States', registered_owner_operator_flag_code: 'DAL', registered_owner: 'Delta Air Lines Inc', url_photo: null, url_photo_thumbnail: null },
  ...(callsign ? { flightroute: { callsign, callsign_icao: callsign, callsign_iata: 'DL1234', airline: { name: 'Delta Air Lines', icao: 'DAL', iata: 'DL', country: 'United States', country_iso: 'US', callsign: 'DELTA' },
    origin: { country_iso_name: 'US', country_name: 'United States', elevation: 1026, iata_code: 'ATL', icao_code: 'KATL', latitude: 33.1767, longitude: -84.4281, municipality: 'Atlanta', name: 'Hartsfield-Jackson Atlanta International Airport' },
    destination: { country_iso_name: 'US', country_name: 'United States', elevation: 13, iata_code: 'LGA', icao_code: 'KLGA', latitude: 40.7772, longitude: -73.8726, municipality: 'New York', name: 'LaGuardia Airport' } } } : {}),
} });
export const adsbdbPrivate = (hex) => ({ response: { aircraft: { type: '172S', icao_type: 'C172', manufacturer: 'Cessna', mode_s: hex.toUpperCase(), registration: 'N100X', registered_owner_country_iso_name: 'US', registered_owner_country_name: 'United States', registered_owner_operator_flag_code: null, registered_owner: 'John Q Sample', url_photo: null, url_photo_thumbnail: null } } });
export const planespotters = () => ({ photos: [{ id: '1', thumbnail: { src: 'https://t.plnspttrs.net/sample_s.jpg', size: { width: 200, height: 133 } }, thumbnail_large: { src: 'https://t.plnspttrs.net/sample_t.jpg', size: { width: 420, height: 280 } }, link: 'https://www.planespotters.net/photo/1/sample', photographer: 'Sample Photographer' }] });

// 400 buoys (dense point layer)
export function denseBuoys() {
  const head = '#STN       LAT      LON  YYYY MM DD hh mm WDIR WSPD   GST WVHT  DPD APD MWD   PRES  PTDY  ATMP  WTMP  DEWP  VIS   TIDE\n#text      deg      deg   yr mo day hr mn degT  m/s   m/s   m   sec sec degT   hPa   hPa  degC  degC  degC  nmi     ft\n';
  let out = head;
  for (let i = 0; i < 400; i++) out += `B${String(i).padStart(4, '0')}  ${(28 + (i % 20) * 0.45).toFixed(3)}  ${(-90 + Math.floor(i / 20) * 0.6).toFixed(3)}  2026 11 12 19 50  40  6.0   7.0  1.1    7  5.2  60 1018.4    MM  20.1  21.5  15.0   MM     MM\n`;
  return out;
}

// ---------------------------------------------------------------- v5: infrastructure (HIFLD mirror, NRC via FEMA)
// Positions near Macon (public). Field names as listed by the services.
export const hifldPlants = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.60, 32.80] }, properties: { plant_code: 9001, plant_name: 'Sample Generating Plant', utility_na: 'Sample Power Co', energy_src: 'NG', sector_nam: 'Electric Utility', city_name: 'MACON', state_code: 'GA' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.60, 32.80] }, properties: { plant_code: 9001, plant_name: 'Sample Generating Plant', utility_na: 'Sample Power Co', energy_src: 'SUN', sector_nam: 'Electric Utility', city_name: 'MACON', state_code: 'GA' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.70, 32.90] }, properties: { plant_code: 9002, plant_name: 'Sample Solar Farm', utility_na: 'Sample Renewables LLC', energy_src: 'SUN', sector_nam: 'IPP Non-CHP', city_name: 'MACON', state_code: 'GA' } },
] });
export const hifldTowers = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.62, 32.85] }, properties: { objectid: 1, licensee: 'SAMPLE WIRELESS LLC', loccity: 'MACON', locstate: 'GA', allstruc: 91.4 } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.65, 32.83] }, properties: { objectid: 2, licensee: 'EXAMPLE TOWERS INC', loccity: 'MACON', locstate: 'GA', allstruc: 60.0 } },
] });
export const hifldHospitals = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.64, 32.83] }, properties: { objectid: 11, NAME: 'SAMPLE MEDICAL CENTER', ADDRESS: '1 SAMPLE ST', CITY: 'MACON', STATE: 'GA', TYPE: 'GENERAL ACUTE CARE', BEDS: 300 } },
] });
export const hifldNursing = () => ({ type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.61, 32.86] }, properties: { objectid: 21, NAME: 'SAMPLE OAKS HEALTH AND REHABILITATION', ADDRESS: '2 SAMPLE AVE', CITY: 'MACON', STATE: 'GA', TYPE: 'NURSING HOME', BEDS: 100 } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [-83.62, 32.84] }, properties: { objectid: 22, NAME: 'MARY SMITH', ADDRESS: '9 ELM ST', CITY: 'MACON', STATE: 'GA', TYPE: 'NURSING HOME', BEDS: 6 } },
] });
// Esri JSON (f=json) as FEMA's service returns it
export const reactors = () => ({ features: [
  { attributes: { OBJECTID: 1, Unit: 'Sample Point 1', Power: 100, ReportDt: Date.UTC(2026, 10, 12) }, geometry: { x: -81.76, y: 33.14 } },
  { attributes: { OBJECTID: 2, Unit: 'Sample Point 2', Power: 0, ReportDt: Date.UTC(2026, 10, 12) }, geometry: { x: -81.77, y: 33.15 } },
] });

// ---- Keyless Georgia 511 copy (Lookout feed job) and VIIRS hot spots (Esri) ----
// The copy uses the same camera id (186) as the live-API sample, so the same card tests apply.
export const ga511Feed = (ageMs = 10 * 60e3) => ({
  updated: new Date(now - ageMs).toISOString().replace(/\.\d{3}Z$/, '+00:00'),
  cameras: [
    { id: 186, name: 'SR 44 at Sample Rd (Sample)', road: 'SR 44', dir: 'Northbound', lat: 32.87, lon: -83.62, url: 'https://511ga.org/map/Cctv/186', ok: true },
    { id: 187, name: 'I-75 at 10th St (Fulton)', road: 'I-75', dir: 'Southbound', lat: 33.29, lon: -84.39, url: 'https://511ga.org/map/Cctv/187', ok: true },
    { id: 999, name: 'No position (sample)', road: 'I-20', dir: 'Unknown', lat: 0.0, lon: 0.0, url: 'https://511ga.org/map/Cctv/999', ok: false },
  ],
  events: [
    { type: 'accidentsAndIncidents', sub: 'crash', sev: 'major', desc: 'Crash blocking right lane (sample).', road: 'I-16', dir: 'e', lat: '32.80', lon: '-83.55', updated: String(Math.floor(now / 1000) - 600) },
    { type: 'roadwork', sub: '', sev: 'minor', desc: 'Road construction on SR 22 (sample). Left lane blocked.', road: 'SR 22', dir: 's', lat: '33.08', lon: '-83.23', updated: String(Math.floor(now / 1000) - 7200) },
  ],
});
export const viirs = () => ({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:4326' } }, features: [
  { type: 'Feature', id: 501, geometry: { type: 'Point', coordinates: [-83.64, 32.85] }, properties: { latitude: 32.85, longitude: -83.64, acq_time: now - 5 * 3600e3, satellite: 'N20', confidence: 'nominal', frp: 5.4, daynight: 'D', hours_old: 5 } },
  { type: 'Feature', id: 502, geometry: { type: 'Point', coordinates: [-83.81, 33.06] }, properties: { latitude: 33.06, longitude: -83.81, acq_time: now - 9 * 3600e3, satellite: 'N21', confidence: 'high', frp: 22.7, daynight: 'N', hours_old: 9 } },
] });
