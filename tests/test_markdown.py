"""Unit tests for src/utils/markdown.py formatting helpers."""

from __future__ import annotations

import pytest

from src.utils.markdown import _humanize_age, build_enriched_links_message


@pytest.mark.parametrize(
    "days,expected",
    [
        (-3, "today"),
        (0, "today"),
        (1, "yesterday"),
        (3, "3 days ago"),
        (29, "29 days ago"),
        (30, "1 month ago"),
        (60, "2 months ago"),
        (240, "8 months ago"),
        (364, "12 months ago"),
        (365, "1 year ago"),
        (800, "2 years ago"),
    ],
)
def test_humanize_age(days: int, expected: str) -> None:
    assert _humanize_age(days) == expected


def test_enriched_message_uses_humanized_age() -> None:
    links = [
        {
            "url": "https://github.com/foo/bar",
            "label": "bar",
            "_enriched": True,
            "_stars": 10,
            "_forks": 2,
            "_language": "Python",
            "_days_ago": 240,
            "_gh_description": "A bar",
        }
    ]
    msg = build_enriched_links_message(links)
    assert "📅 8 months ago" in msg
    assert "days ago" not in msg
