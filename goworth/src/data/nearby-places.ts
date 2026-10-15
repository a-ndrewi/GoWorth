import type { MapPin } from "./map";

export type NearbyPlace = MapPin & {
  kind: "place";
  category: string;
  detail: string;
  source: "OpenStreetMap" | "Wikipedia";
  sourceUrl: string;
  location?: string;
};

type Center = { latitude: number; longitude: number };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
type WikiPlace = { pageid: number; title: string; lat?: number; lon?: number; dist?: number; index?: number;
  coordinates?: { lat: number; lon: number }[]; pageprops?: { page_image_free?: string; "wikibase-shortdesc"?: string } };
type PhotonFeature = {
  properties: { osm_type: "N" | "W" | "R"; osm_id: number; osm_key: string; osm_value: string; name?: string; city?: string; country?: string };
  geometry: { coordinates: [number, number] };
};

const cache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const pending = new Map<string, Promise<NearbyPlace[]>>();
const wikipediaSearchCache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const photonCategories = [
  "osm.tourism.attraction", "osm.tourism.museum", "osm.tourism.gallery", "osm.tourism.viewpoint",
  "osm.tourism.zoo", "osm.tourism.theme_park", "osm.tourism.aquarium",
  "osm.historic.castle", "osm.historic.fort", "osm.historic.archaeological_site",
  "osm.historic.monument", "osm.historic.memorial", "osm.historic.ruins",
  "osm.natural.peak", "osm.natural.waterfall", "osm.natural.cave_entrance", "osm.natural.beach",
  "osm.leisure.park", "osm.leisure.nature_reserve", "osm.amenity.marketplace",
];
export const photonSearchCategories = photonCategories;

export function isExplorePlace(properties: { osm_key?: string; osm_value?: string } | undefined): boolean {
  if (!properties?.osm_key || !properties.osm_value) return false;
  return isAttraction(properties.osm_key, properties.osm_value);
}

function distanceKm(a: Center, b: Center) {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lon = (b.longitude - a.longitude) * radians;
  const arc = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(arc));
}

function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function osmCategory(tags: Record<string, string>) {
  if (tags.tourism === "museum" || tags.tourism === "gallery") return "Museums";
  if (tags.natural === "beach") return "Beaches";
  if (tags.amenity === "marketplace") return "Food & Markets";
  if (tags.natural || tags.leisure) return "Nature";
  return "Landmarks";
}

function isAttraction(key: string, value: string) {
  const allowed: Record<string, string[]> = {
    tourism: ["attraction", "museum", "gallery", "viewpoint", "zoo", "theme_park", "aquarium"],
    historic: ["castle", "fort", "archaeological_site", "monument", "memorial", "ruins"],
    natural: ["peak", "waterfall", "cave_entrance", "beach"],
    leisure: ["park", "nature_reserve"],
    amenity: ["marketplace"],
  };
  return allowed[key]?.includes(value) ?? false;
}

