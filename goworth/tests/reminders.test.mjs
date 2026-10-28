import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDistance, pickNearbyPlace, tripNudgeDates, wheelReminderDates, wheelSoonLeadMs, widgetDays } from "../src/utils/reminders.ts";

test("wheel reminders come an hour early and when the spin is ready", () => {
  const now = Date.UTC(2026, 9, 28, 10);
  const { soon, ready } = wheelReminderDates(5 * 60 * 60 * 1000, now);
  assert.equal(ready.getTime(), now + 5 * 60 * 60 * 1000);
  assert.equal(soon.getTime(), ready.getTime() - wheelSoonLeadMs);
});

test("no early wheel reminder when the spin is already close, none at all once it is ready", () => {
  assert.equal(wheelReminderDates(30 * 60 * 1000).soon, null);
  assert.ok(wheelReminderDates(30 * 60 * 1000).ready);
  assert.deepEqual(wheelReminderDates(0), { soon: null, ready: null });
});

test("trip nudges land on early evenings days ahead", () => {
  const [first, second] = tripNudgeDates(new Date(2026, 9, 28, 9));
  assert.equal(first.getDate(), 1);
  assert.equal(first.getHours(), 18);
  assert.ok(second > first);
});

test("nearby suggestions skip venues and places already suggested", () => {
  const places = [{ id: "bar", venue: { kind: "bar" } }, { id: "old" }, { id: "new" }];
  assert.equal(pickNearbyPlace(places, ["old"])?.id, "new");
  assert.equal(pickNearbyPlace(places, ["old", "new"]), undefined);
});

test("distances read naturally", () => {
  assert.equal(formatDistance(0.012), "50 m");
  assert.equal(formatDistance(0.34), "350 m");
  assert.equal(formatDistance(1.44), "1.4 km");
  assert.equal(formatDistance(12.4), "12 km");
});

test("widget days run from today through the day after the trip", () => {
  assert.deepEqual(widgetDays("2026-10-30", "2026-11-01", "2026-10-28"),
    ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(widgetDays("2027-06-01", "2027-06-10", "2026-10-28").length, 60);
  assert.deepEqual(widgetDays("2026-01-01", "2026-01-02", "2026-10-28"), ["2026-10-28"]);
});
