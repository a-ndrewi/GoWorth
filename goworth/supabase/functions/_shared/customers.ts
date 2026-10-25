import { stripeRequest } from "./stripe.ts";
import type { Subscription } from "./entitlement.ts";

export type Customer = { id: string; metadata?: Record<string, string> };

export async function stripeCustomersForUser(secret: string, userId: string, email?: string) {
  const customers: Customer[] = [];
  if (email) {
    let startingAfter: string | undefined;
    do {
      const params = new URLSearchParams({ email, limit: "100" });
      if (startingAfter) params.set("starting_after", startingAfter);
      const page = await stripeRequest<{ data: Customer[]; has_more: boolean }>(secret, `customers?${params}`);
      customers.push(...page.data.filter((customer) => customer.metadata?.user_id === userId));
      startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
    } while (startingAfter);
  }
  const query = encodeURIComponent(`metadata['user_id']:'${userId}'`);
  try {
    const result = await stripeRequest<{ data: Customer[] }>(secret, `customers/search?query=${query}&limit=100`);
    return [...new Map([...customers, ...result.data.filter((customer) => customer.metadata?.user_id === userId)].map((customer) => [customer.id, customer])).values()];
  } catch (error) {
    if (customers.length) return customers;
    throw error;
  }
}

export async function stripeSubscriptionsForCustomer(secret: string, customerId: string) {
  const subscriptions: Subscription[] = [];
  let startingAfter: string | undefined;
  do {
    const params = new URLSearchParams({ customer: customerId, status: "all", limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripeRequest<{ data: Subscription[]; has_more: boolean }>(secret, `subscriptions?${params}`);
    subscriptions.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return subscriptions;
}

export async function hasPaidLifetimeCheckout(secret: string, customerId: string, userId: string) {
  let startingAfter: string | undefined;
  do {
    const params = new URLSearchParams({ customer: customerId, limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const page = await stripeRequest<{ data: { id: string; payment_status: string; metadata?: Record<string, string> }[]; has_more: boolean }>(secret, `checkout/sessions?${params}`);
    if (page.data.some((session) => session.payment_status === "paid" && session.metadata?.plan === "lifetime" && session.metadata?.user_id === userId)) return true;
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);
  return false;
}
