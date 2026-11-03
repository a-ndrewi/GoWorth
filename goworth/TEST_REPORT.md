# Test Report

Run on 2026-11-03, macOS, Node test runner, in `goworth/`.

## Results

| Check | Command | Before audit | After fixes |
|---|---|---|---|
| TypeScript (strict) | `npx tsc --noEmit` | ✅ 0 errors | ✅ 0 errors |
| ESLint (expo config) | `npx expo lint` | ✅ 0 problems | ✅ 0 problems |
| Unit tests | `npm test` (`node --test tests/*.test.mjs`) | ✅ 91 / 91 | ✅ **98 / 98** |
| Resolved native config | `npx expo config --type introspect --json` | Camera, mic and motion strings, plus `RECORD_AUDIO`, present | Only location and photos strings; `ACCESS_BACKGROUND_LOCATION` present |
| Dependency audit | `npm audit --omit=dev` | 14 advisories (3 high, build-time) | Unchanged (see SECURITY S-10) |

No lint rules were disabled and no TypeScript settings were relaxed.

## Added
- `tests/auth-link.test.mjs` (5 tests): PKCE callback parsing. It reads the code and flow id, **never accepts fragment tokens** (the login-CSRF regression), reports expired-link errors from the query or fragment, and ignores unrelated deep links.
- `tests/release-config.test.mjs` (2 tests): guards the store-facing permission config fixed in BUG_FIXES B6 and B7, so a plugin default cannot quietly bring back unused camera or microphone prompts or drop Android background location.

## Not run, and why
| | Reason |
|---|---|
| Production builds (`eas build`) | Needs your EAS credentials and takes cloud build time. Run `npx eas-cli@latest build --profile production --platform all`. |
| On-device or simulator tests | Not run in this audit. Every BUG_FIXES item is verified by type checks, library-source reading and config introspection, not by tapping through. |
| Database tests | No local Postgres or Supabase CLI is installed, so RLS and RPCs were reviewed by reading only. |
| `expo-doctor` | Recommended next: `npx expo-doctor`. |

## Coverage of the 23 existing test files
They cover **pure logic**: catalog integrity, i18n completeness, trip date maths, day areas, city boundaries, search, reminders scheduling maths, wheel odds matching the SQL, plan-offer pricing maths, sync-error mapping, navigation guard, visa styling, weather mapping, trip-map HTML escaping.

## Gaps, by the critical flows you listed

| Flow | Automated coverage | Recommended test |
|---|---|---|
| 1. Registration / login | Link parsing only (`auth-link.test.mjs`) | Supabase local stack plus a Maestro flow: sign up → confirm via Inbucket → username gate |
| 2. Profile | None | Edge Function test (Deno) for `moderate-profile` validation, with the OpenAI call stubbed |
| 3. Discover | Catalog, search, discovery-suggestions | Component test of the swiper deck with a mocked places loader |
| 4. Swipe & favourites | None | **pgTAP:** `consume_free_allowance` allows 5 place saves a month on Free, the 6th raises, re-saving the same item does not count, and Premium is unlimited |
| 5. Trips | `trip.test.mjs`, `day-area`, `trip-navigation` | **pgTAP:** `replace_trip` archives the previous trip; `validate_trip_activity_place` rejects a place outside its day's city; companion RLS can read and update the owner's trip but not delete it |
| 6. Reviews | Feature does not exist | — |
| 7. Premium | Wheel odds, plan-offer maths | **pgTAP:** a user cannot `insert`/`update` `user_entitlements` or `store_entitlements`; the wheel cooldown holds; `effective_plan` picks lifetime over premium and the later expiry. **Deno test:** `revenuecat-sync` `storeRow()` handles lifetime (null expiry), grace period, expired and missing entitlements. |
| 8. Account deletion | None | **pgTAP:** `delete_my_account` removes rows in every user table (cascade) |

The highest-value next step is a `supabase/tests/` pgTAP suite, run with `supabase test db`. It locks in the security model, which is the part of GoWorth most expensive to get wrong.
