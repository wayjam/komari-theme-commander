import countries from 'world-countries';

// Build emoji → coordinates mapping, covering 249 countries/regions worldwide.
// This intentionally uses the raw country/region centroids from
// `world-countries`; the theme only receives a flag emoji from Komari, so we
// should not guess a city-level location in frontend code.
const regionCoords: Record<string, [number, number]> = {};
for (const c of countries) {
  regionCoords[c.flag] = [c.latlng[0], c.latlng[1]];
}

/**
 * Get latitude/longitude coordinates from a flag emoji.
 * @param regionEmoji Flag emoji, e.g. '🇸🇬', '🇯🇵'
 * @returns [latitude, longitude]; returns [0, 0] if no match
 */
export function getCoords(regionEmoji: string): [number, number] {
  return regionCoords[regionEmoji] ?? [0, 0];
}

export default regionCoords;
