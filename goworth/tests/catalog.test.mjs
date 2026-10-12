import assert from "node:assert/strict";
import { test } from "node:test";
import { destinationCatalog, places, placesForDestination, placeMapUrl } from "../src/data/catalog.ts";

test("every destination has a unique ID and six unique places", () => {
  const ids = destinationCatalog.map((destination) => destination.id);
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(places.length, 72);
  assert.equal(new Set(places.map((place) => place.id)).size, places.length);
  for (const id of ids) {
    assert.equal(placesForDestination(id).length, 6, `${id} should have six places`);
  }
});

test("place map searches include the venue and its destination", () => {
  const destinations = new Map(destinationCatalog.map((destination) => [destination.id, destination]));
  for (const place of places) {
    const destination = destinations.get(place.destinationId);
    assert.ok(destination, `${place.id} should have a destination`);
    assert.ok(place.name.trim());
    const url = new URL(placeMapUrl(place));
    assert.equal(url.hostname, "www.openstreetmap.org");
    const query = url.searchParams.get("query");
    assert.ok(query.includes(place.name));
    assert.ok(query.includes(destination.name));
  }
});
