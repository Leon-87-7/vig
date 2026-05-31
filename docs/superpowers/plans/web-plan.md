# Full-Stack Web App — vig Dashboard

## Context

The project is currently a Telegram-only service. All interaction happens through the bot, and enriched results are only accessible via Google Drive/Sheets. The goal is to build a web dashboard where users can view and manage their processed URLs, curate research spaces, build context for NotebookLM exports, manage bot templates, and search the Second Brain — without replacing Telegram as the ingestion channel.

Designed for single-user now, multi-tenant SaaS-light later. The existing `chat_id` column on all tables is the natural tenant key.

---

## Decisions Log

| Topic | Decision |
|---|---|
| Auth | Telegram Login Widget; other methods out of scope |
| Users | Single-user MVP, multi-tenant ready (chat_id scoping) |
| Frontend | Next.js + shadcn/ui, monorepo at `/web` |
| Deployment | Separate containers in docker-compose (FastAPI + Next.js Node.js) |
| Future hosting | VPS (FastAPI/SQLite/Redis) + Vercel (Next.js) |
| Real-time | 10-second polling for pending/processing jobs only |
| Job actions | Read + annotate (notes + tags) + copy per-field + full export |
| Annotations | Global per-job (not per-space); notes in markdown, tags from /controls |
| Spaces | Named collections, color (MVP), color+icon (future) |
| Space contents | 2 tabs: URLs (curated source list) + Context (multiple named markdown blobs) |
| Space prompts | Dropped — use context blobs instead |
| Export | Modal with 3 formats: Google Doc (Drive push), .md download, .txt download |
| Templates | DB-backed, live in bot, fields: name, description, trigger_patterns, extra_instructions, brave_search, content_type_scope; built-ins undeleteable |
| Brain page | /brain — semantic search, ranked by similarity + seen count |
| Tags | Managed in /controls; applied globally per-job |

---

## Page Map (8 pages)

| Route | Description |
|---|---|
| `/login` | Telegram Login Widget |
| `/` | Feed: hero (3 stat cards + fuzzy search) + recent jobs, filterable by content_type/status |
| `/jobs/[id]` | Job detail: full enrichment, annotate (notes + tags), copy per-field, export |
| `/spaces` | Spaces list with color swatches |
| `/spaces/[id]` | Space detail: URLs tab + Context tab, export modal in header |
| `/prompts` | Bot templates (built-ins undeleteable + user-created) |
| `/controls` | 3 tabs: Allowed Domains / Ignored Domains / Tags |
| `/brain` | Semantic search: query → ranked similar links |

---

## New Database Tables

Add to `src/database.py`. All tables include `chat_id` for future multi-tenancy.

```sql
-- Telegram-authenticated users
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id INTEGER UNIQUE NOT NULL,
  chat_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT,
  photo_url TEXT,
  auth_date INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bot templates (migrated from src/templates.py)
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  trigger_patterns TEXT,        -- JSON array
  extra_instructions TEXT,
  brave_search INTEGER DEFAULT 0,
  content_type_scope TEXT DEFAULT 'all',  -- 'all'|'short'|'long'|'article'
  is_builtin INTEGER DEFAULT 0,           -- undeleteable if 1
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User-defined tags
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, name)
);

-- Per-job annotation (notes only; tags via job_tags)
CREATE TABLE job_annotations (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job ↔ Tag junction
CREATE TABLE job_tags (
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, tag_id)
);

-- Spaces
CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Space ↔ Job junction (curated URL list)
CREATE TABLE space_urls (
  space_id TEXT REFERENCES spaces(id) ON DELETE CASCADE,
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id, job_id)
);

-- Context blobs (multiple named markdown docs per space)
CREATE TABLE context_blobs (
  id TEXT PRIMARY KEY,
  space_id TEXT REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Notes',
  content TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Backend Changes

### `src/database.py`
- Add all 8 new tables above
- Add migration logic (run `CREATE TABLE IF NOT EXISTS` on startup)
- Add async CRUD functions for each new entity

### `src/templates.py` → DB-backed
- On startup, seed `templates` table with the 5 built-in templates (is_builtin=1) if not present
- Refactor `get_template(name)` to query DB instead of hardcoded dict
- All callers in `src/processors/` and `src/telegram/webhook.py` continue working unchanged

### New FastAPI routers → `src/api/`

Create `src/api/__init__.py` and the following router files:

**`src/api/auth.py`**
- `POST /api/auth/telegram` — verify Telegram Login Widget HMAC hash, upsert user, return JWT in httpOnly cookie
- `POST /api/auth/logout`
- `GET /api/auth/me`

**`src/api/jobs.py`**
- `GET /api/jobs` — list jobs (chat_id scoped), filter by content_type/status, paginated
- `GET /api/jobs/stats` — total jobs, spaces count, brain links count (hero fold stats)
- `GET /api/jobs/search?q=` — SQLite FTS5 search across title, ai_topic, ai_action_points
- `GET /api/jobs/{id}` — full job detail
- `PUT /api/jobs/{id}/annotations` — upsert notes
- `POST /api/jobs/{id}/tags/{tag_id}` — add tag to job
- `DELETE /api/jobs/{id}/tags/{tag_id}` — remove tag

**`src/api/spaces.py`**
- `GET /api/spaces` — list spaces for chat_id
- `POST /api/spaces` — create space
- `GET /api/spaces/{id}` — space + URLs + blobs
- `PUT /api/spaces/{id}` — update name/color
- `DELETE /api/spaces/{id}`
- `POST /api/spaces/{id}/urls` — add job_id to space
- `DELETE /api/spaces/{id}/urls/{job_id}`
- `POST /api/spaces/{id}/export` — generate export (format: 'gdoc'|'md'|'txt'); reuse `src/services/drive.py` for gdoc
- `GET /api/spaces/{id}/blobs`
- `POST /api/spaces/{id}/blobs`
- `PUT /api/spaces/{id}/blobs/{blob_id}`
- `DELETE /api/spaces/{id}/blobs/{blob_id}`

**`src/api/templates.py`**
- `GET /api/templates`
- `POST /api/templates`
- `PUT /api/templates/{id}` — blocked if is_builtin=1
- `DELETE /api/templates/{id}` — blocked if is_builtin=1

**`src/api/controls.py`**
- Allowed domains: GET/POST/DELETE (reuse existing `allowed_domains` table)
- Ignored domains: GET/POST/DELETE (reuse existing `ignored_domains` table)
- Tags: GET/POST/PUT/DELETE on `tags` table

**`src/api/brain.py`**
- `GET /api/brain/search?q=` — embed query via `src/brain.py`, cosine similarity, return top K links

### `src/main.py`
- Mount all new routers under `/api` prefix
- Add JWT middleware (validate httpOnly cookie on protected routes)

---

## Frontend Structure (`/web`)

```
/web
  package.json          # Next.js 14, shadcn/ui, tailwindcss, fuse.js, @tiptap/react
  next.config.js        # API proxy to FastAPI (localhost:8000)
  /app
    layout.tsx          # Root layout: sidebar nav + auth guard
    /login/page.tsx     # Telegram Login Widget
    /page.tsx           # Feed
    /jobs/[id]/page.tsx # Job detail
    /spaces/page.tsx    # Spaces list
    /spaces/[id]/page.tsx # Space detail
    /prompts/page.tsx   # Templates
    /controls/page.tsx  # Domains + Tags tabs
    /brain/page.tsx     # Semantic search
  /components
    /ui/                # shadcn/ui primitives
    JobCard.tsx         # Feed card (title, type badge, status, tags)
    JobDetail.tsx       # Full enrichment view with copy buttons
    SpaceCard.tsx       # Space list item with color swatch
    ExportModal.tsx     # 3-format export modal
    MarkdownEditor.tsx  # TipTap markdown editor (context blobs, job notes)
    TagPicker.tsx       # Tag input with autocomplete
    FuzzySearch.tsx     # Global search bar (fuse.js client-side)
    StatCard.tsx        # Hero fold stat cards
  /lib
    auth.ts             # JWT cookie helpers
    api.ts              # Typed fetch wrappers for all endpoints
    polling.ts          # 10s polling hook for pending jobs
