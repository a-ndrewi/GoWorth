import assert from "node:assert/strict";
import { test } from "node:test";
import { visaMrz, visaStyle } from "../src/data/visa-style.ts";

test("a country always gets the same visa look", () => {
  assert.deepEqual(visaStyle("PT", "EU", false), visaStyle("PT", "EU", false));
  assert.equal(visaStyle("PT", "EU", false).ink, "#2457E6");
  assert.equal(visaStyle("JP", "AS", true).ink, "#FDBA74");
  assert.equal(visaStyle("XX", undefined, false).ink, "#475569");
  for (const code of ["PT", "JP", "RO", "US", "BR"]) {
    const { stampTilt } = visaStyle(code, "EU", false);
    assert.ok(stampTilt >= -14 && stampTilt <= 6);
  }
});

test("visa lines are fixed-width and plain ASCII", () => {
  const [first, second] = visaMrz("RO", "Ana-Maria Ștefănescu", "1933df3c-db94-430b", 2);
  assert.equal(first.length, 36);
  assert.equal(second.length, 36);
  assert.match(first, /^V<ROANA<MARIA<STEFANESCU<<GOWORTH<*$/);
  assert.match(second, /^1933DF3CDB<RO<2<*$/);
});
