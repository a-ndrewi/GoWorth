# Bug Fixes

Each fix was checked with `tsc --noEmit`, `expo lint` and `npm test`. Config fixes were also checked with `expo config --type introspect`. None were run on a device. "Verified" below means verified by those checks and by reading the library source the fix relies on.

## Fixed

### B1 — Offline sign-out left the account's data on the phone (P1)
- **Problem:** Logging out with no connection showed "Could not sign out" and kept `offline-snapshot:<user>`, which holds the Premium copy of trips, journal and profile.
- **Root cause:** `signOut()` in [auth-context.tsx](src/state/auth-context.tsx) threw on any error *before* clearing AsyncStorage. In the installed auth-js (`GoTrueClient._signOut`), a network failure still removes the local session and fires `SIGNED_OUT`, but returns the error. So the user was signed out, the cleanup was skipped, and an error was shown.
- **Fix:** Always clear the account's local keys, and throw only if a session is still present afterwards.
- **Verified:** Read the auth-js source path (`removeCurrentSession()` runs before `return { error }`); typecheck and lint pass.

### B2 — Account deletion left the profile photo in Storage (P1, GDPR)
- **Problem:** `delete_my_account` deletes `auth.users`. Table rows cascade, but Storage objects do not, so the approved avatar under `profile-avatars/<uid>/approved/` survived.
- **Root cause:** Users have no delete policy on `profile-avatars` (by design: only the moderation function writes there), and nothing removed the file.
- **Fix:** `deleteAccount()` now calls the existing `moderate-profile` `remove-avatar` action first, as best effort. Deletion still goes ahead if that call fails.
- **Verified:** Typecheck passes. `remove-avatar` checks the path is under the caller's own folder. A server-side guarantee is still recommended (SECURITY S-3).

### B3 — Trial and Premium reminders survived sign-out (P1)
- **Problem:** "Your free trial ends in 2 days" and "Premium ends tomorrow" were scheduled locally and never cancelled on sign-out, so they reached the next account on the phone.
- **Root cause:** `clearAccountNotifications()` in [notifications.ts](src/lib/notifications.ts) cancelled only the wheel and trip-nudge ids.
- **Fix:** It also cancels `trial-ending` and `premium-ending-3`/`-1`. The ids are now constants shared with the schedulers.
- **Verified:** Typecheck; `DeviceSync` already calls this when `user` becomes null.

### B4 — Trial reminder quoted a yearly price for monthly plans (P2)
- **Problem:** The reminder always said "{price} per year", whichever plan's trial was started.
- **Fix:** `scheduleTrialReminder(trialDays, price, billing)` picks the monthly or yearly wording. Lifetime never schedules one. A Romanian string was added.
- **Verified:** Typecheck (the web stub signature was updated to match).

### B5 — Deleting the account did not warn that the store subscription keeps billing (P1)
- **Problem:** Apple and Google bill subscriptions independently of the GoWorth account. Users who delete without cancelling are still charged. Apple's account-deletion guidance asks apps to tell users this.
- **Fix:** In [legal.tsx](src/features/legal.tsx), the delete sheet now shows that notice and a **Manage subscription** button (`manageSubscription()`) whenever purchases are available. EN and RO copy added.
- **Verified:** Typecheck and lint. Not visible on web, where purchases are off.

### B6 — Generic and unused permission prompts (P1, App Review 5.1.1)
- **Problem:** The iOS build declared `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` and `NSMotionUsageDescription` with Expo's placeholder text, plus a generic `NSLocationAlwaysUsageDescription`. Android declared `RECORD_AUDIO`. The app uses none of these, apart from picking a library photo.
- **Root cause:** The `expo-image-picker` and `expo-location` config plugins add defaults when not configured.
- **Fix:** In [app.json](app.json), `expo-image-picker` now has a specific `photosPermission` and `cameraPermission: false`, `microphonePermission: false`. `expo-location` now has `motionUsagePermission: false` and a specific `locationAlwaysPermission`.
- **Verified:** `expo config --type introspect` now lists only the location and photo usage strings, all in GoWorth's wording, and no `RECORD_AUDIO`. Regression test: `tests/release-config.test.mjs`.

### B7 — Nearby suggestions could never start on Android (P1)
- **Problem:** Turning on "Nearby places" on Android always failed. Geofencing needs `ACCESS_BACKGROUND_LOCATION`, which was never declared, so `requestBackgroundPermissionsAsync()` is always denied.
- **Fix:** `expo-location` has `isAndroidBackgroundLocationEnabled: true` and `isAndroidForegroundServiceEnabled: false`, since geofencing needs no foreground service and this avoids a second Play declaration.
- **Verified:** Introspected config now contains `ACCESS_BACKGROUND_LOCATION` and `RECEIVE_BOOT_COMPLETED`, so geofences survive a reboot. **Consequence:** Google Play will require the background-location declaration form and a demo video (PRODUCTION_READINESS). If you would rather ship Android without nearby suggestions, revert this flag and hide the toggle on Android.
- **Needs a new native build:** `ios/` and `android/` are generated (CNG), so B6 and B7 only take effect after `eas build` or `npx expo prebuild --clean`.

