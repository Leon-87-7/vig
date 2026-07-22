"""og:image extraction — shared by the article processor and Brain link previews."""

from __future__ import annotations

import html
import re
from urllib.parse import urljoin, urlparse

from src.utils.public_html import fetch_public_html

_META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_ATTR_RE = re.compile(r"""([:\w-]+)\s*=\s*(['"])(.*?)\2""", re.IGNORECASE | re.DOTALL)


ESSENTIAL_OG_KEYS = (
    "og:title",
    "og:description",
    "og:site_name",
    "og:type",
    "og:image",
    "twitter:card",
    "twitter:site",
)


def extract_essential_og(markup: str, base_url: str | None = None) -> dict[str, str]:
    """Extract the Essential OG collection in one pass over meta tags."""
    found: dict[str, str] = {}
    for tag in _META_TAG_RE.findall(markup):
        attrs = {
            name.lower(): html.unescape(value.strip())
            for name, _quote, value in _ATTR_RE.findall(tag)
        }
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        content = attrs.get("content", "").strip()
        if key not in ESSENTIAL_OG_KEYS or not content or key in found:
            continue
        if key == "og:image":
            resolved = urljoin(base_url, content) if base_url else content
            if urlparse(resolved).scheme not in ("http", "https"):
                continue
            content = resolved
        found[key] = content
    return found


def flatten_essential_og(tags: dict[str, str]) -> str:
    return " · ".join(f"{key}: {tags[key]}" for key in ESSENTIAL_OG_KEYS if tags.get(key))


def extract_og_image_url(markup: str, base_url: str | None = None) -> str | None:
    """Extract og:image from an HTML document."""
    return extract_essential_og(markup, base_url).get("og:image")


async def fetch_og_image_url(url: str) -> str | None:
    result = await fetch_public_html(url)
    if result is None:
        return None
    return extract_og_image_url(result.html, result.final_url)
