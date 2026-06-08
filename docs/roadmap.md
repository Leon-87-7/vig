# vig — Product Roadmap

Decisions and architectural milestones flagged during design sessions for future implementation. Not a sprint plan — a record of known direction so future work has context.

---

## Infrastructure migrations

### Platform storage (GCS)
**Decision**: ADR-0022 — centralized platform-owned GCS bucket replaces personal Google Drive as the primary file store. All uploaded files (document pipeline) and future pipeline artifacts land in GCS, isolated by `chat_id`.

**What needs to happen:**
- Provision GCS bucket + service-account key (`GOOGLE_STORAGE_BUCKET` env var)
- Add `src/services/storage.py` — thin async wrapper around `google-cloud-storage` using existing `google-auth` credentials
- Document pipeline uses this from day one

### Drive/Sheets → opt-in exports (migration debt)
**Decision**: ADR-0022 — hardwired Drive/Sheets writes in five processors (`short_video`, `long_video`, `article`, `repo`, `prd`) are legacy personal-tool behavior. Under the SaaS model these become opt-in exports gated on a per-user connected-integration flag.

**What needs to happen:**
- Add `connected_integrations` table: `chat_id, service (google), access_token, refresh_token, scopes, created_at`
- Add `/connect/google` OAuth flow in the web dashboard (Drive + Sheets scopes)
- Wrap all Drive/Sheets calls in `if await user_has_integration(chat_id, "google"):` guard
- Fire-and-forget export task pushed to queue after primary pipeline completes
- Remove `GOOGLE_DRIVE_FOLDER_*` and `GOOGLE_SHEETS_ID` from required env vars → optional

---

## New pipelines

### Document pipeline (liteparse)
**Status**: In design (grill session 2026-06-08)

Triggered by: Telegram file upload (PDF/DOCX/PPTX/PNG/JPG) or direct file URL. Eventually: web UI file upload.

