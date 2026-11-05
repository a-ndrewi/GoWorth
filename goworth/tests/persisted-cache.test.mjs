import assert from "node:assert/strict";
import { test } from "node:test";
import { persistedCache } from "../src/data/persisted-cache.ts";

const memoryStore = (initial = null) => {
  const store = { value: initial, saves: 0, load: async () => store.value, save: async (value) => { store.value = value; store.saves++; } };
  return store;
};

test("without a store nothing is remembered", async () => {
  const cache = persistedCache(5, 60_000);
  cache.set("a", 1);
  assert.equal(await cache.get("a"), undefined);
});

test("stored entries come back after a restart, and expired ones do not", async () => {
  const now = Date.now();
  const store = memoryStore(JSON.stringify({ fresh: { savedAt: now - 1000, value: "yes" }, old: { savedAt: now - 120_000, value: "no" } }));
  const cache = persistedCache(5, 60_000);
  cache.attach(store);
  assert.equal((await cache.get("fresh"))?.value, "yes");
  assert.equal(await cache.get("old"), undefined);
});

test("only the newest entries are kept", async () => {
  const cache = persistedCache(2, 60_000);
  cache.attach(memoryStore());
  cache.set("a", 1); cache.set("b", 2); cache.set("c", 3);
  assert.equal(await cache.get("a"), undefined);
  assert.equal((await cache.get("c"))?.value, 3);
});
