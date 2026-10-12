# GoWorth Travel

Expo SDK 57 travel-planning app for iOS, Android, and web. An email account is required. Each new account starts with an empty trip, itinerary, expense list, saved list, and journal. Profile and travel data are private to the account in Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the publishable key from the `jmguyniibuifqnegdiso` Supabase project. The project URL is already in `.env.example`. Never put a service-role or secret key in an `EXPO_PUBLIC_` variable.

## Enable the backend

The [initial migration](supabase/migrations/20261012120000_initial_schema.sql) has been applied to project `jmguyniibuifqnegdiso`. It creates the account-owned tables, row-level security policies, an atomic trip replacement function, and a private `travel-memories` photo bucket. Apply it to any new Supabase project before using account data.

Configure email confirmation and a custom SMTP provider in Supabase Authentication. Add the web app's `/auth` URL to the Auth redirect allowlist, including each local development port in use (for example `http://localhost:8082/auth`) and the production domain. For native builds, allow the `goworth://auth` redirect. Users must confirm their email when confirmation is enabled; password-reset links return to the same route.

The app does not contain a database owner password, so a publishable key alone cannot apply this migration. Photo upload, live maps, push notifications, payments, and reservations are not connected. The catalog contains 24 curated destinations and 144 named real places across six regions; it is bundled with the app, while account data is stored in Supabase. External place links open OpenStreetMap search results, so current opening hours and prices should be confirmed with the venue.

Destination photographs are bundled in `assets/images/destinations` to avoid network failures during browsing. Their Wikimedia Commons source pages, creators, and CC0 licenses are recorded in `assets/images/destinations/provenance.json`. Run `node scripts/download-destination-photos.mjs` to refresh them; the script rejects images without CC0 metadata.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build:web
```
