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

Both `tripanize.app` and `www.tripanize.app` are configured as custom domains. The production Worker URL is also enabled as an alternate entry point. Authentication trusts that exact configured URL; it does not trust other Workers or branch previews. Email links continue to use the canonical `APP_URL`.

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
