"""Pipeline orchestration service — coordinates scoring and doc generation."""
from __future__ import annotations

import json
import logging
from typing import Optional

log = logging.getLogger(__name__)


class PipelineService:
    def __init__(self, job_repo, document_repo, task_repo, gemini_client):
        self.job_repo = job_repo
        self.doc_repo = document_repo
        self.task_repo = task_repo
        self.gemini = gemini_client

    async def score_jobs(
        self,
        user_id: str,
        api_key: str,
        user_profile: str,
        job_ids: Optional[list[int]] = None,
        model: str = "gemini-2.5-pro",
        on_progress=None,
    ) -> dict:
        from pipeline.scoring.scorer import JobScorer

        scorer = JobScorer(self.gemini)

        if job_ids:
            jobs = []
            for jid in job_ids:
                job = await self.job_repo.get(user_id, jid)
                if job:
                    jobs.append(job)
        else:
            jobs = await self.job_repo.get_unscored(user_id, limit=100)

        if not jobs:
            return {"scored": 0, "message": "No jobs to score"}

        scored = 0
        for i, job in enumerate(jobs):
            job_dict = {
                "title": job.title,
                "company": job.company,
                "location": job.location,
                "description": job.description,
            }
            try:
                result = await scorer.score_job(api_key, job_dict, user_profile, model=model)
                score = result.get("score", 0)
                summary = result.get("summary", "")
                multi = json.dumps(result) if isinstance(result, dict) else None
                await self.job_repo.update_score(user_id, job.id, score, summary, multi)
                scored += 1
            except Exception as e:
                log.warning(f"Scoring failed for {job.title}: {e}")

            if on_progress:
                await on_progress(i + 1, len(jobs), job.title)

        return {"scored": scored, "total": len(jobs)}

    async def generate_docs(
        self,
        user_id: str,
        api_key: str,
        job_id: int,
        user_vault: str,
        connections: str = "",
        on_step=None,
    ) -> dict:
        from pipeline.generators.pipeline import DocumentPipeline

        job = await self.job_repo.get(user_id, job_id)
        if not job:
            return {"error": "Job not found"}

        job_dict = {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "description": job.description,
        }

        pipeline = DocumentPipeline(self.gemini)
        results = await pipeline.generate_all(
            api_key=api_key,
            job=job_dict,
            user_vault=user_vault,
            role_category=job.role_category or "",
            connections=connections,
            score=job.score or 0,
            on_step=on_step,
        )

        saved = 0
        for doc_type, content in results.items():
            if content and not (isinstance(content, dict) and "error" in content):
                content_str = json.dumps(content) if isinstance(content, dict) else str(content)
                fmt = "json" if isinstance(content, dict) else "text"
                await self.doc_repo.upsert(job_id, user_id, doc_type, content_str, fmt)
                saved += 1

        return {"job_id": job_id, "documents_generated": saved, "results": results}

    async def run_full_pipeline(
        self,
        user_id: str,
        api_key: str,
        user_vault: str,
        connections: str = "",
        sources: Optional[list[str]] = None,
        min_score: int = 30,
        max_jobs: int = 20,
        model: str = "gemini-2.5-pro",
        on_progress=None,
    ) -> dict:
        from pipeline.services.job_service import JobService
        from pipeline.job_sources.orchestrator import FetchOrchestrator

        job_service = JobService(self.job_repo, FetchOrchestrator(sources=sources))

        if on_progress:
            await on_progress("fetch", 0, "Fetching jobs...")
        fetch_result = await job_service.fetch_jobs(user_id, sources=sources)

        if on_progress:
            await on_progress("score", 20, "Scoring jobs...")
        score_result = await self.score_jobs(
            user_id, api_key, user_vault, model=model,
        )

        jobs, total = await self.job_repo.list(
            user_id, min_score=min_score, limit=max_jobs,
        )
        jobs.sort(key=lambda j: j.score or 0, reverse=True)

        generated = 0
        for i, job in enumerate(jobs):
            if on_progress:
                pct = 40 + int(60 * i / max(len(jobs), 1))
                await on_progress("generate", pct, f"Generating docs for {job.title}...")

            try:
                await self.generate_docs(user_id, api_key, job.id, user_vault, connections)
                generated += 1
            except Exception as e:
                log.warning(f"Doc generation failed for {job.title}: {e}")

        return {
            "fetch": fetch_result,
            "score": score_result,
            "generated": generated,
            "total_qualifying": len(jobs),
        }
