import { destinationPins } from "@/data/map";
import { destinations, type RouteStop, type Trip } from "@/data/travel";
import { destinationForDay } from "@/utils/trip";

export function routeStop(trip: Pick<Trip, "destinationId" | "routeStops">, id = trip.destinationId): RouteStop {
  const stored = trip.routeStops?.find((stop) => stop.id === id);
  if (stored) return stored;
  const destination = destinations.find((item) => item.id === id);
  const pin = destinationPins.find((item) => item.id === id);
  return {
    id, name: destination?.name || id, country: destination?.country || "",
    countryCode: "", latitude: pin?.latitude ?? 0, longitude: pin?.longitude ?? 0,
  };
}

export function routeStopForDay(trip: Trip, day: number) {
  return routeStop(trip, destinationForDay(trip, day));
}

export function uniqueRouteStops(trip: Trip) {
  const ids = trip.dayDestinations || [trip.destinationId];
  return ids.filter((id, index) => index === 0 || id !== ids[index - 1]).map((id) => routeStop(trip, id));
}

export function routeTitle(trip: Trip) {
  const stops = uniqueRouteStops(trip);
  return stops.length > 1 ? `${stops[0].name} + ${stops.length - 1} stops` : stops[0].name;
}
