export type Subscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number | null;
  items?: { data: { current_period_end?: number | null; price?: { id: string } | string }[] };
};

export function activeMonthlySubscriptions(subscriptions: Subscription[], priceId: string) {
  const active: { id: string; validUntil: string; cancelAtPeriodEnd: boolean }[] = [];
  for (const subscription of subscriptions) {
    if (!["active", "trialing", "past_due"].includes(subscription.status)) continue;
    const item = subscription.items?.data.find((entry) =>
      (typeof entry.price === "string" ? entry.price : entry.price?.id) === priceId
    );
    if (!item) continue;
    const periodEnd = item.current_period_end ?? subscription.current_period_end;
    if (!periodEnd) throw new Error("Stripe did not return the subscription renewal date.");
    active.push({ id: subscription.id, validUntil: new Date(periodEnd * 1000).toISOString(), cancelAtPeriodEnd: !!subscription.cancel_at_period_end });
  }
  return active;
}

type ActiveMonthly = ReturnType<typeof activeMonthlySubscriptions>;

export function resolveMembership(active: ActiveMonthly, lifetimePaid: boolean) {
  if (lifetimePaid) return { plan: "lifetime" as const, validUntil: null, providerReference: "stripe_lifetime", cancelAtPeriodEnd: false };
  if (!active.length) return { plan: "free" as const, validUntil: null, providerReference: null, cancelAtPeriodEnd: false };
  const latest = active.reduce((a, b) => a.validUntil > b.validUntil ? a : b);
  return { plan: "premium" as const, validUntil: latest.validUntil, providerReference: latest.id, cancelAtPeriodEnd: active.every((subscription) => subscription.cancelAtPeriodEnd) };
}

export function checkoutBlockReason(plan: "premium" | "lifetime", active: ActiveMonthly, lifetimePaid: boolean) {
  if (lifetimePaid) return "Lifetime access is already active.";
  if (plan === "premium" && active.length) return "Your monthly subscription is already active.";
  if (plan === "lifetime" && active.some((subscription) => !subscription.cancelAtPeriodEnd)) return "Cancel monthly renewal before buying lifetime access.";
  return null;
}
