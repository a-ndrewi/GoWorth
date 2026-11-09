import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceKm, wrappedStats, wrappedYear } from "../src/utils/travel-wrapped.ts";

const stop = (id, countryCode, latitude = 0, longitude = 0) => ({ id, name: id[0].toUpperCase() + id.slice(1), countryCode, latitude, longitude });
const rome = stop("rome", "IT", 41.9028, 12.4964);
const florence = stop("florence", "IT", 43.7696, 11.2558);
const nice = stop("nice", "FR", 43.7102, 7.262);
const tokyo = stop("tokyo", "JP", 35.6762, 139.6503);
const trip = (start, end, stops, extra = {}) => ({ start, end, stops, places: 0, spent: 0, ...extra });

test("the recap opens in November and stays through January for the year that ended", () => {
  assert.equal(wrappedYear(new Date("2026-10-31T12:00:00Z")), null);
  assert.equal(wrappedYear(new Date("2026-11-01T12:00:00Z")), 2026);
  assert.equal(wrappedYear(new Date("2026-12-31T12:00:00Z")), 2026);
  assert.equal(wrappedYear(new Date("2027-01-20T12:00:00Z")), 2026);
  assert.equal(wrappedYear(new Date("2027-02-01T12:00:00Z")), null);
});

test("great-circle distance between Rome and Florence is about 230 km", () => {
  const km = distanceKm(rome, florence);
  assert.ok(km > 225 && km < 235, String(km));
});

test("a year adds up trips, days, countries, cities, places, spending and distance", () => {
  const stats = wrappedStats(2026, [
    trip("2026-05-01", "2026-05-07", [rome, florence, nice], { places: 9, spent: 1200 }),
    trip("2026-09-10", "2026-09-12", [tokyo], { places: 3, spent: 800 }),
    trip("2025-03-01", "2025-03-04", [rome]),
  ]);
  assert.equal(stats.trips, 2);
  assert.equal(stats.days, 10);
  assert.deepEqual(stats.countries, ["IT", "FR", "JP"]);
  assert.equal(stats.cities, 4);
  assert.equal(stats.places, 12);
  assert.equal(stats.spent, 2000);
  assert.equal(stats.km, Math.round(distanceKm(rome, florence) + distanceKm(florence, nice)));
  assert.deepEqual(stats.longest, { name: "Rome", days: 7 });
  assert.equal(stats.busiestMonth, 4);
  // The 7-day trip splits 3.5 days each between Italy and France, ahead of Japan's 3; ties go alphabetically.
  assert.deepEqual(stats.topCountry, { code: "FR", days: 4 });
});

test("a trip over New Year counts only its days in the year", () => {
  const stats = wrappedStats(2026, [trip("2026-12-29", "2027-01-03", [rome])]);
  assert.equal(stats.trips, 1);
  assert.equal(stats.days, 3);
  assert.equal(stats.busiestMonth, 11);
  assert.deepEqual(stats.monthDays, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3]);
  assert.equal(wrappedStats(2027, [trip("2026-12-29", "2027-01-03", [rome])]).days, 3);
});

test("stops without a position add no distance", () => {
  assert.equal(wrappedStats(2026, [trip("2026-06-01", "2026-06-03", [rome, stop("somewhere", "IT")])]).km, 0);
});

test("only countries first visited this year are new", () => {
  const stats = wrappedStats(2026, [trip("2026-05-01", "2026-05-07", [rome, nice])], { IT: "2024-08-02", FR: "2026-05-04" });
  assert.deepEqual(stats.newCountries, ["FR"]);
});

test("an empty year has nothing to show and no busiest month", () => {
  const stats = wrappedStats(2026, []);
  assert.equal(stats.trips, 0);
  assert.equal(stats.busiestMonth, null);
  assert.equal(stats.topCountry, null);
  assert.equal(stats.persona, "first-timer");
});

test("the persona follows how the year was travelled", () => {
  const countries = ["IT", "FR", "JP", "ES"].map((code, index) => trip(`2026-0${index + 1}-01`, `2026-0${index + 1}-03`, [stop(`c${index}`, code)]));
  assert.equal(wrappedStats(2026, countries).persona, "explorer");
  assert.equal(wrappedStats(2026, [trip("2026-05-01", "2026-05-05", [rome, florence, stop("pisa", "IT"), stop("siena", "IT")]), trip("2026-07-01", "2026-07-02", [stop("milan", "IT"), stop("turin", "IT")])]).persona, "city-hopper");
  assert.equal(wrappedStats(2026, [trip("2026-05-01", "2026-05-14", [rome]), trip("2026-07-01", "2026-07-10", [nice])]).persona, "slow-traveller");
  assert.equal(wrappedStats(2026, [trip("2026-05-01", "2026-05-02", [rome]), trip("2026-07-01", "2026-07-03", [nice])]).persona, "weekender");
});
