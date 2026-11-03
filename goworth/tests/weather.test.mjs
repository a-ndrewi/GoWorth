import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTemperature, weatherKind } from "../src/data/weather.ts";

test("weather codes fold into the app's icons", () => {
  assert.equal(weatherKind(0), "sun");
  assert.equal(weatherKind(2), "partly");
  assert.equal(weatherKind(3), "cloud");
  assert.equal(weatherKind(45), "fog");
  assert.equal(weatherKind(61), "rain");
  assert.equal(weatherKind(80), "rain");
  assert.equal(weatherKind(73), "snow");
  assert.equal(weatherKind(95), "storm");
});

test("temperatures are rounded with a real minus sign", () => {
  assert.equal(formatTemperature(15.4), "15°");
  assert.equal(formatTemperature(-2.6), "−3°");
  assert.equal(formatTemperature(-0.2), "0°");
});