export function parseOsmPlaces(elements: OsmElement[], center: Center, radiusKm: number): NearbyPlace[] {
  const seen = new Set<string>();
  return elements.flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const name = element.tags?.name?.trim();
    if (!name || latitude === undefined || longitude === undefined || !validCoordinates(latitude, longitude)) return [];
    const distance = distanceKm(center, { latitude, longitude });
    if (distance > radiusKm) return [];
    const key = `${name.toLocaleLowerCase()}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const category = osmCategory(element.tags!);
    return [{
      id: `osm:${element.type}:${element.id}`, name, latitude, longitude, kind: "place" as const,
      category, detail: `${category} · ${distance.toFixed(1)} km away`, source: "OpenStreetMap" as const,
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      ...(element.tags?.city && element.tags?.country ? { location: `${element.tags.city}, ${element.tags.country}` } : {}),
    }];
  }).sort((a, b) => distanceKm(center, a) - distanceKm(center, b)).slice(0, 100);
}

export function parsePhotonPlaces(features: PhotonFeature[], center: Center, radiusKm: number): NearbyPlace[] {
  const types = { N: "node", W: "way", R: "relation" } as const;
  return parseOsmPlaces(features.filter((feature) => isAttraction(feature.properties.osm_key, feature.properties.osm_value))
    .map((feature) => ({
      type: types[feature.properties.osm_type], id: feature.properties.osm_id,
      lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0],
      tags: { name: feature.properties.name ?? "", city: feature.properties.city ?? "", country: feature.properties.country ?? "", [feature.properties.osm_key]: feature.properties.osm_value },
    })), center, radiusKm);
}

const visitableDescription = /\b(?:museum|gallery|cathedral|church|chapel|mosque|temple|shrine|palace|castle|fortress|fort|monument|memorial|landmark|tower|bridge|garden|park|square|fountain|statue|sculpture|amphitheat\w*|theat\w*|ruins?|archaeolog\w*|heritage|beach|island|mountain|peak|waterfall|canyon|cave|lake|forest|reserve|viewpoint|observatory|zoo|aquarium|botanical|attraction|abbey|basilica|monastery|synagogue|pagoda|promenade|volcano|cliff|fjord|glacier|reef)\b/i;
const nonDestinationDescription = /\b(?:station|airport|hospital|school|university|company|organization|film|novel|album|battle|war|festival|election|constituency|municipality|district|neighborhood|suburb|restaurant|hotel|shopping|department store)\b/i;
const settlementDescription = /^(?:capital\b|(?:(?:port|largest)\s+)?city\b|town\b|village\b|country\b|sovereign state\b|municipality\b|commune\b)/i;

function wikipediaCategory(description: string): string {
  if (/\b(?:museum|gallery)\b/i.test(description)) return "Museums";
  if (/\bbeach\b/i.test(description)) return "Beaches";
  if (/\b(?:park|garden|reserve|island|mountain|peak|waterfall|canyon|cave|lake|forest|volcano|cliff|fjord|glacier|reef)\b/i.test(description)) return "Nature";
  return "Landmarks";
}

export function parseWikipediaPlaces(items: WikiPlace[], center: Center, radiusKm: number, includeSettlements = false): NearbyPlace[] {
  return items.flatMap((item) => {
    const latitude = item.coordinates?.[0]?.lat ?? item.lat;
    const longitude = item.coordinates?.[0]?.lon ?? item.lon;
    const description = item.pageprops?.["wikibase-shortdesc"] ?? "";
    const settlement = includeSettlements && settlementDescription.test(description);
    if (!item.title.trim() || !item.pageprops?.page_image_free || (!settlement &&
      (!visitableDescription.test(description) || nonDestinationDescription.test(description))) || latitude === undefined || longitude === undefined ||
      !validCoordinates(latitude, longitude) || distanceKm(center, { latitude, longitude }) > radiusKm) return [];
    return [{ id: `wiki:${item.pageid}`, name: item.title, latitude, longitude, kind: "place" as const,
      category: settlement ? /\b(?:country|sovereign state)\b/i.test(description) ? "Country" : "City" : wikipediaCategory(description),
      detail: "Wikipedia article", source: "Wikipedia" as const,
      sourceUrl: `https://en.wikipedia.org/?curid=${item.pageid}` }];
  }).slice(0, 40);
}

export async function searchWikipediaPlaces(query: string, center: Center, radiusKm: number, includeSettlements = false): Promise<NearbyPlace[]> {
  const key = `${query.trim().toLowerCase()}|${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${radiusKm}|${includeSettlements}`;
  const cached = wikipediaSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.places;
  const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query.trim(),
    gsrlimit: "30", prop: "coordinates|pageprops", format: "json", origin: "*" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Wikipedia place search is unavailable.");
    const data: { query?: { pages?: Record<string, WikiPlace> } } = await response.json();
    const places = parseWikipediaPlaces(Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), center, radiusKm, includeSettlements);
    wikipediaSearchCache.set(key, { places, expiresAt: Date.now() + 30 * 60 * 1000 });
    return places;
  } finally {
    clearTimeout(timeout);
  }
}

