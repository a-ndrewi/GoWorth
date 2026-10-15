import assert from "node:assert/strict";
import { test } from "node:test";
import { mapHtml } from "../src/components/goworth/map-html.ts";

test("generated map script parses and retains source attribution", () => {
  const html = mapHtml([], undefined);
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /OpenStreetMap contributors/);
  assert.match(html, /ResizeObserver/);
  assert.match(html, /map\.resize\(\)/);
});

test("US state pins show their abbreviations and use a state-level zoom", () => {
  const pin = { id: "us-state:CA", name: "California, United States", latitude: 37.162664, longitude: -119.571346, kind: "state", stateCode: "CA", countryCode: "US" };
  const html = mapHtml([pin], pin);
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /\.marker\.state\{/);
  assert.match(html, /pin\.kind==='state'\?pin\.stateCode/);
  assert.match(html, /data\.selected\.kind==='state'\?7/);
  assert.match(html, /California, United States/);
  const focused = mapHtml([pin], undefined, "en", "us");
  assert.match(focused, /data\.focus==='us'\?\[38,-98\]/);
  assert.match(focused, /data\.focus!=='us'/);
});
