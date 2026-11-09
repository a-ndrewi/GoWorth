# GoWorth Travel

Expo SDK 58 travel-planning app for iOS and Android. There is no web version of the app; the browser only has the separate presentation site. An email account is required. Each new account starts with an empty trip, itinerary, expense list, saved list, and journal. Profile and travel data are private to the account in Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local
npx expo run:ios      # or: npx expo run:android
```

The app needs a development build (it uses RevenueCat, Skia, widgets and background location). For a quick look in Expo Go on a phone on the same Wi-Fi network, run `npm run dev:phone` and scan its QR code.

Set `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the publishable key from the `jmguyniibuifqnegdiso` Supabase project. The project URL is already in `.env.example`. Never put a service-role or secret key in an `EXPO_PUBLIC_` variable.

## Enable the backend

The [initial migration](supabase/migrations/20261012120000_initial_schema.sql) has been applied to project `jmguyniibuifqnegdiso`. It creates the account-owned tables, row-level security policies, an atomic trip replacement function, and a private `travel-memories` photo bucket. Apply it to any new Supabase project before using account data.

Apply [the discovery activity migration](supabase/migrations/20261013120000_discovery_activity.sql) to show recent places saved by other travelers beneath the Home swiper. Until it is applied, that section shows its empty state; the swiper and favorites still work. Discovery radius and search city are stored per account on the current device.

Apply [the saved place details migration](supabase/migrations/20261014120000_saved_place_details.sql) to sync places found through the live map across devices. Until then, the app retains their details on the current device and their IDs in the account; another device cannot display those places until the migration is applied.

Profile photos and moderated name changes require more than SQL. After applying [the routes and entitlements migration](supabase/migrations/20261014180000_routes_and_entitlements.sql), set `OPENAI_API_KEY` under Supabase Dashboard > Edge Functions > Secrets and deploy the [profile moderation Edge Function](supabase/functions/moderate-profile/index.ts):

```bash
npx supabase login
npx supabase functions deploy moderate-profile --project-ref jmguyniibuifqnegdiso
```

The key must remain a Supabase function secret; never put it in `.env.local` or any `EXPO_PUBLIC_` variable. SQL migrations do not deploy Edge Functions. Without the key, photo and name moderation fails closed; language and currency settings still save to Auth metadata.

### Premium purchases (RevenueCat)

Premium is sold as monthly and yearly subscriptions and a one-time Lifetime purchase through the App Store and Google Play, using RevenueCat. Store purchases live in `store_entitlements`, separate from wheel prizes; the [store purchases migration](supabase/migrations/20261030120000_store_purchases.sql) adds it and makes the free limits and the app read the better of the two.

In RevenueCat, create the entitlement `premium`, the products `premium_monthly`, `premium_yearly` and `premium_lifetime`, and a current offering with the Monthly, Annual and Lifetime packages, all attached to `premium`. Put the public SDK keys in `.env.local` (see `.env.example`). Then set `REVENUECAT_SECRET_KEY` and `REVENUECAT_WEBHOOK_AUTH` as Supabase function secrets and deploy the sync function without Supabase JWT checks, because RevenueCat's webhook does not carry one (the function checks the user session or the webhook secret itself):

```bash
npx supabase functions deploy revenuecat-sync --no-verify-jwt --project-ref jmguyniibuifqnegdiso
```

In RevenueCat > Integrations > Webhooks, point a webhook at `https://jmguyniibuifqnegdiso.supabase.co/functions/v1/revenuecat-sync` with the Authorization header `Bearer <REVENUECAT_WEBHOOK_AUTH>`.

Before the store accounts exist, test with RevenueCat's Test Store: set `EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY` and run a development build (`npx expo run:ios` or `npx expo run:android`; Expo Go only previews the paywall). A 1-month test subscription renews every 5 minutes, up to 5 times. The Test Store key is used in development builds only; TestFlight and Play testing tracks are release builds and need the platform keys with the store sandboxes.

