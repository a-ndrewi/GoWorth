import { createClient } from "npm:@supabase/supabase-js@2";
import { planFromRevenueCat } from "../_shared/revenuecat-plan.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const revenueCatKey = Deno.env.get("REVENUECAT_SECRET_API_KEY")?.trim();
  if (!url || !serviceKey || !revenueCatKey) return reply(503, { error: "Purchases are not configured yet." });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
  const service = createClient(url, serviceKey);
  const { data: auth, error: authError } = await service.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply(401, { error: "Sign in required" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let subscriber: { subscriber?: unknown };
  try {
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(auth.user.id)}`, {
      headers: { Authorization: `Bearer ${revenueCatKey}` }, signal: controller.signal,
    });
    if (!response.ok) {
      console.error("RevenueCat entitlement check failed", response.status);
      return reply(503, { error: "Could not verify your purchase right now." });
    }
    subscriber = await response.json();
  } catch {
    return reply(503, { error: "Could not verify your purchase right now." });
  } finally { clearTimeout(timeout); }

  const verified = planFromRevenueCat(subscriber.subscriber);
  const { data: current, error: readError } = await service.from("user_entitlements")
    .select("plan,valid_until,provider").eq("user_id", auth.user.id).maybeSingle();
  if (readError) return reply(503, { error: "Membership database is unavailable." });
  const preserveManual = current?.plan === "lifetime" && current.provider !== "revenuecat" ||
    current?.plan === "premium" && current.provider !== "revenuecat" &&
      Date.parse(current.valid_until ?? "") > Date.now() && verified.plan !== "lifetime";
  if (!preserveManual && (verified.plan !== "free" || current?.provider === "revenuecat")) {
    const { error: writeError } = await service.from("user_entitlements").upsert({
      user_id: auth.user.id,
      plan: verified.plan,
      valid_until: verified.validUntil,
      provider: "revenuecat",
      provider_reference: verified.productId,
      updated_at: new Date().toISOString(),
    });
    if (writeError) return reply(503, { error: "Could not update your membership." });
  }
  const plan = preserveManual ? current!.plan : verified.plan;
  const validUntil = preserveManual ? current!.valid_until : verified.validUntil;
  const managementUrl = subscriber.subscriber && typeof subscriber.subscriber === "object" &&
    "management_url" in subscriber.subscriber && typeof subscriber.subscriber.management_url === "string" &&
    subscriber.subscriber.management_url.startsWith("https://") ? subscriber.subscriber.management_url : null;
  return reply(200, { plan, validUntil, managementUrl });
});
