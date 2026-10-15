import assert from "node:assert/strict";
import { test } from "node:test";
import { isExplorePlace, parseOsmPlaces, parsePhotonPlaces, parseWikipediaPlaces, photonBoundingBoxes } from "../src/data/nearby-places.ts";

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
    { pageid: 1, title: "Old Church", lat: 44.427, lon: 26.103, pageprops: { page_image_free: "church.jpg", "wikibase-shortdesc": "Historic church in Bucharest" } },
    { pageid: 2, title: "Central metro station", lat: 44.428, lon: 26.103, pageprops: { page_image_free: "station.jpg", "wikibase-shortdesc": "Metro station near a museum" } },
    { pageid: 3, title: "Distant Museum", lat: 46, lon: 28, pageprops: { page_image_free: "museum.jpg", "wikibase-shortdesc": "Art museum" } },
    { pageid: 4, title: "Unpictured Castle", lat: 44.427, lon: 26.103, pageprops: { "wikibase-shortdesc": "Historic castle" } },
  ], center, 8);
  assert.deepEqual(places.map((place) => place.id), ["wiki:1"]);
  assert.equal(places[0].source, "Wikipedia");
  assert.equal(places[0].sourceUrl, "https://en.wikipedia.org/?curid=1");
});

test("map search may include cities while place discovery stays attraction-only", () => {
  const pages = [
    { pageid: 5, title: "Paris", lat: 48.8567, lon: 2.3522, pageprops: { page_image_free: "paris.jpg", "wikibase-shortdesc": "Capital and largest city of France" } },
    { pageid: 6, title: "Louvre", lat: 48.8611, lon: 2.3358, pageprops: { page_image_free: "louvre.jpg", "wikibase-shortdesc": "Art museum in Paris" } },
  ];
  const paris = { latitude: 48.8566, longitude: 2.3522 };
  assert.deepEqual(parseWikipediaPlaces(pages, paris, 10).map((place) => place.name), ["Louvre"]);
  assert.deepEqual(parseWikipediaPlaces(pages, paris, 10, true).map((place) => place.name), ["Paris", "Louvre"]);
});

test("Photon results keep only tourist features inside the search area", () => {
  const places = parsePhotonPlaces([
    { properties: { osm_type: "W", osm_id: 100, osm_key: "tourism", osm_value: "museum", name: "Art Museum", city: "Bucharest", country: "Romania" }, geometry: { coordinates: [26.103, 44.428] } },
    { properties: { osm_type: "N", osm_id: 101, osm_key: "amenity", osm_value: "restaurant", name: "Museum Restaurant" }, geometry: { coordinates: [26.103, 44.428] } },
    { properties: { osm_type: "N", osm_id: 102, osm_key: "historic", osm_value: "castle", name: "Far Castle" }, geometry: { coordinates: [28, 46] } },
  ], center, 8);
  assert.deepEqual(places.map((place) => place.name), ["Art Museum"]);
  assert.equal(places[0].sourceUrl, "https://www.openstreetmap.org/way/100");
  assert.equal(places[0].location, "Bucharest, Romania");
});

test("city searches distinguish explore places from addresses and settlements", () => {
  assert.equal(isExplorePlace({ osm_key: "tourism", osm_value: "museum" }), true);
  assert.equal(isExplorePlace({ osm_key: "historic", osm_value: "monument" }), true);
  assert.equal(isExplorePlace({ osm_key: "tourism", osm_value: "hotel" }), false);
  assert.equal(isExplorePlace({ osm_key: "amenity", osm_value: "theatre" }), false);
  assert.equal(isExplorePlace({ osm_key: "office", osm_value: "government" }), false);
  assert.equal(isExplorePlace({ osm_key: "leisure", osm_value: "playground" }), false);
  assert.equal(isExplorePlace({ osm_key: "amenity", osm_value: "restaurant" }), false);
  assert.equal(isExplorePlace({ osm_key: "building", osm_value: "apartments" }), false);
  assert.equal(isExplorePlace({ osm_key: "place", osm_value: "city" }), false);
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
