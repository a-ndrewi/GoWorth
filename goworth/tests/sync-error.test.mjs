import assert from "node:assert/strict";
import { test } from "node:test";
import { describeSyncFailure, isFreeLimitFailure, SyncFailure } from "../src/utils/sync-error.ts";

test("monthly save limits are explained instead of reported as connection failures", () => {
  const error = new Error("Free monthly place limit reached (5). Upgrade for unlimited access");
  assert.match(describeSyncFailure(error, "ro"), /5 locuri noi/);
  assert.doesNotMatch(describeSyncFailure(error, "en"), /connection/i);
  assert.equal(isFreeLimitFailure(error), true);
  assert.equal(new SyncFailure(describeSyncFailure(error, "ro"), isFreeLimitFailure(error)).isFreeLimit, true);
  assert.equal(isFreeLimitFailure(new Error("Network request failed")), false);
});

test("database setup and network failures have distinct messages", () => {
  assert.match(describeSyncFailure(new Error("relation public.saved_items does not exist"), "ro"), /migrările Supabase/);
  assert.match(describeSyncFailure(new Error("Network request failed"), "ro"), /internetul/);
});

test("unrecognized save failures retain the actual reason", () => {
  assert.match(describeSyncFailure(new Error("row-level security policy"), "en"), /row-level security policy/);
});
