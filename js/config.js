// GodView central configuration.
// Everything you are likely to tweak lives here: library versions, data
// endpoints, refresh intervals, default view and the colour theme.

export const APP = {
  name: 'GodView',
  version: '2.0.0',
};

// Libraries (pinned versions, loaded from the jsDelivr CDN).
export const LIBS = {
  cesiumBase: 'https://cdn.jsdelivr.net/npm/cesium@1.147.0/Build/Cesium/',
  satellite: 'https://cdn.jsdelivr.net/npm/satellite.js@7.2.0/dist/index.js',
};

// Where the globe starts if the user has not saved their own start point.
export const DEFAULT_START = {
  name: 'Georgia, USA',
  lat: 32.75,
  lon: -83.45,
  heightKm: 900,
};

// Base maps. All keyless; attribution text is shown on screen.
export const BASEMAPS = {
  satellite: {
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    credit: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
  dark: {
    name: 'Dark map (CARTO)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 19,
    credit: 'Map: © OpenStreetMap contributors, © CARTO',
  },
  streets: {
    name: 'Streets (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    credit: 'Map: © OpenStreetMap contributors',
  },
};

// Data sources. Each layer reads its own entry. {placeholders} are filled in by the layer.
export const ENDPOINTS = {
  // Air
  flights: {
    adsblol: 'https://api.adsb.lol/v2/point/{lat}/{lon}/{radiusNm}',
    opensky: 'https://opensky-network.org/api/states/all?lamin={lamin}&lomin={lomin}&lamax={lamax}&lomax={lomax}',
    airplaneslive: 'https://api.airplanes.live/v2/point/{lat}/{lon}/{radiusNm}',
  },
  military: 'https://api.adsb.lol/v2/mil',
  squawk: 'https://api.adsb.lol/v2/sqk/{code}',
  faaStatus: 'https://nasstatus.faa.gov/api/airport-status-information',
  // Space
  celestrak: 'https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=JSON',
  launches: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=40&mode=normal',
  aurora: 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  // Sea
  tideStations: 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels',
  tideData: 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station={id}&product={product}&date={date}&datum=MLLW&units=metric&time_zone=gmt&format=json&application=GodView',
  buoys: 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt',
  // Weather
  rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
  nwsAlerts: 'https://api.weather.gov/alerts/active?status=actual&message_type=alert',
  spcReports: 'https://www.spc.noaa.gov/climo/reports/today.csv',
  spcOutlook: 'https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson',
  nhc: 'https://www.nhc.noaa.gov/CurrentStorms.json',
  gibsTile: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/{matrix}/{z}/{y}/{x}.{ext}',
  openMeteo: 'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}' +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover' +
    '&wind_speed_unit=kmh&timezone=auto',
  openMeteoGrid: 'https://api.open-meteo.com/v1/forecast?latitude={lats}&longitude={lons}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=kmh',
  airQualityGrid: 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lats}&longitude={lons}&current=us_aqi,pm2_5,pm10,ozone',
  // Earth hazards
  earthquakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days={days}&limit=500',
  firePerimeters: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query' +
    '?where=1%3D1&outFields=poly_IncidentName,attr_IncidentSize,attr_PercentContained,attr_FireDiscoveryDateTime,poly_GISAcres,attr_POOState' +
    '&f=geojson&maxAllowableOffset=0.005&geometryPrecision=4&orderByFields=poly_GISAcres%20DESC&resultRecordCount=400',
  fireIncidents: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query' +
    '?where=IncidentTypeCategory%3D%27WF%27&outFields=IncidentName,IncidentSize,PercentContained,FireDiscoveryDateTime,POOState,POOCounty,UniqueFireIdentifier&f=geojson&resultRecordCount=2000',
  firms: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{w},{s},{e},{n}/1',
  volcanoes: 'https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes',
  riverGauges: 'https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin={w}&bbox.ymin={s}&bbox.xmax={e}&bbox.ymax={n}&srid=EPSG_4326',
  drought: 'https://droughtmonitor.unl.edu/data/json/usdm_current.json',
  // Ground & infrastructure
  ga511Cameras: 'https://511ga.org/api/v2/get/cameras?key={key}&format=json',
  ga511Events: 'https://511ga.org/api/v2/get/event?key={key}&format=json',
  caltransCctv: 'https://cwwp2.dot.ca.gov/data/d{d}/cctv/cctvStatusD{dd}.json',
  amtrak: 'https://api-v3.amtraker.com/v3/trains',
  overpass: 'https://overpass-api.de/api/interpreter?data={q}',
  overpassMirrors: ['https://overpass.private.coffee/api/interpreter?data={q}', 'https://overpass.kumi.systems/api/interpreter?data={q}'],
  cables: 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json',
  // Signals & media
  radio: 'https://de1.api.radio-browser.info/json/stations/search?geo_lat={lat}&geo_long={lon}&geo_distance={m}&has_geo_info=true&hidebroken=true&order=clickcount&reverse=true&limit=150',
  wikiSummary: 'https://en.wikipedia.org/api/rest_v1/page/summary/{title}',
  wikipedia: 'https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord={lat}%7C{lon}&gsradius=10000&gslimit=100&format=json&origin=*',
  inaturalist: 'https://api.inaturalist.org/v1/observations?nelat={n}&nelng={e}&swlat={s}&swlng={w}&d1={d1}&per_page=150&order_by=observed_on&verifiable=true&photos=true',
  // Tools
  geocodeOpenMeteo: 'https://geocoding-api.open-meteo.com/v1/search?name={q}&count=8&language=en&format=json',
  geocodeNominatim: 'https://nominatim.openstreetmap.org/search?q={q}&format=jsonv2&limit=6',
};

