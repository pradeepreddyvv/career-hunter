"""Metrics and health check service."""
from __future__ import annotations

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.models.job import Job
from pipeline.models.document import Document
from pipeline.models.task import BackgroundTask


class MetricsService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def health(self) -> dict:
        try:
            await self.session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception as e:
            db_status = f"error: {e}"
        return {"status": "healthy" if db_status == "ok" else "degraded", "db": db_status, "version": "1.0.0"}

    async def user_metrics(self, user_id: str) -> dict:
        job_count = (await self.session.execute(
            select(func.count()).where(Job.user_id == user_id)
        )).scalar() or 0

        scored_count = (await self.session.execute(
            select(func.count()).where(Job.user_id == user_id, Job.score > 0)
        )).scalar() or 0

        avg_score = (await self.session.execute(
            select(func.avg(Job.score)).where(Job.user_id == user_id, Job.score > 0)
        )).scalar() or 0

        doc_count = (await self.session.execute(
            select(func.count()).where(Document.user_id == user_id)
        )).scalar() or 0

        jobs_with_docs = (await self.session.execute(
            select(func.count(func.distinct(Document.job_id))).where(Document.user_id == user_id)
        )).scalar() or 0

        active_tasks = (await self.session.execute(
            select(func.count()).where(
                BackgroundTask.user_id == user_id,
                BackgroundTask.status.in_(["queued", "running"]),
            )
        )).scalar() or 0

        return {
            "jobs": {"total": job_count, "scored": scored_count, "avg_score": round(avg_score, 1), "with_docs": jobs_with_docs},
            "documents": {"total": doc_count},
            "tasks": {"active": active_tasks},
        }
