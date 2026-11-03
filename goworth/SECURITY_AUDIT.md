# Security & Privacy Audit

Scope: the 12 migrations in `supabase/migrations`, 3 Edge Functions, the Supabase client, auth, purchases, Storage and local storage. Nothing was run against the live project; each finding comes from the SQL and TypeScript as written. **None of the SQL below has been applied.** Review it, run it on a staging branch first, and tell me if you want any of it turned into migration files.

## What is already right

- **RLS is on for every table**, and grants are revoked from `anon` and `authenticated` before re-granting only what is needed.
- **Premium cannot be forged by the client.** `user_entitlements` and `store_entitlements` are `SELECT`-only for users. Plans change only through `spin_premium_wheel` (server-side `random()`, 24-hour cooldown with advisory lock) or `revenuecat-sync`, which re-reads the subscriber from the RevenueCat REST API with the secret key instead of trusting the request. Free limits are enforced by `consume_free_allowance` triggers that read `effective_plan()`.
- **Profiles are written only through `moderate-profile`.** The direct insert/update grant was revoked, so names, usernames and avatars cannot skip moderation.
- **No secrets in the client.** Only `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (with an `sb_publishable_` check) and RevenueCat public SDK keys. The service role, RevenueCat secret, Resend and OpenAI keys are function secrets. `.env*.local` is git-ignored. The RevenueCat Test Store key is used only under `__DEV__`.
- **Definer functions use `set search_path = ''`** and check `auth.uid()` (one exception: S-8).
- **Storage:** both buckets are private, with size limits and MIME allow-lists. `moderate-profile` checks magic bytes and pins paths to `<uid>/pending/…jpg`.
- **Injection:** there is no string-built SQL. `search_travelers` escapes `%`, `_` and `\` before `LIKE`. `contact-support` HTML-escapes user input and forces `reply_to` to the account's own email.
- **Tested invariant:** the displayed wheel odds match the SQL (`tests/wheel-odds.test.mjs`).

## Findings

### S-1 (P1) Auth deep links accept any session tokens — **Fixed (BUG_FIXES B8)**
`AuthProvider.completeLink` calls `setSession()` with any `access_token`/`refresh_token` found in a `goworth://…#…` URL. An attacker can send a link containing **their own** tokens. The victim's app then silently signs into the attacker's account, and anything the victim adds (trips, photos, journal) lands there. This is classic login CSRF in the implicit flow.

**Mitigation:** switch the client to PKCE (`createClient(url, key, { auth: { flowType: "pkce", … } })`). Handle `?code=` links with `supabase.auth.exchangeCodeForSession(code)`, which only succeeds on the device that started the flow because the verifier is stored locally. Update the Supabase email templates to the `{{ .ConfirmationURL }}` / `token_hash` style that Supabase documents for PKCE. Test sign-up confirmation and password reset on both platforms before shipping.

**Status:** done in the client as above, and the current `{{ .ConfirmationURL }}` templates work with PKCE. Still to do: add `goworth://**` to the Supabase redirect allow-list, then run one real email round trip per platform.

### S-2 (P2) Webhook secret comparison
`revenuecat-sync` compares `Authorization` with `===`. Over TLS the timing signal is negligible, but a constant-time compare is free. Also make sure `REVENUECAT_WEBHOOK_AUTH` is 32+ random bytes. The function is deployed with `--no-verify-jwt`, so this header is the only guard on the webhook path. A wrong header falls through to the user-token path and fails there, which is correct.

### S-3 (P1, GDPR Art. 17) Account deletion is incomplete
`delete_my_account` cascades every table, which is good. What it does not reach:
- Storage files. The avatar is now removed client-side (BUG_FIXES B2), but that is best effort.
- The RevenueCat customer (`app_user_id` = the Supabase uid, holding purchase history).
- Pending avatars if moderation crashed mid-way, and anything in `travel-memories` (unused today).

**Mitigation:** add a `delete-account` Edge Function that authenticates the user, then:
1. deletes the user's Storage folders in both buckets with the service role;
2. calls `DELETE https://api.revenuecat.com/v1/subscribers/{uid}` with the secret key;
3. calls `auth.admin.deleteUser(uid)`.

Have the client call it instead of the RPC.

