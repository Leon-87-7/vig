# Issue #7 — Mini-PRD Intent Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Mini-PRD intent slot end-to-end: `📐 Build Spec` button → sub-menu → either auto PRD (cached re-send or lazy generation) or intent path (ForceReply → chat_state → Gemini Pro with intent bias). `/spec` command provides recovery path.

**Architecture:** Lazy generation on click only — no tail-call from enrichment. Webhook callbacks fire status messages and enqueue work to the worker; worker handles Gemini, Drive, Sheets, and final document delivery. `intent_text` flows through the DB (`jobs.prd_intent_text` column), never through the Redis envelope. Drive uses `files.update()` for in-place updates so file_ids stay stable.

**Tech Stack:** Python 3.12, FastAPI, aiosqlite, redis-py asyncio, google-genai SDK, google-api-python-client (Drive/Sheets), httpx (Telegram), pytest + aiosqlite for tests.

**Spec:** [`docs/superpowers/specs/2026-05-20-issue-7-intent-slot-design.md`](../specs/2026-05-20-issue-7-intent-slot-design.md)

**Files touched:**

| File | Action |
|------|--------|
| `src/database.py` | Add 5 helpers (`get_chat_state`, `set_chat_state`, `clear_chat_state`, `find_jobs_by_suffix`, `get_recent_jobs`); add `update_job_fields` helper to write `prd_intent_text` |
| `src/services/drive.py` | Add `update_file(file_id, content, mime_type)` |
| `src/services/sheets.py` | Extend `append_prd_row` signature with `slot` and `intent_text` kwargs |
| `src/telegram/sender.py` | Add `send_force_reply(chat_id, text)` |
| `src/processors/prd.py` | Add `build_summary_lines`, `reaper_intent`, `run_auto_resend`, `run_intent`; refactor `build_prd_markdown` for intent_text; refactor `run_auto` to use update_file when cached and to move delivery out of the lock body |
| `src/processors/enrichment.py` | Remove tail-call block at lines 239–242 |
| `src/telegram/webhook.py` | Replace `prd_build_spec` stub; add 4 new callback handlers; reorder message routing; add `/spec` and `/cancel` |
| `src/worker.py` | Add 2 dispatch cases; add `reaper_intent` boot call |
| `tests/test_database.py` | **New file** — chat_state CRUD, suffix lookup tests |
| `tests/test_prd.py` | Additions for new functions + cooldown gate tests |
| `tests/test_webhook.py` | **New file** — callback handlers, routing, /spec, /cancel tests |

---

## Task 1: DB layer — `chat_state` CRUD helpers

**Files:**
- Modify: `src/database.py` (append new helpers)
- Create: `tests/test_database.py`

### Step 1: Write failing test for `set_chat_state` + `get_chat_state` round-trip

- [ ] Create `tests/test_database.py` with this content:

```python
"""Unit tests for src/database.py helpers added in slice #7."""
from __future__ import annotations

import asyncio
import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import aiosqlite
import pytest


@pytest.fixture
async def temp_db():
    """Create a fresh SQLite file with the full schema applied."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    # Patch settings.DB_PATH for the duration of the test
    with patch("src.config.settings.DB_PATH", path):
        from src import database as db
        await db.init_db()
        yield path
    os.unlink(path)


@pytest.mark.asyncio
async def test_set_and_get_chat_state_round_trip(temp_db):
    from src import database as db
    await db.set_chat_state(chat_id=42, mode="awaiting_intent", job_id="20260521_120000_AAAA")
    state = await db.get_chat_state(42)
    assert state is not None
    assert state["chat_id"] == 42
    assert state["mode"] == "awaiting_intent"
    assert state["job_id"] == "20260521_120000_AAAA"
    assert state["expires_at"] > datetime.now(timezone.utc).isoformat()


@pytest.mark.asyncio
async def test_get_chat_state_missing_returns_none(temp_db):
    from src import database as db
    assert await db.get_chat_state(999) is None


@pytest.mark.asyncio
async def test_clear_chat_state_removes_row(temp_db):
    from src import database as db
    await db.set_chat_state(chat_id=1, mode="awaiting_intent", job_id="J1")
    await db.clear_chat_state(1)
    assert await db.get_chat_state(1) is None


@pytest.mark.asyncio
async def test_clear_chat_state_idempotent(temp_db):
    from src import database as db
    await db.clear_chat_state(999)  # no-op, must not raise


@pytest.mark.asyncio
async def test_set_chat_state_pk_replace(temp_db):
    """Second set overwrites the first (PK on chat_id)."""
    from src import database as db
    await db.set_chat_state(chat_id=7, mode="awaiting_intent", job_id="J_OLD")
    await db.set_chat_state(chat_id=7, mode="awaiting_intent", job_id="J_NEW")
    state = await db.get_chat_state(7)
    assert state["job_id"] == "J_NEW"
```

- [ ] Run: `pytest tests/test_database.py -v`
- [ ] Expected: All 5 tests FAIL with `AttributeError: module 'src.database' has no attribute 'set_chat_state'`

### Step 2: Implement `set_chat_state`, `get_chat_state`, `clear_chat_state`

- [ ] Append to `src/database.py` (after the existing `update_job_status` function):

```python
async def get_chat_state(chat_id: int) -> dict | None:
    """Return the chat_state row for chat_id, or None if absent."""
    async with connection() as conn:
        cursor = await conn.execute(
            "SELECT chat_id, mode, job_id, created_at, expires_at FROM chat_state WHERE chat_id = ?",
            (chat_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def set_chat_state(
    chat_id: int, mode: str, job_id: str, expires_minutes: int = 10
) -> None:
    """Insert or replace a chat_state row (PK chat_id gives upsert semantics).

    Logs ``prd.chat_state.replaced_other_job`` when overwriting a row for a different job_id.
    """
    existing = await get_chat_state(chat_id)
    if existing and existing["job_id"] != job_id:
        log.info(
            "prd.chat_state.replaced_other_job",
            chat_id=chat_id,
            old_job_id=existing["job_id"],
            new_job_id=job_id,
        )
    async with connection() as conn:
        await conn.execute(
            """
            INSERT OR REPLACE INTO chat_state (chat_id, mode, job_id, created_at, expires_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, datetime('now', '+' || ? || ' minutes'))
            """,
            (chat_id, mode, job_id, expires_minutes),
        )
        await conn.commit()


async def clear_chat_state(chat_id: int) -> None:
    """Remove the chat_state row for chat_id, if any. Idempotent."""
    async with connection() as conn:
        await conn.execute("DELETE FROM chat_state WHERE chat_id = ?", (chat_id,))
        await conn.commit()
```

- [ ] Run: `pytest tests/test_database.py -v`
- [ ] Expected: All 5 tests PASS.

### Step 3: Add tests for `find_jobs_by_suffix` and `get_recent_jobs`

- [ ] Append to `tests/test_database.py`:

```python
async def _insert_job(path: str, job_id: str, chat_id: int, content_type: str, status: str, title: str = "") -> None:
    async with aiosqlite.connect(path) as conn:
        await conn.execute(
            "INSERT INTO jobs (id, chat_id, url, content_type, status, title) VALUES (?, ?, ?, ?, ?, ?)",
            (job_id, chat_id, f"https://x.test/{job_id}", content_type, status, title),
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_find_jobs_by_suffix_returns_all_content_types(temp_db):
    from src import database as db
    await _insert_job(temp_db, "20260521_120000_AAAA", 1, "long", "done", "Long video A")
    await _insert_job(temp_db, "20260521_120100_AAAA", 1, "short", "done", "Short video A")
    await _insert_job(temp_db, "20260521_120200_BBBB", 1, "long", "done", "Long video B")
    rows = await db.find_jobs_by_suffix(1, "AAAA")
    assert len(rows) == 2
    # Ordered by created_at DESC; the short was inserted second
    assert rows[0]["content_type"] == "short"
    assert rows[1]["content_type"] == "long"


@pytest.mark.asyncio
async def test_find_jobs_by_suffix_chat_scoped(temp_db):
    from src import database as db
    await _insert_job(temp_db, "20260521_120000_AAAA", 1, "long", "done")
    await _insert_job(temp_db, "20260521_120000_BBBB", 2, "long", "done")
    rows = await db.find_jobs_by_suffix(1, "BBBB")
    assert rows == []


@pytest.mark.asyncio
async def test_get_recent_jobs_orders_desc_and_limits(temp_db):
    from src import database as db
    for i in range(7):
        await _insert_job(temp_db, f"2026052{i}_120000_J{i:03d}1", 1, "long", "done", f"job {i}")
    rows = await db.get_recent_jobs(1, limit=5)
    assert len(rows) == 5
    assert rows[0]["title"] == "job 6"  # most recent first
```

- [ ] Run: `pytest tests/test_database.py -v -k "suffix or recent"`
- [ ] Expected: 3 tests FAIL with `AttributeError`.

### Step 4: Implement `find_jobs_by_suffix` and `get_recent_jobs`

- [ ] Append to `src/database.py`:

```python
async def find_jobs_by_suffix(chat_id: int, suffix: str) -> list[dict]:
    """Return all jobs in chat_id whose id ends with suffix. Ordered by created_at DESC.

    Returns all content_types and statuses. Caller filters as needed
    (see webhook /spec handler).
    """
    async with connection() as conn:
        cursor = await conn.execute(
            "SELECT * FROM jobs WHERE chat_id = ? AND id LIKE '%' || ? ORDER BY created_at DESC",
            (chat_id, suffix),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_recent_jobs(chat_id: int, limit: int = 5) -> list[dict]:
    """Return the most-recent jobs in chat_id, capped at limit."""
    async with connection() as conn:
        cursor = await conn.execute(
            "SELECT id, title, content_type, status FROM jobs "
            "WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?",
            (chat_id, limit),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
```

- [ ] Run: `pytest tests/test_database.py -v`
- [ ] Expected: All 8 tests PASS.

### Step 5: Commit