// Hosts the app may reach THROUGH the data relay (Settings > Data relay) when
// the browser is not allowed to call them directly. This must match ALLOWED_HOSTS
// in extras/flight-relay-worker.js; a host missing there gets "Host not allowed".
// "only" = always use the relay (direct is known to be blocked);
// "fallback" = try direct first, use the relay only if the browser blocks it.
export const RELAY_HOSTS = {
  'api.adsb.lol': 'only',
  'opensky-network.org': 'only',
  'api.airplanes.live': 'only',
  'opendata.adsb.fi': 'only',
  'nasstatus.faa.gov': 'only',
  'www.ndbc.noaa.gov': 'only',
  'www.nhc.noaa.gov': 'only',
  'droughtmonitor.unl.edu': 'only',
  'www.submarinecablemap.com': 'only',
  '511ga.org': 'only',
  'services3.arcgis.com': 'fallback',
  'firms.modaps.eosdis.nasa.gov': 'fallback',
  'overpass-api.de': 'fallback',
};

// Optional free keys. A layer that needs one stays off with a note until the
// key is entered in Settings > API keys. The key never leaves this browser
// except inside requests to that service (through your own relay if needed).
export const KEYS = {
  ga511: { name: 'Georgia 511 developer key', url: 'https://511ga.org/developers/doc' },
  firms: { name: 'NASA FIRMS map key', url: 'https://firms.modaps.eosdis.nasa.gov/api/map_key/' },
};

// Layer groups, in panel order.
export const GROUPS = [
  { id: 'air', name: 'Air' },
  { id: 'space', name: 'Space' },
  { id: 'sea', name: 'Sea' },
  { id: 'weather', name: 'Weather' },
  { id: 'hazards', name: 'Earth hazards' },
  { id: 'ground', name: 'Ground & infrastructure' },
  { id: 'signals', name: 'Signals & media' },
];

