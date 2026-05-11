"""Background task management API routes."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_db, get_current_user
from pipeline.db.repositories.task_repo import TaskRepository
from pipeline.exceptions import NotFoundError
from pipeline.models.user import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskResponse(BaseModel):
    id: str
    task_type: str
    status: str
    progress: int
    progress_message: str
    result: Optional[dict] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


def _task_to_response(t) -> TaskResponse:
    result = None
    if t.result_json:
        try:
            result = json.loads(t.result_json)
        except (json.JSONDecodeError, TypeError):
            result = {"raw": t.result_json}
    return TaskResponse(
        id=t.id,
        task_type=t.task_type,
        status=t.status,
        progress=t.progress or 0,
        progress_message=t.progress_message or "",
        result=result,
        error_message=t.error_message,
        created_at=t.created_at.isoformat() if t.created_at else None,
        started_at=t.started_at.isoformat() if t.started_at else None,
        completed_at=t.completed_at.isoformat() if t.completed_at else None,
    )


@router.get("/")
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = TaskRepository(db)
    tasks = await repo.list(user.id, limit=50)
    return {"tasks": [_task_to_response(t) for t in tasks]}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = TaskRepository(db)
    task = await repo.get(user.id, task_id)
    if not task:
        raise NotFoundError(f"Task {task_id} not found")
    return _task_to_response(task)


@router.delete("/{task_id}")
async def cancel_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from pipeline.api.app import task_queue

    repo = TaskRepository(db)
    task = await repo.get(user.id, task_id)
    if not task:
        raise NotFoundError(f"Task {task_id} not found")

    if task.status in ("completed", "failed", "cancelled"):
        return {"ok": False, "message": f"Task already {task.status}"}

    task_queue.cancel_task(task_id)
    await repo.cancel(user.id, task_id)
    return {"ok": True, "message": "Task cancelled"}
