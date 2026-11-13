// Sample responses for the Earth pack layers (js/layers/earth-pack.js). Hand-made to
// match what each provider really sent to the live site on 2026-11-12 (field names
// and structure). NOT real data.

const now = Date.now();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export const gdacs = () => ({
  type: 'FeatureCollection',
  features: [
    ['TC', 1001, 'Red', 'Tropical Cyclone SAMPLE-26', 'Philippines', 14.6, 121.0, 'Maximum wind speed of 213 km/h'],
    ['EQ', 1002, 'Orange', 'Earthquake in Sampleland', 'Sampleland', -6.2, 106.8, 'Magnitude 6.4M, Depth:10km'],
    ['EQ', 1003, 'Green', 'Earthquake in Mariana Islands', 'Mariana Islands', 13.5, 144.8, 'Magnitude 4.9M, Depth:35km'],
    ['WF', 1004, 'Green', 'Forest fire in Testonia', 'Testonia', 40.1, -3.2, '5210 ha'],          // green wildfire: left out
    ['DR', 1005, 'Orange', 'Drought in East Africa', 'Ethiopia', 9.4, 31.8, 'Medium impact for agricultural drought'],
  ].map(([eventtype, eventid, alertlevel, name, country, lat, lon, severitytext]) => ({
    type: 'Feature', bbox: [lon, lat, lon, lat], geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { eventtype, eventid, episodeid: 1, name, description: name, alertlevel, country, iscurrent: 'true',
      fromdate: new Date(now - 36 * 3600000).toISOString().slice(0, 19), severitydata: { severity: 1, severitytext, severityunit: '' },
      url: { report: `https://www.gdacs.org/report.aspx?eventid=${eventid}&eventtype=${eventtype}` } },
  })),
});

export const dsn = () => `<?xml version="1.0"?><dsn>
<station name="gdscc" friendlyName="Goldstone" timeUTC="${now}" timeZoneOffset="-28800000.0"/>
<dish name="DSS14" azimuthAngle="0" elevationAngle="90" windSpeed="" isMSPA="false" isArray="false" isDDOR="false" activity="Engineering Upgrades"><target name="DSN" id="99" uplegRange="-1" downlegRange="-1" rtlt="-1"/></dish>
<dish name="DSS25" azimuthAngle="226" elevationAngle="20" windSpeed="17" isMSPA="false" isArray="false" isDDOR="false" activity="Spacecraft Telemetry, Tracking, and Command"><upSignal active="true" signalType="data" dataRate="0" frequency="0" band="X" power="20" spacecraft="VGR1" spacecraftID="-31"/><downSignal active="true" signalType="data" dataRate="160" frequency="0" band="X" power="-150" spacecraft="VGR1" spacecraftID="-31"/><target name="VGR1" id="31" uplegRange="25100000000" downlegRange="25100000000" rtlt="167400"/></dish>
<station name="mdscc" friendlyName="Madrid" timeUTC="${now}" timeZoneOffset="3600000.0"/>
<dish name="DSS63" azimuthAngle="120" elevationAngle="40" windSpeed="9" isMSPA="false" isArray="false" isDDOR="false" activity="Spacecraft Telemetry"><downSignal active="true" signalType="data" dataRate="2000000" frequency="0" band="X" power="-120" spacecraft="JWST" spacecraftID="-170"/><target name="JWST" id="170" uplegRange="1500000" downlegRange="1500000" rtlt="10"/></dish>
<station name="cdscc" friendlyName="Canberra" timeUTC="${now}" timeZoneOffset="39600000.0"/>
<dish name="DSS43" azimuthAngle="0" elevationAngle="90" windSpeed="5" isMSPA="false" isArray="false" isDDOR="false" activity="Maintenance"><target name="DSN" id="99" uplegRange="-1" downlegRange="-1" rtlt="-1"/></dish>
<timestamp>${now}</timestamp></dsn>`;

