import { destinationCatalog } from "@/data/catalog";
import type { Place } from "@/data/travel";
import { normalizeSearchText } from "@/utils/search";
import { countryForCode, representativeCities, usStates } from "@/data/geography";
import { usStateCenters } from "@/data/us-state-centers";
import { isExplorePlace, photonBoundingBoxes, photonSearchCategories, searchWikipediaPlaces } from "@/data/nearby-places";

export type MapPin = { id: string; name: string; latitude: number; longitude: number; kind?: "destination" | "city" | "state" | "place" | "search"; countryCode?: string; stateCode?: string };

const coordinates: Record<(typeof destinationCatalog)[number]["id"], [number, number]> = {
  positano: [40.6281, 14.4845],
  santorini: [36.3932, 25.4615],
  bali: [-8.4095, 115.1889],
  kyoto: [35.0116, 135.7681],
  iceland: [64.9631, -19.0208],
  alps: [46.8182, 8.2275],
  paris: [48.8566, 2.3522],
  rome: [41.9028, 12.4964],
  tokyo: [35.6762, 139.6503],
  lisbon: [38.7223, -9.1393],
  "new-york": [40.7128, -74.006],
  barcelona: [41.3874, 2.1686],
  london: [51.5072, -0.1276],
  amsterdam: [52.3676, 4.9041],
  istanbul: [41.0082, 28.9784],
  dubai: [25.2048, 55.2708],
  singapore: [1.3521, 103.8198],
  bangkok: [13.7563, 100.5018],
  seoul: [37.5665, 126.978],
  sydney: [-33.8688, 151.2093],
  rio: [-22.9068, -43.1729],
  "cape-town": [-33.9249, 18.4241],
  marrakech: [31.6295, -7.9811],
  "mexico-city": [19.4326, -99.1332],
  berlin: [52.52, 13.405],
  vienna: [48.2082, 16.3738],
  prague: [50.0755, 14.4378],
  delhi: [28.6139, 77.209],
  hanoi: [21.0285, 105.8542],
  "kuala-lumpur": [3.139, 101.6869],
  auckland: [-36.8509, 174.7645],
  toronto: [43.6532, -79.3832],
  "buenos-aires": [-34.6037, -58.3816],
  lima: [-12.0464, -77.0428],
  cairo: [30.0444, 31.2357],
  nairobi: [-1.2921, 36.8219],
  dublin: [53.3498, -6.2603],
  edinburgh: [55.9533, -3.1883],
  copenhagen: [55.6761, 12.5683],
  stockholm: [59.3293, 18.0686],
  oslo: [59.9139, 10.7522],
  helsinki: [60.1699, 24.9384],
  tallinn: [59.437, 24.7536],
  riga: [56.9496, 24.1052],
  vilnius: [54.6872, 25.2797],
  warsaw: [52.2297, 21.0122],
  budapest: [47.4979, 19.0402],
  athens: [37.9838, 23.7275],
  zagreb: [45.815, 15.9819],
  ljubljana: [46.0569, 14.5058],
  bucharest: [44.4268, 26.1025],
  brasov: [45.6427, 25.5887],
  sibiu: [45.7936, 24.1213],
  sighisoara: [46.2197, 24.7964],
  "cluj-napoca": [46.7712, 23.6236],
  oradea: [47.0465, 21.9189],
  suceava: [47.6514, 26.2556],
  iasi: [47.1585, 27.6014],
  sinaia: [45.3505, 25.5514],
  "alba-iulia": [46.0686, 23.5706],
  "danube-delta": [45.17, 29.4],
  sofia: [42.6977, 23.3219],
  belgrade: [44.8125, 20.4612],
  brussels: [50.8503, 4.3517],
};

export const destinationPins: MapPin[] = destinationCatalog.map((destination) => ({
  id: destination.id,
  name: `${destination.name}, ${destination.country}`,
  latitude: coordinates[destination.id][0],
  longitude: coordinates[destination.id][1],
  kind: "destination",
}));

export const worldCityPins: MapPin[] = representativeCities().map((city) => ({
  id: city.id, name: `${city.name}, ${countryForCode(city.countryCode)?.name ?? city.countryCode}`,
  latitude: city.latitude, longitude: city.longitude, kind: "city", countryCode: city.countryCode,
}));

export const usStatePins: MapPin[] = usStates.map((state) => ({
  id: `us-state:${state.code}`,
  name: `${state.name}, United States`,
  latitude: usStateCenters[state.code][0],
  longitude: usStateCenters[state.code][1],
  kind: "state",
  countryCode: "US",
  stateCode: state.code,
}));

