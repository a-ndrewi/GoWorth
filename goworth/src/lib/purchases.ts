import { Linking, Platform } from "react-native";
import Purchases, { INTRO_ELIGIBILITY_STATUS, LOG_LEVEL, PURCHASES_ERROR_CODE, type PurchasesPackage } from "react-native-purchases";
import { freeTrialDays, planIdFor, planOrder, yearlySavings, type PlanId } from "./plan-offer";
import { supabase } from "./supabase";

export type PlanOption = {
  id: PlanId; productId: string; price: string; pricePerMonth: string | null;
  /** Percent saved against twelve monthly payments; set on the yearly plan only. */
  savings: number; trialDays: number; pack: PurchasesPackage;
};

// The Test Store key simulates purchases without an App Store or Google Play account. The SDK crashes a
// release build on purpose if it finds one, so it is only ever used in development builds.
const testStoreKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY?.trim();
const storeKey = Platform.select({ ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY, android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY })?.trim();
const apiKey = (__DEV__ && testStoreKey) || storeKey;

export const purchasesAvailable = !!apiKey;
let configured = false;

function configure() {
  if (!apiKey) return false;
  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
  }
  return true;
}

/** Ties store purchases to the GoWorth account, so they follow it to any device and reach the server under the same id. */
export async function identifyPurchaser(userId: string | null) {
  if (!configure()) return;
  try {
    if (userId) await Purchases.logIn(userId);
    else if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch {
    // Identity is retried on the next sign-in or purchase; the app works without it.
  }
}

/** The plans in the current RevenueCat offering, in paywall order, with the prices the store will charge. */
export async function loadPlans(): Promise<PlanOption[]> {
  if (!configure()) throw new Error("Purchases are not available in this build.");
  const offering = (await Purchases.getOfferings()).current;
  if (!offering) throw new Error("Plans could not be loaded right now.");
  const packs = new Map<PlanId, PurchasesPackage>();
  for (const pack of offering.availablePackages) {
    const id = planIdFor(pack.packageType);
    if (id && !packs.has(id)) packs.set(id, pack);
  }
  // A trial is shown only to people the App Store will actually give it to; Google Play already leaves it out otherwise.
  let eligible: Record<string, { status: INTRO_ELIGIBILITY_STATUS }> = {};
  if (Platform.OS === "ios") {
    eligible = await Purchases.checkTrialOrIntroductoryPriceEligibility([...packs.values()].map((pack) => pack.product.identifier)).catch(() => ({}));
  }
  const monthly = packs.get("monthly")?.product.price;
  return planOrder.flatMap((id) => {
    const pack = packs.get(id);
    if (!pack) return [];
    const { product } = pack;
    const trialAllowed = Platform.OS !== "ios" || eligible[product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    return [{
      id, productId: product.identifier, price: product.priceString,
      pricePerMonth: id === "yearly" ? product.pricePerMonthString : null,
      savings: id === "yearly" ? yearlySavings(monthly, product.price) : 0,
      trialDays: id === "lifetime" || !trialAllowed ? 0 : freeTrialDays(product.introPrice),
      pack,
    }];
  });
}

/** Asks the server to read the purchase from RevenueCat, so the plan and its limits change on the account itself. */
async function syncWithServer() {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke("revenuecat-sync", { body: {} });
  if (error) throw new Error("Your purchase went through, but your plan has not updated yet. Use Restore purchases in a moment.");
}

/** Buys a plan. Resolves false when the person cancels the store sheet. */
export async function buyPlan(option: PlanOption) {
  if (!configure()) throw new Error("Purchases are not available in this build.");
  try {
    await Purchases.purchasePackage(option.pack);
  } catch (caught) {
    const code = (caught as { code?: string }).code;
    if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return false;
    if (code === PURCHASES_ERROR_CODE.NETWORK_ERROR) throw new Error("No connection. Check your internet and try again.");
    if (code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) { await restorePurchases(); return true; }
    throw new Error("The purchase could not be completed. You have not been charged.");
  }
  await syncWithServer();
  return true;
}

export async function restorePurchases() {
  if (!configure()) throw new Error("Purchases are not available in this build.");
  try { await Purchases.restorePurchases(); }
  catch { throw new Error("Purchases could not be restored right now."); }
  await syncWithServer();
}

/** Opens the store's own page for cancelling or changing a subscription. */
export async function manageSubscription() {
  if (!configure()) return;
  if (Platform.OS === "ios") return Purchases.showManageSubscriptions().catch(() => undefined);
  const url = (await Purchases.getCustomerInfo().catch(() => null))?.managementURL;
  await Linking.openURL(url || "https://play.google.com/store/account/subscriptions").catch(() => undefined);
}
