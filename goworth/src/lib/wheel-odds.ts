/** Chance per spin, enforced by public.spin_premium_wheel(); tests/wheel-odds.test.mjs keeps both in sync. */
export const wheelOdds = { premiumMonth: 0.01, lifetime: 0.0002 } as const;

export type WheelPrize = "none" | "premium_month" | "lifetime";

export const wheelCooldownMs = 24 * 60 * 60 * 1000;

/** Equal slices clockwise from the pointer; the odds above, not slice size, decide the prize. */
export const wheelSlices: WheelPrize[] = ["lifetime", "none", "premium_month", "none", "none", "premium_month", "none", "none"];

/** Rotation in degrees that ends a spin on a slice showing `prize`, after at least `turns` full turns. */
export function wheelTargetRotation(current: number, prize: WheelPrize, pick: number, turns = 5) {
  const matches = wheelSlices.flatMap((slice, index) => slice === prize ? [index] : []);
  const index = matches[Math.min(matches.length - 1, Math.floor(pick * matches.length))];
  const sliceAngle = 360 / wheelSlices.length;
  // Slice i is centred at i * sliceAngle clockwise; turning the wheel back by that angle brings it under the pointer.
  const landing = (360 - index * sliceAngle) % 360;
  const base = current - (current % 360) + turns * 360;
  return base + landing;
}

/** Remaining milliseconds until the next spin, corrected for the device clock differing from the server. */
export function wheelRemainingMs(nextSpinAt: string | null, clockOffsetMs: number, now = Date.now()) {
  if (!nextSpinAt) return 0;
  return Math.max(0, Date.parse(nextSpinAt) - (now + clockOffsetMs));
}

/** HH:MM:SS for a cooldown, rounded up so it never shows 00:00:00 while a spin is still locked. */
export function wheelCountdown(ms: number) {
  const total = Math.ceil(ms / 1000);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map((part) => String(part).padStart(2, "0")).join(":");
}
