# Tripanize

A mobile-first travel workspace for itineraries, bookings, shared expenses, packing, events and trip invitations.

## Cloudflare hosting

The application is configured to run entirely on Cloudflare at **https://tripanize.app**. The repository contains the deployment target; a successful local build is not evidence that a production deployment has happened.

| Component | Implementation |
| --- | --- |
| Website and server actions | React 19 and the Next.js App Router API, built with vinext for Cloudflare Workers |
| Database | Persistent SQLite storage in a Cloudflare Durable Object, accessed through Prisma 7 |
| Transactions | Application-owned Prisma driver using `DurableObjectStorage.transaction`; requests are serialized until their response body is complete |
| Accounts | Better Auth, with password accounts and email sign-in codes delivered through Resend |
| Private booking attachments | Cloudflare R2; every download checks trip membership |
| PDF export | pdf-lib, with embedded Unicode fonts loaded from static assets |
| Maintenance | An hourly Cloudflare Cron Trigger removes expired sessions/verification records and queues due Premium event searches |
| Domain | Cloudflare Workers custom domain configured in `wrangler.jsonc` |

The database object generates and persists its authentication signing secret on first startup. No secret is committed to Git or exposed in the browser.

Production email uses a Resend key stored as an encrypted Cloudflare secret. Email sign-in codes, password resets and invitation emails are enabled. No credentials are committed to this repository.

AI planning uses OpenAI Responses with strict structured output and web research. Set `OPENAI_API_KEY` as an encrypted Cloudflare runtime secret to activate it. The default model is `gpt-6.1-sol`, configurable with `OPENAI_MODEL`. Requests use low reasoning effort and at most six web tool calls per response. Native Durable Object alarms run trip drafts, stop alternatives, tailored preference questions and user-requested event searches. Long plans save a checkpoint after each five-day section and resume in a fresh alarm, including after a restart. Existing itineraries change only after an authorized traveler accepts a draft.

External AI calls run outside the application's database queue; individual background database operations still share the HTTP transaction lock. Cloudflare cron and durable alarms run automatic event discovery and opted-in event email digests, including after a restart. No separate Node polling process is required.

Guided Premium packing recovers from recognized temporary provider rate limits using at most three delayed durable retries (about one, two and four minutes, respecting a longer provider delay up to fifteen minutes). The provider cooldown and retry count survive restarts; notification/reminder/location maintenance continues during the wait. Guided packing disables nested SDK retries. Billing/quota, authentication, oversized requests and longer delays remain explicit failures. Completed itineraries are kept and are never regenerated or reapplied by packing retries. Travelers can open the saved itinerary while setup finishes.

### Automatic event discovery

Verified Premium trips with completed setup, dates and a destination search for events using their interests, questionnaire answers, accessibility/dietary needs, budget, pace, group and saved preferences. The schedule adjusts using the departure date in the trip's timezone:

| Time before departure | Searches |
| --- | --- |
| 30 days or more | Mondays |
| 15–29 days | Mondays and Thursdays |
| 14 days or less, through the final trip day | Daily |

Searches are due around 09:00 local trip time and picked up by the hourly cron. An eligible trip with no successful search gets an initial search on the next maintenance tick. Future slots are recalculated across cadence boundaries and daylight-saving changes. Failed scheduled searches retry after six hours. Travelers can pause automatic searches in Events & bookings; searches stop after the trip ends. Migration 12 enables previously untouched defaults while preserving explicitly saved discovery settings.

New matches and meaningful changes create in-app alerts for every current trip member, including the organizer. Known, hidden, past, cancelled and sold-out matches do not generate repeated new-event alerts. Event records and alerts commit together. Results link to Events & bookings; they do not automatically modify the itinerary or reserve tickets.

Event emails remain opt-in for verified addresses, respect each member's event categories and immediate/daily preference, and use a durable immutable outbox with bounded retries and stable Resend idempotency keys. Daily batches coalesce per member/trip. Removed members, disabled alerts and lost Premium access cancel pending delivery. Saving event-email preferences cancels older pending batches so outdated selections cannot be sent.

