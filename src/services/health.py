"""Liveness/readiness probes + ntfy alerting on degradation.

Two entry points funnel through ``check(alert=...)`` so a persistent degradation
pings the operator at most once per throttle window no matter which trigger sees
it first:

- ``GET /health`` (src/main.py) — probes on every external ping (the cron-job.org
  keep-warm monitor, dashboard polling). Always returns HTTP 200 so the keep-warm
  contract (200 = API serving) holds; the *body* carries component status.
- ``scheduled_check`` — an APScheduler backstop in the api lifespan, so a worker
  that dies at 3am is caught even if nothing is pinging /health.

Every probe is time-boxed and its failure is captured as an unhealthy component
string, never raised — /health must stay fast and always answer.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Iterable

from src import database, queue
from src.config import settings
from src.services import ntfy
from src.utils.logger import get_logger

log = get_logger(__name__)

_PROBE_TIMEOUT = 5.0
# In-memory state for the single API process scheduler. It gates recovery
# notifications so a component only announces recovery after a known degraded set.
_last_degraded: set[str] = set()


async def _probe_database() -> str:
    async def _ping() -> None:
        async with database.connection() as conn:
            await conn.execute("SELECT 1")

    try:
        await asyncio.wait_for(_ping(), _PROBE_TIMEOUT)
        return "healthy"
    except Exception as exc:  # noqa: BLE001 — a probe failure is a status, not a crash
        return f"unhealthy: {exc}"


async def _probe_redis() -> tuple[str, int | None]:
    async def _ping_and_depth() -> int:
        await queue.ping()
        return await queue.queue_depth()

    try:
        depth = await asyncio.wait_for(_ping_and_depth(), _PROBE_TIMEOUT)
        return "healthy", depth
    except Exception as exc:  # noqa: BLE001
        return f"unhealthy: {exc}", None


async def _probe_worker() -> str:
    # Current deployment expects exactly one worker. The shared Redis key
    # worker:heartbeat is a single-process liveness marker, not a fleet view.
    # Future multi-worker deployments should use per-worker keys and expected
    # worker cardinality instead of letting one healthy worker mask another.
    try:
        beat = await asyncio.wait_for(queue.read_heartbeat(), _PROBE_TIMEOUT)
    except Exception as exc:  # noqa: BLE001 — Redis unreachable: can't judge the worker
        return f"unknown: {exc}"
    if beat is None:
        return "unhealthy: no heartbeat"
    age = time.time() - beat
    if age > settings.WORKER_HEARTBEAT_MAX_AGE_SECONDS:
        return f"unhealthy: stale heartbeat ({int(age)}s)"
    return "healthy"


def _is_healthy(component_status: str) -> bool:
    # 'unknown: ...' (can't probe) is not counted as degraded — it usually rides
    # along with a redis 'unhealthy' that already alerts, and shouldn't double-fire.
    return component_status.startswith("healthy")


async def check(*, alert: bool = False) -> dict:
    """Probe DB, Redis, and worker liveness. Returns a status dict; optionally
    fires a throttled ntfy alert when any component is degraded."""
    db_status = await _probe_database()
    redis_status, depth = await _probe_redis()
    worker_status = await _probe_worker()
    components = {
        "database": db_status,
        "redis": redis_status,
        "worker": worker_status,
    }
    degraded = [name for name, status in components.items() if status.startswith("unhealthy")]
    result = {
        "status": "degraded" if degraded else "healthy",
        "components": components,
        "queue_depth": depth,
        "ntfy": ntfy.diagnostics(),
        "diagnostics": {
            "worker_heartbeat": "single expected worker; process liveness, not per-worker fleet health"
        },
    }
    if alert:
        await _alert_transitions(components, degraded)
    if alert and degraded:
        detail = "; ".join(f"{name}: {components[name]}" for name in degraded)
        await ntfy.notify_throttled(
            f"health:{','.join(sorted(degraded))}",
            f"Health check degraded — {detail}",
            cooldown=300,
            title="VIG — health degraded",
            priority="high",
            tags=["warning"],
        )
    return result


async def _alert_transitions(components: dict[str, str], degraded: Iterable[str]) -> None:
    global _last_degraded
    current = set(degraded)
    recovered = sorted(_last_degraded - current)
    if recovered:
        detail = "; ".join(f"{name}: {components[name]}" for name in recovered)
        try:
            await ntfy.notify_throttled(
                f"health_recovered:{','.join(recovered)}",
                f"Health check recovered — {detail}",
                cooldown=300,
                title="VIG — health recovered",
                priority="default",
                tags=["white_check_mark"],
            )
        except Exception:  # noqa: BLE001 — recovery alerts are best-effort only
            log.warning("health_recovery_alert_failed")
    _last_degraded = current


async def queue_depth_watchdog(*, alert: bool = True) -> int | None:
    """Alert (throttled) when the queue backlog crosses the configured threshold.

    Returns the observed depth, or None if Redis could not be reached (the health
    check's redis probe already covers that failure, so this stays quiet)."""
    try:
        depth = await queue.queue_depth()
    except Exception as exc:  # noqa: BLE001
        log.warning("queue_depth_probe_failed", error=str(exc))
        return None
    if depth >= settings.QUEUE_DEPTH_ALERT_THRESHOLD:
        log.warning("queue_depth_high", depth=depth, threshold=settings.QUEUE_DEPTH_ALERT_THRESHOLD)
        if alert:
            await ntfy.notify_throttled(
                "queue_depth",
                f"Queue depth is {depth} (threshold {settings.QUEUE_DEPTH_ALERT_THRESHOLD}) "
                "— jobs are backing up faster than the worker drains them.",
                cooldown=600,
                title="VIG — queue backlog",
                priority="high",
                tags=["warning"],
            )
    return depth


async def scheduled_check() -> None:
    """APScheduler entrypoint — backstop health probe + queue-depth watchdog.

    Runs in the api process on an interval so degradation is detected without an
    external ping. Best-effort: never lets an exception escape into the scheduler.
    """
    try:
        await check(alert=True)
        await queue_depth_watchdog(alert=True)
    except Exception:  # noqa: BLE001
        log.exception("scheduled_health_check_failed")
