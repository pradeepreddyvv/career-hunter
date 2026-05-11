"""In-process async task queue with SSE event broadcasting."""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Callable, Optional

log = logging.getLogger(__name__)


class SSEBroadcaster:
    """Broadcast SSE events to connected clients."""

    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def subscribe(self, task_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[task_id].append(q)
        return q

    def unsubscribe(self, task_id: str, q: asyncio.Queue):
        if task_id in self._subscribers:
            self._subscribers[task_id] = [s for s in self._subscribers[task_id] if s is not q]
            if not self._subscribers[task_id]:
                del self._subscribers[task_id]

    async def emit(self, task_id: str, event: dict):
        for q in self._subscribers.get(task_id, []):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass


class TaskQueue:
    """Async task queue with worker pool and progress tracking."""

    def __init__(self, max_workers: int = 3, broadcaster: Optional[SSEBroadcaster] = None):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._active: dict[str, asyncio.Task] = {}
        self._max_workers = max_workers
        self._workers: list[asyncio.Task] = []
        self._running = False
        self.broadcaster = broadcaster or SSEBroadcaster()

    async def start(self):
        if self._running:
            return
        self._running = True
        for i in range(self._max_workers):
            worker = asyncio.create_task(self._worker_loop(i))
            self._workers.append(worker)
        log.info(f"Task queue started with {self._max_workers} workers")

    async def stop(self):
        self._running = False
        for w in self._workers:
            w.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        log.info("Task queue stopped")

    async def enqueue(
        self,
        task_id: str,
        handler: Callable,
        task_repo: Any,
        user_id: str,
        task_type: str,
        params: Optional[dict] = None,
    ) -> str:
        import json
        await task_repo.create(task_id, user_id, task_type, json.dumps(params) if params else None)
        await self._queue.put((task_id, handler, task_repo, user_id, params or {}))
        log.info(f"Enqueued task {task_id} ({task_type}) for user {user_id[:8]}...")
        return task_id

    async def _worker_loop(self, worker_id: int):
        while self._running:
            try:
                task_id, handler, _task_repo, user_id, params = await asyncio.wait_for(
                    self._queue.get(), timeout=1.0
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            log.info(f"Worker {worker_id} processing task {task_id}")
            task = asyncio.current_task()
            self._active[task_id] = task

            from pipeline.db.engine import _session_factory
            from pipeline.db.repositories.task_repo import TaskRepository

            try:
                async with _session_factory() as session:
                    task_repo = TaskRepository(session)
                    await task_repo.update_status(task_id, "running")
                    await self.broadcaster.emit(task_id, {"type": "started", "task_id": task_id})

                    async def on_progress(step, percent, message=""):
                        async with _session_factory() as prog_session:
                            prog_repo = TaskRepository(prog_session)
                            await prog_repo.update_status(task_id, "running", progress=percent, message=message)
                        await self.broadcaster.emit(task_id, {
                            "type": "progress", "task_id": task_id,
                            "step": step, "percent": percent, "message": message,
                        })

                    result = await handler(on_progress=on_progress, **params)

                    import json
                    await task_repo.update_status(
                        task_id, "completed", progress=100,
                        result=json.dumps(result) if result else None,
                    )
                    await self.broadcaster.emit(task_id, {"type": "done", "task_id": task_id, "result": result})

            except asyncio.CancelledError:
                async with _session_factory() as session:
                    await TaskRepository(session).update_status(task_id, "cancelled")
                await self.broadcaster.emit(task_id, {"type": "cancelled", "task_id": task_id})
            except Exception as e:
                log.exception(f"Task {task_id} failed")
                try:
                    async with _session_factory() as session:
                        await TaskRepository(session).update_status(task_id, "failed", error=str(e))
                except Exception:
                    log.exception(f"Failed to update task {task_id} status")
                await self.broadcaster.emit(task_id, {"type": "error", "task_id": task_id, "error": str(e)})
            finally:
                self._active.pop(task_id, None)
                self._queue.task_done()

    def cancel_task(self, task_id: str) -> bool:
        task = self._active.get(task_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()

    @property
    def active_count(self) -> int:
        return len(self._active)
