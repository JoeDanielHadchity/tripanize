# Deploying Roam on Railway

You'll create three things in one Railway project: a **database**, the **web app**, and a **worker** (runs AI planning in the background). About 15 minutes.

## 1. Create the project and database
1. Sign in at https://railway.app with your GitHub account.
2. **New Project → Deploy from GitHub repo →** choose this repository. Railway detects the `Dockerfile` and starts building. That first service is the **web app**.
3. In the same project: **+ New → Database → Add PostgreSQL**.

## 2. Configure the web app
Open the web service → **Variables** and add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway fills this in) |
| `BETTER_AUTH_SECRET` | a long random string, e.g. from https://generate-secret.vercel.app/32 |
| `OPENAI_API_KEY` | your key from https://platform.openai.com/api-keys |
| `OPENAI_MODEL` | `gpt-5.1` (or another model your key can use) |
| `STORAGE_DIR` | `/app/storage` |

Then **Settings → Networking → Generate Domain**. Copy the address (e.g. `https://roam-production.up.railway.app`) and add two more variables with that exact address:

| Variable | Value |
|---|---|
| `APP_URL` | `https://your-address.up.railway.app` |
| `BETTER_AUTH_URL` | `https://your-address.up.railway.app` |

Optional, for ticket uploads that survive redeploys: **Settings → Volumes → Add volume**, mount path `/app/storage`.

## 3. Add the worker
1. **+ New → GitHub Repo →** the same repository.
2. In this new service: **Settings → Deploy → Custom Start Command:** `npm run worker`
3. **Variables:** add the same `DATABASE_URL`, `BETTER_AUTH_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `APP_URL`, `BETTER_AUTH_URL`.
4. It needs no domain.

## 4. Email sign-in with Resend (recommended)
With this, people sign in by typing their email and entering a 6-digit code — no password, and no Claude account needed. It also sends invitations, password resets and event alerts.

1. Create a free account at https://resend.com.
2. **Domains → Add Domain**, enter a domain you own (e.g. `yourdomain.com`) and add the DNS records Resend shows at your domain registrar. Wait until it says **Verified**.
   *Just testing?* Skip this and use `onboarding@resend.dev` as the sender below — but Resend then only delivers to the email address you signed up to Resend with.
3. **API Keys → Create API Key** (permission: *Sending access*). Copy it (starts with `re_`).
4. Add to **both** Railway services (web and worker):

| Variable | Example |
|---|---|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `EMAIL_FROM` | `Roam <trips@yourdomain.com>` (must be on your verified domain) |

Railway redeploys automatically. Without `RESEND_API_KEY` (or an SMTP server in `SMTP_URL`), the sign-in page explains that codes can't be sent and people use a password instead.

## 5. Check it works
1. Open your Railway address → **Sign in** → type your email → **Email me a sign-in code**. Enter the code from your inbox (check spam the first time).
2. Create a trip → **Plan with AI**. The progress list should move past "Queued" within a few seconds. If it stays queued, the worker isn't running (check its logs).
3. Trip settings → **Create invitation link** → open it in a private window → sign in with a second email's code → accept.

Every push to the repository's main branch redeploys both services automatically.