**Locked decisions** (grill 2026-06-08):
- File storage: GCS (see platform storage above), content-hash keyed cache
- Liteparse runs in its own `vig-document` sidecar (LibreOffice + ImageMagick + Tesseract are too heavy for the worker image — same quarantine pattern as `vig-transcript`/ADR-0017)
- Sidecar contract: **worker sends GCS object reference in; sidecar returns markdown only** (no spatial JSON for MVP)
- Primary artifact is the parsed `.md` (liteparse's core value); enrichment is a secondary layer
- Enrichment output is document-specific: `title, author, publisher, document_type, summary, key_points, references[], tools[]`
- Persistence: `title`→`jobs.title`, `summary`→`ai_objective`, `key_points`→`ai_action_points`, `tools`→`ai_tools`; `author`/`publisher`/`document_type`/`references` in `jobs.template_analysis` JSON blob (ADR-0008)
- `content_type` value: `"document"`

- Cache = the GCS bucket itself, content-hash keyed. Raw file at `documents/{sha256}.{ext}`, parsed markdown at `parsed/{sha256}.md`. "Already parsed?" is a GCS exists-check on `parsed/{sha256}.md` — no separate cache table. Direct file URLs are downloaded, hashed, then identical to uploads from there. Automatic cross-user dedup: the same byte-identical PDF parses once.
- **Privacy caveat (load-bearing)**: content-hash dedup means the *parsed markdown* is shared across users who upload byte-identical files (fine — derived from identical bytes). But `jobs` rows stay strictly per-`chat_id`: ownership, visibility, enrichment, and Second Brain entries never cross tenants. The shared layer is the derived parse only; the job record is always tenant-scoped.

- Routing trigger: document pipeline fires on Telegram `message.document` (PDF/DOCX/PPTX/XLSX + image-as-file). `message.photo` stays with the existing photo pipeline (link extraction). Same image sent "as photo" vs "as file" → different pipelines, by design.
- Delivery: Telegram-only for MVP (send `.md`, then enrichment message, then `✍️ Freestyle` button — mirrors article). Web ingestion reads the same `jobs` table later via `GET /api/jobs/{id}`; no delivery dispatcher built until a second surface exists.
- **Large-file handling**: Telegram Bot API caps `getFile` at 20MB. MVP **rejects** `document.file_size > 20MB` with: *"📄 File too large for Telegram (max 20MB). Upload via the web dashboard — feature coming soon."* The web upload path (browser → API → GCS) has no 20MB limit.

### Large Telegram file ingestion (self-hosted Bot API server)
**Status**: Future — upgrade path for the 20MB `getFile` cap

The 20MB limit lives in the HTTP **Bot API layer**, not in Telegram itself. Running the official `telegram-bot-api` server as a self-hosted container raises `getFile` to **2000MB** while staying bot-based (same bot token, no code change beyond the API base URL).

**What needs to happen** (when built):
- Add `telegram-bot-api` container; point the bot at its local base URL
- Raise/remove the document pipeline's 20MB pre-check

**Rejected alternative — MTProto user-session (e.g. Telegram-Drive / Telethon / Pyrogram user login)**: bypasses the limit by logging in as a *user account* (`api_id`/`api_hash` + phone session), pulling up to 2GB. Rejected because it reintroduces exactly the ToS-gray, account-suspension, throwaway-account risk profile quarantined in ADR-0017 — running a personal user session to fetch files a *bot* received is architecturally backwards for a SaaS. The self-hosted Bot API server achieves the same goal while staying bot-based and Telegram-sanctioned. (Telegram-Drive itself is also a desktop Tauri app, not an embeddable library.)

- **Freestyle re-run**: supported (established article/repo pattern). Reuses `awaiting_freestyle` chat-state + `template_freestyle:` callback + `jobs.freestyle_prompt` seam. Re-run skips the sidecar (parse already cached at `parsed/{sha256}.md`), pulls cached markdown, re-runs Gemini with the freestyle prompt, overwrites the Sheets row. `skip_document: true` suppresses re-sending the `.md`.
- **Direct-file-URL routing**: `detect_pipeline` routes to `"document"` via extension sniff (`.pdf`/`.docx`/`.pptx`/`.xlsx`) **plus** a small curated host-pattern list (`arxiv.org/pdf/*`, `arxiv.org/abs/*` — extension-less academic PDFs). Stays synchronous and network-free (preserves the current router contract). Runs **before** the article-allowlist check (article hosts can also serve `.pdf`). Undetected document URLs fall through to the existing article/rejected path — no regression. (Content-type HEAD-sniffing rejected: pollutes the synchronous router with network I/O.)
- **Module layout** (article/repo pattern applied verbatim):
  - Worker task: `{"task": "document", "job_id": ...}` in `worker._dispatch`; supports `skip_document: true`
  - `src/processors/document.py` — `async def run(job, *, skip_document=False)` (mirrors `article.run`)
  - `src/services/liteparse.py` — thin async HTTP client to the `vig-document` sidecar (GCS ref → markdown), mirrors `src/services/transcript.py`
  - `src/services/storage.py` — GCS wrapper (upload, exists-check, download); used by webhook (upload on arrival) and processor (hash check, parsed-md cache). Shared with the platform-storage migration above.
  - New `Document Analysis` tab in the consolidated spreadsheet (opt-in export, per ADR-0022)

### Document spatial / bounding-box source-highlighting
**Status**: Future — deferred from document pipeline MVP

Liteparse extracts per-text-block bounding boxes (page coordinates). The MVP sidecar contract returns markdown only and discards this spatial JSON. A future dashboard PDF viewer could consume coordinates for:
- "Jump to source" / highlight-on-hover (which page region an enrichment claim came from)
- Region screenshot/crop generation for figures and tables sent to a vision model
- Table structure reconstruction from aligned boxes

**What needs to happen** (when built):
- Sidecar contract gains a `?include_spatial=true` mode returning the bbox JSON alongside markdown
- New storage for the spatial JSON (GCS blob keyed to the job — too large for a DB column)
- Dashboard PDF viewer component with coordinate-overlay highlighting

---

## Web UI — pipeline ingestion
**Status**: Not yet planned

The web dashboard currently browses/annotates existing results. Future: the web UI becomes a full alternative ingestion channel for all pipelines — users paste URLs, upload files, and trigger analysis without Telegram.

**What needs to happen:**
- `POST /api/jobs` endpoint accepting URL or file upload
- File upload path writes to GCS, creates job row, enqueues worker task
- All pipelines decouple from Telegram-specific routing (webhook stays for Telegram users; API endpoint for web users)
- Result delivery: instead of Telegram messages, poll `GET /api/jobs/{id}` or websocket push

---

## Multi-tenancy / brain tiers
**Status**: Deferred (design in CONTEXT.md under "Brain tiers")

Private individual brain → community brain (explicit per-link opt-in) → group brain. Requires `chat_id` + `shared_to_community` columns on `links`.