```bash
git add src/database.py tests/test_database.py
git commit -m "feat(#7): database helpers — chat_state CRUD + suffix lookup"
```

---

## Task 2: Drive `update_file` for in-place updates

**Files:**
- Modify: `src/services/drive.py`

### Step 1: Add `update_file` to drive.py

- [ ] Append to `src/services/drive.py`:

```python
def _update_sync(file_id: str, content: str | bytes, mime_type: str) -> str:
    if isinstance(content, str):
        content = content.encode("utf-8")
    service = _build_service()
    media = MediaInMemoryUpload(content, mimetype=mime_type, resumable=False)
    result = (
        service.files()
        .update(fileId=file_id, media_body=media, fields="webViewLink", supportsAllDrives=True)
        .execute()
    )
    return result["webViewLink"]


async def update_file(
    file_id: str,
    content: str | bytes,
    mime_type: str = "text/markdown",
) -> str:
    """In-place update of a Drive file. Returns the (unchanged) webViewLink."""
    link = await asyncio.to_thread(_update_sync, file_id, content, mime_type)
    log.info("drive_updated", file_id=file_id)
    return link
```

### Step 2: Smoke check via import

- [ ] Run: `python -c "from src.services.drive import update_file; print(update_file)"`
- [ ] Expected: prints `<function update_file at 0x...>`.

### Step 3: Commit

```bash
git add src/services/drive.py
git commit -m "feat(#7): drive.update_file for in-place PRD updates"
```

---

## Task 3: Sheets `append_prd_row` signature extension

**Files:**
- Modify: `src/services/sheets.py`

### Step 1: Update signature with defaulted kwargs

- [ ] Edit `src/services/sheets.py:130–153` — replace the `append_prd_row` function body so it accepts `slot` and `intent_text`:

```python
async def append_prd_row(
    *,
    job_id: str,
    video_url: str,
    title: str,
    drive_url: str,
    slot: str = "auto",
    intent_text: str | None = None,
) -> None:
    """Append one row to GOOGLE_SHEETS_ID_PRD.
    Columns: job_id, video_url, title, slot, intent_text, drive_url, created_at
    """
    row = [
        job_id,
        video_url,
        title,
        slot,
        intent_text,
        drive_url,
        datetime.now(timezone.utc).isoformat(),
    ]
    try:
        await asyncio.to_thread(_append_sync, settings.GOOGLE_SHEETS_ID_PRD, row)
        log.info("sheets_prd_appended", job_id=job_id, slot=slot)
    except Exception:
        log.exception("sheets_prd_failed", job_id=job_id, slot=slot)
        raise  # let caller decide; previously was swallowed
```

Note: the `raise` at the end is new — the spec requires sheets failures to be surfaced to the user. The previous behaviour swallowed exceptions silently.

### Step 2: Verify no existing caller breaks

