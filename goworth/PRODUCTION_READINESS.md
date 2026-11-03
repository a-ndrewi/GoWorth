# Production Readiness — App Store & Google Play

✅ done · ⚠️ needs checking or partial · ❌ missing / blocks submission

## 1. Must do before submitting

| | Item | Detail |
|---|---|---|
| ❌ | Fill in the legal operator identity | `src/data/legal.ts` → `operator`, `address`, `registration` (CUI / PFA no.). Mirror the same in `legal-ro.ts`. The app shows "Operator details pending" until then. |
| ❌ | Host the privacy policy and terms at public URLs | Both stores need a URL in the listing, not only in-app text. A support URL is also required by App Store Connect. |
| ❌ | RevenueCat production setup | Create the products in App Store Connect (auto-renewable monthly and yearly in one subscription group; a non-consumable lifetime) and Play Console. Attach them to the entitlement `premium` and the **current** offering with package types MONTHLY, ANNUAL, LIFETIME. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` as EAS environment variables for the production profile. Never ship the Test Store key: the SDK crashes release builds that contain it. |
| ❌ | Deploy `revenuecat-sync` | `supabase functions deploy revenuecat-sync --no-verify-jwt`. Secrets: `REVENUECAT_SECRET_KEY`, `REVENUECAT_WEBHOOK_AUTH` (32+ random bytes), optionally `REVENUECAT_ENTITLEMENT_ID`. In RevenueCat, set the webhook to `https://<project>.supabase.co/functions/v1/revenuecat-sync` with header `Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH>`. |
| ❌ | `moderate-profile` secret | `OPENAI_API_KEY`. Without it, nobody can set a name or username, and the username gate blocks the app. |
| ❌ | `contact-support` secrets | `RESEND_API_KEY`, `SUPPORT_EMAIL`, `SUPPORT_FROM_EMAIL` on a verified domain. The defaults are Resend test addresses. |
| ⚠️ | Apply all migrations to production | `supabase db push`. The four newest (`store_purchases`, `visa_passport`, `trip_companions`, `username_case_insensitive`) are untracked in git, so commit them. `username_case_insensitive` **fails if two usernames differ only by case**; check first with `select lower(username), count(*) from profiles group by 1 having count(*) > 1;`. |
| ❌ | Crash reporting | Add `@sentry/react-native` via `npx expo install` with its config plugin and source-map upload in EAS. |
| ❌ | Supabase Auth production settings | Custom SMTP (the built-in sender is rate-limited to a few emails an hour, so sign-up confirmations will fail at launch). Redirect allow-list must include `goworth://**` (see below). Turn on CAPTCHA and leaked-password protection, and set email templates. |
| ❌ | Redirect allow-list for PKCE links | Supabase → Authentication → URL Configuration: add the bridge page, `https://a-ndrewi.github.io/goworth-website/auth/**`, and deploy the site so the page exists. Add `exp://**` only for Expo Go. Links now end in `?code=…&sb_flow_id=…`, which an exact `goworth://auth` entry may not match. For development, also add `exp://**`. Email templates can stay on `{{ .ConfirmationURL }}`. |
| ❌ | Background-location disclosure screen | UX-1. Required by Play when `ACCESS_BACKGROUND_LOCATION` is declared (added in BUG_FIXES B7). |

## 2. App Store (iOS)

