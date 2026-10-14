import { destinationPins, distanceKm } from "@/data/map";
import { destinationForDay } from "@/utils/trip";

export const CITY_RADIUS_KM = 50;
const REGION_RADIUS_KM: Record<string, number> = { iceland: 350, alps: 220, bali: 150, "danube-delta": 160, "new-york": 85 };

export function placeFitsTripDay(
  trip: { destinationId: string; dayDestinations?: string[]; routeStops?: { id: string; latitude: number; longitude: number }[] },
  day: number,
  place: { latitude: number; longitude: number },
) {
  const center = trip.routeStops?.find((stop) => stop.id === destinationForDay(trip, day)) ||
    destinationPins.find((pin) => pin.id === destinationForDay(trip, day));
  return !!center && distanceKm(center, place) <= (REGION_RADIUS_KM[center.id] || CITY_RADIUS_KM);
}

export function mapsRouteUrl(points: { latitude: number; longitude: number }[]) {
  if (!points.length) return null;
  const coordinates = points.map((point) => `${point.latitude},${point.longitude}`);
  const params = new URLSearchParams({ api: "1", destination: coordinates.at(-1)!, travelmode: "driving" });
  if (coordinates.length > 1) params.set("origin", coordinates[0]);
  if (coordinates.length > 2) params.set("waypoints", coordinates.slice(1, -1).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function wazeRouteUrl(point: { latitude: number; longitude: number }) {
  return `https://waze.com/ul?ll=${encodeURIComponent(`${point.latitude},${point.longitude}`)}&navigate=yes`;
}
