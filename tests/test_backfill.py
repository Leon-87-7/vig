"""Unit tests for scripts/backfill_brain.py helpers and resolve_tool_urls."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from scripts.backfill_brain import parse_legacy_ai_tools, parse_short_links
from src.services.gemini import resolve_tool_urls


# ===========================================================================
# parse_short_links
# ===========================================================================

class TestParseShortLinks:
    def test_labeled_block_two_entries(self):
        """Complete labeled list (2 entries) → both returned with label/description/url."""
        col_10 = (
            "• *Tailwind CSS* — utility-first CSS framework\n"
            "  🔗 https://tailwindcss.com\n"
            "• *Vite* — fast frontend build tool\n"
            "  🔗 https://vitejs.dev"
        )
        result = parse_short_links(col_10, "")
        assert len(result) == 2

        labels = {r["label"] for r in result}
        urls = {r["url"] for r in result}
        assert "Tailwind CSS" in labels
        assert "Vite" in labels
        assert "https://tailwindcss.com" in urls
        assert "https://vitejs.dev" in urls
        # descriptions present
        for r in result:
            assert r["description"] is not None and r["description"] != ""

    def test_labeled_with_truncation_and_col11_extras(self):
        """Labeled entries + truncation marker → labeled entries plus bare URLs from col_11 appended."""
        col_10 = (
            "• *React* — UI library\n"
            "  🔗 https://react.dev\n"
            "_(truncated — see links column)_"
        )
        col_11 = "https://nextjs.org, https://vercel.com"
        result = parse_short_links(col_10, col_11)

        urls = {r["url"] for r in result}
        assert "https://react.dev" in urls
        assert "https://nextjs.org" in urls
        assert "https://vercel.com" in urls

        # Labeled entry keeps label; extras have label=None
        react_entry = next(r for r in result if r["url"] == "https://react.dev")
        assert react_entry["label"] == "React"

        next_entry = next(r for r in result if r["url"] == "https://nextjs.org")
        assert next_entry["label"] is None

    def test_csv_fallback_empty_col10_col11_only(self):
        """Empty col_10 + col_11 CSV-only input → bare URLs returned with label=None."""
        col_10 = ""
        col_11 = "https://stripe.com, https://docs.stripe.com"
        # col_11 alone isn't processed by parse_short_links (only used for truncation extras)
        # BUT if col_10 contains CSV URLs directly, they should be parsed
        col_10_csv = "https://stripe.com, https://docs.stripe.com"
        result = parse_short_links(col_10_csv, "")

        assert len(result) == 2
        urls = {r["url"] for r in result}
        assert "https://stripe.com" in urls
        assert "https://docs.stripe.com" in urls
        for r in result:
            assert r["label"] is None
            assert r["description"] is None

    def test_malformed_col10_returns_empty(self):
        """Random text with no recognized patterns → returns []."""
        col_10 = "just some random text without any URLs or patterns"
        result = parse_short_links(col_10, "")
        assert result == []

    def test_duplicate_url_deduplicated(self):
        """URL in both labeled col_10 and col_11 truncation extras → appears only once."""
        col_10 = (
            "• *SomeTool* — description here\n"
            "  🔗 https://example.com\n"
            "_(truncated)_"
        )
        col_11 = "https://example.com, https://other.com"
        result = parse_short_links(col_10, col_11)

        urls = [r["url"] for r in result]
        assert urls.count("https://example.com") == 1, "Duplicate URL must appear only once"
        assert "https://other.com" in urls


# ===========================================================================
# parse_legacy_ai_tools
# ===========================================================================

class TestParseLegacyAiTools:
    def test_multiple_entries_with_separator(self):
        """Multiple entries split by ' | [' → all parsed correctly."""
        ai_tools = "[saas] Stripe: payment processing | [lib] Pandas: data analysis | [api] OpenAI: LLM API"
        result = parse_legacy_ai_tools(ai_tools)

        assert len(result) == 3
        names = {r["name"] for r in result}
        assert "Stripe" in names
        assert "Pandas" in names
        assert "OpenAI" in names

        types = {r["type"] for r in result}
        assert "saas" in types
        assert "lib" in types
        assert "api" in types

    def test_name_with_inline_parens_preserved(self):
        """Name containing parens (e.g. URL hint) is fully preserved."""
        ai_tools = "[tool] Tavi (api.tavi.com): investment research platform"
        result = parse_legacy_ai_tools(ai_tools)

        assert len(result) == 1
        assert result[0]["name"] == "Tavi (api.tavi.com)"
        assert result[0]["type"] == "tool"
        assert "investment research" in result[0]["description"]

    def test_trailing_whitespace_stripped(self):
        """All fields have trailing/leading whitespace stripped."""
        ai_tools = "[  saas  ]   Notion   :   note-taking app   "
        result = parse_legacy_ai_tools(ai_tools)

        assert len(result) == 1
        assert result[0]["type"] == "saas"
        assert result[0]["name"] == "Notion"
        assert result[0]["description"] == "note-taking app"

    def test_empty_input_returns_empty_list(self):
        """Empty string input returns []."""
        assert parse_legacy_ai_tools("") == []

    def test_none_input_returns_empty_list(self):
        """None input returns []."""
        assert parse_legacy_ai_tools(None) == []


# ===========================================================================
# resolve_tool_urls (mocked Gemini)
# ===========================================================================

class TestResolveToolUrls:
    @pytest.mark.asyncio
    async def test_happy_path_names_matched(self):
        """Mock returns matching names → URLs merged correctly into tools."""
        tools = [
            {"type": "lib", "name": "NumPy", "description": "numerical computing"},
            {"type": "saas", "name": "Vercel", "description": "deployment platform"},
        ]
        mock_response_data = [
            {"name": "NumPy", "url": "https://numpy.org"},
            {"name": "Vercel", "url": "https://vercel.com"},
        ]

        mock_response = MagicMock()
        mock_response.text = json.dumps(mock_response_data)

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch("src.config.settings") as mock_settings, \
             patch("google.genai.Client", return_value=mock_client):
            mock_settings.GEMINI_FREE_API_KEY = "free-key"
            mock_settings.GEMINI_PAID_API_KEY = "paid-key"

            result = await resolve_tool_urls(tools)

        assert len(result) == 2
        numpy_entry = next(r for r in result if r["name"] == "NumPy")
        vercel_entry = next(r for r in result if r["name"] == "Vercel")
        assert numpy_entry["url"] == "https://numpy.org"
        assert vercel_entry["url"] == "https://vercel.com"

    @pytest.mark.asyncio
    async def test_partial_response_missing_names_get_none(self):
        """Some names absent from Gemini response → those entries get url=None."""
        tools = [
            {"type": "lib", "name": "KnownLib", "description": "known"},
            {"type": "concept", "name": "HTTP Request", "description": "concept"},
        ]
        # Gemini only returns KnownLib; HTTP Request is absent (Gemini returns null for concepts)
        mock_response_data = [
            {"name": "KnownLib", "url": "https://knownlib.io"},
        ]

        mock_response = MagicMock()
        mock_response.text = json.dumps(mock_response_data)

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch("src.config.settings") as mock_settings, \
             patch("google.genai.Client", return_value=mock_client):
            mock_settings.GEMINI_FREE_API_KEY = "free-key"
            mock_settings.GEMINI_PAID_API_KEY = ""

            result = await resolve_tool_urls(tools)

        known = next(r for r in result if r["name"] == "KnownLib")
        http_req = next(r for r in result if r["name"] == "HTTP Request")
        assert known["url"] == "https://knownlib.io"
        assert http_req["url"] is None

    @pytest.mark.asyncio
    async def test_markdown_fenced_json_parsed_correctly(self):
        """Response wrapped in ```json fences → stripped and parsed correctly."""
        tools = [{"type": "api", "name": "Stripe", "description": "payments"}]
        fenced = "```json\n[{\"name\": \"Stripe\", \"url\": \"https://stripe.com\"}]\n```"

        mock_response = MagicMock()
        mock_response.text = fenced

        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response

        with patch("src.config.settings") as mock_settings, \
             patch("google.genai.Client", return_value=mock_client):
            mock_settings.GEMINI_FREE_API_KEY = "free-key"
            mock_settings.GEMINI_PAID_API_KEY = ""

            result = await resolve_tool_urls(tools)

        assert result[0]["url"] == "https://stripe.com"

    @pytest.mark.asyncio
    async def test_total_failure_returns_url_none(self):
        """Both keys raise exceptions → returns original tools with url=None for all."""
        tools = [
            {"type": "lib", "name": "SomeLib", "description": "some lib"},
            {"type": "saas", "name": "SomeSaaS", "description": "some saas"},
        ]

        with patch("src.config.settings") as mock_settings, \
             patch("google.genai.Client", side_effect=RuntimeError("network error")):
            mock_settings.GEMINI_FREE_API_KEY = "free-key"
            mock_settings.GEMINI_PAID_API_KEY = "paid-key"

            result = await resolve_tool_urls(tools)

        assert len(result) == 2
        for entry in result:
            assert entry["url"] is None
        # Original fields preserved
        names = {r["name"] for r in result}
        assert "SomeLib" in names
        assert "SomeSaaS" in names

    @pytest.mark.asyncio
    async def test_empty_tools_returns_immediately(self):
        """Empty tools list → returned as-is without calling Gemini."""
        with patch("google.genai.Client") as mock_client_cls:
            result = await resolve_tool_urls([])

        mock_client_cls.assert_not_called()
        assert result == []
