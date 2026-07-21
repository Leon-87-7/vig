from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.api.controls import TagIn, _normalize_domain
from src.utils.validators import is_valid_domain_name


def test_tag_rejects_blank_name_and_unknown_icon() -> None:
    with pytest.raises(ValidationError):
        TagIn(name="   ")
    with pytest.raises(ValidationError):
        TagIn(name="AI", icon="NotAnIcon")
    assert TagIn(name=" AI ", icon="Brain").icon == "Brain"


def test_domain_validation_rejects_bare_tld_and_bad_labels() -> None:
    assert _normalize_domain("https://www.Example.com/path") == "example.com"
    assert is_valid_domain_name("example.com") is True
    assert is_valid_domain_name("com") is False
    assert is_valid_domain_name("bad_host.example") is False
    assert is_valid_domain_name("example..com") is False