const s = Math.floor(now / 1000);
export const ioda = () => ({
  type: 'outages.events', error: null,
  data: [
    { location: 'country/LA', start: s - 40000, duration: 39000, method: 'median', datasource: 'bgp', status: 0, score: 4548, location_name: 'Lao Peoples Democratic Republic' },
    { location: 'country/LA', start: s - 30000, duration: 29800, method: 'median', datasource: 'ping-slash24', status: 0, score: 900, location_name: 'Lao Peoples Democratic Republic' },
    { location: 'country/FI', start: s - 70000, duration: 7200, method: 'sarima', datasource: 'gtr', status: 0, score: 15727, location_name: 'Finland' },
    { location: 'country/US', start: s - 5000, duration: 600, method: 'median', datasource: 'bgp', status: 0, score: 12, location_name: 'United States' },   // a blip: left out
  ],
});

export const aisLocations = () => ({
  type: 'FeatureCollection', dataUpdatedTime: new Date(now).toISOString(),
  features: [
    [230000001, 21.71, 60.16, 12.4, 346], [230000002, 24.95, 60.15, 0, 0], [230000003, 22.3, 59.9, 8.1, 90],
    [230000004, 20.0, 60.0, 5, 10, now - 3 * 3600000],   // stale: left out
  ].map(([mmsi, lon, lat, sog, cog, t]) => ({ mmsi, type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { mmsi, sog, cog, navStat: 0, rot: 0, posAcc: false, raim: false, heading: cog, timestamp: 6, timestampExternal: t || now - 60000 } })),
});
export const aisVessels = () => [
  { callSign: 'OJXX', destination: 'HELSINKI', draught: 62, eta: 0, imo: 9000001, mmsi: 230000001, name: 'SAMPLE FERRY', posType: 1, shipType: 60, timestamp: now },
  { callSign: 'OJYY', destination: 'N/A', draught: 40, eta: 0, imo: 9000002, mmsi: 230000002, name: 'TEST CARGO', posType: 1, shipType: 70, timestamp: now },
];

export const radarSites = () => ({
  type: 'FeatureCollection',
  features: [['KFFC', 'Atlanta', -84.566, 33.3636, 'Operate', 'No Alarms', 60], ['KJGX', 'Robins AFB', -83.3511, 32.6756, 'Operate', 'Maintenance Required', 90], ['KSMP', 'Sampleville', -90, 35, 'Standby', 'No Alarms', 7200]]
    .map(([id, name, lon, lat, status, alarmSummary, age]) => ({ id: `https://api.weather.gov/radar/stations/${id}`, type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id, name, stationType: 'WSR-88D', latency: { levelTwoLastReceivedTime: new Date(now - age * 1000).toISOString() },
        rda: { timestamp: new Date(now).toISOString(), properties: { alarmSummary, mode: 'Operational', generatorState: 'Utility PWR Available', status } } } })),
});

const series = (name, code, lat, lon, vc, value) => ({
  sourceInfo: { siteName: name, siteCode: [{ value: code, network: 'NWIS', agencyCode: 'USGS' }], geoLocation: { geogLocation: { srs: 'EPSG:4326', latitude: lat, longitude: lon } } },
  variable: { variableCode: [{ value: vc }], variableName: 'x', unit: { unitCode: 'ft' }, noDataValue: -999999 },
  values: [{ value: [{ value: String(value), qualifiers: ['P'], dateTime: new Date(now - 900000).toISOString() }] }],
});
export const usgsWater = () => ({ value: { timeSeries: [
  series('LITTLE RIVER NEAR EATONTON, GA', '02220900', 33.3141, -83.4371, '00060', 12.0),
  series('LITTLE RIVER NEAR EATONTON, GA', '02220900', 33.3141, -83.4371, '00065', 1.84),
  series('SAMPLE LAKE NEAR TESTVILLE, GA', '02220999', 33.2, -83.3, '62614', 339.52),
  series('BROKEN GAUGE AT NOWHERE, GA', '02229999', 33.1, -83.2, '00065', -999999),   // no reading: left out
] } });

export const waves = (n) => Array.from({ length: n }, (_, i) => ({ latitude: 30 + (i % 6) * 0.5, longitude: -80 + Math.floor(i / 6) * 0.5,
  current: i % 3 === 0 ? { time: '2026-11-12T12:00', wave_height: null } : { time: '2026-11-12T12:00', wave_height: 0.6 + (i % 5) * 0.7, wave_direction: 120, wave_period: 7, sea_surface_temperature: 22.5 } }));

