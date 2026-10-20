import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import type { PaidPlan, StoreOffers } from "./purchase-types";
import { supabase } from "./supabase";

export function purchasesConfigured() { return !!supabase && !!process.env.EXPO_PUBLIC_STRIPE_ENABLED; }
async function invoke<T>(name: string, body: Record<string, unknown>) {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) { const response = error.context instanceof Response ? error.context : null; const payload = await response?.clone().json().catch(() => null); throw new Error(typeof payload?.error === "string" ? payload.error : "Stripe is not available right now."); }
  return data as T;
}
export async function loadStoreOffers(_userId: string): Promise<StoreOffers | null> { return purchasesConfigured() ? invoke<StoreOffers>("stripe-catalog", {}) : null; }
export async function purchaseStorePlan(_userId: string, plan: PaidPlan): Promise<"purchased" | "cancelled"> {
  const result = await invoke<{ url: string }>("stripe-checkout", { plan });
  if (!result?.url) throw new Error("Stripe checkout did not return a payment link.");
  if (process.env.EXPO_PUBLIC_STRIPE_CHECKOUT_SAME_TAB === "true") await Linking.openURL(result.url); else await WebBrowser.openBrowserAsync(result.url);
  return "purchased";
}
export async function cancelMonthlyRenewal() { await invoke<{ cancelAtPeriodEnd: boolean }>("stripe-subscription", { action: "cancel_renewal" }); }
