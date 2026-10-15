import { citiesByCountry, countryRows, usStateRows, type CityRow } from "./world-geography.ts";
import { normalizeSearchText } from "../utils/search.ts";

export type Country = { code: string; name: string; capital: string; continent: string; cityCount: number };
export type City = { id: string; name: string; countryCode: string; latitude: number; longitude: number; population: number; stateCode?: string };
export type UsState = { code: string; name: string; cityCount: number };

export const countries: Country[] = countryRows.map((country) => ({
  ...country,
  cityCount: citiesByCountry[country.code]?.length ?? 0,
}));

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

export const usStates: UsState[] = usStateRows.map((state) => ({
  ...state,
  cityCount: (citiesByCountry.US ?? []).filter((city) => city[5] === state.code).length,
}));

export function citiesForUsState(stateCode: string): City[] {
  return (citiesByCountry.US ?? []).filter((row) => row[5] === stateCode).map((row) => cityFromRow(row, "US"));
}

export function citiesForCountry(countryCode: string): City[] {
  return (citiesByCountry[countryCode] ?? []).map((row) => cityFromRow(row, countryCode));
}

export function cityForId(countryCode: string, id: string): City | undefined {
  const row = citiesByCountry[countryCode]?.find((city) => `geonames:${city[0]}` === id);
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

export function searchCities(query: string, limit = 25): City[] {
  const needle = normalizeSearchText(query.trim());
  const matches: City[] = [];
  for (const country of countryRows) {
    for (const row of citiesByCountry[country.code] ?? []) {
      if (needle && !normalizeSearchText(`${row[1]} ${country.name}`).includes(needle)) continue;
      if (matches.length < limit || row[4] > matches[matches.length - 1].population) {
        matches.push(cityFromRow(row, country.code));
        matches.sort((a, b) => b.population - a.population);
        if (matches.length > limit) matches.pop();
      }
    }
  }
  return matches;
}

export function representativeCities(): City[] {
  return countryRows.flatMap((country) => {
    const rows = citiesByCountry[country.code] ?? [];
    const capital = rows.find((city) => city[1].toLocaleLowerCase() === country.capital.toLocaleLowerCase());
    const row = capital ?? rows[0];
    return row ? [cityFromRow(row, country.code)] : [];
  });
}
