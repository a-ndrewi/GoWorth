import type { RouteStop } from "@/data/travel";
import { citiesForCountry, citiesForUsState, countries } from "@/data/geography";
import { translate } from "@/data/i18n";
import { normalizeSearchText } from "@/utils/search";

export type TripCountry = { name: string; code: string };

export function searchTripCountries(query: string, limit = 40): TripCountry[] {
  const needle = normalizeSearchText(query.trim());
  return countries.filter((country) => normalizeSearchText(`${country.name} ${translate(country.name, "ro")}`).includes(needle))
    .slice(0, limit).map(({ name, code }) => ({ name, code }));
}

export function searchTripCities(query: string, country: TripCountry, limit = 40, stateCode?: string): RouteStop[] {
  const needle = normalizeSearchText(query.trim());
  const cities = stateCode && country.code === "US" ? citiesForUsState(stateCode) : citiesForCountry(country.code);
  return cities.filter((city) =>
    normalizeSearchText(`${city.name} ${translate(city.name, "ro")}`).includes(needle))
    .slice(0, limit).map((city) => ({
      id: city.id, name: city.name, country: country.name, countryCode: country.code,
      latitude: city.latitude, longitude: city.longitude,
    }));
}