- [ ] Run: `grep -rn "append_prd_row" src/ tests/`
- [ ] Expected: only one caller in `src/processors/prd.py:317`. Confirm it does not pass extra kwargs (it doesn't — it uses keyword-only with no slot/intent_text, which will now default to `"auto"` / `None`).

### Step 3: Commit

```bash
git add src/services/sheets.py
git commit -m "feat(#7): append_prd_row gets slot + intent_text kwargs; surface failures"
```

---

## Task 4: Sender — `send_force_reply`

**Files:**
- Modify: `src/telegram/sender.py`

### Step 1: Add `send_force_reply` function

- [ ] Append to `src/telegram/sender.py` (after `send_inline_keyboard`):

```python
async def send_force_reply(
    chat_id: int,
    text: str,
    *,
    input_field_placeholder: str = "Your project direction...",
) -> dict[str, Any]:
    """Send a message that forces the user's next reply to address the bot."""
    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": {
            "force_reply": True,
            "input_field_placeholder": input_field_placeholder,
        },
    }
    response = await _http().post(_endpoint("sendMessage"), json=payload)
    response.raise_for_status()
    body = response.json()
    if not body.get("ok"):
        log.error("telegram_force_reply_failed", chat_id=chat_id, response=body)
        raise RuntimeError(f"Telegram sendMessage (ForceReply) failed: {body!r}")
    log.info("telegram_force_reply_sent", chat_id=chat_id)
    return body.get("result", {})
```

### Step 2: Commit

```bash
git add src/telegram/sender.py
git commit -m "feat(#7): sender.send_force_reply for intent prompt"
```

---

## Task 5: PRD processor — `build_prd_markdown(intent_text=)` + `build_summary_lines`

**Files:**
- Modify: `src/processors/prd.py`
- Modify: `tests/test_prd.py`

### Step 1: Write failing tests

- [ ] Append to `tests/test_prd.py`:

```python
# ---------------------------------------------------------------------------
# build_prd_markdown with intent_text (slice #7)
# ---------------------------------------------------------------------------

def test_build_prd_markdown_with_intent_text():
    from src.processors.prd import build_prd_markdown
    prd = {"project": "Demo App", "overview": "Short overview.", "phases": [], "open_questions": []}
    md = build_prd_markdown(prd, intent_text="desktop app for agentic image processing")
    assert "**Your direction:** _desktop app for agentic image processing_" in md
    # Direction must appear immediately after the title line
    lines = md.splitlines()
    title_idx = next(i for i, l in enumerate(lines) if l.startswith("# PRD:"))
    assert "Your direction" in lines[title_idx + 1] or "Your direction" in lines[title_idx + 2]


def test_build_prd_markdown_without_intent_text():
    from src.processors.prd import build_prd_markdown
    prd = {"project": "Demo App", "phases": [], "open_questions": []}
    md = build_prd_markdown(prd)
    assert "Your direction" not in md


# ---------------------------------------------------------------------------
# build_summary_lines (slice #7)
# ---------------------------------------------------------------------------

def test_build_summary_lines_zero_overview_sentences():
    from src.processors.prd import build_summary_lines
    prd = {"project": "Demo App", "overview": "", "phases": [{"name": "P1", "deliverables": ["d"]}],
           "features": [{"name": "f1"}, {"name": "f2"}]}
    lines = build_summary_lines(prd)
    assert lines == ["Project: Demo App", "1 phases, 2 features"]


def test_build_summary_lines_one_overview_sentence():
    from src.processors.prd import build_summary_lines
    prd = {"project": "X", "overview": "This is a single sentence.", "phases": [], "features": []}
    lines = build_summary_lines(prd)
    assert lines == ["Project: X", "This is a single sentence.", "0 phases, 0 features"]


def test_build_summary_lines_caps_at_two_overview_sentences():
    from src.processors.prd import build_summary_lines
    prd = {"project": "X", "overview": "One. Two. Three. Four.", "phases": [], "features": []}
    lines = build_summary_lines(prd)
    assert lines == ["Project: X", "One.", "Two.", "0 phases, 0 features"]
```

- [ ] Run: `pytest tests/test_prd.py -v -k "intent_text or summary_lines"`
- [ ] Expected: 5 tests FAIL.

### Step 2: Modify `build_prd_markdown` to accept `intent_text`

- [ ] Edit `src/processors/prd.py:38–43` — change function signature and insert direction line:

Replace:
```python
def build_prd_markdown(prd: dict) -> str:
    """Render a PRD JSON dict to a structured markdown document."""
    lines: list[str] = []

    lines.append(f"# PRD: {prd.get('project', 'Untitled')}")
    lines.append("")
```

With:
```python
def build_prd_markdown(prd: dict, *, intent_text: str | None = None) -> str:
    """Render a PRD JSON dict to a structured markdown document.

    If intent_text is provided, insert a 'Your direction' line immediately
    after the title.
    """
    lines: list[str] = []

    lines.append(f"# PRD: {prd.get('project', 'Untitled')}")
    lines.append("")
    if intent_text:
        lines.append(f"**Your direction:** _{intent_text}_")
        lines.append("")
```

### Step 3: Add `build_summary_lines` helper

- [ ] Add to `src/processors/prd.py` (right after `build_prd_markdown`):

```python
def build_summary_lines(prd: dict) -> list[str]:
    """Build a 2-4 line summary for Telegram delivery.

    Always starts with 'Project: <name>' and ends with '{N} phases, {M} features'.
    The middle is 0, 1, or 2 sentences from prd['overview'].
    """
    lines = [f"Project: {prd.get('project', 'Untitled')}"]
    overview = (prd.get("overview") or "").strip()
    if overview:
        # Naive sentence split — sufficient for Gemini-generated overview text
        import re as _re
        sentences = [s.strip() for s in _re.split(r"(?<=[.!?])\s+", overview) if s.strip()]
        lines.extend(sentences[:2])
    n_phases = len(prd.get("phases", []))
    n_features = len(prd.get("features", []))
    lines.append(f"{n_phases} phases, {n_features} features")
    return lines
```

### Step 4: Run tests to confirm pass

- [ ] Run: `pytest tests/test_prd.py -v -k "intent_text or summary_lines"`
- [ ] Expected: 5 tests PASS.

### Step 5: Commit

```bash
git add src/processors/prd.py tests/test_prd.py
git commit -m "feat(#7): build_prd_markdown intent_text + build_summary_lines"
```

---

## Task 6: PRD processor — `reaper_intent`

**Files:**
- Modify: `src/processors/prd.py`
- Modify: `tests/test_prd.py`

### Step 1: Write failing test

- [ ] Append to `tests/test_prd.py`:

```python
# ---------------------------------------------------------------------------
# reaper_intent (slice #7)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reaper_intent_resets_stale_generating_rows(temp_db_for_prd):
    """A 'generating' row older than 10 minutes is reset to 'error'."""
    import aiosqlite
    from src.processors import prd
    # Insert a stale 'generating' row
    async with aiosqlite.connect(temp_db_for_prd) as conn:
        await conn.execute(
            "INSERT INTO jobs (id, chat_id, url, content_type, status, prd_intent_status, updated_at) "
            "VALUES ('J_STALE', 1, 'u', 'long', 'done', 'generating', datetime('now','-15 minutes'))"
        )
        await conn.execute(
            "INSERT INTO jobs (id, chat_id, url, content_type, status, prd_intent_status, updated_at) "
            "VALUES ('J_FRESH', 1, 'u', 'long', 'done', 'generating', datetime('now','-2 minutes'))"
        )
        await conn.commit()
    await prd.reaper_intent()
    async with aiosqlite.connect(temp_db_for_prd) as conn:
        conn.row_factory = aiosqlite.Row
        cur = await conn.execute("SELECT id, prd_intent_status FROM jobs ORDER BY id")
        rows = await cur.fetchall()
    statuses = {r["id"]: r["prd_intent_status"] for r in rows}
    assert statuses == {"J_FRESH": "generating", "J_STALE": "error"}
```

You'll also need a `temp_db_for_prd` fixture — add at the top of `tests/test_prd.py` (if a similar fixture is missing):

```python
@pytest.fixture
async def temp_db_for_prd():
    """Create a temp SQLite file with the full schema applied, patched into settings."""
    import os as _os
    import tempfile as _tf
    from unittest.mock import patch as _patch
    fd, path = _tf.mkstemp(suffix=".db")
    _os.close(fd)
    with _patch("src.config.settings.DB_PATH", path):
        from src import database as _db
        await _db.init_db()
        yield path
    _os.unlink(path)
```

- [ ] Run: `pytest tests/test_prd.py -v -k "reaper_intent"`
- [ ] Expected: FAIL with `AttributeError: module 'src.processors.prd' has no attribute 'reaper_intent'`.

### Step 2: Implement `reaper_intent`

- [ ] Add to `src/processors/prd.py` (right next to existing `reaper`):

```python
async def reaper_intent() -> None:
    """Reset stale in-progress intent-slot PRD jobs (run once at worker startup)."""
    async with database.connection() as conn:
        cur = await conn.execute(
            "UPDATE jobs SET prd_intent_status='error', updated_at=CURRENT_TIMESTAMP "
            "WHERE prd_intent_status='generating' AND updated_at < datetime('now','-10 minutes')"
        )
        await conn.commit()
        if cur.rowcount:
            log.info("prd.reaper_intent.released", count=cur.rowcount)
```

- [ ] Run: `pytest tests/test_prd.py -v -k "reaper_intent"`
- [ ] Expected: PASS.

### Step 3: Commit

```bash
git add src/processors/prd.py tests/test_prd.py
git commit -m "feat(#7): reaper_intent for stale intent-slot locks"
```

---

## Task 7: PRD processor — refactor `run_auto` (remove auto-delivery, use update_file for cached)

**Files:**
- Modify: `src/processors/prd.py`

The current `run_auto` always uses `drive.upload_file` (create) and ends with `sendDocument` + `send_inline_keyboard`. With lazy generation:

1. If `prd_auto_drive_file_id` already exists in DB, call `drive.update_file` instead of `upload_file` (in-place update).
2. Delivery (sendDocument + summary + button) moves out — it now happens unconditionally at the end of `run_auto`, but the **trigger** for `run_auto` is exclusively the user click (no tail-call) so it's still "lazy."

### Step 1: Modify Drive step to branch on cached file_id

- [ ] Edit `src/processors/prd.py:298–311` — replace:

```python
    # g. Upload to Drive
    from src.services.drive import upload_file

    slug = re.sub(r"[^a-z0-9]+", "_", (prd_data.get("project") or "prd").lower())[:40].strip("_")
    filename = f"{slug}_{job_id[-4:]}_auto.md"
    try:
        file_id, drive_url = await upload_file(
            md_content, filename, settings.GOOGLE_DRIVE_FOLDER_PRD
        )
        log.info("prd.drive.uploaded", job_id=job_id, file_id=file_id)
    except Exception:
        log.error("prd.drive.failed", job_id=job_id)
        await database.update_job_status(job_id, job["status"], prd_auto_status="error")
        return
```

With:

```python
    # g. Drive upload (create on first run, update in place thereafter)
    from src.services.drive import upload_file, update_file

    slug = re.sub(r"[^a-z0-9]+", "_", (prd_data.get("project") or "prd").lower())[:40].strip("_")
    filename = f"{slug}_{job_id[-4:]}_auto.md"
    cached_file_id = job.get("prd_auto_drive_file_id")
    cached_drive_url = job.get("prd_auto_drive_url")
    try:
        if cached_file_id:
            drive_url = await update_file(cached_file_id, md_content)
            file_id = cached_file_id
            log.info("prd.drive.updated", job_id=job_id, file_id=file_id, slot="auto")
        else:
            file_id, drive_url = await upload_file(
                md_content, filename, settings.GOOGLE_DRIVE_FOLDER_PRD
            )
            log.info("prd.drive.uploaded", job_id=job_id, file_id=file_id, slot="auto")
    except Exception:
        log.error("prd.drive.failed", job_id=job_id, slot="auto")
        await database.update_job_status(job_id, job["status"], prd_auto_status="error")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            job["chat_id"],
            "⚠️ Drive upload failed.",
            buttons=[[{"text": "🔄 Retry", "callback_data": f"prd_retry_auto:{job_id}"}]],
        )
        return
```

### Step 2: Surface sheets failures with retry button

- [ ] Edit `src/processors/prd.py:316–325` — replace the try/except around `append_prd_row` with:

```python
    # h. Sheets append
    from src.services.sheets import append_prd_row

    try:
        await append_prd_row(
            job_id=job_id,
            video_url=job["url"],
            title=job.get("title", ""),
            drive_url=drive_url,
            slot="auto",
        )
        log.info("prd.sheets.appended", job_id=job_id, slot="auto")
    except Exception:
        log.warning("prd.sheets.failed", job_id=job_id, slot="auto")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            job["chat_id"],
            "⚠️ PRD generated but sheet append failed.",
            buttons=[[{"text": "🔄 Retry", "callback_data": f"prd_retry_auto:{job_id}"}]],
        )
        # Continue to deliver the document — sheets failure isn't fatal for the user
```

### Step 3: Replace the silent delivery block with full delivery + summary + refinement button

- [ ] Edit `src/processors/prd.py:354–367` — replace the current `# k. Telegram delivery` block with:

```python
    # k. Telegram delivery
    from src.telegram.sender import send_document, send_message, send_inline_keyboard
    await send_document(
        chat_id,
        md_content.encode("utf-8"),
        filename,
        caption="📐 Auto-generated PRD",
    )
    summary_lines = build_summary_lines(prd_data)
    await send_message(chat_id, "\n".join(summary_lines))
    await send_inline_keyboard(
        chat_id,
        "💡 Want to refine? Build a deeper spec:",
        buttons=[[{"text": "📐 Build Spec", "callback_data": f"prd_build_spec:{job_id}"}]],
    )
```

### Step 4: Surface Gemini both-keys-failed and parse failures with retry buttons

- [ ] Edit `src/processors/prd.py:282–293` — replace:

```python
    if raw_prd is None:
        log.error("prd.gemini.both_keys_failed", job_id=job_id)
        await database.update_job_status(job_id, job["status"], prd_auto_status="error")
        return

    # e. Parse JSON
    try:
        prd_data = _extract_json(raw_prd)
    except Exception:
        log.error("prd.parse_failed", job_id=job_id, raw_preview=raw_prd[:200])
        await database.update_job_status(job_id, job["status"], prd_auto_status="error")
        return
```

With:

```python
    if raw_prd is None:
        log.error("prd.gemini.both_keys_failed", job_id=job_id, slot="auto")
        await database.update_job_status(job_id, job["status"], prd_auto_status="error")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            chat_id,
            "⚠️ PRD generation failed (Gemini keys exhausted). Try again in a few minutes.",
            buttons=[[{"text": "🔄 Retry", "callback_data": f"prd_retry_auto:{job_id}"}]],
        )
        return

    # e. Parse JSON
    try:
        prd_data = _extract_json(raw_prd)
    except Exception:
        log.error("prd.parse_failed", job_id=job_id, raw_preview=raw_prd[:200], slot="auto")
        await database.update_job_status(job_id, job["status"], prd_auto_status="error")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            chat_id,
            "⚠️ PRD generation produced invalid output.",
            buttons=[[{"text": "🔄 Retry", "callback_data": f"prd_retry_auto:{job_id}"}]],
        )
        return
```

### Step 5: Run existing PRD tests to make sure nothing regressed

- [ ] Run: `pytest tests/test_prd.py -v`
- [ ] Expected: all existing tests still PASS (including the new slice-#7 tests).

### Step 6: Commit

```bash
git add src/processors/prd.py
git commit -m "refactor(#7): run_auto uses update_file when cached + surfaces failures with retry"
```

---

## Task 8: PRD processor — `run_auto_resend`

**Files:**
- Modify: `src/processors/prd.py`

When the user clicks `🤖 Build auto Spec` on a job whose PRD was already generated (`prd_auto_status='done'`), we re-render from cached JSON and update Drive in place.

### Step 1: Implement `run_auto_resend`

- [ ] Add to `src/processors/prd.py` (right before `run_auto`):

```python
async def run_auto_resend(job_id: str) -> None:
    """Re-deliver an existing auto-slot PRD without re-calling Gemini.

    Reads ``prd_auto_json`` and ``prd_auto_drive_file_id`` from the DB,
    re-renders markdown (in case ``build_prd_markdown`` improved), updates
    the Drive file in place, and re-sends the document to Telegram.
    """
    job = await database.get_job(job_id)
    if not job:
        log.error("prd.auto_resend.job_not_found", job_id=job_id)
        return
    chat_id = job["chat_id"]
    cached_file_id = job.get("prd_auto_drive_file_id")
    cached_json = job.get("prd_auto_json")
    if not cached_file_id or not cached_json:
        log.warning(
            "prd.auto_resend.cache_missing",
            job_id=job_id,
            has_file_id=bool(cached_file_id),
            has_json=bool(cached_json),
        )
        from src.telegram.sender import send_message, send_inline_keyboard
        await send_message(chat_id, "⚠️ Cached PRD missing. Regenerating from scratch...")
        await run_auto(job_id)
        return

    try:
        prd_data = json.loads(cached_json)
    except Exception:
        log.error("prd.auto_resend.json_parse_failed", job_id=job_id)
        await run_auto(job_id)
        return

    md_content = build_prd_markdown(prd_data)
    slug = re.sub(r"[^a-z0-9]+", "_", (prd_data.get("project") or "prd").lower())[:40].strip("_")
    filename = f"{slug}_{job_id[-4:]}_auto.md"

    from src.services.drive import update_file
    from src.telegram.sender import send_document, send_message, send_inline_keyboard
    try:
        await update_file(cached_file_id, md_content)
        log.info("prd.drive.updated", job_id=job_id, file_id=cached_file_id, slot="auto_resend")
    except Exception:
        log.exception("prd.auto_resend.drive_failed", job_id=job_id)
        # Fall through — we still have md_content locally, deliver it
    await send_document(
        chat_id, md_content.encode("utf-8"), filename, caption="📐 Auto-generated PRD"
    )
    summary_lines = build_summary_lines(prd_data)
    await send_message(chat_id, "\n".join(summary_lines))
    await send_inline_keyboard(
        chat_id,
        "💡 Want to refine? Build a deeper spec:",
        buttons=[[{"text": "📐 Build Spec", "callback_data": f"prd_build_spec:{job_id}"}]],
    )
```

### Step 2: Add a unit test

- [ ] Append to `tests/test_prd.py`:

```python
@pytest.mark.asyncio
async def test_run_auto_resend_uses_cached_json(temp_db_for_prd, monkeypatch):
    """run_auto_resend reads cached JSON and calls update_file (not upload_file)."""
    from unittest.mock import AsyncMock
    import aiosqlite
    from src.processors import prd

    # Seed a job with cached JSON and file_id
    cached = '{"project":"Cached","overview":"","phases":[],"open_questions":[]}'
    async with aiosqlite.connect(temp_db_for_prd) as conn:
        await conn.execute(
            "INSERT INTO jobs (id, chat_id, url, content_type, status, prd_auto_status, "
            "prd_auto_drive_file_id, prd_auto_drive_url, prd_auto_json) "
            "VALUES ('J_CACHE', 1, 'u', 'long', 'done', 'done', 'DRIVE_ID_1', 'http://x', ?)",
            (cached,),
        )
        await conn.commit()

    # Patch Drive + sender so no network
    updated = AsyncMock(return_value="http://x")
    monkeypatch.setattr("src.services.drive.update_file", updated)
    monkeypatch.setattr("src.telegram.sender.send_document", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.send_inline_keyboard", AsyncMock())

    await prd.run_auto_resend("J_CACHE")

    updated.assert_awaited_once()
    args, _ = updated.await_args
    assert args[0] == "DRIVE_ID_1"
    assert "Cached" in args[1]  # rendered markdown contains project name
```

- [ ] Run: `pytest tests/test_prd.py -v -k "auto_resend"`
- [ ] Expected: PASS.

### Step 3: Commit

```bash
git add src/processors/prd.py tests/test_prd.py
git commit -m "feat(#7): run_auto_resend for cached PRD re-delivery"
```

---

## Task 9: PRD processor — `run_intent` with cooldown gate

**Files:**
- Modify: `src/processors/prd.py`
- Modify: `tests/test_prd.py`

### Step 1: Write failing cooldown gate tests

- [ ] Append to `tests/test_prd.py`:

```python
# ---------------------------------------------------------------------------
# run_intent cooldown gate (slice #7)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_intent_cooldown_blocks_within_15s(temp_db_for_prd, monkeypatch):
    """Second run_intent within 15s of a successful run is blocked by the cooldown gate."""
    import aiosqlite
    from unittest.mock import AsyncMock
    from src.processors import prd

    # Seed a job that just completed an intent generation 5 seconds ago
    async with aiosqlite.connect(temp_db_for_prd) as conn:
        await conn.execute(
            "INSERT INTO jobs (id, chat_id, url, content_type, status, "
            "prd_intent_status, prd_intent_completed_at, prd_intent_text, transcript) "
            "VALUES ('J_CD', 1, 'u', 'long', 'done', 'done', "
            "datetime('now','-5 seconds'), 'first intent', 'transcript text')"
        )
        await conn.commit()

    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_inline_keyboard", sent)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())

    await prd.run_intent("J_CD")

    # Lock should NOT have been acquired — status stays 'done'
    async with aiosqlite.connect(temp_db_for_prd) as conn:
        conn.row_factory = aiosqlite.Row
        row = await (await conn.execute(
            "SELECT prd_intent_status FROM jobs WHERE id='J_CD'"
        )).fetchone()
    assert row["prd_intent_status"] == "done"


@pytest.mark.asyncio
async def test_intent_cooldown_allows_after_15s(temp_db_for_prd, monkeypatch):
    """Run > 15s after a previous completion acquires the lock."""
    import aiosqlite
    from unittest.mock import AsyncMock
    from src.processors import prd

    async with aiosqlite.connect(temp_db_for_prd) as conn:
        await conn.execute(
            "INSERT INTO jobs (id, chat_id, url, content_type, status, "
            "prd_intent_status, prd_intent_completed_at, prd_intent_text, transcript) "
            "VALUES ('J_OK', 1, 'u', 'long', 'done', 'done', "
            "datetime('now','-30 seconds'), 'second intent', 'transcript text')"
        )
        await conn.commit()

    # Stub everything downstream
    monkeypatch.setattr(
        "src.processors.prd._call_gemini_prd_sync",
        lambda prompt, key: '{"project":"X","category":"Other","overview":"","phases":[],"open_questions":[]}',
    )
    monkeypatch.setattr("src.services.drive.upload_file", AsyncMock(return_value=("FID","URL")))
    monkeypatch.setattr("src.services.drive.update_file", AsyncMock(return_value="URL"))
    monkeypatch.setattr("src.services.sheets.append_prd_row", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.send_document", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.send_inline_keyboard", AsyncMock())
    # Avoid brain ingest network
    monkeypatch.setattr("src.brain.ingest_links", AsyncMock())
    # And ensure folder var is set for the optional brain block
    from src.config import settings
    monkeypatch.setattr(settings, "GOOGLE_DRIVE_FOLDER_BRAIN", "")

    await prd.run_intent("J_OK")

    # Lock acquired and run completed → status should be 'done' again (after the run)
    async with aiosqlite.connect(temp_db_for_prd) as conn:
        conn.row_factory = aiosqlite.Row
        row = await (await conn.execute(
            "SELECT prd_intent_status, prd_intent_completed_at FROM jobs WHERE id='J_OK'"
        )).fetchone()
    assert row["prd_intent_status"] == "done"
    assert row["prd_intent_completed_at"] is not None
```

- [ ] Run: `pytest tests/test_prd.py -v -k "intent_cooldown"`
- [ ] Expected: 2 tests FAIL with `AttributeError: module 'src.processors.prd' has no attribute 'run_intent'`.

### Step 2: Implement `run_intent`

- [ ] Add to `src/processors/prd.py` (after `run_auto_resend`):

```python
async def run_intent(job_id: str) -> None:
    """Generate, upload, log and deliver an intent-slot Mini-PRD.

    Reads ``intent_text`` from ``job.prd_intent_text`` (set by the webhook
    handler before enqueueing). Never receives intent_text via the Redis
    envelope (privacy + retry support).
    """
    job = await database.get_job(job_id)
    if not job:
        log.error("prd.intent.job_not_found", job_id=job_id)
        return
    chat_id = job["chat_id"]
    intent_text = (job.get("prd_intent_text") or "").strip()
    if not intent_text:
        log.error("prd.intent.no_intent_text", job_id=job_id)
        return
    if not (job.get("transcript") or "").strip():
        from src.telegram.sender import send_message
        await send_message(chat_id, "⚠️ No transcript available — can't generate PRD.")
        log.warning("prd.intent.no_transcript", job_id=job_id)
        return

    # a. Atomic lock + cooldown gate
    async with database.connection() as conn:
        cur = await conn.execute(
            "UPDATE jobs SET prd_intent_status='generating', updated_at=CURRENT_TIMESTAMP "
            "WHERE id=? AND (prd_intent_status IS NULL OR prd_intent_status IN ('error','done')) "
            "AND (prd_intent_completed_at IS NULL OR prd_intent_completed_at < datetime('now','-' || ? || ' seconds'))",
            (job_id, settings.PRD_INTENT_COOLDOWN_SECONDS),
        )
        await conn.commit()
        if cur.rowcount == 0:
            log.info("prd.cooldown_blocked", job_id=job_id, slot="intent")
            from src.telegram.sender import send_message
            await send_message(chat_id, "📐 Last PRD just generated. Try again in a moment.")
            return
    log.info("prd.lock_acquired", job_id=job_id, slot="intent")

    # b. Prompt (intent-biased)
    transcript = sample_transcript(
        job.get("transcript") or "", settings.PRD_MAX_TRANSCRIPT_CHARS
    )
    prompt = (
        f"The user's project direction: {intent_text}. Use this to shape the PRD.\n\n"
        "You are a product architect. Based on the following transcript and enrichment "
        "analysis, generate a Mini-PRD JSON document.\n\n"
        f"Video: {job.get('title', '')}\n"
        f"Topic: {job.get('ai_topic', '')}\n"
        f"Objective: {job.get('ai_objective', '')}\n"
        f"Action Points: {job.get('ai_action_points', '')}\n"
        f"Tools: {job.get('ai_tools', '')}\n\n"
        f"Transcript:\n{transcript}\n\n"
        "Return the PRD as JSON matching the provided schema."
    )

    # c. Gemini call (free → paid fallback). Note: model = PRD_INTENT_MODEL.
    raw_prd = None
    for key in [settings.GEMINI_FREE_API_KEY, settings.GEMINI_PAID_API_KEY]:
        if not key:
            continue
        try:
            raw_prd = await asyncio.to_thread(_call_gemini_intent_sync, prompt, key)
            log.info("prd.gemini.success", job_id=job_id, slot="intent")
            break
        except Exception:
            log.warning("prd.gemini.fallback", job_id=job_id, slot="intent")
    if raw_prd is None:
        log.error("prd.gemini.both_keys_failed", job_id=job_id, slot="intent")
        await database.update_job_status(job_id, job["status"], prd_intent_status="error")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            chat_id,
            "⚠️ PRD generation failed (Gemini keys exhausted). Try again in a few minutes.",
            buttons=[[
                {"text": "🔄 Retry Same Intent", "callback_data": f"prd_retry_intent:{job_id}"},
                {"text": "✍️ New Intent", "callback_data": f"prd_intent_prompt:{job_id}"},
            ]],
        )
        return

    # d. Parse JSON
    try:
        prd_data = _extract_json(raw_prd)
    except Exception:
        log.error("prd.parse_failed", job_id=job_id, slot="intent", raw_preview=raw_prd[:200])
        await database.update_job_status(job_id, job["status"], prd_intent_status="error")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            chat_id,
            "⚠️ PRD generation produced invalid output.",
            buttons=[[
                {"text": "🔄 Retry Same Intent", "callback_data": f"prd_retry_intent:{job_id}"},
                {"text": "✍️ New Intent", "callback_data": f"prd_intent_prompt:{job_id}"},
            ]],
        )
        return

    # e. Markdown
    md_content = build_prd_markdown(prd_data, intent_text=intent_text)
    slug = re.sub(r"[^a-z0-9]+", "_", (prd_data.get("project") or "prd").lower())[:40].strip("_")
    filename = f"{slug}_{job_id[-4:]}_intent.md"

    # f. Drive (create on first run, update in place thereafter)
    from src.services.drive import upload_file, update_file
    cached_file_id = job.get("prd_intent_drive_file_id")
    try:
        if cached_file_id:
            drive_url = await update_file(cached_file_id, md_content)
            file_id = cached_file_id
            log.info("prd.drive.updated", job_id=job_id, file_id=file_id, slot="intent")
        else:
            file_id, drive_url = await upload_file(
                md_content, filename, settings.GOOGLE_DRIVE_FOLDER_PRD
            )
            log.info("prd.drive.uploaded", job_id=job_id, file_id=file_id, slot="intent")
    except Exception:
        log.error("prd.drive.failed", job_id=job_id, slot="intent")
        await database.update_job_status(job_id, job["status"], prd_intent_status="error")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            chat_id,
            "⚠️ Drive upload failed.",
            buttons=[[
                {"text": "🔄 Retry Same Intent", "callback_data": f"prd_retry_intent:{job_id}"},
                {"text": "✍️ New Intent", "callback_data": f"prd_intent_prompt:{job_id}"},
            ]],
        )
        return

    # g. Sheets append
    from src.services.sheets import append_prd_row
    try:
        await append_prd_row(
            job_id=job_id,
            video_url=job["url"],
            title=job.get("title", ""),
            drive_url=drive_url,
            slot="intent",
            intent_text=intent_text,
        )
        log.info("prd.sheets.appended", job_id=job_id, slot="intent")
    except Exception:
        log.warning("prd.sheets.failed", job_id=job_id, slot="intent")
        from src.telegram.sender import send_inline_keyboard
        await send_inline_keyboard(
            chat_id,
            "⚠️ PRD generated but sheet append failed.",
            buttons=[[
                {"text": "🔄 Retry Same Intent", "callback_data": f"prd_retry_intent:{job_id}"},
            ]],
        )
        # continue to deliver

    # h. Update job DB — prd_intent_completed_at written ONLY on success
    await database.update_job_status(
        job_id,
        job["status"],
        prd_intent_status="done",
        prd_intent_drive_file_id=file_id,
        prd_intent_drive_url=drive_url,
        prd_intent_json=json.dumps(prd_data),
        prd_intent_completed_at=datetime.now(timezone.utc).isoformat(),
    )

    # i. Brain ingest (fire-and-forget)
    tech_stack = prd_data.get("tech_stack", [])
    brain_links = [
        {"url": t["url"], "label": t["name"], "description": t.get("purpose", "")}
        for t in tech_stack
        if t.get("url")
    ]
    if brain_links and settings.GOOGLE_DRIVE_FOLDER_BRAIN:
        from src import brain
        asyncio.create_task(
            brain.ingest_links(brain_links, topic=prd_data.get("project", ""), source_job_id=job_id)
        )
        log.info("prd.brain.dispatched", job_id=job_id, slot="intent", count=len(brain_links))

    # j. Telegram delivery
    from src.telegram.sender import send_document, send_message, send_inline_keyboard
    await send_document(
        chat_id,
        md_content.encode("utf-8"),
        filename,
        caption=f"📐 PRD with your direction: _{intent_text}_",
    )
    summary_lines = build_summary_lines(prd_data)
    await send_message(chat_id, "\n".join(summary_lines))
    await send_inline_keyboard(
        chat_id,
        "💡 Want to refine further? Text another intent.",
        buttons=[[{"text": "✍️ Text your intent", "callback_data": f"prd_intent_prompt:{job_id}"}]],
    )


def _call_gemini_intent_sync(prompt: str, api_key: str) -> str:
    """Same as _call_gemini_prd_sync but uses PRD_INTENT_MODEL."""
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=api_key)
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=PRD_JSON_SCHEMA,
    )
    response = client.models.generate_content(
        model=settings.PRD_INTENT_MODEL, contents=prompt, config=config
    )
    return response.text
```

### Step 3: Run all PRD tests

- [ ] Run: `pytest tests/test_prd.py -v`
- [ ] Expected: all tests PASS (including the 2 new cooldown tests).

### Step 4: Commit

```bash
git add src/processors/prd.py tests/test_prd.py
git commit -m "feat(#7): run_intent with cooldown gate + intent-biased prompt + Pro model"
```

---

## Task 10: Worker dispatch cases + boot reaper

**Files:**
- Modify: `src/worker.py`

### Step 1: Add `prd_intent` and `prd_auto_resend` cases + intent reaper

- [ ] Edit `src/worker.py` — replace lines 62–70 (the `prd_auto` block and `else`) with:

```python
    elif task_type == "prd_auto":
        try:
            from src.processors import prd as _prd
            await _prd.run_auto(job_id)
        except Exception:
            log.exception("prd_auto_error", job_id=job_id)
            # User already sees status reply from webhook; surface a generic failure
            try:
                job = await database.get_job(job_id)
                if job:
                    from src.telegram.sender import send_inline_keyboard
                    await send_inline_keyboard(
                        job["chat_id"],
                        "⚠️ PRD generation failed unexpectedly.",
                        buttons=[[{"text": "🔄 Retry", "callback_data": f"prd_retry_auto:{job_id}"}]],
                    )
            except Exception:
                pass
    elif task_type == "prd_auto_resend":
        try:
            from src.processors import prd as _prd
            await _prd.run_auto_resend(job_id)
        except Exception:
            log.exception("prd_auto_resend_error", job_id=job_id)
    elif task_type == "prd_intent":
        try:
            from src.processors import prd as _prd
            await _prd.run_intent(job_id)
        except Exception:
            log.exception("prd_intent_error", job_id=job_id)
            try:
                job = await database.get_job(job_id)
                if job:
                    from src.telegram.sender import send_inline_keyboard
                    await send_inline_keyboard(
                        job["chat_id"],
                        "⚠️ PRD generation failed unexpectedly.",
                        buttons=[[
                            {"text": "🔄 Retry Same Intent", "callback_data": f"prd_retry_intent:{job_id}"},
                            {"text": "✍️ New Intent", "callback_data": f"prd_intent_prompt:{job_id}"},
                        ]],
                    )
            except Exception:
                pass
    else:
        log.error("unknown_task", task=task_type, job_id=job_id)
```

### Step 2: Call `reaper_intent` at boot

- [ ] Edit `src/worker.py` — find this block:

```python
    from src.processors import prd as _prd
    await _prd.reaper()
```

- [ ] Replace with:

```python
    from src.processors import prd as _prd
    await _prd.reaper()
    await _prd.reaper_intent()
```

### Step 3: Smoke-test import

- [ ] Run: `python -c "from src import worker; print('ok')"`
- [ ] Expected: prints `ok` (no ImportError).

### Step 4: Commit

```bash
git add src/worker.py
git commit -m "feat(#7): worker dispatches prd_intent + prd_auto_resend; boot intent reaper"
```

---

## Task 11: Remove enrichment tail-call

**Files:**
- Modify: `src/processors/enrichment.py`

### Step 1: Delete the tail-call block

- [ ] Edit `src/processors/enrichment.py:239–242` — remove these 4 lines:

```python
    if enrichment.category == "Technical Tutorial" and settings.GOOGLE_DRIVE_FOLDER_PRD:
        from src import queue as _queue
        await _queue.enqueue({"task": "prd_auto", "job_id": job_id})
        log.info("prd.auto.enqueued", job_id=job_id)
```

Leave the `📐 Build Spec` button at line 234 in place — it's still the entry point.

### Step 2: Run the full test suite to make sure nothing breaks

- [ ] Run: `pytest tests/ -v`
- [ ] Expected: all tests PASS. (The existing test `test_prd_auto_enqueued_on_technical_tutorial` in `tests/test_prd.py` — if any — will need updating; check first.)
- [ ] If a test exercises the removed tail-call, delete or update that test to match the new lazy flow.

### Step 3: Commit

```bash
git add src/processors/enrichment.py tests/test_prd.py
git commit -m "refactor(#7): remove Technical-Tutorial tail-call; PRDs now lazy-on-click"
```

---

## Task 12: Webhook callback handlers

**Files:**
- Modify: `src/telegram/webhook.py`
- Create: `tests/test_webhook.py`

### Step 1: Write failing tests for the 5 callbacks

- [ ] Create `tests/test_webhook.py` with:

```python
"""Unit tests for src/telegram/webhook.py callbacks + routing (slice #7)."""
from __future__ import annotations

import os
import tempfile
from unittest.mock import AsyncMock, patch

import aiosqlite
import pytest


@pytest.fixture
async def temp_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    with patch("src.config.settings.DB_PATH", path):
        from src import database as db
        await db.init_db()
        yield path
    os.unlink(path)


async def _seed_job(path: str, job_id: str, chat_id: int = 1, **fields) -> None:
    cols = ["id", "chat_id", "url", "content_type", "status"]
    vals = [job_id, chat_id, "u", fields.get("content_type", "long"), fields.get("status", "done")]
    for k, v in fields.items():
        if k in ("content_type", "status"):
            continue
        cols.append(k)
        vals.append(v)
    placeholders = ",".join("?" * len(cols))
    async with aiosqlite.connect(path) as conn:
        await conn.execute(
            f"INSERT INTO jobs ({','.join(cols)}) VALUES ({placeholders})", vals
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_callback_prd_build_spec_sends_submenu(temp_db, monkeypatch):
    from src.telegram import webhook
    sent_kb = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_inline_keyboard", sent_kb)
    monkeypatch.setattr("src.telegram.sender.answer_callback_query", AsyncMock())
    callback = {"id": "CB1", "data": "prd_build_spec:J1", "message": {"chat": {"id": 100}}}
    await webhook._handle_callback(callback)
    sent_kb.assert_awaited_once()
    args, kwargs = sent_kb.await_args
    # Should send a 2-button sub-menu
    buttons = kwargs.get("buttons") or args[2]
    btn_texts = [b["text"] for row in buttons for b in row]
    assert "🤖 Build auto Spec" in btn_texts
    assert "✍️ Text your intent" in btn_texts


@pytest.mark.asyncio
async def test_callback_prd_auto_resend_when_status_done(temp_db, monkeypatch):
    from src.telegram import webhook
    await _seed_job(temp_db, "J_DONE", chat_id=100, prd_auto_status="done", prd_auto_json='{"x":1}')
    enqueued = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enqueued)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.answer_callback_query", AsyncMock())
    await webhook._handle_callback(
        {"id": "CB", "data": "prd_auto:J_DONE", "message": {"chat": {"id": 100}}}
    )
    enqueued.assert_awaited_once_with({"task": "prd_auto_resend", "job_id": "J_DONE"})


@pytest.mark.asyncio
async def test_callback_prd_auto_lazy_when_status_null(temp_db, monkeypatch):
    from src.telegram import webhook
    await _seed_job(temp_db, "J_NULL", chat_id=100)
    enqueued = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enqueued)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.answer_callback_query", AsyncMock())
    await webhook._handle_callback(
        {"id": "CB", "data": "prd_auto:J_NULL", "message": {"chat": {"id": 100}}}
    )
    enqueued.assert_awaited_once_with({"task": "prd_auto", "job_id": "J_NULL"})


@pytest.mark.asyncio
async def test_callback_prd_intent_prompt_arms_state(temp_db, monkeypatch):
    from src.telegram import webhook
    from src import database as db
    await _seed_job(temp_db, "J_ARM", chat_id=100)
    fr = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_force_reply", fr)
    monkeypatch.setattr("src.telegram.sender.answer_callback_query", AsyncMock())
    await webhook._handle_callback(
        {"id": "CB", "data": "prd_intent_prompt:J_ARM", "message": {"chat": {"id": 100}}}
    )
    state = await db.get_chat_state(100)
    assert state is not None
    assert state["job_id"] == "J_ARM"
    fr.assert_awaited_once()


@pytest.mark.asyncio
async def test_callback_prd_intent_prompt_debounces_same_job(temp_db, monkeypatch):
    from src.telegram import webhook
    from src import database as db
    await _seed_job(temp_db, "J_DBN", chat_id=100)
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J_DBN")
    fr = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_force_reply", fr)
    monkeypatch.setattr("src.telegram.sender.answer_callback_query", AsyncMock())
    await webhook._handle_callback(
        {"id": "CB", "data": "prd_intent_prompt:J_DBN", "message": {"chat": {"id": 100}}}
    )
    fr.assert_not_awaited()
```

- [ ] Run: `pytest tests/test_webhook.py -v`
- [ ] Expected: 5 tests FAIL (existing stub doesn't do any of this).

### Step 2: Replace the callback handlers in webhook.py

- [ ] Edit `src/telegram/webhook.py` — replace the `_handle_callback` function entirely with:

```python
async def _handle_callback(callback: dict) -> None:
    """Dispatch callback_query events from inline keyboard button presses."""
    from src.telegram.sender import (
        answer_callback_query,
        send_force_reply,
        send_inline_keyboard,
        send_message,
    )
    cq_id = callback.get("id", "")
    data = callback.get("data", "")
    chat_id = (callback.get("message") or {}).get("chat", {}).get("id")
    log.info("callback_received", callback_data=data, chat_id=chat_id)

    if data.startswith("gemini_no:"):
        job_id = data.split(":", 1)[1]
        await database.update_job_status(job_id, "done")
        await answer_callback_query(cq_id)

    elif data.startswith("gemini_yes:"):
        job_id = data.split(":", 1)[1]
        job = await database.get_job(job_id)
        if not job or job.get("status") != "transcript_done":
            await answer_callback_query(cq_id, text="This job is not ready for enrichment.")
            return
        await database.update_job_status(job_id, "enriching")
        await queue.enqueue({"task": "enrichment", "job_id": job_id})
        await answer_callback_query(cq_id)

    elif data.startswith("prd_build_spec:"):
        job_id = data.split(":", 1)[1]
        await send_inline_keyboard(
            chat_id,
            "📐 Build Spec — pick a path:",
            buttons=[[
                {"text": "🤖 Build auto Spec", "callback_data": f"prd_auto:{job_id}"},
                {"text": "✍️ Text your intent", "callback_data": f"prd_intent_prompt:{job_id}"},
            ]],
        )
        await answer_callback_query(cq_id)

    elif data.startswith("prd_auto:") or data.startswith("prd_retry_auto:"):
        job_id = data.split(":", 1)[1]
        job = await database.get_job(job_id)
        if not job:
            await answer_callback_query(cq_id, text="Job not found.")
            return
        await answer_callback_query(cq_id)
        if job.get("prd_auto_status") == "done" and job.get("prd_auto_json"):
            await send_message(chat_id, "📐 Re-sending your PRD...")
            await queue.enqueue({"task": "prd_auto_resend", "job_id": job_id})
        else:
            # Lazy generation. Atomic lock try before enqueueing.
            async with database.connection() as conn:
                cur = await conn.execute(
                    "UPDATE jobs SET prd_auto_status='generating', updated_at=CURRENT_TIMESTAMP "
                    "WHERE id=? AND (prd_auto_status IS NULL OR prd_auto_status='error')",
                    (job_id,),
                )
                await conn.commit()
                acquired = cur.rowcount > 0
            if acquired:
                await send_message(chat_id, "📐 Generating PRD, hang tight...")
                await queue.enqueue({"task": "prd_auto", "job_id": job_id})
            else:
                await send_message(chat_id, "📐 PRD already generating, hang tight.")

    elif data.startswith("prd_intent_prompt:"):
        job_id = data.split(":", 1)[1]
        existing = await database.get_chat_state(chat_id)
        if existing and existing["job_id"] == job_id:
            await answer_callback_query(cq_id)
            return
        await database.set_chat_state(chat_id=chat_id, mode="awaiting_intent", job_id=job_id)
        log.info("prd.chat_state.armed", chat_id=chat_id, job_id=job_id)
        await send_force_reply(
            chat_id,
            'Reply with your project direction. Example: "desktop app for agentic image '
            'processing" (reply within 10 minutes; type /cancel to abandon)',
        )
        await answer_callback_query(cq_id)

    elif data.startswith("prd_retry_intent:"):
        job_id = data.split(":", 1)[1]
        job = await database.get_job(job_id)
        if not job or not (job.get("prd_intent_text") or "").strip():
            await answer_callback_query(cq_id, text="No prior intent to retry — use ✍️ New Intent.")
            return
        await answer_callback_query(cq_id)
        await send_message(chat_id, "📐 Generating PRD, hang tight...")
        await queue.enqueue({"task": "prd_intent", "job_id": job_id})

    else:
        log.warning("unknown_callback", data=data)
        await answer_callback_query(cq_id)
```

### Step 3: Run callback tests

- [ ] Run: `pytest tests/test_webhook.py -v`
- [ ] Expected: all 5 callback tests PASS.

### Step 4: Commit

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "feat(#7): webhook callbacks — sub-menu, lazy/cached auto, intent prompt, retries"
```

---

## Task 13: Webhook routing — slash commands + awaiting_intent path

**Files:**
- Modify: `src/telegram/webhook.py`
- Modify: `tests/test_webhook.py`

### Step 1: Write failing routing tests

- [ ] Append to `tests/test_webhook.py`:

```python
async def _post_webhook(text: str, chat_id: int = 100, secret: str = "S"):
    """Helper that invokes the webhook handler with a text message."""
    from fastapi import Request
    # Minimal Request stub
    class _Req:
        def __init__(self, body): self._body = body
        async def json(self): return self._body
    from src.telegram.webhook import webhook
    body = {"message": {"chat": {"id": chat_id}, "text": text, "message_id": 1}}
    return await webhook(_Req(body), x_telegram_bot_api_secret_token=secret)


@pytest.fixture(autouse=True)
def _patch_webhook_secret(monkeypatch):
    monkeypatch.setattr("src.config.settings.TELEGRAM_WEBHOOK_SECRET", "S")


@pytest.mark.asyncio
async def test_routing_awaiting_intent_plain_text_enqueues(temp_db, monkeypatch):
    from src import database as db
    await _seed_job(temp_db, "J_TXT", chat_id=100, transcript="t")
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J_TXT")
    enq = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enq)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    await _post_webhook("a smart desktop tool for managing my photos")
    enq.assert_awaited_once_with({"task": "prd_intent", "job_id": "J_TXT"})
    # intent_text persisted to DB
    job = await db.get_job("J_TXT")
    assert job["prd_intent_text"] == "a smart desktop tool for managing my photos"
    # state cleared
    assert await db.get_chat_state(100) is None


@pytest.mark.asyncio
async def test_routing_awaiting_intent_too_short(temp_db, monkeypatch):
    from src import database as db
    await _seed_job(temp_db, "J_S", chat_id=100)
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J_S")
    enq = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enq)
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("hi")  # 2 chars
    enq.assert_not_awaited()
    assert await db.get_chat_state(100) is not None  # state stays armed
    args, _ = sent.await_args
    assert "too short" in args[1].lower() or "5" in args[1]


@pytest.mark.asyncio
async def test_routing_awaiting_intent_too_long(temp_db, monkeypatch):
    from src import database as db
    await _seed_job(temp_db, "J_L", chat_id=100)
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J_L")
    enq = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enq)
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("x" * 1001)
    enq.assert_not_awaited()
    assert await db.get_chat_state(100) is not None  # armed
    args, _ = sent.await_args
    assert "too long" in args[1].lower() or "1000" in args[1]


