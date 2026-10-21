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
| Maintenance | An hourly Cloudflare Cron Trigger removes expired sessions and verification records |
| Domain | Cloudflare Workers custom domain configured in `wrangler.jsonc` |

The database object generates and persists its authentication signing secret on first startup. No secret is committed to Git or exposed in the browser.

Production email uses a Resend key stored as an encrypted Cloudflare secret. Email sign-in codes, password resets and invitation emails are enabled. No credentials are committed to this repository. OpenAI planning and automatic event discovery remain disconnected. The old polling-worker source is retained for that follow-up; it is not a deployed process. Adding an AI key alone does not complete that background-job migration.

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
```

`npm test` runs unit and integration tests against isolated local SQLite files. `npm run test:cloudflare` additionally exercises the real local Workers runtime: transactions, rollback, optimistic version checks, booking projection, integer-cent expense allocation, R2 uploads, PDF generation, persistence after a restart, account registration, authenticated pages and private-file access checks. It does not call OpenAI or send email.

See [DEPLOY.md](DEPLOY.md) for deployment and account requirements.

## Data integrity and permissions

Every trip service checks membership on the server. Owner, collaborator and viewer roles retain their existing permissions. Personal packing items remain private. Expenses use integer minor units and retain per-currency balances. Booking records remain the source of truth for their itinerary entries. Version checks reject stale concurrent edits, and related writes are committed or rolled back together.

SQLite stores the former PostgreSQL string-list fields as JSON arrays. The client preserves the application's string-array types without returning lazy Prisma result proxies to server actions.

The first release uses one serialized application database. This keeps cross-table transactions correct for the initial deployment, with the trade-off that dynamic requests share one queue. Plan a partitioning design and load testing before expanding to a high-traffic public service.

## Database migrations

`prisma/schema.prisma` is the model definition. The initial SQL migration is loaded by the database Durable Object on first startup. Future upgrades must include explicit numbered SQL migrations and a corresponding runtime schema-version upgrade; never reset production storage to apply a schema change. `prisma migrate` commands are local schema tools and do not update production Durable Object storage.
