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

import argparse
import asyncio
import sys
import time
from typing import Literal, Sequence, TypedDict

import httpx

from src.config import settings
from src.utils.logger import get_logger

log = get_logger(__name__)

Priority = Literal["min", "low", "default", "high", "max"]
NtfyStatus = Literal["configured", "disabled", "missing_url", "missing_token"]

class SmokeResult(TypedDict):
    ok: bool
    status: str
    detail: str

_PRIORITY: dict[str, int] = {"min": 1, "low": 2, "default": 3, "high": 4, "max": 5}
_client: httpx.AsyncClient | None = None
_last_sent: dict[str, float] = {}


def _now() -> float:
    return time.monotonic()


def status() -> NtfyStatus:
    has_url = bool(settings.NTFY_URL)
    has_token = bool(settings.NTFY_TOKEN)
    if has_url and has_token:
        return "configured"
    if has_url and not has_token:
        return "missing_token"
    if has_token and not has_url:
        return "missing_url"
    return "disabled"


def diagnostics() -> dict[str, object]:
    return {"status": status(), "topic": settings.NTFY_TOPIC, "token_configured": bool(settings.NTFY_TOKEN)}


def log_status(component: str) -> None:
    log.info("ntfy_status", component=component, **diagnostics())


def enabled() -> bool:
    return status() == "configured"


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
) -> bool:
    """Publish an operator alert. Never raises; returns True after HTTP success."""
    if not enabled():
        return False
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
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort channel, must not propagate
        log.warning("ntfy_publish_failed", title=title, error=str(exc), status=status())
        return False


async def notify_with_retries(
    message: str,
    *,
    attempts: int = 3,
    delay_seconds: float = 2.0,
    title: str | None = None,
    priority: Priority = "default",
    tags: Sequence[str] | None = None,
) -> bool:
    """Best-effort publish with short startup retries; never raises."""
    for attempt in range(1, max(attempts, 1) + 1):
        if await notify(message, title=title, priority=priority, tags=tags):
            return True
        if attempt < attempts:
            await asyncio.sleep(delay_seconds)
    return False


async def notify_throttled(
    key: str,
    message: str,
    *,
    cooldown: float = 300.0,
    title: str | None = None,
    priority: Priority = "default",
    tags: Sequence[str] | None = None,
) -> bool:
    if not enabled():
        return False
    now = _now()
    last = _last_sent.get(key)
    if last is not None and now - last < cooldown:
        return False
    published = await notify(message, title=title, priority=priority, tags=tags)
    if published:
        _last_sent[key] = now
    return published


async def smoke_test(message: str = "VIG ntfy smoke test") -> SmokeResult:
    current = status()
    if current != "configured":
        return {"ok": False, "status": current, "detail": "ntfy alerting is not fully configured"}
    published = await notify(message, title="VIG — ntfy smoke test", priority="high", tags=["test_tube"])
    if published:
        return {"ok": True, "status": "published", "detail": "publish accepted by ntfy"}
    return {"ok": False, "status": "publish_failed", "detail": "auth, HTTP, or network publish failed; see logs"}


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Send a VIG ntfy smoke-test alert using app config.")
    parser.add_argument("--message", default="VIG ntfy smoke test", help="non-secret notification body")
    return parser


async def _main_async(argv: list[str]) -> int:
    args = _parser().parse_args(argv)
    result = await smoke_test(args.message)
    print(f"ntfy smoke test: {result['status']} - {result['detail']}")
    await close()
    return 0 if result["ok"] else 1


def main(argv: list[str] | None = None) -> int:
    return asyncio.run(_main_async(sys.argv[1:] if argv is None else argv))


if __name__ == "__main__":
    raise SystemExit(main())