### Yearly travel recap

From November 1 through January, Profile shows a card for the year's travel recap (`/wrapped`), and a local reminder arrives on December 1. It is built on the phone from finished trips in the journal and the account's own trips that have started, with no extra tables: trips, days, countries (and which are new, from the passport's first entries), distance between stops, the country of the year and a travel style. Free sees trips, days and countries; the rest is Premium. The last page shares the year as a story card on light or dark paper. To try it, run [scripts/seed-test-wrapped.sql](scripts/seed-test-wrapped.sql) in the SQL Editor; it gives `andreitest@test.com` eight finished trips in 2026.

### Visa passport

Apply [the visa passport migration](supabase/migrations/20261102120000_visa_passport.sql) to issue visas. The app calls `claim_visas()` at launch and when it returns to the foreground: every trip whose end date has passed, and that was still planned when it ended, issues a visa for each country it passed through (a repeat visit adds an entry stamp). Finishing a trip early, or creating one after its dates, earns nothing. Free accounts collect visas too; the passport shows them locked until Premium. Until the migration is applied the passport stays empty.

Configure email confirmation and a custom SMTP provider in Supabase Authentication. Email links use PKCE. Tapping one confirms the address at Supabase, which redirects to the bridge page of the presentation site (`goworth-website/public/auth/index.html`, address in `EXPO_PUBLIC_AUTH_LINK_URL`). The page opens `goworth://auth?code=…&sb_flow_id=…`, and the app exchanges the code and signs in. If the email is confirmed on another device, the app signs in with the details from sign-up the next time it comes to the foreground (they are kept in memory only, never stored). Add `https://a-ndrewi.github.io/goworth-website/auth/**` (or the site's own domain later) to the Auth redirect allowlist, plus `exp://**` for Expo Go during development. Users must confirm their email when confirmation is enabled; password-reset links return to the same route.

The app does not contain a database owner password, so a publishable key alone cannot apply migrations. Profile-photo upload requires the private Storage bucket, deployed moderation function, and `OPENAI_API_KEY` secret described above. Push notifications and reservations are not connected. The catalog contains 64 curated destinations and 384 named real places across six regions; it is bundled with the app, while account data is stored in Supabase. The world map can search other locations through OpenStreetMap. Place previews search Wikimedia Commons for a location-specific photo with source and license information. Current opening hours and prices should be confirmed with the venue.

The Free plan is enforced by the routes and entitlements migration: one new trip, five new places, and five new destinations per UTC calendar month. Premium is bought through the store plans described under [Premium purchases](#premium-purchases-revenuecat), and it can also be won: the Daily wheel screen, opened from Premium, offers one free spin every 24 hours, and an invite code gives the inviter and the friend a month each. The premium wheel migration draws the prize on the server (Premium for 1 month at 1%, Lifetime at 0.02%) and upgrades the account in the same call. The displayed odds in `src/lib/wheel-odds.ts` must match the migration, which `tests/wheel-odds.test.mjs` checks.

Selecting a destination or map search result loads nearby attractions on demand from OpenStreetMap through Photon, with Overpass as a second OSM source. If both public services are unavailable, the map shows nearby geotagged Wikipedia places and labels their source. Results are cached for 30 minutes per area; this is a browse feature, not a complete offline world catalog. A production service with sustained traffic should operate its own POI endpoint rather than rely on public instances.

Destination photographs are bundled in `assets/images/destinations` to avoid network failures during browsing. Their Wikimedia Commons source pages, creators, and CC0 licenses are recorded in `assets/images/destinations/provenance.json`. Run `node scripts/download-destination-photos.mjs` to download missing photos; set `REFRESH_PHOTOS` to comma-separated destination IDs to update existing ones. The script rejects images without CC0 metadata.

## Checks

```bash
npm run lint
npm run typecheck
npm test
```
