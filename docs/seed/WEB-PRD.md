# WEB-PRD — vig Web Dashboard

> Product Requirements Document for the **Web dashboard** — a Next.js + shadcn/ui
> read-mostly companion to the Telegram bot. Synthesized from
> `docs/features/postgrill/web-plan.md` (post-`/grill-with-docs`, 2026-05-31) and
> grounded in ADR-0016–0019 plus the `CONTEXT.md` glossary terms (\[\[Web dashboard]],
> \[\[Tenant]], \[\[User template]], \[\[Space export]], \[\[Brain tiers]], \[\[Markdown editor (dashboard)]],
> \[\[NotebookLM push]]).

---

## Implementation Status (2026-07-18)

✅ **All phases 0–12 shipped.** This document is the original MVP spec and is kept
as the requirements baseline; the built dashboard has since evolved past it in
these ways (each governed by its own ADR):

- **No longer read-mostly** — the dashboard submits new jobs via `POST /api/jobs`
  (ADR-0032) through the shared job-creation core (ADR-0033).
- **Design system** — shadcn/ui defaults were replaced by the **Ownix** design
  system, "The Operator's Console" (ADR-0034; normative tokens in root `DESIGN.md`).
- **Hosting** — production frontend is served by **Vercel**, not the
  docker-compose `web` service (which is commented out, kept for local runs).
- **New pages beyond the original eight** — public landing funnel, **Doc Parser**
  (ADR-0029), **Restricted-mode** read-only preview (ADR-0035), Telegram Mini App
  route (`/mini`), privacy/terms.
- **Onboarding** — invite gate + one-click invite approvals (ADR-0031), with
  operator-side administration moved to the **Ops bot** (ADR-0036).
- **Per-user Google OAuth** — exports use each user's own Drive credentials via an
  encrypted token store + export gate (ADR-0030), superseding the single
  `GOOGLE_DRIVE_FOLDER_EXPORTS` assumption below.
- **Feed** — server-resolved thumbnails (ADR-0025), Links/Commands inventory IA,
  command launcher (Ctrl+Shift+K).
