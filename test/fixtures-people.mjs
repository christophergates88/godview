// Sample responses for the "People & records" layers. Hand-made to match each
// provider's documented format (field names and structure). NOT real data:
// every person and organization name below is invented, apart from field names.

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

// Census TIGERweb tigerWMS_Current identify (layerName + attributes).
export const tigerIdentify = () => ({
  results: [
    { layerId: 80, layerName: 'States', attributes: { GEOID: '13', NAME: 'Georgia', BASENAME: 'Georgia', STATE: '13', INTPTLAT: '+32.6295789', INTPTLON: '-083.4235109' } },
    { layerId: 82, layerName: 'Counties', attributes: { GEOID: '13237', NAME: 'Putnam County', BASENAME: 'Putnam', STATE: '13', COUNTY: '237', INTPTLAT: '+33.3215', INTPTLON: '-083.3733' } },
    { layerId: 8, layerName: 'Census Tracts', attributes: { GEOID: '13237960204', NAME: 'Census Tract 9602.04', BASENAME: '9602.04', STATE: '13', COUNTY: '237', TRACT: '960204', INTPTLAT: '+33.3001', INTPTLON: '-083.4102' } },
    { layerId: 28, layerName: 'Incorporated Places', attributes: { GEOID: '1326084', NAME: 'Eatonton city', BASENAME: 'Eatonton', STATE: '13', INTPTLAT: '+33.3260', INTPTLON: '-083.3880' } },
    { layerId: 14, layerName: 'Unified School Districts', attributes: { GEOID: '1304260', NAME: 'Putnam County School District', STATE: '13' } },
    { layerId: 54, layerName: '120th Congressional Districts', attributes: { GEOID: '1310', NAME: 'Congressional District 10', BASENAME: '10', CD120: '10', STATE: '13' } },
    { layerId: 56, layerName: '2026 State Legislative Districts - Upper', attributes: { GEOID: '13025', NAME: 'State Senate District 25', BASENAME: '25', SLDU: '025', STATE: '13' } },
    { layerId: 58, layerName: '2026 State Legislative Districts - Lower', attributes: { GEOID: '13144', NAME: 'State House District 144', BASENAME: '144', SLDL: '144', STATE: '13' } },
    { layerId: 13, layerName: '2020 Census Blocks Labels', attributes: { GEOID: '132379602042020' } },
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
  'ocd-person/11111111-1111-1111-1111-111111111111,Frances Samplesenator,Republican,25,upper,Frances,Samplesenator,,,,,,frances@senate.ga.gov,https://www.legis.ga.gov/members/senate/1,,"18 Capitol Square, Atlanta, GA",404-656-0000,,"1 Home Street, Eatonton GA",,,,,,',
  'ocd-person/22222222-2222-2222-2222-222222222222,George Samplerep,Republican,144,lower,George,Samplerep,,,,,,george@house.ga.gov,https://www.legis.ga.gov/members/house/2,,"18 Capitol Square, Atlanta, GA",404-656-0001,,"2 Home Street, Eatonton GA",,,,,,',
  'ocd-person/33333333-3333-3333-3333-333333333333,Helen Otherdistrict,Democrat,26,upper,Helen,Otherdistrict,,,,,,,,,,,,,,,,,,',
].join('\n');

// Wikidata SPARQL JSON results.
const B = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: /^https?:/.test(v) ? 'uri' : 'literal', value: v }]));
export const wikidataGov = () => ({ head: { vars: ['kind', 'item', 'itemLabel', 'article', 'site'] }, results: { bindings: [
  B({ kind: 'gov', item: 'http://www.wikidata.org/entity/Q900001', itemLabel: 'Ivy Samplegovernor', article: 'https://en.wikipedia.org/wiki/Ivy_Samplegovernor', site: 'https://georgia.gov/' }),
  B({ kind: 'county', item: 'http://www.wikidata.org/entity/Q900002', itemLabel: 'Putnam County', site: 'http://www.putnamcountyga.us/' }),
] } });
export const wikidataNotable = () => ({ head: { vars: [] }, results: { bindings: [
  B({ p: 'http://www.wikidata.org/entity/Q900011', pLabel: 'Jules Samplewriter', pDescription: 'American writer (sample)', placeLabel: 'Eatonton', born: '1902-03-04T00:00:00Z', died: '1990-05-06T00:00:00Z', article: 'https://en.wikipedia.org/wiki/Jules_Samplewriter', lat: '33.3268', lon: '-83.3885', img: 'http://commons.wikimedia.org/wiki/Special:FilePath/Sample.jpg' }),
  B({ p: 'http://www.wikidata.org/entity/Q900012', pLabel: 'Kim Sampleathlete', pDescription: 'American athlete (sample)', placeLabel: 'Eatonton', born: '1985-01-01T00:00:00Z', article: 'https://en.wikipedia.org/wiki/Kim_Sampleathlete', lat: '33.3268', lon: '-83.3885' }),
  B({ p: 'http://www.wikidata.org/entity/Q900012', pLabel: 'Kim Sampleathlete', pDescription: 'duplicate row', placeLabel: 'Eatonton', article: 'https://en.wikipedia.org/wiki/Kim_Sampleathlete', lat: '33.3268', lon: '-83.3885' }),
  B({ p: 'http://www.wikidata.org/entity/Q900013', pLabel: 'Lee Samplemusician', pDescription: 'American musician (sample)', placeLabel: 'Milledgeville', born: '1950-07-07T00:00:00Z', article: 'https://en.wikipedia.org/wiki/Lee_Samplemusician', lat: '33.0801', lon: '-83.2321' }),
] } });

