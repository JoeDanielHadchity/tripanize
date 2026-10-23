# Guided trip setup and flat Premium

Tripanize remains entirely on Cloudflare, with GitHub source and live Paddle checkout enabled after merchant approval on 23 October 2026.

## Current product rules

- Normal is free: AI planning for the first **two saved dates** per trip, manual itinerary editing on every day, manual bookings and manual packing. No expenses, group chat, member locations, event discovery, assistant, packing AI or other additional trip AI tools. Pre-trip destination discovery is a separate free entry experience for signed-in travelers.
- Premium is **USD 15 per trip, for any group size**, with tax disclosed by Paddle before payment. No subscription, renewal or extra charge for adding travelers. A verified purchase belongs to that trip and survives an organizer transfer.
- Earlier verified base purchases of USD 9, 15 or 25 retain Premium for the same trip without a group-size limit. An upgrade-difference payment alone does not grant access if its underlying base purchase has been refunded. Refunded/disputed payments are excluded and repurchase is blocked for review.
- One organizer assigns editors and viewers. Existing server permissions remain in force. Personal packing remains private; sharing location is optional and always stoppable.
- The two Normal AI dates persist across date changes. Existing three-date allowances are capped to two on read. All queued AI work rechecks access before generation and application.

## Guided setup

1. `/trips` and `/trips/new` offer two tabs: a known destination continues the existing named-draft flow; destination discovery asks preferences first, then offers five places. Choosing a recommendation creates an unpaid draft with those answers and opens the same plan comparison.
2. `/trips/:id/premium` compares Normal and Premium in a benefits table, with a free Normal choice and a single USD 15 Premium checkout.
3. Normal goes straight to trip details. Premium goes to details only after server-verified payment; the browser callback never grants access. Existing paid trips are opened without rebuilding or discarding their saved plans.
4. Destination, dates, travelers, preferences and other details are saved before questions. Premium generates tailored multiple-choice questions in the background; Normal uses the standard set without a model call. The screen labels its source honestly and can retry tailored questions.
5. Submitting the answers automatically starts generation. Premium researches events and booking links first, then sends researched events and answers to itinerary generation. Normal only drafts two allowed days.
6. The completed draft creates a separate durable finishing job in the same transaction. It applies the itinerary with a restorable version, links matching researched events, and prepares custom Premium packing using weather/climate, season, destinations, customs, event context and traveler preferences. A saved template seeds each member's private list without another AI call.
7. The UI polls progress and opens the full trip when complete. State survives navigation/restart. Retrying interrupted packing does not regenerate or reapply the itinerary. Manual packing items, checkmarks and dismissed suggestions remain respected.

Migration 10 adds onboarding stage/plan/job fields, the packing template and an event-removal snapshot. Existing trips default to COMPLETE and are not forced through setup. Runtime migration is numbered, preserves records and checks columns before replay. Migration 9's old feature selection field is retained for compatibility but is no longer the plan-selection experience.

## Destination discovery

The signed-in dashboard places “I know where I’m going” and “Let me help you choose” above existing trips. The latter uses three short steps: departure city, dates/month/flexible timing, length and group; interests, climate and pace; per-person whole-trip USD budget, travel-time tolerance, crowds and optional constraints. Exact dates determine actual trip length; flexible dates stay unset until the traveler confirms them during trip setup.

Each authenticated account may complete five sets per rolling day; failed searches do not consume the allowance. An active search is reused rather than duplicated. Migration 11 adds private user-owned `DestinationSearch` records; Cloudflare durable alarms process them using the existing server-side AI integration and web search. The queue and results survive navigation or restart, and long external calls release the application database lock. The UI polls an authenticated, uncached endpoint; another account cannot read or choose from the search.

The structured output requires exactly five distinct places. Responses API parsing uses final-answer messages and excludes search-progress commentary; the SDK concatenated output_text field is not treated as a JSON document. Real-SDK tests simulate commentary, tools and a structured final answer at the HTTP boundary. Destination research has a bounded 16,000-token response budget including reasoning, and operational logs contain error metadata rather than prompts or response bodies. Each explains preference fit, recommended timing, weather type, season, experiences, budget feasibility, travel and a tradeoff. Source links must be HTTPS URLs actually returned by search. Unverified or long-range forecasts are suppressed rather than presented as current forecasts. Seasonal conditions are labeled separately. Flights, fares, visas, event dates and availability are never represented as guarantees.

