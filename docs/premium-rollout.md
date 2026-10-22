# Per-trip Premium and Paddle rollout

The app remains fully hosted on Cloudflare. The pricing and purchase code may be deployed with checkout and restrictions disabled until the merchant account and integration pass the launch checklist.

## Product rules

- Normal: AI itinerary for the first three saved dates per trip; manual planning on all days; manual bookings and packing. No Expenses, Chat, Locations, Events, assistant, packing suggestions or other AI tools.
- Premium: one-time payment for **one trip**, with identical features in every size band: 1–2 people USD 9; 3–6 USD 15; 7–12 USD 25. No subscription/automatic renewal.
- Organizer, children and people without accounts count. Group size is the maximum of adults+children, active named travelers and account members; these overlapping lists are not summed.
- Verified USD credit stays with the trip if ownership changes and never unlocks another trip. Capacity comes from total unadjusted completed purchases: USD 9 / 15 / 25. Upgrades charge the difference: USD 6, 10 or 16. Reducing the group does not trigger an automatic refund.
- If a group outgrows the purchased capacity, restricted features require an upgrade. Data remains saved; manual planning, bookings and packing still work. Groups over 12 have no Premium checkout option.
- Existing editing roles still apply. Location sharing is optional and can always be stopped, even after access changes.
- Normal AI dates persist in Trip.normalAiDates and never reset when dates are changed. Queued AI work checks access again before provider requests and before applying results.

## Payment implementation

`PremiumCheckout` fixes trip, buyer, environment, price ID, USD amount and target capacity on the server. Only the current owner can create a checkout. The browser receives a transaction ID and public client token; a checkout completion callback never grants access.

Paddle API requests are server-only and pinned to live or sandbox. Completed purchases require the saved intent, matching metadata, one item of quantity one, allowlisted intent price, matching USD subtotal/unit price, no discount and no recurring billing/subscription. Webhooks verify the raw-body HMAC and a five-second timestamp tolerance, then fetch the current transaction including adjustments. Current provider state makes repeated and out-of-order deliveries idempotent. No separate event grant can double-credit a transaction.

Listen at `https://tripanize.app/api/billing/webhook` for `transaction.completed`, `transaction.updated`, `transaction.canceled`, `adjustment.created`, `adjustment.updated`. A webhook failure returns a retryable error. The owner can reconcile pending and completed purchases with Check payment status, including adjustments whose notifications were missed. Signed unrelated notifications and simulations without a saved purchase are acknowledged without requesting or granting access to a payment.

One pending checkout is reused. A create request with an ambiguous network outcome stays blocked instead of creating another chargeable transaction. Use its saved checkout ID to find the transaction in Paddle custom data; reconcile it or cancel it in Paddle and mark it canceled only after verification. Never delete an uncertain intent blindly.

Approved refunds, credits and chargebacks remove that transaction's credit and block repurchase pending merchant review (including partial refunds). Adjustments whose status becomes reversed restore credit on reconciliation; a separate chargeback-reversal record still requires merchant review. This conservative policy avoids charging a customer again while an adjustment is unresolved. It does not initiate refunds or charges automatically.

The old unused PremiumEntitlement account model from draft migration 7 is retained for migration compatibility and is no longer read. Migration 8 adds the per-trip purchase table. No public mutation creates paid access.

## Cloudflare configuration

Secrets: `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`. Public token configuration: `PADDLE_CLIENT_TOKEN`. Set `PADDLE_ENVIRONMENT` to `sandbox` or `live`; the two catalogs and their payments are isolated. Configure the six one-time price IDs with fixed quantity 1 and tax excluded:

| Variable | USD amount | Use |
| --- | ---: | --- |
| PADDLE_PRICE_900 | 9 | 1–2 people |
| PADDLE_PRICE_1500 | 15 | 3–6 people |
| PADDLE_PRICE_2500 | 25 | 7–12 people |
| PADDLE_PRICE_600 | 6 | 2 → 6 people upgrade |
| PADDLE_PRICE_1000 | 10 | 6 → 12 people upgrade |
| PADDLE_PRICE_1600 | 16 | 2 → 12 people upgrade |

API key permissions: transaction read/write and adjustment read. Notification settings can be created manually, without granting notification-setting write access to the app key.

`PADDLE_CHECKOUT_ENABLED=true` additionally requires all credentials/price IDs before any payment button is usable. Keep false/unset until tested. `PLAN_ACCESS_ENABLED=true` activates restrictions; leave false/unset until live payment is verified and the existing-trip transition has been decided. These flags are intentionally independent.

## Live catalog created on 22 October 2026

Product: `pro_01m5j53xmtqvd4nts9f7tvz954`, SaaS tax category. All six prices are one-time, USD, tax excluded, quantity fixed to one. The public live price IDs are included in wrangler.jsonc; checkout and restrictions are explicitly false. The live API key (transaction read/write and adjustment read only, expires 20 January 2027), checkout token and five-event payment notification destination were created during the connection setup. Credentials are stored as encrypted Cloudflare production secrets and are not committed. The destination accepts both platform and simulation events; actual checkout remains disabled pending verification and sandbox payment testing.

