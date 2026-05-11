"""Pipeline orchestration API routes."""
from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.api.deps import get_db, get_current_user
from pipeline.db.repositories.job_repo import JobRepository
from pipeline.db.repositories.document_repo import DocumentRepository
from pipeline.db.repositories.task_repo import TaskRepository
from pipeline.exceptions import ValidationError
from pipeline.models.user import User

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


class RunPipelineRequest(BaseModel):
    sources: Optional[list[str]] = None
    min_score: int = 30
    max_jobs: int = 20
    model: str = "gemini-2.5-pro"


class ScoreRequest(BaseModel):
    job_ids: Optional[list[int]] = None
    model: str = "gemini-2.5-pro"


class GenerateRequest(BaseModel):
    job_id: int


@router.post("/run")
async def run_pipeline(
    req: RunPipelineRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_api_key(user)
    _require_profile(user)

    from pipeline.api.app import task_queue
    from pipeline.services.auth_service import AuthService
    from pipeline.config import settings

    auth = AuthService(settings.secret_key)
    api_key = auth.decrypt_api_key(user.gemini_api_key_encrypted)
    vault = user.profile_json or ""
    connections = user.connections_json or ""

    task_id = str(uuid.uuid4())
    task_repo = TaskRepository(db)

    async def run(on_progress=None, **kwargs):
        from pipeline.db.engine import _session_factory
        from pipeline.scoring.gemini_client import GeminiClient
        from pipeline.services.pipeline_service import PipelineService

        async with _session_factory() as session:
            gemini = GeminiClient(max_concurrent=settings.gemini_concurrent_limit)
            try:
                svc = PipelineService(
                    JobRepository(session), DocumentRepository(session),
                    TaskRepository(session), gemini,
                )
                return await svc.run_full_pipeline(
                    user.id, api_key, vault, connections,
                    sources=req.sources, min_score=req.min_score,
                    max_jobs=req.max_jobs, model=req.model,
                    on_progress=on_progress,
                )
            finally:
                await gemini.close()

    await task_queue.enqueue(task_id, run, task_repo, user.id, "run_pipeline", {
        "sources": req.sources, "min_score": req.min_score, "max_jobs": req.max_jobs,
    })
    return {"task_id": task_id, "message": "Pipeline started"}


@router.post("/score")
async def score_jobs(
    req: ScoreRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_api_key(user)
    _require_profile(user)

    from pipeline.api.app import task_queue
    from pipeline.services.auth_service import AuthService
    from pipeline.config import settings

    auth = AuthService(settings.secret_key)
    api_key = auth.decrypt_api_key(user.gemini_api_key_encrypted)
    vault = user.profile_json or ""

    task_id = str(uuid.uuid4())
    task_repo = TaskRepository(db)

    async def run(on_progress=None, **kwargs):
        from pipeline.db.engine import _session_factory
        from pipeline.scoring.gemini_client import GeminiClient
        from pipeline.services.pipeline_service import PipelineService

        async with _session_factory() as session:
            gemini = GeminiClient(max_concurrent=settings.gemini_concurrent_limit)
            try:
                svc = PipelineService(
                    JobRepository(session), DocumentRepository(session),
                    TaskRepository(session), gemini,
                )
                return await svc.score_jobs(user.id, api_key, vault, job_ids=req.job_ids, model=req.model)
            finally:
                await gemini.close()

    await task_queue.enqueue(task_id, run, task_repo, user.id, "score_jobs")
    return {"task_id": task_id, "message": "Scoring started"}


@router.post("/generate/{job_id}")
async def generate_docs(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _require_api_key(user)
    _require_profile(user)

    from pipeline.api.app import task_queue
    from pipeline.services.auth_service import AuthService
    from pipeline.config import settings

    auth = AuthService(settings.secret_key)
    api_key = auth.decrypt_api_key(user.gemini_api_key_encrypted)
    vault = user.profile_json or ""
    connections = user.connections_json or ""

    task_id = str(uuid.uuid4())
    task_repo = TaskRepository(db)

    async def run(on_progress=None, **kwargs):
        from pipeline.db.engine import _session_factory
        from pipeline.scoring.gemini_client import GeminiClient
        from pipeline.services.pipeline_service import PipelineService

        async with _session_factory() as session:
            gemini = GeminiClient(max_concurrent=settings.gemini_concurrent_limit)
            try:
                svc = PipelineService(
                    JobRepository(session), DocumentRepository(session),
                    TaskRepository(session), gemini,
                )
                return await svc.generate_docs(user.id, api_key, job_id, vault, connections)
            finally:
                await gemini.close()

    await task_queue.enqueue(task_id, run, task_repo, user.id, "generate_docs", {"job_id": job_id})
    return {"task_id": task_id, "message": f"Doc generation started for job {job_id}"}


def _require_api_key(user: User):
    if not user.gemini_api_key_encrypted:
        raise ValidationError("Gemini API key not set. Update your profile at PUT /api/v1/profile/api-key")


def _require_profile(user: User):
    if not user.profile_json or len(user.profile_json) < 50:
        raise ValidationError("Career profile too short. Update at PUT /api/v1/profile/")
