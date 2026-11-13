// Sample responses for the "People & records" layers. Hand-made to match each
// provider's documented format (field names and structure). NOT real data:
// every person and organization name below is invented, apart from field names.
// Map positions are small offsets from the shared selfTest view (33.3, -83.4);
// move them with it if that view changes.

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// Census TIGERweb tigerWMS_Current identify (layerName + attributes).
export const tigerIdentify = () => ({
  results: [
    { layerId: 80, layerName: 'States', attributes: { GEOID: '13', NAME: 'Georgia', BASENAME: 'Georgia', STATE: '13', INTPTLAT: '+32.6295789', INTPTLON: '-083.4235109' } },
    { layerId: 82, layerName: 'Counties', attributes: { GEOID: '13021', NAME: 'Bibb County', BASENAME: 'Bibb', STATE: '13', COUNTY: '021', INTPTLAT: '+32.8065', INTPTLON: '-083.6974' } },
    { layerId: 8, layerName: 'Census Tracts', attributes: { GEOID: '13021012500', NAME: 'Census Tract 125', BASENAME: '125', STATE: '13', COUNTY: '021', TRACT: '012500', INTPTLAT: '+33.3001', INTPTLON: '-083.4102' } },
    { layerId: 28, layerName: 'Incorporated Places', attributes: { GEOID: '1349008', NAME: 'Macon-Bibb County', BASENAME: 'Macon-Bibb County', STATE: '13', INTPTLAT: '+32.8407', INTPTLON: '-083.6324' } },
    { layerId: 14, layerName: 'Unified School Districts', attributes: { GEOID: '1300390', NAME: 'Bibb County School District', STATE: '13' } },
    { layerId: 54, layerName: '120th Congressional Districts', attributes: { GEOID: '1310', NAME: 'Congressional District 10', BASENAME: '10', CD120: '10', STATE: '13' } },
    { layerId: 56, layerName: '2026 State Legislative Districts - Upper', attributes: { GEOID: '13025', NAME: 'State Senate District 25', BASENAME: '25', SLDU: '025', STATE: '13' } },
    { layerId: 58, layerName: '2026 State Legislative Districts - Lower', attributes: { GEOID: '13144', NAME: 'State House District 144', BASENAME: '144', SLDL: '144', STATE: '13' } },
    { layerId: 13, layerName: '2020 Census Blocks Labels', attributes: { GEOID: '130210125001000' } },
  ],
});
export const tigerCd = () => ({ features: [{ attributes: { GEOID: '1310', NAME: 'Congressional District 10', BASENAME: '10', CD119: '10', CDSESSN: '119', STATE: '13' } }] });

// @unitedstates congress-legislators (legislators-current.json): invented people.
const leg = (first, last, type, district, party, bio, fec, gt, rank) => ({
  id: { bioguide: bio, govtrack: gt, fec: [fec] }, name: { first, last, official_full: `${first} ${last}` }, bio: { birthday: '1970-01-01', gender: 'F' },
  terms: [{ type, start: '2025-01-03', end: '2031-01-03', state: 'GA', ...(district != null ? { district } : { class: 2, state_rank: rank }), party, url: `https://www.${last.toLowerCase()}.senate.gov`, phone: '202-224-0000', contact_form: `https://www.${last.toLowerCase()}.senate.gov/contact`, address: '100 Russell Senate Office Building Washington DC 20510' }],
});
export const legislators = () => [
  leg('Alexandra', 'Sample', 'sen', null, 'Democrat', 'S000901', 'S0GA00901', 400901, 'senior'),
  leg('Benjamin', 'Example', 'sen', null, 'Democrat', 'E000902', 'S0GA00902', 400902, 'junior'),
  leg('Carla', 'Testperson', 'rep', 10, 'Republican', 'T000903', 'H0GA10903', 400903),
  leg('Dmitri', 'Otherdistrict', 'rep', 9, 'Republican', 'O000904', 'H0GA09904', 400904),
  { ...leg('Elena', 'Elsewhere', 'sen', null, 'Republican', 'E000905', 'S0AL00905', 400905, 'senior'), terms: [{ type: 'sen', state: 'AL', party: 'Republican', url: 'https://x.senate.gov' }] },
];

