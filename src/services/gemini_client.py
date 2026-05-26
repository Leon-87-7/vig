"""Backward-compat shim — re-exports from src.services.gemini (the unified module)."""

from src.services.gemini import GeminiClient, GeminiUnavailableError, gemini_client

__all__ = ["GeminiClient", "GeminiUnavailableError", "gemini_client"]