@pytest.mark.asyncio
async def test_routing_awaiting_intent_url_starts_new_job(temp_db, monkeypatch):
    from src import database as db
    await _seed_job(temp_db, "J_U", chat_id=100)
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J_U")
    enq = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enq)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    await _post_webhook("https://youtu.be/dQw4w9WgXcQ")
    # video task enqueued, state cleared
    assert enq.await_args.args[0]["task"] == "video"
    assert await db.get_chat_state(100) is None


@pytest.mark.asyncio
async def test_cancel_with_armed_state(temp_db, monkeypatch):
    from src import database as db
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J")
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("/cancel")
    assert "Intent canceled" in sent.await_args.args[1]
    assert await db.get_chat_state(100) is None


@pytest.mark.asyncio
async def test_cancel_with_no_state(temp_db, monkeypatch):
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("/cancel")
    assert "Nothing to cancel" in sent.await_args.args[1]


@pytest.mark.asyncio
async def test_spec_no_args_usage(temp_db, monkeypatch):
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("/spec")
    assert "Usage" in sent.await_args.args[1]


@pytest.mark.asyncio
async def test_spec_no_match_shows_recent(temp_db, monkeypatch):
    await _seed_job(temp_db, "20260101_120000_AAAA", chat_id=100, title="A")
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("/spec XXXX")
    msg = sent.await_args.args[1]
    assert "No job ending in XXXX" in msg
    assert "AAAA" in msg


