import { supabase } from "./supabase";
import type { WheelPrize } from "./wheel-odds";

export type Plan = "free" | "premium" | "lifetime";
export type Membership = { plan: Plan; validUntil: string | null };
export type WheelStatus = { nextSpinAt: string | null; clockOffsetMs: number };
export type WheelResult = Membership & WheelStatus & { prize: WheelPrize };

function activePlan(plan: unknown, validUntil: string | null): Plan {
  if (plan === "lifetime") return "lifetime";
  return plan === "premium" && Date.parse(validUntil || "") > Date.now() ? "premium" : "free";
}

const offsetFrom = (serverNow: unknown) => typeof serverNow === "string" ? Date.parse(serverNow) - Date.now() : 0;

export async function loadMembership(userId: string): Promise<Membership> {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.from("user_entitlements").select("plan,valid_until").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Could not load your membership right now.");
  return { plan: activePlan(data?.plan, data?.valid_until ?? null), validUntil: data?.valid_until ?? null };
}

export async function loadWheelStatus(): Promise<WheelStatus> {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.rpc("premium_wheel_status");
  if (error || !data) throw new Error("Could not load the wheel right now.");
  return { nextSpinAt: data.nextSpinAt ?? null, clockOffsetMs: offsetFrom(data.serverNow) };
}

export async function spinWheel(): Promise<WheelResult> {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.rpc("spin_premium_wheel");
  if (error) throw new Error(/cooldown/i.test(error.message) ? "You already spun in the last 24 hours."
    : /lifetime/i.test(error.message) ? "Lifetime access is already active." : "Could not spin the wheel right now.");
  if (!data || !["none", "premium_month", "lifetime"].includes(data.prize)) throw new Error("Could not spin the wheel right now.");
  return {
    prize: data.prize, plan: activePlan(data.plan, data.validUntil ?? null), validUntil: data.validUntil ?? null,
    nextSpinAt: data.nextSpinAt ?? null, clockOffsetMs: offsetFrom(data.serverNow),
  };
}
