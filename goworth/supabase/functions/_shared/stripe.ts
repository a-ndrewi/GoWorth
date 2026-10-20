export function stripeHeaders(secret: string) {
  return { Authorization: `Basic ${btoa(`${secret}:`)}` };
}

export async function stripeRequest<T>(secret: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    ...init,
    headers: { ...stripeHeaders(secret), ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.error?.message === "string" ? body.error.message : "Stripe request failed.");
  return body as T;
}

export function formBody(values: Record<string, string | undefined>) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined) body.set(key, value); });
  return body.toString();
}
