"""Repo pipeline processor — full implementation."""
from __future__ import annotations

import asyncio
import json as _json
import re as _re
from datetime import datetime, timezone
from urllib.parse import urlparse

from src import database
from src.config import settings
from src.services.github import fetch_repo_bundle
from src.telegram.sender import send_message
from src.utils.logger import get_logger

log = get_logger(__name__)


def _parse_owner_repo(url: str) -> tuple[str, str]:
    parts = [s for s in urlparse(url).path.split("/") if s]
    return parts[0], parts[1]


def _days_ago(pushed_at: str | None) -> int:
    if not pushed_at:
        return 0
    try:
        pushed = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - pushed).days
    except Exception:
        return 0


def _normalize_repo_url(url: str) -> str:
    owner, repo = _parse_owner_repo(url)
    return f"https://github.com/{owner}/{repo}"


def _format_bundle_message(owner: str, repo: str, bundle: dict) -> str:
    meta = bundle.get("metadata") or {}
    stars = meta.get("stars", 0)
    forks = meta.get("forks", 0)
    language = meta.get("language") or "Unknown"
    days = _days_ago(meta.get("pushed_at"))
    readme_bytes = len(bundle.get("readme", ""))
    raw_kb = bundle.get("readme_raw_bytes", 0) / 1024
    tree_count = len(bundle.get("tree", []))
    manifests = bundle.get("manifests") or {}
    manifest_list = ", ".join(sorted(manifests.keys())) if manifests else "none"
    repo_url = f"https://github.com/{owner}/{repo}"

    return (
        f"📦 {owner}/{repo}\n"
        f"⭐ {stars:,} | 🔀 {forks:,} | 💻 {language} | 📅 {days} days ago\n"
        "\n"
        f"📄 README: {readme_bytes} bytes ({raw_kb:.1f} KB raw)\n"
        f"🗂  Tree: {tree_count} files\n"
        f"📦 Manifests: {manifest_list}\n"
        "\n"
        "🚧 Gemini analysis coming soon.\n"
        "\n"
        f"🔗 {repo_url}"
    )


async def run(job: dict) -> None:
    job_id = job["id"]
    chat_id = job["chat_id"]
    url = job["url"]

    await database.update_job_status(job_id, "processing")
    owner, repo = _parse_owner_repo(url)

    bundle = await fetch_repo_bundle(owner, repo, settings.GITHUB_TOKEN)
    msg = _format_bundle_message(owner, repo, bundle)
    await send_message(chat_id, msg)

    await database.update_job_status(job_id, "done")
    log.info("repo_bundle_sent", job_id=job_id, repo=f"{owner}/{repo}")