// Open States nightly CSV (data.openstates.org/people/current/ga.csv).
export const openStatesCsv = () => [
  'id,name,current_party,current_district,current_chamber,given_name,family_name,gender,biography,birth_date,death_date,image,email,links,sources,capitol_address,capitol_voice,capitol_fax,district_address,district_voice,district_fax,twitter,youtube,instagram,facebook',
  'ocd-person/11111111-1111-1111-1111-111111111111,Frances Samplesenator,Republican,25,upper,Frances,Samplesenator,,,,,,frances@senate.ga.gov,https://www.legis.ga.gov/members/senate/1,,"18 Capitol Square, Atlanta, GA",404-656-0000,,"1 Home Street, Sampleville GA",,,,,,',
  'ocd-person/22222222-2222-2222-2222-222222222222,George Samplerep,Republican,144,lower,George,Samplerep,,,,,,george@house.ga.gov,https://www.legis.ga.gov/members/house/2,,"18 Capitol Square, Atlanta, GA",404-656-0001,,"2 Home Street, Sampleville GA",,,,,,',
  'ocd-person/33333333-3333-3333-3333-333333333333,Helen Otherdistrict,Democrat,26,upper,Helen,Otherdistrict,,,,,,,,,,,,,,,,,,',
].join('\n');

// Wikidata SPARQL JSON results.
const B = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: /^https?:/.test(v) ? 'uri' : 'literal', value: v }]));
export const wikidataGov = () => ({ head: { vars: ['kind', 'item', 'itemLabel', 'article', 'site'] }, results: { bindings: [
  B({ kind: 'gov', item: 'http://www.wikidata.org/entity/Q900001', itemLabel: 'Ivy Samplegovernor', article: 'https://en.wikipedia.org/wiki/Ivy_Samplegovernor', site: 'https://georgia.gov/' }),
  B({ kind: 'county', item: 'http://www.wikidata.org/entity/Q900002', itemLabel: 'Bibb County', site: 'http://www.maconbibb.us/' }),
] } });
export const wikidataNotable = () => ({ head: { vars: [] }, results: { bindings: [
  B({ p: 'http://www.wikidata.org/entity/Q900011', pLabel: 'Jules Samplewriter', pDescription: 'American writer (sample)', placeLabel: 'Sampletown', born: '1902-03-04T00:00:00Z', died: '1990-05-06T00:00:00Z', article: 'https://en.wikipedia.org/wiki/Jules_Samplewriter', lat: '33.2950', lon: '-83.4210', img: 'http://commons.wikimedia.org/wiki/Special:FilePath/Sample.jpg' }),
  B({ p: 'http://www.wikidata.org/entity/Q900012', pLabel: 'Kim Sampleathlete', pDescription: 'American athlete (sample)', placeLabel: 'Sampletown', born: '1985-01-01T00:00:00Z', article: 'https://en.wikipedia.org/wiki/Kim_Sampleathlete', lat: '33.2950', lon: '-83.4210' }),
  B({ p: 'http://www.wikidata.org/entity/Q900012', pLabel: 'Kim Sampleathlete', pDescription: 'duplicate row', placeLabel: 'Sampletown', article: 'https://en.wikipedia.org/wiki/Kim_Sampleathlete', lat: '33.2950', lon: '-83.4210' }),
  B({ p: 'http://www.wikidata.org/entity/Q900013', pLabel: 'Lee Samplemusician', pDescription: 'American musician (sample)', placeLabel: 'Otherville', born: '1950-07-07T00:00:00Z', article: 'https://en.wikipedia.org/wiki/Lee_Samplemusician', lat: '33.0801', lon: '-83.2321' }),
] } });

// Census API (ACS 5-year): header row + one value row. Numbers chosen to check the maths.
export const acs = (name = 'Census Tract 125; Bibb County; Georgia') => {
  const head = ['NAME', 'B01001_001E', 'B01002_001E'];
  const vals = [name, '1000', '44.1'];
  const add = (k, v) => { head.push(k); vals.push(String(v)); };
  const cell = (i) => `B01001_${String(i).padStart(3, '0')}E`;
  for (const i of [3, 4, 5, 6, 27, 28, 29, 30]) add(cell(i), 25);      // 200 under 18
  for (const i of [20, 21, 22, 23, 24, 25, 44, 45, 46, 47, 48, 49]) add(cell(i), i === 20 ? 30 : 20); // 250 aged 65+
  add('B11001_001E', 410); add('B19013_001E', 58250); add('B25003_001E', 410); add('B25003_002E', 320);
  add('B25035_001E', 1988); add('B08013_001E', 10000); add('B08303_001E', 400); add('C16001_001E', 950); add('C16001_002E', 900);
  add('state', '13'); add('county', '021'); add('tract', '012500');
  return [head, vals];
};

// Census Reporter /1.0/data/show: the same sample numbers, in its shape.
export const censusReporter = (geoids) => {
  const [head, vals] = acs();
  const est = {};
  head.forEach((k, i) => { if (/^[BC]\d/.test(k)) { const [t, c] = k.split('_'); (est[t] = est[t] || { estimate: {}, error: {} }).estimate[t + c.replace(/E$/, '')] = Number(vals[i]); est[t].error[t + c.replace(/E$/, '')] = 1; } });
  return { release: { id: 'acs2024_5yr', name: 'ACS 2024 5-year', years: '2020-2024' }, tables: {},
    geography: Object.fromEntries(geoids.map((g) => [g, { name: g.startsWith('05000') ? 'Bibb County, GA' : 'Census Tract 125, Bibb, GA' }])),
    data: Object.fromEntries(geoids.map((g) => [g, est])) };
};

