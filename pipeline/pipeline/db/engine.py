from __future__ import annotations

from typing import AsyncGenerator, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pipeline.config import settings
from pipeline.models import Base

_engine = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


async def init_db(database_url: Optional[str] = None) -> None:
    """Initialise the async engine, create all tables, and configure pragmas.

    Parameters
    ----------
    database_url:
        Override for ``settings.database_url``.  Useful in tests.
    """
    global _engine, _session_factory

    url = database_url or settings.database_url

    connect_args: dict = {}
    if "sqlite" in url:
        connect_args["check_same_thread"] = False

    _engine = create_async_engine(url, echo=settings.debug, connect_args=connect_args)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    # Create tables
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # SQLite-specific pragmas
    if "sqlite" in url:
        async with _engine.begin() as conn:
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA foreign_keys=ON"))


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an ``AsyncSession`` for dependency injection.

    The caller is responsible for committing; the session is closed
    automatically when the generator exits.
    """
    if _session_factory is None:
        raise RuntimeError("Database not initialised. Call init_db() first.")
    async with _session_factory() as session:
        yield session


async def close_db() -> None:
    """Dispose of the engine and release the connection pool."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
