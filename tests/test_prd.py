"""Unit tests for src/processors/prd.py"""
from __future__ import annotations

import asyncio
import os
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

import aiosqlite
import pytest

from src.processors.prd import (
    build_prd_markdown,
    sample_transcript,
)


# ---------------------------------------------------------------------------
# sample_transcript
# ---------------------------------------------------------------------------

def test_sample_transcript_under_cap():
    """Text shorter than cap is returned unchanged."""
    text = "hello world"
    result = sample_transcript(text, cap=100)
    assert result == text


def test_sample_transcript_at_cap():
    """Text exactly at cap is returned unchanged."""
    text = "x" * 100
    result = sample_transcript(text, cap=100)
    assert result == text


def test_sample_transcript_over_cap():
    """Text longer than 60k gets truncation markers inserted."""
    # Use a text longer than the default 60k cap (three 20k windows)
    text = "a" * 65_000
    result = sample_transcript(text)
    assert "[...truncated...]" in result
    # Result should be much smaller than the original
    assert len(result) < len(text)


def test_sample_transcript_three_windows():
    """Very long text contains head, middle, and tail portions with truncation markers."""
    # Build a text where head/middle/tail are distinguishable
    # head: first 20k chars (HEAD repeated), middle: 20k around centre, tail: last 20k (TAIL repeated)
    head_mark = "HEAD" * 5_000       # 20k chars at position 0
    filler = "X" * 100_000           # big gap in the middle
    tail_mark = "TAIL" * 5_000       # 20k chars at the end
    text = head_mark + filler + tail_mark

    result = sample_transcript(text)

    # Should have exactly two truncation markers
    assert result.count("[...truncated...]") == 2
    # Head portion should appear
    assert "HEAD" in result
    # Tail portion should appear
    assert "TAIL" in result


# ---------------------------------------------------------------------------
# Atomic lock tests (real SQLite in-memory)
# ---------------------------------------------------------------------------

# Minimal DDL for the lock tests — mirrors the real schema columns we need
_JOBS_DDL = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL DEFAULT 'long',
    status TEXT NOT NULL DEFAULT 'done',
    prd_auto_status TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


async def _make_db_with_job(db_path: str, job_id: str, prd_auto_status) -> None:
    """Create schema and insert one job row."""
    async with aiosqlite.connect(db_path) as conn:
        await conn.executescript(_JOBS_DDL)
        await conn.execute(
            "INSERT INTO jobs (id, prd_auto_status) VALUES (?, ?)",
            (job_id, prd_auto_status),
        )
        await conn.commit()


async def _run_lock_update(db_path: str, job_id: str) -> int:
    """Run the atomic lock UPDATE and return rowcount."""
    async with aiosqlite.connect(db_path) as conn:
        cur = await conn.execute(
            "UPDATE jobs SET prd_auto_status='generating', updated_at=CURRENT_TIMESTAMP "
            "WHERE id=? AND (prd_auto_status IS NULL OR prd_auto_status='error')",
            (job_id,),
        )
        await conn.commit()
        return cur.rowcount


@pytest.mark.asyncio
async def test_atomic_lock_contention():
    """Job already 'generating' → UPDATE returns rowcount==0 (lock contention)."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    try:
        await _make_db_with_job(db_path, "job_001", "generating")
        rowcount = await _run_lock_update(db_path, "job_001")
        assert rowcount == 0
    finally:
        os.unlink(db_path)


@pytest.mark.asyncio
async def test_atomic_lock_null():
    """Job with prd_auto_status=NULL → UPDATE returns rowcount==1 (lock acquired)."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    try:
        await _make_db_with_job(db_path, "job_002", None)
        rowcount = await _run_lock_update(db_path, "job_002")
        assert rowcount == 1
    finally:
        os.unlink(db_path)


