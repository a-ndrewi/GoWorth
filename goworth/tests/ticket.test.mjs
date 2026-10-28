import assert from "node:assert/strict";
import { test } from "node:test";
import { cityCode, dateRange } from "../src/utils/ticket.ts";

test("city codes read like airport codes", () => {
  assert.equal(cityCode("Kyoto"), "KYO");
  assert.equal(cityCode("Brașov"), "BRA");
  assert.equal(cityCode("San Sebastián"), "SAN");
  assert.equal(cityCode("—"), "GO");
});

test("date ranges stay short", () => {
  assert.equal(dateRange("2026-10-27", "2026-10-31", "en-US"), "27–31 Oct");
  assert.equal(dateRange("2026-10-28", "2026-11-02", "en-US"), "28 Oct – 2 Nov");
  assert.equal(dateRange("2026-10-28", "2026-10-28", "en-US"), "28 Oct");
});
