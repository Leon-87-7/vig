from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.api.jobs import AnnotationIn, JobCreateRequest
from src.api.parsed import UrlIn


def test_job_text_fields_have_length_bounds() -> None:
    with pytest.raises(ValidationError):
        JobCreateRequest(url="https://example.com", freestyle_prompt="x" * 4_001)
    with pytest.raises(ValidationError):
        AnnotationIn(notes="x" * 4_001)
    assert JobCreateRequest(url="https://example.com", freestyle_prompt="x" * 4_000)


def test_parsed_url_in_has_length_bound() -> None:
    with pytest.raises(ValidationError):
        UrlIn(url="https://example.com/" + "x" * 2048)
    assert UrlIn(url="https://example.com/" + "x" * 2020)
