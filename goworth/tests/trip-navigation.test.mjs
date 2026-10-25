import assert from "node:assert/strict";
import { test } from "node:test";
import { dayRoutePoints, mapsRouteUrl, MAX_ROUTE_STOPS } from "../src/utils/trip-navigation.ts";

const rome = { name: "Rome", latitude: 41.9, longitude: 12.5 };
const florence = { name: "Florence", latitude: 43.77, longitude: 11.25 };
const paris = { name: "Paris", latitude: 48.86, longitude: 2.35 };

test("daily route follows city order and only includes chosen places", () => {
  const points = dayRoutePoints([rome, florence, paris], [
    { name: "Florence museum", latitude: 43.78, longitude: 11.26, time: "14:00" },
    { name: "Rome square", latitude: 41.91, longitude: 12.51, time: "09:00" },
    { name: "Florence market", latitude: 43.76, longitude: 11.24, time: "12:00" },
  ]);
  assert.deepEqual(points.map((point) => point.name), ["Rome square", "Florence market", "Florence museum"]);
});

test("a day without mapped places has no route", () => {
  assert.deepEqual(dayRoutePoints([rome], [{ name: "Dinner", latitude: NaN, longitude: NaN, time: "20:00" }]), []);
  assert.equal(mapsRouteUrl([]), null);
});

test("one place opens directions to it from the current location", () => {
  const params = new URL(mapsRouteUrl([paris])).searchParams;
  assert.equal(params.get("destination"), "48.86,2.35");
  assert.equal(params.get("origin"), null);
  assert.equal(params.get("waypoints"), null);
});

test("one Google Maps link connects every place in order", () => {
  const points = Array.from({ length: 4 }, (_, index) => ({ latitude: 40 + index, longitude: 10 + index }));
  const params = new URL(mapsRouteUrl(points)).searchParams;
  assert.equal(params.get("waypoints"), "40,10|41,11|42,12");
  assert.equal(params.get("destination"), "43,13");
});

test("routes are capped at the stops Google Maps supports", () => {
  const points = Array.from({ length: 14 }, (_, index) => ({ latitude: index, longitude: index }));
  const params = new URL(mapsRouteUrl(points)).searchParams;
  assert.equal(params.get("waypoints").split("|").length, MAX_ROUTE_STOPS - 1);
  assert.equal(params.get("destination"), `${MAX_ROUTE_STOPS - 1},${MAX_ROUTE_STOPS - 1}`);
});
