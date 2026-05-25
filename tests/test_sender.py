"""Unit tests for src/telegram/sender.py — no real network calls.

Focus: on a Telegram HTTP error (e.g. 400 from a bad parse_mode), the sender
must log Telegram's actual error `description` before re-raising, instead of
swallowing it behind a bare 'raise_for_status' (which only logged '400').
"""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest

from src.telegram import sender


class _FakeResponse:
    def __init__(self, status_code: int, json_body: dict) -> None:
        self.status_code = status_code
        self._json = json_body
        self.is_error = status_code >= 400

    def json(self) -> dict:
        return self._json

    def raise_for_status(self) -> None:
        if self.is_error:
            request = httpx.Request("POST", "https://api.telegram.org/botX/sendMessage")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)


class _FakeClient:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response
        self.posted: list[dict] = []

    async def post(self, url: str, **kwargs):  # noqa: ANN003
        self.posted.append(kwargs)
        return self._response


@pytest.mark.asyncio
async def test_send_message_logs_telegram_error_description(monkeypatch: pytest.MonkeyPatch) -> None:
    """A 400 must surface Telegram's `description` in the error log, then raise."""
    body = {
        "ok": False,
        "error_code": 400,
        "description": "Bad Request: can't parse entities: can't find end of the entity starting at byte offset 3",
    }
    fake_resp = _FakeResponse(400, body)
    monkeypatch.setattr(sender, "_http", lambda: _FakeClient(fake_resp))
    fake_log = MagicMock()
    monkeypatch.setattr(sender, "log", fake_log)

    with pytest.raises(httpx.HTTPStatusError):
        await sender.send_message(123, "boom", parse_mode="HTML")

    assert fake_log.error.called, "expected an error log on HTTP failure"
    # The Telegram description must appear somewhere in the logged kwargs.
    logged = " ".join(repr(c.kwargs) for c in fake_log.error.call_args_list)
    assert "can't parse entities" in logged
    assert "400" in logged


@pytest.mark.asyncio
async def test_send_message_success_returns_result(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path is unchanged: returns the `result` field."""
    body = {"ok": True, "result": {"message_id": 42}}
    monkeypatch.setattr(sender, "_http", lambda: _FakeClient(_FakeResponse(200, body)))
    monkeypatch.setattr(sender, "log", MagicMock())

    result = await sender.send_message(123, "hi")
    assert result == {"message_id": 42}
