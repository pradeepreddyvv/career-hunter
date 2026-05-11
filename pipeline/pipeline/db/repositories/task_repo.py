from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.models.task import BackgroundTask


def _utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


class TaskRepository:
    """Data-access layer for the ``background_tasks`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Create ─────────────────────────────────────────────────────────

    async def create(
        self,
        id: str,
        user_id: str,
        task_type: str,
        params_json: Optional[str] = None,
    ) -> BackgroundTask:
        """Queue a new background task."""
        task = BackgroundTask(
            id=id,
            user_id=user_id,
            task_type=task_type,
            params_json=params_json,
        )
        self.session.add(task)
        await self.session.flush()
        await self.session.commit()
        return task

    # ── Read ───────────────────────────────────────────────────────────

    async def get(self, user_id: str, task_id: str) -> Optional[BackgroundTask]:
        """Return a task owned by ``user_id``, or ``None``."""
        stmt = select(BackgroundTask).where(
            BackgroundTask.id == task_id,
            BackgroundTask.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(self, user_id: str, limit: int = 20) -> List[BackgroundTask]:
        """Return the most recent tasks for a user."""
        stmt = (
            select(BackgroundTask)
            .where(BackgroundTask.user_id == user_id)
            .order_by(BackgroundTask.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ── Update ─────────────────────────────────────────────────────────

    async def update_status(
        self,
        task_id: str,
        status: str,
        progress: Optional[int] = None,
        message: Optional[str] = None,
        result: Optional[str] = None,
        error: Optional[str] = None,
    ) -> None:
        """Transition a task to a new status.

        Automatically sets ``started_at`` when status becomes ``running``
        and ``completed_at`` when status becomes ``completed`` or ``failed``.
        """
        values: dict = {"status": status}

        if progress is not None:
            values["progress"] = progress
        if message is not None:
            values["progress_message"] = message
        if result is not None:
            values["result_json"] = result
        if error is not None:
            values["error_message"] = error

        now = _utcnow()
        if status == "running":
            values["started_at"] = now
        elif status in ("completed", "failed", "cancelled"):
            values["completed_at"] = now

        stmt = update(BackgroundTask).where(BackgroundTask.id == task_id).values(**values)
        await self.session.execute(stmt)
        await self.session.commit()

    # ── Cancel ─────────────────────────────────────────────────────────

    async def cancel(self, user_id: str, task_id: str) -> bool:
        """Mark a task as cancelled.

        Only ``queued`` or ``running`` tasks can be cancelled.
        Returns ``True`` if the row was actually updated.
        """
        stmt = (
            update(BackgroundTask)
            .where(
                BackgroundTask.id == task_id,
                BackgroundTask.user_id == user_id,
                BackgroundTask.status.in_(["queued", "running"]),
            )
            .values(status="cancelled", completed_at=_utcnow())
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return res.rowcount > 0  # type: ignore[union-attr]
