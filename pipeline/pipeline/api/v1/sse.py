"""Server-Sent Events for real-time pipeline progress."""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_db, get_current_user
from pipeline.db.repositories.task_repo import TaskRepository
from pipeline.exceptions import NotFoundError
from pipeline.models.user import User

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/stream")
async def event_stream(
    task_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = TaskRepository(db)
    task = await repo.get(user.id, task_id)
    if not task:
        raise NotFoundError(f"Task {task_id} not found")

    from pipeline.api.app import task_queue
    queue = task_queue.broadcaster.subscribe(task_id)

    async def generate():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'task_id': task_id})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("type") in ("done", "error", "cancelled"):
                        break
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            task_queue.broadcaster.unsubscribe(task_id, queue)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
