import { supabase } from "./supabase";

export type Membership = { plan: "free" | "premium" | "lifetime"; validUntil: string | null; managementUrl: string | null };

export async function syncStoreEntitlement(): Promise<Membership> {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.functions.invoke<Membership>("sync-entitlement", { body: {} });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    const body = await response?.clone().json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : "Could not verify your membership right now.");
  }
  if (!data || !["free", "premium", "lifetime"].includes(data.plan)) throw new Error("Membership response was invalid.");
  return data;
}
