from __future__ import annotations

from src.services.ops_bot import _escape_like


def test_escape_like_escapes_domain_wildcards_only() -> None:
    assert "%@" + _escape_like("exa_m%ple.com") == "%@exa\\_m\\%ple.com"
    assert _escape_like("a\\b.com") == "a\\\\b.com"
