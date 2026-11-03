import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8")).expo;
const plugin = (name) => config.plugins.find((entry) => Array.isArray(entry) && entry[0] === name)?.[1];

test("the app asks only for the permissions it uses, with its own wording", () => {
  // Only a photo is picked; App Review rejects unused or generic camera and microphone prompts.
  const picker = plugin("expo-image-picker");
  assert.equal(picker.cameraPermission, false);
  assert.equal(picker.microphonePermission, false);
  assert.match(picker.photosPermission, /GoWorth/);
  const location = plugin("expo-location");
  assert.equal(location.motionUsagePermission, false);
  for (const key of ["locationWhenInUsePermission", "locationAlwaysAndWhenInUsePermission", "locationAlwaysPermission"]) {
    assert.match(location[key], /GoWorth/, key);
  }
});

test("Android can watch for arrivals in the background, as nearby suggestions need", () => {
  assert.equal(plugin("expo-location").isAndroidBackgroundLocationEnabled, true);
});
