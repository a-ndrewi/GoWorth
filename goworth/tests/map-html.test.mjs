import assert from "node:assert/strict";
import { test } from "node:test";
import { mapHtml } from "../src/components/goworth/map-html.ts";

test("generated map script parses and retains source attribution", () => {
  const html = mapHtml([], undefined);
  const script = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /OpenStreetMap contributors/);
});
