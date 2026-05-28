"""Unit tests for src/services/sheets.py — consolidated workbook + named-tab routing.

See ADR-0013 (`docs/adr/0013-consolidate-sheets-into-tabs.md`).
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from src.services import sheets as sheets_svc


# ---------------------------------------------------------------------------
# Settings shape — the three old env vars are gone, one consolidated var exists
# ---------------------------------------------------------------------------


def test_settings_exposes_single_sheets_id() -> None:
    """settings.GOOGLE_SHEETS_ID is the canonical, single spreadsheet identifier."""
    from src.config import settings

    assert hasattr(settings, "GOOGLE_SHEETS_ID")


def test_settings_drops_legacy_short_var() -> None:
    """The legacy per-domain env var must be removed (ADR-0013)."""
    from src.config import settings

    with pytest.raises(AttributeError):
        _ = settings.GOOGLE_SHEETS_ID_SHORT  # type: ignore[attr-defined]


def test_settings_drops_legacy_long_var() -> None:
    """The legacy per-domain env var must be removed (ADR-0013)."""
    from src.config import settings

    with pytest.raises(AttributeError):
        _ = settings.GOOGLE_SHEETS_ID_LONG  # type: ignore[attr-defined]


def test_settings_drops_legacy_prd_var() -> None:
    """The legacy per-domain env var must be removed (ADR-0013)."""
    from src.config import settings

    with pytest.raises(AttributeError):
        _ = settings.GOOGLE_SHEETS_ID_PRD  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# _append_sync — accepts tab_name, builds tab-qualified A1 range
# ---------------------------------------------------------------------------


def test_append_sync_builds_tab_qualified_range(monkeypatch) -> None:
    """_append_sync must construct range=f'{tab_name}!A1' against GOOGLE_SHEETS_ID."""
    monkeypatch.setattr("src.services.sheets.settings.GOOGLE_SHEETS_ID", "wb-123")

    mock_values = MagicMock()
    mock_values.append.return_value.execute.return_value = {}
    mock_spreadsheets = MagicMock()
    mock_spreadsheets.values.return_value = mock_values
    mock_service = MagicMock()
    mock_service.spreadsheets.return_value = mock_spreadsheets

    with patch("src.services.sheets._build_service", return_value=mock_service):
        sheets_svc._append_sync("My Tab", ["a", "b", "c"])

    mock_values.append.assert_called_once()
    call_kwargs = mock_values.append.call_args.kwargs
    assert call_kwargs["spreadsheetId"] == "wb-123"
    assert call_kwargs["range"] == "My Tab!A1"
    assert call_kwargs["body"] == {"values": [["a", "b", "c"]]}


# ---------------------------------------------------------------------------
# Per-domain helpers — each routes to its fixed tab name
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_prd_row_routes_to_mini_prd_tab(monkeypatch) -> None:
    """append_prd_row must write to the 'mini PRD' tab."""
    monkeypatch.setattr("src.services.sheets.settings.GOOGLE_SHEETS_ID", "wb-123")

    mock_values = MagicMock()
    mock_values.append.return_value.execute.return_value = {}
    mock_spreadsheets = MagicMock()
    mock_spreadsheets.values.return_value = mock_values
    mock_service = MagicMock()
    mock_service.spreadsheets.return_value = mock_spreadsheets

    with patch("src.services.sheets._build_service", return_value=mock_service):
        await sheets_svc.append_prd_row(
            job_id="job_prd_1",
            video_url="https://youtube.com/watch?v=x",
            title="PRD title",
            drive_url="https://drive/x",
            slot="auto",
            intent_text=None,
        )

    mock_values.append.assert_called_once()
    call_kwargs = mock_values.append.call_args.kwargs
    assert call_kwargs["spreadsheetId"] == "wb-123"
    assert call_kwargs["range"] == "mini PRD!A1"


@pytest.mark.asyncio
async def test_append_short_row_routes_to_short_tab(monkeypatch) -> None:
    """append_short_row must write to the 'Short Video Analysis' tab."""
    monkeypatch.setattr("src.services.sheets.settings.GOOGLE_SHEETS_ID", "wb-123")

    captured: list = []

    def fake_append_sync(tab_name, values):
        captured.append((tab_name, values))

    with patch("src.services.sheets._append_sync", side_effect=fake_append_sync):
        await sheets_svc.append_short_row({"id": "j", "url": "https://x", "links": []})

    assert len(captured) == 1
    tab_name, _ = captured[0]
    assert tab_name == "Short Video Analysis"


@pytest.mark.asyncio
async def test_append_long_row_routes_to_long_tab(monkeypatch) -> None:
    """append_long_row must write to the 'YouTube Transcript Index' tab."""
    monkeypatch.setattr("src.services.sheets.settings.GOOGLE_SHEETS_ID", "wb-123")

    captured: list = []

    def fake_append_sync(tab_name, values):
        captured.append((tab_name, values))

    with patch("src.services.sheets._append_sync", side_effect=fake_append_sync):
        await sheets_svc.append_long_row(
            {"id": "j", "url": "https://yt/x", "title": "T", "drive_url": "https://d/x"},
            video_id="vid",
            channel="C",
            views="1",
            description_links_raw="",
            char_count=1,
            drive_file_id="fid",
        )

    assert len(captured) == 1
    tab_name, _ = captured[0]
    assert tab_name == "YouTube Transcript Index"
