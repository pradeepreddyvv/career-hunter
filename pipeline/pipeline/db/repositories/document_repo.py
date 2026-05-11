from __future__ import annotations

from typing import List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.models.document import Document


class DocumentRepository:
    """Data-access layer for the ``documents`` table."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Create ─────────────────────────────────────────────────────────

    async def create(
        self,
        job_id: int,
        user_id: str,
        doc_type: str,
        content: str,
        format: str = "text",
    ) -> Document:
        """Insert a new document row."""
        doc = Document(
            job_id=job_id,
            user_id=user_id,
            doc_type=doc_type,
            content=content,
            format=format,
        )
        self.session.add(doc)
        await self.session.flush()
        await self.session.commit()
        return doc

    # ── Read ───────────────────────────────────────────────────────────

    async def get_for_job(self, user_id: str, job_id: int) -> List[Document]:
        """Return every document linked to a specific job for a user."""
        stmt = (
            select(Document)
            .where(Document.user_id == user_id, Document.job_id == job_id)
            .order_by(Document.doc_type)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_type(
        self,
        user_id: str,
        job_id: int,
        doc_type: str,
    ) -> Optional[Document]:
        """Return a single document by (job_id, doc_type), or ``None``."""
        stmt = select(Document).where(
            Document.user_id == user_id,
            Document.job_id == job_id,
            Document.doc_type == doc_type,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    # ── Upsert ─────────────────────────────────────────────────────────

    async def upsert(
        self,
        job_id: int,
        user_id: str,
        doc_type: str,
        content: str,
        format: str = "text",
    ) -> Document:
        """Insert or replace a document for a given (job_id, doc_type) pair.

        If a row already exists the content and format are updated in place.
        """
        stmt = select(Document).where(
            Document.job_id == job_id,
            Document.doc_type == doc_type,
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is not None:
            existing.content = content
            existing.format = format
            existing.user_id = user_id  # ensure ownership is correct
            await self.session.flush()
            await self.session.commit()
            return existing

        return await self.create(
            job_id=job_id,
            user_id=user_id,
            doc_type=doc_type,
            content=content,
            format=format,
        )

    # ── Delete ─────────────────────────────────────────────────────────

    async def delete_for_job(self, user_id: str, job_id: int) -> int:
        """Delete all documents for a job. Returns the count of rows removed."""
        stmt = delete(Document).where(
            Document.user_id == user_id,
            Document.job_id == job_id,
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount  # type: ignore[union-attr]
