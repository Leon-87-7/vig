---
adr: "0022"
title: Centralized platform storage over bring-your-own-credentials
status: accepted
date: 2026-06-08
---

## Context

vig was built as a personal tool: one operator, one Google Drive, one Google
Sheet, one Redis instance. Every pipeline writes results directly to the
operator's Drive folder and appends rows to the operator's Sheets.

When the project is reconsidered as a SaaS product — multiple users, each with
their own jobs and data — two storage models are possible:

**Model A — Centralized (platform-owned)**
The operator owns the GCS bucket, the database, and all storage infrastructure.
Users authenticate to the platform (already done via Telegram Login Widget +
Redis session). All user data lives in the operator's infra, isolated by
`chat_id`. Drive and Sheets become opt-in export features: a user who wants
results in their own Google account authorizes the platform via OAuth, and the
platform writes there on their behalf — but this is a convenience layer, not
the primary record.

**Model B — Bring-your-own-credentials (BYOC)**
Each user connects their own Google Drive and Sheets. The platform is a
stateless pipeline; artifacts land in the user's own cloud. Users own their
data literally. This is how Zapier/n8n/Make work.

| | Centralized | BYOC |
|---|---|---|
| Onboarding friction | None — works immediately | High — Google OAuth flow per user |
| Data ownership | Operator-owned, contractual SLA | User-owned, no operator liability |
| Drive/Sheets writes | Opt-in export per user | Required per user |
| Storage cost | Operator bears it | User bears it |
| Multi-tenant isolation | `chat_id` prefix/row-level | Structurally isolated (separate accounts) |
| Product feel | Product owns the experience | Integration tool |

The deciding factor: vig's value is in the analysis pipeline, not in being an
integration bridge. Users do not want to provision Google credentials to start
using the product. BYOC adds setup friction that kills onboarding; the product
is the storage.

The current hardwired Drive/Sheets writes in every processor are legacy from
the single-user personal-tool era. They are **migration-target debt** under
the centralized model.

## Decision

vig uses **centralized platform-owned storage** (GCS bucket + database).

- **Primary record**: `chat_id`-scoped rows in the platform database + files in
  the platform GCS bucket.
- **Drive and Sheets are opt-in exports**: users who want results synced to
  their own Google account connect their account once via OAuth; the platform
  writes there as a background export step, not a pipeline dependency.
- **No pipeline step may block on Drive or Sheets** — these writes are always
  fire-and-forget and gated on whether the user has a connected integration.
- The current unconditional Drive/Sheets writes in `short_video.py`,
  `long_video.py`, `article.py`, `repo.py`, and `prd.py` are to be migrated
  to the opt-in export path as a future task (not a blocker for new features).

## Consequences

- **Pro:** Zero-friction onboarding — no Google OAuth required to start using
  the product.
- **Pro:** Platform controls the data model; migrations and schema changes do
  not require coordinating with each user's Drive layout.
- **Pro:** GCS is the natural home for uploaded document files (document
  pipeline), solving the file-storage question for all ingestion channels
  (Telegram + web UI) uniformly.
- **Con:** Operator bears storage cost and data liability. Requires clear
  privacy policy and data-retention controls.
- **Con:** Existing Drive/Sheets integration (which works today) becomes
  migration debt — refactoring the hardwired writes in five processors is
  non-trivial.
- **Con:** BYOC is a better fit for power users who want full data portability.
  This can be addressed later via export features without changing the core
  model.

## Considered Alternatives

- **BYOC for Drive/Sheets, centralized for everything else** — Hybrid that
  preserves the current Drive/Sheets behavior while adding platform storage for
  new features. Rejected: it entrenches the hardwired writes and complicates
  the integration model. Better to commit to one model and migrate.
- **Full BYOC** — Rejected: onboarding friction kills adoption. n8n is the
  product this replaces; it shouldn't share n8n's complexity.
