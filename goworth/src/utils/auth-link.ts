/** What an email link (sign-up confirmation or password reset) brought back to the app. */
export type AuthLink =
  | { kind: "code"; code: string; flowId: string | null }
  | { kind: "error"; code: string }
  | null;

/**
 * Reads a PKCE callback: `?code=…&sb_flow_id=…`, or the `error`/`error_code` Supabase adds when a link has
 * expired or was already used (in the query or the fragment). Tokens in the fragment are deliberately ignored:
 * accepting them let any link sign the phone into whatever account it carried.
 */
export function readAuthLink(url: string): AuthLink {
  const [beforeHash, fragment = ""] = url.split("#");
  const query = beforeHash.includes("?") ? beforeHash.slice(beforeHash.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  for (const [key, value] of new URLSearchParams(fragment)) if (!params.has(key)) params.set(key, value);
  const error = params.get("error_code") || params.get("error");
  if (error) return { kind: "error", code: error };
  const code = params.get("code");
  if (code) return { kind: "code", code, flowId: params.get("sb_flow_id") };
  return null;
}

/** The message to show when a link could not sign the traveller in. */
export function authLinkMessage(failure: "expired" | "other-device") {
  return failure === "other-device"
    ? "This link was opened on a different device or browser from the one that asked for it. If you were confirming your email, it is confirmed: sign in to continue. To reset your password, request a new link on this device."
    : "This link has expired or was already used. Request a new one.";
}
