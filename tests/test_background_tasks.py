"""Unit tests for src/utils/background_tasks.py."""
from __future__ import annotations

import asyncio

from src.utils.background_tasks import _BACKGROUND_TASKS, spawn_background


def test_spawn_background_retains_reference_until_done() -> None:
    async def scenario() -> None:
        started = asyncio.Event()
        finished = asyncio.Event()

        async def work() -> None:
            started.set()
            await asyncio.sleep(0.01)
            finished.set()

        task = spawn_background(work())
        assert task in _BACKGROUND_TASKS

        await started.wait()
        assert task in _BACKGROUND_TASKS  # still tracked while running

        await finished.wait()
        await asyncio.sleep(0)  # let the done_callback fire
        assert task not in _BACKGROUND_TASKS  # discarded once complete

    asyncio.run(scenario())


def test_spawn_background_logs_unhandled_exception(monkeypatch) -> None:
    import src.utils.background_tasks as bg

    logged = {}

    def fake_error(event, **kwargs):
        logged["event"] = event
        logged.update(kwargs)

    monkeypatch.setattr(bg.logger, "error", fake_error)

    async def scenario() -> None:
        async def boom() -> None:
            raise ValueError("kaput")

        task = spawn_background(boom())
        await asyncio.gather(task, return_exceptions=True)
        await asyncio.sleep(0)  # let the done_callback fire

        assert logged["event"] == "background_task_failed"
        assert isinstance(logged["exc_info"], ValueError)
        assert task not in _BACKGROUND_TASKS

    asyncio.run(scenario())


def test_spawn_background_runs_the_coroutine() -> None:
    async def scenario() -> None:
        result = {}

        async def work() -> None:
            result["ran"] = True

        task = spawn_background(work())
        await task

        assert result == {"ran": True}

    asyncio.run(scenario())
