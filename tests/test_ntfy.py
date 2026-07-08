"""Unit tests for src/services/ntfy.py — no real network calls.

Covers the contract the worker/main hooks rely on: no-op when unconfigured,
correct JSON + auth when configured, never raises on transport failure, and the
per-key cooldown that keeps a crash loop from flooding the operator.
"""

from __future__ import annotations

import httpx
import pytest

from src.config import settings
from src.services import ntfy


class _FakeResponse:
    def __init__(self, status_code: int = 200) -> None:
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://ntfy.example")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)


class _FakeClient:
    def __init__(self, response: _FakeResponse | None = None, raises: Exception | None = None) -> None:
        self._response = response or _FakeResponse()
        self._raises = raises
        self.posted: list[dict] = []

    async def post(self, url: str, **kwargs):  # noqa: ANN003
        self.posted.append({"url": url, **kwargs})
        if self._raises is not None:
            raise self._raises
        return self._response


@pytest.fixture(autouse=True)
def _reset_throttle() -> None:
    ntfy._last_sent.clear()


def _configure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "NTFY_URL", "https://ntfy.example/")
    monkeypatch.setattr(settings, "NTFY_TOPIC", "vig-ops")
    monkeypatch.setattr(settings, "NTFY_TOKEN", "tk_secret")


@pytest.mark.asyncio
async def test_notify_noop_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "NTFY_URL", "")
    monkeypatch.setattr(settings, "NTFY_TOKEN", "")
    client = _FakeClient()
    monkeypatch.setattr(ntfy, "_http", lambda: client)

    await ntfy.notify("should not send", title="x")

    assert client.posted == [], "must not POST when NTFY_URL/NTFY_TOKEN unset"


@pytest.mark.asyncio
async def test_notify_publishes_json_and_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    client = _FakeClient()
    monkeypatch.setattr(ntfy, "_http", lambda: client)

    await ntfy.notify("boom", title="VIG", priority="high", tags=["warning"])

    assert len(client.posted) == 1
    call = client.posted[0]
    # Root URL, trailing slash stripped (JSON publishing form).
    assert call["url"] == "https://ntfy.example"
    assert call["headers"]["Authorization"] == "Bearer tk_secret"
    body = call["json"]
    assert body == {
        "topic": "vig-ops",
        "message": "boom",
        "priority": 4,  # "high" → 4
        "title": "VIG",
        "tags": ["warning"],
    }


@pytest.mark.asyncio
async def test_notify_swallows_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    client = _FakeClient(raises=httpx.ConnectError("refused"))
    monkeypatch.setattr(ntfy, "_http", lambda: client)

    # Must not raise — the alert channel can never take down its caller.
    await ntfy.notify("boom")


@pytest.mark.asyncio
async def test_notify_swallows_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    client = _FakeClient(response=_FakeResponse(401))
    monkeypatch.setattr(ntfy, "_http", lambda: client)

    await ntfy.notify("boom")  # 401 (bad token) must not propagate


@pytest.mark.asyncio
async def test_notify_throttled_collapses_burst(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    client = _FakeClient()
    monkeypatch.setattr(ntfy, "_http", lambda: client)

    ticks = iter([1000.0, 1001.0])
    monkeypatch.setattr(ntfy, "_now", lambda: next(ticks))

    await ntfy.notify_throttled("k", "first", cooldown=300)
    await ntfy.notify_throttled("k", "second", cooldown=300)  # 1s later — suppressed

    assert len(client.posted) == 1
    assert client.posted[0]["json"]["message"] == "first"


@pytest.mark.asyncio
async def test_notify_throttled_sends_again_after_cooldown(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    client = _FakeClient()
    monkeypatch.setattr(ntfy, "_http", lambda: client)

    ticks = iter([1000.0, 1400.0])  # 400s apart > 300s cooldown
    monkeypatch.setattr(ntfy, "_now", lambda: next(ticks))

    await ntfy.notify_throttled("k", "first", cooldown=300)
    await ntfy.notify_throttled("k", "second", cooldown=300)

    assert [p["json"]["message"] for p in client.posted] == ["first", "second"]


@pytest.mark.asyncio
async def test_notify_throttled_independent_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch)
    client = _FakeClient()
    monkeypatch.setattr(ntfy, "_http", lambda: client)
    monkeypatch.setattr(ntfy, "_now", lambda: 1000.0)

    await ntfy.notify_throttled("a", "one", cooldown=300)
    await ntfy.notify_throttled("b", "two", cooldown=300)

    assert len(client.posted) == 2, "different keys must not throttle each other"
