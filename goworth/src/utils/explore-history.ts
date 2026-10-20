import type { NearbyPlace } from "../data/nearby-places.ts";
import { externalPlaceFromSaved } from "../data/external-places.ts";

export type CountryVisit = { code: string; viewedAt: number; searchTerm?: string };
export type PlaceVisit = { countryCode: string; cityId: string; place: NearbyPlace; viewedAt: number; searchTerm?: string };
export type ExploreHistory = { countries: CountryVisit[]; places: PlaceVisit[] };

export const emptyExploreHistory: ExploreHistory = { countries: [], places: [] };

export function parseExploreHistory(value: string | null): ExploreHistory {
  if (!value) return emptyExploreHistory;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return emptyExploreHistory;
    const record = parsed as Partial<ExploreHistory>;
    const countries = Array.isArray(record.countries) ? record.countries.filter((item) =>
      item && typeof item.code === "string" && /^[A-Z]{2}$/.test(item.code) && Number.isFinite(item.viewedAt)) : [];
    const places = Array.isArray(record.places) ? record.places.flatMap((item) => {
      if (!item || !/^[A-Z]{2}$/.test(item.countryCode) || !/^geonames:\d+$/.test(item.cityId) || !Number.isFinite(item.viewedAt)) return [];
      const place = externalPlaceFromSaved(item.place?.id, item.place);
      return place ? [{ countryCode: item.countryCode, cityId: item.cityId, place, viewedAt: item.viewedAt,
        ...(typeof item.searchTerm === "string" ? { searchTerm: item.searchTerm.slice(0, 80) } : {}) }] : [];
    }) : [];
    return { countries: countries.slice(0, 5), places: places.slice(0, 5) };
  } catch { return emptyExploreHistory; }
}

export function rememberCountry(history: ExploreHistory, code: string, searchTerm = "", viewedAt = Date.now()): ExploreHistory {
  return { ...history, countries: [{ code, viewedAt, ...(searchTerm.trim() ? { searchTerm: searchTerm.trim().slice(0, 80) } : {}) },
    ...history.countries.filter((item) => item.code !== code)].slice(0, 5) };
}

export function rememberPlace(history: ExploreHistory, countryCode: string, cityId: string, place: NearbyPlace, searchTerm = "", viewedAt = Date.now()): ExploreHistory {
  return { ...history, places: [{ countryCode, cityId, place, viewedAt,
    ...(searchTerm.trim() ? { searchTerm: searchTerm.trim().slice(0, 80) } : {}) },
    ...history.places.filter((item) => item.place.id !== place.id)].slice(0, 5) };
}

export function unseenNearbyPlaces(places: NearbyPlace[], history: ExploreHistory, limit = 4): NearbyPlace[] {
  const visited = new Set(history.places.map((item) => item.place.id));
  const names = new Set(history.places.map((item) => item.place.name.trim().toLocaleLowerCase()));
  return places.filter((place) => !visited.has(place.id) && !names.has(place.name.trim().toLocaleLowerCase())).slice(0, limit);
}
