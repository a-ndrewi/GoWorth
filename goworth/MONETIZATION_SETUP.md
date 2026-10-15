# Membership setup

The app shows Free, Premium monthly, and Lifetime. Premium and Lifetime have unlimited trips and saves. Until store products, public SDK keys, and the Supabase verification function are configured, purchase controls remain disabled and prices are shown as unavailable. Web does not sell plans.

## Configure stores and RevenueCat

1. Apply `supabase/migrations/20261014180000_routes_and_entitlements.sql` to the production Supabase project. This creates `user_entitlements`, monthly usage tracking, and server-enforced Free limits. A publishable Supabase key cannot apply SQL migrations.
2. In App Store Connect, create an auto-renewable **monthly subscription** for `com.andrewi.goworth` and a **non-consumable** Lifetime in-app purchase. In Google Play Console, create the matching **monthly subscription** and **one-time product** for `com.andrewi.goworth`. Complete each store's metadata, agreements, tax, and banking setup before expecting live products.
3. Connect both store apps to one RevenueCat project. Import the products, attach both to the entitlement ID `goworth_unlimited`, and create a current offering containing the **Monthly** and **Lifetime** packages. Match each package to the corresponding store product. The app reads the localized price directly from these packages.
4. Add the RevenueCat **public Apple SDK key** and **public Google SDK key** to the corresponding `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` build environment variables. Do not use the RevenueCat secret key in an `EXPO_PUBLIC_` variable. The SDK identifies each customer with their Supabase Auth user ID.
5. Set `REVENUECAT_SECRET_API_KEY` as a Supabase Edge Function secret. Deploy the verification function to the same project as Auth and `user_entitlements`:

   ```bash
   npx supabase functions deploy sync-entitlement --project-ref jmguyniibuifqnegdiso
   ```

   Keep the default JWT verification enabled. The function derives the account from the caller's token, queries RevenueCat server-side, and updates the entitlement row with the service role. A failed verification prevents new purchases from opening in the app.
6. Build a new iOS/Android development client or store build after adding `react-native-purchases`. Expo Go cannot execute native purchases. For local native builds, use `npx expo run:ios` or `npx expo run:android`; EAS development builds also work.

## Check before release

Use Apple Sandbox and Google Play license testers with a real device/build. Confirm localized prices, a successful monthly purchase, Lifetime purchase from a Free account, cancellation, expiration, restoration after reinstall, and switching accounts. Confirm that purchase buttons stay disabled if RevenueCat or the verification function is unavailable. A monthly member must cancel in the store and wait for access to expire before buying Lifetime, so the two products cannot bill concurrently through this screen.

The app verifies at account load and after purchase/restore; there is no RevenueCat webhook yet. Revocations and refunds for Lifetime access are therefore reflected when the app next verifies, not immediately. Set up and test a signed webhook or another reliable server reconciliation process before taking production payments. Complete the operator/contact details and update the draft legal and privacy documents for the live provider, cancellation, refund, and data-processing terms before release.

Official references: [Expo in-app purchases](https://docs.expo.dev/guides/in-app-purchases/), [RevenueCat Expo setup](https://www.revenuecat.com/docs/getting-started/installation/expo), [RevenueCat entitlements](https://www.revenuecat.com/docs/getting-started/entitlements), [RevenueCat offerings](https://www.revenuecat.com/docs/offerings/overview), and [RevenueCat subscriber API](https://www.revenuecat.com/docs/api-v1/customers).
