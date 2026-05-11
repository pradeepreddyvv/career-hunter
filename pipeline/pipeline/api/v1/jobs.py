"""Job discovery and management API routes."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_db, get_current_user
from pipeline.db.repositories.job_repo import JobRepository
from pipeline.db.repositories.task_repo import TaskRepository
from pipeline.models.user import User
from pipeline.services.job_service import JobService

router = APIRouter(prefix="/jobs", tags=["jobs"])


class FetchRequest(BaseModel):
    sources: Optional[list[str]] = None
    intern_only: bool = False


class JobResponse(BaseModel):
    id: int
    title: str
    company: str
    location: str
    url: Optional[str] = None
    source: str
    role_category: str
    score: int
    score_summary: Optional[str] = None
    posted_at: Optional[str] = None

    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    total: int
    offset: int
    limit: int


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    source: Optional[str] = None,
    min_score: Optional[int] = None,
    role_category: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = JobRepository(db)
    jobs, total = await repo.list(
        user.id, offset=offset, limit=limit,
        source=source, min_score=min_score,
        role_category=role_category, search=search,
    )
    return JobListResponse(
        jobs=[JobResponse.model_validate(j) for j in jobs],
        total=total, offset=offset, limit=limit,
    )


@router.get("/sources")
async def list_sources():
    from pipeline.job_sources.registry import load_companies
    companies = load_companies()
    sources = {}
    for c in companies:
        ats = c.get("ats", "unknown")
        if ats not in sources:
            sources[ats] = []
        sources[ats].append(c["name"])
    return {"sources": sources, "total_companies": len(companies)}


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = JobRepository(db)
    job = await repo.get(user.id, job_id)
    if not job:
        from pipeline.exceptions import NotFoundError
        raise NotFoundError(f"Job {job_id} not found")
    return JobResponse.model_validate(job)


@router.post("/fetch")
async def fetch_jobs(
    req: FetchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from pipeline.api.app import task_queue
    task_repo = TaskRepository(db)
    job_repo = JobRepository(db)
    service = JobService(job_repo)

    task_id = str(uuid.uuid4())

    async def run_fetch(on_progress=None, **kwargs):
        from pipeline.db import engine
        async with engine._session_factory() as session:
            repo = JobRepository(session)
            svc = JobService(repo)
            return await svc.fetch_jobs(user.id, sources=req.sources, intern_only=req.intern_only, on_progress=on_progress)

    await task_queue.enqueue(task_id, run_fetch, task_repo, user.id, "fetch_jobs", {"sources": req.sources})
    return {"task_id": task_id, "message": "Job fetch started"}


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    repo = JobRepository(db)
    deleted = await repo.delete(user.id, job_id)
    if not deleted:
        from pipeline.exceptions import NotFoundError
        raise NotFoundError(f"Job {job_id} not found")
    return {"ok": True}
