from __future__ import annotations

from typing import AsyncGenerator, Optional

from fastapi import Depends, Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from pipeline.config import settings
from pipeline.db.engine import get_session
from pipeline.db.repositories.user_repo import UserRepository
from pipeline.exceptions import AuthenticationError
from pipeline.models.user import User
from pipeline.services.auth_service import AuthService

# Bearer token extractor -- auto_error=False so we can fall back to cookies.
security = HTTPBearer(auto_error=False)

# Singleton auth service instance (created once at import time).
_auth_service: Optional[AuthService] = None


def _get_auth_service() -> AuthService:
    """Return the module-level AuthService singleton, creating it on first call."""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService(secret_key=settings.secret_key)
    return _auth_service


# ── Database dependency ───────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session.

    Delegates to :func:`pipeline.db.engine.get_session` so that the
    session factory is configured in one place.
    """
    async for session in get_session():
        yield session


# ── Auth service dependency ───────────────────────────────────────────


async def get_auth_service() -> AuthService:
    """Return the configured :class:`AuthService` instance."""
    return _get_auth_service()


# ── Current user dependency ───────────────────────────────────────────


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the JWT from the ``Authorization`` header or
    the ``token`` cookie.

    Returns the :class:`User` ORM instance on success.
    Raises :class:`AuthenticationError` (HTTP 401) when no valid token is
    found or the referenced user no longer exists.
    """
    auth_svc = _get_auth_service()

    # 1. Try Bearer token from the Authorization header
    token: Optional[str] = None
    if credentials is not None:
        token = credentials.credentials

    # 2. Fall back to the httpOnly cookie
    if token is None:
        token = request.cookies.get("token")

    if token is None:
        raise AuthenticationError(detail="Missing authentication token.")

    # 3. Decode and validate the JWT
    claims = auth_svc.decode_token(token)
    user_id: str = claims["user_id"]

    # 4. Look up the user in the database
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if user is None:
        raise AuthenticationError(detail="User account not found.")

    return user


# ── Optional user dependency ─────────────────────────────────────────


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Like :func:`get_current_user` but returns ``None`` instead of
    raising when no valid token is present.

    Useful for endpoints that behave differently for authenticated vs.
    anonymous callers.
    """
    try:
        return await get_current_user(request, credentials, db)
    except (AuthenticationError, HTTPException):
        return None
