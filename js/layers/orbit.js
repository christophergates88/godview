// LIVE FROM ORBIT: whole-Earth pictures from NASA's GIBS service, one entry per layer.
// Product names, zoom levels and formats were read from NASA's own list
// (WMTS capabilities) on 2026-11-12 and each was loaded from the live site.
// To add one: copy a line, set NASA's product name and its deepest zoom level,
// add the id to INTERVALS in config.js.
import { gibsLayer } from './lib/gibs.js';
import { ICONS } from './lib/icons.js';

const NEWEST = 'Newest frame NASA has published';

export const ORBIT_LAYERS = [
  gibsLayer({ id: 'orbitGoesEast', name: 'Live clouds: the Americas (GOES-East)', layer: 'GOES-East_ABI_GeoColor', level: 7, every: 10, alpha: 0.93, icon: ICONS.globe, color: '#bfe3ff',
    note: `${NEWEST}, usually about an hour old, with a new one every 10 minutes. True colour by day; infrared with city lights by night.` }),
  gibsLayer({ id: 'orbitGoesWest', name: 'Live clouds: the Pacific (GOES-West)', layer: 'GOES-West_ABI_GeoColor', level: 7, every: 10, alpha: 0.93, icon: ICONS.globe, color: '#bfe3ff',
    note: `${NEWEST}, usually about an hour old, with a new one every 10 minutes.` }),
  gibsLayer({ id: 'orbitHimawari', name: 'Live clouds in infrared: Asia and Australia (Himawari)', layer: 'Himawari_AHI_Band13_Clean_Infrared', level: 6, every: 10, alpha: 0.8, icon: ICONS.globe, color: '#d7c9ff',
    note: `${NEWEST}, usually about an hour old. Brighter means colder, higher cloud tops.` }),
  gibsLayer({ id: 'orbitRain', name: 'Rain and snow falling, worldwide', layer: 'IMERG_Precipitation_Rate_30min', level: 6, every: 30, alpha: 0.8, icon: ICONS.cloud, color: '#4da3ff',
    note: `${NEWEST}: a half-hour estimate from the GPM satellites, usually 5 to 7 hours behind. Green is light, red is heavy.` }),
  gibsLayer({ id: 'orbitSst', name: 'Sea surface temperature', layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', level: 7, every: 360, alpha: 0.8, icon: ICONS.thermo, color: '#ff8a3d',
    note: `${NEWEST}: a daily blend of satellites and buoys, a day or two behind. Blue is cold, red is warm.` }),
  gibsLayer({ id: 'orbitSnow', name: 'Snow on the ground', layer: 'MODIS_Terra_NDSI_Snow_Cover', level: 8, every: 360, alpha: 0.85, icon: ICONS.cloud, color: '#e8f4ff',
    note: `${NEWEST}: what the Terra satellite saw on its latest daytime pass. Cloudy areas and the night side are blank.` }),
  gibsLayer({ id: 'orbitSmoke', name: 'Smoke, dust and haze', layer: 'MODIS_Combined_Value_Added_AOD', level: 6, every: 360, alpha: 0.75, icon: ICONS.air, color: '#c9a36b',
    note: `${NEWEST}: how much the air dims sunlight (aerosol optical depth), a day or two behind. Darker red-brown is thicker.` }),
  gibsLayer({ id: 'orbitNo2', name: 'Air pollution from traffic and industry (NO2)', layer: 'OMI_Nitrogen_Dioxide_Tropo_Column', level: 6, every: 720, alpha: 0.7, icon: ICONS.air, color: '#b04dff',
    note: `${NEWEST}: nitrogen dioxide in the lower air, from the Aura satellite, several days behind.` }),
  gibsLayer({ id: 'orbitFlood', name: 'Flood water seen from space (3-day)', layer: 'MODIS_Combined_Flood_3-Day', level: 9, every: 360, alpha: 0.85, icon: ICONS.wave, color: '#3d7bff',
    note: `${NEWEST}: water where there is normally land, from three days of satellite passes. Red is flood, blue is normal water. Zoom in.` }),
  gibsLayer({ id: 'orbitNight', name: 'Earth last night (city lights, moonlit clouds)', layer: 'VIIRS_NOAA20_DayNightBand', level: 7, every: 360, alpha: 0.9, icon: ICONS.moon, color: '#ffe9a6',
    note: `${NEWEST}: last night as the NOAA-20 satellite saw it. Unlike the "Night lights" layer, this one is new every night.` }),
  gibsLayer({ id: 'orbitPeople', name: 'Where people live (population density)', layer: 'GPW_Population_Density_2020', level: 7, every: 0, alpha: 0.7, icon: ICONS.pin, color: '#ff7ad9',
    note: 'People per square kilometre in 2020 (NASA SEDAC). Darker is denser. This is a count of people, not a picture, and it does not change.' }),
];
