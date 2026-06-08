---
adr: "0023"
title: Document pipeline via liteparse sidecar with GCS-as-cache
status: accepted
date: 2026-06-08
---

## Context

vig has four URL-routed pipelines (short video, long video, article, repo).
A fifth content shape — **uploaded documents** (PDF, DOCX, PPTX, XLSX, and
images sent as files) — has no URL and no clean fit in the existing pipelines:

- The **article pipeline** (Jina Reader) fetches *web pages*; it cannot parse a
  binary file the user uploads, and Jina mangles arxiv-style PDFs.
- The **photo pipeline** extracts *links from screenshots*; it is Telegram-only
  and deliberately stays so. An image sent "as a file" for full parsing is a
  different intent.

The candidate parser is [liteparse](https://github.com/run-llama/liteparse)
(run-llama, Apache-2.0). Its core value is **clean Markdown output** from
documents, using internal spatial/bounding-box analysis to reconstruct layout
(columns, tables, slides) correctly. It supports PDF natively, Office formats
via **LibreOffice**, and images via **ImageMagick**, with **Tesseract OCR**
bundled.

Two structural facts drove the design:

1. **Liteparse pulls in heavy native binaries** — LibreOffice (hundreds of MB),
   ImageMagick, Tesseract. Embedding these in `vig-worker` would bloat the
   image by ~1GB and couple the core service to a stack of OS-level
   dependencies.
2. **Uploaded files have no URL.** Every existing cache is URL-keyed
   (`markdown_cache.url`, `github_repo_bundle:{owner}/{repo}`). Files need a
   content-derived key, and the same file can arrive from multiple users and
   multiple channels (Telegram now, web UI later).

This builds directly on [ADR-0022](0022-centralized-platform-storage.md):
storage is centralized and platform-owned (GCS), not the operator's personal
Drive.

## Decision

**1. Liteparse runs in its own `vig-document` sidecar container.**
This mirrors the `vig-transcript` sidecar (yt-dlp) and the weight-quarantine
reasoning of [ADR-0017](0017-notebooklm-push-forked-sidecar.md) (Chromium). The
sidecar owns LibreOffice/ImageMagick/Tesseract; `vig-worker` and `vig-api` stay
lean. The worker calls it over HTTP.

**2. The sidecar contract is: GCS object reference in, Markdown out.**
The file is already in GCS at ingestion time, so the worker sends a reference
(not bytes); the sidecar pulls the bytes itself, parses, and returns Markdown.
The sidecar is intentionally dumb — it parses only. Enrichment (Gemini) stays
in the worker, consistent with every other pipeline. Liteparse's spatial
bounding-box JSON is **discarded for MVP** (no delivery surface consumes
coordinates; the clean Markdown already reflects the layout liteparse derived
from them). Carrying the spatial JSON is deferred to a future dashboard PDF
viewer with source-highlighting.

**3. The GCS bucket IS the cache, keyed by content hash (SHA-256).**
- Raw file: `documents/{sha256}.{ext}`
- Parsed Markdown: `parsed/{sha256}.md`

"Already parsed?" is a GCS exists-check on `parsed/{sha256}.md` — no separate
`markdown_cache`-style table. Direct file URLs are downloaded, hashed, and from
there identical to uploads. This gives automatic cross-user, cross-channel
dedup: a byte-identical PDF uploaded by three users parses once.

**4. Tenant isolation: shared parse, per-`chat_id` job rows.**
Content-hash dedup means the *parsed Markdown* is shared across users who upload
byte-identical files — acceptable, since it is purely derived from identical
bytes. But `jobs` rows remain strictly `chat_id`-scoped: ownership, visibility,
enrichment output, and Second Brain entries never cross tenants. The shared
layer is the derived parse only.

**5. The pipeline follows the article/repo pattern verbatim.**
- Routing: Telegram `message.document` (PDF/DOCX/PPTX/XLSX + image-as-file);
  direct file URLs via `detect_pipeline` extension-sniff + curated host patterns
  (arxiv) running before the article-allowlist check.
- `content_type = "document"`; worker task `{"task": "document"}`;
  `src/processors/document.py`.
- New services: `src/services/liteparse.py` (sidecar HTTP client, mirrors
  `transcript.py`) and `src/services/storage.py` (GCS wrapper).
- Document-specific enrichment schema: `title, author, publisher,
  document_type, summary, key_points, references[], tools[]`. Maps `title→title`,
  `summary→ai_objective`, `key_points→ai_action_points`, `tools→ai_tools`;
  `author`/`publisher`/`document_type`/`references` in `jobs.template_analysis`
  JSON blob ([ADR-0008](0008-template-analysis-json-blob.md)). No `promise_gap`
  (documents don't pitch — same reasoning as repos).
- Delivery: Telegram-only for MVP (send `.md`, then enrichment, then
  `✍️ Freestyle`). Freestyle re-run reuses the `awaiting_freestyle` seam and
  the cached parse.
- Drive/Sheets writes are opt-in exports per ADR-0022 (new `Document Analysis`
  tab).

**6. Telegram's 20MB `getFile` cap is handled by rejection for MVP.**
Files over 20MB are rejected with *"📄 File too large for Telegram (max 20MB).
Upload via the web dashboard — feature coming soon."* A self-hosted
`telegram-bot-api` server (raises the cap to 2000MB, stays bot-based) is the
flagged upgrade path.

## Consequences

- **Pro:** `vig-worker`/`vig-api` images stay lean; the ~1GB native-binary
  stack is quarantined in `vig-document`.
- **Pro:** Storage and cache are one thing — a GCS exists-check replaces a DB
  cache table, and the raw file + parsed Markdown sit together.
- **Pro:** Automatic dedup across users and channels; expensive parsing happens
  once per unique file.
- **Pro:** The pipeline slots into existing patterns (`_dispatch`, Sheets tabs,
  Freestyle seam) with one genuinely new module (`storage.py`), which the
  platform-storage migration needs anyway.
- **Con:** A new always-on sidecar container to operate, monitor, and resource
  (LibreOffice is memory-hungry on large files).
- **Con:** GCS is now on the document-ingestion hot path; a GCS outage blocks
  document jobs (other pipelines unaffected).
- **Con:** Content-hash dedup requires hashing every uploaded file up front
  (cheap) and a clear privacy story (the shared-parse vs per-tenant-row split
  must hold).
- **Con:** Discarding spatial JSON now means re-parsing (or a contract change)
  if/when source-highlighting is built — acceptable, the parse is cached.

## Considered Alternatives

- **Liteparse inline in the worker** — Rejected: ~1GB of LibreOffice/
  ImageMagick/Tesseract in the core image, OS-dependency coupling. Same
  reasoning that sidecar-ed yt-dlp (`vig-transcript`) and Chromium (ADR-0017).
- **Jina Reader for documents too** (reuse the article transport) — Rejected:
  Jina parses web pages, not uploaded binaries, and mangles PDFs. Liteparse is
  purpose-built for document → Markdown.
- **Raw bytes over the wire to the sidecar** (transcript audio-fallback
  pattern) — Rejected: the file is already in GCS; round-tripping bytes through
  the worker is wasteful. GCS reference is leaner.
- **Personal Google Drive staging** — Rejected by ADR-0022 (SaaS storage is
  platform-owned GCS, not the operator's Drive).
- **Redis byte store / shared filesystem volume** — Rejected: Redis memory
  budget can't hold large PDFs/PPTXs; a shared volume breaks horizontal scaling
  and doesn't serve the future web-upload channel cleanly.
- **URL-keyed cache (mirror `markdown_cache`)** — Rejected: uploads have no
  URL, and a URL key misses cross-user dedup of identical files.
- **MTProto user-session for large files** (e.g. Telegram-Drive / Telethon /
  Pyrogram user login) — Rejected: reintroduces the ToS-gray, account-
  suspension, throwaway-account risk profile quarantined in ADR-0017. The
  self-hosted Bot API server reaches the same goal while staying bot-based.
- **Content-type HEAD-sniff for direct URL routing** — Rejected: adds a network
  round-trip to the synchronous, network-free `detect_pipeline` router.
