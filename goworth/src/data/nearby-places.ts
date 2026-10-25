import type { MapPin } from "./map";
import { findPlacePhoto } from "./place-photo.ts";

export type VenueKind = "restaurant" | "bar" | "cafe" | "nightclub";
/** What the Explore deck can show besides attractions; "terrace" means any venue with outdoor seating. */
export type VenueFilter = VenueKind | "terrace";
export const venueFilters: VenueFilter[] = ["restaurant", "bar", "cafe", "nightclub", "terrace"];
export type Venue = { kind: VenueKind; terrace: boolean; cuisine?: string; openingHours?: string; address?: string };

export type NearbyPlace = MapPin & {
  kind: "place";
  category: string;
  detail: string;
  source: "OpenStreetMap" | "Wikipedia";
  sourceUrl: string;
  location?: string;
  /** Set for restaurants, bars, cafés and clubs, which rarely have a free photo and get their own card. */
  venue?: Venue;
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
  properties: { osm_type: "N" | "W" | "R"; osm_id: number; osm_key: string; osm_value: string; name?: string; city?: string; country?: string; street?: string; housenumber?: string };
  geometry: { coordinates: [number, number] };
};

const cache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const pending = new Map<string, Promise<NearbyPlace[]>>();
const venueCache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const venuePending = new Map<string, Promise<NearbyPlace[]>>();
const wikipediaSearchCache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const photoReadyCache = new Map<string, Promise<boolean>>();
const photonCategories = [
  "osm.tourism.attraction", "osm.tourism.museum", "osm.tourism.gallery", "osm.tourism.viewpoint",
  "osm.tourism.zoo", "osm.tourism.theme_park", "osm.tourism.aquarium",
  "osm.historic.castle", "osm.historic.fort", "osm.historic.archaeological_site",
  "osm.historic.monument", "osm.historic.memorial", "osm.historic.ruins",
  "osm.natural.peak", "osm.natural.waterfall", "osm.natural.cave_entrance", "osm.natural.beach",
  "osm.leisure.park", "osm.leisure.nature_reserve", "osm.amenity.marketplace",
];
export const photonSearchCategories = photonCategories;

function photoKey(place: NearbyPlace) {
  return `${place.name}|${place.location ?? ""}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}|${place.sourceUrl}`.toLowerCase();
}

function hasVerifiedPhoto(place: NearbyPlace) {
  const key = photoKey(place);
  const cached = photoReadyCache.get(key);
  if (cached) return cached;
  const request = findPlacePhoto(place.name, place.location ?? "", place.latitude, place.longitude, place.sourceUrl)
    .then((photo) => !!photo)
    .catch(() => false);
  photoReadyCache.set(key, request);
  return request;
}

async function keepPhotoBackedPlaces(places: NearbyPlace[]) {
  const candidates = places.slice(0, 60);
  const verified: NearbyPlace[] = [];
  for (let start = 0; start < candidates.length && verified.length < 30; start += 8) {
    const batch = candidates.slice(start, start + 8);
    const results = await Promise.all(batch.map(async (place) => ({ place, ready: await hasVerifiedPhoto(place) })));
    verified.push(...results.filter((result) => result.ready).map((result) => result.place));
  }
  return verified.slice(0, 30);
}

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

/** Overpass turns away requests without an identifying User-Agent (browsers keep their own). */
const overpassHeaders = { Accept: "application/json", "User-Agent": "GoWorth/1.0 (travel app)" };

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
    const response = await fetch(url.toString(), { headers: overpassHeaders, signal: controller.signal });
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
    const rawPlaces = osm.length ? osm : await wikipediaPlaces(center, radius);
    const places = await keepPhotoBackedPlaces(rawPlaces);
    cache.set(key, { places, expiresAt: Date.now() + 30 * 60 * 1000 });
    return places;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

const venueCategories: Record<VenueKind, string> = {
  restaurant: "Restaurants", bar: "Bars & Pubs", cafe: "Cafés", nightclub: "Nightlife",
};
const venueAmenities: Record<string, VenueKind> = { restaurant: "restaurant", bar: "bar", pub: "bar", cafe: "cafe", nightclub: "nightclub" };

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Restaurants, bars, cafés and clubs from OpenStreetMap. There are no ratings, so the best-described venues come first:
 * opening hours, cuisine, a website or outdoor seating suggest a real, maintained place; chains sink to the bottom.
 */
