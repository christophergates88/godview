// GodView central configuration.
// Everything you are likely to tweak lives here: library versions, data
// endpoints, refresh intervals, default view and the colour theme.

export const APP = {
  name: 'GodView',
  version: '1.0.0',
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

// Data sources. Each layer reads its own entry.
export const ENDPOINTS = {
  earthquakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson',
  celestrak: 'https://celestrak.org/NORAD/elements/gp.php?GROUP={group}&FORMAT=JSON',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days={days}&limit=500',
  nwsAlerts: 'https://api.weather.gov/alerts/active?status=actual&message_type=alert',
  rainviewer: 'https://api.rainviewer.com/public/weather-maps.json',
  openMeteo: 'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}' +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover' +
    '&wind_speed_unit=kmh&timezone=auto',
  geocodeOpenMeteo: 'https://geocoding-api.open-meteo.com/v1/search?name={q}&count=8&language=en&format=json',
  geocodeNominatim: 'https://nominatim.openstreetmap.org/search?q={q}&format=jsonv2&limit=6',
  // Flight providers are tried in this order. See README: none of these was
  // confirmed to allow direct browser access (CORS); the layer reports
  // clearly if all are blocked. A "relay" URL in Settings fixes that.
  flights: {
    opensky: 'https://opensky-network.org/api/states/all?lamin={lamin}&lomin={lomin}&lamax={lamax}&lomax={lomax}',
    airplaneslive: 'https://api.airplanes.live/v2/point/{lat}/{lon}/{radiusNm}',
  },
};

// Refresh intervals in seconds (defaults; the user can change them in Settings).
// "min" stops anyone setting a value that would break a provider's rate limit.
export const INTERVALS = {
  flights: { def: 60, min: 30 },      // OpenSky anonymous: 400 credits/day
  satellites: { def: 7200, min: 7200 }, // CelesTrak updates every 2 h; re-downloading sooner gets you blocked
  earthquakes: { def: 120, min: 60 },  // USGS updates feeds every minute
  events: { def: 900, min: 300 },      // NASA EONET
  radar: { def: 300, min: 120 },       // RainViewer: new frame every 10 min
  alerts: { def: 180, min: 60 },       // NWS
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
