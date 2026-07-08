# Self-hosted ntfy — operator/admin alerts

ntfy is VIG's **internal** notification channel: system-error and health-drift
pings for the operator (you), delivered to your phone independent of the
user-facing Telegram bot. It is **not** a Telegram replacement — Telegram stays
the product surface (webhooks, `chat_id`, retry buttons, enrichment messages);
ntfy only fires when something the operator needs to know about breaks.

Runs as the `ntfy` service in `docker-compose.yml`, on `vig-network`, behind the
existing Cloudflare Tunnel. No host port is opened.

## Architecture

```
phone / desktop (ntfy app)
        │  subscribe ntfy.leondev.xyz/vig-ops  (with token)
        ▼
ntfy.leondev.xyz (Cloudflare Tunnel) ──> ntfy container :80 (vig-network)
        ▲
        │  POST /vig-ops  (Authorization: Bearer tk_...)
   VIG api / worker  ── publishes alerts on failure
```

The instance is **private**: `NTFY_AUTH_DEFAULT_ACCESS=deny-all` means neither
publishing nor subscribing works without an access token. This is real auth, not
the topic-name obscurity you'd get on the public `ntfy.sh`.

## One-time setup

### 1. Add the public hostname to the tunnel

The tunnel is a **token tunnel** (Option A in `vercel-deploy.md`), so routes live
in the Cloudflare dashboard, not a local config file.

- Zero Trust → Networks → Tunnels → `vig-api` → **Public Hostname** → Add:
  - Hostname: `ntfy.leondev.xyz`
  - Service: `http://ntfy:80`
- Leave **Cloudflare Access off** this hostname — the ntfy token is the gate, and
  Access would block the app's server-side publish calls (same reasoning as
  `api.leondev.xyz` in `vercel-deploy.md`).

DNS self-registers once the hostname is saved.

### 2. Bring the service up

```bash
docker compose up -d ntfy
docker compose up -d cloudflared   # if not already running
```

Verify: `curl https://ntfy.leondev.xyz/v1/health` → `{"healthy":true}`.

### 3. Create a user and an access token

`deny-all` means you must provision access explicitly. Run inside the container:

```bash
# an admin user (interactive password prompt)
docker compose exec ntfy ntfy user add --role=admin operator

# a token this user (and the VIG app) publishes/subscribes with
docker compose exec ntfy ntfy token add operator
# → tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Put the token in `.env`:

```dotenv
NTFY_TOKEN=tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Admin role can read/write every topic. To scope tighter, create a non-admin user
and grant only `vig-ops`:

```bash
docker compose exec ntfy ntfy user add publisher
docker compose exec ntfy ntfy access publisher vig-ops rw
```

### 4. Subscribe from your phone

Install the ntfy app (iOS/Android) → Add subscription → use a **self-hosted
server**: `https://ntfy.leondev.xyz`, topic `vig-ops`, and paste the token under
the subscription's settings. Desktop: the web app at `https://ntfy.leondev.xyz`
after logging in as the user from step 3.

## Publishing an alert (manual test)

```bash
curl -H "Authorization: Bearer $NTFY_TOKEN" \
     -H "Title: VIG" -H "Priority: high" -H "Tags: warning" \
     -d "worker error loop — jobs not draining" \
     https://ntfy.leondev.xyz/vig-ops
```

The VIG app will do the same over `httpx` once the alert module
(`src/services/ntfy.py`) is wired into the worker/health hook points.

## Config reference (compose env vars)

| Var                         | Value                        | Why                                              |
| --------------------------- | ---------------------------- | ------------------------------------------------ |
| `NTFY_BASE_URL`             | `https://ntfy.leondev.xyz`   | Correct links + web app origin behind the proxy  |
| `NTFY_BEHIND_PROXY`         | `true`                       | Trust `X-Forwarded-For` from Cloudflare          |
| `NTFY_AUTH_FILE`            | `/var/lib/ntfy/user.db`      | User/token store (persisted in `ntfy_lib`)       |
| `NTFY_AUTH_DEFAULT_ACCESS`  | `deny-all`                   | Private instance — token required                |
| `NTFY_CACHE_FILE`           | `/var/cache/ntfy/cache.db`   | Message cache (persisted in `ntfy_cache`)        |

Persistent volumes `ntfy_lib` (users/tokens) and `ntfy_cache` (message cache +
attachments) survive `docker compose down`. **Back up `ntfy_lib`** — losing it
means recreating every user and token.
