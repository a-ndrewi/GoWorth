import { createClient } from "npm:@supabase/supabase-js@2";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

const topics = ["bug", "account", "billing", "feedback", "other"] as const;
const topicLabels: Record<(typeof topics)[number], string> = {
  bug: "Bug report", account: "Account", billing: "Membership & billing", feedback: "Feedback", other: "Other",
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().normalize("NFC").slice(0, max) : "";

/**
 * Sends a support request from a signed-in user to the support inbox through Resend.
 * RESEND_API_KEY is required; SUPPORT_EMAIL and SUPPORT_FROM_EMAIL fall back to Resend's test addresses.
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const authHeader = request.headers.get("Authorization");
  if (!url || !serviceKey || !authHeader?.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
  const service = createClient(url, serviceKey);
  const { data: auth, error: authError } = await service.auth.getUser(authHeader.slice(7));
  if (authError || !auth.user) return reply(401, { error: "Sign in required" });
  if (!resendKey) return reply(503, { error: "Support messages are unavailable right now. Please try again later." });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return reply(400, { error: "Invalid request" }); }
  const topic = topics.find((item) => item === body.topic);
  const subject = text(body.subject, 120);
  const message = text(body.message, 4000);
  const replyTo = text(body.email, 254);
  const name = text(body.name, 80);
  const device = text(body.device, 300);
  if (!topic || subject.length < 3 || message.length < 10 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    return reply(400, { error: "Check the topic, subject, message and email." });
  }

  const rows: [string, string][] = [
    ["Topic", topicLabels[topic]], ["From", name ? `${name} <${replyTo}>` : replyTo],
    ["Account", `${auth.user.email ?? "no email"} · ${auth.user.id}`], ...(device ? [["Device", device] as [string, string]] : []),
  ];
  const html = `<h2 style="font-family:system-ui">${escapeHtml(subject)}</h2>
<table style="font-family:system-ui;font-size:14px;border-collapse:collapse">${rows.map(([label, value]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#667085">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`).join("")}</table>
<p style="font-family:system-ui;font-size:15px;white-space:pre-wrap;line-height:1.5">${escapeHtml(message)}</p>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("SUPPORT_FROM_EMAIL")?.trim() || "GoWorth Support <onboarding@resend.dev>",
      to: [Deno.env.get("SUPPORT_EMAIL")?.trim() || "delivered@resend.dev"],
      reply_to: replyTo,
      subject: `[GoWorth · ${topicLabels[topic]}] ${subject}`,
      html,
      text: `${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${message}`,
    }),
  });
  if (!response.ok) {
    console.error("Support email failed", response.status, await response.text().catch(() => ""));
    return reply(502, { error: "Your message could not be sent. Please try again later." });
  }
  return reply(200, { ok: true });
});
