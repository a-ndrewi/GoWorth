import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyExploreHistory, parseExploreHistory, rememberCountry, rememberPlace, unseenNearbyPlaces } from "../src/utils/explore-history.ts";

const place = {
  id: "osm:node:123", name: "Town Museum", latitude: 44.4268, longitude: 26.1025,
  kind: "place", category: "Museums", detail: "Museum · 1.2 km away",
  source: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/node/123",
};

test("recent countries and places stay deduplicated and ordered by latest visit", () => {
  let history = rememberCountry(emptyExploreHistory, "RO", "Romania", 1);
  history = rememberCountry(history, "IT", "", 2);
  history = rememberCountry(history, "RO", "", 3);
  history = rememberPlace(history, "RO", "geonames:683506", place, "museum", 4);
  history = rememberPlace(history, "RO", "geonames:683506", place, "", 5);
  assert.deepEqual(history.countries.map((item) => item.code), ["RO", "IT"]);
  assert.equal(history.places.length, 1);
  assert.equal(history.places[0].viewedAt, 5);
});

test("stored visits reject malformed places and keep valid ones", () => {
  const history = rememberPlace(rememberCountry(emptyExploreHistory, "RO", "", 1), "RO", "geonames:683506", place, "", 2);
  const parsed = parseExploreHistory(JSON.stringify({ ...history, places: [...history.places, { ...history.places[0], place: { ...place, sourceUrl: "javascript:bad" } }] }));
  assert.equal(parsed.countries.length, 1);
  assert.equal(parsed.places.length, 1);
  assert.deepEqual(parseExploreHistory("invalid"), emptyExploreHistory);
});

test("nearby suggestions omit already viewed places and duplicate source names", () => {
  const history = rememberPlace(emptyExploreHistory, "RO", "geonames:683506", place, "", 1);
  const candidates = [place, { ...place, id: "wiki:456" }, { ...place, id: "osm:node:789", name: "City Garden" }];
  assert.deepEqual(unseenNearbyPlaces(candidates, history).map((item) => item.name), ["City Garden"]);
});
