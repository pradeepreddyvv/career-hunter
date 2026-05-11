from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.models.interview import InterviewQuestion, InterviewSession

logger = logging.getLogger(__name__)


class InterviewRepository:
    """Data-access layer for interview sessions and questions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Session CRUD ──────────────────────────────────────────────────

    async def create_session(self, **kwargs: Any) -> InterviewSession:
        """Insert a new interview session."""
        interview = InterviewSession(**kwargs)
        self.session.add(interview)
        await self.session.flush()
        await self.session.commit()
        return interview

    async def get_session(self, user_id: str, session_id: str) -> Optional[InterviewSession]:
        """Return a single session owned by ``user_id``, or ``None``."""
        stmt = select(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        user_id: str,
        offset: int = 0,
        limit: int = 50,
        status: Optional[str] = None,
        interview_type: Optional[str] = None,
        company: Optional[str] = None,
    ) -> tuple[List[InterviewSession], int]:
        """Return a paginated list of sessions and total count."""
        base = select(InterviewSession).where(InterviewSession.user_id == user_id)
        count_base = select(func.count(InterviewSession.id)).where(
            InterviewSession.user_id == user_id
        )

        if status is not None:
            base = base.where(InterviewSession.status == status)
            count_base = count_base.where(InterviewSession.status == status)
        if interview_type is not None:
            base = base.where(InterviewSession.interview_type == interview_type)
            count_base = count_base.where(InterviewSession.interview_type == interview_type)
        if company is not None:
            pattern = f"%{company}%"
            base = base.where(InterviewSession.company.ilike(pattern))
            count_base = count_base.where(InterviewSession.company.ilike(pattern))

        total_result = await self.session.execute(count_base)
        total = total_result.scalar_one()

        stmt = (
            base.order_by(InterviewSession.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = list(result.scalars().all())

        return rows, total

    async def update_session(
        self,
        user_id: str,
        session_id: str,
        **kwargs: Any,
    ) -> Optional[InterviewSession]:
        """Update mutable fields on a session. Returns the updated session or None."""
        # Filter out None values so callers can pass optional fields
        values = {k: v for k, v in kwargs.items() if v is not None}
        if not values:
            return await self.get_session(user_id, session_id)

        stmt = (
            update(InterviewSession)
            .where(
                InterviewSession.id == session_id,
                InterviewSession.user_id == user_id,
            )
            .values(**values)
        )
        await self.session.execute(stmt)
        await self.session.commit()
        return await self.get_session(user_id, session_id)

    async def delete_session(self, user_id: str, session_id: str) -> bool:
        """Delete a session and its questions (CASCADE). Returns True if removed."""
        stmt = delete(InterviewSession).where(
            InterviewSession.id == session_id,
            InterviewSession.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0  # type: ignore[union-attr]

    # ── Question CRUD ─────────────────────────────────────────────────

    async def add_question(self, session_id: str, **kwargs: Any) -> InterviewQuestion:
        """Insert a new question for a session."""
        question = InterviewQuestion(session_id=session_id, **kwargs)
        self.session.add(question)
        await self.session.flush()
        await self.session.commit()
        return question

    async def get_questions(self, session_id: str) -> List[InterviewQuestion]:
        """Return all questions belonging to a session, ordered by id."""
        stmt = (
            select(InterviewQuestion)
            .where(InterviewQuestion.session_id == session_id)
            .order_by(InterviewQuestion.id)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_question_answer(
        self,
        question_id: int,
        answer_text: str,
    ) -> Optional[InterviewQuestion]:
        """Set the answer text for a question."""
        stmt = (
            update(InterviewQuestion)
            .where(InterviewQuestion.id == question_id)
            .values(answer_text=answer_text)
        )
        await self.session.execute(stmt)
        await self.session.commit()

        result = await self.session.execute(
            select(InterviewQuestion).where(InterviewQuestion.id == question_id)
        )
        return result.scalar_one_or_none()

    async def score_question(
        self,
        question_id: int,
        score: int,
        feedback: Optional[str] = None,
    ) -> Optional[InterviewQuestion]:
        """Set the score and optional feedback for a question."""
        values: Dict[str, Any] = {"score": score}
        if feedback is not None:
            values["feedback"] = feedback

        stmt = (
            update(InterviewQuestion)
            .where(InterviewQuestion.id == question_id)
            .values(**values)
        )
        await self.session.execute(stmt)
        await self.session.commit()

        result = await self.session.execute(
            select(InterviewQuestion).where(InterviewQuestion.id == question_id)
        )
        return result.scalar_one_or_none()
