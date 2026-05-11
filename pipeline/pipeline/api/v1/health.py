from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_current_user, get_db
from pipeline.models.document import Document
from pipeline.models.job import Job
from pipeline.models.task import BackgroundTask
from pipeline.models.user import User

router = APIRouter(tags=["health"])

# ── Response schemas ──────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    db: str
    version: str


class MetricsResponse(BaseModel):
    job_count: int
    scored_count: int
    docs_generated: int
    pipeline_runs: int


# ── Routes ────────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse)
async def health(
    db: AsyncSession = Depends(get_db),
) -> HealthResponse:
    """Liveness / readiness probe.

    Runs a lightweight query against the database to verify connectivity
    and returns the application version.
    """
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    return HealthResponse(
        status="healthy" if db_status == "ok" else "degraded",
        db=db_status,
        version="1.0.0",
    )


@router.get("/metrics", response_model=MetricsResponse)
async def metrics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MetricsResponse:
    """Return aggregate metrics scoped to the authenticated user.

    Counts jobs, scored jobs, generated documents, and pipeline runs.
    Requires authentication.
    """
    user_id = str(user.id)

    # Total jobs for this user
    result = await db.execute(
        select(func.count()).select_from(Job).where(Job.user_id == user_id)
    )
    job_count: int = result.scalar() or 0

    # Jobs with a non-zero score
    result = await db.execute(
        select(func.count())
        .select_from(Job)
        .where(Job.user_id == user_id, Job.score > 0)
    )
    scored_count: int = result.scalar() or 0

    # Total generated documents
    result = await db.execute(
        select(func.count())
        .select_from(Document)
        .where(Document.user_id == user_id)
    )
    docs_generated: int = result.scalar() or 0

    # Pipeline runs (background tasks of type 'run_pipeline')
    result = await db.execute(
        select(func.count())
        .select_from(BackgroundTask)
        .where(
            BackgroundTask.user_id == user_id,
            BackgroundTask.task_type == "run_pipeline",
        )
    )
    pipeline_runs: int = result.scalar() or 0

    return MetricsResponse(
        job_count=job_count,
        scored_count=scored_count,
        docs_generated=docs_generated,
        pipeline_runs=pipeline_runs,
    )