async function overpassPlaces(center: Center, radiusKm: number) {
  const radius = Math.round(radiusKm * 1000);
  const around = `around:${radius},${center.latitude},${center.longitude}`;
  const query = `[out:json][timeout:15];(` +
    `nwr(${around})["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium)$"]["name"];` +
    `nwr(${around})["historic"~"^(castle|fort|archaeological_site|monument|memorial|ruins)$"]["name"];` +
    `nwr(${around})["natural"~"^(peak|waterfall|cave_entrance|beach)$"]["name"];` +
    `nwr(${around})["leisure"~"^(park|nature_reserve)$"]["name"];` +
    `nwr(${around})["amenity"="marketplace"]["name"];` +
    `);out center 200;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const url = new URL("https://overpass-api.de/api/interpreter");
    url.searchParams.set("data", query);
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error("OpenStreetMap attractions are unavailable.");
    const data: { elements?: OsmElement[] } = await response.json();
    return parseOsmPlaces(data.elements ?? [], center, radiusKm);
  } finally {
    clearTimeout(timeout);
  }
}

export function photonBoundingBoxes(center: Center, radiusKm: number): number[][] {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos(center.latitude * Math.PI / 180)));
  const west = center.longitude - lonDelta;
  const east = center.longitude + lonDelta;
  return west < -180
    ? [[west + 360, center.latitude - latDelta, 180, center.latitude + latDelta], [-180, center.latitude - latDelta, east, center.latitude + latDelta]]
    : east > 180
      ? [[west, center.latitude - latDelta, 180, center.latitude + latDelta], [-180, center.latitude - latDelta, east - 360, center.latitude + latDelta]]
      : [[west, center.latitude - latDelta, east, center.latitude + latDelta]];
}

async function photonPlaces(center: Center, radiusKm: number) {
  const boxes = photonBoundingBoxes(center, radiusKm);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const requests = boxes.map(async (box) => {
      const url = new URL("https://photon.komoot.io/api/");
      for (const [key, value] of Object.entries({
        lat: String(center.latitude), lon: String(center.longitude),
        bbox: box.join(","), include: photonCategories.join(","), limit: "100",
      })) url.searchParams.set(key, value);
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error("OpenStreetMap place search is unavailable.");
      const data: { features?: PhotonFeature[] } = await response.json();
      return data.features ?? [];
    });
    const responses = await Promise.allSettled(requests);
    const features = responses.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (responses.every((result) => result.status === "rejected")) throw new Error("OpenStreetMap place search is unavailable.");
    return parsePhotonPlaces(features, center, radiusKm);
  } finally {
    clearTimeout(timeout);
  }
}

async function wikipediaPlaces(center: Center, radiusKm: number) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "query", generator: "geosearch", ggscoord: `${center.latitude}|${center.longitude}`,
    ggsradius: String(Math.min(10000, Math.round(radiusKm * 1000))), ggslimit: "500",
    prop: "coordinates|pageprops", format: "json", origin: "*",
  })) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) throw new Error("Nearby places are unavailable.");
    const data: { query?: { pages?: Record<string, WikiPlace> } } = await response.json();
    return parseWikipediaPlaces(Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), center, radiusKm);
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadNearbyPlaces(center: Center, radiusKm = 8): Promise<NearbyPlace[]> {
  const radius = Math.max(1, Math.min(radiusKm, 25));
  const key = `${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${radius}`;
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now()) return saved.places;
  const current = pending.get(key);
  if (current) return current;
  const request = (async () => {
    const photon = await photonPlaces(center, radius).catch(() => []);
    const osm = photon.length ? photon : await overpassPlaces(center, radius).catch(() => []);
    const places = osm.length ? osm : await wikipediaPlaces(center, radius);
    cache.set(key, { places, expiresAt: Date.now() + 30 * 60 * 1000 });
    return places;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
