---
adr: "0004"
title: Worker is the single acquirer of PRD locks
status: accepted
date: 2026-05-21
---

## Context

Two paths can trigger PRD generation for the same job: the webhook callback handler (when the user taps a button) and the worker (when processing the task). Early versions had the webhook pre-acquire the lock (`prd_auto_status='generating'`) before enqueuing, to show the user immediate feedback.

## Decision

Only the worker may set `prd_auto_status='generating'` or `prd_intent_status='generating'`. The webhook enqueues the task and returns without touching the PRD status columns.

## Rationale

- **Prevents TOCTOU races**: if the webhook sets the lock and then the worker tries to do the same atomic `UPDATE ... WHERE prd_auto_status IS NULL`, the worker sees the lock as already held and bails with `lock_contention`. The PRD never generates.
- **Single writer**: the worker loop is sequential (one task at a time). If it owns the lock acquisition it can guarantee atomicity without a distributed lock.
- **Simpler reasoning**: the webhook only reads and enqueues; the worker only writes and delivers. No shared write state between containers.

## Trade-offs

- The user sees a slight delay before "Generating..." feedback (the task must reach the worker first). Acceptable — Telegram delivery of the task is fast.

## Consequences

- Tests that monkeypatch PRD callbacks must not call `update_job_status` with a generating value before the worker mock runs.
- The reaper checks for `prd_auto_status='generating'` rows older than a threshold and resets them — this works because the lock is always set by the worker, which also owns the reset.
