import { citiesByCountry, countryRows, usStateRows, type CityRow } from "./world-geography.ts";
import { normalizeSearchText } from "../utils/search.ts";

export type Country = { code: string; name: string; capital: string; continent: string; cityCount: number; anchor: [latitude: number, longitude: number] | null };
export type City = { id: string; name: string; countryCode: string; latitude: number; longitude: number; population: number; stateCode?: string };
export type UsState = { code: string; name: string; cityCount: number };

export const countries: Country[] = countryRows;

export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return Array.from(code, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

export function countryForCode(code: string | undefined): Country | undefined {
  return countries.find((country) => country.code === code);
}

function cityFromRow(row: CityRow, countryCode: string): City {
  return { id: `geonames:${row[0]}`, name: row[1], countryCode, latitude: row[2], longitude: row[3], population: row[4], ...(row[5] ? { stateCode: row[5] } : {}) };
}

export const usStates: UsState[] = usStateRows;

export function citiesForUsState(stateCode: string): City[] {
  return (citiesByCountry().US ?? []).filter((row) => row[5] === stateCode).map((row) => cityFromRow(row, "US"));
}

export function citiesForCountry(countryCode: string): City[] {
  return (citiesByCountry()[countryCode] ?? []).map((row) => cityFromRow(row, countryCode));
}

export function cityForId(countryCode: string, id: string): City | undefined {
  const row = citiesByCountry()[countryCode]?.find((city) => `geonames:${city[0]}` === id);
  return row ? cityFromRow(row, countryCode) : undefined;
}

export function cityForGlobalId(id: string | null | undefined): City | undefined {
  if (!id?.startsWith("geonames:")) return undefined;
  if (cityCache.has(id)) return cityCache.get(id);
  for (const country of countryRows) {
    const city = cityForId(country.code, id);
    if (city) { cityCache.set(id, city); return city; }
  }
  return undefined;
}

const cityCache = new Map<string, City>();
/** Where a country sits on the globe: its capital, or else its largest city (precomputed with the data). */
export function countryAnchor(country: Country) {
  return country.anchor ? { latitude: country.anchor[0], longitude: country.anchor[1] } : null;
}

type CityEntry = { row: CityRow; countryCode: string };
type CitySearchEntry = CityEntry & { text: string; name: string };
let cityList: CityEntry[] | null = null;
let citySearchIndex: CitySearchEntry[] | null = null;
let cityGrid: Map<number, CityEntry[]> | null = null;

/** Every city, largest first. */
function citiesByPopulation() {
  cityList ??= countryRows.flatMap((country) => (citiesByCountry()[country.code] ?? []).map((row) => ({ row, countryCode: country.code })))
    .sort((a, b) => b.row[4] - a.row[4]);
  return cityList;
}

/**
 * Every city with its search text normalised once, largest first, built on the first search. Normalising tens of
 * thousands of names takes a while, so only searching builds it, never a lookup by position.
 */
function cityIndex() {
  if (!citySearchIndex) {
    const names = new Map(countryRows.map((country) => [country.code, country.name]));
    citySearchIndex = citiesByPopulation().map((entry) => ({
      ...entry, text: normalizeSearchText(`${entry.row[1]} ${names.get(entry.countryCode) ?? ""}`), name: normalizeSearchText(entry.row[1]),
    }));
  }
  return citySearchIndex;
}

/** Cities bucketed by whole degree of latitude and longitude, each bucket largest first. */
const gridCell = (latitude: number, longitude: number) => (Math.floor(latitude) + 90) * 360 + ((Math.floor(longitude) + 540) % 360);
function cityCells() {
  if (!cityGrid) {
    cityGrid = new Map();
    for (const entry of citiesByPopulation()) {
      const cell = gridCell(entry.row[2], entry.row[3]);
      const bucket = cityGrid.get(cell);
      if (bucket) bucket.push(entry); else cityGrid.set(cell, [entry]);
    }
  }
  return cityGrid;
}

/**
 * The largest cities matching the query; an empty query returns the largest cities overall. Cities whose own name
 * matches come before cities that only match through their country, so "rom" finds Rome before Bucharest.
 */
export function searchCities(query: string, limit = 25): City[] {
  const needle = normalizeSearchText(query.trim());
  const byName: City[] = [];
  const byCountry: City[] = [];
  for (const entry of cityIndex()) {
    if (needle && !entry.text.includes(needle)) continue;
    if (!needle || entry.name.includes(needle)) byName.push(cityFromRow(entry.row, entry.countryCode));
    else if (byCountry.length < limit) byCountry.push(cityFromRow(entry.row, entry.countryCode));
    if (byName.length >= limit) break;
  }
  return [...byName, ...byCountry].slice(0, limit);
}

/**
 * The city a point belongs to: the most populous city within about 11 km, so a landmark is filed under its city
 * rather than a district or suburb; otherwise simply the nearest city.
 */
/**
 * The largest city within about 10 km, or else the nearest one. Only the grid cells around the point are read, ring
 * by ring, until no farther ring could hold anything nearer: scanning every city took over a second for a list of places.
 */
export function nearestCity(latitude: number, longitude: number): City | undefined {
  const cosLat = Math.cos(latitude * Math.PI / 180);
  const cells = cityCells();
  const row0 = Math.floor(latitude), col0 = Math.floor(longitude);
  let nearest: CityEntry | undefined, nearestDistance = Infinity;
  let largest: CityEntry | undefined;
  for (let ring = 0; ring <= 180; ring++) {
    for (let dRow = -ring; dRow <= ring; dRow++) {
      for (let dCol = -ring; dCol <= ring; dCol++) {
        if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring || row0 + dRow < -90 || row0 + dRow > 89) continue;
        for (const entry of cells.get(gridCell(row0 + dRow, col0 + dCol)) ?? []) {
          const dLat = entry.row[2] - latitude;
          const dLon = ((((entry.row[3] - longitude) % 360) + 540) % 360 - 180) * cosLat;
          const distance = dLat * dLat + dLon * dLon;
          if (distance < nearestDistance) { nearest = entry; nearestDistance = distance; }
          if (distance <= 0.1 * 0.1 && (!largest || entry.row[4] > largest.row[4])) largest = entry;
        }
      }
    }
    // Anything in the next ring is at least `ring` degrees away north–south, or `ring` degrees of longitude east–west.
    const reach = ring * Math.min(1, Math.max(cosLat, 0.01));
    if (ring >= 1 && (largest || nearestDistance <= reach * reach)) break;
  }
  const best = largest ?? nearest;
  return best ? cityFromRow(best.row, best.countryCode) : undefined;
}

/** The largest cities of every country, so a worldwide search reaches small countries as well as big ones. */
export function worldDiscoveryCities(perCountry = 3): City[] {
  const taken = new Map<string, number>();
  const result: City[] = [];
  for (const entry of citiesByPopulation()) {
    const count = taken.get(entry.countryCode) ?? 0;
    if (count >= perCountry) continue;
    taken.set(entry.countryCode, count + 1);
    result.push(cityFromRow(entry.row, entry.countryCode));
  }
  return result;
}

export function representativeCities(): City[] {
  return countryRows.flatMap((country) => {
    const rows = citiesByCountry()[country.code] ?? [];
    const capital = rows.find((city) => city[1].toLocaleLowerCase() === country.capital.toLocaleLowerCase());
    const row = capital ?? rows[0];
    return row ? [cityFromRow(row, country.code)] : [];
  });
}
