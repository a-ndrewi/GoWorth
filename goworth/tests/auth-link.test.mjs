import assert from "node:assert/strict";
import test from "node:test";
import { authLinkMessage, readAuthLink } from "../src/utils/auth-link.ts";

test("a PKCE link yields its one-time code and flow id", () => {
  assert.deepEqual(readAuthLink("goworth://auth?code=abc123&sb_flow_id=f-1"), { kind: "code", code: "abc123", flowId: "f-1" });
  assert.deepEqual(readAuthLink("https://goworth.app/auth?code=abc123"), { kind: "code", code: "abc123", flowId: null });
});

test("tokens in the fragment are never accepted", () => {
  // The old implicit links signed the phone into whatever account the link carried.
  assert.equal(readAuthLink("goworth://auth#access_token=a&refresh_token=b&type=recovery"), null);
});

test("expired or reused links report their error from the query or the fragment", () => {
  assert.deepEqual(readAuthLink("goworth://auth?error=access_denied&error_code=otp_expired"), { kind: "error", code: "otp_expired" });
  assert.deepEqual(readAuthLink("goworth://auth#error=access_denied&error_description=Email+link+is+invalid"), { kind: "error", code: "access_denied" });
});

test("ordinary deep links are left alone", () => {
  assert.equal(readAuthLink("goworth://place?id=louvre"), null);
  assert.equal(readAuthLink("goworth://auth"), null);
});

test("each failure has its own message", () => {
  assert.notEqual(authLinkMessage("expired"), authLinkMessage("other-device"));
});
