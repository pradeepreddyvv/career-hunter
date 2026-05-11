"""Job discovery and management service."""
from __future__ import annotations

import logging
from typing import Optional

from pipeline.scoring.classifier import classify_role

log = logging.getLogger(__name__)


class JobService:
    def __init__(self, job_repo, fetch_orchestrator=None):
        self.repo = job_repo
        self.orchestrator = fetch_orchestrator

    async def fetch_jobs(
        self,
        user_id: str,
        sources: Optional[list[str]] = None,
        intern_only: bool = False,
        on_progress=None,
    ) -> dict:
        if not self.orchestrator:
            from pipeline.job_sources.orchestrator import FetchOrchestrator
            self.orchestrator = FetchOrchestrator(sources=sources)

        jobs = await self.orchestrator.fetch_all(intern_only=intern_only)

        inserted = 0
        skipped = 0
        for job in jobs:
            job["role_category"] = classify_role(job.get("title", ""), job.get("description", ""))
            job_key = job.get("job_key", f"{job.get('company', '').lower()}|{job.get('title', '').lower()}")
            try:
                await self.repo.upsert(user_id, job_key, **{
                    "url": job.get("url", ""),
                    "title": job.get("title", ""),
                    "company": job.get("company", ""),
                    "location": job.get("location", ""),
                    "description": job.get("description", ""),
                    "posted_at": job.get("posted_at", ""),
                    "source": job.get("source", ""),
                    "role_category": job.get("role_category", ""),
                })
                inserted += 1
            except Exception as e:
                log.warning(f"Failed to save job {job.get('title', '?')}: {e}")
                skipped += 1

            if on_progress and inserted % 50 == 0:
                pct = int(inserted / max(len(jobs), 1) * 100)
                await on_progress("saving", pct, f"{inserted}/{len(jobs)} jobs saved")

        return {"total_fetched": len(jobs), "inserted": inserted, "skipped": skipped}

    async def list_jobs(
        self,
        user_id: str,
        offset: int = 0,
        limit: int = 50,
        source: Optional[str] = None,
        min_score: Optional[int] = None,
        role_category: Optional[str] = None,
        search: Optional[str] = None,
    ):
        return await self.repo.list(
            user_id, offset=offset, limit=limit,
            source=source, min_score=min_score,
            role_category=role_category, search=search,
        )

    async def get_job(self, user_id: str, job_id: int):
        return await self.repo.get(user_id, job_id)

    async def delete_job(self, user_id: str, job_id: int) -> bool:
        return await self.repo.delete(user_id, job_id)

    async def get_unscored(self, user_id: str, limit: int = 50):
        return await self.repo.get_unscored(user_id, limit=limit)
