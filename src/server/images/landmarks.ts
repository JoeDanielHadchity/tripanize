const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Human-readable region names come from the runtime's CLDR data, not AI guesses. */
type Country = { code: string; title: string };
let countries: Map<string, Country> | undefined;
export function countryFor(value: string | null | undefined): Country | null {
  if (!value?.trim()) return null;
  if (!countries) {
    countries = new Map();
    const displays = ["en", "fr", "ar"].map(locale => new Intl.DisplayNames([locale], { type: "region" }));
    const codes = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
    for (const code of codes) {
      const title = displays[0].of(code)!;
      const country = { code, title };
      countries.set(normalize(code), country);
      for (const display of displays) countries.set(normalize(display.of(code) ?? title), country);
    }
    const aliases: Record<string, string> = {
      USA: "US", "United States of America": "US", America: "US", UK: "GB", Britain: "GB", "Great Britain": "GB",
      UAE: "AE", Emirates: "AE", KSA: "SA", "Kingdom of Saudi Arabia": "SA", "Kingdom of Bahrain": "BH",
      "Lebanese Republic": "LB",
      Türkiye: "TR", Turkey: "TR", "South Korea": "KR", "Republic of Korea": "KR", "North Korea": "KP",
      "Hong Kong": "HK", "Czech Republic": "CZ", "Russian Federation": "RU", "Viet Nam": "VN",
    };
    for (const [alias, code] of Object.entries(aliases)) countries.set(normalize(alias), { code, title: displays[0].of(code)! });
  }
  return countries.get(normalize(value)) ?? null;
}

export type Landmark = { title: string; file?: string };
const COUNTRY_LANDMARKS: Record<string, Landmark[]> = {
  LB: [{ title: "Raouché", file: "Beirut-Rouche rock view1.jpg" }, { title: "Baalbek" }],
  BH: [{ title: "Bahrain World Trade Center", file: "Manama Bahrain World Trade Centre & Bahrain Financial Harbour 2.jpg" }, { title: "Bahrain Fort" }],
  FR: [{ title: "Eiffel Tower" }, { title: "Mont-Saint-Michel" }],
  GB: [{ title: "Tower Bridge" }, { title: "Palace of Westminster" }],
  US: [{ title: "Golden Gate Bridge" }, { title: "Statue of Liberty" }],
  IT: [{ title: "Colosseum" }, { title: "Leaning Tower of Pisa" }],
  ES: [{ title: "Sagrada Família" }, { title: "Alhambra" }],
  PT: [{ title: "Belém Tower" }, { title: "Pena Palace" }],
  GR: [{ title: "Acropolis of Athens" }, { title: "Santorini" }],
  TR: [{ title: "Hagia Sophia" }, { title: "Cappadocia" }],
  EG: [{ title: "Giza pyramid complex" }, { title: "Great Sphinx of Giza" }],
  JO: [{ title: "Petra" }, { title: "Wadi Rum" }],
  SA: [{ title: "Hegra" }, { title: "Al-Turaif District" }],
  AE: [{ title: "Burj Khalifa" }, { title: "Sheikh Zayed Grand Mosque" }, { title: "Dubai Marina" }],
  QA: [{ title: "Museum of Islamic Art, Doha" }, { title: "Doha Corniche" }],
  OM: [{ title: "Sultan Qaboos Grand Mosque" }, { title: "Nizwa Fort" }],
  KW: [{ title: "Kuwait Towers" }],
  MA: [{ title: "Hassan II Mosque" }, { title: "Aït Benhaddou" }],
  TN: [{ title: "Amphitheatre of El Jem" }, { title: "Sidi Bou Said" }],
  DZ: [{ title: "Martyrs' Memorial, Algiers" }, { title: "Tipasa" }],
  JP: [{ title: "Mount Fuji" }, { title: "Kinkaku-ji" }],
  CN: [{ title: "Great Wall of China" }, { title: "Forbidden City" }],
  HK: [{ title: "Victoria Harbour" }, { title: "Tian Tan Buddha" }],
  TH: [{ title: "Wat Arun" }, { title: "Grand Palace" }],
  IN: [{ title: "Taj Mahal" }, { title: "Hawa Mahal" }],
  SG: [{ title: "Marina Bay Sands" }, { title: "Gardens by the Bay" }],
  MY: [{ title: "Petronas Towers" }, { title: "Batu Caves" }],
  ID: [{ title: "Ulun Danu Beratan Temple" }, { title: "Borobudur" }],
  VN: [{ title: "Hạ Long Bay" }, { title: "Hội An" }],
  KH: [{ title: "Angkor Wat" }],
  KR: [{ title: "Gyeongbokgung" }, { title: "N Seoul Tower" }],
  LK: [{ title: "Sigiriya" }],
  NP: [{ title: "Boudhanath" }, { title: "Mount Everest" }],
  MV: [{ title: "Malé" }],
  PH: [{ title: "Chocolate Hills" }, { title: "Banaue Rice Terraces" }],
  AU: [{ title: "Sydney Opera House" }, { title: "Uluru" }],
  NZ: [{ title: "Milford Sound" }, { title: "Aoraki / Mount Cook" }],
  DE: [{ title: "Brandenburg Gate" }, { title: "Neuschwanstein Castle" }],
  NL: [{ title: "Kinderdijk" }, { title: "Canals of Amsterdam" }],
  CH: [{ title: "Matterhorn" }, { title: "Château de Chillon" }],
  AT: [{ title: "Schönbrunn Palace" }, { title: "Hallstatt" }],
  CZ: [{ title: "Charles Bridge" }, { title: "Prague Castle" }],
  HU: [{ title: "Hungarian Parliament Building" }, { title: "Fisherman's Bastion" }],
  HR: [{ title: "Walls of Dubrovnik" }, { title: "Plitvice Lakes National Park" }],
  BE: [{ title: "Grand-Place" }, { title: "Atomium" }],
  DK: [{ title: "Nyhavn" }],
  SE: [{ title: "Stockholm City Hall" }, { title: "Gamla stan" }],
  NO: [{ title: "Geirangerfjord" }, { title: "Lofoten" }],
  IS: [{ title: "Skógafoss" }, { title: "Hallgrímskirkja" }],
  IE: [{ title: "Cliffs of Moher" }, { title: "Rock of Cashel" }],
  PL: [{ title: "Wawel Castle" }, { title: "Main Square, Kraków" }],
  RO: [{ title: "Bran Castle" }, { title: "Peleș Castle" }],
  MT: [{ title: "Valletta" }],
  CY: [{ title: "Petra tou Romiou" }],
  CA: [{ title: "Moraine Lake" }, { title: "Niagara Falls" }],
  MX: [{ title: "Chichen Itza" }, { title: "Teotihuacan" }],
  BR: [{ title: "Christ the Redeemer (statue)" }, { title: "Sugarloaf Mountain" }],
  AR: [{ title: "Perito Moreno Glacier" }, { title: "Obelisco de Buenos Aires" }],
  CL: [{ title: "Torres del Paine National Park" }],
  PE: [{ title: "Machu Picchu" }],
  CO: [{ title: "Cartagena, Colombia" }],
  EC: [{ title: "Galápagos Islands" }],
  CU: [{ title: "Havana" }],
  ZA: [{ title: "Table Mountain" }],
  TZ: [{ title: "Mount Kilimanjaro" }, { title: "Serengeti National Park" }],
  KE: [{ title: "Amboseli National Park" }],
  SC: [{ title: "Anse Source d'Argent" }],
  MU: [{ title: "Le Morne Brabant" }],
  GE: [{ title: "Gergeti Trinity Church" }],
  AM: [{ title: "Khor Virap" }],
  AZ: [{ title: "Flame Towers" }],
  UZ: [{ title: "Registan" }],
  FI: [{ title: "Helsinki Cathedral" }], EE: [{ title: "Tallinn" }], LV: [{ title: "Riga Cathedral" }],
  LT: [{ title: "Trakai Island Castle" }], BG: [{ title: "Rila Monastery" }], RS: [{ title: "Church of Saint Sava" }],
  AL: [{ title: "Ksamil" }], ME: [{ title: "Bay of Kotor" }], BA: [{ title: "Stari Most" }],
};

