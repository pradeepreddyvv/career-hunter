from __future__ import annotations

from fastapi import APIRouter

from pipeline.api.v1 import auth, health, users, jobs, pipeline, documents, tasks, sse, interview

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(health.router)
api_router.include_router(jobs.router)
api_router.include_router(pipeline.router)
api_router.include_router(documents.router)
api_router.include_router(tasks.router)
api_router.include_router(sse.router)
api_router.include_router(interview.router)
