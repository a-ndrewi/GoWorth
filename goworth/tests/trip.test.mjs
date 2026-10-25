import assert from "node:assert/strict";
import { test } from "node:test";
import { adjustStopDays, citiesForDay, dayCitiesFromStops, resizeDayCities, splitDays, stopsFromDayCities, tripDays, validateTrip } from "../src/utils/trip.ts";

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

test("one day may contain several cities across countries while other days remain single-city", () => {
  const trip = { ...valid, destinationId: rome.id,
    dayDestinations: [rome.id, rome.id, paris.id, paris.id],
    dayCities: [[rome.id], [rome.id, florence.id, paris.id], [paris.id], [paris.id]],
    routeStops: [rome, florence, paris],
  };
  assert.equal(validateTrip(trip), null);
  assert.deepEqual(citiesForDay(trip, 2), [rome.id, florence.id, paris.id]);
  assert.deepEqual(citiesForDay({ ...trip, dayCities: undefined }, 2), [rome.id]);
  assert.match(validateTrip({ ...trip, dayCities: [[rome.id], [], [paris.id], [paris.id]] }), /valid city/);
  assert.match(validateTrip({ ...trip, dayCities: [[rome.id], [rome.id, rome.id], [paris.id], [paris.id]] }), /valid city/);
  assert.match(validateTrip({ ...trip, dayCities: [[rome.id], [florence.id], [paris.id], [paris.id]] }), /valid city/);
});

test("new trip days continue from the last planned city", () => {
  assert.deepEqual(resizeDayCities({ destinationId: rome.id, dayCities: [[rome.id], [florence.id, paris.id]] }, 4),
    [[rome.id], [florence.id, paris.id], [florence.id, paris.id], [florence.id, paris.id]]);
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

test("days are split evenly across route stops, earlier stops first", () => {
  assert.deepEqual(splitDays(7, 2), [4, 3]);
  assert.deepEqual(splitDays(6, 3), [2, 2, 2]);
  assert.deepEqual(splitDays(5, 1), [5]);
  assert.deepEqual(splitDays(2, 3), [1, 1, 0]);
});
test("adjusting a stop keeps the trip length and every stop at one day or more", () => {
  assert.deepEqual(adjustStopDays([4, 3], 0, 1), [5, 2]);
  assert.deepEqual(adjustStopDays([4, 3], 1, -1), [5, 2]);
  assert.deepEqual(adjustStopDays([2, 1, 3], 1, 1), [2, 2, 2]);
  assert.deepEqual(adjustStopDays([1, 1], 0, 1), [2, 0]);
  assert.deepEqual(adjustStopDays([2, 1], 1, -1), [3, 0]);
  assert.equal(adjustStopDays([1, 0], 1, -1), null);
  assert.equal(adjustStopDays([1, 4], 0, -1), null);
  assert.equal(adjustStopDays([5], 0, 1), null);
});
test("stops expand into one city per day that passes validation", () => {
  const dayCities = dayCitiesFromStops(["a", "b"], [2, 1]);
  assert.deepEqual(dayCities, [["a"], ["a"], ["b"]]);
  assert.equal(validateTrip({ ...valid, start: "2026-11-12", end: "2026-11-14", destinationId: "a", dayCities, dayDestinations: dayCities.map((day) => day[0]) }), null);
});

test("a stop with no days of its own is visited on the same day as the stop before", () => {
  const dayCities = dayCitiesFromStops(["florence", "pisa", "lucca", "rome"], [2, 0, 0, 1]);
  assert.deepEqual(dayCities, [["florence"], ["florence", "pisa", "lucca"], ["rome"]]);
  assert.equal(validateTrip({ ...valid, start: "2026-11-12", end: "2026-11-14", destinationId: "florence", dayCities, dayDestinations: dayCities.map((day) => day[0]) }), null);
});
test("a saved day plan reads back into stops for editing", () => {
  assert.deepEqual(stopsFromDayCities([["florence"], ["florence", "pisa"], ["rome"]]), { ids: ["florence", "pisa", "rome"], days: [2, 0, 1], exact: true });
  assert.equal(stopsFromDayCities([["rome"], ["naples"], ["rome"]]).exact, false);
});

test("activities after the suggested slots follow the latest one instead of repeating 19:00", async () => {
  const { nextActivitySlot } = await import("../src/utils/trip.ts");
  const day = ["09:00", "11:30", "14:00", "16:30", "19:00"].map((time) => ({ day: 1, time }));
  assert.deepEqual(nextActivitySlot(day, 1), { time: "20:30", period: "Evening" });
  assert.deepEqual(nextActivitySlot([...day, { day: 1, time: "23:00" }], 1), { time: "23:30", period: "Evening" });
  assert.deepEqual(nextActivitySlot(day, 2), { time: "09:00", period: "Morning" });
});
