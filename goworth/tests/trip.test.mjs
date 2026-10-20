import assert from "node:assert/strict";
import { test } from "node:test";
import { tripDays, validateTrip } from "../src/utils/trip.ts";

const valid = { destinationId: "positano", start: "2026-11-12", end: "2026-11-15", budget: 2500 };
test("trip duration includes both departure and return", () => {
  assert.equal(tripDays(valid.start, valid.end), 4);
  assert.equal(tripDays(valid.start, valid.start), 1);
});
test("duration is stable across daylight-saving boundaries", () => {
  assert.equal(tripDays("2026-10-24", "2026-10-26"), 3);
});
test("a well-formed trip is accepted", () =>
  assert.equal(validateTrip(valid), null));
test("a trip cannot be created without choosing a destination", () =>
  assert.match(validateTrip({ ...valid, destinationId: "" }), /country and city/));
test("missing and impossible calendar dates are rejected", () => {
  for (const start of [
    "",
    "invalid",
    "2026-02-29",
    "2026-04-31",
    "11/12/2026",
    "2026-13-10",
  ]) {
    assert.match(validateTrip({ ...valid, start }), /valid dates/);
  }
});
test("return before departure is rejected", () => {
  assert.match(validateTrip({ ...valid, end: "2026-11-11" }), /on or after/);
});
test("exactly fourteen days are allowed, fifteen are not", () => {
  assert.equal(validateTrip({ ...valid, end: "2026-11-25" }), null);
  assert.match(validateTrip({ ...valid, end: "2026-11-26" }), /14 days/);
});
test("invalid budgets are rejected", () => {
  for (const budget of [0, -10, 99, NaN, Infinity]) {
    assert.match(validateTrip({ ...valid, budget }), /budget/);
  }
});

const rome = { id: "osm:relation:41485", name: "Rome", country: "Italy", countryCode: "IT", latitude: 41.9, longitude: 12.5 };
const florence = { id: "osm:relation:42602", name: "Florence", country: "Italy", countryCode: "IT", latitude: 43.77, longitude: 11.25 };
const paris = { id: "osm:relation:71525", name: "Paris", country: "France", countryCode: "FR", latitude: 48.86, longitude: 2.35 };

test("a route can span multiple cities and countries", () => {
  assert.equal(validateTrip({ ...valid, destinationId: rome.id,
    dayDestinations: [rome.id, florence.id, paris.id, paris.id],
    routeStops: [rome, florence, paris],
  }), null);
});

test("every route day must refer to a valid stop", () => {
  const trip = { ...valid, destinationId: rome.id,
    dayDestinations: [rome.id, florence.id, paris.id, paris.id],
    routeStops: [rome, florence, paris],
  };
  assert.match(validateTrip({ ...trip, dayDestinations: [rome.id, "unknown", paris.id, paris.id] }), /valid city/);
  assert.match(validateTrip({ ...trip, routeStops: [rome, florence, { ...paris, latitude: 100 }] }), /valid city/);
  assert.match(validateTrip({ ...trip, routeStops: [rome, florence, florence] }), /valid city/);
});
