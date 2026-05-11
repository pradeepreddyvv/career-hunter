from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


# Import all models so that Base.metadata is fully populated when
# create_all_tables() is called.  The imports must come *after* Base is
# defined to avoid circular-import issues.

from pipeline.models.user import User  # noqa: E402, F401
from pipeline.models.job import Job  # noqa: E402, F401
from pipeline.models.document import Document  # noqa: E402, F401
from pipeline.models.task import BackgroundTask, ProcessingStatus  # noqa: E402, F401
from pipeline.models.interview import InterviewSession, InterviewQuestion  # noqa: E402, F401

__all__ = [
    "Base",
    "User",
    "Job",
    "Document",
    "BackgroundTask",
    "ProcessingStatus",
    "InterviewSession",
    "InterviewQuestion",
]


async def create_all_tables(engine) -> None:  # type: ignore[type-arg]
    """Create every table registered on ``Base.metadata``.

    Parameters
    ----------
    engine:
        An ``AsyncEngine`` instance.  The tables are created inside a
        single ``BEGIN`` block via ``run_sync``.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