@pytest.mark.asyncio
async def test_spec_short_only_rejection(temp_db, monkeypatch):
    await _seed_job(temp_db, "20260101_120000_AAAA", chat_id=100, content_type="short", title="S")
    sent = AsyncMock()
    monkeypatch.setattr("src.telegram.sender.send_message", sent)
    await _post_webhook("/spec AAAA")
    assert "only available for long videos" in sent.await_args.args[1]


@pytest.mark.asyncio
async def test_spec_single_long_match_enqueues_auto(temp_db, monkeypatch):
    from src import database as db
    await _seed_job(
        temp_db, "20260101_120000_AAAA", chat_id=100, content_type="long",
        status="done", title="Tutorial"
    )
    enq = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enq)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    await _post_webhook("/spec AAAA")
    # No intent → enqueues prd_auto (or prd_auto_resend if cached). Both acceptable.
    assert enq.await_args.args[0]["task"] in ("prd_auto", "prd_auto_resend")


@pytest.mark.asyncio
async def test_spec_with_intent_enqueues_intent(temp_db, monkeypatch):
    from src import database as db
    await _seed_job(
        temp_db, "20260101_120000_AAAA", chat_id=100, content_type="long",
        status="done", title="Tutorial", transcript="t"
    )
    enq = AsyncMock()
    monkeypatch.setattr("src.queue.enqueue", enq)
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    await _post_webhook("/spec AAAA desktop app for image processing")
    assert enq.await_args.args[0] == {"task": "prd_intent", "job_id": "20260101_120000_AAAA"}
    job = await db.get_job("20260101_120000_AAAA")
    assert job["prd_intent_text"] == "desktop app for image processing"