// USAspending spending_by_category/recipient.
export const usaspending = () => ({ category: 'recipient', limit: 15, page_metadata: { page: 1, hasNext: false }, results: [
  { amount: 4200000, recipient_id: 'aaaa1111-bbbb-2222-cccc-333333333333-C', name: 'BIBB COUNTY BOARD OF EDUCATION', code: null, uei: 'UEISAMPLE001' },
  { amount: 1500000, recipient_id: 'dddd4444-eeee-5555-ffff-666666666666-P', name: 'GEORGIA POWER COMPANY', code: null, uei: 'UEISAMPLE002' },
  { amount: 90000, recipient_id: null, name: 'JOHN Q SAMPLEFARMER', code: null, uei: null },
  { amount: 50000, recipient_id: null, name: 'MULTIPLE RECIPIENTS', code: null, uei: null },
] });

// EPA ECHO get_facility_info (Results.Facilities).
export const echo = () => ({ Results: { Message: 'Success', QueryRows: '3', Facilities: [
  { RegistryID: '110000000001', FacName: 'SAMPLE TEXTILE MILL INC', FacStreet: '1 INDUSTRIAL BLVD', FacCity: 'SAMPLEVILLE', FacState: 'GA', FacLat: '33.33', FacLong: '-83.39', AIRFlag: 'Y', NPDESFlag: 'Y', RCRAFlag: 'N', CurrVioFlag: 'Y', FacSNCFlg: 'N', FacComplianceStatus: 'Violation Identified', FacInspectionCount: '4', FacDateLastInspection: '03/15/2026', FacQtrsWithNC: '3', FacFormalActionCount: '1', FacTotalPenalties: '12500' },
  { RegistryID: '110000000002', FacName: 'SAMPLEVILLE WWTP', FacStreet: '2 RIVER RD', FacCity: 'SAMPLEVILLE', FacState: 'GA', FacLat: '33.31', FacLong: '-83.40', NPDESFlag: 'Y', CurrVioFlag: 'N', FacSNCFlg: 'N', FacComplianceStatus: 'No Violation Identified', FacInspectionCount: '2', FacQtrsWithNC: '0', FacFormalActionCount: '0', FacTotalPenalties: '0' },
  { RegistryID: '110000000003', FacName: 'JOHN SMITH RESIDENCE', FacStreet: '9 ELM ST', FacCity: 'SAMPLEVILLE', FacState: 'GA', FacLat: '33.32', FacLong: '-83.38', RCRAFlag: 'Y', CurrVioFlag: 'N', FacSNCFlg: 'N', FacComplianceStatus: 'No Violation Identified', FacQtrsWithNC: '0' },
] } });

// OpenStreetMap Overpass answer for hospitals and nursing homes (invented places).
export const osmCare = () => ({ elements: [
  { type: 'node', id: 9001, lat: 33.31, lon: -83.39, tags: { amenity: 'hospital', name: 'Sample County Hospital', operator: 'Sample Hospital Authority', emergency: 'yes', 'addr:street': 'Hospital Dr', 'addr:city': 'Sampleville', website: 'https://hospital.example.org' } },
  { type: 'way', id: 9002, center: { lat: 33.29, lon: -83.41 }, tags: { amenity: 'nursing_home', name: 'Sample Oaks Health and Rehabilitation', beds: '100' } },
  { type: 'node', id: 9003, lat: 33.30, lon: -83.42, tags: { amenity: 'social_facility', social_facility: 'nursing_home', name: 'Mary Smith', 'addr:street': 'Elm St', 'addr:housenumber': '9' } },
  { type: 'node', id: 9003, lat: 33.30, lon: -83.42, tags: { amenity: 'social_facility', social_facility: 'nursing_home', name: 'Mary Smith' } },
] });

// FDIC BankFind /locations.
export const fdic = () => ({ meta: { total: 2 }, data: [
  { data: { NAME: 'Sample State Bank', OFFNAME: 'Sample State Bank', ADDRESS: '100 Main St', CITY: 'Macon', STALP: 'GA', LATITUDE: 33.290, LONGITUDE: -83.410, SERVTYPE: 11, ESTYMD: '1921-05-02', CERT: 99901, MAINOFF: 1, UNINUMBR: 5550001 }, score: 1 },
  { data: { NAME: 'Example National Bank', OFFNAME: 'Downtown Branch', ADDRESS: '200 Oak St', CITY: 'Macon', STALP: 'GA', LATITUDE: 33.310, LONGITUDE: -83.430, SERVTYPE: 11, ESTYMD: '2001-01-01', CERT: 99902, MAINOFF: 0, UNINUMBR: 5550002 }, score: 1 },
] });

