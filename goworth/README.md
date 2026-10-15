# GoWorth Travel

Expo SDK 57 travel-planning app for iOS, Android, and web. An email account is required. Each new account starts with an empty trip, itinerary, expense list, saved list, and journal. Profile and travel data are private to the account in Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

For Expo Go on a phone on the same Wi-Fi network, run `npm run dev:phone` and scan its QR code. This starts a separate LAN server on port 8082, so the web preview on port 8081 can stay open.

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

Configure email confirmation and a custom SMTP provider in Supabase Authentication. Add the web app's `/auth` URL to the Auth redirect allowlist, including each local development port in use (for example `http://localhost:8082/auth`) and the production domain. For native builds, allow the `goworth://auth` redirect. Users must confirm their email when confirmation is enabled; password-reset links return to the same route.

The app does not contain a database owner password, so a publishable key alone cannot apply migrations. Profile-photo upload requires the private Storage bucket, deployed moderation function, and `OPENAI_API_KEY` secret described above. Push notifications, payments, and reservations are not connected. The catalog contains 64 curated destinations and 384 named real places across six regions; it is bundled with the app, while account data is stored in Supabase. The world map can search other locations through OpenStreetMap. Place previews search Wikimedia Commons for a location-specific photo with source and license information. Current opening hours and prices should be confirmed with the venue.

The Free plan is enforced by the routes and entitlements migration: one new trip, five new places, and five new destinations per UTC calendar month. The Membership screen is ready for native store products but does not offer purchases until [store and server setup](MONETIZATION_SETUP.md) is complete. No price is hard-coded in the app.

Selecting a destination or map search result loads nearby attractions on demand from OpenStreetMap through Photon, with Overpass as a second OSM source. If both public services are unavailable, the map shows nearby geotagged Wikipedia places and labels their source. Results are cached for 30 minutes per area; this is a browse feature, not a complete offline world catalog. A production service with sustained traffic should operate its own POI endpoint rather than rely on public instances.

Destination photographs are bundled in `assets/images/destinations` to avoid network failures during browsing. Their Wikimedia Commons source pages, creators, and CC0 licenses are recorded in `assets/images/destinations/provenance.json`. Run `node scripts/download-destination-photos.mjs` to download missing photos; set `REFRESH_PHOTOS` to comma-separated destination IDs to update existing ones. The script rejects images without CC0 metadata.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build:web
```