- **Brain** — links gained standalone identity and link-level tags (#381–#387);
  graph shows derived edges + topic clusters (ADR-0028).

The user stories, seams, schema, and testing decisions below remain the accurate
record of the MVP contract.

---

## Problem Statement

Today every interaction with vig happens through Telegram. A user submits a URL,
the bot processes it (short video, long video, article, repo), and the enriched
result is delivered as a chat message plus a row in Google Sheets / a file in
Google Drive. That works for _ingestion_ but is poor for everything after:

- **Results are write-only and scattered.** Once a job's Telegram message scrolls
  away, the only way back to its enrichment is Google Sheets or Drive — neither is
  browsable, searchable, or annotatable in a way that matches how the user thinks.
- **There is no way to curate.** A user accumulates dozens of analyzed URLs but
  cannot group them into themed collections, attach their own notes, or tag them.
- **There is no research-prep surface.** The user wants to assemble a curated set
  of sources plus their own editorial context and hand it to NotebookLM (or export
  it as a document), but nothing produces that package.
- **Templates are developer-only.** Enrichment "modes" (`/method`, `/technical`,
  etc.) are hardcoded; a non-developer cannot create their own reusable analysis
  template without editing Python.
- **Search is trapped in chat.** The Second Brain semantic graph is only reachable
  via the `/find` Telegram command; there is no visual search surface.
- **Annotation is impossible.** The user cannot record _why_ a given result matters
  to them, in their own words, against the job.

The user needs a place to **browse, search, annotate, curate, and export** their
processed knowledge — without giving up Telegram as the fast ingestion channel.

## Solution

A **read-mostly web dashboard** at `app.leondev.xyz`, served by Next.js and talking
to the existing FastAPI service at `api.leondev.xyz`. Telegram stays the ingestion
channel; the dashboard is the _consumption and curation_ surface. Eight pages:

1. **Login** — Telegram Login Widget (HMAC-verified with the bot token).
2. **Feed (`/`)** — hero stats + client-side fuzzy search + recent jobs, filterable
   by content type and status, polling so Telegram-submitted jobs appear live.
3. **Job detail (`/jobs/[id]`)** — the full enrichment, per-field copy buttons,
   annotation (markdown notes + tags), and export.
4. **Spaces (`/spaces`,** **`/spaces/[id]`)** — named collections of jobs plus editorial
   "context blobs", with a whole-space export modal.
5. **Prompts (`/prompts`)** — built-in templates read-only; a builder for the user's
   own DB-backed templates that fire from Telegram via `-name <url>`.
6. **Controls (`/controls`)** — per-chat allowed domains, ignored domains, and tags
   (name + meaning + color).
7. **Brain (`/brain`)** — visual semantic search that reuses the same backend
   function as the Telegram `/find` command.

Authentication is a **Telegram Login Widget → Redis-backed opaque session** (no JWT;
ADR-0016): a random `session_id` lives in `session:{id}` with a 30-day TTL, carried
in an httpOnly `SameSite=Lax` first-party cookie. The browser always talks to the
Next.js frontend over relative `/api/*` paths, which proxies to FastAPI (**Option A**),
in both dev and prod — so the cookie is always first-party and httpOnly XSS protection
holds without `SameSite=None`. Only `/api/*` is protected; `/webhook` and `/health`
stay open.

All user-owned data is scoped per \[\[Tenant]] (`chat_id`); the web app supports the
**private** chat kind only for now (`chat_id == telegram_user_id`).

The dashboard is explicitly **read-mostly**: it never replaces Telegram ingestion.
The only writes it performs are curation (spaces, tags, annotations, user templates,
domain lists) and exports — not new URL processing.

---

## User Stories

### Authentication & session

1. As a returning user, I want to sign in with the Telegram Login Widget, so that I
   don't manage a separate password.
2. As a user, I want my login verified against the bot token (HMAC), so that nobody
   can forge a Telegram identity to read my data.
3. As a user, I want an expired or tampered login payload rejected, so that stale or
   replayed auth attempts fail closed.
4. As a signed-in user, I want a session that lasts \~30 days, so that I'm not forced
   to re-authenticate every visit.
5. As a user, I want to log out, so that my session is immediately revoked (one Redis
   `DEL`) and subsequent requests 401.
6. As a user visiting any protected page without a valid session cookie, I want to be
   redirected to `/login`, so that I never see a half-loaded authenticated page.
7. As a user, I want `/api/auth/me` to tell the frontend who I am, so that the UI can
   show my username and photo.
8. As the operator, I want `/webhook` and `/health` to stay unauthenticated, so that
   Telegram delivery and health checks are unaffected by the session gate.

### Feed (home)

1. As a user, I want a hero with stat cards (e.g. total jobs, by status, by content
   type), so that I get an at-a-glance sense of my corpus.
2. As a user, I want a fuzzy search box over my jobs, so that I can find a result by
   a remembered fragment of its title/topic without exact spelling.
3. As a user, I want fuzzy search to run instantly in the browser, so that typing
   feels immediate (no server round-trip per keystroke).
4. As a user, I want to filter the feed by content type (short / long / article /
   repo), so that I can narrow to one kind of source.
5. As a user, I want to filter the feed by status (done / processing / error / …), so
   that I can find in-flight or failed jobs.
6. As a user, I want the feed's first page to poll while any job is in-flight, so that
   a URL I just submitted **from Telegram** appears within \~10s without a manual
   refresh.
7. As a user, I want polling to stop when nothing is in-flight, so that an idle tab
   isn't hammering the API.
8. As a user, I want each job in the feed shown as a card with its title, content
   type, status, and tags, so that I can scan results quickly.
9. As a user, I want to click a job card to open its detail page, so that I can read
   the full enrichment.

### Job detail

1. As a user, I want to see all enrichment fields for a job (topic, objective, action
   points, tools, promise gap, template analysis), so that I have the complete
   analysis in one view.
2. As a user, I want a copy button per field, so that I can paste a single field
   elsewhere without selecting text by hand.
3. As a user, I want to write markdown notes against a job, so that I can record why
   it matters to me.
4. As a non-technical user, I want to format my notes with a toolbar (bold, lists,
   headings) and never see raw markdown syntax, so that it feels like Google Docs.
5. As a user, I want my notes saved automatically when I click away (debounced on
   blur), so that I don't lose work and don't hunt for a save button.
6. As a user, I want to attach tags to a job from my tag set, so that I can classify
   it for later filtering and export legends.
7. As a user, I want to remove a tag from a job, so that I can correct a
   misclassification.
8. As a user, I want to export a single job, so that I can hand its analysis to
   another tool.

### Spaces (curation)

1. As a user, I want to create a named space, so that I can group related jobs into a
   themed collection.
2. As a user, I want to give a space a color, so that I can distinguish my
   collections visually.
3. As a user, I want to see all my spaces with their color swatches, so that I can
   pick the right one quickly.
4. As a user, I want to add a job to a space, so that I can build a curated reading
   set.
5. As a user, I want to remove a job from a space, so that I can refine the
   collection.
6. As a user, I want to reorder the jobs in a space, so that the export reads in my
   intended sequence.
7. As a user, I want a space-detail page with a **URLs** tab and a **Context** tab, so
   that I can separate "the sources" from "my editorial framing".
8. As a user, I want to add one or more **context blobs** (markdown documents) to a
   space, so that I can write the lens through which the sources should be read.
9. As a user, I want to edit a context blob in the same WYSIWYG markdown editor as my
   job notes, so that the experience is consistent and syntax-free.
10. As a user, I want context blobs ordered, so that they read in sequence in the
    export.
11. As a user, I want deleting a space to also remove its space–URL links and its
    context blobs, so that I don't leave orphaned rows behind.

### Export

1. As a user, I want to export a whole space as a Markdown file, so that I can save or
   share the curated package.
2. As a user, I want to export a whole space as a plain-text file, so that I have a
   format-free copy.
3. As a user, I want to export a whole space as a **real Google Doc** in my Drive (a
   converted Doc, not a raw `.md`), so that I can edit it collaboratively.
4. As a user, when Drive isn't configured, I want the Google-Doc button to fall back
   to a client-side **PDF** download rather than greying out, so that I still get a
   portable document (and one NotebookLM can ingest).
5. As a user, I want the export to lead with my context blobs, then a tag legend, then
   the sources, so that a reader (human or NotebookLM) gets my framing and vocabulary
   before the raw material.
6. As a user, I want the tag legend to list **only the tags actually used** by jobs in
   the space (name + meaning), so that the legend is relevant and not my entire tag
   vocabulary.
7. As a user, I want each source in the export to carry its full enrichment plus my
   notes, so that the document is self-contained.
8. As a user, I want the transcript excluded from the export (for size), so that the
   document stays readable.
9. As a user, I want `.md` and `.txt` exports generated entirely in the browser, so
   that a save dialog lets me choose the folder.

### Prompts / templates

1. As a user, I want to see the built-in templates (`/summary`, `/method`, …) as
   read-only, so that I understand the modes the bot already supports.
2. As a user, I want to create my own template with a name and extra instructions, so
   that I can define a reusable analysis mode the bot doesn't ship.
3. As a user, I want my template to fire from Telegram via `-name <url>`, so that I can
   trigger my custom analysis the same fast way I trigger built-ins.
4. As a user, I want my template name rejected at creation if it collides with a
   built-in (e.g. `method`), so that `-name` always resolves to exactly one template.
5. As a user, I want to edit my own templates, so that I can refine the instructions
   over time.
6. As a user, I want to delete my own templates, so that I can retire ones I no longer
   use.
7. As a user, I want built-in templates protected from edit/delete, so that I can't
   accidentally break the bot's core modes.
8. As a user, I want my template's extra instructions to drive the enrichment (MVP),
   so that I get the analysis I asked for — knowing `brave_search` and
   `content_type_scope` are stored now but not yet enforced.
9. As a developer, I want user templates to ride the existing freestyle seam (their
   `extra_instructions` copied into `jobs.freestyle_prompt`), so that no processor
   needs to change.

### Controls

1. As a user, I want a Controls page with tabs for Allowed Domains, Ignored Domains,
   and Tags, so that all my per-chat settings are in one place.
2. As a user, I want to add and remove allowed domains, so that I control which sites
   route through the article pipeline.
3. As a user, I want to add and remove ignored domains, so that I control which
   domains are filtered out — behaving correctly per-chat (issue #81).
4. As a user, I want to create a tag with a name, a **meaning**, and a color, so that
   the tag is meaningful in classifications and export legends.
5. As a user, I want to edit a tag's name, meaning, and color, so that I can refine my
   vocabulary.
6. As a user, I want to delete a tag, so that removing it also detaches it from any
   jobs that used it.

### Brain (semantic search)

1. As a user, I want a `/brain` page with a search box, so that I can semantically
   search my Second Brain visually.
2. As a user, I want the brain search results to match what `/find` returns in
   Telegram, so that there's one source of truth (`brain.search_links`).
3. As a user, I want each brain result to show the title, URL, topic, and similarity
   score, so that I can judge relevance.

### Cross-cutting

1. As a user, I want a persistent sidebar nav across all pages, so that I can move
   between feed, spaces, prompts, controls, and brain easily.
2. As a user, I want only my own data shown (scoped by `chat_id`), so that the
   multi-tenant future doesn't leak other tenants' jobs into my view.
3. As the operator, I want a `web` container on `vig-network` with the API URL as a
   **server-only** env var, so that the browser never sees the internal API origin.

---

## Implementation Decisions

### Sequencing & package layout

- **Phase 0 first:** move `src/api.py` → `src/api/brain.py`. A file and a package
  cannot share the stem `api`; the brain endpoints become a router under the new
  `src/api/` package, re-pathed `/api/brain/search` and `/api/brain/rebuild`, and
  `main.py`'s import is updated. (Plan Q1.)
- **FK enforcement (Invariant #12, load-bearing):** add
  `await conn.execute("PRAGMA foreign_keys=ON")` to the runtime `connection()`
  context manager in `src/database.py`. SQLite defaults it OFF per-connection, so
  without it every `ON DELETE CASCADE` on the new tables is silently dead. The
  startup-only PRAGMA at `init_db` is not enough.

### Deep modules (confirmed decomposition)

The backend is carved into seven deep modules, each a simple stable interface:

1. **HMAC auth verifier** — a pure function
   `verify_telegram_auth(payload, bot_token) -> user_dict | None`. No I/O. The entire
   Login Widget trust boundary: it recomputes the HMAC over the sorted data-check
   string with the SHA-256 of the bot token as the key, compares constant-time, and
   checks `auth_date` freshness. Returns the user fields on success, `None` on any
   failure (bad hash, missing fields, stale `auth_date`).
2. **Redis session store** — `mint(user) -> session_id`, `resolve(session_id) -> user | None`,
   `revoke(session_id)`. Hides the `session:{id}` key shape, the 30-day TTL, and the
   JSON payload behind three calls. No JWT (ADR-0016).
3. **Session middleware** — an ASGI/FastAPI middleware that gates `/api/*` only:
   reads the cookie, calls `session_store.resolve`, attaches the tenant to the request
   (or 401s). `/webhook` and `/health` are exempt by path prefix.
4. **Export composer** — a pure function
   `compose_space_export(space, blobs, jobs, tags) -> markdown`. Implements the
   composition spec (below). No I/O — given fixtures it returns deterministic markdown.
   Feeds all four export formats (`.md`/`.txt`/`pdf`/`gdoc`) and is the future
   \[\[NotebookLM push]] payload.
5. **User-template resolver** — the webhook `-name` branch: on a message whose first
   word starts with `-`, async-look-up the name against the `templates` table; on hit,
   create the job with that template and copy its `extra_instructions` into
   `jobs.freestyle_prompt` (rides the freestyle seam — no processor change). Built-ins
   stay in code; no change to the import-time `_SLASH_TABLE` (ADR-0019).
6. **DB CRUD layer** — async CRUD functions in `src/database.py` for each new entity
   (users, templates, tags, job_annotations, job_tags, spaces, space_urls,
   context_blobs).
7. **`drive.export_to_gdoc(markdown, name, folder_id) -> url`** — creates a real
   Google Doc by setting the create-call body `mimeType=application/vnd.google-apps.document`
   with `text/markdown` media (Drive's markdown→Docs import), landing in
   `GOOGLE_DRIVE_FOLDER_EXPORTS`.

### Schema changes (append to `SCHEMA_SQL`, runs every boot, `IF NOT EXISTS`)

Eight new tables. Because they are pure-new and created with `CREATE TABLE IF NOT EXISTS`,
**no** **`_MIGRATIONS`** **entry is needed** (plan Q8). The two deltas from the original plan
are the new `tags.meaning` column and the FK-enforcement note above.

- `users(id, telegram_user_id UNIQUE, chat_id, username, first_name, photo_url, auth_date, created_at)`
- `templates(id TEXT PK, name UNIQUE, description, trigger_patterns, extra_instructions, brave_search, content_type_scope, is_builtin, created_at, updated_at)` — built-ins **not** seeded; user-name collisions with built-ins rejected at create.
- `tags(id, chat_id, name, meaning, color, created_at, UNIQUE(chat_id, name))` — `meaning` is new vs the original plan.
- `job_annotations(job_id PK → jobs ON DELETE CASCADE, notes, updated_at)`
- `job_tags(job_id → jobs ON DELETE CASCADE, tag_id → tags ON DELETE CASCADE, PK(job_id, tag_id))`
- `spaces(id TEXT PK, chat_id, name, color, created_at, updated_at)`
- `space_urls(space_id → spaces ON DELETE CASCADE, job_id → jobs ON DELETE CASCADE, sort_order, added_at, PK(space_id, job_id))`
- `context_blobs(id TEXT PK, space_id → spaces ON DELETE CASCADE, name, content, sort_order, created_at, updated_at)` — `content` is markdown, the Milkdown source of truth.

### API contracts (routers under `src/api/`, all mounted under `/api`)

- **`auth.py`** — `POST /api/auth/telegram` (verify HMAC, upsert user, mint session,
  set cookie), `POST /api/auth/logout` (`DEL` session), `GET /api/auth/me`.
- **`jobs.py`** — list (chat_id-scoped, filter by content_type/status, paginate),
  `GET /api/jobs/stats` (hero counts), `GET /api/jobs/{id}`,
  `PUT /api/jobs/{id}/annotations`, `POST|DELETE /api/jobs/{id}/tags/{tag_id}`.
  **No FTS5** **`/search`** **endpoint** — feed search is fuse.js client-side.
- **`spaces.py`** — CRUD + `urls` + `blobs` sub-resources +
  `POST /api/spaces/{id}/export` (`gdoc` via `drive.export_to_gdoc`; `md`/`txt`/`pdf`
  handled client-side).
- **`templates.py`** — CRUD; `PUT`/`DELETE` blocked for built-ins; reject user-name
  collisions with built-ins.
- **`controls.py`** — allowed/ignored domains (both per-chat; ignored fixed by issue
  \#81) + tags (incl. `meaning`).
- **`brain.py`** — the moved endpoints; `/api/brain/search` reuses `brain.search_links`.

### Auth, session & network path (ADR-0016)

- Identity = Telegram Login Widget, HMAC-verified with the bot token.
- Session = Redis opaque `session:{id}`, 30-day TTL, httpOnly `SameSite=Lax` cookie.
  **No JWT** (revocation = one `DEL`; Redis is already shared infra).
- Network = **Option A**: browser → Next.js frontend (relative `/api/*`) → FastAPI, in
  both dev and prod, so the cookie is always first-party. No `NEXT_PUBLIC_*` API origin.
- Protected boundary = `/api/*` only; `/webhook` + `/health` open.
- Domain = `leondev.xyz`; `app.` (Next.js) + `api.` (FastAPI) subdomains; register with
  BotFather.

### Templates in the bot (ADR-0019)

- Built-ins keep their immutable `/name` slash sigil and stay in code
  (`PROMPT_TEMPLATES` is the single source of truth; `detect_template` stays
  built-ins-only; no `get_template()` function).
- User templates fire only via the explicit `-name <url>` dash sigil — never via
  auto-routing — resolved by an async DB lookup at job-creation time.
- MVP honors `extra_instructions` only; `brave_search` + `content_type_scope` are
  stored-but-unenforced (extensible later via the retained `jobs.template` name, no
  migration).

### Space export composition (\[\[Space export]])

Whole-space, no per-item selection in MVP. Order:

```
# <Space name>
<context blob 1> … <context blob N>          (editorial lens first)
## Tag legend                                (one "Name: <name> meaning: <meaning>" line
  …                                           per tag ACTUALLY USED by jobs in the space)
## Sources
### <job title>   [tags: …]
<url>
**Topic / Objective / Action points / Tools / Promise gap / Template analysis**
**My notes:** <annotation>
```

Transcript excluded (size; future toggle). The same composition doubles as the future
NotebookLM push payload (URLs→sources, blobs→steering prompt).

### Frontend (`/web`, Next.js 14)

- Stack: Next.js 14, shadcn/ui, Tailwind, fuse.js, `@milkdown/crepe`,
  `@react-pdf/renderer`.
- `next.config.js` rewrites `/api/:path*` → `${API_INTERNAL_URL}/api/:path*` (Option A).
- `MarkdownEditor.tsx` = `'use client'` Crepe instance + `markdownUpdated` listener
  (debounced save), reused for context blobs **and** job notes. Init in `useEffect`,
  `destroy()` on unmount (SSR/StrictMode safety) — see \[\[Markdown editor (dashboard)]].
- `ExportModal` generates `.md`/`.txt`/`pdf` client-side; calls
  `POST /api/spaces/{id}/export` only for the Google-Doc-to-Drive path.
- Auth guard in `layout.tsx`: missing/invalid session cookie → redirect to `/login`.
- Real-time = **Scope A** polling: poll the feed's first page every 10s while any job
  is in-flight (catches Telegram-submitted jobs); stop when nothing is in-flight.

### Config & deployment

- `src/config.py` adds `GOOGLE_DRIVE_FOLDER_EXPORTS` and the session cookie name/TTL.
  `API_INTERNAL_URL` is a **web-container** env (server-only), not a `src/config.py`
  setting and never `NEXT_PUBLIC_*`.
- docker-compose adds a `web` service on `vig-network` with
  `API_INTERNAL_URL=http://api:8000` (server-only), `depends_on: [api]`,
  `ports: ["3000:3000"]`.

### Tenancy & brain (future-aware, not built now)

- All web tables carry `chat_id`; the web app supports the **private** tenant kind
  only (\[\[Tenant]]).
- The Second Brain stays **global** for MVP. The future \[\[Brain tiers]] model
  (private / per-link-opt-in community / group) and the `/brain` **My / Community**
  toggle are out of scope.

---

## Testing Decisions

**What makes a good test here:** assert _external behavior_, not implementation.
Tests should pin the contract a caller depends on — the markdown a composer returns,
the accept/reject decision of the verifier, the 401 vs pass of the middleware, the
cascade after a delete — and should not reach into private helpers or assert on
internal call order. The four chosen seams are deliberately the ones with the cleanest
behavioral contracts.

Tests are specified for all four confirmed seams:

1. **HMAC auth verifier** — golden-vector tests. Given a known bot token and a payload
   with a correctly computed hash, `verify_telegram_auth` returns the user dict; with a
   tampered hash it returns `None`; with a stale `auth_date` it returns `None`; with
   missing required fields it returns `None`. Pure function, no fixtures beyond
   constants — highest value, lowest cost.
2. **Export composer** — fixture-driven golden output. Given a space + ordered context
   blobs + curated jobs (with enrichment + annotations) + a tag set,
   `compose_space_export` returns the exact expected markdown: blobs lead, the tag
   legend lists **only used tags**, each source carries its full enrichment + notes,
   and the transcript is absent. Deterministic; assert the whole string or section by
   section.
3. **Session store + middleware** — behavioral roundtrip and gate. `mint → resolve`
   returns the same user; `revoke` then `resolve` returns `None`. Middleware: a request
   to `/api/*` with no/invalid cookie gets 401; with a valid cookie it passes and the
   tenant is attached; `/webhook` and `/health` pass regardless. Use a fake/in-memory
   Redis or a test Redis.
4. **DB CRUD + FK cascade** — proves the load-bearing PRAGMA. Create a space with
   `space_urls` + `context_blobs`, delete the space, assert both child sets are gone
   (proves `PRAGMA foreign_keys=ON` in `connection()`). Separately, assert a user
   template whose name collides with a built-in (`method`) is rejected at create.

**Prior art in the codebase to mirror:**

- `tests` already exercise `brain.search_links` with random vectors and an in-memory
  corpus — the pattern for pure-function + small-fixture tests (use for the composer
  and verifier).
- The Telegram **sender seam** (ADR-0015) shows the codebase's module-qualified-patch
  test style — apply the same single-seam patching discipline to the session store /
  Redis in middleware tests.
- Existing `database.py` domain-CRUD functions (`get_allowed_domains`,
  `add_ignored_domain`, …) are the template for the new async CRUD and their tests.

---

## Out of Scope

- **NotebookLM push** (ADR-0017) — the forked/pinned `notebooklm-py` sidecar (flagged,
  dedicated Google account) is an explicit **fast-follow**, not MVP.
- **JWT / stateless sessions** — deliberately rejected (ADR-0016); Redis opaque
  sessions only.
- **Server-side FTS5 feed search** — deferred future; MVP feed search is fuse.js
  client-side over the fetched job list.
- **Brain multi-tenancy** (\[\[Brain tiers]]) — the brain stays global for MVP; the
  private/community/group tiers and the `/brain` My/Community toggle are future.
- **Group-chat dashboard access** — the web app supports the private \[\[Tenant]] kind
  only; group access is a separate user type, no data-model change required to add
  later.
- **Per-item export selection** — exports are whole-space in MVP.
- **Transcript in exports** — excluded for size (future toggle).
- **Enforcing** **`brave_search`** **/** **`content_type_scope`** **on user templates** — stored but
  unenforced in MVP; only `extra_instructions` is honored.
- **Server-side PDF generation** — PDF is client-side only (`@react-pdf/renderer`),
  keeping the FastAPI image free of cairo/pango native deps.
- **Space icons** — color only in MVP (color+icon is future).
- **New URL ingestion from the web** — the dashboard is read-mostly; Telegram remains
  the only ingestion channel.

## Further Notes

- The `ignored_domains` per-chat drift is tracked separately as **issue #81**; the
  Controls page's Ignored tab depends on that fix to behave per-chat (plan Q15).
- The dash-sigil decision (`-name` for user templates vs `/name` for built-ins) is
  what makes name resolution unambiguous: collisions are rejected at create, so
  `jobs.template = "<name>"` always resolves to exactly one template (ADR-0019).
- The export composer being a **pure** module is intentional: it is the single piece
  of logic shared by the `.md`/`.txt`/`pdf`/`gdoc` exports today and the NotebookLM
  push payload tomorrow — keeping it I/O-free keeps both paths testable.
- Invariant #12 (`PRAGMA foreign_keys=ON` in `connection()`) is the single most
  load-bearing line in this PRD: every `ON DELETE CASCADE` on the eight new tables
  depends on it, and pre-web tables had almost no FKs, so the gap was previously
  harmless and is easy to miss.

---

### Implementation phases (reference)

| Phase  | Scope                                                                                  |
| ------ | -------------------------------------------------------------------------------------- |
| 0      | Move `src/api.py` → `src/api/brain.py`; add `PRAGMA foreign_keys=ON` to `connection()` |
| 1      | Append 8 tables to `SCHEMA_SQL` (incl. `tags.meaning`) + async CRUD                    |
| 2      | `templates` table + `-name` webhook branch (built-ins stay in code)                    |
| 3      | API routers under `/api/` + Redis session middleware (`/api/*` only)                   |
| 4      | Next.js scaffold, shadcn/ui, Tailwind, Option-A rewrites                               |
| 5      | Auth flow: Login Widget → session cookie                                               |
| 6      | Feed: hero stats + fuse.js + job list + Scope-A polling                                |
| 7      | Job detail: enrichment + copy buttons + annotate (Milkdown notes)                      |
| 8      | Spaces: list + detail (URLs + Context tabs) + export modal (md/txt/pdf/gdoc)           |
| 9      | Prompts: built-ins read-only + user-template builder                                   |
| 10     | Controls: allowed/ignored (per-chat) + tags (with meaning)                             |
| 11     | Brain: semantic search UI (reuses `/api/brain/search`)                                 |
| 12     | docker-compose `web` service + Dockerfile                                              |
| **FF** | **Fast-follow:** NotebookLM push sidecar (forked `notebooklm-py`, flagged) — ADR-0017  |
