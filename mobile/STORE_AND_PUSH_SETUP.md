# Store billing and push notifications: setup checklist

The code is ready. Purchases and push stay switched off until these accounts and secrets exist.
Private keys are **server secrets only** (Cloudflare `wrangler secret put`), never `EXPO_PUBLIC_` variables.

## 1. Accounts

| Account | Cost | Needed for |
| --- | --- | --- |
| Google Play Console (developer account) | $25 once | Publishing on Android, Play Billing |
| Apple Developer Program | $99 / year | Publishing on iPhone, App Store purchases, push on iOS |
| Firebase project (free) | free | Android push delivery (FCM) |
| Expo account `tripanizeapp` (already exists) | free tier | Builds and Expo push service |

## 2. Product to create in both stores

Create one **consumable** in-app product:

- Product ID: `tripanize_premium_trip` (a different ID must also be set as `STORE_PRODUCT_ID`)
- Price: $14.99 (US tier), or $15 where the store allows it
- Name: "Premium for one trip"

Play Console: *Monetize → Products → In-app products*. App Store Connect: *Your app → In-App Purchases → Consumable*.
The app must be uploaded at least once (internal testing track / TestFlight) before products can be bought.

## 3. Push notifications

**Android (FCM)**
1. In Firebase, add an Android app with the package `app.tripanize.mobile`. Download `google-services.json`.
2. `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret` (the app config only reads it when it is set).
3. Firebase *Project settings → Service accounts → Generate new private key*, then `eas credentials` → Android → *Google Service Account Key for Push Notifications (FCM V1)* → upload it.

**iOS (APNs)**
- `eas credentials` → iOS → *Push Notifications: Manage your Apple Push Notifications Key* → let EAS create one.

**Server (optional)**
- If you turn on *Enhanced push security* in Expo, also set `EXPO_ACCESS_TOKEN` as a Cloudflare secret.

## 4. Store billing server credentials (Cloudflare secrets)

**Google Play**
1. Google Cloud console (the project linked to Play Console): create a service account, enable the *Google Play Android Developer API*, and create a JSON key.
2. Play Console *Users and permissions*: invite the service account email with *View financial data* and *Manage orders and subscriptions*.
3. `wrangler secret put GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (paste the whole JSON).

**App Store**
1. App Store Connect *Users and Access → Integrations → In-App Purchase*: generate a key and note the Key ID and Issuer ID.
2. `wrangler secret put APPLE_IAP_KEY_ID`, `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_PRIVATE_KEY` (paste the `.p8` contents).
3. App Store Connect *App Information → App Store Server Notifications*: set both Production and Sandbox URLs to
   `https://www.tripanize.app/api/billing/app-store` and choose **Version 2**.

**Turn it on** (wrangler `vars`, or secrets):
- `STORE_BILLING_ENABLED=true`
- Optional: `STORE_PRODUCT_ID` (default `tripanize_premium_trip`), `GOOGLE_PLAY_PACKAGE` / `APPLE_BUNDLE_ID` (default `app.tripanize.mobile`)
- `STORE_ACCEPT_SANDBOX` defaults to on, because Apple reviews purchases in the sandbox. Sandbox and Play test purchases are tagged `sandbox: true` on the purchase record.

## 5. Deploy and build

1. Deploy the website and worker (`npm run deploy`). Migration 23 (push tables) runs automatically.
2. Build the app: `cd mobile && eas build --profile production --platform all` (or `--profile preview` for a test APK).
   Expo Go cannot run in-app purchases or push, so testing needs a development or preview build.
3. Test on Android with a *license tester* account (Play Console → Settings → License testing) and on iOS with a *Sandbox* account.

## How it works (for reference)

- **Purchase:** the app asks the server for an intent, then buys through Google Play / StoreKit with the intent ID inside the purchase
  (`obfuscatedProfileId` / `appAccountToken`). The server re-reads the purchase from Google or Apple, checks product, app and intent,
  and grants Premium for that trip. Unfinished purchases are retried on the next app start.
- **Refunds:** Google refunds are read from the voided purchases list every hour; Apple sends a notification and the server re-checks it with Apple.
- **Push:** chat messages (no message text), new events, new votes/decisions, people joining, shared expenses, invitations,
  the evening before departure (18:00 local) and each trip morning (from 07:00 local) with the day's first stops.
  Each person can switch every category off under *You → Notifications*.
