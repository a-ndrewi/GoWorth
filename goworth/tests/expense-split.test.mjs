import assert from "node:assert/strict";
import { test } from "node:test";
import { balances, equalShares, settleUp, shareOf } from "../src/utils/expense-split.ts";

const everyone = ["ana", "bob", "cris"];

test("equal shares add up to the amount to the cent", () => {
  const shares = equalShares(100, everyone);
  assert.deepEqual([...shares.values()], [3334, 3333, 3333]);
  assert.equal([...shares.values()].reduce((a, b) => a + b, 0), 10000);
  assert.equal(equalShares(10, []).size, 0);
});

test("the payer is owed what the others' shares come to", () => {
  const result = balances([{ amount: 90, paidBy: "ana", splitWith: everyone }], [], everyone, "ana");
  assert.deepEqual(Object.fromEntries(result), { ana: 6000, bob: -3000, cris: -3000 });
  assert.deepEqual(settleUp(result), [{ from: "bob", to: "ana", amount: 30 }, { from: "cris", to: "ana", amount: 30 }]);
});

test("older expenses were paid by the owner and shared by everyone", () => {
  const result = balances([{ amount: 30 }], [], everyone, "bob");
  assert.deepEqual(Object.fromEntries(result), { ana: -1000, bob: 2000, cris: -1000 });
});

test("an expense shared by only some people leaves the rest out", () => {
  const result = balances([{ amount: 50, paidBy: "cris", splitWith: ["bob", "cris"] }], [], everyone, "ana");
  assert.deepEqual(Object.fromEntries(result), { ana: 0, bob: -2500, cris: 2500 });
  assert.equal(shareOf("ana", [{ amount: 50, splitWith: ["bob", "cris"] }], everyone), 0);
});

test("settlements bring balances back to zero", () => {
  const expenses = [{ amount: 90, paidBy: "ana", splitWith: everyone }];
  const settlements = [{ id: "s1", from: "bob", to: "ana", amount: 30 }, { id: "s2", from: "cris", to: "ana", amount: 30 }];
  const result = balances(expenses, settlements, everyone, "ana");
  assert.deepEqual(settleUp(result), []);
});

test("settle up needs no more payments than people minus one", () => {
  const expenses = [
    { amount: 120, paidBy: "ana", splitWith: everyone },
    { amount: 60, paidBy: "bob", splitWith: everyone },
    { amount: 15.5, paidBy: "cris", splitWith: ["ana", "cris"] },
  ];
  const result = balances(expenses, [], everyone, "ana");
  assert.equal([...result.values()].reduce((a, b) => a + b, 0), 0);
  const transfers = settleUp(result);
  assert.ok(transfers.length <= everyone.length - 1);
  const after = new Map(result);
  for (const { from, to, amount } of transfers) {
    after.set(from, after.get(from) + Math.round(amount * 100));
    after.set(to, after.get(to) - Math.round(amount * 100));
  }
  assert.ok([...after.values()].every((cents) => cents === 0));
});

test("someone who left still shows while an expense names them", () => {
  const result = balances([{ amount: 20, paidBy: "dan", splitWith: ["ana", "dan"] }], [], ["ana", "bob"], "ana");
  assert.equal(result.get("dan"), 1000);
  assert.equal(result.get("ana"), -1000);
});