```

- [ ] Run: `pytest tests/test_webhook.py -v`
- [ ] Expected: the 11 routing tests FAIL.

### Step 2: Refactor `webhook()` for new routing order

- [ ] Edit `src/telegram/webhook.py` — replace the body of the `webhook` function (the part after `update = await request.json()`) with the new routing. Replace lines from the `message = update.get("message")` block through end of function with:

```python
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    text = (message.get("text") or "").strip()
    message_id = message.get("message_id")

    log.info("webhook_received", chat_id=chat_id, message_id=message_id, text_len=len(text))

    # Photo path (unchanged)
    photo = message.get("photo")
    if photo and chat_id:
        file_id = photo[-1]["file_id"]
        caption = message.get("caption") or None
        if await _is_batch_active(chat_id):
            await _add_to_batch(chat_id, file_id)
        else:
            asyncio.create_task(_handle_single_photo(chat_id, file_id, caption))
        return {"ok": True}

    if not chat_id or not text:
        return {"ok": True}

    # 1. Slash command path — clear chat_state side-effect (except /cancel reads first)
    if text.startswith("/"):
        await _dispatch_slash(chat_id, text)
        return {"ok": True}

    # 2. Awaiting-intent path
    state = await database.get_chat_state(chat_id)
    if state:
        from datetime import datetime as _dt, timezone as _tz
        # Parse expires_at — stored as SQLite datetime string in UTC
        expires_at_raw = state["expires_at"]
        try:
            expires_at = _dt.fromisoformat(expires_at_raw.replace(" ", "T"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=_tz.utc)
        except Exception:
            expires_at = None
        if expires_at and expires_at > _dt.now(_tz.utc):
            await _handle_awaiting_intent(chat_id, text, state)
            return {"ok": True}
        else:
            log.info("prd.chat_state.expired_or_missed", chat_id=chat_id)
            # fall through

    # 3. Normal URL routing
    pipeline = detect_pipeline(text)
    if pipeline == "rejected":
        await send_message(
            chat_id,
            "❌ Unsupported URL. I accept YouTube videos, YouTube Shorts, "
            "Instagram Reels (not /p/ carousels), and TikTok videos.",
        )
        log.info("url_rejected", chat_id=chat_id, url=text)
        return {"ok": True}

    job_id = await database.create_job(
        chat_id=chat_id, url=text, content_type=pipeline, message_id=message_id,
    )
    await queue.enqueue({"task": "video", "job_id": job_id})
    await send_message(chat_id, f"📥 Received! \njob_{job_id[-4:]}")
    return {"ok": True}
```

### Step 3: Add `_dispatch_slash` and `_handle_awaiting_intent` helpers

- [ ] Add these helpers to `src/telegram/webhook.py` (above the `webhook()` function):

```python
async def _dispatch_slash(chat_id: int, text: str) -> None:
    """Slash command dispatch. Clears chat_state as a side effect (except /cancel reads first)."""
    parts = text.split()
    cmd = parts[0].lower()

    if cmd == "/cancel":
        state = await database.get_chat_state(chat_id)
        await database.clear_chat_state(chat_id)
        if state and state.get("mode") == "awaiting_intent":
            await send_message(chat_id, "✍️ Intent canceled.")
        else:
            await send_message(chat_id, "Nothing to cancel.")
        return

    # All other slash commands clear chat_state first
    await database.clear_chat_state(chat_id)

    if cmd == "/spec":
        await _handle_spec(chat_id, parts)
        return
    if cmd == "/find" and len(parts) > 1:
        query = " ".join(parts[1:]).strip()
        from src import brain
        results = await brain.search_links(query, top_k=5)
        if not results:
            await send_message(chat_id, "No relevant links found in your brain.")
        else:
            lines = [
                f"🔗 *{r['title']}* — {r['url']}\n   Topic: {r['topic']}\n   Score: {r['score']:.2f}"
                for r in results
            ]
            await send_message(chat_id, "\n\n".join(lines), parse_mode="Markdown")
        return
    if cmd == "/find":
        await send_message(chat_id, "Usage: /find <query>")
        return
    if cmd == "/rebuild-graph":
        from src import brain
        if brain._rebuild_lock.locked():
            await send_message(chat_id, "Rebuild already in progress — please wait.")
            return
        await send_message(chat_id, "Brain rebuild started — will take a few minutes")
        async def _do_rebuild():
            try:
                n = await brain.rebuild_graph()
                await send_message(chat_id, f"Graph rebuilt — {n} nodes written.")
            except Exception:
                await send_message(chat_id, "Rebuild failed. Check logs.")
        asyncio.create_task(_do_rebuild())
        return
    if cmd == "/photobatch-start":
        client = queue._client()
        await client.set(f"photo_batch_active:{chat_id}", "1", ex=300)
        await client.delete(f"photo_batch_files:{chat_id}")
        asyncio.create_task(_batch_auto_close(chat_id))
        deadline = (datetime.now(timezone.utc) + timedelta(seconds=300)).strftime("%H:%M:%S")
        await send_message(chat_id, f"📸 Batch mode started! The bus leaves at {deadline} UTC.")
        return
    if cmd == "/photobatch-end":
        if not await _is_batch_active(chat_id):
            await send_message(chat_id, "No active batch — use /photoBatch-start first.")
            return
        asyncio.create_task(_process_batch(chat_id))
        return
    # /start, /help, and any other slash falls through — Telegram handles natively


async def _handle_awaiting_intent(chat_id: int, text: str, state: dict) -> None:
    """Routing path when chat_state is armed and not expired."""
    job_id = state["job_id"]
    pipeline = detect_pipeline(text)
    if pipeline in ("short", "long"):
        await database.clear_chat_state(chat_id)
        await send_message(chat_id, "🔄 Started new job; previous intent canceled.")
        log.info("prd.chat_state.canceled_by_url", chat_id=chat_id, old_job_id=job_id)
        new_job_id = await database.create_job(
            chat_id=chat_id, url=text, content_type=pipeline
        )
        await queue.enqueue({"task": "video", "job_id": new_job_id})
        await send_message(chat_id, f"📥 Received! \njob_{new_job_id[-4:]}")
        return
    stripped = text.strip()
    if len(stripped) < 5:
        await send_message(
            chat_id,
            "📐 Intent too short (min 5 chars). Reply with a few words describing your project direction.",
        )
        log.info("prd.intent.too_short", chat_id=chat_id, intent_text_len=len(stripped))
        return
    if len(stripped) > 1000:
        await send_message(
            chat_id,
            "📐 Intent too long (max 1000 chars). Try a shorter direction.",
        )
        log.info("prd.intent.too_long", chat_id=chat_id, intent_text_len=len(stripped))
        return
    # Valid intent — persist to DB and enqueue
    async with database.connection() as conn:
        await conn.execute(
            "UPDATE jobs SET prd_intent_text=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            (stripped, job_id),
        )
        await conn.commit()
    await queue.enqueue({"task": "prd_intent", "job_id": job_id})
    await database.clear_chat_state(chat_id)
    log.info("prd.intent.enqueued", chat_id=chat_id, job_id=job_id, intent_text_len=len(stripped))
    log.info("prd.chat_state.consumed", chat_id=chat_id, job_id=job_id)


async def _handle_spec(chat_id: int, parts: list[str]) -> None:
    """Dispatch /spec <suffix> [intent...]."""
    if len(parts) < 2:
        await send_message(
            chat_id,
            'Usage: /spec <suffix> [intent text...]\nExample: /spec ABCD desktop app for X',
        )
        return
    suffix = parts[1][-4:]
    intent_text = " ".join(parts[2:]).strip() or None
    if intent_text is not None:
        if len(intent_text) < 5:
            await send_message(chat_id, "📐 Intent too short (min 5 chars).")
            return
        if len(intent_text) > 1000:
            await send_message(chat_id, "📐 Intent too long (max 1000 chars).")
            return
    rows = await database.find_jobs_by_suffix(chat_id, suffix)
    long_matches = [
        j for j in rows
        if j["content_type"] == "long" and j["status"] in ("transcript_done", "done")
    ]
    short_matches = [j for j in rows if j["content_type"] == "short"]

    if not long_matches and not short_matches:
        recent = await database.get_recent_jobs(chat_id, 5)
        bullet_lines = "\n".join(
            f"• job_{j['id'][-4:]} — {j.get('title') or '(no title)'} ({j['content_type']}/{j['status']})"
            for j in recent
        )
        await send_message(
            chat_id,
            f"No job ending in {suffix} found.\nLast 5 jobs in this chat:\n{bullet_lines}",
        )
        log.info("prd.spec.no_match", chat_id=chat_id, suffix=suffix)
        return

    if not long_matches and short_matches:
        await send_message(
            chat_id,
            f"📐 PRD is only available for long videos. Job {suffix} is a short.",
        )
        log.info("prd.spec.short_video_rejected", chat_id=chat_id, suffix=suffix)
        return

    job = long_matches[0]
    job_id = job["id"]
    title = job.get("title") or "(no title)"
    await send_message(chat_id, f'📐 PRD for: "{title}" — generating ...')
    log.info("prd.spec.matched", chat_id=chat_id, suffix=suffix, job_id=job_id, intent=bool(intent_text))

    if intent_text:
        async with database.connection() as conn:
            await conn.execute(
                "UPDATE jobs SET prd_intent_text=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (intent_text, job_id),
            )
            await conn.commit()
        await queue.enqueue({"task": "prd_intent", "job_id": job_id})
        log.info("prd.intent.enqueued", chat_id=chat_id, job_id=job_id, intent_text_len=len(intent_text))
    else:
        if job.get("prd_auto_status") == "done" and job.get("prd_auto_json"):
            await queue.enqueue({"task": "prd_auto_resend", "job_id": job_id})
        else:
            await queue.enqueue({"task": "prd_auto", "job_id": job_id})
```

### Step 4: Run all tests

- [ ] Run: `pytest tests/ -v`
- [ ] Expected: all tests PASS.

### Step 5: Commit

```bash
git add src/telegram/webhook.py tests/test_webhook.py
git commit -m "feat(#7): webhook routing — slash commands + awaiting_intent + /spec + /cancel"
```

---

## Task 14: Integration smoke + privacy regression check

**Files:**
- Modify: `tests/test_webhook.py`

### Step 1: Add the privacy regression test

- [ ] Append to `tests/test_webhook.py`:

```python
@pytest.mark.asyncio
async def test_intent_text_never_appears_in_log_records(temp_db, monkeypatch, caplog):
    """intent_text must never appear in any log record — only intent_text_len."""
    import logging
    from src import database as db
    await _seed_job(temp_db, "J_PRIV", chat_id=100, transcript="t")
    await db.set_chat_state(chat_id=100, mode="awaiting_intent", job_id="J_PRIV")
    monkeypatch.setattr("src.queue.enqueue", AsyncMock())
    monkeypatch.setattr("src.telegram.sender.send_message", AsyncMock())
    secret_intent = "Sphinx of black quartz judge my vow — please log only the length"
    with caplog.at_level(logging.DEBUG):
        await _post_webhook(secret_intent, chat_id=100)
    for record in caplog.records:
        assert secret_intent not in record.getMessage(), (
            f"intent_text leaked in log record: {record.getMessage()!r}"
        )
        # Also check structured fields if any
        for value in record.__dict__.values():
            if isinstance(value, str):
                assert secret_intent not in value
```

- [ ] Run: `pytest tests/test_webhook.py::test_intent_text_never_appears_in_log_records -v`
- [ ] Expected: PASS.

### Step 2: Full test suite

- [ ] Run: `pytest tests/ -v`
- [ ] Expected: all tests PASS.

### Step 3: Manual smoke test (docker-compose)

- [ ] `docker compose up -d --build`
- [ ] Send a YouTube long-video URL to the bot
- [ ] Wait for Phase 1 (transcript) → Phase 2 (Gemini enrichment) → `📐 Build Spec` button
- [ ] Tap `📐 Build Spec` → confirm sub-menu appears with both buttons
- [ ] Tap `🤖 Build auto Spec` → confirm `📐 Generating PRD, hang tight...` message → wait → confirm document delivered + 4-line summary + `📐 Build Spec` refinement button
- [ ] Tap `🤖 Build auto Spec` again → confirm `📐 Re-sending your PRD...` (cached path) → document re-delivered (same Drive file_id, no new file in folder)
- [ ] Tap `📐 Build Spec` → `✍️ Text your intent` → confirm ForceReply prompt → reply `desktop tool to manage my photos with local AI` → confirm intent PRD generates and delivers with `📐 PRD with your direction: _..._` caption
- [ ] Type `hi` (2 chars) while no state armed → normal URL rejection
- [ ] Type `/spec` → usage reply
- [ ] Type `/spec ABCD` (wrong suffix) → no-match reply with recent jobs
- [ ] Type `/cancel` → "Nothing to cancel."
- [ ] Verify Sheet `GOOGLE_SHEETS_ID_PRD` now has rows for both auto and intent slots with correct columns

### Step 4: Final commit

```bash
git add tests/test_webhook.py
git commit -m "test(#7): privacy regression + full integration coverage"
```

### Step 5: Open the PR

```bash
gh pr create --title "feat(#7): Mini-PRD intent slot + /spec + chat_state routing" --body "$(cat <<'EOF'
## Summary

Implements issue #7 per the post-grill design in `docs/superpowers/specs/2026-05-20-issue-7-intent-slot-design.md`.

- **Lazy PRD generation** on click — drops the Technical-Tutorial tail-call from enrichment
- **Intent slot** via ForceReply + chat_state routing (10-min expiry, 5-1000 char bounds)
- **`/spec <suffix> [intent]`** recovery path with most-recent-wins matching
- **In-place Drive updates** (`drive.update_file`) — stable file_ids, no folder clutter
- **Retry buttons** on all PRD failures; sheets failures now surfaced
- **`intent_text` via DB column**, never via Redis envelope (privacy + retry support)

## Test plan

- [ ] `pytest tests/ -v` — all green
- [ ] Manual smoke per plan §Task 14 Step 3
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 DB Layer → Task 1
- §3 Drive Service → Task 2
- §4 Sheets Service → Task 3
- §5 Sender → Task 4
- §6 Enrichment → Task 11
- §7.1 callbacks → Task 12
- §7.2 debouncing → Task 12 (test included)
- §7.3 routing order → Task 13
- §7.4 lazy-or-cached prd_auto → Task 12
- §7.5 /spec → Task 13
- §7.6 /cancel → Task 13
- §8.1 build_prd_markdown(intent_text=) → Task 5
- §8.2 build_summary_lines → Task 5
- §8.3 reaper_intent → Task 6
- §8.4 run_auto refactor → Task 7
- §8.5 run_auto_resend → Task 8
- §8.6 run_intent → Task 9
- §8.7 failure messages → Tasks 7, 8, 9
- §9 Worker → Task 10
- §10 Responsibility split → Tasks 7, 8, 9, 10, 12, 13
- §11 Logging → all tasks (events embedded inline)
- §12 Tests → Tasks 1, 5, 6, 7, 8, 9, 12, 13, 14

**Type consistency:** verified `build_prd_markdown` keyword-only `intent_text` param matches usage in `run_intent` (Task 9); `update_file(file_id, content)` signature matches both callers (Tasks 7, 8, 9); `prd_intent_text` column referenced consistently across DB writes (Task 13 webhook) and reads (Task 9 worker).
