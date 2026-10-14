import type { RouteStop } from "@/data/travel";

export type TripCountry = { name: string; code: string };

type NominatimResult = {
  osm_type?: string;
  osm_id?: number;
  place_id: number;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  addresstype?: string;
  type?: string;
  address?: { country?: string; country_code?: string };
};

let nextRequestAt = 0;

async function lookup(params: URLSearchParams): Promise<NominatimResult[]> {
  const wait = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Date.now() + wait + 1100;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    params.set("format", "jsonv2");
    params.set("addressdetails", "1");
    params.set("limit", "10");
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) throw new Error("Location search is unavailable. Try again shortly.");
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchTripCountries(query: string): Promise<TripCountry[]> {
  if (query.trim().length < 2) return [];
  const results = await lookup(new URLSearchParams({ q: query.trim(), featuretype: "country" }));
  return [...new Map(results.filter((item) => item.address?.country_code &&
    (item.addresstype === "country" || item.type === "administrative"))
    .map((item) => [item.address!.country_code!, {
      name: item.address!.country || item.name || item.display_name.split(",")[0],
      code: item.address!.country_code!.toUpperCase(),
    }])).values()];
}

export async function searchTripCities(query: string, country: TripCountry): Promise<RouteStop[]> {
  if (query.trim().length < 2) return [];
  const results = await lookup(new URLSearchParams({ q: query.trim(), countrycodes: country.code.toLowerCase() }));
  const cityTypes = new Set(["city", "town", "village", "municipality", "hamlet"]);
  return [...new Map(results.filter((item) =>
    cityTypes.has(item.addresstype || item.type || "") &&
    item.address?.country_code?.toUpperCase() === country.code &&
    Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lon)))
    .map((item) => {
      const id = item.osm_type && item.osm_id ? `osm:${item.osm_type}:${item.osm_id}` : `nominatim:${item.place_id}`;
      return [id, {
        id, name: item.name || item.display_name.split(",")[0],
        country: item.address?.country || country.name,
        countryCode: country.code,
        latitude: Number(item.lat), longitude: Number(item.lon),
      } satisfies RouteStop];
    })).values()];
}
