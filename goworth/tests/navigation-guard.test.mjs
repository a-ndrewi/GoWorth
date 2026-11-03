import assert from "node:assert/strict";
import { test } from "node:test";
import { createTapGuard } from "../src/utils/tap-guard.ts";

test("a double tap on the same link opens it once", () => {
  const repeated = createTapGuard(700);
  assert.equal(repeated("/membership", 1000), false);
  assert.equal(repeated("/membership", 1300), true);
  assert.equal(repeated("/membership", 2000), false);
});

test("a different link opens straight away", () => {
  const repeated = createTapGuard(700);
  assert.equal(repeated("/membership", 1000), false);
  assert.equal(repeated("/support", 1100), false);
});
