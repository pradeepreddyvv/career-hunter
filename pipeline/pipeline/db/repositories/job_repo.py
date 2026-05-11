from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.models.job import Job

logger = logging.getLogger(__name__)


class JobRepository:
    """Data-access layer for the ``jobs`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Create ─────────────────────────────────────────────────────────

    async def create(self, user_id: str, **kwargs: Any) -> Job:
        """Insert a single job row."""
        job = Job(user_id=user_id, **kwargs)
        self.session.add(job)
        await self.session.flush()
        await self.session.commit()
        return job

    async def bulk_create(self, user_id: str, jobs: List[Dict[str, Any]]) -> int:
        """Insert many jobs, silently skipping duplicates (by user_id + job_key).

        Returns the number of rows actually inserted.
        """
        inserted = 0
        for job_data in jobs:
            nested = await self.session.begin_nested()
            try:
                job = Job(user_id=user_id, **job_data)
                self.session.add(job)
                await self.session.flush()
                inserted += 1
            except IntegrityError:
                await nested.rollback()
                logger.debug(
                    "Skipping duplicate job_key=%s for user=%s",
                    job_data.get("job_key"),
                    user_id,
                )
        await self.session.commit()
        return inserted

    # ── Read ───────────────────────────────────────────────────────────

    async def get(self, user_id: str, job_id: int) -> Optional[Job]:
        """Return a single job owned by ``user_id``, or ``None``."""
        stmt = select(Job).where(Job.id == job_id, Job.user_id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list(
        self,
        user_id: str,
        offset: int = 0,
        limit: int = 50,
        source: Optional[str] = None,
        min_score: Optional[int] = None,
        role_category: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[Job], int]:
        """Return a paginated list of jobs and total count.

        Supports optional filters on source, minimum score, role category,
        and a free-text search across title and company.
        """
        base = select(Job).where(Job.user_id == user_id)
        count_base = select(func.count(Job.id)).where(Job.user_id == user_id)

        if source is not None:
            base = base.where(Job.source == source)
            count_base = count_base.where(Job.source == source)
        if min_score is not None:
            base = base.where(Job.score >= min_score)
            count_base = count_base.where(Job.score >= min_score)
        if role_category is not None:
            base = base.where(Job.role_category == role_category)
            count_base = count_base.where(Job.role_category == role_category)
        if search is not None:
            pattern = f"%{search}%"
            search_filter = Job.title.ilike(pattern) | Job.company.ilike(pattern)
            base = base.where(search_filter)
            count_base = count_base.where(search_filter)

        # Total count
        total_result = await self.session.execute(count_base)
        total = total_result.scalar_one()

        # Paginated rows ordered by score descending, then by fetched_at descending
        stmt = base.order_by(Job.score.desc(), Job.fetched_at.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        rows = list(result.scalars().all())

        return rows, total

    async def get_unscored(self, user_id: str, limit: int = 50) -> List[Job]:
        """Return jobs with a score of 0 (not yet scored)."""
        stmt = (
            select(Job)
            .where(Job.user_id == user_id, Job.score == 0)
            .order_by(Job.fetched_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # ── Upsert ─────────────────────────────────────────────────────────

    async def upsert(self, user_id: str, job_key: str, **kwargs: Any) -> Job:
        """Insert a job or update it if (user_id, job_key) already exists.

        Returns the resulting ``Job`` row.
        """
        # Try to find existing
        stmt = select(Job).where(Job.user_id == user_id, Job.job_key == job_key)
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is not None:
            # Update mutable fields
            for key, value in kwargs.items():
                if hasattr(existing, key) and value is not None:
                    setattr(existing, key, value)
            await self.session.flush()
            await self.session.commit()
            return existing

        # Insert new
        job = Job(user_id=user_id, job_key=job_key, **kwargs)
        self.session.add(job)
        await self.session.flush()
        await self.session.commit()
        return job

    # ── Update ─────────────────────────────────────────────────────────

    async def update_score(
        self,
        user_id: str,
        job_id: int,
        score: int,
        summary: Optional[str] = None,
        multi_score: Optional[str] = None,
    ) -> None:
        """Set the score (and optional summary / multi-score JSON) for a job."""
        values: Dict[str, Any] = {"score": score}
        if summary is not None:
            values["score_summary"] = summary
        if multi_score is not None:
            values["multi_score_json"] = multi_score
        stmt = (
            update(Job)
            .where(Job.id == job_id, Job.user_id == user_id)
            .values(**values)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    # ── Delete ─────────────────────────────────────────────────────────

    async def delete(self, user_id: str, job_id: int) -> bool:
        """Delete a job. Returns ``True`` if a row was actually removed."""
        stmt = delete(Job).where(Job.id == job_id, Job.user_id == user_id)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0  # type: ignore[union-attr]
