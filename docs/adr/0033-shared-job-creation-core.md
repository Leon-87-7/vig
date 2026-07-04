---
adr: "0033"
title: Shared job-creation core in src/services/jobs.py
status: accepted
date: 2026-07-04
---

## Context

Create-job + enqueue logic was split across three shapes inside `webhook.py`, none of them
reusable outside it: `_enqueue_simple_job` (repo/article, no template support),
`_route_video` (template-aware, hardcodes a Telegram `send_message` ack), and the
`-name`/freestyle user-template path. Two new callers now need the same core: the dashboard
web-submission endpoint (ADR-0032) and the post-enrichment repo follow-up (task 9,
`docs/TASK.md` §9) — neither is Telegram-only, so forking a third copy was the wrong move.

## Decision

Extract `create_and_enqueue_job(chat_id, url, content_type, *, template=None,
message_id=None) -> job_id` into a new `src/services/jobs.py`, mirroring the existing
`src/services/job_recovery.py` convention (which already backs `src/api/jobs.py`'s recovery
endpoints). It owns the dedup check (`database.find_recent_job_by_url`) and returns the
existing job dict on a cache hit instead of creating a duplicate. Each caller — the Telegram
webhook, the web API, the repo follow-up — handles its own notification (Telegram message,
JSON response, or silent skip) rather than the core doing it.

## Considered options

- **Keep it in `webhook.py`, import from there.** Rejected: would make the web API and the
  repo-followup call sites depend on the Telegram module, and cuts against the standing
  wontfix decision to keep `src/telegram/` a two-file package (see `Webhook dispatch table`
  in CONTEXT.md) — a services-layer extraction is the established escape valve for shared
  logic, not a webhook.py split.

## Consequences

- `webhook.py`'s `_enqueue_simple_job` / `_route_video` become thin wrappers over
  `create_and_enqueue_job`, keeping Telegram-specific messaging local to `webhook.py`.
- `src/api/jobs.py` gains `POST /api/jobs` calling the same function with `chat_id` from the
  session.
- Task 9's repo follow-up (short/article/long-video, see CONTEXT.md `Repo follow-up`) calls
  the same function per selected repo, inheriting dedup for free.
