import assert from "node:assert/strict";
import { test } from "node:test";
import { isSavedDiscoverySuggestion } from "../src/utils/discovery-suggestions.ts";

const centers = [
  { id: "rome", latitude: 41.9028, longitude: 12.4964 },
  { id: "london", latitude: 51.5072, longitude: -0.1276 },
];
const catalog = [
  { id: "colosseum", name: "Colosseum", destinationId: "rome" },
  { id: "old-town-rome", name: "Old Town", destinationId: "rome" },
];

test("saved catalog attractions do not resurface through a nearby source", () => {
  const candidate = { id: "osm:way:123", name: "Colosseum", latitude: 41.8902, longitude: 12.4922 };
  assert.equal(isSavedDiscoverySuggestion(candidate, new Set(["colosseum"]), [], catalog, centers), true);
});

test("saved nearby attractions do not resurface through another source or catalog", () => {
  const saved = [{ id: "osm:way:123", name: "Colosseum", latitude: 41.8902, longitude: 12.4922 }];
  const ids = new Set([saved[0].id]);
  assert.equal(isSavedDiscoverySuggestion({ id: "wiki:456", name: "Colosseum", latitude: 41.8904, longitude: 12.492 }, ids, saved, catalog, centers), true);
  assert.equal(isSavedDiscoverySuggestion({ ...catalog[0] }, ids, saved, catalog, centers), true);
});

test("matching names in distant cities remain discoverable", () => {
  const saved = [{ id: "osm:way:123", name: "Old Town", latitude: 41.9028, longitude: 12.4964 }];
  assert.equal(isSavedDiscoverySuggestion({ id: "osm:way:789", name: "Old Town", latitude: 51.5072, longitude: -0.1276 }, new Set([saved[0].id]), saved, catalog, centers), false);
});
