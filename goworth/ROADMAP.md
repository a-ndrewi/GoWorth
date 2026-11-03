# Roadmap — next 30 / 60 / 90 days

Built from what the code actually contains. GoWorth's core today is catalog and OpenStreetMap discovery, swipe-to-save, a one-active-trip planner with multi-city days, companions, a visa passport, and Premium (store plus daily wheel).

## Days 0–30: launch

| Item | Why it matters | Complexity | Before launch? |
|---|---|---|---|
| Close P0s: legal identity, RevenueCat and store products, function secrets, migrations pushed, custom SMTP | Nothing ships without them | S (mostly setup) | **Yes** |
| ~~PKCE auth links (SECURITY S-1)~~ Done (B8); add the redirect allow-list entries | Removes login-CSRF | XS (setup) | **Yes** |
| Sentry crash and error reporting | You cannot fix what you cannot see | S | **Yes** |
| Background-location disclosure (UX-1), or drop Nearby on Android v1 | Play policy | S | **Yes** (Android) |
| `delete-account` Edge Function (Storage + RevenueCat + auth) | Complete GDPR erasure | S | Strongly recommended |
| Rate limits: support, moderation, discovery activity; Auth CAPTCHA | Abuse and cost control | S | Strongly recommended |
| Companion update guard (S-4) | Stops visa farming | XS | Recommended |
| Free-limit counters in the UI (UX-3) and optimistic saves (UX-4) | Feels faster; softer paywall | S | Recommended |

## Days 31–60: retention and conversion

| Item | What / why | User benefit | Business impact | Complexity |
|---|---|---|---|---|
| **Product analytics** (PostHog EU or Amplitude, with consent) | There are no funnels today: you cannot see swipe → save → trip → paywall drop-off | Indirect | Lets you tune the paywall and limits with data | S |
| **Multiple trips per account** | `trips.user_id` is the primary key, so one active trip at a time and planning a new one archives the old. Planning "summer" and "winter" side by side is the most likely request. | High | A natural Premium perk ("unlimited trips" today means "unlimited replacements") | **L**: schema change (trip id PK, FKs on activities, expenses, members, triggers). Needs a careful migration. |
| **Shareable read-only trip link** (a page on the presentation site, since there is no web app) | Companions need accounts; a link lets anyone view | Medium | Viral acquisition | M |
| **Push notifications for companions** (invite received, trip edited) | Today invites are only seen in the app | Medium | Activation of second users | M: needs `expo-notifications` remote setup, APNs/FCM, a device-tokens table and a function |
| **Offline write queue for Premium** | Offline is read-only today | Medium | A stronger Premium promise | M |
| **Weather-aware day plans** | `weather.ts` and `weather-badge` already exist; use the forecast to suggest indoor or outdoor ordering | Medium | Differentiator | S–M |

## Days 61–90: differentiation

| Item | What / why | Complexity | Notes |
|---|---|---|---|
| **AI day planner (Premium)** | One Edge Function turns the trip's cities, interests and pace into a draft itinerary from the existing catalog and OSM places. A small model with JSON output keeps cost to cents per trip. Quota per plan, cached by (city, interests, days). | M | Keep the key server-side, rate-limit per user, validate output against `validate_trip_activity_place` (it already rejects out-of-city places). |
| **Accommodation links** | Booking.com and Airbnb deep links per city (affiliate). Affiliate revenue is cheap to build and needs no backend. | S | Disclose affiliate links in Terms. |
| **Place reviews and ratings** | Only once there is enough traffic to fill them. Needs moderation (you already have the OpenAI moderation path), reporting and a DSA notice-and-action process. | L | Postpone until about 10k MAU. |
| **Follow travellers / public profiles / feed** | Big moderation and privacy surface for unclear early value | L | Postpone; companions cover the core social need. |
| **Passport sharing card** | An image of your visa passport for Instagram | S | Cheap virality; the visa assets already exist. |

## Things to avoid for now
- Stripe or web checkout for digital Premium in the app. Store policies require IAP on iOS and Android for in-app digital goods, and the RevenueCat setup is already right.
- Rewriting state management. Split `useTravelState` into smaller contexts (trip, saved, profile) only when profiling shows re-render cost.

## Scale notes
| Users | What breaks first |
|---|---|
| 100 | Nothing. The Supabase Free plan is fine, but email confirmations hit the built-in SMTP limit, so use custom SMTP. |
| 1,000 | Overpass and Wikipedia public endpoints: client-side lookups from every phone may be throttled (Overpass asks for fewer than about 10k queries a day per IP and rejects heavy users). Consider a cached proxy Edge Function. |
| 10,000 | `recent_discoveries` full scan and `search_travelers` `%LIKE%` (add the indexes in SECURITY S-7 and AUDIT P2-4). Supabase Pro plan. OpenAI moderation stays free. |
| 100,000 | Overpass must be self-hosted or replaced by a commercial places API (cost risk). The RevenueCat fee starts above $2.5k MTR. Realtime is not used, so connection limits are not a concern. |
