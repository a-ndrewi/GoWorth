import assert from "node:assert/strict";
import { test } from "node:test";
import { tripMapHtml } from "../src/components/goworth/trip-map-html.ts";

test("the trip map script parses and accepts live updates on both platforms", () => {
  for (const language of ["en", "ro"]) {
    const html = tripMapHtml(language);
    const script = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    assert.doesNotThrow(() => new Function(script));
    assert.match(html, /window\.goworthUpdate=update/);
    assert.match(html, /addEventListener\('message'/);
    assert.match(html, /ResizeObserver/);
    assert.match(html, /AttributionControl/);
  }
});