```

### Key component decisions
- **Markdown editor**: TipTap (context blobs + job notes)
- **Fuzzy search**: fuse.js client-side on the fetched job list (no extra round-trip for MVP)
- **Copy buttons**: one per AI field (ai_objective, ai_action_points, etc.) + "copy all as markdown"
- **Export modal**: `ExportModal` component used from both job detail and space detail
- **Auth guard**: middleware in `layout.tsx` — redirect to `/login` if no valid JWT cookie

---

## docker-compose changes

Add `web` service to `docker-compose.yml`:

```yaml
web:
  build:
    context: ./web
    dockerfile: Dockerfile
  ports:
    - "3000:3000"
  environment:
    - NEXT_PUBLIC_API_URL=http://api:8000
  depends_on:
    - api
```

---

## Implementation Phases

| Phase | Scope |
|---|---|
| 1 | DB migrations: add all 8 new tables to `database.py` |
| 2 | Template DB migration: seed built-ins, refactor `templates.py` to read from DB, update bot callers |
| 3 | FastAPI API layer: all routers in `src/api/`, JWT auth middleware |
| 4 | Next.js scaffold: `/web` directory, shadcn/ui, Tailwind, Next.js 14 app router |
| 5 | Auth flow: Telegram Login Widget → JWT cookie |
| 6 | Feed page: hero stats + fuzzy search + job list + polling |
| 7 | Job detail page: enrichment view + copy buttons + annotate |
| 8 | Spaces pages: list + detail (URLs tab + Context tab + export modal) |
| 9 | Prompts page: template builder + built-in list |
| 10 | Controls page: 3 tabs (domains × 2 + tags) |
| 11 | Brain page: semantic search UI |
| 12 | docker-compose: add `web` service + Dockerfile |

---

## Existing Code to Reuse

| What | Where |
|---|---|
| Domain list CRUD | `src/database.py` — `get_allowed_domains`, `add_allowed_domain`, etc. |
| Brain semantic search | `src/brain.py` — `search_brain(query, top_k)` |
| Drive export | `src/services/drive.py` — adapt `upload_file()` for space export |
| Gemini embedding | `src/services/gemini.py` — reuse for brain search query embedding |
| Job DB queries | `src/database.py` — `get_job()`, `list_jobs()` |

---

## Verification

1. **DB**: run app, confirm all 8 new tables created via `sqlite3 data/vig.db .tables`
2. **Template migration**: send a URL to Telegram bot, confirm template detected from DB (not hardcoded)
3. **Auth**: open `/login`, complete Telegram widget flow, confirm redirect to `/` with valid cookie
4. **Feed**: confirm jobs appear, stat cards show real counts, fuzzy search finds results
5. **Job detail**: confirm all AI fields render, copy button writes to clipboard, notes save on blur
6. **Space export**: create space, add 2 jobs, export as .md — confirm all job fields appear in output
7. **Brain**: query `/brain`, confirm ranked results match `/find` output from Telegram bot
8. **Template live**: create new template in `/prompts`, send matching URL to bot, confirm new template fires
