import assert from "node:assert/strict";
import { test } from "node:test";
import { citiesForCountry, citiesForUsState, cityForGlobalId, cityForId, countries, countryFlag, representativeCities, searchCities, usStates } from "../src/data/geography.ts";
import { usStateCenters } from "../src/data/us-state-centers.ts";

test("GeoNames country and city index is navigable with stable IDs", () => {
  assert.equal(countries.length, 250);
  assert.equal(countries.reduce((count, country) => count + country.cityCount, 0), 69806);
  assert.equal(countryFlag("RO"), "🇷🇴");
  const bucharest = citiesForCountry("RO").find((city) => city.name === "Bucharest");
  assert.ok(bucharest);
  assert.deepEqual(cityForId("RO", bucharest.id), bucharest);
  assert.deepEqual(cityForGlobalId(bucharest.id), bucharest);
  assert.ok(searchCities("Bucharest").some((city) => city.id === bucharest.id));
  assert.ok(representativeCities().some((city) => city.id === bucharest.id));
});

test("all displayed countries have unique codes and valid city coordinates", () => {
  assert.equal(new Set(countries.map((country) => country.code)).size, countries.length);
  for (const country of countries) {
    assert.match(country.code, /^[A-Z]{2}$/);
    for (const city of citiesForCountry(country.code)) {
      assert.ok(Math.abs(city.latitude) <= 90 && Math.abs(city.longitude) <= 180, city.id);
    }
  }
});

test("US cities are grouped into 50 states and District of Columbia", () => {
  assert.equal(usStates.length, 51);
  assert.equal(new Set(usStates.map((state) => state.code)).size, 51);
  assert.equal(usStates.reduce((sum, state) => sum + state.cityCount, 0), citiesForCountry("US").length);
  assert.ok(citiesForUsState("NY").some((city) => city.name === "New York City"));
  assert.ok(citiesForUsState("DC").some((city) => city.name === "Washington"));
  assert.deepEqual(new Set(Object.keys(usStateCenters)), new Set(usStates.map((state) => state.code)));
  for (const [latitude, longitude] of Object.values(usStateCenters)) {
    assert.ok(Number.isFinite(latitude) && Math.abs(latitude) <= 90);
    assert.ok(Number.isFinite(longitude) && Math.abs(longitude) <= 180);
  }
});
