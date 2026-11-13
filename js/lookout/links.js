// Links to the official and public sites for a place (they open in Safari from the iPhone app).

import { STATES } from './common.js';

// Each state's own 511 / traffic site.
export const STATE_511 = { AL: 'https://algotraffic.com', AK: 'https://511.alaska.gov', AZ: 'https://az511.gov', AR: 'https://idrivearkansas.com', CA: 'https://cwwp2.dot.ca.gov/vm/iframemap.htm', CO: 'https://maps.cotrip.org', CT: 'https://ctroads.org', DE: 'https://deldot.gov/map', FL: 'https://fl511.com', GA: 'https://511ga.org', HI: 'https://goakamai.org', ID: 'https://511.idaho.gov', IL: 'https://www.gettingaroundillinois.com', IN: 'https://511in.org', IA: 'https://511ia.org', KS: 'https://kandrive.gov', KY: 'https://goky.ky.gov', LA: 'https://511la.org', ME: 'https://newengland511.org', MD: 'https://chart.maryland.gov', MA: 'https://mass511.com', MI: 'https://mdotjboss.state.mi.us/MiDrive/map', MN: 'https://511mn.org', MS: 'https://mdottraffic.com', MO: 'https://traveler.modot.org/map', MT: 'https://www.511mt.net', NE: 'https://new.511.nebraska.gov', NV: 'https://nvroads.com', NH: 'https://newengland511.org', NJ: 'https://511nj.org', NM: 'https://nmroads.com', NY: 'https://511ny.org', NC: 'https://drivenc.gov', ND: 'https://travelfiles.dot.nd.gov', OH: 'https://ohgo.com', OK: 'https://oktraffic.org', OR: 'https://tripcheck.com', PA: 'https://511pa.com', RI: 'https://www.dot.ri.gov/travel', SC: 'https://511sc.org', SD: 'https://sd511.org', TN: 'https://smartway.tn.gov', TX: 'https://drivetexas.org', UT: 'https://udottraffic.utah.gov', VT: 'https://newengland511.org', VA: 'https://511.vdot.virginia.gov', WA: 'https://wsdot.com/travel/real-time/map', WV: 'https://wv511.org', WI: 'https://511wi.gov', WY: 'https://map.wyoroad.info', DC: 'https://ddot.dc.gov' };

const g = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

export function placeName(p) { return [p.city || p.name, p.state].filter(Boolean).join(', '); }

export function safetyLinks(p) {
  const place = placeName(p);
  const county = [p.county, p.state].filter(Boolean).join(' ');
  const stateName = STATES[p.state] || p.stateName || '';
  return [
    { icon: 'bolt', title: 'Power outages', sub: `By county in ${stateName || 'your state'}`, href: stateName ? `https://poweroutage.us/area/state/${encodeURIComponent(stateName.toLowerCase())}` : 'https://poweroutage.us/' },
    { icon: 'shield', title: 'Recent crime map', sub: place, href: `https://www.crimemapping.com/map/location/${encodeURIComponent(place)}` },
    { icon: 'shield', title: 'Citizen', sub: 'Real-time 911 incident alerts (big cities)', href: 'https://citizen.com/explore' },
    { icon: 'fire', title: 'Wildfires', sub: 'InciWeb: active incidents', href: 'https://inciweb.wildfire.gov/' },
    { icon: 'shield', title: 'Emergency info for your county', sub: county || place, href: g(`${county || place} emergency management alerts`) },
  ];
}

export function trafficLinks(p) {
  const out = [];
  if (STATE_511[p.state]) out.push({ icon: 'road', title: `${p.state} 511 traffic`, sub: 'Official state road conditions and cameras', href: STATE_511[p.state] });
  out.push({ icon: 'car', title: 'Waze live map', sub: 'Crashes, police and slowdowns reported by drivers', href: `https://www.waze.com/live-map/directions?latlng=${p.lat.toFixed(5)}%2C${p.lon.toFixed(5)}` });
  out.push({ icon: 'cam', title: 'Windy webcam map', sub: 'Every public webcam on a map', href: `https://www.windy.com/-Webcams/webcams?${p.lat.toFixed(3)},${p.lon.toFixed(3)},10` });
  return out;
}

export function scannerLinks(p) {
  const county = [p.county, p.state].filter(Boolean).join(' ');
  const place = placeName(p);
  return [
    { icon: 'radio', title: 'Broadcastify', sub: `The biggest scanner directory · look for ${p.county || p.city || 'your county'}`, href: 'https://www.broadcastify.com/listen/' },
    { icon: 'radio', title: 'OpenMHz', sub: 'Every system with recorded dispatch calls', href: 'https://openmhz.com/systems' },
    { icon: 'radio', title: 'Search scanner feeds', sub: county || place, href: g(`${county || place} police scanner live`) },
  ];
}

export function newsLinks(p) {
  const place = placeName(p);
  return [
    { icon: 'news', title: 'Google News', sub: place, href: `https://news.google.com/search?q=${encodeURIComponent(place)}&hl=en-US&gl=US&ceid=US:en` },
    { icon: 'news', title: 'Breaking now', sub: 'Google News, last hour', href: `https://news.google.com/search?q=${encodeURIComponent(`${place} when:1h`)}&hl=en-US&gl=US&ceid=US:en` },
  ];
}
