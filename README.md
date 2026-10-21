# Tripanize

**A little less planning. A lot more going.**

Tripanize is a mobile-first travel workspace. Describe a trip, click **Plan with AI**, and ChatGPT (OpenAI API) drafts a realistic day-by-day itinerary from your actual inputs. You review it and accept all or some of the days. Then you edit the plan, invite companions, track bookings, split expenses, keep packing lists, and shortlist events.

## Architecture

| Layer | Choice |
|---|---|
| Frontend + server | Next.js 16 (App Router, React 19, server components and server actions), Tailwind CSS 4 |
| Database | PostgreSQL via Prisma 7 (`prisma/schema.prisma`) |
| Auth | Better Auth: passwordless 6-digit email codes (default) or email + password; DB sessions, password reset by email, rate-limited |
| AI | OpenAI Responses API, strict structured outputs (zod schema) + `web_search` tool, server-side only |
| Background jobs | `src/worker` polling worker: AI planning jobs, scheduled event discovery, notification digests. Jobs are claimed atomically, so several workers are safe |
| Weather / geocoding | Open-Meteo (no key). Live forecast for the next 14 days; beyond that, *typical* conditions (5-year average), labeled as such |
| Routing | openrouteservice if `ORS_API_KEY` is set; otherwise straight-line **estimates**, always labeled |
| Email | Resend (`RESEND_API_KEY`) or any SMTP provider (`SMTP_URL`). Used for sign-in codes, password reset, invitations and event alerts |
| Files | Private disk storage (`STORAGE_DIR`), served only through a membership-checked route |
| PDF | pdfkit with an embedded Unicode font (DejaVu) |
| Offline | Service worker + cached read-only trip snapshot (`/offline`); cleared on sign-out |

Modules live in `src/server/`: `planner/` (context, prompt, schema, checks, job runner, apply), `ai/`, `weather/`, `routing/`, `geocode/`, `events/`, `expenses/` (ledger + budget), `bookings/`, `itinerary/` (service + pure scheduling), `packing/`, `invitations/`, `notifications/`, `storage/`, `export/`, `auth/` (Better Auth config + permission matrix).

### Key guarantees

- **Permissions**: every service call checks trip membership on the server. Roles are owner / collaborator / viewer (`src/server/auth/permissions.ts`). A non-member gets "not found", so the trip's existence isn't revealed. Personal packing lists are visible only to their owner, whatever the trip role.
- **AI output is untrusted**: it is validated against a strict schema and then checked semantically (`planner/checks.ts`). The checks cover dates, overlaps with fixed items, arrival and departure, long drive days, and must-sees that are never silently dropped. They also strip "already booked" claims and unsafe links. Drafts are stored on the job and only change the itinerary when a traveler accepts them. Every apply first saves a restorable version.
- **Bookings are canonical**: a dated booking is projected into exactly one itinerary stop, which is rendered from the booking record. Undated or cancelled bookings never appear in a day.
- **Money**: integer minor units with largest-remainder allocation. Balances are kept per currency and only converted with a rate the user explicitly chose. Repayments never count as spending. Expense deletions are soft, and an audit trail is kept.
- **Concurrency**: version checks on stops, bookings, expenses, packing items and days. Each trip has a revision counter that other members' devices poll so they pick up changes.

## Running locally

```bash
cp .env.example .env              # set DATABASE_URL and BETTER_AUTH_SECRET at minimum
npm ci
npx prisma migrate deploy
npm run build && npm start        # web on :3000
npm run worker                    # background worker (separate process)
```

Or run `docker compose up --build` (Postgres + web + worker).

## Integrations to enable (all server-side env vars)

| Variable | Needed for | Without it |
|---|---|---|
| `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`, default `gpt-5.1`) | Plan with AI, swap alternatives, event discovery | These buttons are disabled with an explanation. Nothing is simulated. |
| Outbound HTTPS to `api.openai.com` | Same as above | Jobs fail with "could not reach OpenAI"; the itinerary is unchanged |
| `RESEND_API_KEY` or `SMTP_URL`, plus `EMAIL_FROM` | Sign-in codes, password reset, invitation emails, event alerts | Sign-in page says codes can't be sent and offers password sign-in; Reset page says email isn't configured; invites still work by copying the link; alerts are recorded as `not_configured`, never "sent" |
| Outbound HTTPS to `api.open-meteo.com`, `archive-api.open-meteo.com`, `geocoding-api.open-meteo.com` | Weather, packing weather reasons, destination time zones | "Weather unavailable" indicators; packing falls back to season |
| `en.wikipedia.org` | Destination images | Gradient fallback |
| `ORS_API_KEY` | Live driving/walking times | Labeled estimates |
| `{a,b,c}.tile.openstreetmap.org` (browser) | Map view tiles | Map shows pins without tiles, with a notice |
| Public `APP_URL` + `BETTER_AUTH_URL` | Invitations reachable by others | Settings warns that links only work on this machine |

## Tests

```bash
npm test                                   # unit + integration (needs Postgres; uses TEST_DATABASE_URL or roam_test)
PW_CHROMIUM_PATH=... npx playwright test   # e2e against a running server + worker
```

- `tests/unit`: split maths and rounding, percentages and amounts, three or more travelers, per-currency balances, partial and full settlements, contributions, edits and deletes, sorting and grouping, budget de-duplication, planner checks, time zones.
- `tests/integration`: membership boundaries, viewer and collaborator rights, invitations (single use, expiry, revocation, email binding, linking a planned traveler, rejoining), packing privacy and refresh, concurrent edits, booking sync, reordering, fixed-commitment protection, day regeneration and undo, unscheduled-idea exclusion, event dedupe, change detection and scheduling, AI failure without data loss, partial results.
- `tests/e2e/core-flow.spec.ts`: the full two-account flow on desktop and phone viewports.
- `tests/e2e/ai-failure.spec.ts` (`E2E_AI_UNREACHABLE=1`): the real job pipeline when OpenAI is unreachable.
- `tests/e2e/email-code.spec.ts` (`E2E_RESEND_STUB=http://localhost:4011`): code sign-in for a new and a returning user, with the app started with `RESEND_API_KEY=<anything> RESEND_API_URL=http://localhost:4011/emails` and `scripts/resend-stub.mjs` running. **That stub is a test harness only.** It checks the request Tripanize sends to Resend's API, not delivery.
- `tests/e2e/ai-review.spec.ts` (`E2E_AI_STUB=1`): the review, accept, swap and restore UI, driven by `scripts/openai-stub.mjs`. **That stub is a test harness only.** It checks Tripanize's handling of a structured response, not ChatGPT itself.

Note: in production mode Better Auth rate-limits auth endpoints (30 requests/minute per IP). The e2e suite creates several accounts from one IP, so run one Playwright project per minute (`--project=desktop`, then `--project=phone`).
