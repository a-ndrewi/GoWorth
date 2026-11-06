import assert from "node:assert/strict";
import { test } from "node:test";
import { arcPath, deepen, routeLayout, storyCountries, storyHeadline, storyPalette } from "../src/utils/trip-story.ts";

const luminance = (value) => {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test("a country's card is printed in its flag colours, dark enough for white text", () => {
  for (const code of ["IT", "FR", "JP", "DE", "RO", "GR", "AR", "FI"]) {
    const { deep, stripe } = storyPalette(code, "#2457E6");
    assert.ok(luminance(deep) < 0.2, `${code} background ${deep} is too light`);
    assert.ok(stripe.length >= 2);
  }
  assert.deepEqual(storyPalette("IT", "#2457E6").stripe, ["#009246", "#F1F2F1", "#CE2B37"]);
});

test("countries without a known flag fall back to the continent ink", () => {
  const palette = storyPalette("XK", "#2457E6");
  assert.equal(palette.accent, "#2457E6");
  assert.equal(palette.deep, deepen("#2457E6", 0.45));
});

test("route stops group into countries in route order, with each city once", () => {
  const stops = [
    { id: "rome", name: "Rome", country: "Italy", countryCode: "" },
    { id: "nice", name: "Nice", country: "France", countryCode: "FR" },
    { id: "rome2", name: "Rome", country: "Italy", countryCode: "IT" },
    { id: "florence", name: "Florence", country: "Italy", countryCode: "it" },
    { id: "nowhere", name: "Atlantis", country: "Atlantis", countryCode: "" },
  ];
  const countries = storyCountries(stops, (name) => ({ Italy: "IT", France: "FR" })[name]);
  assert.deepEqual(countries.map((country) => [country.code, country.cities]), [["IT", ["Rome", "Florence"]], ["FR", ["Nice"]]]);
});

test("the headline names one or two countries and counts more", () => {
  assert.equal(storyHeadline(["Italy"], "en"), "Italy");
  assert.equal(storyHeadline(["Italy", "France"], "en"), "Italy & France");
  assert.equal(storyHeadline(["Italia", "Franța", "Spania"], "ro"), "3 țări");
});

test("a route fills its box without leaving it, north up", () => {
  const box = { left: 40, top: 100, width: 280, height: 220 };
  const rome = { latitude: 41.9, longitude: 12.5 }, milan = { latitude: 45.46, longitude: 9.19 }, naples = { latitude: 40.85, longitude: 14.27 };
  const [r, m, n] = routeLayout([rome, milan, naples], box);
  for (const point of [r, m, n]) {
    assert.ok(point.x >= box.left - 0.01 && point.x <= box.left + box.width + 0.01);
    assert.ok(point.y >= box.top - 0.01 && point.y <= box.top + box.height + 0.01);
  }
  assert.ok(m.y < r.y && r.y < n.y, "Milan is drawn above Rome, Rome above Naples");
  assert.ok(m.x < n.x, "Milan is west of Naples");
});

test("one stop sits in the middle of the map", () => {
  assert.deepEqual(routeLayout([{ latitude: 48.85, longitude: 2.35 }], { left: 0, top: 0, width: 100, height: 60 }), [{ x: 50, y: 30 }]);
  assert.match(arcPath({ x: 0, y: 0 }, { x: 10, y: 0 }), /^M 0\.0 0\.0 Q 5\.0 2\.2 10\.0 0\.0$/);
});
