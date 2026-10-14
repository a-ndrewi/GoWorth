import assert from "node:assert/strict";
import { test } from "node:test";
import { externalPlaceFromSaved } from "../src/data/external-places.ts";

test("saved live places retain coordinates and attribution", () => {
  const details = {
    id: "osm:node:42", name: "Old Museum", latitude: 44.43, longitude: 26.1,
    category: "Museums", detail: "Museums", location: "Bucharest, Romania", source: "OpenStreetMap",
    sourceUrl: "https://www.openstreetmap.org/node/42",
  };
  assert.deepEqual(externalPlaceFromSaved(details.id, details), { ...details, kind: "place" });
  assert.equal(externalPlaceFromSaved("other-id", details), null);
  assert.equal(externalPlaceFromSaved(undefined, { ...details, id: undefined }), null);
  assert.equal(externalPlaceFromSaved(details.id, { ...details, latitude: 999 }), null);
});
