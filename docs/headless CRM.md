# CRM + email for invite-gate contacts — decision (task 21)

> Resolves the "buy vs thin-build" and "mailbox vs transactional API" open
> questions of `docs/TASK.md` brief 21. Supersedes the earlier research dump
> that lived in this file (self-hosted headless CRMs — see git history).

## Operator requirements (2026-07-05)

1. A place to manage contacts — email address + Telegram `chat_id` per user.
2. An email address under `leondev.xyz`.
3. A real mailbox that can **receive** email.
4. Broadcast the same email to all contacts (changelog / newsletter style).
5. **Outside the dashboard** — contact data must never be able to leak into
   the `web/` client side.
6. **$0** — free tiers only, no paid plans.

## Decision — three free pieces, almost no code

| Concern | Pick | Cost |
| --- | --- | --- |
| Contact management + newsletter broadcast (reqs 1, 4, 5) | **Brevo free plan** (hosted) | $0 |
| Mailbox `…@leondev.xyz`, send + receive (reqs 2, 3) | **Zoho Mail free plan** (1 custom domain, 5 users) | $0 |
| Approve / block flow | **Unchanged** — Telegram one-tap (`_cb_invite_decision`, `src/telegram/webhook.py:448`) | — |

### Brevo (contacts + broadcast)

- Hosted console, entirely outside `web/` — contact data never enters the
  dashboard bundle, satisfying req 5 by construction.
- Free plan: up to 100k stored contacts, **300 email sends/day**, unsubscribe
  links, bounce/suppression handling, templates, campaign editor — the
  compliance plumbing (CAN-SPAM/GDPR opt-out, `List-Unsubscribe`) that a
  hand-rolled SMTP loop would have to rebuild from scratch.
- Newsletter is composed and sent **in Brevo**, not via a bot command — real
  subject line, HTML, preview, drafts.
- **vig-side integration (the only code in this task):** a one-way push. When
  the Operator taps ✅ Approve, the existing `_cb_invite_decision` path
  additionally upserts the contact into Brevo via its REST API (email,
  first_name, and `tg_id` as a contact attribute). One httpx call + one
  `BREVO_API_KEY` env setting. No two-way sync: Brevo is a read-mostly mirror
  of `users`; `users.status` stays the single source of truth and approval
  stays in Telegram, so ADR-0031's flow cannot diverge.
- Known tradeoffs (accepted for $0): 300 sends/day cap (requeue spreads a
  larger campaign across days — irrelevant at invite-gate scale) and a
  "Sent with Brevo" badge in the email footer (removable only on paid plans).

### Zoho Mail (the leondev.xyz mailbox)

- Free plan: 1 custom domain, up to 5 users, 5 GB/user — a real inbox for
  two-way personal correspondence (approval follow-ups, replies), which
  transactional APIs' inbound-parse webhooks are not.
- Known tradeoffs (accepted for $0): webmail + Zoho mobile app only — **no
  IMAP/POP3 and no forwarding** on the free tier. If desktop-client (IMAP)
  access ever becomes a hard need, the cheapest escape hatches are Zoho Mail
  Lite (~$1/user/mo) or Migadu (~$19/yr) — both paid, so out of scope now.

## Approval stays in Telegram — Zoho cannot manage it

Considered and rejected (2026-07-05): managing approve/block from the Zoho
mailbox.

- Approval is a state change in vig's DB (`users.status`) plus a Telegram
  notify — it must reach vig's backend. Zoho Mail is a dumb inbox with no way
  to call an API on read/reply.
- Reply-to-approve is structurally impossible on Zoho free: no IMAP/POP3 and
  no forwarding means vig can never read that mailbox programmatically.
- The one workable email variant — signed one-time **action links** in an
  approval-request email hitting a new authenticated vig endpoint — is real
  net-new code (token minting/expiry, endpoint, confirm page because mail
  scanners prefetch links and would auto-"click" a bare GET). It duplicates a
  flow that already works one-tap in Telegram. Optional future task, not
  part of task 21.
- Related gap kept as a follow-up: `list_pending_users` still has no
  production caller, so a missed Telegram push leaves pending users
  invisible. A tiny Operator-only `/pending` bot command that re-sends the
  approve/block keyboard closes that with existing machinery — no email
  involved.

## Self-hosting on the VPS — where the line is (2026-07-05)

The VPS ("small", docker-compose deploys — `docs/handoff/VPS to prebuilt
docker images via GHCR.md`) has room, so self-hosting parts of the stack was
weighed:

- **Never self-host the mail server** (Mailcow/Mailu/postfix), regardless of
  room. VPS IP ranges are pre-distrusted by Gmail/Outlook and outbound port
  25 is often blocked — deliverability is unwinnable at this volume; the
  stack is the highest-maintenance category of self-hosted software (Mailcow
  alone wants ~6 GB RAM); and you would still relay outbound through a hosted
  provider anyway. Zoho keeps the mailbox.
- **Listmonk is the named upgrade path for the newsletter layer.** A single
  lightweight Go binary (contacts, campaigns, unsubscribe, bounces —
  self-hosted Brevo). Gains over Brevo free: no "Sent with Brevo" badge, no
  300/day requeue, contact data on your own box. Costs: it requires
  Postgres (vig runs SQLite + Redis, so that's **two** new containers to
  deploy/back up/update), and it still needs an external SMTP relay to
  deliver (Brevo free's SMTP, 300/day, as a dumb pipe — Brevo would see
  sends but not hold the contact list).
- **Decision: ship v1 all-hosted (Brevo + Zoho, zero new containers).**
  Switch trigger for Listmonk: the Brevo badge or daily cap actually starts
  to bite. The switch is cheap later — the vig-side one-way push just changes
  its target URL from Brevo's REST API to Listmonk's.

## Rejected

- **Self-hosted CRMs (Twenty, IDURAR, erpjs/iDempiere micro)** — the original
  candidates in this file. Real ops overhead (Docker/Postgres to run, back up,
  patch), a forked copy of the `users` contact data, and none of them do
  email send/receive. They solve a generic-contact-database problem vig
  doesn't have and skip the email problem it does. (Heavier than Listmonk,
  too — Node + Postgres + Redis each — while duplicating contact management
  Listmonk/Brevo already covers.)
- **Google Workspace** (~$7/user/mo) and **Migadu** — fail req 6 (paid).
- **Transactional email APIs (Postmark, Resend, Mailgun)** — Postmark's
  inbound parse is the best of the class but it delivers webhook *events*,
  not an inbox (fails req 3), and inbound requires a paid tier (fails req 6).
- **Raw SMTP broadcast loop from the backend** (earlier draft of this
  decision) — no unsubscribe/bounce handling (compliance risk), poor
  authoring UX (composing a newsletter in a Telegram message), and cold-domain
  deliverability risk. Superseded by Brevo campaigns.
- **A "Contacts" admin page in the dashboard** — violates req 5.

## Ops — DNS for leondev.xyz

Managed wherever `app.` / `api.` DNS lives today (outside this repo):

- **Zoho:** domain-verification TXT, MX records, SPF include, DKIM key.
- **Brevo:** sender-domain authentication (Brevo DKIM + DMARC records) so
  campaigns sent as `…@leondev.xyz` pass alignment.
- SPF must accommodate both senders in the single `leondev.xyz` SPF record
  (one TXT with both includes, not two TXT records).

## Remaining open question

- The mailbox name itself (`hello@`, `leon@`, `vig@`…) — one address is
  enough to start; Zoho free allows up to 5 if roles split later.
