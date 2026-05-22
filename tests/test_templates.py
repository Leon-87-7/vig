import pytest

from src.templates import PROMPT_TEMPLATES, PromptTemplate


def test_all_five_templates_present() -> None:
    assert set(PROMPT_TEMPLATES.keys()) == {"summary", "method", "technical", "review", "narrative"}


def test_summary_extra_instructions_empty() -> None:
    assert PROMPT_TEMPLATES["summary"].extra_instructions == ""


@pytest.mark.parametrize("key", ["method", "technical", "review", "narrative"])
def test_non_summary_extra_instructions_contain_template_analysis(key: str) -> None:
    assert "template_analysis" in PROMPT_TEMPLATES[key].extra_instructions


def test_brave_search_flags() -> None:
    assert PROMPT_TEMPLATES["technical"].brave_search is True
    assert PROMPT_TEMPLATES["review"].brave_search is True
    assert PROMPT_TEMPLATES["summary"].brave_search is False
    assert PROMPT_TEMPLATES["method"].brave_search is False
    assert PROMPT_TEMPLATES["narrative"].brave_search is False


def test_summary_has_no_trigger_patterns() -> None:
    assert PROMPT_TEMPLATES["summary"].trigger_patterns == []


def test_method_trigger_patterns_include_tutorial() -> None:
    assert "tutorial" in PROMPT_TEMPLATES["method"].trigger_patterns


def test_all_templates_are_prompt_template_instances() -> None:
    for t in PROMPT_TEMPLATES.values():
        assert isinstance(t, PromptTemplate)
