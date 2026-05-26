"""Backward-compat shim — re-exports from src.services.gemini (the unified module)."""

from src.services.gemini import (
    _domain_for_match,
    _filter_grounded_links,
    call_gemini_photo_links,
)

__all__ = ["call_gemini_photo_links", "_domain_for_match", "_filter_grounded_links"]
