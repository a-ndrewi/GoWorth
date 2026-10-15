import type { PaidPlan, StoreOffers } from "./purchase-types";

export function purchasesConfigured() { return false; }
export async function loadStoreOffers(_userId: string): Promise<StoreOffers | null> { return null; }
export async function purchaseStorePlan(_userId: string, _plan: PaidPlan): Promise<"purchased" | "cancelled"> {
  throw new Error("Purchases are available in the iOS and Android apps.");
}
export async function restoreStorePurchases(_userId: string): Promise<boolean> { return false; }
