"""GitHub REST API client with Redis cache."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests

from src.config import settings
from src.utils.logger import get_logger

log = get_logger(__name__)

_TTL = 86_400  # 24 hours


def _fetch_sync(owner: str, repo: str, token: str) -> dict | None:
    """Blocking HTTP call — run via asyncio.to_thread."""
    url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    return {
        "stars": data["stargazers_count"],
        "forks": data["forks_count"],
        "language": data.get("language"),
        "pushed_at": data.get("pushed_at"),
        "description": data.get("description"),
        "archived": data.get("archived", False),
    }


async def enrich_repo(owner: str, repo: str, token: str) -> dict | None:
    """Return GitHub metadata for owner/repo, using Redis cache (TTL 24h).

    Returns None on 404, rate-limit, or network error; never raises.
    Cache key: github_meta:{owner}/{repo}
    """
    import asyncio
    from src import queue  # lazy import — Redis client lives here

    cache_key = f"github_meta:{owner}/{repo}"
    client = queue._client()

    # Cache read
    try:
        cached = await client.get(cache_key)
        if cached:
            log.info("github_cache_hit", repo=f"{owner}/{repo}")
            return json.loads(cached)
    except Exception:
        log.warning("github_cache_read_failed", repo=f"{owner}/{repo}")

    # API call
    try:
        result = await asyncio.to_thread(_fetch_sync, owner, repo, token)
    except Exception as exc:
        log.warning("github_fetch_failed", repo=f"{owner}/{repo}", error=str(exc)[:120])
        return None

    if result is None:
        log.info("github_repo_not_found", repo=f"{owner}/{repo}")
        return None

    # Cache write
    try:
        await client.set(cache_key, json.dumps(result), ex=_TTL)
        log.info("github_cache_written", repo=f"{owner}/{repo}")
    except Exception:
        log.warning("github_cache_write_failed", repo=f"{owner}/{repo}")

    return result


def _parse_owner_repo(url: str) -> tuple[str, str] | None:
    segments = [s for s in urlparse(url).path.split("/") if s]
    if len(segments) >= 2:
        return segments[0], segments[1]
    return None


async def enrich_github_links(links: list[dict]) -> list[dict]:
    """Mutate links in-place with GitHub repo metadata for any github.com URLs.

    Sets ``_enriched=True`` and attaches ``_stars``, ``_forks``,
    ``_language``, ``_days_ago``, ``_gh_description`` on success;
    ``_enriched=False`` on failure (404, network error, or missing token).
    Non-GitHub links are passed through unchanged.
    """
    token = settings.GITHUB_TOKEN
    if not token:
        return links

    gh_links = [lnk for lnk in links if "github.com" in lnk.get("url", "")]
    if not gh_links:
        return links

    parsed_pairs = [_parse_owner_repo(lnk["url"]) for lnk in gh_links]
    valid_indices = [(i, pair) for i, pair in enumerate(parsed_pairs) if pair is not None]
    if valid_indices:
        coros = [enrich_repo(owner, repo, token) for _, (owner, repo) in valid_indices]
        api_results: list[dict | None] = list(await asyncio.gather(*coros, return_exceptions=False))
    else:
        api_results = []

    now = datetime.now(timezone.utc)
    result_iter = iter(api_results)

    for i, lnk in enumerate(gh_links):
        pair = parsed_pairs[i]
        if pair is None:
            lnk["_enriched"] = False
            continue
        data = next(result_iter)
        if data is None:
            lnk["_enriched"] = False
        else:
            pushed_at_raw = data.get("pushed_at") or ""
            try:
                pushed = datetime.fromisoformat(pushed_at_raw.replace("Z", "+00:00"))
                days_ago = (now - pushed).days
            except Exception:
                days_ago = 0
            lnk["_enriched"] = True
            lnk["_stars"] = data.get("stars", 0)
            lnk["_forks"] = data.get("forks", 0)
            lnk["_language"] = data.get("language")
            lnk["_days_ago"] = days_ago
            lnk["_gh_description"] = data.get("description")

    return links