### S-4 (P2) Companions can rewrite any column of the owner's trip
The "Companions edit trip" policy allows `UPDATE` with no column limits. A companion can set `created_at`, `start_date` or `end_date`, and `claim_visas` trusts all three, so visas can be minted for everyone on the trip. They can also change `destination_id` and `budget`; that is probably intended, since companions co-plan. Proposed (needs approval):
```sql
create or replace function public.guard_companion_trip_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id <> (select auth.uid()) and (new.created_at is distinct from old.created_at
     or new.user_id is distinct from old.user_id) then
    raise exception 'Only the trip owner can change this';
  end if;
  return new;
end; $$;
create trigger guard_companion_trip_update before update on public.trips
  for each row execute function public.guard_companion_trip_update();
```
This trigger does not stop companions editing dates to farm visas. To close that too, require `end_date < current_date` to have been true when the trip was **last edited by the owner**, or record the visa only from trips the owner finishes.

### S-5 (P3) Invitations can be used to spam
Anyone with a username can be invited by anyone (pending state, at most 30 per trip). There is no block or report. Add a "decline and block" option before growth.

### S-6 (P2) No rate limiting on Edge Functions
- `contact-support`: unlimited emails per account, which costs Resend quota and can flood your inbox. Add a `support_requests(user_id, created_at)` table and refuse more than about 5 per day.
- `moderate-profile`: OpenAI moderation is free, but each call takes 5 MB downloads and function time. A per-user limit of about 20 per hour is enough.
- Auth: set Supabase Auth rate limits and enable CAPTCHA (hCaptcha or Turnstile) for sign-up in the dashboard before launch.

### S-7 (P2) `discovery_activity` is writable without limit
Any user can insert unlimited rows, which games "recently discovered" and grows the table without bound. Proposed: a unique `(user_id, kind, item_id, created_at::date)` or a trigger allowing about 100 per day, a 30-day window in `recent_discoveries`, and a supporting index `(created_at desc, kind, item_id)`.

### S-8 (P3) `recent_discoveries` uses `search_path = public`
This is the only definer function not pinned to `''`. Recreate it with `set search_path = ''` and fully qualified names.

### S-9 (P3) Sandbox purchases unlock Premium in production
`store_entitlements.sandbox` is recorded but ignored by `effective_plan`. This is needed for App Review and TestFlight testers, so keep it. Consider excluding sandbox after release if TestFlight access is tightly controlled.

### S-10 (P2) Dependencies
`npm audit --omit=dev` reports 14 advisories (3 high). All are build-time (Expo CLI's `node-forge` and `zod`, plus `glob`/`minimatch`), not the app bundle. Upgrade with `npx expo install --fix` on the next SDK patch release, and do not use `--force`.

### S-11 Local data on the phone
AsyncStorage holds the Premium offline snapshot and place caches **unencrypted**. That is acceptable for travel plans. It is now cleared on sign-out even when offline (B1) and on deletion. If you later store anything sensitive (passport numbers, bookings), use `expo-secure-store`.

### S-12 Logging
The client logs only `__DEV__` `console.warn`s. Edge Functions log RevenueCat and Resend error bodies, which may include email addresses. Supabase function logs are retained, so mention them in the privacy notice or trim the bodies.

## GDPR checklist (EU travel app)

| Requirement | Status |
|---|---|
| Controller identity in privacy notice | **Missing:** placeholders in `src/data/legal.ts` |
| Privacy notice and Terms in app (EN, RO) | Present (`legal.tsx`) |
| Right of access / portability | JSON export present. Missing visas, companions and wheel history; add them. |
| Right to erasure | Present. Incomplete for RevenueCat (S-3). |
| Consent for background location | OS prompt plus opt-in toggle. Needs a prominent disclosure before the prompt (UX-1). |
| Processors disclosed (Supabase, RevenueCat, OpenAI moderation, Resend, OpenStreetMap/Wikipedia lookups) | Check that the privacy notice lists all of them. OpenAI receives avatars and names. |
| International transfers (OpenAI, RevenueCat are US) | State the SCCs / Data Privacy Framework basis in the notice. |
| Analytics / tracking consent | No analytics SDK, so no consent banner is needed today. Adding one later means adding consent. |
| Children | State a minimum age (16 in RO for consent) in the Terms. |
