import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { destinationCatalog, places, placesForDestination, placeMapUrl } from "../src/data/catalog.ts";

test("every destination has a unique ID and six unique places", () => {
  const ids = destinationCatalog.map((destination) => destination.id);
  assert.equal(ids.length, 24);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(places.length, 144);
  assert.equal(new Set(places.map((place) => place.id)).size, places.length);
  for (const id of ids) {
    assert.equal(placesForDestination(id).length, 6, `${id} should have six places`);
  }
});

test("every destination has a bundled, decodable CC0 photograph with provenance", async () => {
  const provenance = JSON.parse(await readFile(new URL("../assets/images/destinations/provenance.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(provenance).sort(), destinationCatalog.map((destination) => destination.id).sort());
  for (const destination of destinationCatalog) {
    const photo = provenance[destination.id];
    assert.equal(photo.license, "CC0");
    assert.match(photo.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    const image = await readFile(new URL(`../assets/images/destinations/${destination.id}.jpg`, import.meta.url));
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.ok(metadata.width >= 600 && metadata.height >= 350);
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
