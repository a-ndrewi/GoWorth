import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSearchText } from "../src/utils/search.ts";

test("destination and place searches can match Romanian names without diacritics", () => {
  assert.ok(normalizeSearchText("Brașov, România").includes(normalizeSearchText("Brasov")));
  assert.ok(normalizeSearchText("Peleș Castle").includes(normalizeSearchText("Peles")));
  assert.ok(normalizeSearchText("Piața Unirii").includes(normalizeSearchText("Piata")));
});
