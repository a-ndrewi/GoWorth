import assert from "node:assert/strict";
import { test } from "node:test";
import { publicActivityNote, publicPlaceCategory } from "../src/utils/public-activity.ts";

test("archived activity notes hide provider, links, and generated distance", () => {
  assert.equal(
    publicActivityNote("OpenStreetMap · Landmarks · 4.4 km away · https://www.openstreetmap.org/node/123"),
    "",
  );
  assert.equal(
    publicActivityNote("Landmarks · 4.4 km away · https://www.openstreetmap.org/node/123 · Bring a camera"),
    "Bring a camera",
  );
  assert.equal(publicActivityNote("Meet the guide at 10:00"), "Meet the guide at 10:00");
  assert.equal(publicPlaceCategory("Museums · OpenStreetMap"), "Museums");
});