| | Item | Detail |
|---|---|---|
| ✅ | Bundle id | `com.andrewi.goworth` |
| ✅ | Export compliance | `ITSAppUsesNonExemptEncryption: false` |
| ✅ | Permission strings | Location (when in use / always) and photo library only, in GoWorth's wording (B6). Verified with `expo config --type introspect`. |
| ✅ | Account deletion in app | Profile → Legal & privacy → Delete account (guideline 5.1.1(v)), now with a note that store subscriptions continue (B5). |
| ✅ | Restore purchases | Present on the paywall (3.1.1). |
| ✅ | Subscription disclosure | Price, period, auto-renew and cancel instructions on the paywall, and Terms, Privacy and Premium-rules links on the membership screen (`membership.tsx`). ⚠️ The App Store description also needs a Terms of Use (EULA) link (3.1.2). If the paywall card is shown anywhere other than the membership screen, check that those links appear there too. |
| ⚠️ | Daily Premium wheel | Free to play, odds shown and enforced server-side. App Review sometimes asks about "chance-based" rewards (5.3). Keep the odds sheet visible and state in review notes that no purchase is needed and prizes have no cash value. |
| ⚠️ | Privacy manifest | `ios/GoWorth/PrivacyInfo.xcprivacy` is generated with 3 required-reason API entries. Fill App Store Connect privacy labels: email, user ID, name, photos, coarse and precise location, purchase history, product interaction (saves), and the data in support messages. None are used for tracking. |
| ⚠️ | Sign in with Apple | Not required: email and password only, no third-party login (4.8). |
| ⚠️ | Review account | Give App Review a demo account **with a username already set**, plus TestFlight sandbox access for the paywall. |
| ⚠️ | `NSLocalNetworkUsageDescription` (dev-client) | Confirm it is absent from the production `.ipa`. |
| ⚠️ | Widget | `expo-widgets` TripWidget: test on a device and check the App Group entitlement is in the provisioning profile. |
| ❌ | Screenshots (6.7", 6.5", 5.5"; iPad only if `supportsTablet`), description, keywords, age rating questionnaire, support URL | Store listing. |

## 3. Google Play (Android)

| | Item | Detail |
|---|---|---|
| ✅ | Package | `com.andrewi.goworth`; adaptive and monochrome icons configured |
| ✅ | Unused `RECORD_AUDIO` removed | B6 |
| ⚠️ | `ACCESS_BACKGROUND_LOCATION` | Added so nearby suggestions work (B7). Play Console → App content → **Sensitive permissions** declaration plus a short video, **and** the in-app prominent disclosure (UX-1). Without both, the build is rejected. Alternative: revert B7 and hide the Nearby toggle on Android for v1. |
| ⚠️ | `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) | Added by dependencies; harmless on modern Android, but check that the Data safety form matches. |
| ❌ | Data safety form | Mirror the iOS privacy labels. Data encrypted in transit: yes. Deletion request: yes, in app. |
| ❌ | Target API level | Check that the SDK 58 template targets the current required API level. |
| ❌ | Play Billing | Products in Play Console with base plans (monthly, yearly) and one in-app product (lifetime); a service-account JSON linked in RevenueCat. |
| ❌ | Closed testing track | New personal developer accounts must run a closed test with 12+ testers for 14 days before production access. |

## 4. Build and release

| | Item | Detail |
|---|---|---|
| ✅ | EAS profiles | development, preview, production (`autoIncrement`, remote app version) |
| ⚠️ | `eas.json` submit | `submit.production` is empty. Add `ios.ascAppId`, `appleTeamId`, and `android.serviceAccountKeyPath`/`track`. |
| ⚠️ | Prebuild | `ios/` and `android/` are generated and stale (Oct 25/28). Use `eas build`, or `npx expo prebuild --clean` before local release builds, so B6 and B7 apply. |
| ❌ | OTA updates | `expo-updates` is not installed. Optional, but it gives a hot-fix path after launch. |
| ⚠️ | Commit the work | The whole feature branch (purchases, passport, companions, 4 migrations, revenuecat-sync) is uncommitted. Commit it before building. |
| ✅ | No web app | `platforms: ["ios", "android"]` in `app.json`; web code, scripts and the old `dist/` export removed. |
| ✅ | Email confirmation opens the app | Done: Supabase → bridge page on the presentation site → `goworth://auth` → the app signs in. Opened on a computer, the page says the email is confirmed, and the phone app signs in when you return to it. **Later, optional:** with a custom domain, add Universal Links and App Links (`apple-app-site-association` and `assetlinks.json`, which need the Apple Team ID and the Android signing SHA-256) so the link opens the app without the page. A GitHub Pages project site cannot serve them, because they must sit at the domain root. |

## 5. Pre-submission smoke test (on a real device per platform)
1. Sign up, open the email link (it returns to the app), the username gate, then preferences.
2. Sign out and in; reset password from the email link.
3. Swipe and save five places on Free; the sixth shows the limit and the paywall.
4. Plan a trip, add activities and an expense, edit dates, finish it; it appears in the journal.
5. Invite a second account, accept, edit together, leave.
6. Buy monthly in sandbox; the plan updates; Restore on a second device; cancel in store settings; the webhook downgrades it.
7. Spin the wheel; the cooldown holds after an app restart.
8. Turn on notifications and Nearby (Android disclosure); background the app; move about 2 km.
9. Go offline as Premium; the trip opens read-only; sign out offline (B1) leaves no data.
10. Delete the account; the avatar is gone from Storage (B2); signing in fails.
