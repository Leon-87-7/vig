from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

from src.config import settings
from src.utils.logger import get_logger

log = get_logger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Tab names inside the consolidated workbook (ADR-0013).
# Each per-domain helper writes to a fixed tab; routing is enforced in code, not config.
TAB_LONG = "YouTube Transcript Index"
TAB_SHORT = "Short Video Analysis"
TAB_PRD = "mini PRD"


def _build_service() -> Any:
    if settings.GOOGLE_OAUTH_REFRESH_TOKEN:
        creds = Credentials(
            token=None,
            refresh_token=settings.GOOGLE_OAUTH_REFRESH_TOKEN,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
            client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
            scopes=_SCOPES,
        )
        creds.refresh(Request())
    else:
        creds = service_account.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_JSON, scopes=_SCOPES
        )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _append_sync(tab_name: str, values: list) -> None:
    """Append `values` to the consolidated workbook's `tab_name` tab.

    Range is tab-qualified A1 notation (`"<tab_name>!A1"`) — the Sheets v4 API
    routes the write to the named tab. With a bare `"A1"` range the API
    silently lands the row in the first tab regardless of intent (ADR-0013).
    """
    service = _build_service()
    service.spreadsheets().values().append(
        spreadsheetId=settings.GOOGLE_SHEETS_ID,
        range=f"{tab_name}!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [values]},
    ).execute()


async def append_short_row(job: dict) -> None:
    """Append one row to the 'Short Video Analysis' tab of GOOGLE_SHEETS_ID.

    Expected columns (must match sheet header order):
    job_id, url, chat_id, status, platform, title, duration_s, frame_count,
    best_frame_index, tools_message, links, tools_count, submitted_at,
    processed_at, error_message
    """
    links_raw = job.get("links", [])
    links_str = (
        ", ".join(lnk.get("url", "") for lnk in links_raw)
        if isinstance(links_raw, list)
        else str(links_raw)
    )
    row = [
        job.get("id", ""),
        job.get("url", ""),
        job.get("chat_id", ""),
        job.get("status", ""),
        job.get("platform", ""),
        job.get("title", ""),
        job.get("duration_s", ""),
        job.get("frame_count", ""),
        job.get("best_frame_index", ""),
        job.get("tools_message", ""),
        links_str,
        job.get("tools_count", ""),
        job.get("created_at", ""),
        job.get("completed_at", "") or job.get("updated_at", ""),
        job.get("error_msg", ""),
    ]
    try:
        await asyncio.to_thread(_append_sync, TAB_SHORT, row)
        log.info("sheets_short_appended", job_id=job.get("id"))
    except Exception:
        log.exception("sheets_short_failed", job_id=job.get("id"))


async def append_long_row(
    job: dict,
    *,
    video_id: str,
    channel: str,
    views: str,
    description_links_raw: str,
    char_count: int,
    drive_file_id: str,
) -> None:
    """Append one row to the 'YouTube Transcript Index' tab of GOOGLE_SHEETS_ID.

    Columns (§13.15 verified shape):
      url, video_id, title, channel, description_links_raw, char_count,
      drive_file_id, drive_url, fetched_at, status,
      ai_objective, ai_action_points, ai_tools, ai_category, ai_topic, ai_market_data
    """
    fetched_at = datetime.now(timezone.utc).isoformat()
    row = [
        job.get("url", ""),
        video_id,
        job.get("title", ""),
        channel,
        description_links_raw,
        char_count,
        drive_file_id,
        job.get("drive_url", ""),
        fetched_at,
        "ok",
        "",  # ai_objective — filled by Phase 2
        "",  # ai_action_points
        "",  # ai_tools
        "",  # ai_category
        "",  # ai_topic
        "",  # ai_market_data
    ]
    try:
        await asyncio.to_thread(_append_sync, TAB_LONG, row)
        log.info("sheets_long_appended", job_id=job.get("id"))
    except Exception:
        log.exception("sheets_long_failed", job_id=job.get("id"))


async def append_prd_row(
    *,
    job_id: str,
    video_url: str,
    title: str,
    drive_url: str,
    slot: str = "auto",
    intent_text: str | None = None,
) -> None:
    """Append one row to the 'mini PRD' tab of GOOGLE_SHEETS_ID.

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
        await asyncio.to_thread(_append_sync, TAB_PRD, row)
        log.info("sheets_prd_appended", job_id=job_id, slot=slot)
    except Exception:
        log.exception("sheets_prd_failed", job_id=job_id, slot=slot)
        raise  # let caller decide
