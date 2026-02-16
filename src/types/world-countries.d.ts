declare module 'world-countries' {
  interface Country {
    name: {
      common: string;
      official: string;
      native: Record<string, { official: string; common: string }>;
    };
    tld: string[];
    cca2: string;
    ccn3: string;
    cca3: string;
    cioc: string;
    independent: boolean;
    status: string;
    unMember: boolean;
    currencies: Record<string, { name: string; symbol: string }>;
    idd: { root: string; suffixes: string[] };
    capital: string[];
    altSpellings: string[];
    region: string;
    subregion: string;
    languages: Record<string, string>;
    translations: Record<string, { official: string; common: string }>;
    latlng: [number, number];
    landlocked: boolean;
    borders: string[];
    area: number;
    demonyms: Record<string, { f: string; m: string }>;
    flag: string;
    maps: { googleMaps: string; openStreetMaps: string };
    population: number;
    gini: Record<string, number>;
    fifa: string;
    car: { signs: string[]; side: string };
    timezones: string[];
    continents: string[];
    flags: { png: string; svg: string; alt: string };
    coatOfArms: { png: string; svg: string };
    startOfWeek: string;
    capitalInfo: { latlng: [number, number] };
    postalCode: { format: string; regex: string };
  }

  const countries: Country[];
  export default countries;
}
