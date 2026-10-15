export type VerifiedPlan = { plan: "free" | "premium" | "lifetime"; validUntil: string | null; productId: string | null };

export function planFromRevenueCat(subscriber: unknown, now = Date.now()): VerifiedPlan {
  if (!subscriber || typeof subscriber !== "object") return { plan: "free", validUntil: null, productId: null };
  const entitlements = (subscriber as { entitlements?: unknown }).entitlements;
  if (!entitlements || typeof entitlements !== "object") return { plan: "free", validUntil: null, productId: null };
  const entry = (entitlements as Record<string, unknown>).goworth_unlimited;
  if (!entry || typeof entry !== "object") return { plan: "free", validUntil: null, productId: null };
  const entitlement = entry as Record<string, unknown>;
  const productId = typeof entitlement.product_identifier === "string" ? entitlement.product_identifier : null;
  if (!productId) return { plan: "free", validUntil: null, productId: null };
  if (entitlement.expires_date === null) return { plan: "lifetime", validUntil: null, productId };
  const expiry = [entitlement.expires_date, entitlement.grace_period_expires_date]
    .filter((value): value is string => typeof value === "string")
    .map((value) => Date.parse(value)).filter(Number.isFinite);
  const validUntil = Math.max(0, ...expiry);
  return validUntil > now
    ? { plan: "premium", validUntil: new Date(validUntil).toISOString(), productId }
    : { plan: "free", validUntil: null, productId: null };
}
