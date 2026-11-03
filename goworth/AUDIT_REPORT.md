# GoWorth — Audit Report

Audit date: 2026-11-03 · Targets: **iOS and Android only** (web removed at the owner's request; the browser only has the presentation site) · Branch: `feat/notifications-trip-widget` (uncommitted working tree) · Expo SDK 58, React Native 0.88, React 19.3, Supabase JS 2.117, RevenueCat 10.16.

Companion documents: [BUG_FIXES.md](BUG_FIXES.md) · [SECURITY_AUDIT.md](SECURITY_AUDIT.md) · [UX_RECOMMENDATIONS.md](UX_RECOMMENDATIONS.md) · [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) · [ROADMAP.md](ROADMAP.md) · [TEST_REPORT.md](TEST_REPORT.md)

## How this audit was done, and its limits

- Every Supabase migration (12) and Edge Function (3) was read in full, as were the client's data, auth, purchase, notification, state and routing layers. Feature screens were read where a flow crossed them.
- I ran TypeScript, ESLint, the test suite and `expo config --type introspect` (which resolves the native config the stores will see).
- **Not done:** I did not run the app on a device or simulator, apply migrations to a database (no local Postgres or Supabase CLI here), or call the live Supabase project, RevenueCat or the stores. Findings about runtime behaviour come from reading the code, and each one says so. UI/UX findings come from the code, not from screenshots.

## What GoWorth actually is (architecture map)

| Layer | Implementation |
|---|---|
| Routing | Expo Router, `src/app/`. Root `Stack` with `Stack.Protected` guards for signed-in and signed-out routes; `(tabs)` with home/map/saved/profile; `(itinerary)` group with overview/places/budget. A custom `BottomNav` replaces the tab bar. |
| State | `AuthProvider` (Supabase session) → `TravelProvider` (keyed by user id, so account state never leaks between sign-ins) → `VisaProvider`. One large hook, `useTravelState` (≈600 lines), holds the whole account. |
| Data | `src/lib/travel-repository.ts` talks to Supabase directly with RLS. Multi-row writes go through `security invoker` or `security definer` RPCs (`replace_trip`, `archive_trip`, `claim_visas`, the companion RPCs). |
| Offline | Premium accounts keep an AsyncStorage snapshot and open read-only from it when the load fails. |
| Discovery | A static catalog (`src/data/catalog.ts`, about 60 cities) plus live OpenStreetMap/Overpass and Wikipedia lookups (`nearby-places.ts`, `place-photo.ts`), with a Tinder-style `discovery-swiper`. |
| Monetisation | RevenueCat (monthly, yearly, lifetime) → `revenuecat-sync` Edge Function → `store_entitlements`. Plus a free daily "Premium wheel" (`spin_premium_wheel` RPC, server-side odds) → `user_entitlements`. `effective_plan()` merges the two. Free limits are enforced in Postgres triggers (`consume_free_allowance`). |
| Social | Usernames, traveller search, trip companions (invite, accept, co-edit, shared journal copy), and visa "passport" gamification. |
| AI | OpenAI is used **only** for content moderation (`omni-moderation-latest`) of names, usernames and avatars in `moderate-profile`. There is no AI assistant, AI trip planner or AI memories feature. |
| Device | Local notifications (wheel, trip nudges, trial reminder, Premium ending), a background geofence for nearby suggestions, and an iOS home-screen widget (`expo-widgets`). |

**Features the brief mentions that do not exist in the code:** reviews and ratings, following users, creator profiles, social feeds, user-generated content beyond names and avatars, accommodation discovery (Booking/Airbnb redirects), Stripe (removed; test data cleared in `20261027120000_premium_wheel.sql`), Apple and Google sign-in, AI assistant. They are not audited as features; see [ROADMAP.md](ROADMAP.md) for which ones are worth building.

## Baseline health

| Check | Result |
|---|---|
| `tsc --noEmit` (strict) | Pass, 0 errors |
| `expo lint` | Pass, 0 warnings |
| `npm test` | 91 of 91 pass before changes; 98 of 98 after (7 added) |
| `npm audit --omit=dev` | 14 advisories (3 high: `node-forge`, `zod` in Expo CLI tooling; `glob`/`minimatch` moderate). All are build-time transitive dependencies, not shipped in the bundle. |

The codebase is better than average for an app at this stage. RLS is on everywhere, every privileged write goes through an RPC that checks `auth.uid()`, `search_path = ''` is set on almost every definer function, the paywall reads prices from the store, and free limits are enforced in the database rather than the client.

## Findings by priority

Status: **Fixed** = changed and verified in this audit · **Open** = needs your decision, external setup or a database change.

### P0 — Critical (blocks submission)

| # | Finding | Status |
|---|---|---|
| P0-1 | **Legal operator identity is a placeholder.** `src/data/legal.ts` ships `"[LEGAL OPERATOR NAME - COMPLETE BEFORE RELEASE]"` and `"[REGISTERED ADDRESS…]"`. The Privacy notice and Terms render "Operator details pending" in red. GDPR Art. 13 requires the controller's identity, and both stores require a working privacy policy. | Open: you need to fill in the details |
| P0-2 | **Purchases need store and RevenueCat configuration.** The client and server code is complete, but release builds need `EXPO_PUBLIC_REVENUECAT_IOS_KEY`/`_ANDROID_KEY`, products and offering in RevenueCat, `REVENUECAT_SECRET_KEY`/`REVENUECAT_WEBHOOK_AUTH` secrets, and `revenuecat-sync` deployed with `--no-verify-jwt`. Without the keys, the paywall hides itself on native builds (`premium-plans.tsx`). | Open: external setup |
| P0-3 | **Profile saving needs `OPENAI_API_KEY`.** `moderate-profile` fails closed without it, so new users cannot set a name or username, and the username gate blocks the whole app (`username-gate.tsx`). | Open: external setup (set the function secret) |

### P1 — High

| # | Finding | Status |
|---|---|---|
| P1-1 | Signing out without a connection showed "Could not sign out" and left the Premium offline snapshot (trips, journal) on the phone, though supabase-js had already removed the session. | **Fixed** (B1) |
| P1-2 | Account deletion left the approved profile photo in Storage, so personal data outlived the account. | **Fixed** (B2) |
| P1-3 | Trial-ending and Premium-ending reminders were not cancelled on sign-out, so they reached whoever signed in next on that phone. | **Fixed** (B3) |
| P1-4 | The delete-account sheet did not say that a store subscription keeps billing after deletion (App Store guideline 5.1.1(v) expectation; also a refund and support risk). | **Fixed** (B5) |
| P1-5 | iOS permission prompts included generic, unused camera, microphone and motion strings ("Allow $(PRODUCT_NAME) to access your camera"), and Android requested `RECORD_AUDIO`. This is a common App Review rejection (5.1.1). | **Fixed** (B6) |
| P1-6 | Nearby-place notifications could never work on Android: no `ACCESS_BACKGROUND_LOCATION` was declared, so `requestBackgroundPermissionsAsync` is always denied. | **Fixed** (B7). Play now needs a background-location declaration; see PRODUCTION_READINESS. |
| P1-7 | Auth deep links use the implicit flow: any `goworth://…#access_token=…&refresh_token=…` link signs the phone into that session (`auth-context.tsx` `completeLink`). A crafted link can sign a victim into an attacker's account (login CSRF), and the victim's next trip and photos then go to the attacker. | **Fixed** (B8): PKCE |
| P1-8 | RevenueCat customer data is not deleted with the account (GDPR erasure). | Open: server change (SECURITY S-3) |
| P1-9 | No crash reporting or production error telemetry. Errors are only shown to the user; the only logging is in Edge Functions. | Open: recommend Sentry (`@sentry/react-native`, has an Expo plugin) |
| P1-10 | Play Store background-location policy needs a prominent in-app disclosure **before** the system prompt. Today the explanation appears under the toggle after it is turned on (`library.tsx`). | Open: UX copy and flow change (UX-1) |

### P2 — Medium

| # | Finding | Status |
|---|---|---|
| P2-1 | Accepted companions can `UPDATE` any column of the owner's `trips` row, including `created_at` and the dates that `claim_visas` trusts. They can mint visas for themselves and the owner. | Open: migration needs approval (SECURITY S-4) |
| P2-2 | `contact-support` has no rate limit; one account can flood the support inbox and burn the Resend quota. | Open (SECURITY S-6) |
| P2-3 | `discovery_activity` accepts unlimited inserts, and `recent_discoveries()` does a `DISTINCT ON` over the whole table on every call. Trending can be gamed, and the query degrades linearly with table size. | Open (SECURITY S-7, perf) |
| P2-4 | `search_travelers` uses `lower(display_name) LIKE '%term%'`, a sequential scan on `profiles` for each search. It is fine at 1k users and slow at 100k. | Open: `pg_trgm` index |
| P2-5 | 14 npm advisories in build tooling. | Open: `npx expo install --fix` after the next SDK patch; do not `npm audit fix --force` |
| P2-6 | `useTravelState` is a 600-line hook. Every state change re-renders every consumer of `useTravel()`, and all tabs stay mounted (`lazy: false` on map and profile). | Open: split the context (perf) |
| P2-7 | The trial reminder said "per year" even for a monthly plan with a trial. | **Fixed** (B4) |
| P2-8 | `recent_discoveries` is `security definer` with `search_path = public`, unlike every other function (`''`). | Open: one-line migration |

### P3 — Low

- Dead code: `notifications` and `setNotifications` in `travel-context.tsx` (the DB column `notifications_enabled` has no UI; notification preferences live in AsyncStorage). The `travel-memories` bucket and `travel_memories.photo_path` are never used by the client.
- `// VENUE-DEBUG` `console.warn` calls in `discovery-swiper.tsx` (dev-only, but noisy).
- The `trips.created_at` column was added with `default now()`, so trips that existed before `20261102120000` and had already ended never earn visas. This only matters if you have real pre-launch data.
- Rapid double-taps on save toggles compute `enabled` from stale state and can send two upserts (harmless but wasteful).
- The webhook secret is compared with `===` rather than in constant time (low risk over HTTPS).
- Web support was removed (BUG_FIXES, Web removal). `react-dom` and `react-native-web` stay in `package.json` only because `expo-router`, `@expo/metro-runtime`, `@expo/ui` and `expo-image` list them as peer dependencies; they are not in the native bundles. The Expo template leftovers `components/themed-*.tsx`, `hint-row.tsx`, `ui/collapsible.tsx`, `animated-icon.tsx`, `hooks/use-theme.ts` and `constants/theme.ts` are not used anywhere.
- The unused `expo-sqlite` plugin and dependency, and `react-native-webview` (check whether `trip-map` still needs it before removing).
- `NSLocalNetworkUsageDescription` from `expo-dev-client` is in the prebuilt plist; check that it is absent from the EAS production build.

## Feature-by-feature verification

| Feature | Frontend | Backend | Verdict |
|---|---|---|---|
| Sign up / in / reset / confirm email | `onboarding.tsx` validates, handles rate limits and resends confirmations | Supabase Auth | PKCE since B8; link parsing unit-tested, native deep link not yet tried on a device |
| Session persistence and refresh | AsyncStorage, auto-refresh paused in background | — | Correct |
| Account deletion | Typed-DELETE confirmation | `delete_my_account` deletes `auth.users`; cascades cover every table | Fixed photo leftover; RevenueCat leftover open |
| Data export | JSON via the share sheet | — | Missing visas and companions in export (P3) |
| Discover / swipe / favourites | `discovery-swiper.tsx` | `saved_items` + allowance trigger | Server enforces 5 free saves a month |
| Trip create / edit / delete / finish | `planner.tsx`, `trip.tsx` | `replace_trip`, `archive_trip`, route triggers that validate cities and radius | Sound; transactional RPCs |
| Companions | `companions.tsx` | Definer RPCs, 1 free / 30 max | Sound except P2-1 |
| Visa passport | `passport.tsx` | `claim_visas` idempotent with advisory lock | Sound except P2-1 |
| Premium purchase / restore / manage | `premium-plans.tsx` | `revenuecat-sync` reads RevenueCat REST, never trusts the body | Sound. Premium cannot be granted client-side: `store_entitlements` and `user_entitlements` are select-only for users. |
| Daily wheel | `premium-wheel.tsx` | Server-side odds and 24-hour cooldown with lock | Sound; odds disclosed |
| Notifications / widget | `notifications.ts`, `trip-widget.ios.ts` | — | Fixed sign-out leftovers |
| Offline (Premium) | Snapshot in AsyncStorage | — | Read-only mode; fixed sign-out cleanup |

## Scores

| Area | Score | Why |
|---|---|---|
| **Overall quality** | **70 / 100** | Solid, defensive engineering. Held back by external setup, legal placeholders and missing telemetry. |
| Security | 76 | RLS and RPC design are good, and Premium cannot be forged. Open: companion column scope, no rate limits, incomplete erasure. |
| Performance | 68 | Fine for launch. The single giant context, always-mounted tabs and two unindexed scans will show at scale. |
| Code quality | 76 | Strict TS, clean lint, consistent idiom, good comments. Some very long files and lines, and some legacy-schema fallbacks that could now go. |
| UI/UX | 74 (from code only) | Consistent design system, i18n EN/RO, dark mode, accessibility labels, loading and error states. Not verified on a device. |
| Backend architecture | 76 | Server-enforced limits and plans, idempotent RPCs, advisory locks. One-trip-per-user schema limits the product. |
| Production readiness | 48 | Blocked by P0-1 to P0-3, crash reporting, store listings and policy declarations. |

- Bugs found: **11** (8 fixed, 3 open: P1-8, P2-1, the `created_at` backfill).
- Bugs fixed and verified: **8**.
- Unresolved P0 issues: **3**, all needing your input or external setup, none needing code.
- **Recommendation: NO-GO today. GO once P0-1 to P0-3 and P1-8 to P1-10 are done** (estimated 2–4 days of work plus store review lead time).
