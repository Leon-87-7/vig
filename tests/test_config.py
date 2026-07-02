"""Unit tests for src/config.py — startup validation guards."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.config import Settings


def _base_env(**overrides: str) -> dict[str, str]:
    env = {"TELEGRAM_BOT_TOKEN": "123:ABC", "TELEGRAM_WEBHOOK_SECRET": "s3cr3t"}
    env.update(overrides)
    return env


def test_settings_rejects_empty_webhook_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(**_base_env(TELEGRAM_WEBHOOK_SECRET=""))


def test_settings_rejects_empty_bot_token() -> None:
    with pytest.raises(ValidationError):
        Settings(**_base_env(TELEGRAM_BOT_TOKEN=""))


def test_settings_accepts_nonempty_required_fields() -> None:
    s = Settings(**_base_env())
    assert s.TELEGRAM_WEBHOOK_SECRET == "s3cr3t"
    assert s.TELEGRAM_BOT_TOKEN == "123:ABC"
