"""Gemini Vision for photo link extraction."""
from __future__ import annotations

import asyncio
import json
import re

from src.utils.logger import get_logger

log = get_logger(__name__)

_PHOTO_PROMPT = """You are a link extractor. Analyze the provided image(s) and find all URLs, domain names, app names, and website references that are visible.

Return ONLY valid JSON — no markdown fences, no commentary:

{
  "summary": "<2-3 sentence description of what is shown in the image(s)>",
  "links": [
    {
      "url": "<full URL — infer from brand/domain name if not fully visible>",
      "label": "<short label for this resource>",
      "description": "<one-line description of what this links to>"
    }
  ]
}

Rules:
- Extract any visible URL, domain name, app name, social handle, or product mentioned
- Infer full URL from brand name (e.g. "TrustMRR" → "https://trustmrr.com", "n8n" → "https://n8n.io")
- If no links found: return "links": []
- summary: always describe what is shown, even when no links are found
"""


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
    return _extract_json(response.text)


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
            log.info("gemini_photo_ok", links_count=len(result.get("links", [])))
            return result
        except Exception:
            log.warning("gemini_photo_key_failed")
    raise RuntimeError("Both Gemini API keys failed for photo links call")
