> **SUPERSEDED** — the recommendation below was an early draft, revised after
> the "$0 only" constraint (Google Workspace and the raw-SMTP `/broadcast`
> loop were dropped). The live decision is `docs/headless CRM.md`; the five
> requirements below are recorded there verbatim and remain canonical.

Iwell I think I need to add context for what I want from the task 21.
	1.	A place where I can manage the contacts, having the user’s info for reaching out: email address, telegram chat_id.
	2.	I want to have an email address associated with leondev.xyz.xyz.
	3.	I want to have a mailbox to receive emails.
	4.	I want to be able to send the same email to all contacts at the same time (kind of email-blog/change log newsletter)
	5.	I prefer that this would be out of the dashboard (so the data couldn’t leak into the client side EVER)


1. Contacts management → Telegram bot command, not a CRM product

VIG already has an Operator-only channel that’s structurally incapable of leaking to other users: the bot, gated by OPERATOR_CHAT_ID, using the exact pattern that already runs _cb_invite_decision (webhook.py:448). Add an Operator-only /contacts command that lists users rows (pending/approved/blocked, email, tg_id) via the already-unused list_pending_users/get_user primitives. No new surface to build or host, and it’s categorically outside web/ — there’s no code path for this data to ever reach a browser bundle. This replaces “buy a CRM” entirely; a real CRM product would just be a second, unnecessary copy of users.

2 & 3. Mailbox on leondev.xyz → Google Workspace Business Starter (~$7/mo)

A real inbox (e.g. hello@leondev.xyz), checked directly via Gmail — completely separate from vig, so #5 holds trivially here too.

	•	Rejected Zoho Mail free: no IMAP/POP3/forwarding on the free tier — you’d be stuck in Zoho’s own webmail only, and the cheapest tier with real mail-client access is still a paid step.
	•	Rejected transactional-API-only (Postmark/Resend): great for send + webhook-parsed inbound, but that’s not “a mailbox to receive emails” — it gives you events, not an inbox you check.
	•	Picked Google Workspace: real inbox, and vig already trusts Google (Drive/Sheets export, ADR-0030) — one vendor instead of two, familiar admin console.

4. Bulk send → same mailbox, one more bot command

Add an Operator-only /broadcast <message> command: backend iterates approved users’ emails from users and sends individually via Google’s SMTP relay (smtp-relay.gmail.com). Workspace’s limit is 2,000 recipients/day (10k via the relay endpoint) — VIG’s invite-gate list is nowhere near that. No separate newsletter tool (Listmonk/Mailchimp/Postmark Broadcast) needed at your current scale — flag as a future escalation only if the list grows into the hundreds and you want open/click tracking or unsubscribe management.

Net result: one new vendor (Google Workspace), zero new deployed services, zero dashboard exposure, full reuse of users/state machine/bot-command conventions already in the codebase