const CITY_LANDMARKS: Record<string, { code: string; landmarks: Landmark[] }> = {
  newyork: { code: "US", landmarks: [{ title: "Manhattan" }, { title: "Statue of Liberty" }] }, newyorkcity: { code: "US", landmarks: [{ title: "Manhattan" }] },
  paris: { code: "FR", landmarks: COUNTRY_LANDMARKS.FR }, london: { code: "GB", landmarks: COUNTRY_LANDMARKS.GB }, istanbul: { code: "TR", landmarks: [{ title: "Hagia Sophia" }] },
  bangkok: { code: "TH", landmarks: [{ title: "Wat Arun" }] }, hongkong: { code: "HK", landmarks: COUNTRY_LANDMARKS.HK }, beirut: { code: "LB", landmarks: COUNTRY_LANDMARKS.LB },
  manama: { code: "BH", landmarks: COUNTRY_LANDMARKS.BH }, dubai: { code: "AE", landmarks: [{ title: "Dubai Marina" }, { title: "Burj Khalifa" }] },
  tokyo: { code: "JP", landmarks: [{ title: "Tokyo Skytree" }] }, rome: { code: "IT", landmarks: [{ title: "Colosseum" }] },
};

export function destinationLandmarks(name: string, region?: string | null) {
  const namedCountry = countryFor(name), requestedCountry = countryFor(region);
  // Lebanon, USA is a town request; it must never receive a Lebanese landmark.
  const country = namedCountry && (!requestedCountry || requestedCountry.code === namedCountry.code) ? namedCountry : null;
  const city = CITY_LANDMARKS[normalize(name.split(",")[0])];
  const cityMatches = city && (!requestedCountry || requestedCountry.code === city.code || city.code === "HK" && requestedCountry.code === "CN");
  return { country, requestedCountry, landmarks: country ? COUNTRY_LANDMARKS[country.code] ?? [] : cityMatches ? city.landmarks : [] };
}

export const placeIdentity = normalize;
