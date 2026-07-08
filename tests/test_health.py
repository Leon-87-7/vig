"""Unit tests for src/services/health.py — probes + ntfy alerting on degradation.

Redis probes are stubbed (no live Redis in tests); the database probe runs for
real against the in-memory SQLite DB, since ``SELECT 1`` needs no schema.
"""

from __future__ import annotations

import time

import pytest

from src import database, queue
from src.config import settings
from src.services import health, ntfy


@pytest.fixture
def captured_alerts(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    calls: list[dict] = []

    async def fake_notify_throttled(key: str, message: str, **kwargs) -> None:  # noqa: ANN003
        calls.append({"key": key, "message": message, **kwargs})

    monkeypatch.setattr(ntfy, "notify_throttled", fake_notify_throttled)
    return calls


def _stub_redis_healthy(monkeypatch: pytest.MonkeyPatch, *, depth: int = 0, beat_age: float = 1.0) -> None:
    async def _ping() -> bool:
        return True

    async def _queue_depth() -> int:
        return depth

    async def _read_heartbeat() -> float:
        return time.time() - beat_age

    monkeypatch.setattr(queue, "ping", _ping)
    monkeypatch.setattr(queue, "queue_depth", _queue_depth)
    monkeypatch.setattr(queue, "read_heartbeat", _read_heartbeat)


@pytest.mark.asyncio
async def test_check_all_healthy_no_alert(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    _stub_redis_healthy(monkeypatch)
    result = await health.check(alert=True)

    assert result["status"] == "healthy"
    assert result["components"] == {"database": "healthy", "redis": "healthy", "worker": "healthy"}
    assert result["queue_depth"] == 0
    assert captured_alerts == [], "healthy check must not alert"


@pytest.mark.asyncio
async def test_check_database_down_alerts(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    _stub_redis_healthy(monkeypatch)

    def _boom(*args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("disk I/O error")

    monkeypatch.setattr(database, "connection", _boom)
    result = await health.check(alert=True)

    assert result["status"] == "degraded"
    assert result["components"]["database"].startswith("unhealthy")
    assert "disk I/O error" in result["components"]["database"]
    assert len(captured_alerts) == 1
    assert captured_alerts[0]["key"] == "health:database"
    assert captured_alerts[0]["priority"] == "high"


@pytest.mark.asyncio
async def test_check_worker_stale_heartbeat_alerts(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    _stub_redis_healthy(monkeypatch, beat_age=settings.WORKER_HEARTBEAT_MAX_AGE_SECONDS + 30)
    result = await health.check(alert=True)

    assert result["status"] == "degraded"
    assert "stale heartbeat" in result["components"]["worker"]
    assert captured_alerts[0]["key"] == "health:worker"


@pytest.mark.asyncio
async def test_check_worker_no_heartbeat(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    async def _no_beat() -> None:
        return None

    _stub_redis_healthy(monkeypatch)
    monkeypatch.setattr(queue, "read_heartbeat", _no_beat)
    result = await health.check(alert=True)

    assert result["components"]["worker"] == "unhealthy: no heartbeat"
    assert result["status"] == "degraded"


@pytest.mark.asyncio
async def test_check_redis_down_worker_unknown(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    """Redis down → redis unhealthy + queue_depth None; the worker probe can't
    judge and reports 'unknown', which must NOT be counted as a separate degrade."""
    async def _boom() -> bool:
        raise ConnectionError("connection refused")

    monkeypatch.setattr(queue, "ping", _boom)
    monkeypatch.setattr(queue, "queue_depth", _boom)
    monkeypatch.setattr(queue, "read_heartbeat", _boom)
    result = await health.check(alert=True)

    assert result["status"] == "degraded"
    assert result["components"]["redis"].startswith("unhealthy")
    assert result["components"]["worker"].startswith("unknown")
    assert result["queue_depth"] is None
    # Only redis is counted degraded — the alert key must not include 'worker'.
    assert captured_alerts[0]["key"] == "health:redis"


@pytest.mark.asyncio
async def test_watchdog_alerts_at_threshold(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    async def _depth() -> int:
        return settings.QUEUE_DEPTH_ALERT_THRESHOLD

    monkeypatch.setattr(queue, "queue_depth", _depth)
    depth = await health.queue_depth_watchdog(alert=True)

    assert depth == settings.QUEUE_DEPTH_ALERT_THRESHOLD
    assert len(captured_alerts) == 1
    assert captured_alerts[0]["key"] == "queue_depth"


@pytest.mark.asyncio
async def test_watchdog_silent_under_threshold(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    async def _depth() -> int:
        return settings.QUEUE_DEPTH_ALERT_THRESHOLD - 1

    monkeypatch.setattr(queue, "queue_depth", _depth)
    depth = await health.queue_depth_watchdog(alert=True)

    assert depth == settings.QUEUE_DEPTH_ALERT_THRESHOLD - 1
    assert captured_alerts == []


@pytest.mark.asyncio
async def test_watchdog_redis_error_is_quiet(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    async def _boom() -> int:
        raise ConnectionError("refused")

    monkeypatch.setattr(queue, "queue_depth", _boom)
    depth = await health.queue_depth_watchdog(alert=True)

    assert depth is None, "unreachable Redis → None, not an alert (health check owns that failure)"
    assert captured_alerts == []

@pytest.fixture(autouse=True)
def _reset_health_state() -> None:
    health._last_degraded.clear()


@pytest.mark.asyncio
async def test_health_includes_ntfy_diagnostics(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    monkeypatch.setattr(settings, "NTFY_URL", "http://ntfy:80")
    monkeypatch.setattr(settings, "NTFY_TOKEN", "")
    _stub_redis_healthy(monkeypatch)

    result = await health.check(alert=False)

    assert result["ntfy"]["status"] == "missing_token"
    assert result["ntfy"]["token_configured"] is False


@pytest.mark.asyncio
async def test_worker_heartbeat_single_worker_paths(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    _stub_redis_healthy(monkeypatch, beat_age=1)
    assert (await health.check(alert=True))["components"]["worker"] == "healthy"

    async def _no_beat() -> None:
        return None
    monkeypatch.setattr(queue, "read_heartbeat", _no_beat)
    assert (await health.check(alert=True))["components"]["worker"] == "unhealthy: no heartbeat"

    _stub_redis_healthy(monkeypatch, beat_age=settings.WORKER_HEARTBEAT_MAX_AGE_SECONDS + 1)
    assert "stale heartbeat" in (await health.check(alert=True))["components"]["worker"]


@pytest.mark.asyncio
async def test_health_recovery_transitions(monkeypatch: pytest.MonkeyPatch, captured_alerts: list[dict]) -> None:
    _stub_redis_healthy(monkeypatch, beat_age=settings.WORKER_HEARTBEAT_MAX_AGE_SECONDS + 30)
    await health.check(alert=True)
    await health.check(alert=True)
    _stub_redis_healthy(monkeypatch, beat_age=1)
    await health.check(alert=True)

    assert [a["title"] for a in captured_alerts] == [
        "VIG — health degraded",
        "VIG — health degraded",
        "VIG — health recovered",
    ]
    assert captured_alerts[-1]["key"] == "health_recovered:worker"
