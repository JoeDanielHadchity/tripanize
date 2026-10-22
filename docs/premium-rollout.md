# Normal and Premium rollout

This change prepares feature access and the comparison page. It does **not** collect payments or activate restrictions in production. `PLAN_ACCESS_ENABLED` is deliberately unset until the merchant and subscription price are selected and billing is implemented.

## Product rules

- Normal: an AI itinerary for at most the first three dates per trip; manual itinerary editing for all days; manual bookings and packing items.
- Premium: all itinerary AI tools, assistant, expenses and settlements, trip chat, optional member locations, events and suggested bookings, and packing suggestions.
- The organizer's account covers every member of trips they own. Paid collaborators do not upgrade someone else's Normal trip. Existing trip roles still govern editing.
- The first Normal AI request saves its allowed calendar dates in `Trip.normalAiDates`. Regeneration of selected days, stop alternatives, AI questions and assistant edits require Premium. Retrying a full Normal draft stays inside the same saved dates. Date changes never reset the allowance.
- Premium entitlement is server-owned. `PremiumEntitlement` has no public mutation route. Valid access requires an unrevoked record with a future `validUntil`; no profile or trip input can choose a tier.
- Expiry preserves stored data, blocks restricted service reads/writes, filters restricted JSON exports and expense receipts, and leaves manual planning, bookings and packing available. Stopping location sharing remains allowed. Existing tabs refresh their plan state through the revision poll.

## Billing still to implement before launch

1. Confirm the merchant's legal country/entity and choose an eligible payment provider. Paddle is a candidate for a software subscription; Stripe is an alternative where merchant accounts are supported. Merchant verification and payout setup belong to the account owner.
2. Confirm price, currency and billing interval. This branch assumes an organizer subscription, not a per-person or per-trip purchase. The three-day allowance is per trip.
3. Implement server-created checkout and a billing management portal. Bind checkout to the signed-in user; use an allowlisted product/price. Never grant Premium from a return URL or a browser success callback.
4. Verify webhook signatures over the raw request body, deduplicate event IDs, reject stale/out-of-order state, and reconcile with the provider. Update entitlement only after authoritative payment/subscription confirmation. Set `validUntil` to the paid-through time; scheduled cancellation keeps access through that time. Handle renewals, payment failures, pauses, cancellations, refunds/revocations and duplicate subscriptions deliberately.
5. Exercise the complete checkout/renewal/cancellation flow in the provider's sandbox. Verify a forged checkout callback or webhook cannot unlock Premium. Keep payment keys and webhook signing secrets in encrypted Cloudflare runtime secrets.
6. Decide existing-account transition/complimentary access, then enable `PLAN_ACCESS_ENABLED=true`. With no entitlement, an existing trip becomes Normal; no automatic entitlement or permanent founder exemption is inserted by this migration.

Hosting remains on Cloudflare. Hosted payment checkout is provided by the payment processor; application data and tier enforcement stay in the existing Worker, Durable Object and private R2 bucket.
