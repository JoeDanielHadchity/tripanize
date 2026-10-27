# Tripanize mobile

The first native milestone uses Expo SDK 57, React Native, and Expo Router. iOS and Android share native screens, not a website WebView. The Cloudflare app remains the single backend and database.

## Included in this milestone

- Existing email-code and password sign-in. Native session cookies use Expo SecureStore; browser preview sessions use the website's HttpOnly cookies.
- Signed-in Start screen with the Mont Saint-Michel and Positano destination choices.
- My trips: actual member trips, search, phase filters, destination covers, roles, and the backend's real Premium entitlement.
- Itinerary: one selected day, active Plan A/B stops, booking-derived information, restaurant alternatives, map links, and manual refresh.
- Existing numbered destination searches and their saved five-place results.
- Account details, sign-out, system light/dark appearance, and local brand fonts.

This is a read-only mobile milestone. Creating/editing trips, running new destination searches, chat, expenses, device location, push notifications, offline storage, account deletion, and native purchases are subsequent milestones. No native payment button points to web checkout. The native app is not yet submitted to either store.

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

The main site's build creates `/mobile-preview/` from the very same React Native screens. It uses the real signed-in account and read-only API. Preview output is generated and ignored by Git. The SPA fallback is scoped to `/mobile-preview/`; existing web routes and APIs keep their normal routing. Search engines are told not to index this preview.

## Signed builds

Once the owner has an Expo account, initialize this app with `npx eas-cli@latest init` and commit the assigned project ID. Do not invent a project ID or developer-team identity.

```sh
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile preview --platform ios
```

`preview` produces an internally distributed Android APK and an iOS build for registered devices. iOS signing needs an Apple Developer membership. Production signing, Play Console/App Store Connect identities, payment agreements, store listings, privacy declarations, native billing validation, and required closed testing must be completed before public release. Use the prepared `production` EAS profile for store builds after those steps are ready.
