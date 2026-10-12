import { destinationCatalog } from "@/data/catalog";

export type MapPin = { id: string; name: string; latitude: number; longitude: number };

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
};

export const destinationPins: MapPin[] = destinationCatalog.map((destination) => ({
  id: destination.id,
  name: `${destination.name}, ${destination.country}`,
  latitude: coordinates[destination.id][0],
  longitude: coordinates[destination.id][1],
}));

export type SearchResult = MapPin & { detail: string };
const cache = new Map<string, SearchResult[]>();
let nextRequestAt = 0;

export async function searchMap(query: string): Promise<SearchResult[]> {
  const key = query.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const wait = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Date.now() + wait + 1100;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ q: query.trim(), format: "jsonv2", limit: "5", addressdetails: "1" });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json", "User-Agent": "GoWorth/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Map search is unavailable right now. Please try again later.");
    const data: { place_id: number; display_name: string; lat: string; lon: string }[] = await response.json();
    const results = data.map((item) => ({
      id: String(item.place_id),
      name: item.display_name.split(",")[0],
      detail: item.display_name,
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }));
    cache.set(key, results);
    return results;
  } finally {
    clearTimeout(timeout);
  }
}