// Census API (ACS 5-year): header row + one value row. Numbers chosen to check the maths.
export const acs = (name = 'Census Tract 9602.04; Putnam County; Georgia') => {
  const head = ['NAME', 'B01001_001E', 'B01002_001E'];
  const vals = [name, '1000', '44.1'];
  const add = (k, v) => { head.push(k); vals.push(String(v)); };
  const cell = (i) => `B01001_${String(i).padStart(3, '0')}E`;
  for (const i of [3, 4, 5, 6, 27, 28, 29, 30]) add(cell(i), 25);      // 200 under 18
  for (const i of [20, 21, 22, 23, 24, 25, 44, 45, 46, 47, 48, 49]) add(cell(i), i === 20 ? 30 : 20); // 250 aged 65+
  add('B11001_001E', 410); add('B19013_001E', 58250); add('B25003_001E', 410); add('B25003_002E', 320);
  add('B25035_001E', 1988); add('B08013_001E', 10000); add('B08303_001E', 400); add('C16001_001E', 950); add('C16001_002E', 900);
  add('state', '13'); add('county', '237'); add('tract', '960204');
  return [head, vals];
};

// USAspending spending_by_category/recipient.
export const usaspending = () => ({ category: 'recipient', limit: 15, page_metadata: { page: 1, hasNext: false }, results: [
  { amount: 4200000, recipient_id: 'aaaa1111-bbbb-2222-cccc-333333333333-C', name: 'PUTNAM COUNTY BOARD OF EDUCATION', code: null, uei: 'UEISAMPLE001' },
  { amount: 1500000, recipient_id: 'dddd4444-eeee-5555-ffff-666666666666-P', name: 'GEORGIA POWER COMPANY', code: null, uei: 'UEISAMPLE002' },
  { amount: 90000, recipient_id: null, name: 'JOHN Q SAMPLEFARMER', code: null, uei: null },
  { amount: 50000, recipient_id: null, name: 'MULTIPLE RECIPIENTS', code: null, uei: null },
] });

// EPA ECHO get_facility_info (Results.Facilities).
export const echo = () => ({ Results: { Message: 'Success', QueryRows: '3', Facilities: [
  { RegistryID: '110000000001', FacName: 'SAMPLE TEXTILE MILL INC', FacStreet: '1 INDUSTRIAL BLVD', FacCity: 'EATONTON', FacState: 'GA', FacLat: '33.33', FacLong: '-83.39', AIRFlag: 'Y', NPDESFlag: 'Y', RCRAFlag: 'N', CurrVioFlag: 'Y', FacSNCFlg: 'N', FacComplianceStatus: 'Violation Identified', FacInspectionCount: '4', FacDateLastInspection: '03/15/2026', FacQtrsWithNC: '3', FacFormalActionCount: '1', FacTotalPenalties: '12500' },
  { RegistryID: '110000000002', FacName: 'EATONTON WWTP', FacStreet: '2 RIVER RD', FacCity: 'EATONTON', FacState: 'GA', FacLat: '33.31', FacLong: '-83.40', NPDESFlag: 'Y', CurrVioFlag: 'N', FacSNCFlg: 'N', FacComplianceStatus: 'No Violation Identified', FacInspectionCount: '2', FacQtrsWithNC: '0', FacFormalActionCount: '0', FacTotalPenalties: '0' },
  { RegistryID: '110000000003', FacName: 'JOHN SMITH RESIDENCE', FacStreet: '9 ELM ST', FacCity: 'EATONTON', FacState: 'GA', FacLat: '33.32', FacLong: '-83.38', RCRAFlag: 'Y', CurrVioFlag: 'N', FacSNCFlg: 'N', FacComplianceStatus: 'No Violation Identified', FacQtrsWithNC: '0' },
] } });