### B8 — Any email-style link could sign the phone into someone else's account (P1, security)
- **Problem:** `completeLink` called `setSession()` with whatever `access_token`/`refresh_token` a `goworth://…#…` link carried. A link built from an attacker's own session signed the victim into the attacker's account (login CSRF), and the victim's next trips and photos went to it. The web client accepted the same fragment through `detectSessionInUrl`.
- **Fix:**
  - [supabase.ts](src/lib/supabase.ts) uses `flowType: "pkce"`. Sign-up, resend and reset emails now return a one-time `?code=`, which only the device that asked for it can exchange, because the verifier is kept in its storage.
  - [auth-context.tsx](src/state/auth-context.tsx) exchanges the code on native with `exchangeCodeForSession(code, { flowId })` (auth-js keeps one verifier per flow, keyed by `sb_flow_id`). It exchanges each code once, although the link arrives both as the launch URL and as a URL event, and it never reads tokens from the fragment. 
  - When a link can't sign in, the sign-in screen now says why. Either it was opened on another device (sign-up emails are still confirmed by then, so the user just signs in), or it has expired or was already used. Before this, both cases failed silently. Parsing lives in [auth-link.ts](src/utils/auth-link.ts); EN and RO copy added.
  - Recovery mode now comes from auth-js's `PASSWORD_RECOVERY` event. PKCE links carry no `type=recovery`, so the old URL sniffing was removed.
- **Verified:**
  - `tests/auth-link.test.mjs` (5 tests).
  - Checked in the web build before web was removed: a code with no verifier showed the other-device notice, an expired link showed the expired notice, and attacker tokens in the fragment stored no session. The same `readAuthLink` and messages now serve the native deep-link path only.
  - **Not verified:** a real email round trip and the native deep-link path on a device. Both need the redirect allow-list entry in PRODUCTION_READINESS.
- **Effect on links already sent:** emails sent before this build hold implicit-flow links. Opened in the new app, they show nothing useful. If the email was a sign-up confirmation, the address is confirmed anyway and the user can sign in.

## Found, not fixed

| # | Bug | Why not fixed here |
|---|---|---|
| O2 | Companions can update `trips.created_at` and dates, and so mint visas | Needs a migration (column-level grant or trigger). SQL is proposed in SECURITY S-4 and needs your approval. |
| O3 | RevenueCat subscriber not deleted on account deletion | Needs a secret-key server call; best added to a `delete-account` Edge Function. See S-3. |
| O4 | Trips that existed before the visa migration never earn visas (`created_at` defaulted to the migration time) | Data backfill on production. Only matters if real users predate 2026-11-02. |
| O5 | Rapid double-tap on save sends duplicate writes (stale `enabled`) | Low impact. Fix with an in-flight set keyed by item id. |

## Web removal (owner's decision, 2026-11-03)
GoWorth ships on iOS and Android only; the browser only has the presentation site.
- `app.json`: `platforms: ["ios", "android"]`, `web` block removed. `package.json`: `dev` (web), `web` and `build:web` scripts removed.
- Deleted the web-only files `lib/notifications.web.ts`, `lib/purchases.web.ts`, `components/goworth/trip-map.web.tsx`, `components/goworth/globe-surface.web.tsx`, `components/animated-icon.web.tsx`, `hooks/use-color-scheme.web.ts`, `components/web-badge.tsx` and `global.css`, plus the untracked `dist/` web export.
- Removed every `Platform.OS === "web"` branch: Supabase storage and URL detection, the auth web link path, the browser download for data export, the web grid widths and padding, the `useNativeDriver` switches, and the `typeof document` header checks.
- Verified with lint (0 problems), tests (98/98) and `tsc`. The only errors left are in `src/features/trip.tsx` (`companionsAfterMenu`, `openCompanions`), which another session was editing at the same time; they are not from this change.

## Email confirmation straight into the app (2026-11-03)
- **Before:** the confirmation link redirected straight to `goworth://auth`. Many mail apps and in-app browsers do not follow a redirect to a custom scheme, so people saw an error page. A link opened on a computer led nowhere, and the app still asked for a sign-in afterwards.
- **Now:** Supabase confirms the address, then redirects to `goworth-website/public/auth/index.html` (an https page, which mail apps follow). The page opens `goworth://auth?code=…&sb_flow_id=…` on its own and also shows an **Open GoWorth** button. The app exchanges the code and signs in. The page clears the code from the address bar, is `noindex` / `no-referrer`, and is useless without the app that holds the PKCE verifier.
- **Confirmed somewhere else:** after sign-up, the auth screen keeps the email and password in memory, never in storage. When the app returns to the foreground it signs in by itself once the email is confirmed. It waits 1.5 s first, so a link tapped on the same phone signs in through its code.
- **Verified:** app `tsc` (apart from the other session's `trip.tsx`) and lint pass. The site's lint and build pass, and `dist/auth/index.html` is emitted. In the browser, the page was checked as a phone (title "Email confirmed", button `goworth://auth?sb_flow_id=flow-1&code=demo-code`, address cleared), with an expired link ("This link no longer works") and on desktop (no button, "go back to GoWorth on your phone"). **Not verified:** a real email to a real phone. That needs the redirect allow-list entry and the site deployed.
