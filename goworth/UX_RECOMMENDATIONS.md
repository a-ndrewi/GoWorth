# UX Recommendations

Based on reading the screens and components; **not** checked on a device or in screenshots. Treat layout and visual points as things to confirm on a phone. GoWorth's visual identity (blue `#2457E6`, the gold Premium tone, rounded 18–28 pt cards, large bold titles) is applied consistently through `components/goworth/ui.tsx` and `themedStyles`. Nothing here calls for a redesign.

## What already works well
- One design system (`Button`, `Copy`, `ListGroup`, `Sheet`, `Field`) used everywhere, with a light/dark palette and a themed splash.
- English and Romanian throughout, including notifications and paywall copy.
- Loading, empty and error states exist for account load (with retry and sign-out), offline mode (banner with retry), paywall loading, sync errors (timed message) and free-limit errors.
- The paywall is honest. Prices come from the store, there is a trial timeline with a reminder, renewal terms, Restore and Manage. Yearly savings are rounded down.
- Accessibility: roles, states and labels on the paywall radios, switches and icon buttons, plus `accessibilityLiveRegion` on paywall messages.

## Recommendations (priority order)

| # | What | Why | Effort |
|---|---|---|---|
| UX-1 | **Show a prominent disclosure before asking for "Always" location.** One screen: what is collected, why, and that it runs while the app is closed, with Continue and Not now. Only Continue triggers `syncNearbyWatch(true, …, ask=true)`. | Required by Google Play's background-location policy, and it raises iOS grant rates. Today the explanation appears after the toggle. | S |
| UX-2 | **Make the username gate degrade gracefully.** If `moderate-profile` is down or `OPENAI_API_KEY` is missing, new users are stuck on the full-screen gate. Allow "Skip for now" with a reminder in Profile. | Avoids a hard block at the worst moment, the first launch. | S |
| UX-3 | **Explain free limits before they hit.** Show "3 of 5 saves left this month" on the swipe deck and planner (the planner already shows trips left). The server error is clear, but arriving at it mid-swipe feels like a failure. | Fewer surprised users, and a natural Premium upsell. | S |
| UX-4 | **Saving to "Saved" needs optimistic feedback.** Toggles wait for the network round-trip before the heart fills (`toggleSaved` updates state only after `persist`). Fill it at once, and revert with the error if the write fails. | Feels instant on slow networks. | S |
| UX-5 | **Make the read-only offline mode clearer.** Offline edits fail with a generic sync error. Disable edit controls while `offlineSince` is set and say why. | Prevents typing into something that cannot save. | S |
| UX-6 | **Link from the Premium ending reminder to a "keep Premium" offer,** pre-selecting the plan closest to what they had. | Conversion at the moment of highest intent. | S |
| UX-7 | **Data export as a file, not share-sheet text.** `Share.share({ message })` puts the whole JSON in the share text, which is unreadable in Mail and Messages. Write it to a file with `expo-file-system` and share the file. Also include visas and companions. | GDPR portability that people can actually use. | S |
| UX-8 | **Add a second confirmation path for deletion that does not need typing "DELETE"** with `autoCapitalize`. Some Android keyboards ignore it and users type "delete". Accept a case-insensitive match. | Small friction fix. | XS |
| UX-9 | **Companions: show who changed what.** Shared trips refresh on focus, but edits are silent. A small "Ana added Louvre to Day 2" line keeps co-planning legible. | Social stickiness. | M |
| UX-10 | **Remove the debug `console.warn` venue logging** in `discovery-swiper.tsx` before release (dev-only, but it clutters logs during QA). | Hygiene. | XS |

## Check on a device before release
- Safe areas: the custom `BottomNav` and `ItineraryNav` sit in `SafeAreaView edges={["bottom"]}`. Check that the keyboard does not cover fields in `Sheet` on Android, since there is no visible `KeyboardAvoidingView` use in `Sheet`.
- Dynamic Type at the largest sizes on the paywall price column and plan rows, which use fixed font sizes.
- Contrast of the `faint` fine-print colour on the gold gradient (renewal text is 11 pt).
- Tap targets: paywall Restore and Manage links are text-only with `hitSlop={8}`; confirm they are at least 44×44 pt.
- The launch cover (`BootCover`) waits up to 6 s on slow devices. Confirm it never shows longer than the native splash would.
