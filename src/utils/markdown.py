from __future__ import annotations

from datetime import datetime, timezone


def build_transcript_markdown(
    title: str,
    channel: str,
    views: str,
    video_id: str,
    url: str,
    transcript: str,
) -> str:
    """Build the Phase 1 raw transcript .md file content."""
    fetched_at = datetime.now(timezone.utc).isoformat()
    return (
        f"# {title or 'Untitled'}\n\n"
        f"**Channel:** {channel or 'Unknown'}\n"
        f"**Views:** {views}\n"
        f"**Video ID:** {video_id}\n"
        f"**URL:** {url}\n"
        f"**Fetched:** {fetched_at}\n"
        f"**Char count:** {len(transcript)}\n\n"
        f"---\n\n"
        f"{transcript}\n"
    )


def build_links_message(links: list[dict]) -> str:
    labeled = "\n".join(
        f"• {lnk.get('label') or lnk['url']} — {lnk.get('description') or ''}\n  🔗 {lnk['url']}"
        for lnk in links
    )
    bare = "\n".join(lnk["url"] for lnk in links)
    return f"🔗 Links Found:\n{labeled}\n\n---\n\n🔗 Quick Links:\n{bare}"
