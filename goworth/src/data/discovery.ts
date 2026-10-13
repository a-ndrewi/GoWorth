import { destinations, places, type Destination, type Place } from "@/data/travel";
import { destinationPins } from "@/data/map";

export type Coordinates = { latitude: number; longitude: number };
export type DiscoveryItem = {
  key: string;
  kind: "destination" | "place";
  destination: Destination;
  place?: Place;
  distanceKm?: number;
};

const pins = new Map(destinationPins.map((pin) => [pin.id, pin]));

export function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const arc = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(arc));
}

export function discoveryDeck(center: Coordinates | null, radiusKm: number, region: string): DiscoveryItem[] {
  const eligible = destinations.map((destination) => {
    const pin = pins.get(destination.id)!;
    return { destination, distanceKm: center ? distanceKm(center, pin) : undefined };
  }).filter(({ distanceKm: distance }) => distance === undefined || radiusKm === 20000 || distance <= radiusKm)
    .sort((a, b) => center
      ? (a.distanceKm ?? 0) - (b.distanceKm ?? 0)
      : Number(b.destination.region === region) - Number(a.destination.region === region));

  const localPlaces = new Map<string, Place[]>();
  for (const place of places) {
    const current = localPlaces.get(place.destinationId) ?? [];
    if (current.length < 2) localPlaces.set(place.destinationId, [...current, place]);
  }

  const deck: DiscoveryItem[] = [];
  for (let offset = 0; offset < eligible.length; offset += 3) {
    const group = eligible.slice(offset, offset + 3);
    for (const { destination, distanceKm: distance } of group) {
      deck.push({ key: `destination:${destination.id}`, kind: "destination", destination, distanceKm: distance });
    }
    for (let placeIndex = 0; placeIndex < 2; placeIndex++) {
      for (const { destination, distanceKm: distance } of group) {
        const place = localPlaces.get(destination.id)?.[placeIndex];
        if (place) deck.push({ key: `place:${place.id}`, kind: "place", destination, place, distanceKm: distance });
      }
    }
  }
  return deck;
}