// Refresh intervals in seconds (defaults; the user can change them in Settings).
// "min" stops anyone setting a value that would break a provider's rate limit.
// 0 = load once (and again when the view or a setting changes).
export const INTERVALS = {
  flights: { def: 60, min: 30 },
  military: { def: 90, min: 60 },
  emergency: { def: 120, min: 60 },
  airportDelays: { def: 300, min: 120 },
  airports: { def: 0, min: 0 },
  satellites: { def: 7200, min: 7200 },   // CelesTrak updates every 2 h; re-downloading sooner gets you blocked
  satStations: { def: 7200, min: 7200 },
  satStarlink: { def: 7200, min: 7200 },
  satGps: { def: 7200, min: 7200 },
  satWeather: { def: 7200, min: 7200 },
  satGeo: { def: 7200, min: 7200 },
  launches: { def: 3600, min: 1800 },     // Launch Library 2: 15 requests/hour without a key
  aurora: { def: 600, min: 300 },
  daynight: { def: 60, min: 30 },
  tides: { def: 86400, min: 3600 },
  buoys: { def: 900, min: 600 },
  radar: { def: 300, min: 120 },
  alerts: { def: 180, min: 60 },
  spcReports: { def: 600, min: 300 },
  spcOutlook: { def: 1800, min: 600 },
  hurricanes: { def: 900, min: 600 },
  gibsTrue: { def: 21600, min: 3600 },
  gibsNight: { def: 0, min: 0 },
  tempGrid: { def: 900, min: 600 },
  airQuality: { def: 1800, min: 900 },
  earthquakes: { def: 120, min: 60 },
  events: { def: 900, min: 300 },
  firePerimeters: { def: 1800, min: 600 },
  fireIncidents: { def: 900, min: 300 },
  firms: { def: 1800, min: 900 },
  volcanoes: { def: 1800, min: 600 },
  rivers: { def: 900, min: 600 },
  drought: { def: 43200, min: 21600 },
  ga511Cameras: { def: 1800, min: 600 },  // GA 511: 10 calls per minute
  ga511Events: { def: 300, min: 120 },
  caltrans: { def: 1800, min: 600 },
  amtrak: { def: 120, min: 60 },
  bikeshare: { def: 300, min: 120 },
  powerPlants: { def: 0, min: 0 },        // OpenStreetMap: reloads when you move the view
  nuclear: { def: 0, min: 0 },
  alpr: { def: 0, min: 0 },
  cellTowers: { def: 0, min: 0 },
  cables: { def: 0, min: 0 },
  radio: { def: 0, min: 0 },
  wikipedia: { def: 0, min: 0 },
  inaturalist: { def: 1800, min: 600 },
};

// How often moving things (satellites, aircraft) are redrawn, in ms.
export const TICK_MS = 1000;
export const TICK_MS_FOLLOWING = 250;

// Network behaviour.
export const NET = {
  timeoutMs: 15000,
  maxBackoffSec: 900,
};

// Colour theme. These become CSS variables (--gv-bg, --gv-accent, ...) at start-up,
// so the whole look can be changed here.
export const THEME = {
  bg: '#07090c',
  panel: 'rgba(12, 16, 21, 0.92)',
  panelSolid: '#0c1015',
  line: 'rgba(255, 255, 255, 0.10)',
  text: '#e8edf2',
  muted: '#8b97a5',
  accent: '#3ee6c4',
  warn: '#ffb020',
  bad: '#ff4d5e',
  good: '#3ee67a',
  radius: '14px',
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
};

// Map-object colours per layer (used by the globe, not CSS).
export const COLORS = {
  flights: '#ffd34d',
  satellites: '#7fd8ff',
  stations: '#ff7ad9',
  quakes: '#ff5a36',
  fire: '#ff7a1a',
  event: '#c8a2ff',
  me: '#3ee6c4',
};

// Aircraft details shown when you tap a plane (v4). Both allow direct browser
// access (CORS tested). adsbdb route data may not be copied into other
// databases, so it is only looked up on tap and kept in memory.
export const AIRCRAFT_INFO = {
  adsbdb: 'https://api.adsbdb.com/v0/aircraft/{hex}?callsign={callsign}',
  adsbdbCallsign: 'https://api.adsbdb.com/v0/callsign/{callsign}',
  photo: 'https://api.planespotters.net/pub/photos/hex/{hex}',
};

// ---------------------------------------------------------------------------
// PEOPLE & RECORDS group (js/layers/people-*.js). Kept in one block so it can
// be moved or removed in one piece. Privacy rules: js/layers/lib/privacy.js.
GROUPS.push({ id: 'people', name: 'People & records' });