export function parseOsmVenues(elements: OsmElement[], center: Center, radiusKm: number, { limit = 40, location }: { limit?: number; location?: (element: OsmElement) => string | undefined } = {}): NearbyPlace[] {
  const seen = new Set<string>();
  const ranked = elements.flatMap((element, order) => {
    const tags = element.tags ?? {};
    const kind = venueAmenities[tags.amenity ?? ""];
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const name = tags.name?.trim();
    if (!kind || !name || latitude === undefined || longitude === undefined || !validCoordinates(latitude, longitude)) return [];
    const distance = distanceKm(center, { latitude, longitude });
    if (distance > radiusKm) return [];
    const key = `${name.toLocaleLowerCase()}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const terrace = tags.outdoor_seating === "yes";
    const cuisine = tags.cuisine?.split(";")[0]?.trim();
    const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const category = venueCategories[kind];
    const score = (tags.opening_hours ? 2 : 0) + (cuisine ? 2 : 0) + (tags.website || tags["contact:website"] ? 1 : 0)
      + (tags.phone || tags["contact:phone"] ? 1 : 0) + (terrace ? 1 : 0) + (tags.wikidata && !tags.brand ? 2 : 0)
      - (tags.brand || tags["brand:wikidata"] ? 4 : 0);
    const place: NearbyPlace = {
      id: `osm:${element.type}:${element.id}`, name, latitude, longitude, kind: "place",
      category, detail: `${category} · ${distance.toFixed(1)} km away`, source: "OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      venue: { kind, terrace, ...(cuisine ? { cuisine: titleCase(cuisine) } : {}), ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}), ...(address ? { address } : {}) },
    };
    const where = location?.(element) ?? tags["addr:city"];
    if (where) place.location = where;
    return [{ place, score, order }];
  });
  // Equal scores keep the source's order: Photon lists the best-known venues first.
  return ranked.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((item) => item.place);
}

/** The venues a set of discovery filters lets through: a matching kind, or outdoor seating when terraces are on. */
export function filterVenues(places: NearbyPlace[], filters: VenueFilter[]) {
  return places.filter((place) => place.venue && (filters.includes(place.venue.kind) || filters.includes("terrace") && place.venue.terrace));
}

/**
 * Photon is quick and lists well-known venues first, but carries no tags such as cuisine or outdoor seating. Each kind
 * is asked for separately and the results alternate, so famous restaurants do not crowd out bars, cafés and clubs.
 */
async function photonVenues(center: Center, radiusKm: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const types = { N: "node", W: "way", R: "relation" } as const;
  const locations = new Map<string, string>();
  try {
    const groups = await Promise.allSettled([["restaurant"], ["bar", "pub"], ["cafe"], ["nightclub"]].map(async (amenities) => {
      const url = new URL("https://photon.komoot.io/api/");
      for (const [key, value] of Object.entries({
        lat: String(center.latitude), lon: String(center.longitude), bbox: photonBoundingBoxes(center, radiusKm)[0].join(","),
        include: amenities.map((value) => `osm.amenity.${value}`).join(","), limit: "25",
      })) url.searchParams.set(key, value);
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error("OpenStreetMap venues are unavailable.");
      const data: { features?: PhotonFeature[] } = await response.json();
      return (data.features ?? []).filter((feature) => feature.properties.osm_key === "amenity").map((feature): OsmElement => {
        const element: OsmElement = {
          type: types[feature.properties.osm_type], id: feature.properties.osm_id,
          lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0],
          tags: {
            name: feature.properties.name ?? "", amenity: feature.properties.osm_value,
            ...(feature.properties.street ? { "addr:street": feature.properties.street } : {}),
            ...(feature.properties.housenumber ? { "addr:housenumber": feature.properties.housenumber } : {}),
          },
        };
        if (feature.properties.city && feature.properties.country) locations.set(`${element.type}:${element.id}`, `${feature.properties.city}, ${feature.properties.country}`);
        return element;
      });
    }));
    if (groups.every((group) => group.status === "rejected")) throw new Error("OpenStreetMap venues are unavailable.");
    const lists = groups.map((group) => group.status === "fulfilled" ? group.value : []);
    const elements = Array.from({ length: Math.max(...lists.map((list) => list.length)) }, (_, index) => lists.flatMap((list) => list[index] ? [list[index]] : [])).flat();
    const location = (element: OsmElement) => locations.get(`${element.type}:${element.id}`);
    return { elements, location, places: parseOsmVenues(elements, center, radiusKm, { location }) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Fills in cuisine, opening hours and outdoor seating for known venues by ID; a quick lookup, skipped when Overpass is busy. */
async function overpassVenueTags(places: NearbyPlace[]) {
  const ids = { node: [] as string[], way: [] as string[], relation: [] as string[] };
  for (const place of places) {
    const [, type, id] = place.id.split(":") as [string, keyof typeof ids, string];
    ids[type]?.push(id);
  }
  const query = `[out:json][timeout:8];(${Object.entries(ids).filter(([, list]) => list.length).map(([type, list]) => `${type}(id:${list.join(",")});`).join("")});out tags;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL("https://overpass-api.de/api/interpreter");
    url.searchParams.set("data", query);
    const response = await fetch(url.toString(), { headers: overpassHeaders, signal: controller.signal });
    if (!response.ok) return new Map<string, Record<string, string>>();
    const data: { elements?: OsmElement[] } = await response.json();
    return new Map((data.elements ?? []).map((element) => [`osm:${element.type}:${element.id}`, element.tags ?? {}]));
  } finally {
    clearTimeout(timeout);
  }
}

/** Venues around a point, within walking distance of it however wide the discovery radius is. */
export async function loadNearbyVenues(center: Center, radiusKm = 3): Promise<NearbyPlace[]> {
  const radius = Math.max(0.5, Math.min(radiusKm, 3));
  const key = `${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${radius}`;
  const saved = venueCache.get(key);
  if (saved && saved.expiresAt > Date.now()) return saved.places;
  const current = venuePending.get(key);
  if (current) return current;
  const request = (async () => {
    const { elements, location, places } = await photonVenues(center, radius);
    const tags = places.length ? await overpassVenueTags(places).catch(() => new Map<string, Record<string, string>>()) : new Map();
    const venues = tags.size
      ? parseOsmVenues(elements.map((element) => ({ ...element, tags: { ...element.tags, ...tags.get(`osm:${element.type}:${element.id}`) } })), center, radius, { location })
      : places;
    venueCache.set(key, { places: venues, expiresAt: Date.now() + (tags.size ? 30 : 5) * 60 * 1000 });
    return venues;
  })().finally(() => venuePending.delete(key));
  venuePending.set(key, request);
  return request;
}

/** The venue a saved place is, from its category: saved places keep the category but not the venue details. */
export function venueFromCategory(category: string | undefined, details: Partial<Omit<Venue, "kind">> = {}): Venue | undefined {
  const kind = (Object.keys(venueCategories) as VenueKind[]).find((item) => venueCategories[item] === category);
  return kind ? { terrace: false, ...details, kind } : undefined;
}
