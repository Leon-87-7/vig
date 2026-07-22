---
adr: "0039"
title: Link pipeline — a sixth content_type for direct-add URLs
status: accepted
date: 2026-07-22
---

## Context

Users want a way to add a URL straight to the [[Second Brain]]'s `links` table — with OG/social
metadata — without it going through video/article/repo processing. `brain.ingest_links(links,
topic, source_job_id)` is the only path into `links`, and every existing caller
(`short_video.py`, `long_video.py`, `article.py`, `repo.py`, `prd.py`) passes the id of an
already-completed job: `source_job` is `NOT NULL` and is used to build the Obsidian `.md`
backlink via `_get_source_job_info`. A direct add has no processing job behind it, so something
has to give.

## Decision

Add `link` as a sixth `content_type`, dispatched through the existing job machinery
(`create_and_enqueue_job` → worker `_TASK_TABLE` → a new `src/processors/link.py`) rather than
special-casing `brain.ingest_links` or fabricating a placeholder job row. The processor fetches
the page, extracts an **essential OG/social tag set** (`og:title`, `og:description`,
`og:site_name`, `og:type`, `og:image`, `twitter:card`, `twitter:site` — extending
`src/utils/og_image.py`, which already parses every `<meta>` tag but discarded all but
`og:image`), marks the job `done`, then calls `ingest_links` with a real `source_job_id`.

Two entry points, both explicit-only — neither routes through `validators.detect_pipeline`, so a
`link` job is created unconditionally regardless of what kind of URL it is (a Reel, a repo, a
video all become plain `link` jobs if added this way):

- Telegram `/addlink <url>`
- Dashboard `U`-triggered "Add Link" modal (distinct from the existing `N` "Submit URL" dialog,
  ADR-0032)

Both surfaces carry an explicit warning that this is **not** the paste-a-URL / `N` pipeline-detection
flow — it saves the link as-is, it does not process/enrich it.

## Considered options

- **Fabricate a synthetic job row** just to satisfy `source_job`'s NOT NULL constraint, no new
  content_type. Rejected: pollutes the `jobs` table/Feed with a row that isn't really a job —
  every future reader of `source_job` would need to know to special-case it.
- **Make `source_job` nullable**, teach `_get_source_job_info` to no-op on `None`. Smaller diff,
  but treats the Second Brain's OG-scraping capability as a special case bolted onto
  `brain.py` instead of a first-class pipeline — and gets none of the existing job
  infrastructure (status FSM, dedup, Telegram ack, dashboard submit UI) for free.

## Consequences

- `link` jobs skip Sheets/Drive export entirely (unlike the other five pipelines) — the
  [[Second Brain]] `links` row + its own Obsidian `.md` upload (done inside `ingest_links`) is
  the only durable artifact. No `append_link_row`, no new Sheets tab.
- `find_recent_job_by_url` stays content_type-agnostic (unchanged) — a `link` add can hit a
  dedup match against a `short`/`article`/`repo` job for the same URL. Every other caller treats
  this as a normal cache hit; the `link` pipeline's callers (Telegram + dashboard) are required
  to surface it as a hard, explicit warning ("this URL already exists as a `{content_type}` job
  — no link entry was created") instead of the soft ack used elsewhere, since silently doing
  nothing would be confusing for a command whose entire point is "add this."
  See [[URL deduplication]].
- `og:image` from the essential OG collection is written directly onto `links.og_image_url` at
  ingest time (a new optional field on `ingest_links`' link dict), instead of leaving it NULL for
  `get_link_preview`'s lazy on-demand fetch — the page was already fetched once for the OG
  collection, so the preview panel has the image immediately.
- Touches the standard set of content_type surfaces: `worker.py` `_TASK_TABLE`, `jobs.py`
  `detail_fields_for`, Feed's content-type filter/badge on the frontend.
