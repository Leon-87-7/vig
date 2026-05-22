---
adr: "0008"
title: Template-specific extras stored as a single JSON blob column
status: accepted
date: 2026-05-22
---

## Context

Templates add extra fields to the enrichment output — `steps` for `method`, `pros`/`cons`/`verdict` for `review`, `tech_stack`/`architecture` for `technical`, etc. These extras needed a storage strategy in the `jobs` table.

Two options were considered:

1. **Dedicated columns per template** — `ai_method_steps TEXT`, `ai_review_pros TEXT`, `ai_review_cons TEXT`, etc.
2. **Single `template_analysis TEXT` column** — one JSON blob per job, containing whatever the template produced.

## Decision

Single `template_analysis TEXT` column storing the raw `template_analysis` JSON object returned by Gemini. NULL for `summary` template jobs or when no template ran.

## Rationale

- **Extensibility**: adding a new template in the future costs zero schema changes. A new column approach requires an `ALTER TABLE` per new template, plus migration tracking.
- **Base fields stay queryable**: the columns that matter for analytics and Sheets (`ai_category`, `ai_topic`, `ai_tools`, etc.) remain as typed columns. Only the template-specific extras — which have no current analytics use case — live in the blob.
- **Consumption is Python-only**: `template_analysis` is read in Python, formatted for Telegram, and written to Drive. No SQL query ever needs to filter or aggregate on a specific sub-field. The blob is opaque to the DB layer by design.

## Consequences

- `template_analysis` sub-fields (e.g. `steps`, `pros`) cannot be queried directly via SQL.
- If a future analytics use case requires querying a specific template field, a derived column can be added at that time. That is a better trade-off than pre-emptively adding columns for fields that may never be queried.
- `json.dumps` / `json.loads` round-trips must be handled at the DB read/write boundary in `enrichment.run`.
