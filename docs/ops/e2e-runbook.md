# Fullstack Dev Login E2E Runbook

This runbook verifies the local dev-login flow end to end:

- Next.js login page and `/api/*` rewrite
- FastAPI auth/session middleware
- local SQLite user row and email save
- pending approval gate
- Ops bot approval card through ngrok
- final approved user state

Use this only for local/dev testing. Do not point dev-login test traffic at the production backend.

## Prerequisites

- FastAPI dependencies installed for the backend.
- Web dependencies installed under `web/`.
- `ngrok` installed and authenticated.
- Root `.env` has the real bot tokens/secrets needed by the app.
- Root `.env.local` is ignored by git and used for local overrides.
- `web/.env.local` is ignored by git and used for local web overrides.

## Backend Local Env

In root `.env.local`:

```env
DB_PATH=./data/local-dev.db
REDIS_URL=redis://localhost:6379/0
SESSION_COOKIE_SECURE=false
DEV_LOGIN_ENABLED=true
SESSION_BACKEND=memory
OPS_WEBHOOK_URL=https://<ngrok-host>/webhook/ops
OPS_DEV_NOTIFICATIONS=true
```

`SESSION_BACKEND=memory` keeps browser auth loops local to the running backend process, so this flow does not require Redis-backed sessions.

## Web Local Env

In `web/.env.local`:

```env
API_INTERNAL_URL=http://localhost:8000
NEXT_PUBLIC_API_MOCK=0
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=TTTask_bot
```

## Start Services

1. Start ngrok in another terminal:

```powershell
ngrok http 8000
```

2. Copy the HTTPS forwarding URL from ngrok and update root `.env.local`:

```env
OPS_WEBHOOK_URL=https://<ngrok-host>/webhook/ops
```

```powershell
$ngrok = (Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels |
  Where-Object { $_.proto -eq "https" } |
  Select-Object -First 1 -ExpandProperty public_url

$line = "OPS_WEBHOOK_URL=$ngrok/webhook/ops"

if (Select-String -Path .env.local -Pattern '^OPS_WEBHOOK_URL=' -Quiet) {
  (Get-Content .env.local) -replace '^OPS_WEBHOOK_URL=.*', $line |
    Set-Content .env.local
} else {
  Add-Content .env.local $line
}
```

3. Start the backend:

```powershell
uvicorn src.main:app --reload
```

4. Start the web app:

```powershell
cd web
npm run dev
```

## Browser Flow

1. Open `http://localhost:3000/login`.
2. Click `Dev login`.
3. Confirm the app redirects to `/feed` and shows the pending approval state.
4. Enter a test email, for example:

```text
planbot@botplan.com
```

5. Confirm the Ops bot sends a Telegram approval card:

```text
New Guy
planbot@botplan.com
@unknown

[Approve] [Block]
```

6. Tap `Approve` in Telegram.
7. Confirm the Telegram card changes to the terminal state:

```text
[Approved]
```

8. Refresh the web app and confirm the user is no longer blocked by the approval gate.

## Expected API Behavior

Before approval, protected app APIs should return:

```text
403 Approval required
```

After approval:

```text
/api/auth/me -> status: approved
```

The local DB should contain the newest row for the test email with `status = approved`.

## Local Fallback

If you want to test the browser/session/email flow without Telegram callbacks, use the local-only approval fallback:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri http://localhost:3000/api/auth/dev-approve `
  -Method POST `
  -WebSession $session
```

This requires a valid `vig_session` cookie from `/api/auth/dev-login` and only works when:

```env
DEV_LOGIN_ENABLED=true
```

Use this fallback for local smoke tests. Use the ngrok/Ops bot path when specifically testing Telegram callback behavior.

## Safety Notes

- Registering `OPS_WEBHOOK_URL` to an ngrok URL repoints the real Ops bot webhook while the test is active.
- Keep the ngrok window open during the test; closing it breaks Telegram callbacks.
- Restore production webhook settings after local callback testing if the Ops bot is used in production.
- Never commit `.env`, `.env.local`, `web/.env.local`, local DB files, or local export/log artifacts.

## Focused Tests

Run these after changing the dev-login or Ops approval flow:

```powershell
python -m pytest `
  tests/test_auth.py::TestSessionMiddleware::test_dev_approve_fallback_approves_current_dev_session `
  tests/test_auth.py::TestSessionMiddleware::test_dev_login_quiet_by_default `
  tests/test_auth.py::TestSessionMiddleware::test_dev_login_sends_marked_ops_card_when_enabled `
  -q
```

```powershell
python -m pytest `
  tests/test_webhook.py::test_ops_unauthorized_invite_callback_does_not_mutate_user `
  tests/test_webhook.py::test_ops_authorized_invite_callback_mutates_and_uses_ownix_user_message `
  tests/test_webhook.py::test_ops_invite_callback_does_not_change_already_decided_user `
  tests/test_webhook.py::test_ops_approve_pending_command_authorizes_sender_not_group_chat `
  tests/test_webhook.py::test_ops_pending_command_authorizes_sender_not_group_chat `
  -q
```