@pytest.mark.asyncio
async def test_atomic_lock_error_state():
    """Job with prd_auto_status='error' → UPDATE returns rowcount==1 (retry allowed)."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    try:
        await _make_db_with_job(db_path, "job_003", "error")
        rowcount = await _run_lock_update(db_path, "job_003")
        assert rowcount == 1
    finally:
        os.unlink(db_path)


# ---------------------------------------------------------------------------
# Reaper test
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_reaper_resets_stale():
    """Job stuck 'generating' with old updated_at gets reset to 'error' by reaper()."""
    from src.processors.prd import reaper

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    try:
        async with aiosqlite.connect(db_path) as conn:
            await conn.executescript(_JOBS_DDL)
            # Insert a job stuck in generating with an old timestamp
            await conn.execute(
                "INSERT INTO jobs (id, prd_auto_status, updated_at) VALUES (?, 'generating', datetime('now','-20 minutes'))",
                ("job_stale",),
            )
            await conn.commit()

        with patch("src.processors.prd.settings") as mock_settings, \
             patch("src.database.settings") as mock_db_settings:
            mock_settings.DB_PATH = db_path
            mock_db_settings.DB_PATH = db_path

            # Patch database.connection to use our test db
            import src.database as _db
            from contextlib import asynccontextmanager

            @asynccontextmanager
            async def _test_connection():
                conn = await aiosqlite.connect(db_path)
                conn.row_factory = aiosqlite.Row
                try:
                    yield conn
                finally:
                    await conn.close()

            with patch.object(_db, "connection", _test_connection):
                await reaper()

        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT prd_auto_status FROM jobs WHERE id='job_stale'"
            )
            row = await cursor.fetchone()

        assert row["prd_auto_status"] == "error"

    finally:
        os.unlink(db_path)


# ---------------------------------------------------------------------------
# build_prd_markdown
# ---------------------------------------------------------------------------

_SAMPLE_PRD = {
    "project": "TestBot",
    "category": "Technical Tutorial",
    "overview": "A bot that does things.",
    "phases": [{"name": "P1", "deliverables": ["d1"]}],
    "open_questions": [{"question": "q", "context": "c"}],
}


def test_build_prd_markdown_contains_project():
    """Markdown output must contain the project name."""
    md = build_prd_markdown(_SAMPLE_PRD)
    assert "TestBot" in md


def test_build_prd_markdown_structure():
    """Markdown must contain overview, phase name, and open question."""
    md = build_prd_markdown(_SAMPLE_PRD)
    assert "A bot that does things." in md
    assert "P1" in md
    assert "d1" in md
    assert "q" in md


def test_build_prd_markdown_tech_stack_table():
    """Tech stack items produce a markdown table row."""
    prd = dict(_SAMPLE_PRD)
    prd["tech_stack"] = [{"name": "FastAPI", "url": "https://fastapi.tiangolo.com", "purpose": "Web framework"}]
    md = build_prd_markdown(prd)
    assert "FastAPI" in md
    assert "fastapi.tiangolo.com" in md
    assert "Web framework" in md


# ---------------------------------------------------------------------------
# Brain link filtering
# ---------------------------------------------------------------------------

def test_brain_filter_excludes_no_url():
    """Tech stack entry without url field is excluded from brain_links."""
    tech_stack = [{"name": "SomeTool", "purpose": "does stuff"}]
    brain_links = [
        {"url": t["url"], "label": t["name"], "description": t.get("purpose", "")}
        for t in tech_stack
        if t.get("url")
    ]
    assert brain_links == []


def test_brain_filter_includes_with_url():
    """Tech stack entry with url field is included in brain_links."""
    tech_stack = [{"name": "FastAPI", "url": "https://fastapi.tiangolo.com", "purpose": "Web framework"}]
    brain_links = [
        {"url": t["url"], "label": t["name"], "description": t.get("purpose", "")}
        for t in tech_stack
        if t.get("url")
    ]
    assert len(brain_links) == 1
    assert brain_links[0]["url"] == "https://fastapi.tiangolo.com"
    assert brain_links[0]["label"] == "FastAPI"


# ---------------------------------------------------------------------------
# build_prd_markdown with intent_text (slice #7)
# ---------------------------------------------------------------------------

def test_build_prd_markdown_with_intent_text():
    from src.processors.prd import build_prd_markdown
    prd = {"project": "Demo App", "overview": "Short overview.", "phases": [], "open_questions": []}
    md = build_prd_markdown(prd, intent_text="desktop app for agentic image processing")
    assert "**Your direction:** _desktop app for agentic image processing_" in md
    # Direction must appear shortly after the title line
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
