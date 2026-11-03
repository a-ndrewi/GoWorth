/** What Free includes each calendar month (UTC); the database enforces the same numbers. */
export const freeAllowance = { trip: 1, place: 5, companions: 1 } as const;

/** The three Premium plans sold in the stores, matched to RevenueCat package types. */
export type PlanId = "yearly" | "monthly" | "lifetime";

/** Yearly sits between the other two, where the eye lands, as the offer the paywall points people to. */
export const planOrder: PlanId[] = ["monthly", "yearly", "lifetime"];

export function planIdFor(packageType: string): PlanId | null {
  return packageType === "ANNUAL" ? "yearly" : packageType === "MONTHLY" ? "monthly" : packageType === "LIFETIME" ? "lifetime" : null;
}

/** Whole percent saved by paying yearly instead of twelve months, rounded down so the badge never overstates it. */
export function yearlySavings(monthlyPrice: number | undefined, yearlyPrice: number | undefined) {
  if (!monthlyPrice || !yearlyPrice || monthlyPrice <= 0) return 0;
  const saved = Math.floor((1 - yearlyPrice / (monthlyPrice * 12)) * 100);
  return saved > 0 ? saved : 0;
}

const unitDays: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/** Length of a free trial in days, or 0 when the introductory offer is not free. */
export function freeTrialDays(intro: { price: number; periodUnit: string; periodNumberOfUnits: number; cycles?: number } | null | undefined) {
  if (!intro || intro.price !== 0) return 0;
  return (unitDays[intro.periodUnit] ?? 0) * intro.periodNumberOfUnits * Math.max(intro.cycles ?? 1, 1);
}
