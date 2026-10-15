import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { purchaseEntitlementId, type PaidPlan, type StoreOffers } from "./purchase-types";

const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
const selectedKey = Platform.OS === "ios" ? iosKey : Platform.OS === "android" ? androidKey : undefined;
const apiKey = selectedKey?.startsWith("your_") ? undefined : selectedKey;
let identifiedUserId: string | null = null;
let setup: Promise<void> | null = null;
let packages: Partial<Record<PaidPlan, PurchasesPackage>> = {};

export function purchasesConfigured() {
  return !!apiKey;
}

async function identify(userId: string) {
  if (!apiKey) throw new Error("Store purchases are not configured yet.");
  if (identifiedUserId === userId) return;
  if (setup) await setup;
  if (identifiedUserId === userId) return;
  setup = (async () => {
    if (await Purchases.isConfigured()) await Purchases.logIn(userId);
    else Purchases.configure({ apiKey, appUserID: userId });
    identifiedUserId = userId;
    packages = {};
  })();
  try { await setup; }
  finally { setup = null; }
}

export async function loadStoreOffers(userId: string): Promise<StoreOffers | null> {
  if (!apiKey) return null;
  await identify(userId);
  const [offerings, customer] = await Promise.all([Purchases.getOfferings(), Purchases.getCustomerInfo()]);
  packages = { premium: offerings.current?.monthly ?? undefined, lifetime: offerings.current?.lifetime ?? undefined };
  return {
    monthlyPrice: packages.premium?.product.priceString ?? null,
    lifetimePrice: packages.lifetime?.product.priceString ?? null,
    managementUrl: customer.managementURL,
  };
}

export async function purchaseStorePlan(userId: string, plan: PaidPlan): Promise<"purchased" | "cancelled"> {
  await identify(userId);
  const selected = packages[plan] ?? (await Purchases.getOfferings()).current?.[plan === "premium" ? "monthly" : "lifetime"];
  if (!selected) throw new Error("This plan is not available in your store yet.");
  try {
    await Purchases.purchasePackage(selected);
    return "purchased";
  } catch (error) {
    if (error && typeof error === "object" && "userCancelled" in error && error.userCancelled) return "cancelled";
    throw error;
  }
}

export async function restoreStorePurchases(userId: string): Promise<boolean> {
  await identify(userId);
  const customer = await Purchases.restorePurchases();
  return !!customer.entitlements.active[purchaseEntitlementId];
}