## Remaining launch requirements

1. Resolve Paddle's merchant approval status and complete payout setup. The domain tripanize.app is approved and its default payment link is `https://tripanize.app/checkout`. This page loads Paddle.js for a known pending transaction and never grants Premium from the URL.
2. Public Terms, Privacy, Refund and Contact pages identify Joe-Daniel Hadchity as an individual operator in Lebanon, as confirmed by the owner. Legal links are available on the homepage, sign-up, pricing and Premium screens. Refund requests use Paddle and preserve mandatory rights; there is no unconditional money-back promise. Review the pages when features or legal obligations change.
3. Create a separate sandbox account/catalog and credentials. Configure sandbox webhook and verify initial payments, all three upgrades, duplicate notifications, canceled/failed payments, refunds/chargebacks and reconciliation using Paddle test cards. Do not use real charges for QA.
4. Configure the live key, public client token, prices and webhook signing secret as Cloudflare configuration. API keys must never be pasted into chat, repo files, browser evaluation output or logs.
5. Confirm commercial AI allowance/duration. Existing request rate limits apply; no numerical lifetime quota or unlimited-AI promise is introduced by this change. Before enabling sales, choose and implement the advertised per-trip usage allowance based on measured costs.
6. Enable checkout after testing and approval; enable Normal restrictions only when customers can upgrade. No automatic permanent founder grant is inserted.

Validation includes isolated integration tests, production build and native Durable Object/R2 migration/restart/feature checks. No test sends real email or makes an external payment.

## Public support

Store the operator's private receiving address as the encrypted production secret `SUPPORT_EMAIL`; never commit it or send it to browser props. The public `/contact` form forwards plain-text messages through the existing verified Resend sender, with the visitor's validated address as Reply-To. It sends only to the fixed operator address, has no automatic reply to arbitrary senders, and only confirms success after provider acceptance. Requests use origin checks, a bounded body, a strict schema, a honeypot, provider idempotency and atomic per-IP, per-email and global rate limits. Rate-limit keys contain keyed hashes, not raw visitor addresses. Support delivery releases the application request queue while the external provider responds; complete database operations remain serialized.

The contact form does not handle identity verification documents or payment credentials. Replies, privacy requests and refund issues must be reviewed by the operator; submitted messages cannot authorize account or payment changes. Resend acceptance is not a guarantee of inbox delivery. The setup verification does not send a real support email.

## Sandbox payment preview

Branch `paddle-sandbox` uses native Cloudflare Worker Previews, deployed with `npx wrangler preview --config dist/server/wrangler.json`. Cloudflare Builds has Preview branch builds enabled with `NODE_VERSION=22.14.0`, `npm run build` and that Preview command. It has an automatically isolated Durable Object database and the separate private `tripanize-sandbox-attachments` bucket. The preview host is `https://paddle-sandbox-tripanize.joedanielhadchity1.workers.dev`. The `previews` configuration contains only sandbox price IDs, enables Normal restrictions for entitlement testing, and requests sandbox checkout. Checkout still requires all three sandbox credentials before it can open. Production checkout and plan flags remain false.

Sandbox product: `pro_01m5jby0srz38114az53p46sv7`. The six sandbox prices match the live USD amounts, one-time billing, tax excluded and quantity fixed at one. Store the sandbox API key, public client token and webhook secret only in this specific preview, never in production or Previews Base. No production AI, email or support credentials are copied to the preview. The preview visibly identifies itself as a payment test environment.

Worker URL Preview hosting must be enabled in Cloudflare Domains for the test address to serve traffic; `preview_urls=true` records that setting in this branch. This controls preview hosting only and does not enable live payments. Keep the test preview limited to synthetic data.

On 22 October 2026, all three sandbox credentials were created and verified as encrypted secrets in this specific preview. The API key has transaction read/write and adjustment read permissions only, and expires 20 January 2027. The sandbox destination is active for platform and simulation delivery, with the same five payment and adjustment events as production. A signed `transaction.completed` simulation reached the preview and received HTTP 200 with `{"received":true}`. It had no saved purchase intent, so it did not grant access. The preview pricing page now recognizes the complete payment configuration. This verifies configuration and webhook delivery, not a completed purchase.

The live domain is approved for checkout and Apple Pay, and the live default payment link was saved as `https://tripanize.app/checkout`. The identity provider's existing verification page reports **Your profile has been verified**. After refreshing, the live Paddle dashboard still reports **Action required / Verify your identity**; merchant approval remains unresolved rather than evidence that identity documents must be submitted again. The payout form has no receiving details saved.

The owner must create a test account directly in the preview signup page; credentials are not collected in chat. Full provider checkout, upgrade and refund tests remain outstanding until that account and a synthetic trip are available. Use only test cards in the preview; do not alter production trips for QA. Production checkout and restrictions remain disabled until merchant approval and the payment flow are verified.
