# Tripanize mobile

The first native milestone uses Expo SDK 57, React Native, and Expo Router. iOS and Android share native screens, not a website WebView. The Cloudflare app remains the single backend and database.

## Full trip workspace (0.2)

Native screens now cover trip drafts and Standard/Premium selection, guided details and food questions, AI planning jobs and reviewed application, manual itinerary editing, day selection and Plan A/B, stop alternatives, itinerary history/restore, numbered destination research, restaurant suggestions, linked events/bookings, automatic discovery settings, expense budgets and projections, splitting/settlements, receipt attachments and reviewed scanning, chat, optional foreground location, personal/shared packing, prep tasks, voting, invitations/roles, account preferences, support, PDF/JSON exports and account deletion.

The app renders a typed JSON presentation contract with React Native controls. No WebView is used. Operation names have an explicit server allowlist; every operation calls the existing website service, including membership, Premium, version, rate-limit and audit checks. Client-selected plan/role fields do not grant access. All mobile API responses and errors are private/no-store. Only trusted branded native or same-origin browser writes are accepted. Private file downloads use the same signed session and membership checks.

The owner also has native administrator screens with the existing dedicated email-code unlock: trials, users/trips, payments, AI controls, support, announcements, health and activity. Normal mode never removes permanent Premium. Switching from Normal back to Admin requires a fresh admin code, as on the website.

Appearance starts Light on a fresh app launch. The user can select Dark or System in Account. A selected itinerary can be saved read-only on the device for up to 30 days, opened from the sign-in screen even offline, and removed explicitly or on sign-out. It contains no expense ledger, receipt files, chat messages, GPS points or booking confirmation references. Downloads created for the share sheet are temporary. Explicitly saved/shared copies in other apps remain under the user's control.

Location is off by default, requests foreground permission on the user's action, and stops on screen blur or app background. Server leases expire after two minutes. The client does not request background location. Camera/photo/file access is requested only when attaching receipts or booking documents. Receipt scanning only fills a draft; the user must save the payment.

## Remaining release gates — do not call this store-ready

- Native Apple/Google purchases have **not** been integrated or enabled. The Premium screen clearly states this; it never redirects a native buyer to web checkout. Existing server-verified purchases, trials and company access work. Store products, server purchase verification and refund/revocation handling must be implemented and tested before a public paid release. The $15 website checkout and all payment settings remain unchanged.
- Notifications have the existing in-app inbox and email alerts. OS push delivery and APNs/FCM credentials still need implementation/setup; no claim of background phone push is made.
- Universal Links/App Links still require the actual Apple team and Android signing identities.
- Expo CLI must be authenticated, Apple membership/signing verified, and the new binaries built. Existing older Android artifacts do not contain these changes. JavaScript export is not an APK/IPA or physical-device test.
- Test the actual iPhone/Android build: keyboard/safe areas, photo/PDF pickers, camera permissions, signed-in downloads/share sheet, location permission/blur/background behavior, offline restart, screen readers and complete Standard/Premium journeys. Browser/device visual testing has not been performed by this change.
- Finish store listings, privacy/data-safety declarations, billing agreements, Android required testing and App Review. This app has not been submitted or published to either store.

## Run locally

```sh
cd mobile
npm ci
npm start
```

SDK 57 is deliberately used for current Expo Go compatibility. Native production testing still requires signed device builds. `app.tripanize.mobile` is the proposed iOS bundle identifier and Android application ID; `tripanize` is the URL scheme. Verified iOS Universal Links / Android App Links require the eventual store signing identities and are not enabled yet.

The default native API origin is `https://www.tripanize.app`. Set the public `EXPO_PUBLIC_API_URL` environment variable to use a local backend on a device-reachable address. It is an origin, never a secret. Do not put private API keys in any `EXPO_PUBLIC_` variable. Web preview uses its own origin to share the existing website session and does not require permissive CORS.

## Validate

```sh
npm run typecheck
npm run lint
EXPO_OFFLINE=1 npm run export
```

The export checks JavaScript/native dependency bundling for iOS, Android, and web. It does not produce an installable APK/IPA or replace physical-device QA.

From the repository root, `npm test` includes mobile membership, suspended-user, plan expiry, daily itinerary, and private-research checks. `npm run test:cloudflare` includes actual native-style authentication headers, the mobile HTTP API, unauthorized-origin rejection, stale-session recovery, and SPA deep-link fallback.

## Browser review

The main site's build creates `/mobile-preview/` from the very same React Native screens. It uses the real signed-in account and authenticated mobile API. Preview output is generated and ignored by Git. The SPA fallback is scoped to `/mobile-preview/`; existing web routes and APIs keep their normal routing. Search engines are told not to index this preview.

## Signed builds

This app is linked to the owner's `tripanizeapp` Expo organization and project `dac6638c-94ea-4d44-9edb-3bebf71da3df`. Finish the Expo CLI device login before starting a cloud build. The repository-root `.easignore` limits uploads to the mobile client and its shared JSON contracts; backend code, local environment files, signing files, caches, and dependencies are excluded.

```sh
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

`preview` produces an internally distributed Android APK and an iOS build for registered devices. iOS signing needs an Apple Developer membership. Production signing, Play Console/App Store Connect identities, payment agreements, store listings, privacy declarations, native billing validation, and required closed testing must be completed before public release. Use the prepared `production` EAS profile for store builds after those steps are ready.
