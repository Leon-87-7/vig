"""Tests for FastAPI startup helpers."""

from __future__ import annotations

import pytest


class _FailingHttp:
    async def post(self, *args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("telegram unavailable")


@pytest.mark.asyncio
async def test_register_ops_webhook_logs_and_continues_on_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src import main
    from src.config import settings

    events: list[tuple[str, dict]] = []

    class _Log:
        def exception(self, event: str, **kwargs) -> None:
            events.append((event, kwargs))

        def warning(self, event: str, **kwargs) -> None:
            events.append((event, kwargs))

    monkeypatch.setattr(settings, "OPS_BOT_TOKEN", "ops-token")
    monkeypatch.setattr(settings, "OPS_WEBHOOK_SECRET", "ops-secret")
    monkeypatch.setattr(settings, "OPS_WEBHOOK_URL", "https://ops.example.com/webhook/ops")
    monkeypatch.setattr(main.sender, "_http", lambda: _FailingHttp())
    monkeypatch.setattr(main, "log", _Log())

    await main._register_ops_webhook()

    assert events == [
        (
            "ops_webhook_registration_failed",
            {"url": "https://ops.example.com/webhook/ops"},
        )
    ]
