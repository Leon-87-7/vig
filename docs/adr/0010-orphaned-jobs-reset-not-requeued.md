---
adr: "0010"
title: Orphaned jobs are reset to error at startup, not re-queued
status: accepted
date: 2026-05-24
---

## Context

ADR-0002 chose a bare Redis list (`video_jobs`, `LPUSH`/`BRPOP`) as the task queue, accepting at-most-once delivery: if the worker crashes after `BRPOP` but before completing a task, the envelope is lost. Its trade-off note said "a reaper can re-queue stuck jobs in the future."

Until now no such reaper existed for `video`/`enrichment` tasks — only the two PRD-lock reapers (`prd.reaper`, `prd.reaper_intent`). A crash left the job's row stuck in `processing` or `enriching` forever, with no recovery and no user feedback.

Two status values can be orphaned, and they differ in who sets them:

- `processing` — set **only** by the worker (`short_video.run` / `long_video.run` write it as their first line). The API never writes it.
- `enriching` — set by the worker (`enrichment.run`) **and** by the API (`_cb_gemini_yes`, `_cb_enrichment_retry`) immediately before enqueuing.

## Decision

Add a third startup reaper, `reap_stale_jobs()`, run in `worker.loop()` alongside the PRD reapers. It marks jobs `status='error'` — it does **not** re-queue them — where:

```sql
status IN ('processing','enriching') AND updated_at < datetime('now','-10 minutes')
```

increments `attempt`, and notifies the user per state:

- `enriching` → Telegram message + the existing `enrichment_retry:` button. The transcript is already stored; enrichment is cheap and overwrites the `ai_*` fields. (`_cb_enrichment_retry` already accepts `status='error'`.)
- `processing` → Telegram message asking the user to resend the link. That produces a fresh `job_id` with no duplication of the orphaned row's Drive file / Sheets row.

Because notifications are per-row, the reaper is a SELECT-then-UPDATE — `database.fetch_and_mark_stale_jobs()` returns the affected `(id, chat_id, status)` rows in the same transaction that flips them to `error` — not the bulk `UPDATE` used by the PRD reapers.

## Rationale

- **Mark-error, not re-queue, despite ADR-0002's wording.** The video pipeline has no idempotency guard: re-running `short_video.run` / `long_video.run` re-uploads a Drive file and appends a second Sheets row for the same `job_id`. Auto re-queue would also loop on a poison task that deterministically crashes the worker. Surfacing an error with a manual retry path is consistent with the existing PRD reaper and the existing per-failure Telegram UX.
- **Startup-only is sufficient.** The worker is single and sequential; at boot nothing is in-flight, so every `processing`/`enriching` row present is orphaned by a prior crash. Docker's restart policy guarantees the reaper runs after a crash. A hung-but-alive worker is a liveness concern for a healthcheck, not for this reaper.
- **10-minute threshold matches `prd.reaper`.** The threshold exists only to protect a just-queued `enriching` job (set by the API milliseconds before the worker booted) from a false-positive reap. Ten minutes is ample and keeps all three reapers uniform. `processing` is always worker-set, so it could be reaped at any age — the uniform threshold simply costs a slightly delayed recovery, which is acceptable.
- **`attempt` gains a meaning.** The latent `attempt` column (default 1) had no reader or writer. It is now incremented on each reap, recording how many times a job was interrupted by a crash — useful for debugging and visible in Sheets.

## Trade-offs

- A job orphaned <10 minutes before a restart is missed until the next restart crosses the threshold. Acceptable: crashes are rare, restarts frequent.
- No notification-storm guard: a long outage with many in-flight jobs sends one message per job. Bounded in practice by single-worker throughput.
- `attempt` now means "times interrupted by a crash," which differs from its apparent original "processing attempt #". Documented here to prevent confusion.

## Consequences

- New `database.fetch_and_mark_stale_jobs()` — atomic SELECT + UPDATE (`status='error'`, `attempt = attempt + 1`); returns the affected rows.
- New `worker.reap_stale_jobs()` coroutine, called in `worker.loop()` after `prd.reaper_intent()`.
- `enriching` recovery relies on `_cb_enrichment_retry` accepting `status='error'` (it already does — no webhook change needed).
- Supersedes the "a reaper can re-queue stuck jobs" future-work note in ADR-0002: the resolved policy is reset-to-error, not re-queue.
