<p align="center">
  <img src="goworth/assets/images/icon.png" width="96" alt="GoWorth icon" />
</p>

<h1 align="center">GoWorth</h1>

<p align="center">
  A travel planner for iPhone and Android: discover places, plan the trip day by day, track the budget, keep a journal and collect visas in your passport.
</p>

<p align="center">
  <a href="https://a-ndrewi.github.io/goworth-website/">Website</a> ·
  <a href="https://github.com/a-ndrewi/goworth-website">Website source</a> ·
  <a href="goworth/README.md">Developer setup</a>
</p>

<p align="center">
  <img src="https://a-ndrewi.github.io/goworth-website/screens/deck-1.jpg" width="19%" alt="Discover" />
  <img src="https://a-ndrewi.github.io/goworth-website/screens/map-globe.jpg" width="19%" alt="World map" />
  <img src="https://a-ndrewi.github.io/goworth-website/screens/itinerary-1.jpg" width="19%" alt="Itinerary" />
  <img src="https://a-ndrewi.github.io/goworth-website/screens/budget.jpg" width="19%" alt="Budget" />
  <img src="https://a-ndrewi.github.io/goworth-website/screens/place-louvre.jpg" width="19%" alt="Place" />
</p>

---

## What it does

- **Discover.** Swipe through curated destinations, save the ones you like and see what other travelers saved recently. Search any city on the world map and load nearby attractions on demand.
- **Plan.** Build a trip with dates, cities and a day-by-day itinerary. Places show photos of the place itself, with source and license.
- **Budget.** Log expenses in your own currency and split them with the people you travel with.
- **Journal.** Write about each day and share a finished trip as a story card.
- **Passport.** Every completed trip issues a visa for each country it passed through; repeat visits add entry stamps.
- **Widget.** The home screen widget shows the current trip at a glance.
- **Two languages.** English and Romanian, with light and dark themes.

Every account is private: trips, expenses, saved places and journal entries belong to the signed-in user and are protected by row-level security in Supabase.

## Plans

The Free plan covers one new trip, five new places and five new destinations per calendar month. Premium removes the limits and unlocks the passport. It is sold as a monthly or yearly subscription or a one-time Lifetime purchase through the App Store and Google Play.

## Built with

| Area | Technology |
| --- | --- |
| App | Expo SDK 58, React Native 0.88, React 19, Expo Router, TypeScript |
| Graphics | React Native Skia (globe), Reanimated, SVG |
| Backend | Supabase: Postgres with row-level security, Auth (email, PKCE links), Storage, Edge Functions |
| Purchases | RevenueCat |
| Maps and places | OpenStreetMap through Photon and Overpass, Wikipedia, Wikimedia Commons |
| Geography | GeoNames (69,806 cities in 250 countries and territories, bundled) |

## Repository layout

```
goworth/                 the mobile app
├── src/app/             screens and routes (Expo Router)
├── src/features/        feature screens: discover, map, trip, journal, passport, membership…
├── src/components/      shared UI
├── src/data/            catalog, geography, translations, legal texts
├── src/state/           app state and Supabase sync
├── src/widgets/         home screen widget
├── supabase/            SQL migrations and Edge Functions
├── scripts/             data import and asset build scripts
└── tests/               unit tests (node --test)
```

The presentation site lives in its own repository, [goworth-website](https://github.com/a-ndrewi/goworth-website). It also hosts the page that email confirmation links open.

## Run it

```bash
cd goworth
npm install
cp .env.example .env.local   # then add the Supabase publishable key
npx expo run:ios             # or: npx expo run:android
```

The app needs a development build because it uses RevenueCat, Skia, widgets and background location. Database migrations, Edge Function secrets, RevenueCat products and Auth settings are described in [goworth/README.md](goworth/README.md).

Checks:

```bash
npm run lint
npm run typecheck
npm test
```

## Data and credits

Map data © OpenStreetMap contributors (ODbL). Geographic index from GeoNames (CC BY 4.0). Destination photos from Wikimedia Commons (CC0), with creators recorded in `goworth/assets/images/destinations/provenance.json`. Details are in [DATA_SOURCES.md](goworth/DATA_SOURCES.md) and in the app under Legal & privacy.

## License

Copyright © 2026 GoWorth. All rights reserved. The source is public for reference; it may not be copied, redistributed or published as another app without written permission.
