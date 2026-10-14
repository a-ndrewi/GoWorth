import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });

async function moderate(input: unknown) {
  const key = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!key) throw new Error("Profile verification key is missing.");
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
  });
  if (!response.ok) {
    console.error("Profile moderation request failed", response.status);
    if (response.status === 401) throw new Error("Profile verification key was rejected.");
    if (response.status === 403) throw new Error("Profile verification API access was denied.");
    if (response.status === 429) throw new Error("Profile verification quota is unavailable.");
    throw new Error("Profile verification is unavailable. Please try again later.");
  }
  const data: { results?: { flagged?: boolean }[] } = await response.json();
  if (!data.results?.length) throw new Error("Profile verification is unavailable. Please try again later.");
  return data.results.some((result) => result.flagged);
}

function avatarType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization");
  if (!url || !serviceKey || !authHeader?.startsWith("Bearer ")) return reply(401, { error: "Sign in required" });
  const service = createClient(url, serviceKey);
  const { data: auth, error: authError } = await service.auth.getUser(authHeader.slice(7));
  if (authError || !auth.user) return reply(401, { error: "Sign in required" });
  const userId = auth.user.id;
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return reply(400, { error: "Invalid request" }); }
  const { data: current, error: readError } = await service.from("profiles")
    .select("display_name,username,language,currency,notifications_enabled,avatar_path")
    .eq("user_id", userId).maybeSingle();
  if (readError) return reply(503, { error: "Profile unavailable" });

  if (body.action === "profile") {
    const name = typeof body.name === "string" ? body.name.trim().normalize("NFC") : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]{0,49}$/u.test(name) || name.length > 50 ||
      (username && !/^[A-Za-z0-9_]{3,24}$/.test(username)) ||
      !["en", "ro"].includes(String(body.language)) || !["EUR", "USD"].includes(String(body.currency)) ||
      typeof body.notifications !== "boolean") return reply(400, { error: "Check your name, username and settings." });
    try {
      if (name !== current?.display_name || username !== (current?.username || "")) {
        if (await moderate(`Display name: ${name}\nUsername: ${username}`)) return reply(422, { error: "This profile name cannot be used." });
      }
      const values = { display_name: name,
        username: username || null, language: body.language, currency: body.currency,
        notifications_enabled: body.notifications, updated_at: new Date().toISOString() };
      const { error } = current
        ? await service.from("profiles").update(values).eq("user_id", userId)
        : await service.from("profiles").insert({ user_id: userId, ...values });
      if (error) return reply(409, { error: error.message.includes("username") ? "Username is already taken." : "Could not save profile." });
      return reply(200, { ok: true });
    } catch (error) { return reply(503, { error: error instanceof Error ? error.message : "Moderation unavailable" }); }
  }

  if (body.action === "remove-avatar") {
    const path = current?.avatar_path;
    if (!path) return reply(200, { ok: true });
    if (!path.startsWith(`${userId}/approved/`)) return reply(400, { error: "Invalid avatar path" });
    const { error: removeError } = await service.storage.from("profile-avatars").remove([path]);
    if (removeError) return reply(503, { error: "Could not remove the photo." });
    const { error: updateError } = await service.from("profiles")
      .update({ avatar_path: null, avatar_status: "none", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (updateError) return reply(503, { error: "Could not update the profile." });
    return reply(200, { ok: true });
  }

  if (body.action === "avatar") {
    const path = body.path;
    if (typeof path !== "string" || !new RegExp(`^${userId}/pending/[a-z0-9-]{10,64}\\.jpg$`).test(path))
      return reply(400, { error: "Invalid avatar path" });
    const bucket = service.storage.from("profile-avatars");
    try {
      const { data: file, error: downloadError } = await bucket.download(path);
      if (downloadError || !file) return reply(400, { error: "Photo upload was not found" });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = avatarType(bytes);
      if (!type || bytes.byteLength > 5 * 1024 * 1024 || bytes.byteLength < 100) return reply(400, { error: "Choose a JPEG, PNG or WebP photo under 5 MB." });
      const flagged = await moderate([{ type: "image_url", image_url: { url: `data:${type};base64,${encodeBase64(bytes)}` } }]);
      if (flagged) return reply(422, { error: "This photo cannot be used as a profile picture." });
      const approvedPath = path.replace("/pending/", "/approved/");
      const { error: moveError } = await bucket.move(path, approvedPath);
      if (moveError) throw new Error("Could not approve the photo.");
      const avatarValues = { avatar_path: approvedPath, avatar_status: "approved", updated_at: new Date().toISOString() };
      const { error: updateError } = current
        ? await service.from("profiles").update(avatarValues).eq("user_id", userId)
        : await service.from("profiles").insert({ user_id: userId, display_name: "", ...avatarValues });
      if (updateError) { await bucket.remove([approvedPath]); throw new Error("Could not save the photo."); }
      if (current?.avatar_path) await bucket.remove([current.avatar_path]);
      return reply(200, { ok: true, path: approvedPath });
    } catch (error) { return reply(503, { error: error instanceof Error ? error.message : "Photo moderation unavailable" }); }
    finally { await bucket.remove([path]); }
  }
  return reply(400, { error: "Unknown action" });
});
