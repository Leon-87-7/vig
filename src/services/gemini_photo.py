"""Gemini Vision for photo link extraction."""
from __future__ import annotations

import asyncio
import json
import re

from src.utils.logger import get_logger

log = get_logger(__name__)

_PHOTO_PROMPT = """You are an OCR-grounded link extractor. Read the image(s) and return only URLs or domains that are LITERALLY visible as readable text. Do NOT invent or infer a URL from a brand name, product name, app icon, or logo.

Return ONLY valid JSON — no markdown fences, no commentary:

{
  "summary": "<2-3 sentence description of what is shown in the image(s)>",
  "links": [
    {
      "url": "<full URL with scheme, e.g. https://trustmrr.com>",
      "label": "<short label for this resource>",
      "description": "<one-line description of what this links to>",
      "verbatim": "<the surrounding phrase or sentence from the image that shows this URL/domain in context, e.g. 'TrustMRR.com — The database of verified startup revenues' or 'Followed by chase.h.ai and 1 other'>"
    }
  ]
}

Rules:
- INCLUDE a link when a domain (name + TLD) or full URL is rendered as visible readable text AND is being shared or promoted as a resource (a website overlay, a product/tool being demoed, a URL in a caption).
  Good example: image shows the text "TrustMRR.com" as an overlay → include url="https://trustmrr.com", verbatim="TrustMRR.com" ✓
- EXCLUDE a link when only a brand/product/app name appears without a TLD next to it.
  Bad example: image shows a card titled "ThreadCan" with no domain → do NOT return "threadcan.com" ✗
- EXCLUDE domains that appear only in social media UI chrome: "Followed by X", "Following", commenter usernames, like/follower counts, timestamps, or any platform navigation element. These are not shared resources.
  Bad example: image shows "Followed by chase.h.ai and 1 other" → do NOT return "chase.h.ai" ✗
- EXCLUDE a link if you cannot quote a verbatim substring that contains the domain+TLD or a social handle (@name) where the platform is also visible.
- Social handles: include only when the creator is explicitly sharing their own profile (e.g. shown in a caption or call-to-action), not when a handle appears incidentally in UI elements.
- If no links found: return "links": []
- summary: always describe what is shown, even when no links are found
"""

_HANDLE_PLATFORMS = {
    "instagram.com": "instagram",
    "tiktok.com": "tiktok",
    "twitter.com": "twitter",
    "x.com": "x",
    "youtube.com": "youtube",
}


def _domain_for_match(url: str) -> str:
    netloc = url.split("://", 1)[-1].split("/", 1)[0].lower().strip()
    return netloc.removeprefix("www.")


_UI_CHROME_PATTERNS = re.compile(
    r"\bfollowed\s+by\b",
    re.IGNORECASE,
)


def _filter_grounded_links(links: list[dict], summary: str) -> list[dict]:
    """Drop links whose domain is not literally present in the model's verbatim quote (or summary),
    and drop links whose verbatim context reveals they appear only in social media UI chrome."""
    summary_lc = (summary or "").lower()
    kept: list[dict] = []
    dropped: list[dict] = []
    for link in links:
        url = (link.get("url") or "").strip()
        if not url:
            continue
        domain = _domain_for_match(url)
        if not domain or "." not in domain:
            dropped.append({"url": url, "reason": "no_domain"})
            continue
        verbatim_raw = link.get("verbatim")
        verbatim = verbatim_raw.lower() if isinstance(verbatim_raw, str) else ""
        # The prompt asks Gemini to include surrounding phrase context in verbatim.
        # If that phrase is social media UI chrome (e.g. "Followed by X"), drop the link.
        if _UI_CHROME_PATTERNS.search(verbatim):
            dropped.append({"url": url, "reason": "ui_chrome", "verbatim": verbatim_raw})
            continue
        platform = _HANDLE_PLATFORMS.get(domain)
        if platform and platform in verbatim and verbatim.lstrip().startswith("@"):
            kept.append(link)
            continue
        if domain in verbatim or domain in summary_lc:
            kept.append(link)
            continue
        dropped.append({"url": url, "reason": "ungrounded", "verbatim": verbatim_raw})
    if dropped:
        log.warning("gemini_photo_dropped_ungrounded", dropped=dropped, kept=len(kept))
    return kept


def _extract_json(raw: str) -> dict:
    clean = re.sub(r"^```json\s*", "", raw, flags=re.IGNORECASE)
    clean = re.sub(r"```\s*$", "", clean).strip()
    m = re.search(r"\{[\s\S]*\}", clean)
    return json.loads(m.group(0) if m else clean)


def _call_photo_sync(images: list[dict], api_key: str, caption: str | None) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    parts: list = [_PHOTO_PROMPT]
    for img in images:
        parts.append(types.Part.from_bytes(data=img["bytes"], mime_type=img["mime_type"]))
    if caption:
        parts.append(f"User caption context: {caption}")
    response = client.models.generate_content(model="gemini-2.5-flash", contents=parts)
    return _extract_json(response.text or "")


async def call_gemini_photo_links(
    images: list[dict],
    free_key: str,
    paid_key: str,
    caption: str | None = None,
) -> dict:
    """
    images: [{"bytes": bytes, "mime_type": str}, ...]
    Returns {"summary": str, "links": [{url, label, description}]}
    Raises RuntimeError if both keys fail.
    """
    for key in [free_key, paid_key]:
        if not key:
            continue
        try:
            result = await asyncio.to_thread(_call_photo_sync, images, key, caption)
            raw_links = result.get("links", []) or []
            log.info(
                "gemini_photo_raw",
                raw_count=len(raw_links),
                raw_urls=[l.get("url") for l in raw_links],
                raw_verbatims=[l.get("verbatim") for l in raw_links],
            )
            grounded = _filter_grounded_links(raw_links, result.get("summary", ""))
            result["links"] = grounded
            log.info(
                "gemini_photo_ok",
                links_count=len(grounded),
                dropped_count=len(raw_links) - len(grounded),
            )
            return result
        except Exception as exc:
            log.warning("gemini_photo_key_failed", error=str(exc))
    raise RuntimeError("Both Gemini API keys failed for photo links call")
