"""Unit tests for src/processors/document.py — parse cache + enrichment (#154)."""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

_GEMINI_JSON = json.dumps({
    "title": "On Widgets",
    "author": "A. Author",
    "publisher": "ACME",
    "document_type": "whitepaper",
    "summary": "How widgets work.",
    "key_points": ["p1", "p2"],
    "references": ["ref1"],
    "tools": [{"name": "WidgetKit", "type": "library", "url": "https://w.tld", "description": "builds widgets"}],
})


@pytest.fixture
def patched(monkeypatch):
    from src.processors import document

    mocks = {
        "exists": AsyncMock(return_value=False),
        "download": AsyncMock(return_value=b"%PDF bytes"),
        "upload": AsyncMock(),
        "parse_pdf": AsyncMock(return_value="extracted document text"),
        "update_job_status": AsyncMock(),
        "send_message": AsyncMock(return_value={}),
        "get_job": AsyncMock(side_effect=lambda jid: {"id": jid, "chat_id": 7, "title": "On Widgets",
                                                      "ai_objective": "How widgets work.",
                                                      "ai_action_points": "p1 | p2",
                                                      "template_analysis": json.dumps({"author": "A. Author"})}),
        "generate": AsyncMock(return_value=_GEMINI_JSON),
    }
    monkeypatch.setattr(document.storage, "exists", mocks["exists"])
    monkeypatch.setattr(document.storage, "download", mocks["download"])
    monkeypatch.setattr(document.storage, "upload", mocks["upload"])
    monkeypatch.setattr(document, "parse_pdf", mocks["parse_pdf"])
    monkeypatch.setattr(document.database, "update_job_status", mocks["update_job_status"])
    monkeypatch.setattr(document.database, "get_job", mocks["get_job"])
    monkeypatch.setattr(document, "send_message", mocks["send_message"])
    # gemini_client is imported lazily inside run(); patch the attribute on the module.
    import src.services.gemini as gemini
    monkeypatch.setattr(gemini.gemini_client, "generate", mocks["generate"])
    return document, mocks


def _job(chat_id=7, sha="abc123"):
    return {"id": "20260618_000000_JOB1", "chat_id": chat_id, "url": f"documents/{sha}.pdf"}


@pytest.mark.asyncio
async def test_cache_miss_parses_and_uploads(patched):
    document, m = patched
    m["exists"].return_value = False

    await document.run(_job())

    m["parse_pdf"].assert_awaited_once()
    # parsed text cached to parsed/<sha>.txt
    (parsed_key, body, ctype), _ = m["upload"].call_args
    assert parsed_key == "parsed/abc123.txt"
    assert body == b"extracted document text"
    # final status persisted as done with mapped columns
    done = [c for c in m["update_job_status"].call_args_list if c.args[1] == "done"][0]
    assert done.kwargs["ai_objective"] == "How widgets work."
    assert done.kwargs["ai_action_points"] == "p1 | p2"
    assert json.loads(done.kwargs["template_analysis"])["document_type"] == "whitepaper"
    assert "promise_gap" not in done.kwargs


@pytest.mark.asyncio
async def test_cache_hit_skips_parse(patched):
    document, m = patched
    m["exists"].return_value = True
    m["download"].return_value = b"cached parsed text"

    await document.run(_job())

    m["parse_pdf"].assert_not_called()
    m["upload"].assert_not_called()  # nothing re-uploaded on a cache hit
    m["generate"].assert_awaited_once()


@pytest.mark.asyncio
async def test_parse_failure_propagates(patched):
    from src.services.parse import ParseError
    document, m = patched
    m["exists"].return_value = False
    m["parse_pdf"].side_effect = ParseError("bad pdf")

    with pytest.raises(ParseError):
        await document.run(_job())
    # never reached 'done'
    assert all(c.args[1] != "done" for c in m["update_job_status"].call_args_list)


@pytest.mark.asyncio
async def test_enrichment_failure_propagates(patched):
    from src.services.gemini import GeminiUnavailableError
    document, m = patched
    m["generate"].side_effect = GeminiUnavailableError("down")

    with pytest.raises(GeminiUnavailableError):
        await document.run(_job())
    assert all(c.args[1] != "done" for c in m["update_job_status"].call_args_list)


@pytest.mark.asyncio
async def test_tenant_scoped_ownership_shared_parse(patched):
    """Two chats sending the same PDF share parsed/<sha>.txt but update their own job row."""
    document, m = patched
    m["exists"].return_value = True
    m["download"].return_value = b"shared text"

    await document.run({"id": "JOB_A", "chat_id": 1, "url": "documents/same.pdf"})
    await document.run({"id": "JOB_B", "chat_id": 2, "url": "documents/same.pdf"})

    done_ids = [c.args[0] for c in m["update_job_status"].call_args_list if c.args[1] == "done"]
    assert done_ids == ["JOB_A", "JOB_B"]  # each row updated by its own id


@pytest.mark.asyncio
async def test_delivery_failure_does_not_roll_back_done(patched):
    document, m = patched
    # First send_message (status) ok; the enrichment send (HTML) raises.
    m["send_message"].side_effect = [{}, RuntimeError("telegram down")]

    await document.run(_job())  # must NOT raise

    done = [c for c in m["update_job_status"].call_args_list if c.args[1] == "done"]
    assert len(done) == 1  # done persisted; no error status written after
    assert all(c.args[1] != "error" for c in m["update_job_status"].call_args_list)
