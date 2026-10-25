import assert from "node:assert/strict";
import { test } from "node:test";
import { boundaryFromGeoJson, boundaryRadiusKm, fallbackRadiusKm, insideBoundary, loadCityBoundary } from "../src/data/city-boundary.ts";

// A square district with a square hole in the middle, like a city with an enclave.
const square = boundaryFromGeoJson("relation:1", { type: "Polygon", coordinates: [
  [[26.0, 44.4], [26.1, 44.4], [26.1, 44.5], [26.0, 44.5], [26.0, 44.4]],
  [[26.04, 44.44], [26.06, 44.44], [26.06, 44.46], [26.04, 44.46], [26.04, 44.44]],
] });

test("places count as inside a district only within its outline and outside its holes", () => {
  assert.equal(insideBoundary(square, { latitude: 44.42, longitude: 26.02 }), true);
  assert.equal(insideBoundary(square, { latitude: 44.45, longitude: 26.05 }), false);
  assert.equal(insideBoundary(square, { latitude: 44.42, longitude: 26.2 }), false);
});

test("the search radius covers the whole outline, and cities without one get a radius by size", () => {
  const radius = boundaryRadiusKm(square, { latitude: 44.45, longitude: 26.05 });
  assert.ok(radius > 6 && radius < 7, String(radius));
  assert.equal(fallbackRadiusKm(2_000_000), 10);
  assert.equal(fallbackRadiusKm(3_000), 3);
});

test("a namesake elsewhere is not used as the city's outline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [
    { osm_type: "relation", osm_id: 2, geojson: { type: "Polygon", coordinates: [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]] } },
    { osm_type: "relation", osm_id: 3, geojson: { type: "Polygon", coordinates: [[[26, 44], [27, 44], [27, 45], [26, 45], [26, 44]]] } },
  ] });
  try {
    const outline = await loadCityBoundary({ id: "geonames:1", name: "Sector 9", latitude: 44.5, longitude: 26.5 }, "Testland");
    assert.equal(outline?.id, "relation:3");
  } finally { globalThis.fetch = originalFetch; }
});
