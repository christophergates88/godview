// EARTH PACK: the "Live from orbit" pictures and the extra live systems added on
// 2026-11-12. Kept in one list so it can be moved or removed in one piece.
// Every address behind these layers was loaded from the live site before it was added.
import { ORBIT_LAYERS } from './orbit.js';
import nexrad from './nexrad.js';
import radarSites from './radar-sites.js';
import gdacs from './gdacs.js';
import usgsWater from './usgs-water.js';
import dsn from './dsn.js';
import shipsBaltic from './ships-baltic.js';
import waves from './waves.js';
import seamarks from './seamarks.js';
import powerLines from './power-lines.js';
import rail from './rail.js';
import terrain from './terrain.js';
import netOutages from './net-outages.js';

export const EARTH_LAYERS = [
  ...ORBIT_LAYERS,
  nexrad, radarSites,
  gdacs, usgsWater,
  dsn,
  shipsBaltic, waves, seamarks,
  powerLines, rail, terrain,
  netOutages,
];