Both `tripanize.app` and `www.tripanize.app` are configured as custom domains. Personal Workers subdomains are disabled; authentication trusts only the branded app domains. Branch previews use the branded tripanize.app domain. Email links continue to use the canonical `APP_URL`.

## Company access and one-trip trials

The private Cloudflare secret `COMPANY_ADMIN_EMAIL` identifies the single company account and grants all Premium features on trips the verified company account owns or joins. It does not bypass membership or editor/viewer permissions, create paid transactions, or change Paddle settings. The company dashboard at `/company` is unavailable to ordinary accounts; every trial mutation independently verifies the current database account and its verified email.

Only the company can issue or revoke email-bound trial invitations. An unused invitation expires after 14 days. A verified recipient redeems it once for one owned Normal trip or a new guided draft. The grant stays bound to that trip and its original organizer; it does not unlock another trip or create a subscription. One active invitation/trial per recipient is enforced by a unique normalized email and transactional recipient checks. The company must revoke the previous invitation/trial before issuing another. An accepted trial remains active until revoked, independently of the invitation acceptance deadline. Revocation retains saved trip content and does not remove a verified paid purchase.

Invitation emails use a durable immutable outbox, stable provider idempotency keys, bounded retries within 20 hours, and native restart recovery. No email or payment is sent merely by deploying the feature. Migration 13 adds invitation storage. Startup uses the private configuration to replace existing company account, linked traveler, chat sender and historical activity display labels with “Tripanize.app”; previously queued activity emails containing the old identity are cancelled rather than rewritten under an existing idempotency key. Public policies, contact pages and trial invitations identify Tripanize.app without a personal name.

## Saved destination searches

“Let me help you choose” keeps private, numbered searches for each account. New searches begin as saved drafts with their own questionnaire answers; users can switch between searches and copy earlier answers into a new search without replacing existing results. Draft answers save automatically. Research begins only after an explicit submission and can queue independently for several searches. Each completed search retains its five ideas and its chosen trip.

Migration 14 numbers existing searches by creation order (with ID tie-breaking), preserves failed and successful history, and adds queue time for accurate daily allowance accounting. Draft creation/saving does not call AI or consume the five-per-day research allowance. Authorization, draft transitions, numbering and quota checks are enforced on the server; late draft saves cannot overwrite a submitted search. Native alarms ignore drafts and recover queued searches across restarts.

## Local development and validation

Use Node.js 22.14 or later.

```bash
npm ci
npm run build
npm run preview -- --var APP_URL:http://localhost:8787 --var BETTER_AUTH_URL:http://localhost:8787
npm run typecheck
npm test
npm run test:cloudflare
npm run test:cloudflare:ai
```

`npm test` runs unit and integration tests against isolated local SQLite files. `npm run test:cloudflare` additionally exercises the real local Workers runtime: transactions, rollback, optimistic version checks, booking projection, integer-cent expense allocation, R2 uploads, PDF generation, persistence after a restart, account registration, authenticated pages and private-file access checks. It does not call OpenAI or send email.

`npm run test:cloudflare:ai` checks native alarms, duplicate requests, responsiveness during AI waits, transaction isolation, restart checkpoints, background questions, cancellation, scheduled event discovery, duplicate event alerts and the email outbox against local generator/sender stubs. It makes no external AI requests or email deliveries.

See [DEPLOY.md](DEPLOY.md) for deployment and account requirements.

## Data integrity and permissions

Every trip service checks membership on the server. Owner, collaborator and viewer roles retain their existing permissions. Personal packing items remain private. Expenses use integer minor units and retain per-currency balances. Booking records remain the source of truth for their itinerary entries. Version checks reject stale concurrent edits, and related writes are committed or rolled back together.

SQLite stores the former PostgreSQL string-list fields as JSON arrays. The client preserves the application's string-array types without returning lazy Prisma result proxies to server actions.

The first release uses one serialized application database. This keeps cross-table transactions correct for the initial deployment, with the trade-off that dynamic requests share one queue. Plan a partitioning design and load testing before expanding to a high-traffic public service.

