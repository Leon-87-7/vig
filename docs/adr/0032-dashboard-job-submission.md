---
adr: "0032"
title: Dashboard becomes a job-creation surface, superseding read-mostly
status: accepted
date: 2026-07-04
---

## Context

The `Web dashboard` glossary entry documented a deliberate decision: the dashboard is
read-mostly, Telegram is the only ingestion channel, and a desktop submit form was deferred
until "the mobile/desktop usage split changes." That trigger condition has not occurred.

## Decision

Add URL submission to the dashboard (Feed page) anyway, driven by two concrete near-term
needs rather than a usage-pattern shift: an upcoming conference demo, and parity with the
Doc Parser page (`/doc-parser`), which already lets a user submit via URL or file upload —
so "the dashboard can't ingest" was already half-false before this change.

This is a **permanent** capability, not a demo-scoped exception — once shipped it stays.

## Rationale

- The original decision's own escape hatch ("the job-creation core is reusable and cheap to
  add later") is being exercised now, just for a different trigger than the one it named.
  See [[Shared job-creation core]] (ADR-0033) for the extraction this enables.
- Doc Parser already broke the "read-mostly" premise for one content type; extending
  short/long/article/repo closes the inconsistency rather than opening a new one.

## Consequences

- The `Web dashboard` glossary entry's "read-mostly is deliberate" framing is superseded —
  ingestion now happens from both Telegram and the dashboard.
- Feed page gains a submit control (URL input + template selector, mirroring the Telegram
  slash commands including `/freestyle`) for `short`/`long`/`article`/`repo`. `document`
  stays on its existing Doc Parser page — not folded into this endpoint.
- `chat_id` for a web-submitted job is the session's tenant (`request.state.user["id"]`),
  identical to every other `/api/jobs/*` endpoint. No new interaction with the
  `OPERATOR_CHAT_ID` export gate (ADR-0030) — that gate governs Drive/Sheets writes, not
  job creation.
