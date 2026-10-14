import type { NearbyPlace } from "@/data/nearby-places";

export function externalPlaceFromSaved(id: string, details: unknown): NearbyPlace | null {
  if (typeof id !== "string" || !id.trim() || !details || typeof details !== "object") return null;
  const place = details as Record<string, unknown>;
  if (place.id !== id || typeof place.name !== "string" || !place.name.trim() ||
    typeof place.latitude !== "number" || !Number.isFinite(place.latitude) || Math.abs(place.latitude) > 90 ||
    typeof place.longitude !== "number" || !Number.isFinite(place.longitude) || Math.abs(place.longitude) > 180 ||
    typeof place.category !== "string" || typeof place.detail !== "string" ||
    (place.source !== "OpenStreetMap" && place.source !== "Wikipedia") ||
    typeof place.sourceUrl !== "string" || !place.sourceUrl.startsWith("https://")) return null;
  return { id, name: place.name, latitude: place.latitude, longitude: place.longitude,
    kind: "place", category: place.category, detail: place.detail,
    source: place.source, sourceUrl: place.sourceUrl,
    ...(typeof place.location === "string" && place.location.trim() ? { location: place.location.trim() } : {}) };
}
