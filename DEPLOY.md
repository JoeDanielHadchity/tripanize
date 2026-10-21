# Deploy Tripanize entirely on Cloudflare

## Account requirements

1. The `tripanize.app` domain must be active in the target Cloudflare account.
2. Cloudflare Workers and Pages must have access to this GitHub repository.
3. Activate Cloudflare R2 and create a **private** bucket named `tripanize-attachments`. R2 activation accepts a recurring usage-based billing agreement. Review and accept that agreement in the Cloudflare account before proceeding. Keep the bucket's public development URL and public custom domains disabled.
4. Publishing source changes requires GitHub write access. A Cloudflare-to-GitHub connection does not itself grant a separate local development session permission to push code.

## Build and deploy

In Cloudflare **Workers & Pages → Create application → Continue with GitHub**, select this repository and the branch containing the Cloudflare migration.

- Worker name: `tripanize`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
- Project root: repository root
- Node.js: 22.14 or later

The build generates Prisma's Workers client and a production vinext bundle. Wrangler creates the `TripanizeApp` SQLite-backed Durable Object namespace using the `v1` migration. R2 is bound as `ATTACHMENTS`. The custom-domain route connects `tripanize.app` to the Worker.

Alternatively, after authenticating Wrangler to the intended account:

```bash
npm ci
npm run deploy
```

The public configuration includes the canonical app URL, authentication base URL and sender name. There are no API keys in this release. The application creates its authentication signing secret inside private Durable Object storage on first startup and reuses it across restarts and deployments.

## Hosting-first scope

Available: password account registration and sign-in, manual trip planning, itinerary editing, bookings, shared expenses and balances, invitations by link, packing lists, manual events, private file uploads, JSON export and PDF export.

Not yet connected: OpenAI planning, automatic event discovery and outbound email. Before enabling those, migrate the background-job execution to a suitable Cloudflare queue/workflow and configure credentials securely. Do not start the legacy `src/worker/index.ts` polling process on another host.

## Verify production

- Open `https://tripanize.app` and confirm the homepage and static fonts load.
- Register with an email address and password, then sign out and sign back in.
- Create a manual trip and check its dates and itinerary days.
- Add a booking and verify it appears once in the itinerary.
- Add an expense and check that the shares sum exactly to the entered amount.
- Upload and download a booking attachment; confirm an unauthenticated request cannot retrieve it.
- Export JSON and PDF.
- Redeploy without resetting the Durable Object; confirm data and sessions persist.

Account billing activation and a production deployment are separate from a passing local build. Report them as complete only after verifying the Cloudflare deployment and live domain.
