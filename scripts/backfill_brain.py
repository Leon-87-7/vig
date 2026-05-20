"""Backfill the Second Brain from historical Short and Long Google Sheets data.

How to run:
    python -m scripts.backfill_brain
    # or
    python scripts/backfill_brain.py

Expected duration:
    Scales with corpus size — roughly 1-2 seconds per row for embedding calls.
    A sheet with 500 rows may take ~15-20 minutes end-to-end.

Rate-limit note:
    Set GEMINI_BRAIN_API_KEY to a separate quota so backfill does not eat the
    live pipeline's free-key budget. The script uses FREE_KEY then PAID_KEY as
    fallback only when BRAIN_API_KEY is absent.
"""

from __future__ import annotations

import asyncio
import re

from src.config import settings
from src.services.gemini import resolve_tool_urls
from src.services.sheets import _build_service
from src.utils.logger import get_logger
import src.brain as brain

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

# Matches legacy n8n labeled-block format:
#   • *Label* — description text
#     🔗 https://some-url
LINK_BLOCK = re.compile(
    r"•\s+\*(?P<label>[^*]+)\*\s+—\s+(?P<description>[^\n]*)\n\s+🔗\s+(?P<url>https?://\S+)",
    re.MULTILINE,
)

# Matches entries in the ai_tools column:
#   [type] name (optional url hint): description
TOOL_REC = re.compile(
    r"\[(?P<type>[^\]]+)\]\s+(?P<name>[^:]+?):\s*(?P<description>[^|]*)"
)


# ---------------------------------------------------------------------------
# Helper: parse short-sheet links column
# ---------------------------------------------------------------------------

def parse_short_links(col_10: str, col_11: str) -> list[dict]:
    """Parse the links column (col 10) and tools_count column (col 11).

    Returns a list of dicts with keys: url, label (may be None), description (may be None).
    """
    col_10 = (col_10 or "").strip()
    col_11 = (col_11 or "").strip()

    # --- Primary: labeled block format from legacy n8n ---
    matches = LINK_BLOCK.findall(col_10)
    if matches:
        seen_urls: dict[str, dict] = {}
        for label, description, url in matches:
            url = url.strip()
            if url not in seen_urls:
                seen_urls[url] = {
                    "url": url,
                    "label": label.strip(),
                    "description": description.strip(),
                }
        result = list(seen_urls.values())

        # Truncation fallback: col_11 may hold bare URLs that were cut off in col_10
        if "_(truncated" in col_10 and col_11:
            extras = re.split(r"[,\s]+", col_11)
            for raw in extras:
                raw = raw.strip()
                if raw.startswith("http") and raw not in seen_urls:
                    seen_urls[raw] = {"url": raw, "label": None, "description": None}
                    result.append(seen_urls[raw])

        return result

    # --- CSV fallback ---
    if col_10:
        urls = [u.strip() for u in col_10.split(",") if u.strip().startswith("http")]
        if urls:
            return [{"url": u, "label": None, "description": None} for u in urls]

    return []


# ---------------------------------------------------------------------------
# Helper: parse long-sheet ai_tools column
# ---------------------------------------------------------------------------

def parse_legacy_ai_tools(ai_tools: str) -> list[dict]:
    """Parse the ai_tools column from a long-sheet row.

    Format: "[type] name (url_hint): description | [type2] name2: description2"

    Returns a list of dicts: {type, name, description}. Returns [] for empty input.
    """
    if not ai_tools:
        return []

    results: list[dict] = []
    # Split on " | [" boundary; re-attach the "[" to each entry after the first
    raw_entries = re.split(r"\s*\|\s*(?=\[)", ai_tools)
    for entry in raw_entries:
        entry = entry.strip()
        if not entry:
            continue
        m = TOOL_REC.match(entry)
        if m:
            results.append(
                {
                    "type": m.group("type").strip(),
                    "name": m.group("name").strip(),
                    "description": m.group("description").strip(),
                }
            )
    return results


# ---------------------------------------------------------------------------
# Async main
# ---------------------------------------------------------------------------

async def main() -> None:
    service = _build_service()

    # -----------------------------------------------------------------------
    # Short sheet backfill
    # -----------------------------------------------------------------------
    log.info("backfill_start", sheet="short")
    response = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=settings.GOOGLE_SHEETS_ID_SHORT, range="A:O")
        .execute()
    )
    rows = response.get("values", [])

    short_rows_processed = 0
    short_links_ingested = 0

    for row in rows[1:]:  # skip header at index 0
        if len(row) <= 3:
            continue
        if row[3] != "done":
            continue

        # Pad to 15 columns
        while len(row) < 15:
            row.append("")

        links = parse_short_links(row[10], row[11])
        if not links:
            continue

        # Derive topic from labels, then title, then platform
        topic = (
            ", ".join(lnk["label"] for lnk in links[:5] if lnk.get("label"))
            or (row[5] if len(row) > 5 else "")
            or (row[4] if len(row) > 4 else "")
            or "unknown"
        )

        await brain.ingest_links(
            links=links,
            topic=topic,
            source_job_id=f"backfill_short_{row[0]}",
        )
        short_rows_processed += 1
        short_links_ingested += len(links)

    log.info(
        "backfill_done",
        sheet="short",
        rows_processed=short_rows_processed,
        links_ingested=short_links_ingested,
    )

    # -----------------------------------------------------------------------
    # Long sheet backfill
    # -----------------------------------------------------------------------
    log.info("backfill_start", sheet="long")
    response = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=settings.GOOGLE_SHEETS_ID_LONG, range="A:P")
        .execute()
    )
    rows = response.get("values", [])

    long_rows_processed = 0
    long_links_ingested = 0

    for row in rows[1:]:  # skip header
        if len(row) <= 9:
            continue
        if row[9] != "ok":
            continue

        tools = parse_legacy_ai_tools(row[12] if len(row) > 12 else "")
        if not tools:
            continue

        tools_with_urls = await resolve_tool_urls(tools)

        links = [
            {
                "url": t["url"],
                "label": t["name"],
                "description": t.get("description", ""),
            }
            for t in tools_with_urls
            if t.get("url")
        ]
        if not links:
            continue

        topic = (
            (row[14] if len(row) > 14 else "")
            or (row[2] if len(row) > 2 else "")
            or "unknown"
        )
        video_id = row[1] if len(row) > 1 else "unknown"

        await brain.ingest_links(
            links=links,
            topic=topic,
            source_job_id=f"backfill_long_{video_id}",
        )
        long_rows_processed += 1
        long_links_ingested += len(links)

    log.info(
        "backfill_done",
        sheet="long",
        rows_processed=long_rows_processed,
        links_ingested=long_links_ingested,
    )


if __name__ == "__main__":
    asyncio.run(main())
