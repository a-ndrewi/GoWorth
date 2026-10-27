import assert from "node:assert/strict";
import { test } from "node:test";
import { placeInDay, stopContains } from "../src/utils/day-area.ts";
import { boundaryFromGeoJson } from "../src/data/city-boundary.ts";

// A city outline about 11 km across, with a neighbouring town 20 km east of its centre.
const outline = boundaryFromGeoJson("relation:1", { type: "Polygon", coordinates: [[[25.5, 45.6], [25.65, 45.6], [25.65, 45.7], [25.5, 45.7], [25.5, 45.6]]] });
const city = { id: "brasov-city", name: "Brașov", latitude: 45.65, longitude: 25.58 };
const other = { id: "sibiu-city", name: "Sibiu", latitude: 45.79, longitude: 24.15 };
const stops = { [city.id]: city, [other.id]: other };
const trip = { destinationId: city.id, dayCities: [[city.id], [other.id], [city.id, other.id]] };
const inCity = { latitude: 45.64, longitude: 25.6 };
const nextTown = { latitude: 45.65, longitude: 25.84 };

test("a place belongs to a city only inside its outline, however close the next town is", () => {
  assert.equal(stopContains(city, inCity, outline), true);
  assert.equal(stopContains(city, nextTown, outline), false);
  // Just outside the outline, though within a few kilometres of the centre.
  assert.equal(stopContains(city, { latitude: 45.65, longitude: 25.67 }, outline), false);
});

test("without an outline a city keeps a short radius, and regions keep their wide one", () => {
  assert.equal(stopContains(city, { latitude: 45.65, longitude: 25.65 }), true);
  assert.equal(stopContains(city, nextTown), false);
  assert.equal(stopContains({ id: "iceland", name: "Iceland", latitude: 64.9, longitude: -18.6 }, { latitude: 64.15, longitude: -21.94 }), true);
});

test("each day only takes places in its own cities", () => {
  const areas = { [city.id]: outline, [other.id]: null };
  assert.equal(placeInDay(trip, 1, inCity, (id) => stops[id], areas), true);
  assert.equal(placeInDay(trip, 2, inCity, (id) => stops[id], areas), false);
  assert.equal(placeInDay(trip, 3, inCity, (id) => stops[id], areas), true);
  assert.equal(placeInDay(trip, 1, nextTown, (id) => stops[id], areas), false);
  assert.equal(placeInDay(trip, 1, { latitude: Number.NaN, longitude: 25.6 }, (id) => stops[id], areas), false);
});

test("a catalog place belongs to its own destination, wherever its map point falls", () => {
  const positano = { destinationId: "positano" };
  const stop = (id) => ({ id, name: id, latitude: 40.628, longitude: 14.485 });
  assert.equal(placeInDay(positano, 1, { latitude: 40.0, longitude: 14.0, placeId: "spiaggia-grande" }, stop), true);
  assert.equal(placeInDay({ destinationId: "paris" }, 1, { latitude: 40.628, longitude: 14.485, placeId: "spiaggia-grande" }, stop), false);
});
