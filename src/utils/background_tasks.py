"""Shared fire-and-forget task tracking.

asyncio.create_task(...) with no retained reference can be garbage-collected
mid-run (see the asyncio docs' "Important" note on create_task). Every
fire-and-forget call site in the codebase should go through spawn_background
instead of calling asyncio.create_task directly.
"""
from __future__ import annotations

import asyncio
from typing import Coroutine

from src.utils.logger import get_logger

logger = get_logger(__name__)

_BACKGROUND_TASKS: set[asyncio.Task] = set()


def _on_task_done(task: asyncio.Task) -> None:
    _BACKGROUND_TASKS.discard(task)
    if not task.cancelled() and (exc := task.exception()) is not None:
        logger.error(
            "background_task_failed",
            task_name=task.get_name(),
            exc_info=exc,
        )


def spawn_background(coro: Coroutine) -> asyncio.Task:
    """asyncio.create_task, but keeps a strong reference until the task finishes."""
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_on_task_done)
    return task
