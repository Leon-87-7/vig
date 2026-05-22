---
adr: "0002"
title: Redis list as task queue (BLPOP/BRPOP)
status: accepted
date: 2026-05-15
---

## Context

The API must hand off video processing work to the worker asynchronously. Options considered: Celery + broker, RQ, Redis Streams, or a bare Redis list.

## Decision

Use a single Redis list (`video_jobs`) with `LPUSH` (enqueue) and `BRPOP` (blocking dequeue, 30s timeout).

## Rationale

- **Already in the stack**: Redis is required for the photo batch window (`photo_batch_active:{chat_id}`). No extra dependency.
- **Simplest protocol**: a JSON-encoded task envelope is pushed by the API and popped by the worker. No consumer groups, no offset tracking, no dead-letter queue needed at this scale.
- **BRPOP keeps CPU idle**: the worker blocks on the queue rather than polling.

## Task envelope contract

```json
{ "task": "<discriminator>", "job_id": "<YYYYMMDD_HHMMSS_XXXX>" }
```

Discriminators: `video`, `enrichment`, `prd_auto`, `prd_auto_resend`, `prd_intent`.

## Trade-offs

- **At-most-once delivery**: if the worker crashes after BRPOP but before completing the task, the envelope is lost. Mitigated by the status FSM — a reaper can re-queue stuck jobs in the future.
- No retry backoff or dead-letter queue. Failed tasks get an error status + Telegram notification; the user can re-trigger manually.

## Consequences

- `REDIS_URL` must be set in `.env`.
- Worker and API share the same Redis instance (`vig-redis` container, `vig-network`).
