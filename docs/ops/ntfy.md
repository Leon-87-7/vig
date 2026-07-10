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
        │  operator subscription URL: https://ntfy.leondev.xyz/vig-ops
        ▼
public ntfy base URL: https://ntfy.leondev.xyz (Cloudflare Tunnel)
        │
        ▼
ntfy container :80 (vig-network)
        ▲
        │  internal publisher URL: http://ntfy:80 (Authorization: Bearer tk_...)
   VIG api / worker  ── publishes alerts on failure
```

URL roles:

- **ntfy base URL** (`NTFY_BASE_URL`) is the public origin ntfy uses for links and the web UI.
- **VIG internal publisher URL** (`NTFY_URL`) is what the API/worker post to from Docker; production should use `http://ntfy:80`, not Cloudflare.
- **operator subscription URL** is `https://ntfy.leondev.xyz/vig-ops` for phone/desktop clients.

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

The app is free. Because this instance is **private** (deny-all), you can't just
type a topic name — you point the app at your own server and sign in with the
user from step 3. Two credentials are in play, don't mix them up:

- **Username + password** (`operator` / the password you set) → goes in the
  **phone app**.
- **`tk_...` token** → goes in the **backend** (`NTFY_TOKEN` in `.env`) so VIG can
  publish. You do **not** type the token into the phone.

**Install:**

- **iOS / macOS:** App Store → "ntfy" (by Philipp Heckel).
- **Android:** Google Play → "ntfy", **or** F-Droid. Prefer the F-Droid build if
  you want delivery independent of Firebase — it holds a persistent WebSocket.

**Point it at your server (not ntfy.sh):** Settings → **Manage users** → **Add
user**:

- Service URL: `https://ntfy.leondev.xyz`
- Username: `operator` · Password: (the one from `ntfy user add`)

**Subscribe:** tap **+ / Subscribe to topic** → **Use another server** →
`https://ntfy.leondev.xyz` → topic `vig-ops`. It authenticates using the user you
just added.

**Desktop:** the web app at `https://ntfy.leondev.xyz` after logging in as that
user.

**iOS background delivery:** iOS can't hold a background WebSocket, so ntfy relays
wake-ups through its UnifiedPush proxy (message contents are not exposed to it).
This is on by default; if notifications only arrive with the app open, check
Settings → **"Delivered by the ntfy.sh server"** is enabled for the subscription.

## Publishing an alert (manual test)

Use the VIG smoke test first; it exercises the configured `NTFY_URL`, `NTFY_TOPIC`, and token handling used by API/worker alerts:

```bash
docker compose exec api python -m src.services.ntfy --message "post-deploy ntfy smoke test"
```

Outcomes are explicit: `published` means ntfy accepted the publish; `disabled`, `missing_url`, or `missing_token` means app config is incomplete; `publish_failed` means auth, HTTP, or network failed without printing the token. Run this after token rotation, compose deploys, tunnel changes, or ntfy container/volume recreation.

Manual public-path test (Cloudflare/subscription route, not the app publish path):

```bash
curl -H "Authorization: Bearer $NTFY_TOKEN" \
     -H "Title: VIG" -H "Priority: high" -H "Tags: warning" \
     -d "public path test" \
     https://ntfy.leondev.xyz/vig-ops
```

## What triggers an alert

The publisher (`src/services/ntfy.py`) is wired into these hook points. All are
best-effort (a failed publish never breaks the path it reports on) and throttled
where they can fire in a loop, so a sustained fault pings once per window:

| Signal                                             | Source                          | Priority | Throttle |
| -------------------------------------------------- | ------------------------------- | -------- | -------- |
| Worker dequeue loop erroring — jobs not draining   | `worker.loop`                   | max      | 5 min    |
| Orphaned jobs recovered after an unclean restart   | `worker.reap_stale_jobs`        | high     | boot     |
| Processor crash (video/article/repo/doc/prd/…)     | `worker._alert_operator`        | high     | 10 min/kind |
| Telegram webhook registration failed (bot is deaf) | `main._register_webhook`        | max      | —        |
| Health check degraded (DB / Redis / worker down)   | `health.check`                  | high     | 5 min    |
| Queue backlog over threshold                       | `health.queue_depth_watchdog`   | high     | 10 min   |

