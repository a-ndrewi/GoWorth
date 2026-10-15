import { normalizeSearchText } from "./search.ts";

type Point = { latitude: number; longitude: number };
type PlaceIdentity = { id: string; name: string; latitude?: number; longitude?: number; destinationId?: string };
type CatalogIdentity = { id: string; name: string; destinationId: string };
type DestinationCenter = Point & { id: string };

function withinKm(a: Point, b: Point, limitKm: number) {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const arc = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(arc)) <= limitKm;
}

export function isSavedDiscoverySuggestion(
  candidate: PlaceIdentity,
  savedIds: ReadonlySet<string>,
  externalPlaces: readonly (PlaceIdentity & Point)[],
  catalogPlaces: readonly CatalogIdentity[],
  centers: readonly DestinationCenter[],
) {
  if (savedIds.has(candidate.id)) return true;
  const name = normalizeSearchText(candidate.name);
  const candidatePoint = candidate.latitude === undefined || candidate.longitude === undefined
    ? null : { latitude: candidate.latitude, longitude: candidate.longitude };
  const centerFor = (destinationId: string) => centers.find((center) => center.id === destinationId);

  if (externalPlaces.some((saved) => savedIds.has(saved.id) && normalizeSearchText(saved.name) === name &&
    (candidatePoint ? withinKm(candidatePoint, saved, 2) :
      !!candidate.destinationId && !!centerFor(candidate.destinationId) && withinKm(saved, centerFor(candidate.destinationId)!, 200)))) return true;

  return catalogPlaces.some((saved) => savedIds.has(saved.id) && normalizeSearchText(saved.name) === name &&
    (candidate.destinationId === saved.destinationId ||
      !!candidatePoint && !!centerFor(saved.destinationId) && withinKm(candidatePoint, centerFor(saved.destinationId)!, 200)));
}