export const powerLines = () => ({
  type: 'FeatureCollection', properties: { exceededTransferLimit: false },
  features: [
    { type: 'Feature', id: 2782, geometry: { type: 'LineString', coordinates: [[-83.3171, 32.8826], [-83.3245, 33.0602], [-83.298, 33.1958]] }, properties: { OWNER: 'SAMPLE POWER CO', VOLTAGE: 230, VOLT_CLASS: '220-287', TYPE: 'AC; OVERHEAD', STATUS: 'IN SERVICE', SUB_1: 'UNKNOWN112280', SUB_2: 'TEST BRANCH' } },
    { type: 'Feature', id: 2783, geometry: { type: 'MultiLineString', coordinates: [[[-83.5, 33.3], [-83.4, 33.35]], [[-83.4, 33.35], [-83.3, 33.4]]] }, properties: { OWNER: 'NOT AVAILABLE', VOLTAGE: 500, VOLT_CLASS: '500', TYPE: 'AC; OVERHEAD', STATUS: 'IN SERVICE', SUB_1: 'ALPHA', SUB_2: 'BETA' } },
    { type: 'Feature', id: 2784, geometry: { type: 'LineString', coordinates: [[-83.6, 33.2], [-83.55, 33.25]] }, properties: { OWNER: 'SAMPLE EMC', VOLTAGE: -999999, TYPE: 'AC; OVERHEAD', STATUS: 'IN SERVICE', SUB_1: 'TAP12345', SUB_2: 'NOT AVAILABLE' } },
  ],
});

export function answerEarth(u) {
  const host = u.hostname; const p = u.pathname;
  const J = (obj) => ({ status: 200, type: 'application/json', body: JSON.stringify(obj) });
  const tile = { status: 200, type: 'image/png', body: PNG };
  switch (host) {
    case 'www.gdacs.org': return J(gdacs());
    case 'eyes.nasa.gov': return { status: 200, type: 'text/xml', body: dsn() };
    case 'api.ioda.inetintel.cc.gatech.edu': return J(ioda());
    case 'meri.digitraffic.fi': return J(/vessels/.test(p) ? aisVessels() : aisLocations());
    case 'api.weather.gov': return /^\/radar\/stations/.test(p) ? J(radarSites()) : null;   // alerts stay with the main fixtures
    case 'waterservices.usgs.gov': return J(usgsWater());
    case 'marine-api.open-meteo.com': return J(waves((u.searchParams.get('latitude') || '').split(',').length));
    case 'services1.arcgis.com': return /Electric_Power_Transmission_Lines/.test(p) ? J(powerLines()) : null;
    case 'mesonet.agron.iastate.edu': return /tms\.json/.test(p) ? J({ services: [{ id: 'ridge_uscomp_n0q', layername: 'ridge::USCOMP-N0Q', utc_valid: new Date(now - 240000).toISOString() }] }) : tile;
    case 'elevation3d.arcgis.com':   // enough of the service description for the globe library to accept it; tiles answer "not found"
      if (/\/tile\//.test(p)) return { status: 404, type: 'text/plain', body: 'no tile in the sample data' };
      return J({ currentVersion: 11.5, copyrightText: 'Sample', bandCount: 1, capabilities: 'Image',
        spatialReference: { wkid: 102100, latestWkid: 3857 },
        extent: { xmin: -20037508.34, ymin: -20037508.34, xmax: 20037508.34, ymax: 20037508.34, spatialReference: { wkid: 102100, latestWkid: 3857 } },
        tileInfo: { rows: 256, cols: 256, dpi: 96, format: 'LERC', spatialReference: { wkid: 102100, latestWkid: 3857 },
          lods: Array.from({ length: 17 }, (_, level) => ({ level, resolution: 156543.03392800014 / 2 ** level, scale: 591657527.591555 / 2 ** level })) } });
    case 'tiles.openseamap.org': return tile;
    default: return /\.tiles\.openrailwaymap\.org$/.test(host) ? tile : null;
  }
}