Choosing an idea atomically creates one draft for that search and carries over the destination, country, known dates, travelers, pace, interests, constraints and budget. The group budget is the per-person answer multiplied by group size. Duplicate selection resumes the saved trip. This never grants Premium, creates a checkout, charges money or generates an itinerary; existing plan choice, verified payment and guided setup follow unchanged. Failed searches show an honest error and can be retried with reviewed answers.

Integration checks cover ownership, validation, the five-result contract, source sanitization, forecast labeling, duplicate search/selection, budget/timing carryover, rate limits and failure recovery. Native Cloudflare tests exercise destination generation after restart and continuation to plan choice with injected responses, without external API calls.

## Events and bookings

Discovered events supply the suggested booking section through canonical event IDs and official links, without claiming anything is booked. When an event is removed, its suggested/linked booking disappears from the booking screen and its itinerary projection is removed. Linked booking/expense records are retained; removing an event does not cancel a reservation with an external provider. Undo restores the removed itinerary entry when the original day and booking are still valid and refuses a stale restore over another change.

## Payment configuration

The current checkout requires only `PADDLE_PRICE_1500`, a one-time USD 15 tax-exclusive price with quantity fixed to one. Its customer-facing name is Tripanize Premium — one trip, any group size. Live ID: `pri_01m5j5d0wvpvrhjmzdq1ph03z7`; sandbox ID: `pri_01m5jc1twzekxpn6y12naf7f0v`. Older price configuration and saved purchase records remain for historical verification, not new group-size offers.

Encrypted secrets remain `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN` and `PADDLE_WEBHOOK_SECRET`. Environment/catalog isolation, exact public-token validation, allowlisted Paddle hosts, manual redirects, owner-only fixed-price intents, idempotent signed webhooks, authoritative provider reconciliation, and duplicate/ambiguous checkout protection are preserved. A pending older-price checkout is blocked with a support message rather than charged a different amount silently. Never delete an uncertain intent or mark an unpaid checkout complete.

Webhook: `https://tripanize.app/api/billing/webhook`, events transaction.completed/updated/canceled and adjustment.created/updated. Default payment link: `https://tripanize.app/checkout`. The existing live transaction read/write + adjustment read key expires on 20 January 2027. Existing app and Paddle credentials are not printed or copied into source.

## Validation

Isolated integration checks cover payment-before-details, organizer-only setup, flat pricing including groups over 12, legacy paid access, two-day Normal generation, personalized packing, linked event removal/undo, and interrupted finishing retries. Native Cloudflare checks exercise storage upgrades/restart and the real durable-alarm guided Premium pipeline across a restart using injected model responses. No real card charge or live AI call is used for automated QA. Browser checks use the isolated Paddle preview; its database and R2 bucket are separate from production and production AI/email secrets are not copied there.

The existing AI request rate limits remain; no unlimited-AI promise or arbitrary lifetime quota is introduced. Monitor provider costs under the flat price.

## Public support

Store the operator's private receiving address as the encrypted production secret `SUPPORT_EMAIL`; never commit it or send it to browser props. The public `/contact` form forwards plain-text messages through the existing verified Resend sender, with the visitor's validated address as Reply-To. It sends only to the fixed operator address, has no automatic reply to arbitrary senders, and only confirms success after provider acceptance. Requests use origin checks, a bounded body, a strict schema, a honeypot, provider idempotency and atomic per-IP, per-email and global rate limits. Rate-limit keys contain keyed hashes, not raw visitor addresses. Support delivery releases the application request queue while the external provider responds; complete database operations remain serialized.

The contact form does not handle identity verification documents or payment credentials. Replies, privacy requests and refund issues must be reviewed by the operator; submitted messages cannot authorize account or payment changes. Resend acceptance is not a guarantee of inbox delivery. The setup verification does not send a real support email.
