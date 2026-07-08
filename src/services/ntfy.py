"""Self-hosted ntfy publisher — internal operator/admin alerts.

This is NOT the user-facing Telegram bot. It fires when the operator (you) needs
to know something broke that a user would never see or report: a worker crash
loop, orphaned-job recovery after an unclean restart, a deaf Telegram webhook, or
an unexpected processor exception.

Best-effort by construction: every failure to publish is swallowed and logged at
WARNING, so an alert can never take down the path it is reporting on. Publishing
no-ops silently when ``NTFY_URL`` or ``NTFY_TOKEN`` is unset, so dev/test and
unconfigured deploys pay nothing.

Uses ntfy's JSON publishing form (POST the root URL with a ``topic`` in the body)
rather than the header form, so unicode titles/messages need no latin-1 dance.
See docs/ops/ntfy.md for the server side.
"""

from __future__ import annotations

import time
from typing import Literal, Sequence

import httpx

from src.config import settings
from src.utils.logger import get_logger

log = get_logger(__name__)

Priority = Literal["min", "low", "default", "high", "max"]

# ntfy priorities are 1..5; our named levels map onto them.
_PRIORITY: dict[str, int] = {"min": 1, "low": 2, "default": 3, "high": 4, "max": 5}

_client: httpx.AsyncClient | None = None

# Per-key send timestamps for notify_throttled — collapses a burst of the same
# alert (e.g. a worker error loop firing every 2s) into one ping per window.
_last_sent: dict[str, float] = {}


def _now() -> float:
    """Monotonic clock behind an indirection so tests can drive it without
    patching the global ``time`` module (which other code also reads)."""
    return time.monotonic()


def enabled() -> bool:
    """True when the publisher is configured. Callers may skip building payloads."""
    return bool(settings.NTFY_URL and settings.NTFY_TOKEN)


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10.0)
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def notify(
    message: str,
    *,
    title: str | None = None,
    priority: Priority = "default",
    tags: Sequence[str] | None = None,
) -> None:
    """Publish an operator alert. Never raises — logs a warning on failure.

    ``tags`` are ntfy tag shortcodes (e.g. ``"warning"`` → ⚠️, ``"skull"`` → 💀)
    rendered next to the title, not free text. ``priority`` is a named level that
    maps to ntfy's 1..5.
    """
    if not enabled():
        return
    payload: dict[str, object] = {
        "topic": settings.NTFY_TOPIC,
        "message": message,
        "priority": _PRIORITY.get(priority, 3),
    }
    if title:
        payload["title"] = title
    if tags:
        payload["tags"] = list(tags)
    try:
        resp = await _http().post(
            settings.NTFY_URL.rstrip("/"),
            json=payload,
            headers={"Authorization": f"Bearer {settings.NTFY_TOKEN}"},
        )
        resp.raise_for_status()
        log.info("ntfy_published", title=title, priority=priority)
    except Exception as exc:  # noqa: BLE001 — best-effort channel, must not propagate
        log.warning("ntfy_publish_failed", title=title, error=str(exc))


async def notify_throttled(
    key: str,
    message: str,
    *,
    cooldown: float = 300.0,
    title: str | None = None,
    priority: Priority = "default",
    tags: Sequence[str] | None = None,
) -> None:
    """Like ``notify`` but sends at most once per ``cooldown`` seconds per ``key``.

    Use for alerts that can fire in a tight loop (worker crash loop, a burst of
    processor failures from one broken dependency) so the operator gets a single
    ping, not a flood. The window is per-process and resets on restart — which is
    the right behaviour, since a restart is itself worth re-alerting after.
    """
    if not enabled():
        return
    now = _now()
    last = _last_sent.get(key)
    if last is not None and now - last < cooldown:
        return
    _last_sent[key] = now
    await notify(message, title=title, priority=priority, tags=tags)