// NCMEC state RSS (structure as published; invented case).
export const NCMEC_TEXT = 'SAMPLE CHILD, Age Now: 15, Missing: 10/01/2026. Missing From MACON, GA. ANYONE HAVING INFORMATION SHOULD CONTACT: Sample County Sheriff\'s Office (Georgia) 1-555-555-0100.';
export const ncmecRss = () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>NCMEC Missing Children - GA</title>
<item><title>Missing: SAMPLE CHILD (GA)</title><link>http://www.missingkids.org/poster/NCMC/1999001/1</link>
<description>${NCMEC_TEXT.replace(/'/g, '&apos;')}</description><pubDate>Thu, 01 Oct 2026 12:00:00 EDT</pubDate>
<enclosure url="http://www.missingkids.org/photographs/NCMC1999001c1t.jpg" length="1655" type="image/jpeg"/></item>
<item><title>Missing: OTHER SAMPLE (GA)</title><link>https://www.missingkids.org/poster/NCMC/1999002/1</link>
<description>OTHER SAMPLE, Age Now: 16, Missing: 09/12/2026. Missing From MACON, GA. ANYONE HAVING INFORMATION SHOULD CONTACT: Sample Police Department (Georgia) 1-555-555-0101.</description><pubDate>Sat, 12 Sep 2026 12:00:00 EDT</pubDate></item>
</channel></rss>`;

// OpenFEMA DisasterDeclarationsSummaries v2.
export const fema = () => ({ metadata: { count: 3 }, DisasterDeclarationsSummaries: [
  { femaDeclarationString: 'DR-4999-GA', disasterNumber: 4999, state: 'GA', declarationType: 'DR', declarationDate: iso(now - 40 * 86400e3), incidentType: 'Hurricane', declarationTitle: 'HURRICANE SAMPLE', fipsStateCode: '13', fipsCountyCode: '021', designatedArea: 'Bibb (County)' },
  { femaDeclarationString: 'DR-4999-GA', disasterNumber: 4999, state: 'GA', declarationType: 'DR', declarationDate: iso(now - 40 * 86400e3), incidentType: 'Hurricane', declarationTitle: 'HURRICANE SAMPLE', fipsStateCode: '13', fipsCountyCode: '021', designatedArea: 'Bibb (County)' },
  { femaDeclarationString: 'EM-3998-GA', disasterNumber: 3998, state: 'GA', declarationType: 'EM', declarationDate: iso(now - 400 * 86400e3), incidentType: 'Severe Storm', declarationTitle: 'SEVERE STORMS SAMPLE', fipsStateCode: '13', fipsCountyCode: '000', designatedArea: 'Statewide' },
] });

export const fecTotals = () => ({ results: [{ candidate_id: 'S0GA00901', cycle: 2026, receipts: 12345678, disbursements: 9876543, cash_on_hand_end_period: 2345678, coverage_end_date: '2026-09-30T00:00:00' }] });

// For the headless harness: answer a request to one of these hosts, or null.
// Overpass is shared with other layers: only the hospital/nursing-home query is answered here.
export function answerPeople(u) {
  const host = u.hostname; const p = u.pathname;
  const J = (obj) => ({ status: 200, type: 'application/json', body: JSON.stringify(obj) });
  const T = (text, type = 'text/plain') => ({ status: 200, type, body: text });
  switch (host) {
    case 'tigerweb.geo.census.gov': return J(/identify/.test(p) ? tigerIdentify() : tigerCd());
    case 'unitedstates.github.io': return J(legislators());
    case 'data.openstates.org': return T(openStatesCsv(), 'text/csv');
    case 'query.wikidata.org': return J(/wikibase:around/.test(u.searchParams.get('query') || '') ? wikidataNotable() : wikidataGov());
    case 'api.census.gov': return J(acs(/county:021$/.test(u.searchParams.get('for') || '') ? 'Bibb County, Georgia' : undefined));
    case 'api.usaspending.gov': return J(usaspending());
    case 'echodata.epa.gov': return J(echo());
    case 'api.fdic.gov': return J(fdic());
    case 'api.censusreporter.org': return J(censusReporter((u.searchParams.get('geo_ids') || '').split(',')));
    case 'overpass-api.de': return /nursing_home/.test(u.searchParams.get('data') || '') ? J(osmCare()) : null;
    case 'www.missingkids.org': return T(ncmecRss(), 'application/rss+xml');
    case 'www.fema.gov': return J(fema());
    case 'api.open.fec.gov': return J(fecTotals());
    default: return null;
  }
}
