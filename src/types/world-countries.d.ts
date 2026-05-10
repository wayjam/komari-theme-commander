/**
 * Type declarations for the `world-countries` package.
 *
 * IMPORTANT — RUNTIME ≠ TYPES
 * ---------------------------
 * At build time we run `vite-plugin-world-countries-filter` (see
 * `scripts/vite-plugin-world-countries-filter.ts` and its `worldCountriesFilter`
 * call in `vite.config.ts`) which strips every field that the project does not
 * actually read. The TypeScript surface intentionally stays *wide* so that:
 *
 *   1. New code can reference any documented field without first editing
 *      this file.
 *   2. The scanner picks up that reference automatically and the field
 *      starts being included in the next build.
 *
 * If you access a field that is *not* in the plugin's resolved field set,
 * you will get `undefined` at runtime. The plugin logs the kept fields on
 * every build (search the build output for `[world-countries-filter]`).
 *
 * To force-include a field that the auto-scanner can't see (e.g. because it
 * is read via dynamic key), add it to the `fields` array passed to
 * `worldCountriesFilter()` in `vite.config.ts`.
 */
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
    unRegionalGroup: string;
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
    flag: string;
    demonyms: Record<string, { f: string; m: string }>;
  }

  const countries: Country[];
  export default countries;
}
