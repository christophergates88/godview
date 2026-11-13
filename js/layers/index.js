// THE LAYER LIST.
// To add a layer: create a file in this folder (copy _template.js), then add
// one import and one entry to the list below. Order here = order in the panel.
//
// Every layer is a plain object with these fields:
//
//   id          short unique name, e.g. 'earthquakes' (also the Settings key)
//   group       panel group: air, space, sea, weather, hazards, ground, signals (see config GROUPS)
//   defaultOn   true = on for a first-time visitor
//   needsKey    optional: name of a free API key (config KEYS); layer waits until it is entered
//   name        label shown in the panel
//   icon        a small inline SVG string (24x24 viewBox) for the panel
//   color       accent colour for the panel chip
//   attribution text crediting the data source (shown in Settings > Sources)
//   interval    refresh interval in seconds is read from config.js INTERVALS[id]
//
//   init(ctx)              optional, runs once when first turned on
//   fetch(ctx)             async, returns raw data. Throw on failure (the app shows the error).
//   render(ctx, data)      draws the data on the globe, returns the item count
//   count(ctx, data)       item count without drawing (used by GodView.selfTest())
//   items(ctx)             optional, loaded items [{lat, lon, title}] for the "What's here" briefing
//   brief(ctx, point)      optional, custom briefing lines for a point
//   details(ctx, key)      optional async extra card info loaded when the card opens
//   describe(ctx, key)     returns the detail card for one tapped item:
//                          { title, subtitle, rows: [[label, value], ...], link, followable }
//   position(ctx, key)     optional, current Cesium.Cartesian3 of an item (needed for "Follow")
//   followRange            optional, camera distance in metres when following
//   tick(ctx, now)         optional, called every second for moving things
//   show(ctx, visible)     optional, extra work when toggled (primitives/entities hide automatically)
//   onViewChange(ctx, v)   optional, return true to reload after the camera moves
//   onSettingChange(ctx,k) optional, return true to reload after a setting changes
//   onSelect(ctx, key)     optional, highlight the tapped item (key is null when deselected)
//
// ctx gives the layer: Cesium, viewer, scene, primitives (a collection that
// hides with the layer), entities, settings, fmt (unit formatting), net
// (get(url) picks direct or relay automatically, fillUrl, cache, FeedError),
// key(name), globe (makeIcon, ...), view(), requestRender(), setNote(text).
// ctx.test is true during GodView.selfTest(): fetch must not change saved state.
//
// SHORTCUTS: most layers are built with a factory in ./lib:
//   makePointLayer (points with a card), makeShapeLayer (areas and lines),
//   makeImageryLayer (whole-globe picture tiles). See _template.js.

// Air
import flights from './flights.js';
import military from './military.js';
import emergency from './emergency.js';
import airportDelays from './airport-delays.js';
import airports from './airports.js';
// Space
import satellites from './satellites.js';
import satStations from './sat-stations.js';
import satStarlink from './sat-starlink.js';
import satGps from './sat-gps.js';
import satWeather from './sat-weather.js';
import satGeo from './sat-geo.js';
import launches from './launches.js';
import aurora from './aurora.js';
import daynight from './daynight.js';
// Sea
import tides from './tides.js';
import buoys from './buoys.js';
// Weather
import radar from './radar.js';
import alerts from './alerts.js';
import spcReports from './spc-reports.js';
import spcOutlook from './spc-outlook.js';
import hurricanes from './hurricanes.js';
import gibsTrue from './gibs-true.js';
import gibsNight from './gibs-night.js';
import tempGrid from './temp-grid.js';
import airQuality from './air-quality.js';
// Earth hazards
import earthquakes from './earthquakes.js';
import events from './events.js';
import firePerimeters from './fire-perimeters.js';
import fireIncidents from './fire-incidents.js';
import firms from './firms.js';
import volcanoes from './volcanoes.js';
import rivers from './rivers.js';
import drought from './drought.js';
// Ground & infrastructure
import ga511Cameras from './ga511-cameras.js';
import ga511Events from './ga511-events.js';
import caltrans from './caltrans.js';
import amtrak from './amtrak.js';
import bikeshare from './bikeshare.js';
import powerPlants from './power-plants.js';
import nuclear from './nuclear.js';
import alpr from './alpr.js';
import cellTowers from './cell-towers.js';
import cables from './cables.js';
// Signals & media
import radio from './radio.js';
import wikipedia from './wikipedia.js';
import inaturalist from './inaturalist.js';
// People & records (organizations, public roles, aggregates only; see lib/privacy.js)
import peopleOfficials from './people-officials.js';
import peopleCensus from './people-census.js';
import peopleNotable from './people-notable.js';
import peopleMoney from './people-money.js';
import peopleEpa from './people-epa.js';
import peopleCare from './people-care.js';
import peopleBanks from './people-banks.js';
import peopleFema from './people-fema.js';
import peopleMissing from './people-missing.js';

export const LAYERS = [
  flights, military, emergency, airportDelays, airports,
  satellites, satStations, satStarlink, satGps, satWeather, satGeo, launches, aurora, daynight,
  tides, buoys,
  radar, alerts, spcReports, spcOutlook, hurricanes, gibsTrue, gibsNight, tempGrid, airQuality,
  earthquakes, events, firePerimeters, fireIncidents, firms, volcanoes, rivers, drought,
  ga511Cameras, ga511Events, caltrans, amtrak, bikeshare, powerPlants, nuclear, alpr, cellTowers, cables,
  radio, wikipedia, inaturalist,
  // People & records
  peopleOfficials, peopleCensus, peopleNotable, peopleMoney, peopleEpa, peopleCare, peopleBanks, peopleFema, peopleMissing,
];
