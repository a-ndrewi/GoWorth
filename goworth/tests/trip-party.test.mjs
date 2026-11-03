import assert from "node:assert/strict";
import { test } from "node:test";
import { tripParty } from "../src/utils/trip-party.ts";

test("companions joining and leaving move a trip between Solo, Duo and Group", () => {
  assert.equal(tripParty("Solo", 1), "Solo");
  assert.equal(tripParty("Solo", 2), "Duo");
  assert.equal(tripParty("Solo", 3), "Group");
  assert.equal(tripParty("Solo", 5), "Group");
  assert.equal(tripParty("Group", 2), "Duo");
});

test("a trip on its own keeps the party chosen when it was created", () => {
  assert.equal(tripParty("Duo"), "Duo");
  assert.equal(tripParty("Group", 1), "Group");
});

test("older trips map Couple, Friends and Family onto the new parties", () => {
  assert.equal(tripParty("Couple"), "Duo");
  assert.equal(tripParty("Friends"), "Group");
  assert.equal(tripParty("Family"), "Group");
  assert.equal(tripParty(""), "Solo");
});
