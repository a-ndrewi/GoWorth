import { supabase } from "./supabase";

export type ReferralStatus = {
  code: string;
  /** Friends who joined with this code. */
  friends: number;
  /** Months of Premium this code has earned; friends past the yearly cap count above but not here. */
  monthsEarned: number;
  /** Whether this account already joined with a friend's code. */
  redeemed: boolean;
  /** Until when this account can still enter a friend's code, or null when it no longer can. */
  redeemUntil: string | null;
};

/** Codes are six letters and digits; spaces, dashes and lower case are forgiven. */
export const cleanReferralCode = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
export const referralCodePattern = /^[A-HJ-NP-Z2-9]{6}$/;

/** Sign-up keeps a friend's code with the account until its first launch, when it is used. */
export const referralMetadataKey = "goworth_referral";

export async function loadReferral(): Promise<ReferralStatus> {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.rpc("my_referral");
  if (error) throw new Error("Could not load your invite code right now.");
  return {
    code: String(data?.code ?? ""), friends: Number(data?.friends ?? 0), monthsEarned: Number(data?.monthsEarned ?? 0),
    redeemed: !!data?.redeemed, redeemUntil: data?.redeemUntil ?? null,
  };
}

/** Uses a friend's code; both accounts get one month of Premium after any Premium they already have. */
export async function redeemReferral(code: string): Promise<{ validUntil: string | null }> {
  if (!supabase) throw new Error("Account service is not configured.");
  const { data, error } = await supabase.rpc("redeem_referral", { p_code: cleanReferralCode(code) });
  if (error) throw new Error(error.message || "Could not use this invite code.");
  return { validUntil: data?.validUntil ?? null };
}