## Database migrations

`prisma/schema.prisma` is the model definition. The initial SQL migration is loaded by the database Durable Object on first startup. Future upgrades must include explicit numbered SQL migrations and a corresponding runtime schema-version upgrade; never reset production storage to apply a schema change. `prisma migrate` commands are local schema tools and do not update production Durable Object storage.

## Private administrator dashboard

The verified account selected by the existing encrypted `COMPANY_ADMIN_EMAIL` setting can open `/company` after completing authenticator verification in Account → Admin security (`/account/security`). The dashboard includes overview, searchable users/trips, environment-scoped payments, single-trip trials, AI usage/cost controls, saved contact-form requests, queue/email/webhook health, scheduled announcement banners and an administrator activity log. Every read service and mutation independently rechecks the configured identity and the live session's second-factor proof; public names cannot grant administrator access.

Migration 18 adds an administrator-only authenticator and private session proof fields. Existing sessions have no second-factor proof and immediately lose dashboard access until setup/verification. Initial setup requires a fresh email-code sign-in within 10 minutes, followed by scanning a locally rendered QR code in an authenticator app and confirming its six-digit code. Secrets are encrypted with a domain-separated key derived from the existing Durable Object auth secret. Ten recovery codes are shown once and stored as keyed hashes. Setup/replacement signs out other sessions. Keep the authenticator and recovery codes private; never paste them into support messages or AI tools.

Admin access lasts 30 minutes per session. Normal mode, explicit locking and sign-out remove access; returning from Normal mode needs a fresh authenticator or unused recovery code. Password and email-code sign-in do not bypass this check. Codes cannot be replayed across sessions; recovery consumption and five-attempt/15-minute account lockouts are transactional. Generating replacement recovery codes requires an authenticator code; moving to another authenticator needs both fresh email proof and a recently verified existing factor. There is no email-only disable/reset endpoint. Losing both factors requires a separate manual ownership recovery process by the operator; ordinary sign-in and trip access remain available. Background maintenance/trial emails use configured identity eligibility and never gain interactive admin authority.

Migration 15 preserves existing accounts, purchases and trips while adding suspension/activity fields, trial durations, minimal provider payment summaries and administration tables. Suspension revokes sessions, removes current shared locations and is enforced by session creation, session resolution and trip permission checks. The administrator cannot suspend their own configured account. Restoration requires a fresh sign-in. Trip and payment records remain intact.

New trials default to 14 days after activation, with an administrator-selected duration or no fixed end. Accepted historical trials without an end date keep their existing access until revoked. Expiry is checked by the central trip access helper; a verified purchase continues to grant access independently. Trial creation, revocation and expiry changes are audited.

AI usage is measured from future production provider calls, including reported tokens for unsuccessful responses. No prompts, generated text, keys or session tokens are saved in the ledger. Optional platform/user daily caps reset at midnight UTC and are reserved atomically before a call; existing per-tool limits remain. No additional cap is enabled by default. Cost estimates use administrator-entered model/token/search rates at request time and clearly identify unpriced calls. Cached-input discounts, search context tokens and actual provider billing can differ; this is an estimate rather than an invoice. Background calls are attributed to a requesting user where one exists.

Payments list saved checkout intents for the active environment. A manual refresh only reads and reconciles that saved transaction with Paddle. Verified webhook handlers capture available checkout/payout/adjusted payout totals; older purchases show unavailable figures until refreshed. No subscription, charge, refund, new credential or pricing change is created by this dashboard. Signed webhook outcomes and attempts are recorded from this deployment onward; unrelated events are marked ignored.

New contact-form submissions are saved and exact retries deduplicated while retaining existing delivery/rate-limit behavior. Messages and private notes are plain text. Status updates never send an email or execute message instructions; replies open the operator's email application. Earlier emails are not imported. Announcements are plain-text drafts with explicit publication, start/end times, withdrawal and archive controls, and optimistic version checks. At most three current announcements are displayed. Administrator logs begin with this deployment and preserve administrative decisions without copying support message content or credentials.
