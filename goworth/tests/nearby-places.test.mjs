import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOsmPlaces, parsePhotonPlaces, parseWikipediaPlaces, photonBoundingBoxes } from "../src/data/nearby-places.ts";

const center = { latitude: 44.4268, longitude: 26.1025 };

test("OpenStreetMap places use named attractions, way centers, and stable source links", () => {
  const places = parseOsmPlaces([
    { type: "way", id: 23, center: { lat: 44.428, lon: 26.103 }, tags: { name: "History Museum", tourism: "museum" } },
    { type: "node", id: 24, lat: 44.427, lon: 26.102, tags: { name: "Old Fort", historic: "fort" } },
    { type: "node", id: 25, lat: 44.427, lon: 26.102, tags: { tourism: "museum" } },
    { type: "node", id: 26, lat: 46, lon: 28, tags: { name: "Too far", tourism: "museum" } },
  ], center, 8);
  assert.equal(places.length, 2);
  assert.equal(places[0].name, "Old Fort");
  assert.equal(places[1].category, "Museums");
  assert.equal(places[1].sourceUrl, "https://www.openstreetmap.org/way/23");
});

test("Wikipedia fallback keeps nearby geographic pages and excludes transit stations", () => {
  const places = parseWikipediaPlaces([
    { pageid: 1, title: "Old Church", lat: 44.427, lon: 26.103, dist: 50 },
    { pageid: 2, title: "Central metro station", lat: 44.428, lon: 26.103, dist: 150 },
    { pageid: 3, title: "Distant Museum", lat: 46, lon: 28, dist: 100 },
  ], center, 8);
  assert.deepEqual(places.map((place) => place.id), ["wiki:1"]);
  assert.equal(places[0].source, "Wikipedia");
  assert.equal(places[0].sourceUrl, "https://en.wikipedia.org/?curid=1");
});

test("Photon results keep only tourist features inside the search area", () => {
  const places = parsePhotonPlaces([
    { properties: { osm_type: "W", osm_id: 100, osm_key: "tourism", osm_value: "museum", name: "Art Museum" }, geometry: { coordinates: [26.103, 44.428] } },
    { properties: { osm_type: "N", osm_id: 101, osm_key: "amenity", osm_value: "restaurant", name: "Museum Restaurant" }, geometry: { coordinates: [26.103, 44.428] } },
    { properties: { osm_type: "N", osm_id: 102, osm_key: "historic", osm_value: "castle", name: "Far Castle" }, geometry: { coordinates: [28, 46] } },
  ], center, 8);
  assert.deepEqual(places.map((place) => place.name), ["Art Museum"]);
  assert.equal(places[0].sourceUrl, "https://www.openstreetmap.org/way/100");
});

test("Photon bounding boxes stay valid across the date line", () => {
  for (const longitude of [-179.99, 179.99]) {
    const boxes = photonBoundingBoxes({ latitude: 0, longitude }, 8);
    assert.equal(boxes.length, 2);
    for (const [west, south, east, north] of boxes) {
      assert.ok(west >= -180 && east <= 180 && west < east);
      assert.ok(south < north);
    }
  }
});