Object.assign(ENDPOINTS, {
  // Census TIGERweb: state, county, tract, place, school and legislative districts for a point.
  peopleTigerIdentify: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/identify' +
    '?geometry={lon},{lat}&geometryType=esriGeometryPoint&sr=4326&layers=all&tolerance=0&mapExtent={w},{s},{e},{n}&imageDisplay=100,100,96&returnGeometry=false&f=json',
  // Districts of the Congress in session when TIGERweb's newest set is for the next one.
  peopleTigerCd: 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/{layer}/query' +
    '?geometry={lon},{lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false&f=json',
  peopleTigerCdLayers: { 119: 4 },  // Legislative/MapServer layer id per Congress (120th comes from the identify call)
  peopleLegislators: 'https://unitedstates.github.io/congress-legislators/legislators-current.json',
  peopleOpenStatesCsv: 'https://data.openstates.org/people/current/{st}.csv',
  peopleOpenStatesGeo: 'https://v3.openstates.org/people.geo?lat={lat}&lng={lon}&include=links&apikey={key}',
  peopleFecTotals: 'https://api.open.fec.gov/v1/candidate/{id}/totals/?api_key={key}&sort=-cycle&per_page=1',
  peopleSparql: 'https://query.wikidata.org/sparql?format=json&query={q}',
  // Census numbers: Census Reporter (keyless, CORS) first; the Census API (needs a free key, via the relay) as fallback.
  peopleCensusReporter: 'https://api.censusreporter.org/1.0/data/show/latest?table_ids={tables}&geo_ids={geos}',
  peopleAcs: 'https://api.census.gov/data/{year}/acs/acs5?get={vars}&for={for}&in={in}&key={key}',
  peopleAcsYears: [2024, 2023],
  peopleUsaspending: 'https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/',
  peopleEcho: 'https://echodata.epa.gov/echo/echo_rest_services.get_facility_info?output=JSON&p_lat={lat}&p_long={lon}&p_radius={mi}&p_act=Y&responseset=500',
  // One state at a time (filters=STALP:GA, the documented form), nearest ones kept in the browser.
  peopleFdic: 'https://api.fdic.gov/banks/locations?filters={f}&fields=NAME,OFFNAME,ADDRESS,CITY,STALP,LATITUDE,LONGITUDE,SERVTYPE,ESTYMD,CERT,MAINOFF,UNINUMBR&limit=10000',
  peopleNcmec: 'https://www.missingkids.org/missingkids/servlet/XmlServlet?act=rss&LanguageCountry=en_US&orgPrefix=NCMC&state={st}',
  peopleFema: 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter={f}&$orderby=declarationDate%20desc&$top=40',
});

// Hosts to add to ALLOWED_HOSTS in extras/flight-relay-worker.js (not edited here).
Object.assign(RELAY_HOSTS, {
  'tigerweb.geo.census.gov': 'fallback',
  'data.openstates.org': 'fallback',
  'v3.openstates.org': 'fallback',
  'api.open.fec.gov': 'fallback',
  'api.census.gov': 'only',          // no CORS; needs a key
  'api.censusreporter.org': 'fallback',
  'echodata.epa.gov': 'fallback',
  'api.fdic.gov': 'fallback',
  'www.fema.gov': 'fallback',
  'www.missingkids.org': 'only',
});

// Optional keys: the layers work without them (Open States: state legislators
// straight from its key-based API; FEC: higher limit than the shared DEMO_KEY).
Object.assign(KEYS, {
  openstates: { name: 'Open States API key (optional)', url: 'https://open.pluralpolicy.com/accounts/profile/' },
  fec: { name: 'api.data.gov key for FEC (optional)', url: 'https://api.data.gov/signup/' },
  census: { name: 'Census API key (optional backup source)', url: 'https://api.census.gov/data/key_signup.html' },
});

Object.assign(INTERVALS, {
  peopleOfficials: { def: 0, min: 0 },   // reloads when the view moves
  peopleCensus: { def: 0, min: 0 },
  peopleNotable: { def: 0, min: 0 },
  peopleMoney: { def: 0, min: 0 },
  peopleEpa: { def: 0, min: 0 },
  peopleCare: { def: 0, min: 0 },
  peopleBanks: { def: 0, min: 0 },
  peopleMissing: { def: 3600, min: 1800 },
  peopleFema: { def: 3600, min: 1800 },
});