**Health check & watchdog.** `GET /health` probes DB, Redis, and worker liveness
on every hit and returns HTTP **200** always (the keep-warm monitor in
`keep-warm.md` treats 200 as "API serving"); the JSON body carries per-component
status and `queue_depth`, and a degraded result fires the alert above. A
scheduled backstop (`health.scheduled_check`, every `HEALTH_CHECK_INTERVAL_MINUTES`)
runs the same probe + the queue watchdog in the api process, so a worker that
dies overnight is caught even with no external ping. Worker liveness is a Redis
heartbeat (`worker:heartbeat`) the worker writes every
`WORKER_HEARTBEAT_INTERVAL_SECONDS` on its own task (so a long job doesn't look
like death); the key carries a TTL and is considered stale past
`WORKER_HEARTBEAT_MAX_AGE_SECONDS`.

## Config reference

### Server (compose env vars)

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

### Publisher + alerting (VIG `.env`)

| Var                                  | Default          | Purpose                                                      |
| ------------------------------------ | ---------------- | ------------------------------------------------------------ |
| `NTFY_URL`                           | _(unset)_        | VIG internal publisher URL; use `http://ntfy:80` in Docker. Unset ⇒ no-op. |
| `NTFY_TOPIC`                         | `vig-ops`        | Topic alerts are published to.                               |
| `NTFY_TOKEN`                         | _(unset)_        | `tk_...` bearer token. Unset ⇒ alerting no-ops.              |
| `QUEUE_DEPTH_ALERT_THRESHOLD`        | `50`             | Backlog size that trips the queue watchdog.                  |
| `HEALTH_CHECK_INTERVAL_MINUTES`      | `5`              | Cadence of the scheduled backstop health check.              |
| `WORKER_HEARTBEAT_INTERVAL_SECONDS`  | `15`             | How often the worker writes its heartbeat.                   |
| `WORKER_HEARTBEAT_MAX_AGE_SECONDS`   | `90`             | Age past which the worker is judged down.                    |

Both `NTFY_URL` and `NTFY_TOKEN` must be set for anything to publish — otherwise every hook point no-ops. `/health` reports the non-secret alerting status (`configured`, `disabled`, `missing_url`, or `missing_token`) so production misconfiguration is visible without making ntfy a product dependency.

## Post-deploy verification checklist

Run in order after token rotation, compose redeploys, ntfy volume recreation, or tunnel hostname changes:

1. **Container health:** `docker compose ps ntfy` should show healthy; `docker compose exec ntfy wget -qO- http://localhost:80/v1/health` should contain `"healthy":true`.
2. **Token/user exists:** `docker compose exec ntfy ntfy user list` and `docker compose exec ntfy ntfy token list operator` should show the expected account/token metadata, never the app secret in docs or logs. Auth failures here usually surface as 401/403.
3. **App env:** `docker compose exec api python - <<'PY'
from src.services import ntfy
print(ntfy.diagnostics())
PY` should report `configured`, topic `vig-ops`, and `token_configured: True`. `missing_url`/`missing_token` is app config, not ntfy downtime.
4. **Internal publish:** run `docker compose exec api python -m src.services.ntfy --message "post-deploy ntfy smoke test"`. `published` proves VIG-to-ntfy over `http://ntfy:80`; `publish_failed` points to Docker DNS/network, ntfy auth, or ntfy service health.
5. **Public subscription:** open `https://ntfy.leondev.xyz` or curl the public-path example above. Failure here with internal publish passing points to Cloudflare/tunnel/hostname, not app config.
6. **Device receipt:** confirm the subscribed phone/desktop receives the smoke-test alert on `https://ntfy.leondev.xyz/vig-ops`. If public web works but device does not, inspect app login/subscription or mobile notification settings.

## Startup alert readiness

The API and worker log a non-secret `ntfy_status` at startup. Startup alerts use
the same internal publisher URL (`http://ntfy:80` in Docker) and a short
best-effort retry path for webhook-registration failures, so alerts have a chance
to land if ntfy becomes ready shortly after the API. If ntfy is still unavailable,
the API continues serving and the webhook failure remains visible in normal logs.
Compose starts ntfy before the API/worker without making ntfy a hard product
dependency; if ntfy is down, app behavior continues and alerting reports as
`disabled`, `missing_url`, `missing_token`, or `publish_failed`.