// CMS provider-data datastore query (results[] with machine column names).
export const cmsNursing = () => ({ count: 2, results: [
  { cms_certification_number_ccn: '115999', provider_name: 'SAMPLE OAKS HEALTH AND REHABILITATION', citytown: 'EATONTON', state: 'GA', countyparish: 'Putnam', ownership_type: 'For profit - Corporation', number_of_certified_beds: '100', overall_rating: '2', health_inspection_rating: '1', staffing_rating: '3', qm_rating: '4', number_of_fines: '2', total_amount_of_fines_in_dollars: '21000', abuse_icon: 'Y', special_focus_status: '', latitude: '33.33', longitude: '-83.37' },
  { cms_certification_number_ccn: '115998', provider_name: 'SAMPLE PINES NURSING CENTER', citytown: 'MILLEDGEVILLE', state: 'GA', countyparish: 'Baldwin', ownership_type: 'Non profit - Corporation', number_of_certified_beds: '80', overall_rating: '5', health_inspection_rating: '5', staffing_rating: '4', qm_rating: '5', number_of_fines: '0', total_amount_of_fines_in_dollars: '0', abuse_icon: 'N', latitude: '33.09', longitude: '-83.24' },
] });
export const cmsHospitals = () => ({ count: 1, results: [
  { facility_id: '110999', facility_name: 'SAMPLE COUNTY HOSPITAL', citytown: 'EATONTON', state: 'GA', countyparish: 'PUTNAM', hospital_type: 'Critical Access Hospitals', emergency_services: 'Yes', hospital_overall_rating: '3' },
] });

// FDIC BankFind /locations.
export const fdic = () => ({ meta: { total: 2 }, data: [
  { data: { NAME: 'Sample State Bank', OFFNAME: 'Sample State Bank', ADDRESS: '100 Main St', CITY: 'Eatonton', STALP: 'GA', LATITUDE: 33.326, LONGITUDE: -83.388, SERVTYPE: 11, ESTYMD: '1921-05-02', CERT: 99901, MAINOFF: 1, UNINUMBR: 5550001 }, score: 1 },
  { data: { NAME: 'Example National Bank', OFFNAME: 'Eatonton Branch', ADDRESS: '200 Oak St', CITY: 'Eatonton', STALP: 'GA', LATITUDE: 33.33, LONGITUDE: -83.39, SERVTYPE: 11, ESTYMD: '2001-01-01', CERT: 99902, MAINOFF: 0, UNINUMBR: 5550002 }, score: 1 },
] });

// NCMEC state RSS (structure as published; invented case).
export const NCMEC_TEXT = 'SAMPLE CHILD, Age Now: 15, Missing: 10/01/2026. Missing From EATONTON, GA. ANYONE HAVING INFORMATION SHOULD CONTACT: Sample County Sheriff\'s Office (Georgia) 1-555-555-0100.';
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
  { femaDeclarationString: 'DR-4999-GA', disasterNumber: 4999, state: 'GA', declarationType: 'DR', declarationDate: iso(now - 40 * 86400e3), incidentType: 'Hurricane', declarationTitle: 'HURRICANE SAMPLE', fipsStateCode: '13', fipsCountyCode: '237', designatedArea: 'Putnam (County)' },
  { femaDeclarationString: 'DR-4999-GA', disasterNumber: 4999, state: 'GA', declarationType: 'DR', declarationDate: iso(now - 40 * 86400e3), incidentType: 'Hurricane', declarationTitle: 'HURRICANE SAMPLE', fipsStateCode: '13', fipsCountyCode: '237', designatedArea: 'Putnam (County)' },
  { femaDeclarationString: 'EM-3998-GA', disasterNumber: 3998, state: 'GA', declarationType: 'EM', declarationDate: iso(now - 400 * 86400e3), incidentType: 'Severe Storm', declarationTitle: 'SEVERE STORMS SAMPLE', fipsStateCode: '13', fipsCountyCode: '000', designatedArea: 'Statewide' },
] });

export const fecTotals = () => ({ results: [{ candidate_id: 'S0GA00901', cycle: 2026, receipts: 12345678, disbursements: 9876543, cash_on_hand_end_period: 2345678, coverage_end_date: '2026-09-30T00:00:00' }] });

// For the headless harness: answer a request to one of these hosts, or null.
export function answerPeople(u) {
  const host = u.hostname; const p = u.pathname;
  const J = (obj) => ({ status: 200, type: 'application/json', body: JSON.stringify(obj) });
  const T = (text, type = 'text/plain') => ({ status: 200, type, body: text });
  switch (host) {
    case 'tigerweb.geo.census.gov': return J(/identify/.test(p) ? tigerIdentify() : tigerCd());
    case 'unitedstates.github.io': return J(legislators());
    case 'data.openstates.org': return T(openStatesCsv(), 'text/csv');
    case 'query.wikidata.org': return J(/wikibase:around/.test(u.searchParams.get('query') || '') ? wikidataNotable() : wikidataGov());
    case 'api.census.gov': return J(acs(/county:237$/.test(u.searchParams.get('for') || '') ? 'Putnam County, Georgia' : undefined));
    case 'api.usaspending.gov': return J(usaspending());
    case 'echodata.epa.gov': return J(echo());
    case 'data.cms.gov': return J(/xubh-q36u/.test(p) ? cmsHospitals() : cmsNursing());
    case 'api.fdic.gov': return J(fdic());
    case 'www.missingkids.org': return T(ncmecRss(), 'application/rss+xml');
    case 'www.fema.gov': return J(fema());
    case 'api.open.fec.gov': return J(fecTotals());
    default: return null;
  }
}