export type SearchResult = MapPin & { detail: string; category: string; kind: "place" | "search"; sourceUrl: string; source?: "OpenStreetMap" | "Wikipedia" };
const cache = new Map<string, SearchResult[]>();
let nextRequestAt = 0;

type SearchArea = { center: MapPin; radiusKm: number; placesOnly?: boolean };
type PhotonSearchFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { osm_type?: string; osm_id?: number; osm_key?: string; name?: string; city?: string; state?: string; country?: string; type?: string; osm_value?: string };
};

export function distanceKm(a: Pick<MapPin, "latitude" | "longitude">, b: Pick<MapPin, "latitude" | "longitude">) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(b.latitude - a.latitude);
  const deltaLon = radians(b.longitude - a.longitude);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(value));
}

export function parsePhotonSearchResults(features: PhotonSearchFeature[], area?: SearchArea): SearchResult[] {
  const osmTypes: Record<string, string> = { N: "node", W: "way", R: "relation" };
  const seen = new Set<string>();
  return features.flatMap((feature) => {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const osmType = properties?.osm_type ? osmTypes[properties.osm_type] : undefined;
    if (area?.placesOnly && !isExplorePlace(properties)) return [];
    if (!properties?.name?.trim() || !osmType || typeof properties.osm_id !== "number" || !Number.isInteger(properties.osm_id) ||
      latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    if (area && distanceKm(area.center, { latitude, longitude }) > area.radiusKm * 1.45) return [];
    const id = `osm:${osmType}:${properties.osm_id}`;
    const detail = [properties.name, properties.city !== properties.name ? properties.city : "", properties.state, properties.country].filter(Boolean).join(", ");
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: properties.name, detail, category: (properties.type || properties.osm_value || "Location").replace(/_/g, " "),
      kind: "search" as const, latitude, longitude, sourceUrl: `https://www.openstreetmap.org/${osmType}/${properties.osm_id}` }];
  });
}

export async function searchMap(query: string, area?: SearchArea): Promise<SearchResult[]> {
  const key = `${query.trim().toLowerCase()}|${area?.center.id ?? "world"}|${area?.radiusKm ?? 0}|${area?.placesOnly ? "places" : "all"}`;
  if (cache.has(key)) return cache.get(key)!;

  if (!area?.placesOnly && query.trim().length >= 3) {
    const center = area?.center ?? { latitude: 0, longitude: 0 };
    const matches = await searchWikipediaPlaces(query, center, area?.radiusKm ?? 20040, !area).catch(() => []);
    if (matches.length) {
      const results: SearchResult[] = matches.map((item) => ({ ...item, kind: "search" }));
      cache.set(key, results);
      return results;
    }
  }

  const wait = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Date.now() + wait + 1000;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ q: query.trim(), limit: area?.placesOnly ? "30" : "10" });
    if (area?.placesOnly) params.set("include", photonSearchCategories.join(","));
    if (area) {
      params.set("lat", String(area.center.latitude));
      params.set("lon", String(area.center.longitude));
      params.set("bbox", photonBoundingBoxes(area.center, area.radiusKm)[0].join(","));
    }
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Map search is unavailable right now. Please try again later.");
    const data: { features?: PhotonSearchFeature[] } = await response.json();
    const results = parsePhotonSearchResults(data.features ?? [], area);
    const seen = new Set<string>();
    const uniqueResults = results.filter((item) => {
      const label = normalizeSearchText(item.detail);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
    cache.set(key, uniqueResults);
    return uniqueResults;
  } finally {
    clearTimeout(timeout);
  }
}

const wideDestinations: Record<string, number> = {
  iceland: 350, alps: 220, bali: 150, "new-york": 85,
  "danube-delta": 160,
};

export async function searchCatalogPlace(place: Place): Promise<SearchResult[]> {
  const parent = destinationCatalog.find((destination) => destination.id === place.destinationId);
  const center = destinationPins.find((pin) => pin.id === place.destinationId);
  if (!parent || !center) return [];
  const radiusKm = wideDestinations[parent.id] ?? 55;
  const matches = await searchMap(place.name, { center, radiusKm });
  const placeWords = normalizeSearchText(place.name).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2);
  return matches.filter((match) => {
    const name = normalizeSearchText(match.name);
    return placeWords.length > 0 && placeWords.every((word) => name.includes(word));
  }).map((match) => ({ ...match, name: place.name, kind: "place" }));
}
