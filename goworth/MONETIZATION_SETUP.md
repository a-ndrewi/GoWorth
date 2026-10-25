# Membership setup

The app shows Free, Premium monthly, and Lifetime. Premium and Lifetime have unlimited trips and saves. Stripe Checkout is used for test and production web/native flows; the client never receives card data.

## Configure Stripe test mode

1. Apply `supabase/migrations/20261014180000_routes_and_entitlements.sql` to the production Supabase project. This creates `user_entitlements`, monthly usage tracking, and server-enforced Free limits. A publishable Supabase key cannot apply SQL migrations.
2. In Stripe test mode, create a recurring monthly Price and a one-time lifetime Price. Copy their IDs into `STRIPE_PRICE_MONTHLY_ID` and `STRIPE_PRICE_LIFETIME_ID`.
3. Set `STRIPE_SECRET_KEY=sk_test_...`, the two Price IDs, and `STRIPE_CHECKOUT_ORIGIN` as Supabase Edge Function secrets. Set `EXPO_PUBLIC_STRIPE_ENABLED=true` in the Expo environment.
4. Deploy the three functions:

   ```bash
   npx supabase functions deploy stripe-catalog --project-ref jmguyniibuifqnegdiso
   npx supabase functions deploy stripe-checkout --project-ref jmguyniibuifqnegdiso
   npx supabase functions deploy sync-entitlement --project-ref jmguyniibuifqnegdiso
   npx supabase functions deploy stripe-subscription --project-ref jmguyniibuifqnegdiso
   ```

   Keep the default JWT verification enabled. The functions derive the account from the caller's token, create Stripe Checkout sessions, and verify active subscriptions or paid lifetime sessions server-side.

## Check before release

Use Stripe test cards such as `4242 4242 4242 4242`. Confirm a successful monthly Checkout, Lifetime Checkout from a Free account, cancellation, expiration, and switching accounts. Refresh Membership after returning from Checkout to run entitlement verification.

The app verifies purchases at account load, after Checkout, and when Restore purchases is tapped. To switch from monthly to Lifetime, cancel monthly renewal first. The paid monthly period remains active, then Lifetime can be purchased through Checkout. Revocations and refunds are reflected on the next verification; add a signed Stripe webhook before taking production payments.

Official references: [Stripe Checkout](https://docs.stripe.com/checkout/quickstart), [Stripe subscriptions](https://docs.stripe.com/billing/subscriptions/overview), and [Supabase Edge Functions](https://supabase.com/docs/guides/functions).
